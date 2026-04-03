/**
 * SKYWATCHER v5 — app.js
 * OpenWeatherMap + 한국관광공사 TourAPI v2
 */

/* ─── 백엔드 프록시 주소 (Render 배포 후 실제 URL로 교체) ─── */
const PROXY_BASE = "https://skywatcher-akqa.onrender.com";

/* ─── 상태 ─── */
let currentWeatherType = "any";
let currentCity = "서울";
let currentLat = 37.5665;
let currentLng = 126.978;
let routeStops = [];
// travelCache로 대체됨 (driving/walking 각각 저장)
let currentMode = "city";
let currentTravelMode = "driving"; // "driving" | "walking"
let travelCache = {
  driving: { legs: [], geometries: [], total: 0 },
  walking: { legs: [], geometries: [], total: 0 },
};
let currentRadius = 3000;
let currentSort = "distance";
let currentFilter = "all";
let allLoadedPlaces = [];
let currentKeyword = "";
let currentPage = 1;
const PAGE_SIZE = 12;
let selectMode = false;
let selectedTitles = new Set();

/* ─── 컨텐츠 타입 ─── */
const CT_LABEL = {
  12: "관광지",
  14: "문화시설",
  15: "축제/행사",
  25: "여행코스",
  28: "레포츠",
  32: "숙박",
  38: "쇼핑",
  39: "음식점",
};
const CT_ICON = {
  12: "🗿",
  14: "🏛",
  15: "🎉",
  25: "🗺",
  28: "🏄",
  32: "🏨",
  38: "🛍",
  39: "🍽",
};
const WEATHER_CT_PREF = {
  sunny: ["12", "28"],
  rainy: ["14", "39"],
  storm: ["14", "32"],
  cold: ["14", "39"],
  cloudy: ["12", "14"],
  any: ["12", "14"],
};

/* ─── 유틸 ─── */
const DAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const DESC_MAP = {
  "clear sky": "맑음",
  "few clouds": "구름 조금",
  "scattered clouds": "구름 많음",
  "broken clouds": "흐림",
  "overcast clouds": "흐림",
  "light rain": "가벼운 비",
  "moderate rain": "비",
  "heavy rain": "강한 비",
  "light snow": "가벼운 눈",
  snow: "눈",
  thunderstorm: "뇌우",
  mist: "안개",
  fog: "안개",
  haze: "연무",
  drizzle: "이슬비",
  "shower rain": "소나기",
};
const translateDesc = (d) => DESC_MAP[d.toLowerCase()] || d;
const iconUrl = (c) => `https://openweathermap.org/img/wn/${c}@2x.png`;
function unixToTime(u, off) {
  const d = new Date((u + off) * 1000);
  return (
    String(d.getUTCHours()).padStart(2, "0") +
    ":" +
    String(d.getUTCMinutes()).padStart(2, "0")
  );
}
function getWeatherType(id) {
  if (id >= 200 && id < 300) return "storm";
  if (id >= 300 && id < 600) return "rainy";
  if (id >= 600 && id < 700) return "cold";
  if (id >= 700 && id < 800) return "cloudy";
  if (id === 800) return "sunny";
  return "cloudy";
}
function getWeatherTip(type) {
  const tips = {
    sunny: {
      icon: "☀️",
      text: "완벽한 야외 관광 날씨!",
      badge: "☀️ 맑음 — 야외 명소 추천",
      color: "rgba(245,200,66,.1)",
      border: "rgba(245,200,66,.3)",
      textColor: "#f5c842",
    },
    rainy: {
      icon: "🌧️",
      text: "실내 관광을 추천해요",
      badge: "🌧️ 비 — 실내 명소 추천",
      color: "rgba(78,202,255,.1)",
      border: "rgba(78,202,255,.3)",
      textColor: "#4ecaff",
    },
    storm: {
      icon: "⛈️",
      text: "실내에 머무세요",
      badge: "⛈️ 뇌우 — 안전 우선",
      color: "rgba(255,107,107,.1)",
      border: "rgba(255,107,107,.3)",
      textColor: "#ff8888",
    },
    cold: {
      icon: "❄️",
      text: "방한 준비 철저히!",
      badge: "❄️ 눈 — 겨울 명소 추천",
      color: "rgba(160,200,255,.1)",
      border: "rgba(160,200,255,.3)",
      textColor: "#a0c8ff",
    },
    cloudy: {
      icon: "⛅",
      text: "야외 활동도 무난해요",
      badge: "⛅ 흐림 — 전천후 명소 추천",
      color: "rgba(180,180,200,.1)",
      border: "rgba(180,180,200,.3)",
      textColor: "#b0b0c8",
    },
  };
  return tips[type] || tips.cloudy;
}
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371,
    dLat = ((lat2 - lat1) * Math.PI) / 180,
    dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function optimizeRoute(places) {
  if (places.length <= 2) return [...places];
  const rem = [...places],
    route = [rem.shift()];
  while (rem.length) {
    const last = route[route.length - 1];
    let bi = 0,
      bd = Infinity;
    rem.forEach((p, i) => {
      const d =
        last.mapx && p.mapx
          ? haversine(+last.mapy, +last.mapx, +p.mapy, +p.mapx)
          : 999;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    route.push(rem.splice(bi, 1)[0]);
  }
  return route;
}
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

/* ══════════════════════════════════════════════
   OSRM — 차량 / 도보 이동시간 병렬 취득
══════════════════════════════════════════════ */
/* ══════════════════════════════════════════════
   라우팅 엔진
   node.js 프록시(port 4000) → ORS API 서버사이드 호출
   CORS 없음, driving-car / foot-walking 프로파일
   foot-walking: 횡단보도·보행자 신호 반영한 실제 경로
   응답: { duration_min, geometry: [[lat,lng],...] }
   Fallback: 직선거리 × 현실 보정계수 (geometry null)
══════════════════════════════════════════════ */

// { min: number, geometry: [[lat,lng],...] | null }
async function fetchRouteMinutes(lng1, lat1, lng2, lat2, profile) {
  try {
    const res = await fetch(`${PROXY_BASE}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [
          [lng1, lat1],
          [lng2, lat2],
        ],
        profile,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.duration_min) return null;
    return { min: data.duration_min, geometry: data.geometry ?? null };
  } catch (_) {
    return null;
  }
}

/**
 * 직선거리 기반 현실 추정 (프록시 실패 시 폴백)
 * 도보: 4km/h × 1.4 (횡단보도 대기·우회)
 * 차량: 서울 시내 실측 평균 19km/h
 */
function estimateMinutes(stops, i, profile) {
  const km = haversine(
    +stops[i].mapy,
    +stops[i].mapx,
    +stops[i + 1].mapy,
    +stops[i + 1].mapx,
  );
  return profile === "walking"
    ? Math.max(1, Math.round(((km * 1.4) / 4) * 60))
    : Math.max(1, Math.round((km / 19) * 60));
}

async function fetchOsrm(stops, profile) {
  if (stops.length < 2) return { legs: [], geometries: [] };

  const coords = stops.map((p) => [
    parseFloat(p.mapx || 0),
    parseFloat(p.mapy || 0),
  ]);
  if (
    coords.some(([lng, lat]) => Math.abs(lng) < 0.001 || Math.abs(lat) < 0.001)
  )
    return { legs: [], geometries: [] };

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

  const legs = results.map((r, i) =>
    r ? r.min : estimateMinutes(stops, i, profile),
  );
  const geometries = results.map((r) => r?.geometry ?? null);

  return { legs, geometries };
}

async function fetchBothTravelTimes(stops) {
  if (stops.length < 2) {
    travelCache = {
      driving: { legs: [], geometries: [], total: 0 },
      walking: { legs: [], geometries: [], total: 0 },
    };
    return;
  }

  const [driving, walking] = await Promise.all([
    fetchOsrm(stops, "driving"),
    fetchOsrm(stops, "walking"),
  ]);

  travelCache.driving.legs = driving.legs;
  travelCache.driving.geometries = driving.geometries;
  travelCache.walking.legs = walking.legs;
  travelCache.walking.geometries = walking.geometries;

  travelCache.driving.total = driving.legs.reduce((a, b) => a + b, 0);
  travelCache.walking.total = walking.legs.reduce((a, b) => a + b, 0);
}
/* 이동수단 전환 — 재호출 없이 캐시 전환만 */
function setTravelMode(mode) {
  currentTravelMode = mode;
  document
    .querySelectorAll(".travel-mode-btn")
    .forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.mode === mode),
    );
  renderRouteStops();
  updateRouteMap(); // 도로선 색상·경로 재렌더
}

function getTravelMin(i, mode) {
  const m = mode || currentTravelMode;
  return travelCache[m]?.legs?.[i] ?? (m === "walking" ? 30 : 10);
}

/* ─── UI 헬퍼 ─── */
function showLoading(msg = "관광지 정보 불러오는 중...") {
  $("#loading").removeClass("hidden");
  $("#loading-text").text(msg);
  $("#main-content").addClass("hidden");
  $("#error-msg").addClass("hidden");
}
function setLoadingText(msg) {
  $("#loading-text").text(msg);
}
function hideLoading() {
  $("#loading").addClass("hidden");
}
function showError(msg) {
  hideLoading();
  $("#error-msg").removeClass("hidden").text(msg);
  $("#main-content").addClass("hidden");
}
function showContent() {
  hideLoading();
  $("#main-content").removeClass("hidden");
  // 콘텐츠가 보인 뒤 지도 크기 재계산
  setTimeout(() => {
    initLeafletMap();
    if (_leafletMap) _leafletMap.invalidateSize();
  }, 100);
}

/* ══════════════════════════════════════════════
   관광공사 API — 백엔드 프록시 경유 (키 노출 없음)
══════════════════════════════════════════════ */
function apiLocationBased(lat, lng, radius, contentTypeId = "") {
  let qs = `mapX=${lng}&mapY=${lat}&radius=${radius}&arrange=E`;
  if (contentTypeId && contentTypeId !== "all")
    qs += `&contentTypeId=${contentTypeId}`;
  return fetch(`${PROXY_BASE}/api/tour/location?${qs}`)
    .then((r) => r.json())
    .then(parseTourItems)
    .catch((e) => {
      console.error("locationBased 오류:", e);
      return [];
    });
}

function apiKeyword(keyword, contentTypeId = "") {
  let qs = `keyword=${encodeURIComponent(keyword)}&arrange=A`;
  if (contentTypeId && contentTypeId !== "all")
    qs += `&contentTypeId=${contentTypeId}`;
  return fetch(`${PROXY_BASE}/api/tour/keyword?${qs}`)
    .then((r) => r.json())
    .then(parseTourItems)
    .catch((e) => {
      console.error("keyword API 오류:", e);
      return [];
    });
}

function parseTourItems(data) {
  console.group("📡 TourAPI Response Check"); // 로그를 그룹화하여 보기 편하게 함
  try {
    const header = data?.response?.header || data?.header;
    const code = header?.resultCode;
    const msg = header?.resultMsg;

    console.log("Full Data:", data); // 실제 응답값 전체 출력
    console.log(`Status: [${code}] ${msg}`);

    if (code && code !== "0000") {
      console.error(`❌ API 업무 에러 발생! 종류: ${code} (${msg})`);
      // Tip: 0030(서비스 키 미등록), 0010(유효하지 않은 키), 0020(서비스 접근 거부)
      return [];
    }

    const items = data?.response?.body?.items?.item;
    if (!items) {
      console.warn("⚠️ 데이터는 성공했으나 검색 결과(item)가 0건입니다.");
      return [];
    }

    const result = Array.isArray(items) ? items : [items];
    console.log(`✅ 성공: ${result.length}개의 장소를 로드함`);
    return result;
  } catch (e) {
    console.error("❌ 파싱 중 예외 발생:", e.message);
    return [];
  } finally {
    console.groupEnd();
  }
}

/* ══════════════════════════════════════════════
   날씨 API — 백엔드 프록시 경유 (키 노출 없음)
══════════════════════════════════════════════ */
async function fetchWeatherByCoords(lat, lng) {
  try {
    const r = await fetch(
      `${PROXY_BASE}/api/weather/coords?lat=${lat}&lon=${lng}`,
    );
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}
async function fetchWeatherByCity(city) {
  try {
    const r = await fetch(
      `${PROXY_BASE}/api/weather/city?q=${encodeURIComponent(city)}`,
    );
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}
async function fetchForecastByCoords(lat, lng) {
  try {
    const r = await fetch(
      `${PROXY_BASE}/api/weather/forecast?lat=${lat}&lon=${lng}`,
    );
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/* ─── 탭 필터 ─── */
async function onTabFilter(filter) {
  if (currentFilter === filter) return;
  currentFilter = filter;
  currentPage = 1;
  resetSelectMode();
  $(".tab-btn").removeClass("active");
  $(`.tab-btn[data-filter="${filter}"]`).addClass("active");
  $("#places-grid").html('<div class="grid-loading">⏳ 조회 중...</div>');
  $("#load-more-wrap").hide();
  $("#api-notice").hide();
  const ctId = filter === "all" ? "" : filter;
  let places = [];
  if (currentMode === "keyword" && currentKeyword) {
    places = await apiKeyword(currentKeyword, ctId);
  } else {
    places = await apiLocationBased(
      currentLat,
      currentLng,
      currentRadius,
      ctId,
    );
    if (places.length === 0 && ctId)
      places = await apiLocationBased(currentLat, currentLng, 10000, ctId);
  }
  allLoadedPlaces = places;
  renderPlaceGrid();
  updateApiNotice(places.length, true);
}

/* ─── 날씨 없음 표시 ─── */
function showWeatherUnavailable() {
  $("#city-display").text(currentCity);
  $("#country-display").text("날씨 정보 없음");
  $("#weather-desc").text("날씨 API 키를 입력하면 날씨도 표시됩니다");
  $("#temp-main, #feels-like, #temp-max, #temp-min").text("—");
  $("#humidity, #wind-speed, #visibility, #pressure, #clouds").text("—");
  $("#humidity-bar, #clouds-bar").css("width", "0%");
  $("#sunrise, #sunset").text("—");
  const tip = getWeatherTip("any");
  $("#weather-tip")
    .text("🌤 날씨 기반 추천을 위해 OpenWeatherMap API 키를 입력하세요")
    .css({
      background: tip.color,
      borderColor: tip.border,
      color: tip.textColor,
    });
  $("#travel-weather-badge").text("📍 위치 기반 추천").css({
    background: tip.color,
    borderColor: tip.border,
    color: tip.textColor,
  });
  $("#weather-auto-icon").text("📍");
  $("#forecast-list").html(
    '<p style="color:var(--text-muted);font-size:.85rem;padding:16px 0">날씨 정보를 불러오지 못했습니다</p>',
  );
}

/* ══════════════════════════════════════════════
   도시 검색
══════════════════════════════════════════════ */
async function fetchWeather(city) {
  if (!city.trim()) return;
  showLoading("검색 중...");
  resetSelectMode();
  currentMode = "city";
  currentFilter = "all";
  currentKeyword = "";
  currentPage = 1;
  $(".tab-btn").removeClass("active");
  $(`.tab-btn[data-filter="all"]`).addClass("active");
  routeStops = [];

  // 내장 좌표 DB 업데이트
  const coords = getCityCoords(city);
  if (coords) {
    currentLat = coords.lat;
    currentLng = coords.lng;
    currentCity = city;
  }

  // 날씨 조회 (도시명으로)
  setLoadingText("날씨 조회 중...");
  const wData = await fetchWeatherByCity(city);
  if (wData) {
    currentLat = wData.coord.lat;
    currentLng = wData.coord.lon;
    currentCity = wData.name;
    renderCurrent(wData);
    fetchForecastByCoords(currentLat, currentLng).then((f) => {
      if (f) renderForecast(f);
    });
  } else {
    if (!coords) {
      showError("도시를 찾을 수 없습니다. 다시 입력해주세요.");
      return;
    }
    showWeatherUnavailable();
  }

  // 관광지 조회 (좌표 기반)
  setLoadingText("관광지 조회 중...");
  let places = await apiLocationBased(
    currentLat,
    currentLng,
    currentRadius,
    "",
  );
  if (places.length === 0)
    places = await apiLocationBased(currentLat, currentLng, 10000, "");
  allLoadedPlaces = places;
  setTravelHeader();
  renderPlaceGrid();
  updateApiNotice(places.length, true);
  showContent();
  renderRouteStops();
}

/* ─── GPS ─── */
async function fetchByGPS() {
  $("#gps-btn")
    .prop("disabled", true)
    .find("#gps-btn-text")
    .text("📡 감지 중...");
  $("#gps-status").removeClass("hidden").text("위치 감지 중...");
  if (!navigator.geolocation) {
    showError("위치 서비스 미지원 브라우저입니다.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;
      currentCity = "내 위치";
      currentMode = "location";
      currentFilter = "all";
      currentPage = 1;
      resetSelectMode();
      $(".tab-btn").removeClass("active");
      $(`.tab-btn[data-filter="all"]`).addClass("active");
      $("#gps-status").text(
        `✅ ${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}`,
      );
      $("#radius-row").show();
      $("#gps-btn")
        .prop("disabled", false)
        .find("#gps-btn-text")
        .text("🔄 새로고침");
      showLoading("주변 관광지 조회 중...");

      // 날씨는 좌표로 조회
      const wData = await fetchWeatherByCoords(currentLat, currentLng);
      if (wData) {
        currentCity = wData.name || "내 위치";
        renderCurrent(wData);
        fetchForecastByCoords(currentLat, currentLng).then((f) => {
          if (f) renderForecast(f);
        });
      } else showWeatherUnavailable();

      let places = await apiLocationBased(
        currentLat,
        currentLng,
        currentRadius,
        "",
      );
      if (places.length === 0)
        places = await apiLocationBased(currentLat, currentLng, 10000, "");
      allLoadedPlaces = places;
      setTravelHeader();
      renderPlaceGrid();
      updateApiNotice(places.length, true);
      showContent();
      routeStops = [];
      renderRouteStops();
    },
    () => {
      $("#gps-btn")
        .prop("disabled", false)
        .find("#gps-btn-text")
        .text("📡 위치 감지");
      $("#gps-status").text("⚠️ 위치 권한이 거부됐습니다.");
    },
    { timeout: 10000, enableHighAccuracy: true },
  );
}

/* ─── 키워드 검색 ─── */
async function fetchByKeyword(keyword) {
  if (!keyword.trim()) return;
  showLoading(`"${keyword}" 검색 중...`);
  resetSelectMode();
  currentMode = "keyword";
  currentKeyword = keyword;
  currentFilter = "all";
  currentPage = 1;
  $(".tab-btn").removeClass("active");
  $(`.tab-btn[data-filter="all"]`).addClass("active");

  // 관광지 키워드 검색
  let places = await apiKeyword(keyword, "");
  if (places.length === 0) {
    // 키워드 결과 없으면 현재 위치 기반 폴백
    places = await apiLocationBased(currentLat, currentLng, 10000, "");
  }
  allLoadedPlaces = places;
  if (places.length > 0 && places[0].mapx) {
    currentLat = parseFloat(places[0].mapy);
    currentLng = parseFloat(places[0].mapx);
  }
  currentCity = `"${keyword}" 검색결과`;

  // 날씨는 검색된 위치의 좌표로 — 키워드가 아닌 좌표로 호출
  const wData = await fetchWeatherByCoords(currentLat, currentLng);
  if (wData) renderCurrent(wData);
  else showWeatherUnavailable();

  setTravelHeader();
  renderPlaceGrid();
  updateApiNotice(places.length, true);
  showContent();
  routeStops = [];
  renderRouteStops();
}

/* ─── 헤더 / 알림 ─── */
function setTravelHeader() {
  $("#travel-city-name").text(currentCity);
  const sub = {
    sunny: "맑은 날씨 — 야외 명소를 먼저 보여드립니다.",
    rainy: "비 오는 날 — 실내 명소를 추천합니다.",
    cold: "겨울 날씨 — 실내·설경 명소를 추천합니다.",
    cloudy: "흐린 날씨 — 전천후 명소를 안내합니다.",
    storm: "뇌우 — 안전한 실내 명소를 추천합니다.",
    any: "한국관광공사 실시간 데이터 기반 추천입니다.",
  };
  $("#travel-subtitle").text(sub[currentWeatherType] || sub.any);
  $("#travel-source-badge").html(
    `관광지 추천 <span class="api-live-tag">🔴 LIVE</span>`,
  );
}
function updateApiNotice(count, isLive) {
  if (isLive && count > 0) {
    $("#api-notice").show();
    $("#api-notice-text").text("한국관광공사 TourAPI v2 실시간 데이터");
    $("#api-result-count").text(count + "건");
  } else $("#api-notice").hide();
}

/* ─── 도시 좌표 DB ─── */
const CITY_COORDS = {
  seoul: { lat: 37.5665, lng: 126.978 },
  서울: { lat: 37.5665, lng: 126.978 },
  busan: { lat: 35.1796, lng: 129.0756 },
  부산: { lat: 35.1796, lng: 129.0756 },
  jeju: { lat: 33.489, lng: 126.4983 },
  제주: { lat: 33.489, lng: 126.4983 },
  incheon: { lat: 37.4563, lng: 126.7052 },
  인천: { lat: 37.4563, lng: 126.7052 },
  daegu: { lat: 35.8714, lng: 128.6014 },
  대구: { lat: 35.8714, lng: 128.6014 },
  daejeon: { lat: 36.3504, lng: 127.3845 },
  대전: { lat: 36.3504, lng: 127.3845 },
  gwangju: { lat: 35.1595, lng: 126.8526 },
  광주: { lat: 35.1595, lng: 126.8526 },
  jeonju: { lat: 35.8242, lng: 127.148 },
  전주: { lat: 35.8242, lng: 127.148 },
  gyeongju: { lat: 35.8562, lng: 129.2247 },
  경주: { lat: 35.8562, lng: 129.2247 },
  suwon: { lat: 37.2636, lng: 127.0286 },
  수원: { lat: 37.2636, lng: 127.0286 },
  gangneung: { lat: 37.7519, lng: 128.8761 },
  강릉: { lat: 37.7519, lng: 128.8761 },
  sokcho: { lat: 38.207, lng: 128.5918 },
  속초: { lat: 38.207, lng: 128.5918 },
  yeosu: { lat: 34.7604, lng: 127.6622 },
  여수: { lat: 34.7604, lng: 127.6622 },
  andong: { lat: 36.5684, lng: 128.7294 },
  안동: { lat: 36.5684, lng: 128.7294 },
  tongyeong: { lat: 34.8544, lng: 128.4333 },
  통영: { lat: 34.8544, lng: 128.4333 },
  chuncheon: { lat: 37.8748, lng: 127.7342 },
  춘천: { lat: 37.8748, lng: 127.7342 },
  ulsan: { lat: 35.5384, lng: 129.3114 },
  울산: { lat: 35.5384, lng: 129.3114 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  paris: { lat: 48.8566, lng: 2.3522 },
  "new york": { lat: 40.7128, lng: -74.006 },
  bangkok: { lat: 13.7563, lng: 100.5018 },
  barcelona: { lat: 41.3851, lng: 2.1734 },
};
function getCityCoords(city) {
  const k = city.toLowerCase().trim();
  return (
    CITY_COORDS[k] ||
    Object.entries(CITY_COORDS).find(
      ([c]) => k.includes(c) || c.includes(k),
    )?.[1] ||
    null
  );
}

/* ─── 날씨 렌더 ─── */
function renderCurrent(data) {
  const { name, sys, weather, main, wind, visibility, clouds, timezone } = data;
  const wType = getWeatherType(weather[0].id);
  currentWeatherType = wType;
  const tip = getWeatherTip(wType);
  $("#city-display").text(name);
  $("#country-display").text(sys.country);
  $("#weather-desc").text(translateDesc(weather[0].description));
  $("#weather-icon").attr({
    src: iconUrl(weather[0].icon),
    alt: weather[0].description,
  });
  $("#temp-main").text(Math.round(main.temp));
  $("#feels-like").text(Math.round(main.feels_like));
  $("#temp-max").text(Math.round(main.temp_max));
  $("#temp-min").text(Math.round(main.temp_min));
  $("#humidity").text(main.humidity);
  $("#humidity-bar").css("width", main.humidity + "%");
  $("#wind-speed").text(wind.speed.toFixed(1));
  $("#visibility").text(visibility ? (visibility / 1000).toFixed(1) : "—");
  $("#pressure").text(main.pressure);
  $("#clouds").text(clouds.all);
  $("#clouds-bar").css("width", clouds.all + "%");
  $("#sunrise").text(unixToTime(sys.sunrise, timezone));
  $("#sunset").text(unixToTime(sys.sunset, timezone));
  $("#weather-tip")
    .text(tip.icon + " " + tip.text)
    .css({
      background: tip.color,
      borderColor: tip.border,
      color: tip.textColor,
    });
  $("#travel-weather-badge").text(tip.badge).css({
    background: tip.color,
    borderColor: tip.border,
    color: tip.textColor,
  });
  $("#weather-auto-icon").text(tip.icon);
}
function renderForecast(data) {
  const daily = {};
  data.list.forEach((item) => {
    const d = item.dt_txt.split(" ")[0],
      t = item.dt_txt.split(" ")[1];
    if (!daily[d] || t === "12:00:00") daily[d] = item;
  });
  const $list = $("#forecast-list").empty();
  Object.values(daily)
    .slice(0, 5)
    .forEach((item, i) => {
      const d = new Date(item.dt_txt.split(" ")[0]);
      $list.append(`<div class="forecast-item" style="animation-delay:${i * 0.07}s">
      <div class="forecast-day">${i === 0 ? "오늘" : DAYS_KO[d.getDay()] + "요일"}</div>
      <img src="${iconUrl(item.weather[0].icon)}" alt="">
      <div class="forecast-temp">${Math.round(item.main.temp)}°</div>
      <div class="forecast-desc">${translateDesc(item.weather[0].description)}</div>
    </div>`);
    });
}

/* ─── 그리드 렌더 ─── */
function renderPlaceGrid() {
  const sorted = getSortedPlaces(allLoadedPlaces);
  const page = sorted.slice(0, currentPage * PAGE_SIZE);
  const $grid = $("#places-grid").empty();
  if (page.length === 0) {
    const hint =
      currentMode === "keyword"
        ? `"${currentKeyword}" 키워드 결과가 없습니다`
        : "이 카테고리의 관광지가 없습니다";
    $grid.html(
      `<div class="empty-state"><div style="font-size:2.5rem;margin-bottom:12px">🔍</div><div style="font-size:1.05rem;color:var(--text-muted)">${hint}</div><div style="font-size:.82rem;color:var(--text-muted);margin-top:6px">다른 키워드나 카테고리를 시도해보세요</div></div>`,
    );
    $("#load-more-wrap").hide();
    return;
  }
  page.forEach((p, i) => buildPlaceCard(p, i, $grid));
  $("#load-more-wrap").toggle(sorted.length > currentPage * PAGE_SIZE);
  updateRouteMap();
}
function getSortedPlaces(places) {
  if (currentSort === "weather")
    return sortByWeather(places, currentWeatherType);
  if (currentSort === "modified")
    return [...places].sort(
      (a, b) => (b.modifiedtime || 0) - (a.modifiedtime || 0),
    );
  return places;
}
function buildPlaceCard(p, i, $grid) {
  if (!p || !p.title) return; // 데이터가 없으면 중단

  const inRoute = routeStops.some((r) => r.title === p.title);
  const isSelected = selectedTitles.has(p.title);
  const ctId = String(p.contenttypeid || "12");
  const toHttps = (url) => (url ? url.replace(/^http:\/\//, "https://") : null);
  const imgSrc =
    toHttps(p.firstimage) ||
    toHttps(p.firstimage2) ||
    "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=600&q=80";

  let distHtml = "";
  if (p.dist) {
    const d = parseFloat(p.dist);
    distHtml = `<span class="distance-badge">${d >= 1000 ? (d / 1000).toFixed(1) + "km" : Math.round(d) + "m"}</span>`;
  }

  const ws = getWeatherScore(p, currentWeatherType);
  const wBadge =
    ws >= 2
      ? `<span class="place-weather-tag tag-sunny">☀️ 지금 추천</span>`
      : `<span class="place-weather-tag tag-any">🌤 언제나 OK</span>`;

  // 클래스 결합 시 공백 주의
  const modeClass = selectMode ? "select-mode" : "";
  const selectedClass = isSelected ? "card-selected" : "";

  const cardHtml = `
    <div class="place-card ${modeClass} ${selectedClass}" data-title="${p.title}" style="animation-delay:${i * 0.05}s">
      ${
        selectMode
          ? `
        <div class="card-checkbox ${isSelected ? "checked" : ""}" data-title="${p.title}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>`
          : ""
      }
      <div class="place-thumb-wrap">
        <img class="place-thumb" src="${imgSrc}" alt="${p.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=600&q=80'">
        <span class="place-category-tag">${CT_ICON[ctId] || "🗿"} ${CT_LABEL[ctId] || "관광지"}</span>
      </div>
      <div class="place-body">
        <div class="place-name">${p.title}</div>
        <div class="place-addr">${p.addr1 || "주소 정보 없음"}</div>
        <div class="place-footer">${distHtml}${wBadge}</div>
        ${!selectMode ? `<button class="btn-add-route ${inRoute ? "added" : ""}" data-title="${p.title}">${inRoute ? "✓ 추가됨" : "+ 경로 추가"}</button>` : ""}
      </div>
    </div>`;

  $grid.append(cardHtml);
}

/* ─── 경로 플래너 ─── */
function addToRoute(title) {
  const p = allLoadedPlaces.find((p) => p.title === title);
  if (!p) return;
  if (routeStops.some((r) => r.title === title)) {
    removeFromRoute(title);
    return;
  }
  if (routeStops.length >= 6) {
    alert("경로는 최대 6개까지 추가 가능합니다.");
    return;
  }
  routeStops.push({ ...p, visitTime: 60 });
  refreshRoute();
}
function removeFromRoute(title) {
  routeStops = routeStops.filter((r) => r.title !== title);
  refreshRoute();
}
async function refreshRoute() {
  await fetchBothTravelTimes(routeStops);
  renderRouteStops();
  updateCardButtons();
}
function updateCardButtons() {
  $(".btn-add-route").each(function () {
    const t = $(this).data("title"),
      inR = routeStops.some((r) => r.title === t);
    $(this)
      .toggleClass("added", inR)
      .text(inR ? "✓ 경로에 추가됨" : "+ 경로에 추가");
  });
}

const STOP_COLORS = [
  "#f5c842",
  "#4ecaff",
  "#ff6b6b",
  "#5ce89a",
  "#ff9f43",
  "#a29bfe",
];

function fmtMin(min) {
  if (!min && min !== 0) return "—";
  const h = Math.floor(min / 60),
    m = min % 60;
  return h > 0 ? `${h}시간 ${m > 0 ? m + "분" : ""}` : `${m}분`;
}

function renderRouteStops() {
  const $list = $("#route-stops-list"),
    count = routeStops.length;
  $("#stop-count").text(count + "개");
  $("#route-empty").toggle(count === 0);
  $("#route-summary").toggle(count > 0);
  $("#clear-route-btn, #share-route-btn").toggle(count > 0);
  $("#route-legend").toggle(count > 0);
  $("#route-timeline-section").toggle(count > 0);

  if (count > 0) {
    const visitTotal = routeStops.reduce((s, p) => s + (p.visitTime || 60), 0);
    const driveTotal = travelCache.driving.total || 0;
    const walkTotal = travelCache.walking.total || 0;
    $("#summary-count").text(count + "곳");
    $("#summary-time-drive").text(fmtMin(visitTotal + driveTotal));
    $("#summary-time-walk").text(fmtMin(visitTotal + walkTotal));
    $(".summary-mode-drive").toggleClass(
      "mode-active",
      currentTravelMode === "driving",
    );
    $(".summary-mode-walk").toggleClass(
      "mode-active",
      currentTravelMode === "walking",
    );
  }

  $list.find(".route-stop-item").remove();
  routeStops.forEach((p, i) => {
    const color = STOP_COLORS[i % STOP_COLORS.length];
    const isLast = i === routeStops.length - 1;
    const np = routeStops[i + 1];
    const lat = parseFloat(p.mapy || 0),
      lng = parseFloat(p.mapx || 0);

    let legHtml = "";
    if (!isLast && lat && np?.mapy) {
      const km = haversine(lat, lng, +np.mapy, +np.mapx).toFixed(1);
      const dMin = getTravelMin(i, "driving");
      const wMin = getTravelMin(i, "walking");
      legHtml = `
        <div class="stop-leg">
          <div class="stop-leg-line"></div>
          <div class="stop-leg-times">
            <span class="leg-chip leg-drive${currentTravelMode === "driving" ? " active" : ""}">🚗 ${dMin}분</span>
            <span class="leg-chip leg-walk${currentTravelMode === "walking" ? " active" : ""}">🚶 ${wMin}분</span>
            <span class="leg-km">${km}km</span>
          </div>
        </div>`;
    }

    $list.append(`
      <div class="route-stop-item">
        <div class="stop-num" style="background:${color};color:#000">${i + 1}</div>
        <div class="stop-body">
          <div class="stop-info">
            <div class="stop-name">${p.title}</div>
            ${p.addr1 || p.addr2 ? `<div class="stop-address">📍 ${p.addr1 || p.addr2}</div>` : ""}
            <div class="stop-meta">
              <span class="stop-cat">${CT_ICON[String(p.contenttypeid || "12")] || "🗿"} ${CT_LABEL[String(p.contenttypeid || "12")] || "관광지"}</span>
              <span class="stop-time">⏱ ${p.visitTime || 60}분</span>
            </div>
          </div>
          <button class="stop-remove" data-title="${p.title}">✕</button>
        </div>
        ${legHtml}
      </div>`);
  });

  const $leg = $("#legend-items").empty();
  routeStops.forEach((p, i) =>
    $leg.append(`<div class="legend-item">
      <div class="legend-dot" style="background:${STOP_COLORS[i % STOP_COLORS.length]}"></div>
      <span>${i + 1}. ${p.title}</span>
    </div>`),
  );

  renderTimeline();
  updateRouteMap();
}

function renderTimeline() {
  const $tl = $("#route-timeline").empty();
  let h = 9,
    m = 0;
  routeStops.forEach((p, i) => {
    const sH = String(h).padStart(2, "0"),
      sM = String(m).padStart(2, "0");
    const visitMin = p.visitTime || 60;
    const em = m + visitMin;
    const eH = h + Math.floor(em / 60),
      eMr = em % 60;
    const color = STOP_COLORS[i % STOP_COLORS.length];
    const isLast = i === routeStops.length - 1;
    const dMin = getTravelMin(i, "driving");
    const wMin = getTravelMin(i, "walking");

    $tl.append(`<div class="timeline-item">
      <div class="tl-time">${sH}:${sM}</div>
      <div class="tl-dot" style="background:${color}"></div>
      <div class="tl-content">
        <div class="tl-name">${p.title}</div>
        <div class="tl-detail">
          <span class="tl-duration">⏱ ${visitMin}분</span>
          ${!isLast ? `<span class="tl-travel tl-drive${currentTravelMode === "driving" ? " tl-active" : ""}">🚗 ${dMin}분</span><span class="tl-travel tl-walk${currentTravelMode === "walking" ? " tl-active" : ""}">🚶 ${wMin}분</span>` : ""}
        </div>
      </div>
      <div class="tl-end">${String(eH).padStart(2, "0")}:${String(eMr).padStart(2, "0")}</div>
    </div>`);

    h = eH;
    m = eMr;
    if (!isLast) {
      m += getTravelMin(i, currentTravelMode);
      if (m >= 60) {
        h += Math.floor(m / 60);
        m = m % 60;
      }
    }
  });
}

function generateAutoRoute(type) {
  if (allLoadedPlaces.length === 0) {
    alert("먼저 관광지를 검색해주세요.");
    return;
  }
  let sel;
  if (type === "weather")
    sel = sortByWeather(allLoadedPlaces, currentWeatherType).slice(0, 4);
  else if (type === "culture") {
    sel = allLoadedPlaces
      .filter((p) => ["14", "15"].includes(String(p.contenttypeid || "12")))
      .slice(0, 4);
    if (sel.length < 3)
      sel = [...sel, ...allLoadedPlaces.filter((p) => !sel.includes(p))].slice(
        0,
        4,
      );
  } else if (type === "food") {
    const f = allLoadedPlaces
      .filter((p) => String(p.contenttypeid || "12") === "39")
      .slice(0, 2);
    sel = [
      ...f,
      ...allLoadedPlaces
        .filter((p) => String(p.contenttypeid || "12") !== "39")
        .slice(0, 2),
    ];
  } else if (type === "efficient")
    sel = optimizeRoute(allLoadedPlaces).slice(0, 4);
  if (!sel || sel.length === 0) sel = allLoadedPlaces.slice(0, 4);
  routeStops = sel.map((p) => ({ ...p, visitTime: 60 }));
  refreshRoute().then(() => {
    setTimeout(
      () =>
        document
          .getElementById("route-section")
          .scrollIntoView({ behavior: "smooth" }),
      300,
    );
  });
}
function shareRoute() {
  if (routeStops.length === 0) return;
  const tip = getWeatherTip(currentWeatherType);
  let text = `🗺 SKYWATCHER v5 — ${currentCity} 여행 경로\n날씨: ${tip.badge}\n\n`;
  let h = 9,
    m = 0;
  routeStops.forEach((p, i) => {
    text += `${i + 1}. [${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}] ${p.title} (⏱ ${p.visitTime || 60}분)\n`;
    m += (p.visitTime || 60) + 20;
    h += Math.floor(m / 60);
    m = m % 60;
  });
  const modeLabel = currentTravelMode === "driving" ? "차량" : "도보";
  const modeTime =
    currentTravelMode === "driving"
      ? $("#summary-time-drive").text()
      : $("#summary-time-walk").text();
  text += `\n총 예상 시간(${modeLabel}): ${modeTime}\nPowered by SKYWATCHER v5 + 한국관광공사 TourAPI`;
  navigator.clipboard.writeText(text).then(() => {
    $("#share-route-btn").text("✓ 복사됨!");
    setTimeout(() => $("#share-route-btn").text("📋 경로 복사"), 2000);
  });
}
/* ─── Leaflet 지도 상태 ─── */
let _leafletMap = null;
let _leafletMarkers = [];
let _leafletPolyline = null;

function initLeafletMap() {
  if (_leafletMap) return;
  const el = document.getElementById("route-map-leaflet");
  if (!el || el.offsetWidth === 0) return; // 아직 렌더 안됨
  _leafletMap = L.map("route-map-leaflet", { zoomControl: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(_leafletMap);
  _leafletMap.setView([currentLat, currentLng], 13);
}

function updateRouteMap() {
  // 지도 초기화 — 컨테이너가 보이는 상태에서만
  initLeafletMap();
  if (!_leafletMap) {
    // 아직 안 됐으면 다음 프레임에 재시도
    requestAnimationFrame(updateRouteMap);
    return;
  }

  // 크기 재계산 (숨겨졌다 보여지는 경우 타일 깨짐 방지)
  _leafletMap.invalidateSize();

  const stops =
    routeStops.length > 0 ? routeStops : allLoadedPlaces.slice(0, 5);
  const valid = stops.filter((p) => parseFloat(p.mapy || 0) !== 0);
  const $pins = $("#route-map-pins").empty();
  const disp = routeStops.length > 0 ? routeStops : valid.slice(0, 5);

  // 기존 마커·경로 전부 제거
  _leafletMarkers.forEach((m) => _leafletMap.removeLayer(m));
  _leafletMarkers = [];
  _leafletPolyline = null;

  if (valid.length === 0) {
    _leafletMap.setView([currentLat, currentLng], 13);
    return;
  }

  const latlngs = [];
  disp.forEach((p, i) => {
    const lat = parseFloat(p.mapy || 0),
      lng = parseFloat(p.mapx || 0);
    if (!lat || !lng) return;
    const color = STOP_COLORS[i % STOP_COLORS.length];
    const label = String(i + 1);
    const addr = p.addr1 || p.addr2 || "주소 정보 없음";
    const ctLabel = CT_LABEL[String(p.contenttypeid || "12")] || "관광지";
    const ctIcon = CT_ICON[String(p.contenttypeid || "12")] || "🗿";

    const icon = L.divIcon({
      className: "",
      html: `<div style="background:${color};color:#000;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;font-family:sans-serif;border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.55)">${label}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -20],
    });

    const popup = `
      <div style="min-width:180px;font-family:sans-serif">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px">${p.title}</div>
        <div style="font-size:11px;color:#888;margin-bottom:6px">${ctIcon} ${ctLabel}</div>
        <div style="font-size:11px;color:#555;line-height:1.5;border-top:1px solid #eee;padding-top:6px">📍 ${addr}</div>
      </div>`;

    const marker = L.marker([lat, lng], { icon })
      .addTo(_leafletMap)
      .bindPopup(popup, { maxWidth: 240 });
    _leafletMarkers.push(marker);
    latlngs.push([lat, lng]);

    // 핀 버튼 — 주소 한 줄 표시
    const $btn = $(
      `<button class="map-pin-btn" style="border-color:${color};color:${color}">
        <span class="pin-num" style="background:${color};color:#000">${label}</span>
        <span class="pin-info">
          <span class="pin-name">${p.title}</span>
          <span class="pin-addr">${addr}</span>
        </span>
      </button>`,
    );
    $btn.on("click", () => {
      _leafletMap.setView([lat, lng], 16);
      marker.openPopup();
    });
    $pins.append($btn);
  });

  // 실제 도로 경로선 그리기
  if (latlngs.length >= 2) {
    const mode = currentTravelMode;
    const geos = travelCache[mode]?.geometries ?? [];
    const routeColor = mode === "walking" ? "#5ce89a" : "#4ecaff";

    // geometry가 있는 구간은 실제 도로선, 없는 구간은 직선으로
    if (geos.length > 0 && geos.some(Boolean)) {
      // 구간별 polyline — 색상·스타일 통일
      geos.forEach((geo, i) => {
        const seg = geo && geo.length >= 2 ? geo : [latlngs[i], latlngs[i + 1]];
        const pl = L.polyline(seg, {
          color: routeColor,
          weight: 4,
          opacity: 0.88,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(_leafletMap);
        _leafletMarkers.push(pl); // 제거 대상에 포함
      });
    } else {
      // 전체 폴백: 직선 점선
      const pl = L.polyline(latlngs, {
        color: routeColor,
        weight: 3.5,
        opacity: 0.75,
        dashArray: "10 7",
      }).addTo(_leafletMap);
      _leafletMarkers.push(pl);
    }
  }

  if (_leafletMarkers.length === 1) {
    _leafletMap.setView(latlngs[0], 15);
  } else if (_leafletMarkers.length > 1) {
    _leafletMap.fitBounds(L.featureGroup(_leafletMarkers).getBounds().pad(0.2));
  }
}

/* ─── 다중 선택 ─── */
function resetSelectMode() {
  selectMode = false;
  selectedTitles.clear();
  $("#select-mode-btn").removeClass("active").text("☑ 다중 선택");
  updateSelectionBar();
}
function toggleSelectMode() {
  selectMode = !selectMode;
  if (!selectMode) selectedTitles.clear();
  $("#select-mode-btn")
    .toggleClass("active", selectMode)
    .text(selectMode ? "✕ 선택 취소" : "☑ 다중 선택");
  updateSelectionBar();
  renderPlaceGrid();
}
function toggleCardSelect(title) {
  if (selectedTitles.has(title)) selectedTitles.delete(title);
  else selectedTitles.add(title);
  const $card = $(`.place-card[data-title="${title}"]`);
  $card.toggleClass("card-selected", selectedTitles.has(title));
  $card
    .find(".card-checkbox")
    .toggleClass("checked", selectedTitles.has(title));
  updateSelectionBar();
}
function updateSelectionBar() {
  const count = selectedTitles.size;
  if (selectMode && count > 0) {
    $("#selection-bar").removeClass("hidden");
    $("#selection-count-text").text(`${count}개 선택됨`);
  } else $("#selection-bar").addClass("hidden");
}
function addSelectedToRoute() {
  let added = 0;
  selectedTitles.forEach((title) => {
    if (routeStops.some((r) => r.title === title) || routeStops.length >= 6)
      return;
    const p = allLoadedPlaces.find((p) => p.title === title);
    if (p) {
      routeStops.push({ ...p, visitTime: 60 });
      added++;
    }
  });
  resetSelectMode();
  renderPlaceGrid();
  renderRouteStops();
  updateCardButtons();
  if (added > 0) {
    $("#sel-add-btn").text(`✓ ${added}개 추가됨!`);
    setTimeout(() => $("#sel-add-btn").text("경로에 추가 →"), 2000);
    setTimeout(
      () =>
        document
          .getElementById("route-section")
          .scrollIntoView({ behavior: "smooth" }),
      400,
    );
  }
}

/* ─── 시계 ─── */
function updateClock() {
  const n = new Date(),
    pad = (v) => String(v).padStart(2, "0");
  $("#current-time").text(
    `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`,
  );
}
setInterval(updateClock, 1000);
updateClock();

$("head").append(`<style>
  .empty-state{text-align:center;padding:48px 20px;}
  .grid-loading{text-align:center;padding:40px;color:var(--text-muted);font-size:1rem;}
</style>`);

/* ══════════════════════════════════════════════
   이벤트 바인딩
══════════════════════════════════════════════ */
$(document).ready(function () {
  $(document).on("click", ".travel-mode-btn", function () {
    setTravelMode($(this).data("mode"));
  });

  $(".mode-btn").on("click", function () {
    const mode = $(this).data("mode");
    currentMode = mode;
    $(".mode-btn").removeClass("active");
    $(this).addClass("active");
    $(".search-panel").addClass("hidden");
    $(`#panel-${mode}`).removeClass("hidden");
  });
  $("#search-btn").on("click", () =>
    fetchWeather($("#city-input").val().trim()),
  );
  $("#city-input").on("keydown", (e) => {
    if (e.key === "Enter") fetchWeather($("#city-input").val().trim());
  });
  $(document).on("click", ".qc-btn", function () {
    const city = $(this).data("city"),
      lat = parseFloat($(this).data("lat")),
      lng = parseFloat($(this).data("lng"));
    if (lat && lng) {
      currentLat = lat;
      currentLng = lng;
    }
    $("#city-input").val(city);
    fetchWeather(city);
  });
  $("#gps-btn").on("click", fetchByGPS);
  $(document).on("click", ".radius-btn", async function () {
    $(".radius-btn").removeClass("active");
    $(this).addClass("active");
    currentRadius = parseInt($(this).data("radius"));
    $("#places-grid").html('<div class="grid-loading">⏳ 재조회 중...</div>');
    const ctId = currentFilter === "all" ? "" : currentFilter;
    const places = await apiLocationBased(
      currentLat,
      currentLng,
      currentRadius,
      ctId,
    );
    allLoadedPlaces = places;
    renderPlaceGrid();
    updateApiNotice(places.length, true);
  });
  $("#keyword-search-btn").on("click", () =>
    fetchByKeyword($("#keyword-input").val().trim()),
  );
  $("#keyword-input").on("keydown", (e) => {
    if (e.key === "Enter") fetchByKeyword($("#keyword-input").val().trim());
  });
  $(document).on("click", ".kw-tag", function () {
    const kw = $(this).data("kw");
    $("#keyword-input").val(kw);
    fetchByKeyword(kw);
  });
  $(document).on("click", ".tab-btn", function () {
    onTabFilter($(this).data("filter"));
  });
  $(document).on("click", ".sort-btn", function () {
    $(".sort-btn").removeClass("active");
    $(this).addClass("active");
    currentSort = $(this).data("sort");
    currentPage = 1;
    renderPlaceGrid();
  });
  $("#load-more-btn").on("click", () => {
    currentPage++;
    renderPlaceGrid();
  });
  $(document).on("click", ".btn-add-route", function () {
    addToRoute($(this).data("title"));
  });
  $(document).on("click", ".stop-remove", function () {
    removeFromRoute($(this).data("title"));
  });
  $(document).on("click", ".auto-btn", function () {
    generateAutoRoute($(this).data("type"));
  });
  $("#clear-route-btn").on("click", () => {
    routeStops = [];
    travelCache = {
      driving: { legs: [], geometries: [], total: 0 },
      walking: { legs: [], geometries: [], total: 0 },
    };
    renderRouteStops();
    updateCardButtons();
  });
  $("#share-route-btn").on("click", shareRoute);
  $("#select-mode-btn").on("click", toggleSelectMode);
  $("#sel-cancel-btn").on("click", () => {
    resetSelectMode();
    renderPlaceGrid();
  });
  $("#sel-add-btn").on("click", addSelectedToRoute);
  $(document).on("click", ".card-checkbox", function (e) {
    e.stopPropagation();
    toggleCardSelect($(this).data("title"));
  });
  $(document).on("click", ".place-card.select-mode", function (e) {
    if (!$(e.target).closest(".card-checkbox").length)
      toggleCardSelect($(this).data("title"));
  });

  // 창 크기 변경 시 지도 타일 재계산
  window.addEventListener("resize", () => {
    if (_leafletMap) _leafletMap.invalidateSize();
  });

  /* 초기 로딩 — 서울 */
  showLoading("서울 관광지 불러오는 중...");
  showWeatherUnavailable();
  (async () => {
    let places = await apiLocationBased(
      currentLat,
      currentLng,
      currentRadius,
      "",
    );
    if (places.length === 0)
      places = await apiLocationBased(currentLat, currentLng, 10000, "");
    allLoadedPlaces = places;
    setTravelHeader();
    renderPlaceGrid();
    updateApiNotice(allLoadedPlaces.length, true);
    renderRouteStops();
    showContent();
    // 날씨는 좌표로 조회
    const wData = await fetchWeatherByCoords(currentLat, currentLng);
    if (wData) {
      renderCurrent(wData);
      fetchForecastByCoords(currentLat, currentLng).then((f) => {
        if (f) renderForecast(f);
      });
    }
  })().catch(() =>
    showError("관광지 데이터를 불러오지 못했습니다. 네트워크를 확인해주세요."),
  );
});

/* ══════════════════════════════════════════════
   🔧 디버그 패널 — 화면에서 바로 API 응답 확인
══════════════════════════════════════════════ */
(function setupDebugPanel() {
  const panel = document.createElement("div");
  panel.id = "dbg-panel";
  panel.innerHTML = `
    <div id="dbg-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-weight:700;font-size:.85rem">🔧 API 디버그</span>
      <button id="dbg-test" style="padding:4px 10px;border-radius:6px;border:1px solid #4ecaff;background:transparent;color:#4ecaff;cursor:pointer;font-size:.78rem">▶ 지금 테스트</button>
    </div>
    <div id="dbg-log" style="font-size:.75rem;line-height:1.6;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-all"></div>`;
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "90px",
    right: "16px",
    zIndex: "9999",
    width: "340px",
    background: "rgba(10,10,20,.95)",
    border: "1px solid rgba(78,202,255,.4)",
    borderRadius: "12px",
    padding: "12px 14px",
    backdropFilter: "blur(12px)",
    boxShadow: "0 8px 32px rgba(0,0,0,.6)",
    fontFamily: "monospace",
    color: "#ccc",
  });
  document.body.appendChild(panel);

  function log(msg, color = "#ccc") {
    const el = document.getElementById("dbg-log");
    el.innerHTML += `<span style="color:${color}">${msg}</span>\n`;
    el.scrollTop = el.scrollHeight;
  }
  function clear() {
    document.getElementById("dbg-log").innerHTML = "";
  }

  document.getElementById("dbg-test").addEventListener("click", async () => {
    clear();
    const url = `${PROXY_BASE}/api/tour/location?mapX=126.9780&mapY=37.5665&radius=5000&arrange=E`;
    log("📡 TourAPI 호출 중...", "#4ecaff");
    log("URL: " + url.substring(0, 80) + "...", "#888");
    try {
      const res = await fetch(url);
      log(
        `HTTP 상태: ${res.status} ${res.statusText}`,
        res.ok ? "#5ce89a" : "#ff6b6b",
      );
      const text = await res.text();
      log("응답 첫 200자:\n" + text.substring(0, 200), "#f5c842");
      try {
        const json = JSON.parse(text);
        const code = json?.resultCode || json?.response?.header?.resultCode;
        const msg2 = json?.resultMsg || json?.response?.header?.resultMsg;
        const total = json?.response?.body?.totalCount;
        log(`resultCode: ${code}`, code === "0000" ? "#5ce89a" : "#ff6b6b");
        log(`resultMsg: ${msg2}`, "#ccc");
        log(`totalCount: ${total}`, "#5ce89a");
        if (code === "0000" && total > 0) {
          const items = json?.response?.body?.items?.item;
          const first = Array.isArray(items) ? items[0] : items;
          log(`첫 결과: ${first?.title}`, "#5ce89a");
          log("✅ API 정상 작동!", "#5ce89a");
        } else {
          log("⚠️ 결과 없음 또는 오류 — resultCode 확인 필요", "#ff6b6b");
        }
      } catch (e) {
        log("❌ JSON 파싱 실패: " + e.message, "#ff6b6b");
        log("원본응답: " + text.substring(0, 300), "#ff9f43");
      }
    } catch (e) {
      log("❌ fetch 실패: " + e.message, "#ff6b6b");
      log("→ CORS 또는 네트워크 오류일 수 있음", "#ff9f43");
    }
  });

  // 자동으로 1회 테스트
  setTimeout(() => document.getElementById("dbg-test").click(), 800);
})();
