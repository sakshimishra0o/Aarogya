// Aarogya Auth System - Fixed & Secured
import { auth, db } from './firebase.js';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const MASTER_ADMIN_EMAIL = 'AarogyaCloud@gmail.com';

async function getUserRole(uid) {
    const user = auth.currentUser;
    if (user && (user.email === MASTER_ADMIN_EMAIL || uid === 'oGTYVxmnH1Vsk0h4jee7lSUia183')) {
        return { role: 'admin', data: { name: 'Master Admin', email: user.email, approved: true } };
    }
    try {
        const adminSnap = await get(ref(db, `users/admins/${uid}`));
        if (adminSnap.exists()) return { role: 'admin', data: adminSnap.val() };

        const doctorSnap = await get(ref(db, `users/doctors/${uid}`));
        if (doctorSnap.exists()) return { role: 'doctor', data: doctorSnap.val() };

        const patientSnap = await get(ref(db, `users/patients/${uid}`));
        if (patientSnap.exists()) return { role: 'patient', data: patientSnap.val() };
    } catch (e) {
        console.error('Role fetch error:', e);
    }
    return { role: null, data: null };
}

export function checkAuth(requiredRole) {
    const authContainer = document.getElementById('auth-container');
    const mainPanel = document.getElementById('main-panel');

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            authContainer?.classList.remove('hidden');
            mainPanel?.classList.add('hidden');
            return;
        }
        try {
            const { role, data } = await getUserRole(user.uid);
            if (!role || role !== requiredRole) {
                authContainer?.classList.remove('hidden');
                mainPanel?.classList.add('hidden');
                return;
            }
            if (data?.blocked === true) {
                showAuthError('Your account has been blocked. Contact administrator.');
                authContainer?.classList.remove('hidden');
                mainPanel?.classList.add('hidden');
                return;
            }
            if (role === 'doctor' && data?.approved !== true) {
                showAuthError('Your account is pending admin approval.');
                authContainer?.classList.remove('hidden');
                mainPanel?.classList.add('hidden');
                return;
            }
            authContainer?.classList.add('hidden');
            mainPanel?.classList.remove('hidden');
            window.dispatchEvent(new CustomEvent('auth-success', { detail: { ...user, uid: user.uid, email: user.email } }));
        } catch (error) {
            console.error('Auth check error:', error);
            authContainer?.classList.remove('hidden');
            mainPanel?.classList.add('hidden');
        }
    });
}

function showAuthError(msg) {
    let el = document.getElementById('auth-error-msg');
    if (!el) {
        el = document.createElement('div');
        el.id = 'auth-error-msg';
        el.style.cssText = 'background:#fee2e2;color:#dc2626;padding:0.75rem;border-radius:8px;margin-top:1rem;font-size:0.9rem;';
        document.getElementById('auth-container')?.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
}

export async function login(email, password, requiredRole) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        let { role, data } = await getUserRole(user.uid);

        if (!role && (email === MASTER_ADMIN_EMAIL || user.uid === 'oGTYVxmnH1Vsk0h4jee7lSUia183')) {
            role = 'admin';
            data = { name: 'Master Admin', email, approved: true };
        }
        if (!role) throw new Error('Account not found in system. Please register or contact admin.');
        if (role !== requiredRole) throw new Error(`This is the ${requiredRole} portal. Your role is: ${role}.`);
        if (data?.blocked) throw new Error('Your account has been blocked by administrator.');
        if (role === 'doctor' && !data?.approved) throw new Error('Your account is pending admin approval.');
        return user;
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            throw new Error('Invalid email or password.');
        }
        if (error.code === 'auth/invalid-email') throw new Error('Invalid email format.');
        if (error.code === 'auth/too-many-requests') throw new Error('Too many attempts. Try again later.');
        throw error;
    }
}

export async function registerPatient(name, email, password, extraData = {}) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await set(ref(db, `users/patients/${user.uid}`), {
            name, email, role: 'patient', blocked: false, createdAt: Date.now(), ...extraData
        });
        return user;
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') throw new Error('Email already registered. Please login.');
        if (error.code === 'auth/weak-password') throw new Error('Password must be at least 6 characters.');
        if (error.code === 'auth/invalid-email') throw new Error('Invalid email format.');
        throw error;
    }
}

export async function logout() {
    try { await signOut(auth); } catch (e) {}
    window.location.href = 'index.html';
}

export async function getCurrentUserRole() {
    const user = auth.currentUser;
    if (!user) return null;
    const { role } = await getUserRole(user.uid);
    return role;
}

export function getCurrentUser() { return auth.currentUser; }
