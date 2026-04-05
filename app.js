/**
 * SKYWATCHER v6 — app.js
 * - Parallel API fetching (weather + places simultaneously)
 * - Light/Dark theme toggle
 * - Departure time gated timeline
 * - Skeleton loading for faster perceived performance
 */

const PROXY_BASE = "https://skywatcher-akqa.onrender.com";

/* ── pb (상단 바 없음 — 중앙 오버레이 사용) ── */
function pbStart() {}
function pbDone() {}

/* ── 로딩 멘트 풀 ── */
const LOADING_MSGS = {
  search:  ["🌍 여행지를 탐색하는 중...", "☀️ 날씨 데이터 분석 중...", "🗺️ 명소를 발굴하는 중..."],
  filter:  ["✨ 맞춤 필터 적용 중...", "📍 관련 장소를 추리는 중...", "🔍 검색 중..."],
  gps:     ["📡 위치를 감지하는 중...", "🛰️ GPS 신호 수신 중...", "📍 주변 명소 탐색 중..."],
  keyword: ["🔎 키워드로 명소 탐색 중...", "✈️ 여행지를 찾고 있어요...", "🌐 데이터를 불러오는 중..."],
  default: ["🌤 정보를 불러오는 중...", "⏳ 잠시만 기다려주세요..."],
};
function randMsg(key) {
  const arr = LOADING_MSGS[key] || LOADING_MSGS.default;
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ─── 상태 ─── */
let currentWeatherType = "any";
let currentCity = "서울";
let currentLat = 37.5665;
let currentLng = 126.978;
let routeStops = [];
let currentMode = "city";
let currentTravelMode = "driving";
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
let gpsGranted = false; // GPS 허용 여부 — true일 때만 거리 표시
let selectMode = false;
let selectedTitles = new Set();

/* ─── 컨텐츠 타입 ─── */
const CT_LABEL = { 12:"관광지",14:"문화시설",15:"축제/행사",25:"여행코스",28:"레포츠",32:"숙박",38:"쇼핑",39:"음식점" };
const CT_ICON  = { 12:"🗿",14:"🏛",15:"🎉",25:"🗺",28:"🏄",32:"🏨",38:"🛍",39:"🍽" };
const WEATHER_CT_PREF = {
  sunny:["12","28"], rainy:["14","39"], storm:["14","32"],
  cold:["14","39"],  cloudy:["12","14"], any:["12","14"],
};

/* ─── 유틸 ─── */
const DAYS_KO = ["일","월","화","수","목","금","토"];


/* ─── Auth 상태 ─── */
let _swUser = null;
window.addEventListener("sw:authchange", (e) => {
  _swUser = e.detail;
  renderAuthUI(_swUser);
});

function renderAuthUI(user) {
  if (user) {
    $("#login-btn").addClass("hidden");
    $("#user-info").removeClass("hidden");
    $("#user-avatar").attr("src", user.photoURL || "");
    $("#user-name").text(user.displayName || user.email || "사용자");
    $("#save-route-btn, #share-route-btn").toggle(routeStops.length > 0);
  } else {
    $("#login-btn").removeClass("hidden");
    $("#user-info").addClass("hidden");
    // 비로그인도 공유 가능
  }
}

function requireLogin(cb) {
  if (window._swUser) { cb(); return; }
  if (!window.swAuth) { alert("Firebase가 초기화되지 않았습니다. firebase.js 설정을 확인하세요."); return; }
  window.swAuth.loginGoogle()
    .then(() => { setTimeout(cb, 500); })
    .catch(() => {});
}

/* ─── 지역 피커 데이터 ─── */
const REGIONS = {
  "수도권": [
    { name:"서울", city:"Seoul", lat:37.5665, lng:126.978, emoji:"🏙" },
    { name:"인천", city:"Incheon", lat:37.4563, lng:126.7052, emoji:"✈️" },
    { name:"수원", city:"Suwon", lat:37.2636, lng:127.0286, emoji:"🏰" },
    { name:"가평", city:"Gapyeong", lat:37.8314, lng:127.5101, emoji:"🌲" },
  ],
  "강원": [
    { name:"강릉", city:"Gangneung", lat:37.7519, lng:128.8761, emoji:"🏄" },
    { name:"속초", city:"Sokcho", lat:38.207, lng:128.5918, emoji:"🏔" },
    { name:"춘천", city:"Chuncheon", lat:37.8748, lng:127.7342, emoji:"🦆" },
  ],
  "충청": [
    { name:"대전", city:"Daejeon", lat:36.3504, lng:127.3845, emoji:"🔬" },
    { name:"보령", city:"Boryeong", lat:36.3408, lng:126.6162, emoji:"🖐" },
  ],
  "전라": [
    { name:"전주", city:"Jeonju", lat:35.8242, lng:127.148, emoji:"🥢" },
    { name:"광주", city:"Gwangju", lat:35.1595, lng:126.8526, emoji:"🎨" },
    { name:"여수", city:"Yeosu", lat:34.7604, lng:127.6622, emoji:"🌅" },
    { name:"남해", city:"Namhae", lat:34.8379, lng:127.8924, emoji:"🌿" },
  ],
  "경상": [
    { name:"부산", city:"Busan", lat:35.1796, lng:129.0756, emoji:"🌊" },
    { name:"대구", city:"Daegu", lat:35.8714, lng:128.6014, emoji:"🌹" },
    { name:"경주", city:"Gyeongju", lat:35.8562, lng:129.2247, emoji:"🏛" },
    { name:"울산", city:"Ulsan", lat:35.5384, lng:129.3114, emoji:"🏭" },
    { name:"포항", city:"Pohang", lat:36.032, lng:129.365, emoji:"🦞" },
    { name:"안동", city:"Andong", lat:36.5684, lng:128.7294, emoji:"🎭" },
    { name:"통영", city:"Tongyeong", lat:34.8544, lng:128.4333, emoji:"⛵" },
  ],
  "제주": [
    { name:"제주", city:"Jeju", lat:33.489, lng:126.4983, emoji:"🍊" },
  ],
};

let currentRegion = "수도권";

function initRegionPicker() {
  // 탭 클릭
  $(document).on("click", ".rtab", function() {
    const region = $(this).data("region");
    $(".rtab").removeClass("active");
    $(this).addClass("active");
    currentRegion = region;
    renderRegionCities(region);
  });
  // 초기 렌더
  renderRegionCities("수도권");
}

function renderRegionCities(region) {
  const cities = REGIONS[region] || [];
  const $el = $("#region-cities").empty();
  cities.forEach(c => {
    const $btn = $(`<button class="city-chip" data-city="${c.city}" data-lat="${c.lat}" data-lng="${c.lng}">
      <span>${c.emoji}</span><span>${c.name}</span>
    </button>`);
    $btn.on("click", function() {
      currentLat = parseFloat($(this).data("lat"));
      currentLng = parseFloat($(this).data("lng"));
      const cityName = $(this).data("city");
      $("#city-input").val(cityName);
      fetchWeather(cityName);
    });
    $el.append($btn);
  });
}


const DESC_MAP = {
  "clear sky":"맑음","few clouds":"구름 조금","scattered clouds":"구름 많음",
  "broken clouds":"흐림","overcast clouds":"흐림","light rain":"가벼운 비",
  "moderate rain":"비","heavy rain":"강한 비","light snow":"가벼운 눈",
  "snow":"눈","thunderstorm":"뇌우","mist":"안개","fog":"안개",
  "haze":"연무","drizzle":"이슬비","shower rain":"소나기",
};
const translateDesc = (d) => DESC_MAP[d.toLowerCase()] || d;
const iconUrl = (c) => `https://openweathermap.org/img/wn/${c}@2x.png`;

function unixToTime(u, off) {
  const d = new Date((u + off) * 1000);
  return String(d.getUTCHours()).padStart(2,"0") + ":" + String(d.getUTCMinutes()).padStart(2,"0");
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
    sunny:  { icon:"☀️", text:"완벽한 야외 관광 날씨!", badge:"☀️ 맑음 — 야외 명소 추천", color:"rgba(245,200,66,.1)", border:"rgba(245,200,66,.3)", textColor:"#e6a800" },
    rainy:  { icon:"🌧️",text:"실내 관광을 추천해요",  badge:"🌧️ 비 — 실내 명소 추천",    color:"rgba(78,202,255,.1)",  border:"rgba(78,202,255,.3)",  textColor:"#4ecaff" },
    storm:  { icon:"⛈️", text:"실내에 머무세요",       badge:"⛈️ 뇌우 — 안전 우선",       color:"rgba(255,107,107,.1)", border:"rgba(255,107,107,.3)", textColor:"#ff8888" },
    cold:   { icon:"❄️", text:"방한 준비 철저히!",     badge:"❄️ 눈 — 겨울 명소 추천",    color:"rgba(160,200,255,.1)", border:"rgba(160,200,255,.3)", textColor:"#a0c8ff" },
    cloudy: { icon:"⛅", text:"야외 활동도 무난해요",  badge:"⛅ 흐림 — 전천후 명소 추천",color:"rgba(180,180,200,.1)", border:"rgba(180,180,200,.3)", textColor:"#b0b0c8" },
  };
  return tips[type] || tips.cloudy;
}
function haversine(lat1,lng1,lat2,lng2) {
  const R=6371, dLat=((lat2-lat1)*Math.PI)/180, dLng=((lng2-lng1)*Math.PI)/180;
  const a = Math.sin(dLat/2)**2 + Math.cos((lat1*Math.PI)/180)*Math.cos((lat2*Math.PI)/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function optimizeRoute(places) {
  if (places.length <= 2) return [...places];
  const rem=[...places], route=[rem.shift()];
  while (rem.length) {
    const last=route[route.length-1]; let bi=0,bd=Infinity;
    rem.forEach((p,i) => {
      const d = last.mapx && p.mapx ? haversine(+last.mapy,+last.mapx,+p.mapy,+p.mapx) : 999;
      if (d<bd){bd=d;bi=i;}
    });
    route.push(rem.splice(bi,1)[0]);
  }
  return route;
}
function getWeatherScore(p,wt) {
  const pr=WEATHER_CT_PREF[wt]||[], ct=String(p.contenttypeid||"12");
  return pr[0]===ct ? 2 : pr[1]===ct ? 1.5 : 0;
}
function sortByWeather(places,wt) {
  return [...places].sort((a,b)=>getWeatherScore(b,wt)-getWeatherScore(a,wt));
}

/* ══════════════════════════════════════════════
   라우팅 엔진
══════════════════════════════════════════════ */
async function fetchRouteMinutes(lng1,lat1,lng2,lat2,profile) {
  try {
    const data = await $.ajax({
      url: `${PROXY_BASE}/route`,
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ coordinates:[[lng1,lat1],[lng2,lat2]], profile }),
      timeout: 8000,
      dataType: "json",
    });
    if (!data.duration_min) return null;
    return { min:data.duration_min, geometry:data.geometry??null };
  } catch(_) { return null; }
}

function estimateMinutes(stops,i,profile) {
  const km = haversine(+stops[i].mapy,+stops[i].mapx,+stops[i+1].mapy,+stops[i+1].mapx);
  return profile==="walking"
    ? Math.max(1, Math.round(((km*1.4)/4)*60))
    : Math.max(1, Math.round((km/19)*60));
}

async function fetchOsrm(stops,profile) {
  if (stops.length < 2) return { legs:[], geometries:[] };
  const coords = stops.map(p=>[parseFloat(p.mapx||0), parseFloat(p.mapy||0)]);
  if (coords.some(([lng,lat])=>Math.abs(lng)<0.001||Math.abs(lat)<0.001))
    return { legs:[], geometries:[] };

  const results = await Promise.all(
    coords.slice(0,-1).map((_,i)=>fetchRouteMinutes(coords[i][0],coords[i][1],coords[i+1][0],coords[i+1][1],profile))
  );
  const legs = results.map((r,i)=>r ? r.min : estimateMinutes(stops,i,profile));
  const geometries = results.map(r=>r?.geometry??null);
  return { legs, geometries };
}

async function fetchBothTravelTimes(stops) {
  if (stops.length < 2) {
    travelCache = {
      driving:{ legs:[], geometries:[], total:0 },
      walking:{ legs:[], geometries:[], total:0 },
    };
    return;
  }
  const [driving, walking] = await Promise.all([
    fetchOsrm(stops,"driving"),
    fetchOsrm(stops,"walking"),
  ]);
  travelCache.driving.legs = driving.legs;
  travelCache.driving.geometries = driving.geometries;
  travelCache.walking.legs = walking.legs;
  travelCache.walking.geometries = walking.geometries;
  travelCache.driving.total = driving.legs.reduce((a,b)=>a+b,0);
  travelCache.walking.total = walking.legs.reduce((a,b)=>a+b,0);
}

function setTravelMode(mode) {
  currentTravelMode = mode;
  document.querySelectorAll(".travel-mode-btn").forEach(btn=>
    btn.classList.toggle("active", btn.dataset.mode===mode)
  );
  renderRouteStops();
  updateRouteMap();
}

function getTravelMin(i,mode) {
  const m = mode||currentTravelMode;
  return travelCache[m]?.legs?.[i] ?? (m==="walking" ? 30 : 10);
}

/* ─── UI 헬퍼 ─── */
function showLoading(msg="관광지 정보 불러오는 중...") {
  pbStart();
  $("#error-msg").addClass("hidden");
  $("#spinner-label").text(msg);
  $("#grid-loading-overlay").addClass("active");
}
function setLoadingText(msg) { $("#spinner-label").text(msg); }
function hideLoading() { $("#grid-loading-overlay").removeClass("active"); }
function showError(msg) {
  pbDone();
  hideLoading();
  $("#error-msg").removeClass("hidden").text(msg);
}
function showContent() {
  pbDone();
  hideLoading();
  setTimeout(()=>{ initLeafletMap(); if (_leafletMap) _leafletMap.invalidateSize(); }, 100);
}

/* ─── 스켈레톤 (초기 로드용) ─── */
function showSkeletonGrid(count=6) {
  const $grid = $("#places-grid").empty();
  for (let i=0; i<count; i++) {
    $grid.append(`<div class="skeleton-card">
      <div class="skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line xshort"></div>
      </div>
    </div>`);
  }
}

/* ─── 그리드 오버레이 스피너 (탭·반경·필터 전환용) ─── */
function showGridLoading(msg=randMsg("filter")) {
  $("#spinner-label").text(msg);
  $("#grid-loading-overlay").addClass("active");
}
function hideGridLoading() {
  $("#grid-loading-overlay").removeClass("active");
}

/* ══════════════════════════════════════════════
   관광공사 API
══════════════════════════════════════════════ */
function apiLocationBased(lat,lng,radius,contentTypeId="") {
  let qs = `mapX=${lng}&mapY=${lat}&radius=${radius}&arrange=E`;
  // 행사(15)는 festival API로 별도 처리
  if (contentTypeId && contentTypeId!=="all") {
    if (contentTypeId === "15") return apiFestival(lat, lng);
    qs += `&contentTypeId=${contentTypeId}`;
  }
  return $.ajax({ url: `${PROXY_BASE}/api/tour/location?${qs}`, method:"GET", dataType:"json" })
    .then(d => parseTourItems(d, true))
    .catch(e=>{ console.error("locationBased 오류:",e); return []; });
}

/* 현재 진행 중인 행사만 festival API로 조회 (실패 시 빈 배열) */
let _serverAlive = null; // null=미확인, true/false
const _introCache = new Map();
async function checkServerAlive() {
  if (_serverAlive !== null) return _serverAlive;
  try {
    await $.ajax({ url: `${PROXY_BASE}/ping`, method:"GET", dataType:"json", timeout:3000 });
    _serverAlive = true;
  } catch(e) { _serverAlive = false; }
  return _serverAlive;
}
async function apiFestival(lat, lng) {
  const alive = await checkServerAlive();
  if (!alive) return [];
  const qs = (lat && lng) ? `?mapX=${lng}&mapY=${lat}` : "";
  try {
    const data = await $.ajax({ url: `${PROXY_BASE}/api/tour/festival${qs}`, method:"GET", dataType:"json" });
    return parseTourItems(data, false);
  } catch(e) {
    return [];
  }
}

/* location + festival 병렬 조회 (행사 포함 전체) */
async function apiLocationWithFestival(lat, lng, radius) {
  const [places, festivals] = await Promise.all([
    apiLocationBased(lat, lng, radius, ""),
    apiFestival(lat, lng),
  ]);
  const seen = new Set(places.map(p=>p.contentid));
  return [...places, ...festivals.filter(f=>!seen.has(f.contentid))];
}

function apiKeyword(keyword,contentTypeId="") {
  let qs = `keyword=${encodeURIComponent(keyword)}&arrange=A`;
  if (contentTypeId && contentTypeId!=="all") qs += `&contentTypeId=${contentTypeId}`;
  return $.ajax({ url: `${PROXY_BASE}/api/tour/keyword?${qs}`, method:"GET", dataType:"json" })
    .then(d => parseTourItems(d, true))
    .catch(e=>{ console.error("keyword API 오류:",e); return []; });
}

function parseTourItems(data, excludeFestival=false) {
  try {
    const header = data?.response?.header||data?.header;
    const code = header?.resultCode;
    if (code && code!=="0000") return [];
    const items = data?.response?.body?.items?.item;
    if (!items) return [];
    const arr = Array.isArray(items) ? items : [items];
    // ── 현재 운영 중인 행사(contenttypeid=15)만 통과 ──
    const today = new Date();
    today.setHours(0,0,0,0);
    return arr.filter(p => {
      if (String(p.contenttypeid) !== "15") return true; // 행사가 아니면 통과
      if (excludeFestival) return false; // location/keyword API: 행사는 festival API로 별도 처리
      // eventstartdate / evenenddate 형식: "20260301" ~ "20260331"
      const endRaw = p.evenenddate || p.eventenddate || "";
      const startRaw = p.eventstartdate || "";
      if (!endRaw && !startRaw) return !excludeFestival; // location API에서는 날짜 없는 행사 제외
      const toDate = (raw) => {
        if (!raw || raw.length < 8) return null;
        return new Date(raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6,8));
      };
      const startDate = toDate(startRaw);
      const endDate = toDate(endRaw);
      // 아직 시작 안 된 행사 제외
      if (startDate && startDate > today) return false;
      // 이미 종료된 행사 제외
      if (endDate && endDate < today) return false;
      return true;
    });
  } catch(_) { return []; }
}

/* ── 상세 개요 API ── */
async function fetchPlaceDetail(contentId) {
  if (!contentId) return null;
  try {
    const data = await $.ajax({ url: `${PROXY_BASE}/api/tour/detail?contentId=${contentId}`, method:"GET", dataType:"json" });
    const item = data?.response?.body?.items?.item;
    if (!item) return null;
    const it = Array.isArray(item) ? item[0] : item;
    return it?.overview || null;
  } catch(e) { return null; }
}

/* ── 운영시간/휴일 API (detailIntro) ── */
async function fetchPlaceIntro(contentId, contentTypeId) {
  if (!contentId) return null;
  const key = String(contentId);
  if (_introCache.has(key)) return _introCache.get(key);
  try {
    const data = await $.ajax({ url: `${PROXY_BASE}/api/tour/intro?contentId=${contentId}&contentTypeId=${contentTypeId||12}`, method:"GET", dataType:"json" });
    const item = data?.response?.body?.items?.item;
    if (!item) return null;
    const it = Array.isArray(item) ? item[0] : item;
    const info = {
      usetime:    it.usetime    || it.usetimeculture || it.usetimefestival || it.playtime || "",
      restdate:   it.restdate   || it.restdateculture || it.restdatefestival || "",
      parking:    it.parking    || it.parkingculture  || "",
      infocenter: it.infocenter || it.infocenterculture || it.infocenterfestival || "",
      eventstart: it.eventstartdate || "",
      eventend:   it.eventenddate   || "",
    };
    _introCache.set(key, info);
    return info;
  } catch(e) { return null; }
}

/* ══════════════════════════════════════════════
   날씨 API
══════════════════════════════════════════════ */
async function fetchWeatherByCoords(lat,lng) {
  try {
    return await $.ajax({ url: `${PROXY_BASE}/api/weather/coords?lat=${lat}&lon=${lng}`, method:"GET", dataType:"json" });
  } catch(e) { return null; }
}
async function fetchWeatherByCity(city) {
  try {
    return await $.ajax({ url: `${PROXY_BASE}/api/weather/city?q=${encodeURIComponent(city)}`, method:"GET", dataType:"json" });
  } catch(e) { return null; }
}
async function fetchForecastByCoords(lat,lng) {
  try {
    return await $.ajax({ url: `${PROXY_BASE}/api/weather/forecast?lat=${lat}&lon=${lng}`, method:"GET", dataType:"json" });
  } catch(e) { return null; }
}

/* ─── 탭 필터 ─── */
async function onTabFilter(filter) {
  if (currentFilter===filter) return;
  currentFilter = filter;
  currentPage = 1;
  resetSelectMode();
  $(".tab-btn").removeClass("active");
  $(`.tab-btn[data-filter="${filter}"]`).addClass("active");
  showGridLoading();
  $("#pagination-wrap").hide();
  $("#api-notice").hide();

  const ctId = filter==="all" ? "" : filter;
  let places = [];
  if (currentMode==="keyword" && currentKeyword) {
    places = await apiKeyword(currentKeyword, ctId);
  } else {
    if (!ctId) {
      // 전체 탭: 행사는 festival API로 별도 병합
      places = await apiLocationWithFestival(currentLat, currentLng, currentRadius);
      if (places.length===0)
        places = await apiLocationWithFestival(currentLat, currentLng, 10000);
    } else {
      places = await apiLocationBased(currentLat, currentLng, currentRadius, ctId);
      if (places.length===0)
        places = await apiLocationBased(currentLat, currentLng, 10000, ctId);
    }
  }
  allLoadedPlaces = places;
  hideGridLoading();
  renderPlaceGrid();
  updateApiNotice(places.length, true);
  pbDone();
}

/* ─── 날씨 없음 표시 ─── */
function showWeatherUnavailable() {
  $("#city-display").text(currentCity);
  $("#country-display").text("날씨 정보 없음");
  $("#weather-desc").text("날씨 API 키를 입력하면 날씨도 표시됩니다");
  $("#temp-main,#feels-like,#temp-max,#temp-min").text("—");
  $("#humidity").text("—"); $("#humidity-bar").css("width","0%"); $("#sunrise,#sunset").text("—");
  $("#sunrise,#sunset").text("—");
  const tip = getWeatherTip("any");
  $("#weather-tip").text("🌤 날씨 기반 추천을 위해 OpenWeatherMap API 키를 입력하세요").css({ background:tip.color, borderColor:tip.border, color:tip.textColor });
  $("#travel-weather-badge").text("📍 위치 기반 추천").css({ background:tip.color, borderColor:tip.border, color:tip.textColor });
  $("#weather-auto-icon").text("📍");
  $("#forecast-list").html('<p style="color:var(--text-muted);font-size:.83rem;padding:14px 0">날씨 정보를 불러오지 못했습니다</p>');
}

/* ── 도시 좌표 DB ── */
const CITY_COORDS = {
  seoul:{lat:37.5665,lng:126.978}, 서울:{lat:37.5665,lng:126.978},
  busan:{lat:35.1796,lng:129.0756}, 부산:{lat:35.1796,lng:129.0756},
  jeju:{lat:33.489,lng:126.4983}, 제주:{lat:33.489,lng:126.4983},
  incheon:{lat:37.4563,lng:126.7052}, 인천:{lat:37.4563,lng:126.7052},
  daegu:{lat:35.8714,lng:128.6014}, 대구:{lat:35.8714,lng:128.6014},
  daejeon:{lat:36.3504,lng:127.3845}, 대전:{lat:36.3504,lng:127.3845},
  gwangju:{lat:35.1595,lng:126.8526}, 광주:{lat:35.1595,lng:126.8526},
  jeonju:{lat:35.8242,lng:127.148}, 전주:{lat:35.8242,lng:127.148},
  gyeongju:{lat:35.8562,lng:129.2247}, 경주:{lat:35.8562,lng:129.2247},
  suwon:{lat:37.2636,lng:127.0286}, 수원:{lat:37.2636,lng:127.0286},
  gangneung:{lat:37.7519,lng:128.8761}, 강릉:{lat:37.7519,lng:128.8761},
  sokcho:{lat:38.207,lng:128.5918}, 속초:{lat:38.207,lng:128.5918},
  yeosu:{lat:34.7604,lng:127.6622}, 여수:{lat:34.7604,lng:127.6622},
  andong:{lat:36.5684,lng:128.7294}, 안동:{lat:36.5684,lng:128.7294},
  tongyeong:{lat:34.8544,lng:128.4333}, 통영:{lat:34.8544,lng:128.4333},
  chuncheon:{lat:37.8748,lng:127.7342}, 춘천:{lat:37.8748,lng:127.7342},
  ulsan:{lat:35.5384,lng:129.3114}, 울산:{lat:35.5384,lng:129.3114},
  pohang:{lat:36.032,lng:129.365}, 포항:{lat:36.032,lng:129.365},
  namhae:{lat:34.8379,lng:127.8924}, 남해:{lat:34.8379,lng:127.8924},
  boryeong:{lat:36.3408,lng:126.6162}, 보령:{lat:36.3408,lng:126.6162},
  gapyeong:{lat:37.8314,lng:127.5101}, 가평:{lat:37.8314,lng:127.5101},
};
function getCityCoords(city) {
  const k = city.toLowerCase().trim();
  return CITY_COORDS[k] ||
    Object.entries(CITY_COORDS).find(([c])=>k.includes(c)||c.includes(k))?.[1] ||
    null;
}

/* ══════════════════════════════════════════════
   도시 검색 — 날씨 + 관광지 병렬 처리
══════════════════════════════════════════════ */
async function fetchWeather(city) {
  if (!city.trim()) return;
  showLoading(randMsg("search"));
  resetSelectMode();
  currentMode = "city";
  currentFilter = "all";
  currentKeyword = "";
  currentPage = 1;
  $(".tab-btn").removeClass("active");
  $(`.tab-btn[data-filter="all"]`).addClass("active");
  routeStops = [];

  // 로컬 좌표 DB에서 먼저 좌표 설정 (병렬 요청에 쓸 초기 좌표)
  const localCoords = getCityCoords(city);
  if (localCoords) {
    currentLat = localCoords.lat;
    currentLng = localCoords.lng;
    currentCity = city;
  }

  setLoadingText(randMsg("search"));

  // ★ 날씨 + 관광지 병렬 요청
  const [wData, places] = await Promise.all([
    fetchWeatherByCity(city),
    apiLocationWithFestival(currentLat, currentLng, currentRadius),
  ]);

  // 날씨 처리
  if (wData) {
    currentLat = wData.coord.lat;
    currentLng = wData.coord.lon;
    currentCity = wData.name;
    renderCurrent(wData);
    fetchForecastByCoords(currentLat, currentLng).then(f=>{ if(f) renderForecast(f); });
  } else {
    if (!localCoords) {
      showError("도시를 찾을 수 없습니다. 다시 입력해주세요.");
      return;
    }
    showWeatherUnavailable();
  }

  // 관광지 처리 — 병렬 결과가 좌표 업데이트 전이면 재시도
  let finalPlaces = places;
  if (finalPlaces.length === 0) {
    finalPlaces = await apiLocationWithFestival(currentLat, currentLng, 10000);
  }
  allLoadedPlaces = finalPlaces;
  setTravelHeader();
  renderPlaceGrid();
  updateApiNotice(finalPlaces.length, true);
  showContent();
  renderRouteStops();
}

/* ─── GPS ─── */
async function fetchByGPS() {
  $("#gps-btn").prop("disabled",true).find("#gps-btn-text").text("📡 감지 중...");
  $("#gps-status").removeClass("hidden").text("위치 감지 중...");
  if (!navigator.geolocation) { showError("위치 서비스 미지원 브라우저입니다."); return; }

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
      $("#gps-status").removeClass("hidden").text(`✅ ${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}`);
      gpsGranted = true;
      $("#radius-row").show();
      $("#gps-btn").prop("disabled",false).find("#gps-btn-text").text("🔄 새로고침");
      showLoading(randMsg("gps"));

      // ★ 날씨 + 관광지 병렬 요청
      const [wData, places] = await Promise.all([
        fetchWeatherByCoords(currentLat, currentLng),
        apiLocationWithFestival(currentLat, currentLng, currentRadius),
      ]);

      if (wData) {
        currentCity = wData.name||"내 위치";
        renderCurrent(wData);
        fetchForecastByCoords(currentLat, currentLng).then(f=>{ if(f) renderForecast(f); });
      } else showWeatherUnavailable();

      let finalPlaces = places;
      if (finalPlaces.length===0)
        finalPlaces = await apiLocationWithFestival(currentLat, currentLng, 10000);
      allLoadedPlaces = finalPlaces;
      setTravelHeader();
      renderPlaceGrid();
      updateApiNotice(finalPlaces.length, true);
      showContent();
      routeStops = [];
      renderRouteStops();
    },
    ()=>{
      $("#gps-btn").prop("disabled",false).find("#gps-btn-text").text("📡 위치 감지");
      $("#gps-status").text("⚠️ 위치 권한이 거부됐습니다.");
    },
    { timeout:10000, enableHighAccuracy:true }
  );
}

/* ─── 키워드 검색 ─── */
async function fetchByKeyword(keyword) {
  if (!keyword.trim()) return;
  showLoading(randMsg("keyword"));
  resetSelectMode();
  currentMode = "keyword";
  currentKeyword = keyword;
  currentFilter = "all";
  currentPage = 1;
  $(".tab-btn").removeClass("active");
  $(`.tab-btn[data-filter="all"]`).addClass("active");

  let places = await apiKeyword(keyword, "");
  if (places.length===0)
    places = await apiLocationWithFestival(currentLat, currentLng, 10000);
  allLoadedPlaces = places;
  if (places.length>0 && places[0].mapx) {
    currentLat = parseFloat(places[0].mapy);
    currentLng = parseFloat(places[0].mapx);
  }
  currentCity = places.length>0 ? `"${keyword}" 검색결과` : currentCity;

  // ★ 날씨는 비동기로 분리 — 관광지 먼저 표시
  fetchWeatherByCoords(currentLat, currentLng).then(wData=>{
    if (wData) renderCurrent(wData);
    else showWeatherUnavailable();
  });

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
    sunny:"맑은 날씨 — 야외 명소를 먼저 보여드립니다.",
    rainy:"비 오는 날 — 실내 명소를 추천합니다.",
    cold:"겨울 날씨 — 실내·설경 명소를 추천합니다.",
    cloudy:"흐린 날씨 — 전천후 명소를 안내합니다.",
    storm:"뇌우 — 안전한 실내 명소를 추천합니다.",
    any:"한국관광공사 실시간 데이터 기반 추천입니다.",
  };
  $("#travel-subtitle").text(sub[currentWeatherType]||sub.any);
  $("#travel-source-badge").html(`관광지 추천 <span class="api-live-tag">🔴 LIVE</span>`);
}
function updateApiNotice(count,isLive) {
  if (isLive && count>0) {
    $("#api-notice").show();
    $("#api-notice-text").text("한국관광공사 TourAPI v2 실시간 데이터");
    $("#api-result-count").text(count+"건");
  } else $("#api-notice").hide();
}

/* ─── 날씨 렌더 ─── */
function renderCurrent(data) {
  const { name,sys,weather,main,wind,visibility,clouds,timezone } = data;
  const wType = getWeatherType(weather[0].id);
  currentWeatherType = wType;
  const tip = getWeatherTip(wType);
  $("#city-display").text(name);
  $("#country-display").text(sys.country);
  $("#weather-desc").text(translateDesc(weather[0].description));
  $("#weather-icon").attr({ src:iconUrl(weather[0].icon), alt:weather[0].description });
  $("#temp-main").text(Math.round(main.temp));
  $("#feels-like").text(Math.round(main.feels_like));
  $("#temp-max").text(Math.round(main.temp_max));
  $("#temp-min").text(Math.round(main.temp_min));
  $("#humidity").text(main.humidity);
  $("#humidity-bar").css("width", Math.min(100,main.humidity)+"%");
  $("#sunrise").text(unixToTime(sys.sunrise, timezone));
  $("#sunset").text(unixToTime(sys.sunset, timezone));
  $("#weather-tip").text(tip.icon+" "+tip.text).css({ background:tip.color, borderColor:tip.border, color:tip.textColor });
  $("#travel-weather-badge").text(tip.badge).css({ background:tip.color, borderColor:tip.border, color:tip.textColor });
  $("#weather-auto-icon").text(tip.icon);
}
function renderForecast(data) {
  const daily = {};
  data.list.forEach(item=>{
    const d=item.dt_txt.split(" ")[0], t=item.dt_txt.split(" ")[1];
    if (!daily[d]||t==="12:00:00") daily[d]=item;
  });
  const $strip = $("#forecast-list").empty();
  Object.values(daily).slice(0,5).forEach((item,i)=>{
    const d = new Date(item.dt_txt.split(" ")[0]);
    $strip.append(`<div class="fc-item" style="animation-delay:${i*0.06}s">
      <div class="fc-day">${i===0?"오늘":DAYS_KO[d.getDay()]}</div>
      <img src="${iconUrl(item.weather[0].icon)}" alt="">
      <div class="fc-temp">${Math.round(item.main.temp)}°</div>
      <div class="fc-desc">${translateDesc(item.weather[0].description)}</div>
    </div>`);
  });
}

/* ─── 그리드 렌더 ─── */
function renderPlaceGrid() {
  const sorted = getSortedPlaces(allLoadedPlaces);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const page = sorted.slice(start, start + PAGE_SIZE);
  const $grid = $("#places-grid").empty();

  if (page.length===0) {
    const hint = currentMode==="keyword"
      ? `"${currentKeyword}" 키워드 결과가 없습니다`
      : "이 카테고리의 관광지가 없습니다";
    $grid.html(`<div class="empty-state"><div style="font-size:2.2rem;margin-bottom:10px">🔍</div><div style="font-size:1rem;color:var(--text-muted)">${hint}</div><div style="font-size:.8rem;color:var(--text-muted);margin-top:5px">다른 키워드나 카테고리를 시도해보세요</div></div>`);
    $("#pagination-wrap").hide();
    return;
  }
  page.forEach((p,i)=>buildPlaceCard(p,i,$grid));
  renderPagination(totalPages);
  updateRouteMap();
}

function renderPagination(totalPages) {
  if (totalPages <= 1) { $("#pagination-wrap").hide(); return; }
  const $nums = $("#page-numbers").empty();
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible/2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

  if (start > 1) {
    $nums.append(`<button class="page-btn" data-page="1">1</button>`);
    if (start > 2) $nums.append(`<span class="page-info">…</span>`);
  }
  for (let i = start; i <= end; i++) {
    $nums.append(`<button class="page-btn${i===currentPage?" active":""}" data-page="${i}">${i}</button>`);
  }
  if (end < totalPages) {
    if (end < totalPages - 1) $nums.append(`<span class="page-info">…</span>`);
    $nums.append(`<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`);
  }
  $("#page-prev").prop("disabled", currentPage <= 1);
  $("#page-next").prop("disabled", currentPage >= totalPages);
  $("#pagination-wrap").show();
}
function getSortedPlaces(places) {
  if (currentSort==="weather") return sortByWeather(places, currentWeatherType);
  if (currentSort==="modified") return [...places].sort((a,b)=>(b.modifiedtime||0)-(a.modifiedtime||0));
  return places;
}
function buildPlaceCard(p,i,$grid) {
  if (!p||!p.title) return;
  const inRoute = routeStops.some(r=>r.title===p.title);
  const isSelected = selectedTitles.has(p.title);
  const ctId = String(p.contenttypeid||"12");
  const toHttps = url => url ? url.replace(/^http:\/\//,"https://") : null;
  const imgSrc = toHttps(p.firstimage)||toHttps(p.firstimage2)||"https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=600&q=80";
  let distHtml = "";
  if (gpsGranted && p.dist) {
    const d=parseFloat(p.dist);
    distHtml=`<span class="distance-badge">${d>=1000?(d/1000).toFixed(1)+"km":Math.round(d)+"m"}</span>`;
  }
  const ws = getWeatherScore(p, currentWeatherType);
  const wBadge = ws>=2
    ? `<span class="place-weather-tag tag-sunny">☀️ 지금 추천</span>`
    : `<span class="place-weather-tag tag-any">🌤 언제나 OK</span>`;
  const modeClass = selectMode ? "select-mode" : "";
  const selectedClass = isSelected ? "card-selected" : "";

  $grid.append(`
    <div class="place-card ${modeClass} ${selectedClass}" data-title="${p.title}" style="animation-delay:${i*0.04}s">
      ${selectMode ? `<div class="card-checkbox ${isSelected?"checked":""}" data-title="${p.title}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      </div>` : ""}
      <div class="place-thumb-wrap">
        <img class="place-thumb" src="${imgSrc}" alt="${p.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=600&q=80'">
        <span class="place-category-tag">${CT_ICON[ctId]||"🗿"} ${CT_LABEL[ctId]||"관광지"}</span>
      </div>
      <div class="place-body">
        <div class="place-name">${p.title}</div>
        <div class="place-addr">${p.addr1||"주소 정보 없음"}</div>
        <div class="place-footer">${distHtml}${wBadge}</div>
        ${!selectMode ? `<button class="btn-add-route ${inRoute?"added":""}" data-title="${p.title}">${inRoute?"✓ 추가됨":"+ 경로 추가"}</button>` : ""}
      </div>
    </div>`);
}

/* ══════════════════════════════════════════════
   상세 모달
══════════════════════════════════════════════ */
function openDetailModal(title) {
  const p = allLoadedPlaces.find(p => p.title === title);
  if (!p) return;
  const toHttps = url => url ? url.replace(/^http:\/\//, "https://") : null;
  const imgSrc = toHttps(p.firstimage) || toHttps(p.firstimage2) || "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800&q=80";
  const ctId = String(p.contenttypeid || "12");
  const ctLabel = CT_LABEL[ctId] || "관광지";
  const ctIcon = CT_ICON[ctId] || "🗿";
  const inRoute = routeStops.some(r => r.title === p.title);
  const addr = [p.addr1, p.addr2].filter(Boolean).join(" ") || "주소 정보 없음";
  const ws = getWeatherScore(p, currentWeatherType);
  const tip = getWeatherTip(currentWeatherType);

  // 거리 포맷 (GPS 허용 시에만)
  let distStr = "";
  if (gpsGranted && p.dist) {
    const d = parseFloat(p.dist);
    distStr = d >= 1000 ? (d/1000).toFixed(1)+"km" : Math.round(d)+"m";
  }

  // 개요 텍스트 (없으면 날씨 추천 메시지)
  // 비동기 개요는 모달 열린 뒤 채움
  const desc = p.overview || (ws >= 2 ? `${tip.icon} 현재 날씨에 가장 잘 맞는 명소입니다.` : "한국관광공사 실시간 데이터 기반 추천 관광지입니다.");

  const $overlay = $(`<div class="modal-overlay" id="detail-modal">
    <div class="modal-box">
      <button class="modal-close-x" id="modal-close-x">✕</button>
      <img class="modal-img" src="${imgSrc}" alt="${p.title}" onerror="this.src='https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800&q=80'">
      <div class="modal-body">
        <div class="modal-category">${ctIcon} ${ctLabel}</div>
        <div class="modal-title">${p.title}</div>
        <div class="modal-addr">📍 ${addr}</div>
        <div class="modal-desc">${desc}</div>
        <div class="modal-meta">
          ${distStr ? `<div class="modal-meta-item"><div class="modal-meta-label">거리</div><div class="modal-meta-val">${distStr}</div></div>` : ""}
          <div class="modal-meta-item"><div class="modal-meta-label">카테고리</div><div class="modal-meta-val">${ctLabel}</div></div>
          <div class="modal-meta-item"><div class="modal-meta-label">날씨 적합도</div><div class="modal-meta-val">${ws >= 2 ? "⭐ 지금 추천" : "✓ 언제나 OK"}</div></div>
          ${p.tel ? `<div class="modal-meta-item"><div class="modal-meta-label">전화</div><div class="modal-meta-val" style="font-size:.76rem">${p.tel}</div></div>` : ""}
        </div>
        <div id="modal-intro-info" class="modal-intro-section" style="display:none;">
          <div id="modal-usetime" class="modal-intro-row" style="display:none;"><span class="modal-intro-label">🕐 운영시간</span><span class="modal-intro-val" id="modal-usetime-val"></span></div>
          <div id="modal-restdate" class="modal-intro-row" style="display:none;"><span class="modal-intro-label">🚫 휴무일</span><span class="modal-intro-val" id="modal-restdate-val"></span></div>
          <div id="modal-eventdate" class="modal-intro-row" style="display:none;"><span class="modal-intro-label">📅 행사기간</span><span class="modal-intro-val" id="modal-eventdate-val"></span></div>
          <div id="modal-parking" class="modal-intro-row" style="display:none;"><span class="modal-intro-label">🅿️ 주차</span><span class="modal-intro-val" id="modal-parking-val"></span></div>
        </div>
        <div class="modal-actions">
          <button class="modal-btn-add${inRoute?" added":""}" id="modal-add-btn" data-title="${p.title}">
            ${inRoute ? "✓ 경로에 추가됨" : "+ 경로에 추가"}
          </button>
          <button class="modal-btn-close" id="modal-close-btn">닫기</button>
        </div>
      </div>
    </div>
  </div>`);

  $("body").append($overlay);
  // overview 비동기 로드
  if (!p.overview && p.contentid) {
    fetchPlaceDetail(p.contentid).then(ov => {
      if (ov) {
        p.overview = ov;
        $("#detail-modal .modal-desc").text(ov);
      }
    });
  }
  // 운영시간/휴일 비동기 로드
  if (p.contentid) {
    // 로딩 중 placeholder
    $("#modal-intro-info").show().html('<div class="modal-intro-row" style="color:var(--text-muted);font-size:.78rem;">⏳ 운영정보 불러오는 중...</div>');
    fetchPlaceIntro(p.contentid, p.contenttypeid).then(info => {
      // placeholder 초기화
      $("#modal-intro-info").hide().html(`
        <div id="modal-usetime" class="modal-intro-row" style="display:none;"><span class="modal-intro-label">🕐 운영시간</span><span class="modal-intro-val" id="modal-usetime-val"></span></div>
        <div id="modal-restdate" class="modal-intro-row" style="display:none;"><span class="modal-intro-label">🚫 휴무일</span><span class="modal-intro-val" id="modal-restdate-val"></span></div>
        <div id="modal-eventdate" class="modal-intro-row" style="display:none;"><span class="modal-intro-label">📅 행사기간</span><span class="modal-intro-val" id="modal-eventdate-val"></span></div>
        <div id="modal-parking" class="modal-intro-row" style="display:none;"><span class="modal-intro-label">🅿️ 주차</span><span class="modal-intro-val" id="modal-parking-val"></span></div>
      `);
      if (!info) return;
      let hasAny = false;
      const cleanHtml = (s) => {
        if (!s) return "";
        return s.replace(/<br\s*\/?>/gi, "\n")
                .replace(/<[^>]+>/g, "")
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/\n+/g, "\n")
                .trim();
      };
      const setVal = (id, raw) => {
        const val = cleanHtml(raw);
        if (val) {
          $(`#${id}`).show();
          $(`#${id}-val`).html(val.replace(/\n/g, "<br>"));
          hasAny = true;
        }
      };
      setVal("modal-usetime",  info.usetime);
      setVal("modal-restdate", info.restdate);
      setVal("modal-parking",  info.parking);
      if (info.eventstart || info.eventend) {
        const fmt = s => s ? s.replace(/(\d{4})(\d{2})(\d{2})/, "$1.$2.$3") : "";
        const range = [fmt(info.eventstart), fmt(info.eventend)].filter(Boolean).join(" ~ ");
        setVal("modal-eventdate", range);
      }
      if (hasAny) $("#modal-intro-info").show();
    });
  }

  const closeModal = () => {
    $overlay.addClass("closing");
    setTimeout(() => $overlay.remove(), 150);
  };

  $("#modal-close-x, #modal-close-btn").on("click", closeModal);
  $overlay.on("click", function(e) { if ($(e.target).is(".modal-overlay")) closeModal(); });
  $(document).one("keydown.modal", function(e) { if (e.key === "Escape") closeModal(); });

  $("#modal-add-btn").on("click", function() {
    const t = $(this).data("title");
    if (routeStops.some(r => r.title === t)) {
      removeFromRoute(t);
      $(this).removeClass("added").text("+ 경로에 추가");
    } else {
      if (routeStops.length >= 6) { alert("경로는 최대 6개까지 가능합니다."); return; }
      const pl = allLoadedPlaces.find(p => p.title === t);
      if (pl) { routeStops.push({...pl, visitTime:60}); refreshRoute(); }
      $(this).addClass("added").text("✓ 경로에 추가됨");
    }
    updateCardButtons();
  });
}

/* ─── 경로 플래너 ─── */
function addToRoute(title) {
  const p = allLoadedPlaces.find(p=>p.title===title);
  if (!p) return;
  if (routeStops.some(r=>r.title===title)) { removeFromRoute(title); return; }
  if (routeStops.length>=6) { alert("경로는 최대 6개까지 추가 가능합니다."); return; }
  routeStops.push({ ...p, visitTime:60 });
  refreshRoute();
}
function removeFromRoute(title) {
  routeStops = routeStops.filter(r=>r.title!==title);
  refreshRoute();
}
async function refreshRoute() {
  await fetchBothTravelTimes(routeStops);
  renderRouteStops();
  updateCardButtons();
}
function updateCardButtons() {
  $(".btn-add-route").each(function() {
    const t=$(this).data("title"), inR=routeStops.some(r=>r.title===t);
    $(this).toggleClass("added",inR).text(inR?"✓ 경로에 추가됨":"+ 경로에 추가");
  });
}

const STOP_COLORS = ["#f5c842","#4ecaff","#ff6b6b","#5ce89a","#ff9f43","#a29bfe"];

function fmtMin(min) {
  if (!min && min!==0) return "—";
  const h=Math.floor(min/60), m=min%60;
  return h>0 ? `${h}시간 ${m>0?m+"분":""}` : `${m}분`;
}

function renderRouteStops() {
  const $list = $("#route-stops-list"), count = routeStops.length;
  $("#stop-count").text(count+"개");
  $("#route-empty").toggle(count===0);
  $("#route-summary").toggle(count>0);
  $("#clear-route-btn, #share-route-btn").toggle(count>0);
  if (window._swUser) $("#save-route-btn").toggle(count>0);
  $("#route-legend").toggle(count>0);
  // 출발 시간 입력 행: 경로 있을 때만 표시
  $("#depart-row").toggle(count>0);
  // 타임라인: 경로 있고 출발시간 입력됐을 때만 표시
  const hasDepart = !!($("#depart-time-input").val());
  $("#route-timeline-section").toggle(count>0 && hasDepart);

  if (count>0) {
    const visitTotal = routeStops.reduce((s,p)=>s+(p.visitTime||60),0);
    const driveTotal = travelCache.driving.total||0;
    const walkTotal  = travelCache.walking.total||0;
    $("#summary-count").text(count+"곳");
    $("#summary-time-drive").text(fmtMin(visitTotal+driveTotal));
    $("#summary-time-walk").text(fmtMin(visitTotal+walkTotal));
    $(".summary-mode-drive").toggleClass("mode-active", currentTravelMode==="driving");
    $(".summary-mode-walk").toggleClass("mode-active",  currentTravelMode==="walking");
  }

  $list.find(".route-stop-item").remove();
  routeStops.forEach((p,i)=>{
    const color = STOP_COLORS[i%STOP_COLORS.length];
    const isLast = i===routeStops.length-1;
    const np = routeStops[i+1];
    const lat = parseFloat(p.mapy||0), lng = parseFloat(p.mapx||0);
    let legHtml = "";
    if (!isLast && lat && np?.mapy) {
      const km = haversine(lat,lng,+np.mapy,+np.mapx).toFixed(1);
      const dMin = getTravelMin(i,"driving");
      const wMin = getTravelMin(i,"walking");
      legHtml = `<div class="stop-leg">
        <div class="stop-leg-line"></div>
        <div class="stop-leg-times">
          <span class="leg-chip leg-drive${currentTravelMode==="driving"?" active":""}">🚗 ${dMin}분</span>
          <span class="leg-chip leg-walk${currentTravelMode==="walking"?" active":""}">🚶 ${wMin}분</span>
          <span class="leg-km">${km}km</span>
        </div>
      </div>`;
    }
    $list.append(`<div class="route-stop-item">
      <div class="stop-body">
        <div class="stop-num" style="background:${color};color:#000">${i+1}</div>
        <div class="stop-info">
          <div class="stop-name">${p.title}</div>
          ${p.addr1||p.addr2?`<div class="stop-address">📍 ${p.addr1||p.addr2}</div>`:""}
          <div class="stop-meta">
            <span class="stop-cat">${CT_ICON[String(p.contenttypeid||"12")]||"🗿"} ${CT_LABEL[String(p.contenttypeid||"12")]||"관광지"}</span>
            <span class="stop-time">⏱ ${p.visitTime||60}분</span>
          </div>
        </div>
        <button class="stop-remove" data-title="${p.title}">✕</button>
      </div>
      ${legHtml}
    </div>`);
  });

  const $leg = $("#legend-items").empty();
  routeStops.forEach((p,i)=>$leg.append(`<div class="legend-item">
    <div class="legend-dot" style="background:${STOP_COLORS[i%STOP_COLORS.length]}"></div>
    <span>${i+1}. ${p.title}</span>
  </div>`));

  if (count>0 && hasDepart) renderTimeline();
  updateRouteMap();
}

/* ── 타임라인: 출발시간 입력됐을 때만 ── */
function renderTimeline() {
  const timeVal = $("#depart-time-input").val();
  if (!timeVal) {
    $("#route-timeline-section").hide();
    return;
  }
  $("#route-timeline-section").show();

  const [startH, startM] = timeVal.split(":").map(Number);
  let h=startH, m=startM;
  const $tl = $("#route-timeline").empty();

  routeStops.forEach((p,i)=>{
    const sH=String(h).padStart(2,"0"), sM=String(m).padStart(2,"0");
    const visitMin = p.visitTime||60;
    const em=m+visitMin, eH=h+Math.floor(em/60), eMr=em%60;
    const color = STOP_COLORS[i%STOP_COLORS.length];
    const isLast = i===routeStops.length-1;
    const dMin = getTravelMin(i,"driving");
    const wMin = getTravelMin(i,"walking");

    $tl.append(`<div class="timeline-item">
      <div class="tl-time">${sH}:${sM}</div>
      <div class="tl-dot" style="background:${color}"></div>
      <div class="tl-content">
        <div class="tl-name">${p.title}</div>
        <div class="tl-detail">
          <span class="tl-duration">⏱ ${visitMin}분</span>
          ${!isLast?`<span class="tl-travel tl-drive${currentTravelMode==="driving"?" tl-active":""}">🚗 ${dMin}분</span><span class="tl-travel tl-walk${currentTravelMode==="walking"?" tl-active":""}">🚶 ${wMin}분</span>`:""}
        </div>
      </div>
      <div class="tl-end">${String(eH).padStart(2,"0")}:${String(eMr).padStart(2,"0")}</div>
    </div>`);

    h=eH; m=eMr;
    if (!isLast) {
      m += getTravelMin(i, currentTravelMode);
      if (m>=60) { h+=Math.floor(m/60); m=m%60; }
    }
  });
}

function generateAutoRoute(type) {
  if (allLoadedPlaces.length===0) { alert("먼저 관광지를 검색해주세요."); return; }
  let sel;
  if (type==="weather")     sel = sortByWeather(allLoadedPlaces, currentWeatherType).slice(0,4);
  else if (type==="culture") {
    sel = allLoadedPlaces.filter(p=>["14","15"].includes(String(p.contenttypeid||"12"))).slice(0,4);
    if (sel.length<3) sel=[...sel,...allLoadedPlaces.filter(p=>!sel.includes(p))].slice(0,4);
  } else if (type==="food") {
    const f = allLoadedPlaces.filter(p=>String(p.contenttypeid||"12")==="39").slice(0,2);
    sel=[...f,...allLoadedPlaces.filter(p=>String(p.contenttypeid||"12")!=="39").slice(0,2)];
  } else if (type==="efficient") sel = optimizeRoute(allLoadedPlaces).slice(0,4);
  if (!sel||sel.length===0) sel = allLoadedPlaces.slice(0,4);
  routeStops = sel.map(p=>({...p,visitTime:60}));
  refreshRoute().then(()=>{
    setTimeout(()=>document.getElementById("route-section").scrollIntoView({behavior:"smooth"}),300);
  });
}


/* ─── 내 경로 저장/관리 ─── */
async function saveCurrentRoute() {
  if (routeStops.length === 0) return;
  requireLogin(async () => {
    try {
      const payload = buildSharePayload();
      const title = prompt("경로 이름을 입력하세요:", `${currentCity} 여행 경로`);
      if (title === null) return; // 취소
      const id = await window.swAuth.saveRoute({
        ...payload,
        title: title || `${currentCity} 여행 경로`,
        isPublic: true,
      });
      showShareToast("경로가 저장됐습니다 💾");
      // 저장 후 공유 URL
      const url = `${location.href.split("?")[0].split("#")[0]}?shared=${id}`;
      console.log("공유 URL:", url);
    } catch(e) {
      alert("저장에 실패했습니다: " + e.message);
    }
  });
}

async function openMyRoutesModal() {
  requireLogin(async () => {
    $("#my-routes-modal").removeClass("hidden");
    const $list = $("#my-routes-list").html('<div style="color:var(--text-muted);font-size:.8rem;padding:16px 0">불러오는 중...</div>');
    try {
      const routes = await window.swAuth.myRoutes();
      if (routes.length === 0) {
        $list.html('<div style="color:var(--text-muted);font-size:.82rem;padding:16px 0;text-align:center">저장된 경로가 없습니다</div>');
        return;
      }
      $list.empty();
      routes.forEach(r => {
        const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString("ko-KR") : "";
        const shareUrl = `${location.href.split("?")[0].split("#")[0]}?shared=${r.id}`;
        const $item = $(`<div class="my-route-item">
          <div class="my-route-info">
            <div class="my-route-title">${r.title || "경로"}</div>
            <div class="my-route-meta">${r.stops?.length||0}개 장소 · ${date}</div>
          </div>
          <div class="my-route-actions">
            <button class="mra-btn" data-action="load" data-id="${r.id}">불러오기</button>
            <button class="mra-btn accent" data-action="copy" data-url="${shareUrl}">링크 복사</button>
            <button class="mra-btn danger" data-action="delete" data-id="${r.id}">삭제</button>
          </div>
        </div>`);
        $list.append($item);
      });
    } catch(e) {
      $list.html('<div style="color:var(--accent3);font-size:.82rem;padding:12px 0">불러오기 실패: ' + e.message + '</div>');
    }
  });
}

/* 저장 경로 불러오기 */
async function loadSharedRoute(id) {
  if (!window.swAuth) return;
  try {
    const r = await window.swAuth.getRoute(id);
    if (!r) { console.warn("경로를 찾을 수 없음:", id); return; }
    applySharedRoute(r);
  } catch(e) { console.error("경로 로딩 실패:", e); }
}

function applySharedRoute(payload) {
  if (!payload || !payload.stops || payload.stops.length === 0) return;
  currentCity = payload.city || currentCity;
  if (payload.lat) currentLat = payload.lat;
  if (payload.lng) currentLng = payload.lng;
  currentTravelMode = payload.mode || "driving";
  routeStops = payload.stops.map(s => ({ ...s, visitTime: s.visitTime || 60 }));
  allLoadedPlaces = [...routeStops, ...allLoadedPlaces.filter(p => !routeStops.some(r=>r.title===p.title))];
  if (payload.depart) $("#depart-time-input").val(payload.depart);
  setTravelMode(currentTravelMode);
  refreshRoute().then(() => {
    renderPlaceGrid();
    setTimeout(()=>document.getElementById("route-section").scrollIntoView({behavior:"smooth"}),400);
    showShareToast("공유 경로가 불러와졌습니다 🗺");
  });
}

function buildSharePayload() {
  return {
    city: currentCity,
    lat: currentLat,
    lng: currentLng,
    weather: currentWeatherType,
    mode: currentTravelMode,
    depart: $("#depart-time-input").val() || "",
    stops: routeStops.map(p => ({
      title: p.title, addr1: p.addr1||"", mapx: p.mapx||"", mapy: p.mapy||"",
      contenttypeid: p.contenttypeid||"12", visitTime: p.visitTime||60,
      firstimage: p.firstimage||"", contentid: p.contentid||"",
    })),
  };
}

function encodeRouteToURL(payload) {
  try {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const base = location.href.split("?")[0].split("#")[0];
    return `${base}?route=${encoded}`;
  } catch(e) { return location.href.split("?")[0]; }
}

function decodeRouteFromURL() {
  try {
    const p = new URLSearchParams(location.search).get("route");
    if (!p) return null;
    return JSON.parse(decodeURIComponent(escape(atob(p))));
  } catch(e) { return null; }
}

async function shareRoute() {
  if (routeStops.length===0) return;
  const payload = buildSharePayload();
  let shareURL = "";

  // Firestore에 저장해서 짧은 ID 기반 URL 생성 (로그인 시)
  if (window._swUser && window.swAuth) {
    try {
      const id = await window.swAuth.saveRoute({
        ...payload,
        title: `${currentCity} 여행 경로`,
        isPublic: true,
      });
      shareURL = `${location.href.split("?")[0].split("#")[0]}?shared=${id}`;
    } catch(e) {
      shareURL = encodeRouteToURL(payload);
    }
  } else {
    shareURL = encodeRouteToURL(payload);
  }

  const tip = getWeatherTip(currentWeatherType);
  const timeVal = $("#depart-time-input").val()||"09:00";
  const [startH, startM] = timeVal.split(":").map(Number);
  let h=startH, m=startM;
  let text = `🗺 SKYWATCHER — ${currentCity} 여행 경로
날씨: ${tip.badge}

`;
  routeStops.forEach((p,i)=>{
    text += `${i+1}. [${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}] ${p.title} (⏱ ${p.visitTime||60}분)
`;
    m+=(p.visitTime||60)+20; h+=Math.floor(m/60); m=m%60;
  });
  const modeLabel = currentTravelMode==="driving"?"차량":"도보";
  const modeTime = currentTravelMode==="driving" ? $("#summary-time-drive").text() : $("#summary-time-walk").text();
  text += `
총 예상 시간(${modeLabel}): ${modeTime}

🔗 경로 링크: ${shareURL}
Powered by SKYWATCHER + 한국관광공사 TourAPI`;

  navigator.clipboard.writeText(text).then(()=>{
    showShareToast("경로와 링크가 클립보드에 복사됐습니다 ✓");
    $("#share-route-btn").text("✓ 복사됨");
    setTimeout(()=>$("#share-route-btn").text("🔗 공유"),2500);
  }).catch(()=>{
    prompt("아래 링크를 복사하세요:", shareURL);
  });
}

function showShareToast(msg) {
  $("#share-toast-msg").text(msg);
  $("#share-toast").removeClass("hidden");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>$("#share-toast").addClass("hidden"), 4000);
}

/* ─── 다중 선택 ─── */
function resetSelectMode() {
  selectMode = false; selectedTitles.clear();
  $("#select-mode-btn").removeClass("active").text("☑ 다중 선택");
  updateSelectionBar();
}
function toggleSelectMode() {
  selectMode = !selectMode;
  if (!selectMode) selectedTitles.clear();
  $("#select-mode-btn").toggleClass("active",selectMode).text(selectMode?"✕ 선택 취소":"☑ 다중 선택");
  updateSelectionBar(); renderPlaceGrid();
}
function toggleCardSelect(title) {
  if (selectedTitles.has(title)) selectedTitles.delete(title); else selectedTitles.add(title);
  const $card=$(`.place-card[data-title="${title}"]`);
  $card.toggleClass("card-selected", selectedTitles.has(title));
  $card.find(".card-checkbox").toggleClass("checked", selectedTitles.has(title));
  updateSelectionBar();
}
function updateSelectionBar() {
  const count = selectedTitles.size;
  if (selectMode && count>0) {
    $("#selection-bar").removeClass("hidden");
    $("#selection-count-text").text(`${count}개 선택됨`);
  } else $("#selection-bar").addClass("hidden");
}
function addSelectedToRoute() {
  let added=0;
  selectedTitles.forEach(title=>{
    if (routeStops.some(r=>r.title===title)||routeStops.length>=6) return;
    const p = allLoadedPlaces.find(p=>p.title===title);
    if (p) { routeStops.push({...p,visitTime:60}); added++; }
  });
  resetSelectMode(); renderPlaceGrid(); renderRouteStops(); updateCardButtons();
  if (added>0) {
    $("#sel-add-btn").text(`✓ ${added}개 추가됨!`);
    setTimeout(()=>$("#sel-add-btn").text("경로에 추가 →"),2000);
    setTimeout(()=>document.getElementById("route-section").scrollIntoView({behavior:"smooth"}),400);
  }
}

/* ─── 시계 ─── */
function updateClock() {
  const n=new Date(), pad=v=>String(v).padStart(2,"0");
  $("#current-time").text(`${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`);
}
setInterval(updateClock,1000); updateClock();

/* ─── Leaflet 지도 ─── */
let _leafletMap=null, _leafletMarkers=[];
function initLeafletMap() {
  if (_leafletMap) return;
  const el = document.getElementById("route-map-leaflet");
  if (!el||el.offsetWidth===0) return;
  _leafletMap = L.map("route-map-leaflet",{zoomControl:true});
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom:19,
  }).addTo(_leafletMap);
  _leafletMap.setView([currentLat, currentLng], 13);
}

function updateRouteMap() {
  initLeafletMap();
  if (!_leafletMap) { requestAnimationFrame(updateRouteMap); return; }
  _leafletMap.invalidateSize();

  const stops = routeStops.length>0 ? routeStops : allLoadedPlaces.slice(0,5);
  const valid = stops.filter(p=>parseFloat(p.mapy||0)!==0);
  const $pins = $("#route-map-pins").empty();
  const disp = routeStops.length>0 ? routeStops : valid.slice(0,5);

  _leafletMarkers.forEach(m=>_leafletMap.removeLayer(m));
  _leafletMarkers = [];

  if (valid.length===0) { _leafletMap.setView([currentLat,currentLng],13); return; }

  const latlngs = [];
  disp.forEach((p,i)=>{
    const lat=parseFloat(p.mapy||0), lng=parseFloat(p.mapx||0);
    if (!lat||!lng) return;
    const color=STOP_COLORS[i%STOP_COLORS.length], label=String(i+1);
    const addr=p.addr1||p.addr2||"주소 정보 없음";
    const ctLabel=CT_LABEL[String(p.contenttypeid||"12")]||"관광지";
    const ctIcon=CT_ICON[String(p.contenttypeid||"12")]||"🗿";
    const icon = L.divIcon({
      className:"",
      html:`<div style="background:${color};color:#000;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;font-family:sans-serif;border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.5)">${label}</div>`,
      iconSize:[30,30], iconAnchor:[15,15], popupAnchor:[0,-18],
    });
    const popup=`<div style="min-width:170px;font-family:sans-serif">
      <div style="font-size:13px;font-weight:700;margin-bottom:3px">${p.title}</div>
      <div style="font-size:11px;color:#888;margin-bottom:5px">${ctIcon} ${ctLabel}</div>
      <div style="font-size:11px;color:#555;line-height:1.5;border-top:1px solid #eee;padding-top:5px">📍 ${addr}</div>
    </div>`;
    const marker = L.marker([lat,lng],{icon}).addTo(_leafletMap).bindPopup(popup,{maxWidth:220});
    _leafletMarkers.push(marker);
    latlngs.push([lat,lng]);

    const $btn=$(
      `<button class="map-pin-btn" style="border-color:${color};color:${color}">
        <span class="pin-num" style="background:${color};color:#000">${label}</span>
        <span class="pin-info">
          <span class="pin-name">${p.title}</span>
          <span class="pin-addr">${addr}</span>
        </span>
      </button>`
    );
    $btn.on("click",()=>{ _leafletMap.setView([lat,lng],16); marker.openPopup(); });
    $pins.append($btn);
  });

  if (latlngs.length>=2) {
    const mode = currentTravelMode;
    const geos = travelCache[mode]?.geometries??[];
    const routeColor = mode==="walking"?"#5ce89a":"#4ecaff";
    if (geos.length>0 && geos.some(Boolean)) {
      geos.forEach((geo,i)=>{
        const seg = geo&&geo.length>=2 ? geo : [latlngs[i],latlngs[i+1]];
        const pl = L.polyline(seg,{color:routeColor,weight:4,opacity:.88,lineJoin:"round",lineCap:"round"}).addTo(_leafletMap);
        _leafletMarkers.push(pl);
      });
    } else {
      const pl = L.polyline(latlngs,{color:routeColor,weight:3.5,opacity:.75,dashArray:"10 7"}).addTo(_leafletMap);
      _leafletMarkers.push(pl);
    }
  }

  const onlyMarkers = _leafletMarkers.filter(m=>m instanceof L.Marker);
  if (onlyMarkers.length===1) _leafletMap.setView(latlngs[0],15);
  else if (onlyMarkers.length>1) _leafletMap.fitBounds(L.featureGroup(onlyMarkers).getBounds().pad(0.25));
}

/* ══════════════════════════════════════════════
   이벤트 바인딩
══════════════════════════════════════════════ */
$(document).ready(function() {
  initRegionPicker();

  /* ── 테마 토글 ── */
  const savedTheme = localStorage.getItem("skywatcher-theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  $("#theme-icon").text(savedTheme==="dark" ? "☀️" : "🌙");

  $("#theme-toggle").on("click", function() {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur==="dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("skywatcher-theme", next);
    $("#theme-icon").text(next==="dark" ? "☀️" : "🌙");
  });

  /* ── 이동수단 ── */
  $(document).on("click",".travel-mode-btn",function() {
    setTravelMode($(this).data("mode"));
  });

  /* ── 모드 버튼 ── */
  $(".mode-btn").on("click",function() {
    const mode=$(this).data("mode");
    currentMode=mode;
    $(".mode-btn").removeClass("active");
    $(this).addClass("active");
    $(".search-panel").addClass("hidden");
    $(`#panel-${mode}`).removeClass("hidden");
  });

  /* ── 검색 ── */
  $("#search-btn").on("click",()=>fetchWeather($("#city-input").val().trim()));
  $("#city-input").on("keydown",e=>{ if(e.key==="Enter") fetchWeather($("#city-input").val().trim()); });
  // qc-btn 이벤트 제거됨 — 지역 피커로 대체
  $("#gps-btn").on("click",fetchByGPS);

  /* ── 반경 ── */
  $(document).on("click",".radius-btn",async function() {
    $(".radius-btn").removeClass("active");
    $(this).addClass("active");
    currentRadius=parseInt($(this).data("radius"));
    pbStart();
    showGridLoading();
    const ctId=currentFilter==="all"?"":currentFilter;
    const places = ctId ? await apiLocationBased(currentLat,currentLng,currentRadius,ctId) : await apiLocationWithFestival(currentLat,currentLng,currentRadius);
    allLoadedPlaces=places; hideGridLoading(); renderPlaceGrid(); updateApiNotice(places.length,true);
    pbDone();
  });

  /* ── 키워드 ── */
  $("#keyword-search-btn").on("click",()=>fetchByKeyword($("#keyword-input").val().trim()));
  $("#keyword-input").on("keydown",e=>{ if(e.key==="Enter") fetchByKeyword($("#keyword-input").val().trim()); });
  $(document).on("click",".kw-tag",function() {
    const kw=$(this).data("kw");
    $("#keyword-input").val(kw);
    fetchByKeyword(kw);
  });

  /* ── 필터 / 정렬 ── */
  $(document).on("click",".tab-btn",function() { onTabFilter($(this).data("filter")); });
  $(document).on("click",".sort-btn",function() {
    $(".sort-btn").removeClass("active"); $(this).addClass("active");
    currentSort=$(this).data("sort"); currentPage=1; renderPlaceGrid();
  });
  $("#page-prev").on("click",()=>{ if(currentPage>1){ currentPage--; renderPlaceGrid(); window.scrollTo({top:document.getElementById("travel-section").offsetTop-80,behavior:"smooth"}); } });
  $("#page-next").on("click",()=>{ const total=Math.ceil(allLoadedPlaces.length/PAGE_SIZE); if(currentPage<total){ currentPage++; renderPlaceGrid(); window.scrollTo({top:document.getElementById("travel-section").offsetTop-80,behavior:"smooth"}); } });
  $(document).on("click","#page-numbers .page-btn",function(){ currentPage=parseInt($(this).data("page")); renderPlaceGrid(); window.scrollTo({top:document.getElementById("travel-section").offsetTop-80,behavior:"smooth"}); });

  /* ── 경로 ── */
  $(document).on("click",".btn-add-route",function(e) { e.stopPropagation(); addToRoute($(this).data("title")); });
  $(document).on("click",".btn-detail",function(e) { e.stopPropagation(); openDetailModal($(this).data("title")); });
  $(document).on("click",".place-card",function(e) {
    if (selectMode) return;
    if (!$(e.target).closest(".btn-add-route,.btn-detail,.card-checkbox").length) {
      openDetailModal($(this).data("title"));
    }
  });
  $(document).on("click",".stop-remove",function() { removeFromRoute($(this).data("title")); });
  $(document).on("click",".auto-btn",function() { generateAutoRoute($(this).data("type")); });
  /* ── Auth 이벤트 ── */
  $("#login-btn").on("click", () => {
    if (window.swAuth) window.swAuth.loginGoogle().catch(()=>{});
    else alert("Firebase 설정이 필요합니다. firebase.js를 확인하세요.");
  });
  $("#logout-btn").on("click", () => { if (window.swAuth) window.swAuth.logout(); });
  $("#my-routes-btn").on("click", openMyRoutesModal);
  $("#my-routes-close").on("click", () => $("#my-routes-modal").addClass("hidden"));
  $("#my-routes-modal").on("click", function(e) { if ($(e.target).is("#my-routes-modal")) $(this).addClass("hidden"); });
  $(document).on("click", ".mra-btn", async function() {
    const action=$(this).data("action"), id=$(this).data("id"), url=$(this).data("url");
    if (action==="load") {
      $("#my-routes-modal").addClass("hidden");
      await loadSharedRoute(id);
    } else if (action==="copy") {
      navigator.clipboard.writeText(url).then(()=>showShareToast("링크가 복사됐습니다 ✓"));
    } else if (action==="delete") {
      if (!confirm("이 경로를 삭제할까요?")) return;
      await window.swAuth.deleteRoute(id);
      $(this).closest(".my-route-item").fadeOut(200, function(){$(this).remove();});
    }
  });
  $("#save-route-btn").on("click", saveCurrentRoute);
  $("#share-toast-close").on("click", ()=>$("#share-toast").addClass("hidden"));

  $("#clear-route-btn").on("click",()=>{
    routeStops=[];
    travelCache={ driving:{legs:[],geometries:[],total:0}, walking:{legs:[],geometries:[],total:0} };
    $("#depart-time-input").val("");
    renderRouteStops(); updateCardButtons();
  });
  $("#share-route-btn").on("click",shareRoute);

  /* ── 출발시간 입력 → 타임라인 표시/갱신 ── */
  $(document).on("change","#depart-time-input",function() {
    if (routeStops.length>0) {
      renderTimeline();
      $("#route-timeline-section").toggle(!!$(this).val());
    }
  });

  /* ── 다중 선택 ── */
  $("#select-mode-btn").on("click",toggleSelectMode);
  $("#sel-cancel-btn").on("click",()=>{ resetSelectMode(); renderPlaceGrid(); });
  $("#sel-add-btn").on("click",addSelectedToRoute);
  $(document).on("click",".card-checkbox",function(e) {
    e.stopPropagation(); toggleCardSelect($(this).data("title"));
  });
  $(document).on("click",".place-card.select-mode",function(e) {
    if (!$(e.target).closest(".card-checkbox,.btn-add-route,.btn-detail").length) toggleCardSelect($(this).data("title"));
  });

  window.addEventListener("resize",()=>{ if(_leafletMap) _leafletMap.invalidateSize(); });

  /* ══════════════════════════════════════════════
     초기 로딩 — 날씨 + 관광지 병렬
  ══════════════════════════════════════════════ */
  // 공유 링크 파라미터 체크 (shared=ID or route=encoded)
  const _sharedId = new URLSearchParams(location.search).get("shared");
  const _routeEncoded = new URLSearchParams(location.search).get("route");

  // 초기 로딩 스피너 표시
  showLoading("🌤 서울 날씨 & 관광지 불러오는 중...");
  showSkeletonGrid(6);

  // 서버 웜업 핑 (Render 콜드스타트 방지) - 병렬로
  $.ajax({ url:`${PROXY_BASE}/ping`, method:"GET", dataType:"json" }).catch(()=>{});

  (async()=>{
    try {
      // ★ 날씨 + 관광지 동시 요청
      const [wData, places] = await Promise.all([
        fetchWeatherByCoords(currentLat, currentLng),
        apiLocationWithFestival(currentLat, currentLng, currentRadius),
      ]);

      let finalPlaces = places;
      if (finalPlaces.length===0)
        finalPlaces = await apiLocationWithFestival(currentLat, currentLng, 10000);
      allLoadedPlaces = finalPlaces;

      if (wData) {
        renderCurrent(wData);
        fetchForecastByCoords(currentLat, currentLng).then(f=>{ if(f) renderForecast(f); });
      } else {
        showWeatherUnavailable();
      }

      setTravelHeader();
      renderPlaceGrid();
      updateApiNotice(allLoadedPlaces.length, true);
      renderRouteStops();
      hideLoading();
      setTimeout(()=>{ initLeafletMap(); if(_leafletMap) _leafletMap.invalidateSize(); }, 150);

      // 공유 경로 복원
      if (_sharedId) {
        setTimeout(()=>loadSharedRoute(_sharedId), 600);
      } else if (_routeEncoded) {
        const payload = decodeRouteFromURL();
        if (payload) setTimeout(()=>applySharedRoute(payload), 400);
      }
    } catch(e) {
      console.error("초기 로딩 오류:", e);
      hideLoading();
      showWeatherUnavailable();
      showSkeletonGrid(0);
    }
  })();
});
