// Doctor Panel - Full Working
import { db, auth, storage } from './firebase.js';
import { checkAuth, login, logout } from './auth.js';
import { ref, set, push, onValue, update, get, onDisconnect, off, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentDoctor = null, currentDoctorData = null;
let currentSessionId = null, currentPatientId = null;
let heartbeatInterval = null, sessionListener = null, chatListener = null, healthListener = null;
let pc = null, localStream = null;
const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }], iceCandidatePoolSize: 10 };

const views = {
    dashboard: document.getElementById('dashboard-view'),
    profile: document.getElementById('profile-view'),
    history: document.getElementById('history-view'),
    patients: document.getElementById('patients-view')
};

// Navigation
document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        if (section !== 'dashboard') {
            const ac = document.getElementById('active-consultation');
            if (ac && !ac.classList.contains('hidden')) {
                showToast('End current consultation before navigating.', 'warning'); return;
            }
        }
        switchView(section);
        if (window.innerWidth <= 768) document.getElementById('sidebar')?.classList.remove('open');
    });
});

function switchView(name) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');
    Object.entries(views).forEach(([k, el]) => {
        if (el) el.classList.toggle('hidden', k !== name);
    });
}

// Mobile sidebar
document.getElementById('menu-toggle')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.add('open'));
document.getElementById('close-sidebar')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.remove('open'));
document.addEventListener('click', e => {
    const sb = document.getElementById('sidebar');
    if (window.innerWidth <= 768 && sb?.classList.contains('open') && !sb.contains(e.target) && !document.getElementById('menu-toggle')?.contains(e.target))
        sb.classList.remove('open');
});

// Login
document.getElementById('login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
        await login(document.getElementById('email').value.trim(), document.getElementById('password').value, 'doctor');
    } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Authorize'; }
});

// Logout
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (currentDoctor) await update(ref(db, `users/doctors/${currentDoctor.uid}`), { status: 'INACTIVE', busy: false, lastActiveTime: Date.now() }).catch(() => {});
    logout();
});

// Heartbeat
function startHeartbeat(uid) {
    const doctRef = ref(db, `users/doctors/${uid}`);
    const statusRef = ref(db, `doctorStatus/${uid}`);
    update(doctRef, { status: 'ACTIVE', lastActiveTime: Date.now() });
    onDisconnect(doctRef).update({ status: 'INACTIVE', busy: false });
    onDisconnect(statusRef).remove();
    const setOnline = () => {
        const now = Date.now();
        set(statusRef, { lastActiveTime: now, status: 'ACTIVE' });
        update(doctRef, { status: 'ACTIVE', lastActiveTime: now });
        const ls = document.getElementById('live-status');
        if (ls) { ls.textContent = 'ONLINE'; ls.className = 'status-indicator status-active'; }
    };
    setOnline();
    heartbeatInterval = setInterval(setOnline, 10000);
}

// Monitor sessions
function monitorSessions(uid) {
    onValue(ref(db, `users/doctors/${uid}`), async snap => {
        const data = snap.val(); currentDoctorData = data;
        if (data?.activeSessionId && data.activeSessionId !== currentSessionId) {
            const sSnap = await get(ref(db, `sessions/${data.activeSessionId}`));
            const session = sSnap.val();
            if (session && session.status === 'ACTIVE' && !session.endTime) {
                currentSessionId = data.activeSessionId;
                showNotification(`🔔 New Patient: ${session.patientName || 'Patient'}\nSymptoms: ${session.symptoms || 'N/A'}`);
                showConsultation(currentSessionId);
            } else {
                await update(ref(db, `users/doctors/${uid}`), { activeSessionId: null, busy: false }).catch(() => {});
                if (currentSessionId) { currentSessionId = null; hideConsultation(); }
            }
        } else if (!data?.activeSessionId && currentSessionId) {
            stopVideoCall(); currentSessionId = null; hideConsultation();
        }
    });
}

function showConsultation(sid) {
    switchView('dashboard');
    document.getElementById('dashboard-view')?.classList.add('hidden');
    document.getElementById('active-consultation')?.classList.remove('hidden');

    // ── Clean up old listeners ───────────────────────────────
    if (sessionListener) off(sessionListener);
    if (chatListener)    off(chatListener);
    if (healthListener)  off(healthListener);

    // ── 1. Session info listener (name, symptoms, emergency) ─
    sessionListener = ref(db, `sessions/${sid}`);
    let patientLoaded = false;
    onValue(sessionListener, snap => {
        const session = snap.val(); if (!session) return;
        currentPatientId = session.patientId;

        // Patient name + emergency flag
        const nameEl = document.getElementById('p-name');
        if (nameEl) {
            nameEl.innerHTML = `${session.patientName || 'Patient'}${session.emergency ? ' <span style="color:#ef4444">⚠ EMERGENCY</span>' : ''}`;
            if (session.emergency) nameEl.style.color = '#ef4444';
        }
        const sxEl = document.getElementById('p-symptoms');
        if (sxEl) sxEl.textContent = session.symptoms || 'Not specified';

        // Load patient profile ONCE (not on every update)
        if (session.patientId && !patientLoaded) {
            patientLoaded = true;
            get(ref(db, `users/patients/${session.patientId}`)).then(pSnap => {
                const p = pSnap.val(); if (!p) return;
                const ageEl   = document.getElementById('p-age');    if (ageEl) ageEl.textContent = p.age || '--';
                const bloodEl = document.getElementById('p-blood');  if (bloodEl) bloodEl.textContent = p.bloodGroup || '--';
                const genEl   = document.getElementById('p-gender'); if (genEl) genEl.textContent = p.gender || '--';
                const histEl  = document.getElementById('p-medical-history');
                if (histEl) histEl.textContent = p.medicalHistory || 'None reported';
            });
            loadPatientReports(session.patientId);
        }
    });

    // ── 2. DEDICATED health-data listener (real-time vitals) ──
    healthListener = ref(db, `sessions/${sid}/healthData`);
    let lastVitalUpdate = 0;
    onValue(healthListener, snap => {
        const hd = snap.val();
        if (!hd) return;

        const vitalFields = [
            { key: 'bp',    id: 'v-bp' },
            { key: 'temp',  id: 'v-temp' },
            { key: 'sugar', id: 'v-sugar' },
            { key: 'spo2',  id: 'v-spo2' },
            { key: 'pulse', id: 'v-pulse' },
            { key: 'heartRate', id: 'v-heartrate' }
        ];

        const isNew = hd.updatedAt && hd.updatedAt !== lastVitalUpdate;
        lastVitalUpdate = hd.updatedAt || 0;

        vitalFields.forEach(({ key, id }) => {
            const el = document.getElementById(id);
            if (!el) return;
            const val = hd[key] || '--';
            if (el.textContent !== String(val)) {
                el.textContent = val;
                // Pulse animation on change
                if (isNew) {
                    el.closest('.vital-box')?.classList.add('vital-pulse');
                    setTimeout(() => el.closest('.vital-box')?.classList.remove('vital-pulse'), 1200);
                }
            }
        });

        const updEl = document.getElementById('v-updated');
        if (updEl && hd.updatedAt) {
            const t = new Date(hd.updatedAt);
            updEl.textContent = `🟢 Updated: ${t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
            updEl.style.color = '#10b981';
            // Fade back to grey after 10s
            setTimeout(() => { if (updEl) updEl.style.color = '#94a3b8'; }, 10000);
        }
    });

    // ── 3. Chat listener ─────────────────────────────────────
    chatListener = ref(db, `sessions/${sid}/chat`);
    onValue(chatListener, snap => {
        const chatBox = document.getElementById('chat-messages'); if (!chatBox) return;
        chatBox.innerHTML = '';
        const messages = snap.val() || {};
        Object.values(messages).forEach(m => {
            const div = document.createElement('div');
            div.className = `msg msg-${m.role === 'doctor' ? 'd' : 'p'}`;
            div.textContent = m.text;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    setTimeout(() => setupWebRTC(sid, 'doctor'), 1200);
}

function hideConsultation() {
    // Clean up all real-time listeners
    if (sessionListener) { off(sessionListener); sessionListener = null; }
    if (chatListener)    { off(chatListener);    chatListener = null; }
    if (healthListener)  { off(healthListener);  healthListener = null; }

    document.getElementById('active-consultation')?.classList.add('hidden');
    document.getElementById('dashboard-view')?.classList.remove('hidden');

    // Reset vital displays
    ['v-bp','v-temp','v-sugar','v-spo2','v-pulse','v-heartrate'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '--';
    });
    const updEl = document.getElementById('v-updated'); if (updEl) updEl.textContent = '';
    const chatBox = document.getElementById('chat-messages'); if (chatBox) chatBox.innerHTML = '';
    currentPatientId = null;
}

// WebRTC
async function setupWebRTC(sid, role) {
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const placeholder = document.getElementById('video-placeholder');
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideo) localVideo.srcObject = localStream;
        pc = new RTCPeerConnection(servers);
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        pc.ontrack = e => { if (remoteVideo) { remoteVideo.srcObject = e.streams[0]; placeholder?.classList.add('hidden'); } };
        const sessionRef = ref(db, `sessions/${sid}/webrtc`);
        onValue(sessionRef, async snap => {
            const data = snap.val();
            if (!pc.currentRemoteDescription && data?.offer) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const ans = await pc.createAnswer();
                await pc.setLocalDescription(ans);
                await update(sessionRef, { answer: { sdp: ans.sdp, type: ans.type } });
            }
        });
        pc.onicecandidate = e => { if (e.candidate) set(push(ref(db, `sessions/${sid}/webrtc/doctorCandidates`)), e.candidate.toJSON()); };
        onValue(ref(db, `sessions/${sid}/webrtc/patientCandidates`), snap => {
            snap.forEach(child => { const d = child.val(); if (d) pc.addIceCandidate(new RTCIceCandidate(d)).catch(() => {}); });
        });
        setupVideoControls();
    } catch (err) {
        console.error('WebRTC:', err);
        if (placeholder) placeholder.innerHTML = '<p style="color:#ef4444;padding:1rem">📷 Camera access denied</p>';
    }
}

function setupVideoControls() {
    document.getElementById('toggle-video')?.addEventListener('click', function() {
        if (!localStream) return;
        const t = localStream.getVideoTracks()[0]; if (!t) return;
        t.enabled = !t.enabled; this.classList.toggle('off', !t.enabled);
    });
    document.getElementById('toggle-audio')?.addEventListener('click', function() {
        if (!localStream) return;
        const t = localStream.getAudioTracks()[0]; if (!t) return;
        t.enabled = !t.enabled; this.classList.toggle('off', !t.enabled);
    });
}

function stopVideoCall() {
    localStream?.getTracks().forEach(t => t.stop()); localStream = null;
    pc?.close(); pc = null;
}

// Chat
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input?.value?.trim();
    if (!text || !currentSessionId) return;
    try {
        await set(push(ref(db, `sessions/${currentSessionId}/chat`)), { role: 'doctor', text, timestamp: Date.now() });
        input.value = '';
    } catch (e) { showToast('Failed to send message', 'error'); }
}
document.getElementById('send-btn')?.addEventListener('click', sendMessage);
document.getElementById('chat-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });

// End session
document.getElementById('end-session-btn')?.addEventListener('click', () => document.getElementById('prescription-modal')?.classList.remove('hidden'));
document.getElementById('cancel-prescription-btn')?.addEventListener('click', () => document.getElementById('prescription-modal')?.classList.add('hidden'));
document.getElementById('prescription-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

document.getElementById('confirm-end-btn')?.addEventListener('click', async () => {
    const prescription = document.getElementById('prescription-text')?.value?.trim();
    if (!prescription) { showToast('Please write a prescription first.', 'warning'); return; }
    if (!currentSessionId || !currentDoctor?.uid) { showToast('Session error. Refresh and try again.', 'error'); return; }
    const btn = document.getElementById('confirm-end-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
        await update(ref(db, `sessions/${currentSessionId}`), { prescription, endTime: Date.now(), status: 'COMPLETED' });
        await update(ref(db, `users/doctors/${currentDoctor.uid}`), { busy: false, activeSessionId: null });
        document.getElementById('prescription-text').value = '';
        document.getElementById('prescription-modal')?.classList.add('hidden');
        stopVideoCall();
        showToast('✅ Consultation completed! Prescription sent to patient.', 'success');
        currentSessionId = null; currentPatientId = null;
        hideConsultation();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Complete & Send Prescription'; }
});

// Load History
function loadHistory(uid) {
    const q = query(ref(db, 'sessions'), orderByChild('doctorId'), equalTo(uid));
    onValue(q, snap => {
        const all = snap.val() || {};
        const sessions = Object.entries(all).sort((a, b) => (b[1].startTime || 0) - (a[1].startTime || 0));
        const today = new Date().setHours(0,0,0,0);

        document.getElementById('stat-patients').textContent = sessions.length;
        document.getElementById('stat-today').textContent = sessions.filter(([,s]) => (s.startTime||0) >= today).length;
        document.getElementById('stat-emergencies').textContent = sessions.filter(([,s]) => s.emergency).length;

        renderHistoryTable('history-list', sessions.slice(0, 10));
        renderHistoryTable('full-history-list', sessions);
    });
}

function renderHistoryTable(id, sessions) {
    const el = document.getElementById(id); if (!el) return;
    if (!sessions.length) { el.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:2rem">No consultations yet.</td></tr>`; return; }
    el.innerHTML = sessions.map(([sid, s]) => `
        <tr>
            <td><strong>${s.patientName || 'Patient'}</strong>${s.emergency ? ' <span style="color:#ef4444">⚠</span>' : ''}</td>
            <td>${s.symptoms?.substring(0,40) || '--'}${(s.symptoms?.length||0)>40?'…':''}</td>
            <td style="font-size:0.82rem">${s.startTime ? new Date(s.startTime).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}) : '-'}</td>
            <td>${formatDur(s.startTime, s.endTime)}</td>
            <td><span class="status-indicator ${s.endTime ? 'status-offline' : 'status-active'}">${s.endTime ? '✓ Done' : '⏺ Active'}</span></td>
        </tr>
    `).join('');
}

// Load All Patients
function loadAllPatients() {
    onValue(ref(db, 'users/patients'), snap => {
        const patients = snap.val() || {};
        const el = document.getElementById('all-patients-list'); if (!el) return;
        const entries = Object.entries(patients);
        if (!entries.length) { el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:2rem">No patients found.</p>'; return; }
        el.innerHTML = `<table><thead><tr><th>Name</th><th>Age</th><th>Blood</th><th>Email</th></tr></thead><tbody>${
            entries.map(([uid, p]) => `<tr><td><strong>${p.name||'N/A'}</strong></td><td>${p.age||'-'}</td><td>${p.bloodGroup||'-'}</td><td style="font-size:0.82rem">${p.email||'-'}</td></tr>`).join('')
        }</tbody></table>`;
    });
}

// Load patient reports
async function loadPatientReports(patientId) {
    const el = document.getElementById('patient-reports-list'); if (!el) return;
    onValue(ref(db, `users/patients/${patientId}/reports`), snap => {
        const reports = Object.entries(snap.val() || {});
        if (!reports.length) { el.innerHTML = '<p style="color:#94a3b8;font-size:0.875rem">No reports uploaded.</p>'; return; }
        el.innerHTML = reports.map(([id, r]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;border:1px solid #f1f5f9;border-radius:10px;margin-bottom:0.5rem">
                <div><strong style="font-size:0.875rem">${r.description||'Report'}</strong><p style="font-size:0.75rem;color:#94a3b8;margin:0.2rem 0 0">${new Date(r.uploadedAt).toLocaleDateString()}</p></div>
                <button class="btn btn-sm btn-primary" onclick="window.open('${r.downloadURL}','_blank')">View</button>
            </div>
        `).join('');
    });
}

// Doctor Profile
function loadProfile() {
    if (!currentDoctor || !currentDoctorData) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '--'; };
    set('doc-profile-name', currentDoctorData.name);
    set('doc-profile-email', currentDoctor.email);
    set('doc-profile-spec', currentDoctorData.specialty);
    set('doc-profile-exp', currentDoctorData.experience);
    set('doc-profile-phone', currentDoctorData.phone);
    set('doc-profile-status', currentDoctorData.approved ? '✓ Approved' : '⏳ Pending Approval');
}

function formatDur(start, end) {
    if (!start) return '-';
    const min = Math.floor(((end || Date.now()) - start) / 60000);
    if (min < 1) return '< 1m'; if (min < 60) return `${min}m`;
    return `${Math.floor(min/60)}h ${min%60}m`;
}

function showToast(msg, type='success') {
    let t = document.getElementById('toast-msg');
    if (!t) { t = document.createElement('div'); t.id = 'toast-msg'; t.style.cssText = 'position:fixed;bottom:2rem;right:2rem;padding:0.875rem 1.5rem;border-radius:12px;font-weight:600;font-size:0.875rem;z-index:9999;max-width:360px;transform:translateY(100px);opacity:0;transition:all 0.3s;box-shadow:0 8px 24px rgba(0,0,0,0.15)'; document.body.appendChild(t); }
    t.textContent = msg;
    t.style.background = type==='error'?'#fee2e2':type==='warning'?'#fef3c7':'#d1fae5';
    t.style.color = type==='error'?'#991b1b':type==='warning'?'#92400e':'#065f46';
    setTimeout(() => { t.style.transform='translateY(0)'; t.style.opacity='1'; }, 10);
    setTimeout(() => { t.style.transform='translateY(100px)'; t.style.opacity='0'; }, 4000);
}

function showNotification(msg) {
    if (Notification.permission === 'granted') new Notification('Aarogya', { body: msg, icon: '/favicon.ico' });
    else showToast(msg, 'success');
}

window.addEventListener('auth-success', async e => {
    currentDoctor = e.detail;
    Notification.requestPermission().catch(() => {});
    const snap = await get(ref(db, `users/doctors/${currentDoctor.uid}`));
    currentDoctorData = snap.val();
    const nameEl = document.getElementById('doctor-name');
    if (nameEl) nameEl.textContent = `Dr. ${currentDoctorData?.name || 'Practitioner'}`;
    const idEl = document.getElementById('doctor-id');
    if (idEl) idEl.textContent = `ID: ${currentDoctor.uid.substring(0,8)}`;
    loadHistory(currentDoctor.uid);
    startHeartbeat(currentDoctor.uid);
    monitorSessions(currentDoctor.uid);
    loadProfile();
    loadAllPatients();
});

checkAuth('doctor');
