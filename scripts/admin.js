// Admin Panel - Full Featured & Secured
import { db, auth } from './firebase.js';
import { checkAuth, login, logout } from './auth.js';
import {
    ref, set, push, onValue, update, remove, get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
    createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    initializeApp, getApps
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ── Secondary Firebase app to create doctor accounts without disturbing admin session ──
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBc_6EVKN3h3PojI8Fv7aHyyKCqnp08vdY",
    authDomain: "aaro-7786a.firebaseapp.com",
    databaseURL: "https://aaro-7786a-default-rtdb.firebaseio.com",
    projectId: "aaro-7786a",
    storageBucket: "aaro-7786a.firebasestorage.app",
    messagingSenderId: "641143458909",
    appId: "1:641143458909:web:2d05fc159480fd1ed591b4"
};

let secondaryApp;
function getSecondaryAuth() {
    if (!secondaryApp) {
        const existing = getApps().find(a => a.name === 'secondary');
        secondaryApp = existing || initializeApp(FIREBASE_CONFIG, 'secondary');
    }
    return getAuth(secondaryApp);
}

let currentSection = 'dashboard';

// ─── Login ────────────────────────────────────────────────────────────────────
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Logging in…';
    try {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        await login(email, password, 'admin');
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Login to Dashboard';
    }
});

// ─── Logout ───────────────────────────────────────────────────────────────────
document.getElementById('logout-btn')?.addEventListener('click', () => logout());

// ─── Navigation ───────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
        currentSection = btn.dataset.section;
        switchSection(currentSection);
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('overlay')?.classList.remove('show');
        }
    });
});

function switchSection(name) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');
    document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${name}`)?.classList.remove('hidden');

    const titles = {
        dashboard: 'Dashboard',
        doctors: 'Doctor Management',
        patients: 'Patient Management',
        sessions: 'Live Sessions',
        reports: 'System Reports'
    };
    document.getElementById('page-title').textContent = titles[name] || 'Dashboard';
}

// ─── Mobile sidebar ───────────────────────────────────────────────────────────
document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('overlay')?.classList.add('show');
});
document.getElementById('overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('overlay')?.classList.remove('show');
});

// ─── Add Doctor Modal ─────────────────────────────────────────────────────────
document.getElementById('add-doctor-btn')?.addEventListener('click', () => {
    document.getElementById('doctor-modal')?.classList.remove('hidden');
});
document.getElementById('close-modal')?.addEventListener('click', () => {
    document.getElementById('doctor-modal')?.classList.add('hidden');
    document.getElementById('add-doctor-form')?.reset();
    clearModalError();
});
document.getElementById('doctor-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) {
        e.currentTarget.classList.add('hidden');
        document.getElementById('add-doctor-form')?.reset();
        clearModalError();
    }
});

// ─── Register Doctor (uses secondary app — admin stays logged in) ─────────────
document.getElementById('add-doctor-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearModalError();

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width:16px;height:16px;margin-right:8px;display:inline;"></i> Registering…';
    lucide.createIcons();

    const name       = document.getElementById('doc-name').value.trim();
    const email      = document.getElementById('doc-email').value.trim();
    const password   = document.getElementById('doc-password').value;
    const specialty  = document.getElementById('doc-specialty').value.trim() || 'General Physician';
    const phone      = document.getElementById('doc-phone')?.value.trim() || '';
    const experience = document.getElementById('doc-experience')?.value.trim() || '';
    const hospital   = document.getElementById('doc-hospital')?.value.trim() || '';

    try {
        // 1. Create Firebase Auth user using SECONDARY app (admin session untouched)
        const secAuth = getSecondaryAuth();
        const cred = await createUserWithEmailAndPassword(secAuth, email, password);
        const doctorUid = cred.user.uid;

        // 2. Sign the secondary user out immediately
        await signOut(secAuth);

        // 3. Write doctor profile to Realtime DB using ADMIN's authenticated connection
        await set(ref(db, `users/doctors/${doctorUid}`), {
            uid: doctorUid,
            name,
            email,
            specialty,
            phone,
            experience,
            hospital,
            role: 'doctor',
            approved: false,
            blocked: false,
            status: 'INACTIVE',
            busy: false,
            createdAt: Date.now()
        });

        showToast('<i data-lucide="check-circle" style="width:16px;height:16px;display:inline;margin-right:8px;vertical-align:middle;"></i> Dr. ' + name + ' registered successfully! They can now log in after approval.', 'success');
        document.getElementById('doctor-modal')?.classList.add('hidden');
        document.getElementById('add-doctor-form')?.reset();

    } catch (err) {
        let msg = err.message;
        if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered in Firebase.';
        if (err.code === 'auth/weak-password')        msg = 'Password must be at least 6 characters.';
        if (err.code === 'auth/invalid-email')        msg = 'Invalid email address format.';
        showModalError(msg);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Register Doctor';
    }
});

// ─── Real-time monitoring ─────────────────────────────────────────────────────
function initMonitoring() {
    onValue(ref(db, 'users/doctors'), snap => {
        const docs = snap.val() || {};
        renderDoctors(docs);
        updateStats(docs);
    });

    onValue(ref(db, 'users/patients'), snap => {
        const patients = snap.val() || {};
        renderPatients(patients);
        const statPatients = document.getElementById('stat-patients');
        if (statPatients) statPatients.textContent = Object.keys(patients).length;
    });

    onValue(ref(db, 'sessions'), snap => {
        const sessions = snap.val() || {};
        renderSessions(sessions, 'session-list', true);     // dashboard (recent 10)
        renderSessions(sessions, 'session-list-full', false); // full sessions tab
    });
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function updateStats(doctors) {
    const all    = Object.values(doctors);
    const total  = all.length;
    const online = all.filter(d => d.status === 'ACTIVE' && !d.blocked && d.approved).length;
    const statDocs = document.getElementById('stat-doctors');
    if (statDocs) statDocs.textContent = total;
    const statOnline = document.getElementById('stat-online');
    if (statOnline) statOnline.textContent  = online;
}

// ─── Render Doctors ───────────────────────────────────────────────────────────
function renderDoctors(doctors) {
    const list = document.getElementById('doctor-list');
    if (!list) return;
    const entries = Object.entries(doctors);
    if (!entries.length) {
        list.innerHTML = `<tr><td colspan="6" class="empty-td">No doctors registered yet. Click "+ Add Doctor" to get started.</td></tr>`;
        return;
    }
    list.innerHTML = entries.map(([uid, doc]) => {
        const blocked  = doc.blocked === true;
        const approved = doc.approved === true;

        let statusClass = 'status-offline', statusText = 'OFFLINE';
        if (blocked) {
            statusClass = 'status-inactive'; statusText = 'BLOCKED';
        } else if (doc.status === 'ACTIVE') {
            statusClass = doc.busy ? 'status-busy' : 'status-active';
            statusText  = doc.busy ? 'IN SESSION' : 'ONLINE';
        }

        let actions = '';
        if (!approved && !blocked) actions += `<button class="btn btn-sm btn-accent" onclick="approveDoc('${uid}')"><i data-lucide="check" style="width:12px;height:12px;"></i> Approve</button>`;
        if (approved  && !blocked) actions += `<button class="btn btn-sm btn-warning" onclick="blockDoc('${uid}')">Block</button>`;
        if (blocked)               actions += `<button class="btn btn-sm btn-primary" onclick="unblockDoc('${uid}')">Unblock</button>`;
        actions += `<button class="btn btn-sm btn-danger" onclick="deleteDoc('${uid}')">Delete</button>`;

        return `<tr>
            <td>
                <strong>${esc(doc.name || 'N/A')}</strong><br>
                <small style="color:#94a3b8">${esc(doc.specialty || 'General')}</small>
            </td>
            <td style="font-size:0.82rem">${esc(doc.email || '-')}</td>
            <td>${esc(doc.phone || '-')}</td>
            <td><span class="status-indicator ${statusClass}">${statusText}</span></td>
            <td><span style="color:${approved ? '#10b981' : '#f59e0b'};font-weight:600">${approved ? '<i data-lucide="check" style="width:12px;height:12px;display:inline;"></i> Approved' : '<i data-lucide="clock" style="width:12px;height:12px;display:inline;"></i> Pending'}</span></td>
            <td class="actions-td">${actions}</td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

// ─── Render Patients ──────────────────────────────────────────────────────────
function renderPatients(patients) {
    const list = document.getElementById('patient-list');
    if (!list) return;
    const entries = Object.entries(patients);
    if (!entries.length) {
        list.innerHTML = `<tr><td colspan="5" class="empty-td">No patients registered yet.</td></tr>`;
        return;
    }
    list.innerHTML = entries.map(([uid, p]) => {
        const blocked = p.blocked === true;
        return `<tr>
            <td><strong>${esc(p.name || 'N/A')}</strong></td>
            <td style="font-size:0.82rem">${esc(p.email || '-')}</td>
            <td>${esc(p.age || '-')}</td>
            <td>${esc(p.bloodGroup || '-')}</td>
            <td>
                <span style="color:${blocked ? '#ef4444' : '#10b981'};font-weight:600">${blocked ? 'Blocked' : 'Active'}</span>
                ${!blocked
                    ? `<button class="btn btn-sm btn-warning" onclick="blockPatient('${uid}')" style="margin-left:0.5rem">Block</button>`
                    : `<button class="btn btn-sm btn-primary" onclick="unblockPatient('${uid}')" style="margin-left:0.5rem">Unblock</button>`
                }
            </td>
        </tr>`;
    }).join('');
}

// ─── Render Sessions ──────────────────────────────────────────────────────────
function renderSessions(sessions, listId, recentOnly) {
    const list = document.getElementById(listId);
    if (!list) return;

    const total  = Object.keys(sessions).length;
    let active   = 0, emergency = 0;

    if (listId === 'session-list') {
        const elTotal = document.getElementById('stat-total');
        if (elTotal) elTotal.textContent = total;
    }

    const sorted = Object.entries(sessions)
        .sort((a, b) => (b[1].startTime || 0) - (a[1].startTime || 0));

    const entries = recentOnly ? sorted.slice(0, 10) : sorted;

    if (!entries.length) {
        list.innerHTML = `<tr><td colspan="6" class="empty-td">No sessions recorded yet.</td></tr>`;
        if (listId === 'session-list') {
            const elActive = document.getElementById('stat-active');
            if (elActive) elActive.textContent = 0;
            const elEmergency = document.getElementById('stat-emergency');
            if (elEmergency) elEmergency.textContent = 0;
        }
        return;
    }

    list.innerHTML = entries.map(([sid, s]) => {
        if (!s.endTime)  active++;
        if (s.emergency) emergency++;
        const isLive = !s.endTime;
        const dur    = formatDur(s.startTime, s.endTime);
        const date   = s.startTime ? new Date(s.startTime).toLocaleDateString('en-IN') : '-';
        return `<tr>
            <td style="font-family:monospace;font-size:0.78rem">${sid.substring(0, 10)}…</td>
            <td>${esc(s.patientName || 'Patient')}</td>
            <td>${esc(s.doctorName  || 'Doctor')}</td>
            <td>${date}</td>
            <td>${dur}</td>
            <td>
                ${s.emergency ? '<span class="badge-emergency"><i data-lucide="alert-triangle" style="width:10px;height:10px;"></i> EMRG</span> ' : ''}
                <span class="status-indicator ${isLive ? 'status-active' : 'status-offline'}">${isLive ? 'LIVE' : 'Done'}</span>
            </td>
        </tr>`;
    }).join('');
    lucide.createIcons();

    if (listId === 'session-list') {
        const elActive = document.getElementById('stat-active');
        if (elActive) elActive.textContent = active;
        const elEmergency = document.getElementById('stat-emergency');
        if (elEmergency) elEmergency.textContent = emergency;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDur(start, end) {
    if (!start) return '-';
    const min = Math.floor(((end || Date.now()) - start) / 60000);
    if (min < 1)  return '< 1m';
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showModalError(msg) {
    let el = document.getElementById('modal-error');
    if (!el) {
        el = document.createElement('div');
        el.id = 'modal-error';
        el.style.cssText = 'background:#fee2e2;color:#dc2626;padding:0.75rem 1rem;border-radius:8px;margin-bottom:1rem;font-size:0.875rem;border:1px solid #fca5a5;';
        document.getElementById('add-doctor-form')?.prepend(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
}
function clearModalError() {
    const el = document.getElementById('modal-error');
    if (el) el.style.display = 'none';
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = msg;
    lucide.createIcons();
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('toast-show'), 10);
    setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 400); }, 5000);
}

// ─── Doctor actions (global so onclick works in table) ────────────────────────
window.approveDoc = async uid => {
    if (!confirm('Approve this doctor? They will be able to log in immediately.')) return;
    try {
        await update(ref(db, `users/doctors/${uid}`), { approved: true, blocked: false });
        showToast('Doctor approved!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
};

window.blockDoc = async uid => {
    if (!confirm('Block this doctor? They will be signed out immediately.')) return;
    try {
        await update(ref(db, `users/doctors/${uid}`), {
            blocked: true, approved: false,
            status: 'INACTIVE', busy: false, activeSessionId: null
        });
        showToast('Doctor blocked.', 'success');
    } catch (e) { showToast(e.message, 'error'); }
};

window.unblockDoc = async uid => {
    if (!confirm('Unblock this doctor?')) return;
    try {
        await update(ref(db, `users/doctors/${uid}`), { blocked: false, approved: true });
        showToast('Doctor unblocked!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
};

window.deleteDoc = async uid => {
    if (!confirm('Permanently delete this doctor? This cannot be undone!')) return;
    try {
        await remove(ref(db, `users/doctors/${uid}`));
        await remove(ref(db, `doctorStatus/${uid}`));
        showToast('Doctor deleted.', 'success');
    } catch (e) { showToast(e.message, 'error'); }
};

window.blockPatient = async uid => {
    if (!confirm('Block this patient?')) return;
    try {
        await update(ref(db, `users/patients/${uid}`), { blocked: true });
        showToast('Patient blocked.', 'success');
    } catch (e) { showToast(e.message, 'error'); }
};

window.unblockPatient = async uid => {
    if (!confirm('Unblock this patient?')) return;
    try {
        await update(ref(db, `users/patients/${uid}`), { blocked: false });
        showToast('Patient unblocked!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
};

// ─── Auth success hook ────────────────────────────────────────────────────────
window.addEventListener('auth-success', e => {
    const nameEl = document.getElementById('admin-name');
    if (nameEl) nameEl.textContent = ' ' + e.detail.email;
    initMonitoring();
    switchSection('dashboard');
});

checkAuth('admin');
