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

> ⚠️ **로컬 실행은 지원하지 않습니다.**
> `app.js`의 `PROXY_BASE`가 배포된 Render 서버 주소로 고정되어 있으며, 해당 서버는 등록된 도메인에서만 요청을 허용합니다. `localhost`는 허용 도메인에서 제외되어 있어 API 호출이 차단됩니다.
> 실제 동작은 배포 URL([sky-watcher-kappa.vercel.app](https://sky-watcher-kappa.vercel.app))에서 확인하세요.

<br>

### 환경 변수 (`.env`) — Render 백엔드 서버용

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

<br>

---

## ☁️ 배포 구성

### 프론트엔드 — Vercel

`index.html`, `app.js`, `style.css`, `firebase.js` 등 정적 파일을 Vercel에 배포합니다.
빌드 도구 없이 정적 파일 그대로 서빙되며, `firebase.config.js`는 `.gitignore`로 Git에서 제외합니다.

### 백엔드 — Render

`node.js` Express 서버를 Render에 배포합니다.

**배포 설정:**

| 항목          | 값                                           |
| ------------- | -------------------------------------------- |
| Build Command | `npm install`                                |
| Start Command | `npm start` (`node node.js`)                 |
| 환경 변수     | `ORS_KEY`, `WEATHER_KEY`, `TOUR_KEY`, `PORT` |

**백엔드 역할:**

- 외부 API Key를 서버 환경변수에만 보관하여 브라우저에 노출되지 않도록 중계
- CORS 헤더(`Access-Control-Allow-Origin: *`) 설정으로 Vercel 프론트에서의 크로스 도메인 요청 허용
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` 헤더로 Firebase Google 로그인 팝업 정상 동작 보장

**엔드포인트 목록:**

| 엔드포인트              | 메서드 | 연결 API         | 설명                              |
| ----------------------- | ------ | ---------------- | --------------------------------- |
| `/route`                | POST   | OpenRouteService | 차량/도보 경로 및 이동시간 계산   |
| `/api/weather/coords`   | GET    | OpenWeatherMap   | 좌표 기반 현재 날씨               |
| `/api/weather/city`     | GET    | OpenWeatherMap   | 도시명 기반 현재 날씨             |
| `/api/weather/forecast` | GET    | OpenWeatherMap   | 5일 예보                          |
| `/api/tour/location`    | GET    | TourAPI          | 위치 기반 관광지 조회             |
| `/api/tour/keyword`     | GET    | TourAPI          | 키워드 검색                       |
| `/api/tour/festival`    | GET    | TourAPI          | 현재 진행 중인 축제 조회          |
| `/api/tour/detail`      | GET    | TourAPI          | 장소 상세 개요                    |
| `/api/tour/intro`       | GET    | TourAPI          | 운영시간/휴무일                   |
| `/ping`                 | GET    | —                | 서버 상태 확인 및 Cold Start 웜업 |

> **Render 무료 플랜 Cold Start:** 15분 비활성 시 인스턴스가 슬립 상태로 전환됩니다. 앱 초기화 시 `/ping`으로 미리 웜업 요청을 보내 첫 검색 지연을 최소화합니다.

### Firebase 설정

**Authentication:**

1. Firebase Console → Authentication → 로그인 방법 → Google 사용 설정
2. Authorized Domains에 아래 도메인 추가

| 도메인                                 | 용도                           |
| -------------------------------------- | ------------------------------ |
| `https://sky-watcher-kappa.vercel.app` | 운영 프론트                    |
| `https://skywatcher-akqa.onrender.com` | 백엔드 프록시                  |
| `https://skywa-1c045.firebaseapp.com`  | Firebase Auth 내부 통신 (필수) |

**Firestore 보안 규칙:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /routes/{routeId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.uid;
    }
  }
}
```

### Google Cloud Console — API Key 보안

Firebase API Key에 HTTP Referrer 제한을 설정해 허가된 도메인에서만 호출 가능하도록 2중 보호합니다.

```
Google Cloud Console → API 및 서비스 → 사용자 인증 정보
→ Firebase API Key → 애플리케이션 제한 → HTTP 리퍼러
```

허용 Referrer:

| 도메인                                   | 용도                           |
| ---------------------------------------- | ------------------------------ |
| `https://sky-watcher-kappa.vercel.app/*` | 운영 프론트                    |
| `https://skywatcher-akqa.onrender.com/*` | 백엔드 프록시                  |
| `https://skywa-1c045.firebaseapp.com/*`  | Firebase Auth 내부 통신 (필수) |

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
| sunny     | 관광지 → 레포츠    |
| rainy     | 문화시설 → 음식점  |
| storm     | 문화시설 → 숙박    |
| cold      | 문화시설 → 음식점  |
| cloudy    | 관광지 → 문화시설  |

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
  sunny: ["12", "28"], // 관광지, 레포츠
  rainy: ["14", "39"], // 문화시설, 음식점
  storm: ["14", "32"], // 문화시설, 숙박
  cold: ["14", "39"], // 문화시설, 음식점
  cloudy: ["12", "14"], // 관광지, 문화시설
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

TSP(외판원 문제)의 근사 해법으로, 계산 비용을 줄이면서도 실용적인 경로를 빠르게 생성하기 위해 Greedy 전략을 적용

* 외판원 문제?
 여러 도시를 한 번씩 방문하고 다시 출발점으로 돌아올 때
 총 이동 거리를 최소로 만드는 경로 찾기 문제

### 차량·도보 이동시간 병렬 계산

```js
async function fetchBothTravelTimes(stops) {
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


 🚗 차량 (driving) : “도로 종류별 평균 속도 + 실제 도로망 기반 계산”


고속도로: 빠름 (80~100km/h 이상)
일반도로: 중간 (30~60km/h)
골목길: 느림 (10~30km/h)
신호/회전/도로 유형 반영


🚶 도보 (walking) : 약 4 ~ 5 km/h

보행 가능한 길만 사용
계단, 골목, 지름길 포함

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

**해결** — `showLoading()`에서 `#main-content`를 숨기는 로직을 완전히 제거하고, `#grid-loading-overlay` 중앙 스피너만 표시하도록 변경했습니다.

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

**해결** — 초기 로딩 시점에 `showLoading()` 스피너를 먼저 표시하고 데이터 완료 후 `hideLoading()`으로 전환했습니다.

```js
// Before
showWeatherUnavailable(); // 깨진 UI 즉시 노출
showSkeletonGrid(6);

// After
showLoading("🌤 서울 날씨 & 관광지 불러오는 중...");
showSkeletonGrid(6);
(async () => {
  try {
    const [wData, places] = await Promise.all([...]);
    hideLoading();
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
  _introCache.set(key, info);
  return info;
}
```

### 2. API Key 보안 아키텍처

모든 외부 API 호출을 Express 프록시 서버로 은닉하고, Google Cloud Console에서 HTTP Referrer 제한을 추가해 2중으로 보호했습니다.

```
Browser → Express Proxy (Render) → OpenWeatherMap / TourAPI / ORS
                                  ↑ API Key는 서버 환경변수에만 존재
```

### 3. fetch → jQuery Ajax로 통일

DOM 조작에 jQuery를 사용하는 만큼, API 호출도 `fetch()` 대신 `$.ajax()`로 통일해 코드 일관성을 높였습니다.

```js
// Before
const res = await fetch(`${PROXY_BASE}/route`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ coordinates, profile }),
});
const data = await res.json();

// After
const data = await $.ajax({
  url: `${PROXY_BASE}/route`,
  method: "POST",
  contentType: "application/json",
  data: JSON.stringify({ coordinates, profile }),
  dataType: "json",
});
```

### 4. Firebase Config 키 분리

`firebase.config.js`를 `.gitignore`에 추가해 실제 키가 Git 히스토리에 남지 않도록 구조화하고, `firebase.config.example.js`를 템플릿으로 제공합니다.

<br>

---

## 🚨 트러블슈팅

### `FB_API_KEY_PLACEHOLDER` 400 Error

**증상** — 배포 후 Firebase 인증 요청 시 `400 Bad Request`, 응답에 `FB_API_KEY_PLACEHOLDER` 문자열 포함.

**원인** — Render 빌드 캐시에 이전 아티팩트가 남아 환경 변수 치환이 안 된 상태로 서비스됨.

**해결 순서**:

1. Render 대시보드 → `Clear build cache & deploy` 실행
2. 브라우저 강제 새로고침(`Cmd+Shift+R` / `Ctrl+Shift+R`)으로 캐시 제거
3. Firebase Console → Authentication → Authorized Domains에 Vercel 도메인 등록 확인

> **핵심 교훈** — 에러 메시지에 `PLACEHOLDER`가 보이면 서버에 구 버전 코드가 살아있다는 증거입니다. 코드보다 배포 상태를 먼저 의심하세요.

---

### Render Cold Start 지연 (첫 요청 30초)

**증상** — 배포 후 첫 검색 시 30초 이상 응답 없음.

**원인** — Render 무료 플랜은 15분 비활성 후 인스턴스를 슬립 상태로 전환.

**해결** — 앱 초기화 시 `/ping` 엔드포인트로 미리 웜업 요청을 보내 슬립 상태를 깨웁니다.

```js
// app.js — 초기화 시 웜업 ($.ajax로 통일)
$.ajax({ url: `${PROXY_BASE}/ping`, method: "GET", dataType: "json" }).catch(
  () => {},
);
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

---

### COOP 경고 (Cross-Origin-Opener-Policy)

**증상** — 콘솔에 `Cross-Origin-Opener-Policy policy would block the window.closed call` 반복 출력.

**원인** — Chrome이 COOP 정책으로 Firebase 팝업 창의 `window.closed` 감시를 차단하면서 출력되는 경고. Firebase SDK 내부(`popup.ts`) 코드에서 발생하므로 직접 수정 불가.

**결론** — 로그인은 정상 동작하며 기능 영향 없음. `node.js`에 `Cross-Origin-Opener-Policy: same-origin-allow-popups` 헤더가 설정되어 있어 팝업 동작은 보장됩니다. 일반 사용자는 콘솔을 열지 않으므로 실질적 문제 없음.
