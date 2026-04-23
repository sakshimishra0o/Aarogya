// Firebase Configuration & Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyBc_6EVKN3h3PojI8Fv7aHyyKCqnp08vdY",
    authDomain: "aaro-7786a.firebaseapp.com",
    databaseURL: "https://aaro-7786a-default-rtdb.firebaseio.com",
    projectId: "aaro-7786a",
    storageBucket: "aaro-7786a.firebasestorage.app",
    messagingSenderId: "641143458909",
    appId: "1:641143458909:web:2d05fc159480fd1ed591b4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app, firebaseConfig.databaseURL);
const storage = getStorage(app);

export { auth, db, storage };