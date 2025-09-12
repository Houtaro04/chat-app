// firebase/config.js

import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";

// ⚠️ PHẢI gọi initializeApp trước khi gọi auth/firestore
const firebaseConfig = {
  apiKey: "AIzaSyAYxzFzVTiRUhPgIBMpkTVCe_X0TdfxAaw",
  authDomain: "chat-app-cd74f.firebaseapp.com",
  projectId: "chat-app-cd74f",
  storageBucket: "chat-app-cd74f.appspot.com", // đã sửa đúng
  messagingSenderId: "410811812403",
  appId: "1:410811812403:web:26ff24050e9e7b5ac1f146",
  measurementId: "G-FKF7KXKEQY"
};

// ⚠️ Dòng này rất quan trọng, KHÔNG ĐƯỢC THIẾU
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

auth.useEmulator('http://localhost:9099');
if(window.location.hostname === 'localhost') {
  db.useEmulator('localhost', '8080');
}

export { auth, db, firebase };