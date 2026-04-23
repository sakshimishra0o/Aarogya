// Admin Panel - Full Featured & Secured
import { db, auth } from './firebase.js';
import { checkAuth, login, logout } from './auth.js';
import { ref, set, push, onValue, update, remove, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let adminCredentials = null;
let currentSection = 'dashboard';

// Login
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Logging in...';
    try {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        adminCredentials = { email, password };
        await login(email, password, 'admin');
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Login to Dashboard';
    }
});

// Logout
document.getElementById('logout-btn')?.addEventListener('click', () => { adminCredentials = null; logout(); });

// Nav
document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
        currentSection = btn.dataset.section;
        switchSection(currentSection);
        if (window.innerWidth <= 768) document.getElementById('sidebar')?.classList.remove('open');
    });
});

function switchSection(name) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');
    document.querySelectorAll('.admin-section-view').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${name}`)?.classList.remove('hidden');
}

// Mobile sidebar
document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.add('open');
});
document.getElementById('close-sidebar')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
});

// Add Doctor Modal
document.getElementById('add-doctor-btn')?.addEventListener('click', () => document.getElementById('doctor-modal')?.classList.remove('hidden'));
document.getElementById('close-modal')?.addEventListener('click', () => { document.getElementById('doctor-modal')?.classList.add('hidden'); document.getElementById('add-doctor-form')?.reset(); });
document.getElementById('doctor-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) { e.currentTarget.classList.add('hidden'); } });

// Add Doctor Form
document.getElementById('add-doctor-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Registering...';
    try {
        const name = document.getElementById('doc-name').value.trim();
        const email = document.getElementById('doc-email').value.trim();
        const password = document.getElementById('doc-password').value;
        const specialty = document.getElementById('doc-specialty').value.trim() || 'General Physician';
        const phone = document.getElementById('doc-phone')?.value.trim() || '';
        const experience = document.getElementById('doc-experience')?.value.trim() || '';

        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const doctorUid = cred.user.uid;
        await set(ref(db, `users/doctors/${doctorUid}`), {
            name, email, specialty, phone, experience,
            role: 'doctor', approved: false, blocked: false,
            status: 'INACTIVE', busy: false, createdAt: Date.now()
        });
        await signOut(auth);
        if (adminCredentials) await signInWithEmailAndPassword(auth, adminCredentials.email, adminCredentials.password);

        showToast(`Dr. ${name} registered! Email: ${email} | Pass: ${password}`, 'success');
        document.getElementById('doctor-modal')?.classList.add('hidden');
        document.getElementById('add-doctor-form')?.reset();
    } catch (err) {
        let msg = err.message;
        if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered.';
        if (err.code === 'auth/weak-password') msg = 'Password must be at least 6 characters.';
        showToast('Error: ' + msg, 'error');
        try { if (adminCredentials) await signInWithEmailAndPassword(auth, adminCredentials.email, adminCredentials.password); } catch {}
    } finally {
        btn.disabled = false; btn.textContent = 'Register Doctor';
    }
});

// Monitoring
function initMonitoring() {
    onValue(ref(db, 'users/doctors'), snap => {
        const docs = snap.val() || {};
        renderDoctors(docs);
        updateStats(docs);
    });
    onValue(ref(db, 'sessions'), snap => {
        const sessions = snap.val() || {};
        renderSessions(sessions);
    });
    onValue(ref(db, 'users/patients'), snap => {
        const patients = snap.val() || {};
        renderPatients(patients);
        document.getElementById('stat-patients').textContent = Object.keys(patients).length;
    });
}

function updateStats(doctors) {
    const total = Object.keys(doctors).length;
    const online = Object.values(doctors).filter(d => d.status === 'ACTIVE' && !d.blocked && d.approved).length;
    document.getElementById('stat-doctors').textContent = total;
    document.getElementById('stat-online').textContent = online;
}

function renderDoctors(doctors) {
    const list = document.getElementById('doctor-list');
    if (!list) return;
    const entries = Object.entries(doctors);
    if (!entries.length) { list.innerHTML = `<tr><td colspan="6" class="empty-td">No doctors registered yet.</td></tr>`; return; }
    list.innerHTML = entries.map(([uid, doc]) => {
        const blocked = doc.blocked === true;
        const approved = doc.approved === true;
        let statusClass = 'status-offline', statusText = 'OFFLINE';
        if (blocked) { statusClass = 'status-inactive'; statusText = 'BLOCKED'; }
        else if (doc.status === 'ACTIVE') { statusClass = doc.busy ? 'status-busy' : 'status-active'; statusText = doc.busy ? 'IN SESSION' : 'ONLINE'; }
        let actions = '';
        if (!approved && !blocked) actions += `<button class="btn btn-sm btn-accent" onclick="approveDoc('${uid}')">✓ Approve</button>`;
        if (approved && !blocked) actions += `<button class="btn btn-sm btn-warning" onclick="blockDoc('${uid}')">Block</button>`;
        if (blocked) actions += `<button class="btn btn-sm btn-primary" onclick="unblockDoc('${uid}')">Unblock</button>`;
        actions += `<button class="btn btn-sm btn-danger" onclick="deleteDoc('${uid}')">Delete</button>`;
        return `<tr>
            <td><strong>${doc.name || 'N/A'}</strong><br><small style="color:#94a3b8">${doc.specialty || 'General'}</small></td>
            <td style="font-size:0.82rem">${doc.email || '-'}</td>
            <td>${doc.phone || '-'}</td>
            <td><span class="status-indicator ${statusClass}">${statusText}</span></td>
            <td><span style="color:${approved ? '#10b981' : '#f59e0b'};font-weight:600">${approved ? '✓ Approved' : '⏳ Pending'}</span></td>
            <td class="actions-td">${actions}</td>
        </tr>`;
    }).join('');
}

function renderPatients(patients) {
    const list = document.getElementById('patient-list');
    if (!list) return;
    const entries = Object.entries(patients);
    if (!entries.length) { list.innerHTML = `<tr><td colspan="5" class="empty-td">No patients registered yet.</td></tr>`; return; }
    list.innerHTML = entries.map(([uid, p]) => {
        const blocked = p.blocked === true;
        return `<tr>
            <td><strong>${p.name || 'N/A'}</strong></td>
            <td style="font-size:0.82rem">${p.email || '-'}</td>
            <td>${p.age || '-'}</td>
            <td>${p.bloodGroup || '-'}</td>
            <td>
                <span style="color:${blocked ? '#ef4444' : '#10b981'};font-weight:600">${blocked ? 'Blocked' : 'Active'}</span>
                ${!blocked ? `<button class="btn btn-sm btn-warning" onclick="blockPatient('${uid}')" style="margin-left:0.5rem">Block</button>` : `<button class="btn btn-sm btn-primary" onclick="unblockPatient('${uid}')" style="margin-left:0.5rem">Unblock</button>`}
            </td>
        </tr>`;
    }).join('');
}

function renderSessions(sessions) {
    const list = document.getElementById('session-list');
    if (!list) return;
    let active = 0, emergency = 0, total = Object.keys(sessions).length;
    document.getElementById('stat-total').textContent = total;
    const sorted = Object.entries(sessions).sort((a, b) => (b[1].startTime || 0) - (a[1].startTime || 0)).slice(0, 30);
    if (!sorted.length) { list.innerHTML = `<tr><td colspan="6" class="empty-td">No sessions yet.</td></tr>`; if (document.getElementById('stat-active')) document.getElementById('stat-active').textContent = 0; if (document.getElementById('stat-emergency')) document.getElementById('stat-emergency').textContent = 0; return; }
    list.innerHTML = sorted.map(([sid, s]) => {
        if (!s.endTime) active++;
        if (s.emergency) emergency++;
        const isLive = !s.endTime;
        const dur = formatDur(s.startTime, s.endTime);
        const date = s.startTime ? new Date(s.startTime).toLocaleDateString('en-IN') : '-';
        return `<tr>
            <td style="font-family:monospace;font-size:0.78rem">${sid.substring(0,10)}…</td>
            <td>${s.patientName || 'Patient'}</td>
            <td>${s.doctorName || 'Doctor'}</td>
            <td>${date}</td>
            <td>${dur}</td>
            <td>
                ${s.emergency ? '<span class="badge-emergency">⚠ EMRG</span> ' : ''}
                <span class="status-indicator ${isLive ? 'status-active' : 'status-offline'}">${isLive ? 'LIVE' : 'Done'}</span>
            </td>
        </tr>`;
    }).join('');
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-emergency').textContent = emergency;
}

function formatDur(start, end) {
    if (!start) return '-';
    const min = Math.floor(((end || Date.now()) - start) / 60000);
    if (min < 1) return '< 1m';
    if (min < 60) return `${min}m`;
    return `${Math.floor(min/60)}h ${min%60}m`;
}

// Actions
window.approveDoc = async uid => { if (confirm('Approve this doctor?')) { try { await update(ref(db, `users/doctors/${uid}`), { approved: true, blocked: false }); showToast('Doctor approved!', 'success'); } catch(e) { showToast(e.message, 'error'); } } };
window.blockDoc = async uid => { if (confirm('Block this doctor?')) { try { await update(ref(db, `users/doctors/${uid}`), { blocked: true, approved: false, status: 'INACTIVE', busy: false, activeSessionId: null }); showToast('Doctor blocked.', 'success'); } catch(e) { showToast(e.message, 'error'); } } };
window.unblockDoc = async uid => { if (confirm('Unblock this doctor?')) { try { await update(ref(db, `users/doctors/${uid}`), { blocked: false, approved: true }); showToast('Doctor unblocked!', 'success'); } catch(e) { showToast(e.message, 'error'); } } };
window.deleteDoc = async uid => { if (confirm('Permanently delete this doctor? This cannot be undone.')) { try { await remove(ref(db, `users/doctors/${uid}`)); await remove(ref(db, `doctorStatus/${uid}`)); showToast('Doctor deleted.', 'success'); } catch(e) { showToast(e.message, 'error'); } } };
window.blockPatient = async uid => { if (confirm('Block this patient?')) { try { await update(ref(db, `users/patients/${uid}`), { blocked: true }); showToast('Patient blocked.', 'success'); } catch(e) { showToast(e.message, 'error'); } } };
window.unblockPatient = async uid => { if (confirm('Unblock this patient?')) { try { await update(ref(db, `users/patients/${uid}`), { blocked: false }); showToast('Patient unblocked!', 'success'); } catch(e) { showToast(e.message, 'error'); } } };

// Toast notification
function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('toast-show'), 10);
    setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 400); }, 4000);
}

window.addEventListener('auth-success', e => {
    console.log('Admin auth:', e.detail.email);
    const nameEl = document.getElementById('admin-name');
    if (nameEl) nameEl.textContent = e.detail.email;
    initMonitoring();
    switchSection('dashboard');
});

checkAuth('admin');
