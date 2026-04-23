// Firebase Configuration & Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyB5PsgVUGeHAyXjzuU7Yqw9QhN8wY0ssIA",
    authDomain: "aarogya-281e3.firebaseapp.com",
    databaseURL: "https://aarogya-281e3-default-rtdb.firebaseio.com",
    projectId: "aarogya-281e3",
    storageBucket: "aarogya-281e3.firebasestorage.app",
    messagingSenderId: "676098023928",
    appId: "1:676098023928:web:dbd4fd613973dee526b60d",
    measurementId: "G-X5CQZMRXMJ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app, firebaseConfig.databaseURL);
const storage = getStorage(app);

export { auth, db, storage };
