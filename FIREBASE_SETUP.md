# Firebase 설정 가이드

## 1. Firebase 프로젝트 생성
1. [Firebase Console](https://console.firebase.google.com) 접속
2. "프로젝트 추가" → 프로젝트명 입력
3. Google 애널리틱스 선택 후 생성

## 2. 웹 앱 등록
1. 프로젝트 홈 → "앱 추가" → 웹 아이콘(`</>`)
2. 앱 닉네임 입력 후 등록
3. **SDK 구성 복사** (firebaseConfig 객체 전체)

## 3. firebase.js 수정
`firebase.js`의 `firebaseConfig`를 복사한 값으로 교체:

```js
const firebaseConfig = {
  apiKey: "실제-API-키",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456",
};
```

## 4. Authentication 설정
Firebase Console → Authentication → 시작하기
→ 로그인 방법 → Google → 사용 설정

## 5. Firestore 설정
Firebase Console → Firestore Database → 데이터베이스 만들기
→ 테스트 모드로 시작 (개발용)

### 보안 규칙 (프로덕션용)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /routes/{routeId} {
      allow read: if true;  // 공개 경로 읽기 허용
      allow create: if request.auth != null;  // 로그인 유저만 생성
      allow update, delete: if request.auth.uid == resource.data.uid;  // 본인만 수정/삭제
    }
  }
}
```

## 6. Authorized Domains 설정
Firebase Console → Authentication → Settings → Authorized domains
→ 본인 도메인 추가 (Render 배포 URL 등)

---
Firebase 없이도 기본 기능(날씨·관광지·경로)은 정상 동작하며,
URL 인코딩 방식의 경로 공유도 로그인 없이 가능합니다.
