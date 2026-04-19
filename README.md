# 🏥 Aarogya

**Aarogya** is a real-time medical consultation platform that connects patients with doctors instantly — securely, reliably, and from anywhere.

---

## 🚀 Features

- 🔐 **Secure Authentication** — Firebase Auth for patients, doctors & admins
- 💬 **Real-Time Consultation** — Live doctor-patient sessions using Firebase Realtime Database
- 📋 **Patient Portal** — Book consultations, view medical records & prescriptions
- 🩺 **Doctor Portal** — Manage patients, write prescriptions, go online/offline
- 🛡️ **Admin Dashboard** — Monitor live sessions, manage doctors, view system stats
- 📱 **Mobile Ready** — Fully responsive design for all screen sizes

---

## 🖥️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Backend | Firebase Realtime Database |
| Auth | Firebase Authentication |
| Storage | Firebase Storage |
| Hosting | GitHub Pages / Firebase Hosting |

---

## 📁 Project Structure

```
Aarogya/
├── index.html          # Landing page (Portal selector)
├── patient.html        # Patient portal
├── doctor.html         # Doctor portal
├── admin.html          # Admin dashboard
├── setup-admin.html    # One-click admin account setup
├── style.css           # Main stylesheet
├── icons.css           # SVG icon utilities
├── scripts/
│   ├── firebase.js     # Firebase config & initialization
│   ├── auth.js         # Authentication logic
│   ├── patient.js      # Patient portal logic
│   ├── doctor.js       # Doctor portal logic
│   └── admin.js        # Admin dashboard logic
└── database.rules.json # Firebase security rules
```

---

## ⚡ Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/sakshimishra0o/Aarogya.git
cd Aarogya
```

### 2. Setup Admin Account

Open `setup-admin.html` in your browser and click **"Setup Admin Account"** to create the default admin credentials.

### 3. Open the app

Simply open `index.html` in any modern browser — no build step required!

---

## 👤 Portals

| Portal | URL | Access |
|--------|-----|--------|
| Landing Page | `index.html` | Public |
| Patient Portal | `patient.html` | Registered Patients |
| Doctor Portal | `doctor.html` | Registered Doctors |
| Admin Panel | `admin.html` | Admin only |

---

## 🔥 Firebase Setup

1. Create a project on [Firebase Console](https://console.firebase.google.com/)
2. Enable **Authentication** (Email/Password)
3. Enable **Realtime Database**
4. Copy your config into `scripts/firebase.js`
5. Import `database.rules.json` into your Realtime Database rules

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

---

## 📄 License

MIT © 2026 Aarogya
