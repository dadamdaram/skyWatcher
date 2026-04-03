# 🌤 SkyWatcher

> **날씨 기반 국내 여행지 추천 & 경로 최적화 웹 서비스**

**Live →** [sky-watcher-kappa.vercel.app](https://sky-watcher-kappa.vercel.app)

<br/>

## 프로젝트 소개

현재 날씨를 실시간으로 분석해 최적의 여행지를 추천, 선택한 장소들의 이동 경로를 자동 최적화하는 여행 플래닝 서비스.

단순 날씨 조회에서 나아가 **"맑으면 야외 명소, 비 오면 실내 문화시설"** 처럼 날씨 상태에 따라 추천 콘텐츠가 동적으로 변화.

장소를 선택 시, 최단 방문 순서를 자동 계산, 차량·도보 이동시간을 병렬로 계산해 타임라인을 구성.

<br/>

## 기술 스택

| 구분     | 기술                                           | 선택 이유                                                     |
| -------- | ---------------------------------------------- | ------------------------------------------------------------- |
| Frontend | Vanilla JS + jQuery                            | 프레임워크 없이 DOM 직접 제어, 번들러 없는 정적 배포          |
| 지도     | Leaflet.js + OpenStreetMap                     | 무료 오픈소스, 마커·폴리라인 커스터마이징 자유도 높음         |
| Backend  | Node.js + Express                              | API 키 보안을 위한 경량 프록시 서버                           |
| 배포     | Vercel (프론트) + Render (백엔드)              | 프론트·백 분리 배포로 환경변수 격리                           |
| API      | OpenWeatherMap / TourAPI v2 / OpenRouteService | 기상청 대비 응답 속도, 공공데이터 여행 정보, 보행자 경로 지원 |

<br/>

## 주요 기능

- **3가지 검색 모드** — GPS 현재위치 / 도시명 검색 / 키워드 검색
- **날씨 기반 여행지 자동 정렬** — OpenWeatherMap ID → weather type → 콘텐츠 카테고리 우선순위 매핑
- **경로 최적화** — Nearest Neighbor 알고리즘으로 최단 방문 순서 자동 계산
- **차량·도보 병렬 계산** — `Promise.all`로 두 이동수단 동시 요청 후 전환 시 캐시 재사용
- **Fallback 이동시간** — ORS API 실패 시 Haversine 직선거리 기반 추정값으로 대체
- **지도 실시간 렌더링** — 경로 추가·제거마다 Leaflet 폴리라인 즉시 업데이트
- **자동 경로 생성** — 날씨추천형 / 문화탐방형 / 맛집포함형 / 효율형 4가지 프리셋
- **API 키 보안** — 모든 외부 API 호출을 백엔드 프록시 경유, 프론트에 키 미노출

<br/>

## 핵심 로직

### 1. 날씨 코드 → 타입 분류 → 여행지 정렬

OpenWeatherMap이 반환하는 날씨 ID를 5개 타입으로 분류, 타입별 TourAPI 콘텐츠 카테고리 우선순위를 매핑해 정렬.

```js
// 날씨 ID → weather type 변환
function getWeatherType(id) {
  if (id >= 200 && id < 300) return "storm";
  if (id >= 300 && id < 600) return "rainy";
  if (id >= 600 && id < 700) return "cold";
  if (id >= 700 && id < 800) return "cloudy";
  if (id === 800) return "sunny";
  return "cloudy";
}

// weather type → 추천 콘텐츠 타입 우선순위
const WEATHER_CT_PREF = {
  sunny: ["12", "28"], // 관광지, 레포츠
  rainy: ["14", "39"], // 문화시설, 음식점
  storm: ["14", "32"], // 문화시설, 숙박
  cold: ["14", "39"],
  cloudy: ["12", "14"],
};

// 날씨 적합도 점수 부여 후 정렬
function getWeatherScore(place, weatherType) {
  const preferred = WEATHER_CT_PREF[weatherType] || [];
  const ct = String(place.contenttypeid || "12");
  return preferred[0] === ct ? 2 : preferred[1] === ct ? 1.5 : 0;
}

function sortByWeather(places, weatherType) {
  return [...places].sort(
    (a, b) => getWeatherScore(b, weatherType) - getWeatherScore(a, weatherType),
  );
}
```

---

### 2. 경로 최적화 — Nearest Neighbor Algorithm

선택한 장소의 "최단 이동 거리 순" 자동 정렬. 완전탐색(O(n!))
대신 그리디 방식(O(n²))으로 현실적 성능 확보.

```js
// 두 좌표 간 실제 거리 — Haversine 공식
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

// Nearest Neighbor — 최단 방문 순서 계산
function optimizeRoute(places) {
  if (places.length <= 2) return [...places];
  const remaining = [...places];
  const route = [remaining.shift()]; // 첫 장소 고정

  while (remaining.length) {
    const last = route[route.length - 1];
    let bestIdx = 0,
      bestDist = Infinity;

    remaining.forEach((place, i) => {
      const dist = haversine(+last.mapy, +last.mapx, +place.mapy, +place.mapx);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    });

    route.push(remaining.splice(bestIdx, 1)[0]);
  }
  return route;
}
```

---

### 3. 차량·도보 이동시간 병렬 계산 + Fallback

두 이동수단의 경로를 `Promise.all`로 동시 요청, 캐싱.
이동수단 전환 시 재호출 없이 캐시만 교체. 불필요한 API 호출 방지.

ORS API 실패 시 Haversine 직선거리에 현실 보정계수를 적용한 추정값으로 대체해 서비스가 끊기지 않도록 처리.

```js
// 차량·도보 동시 요청 → 캐시 저장
async function fetchBothTravelTimes(stops) {
  const [driving, walking] = await Promise.all([
    fetchOsrm(stops, "driving"),
    fetchOsrm(stops, "walking"),
  ]);
  travelCache.driving = driving;
  travelCache.walking = walking;
}

// ORS 실패 구간 → 직선거리 기반 추정값 Fallback
function estimateMinutes(stops, i, profile) {
  const km = haversine(
    +stops[i].mapy,
    +stops[i].mapx,
    +stops[i + 1].mapy,
    +stops[i + 1].mapx,
  );
  return profile === "walking"
    ? Math.max(1, Math.round(((km * 1.4) / 4) * 60)) // 도보: 실거리 보정 1.4× / 시속 4km
    : Math.max(1, Math.round((km / 19) * 60)); // 차량: 시내 평균 19km/h
}

async function fetchOsrm(stops, profile) {
  const results = await Promise.all(
    coords
      .slice(0, -1)
      .map((_, i) =>
        fetchRouteMinutes(
          coords[i][0],
          coords[i][1],
          coords[i + 1][0],
          coords[i + 1][1],
          profile,
        ),
      ),
  );
  // API 실패한 구간은 추정값으로 대체
  const legs = results.map((r, i) =>
    r ? r.duration_min : estimateMinutes(stops, i, profile),
  );
  return { legs, geometries: results.map((r) => r?.geometry ?? null) };
}

// 이동수단 전환 — 재요청 없이 캐시만 교체
function setTravelMode(mode) {
  currentTravelMode = mode;
  renderRouteStops();
  updateRouteMap();
}
```

---

### 4. API 키 보안 — 백엔드 프록시 분리

프론트엔드에 API 키를 노출하지 않기 위해 Express 프록시 서버를 별도로 운영. 프론트는 항상 프록시만 호출, 실제 외부 API 키는 서버 환경변수에서만 읽습니다.

```
Browser (Vercel)
    ↓  /api/weather/coords
Express Proxy (Render)   ← 환경변수에서만 키 읽음
    ↓  appid=WEATHER_KEY
OpenWeatherMap API
```

```js
// node.js (백엔드) — CORS 미들웨어를 express.json() 보다 먼저 등록
// → OPTIONS preflight 요청이 json 파싱 전에 처리되어 헤더 정상 반환
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());

app.get("/api/weather/coords", async (req, res) => {
  const { lat, lon } = req.query;
  const r = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_KEY}&units=metric`,
  );
  res.status(r.status).json(await r.json());
});
```

```js
// app.js (프론트) — 키 없음, 프록시만 호출
const PROXY_BASE = "https://skywatcher-akqa.onrender.com";

async function fetchWeatherByCoords(lat, lng) {
  const r = await fetch(
    `${PROXY_BASE}/api/weather/coords?lat=${lat}&lon=${lng}`,
  );
  return r.ok ? await r.json() : null;
}
```

---

### 5. 검색 실패 처리

**반경 자동 확장** — 설정 반경 내 결과 0건 시 10km로 자동 재시도

```js
let places = await apiLocationBased(currentLat, currentLng, currentRadius, "");
if (places.length === 0)
  places = await apiLocationBased(currentLat, currentLng, 10000, "");
```

**GPS 권한 거부** — 위치 접근 실패 시 도시명 입력 모드로 안내

```js
navigator.geolocation.getCurrentPosition(
  async (pos) => {
    /* 정상 처리 */
  },
  () => {
    $("#gps-status").text("⚠️ 위치 권한이 거부됐습니다.");
  },
  { timeout: 10000, enableHighAccuracy: true },
);
```

**날씨 API 실패** — 날씨 조회 실패 시 관광지 목록은 계속 표시

```js
const wData = await fetchWeatherByCity(city);
if (!wData) {
  if (!coords) {
    showError("도시를 찾을 수 없습니다.");
    return;
  }
  showWeatherUnavailable(); // 날씨 없이 관광지만 계속 진행
}
```

**이미지 Mixed Content** — TourAPI http 이미지 URL을 https로 강제 변환

```js
const toHttps = (url) => (url ? url.replace(/^http:\/\//, "https://") : null);
const imgSrc = toHttps(p.firstimage) || toHttps(p.firstimage2) || fallbackImg;
```

<br/>

## 트러블슈팅

| 문제                  | 원인                                                     | 해결                                                      |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| CORS 에러 (날씨·경로) | `express.json()` 이후 CORS 등록 → OPTIONS preflight 차단 | CORS 미들웨어를 `express.json()` 앞으로 이동              |
| 이미지 Mixed Content  | TourAPI가 `http://` 이미지 URL 반환                      | 출력 전 `replace(/^http:\/\//, "https://")` 처리          |
| 간헐적 API 실패       | Render 무료 플랜 Sleep 상태 → 첫 요청 30초 지연          | `AbortSignal.timeout(8000)` + Fallback 추정값으로 UX 유지 |
| 관광지 0건            | 설정 반경 내 데이터 없음                                 | 결과 0건 시 반경 자동 10km 확장 재시도                    |

<br/>

## 프로젝트 구조

```
skywatcher/
├── index.html       # 메인 HTML
├── app.js           # 프론트엔드 — UI, 지도, 검색, 경로 로직
├── style.css        # 스타일
├── node.js          # 백엔드 프록시 서버 (Express)
├── package.json
└── .env             # API 키 (git 제외)
```

<br/>

## 로컬 실행

```bash
# 1. 의존성 설치
npm install

# 2. .env 파일 작성
ORS_KEY=your_key
WEATHER_KEY=your_key
TOUR_KEY=your_key

# 3. 백엔드 실행
node node.js

# 4. app.js 상단 PROXY_BASE 수정
const PROXY_BASE = "http://localhost:4000";

# 5. index.html 브라우저에서 열기
```
