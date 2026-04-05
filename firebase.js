/**
 * SKYWATCHER — firebase.js
 * Firebase Auth + Firestore (CDN ESM)
 *
 * 🔑 Firebase 키는 firebase.config.js 에서 관리합니다 (window.FIREBASE_CONFIG).
 *    firebase.config.example.js 를 복사 → firebase.config.js 생성 후 값 입력
 *    firebase.config.js 는 .gitignore 에 포함 — Git에 커밋되지 않습니다.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";

const firebaseConfig = window.FIREBASE_CONFIG;
if (!firebaseConfig) throw new Error("firebase.config.js 를 먼저 설정하세요.");
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ─── Auth 상태 전달 ─── */
onAuthStateChanged(auth, (user) => {
  window._swUser = user || null;
  window.dispatchEvent(new CustomEvent("sw:authchange", { detail: user }));
});

/* ─── 전역 노출 ─── */
window.swAuth = {
  /* Google 로그인 */
  loginGoogle: () => signInWithPopup(auth, new GoogleAuthProvider()),

  /* 로그아웃 */
  logout: () => signOut(auth),

  /* 경로 저장 */
  saveRoute: async (routeData) => {
    if (!window._swUser) throw new Error("로그인 필요");
    const ref = await addDoc(collection(db, "routes"), {
      uid: window._swUser.uid,
      userName: window._swUser.displayName || "익명",
      userPhoto: window._swUser.photoURL || "",
      createdAt: serverTimestamp(),
      ...routeData,
    });
    return ref.id;
  },

  /* 내 경로 목록 */
  myRoutes: async () => {
    if (!window._swUser) return [];
    const q = query(
      collection(db, "routes"),
      where("uid", "==", window._swUser.uid),
    );
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // 클라이언트에서 최신순 정렬 (복합 인덱스 불필요)
    docs.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
    return docs;
  },

  /* 공개 경로 단건 조회 */
  getRoute: async (id) => {
    const snap = await getDoc(doc(db, "routes", id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  },

  /* 경로 삭제 */
  deleteRoute: async (id) => {
    await deleteDoc(doc(db, "routes", id));
  },
};
