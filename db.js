// db.js — Firestore CRUD 공통 함수

import { db } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, query, where, getDocs, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ══════════════════════════════
// 국가 설정
// ══════════════════════════════

// 국가 설정 불러오기
export async function getNationConfig() {
  const snap = await getDoc(doc(db, "config", "nation"));
  return snap.exists() ? snap.data() : null;
}

// 국가 설정 저장
export async function setNationConfig(data) {
  await setDoc(doc(db, "config", "nation"), data, { merge: true });
}

// ══════════════════════════════
// 학생(유저) 관련
// ══════════════════════════════

// 이름으로 학생 조회
export async function getStudentByName(name) {
  const snap = await getDoc(doc(db, "students", name));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// 전체 학생 목록
export async function getAllStudents() {
  const snap = await getDocs(collection(db, "students"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 학생 등록 (국민되기)
export async function registerStudent(name, password) {
  const existing = await getStudentByName(name);
  if (existing) throw new Error("이미 등록된 이름이에요");
  await setDoc(doc(db, "students", name), {
    name,
    password,
    role: "국민",         // 기본 역할
    balance: 0,           // 초기 잔액 (담임이 초기자금 지급)
    couponCount: 0,
    createdAt: serverTimestamp(),
  });
}

// 비밀번호 변경 (마스터용)
export async function changePassword(name, newPassword) {
  await updateDoc(doc(db, "students", name), { password: newPassword });
}

// 역할 변경 (마스터용)
export async function changeRole(name, role) {
  await updateDoc(doc(db, "students", name), { role });
}

// ══════════════════════════════
// 거래(가상화폐) 관련
// ══════════════════════════════

// 거래 기록 추가 + 잔액 업데이트
export async function addTransaction(name, amount, type, memo, by) {
  // 1. 거래 기록
  await addDoc(collection(db, "transactions"), {
    name,
    amount,       // 양수: 지급 / 음수: 차감
    type,         // "주급" | "세금" | "칭찬쿠폰" | "매점" | "벌금" | "이벤트" | "기타"
    memo,
    by,           // 처리한 사람 (담임, 은행원 등)
    createdAt: serverTimestamp(),
  });
  // 2. 잔액 업데이트
  const student = await getStudentByName(name);
  if (!student) throw new Error("학생을 찾을 수 없어요");
  const newBalance = (student.balance || 0) + amount;
  await updateDoc(doc(db, "students", name), { balance: newBalance });
}

// 학생 최근 거래 내역 (최대 10건)
export async function getTransactions(name) {
  const q = query(
    collection(db, "transactions"),
    where("name", "==", name),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ══════════════════════════════
// 공지 관련
// ══════════════════════════════

// 전체 공지 목록
export async function getNotices() {
  const q = query(collection(db, "notices"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 공지 등록
export async function addNotice(title, content, by) {
  await addDoc(collection(db, "notices"), {
    title, content, by,
    confirmedBy: [],   // 확인한 학생 이름 목록
    createdAt: serverTimestamp(),
  });
}

// 공지 확인 처리
export async function confirmNotice(noticeId, studentName) {
  const ref = doc(db, "notices", noticeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const confirmed = data.confirmedBy || [];
  if (!confirmed.includes(studentName)) {
    await updateDoc(ref, { confirmedBy: [...confirmed, studentName] });
  }
}

// ══════════════════════════════
// 신고 관련
// ══════════════════════════════

// 신고 접수
export async function addReport(reporterName, type, content) {
  await addDoc(collection(db, "reports"), {
    reporterName,   // 마스터만 볼 수 있음
    type,
    content,
    status: "접수됨",  // "접수됨" | "조사중" | "처리완료"
    result: "",
    fine: 0,
    createdAt: serverTimestamp(),
  });
}

// 전체 신고 목록 (마스터용 — 신고자 포함)
export async function getAllReports() {
  const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 공개용 신고 목록 (신고자 이름 제외)
export async function getPublicReports() {
  const reports = await getAllReports();
  return reports.map(r => ({
    id: r.id, type: r.type, content: r.content,
    status: r.status, result: r.result, createdAt: r.createdAt
  }));
}

// 신고 상태 업데이트
export async function updateReport(reportId, status, result, fine) {
  await updateDoc(doc(db, "reports", reportId), { status, result, fine });
}

// ══════════════════════════════
// 고지서(벌금) 관련
// ══════════════════════════════

// 고지서 발행
export async function issueFine(targetName, amount, reason, by) {
  await addDoc(collection(db, "fines"), {
    targetName,
    amount,
    reason,
    by,
    paid: false,
    createdAt: serverTimestamp(),
  });
}

// 학생 고지서 목록
export async function getFines(name) {
  const q = query(
    collection(db, "fines"),
    where("targetName", "==", name),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 고지서 납부 처리
export async function payFine(fineId, studentName, amount, by) {
  await updateDoc(doc(db, "fines", fineId), { paid: true });
  await addTransaction(studentName, -amount, "벌금", "벌금 납부", by);
}
