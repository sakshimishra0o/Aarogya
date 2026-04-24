// Patient Panel - Full Working
import { db, auth, storage } from './firebase.js';
import { checkAuth, login, logout, registerPatient } from './auth.js';
import { ref, set, onValue, update, get, push, remove, query, orderByChild, equalTo, onChildAdded, off } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

let currentPatient = null, currentSessionId = null, assignedDoctorId = null, failSafeTimer = null;
let pc = null, localStream = null;
const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302'] }], iceCandidatePoolSize: 10 };

const views = {
    dashboard: document.getElementById('dashboard-view'),
    profile: document.getElementById('profile-view'),
    history: document.getElementById('history-view'),
    reports: document.getElementById('reports-view')
};

// Navigation
document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
        switchView(btn.dataset.section);
        if (window.innerWidth <= 768) document.getElementById('sidebar')?.classList.remove('open');
    });
});

function switchView(name) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');
    Object.values(views).forEach(el => el && el.classList.add('hidden'));
    if (views[name]) views[name].classList.remove('hidden');
}

// Mobile sidebar
document.getElementById('menu-toggle')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.add('open'));
document.getElementById('close-sidebar')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.remove('open'));
document.addEventListener('click', e => {
    const sb = document.getElementById('sidebar');
    if (window.innerWidth <= 768 && sb?.classList.contains('open') && !sb.contains(e.target) && !document.getElementById('menu-toggle')?.contains(e.target))
        sb.classList.remove('open');
});

document.getElementById('logout-btn')?.addEventListener('click', logout);

// Auth tabs
window.showTab = tab => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    if (tab === 'login') {
        document.querySelector('.auth-tab:first-child')?.classList.add('active');
        document.getElementById('login-form')?.classList.add('active');
    } else {
        document.querySelector('.auth-tab:last-child')?.classList.add('active');
        document.getElementById('register-form')?.classList.add('active');
    }
};

// Login
document.getElementById('login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
        await login(document.getElementById('login-email').value.trim(), document.getElementById('login-password').value, 'patient');
    } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Sign In'; }
});

// Register
document.getElementById('register-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Creating Account...';
    try {
        await registerPatient(
            document.getElementById('reg-name').value.trim(),
            document.getElementById('reg-email').value.trim(),
            document.getElementById('reg-password').value,
            { age: parseInt(document.getElementById('reg-age').value), bloodGroup: document.getElementById('reg-blood').value }
        );
        showToast('Account created! You are now logged in.', 'success');
    } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Create Account'; }
});

// Auth success
window.addEventListener('auth-success', async e => {
    currentPatient = e.detail;
    await Promise.all([loadProfile(), loadPatientHistory(currentPatient.uid), loadPatientReports()]);
});

// Profile
async function loadProfile() {
    if (!currentPatient) return;
    onValue(ref(db, `users/patients/${currentPatient.uid}`), snap => {
        const p = snap.val(); if (!p) return;
        setText('patient-name', p.name || 'Patient');
        setText('patient-id', `ID: ${currentPatient.uid.substring(0,8)}`);
        setText('dash-age', p.age || '--');
        setText('dash-blood', p.bloodGroup || '--');
        setText('dash-weight', p.weight ? p.weight+' kg' : '--');
        setVal('p-name-input', p.name);
        setVal('p-age-input', p.age);
        setVal('p-gender-input', p.gender || 'Male');
        setVal('p-blood-input', p.bloodGroup || 'O+');
        setVal('p-height-input', p.height);
        setVal('p-weight-input', p.weight);
        setVal('p-address-input', p.address);
        setVal('p-medical-input', p.medicalHistory);
    });
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setVal(id, val) { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; }

document.getElementById('profile-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('save-profile-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
        await update(ref(db, `users/patients/${currentPatient.uid}`), {
            name: document.getElementById('p-name-input').value,
            age: parseInt(document.getElementById('p-age-input').value) || 0,
            gender: document.getElementById('p-gender-input').value,
            bloodGroup: document.getElementById('p-blood-input').value,
            height: document.getElementById('p-height-input').value,
            weight: document.getElementById('p-weight-input').value,
            address: document.getElementById('p-address-input').value,
            medicalHistory: document.getElementById('p-medical-input').value
        });
        showToast('Profile saved successfully!', 'success');
    } catch (err) { showToast('Failed to save: ' + err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
});

// Consultation
document.getElementById('quick-consult-btn')?.addEventListener('click', (e) => {
    if (currentSessionId) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    document.getElementById('consult-modal')?.classList.remove('hidden');
});
document.getElementById('cancel-consult')?.addEventListener('click', () => document.getElementById('consult-modal')?.classList.add('hidden'));

document.getElementById('confirm-consult')?.addEventListener('click', async () => {
    const symptoms = document.getElementById('consult-symptoms')?.value.trim();
    if (!symptoms) { showToast('Please describe your symptoms.', 'warning'); return; }
    const btn = document.getElementById('confirm-consult');
    btn.disabled = true; btn.textContent = 'Finding Doctor...';
    try {
        await findAndConnectDoctor(symptoms);
        document.getElementById('consult-modal')?.classList.add('hidden');
        document.getElementById('consult-symptoms').value = '';
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Find Doctor'; }
});

async function findAndConnectDoctor(symptoms) {
    const snap = await get(ref(db, 'users/doctors'));
    const doctors = snap.val() || {};
    const available = Object.entries(doctors).find(([uid, d]) =>
        d.approved && d.status === 'ACTIVE' && !d.busy && (Date.now() - (d.lastActiveTime || 0)) < 30000
    );
    if (!available) throw new Error('No doctors available right now. Please try again shortly.');
    const [docId, docData] = available;
    assignedDoctorId = docId;
    await startSession(docId, docData.name, symptoms);
}

async function startSession(docId, docName, symptoms) {
    const sessionRef = push(ref(db, 'sessions'));
    currentSessionId = sessionRef.key;
    const patSnap = await get(ref(db, `users/patients/${currentPatient.uid}`));
    const patData = patSnap.val() || {};
    await set(sessionRef, {
        sessionId: currentSessionId,
        patientId: currentPatient.uid,
        patientName: patData.name || 'Patient',
        doctorId: docId, doctorName: docName,
        symptoms, startTime: Date.now(), status: 'ACTIVE'
    });
    await update(ref(db, `users/doctors/${docId}`), { busy: true, activeSessionId: currentSessionId });
    showConsultation(docName);
    startFailSafe(docId);
    setTimeout(() => setupWebRTC(currentSessionId, 'patient'), 1200);
}

let sessionListenerRef = null, chatListenerRef = null;
function showConsultation(docName) {
    const area = document.getElementById('consultation-area');
    if (area) area.classList.remove('hidden');
    setText('doctor-name-display', `Dr. ${docName}`);
    const chatBox = document.getElementById('chat-messages');
    
    if (chatListenerRef) off(chatListenerRef);
    chatListenerRef = ref(db, `sessions/${currentSessionId}/chat`);
    onValue(chatListenerRef, snap => {
        if (!chatBox) return;
        chatBox.innerHTML = '';
        Object.values(snap.val() || {}).forEach(m => {
            const div = document.createElement('div');
            div.className = `msg msg-${m.role === 'patient' ? 'p' : 'd'}`;
            div.textContent = m.text;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
    
    if (sessionListenerRef) off(sessionListenerRef);
    sessionListenerRef = ref(db, `sessions/${currentSessionId}`);
    onValue(sessionListenerRef, snap => {
        const session = snap.val();
        if (session && (session.endTime || session.status === 'COMPLETED')) {
            off(sessionListenerRef); off(chatListenerRef);
            sessionListenerRef = null; chatListenerRef = null;
            
            stopFailSafe(); stopVideoCall();
            const rx = session.prescription;
            if (rx) {
                setText('rx-doctor', `Dr. ${docName}`);
                setText('rx-date', new Date(session.endTime || Date.now()).toLocaleDateString());
                setText('prescription-content', rx);
                document.getElementById('prescription-modal')?.classList.remove('hidden');
            }
            document.getElementById('consultation-area')?.classList.add('hidden');
            currentSessionId = null; assignedDoctorId = null;
            
            const btn = document.getElementById('quick-consult-btn');
            if (btn) {
                btn.innerHTML = '<i data-lucide="stethoscope" style="width:16px;height:16px;margin-right:8px;display:inline;"></i> Consult Doctor Now'; 
                btn.style.background = ''; btn.onclick = null; lucide.createIcons();
            }
            showToast('Consultation ended. Check your prescription!', 'success');
        }
    });
}

document.getElementById('minimize-consult-btn')?.addEventListener('click', () => document.getElementById('consultation-area')?.classList.add('hidden'));
document.getElementById('find-new-doctor-btn')?.addEventListener('click', () => document.getElementById('consult-modal')?.classList.remove('hidden'));

// WebRTC
async function setupWebRTC(sid, role) {
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const placeholder = document.getElementById('video-placeholder');
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideo) { localVideo.srcObject = localStream; localVideo.muted = true; }
        pc = new RTCPeerConnection(servers);
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        pc.ontrack = e => { if (remoteVideo) { remoteVideo.srcObject = e.streams[0]; placeholder?.classList.add('hidden'); } };
        const sessionRef = ref(db, `sessions/${sid}/webrtc`);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await update(sessionRef, { offer: { sdp: offer.sdp, type: offer.type } });
        
        let candidateQueue = [];
        onValue(sessionRef, snap => {
            const data = snap.val();
            if (!pc.currentRemoteDescription && data?.answer) {
                pc.setRemoteDescription(new RTCSessionDescription(data.answer)).then(() => {
                    candidateQueue.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{}));
                    candidateQueue = [];
                }).catch(() => {});
            }
        });
        pc.onicecandidate = e => { if (e.candidate) set(push(ref(db, `sessions/${sid}/webrtc/patientCandidates`)), e.candidate.toJSON()); };
        onChildAdded(ref(db, `sessions/${sid}/webrtc/doctorCandidates`), snap => {
            const d = snap.val();
            if (d) {
                if (pc.remoteDescription) pc.addIceCandidate(new RTCIceCandidate(d)).catch(() => {});
                else candidateQueue.push(d);
            }
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
    const rv = document.getElementById('remote-video'); if (rv) rv.srcObject = null;
    const lv = document.getElementById('local-video'); if (lv) lv.srcObject = null;
}

// Chat
const chatSend = async () => {
    const input = document.getElementById('chat-input');
    const text = input?.value?.trim();
    if (!text || !currentSessionId) return;
    await set(push(ref(db, `sessions/${currentSessionId}/chat`)), { role: 'patient', text, timestamp: Date.now() });
    input.value = '';
};
document.getElementById('send-btn')?.addEventListener('click', chatSend);
document.getElementById('chat-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') chatSend(); });

// Emergency
window.flagEmergency = async () => {
    if (!currentSessionId) return;
    await update(ref(db, `sessions/${currentSessionId}`), { emergency: true });
    showToast('<i data-lucide="alert-triangle" style="width:16px;height:16px;display:inline;margin-right:8px;vertical-align:middle;"></i> Emergency flagged! Doctor has been notified.', 'warning');
};

// ─── Vitals: Real-time update ─────────────────────────────────────────────────
let vitalsDebounce = null;
const VITAL_IDS = ['v-bp', 'v-temp', 'v-sugar', 'v-spo2', 'v-pulse', 'v-heartrate'];

// Manual submit via button
document.getElementById('vitals-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    await sendVitals();
});

// Auto-send on input change (debounced 1.5s so doctor sees it near-instantly)
VITAL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        clearTimeout(vitalsDebounce);
        vitalsDebounce = setTimeout(() => sendVitals(true), 1500);
    });
});

async function sendVitals(silent = false) {
    if (!currentSessionId) {
        if (!silent) showToast('No active session.', 'warning');
        return;
    }
    const btn = document.querySelector('button[form="vitals-form"]') ||
                document.getElementById('vitals-form')?.querySelector('button[type="submit"]');

    const vitals = {
        bp:        document.getElementById('v-bp')?.value.trim() || '',
        temp:      document.getElementById('v-temp')?.value.trim() || '',
        sugar:     document.getElementById('v-sugar')?.value.trim() || '',
        spo2:      document.getElementById('v-spo2')?.value.trim() || '',
        pulse:     document.getElementById('v-pulse')?.value.trim() || '',
        heartRate: document.getElementById('v-heartrate')?.value.trim() || '',
        updatedAt: Date.now()
    };

    const hasAny = vitals.bp || vitals.temp || vitals.sugar || vitals.spo2 || vitals.pulse || vitals.heartRate;
    if (!hasAny) {
        if (!silent) showToast('Enter at least one vital.', 'warning');
        return;
    }

    if (btn && !silent) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width:16px;height:16px;margin-right:8px;display:inline;"></i> Updating…'; lucide.createIcons(); }

    try {
        await update(ref(db, `sessions/${currentSessionId}/healthData`), vitals);
        if (btn && !silent) {
            btn.innerHTML = '<i data-lucide="check-circle" style="width:16px;height:16px;margin-right:8px;display:inline;"></i> Sent to Doctor!';
            lucide.createIcons();
            btn.style.background = '#10b981';
            setTimeout(() => { btn.innerHTML = '<i data-lucide="rss" style="width:16px;height:16px;margin-right:8px;display:inline;"></i> Update Vitals'; btn.style.background = ''; btn.disabled = false; lucide.createIcons(); }, 2500);
        }
        // Visual confirmation
        const syncEl = document.getElementById('vitals-sync-status');
        if (syncEl) {
            syncEl.innerHTML = `<span style="color:#10b981">●</span> Synced ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
            syncEl.style.color = '#10b981';
            setTimeout(() => { if (syncEl) syncEl.style.color = '#94a3b8'; }, 8000);
        }
    } catch (err) {
        if (!silent) showToast('Failed: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="rss" style="width:16px;height:16px;margin-right:8px;display:inline;"></i> Update Vitals'; btn.style.background = ''; lucide.createIcons(); }
    }
}

// History
function loadPatientHistory(patientId) {
    const q = query(ref(db, 'sessions'), orderByChild('patientId'), equalTo(patientId));
    onValue(q, snap => {
        const all = snap.val() || {};
        const active = Object.entries(all).find(([sid,s]) => s.status === 'ACTIVE' && !s.endTime);
        const btn = document.getElementById('quick-consult-btn');
        if (active) {
            const [sid, session] = active;
            currentSessionId = sid; assignedDoctorId = session.doctorId;
            if (btn) {
                btn.innerHTML = '<i data-lucide="play" style="width:16px;height:16px;margin-right:8px;display:inline;"></i> Resume Consultation';
                lucide.createIcons();
                btn.style.background = '#f59e0b';
                btn.onclick = e => { e.stopImmediatePropagation(); showConsultation(session.doctorName); startFailSafe(session.doctorId); setTimeout(() => setupWebRTC(currentSessionId, 'patient'), 1200); };
            }
        } else {
            if (btn) { btn.innerHTML = '<i data-lucide="stethoscope" style="width:16px;height:16px;margin-right:8px;display:inline;"></i> Consult Doctor Now'; btn.style.background = ''; btn.onclick = null; lucide.createIcons(); }
        }
        const done = Object.entries(all).filter(([,s]) => s.endTime || s.status === 'COMPLETED').sort((a,b) => (b[1].endTime || 0) - (a[1].endTime || 0));
        renderHistory('patient-history-list', done.slice(0,3));
        renderHistory('full-history-list', done);
    });
}

function renderHistory(id, sessions) {
    const el = document.getElementById(id); if (!el) return;
    if (!sessions.length) { el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:1.5rem">No consultations yet.</p>'; return; }
    el.innerHTML = sessions.map(([sid, s]) => `
        <div class="history-card${s.emergency ? ' emergency' : ''}" onclick='showRx(${JSON.stringify(s)})' style="cursor:pointer">
            <div class="history-card-header">
                <strong>Dr. ${s.doctorName || 'Doctor'}</strong>
                <span style="font-size:0.8rem;color:#94a3b8">${s.startTime ? new Date(s.startTime).toLocaleDateString('en-IN') : ''}</span>
            </div>
            <div class="history-card-body">
                <p style="font-size:0.875rem;color:#475569">${s.symptoms || 'General Checkup'}</p>
                ${s.prescription ? '<span class="badge-success"><i data-lucide="clipboard-list" style="width:12px;height:12px;display:inline;margin-right:4px;"></i> Prescription Available</span>' : ''}
                ${s.emergency ? '<span class="badge-danger"><i data-lucide="alert-triangle" style="width:12px;height:12px;display:inline;margin-right:4px;"></i> Emergency</span>' : ''}
            </div>
        </div>
    `).join('');
}

window.showRx = session => {
    const modal = document.getElementById('prescription-modal'); if (!modal) return;
    setText('rx-doctor', `Dr. ${session.doctorName}`);
    setText('rx-date', session.endTime ? new Date(session.endTime).toLocaleDateString() : '--');
    setText('prescription-content', session.prescription || 'No prescription written.');
    modal.classList.remove('hidden');
};

document.getElementById('close-prescription-modal')?.addEventListener('click', () => document.getElementById('prescription-modal')?.classList.add('hidden'));

// Reports
async function loadPatientReports() {
    if (!currentPatient) return;
    onValue(ref(db, `users/patients/${currentPatient.uid}/reports`), snap => {
        const reports = snap.val() || {};
        renderReports('reports-list-container', Object.entries(reports));
        renderDashReports('dashboard-reports-list', Object.entries(reports).sort((a,b) => b[1].uploadedAt - a[1].uploadedAt).slice(0,3));
    });
}

function renderReports(id, entries) {
    const el = document.getElementById(id); if (!el) return;
    if (!entries.length) { el.innerHTML = '<p style="color:#94a3b8">No reports uploaded yet.</p>'; return; }
    el.innerHTML = entries.map(([rid, r]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem;border:1px solid #f1f5f9;border-radius:12px;margin-bottom:0.75rem;background:#fafafa">
            <div><strong style="font-size:0.9rem">${r.description||'Report'}</strong><p style="font-size:0.78rem;color:#94a3b8;margin:0.2rem 0 0">${new Date(r.uploadedAt).toLocaleDateString()} • ${r.fileName||''}</p></div>
            <div style="display:flex;gap:0.5rem">
                <button class="btn btn-sm btn-outline" onclick="window.open('${r.downloadURL}','_blank')">View</button>
                <button class="btn btn-sm btn-danger" onclick="delReport('${rid}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function renderDashReports(id, entries) {
    const el = document.getElementById(id); if (!el) return;
    if (!entries.length) { el.innerHTML = '<p style="color:#94a3b8;font-size:0.875rem">No recent reports.</p>'; return; }
    el.innerHTML = entries.map(([, r]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.875rem;background:#fff;border-radius:10px;border-left:4px solid #4f46e5;margin-bottom:0.625rem;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
            <div><div style="font-weight:600;font-size:0.875rem">${r.description||'Report'}</div><div style="font-size:0.75rem;color:#94a3b8">${new Date(r.uploadedAt).toLocaleDateString()}</div></div>
            <button class="btn btn-sm btn-outline" onclick="window.open('${r.downloadURL}','_blank')">View</button>
        </div>
    `).join('');
}

window.delReport = async rid => {
    if (!confirm('Delete this report?')) return;
    try {
        const snap = await get(ref(db, `users/patients/${currentPatient.uid}/reports/${rid}`));
        const r = snap.val();
        if (r?.storagePath) await deleteObject(sRef(storage, r.storagePath)).catch(() => {});
        await remove(ref(db, `users/patients/${currentPatient.uid}/reports/${rid}`));
        showToast('Report deleted.', 'success');
    } catch (err) { showToast('Delete failed: ' + err.message, 'error'); }
};

document.getElementById('upload-report-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const desc = document.getElementById('report-desc')?.value.trim();
    const file = document.getElementById('report-file')?.files[0];
    if (!file) { showToast('Please select a file.', 'warning'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('File must be under 5MB.', 'error'); return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Uploading...';
    try {
        const path = `patient-reports/${currentPatient.uid}/${Date.now()}_${file.name}`;
        const storageRef = sRef(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        await push(ref(db, `users/patients/${currentPatient.uid}/reports`), {
            description: desc, fileName: file.name, fileType: file.type, fileSize: file.size,
            downloadURL: url, storagePath: path, uploadedAt: Date.now(), patientId: currentPatient.uid
        });
        showToast('<i data-lucide="check-circle" style="width:16px;height:16px;display:inline;margin-right:8px;vertical-align:middle;"></i> Report uploaded successfully!', 'success');
        e.target.reset();
        switchView('reports');
    } catch (err) { showToast('Upload failed: ' + err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Upload Report'; }
});

function startFailSafe(docId) {
    if (failSafeTimer) clearInterval(failSafeTimer);
    failSafeTimer = setInterval(() => {
        if (currentSessionId) {
            get(ref(db, `users/doctors/${docId}`)).then(snap => {
                const d = snap.val();
                const notice = document.getElementById('doctor-disconnect-notice');
                if (notice) notice.classList.toggle('hidden', !!(d && (Date.now() - (d.lastActiveTime||0)) < 30000));
            });
        }
    }, 15000);
}
function stopFailSafe() { if (failSafeTimer) clearInterval(failSafeTimer); }

function showToast(msg, type='success') {
    let t = document.getElementById('p-toast');
    if (!t) { t = document.createElement('div'); t.id = 'p-toast'; t.style.cssText = 'position:fixed;bottom:2rem;right:2rem;padding:0.875rem 1.5rem;border-radius:12px;font-weight:600;font-size:0.875rem;z-index:9999;max-width:360px;transform:translateY(100px);opacity:0;transition:all 0.3s;box-shadow:0 8px 24px rgba(0,0,0,0.15)'; document.body.appendChild(t); }
    t.innerHTML = msg;
    lucide.createIcons();
    t.style.background = type==='error'?'#fee2e2':type==='warning'?'#fef3c7':'#d1fae5';
    t.style.color = type==='error'?'#991b1b':type==='warning'?'#92400e':'#065f46';
    setTimeout(() => { t.style.transform='translateY(0)'; t.style.opacity='1'; }, 10);
    setTimeout(() => { t.style.transform='translateY(100px)'; t.style.opacity='0'; }, 4000);
}

checkAuth('patient');
