# 🌤 SkyWatcher

> **실시간 날씨 분석 기반 국내 여행지 추천 및 경로 최적화 서비스**

**Live Demo** → [sky-watcher-kappa.vercel.app](https://sky-watcher-kappa.vercel.app)

<br>

---

## 📖 소개

SkyWatcher는 사용자의 위치 또는 목적지의 실시간 기상 상태를 분석해 **최적의 여행 동선을 자동으로 제안하는 지능형 여행 플래너**입니다.

단순 날씨 정보 제공을 넘어, OpenWeatherMap Weather ID를 파싱해 기상 상태별로 콘텐츠 카테고리에 가중치를 부여하고 동적으로 큐레이션합니다. 선택한 장소들은 **Nearest Neighbor 그리디 알고리즘**으로 최단 방문 순서로 정렬되며, 차량·도보 이동시간을 병렬로 계산해 상세 타임라인을 제공합니다.

|           |                                      |
| --------- | ------------------------------------ |
| 개발 기간 | 2026.04                              |
| 참여 인원 | 1인 (개인 프로젝트)                  |
| 배포 주소 | https://sky-watcher-kappa.vercel.app |

<br>

---

## 🛠 기술 스택

| 구분         | 기술                                                      |
| ------------ | --------------------------------------------------------- |
| **Frontend** | Vanilla JS, jQuery, HTML5, CSS3                           |
| **Backend**  | Node.js, Express                                          |
| **Database** | Firebase Firestore, Firebase Auth                         |
| **Maps**     | Leaflet.js, OpenStreetMap                                 |
| **외부 API** | OpenWeatherMap, 한국관광공사 TourAPI v2, OpenRouteService |
| **배포**     | Vercel (프론트), Render (백엔드)                          |

> **프레임워크 없이 Vanilla JS를 선택한 이유** — 빌드 도구 없는 정적 배포 환경에서 CDN 스크립트만으로 구동하기 위해. 모든 DOM 조작과 상태 관리를 직접 구현하며 JS 기본기를 확인하는 목적도 있었습니다.

<br>

---

## ⚙️ 세팅 및 실행

### 환경 변수 (`.env`)

```bash
ORS_KEY=          # OpenRouteService API Key
WEATHER_KEY=      # OpenWeatherMap API Key
TOUR_KEY=         # 한국관광공사 TourAPI 인증키
PORT=4000
```

### Firebase 설정

```bash
# firebase.config.example.js → firebase.config.js 복사 후 값 입력
cp firebase.config.example.js firebase.config.js
```

```js
// firebase.config.js (window 전역 주입 방식 — .gitignore 처리)
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  ...
};
```

### 로컬 실행

```bash
npm install
node node.js        # 백엔드 프록시 서버 :4000 실행

# app.js 상단 PROXY_BASE 로컬로 변경
# const PROXY_BASE = "http://localhost:4000";
```

<br>

---

## ✨ 주요 기능

### 1. 3-Way 검색

- **도시 검색** — 지역 탭(수도권/강원/충청/전라/경상/제주) + 직접 입력
- **내 위치** — Geolocation API로 GPS 좌표 취득 후 반경(1~10km) 기반 조회
- **키워드** — "카페", "한옥", "야경" 등 프리셋 태그 또는 직접 입력

### 2. 날씨 동적 큐레이션

날씨 ID → 기상 타입 → 카테고리 가중치 순으로 처리합니다.

| 기상 타입 | 우선 추천 카테고리 |
| --------- | ------------------ |
| sunny     | 레포츠 → 관광지    |
| rainy     | 문화시설 → 숙박    |
| storm     | 숙박 → 쇼핑        |
| cold      | 음식점 → 문화시설  |

### 3. 경로 최적화 및 타임라인

- Nearest Neighbor 알고리즘으로 방문 순서 자동 정렬
- 차량/도보 이동시간 실시간 계산 (ORS API)
- 출발 시간 입력 시 예상 타임라인 자동 생성

### 4. 장소 상세 정보

- 운영시간, 휴무일, 주차, 행사기간 (TourAPI `detailIntro2` 연동)
- 장소 클릭 시 비동기 로드, 캐싱으로 재호출 방지

### 5. 경로 저장 / 공유

- Firebase Auth Google 로그인 후 Firestore에 경로 저장
- URL 파라미터(`?route=encoded`)로 비로그인 공유

<br>

---

## 🔑 주요 로직

### 날씨 기반 관광지 스코어링

```js
const WEATHER_CT_PREF = {
  sunny: ["28", "12"], // 레포츠, 관광지
  rainy: ["14", "32"], // 문화시설, 숙박
  storm: ["32", "38"], // 숙박, 쇼핑
  cold: ["39", "14"], // 음식점, 문화시설
  cloudy: ["12", "14"],
};

function getWeatherScore(p, wt) {
  const pr = WEATHER_CT_PREF[wt] || [];
  const ct = String(p.contenttypeid || "12");
  return pr[0] === ct ? 2 : pr[1] === ct ? 1.5 : 0;
}

function sortByWeather(places, wt) {
  return [...places].sort(
    (a, b) => getWeatherScore(b, wt) - getWeatherScore(a, wt),
  );
}
```

### Nearest Neighbor 경로 최적화

```js
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function optimizeRoute(places) {
  if (places.length <= 2) return [...places];
  const rem = [...places];
  const route = [rem.shift()];
  while (rem.length) {
    const last = route[route.length - 1];
    let bi = 0,
      bd = Infinity;
    rem.forEach((p, i) => {
      const d = haversine(+last.mapy, +last.mapx, +p.mapy, +p.mapx);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    route.push(rem.splice(bi, 1)[0]);
  }
  return route;
}
```

### 차량·도보 이동시간 병렬 계산

```js
async function fetchBothTravelTimes(stops) {
  // ORS API를 차량/도보 동시 호출
  const [driving, walking] = await Promise.all([
    fetchOsrm(stops, "driving"),
    fetchOsrm(stops, "walking"),
  ]);
  travelCache.driving.legs = driving.legs;
  travelCache.walking.legs = walking.legs;
  travelCache.driving.total = driving.legs.reduce((a, b) => a + b, 0);
  travelCache.walking.total = walking.legs.reduce((a, b) => a + b, 0);
}

// ORS API 실패 시 Haversine 기반 추정치 Fallback
function estimateMinutes(stops, i, profile) {
  const km = haversine(
    +stops[i].mapy,
    +stops[i].mapx,
    +stops[i + 1].mapy,
    +stops[i + 1].mapx,
  );
  return profile === "walking"
    ? Math.max(1, Math.round(((km * 1.4) / 4) * 60)) // 도보 현실 보정 1.4배
    : Math.max(1, Math.round((km / 19) * 60)); // 차량 평균 19km/h
}
```

### 날씨 + 관광지 병렬 페치

```js
// 검색 시 날씨 API와 관광지 API를 동시에 호출해 대기시간 최소화
const [wData, places] = await Promise.all([
  fetchWeatherByCity(city),
  apiLocationWithFestival(currentLat, currentLng, currentRadius),
]);
```

### 현재 진행 중인 축제만 필터링

```js
// 서버: 90일 전부터 조회 (진행 중 행사 포함)
const d = new Date();
d.setDate(d.getDate() - 90);
const since = d.toISOString().slice(0, 10).replace(/-/g, "");
qs += `&eventStartDate=${since}`;

// 클라이언트: 오늘 기준 종료된 행사 제외
const endDate = toDate(p.eventenddate);
if (endDate && endDate < today) return false; // 이미 종료
const startDate = toDate(p.eventstartdate);
if (startDate && startDate > today) return false; // 아직 시작 전
```

<br>

---

## 🐛 문제 → 해결

### 문제 1. Firebase 로그인 안 됨

**원인** — `firebase.config.js`를 ES Module로 import하면 브라우저가 `type="module"` 스크립트를 defer 처리합니다. `firebase.js`가 로드될 시점에 `firebaseConfig` 변수가 아직 undefined 상태여서 `initializeApp(undefined)` 가 호출되어 인증 전체가 깨졌습니다.

**해결** — config 파일을 ES Module이 아닌 일반 `<script>`로 로드해 `window.FIREBASE_CONFIG`에 주입하고, `firebase.js`(모듈)에서 `window.FIREBASE_CONFIG`를 참조하도록 변경했습니다.

```html
<!-- 순서 보장: config 먼저, module 나중 -->
<script src="firebase.config.js"></script>
<!-- window.FIREBASE_CONFIG 주입 -->
<script type="module" src="firebase.js"></script>
<!-- window.FIREBASE_CONFIG 참조 -->
```

```js
// firebase.js
const firebaseConfig = window.FIREBASE_CONFIG;
if (!firebaseConfig) throw new Error("firebase.config.js를 먼저 설정하세요.");
const app = initializeApp(firebaseConfig);
```

---

### 문제 2. 지역 탭·필터 탭 클릭 시 컨텐츠 전체가 사라짐

**원인** — `showLoading()` 함수가 `$("#main-content").addClass("hidden")`을 호출하는데, 기존 `#loading` div가 HTML에 존재하지 않아 로딩 인디케이터는 안 뜨고 컨텐츠만 사라지는 구조였습니다.

**해결** — `showLoading()`에서 `#main-content`를 숨기는 로직을 완전히 제거하고, 기존 `#grid-loading-overlay` 중앙 스피너만 표시하도록 변경했습니다.

```js
// Before
function showLoading(msg) {
  $("#loading").removeClass("hidden");
  $("#main-content").addClass("hidden"); // ← 컨텐츠를 숨겨버림
}

// After
function showLoading(msg) {
  $("#spinner-label").text(msg);
  $("#grid-loading-overlay").addClass("active"); // 오버레이만
}
```

---

### 문제 3. 축제 탭에 종료된 행사 노출 / 현재 행사가 안 뜸

**원인** — 서버에서 `eventStartDate=오늘`로 TourAPI를 호출하면 API 스펙상 "오늘 시작하는 행사"부터 반환합니다. 이미 3주 전부터 진행 중인 축제는 포함되지 않았습니다.

**해결** — 서버에서 90일 전 날짜로 요청 범위를 확대하고, 클라이언트에서 `eventenddate` 기준으로 종료된 항목을 필터링했습니다.

```js
// node.js — 서버
const d = new Date();
d.setDate(d.getDate() - 90); // 90일 전부터 조회
const since = d.toISOString().slice(0, 10).replace(/-/g, "");
qs += `&eventStartDate=${since}&numOfRows=60`;
```

---

### 문제 4. 초기 화면 깨짐 (빈 대시 + 에러 메시지)

**원인** — `$(document).ready()` 시점에 `showWeatherUnavailable()`을 즉시 호출해 빈 UI를 보여주고 백그라운드 fetch를 시작했는데, Render 서버 Cold Start(최대 30초) 동안 사용자에게 깨진 화면이 그대로 노출됐습니다.

**해결** — 초기 로딩 시점에 `showLoading()` 스피너를 먼저 표시하고 데이터 fetch 완료 후 `hideLoading()`으로 전환했습니다.

```js
// Before
showWeatherUnavailable(); // 깨진 UI 즉시 노출
showSkeletonGrid(6);
// ... async fetch

// After
showLoading("🌤 서울 날씨 & 관광지 불러오는 중...");
showSkeletonGrid(6);
(async () => {
  try {
    const [wData, places] = await Promise.all([...]);
    // 렌더링
    hideLoading(); // 완료 후 스피너 제거
  } catch (e) {
    hideLoading();
    showWeatherUnavailable(); // 실패 시에만 빈 UI
  }
})();
```

<br>

---

## 🔧 개선 사항

### 1. 운영정보 캐싱으로 API 중복 호출 제거

장소 클릭 → 모달 → `detailIntro2` API를 매번 호출하는 구조에서, `Map` 객체로 캐싱해 동일 장소는 재호출하지 않도록 개선했습니다.

```js
const _introCache = new Map();

async function fetchPlaceIntro(contentId, contentTypeId) {
  const key = String(contentId);
  if (_introCache.has(key)) return _introCache.get(key); // 캐시 히트

  const info = await fetchFromAPI(contentId, contentTypeId);
  _introCache.set(key, info); // 저장
  return info;
}
```

### 2. API Key 보안 아키텍처

모든 외부 API 호출을 Express 프록시 서버로 은닉하고, Google Cloud Console에서 HTTP Referrer 제한을 추가해 2중으로 보호했습니다.

```
Browser → Express Proxy (Render) → OpenWeatherMap / TourAPI / ORS
                                  ↑ API Key는 서버 환경변수에만 존재
```

허용 Referrer 목록:

| 도메인                                   | 용도                           |
| ---------------------------------------- | ------------------------------ |
| `https://sky-watcher-kappa.vercel.app/*` | 운영 프론트                    |
| `https://skywatcher-akqa.onrender.com/*` | 백엔드 프록시                  |
| `https://skywa-1c045.firebaseapp.com/*`  | Firebase Auth 내부 통신 (필수) |
| `http://localhost:*`                     | 로컬 개발                      |

### 3. Firebase Config 키 분리

`firebase.config.js`를 `.gitignore`에 추가해 실제 키가 Git 히스토리에 남지 않도록 구조화하고, `firebase.config.example.js`를 템플릿으로 제공해 팀 협업 시에도 설정이 명확합니다.

<br>

---

## 🚨 트러블슈팅

### `FB_API_KEY_PLACEHOLDER` 400 Error

**증상** — 배포 후 Firebase 인증 요청 시 `400 Bad Request`, 응답에 `FB_API_KEY_PLACEHOLDER` 문자열이 포함됨.

**원인** — Render 빌드 캐시에 이전 빌드 아티팩트가 남아있어 환경 변수 치환이 되지 않은 상태로 서비스됨.

**해결 순서**:

1. Render 대시보드 → `Clear build cache & deploy` 실행
2. Mac 브라우저 `Cmd + Shift + R` 강제 새로고침으로 캐시 제거
3. Firebase Console → Authentication → Authorized Domains에 Vercel 도메인 등록 확인

> **핵심 교훈** — 에러 메시지에 `PLACEHOLDER`가 보이면 서버에 구 버전 코드가 살아있다는 물리적 증거입니다. 코드보다 배포 상태를 먼저 의심하세요.

---

### Render Cold Start 지연 (첫 요청 30초)

**증상** — 배포 후 첫 검색 시 30초 이상 응답 없음.

**원인** — Render 무료 플랜은 15분 비활성 후 인스턴스를 슬립 상태로 전환.

**해결** — 앱 초기화 시 `/ping` 엔드포인트로 미리 웜업 요청을 보내 슬립 상태를 깨웁니다.

```js
// app.js — 초기화 시 병렬로 웜업
fetch(`${PROXY_BASE}/ping`)
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => {});
```

```js
// node.js — 핑 엔드포인트
app.get("/ping", (_, res) => res.json({ ok: true }));
```

---

### 이미지 Mixed Content 경고

**증상** — TourAPI 이미지 로드 실패, 콘솔에 `Mixed Content` 경고.

**원인** — TourAPI가 `http://` 프로토콜 이미지 URL을 반환.

**해결** — 렌더링 직전 정규표현식으로 강제 전환:

```js
const toHttps = (url) => (url ? url.replace(/^http:\/\//, "https://") : null);
const imgSrc = toHttps(p.firstimage) || toHttps(p.firstimage2) || fallbackImg;
```
