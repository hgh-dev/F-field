/* ==========================================================================
   프로젝트: 국유림 현장조사 앱 (F-Field)
   버전: v1.5.0
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. 설정 및 상수 (Configuration & Constants)
   -------------------------------------------------------------------------- */
// VMWORLD API 키: 지도 데이터를 가져오기 위한 인증 키입니다.
const VWORLD_API_KEY = "EE6276F5-3176-37ED-8478-85C820FB8529";

// 로컬 스토리지 키: 브라우저에 데이터를 저장할 때 사용하는 이름표입니다.
const STORAGE_KEY = "my_survey_data_v4";         // 측량 데이터 저장용
const SEARCH_HISTORY_KEY = 'my_search_history';    // 검색 기록 저장용
const SEARCH_SETTING_KEY = 'my_search_setting_enabled'; // 검색 기록 저장 설정용



/* --------------------------------------------------------------------------
   2. 전역 상태 변수 (Global State)
   -------------------------------------------------------------------------- */
// 앱의 현재 상태를 기억하는 변수들입니다.

// 좌표 표시 모드 (0: 도분초 DMS, 1: 십진수 Decimal, 2: TM 좌표)
let coordMode = 0;

// 위치 추적 상태
let isFollowing = false; // 내 위치 따라가기 모드인지 여부
let watchId = null;      // 위치 추적 프로세스 ID
let lastHeading = 0;     // 나침반 방향 (0~360도)
let lastGpsLat = 37.245911; // 마지막 GPS 위도 (초기값: 지도 중심)
let lastGpsLng = 126.960302; // 마지막 GPS 경도

// 지도 위의 요소들
let trackingMarker = null;    // 내 위치 표시 마커 (화살표)
let trackingCircle = null;    // 내 위치 오차 범위 원
let currentBoundaryLayer = null; // 선택된 지적 경계 (붉은 테두리)
let currentSearchMarker = null;  // 검색 또는 클릭한 위치 마커

// 그리기 도구 상태
let currentDrawer = null;     // 현재 사용 중인 그리기 도구
let isManualFinish = false;   // 그리기 수동 종료 여부 체크

// 산림 데이터 상태
let forestDataLayer = null;   // 산림보호구역 레이어
let isForestActive = false;   // 산림보호구역 보기 활성화 여부
let lastForestRequestId = 0;  // 데이터 요청 순서 확인용

// 프로젝트 관리 상태
let projects = [];             // 전체 프로젝트 목록
let currentProjectId = null;   // 현재 선택된 프로젝트 ID



/* --------------------------------------------------------------------------
   3. 리소스 (Resources)
   -------------------------------------------------------------------------- */
// 앱에서 사용하는 아이콘(그림)들을 SVG 코드로 정리한 객체입니다.
const SVG_ICONS = {
    // 핀 모양 아이콘
    marker: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
    // 다각형(면적) 아이콘
    polygon: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M12 2L2 9L6 21H18L22 9L12 2Z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    // 자(거리) 아이콘
    ruler: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M23 8c0 1.1-.9 2-2 2-.18 0-.35-.02-.51-.07l-3.56 3.55c.05.16.07.34.07.52 0 1.1-.9 2-2 2s-2-.9-2-2c0-.18.02-.36.07-.52l-2.55-2.55c-.16.05-.34.07-.52.07s-.36-.02-.52-.07l-4.55 4.56c.05.16.07.33.07.51 0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2c.18 0 .35.02.51.07l4.56-4.55C8.02 9.36 8 9.18 8 9c0-1.1.9-2 2-2s2 .9 2 2c0 .18-.02.36-.07.52l2.55 2.55c.16-.05.34-.07.52-.07s.36.02.52.07l3.55-3.56C19.02 8.35 19 8.18 19 8c0-1.1.9-2 2-2s2 .9 2 2z"/></svg>`,
    // 수정(연필) 아이콘
    edit: `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
    // 삭제(휴지통) 아이콘
    trash: `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    // 저장(플로피디스크) 아이콘
    save: `<svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
    // 메모(노트) 아이콘
    memo: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
    // 닫기(X) 아이콘
    close: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    // 자동차 아이콘
    car: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
    // 잠금 아이콘
    lock: `<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`,
    // 잠금 해제 아이콘
    unlock: `<svg viewBox="0 0 24 24"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c.55 0 1 .45 1 1s-.45 1-1 1H7c-1.66 0-3 1.34-3 3v2H3c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/></svg>`,
    // 더보기(점 3개) 아이콘
    more: `<svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`,
    // 폴더 이동 아이콘 (커스텀: 큰 화살표)
    folder_move: `<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h11v-2H4V8h16v4h2V8c0-1.1-.9-2-2-2z"/><path d="M14 13v-3l7 4.5-7 4.5v-3H9v-3h5z"/></svg>`
};

/* [패치] Leaflet 라이브러리의 터치 오류 방지 */
// 선 그리기 도구 사용 시 모바일에서 터치가 튀는 문제를 해결합니다.
L.Draw.Polyline.prototype._onTouch = function (e) { return; };



/* --------------------------------------------------------------------------
   4. 지도 초기화 (Map Initialization)
   -------------------------------------------------------------------------- */
// Leaflet(L)을 사용하여 지도를 생성하고 설정합니다.

const map = L.map('map', {
    zoomControl: false,        // 줌 버튼 숨김 (별도로 만듦)
    attributionControl: false, // 로고 숨김
    tap: false,                // 모바일 터치 딜레이 해제
    maxZoom: 22,               // 최대 확대 레벨
    doubleClickZoom: false     // 더블 클릭 확대 방지 (정보창 띄우기 기능으로 사용)
}).setView([37.245911, 126.960302], 17); // 초기 위치 설정 (수원)

// 줌 버튼과 축척바(Scale) 추가
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.control.scale({ imperial: false, metric: true }).addTo(map);

// 'nasGukPane'이라는 별도의 레이어 층을 만듭니다. (다른 레이어보다 위에 표시하기 위함)
map.createPane('nasGukPane');
map.getPane('nasGukPane').style.zIndex = 350;
map.getPane('nasGukPane').style.pointerEvents = 'none'; // 지도가 클릭되도록 설정

// TM 좌표계 설정 (EPSG:5186 - 한국 중부원점)
proj4.defs("EPSG:5186", "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs");



/* --------------------------------------------------------------------------
   5. 레이어 관리 (Layer Management)
   -------------------------------------------------------------------------- */
// VWorld에서 제공하는 지도 타일들입니다.

// 1. 기본 배경 지도
const vworldBase = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', {
    key: VWORLD_API_KEY, layer: 'Base', ext: 'png', attribution: 'VWorld', maxNativeZoom: 19, maxZoom: 22
});

// 2. 위성(영상) 지도
const vworldSatellite = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', {
    key: VWORLD_API_KEY, layer: 'Satellite', ext: 'jpeg', attribution: 'VWorld', maxNativeZoom: 19, maxZoom: 22
});

// 3. 하이브리드(지명, 도로 등) 오버레이
const vworldHybrid = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', {
    key: VWORLD_API_KEY, layer: 'Hybrid', ext: 'png', opacity: 1, attribution: 'VWorld', maxNativeZoom: 19, maxZoom: 22
});

// 8. Esri 위성지도 (World Imagery)
const esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri World Imagery',
    maxNativeZoom: 19,
    maxZoom: 22
});

// 4. 지적도 (LX, 편집도)
const vworldLxLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_landinfobasemap', styles: '', format: 'image/png',
    transparent: true, opacity: 0.6, version: '1.3.0', maxZoom: 22, maxNativeZoom: 19,
    detectRetina: true, tileSize: 512, zoomOffset: 0, className: 'cadastral-layer'
});

// 5. 연속 지적도
const vworldContinuousLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun', styles: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun',
    format: 'image/png', transparent: true, opacity: 0.6, version: '1.3.0',
    maxZoom: 22, maxNativeZoom: 19, detectRetina: true, tileSize: 512, zoomOffset: 0, className: 'cadastral-layer'
});

// 6. 국유림 레이어 (사용자 정의 타일)
const nasGukLayer = L.tileLayer('https://hgh-dev.github.io/map_data/suwon/guk/{z}/{x}/{y}.png', {
    minZoom: 1, maxZoom: 22, maxNativeZoom: 18, tms: false, pane: 'nasGukPane', opacity: 1, attribution: 'Suwon Guk'
});

// 7. 행정경계 레이어 (통합 WMS)
const mergedAdminLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    layers: 'lt_c_adsido,lt_c_adsigg,lt_c_ademd,lt_c_adri',
    styles: 'lt_c_adsido,lt_c_adsigg,lt_c_ademd,lt_c_adri',
    format: 'image/png',
    transparent: true,
    opacity: 1,
    version: '1.3.0',
    minZoom: 6,
    maxZoom: 22,
    maxNativeZoom: 18,
    className: 'admin-layer'
});


// 초기 레이어 추가 (위성지도 + 연속지적도 + 하이브리드)
map.addLayer(vworldSatellite);
map.addLayer(vworldContinuousLayer);
map.addLayer(vworldHybrid);

// 초기 행정경계 레이어 설정
// 초기 행정경계 레이어 설정
if (document.getElementById('chk-admin') && document.getElementById('chk-admin').checked) {
    toggleOverlay('admin', true);
}


/* --- 레이어 제어 함수들 --- */

// 배경 지도 토글 (ON/OFF)
function toggleBaseLayer(isChecked) {
    if (isChecked) {
        const selectedValue = document.querySelector('input[name="baseMap"]:checked').value;
        changeBaseMap(selectedValue);
    } else {
        map.removeLayer(vworldSatellite);
        map.removeLayer(vworldBase);
        map.removeLayer(esriSatelliteLayer);
    }
}

// 배경 지도 종류 변경 (위성 vs 일반)
function changeBaseMap(type) {
    if (!document.getElementById('chk-base-layer').checked) return;

    if (type === 'satellite') {
        map.addLayer(vworldSatellite);
        map.removeLayer(vworldBase);
        map.removeLayer(esriSatelliteLayer);
    } else if (type === 'esri') {
        map.addLayer(esriSatelliteLayer);
        map.removeLayer(vworldSatellite);
        map.removeLayer(vworldBase);
    } else {
        map.addLayer(vworldBase);
        map.removeLayer(vworldSatellite);
        map.removeLayer(esriSatelliteLayer);
    }

    // 오버레이 레이어들을 순서대로 맨 위로 올림 (지적도 -> 하이브리드 -> 행정경계)
    updateLayerOrder();
}

// 레이어 순서 재조정 함수 (하이브리드 < 지적도 < 행정경계)
function updateLayerOrder() {
    // 1. 하이브리드 먼저 (가장 아래)
    if (map.hasLayer(vworldHybrid)) vworldHybrid.bringToFront();

    // 2. 지적도 (하이브리드 위)
    if (map.hasLayer(vworldLxLayer)) vworldLxLayer.bringToFront();
    if (map.hasLayer(vworldContinuousLayer)) vworldContinuousLayer.bringToFront();

    // 3. 행정경계가 가장 위에 오도록
    if (map.hasLayer(mergedAdminLayer)) mergedAdminLayer.bringToFront();
}

// 지적도 종류 변경 (연속지적도 vs LX)
function changeCadastralMap(type) {
    if (!document.getElementById('chk-cadastral').checked) return;

    if (type === 'lx') {
        map.addLayer(vworldLxLayer);
        map.removeLayer(vworldContinuousLayer);
    } else {
        // 기본값: 연속지적도
        map.addLayer(vworldContinuousLayer);
        map.removeLayer(vworldLxLayer);
    }
    updateLayerOrder();
}

// 오버레이 레이어 켜고 끄기
function toggleOverlay(type, isChecked) {
    let layer;

    if (type === 'hybrid') {
        layer = vworldHybrid;
    } else if (type === 'cadastral') {
        // 지적도 메뉴 처리
        if (isChecked) {
            const selectedValue = document.querySelector('input[name="cadastralMap"]:checked').value;
            changeCadastralMap(selectedValue);
        } else {
            map.removeLayer(vworldLxLayer);
            map.removeLayer(vworldContinuousLayer);
        }
        return;
    } else if (type === 'admin') {
        // 행정경계 메뉴 처리 (통합 레이어)
        if (isChecked) {
            map.addLayer(mergedAdminLayer);
            mergedAdminLayer.bringToFront();
        } else {
            map.removeLayer(mergedAdminLayer);
        }
        return;
    } else if (type === 'nasGuk') {
        layer = nasGukLayer;
        // 범례 토글
        const legend = document.getElementById('nas-guk-legend');
        if (legend) legend.style.display = isChecked ? 'block' : 'none';

    } else if (type === 'forest') {
        // 산림보호구역 API 처리
        isForestActive = isChecked;
        if (isChecked) {
            if (!forestDataLayer) {
                // 레이어가 없으면 새로 생성 (초록색 점선)
                forestDataLayer = L.geoJSON(null, {
                    style: {
                        color: "#e1ff00ff", weight: 1, opacity: 0.6, fillOpacity: 0.1
                    },
                    onEachFeature: function (feature, layer) {
                        layer.bindPopup("산림보호구역");
                    }
                }).addTo(map);
            } else {
                map.addLayer(forestDataLayer);
            }
            fetchForestData(); // 데이터 불러오기
        } else {
            if (forestDataLayer) {
                map.removeLayer(forestDataLayer);
                forestDataLayer.clearLayers();
            }
        }
        return;
    }

    // 일반 레이어 추가/제거
    if (isChecked) {
        map.addLayer(layer);
        if (type !== 'nasGuk') {
            updateLayerOrder();
        }
    } else {
        map.removeLayer(layer);
    }
}



// 산림보호구역 데이터 가져오기 (VWorld Data API)
function fetchForestData() {
    if (!isForestActive || !forestDataLayer) return;

    // 성능을 위해 줌 레벨이 13 미만이면 데이터 표시 안 함
    if (map.getZoom() < 13) {
        forestDataLayer.clearLayers();
        return;
    }

    // 현재 화면 영역(Bounds) 가져오기
    const bounds = map.getBounds();
    const min = bounds.getSouthWest();
    const max = bounds.getNorthEast();
    const bbox = `${min.lng},${min.lat},${max.lng},${max.lat}`;

    const requestId = ++lastForestRequestId;
    const callbackName = 'vworld_forest_' + Date.now();

    // JSONP 방식으로 데이터 요청
    window[callbackName] = function (data) {
        if (requestId !== lastForestRequestId) {
            delete window[callbackName];
            return;
        }

        if (data.response.status === "OK") {
            forestDataLayer.clearLayers();
            const features = data.response.result.featureCollection.features;
            forestDataLayer.addData(features);
        }

        delete window[callbackName];
        document.getElementById(callbackName)?.remove();
    };

    const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_UF151&key=${VWORLD_API_KEY}&domain=${window.location.hostname}&geomFilter=BOX(${bbox})&format=json&errorFormat=json&size=1000&callback=${callbackName}`;
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = url;
    document.body.appendChild(script);
}

// 지도 이동이 끝날 때마다 데이터를 다시 불러옴
map.on('moveend', function () {
    if (isForestActive) fetchForestData();
});



/* --------------------------------------------------------------------------
   6. UI 컨트롤러 (UI Controller)
   -------------------------------------------------------------------------- */
// 사이드바, 모달창, 탭 등 화면의 UI를 제어하는 함수들입니다.

// 사이드바 열기 애니메이션
function openSidebar() {
    syncSidebarUI(); // 현재 지도 상태와 버튼 동기화
    renderSurveyList(); // 저장된 기록 목록 표시
    const overlay = document.getElementById('sidebar-overlay');
    overlay.style.display = 'block';
    // 약간의 딜레이 후 클래스 추가 (부드러운 효과)
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

// 사이드바 닫기 애니메이션
function closeSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    overlay.classList.remove('visible');
    // 애니메이션이 끝난(0.3초) 후 숨김
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

// 사이드바 UI 상태 동기화 (현재 켜진 레이어에 맞춰 체크박스 설정)
function syncSidebarUI() {
    const hasBase = map.hasLayer(vworldBase);
    const hasSat = map.hasLayer(vworldSatellite);
    const hasEsri = map.hasLayer(esriSatelliteLayer);

    // 배경 지도
    document.getElementById('chk-base-layer').checked = (hasBase || hasSat || hasEsri);
    if (hasSat) document.querySelector('input[name="baseMap"][value="satellite"]').checked = true;
    else if (hasEsri) document.querySelector('input[name="baseMap"][value="esri"]').checked = true;
    else if (hasBase) document.querySelector('input[name="baseMap"][value="base"]').checked = true;

    // toggleBaseLayer 호출은 중복 실행을 막기 위해 제거하거나 상태만 맞춤
    // toggleBaseLayer(hasBase || hasSat || hasEsri); -> 이미 map 상태가 정확하므로 UI만 맞추면 됨

    // 하이브리드
    document.getElementById('chk-hybrid').checked = map.hasLayer(vworldHybrid);

    // 지적도
    const hasContinuous = map.hasLayer(vworldContinuousLayer);
    const hasLx = map.hasLayer(vworldLxLayer);
    document.getElementById('chk-cadastral').checked = (hasContinuous || hasLx);
    if (hasLx) document.querySelector('input[name="cadastralMap"][value="lx"]').checked = true;
    else document.querySelector('input[name="cadastralMap"][value="continuous"]').checked = true;
    toggleOverlay('cadastral', (hasContinuous || hasLx));

    // 국유림
    document.getElementById('chk-nas-guk').checked = map.hasLayer(nasGukLayer);
}

// 사이드바 탭 전환 (지도 설정 <-> 측량 기록)
function switchSidebarTab(tabName) {
    // 버튼 스타일 초기화
    document.getElementById('tab-btn-map').classList.remove('active');
    document.getElementById('tab-btn-record').classList.remove('active');
    // 내용 숨기기
    document.getElementById('content-map').classList.remove('active');
    document.getElementById('content-record').classList.remove('active');

    // 선택된 탭 활성화
    document.getElementById('tab-btn-' + tabName).classList.add('active');
    document.getElementById('content-' + tabName).classList.add('active');

    // 자물쇠 아이콘 제어 (지도 탭에서만 표시)
    const btnLock = document.getElementById('btn-lock');
    if (btnLock) {
        btnLock.style.display = (tabName === 'map') ? 'block' : 'none';
    }
}

// 비공개 레이어 잠금 해제 (암호 입력)
window.unlockHiddenLayers = function () {
    const section = document.getElementById('hidden-layer-section');
    const btnLock = document.getElementById('btn-lock');

    if (section.style.display === 'block') {
        alert("이미 잠금이 해제되었습니다.");
        return;
    }

    const input = prompt("암호를 입력하세요:");
    if (!input) return;

    // 간단한 Base64 인코딩 비교 (암호: 8906)
    if (btoa(input) === 'ODkwNg==') {
        section.style.display = 'block';
        btnLock.innerHTML = SVG_ICONS.unlock; // 아이콘 변경
        btnLock.style.color = '#3B82F6';
        alert("잠금이 해제되었습니다. 비공개 정보가 유출되지 않도록 주의하세요.");
    } else {
        alert("암호가 올바르지 않습니다.");
    }
};



/* --------------------------------------------------------------------------
   7. 기능: 검색 및 주소 (Feature: Search & Address)
   -------------------------------------------------------------------------- */
// 주소 검색 및 좌표 변환 관련 기능입니다.

let isSearchHistoryEnabled = true;

// 초기화: 저장된 검색 설정 불러오기
(function initSearchSettings() {
    const setting = localStorage.getItem(SEARCH_SETTING_KEY);
    if (setting !== null) { isSearchHistoryEnabled = (setting === 'true'); }
    document.getElementById('chk-history-save').checked = isSearchHistoryEnabled;
})();

// 검색창 열고 닫기
function toggleSearchBox() {
    const box = document.getElementById('search-container');
    if (box.style.display === 'flex') {
        box.style.display = 'none';
    } else {
        box.style.display = 'flex';
        document.getElementById('search-input').focus();
    }
}

// 검색창 외부 클릭 시 닫기
document.addEventListener('mousedown', function (e) {
    const sc = document.getElementById('search-container');
    const btn = document.getElementById('btn-search-toggle');
    if (sc.style.display === 'flex' && !sc.contains(e.target) && !btn.contains(e.target)) {
        sc.style.display = 'none';
    }
});

// VWorld 검색 API 호출 함수 (JSONP)
function callVworldSearchApi(query, type, callback) {
    const callbackName = 'vworld_search_' + type + '_' + Math.floor(Math.random() * 100000);
    window[callbackName] = function (data) {
        delete window[callbackName];
        document.getElementById(callbackName)?.remove();

        if (data.response.status === "OK" && data.response.result && data.response.result.items.length > 0)
            callback(data.response.result.items);
        else
            callback(null);
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=50&page=1&query=${encodeURIComponent(query)}&type=${type}&format=json&errorformat=json&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

// VWorld 좌표 변환 API 호출 함수
function callVworldCoordApi(query, type, callback) {
    const callbackName = 'vworld_coord_' + Math.floor(Math.random() * 100000);
    window[callbackName] = function (data) {
        delete window[callbackName];
        document.getElementById(callbackName)?.remove();

        if (data.response.status === "OK" && data.response.result)
            callback(data.response.result);
        else
            callback(null);
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/address?service=address&request=getCoord&version=2.0&crs=epsg:4326&address=${encodeURIComponent(query)}&refine=true&simple=false&format=json&type=${type || 'PARCEL'}&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

// 검색 실행 메인 함수
function executeSearch(keyword) {
    const query = keyword || document.getElementById('search-input').value;
    if (!query) return;

    if (isSearchHistoryEnabled) { addToHistory(query); }
    document.getElementById('history-panel').style.display = 'none';
    document.getElementById('search-input').value = query;

    // 단계별 검색: 주소(ADDRESS) -> 장소(PLACE) -> 도로명(ROAD) -> 지번(PARCEL)
    callVworldSearchApi(query, 'ADDRESS', function (addrResults) {
        if (addrResults && addrResults.length > 0) {
            handleSearchResults(addrResults);
        } else {
            callVworldSearchApi(query, 'PLACE', function (placeResults) {
                if (placeResults && placeResults.length > 0) {
                    handleSearchResults(placeResults);
                } else {
                    callVworldCoordApi(query, 'ROAD', function (roadResult) {
                        if (roadResult) {
                            handleSingleResult(roadResult, query, 'ROAD');
                        } else {
                            callVworldCoordApi(query, 'PARCEL', function (parcelResult) {
                                if (parcelResult) {
                                    handleSingleResult(parcelResult, query, 'PARCEL');
                                } else {
                                    alert("검색 결과가 없습니다.\n정확한 주소(예: 화성시 장안면 장안리 산124)를 입력해보세요.");
                                }
                            });
                        }
                    });
                }
            });
        }
    });
}

// 단일 결과 처리 (바로 이동)
function handleSingleResult(coordResult, query, type) {
    const finalResult = {
        point: coordResult.point,
        title: query,
        address: {
            road: (type === 'ROAD' && coordResult.refined) ? coordResult.refined.text : "",
            parcel: (type === 'PARCEL' && coordResult.refined) ? coordResult.refined.text : ""
        }
    };
    moveToSearchResult(finalResult);
}

// 다중 결과 처리 (목록 표시)
function handleSearchResults(items) {
    if (items.length === 1) {
        moveToSearchResult(items[0]);
    } else {
        renderSearchResultList(items);
        document.getElementById('search-result-panel').style.display = 'block';
    }
}

// 검색 결과 목록 그리기
function renderSearchResultList(items) {
    const listEl = document.getElementById('search-result-list');
    listEl.innerHTML = "";

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'search-result-item';

        const roadAddr = item.address.road || "";
        const parcelAddr = item.address.parcel || "";
        const title = item.title || roadAddr || parcelAddr;

        let html = `<div class="search-result-title">${title}</div>`;

        if (roadAddr) html += `<div class="search-result-addr"><span class="badge-road">도로명</span> ${roadAddr}</div>`;
        if (parcelAddr) html += `<div class="search-result-addr"><span class="badge-parcel">지번</span> ${parcelAddr}</div>`;

        li.innerHTML = html;
        li.onclick = function () {
            moveToSearchResult(item);
            closeSearchResult();
        };
        listEl.appendChild(li);
    });
}

function closeSearchResult() {
    document.getElementById('search-result-panel').style.display = 'none';
    document.getElementById('search-input').focus();
}

function moveToSearchResult(result) {
    const point = result.point;
    map.flyTo([point.y, point.x], 16, { duration: 1.5 });

    // 검색된 위치 정보 표시
    showInfoPopup(point.y, point.x);
    // 지적 경계 강조
    fetchAndHighlightBoundary(point.x, point.y);
}

// --- 검색 기록 관리 ---
function getHistory() { const json = localStorage.getItem(SEARCH_HISTORY_KEY); return json ? JSON.parse(json) : []; }
function saveHistory(list) { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list)); }

function addToHistory(keyword) {
    let list = getHistory();
    list = list.filter(item => item !== keyword); // 중복 제거
    list.unshift(keyword); // 맨 앞에 추가
    if (list.length > 10) list = list.slice(0, 10); // 최대 10개
    saveHistory(list);
}

function toggleHistorySave(checked) {
    isSearchHistoryEnabled = checked;
    localStorage.setItem(SEARCH_SETTING_KEY, checked);
    if (!checked) document.getElementById('history-panel').style.display = 'none';
}

function clearHistoryAll() {
    if (confirm("검색 기록을 모두 삭제하시겠습니까?")) {
        saveHistory([]);
        renderHistoryList();
    }
}

function deleteHistoryItem(index) {
    const list = getHistory();
    list.splice(index, 1);
    saveHistory(list);
    renderHistoryList();
}

function showHistoryPanel() {
    renderHistoryList();
    document.getElementById('history-panel').style.display = 'block';
}

function renderHistoryList() {
    const list = getHistory();
    const ul = document.getElementById('history-list');
    ul.innerHTML = "";

    if (list.length === 0) {
        ul.innerHTML = '<li style="padding:10px; color:#999; text-align:center;">최근 기록 없음</li>';
        return;
    }

    list.forEach(function (text, index) {
        const li = document.createElement('li');
        li.className = 'history-item';

        const spanText = document.createElement('span');
        spanText.className = 'history-text';
        spanText.innerText = text;
        spanText.onclick = () => executeSearch(text);

        const btnDel = document.createElement('span');
        btnDel.className = 'btn-del-history';
        btnDel.innerHTML = SVG_ICONS.close;
        btnDel.onclick = (e) => { e.stopPropagation(); deleteHistoryItem(index); };

        li.appendChild(spanText);
        li.appendChild(btnDel);
        ul.appendChild(li);
    });
}



/* --------------------------------------------------------------------------
   8. 기능: 정보 팝업 (Feature: Popup & Info)
   -------------------------------------------------------------------------- */
// 지도 클릭 시 주소와 좌표 정보를 보여주는 팝업 기능입니다.

// 정보 팝업 표시
function showInfoPopup(lat, lng) {
    const callbackName = 'vworld_popup_' + Math.floor(Math.random() * 100000);

    // 주소 가져오기 콜백
    window[callbackName] = function (data) {
        let parcelAddr = "주소 정보 없음";
        let roadAddr = "";

        if (data.response.status === "OK") {
            const results = data.response.result;
            results.forEach(item => {
                if (item.type === 'parcel') parcelAddr = item.text;
                else if (item.type === 'road') roadAddr = item.text;
            });
            // 지번 없고 도로명만 있으면 대치
            if (parcelAddr === "주소 정보 없음" && roadAddr !== "") {
                parcelAddr = roadAddr;
                roadAddr = "";
            }
        }

        // 기존 마커 제거 후 새 마커 생성
        if (currentSearchMarker) map.removeLayer(currentSearchMarker);
        currentSearchMarker = L.marker([lat, lng], { icon: createColoredMarkerIcon('#FF0000') }).addTo(map);

        // 좌표 텍스트 생성
        let infoText = "";
        if (coordMode === 2) {
            infoText = "X:" + getTmCoords(lat, lng).x + " | " + "Y:" + getTmCoords(lat, lng).y;
        } else if (coordMode === 1) {
            infoText = "N " + lat.toFixed(4) + "°, " + "E " + lng.toFixed(4) + "°";
        } else {
            infoText = convertToDms(lat, 'lat') + " " + convertToDms(lng, 'lng');
        }

        // 팝업 HTML 컨텐츠
        const content = `<div style="min-width: 210px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <b onclick="copyText(this.innerText, false, '지번 주소')" style="color:#3B82F6; font-size: 14px; line-height: 1.2; word-break: keep-all; cursor: pointer;">${parcelAddr}</b>
                                </div>
                            </div>
                            <hr style="margin: 10px 0; border: none; border-top: 1px solid #f0f0f0;">
                            ${roadAddr ? `
                            <div style="display:flex; align-items:baseline; font-size: 12px; color: #555; margin-bottom: 5px;">
                                <span class="badge-road" style="flex-shrink:0; width:29px; display:inline-block; text-align:center;">도로명</span>
                                <span onclick="copyText(this.innerText, false, '도로명 주소')" style="margin-left: 5px; line-height: 1.2; word-break: keep-all; cursor: pointer;">${roadAddr}</span>
                            </div>` : ''}
                            <div style="display:flex; align-items:baseline; font-size: 12px; color: #555; margin-bottom: 20px;">
                                <span class="badge-coord" style="flex-shrink:0; width:29px; display:inline-block; text-align:center;">좌표</span>
                                <div onclick="copyText(this.innerText, false, '좌표')" style="margin-left: 5px; line-height: 1.2; cursor: pointer;">${infoText}</div>
                            </div>
                        </div>

                        <div style="margin-top: 10px; display:flex; flex-direction:column; gap:5px;">
                            <div style="display:flex; gap:5px; justify-content:center;">
                                <button class="popup-btn" style="flex:1; background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="saveCurrentPoint(${lat}, ${lng}, '${parcelAddr}')">
                                    <div style="width:16px; height:16px;">${SVG_ICONS.marker}</div>
                                </button>
                                <button class="popup-btn" style="flex:1; background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="saveCurrentBoundary('${parcelAddr}')">
                                    <div style="width:16px; height:16px;">${SVG_ICONS.polygon}</div>
                                </button>
                                <button class="popup-btn" style="flex:1; background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="shareLocationText('${parcelAddr}', '${lat}', '${lng}')">
                                    <svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:currentColor;"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.66 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                                </button>
                                <button class="popup-btn" style="flex:1; background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="openNavModal('${parcelAddr}', ${lat}, ${lng})">
                                    <div style="width:16px; height:16px;">${SVG_ICONS.car}</div>
                                </button>
                            </div>
                            <div style="display:flex; gap:5px; justify-content:center;">
                                <button id="btn-landeum-popup" class="popup-btn disabled" style="flex:1;" onclick="fetchAndHighlightBoundary(${lng}, ${lat})">토지e음 조회</button>
                                <button class="popup-btn" style="flex:1; background:#007bff; color:#fff; border:1px solid #007bff;" onclick="
                                    copyText('${parcelAddr}', true);
                                    setTimeout(() => {
                                        alert('주소가 복사되었습니다.\\nK-GeoP 검색창에 붙여넣기 하세요.');
                                        window.open('https://kgeop.go.kr/info/infoMap.do?initMode=L', '_blank');
                                    }, 500);
                                ">K-GeoP 조회</button>
                            </div>
                        </div>`;

        currentSearchMarker.bindPopup(content).openPopup();

        delete window[callbackName];
        document.getElementById(callbackName)?.remove();
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&format=jsonp&type=BOTH&zipcode=false&simple=false&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

// 지도 더블 클릭 시 이벤트
map.on('dblclick', function (e) {
    showInfoPopup(e.latlng.lat, e.latlng.lng);
    fetchAndHighlightBoundary(e.latlng.lng, e.latlng.lat);
});

// 지도 클릭(바탕) 시 선택 해제
map.on('click', function (e) {
    if (currentBoundaryLayer) {
        map.removeLayer(currentBoundaryLayer);
        currentBoundaryLayer = null;
    }
    if (currentSearchMarker) {
        map.removeLayer(currentSearchMarker);
        currentSearchMarker = null;
    }
});

// 텍스트 복사 헬퍼 함수
function copyText(text, silent = false, itemLabel = "주소") {
    const msg = `${itemLabel}가 복사되었습니다.`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (!silent) alert(msg);
        }).catch(err => {
            console.error(err);
            prompt("복사하세요:", text);
        });
    } else {
        const tempInput = document.createElement("textarea");
        document.body.appendChild(tempInput);
        tempInput.value = text;
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        if (!silent) alert(msg);
    }
}

// 팝업 위치 공유 (공유하기 버튼)
function shareLocationText(address, lat, lng) {
    let coordText = `${lat}, ${lng}`;
    if (coordMode === 2) {
        const tm = getTmCoords(lat, lng);
        coordText = `X: ${tm.x}, Y: ${tm.y}`;
    } else if (coordMode === 1) {
        coordText = `N ${parseFloat(lat).toFixed(4)}° , E ${parseFloat(lng).toFixed(4)}°`;
    } else {
        coordText = `${convertToDms(lat, 'lat')}, ${convertToDms(lng, 'lng')}`;
    }

    const shareUrl = `${window.location.origin}${window.location.pathname}?lat=${lat}&lng=${lng}`;
    const shareData = {
        title: '[F-Field] 위치 공유',
        text: `\n주소: ${address}\n좌표: ${coordText}\n\n링크를 클릭하면 공유된 위치로 이동합니다.`,
        url: shareUrl
    };

    if (navigator.share) {
        navigator.share(shareData).catch(err => console.log('공유 취소'));
    } else {
        const clipText = `${shareData.text}\n${shareUrl}`;
        copyText(clipText);
    }
}

// 지적 경계 가져오기 및 강조
function fetchAndHighlightBoundary(x, y) {
    const callbackName = 'vworld_boundary_' + Math.floor(Math.random() * 100000);
    const btn = document.getElementById('btn-landeum-popup');

    // 로딩 표시
    if (btn) {
        btn.innerText = "로딩 중...";
        btn.classList.add('disabled');
    }

    window[callbackName] = function (data) {
        delete window[callbackName];
        document.getElementById(callbackName)?.remove();

        if (data.response.status === "OK" && data.response.result.featureCollection.features.length > 0) {
            const feature = data.response.result.featureCollection.features[0];

            if (currentBoundaryLayer) map.removeLayer(currentBoundaryLayer);

            // 강조 스타일 (빨간 테두리)
            currentBoundaryLayer = L.geoJSON(feature, {
                style: {
                    color: '#FF0000', weight: 4, opacity: 0.8,
                    fillColor: '#FF0000', fillOpacity: 0
                }
            }).addTo(map);

            // PNU 기반 토지e음 버튼 활성화
            if (feature.properties && feature.properties.pnu) {
                updatePopupLandEumButton(feature.properties.pnu);
            }
        } else {
            // 실패 시 재시도 버튼 활성화
            if (btn) {
                btn.innerText = "재시도";
                btn.classList.remove('disabled');
                btn.disabled = false;
                btn.style.backgroundColor = "#999";
                btn.style.color = "white";
                btn.onclick = () => fetchAndHighlightBoundary(x, y);
            }
        }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_API_KEY}&domain=${window.location.hostname}&geomFilter=POINT(${x} ${y})&format=json&errorformat=json&callback=${callbackName}`;
    document.body.appendChild(script);
}

// 팝업 내 토지e음 버튼 업데이트
function updatePopupLandEumButton(pnu) {
    const btn = document.getElementById('btn-landeum-popup');
    if (btn) {
        btn.classList.remove('disabled');
        btn.disabled = false;
        btn.onclick = () => {
            window.open(`https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?pnu=${pnu}&mode=search&isNoScr=script&add=land`, '_blank');
        };
        btn.innerText = "토지e음 조회";
        btn.style.backgroundColor = "#007bff";
        btn.style.color = "#fff";
        btn.style.border = "1px solid #007bff";
    }
}



/* --------------------------------------------------------------------------
   9. 기능: 그리기 및 편집 (Feature: Drawing & Editing)
   -------------------------------------------------------------------------- */
// 지도 위에 점, 선, 면을 그리고 수정하는 기능입니다.

const drawnItems = new L.FeatureGroup(); // 그려진 도형들을 담을 그룹
map.addLayer(drawnItems);

// 기본 아이콘 설정 (파란색)
const defaultSurveyIcon = createColoredMarkerIcon('#0040ff');

// 그리기 도구 설정 (Leaflet.Draw)
const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: {
        polygon: true,
        polyline: true,
        marker: { icon: defaultSurveyIcon },
        circle: false,
        rectangle: false,
        circlemarker: false
    }
});
map.addControl(drawControl);

const actionToolbar = document.getElementById('action-toolbar');

function startDraw(type) {
    if (currentDrawer) currentDrawer.disable();
    stopEditMode();

    const options = { touchIcon: null, showLength: true, allowIntersection: true };

    if (type === 'polygon') {
        currentDrawer = new L.Draw.Polygon(map, options);
        highlightButton('btn-poly');
    } else if (type === 'polyline') {
        currentDrawer = new L.Draw.Polyline(map, options);
        highlightButton('btn-line');
    } else if (type === 'marker') {
        currentDrawer = new L.Draw.Marker(map, { icon: defaultSurveyIcon });
        highlightButton('btn-point');
    }

    document.body.classList.add('recording-mode'); // UI 모드 변경

    // 수동 종료 처리를 위한 후킹
    if (currentDrawer && (type === 'polygon' || type === 'polyline')) {
        currentDrawer._originalFinishShape = currentDrawer._finishShape;
        currentDrawer._finishShape = function () {
            if (isManualFinish) { this._originalFinishShape(); }
        };
    }
    currentDrawer.enable();
    actionToolbar.style.display = 'flex';
}

// 그리기 완료
function completeDrawing() {
    if (currentDrawer) {
        isManualFinish = true;
        if (currentDrawer.completeShape) currentDrawer.completeShape();
        else if (currentDrawer._finishShape) currentDrawer._finishShape();
        else currentDrawer.disable();
        isManualFinish = false;
    }
    resetDrawingState();
}

// 그리기 취소
function cancelDrawing() {
    if (currentDrawer) {
        currentDrawer.disable();
        currentDrawer = null;
    }
    resetDrawingState();
}

function resetDrawingState() {
    document.body.classList.remove('recording-mode');
    actionToolbar.style.display = 'none';
    resetButtonStyles();
}

// 편집 모드 시작
const editHandler = new L.EditToolbar.Edit(map, { featureGroup: drawnItems });

function startEditMode() {
    if (currentDrawer) cancelDrawing();
    editHandler.enable();
    highlightButton('btn-edit');
    alert("수정 모드: 도형을 드래그하거나 점을 움직이세요.\n완료하려면 지도를 터치하세요.");

    map.once('click', function () {
        editHandler.save();
        editHandler.disable();
        resetButtonStyles();
        alert("수정 완료");
    });
}

function stopEditMode() {
    if (editHandler.enabled()) {
        editHandler.disable();
        resetButtonStyles();
    }
}

// GPS 좌표로 점 추가 (그리기 도중)
function addGpsVertex() {
    if (!currentDrawer) return;
    if (!navigator.geolocation) { alert("GPS 미지원"); return; }

    navigator.geolocation.getCurrentPosition(function (pos) {
        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);

        if (currentDrawer instanceof L.Draw.Marker) {
            const marker = L.marker(latlng, { icon: defaultSurveyIcon });
            currentDrawer.disable();
            currentDrawer = null;
            map.fire(L.Draw.Event.CREATED, { layer: marker, layerType: 'marker' });
            resetDrawingState();
        } else {
            currentDrawer.addVertex(latlng);
        }
        map.panTo(latlng);
    }, function () {
        alert("GPS 수신 실패");
    }, { enableHighAccuracy: true });
}

function deleteLastVertex() {
    if (currentDrawer && currentDrawer.deleteLastVertex) currentDrawer.deleteLastVertex();
}

// 개별 레이어 수정 (목록에서 "수정" 클릭 시)
window.enableSingleLayerEdit = function (id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    if (layer instanceof L.Marker) {
        layer.dragging.enable();
    } else {
        if (!layer.editing) {
            // Leaflet.Edit 모듈 초기화 확인
            if (L.Edit && L.Edit.Poly) layer.editing = new L.Edit.Poly(layer);
            else { alert("수정 모듈 오류"); return; }
        }
        if (layer.editing) layer.editing.enable();
        else { alert("수정 불가 도형"); return; }
    }

    layer.closePopup();
    alert("수정 모드입니다. 완료하려면 지도 바탕을 터치하세요.");
    document.body.classList.add('recording-mode');

    // 클릭으로 편집 종료
    setTimeout(() => {
        map.once('click', function () {
            if (layer instanceof L.Marker) layer.dragging.disable();
            else if (layer.editing) layer.editing.disable();

            updateLayerInfo(layer);
            saveToStorage();
            renderSurveyList();
            document.body.classList.remove('recording-mode');
            alert("수정 완료");
        });
    }, 100);
};

// 그리기 완료 이벤트 (도형 생성 시)
map.on(L.Draw.Event.CREATED, function (event) {
    const layer = event.layer;
    let memo = prompt("기록명 입력:", getTimestampString());
    if (memo === null) return; // 취소 시 무시
    if (!memo) memo = getTimestampString();

    const randomColor = getRandomColor();
    layer.feature = {
        type: "Feature",
        properties: { memo: memo, id: Date.now(), isHidden: false, customColor: randomColor }
    };

    if (event.layerType === 'marker') {
        layer.setIcon(createColoredMarkerIcon(randomColor));
    } else {
        layer.setStyle({ color: randomColor, fillColor: randomColor });
    }

    updateLayerInfo(layer);
    drawnItems.addLayer(layer);
    saveToStorage();

    resetDrawingState();
    currentDrawer = null;

    layer.openPopup();
    switchSidebarTab('record');
    renderSurveyList();
});

// 편집 이벤트 핸들러
map.on('draw:edited', function (e) {
    e.layers.eachLayer(updateLayerInfo);
    saveToStorage();
    renderSurveyList();
});



/* --------------------------------------------------------------------------
   10. 기능: 데이터 관리 (Feature: Data Persistence)
   -------------------------------------------------------------------------- */
// 그리기 데이터 목록 표시, 저장, 삭제 등

function renderSurveyList() {
    const listContainer = document.getElementById('survey-list-area');
    listContainer.innerHTML = "";

    const layers = drawnItems.getLayers();

    const allVisible = layers.length > 0 && layers.every(l => !l.feature.properties.isHidden);
    document.getElementById('chk-select-all').checked = (layers.length > 0 && allVisible);

    if (layers.length === 0) {
        listContainer.innerHTML = '<div style="padding:15px; text-align:center; color:#999; font-size:12px;">기록 없음</div>';
        return;
    }

    // 생성 순으로 정렬 (오래된 것 -> 최신 것)
    // appendChild를 사용하므로 최신 기록이 리스트의 하단에 추가됨
    layers.slice().forEach(function (layer) {
        const props = layer.feature.properties || {};
        const isHidden = props.isHidden === true;
        const typeIcon = (layer instanceof L.Marker) ? SVG_ICONS.marker : (layer instanceof L.Polygon ? SVG_ICONS.polygon : SVG_ICONS.ruler);

        const div = document.createElement('div');
        div.className = 'survey-item';
        div.innerHTML = `
        <div class="survey-check-area">
            <input type="checkbox" class="survey-checkbox" ${!isHidden ? "checked" : ""} onchange="toggleLayerVisibility(${props.id})">
        </div>
        <div class="survey-info" onclick="zoomToLayer(${props.id})">
            <div class="survey-name">${typeIcon} ${props.memo}</div>
        </div>
        <div class="survey-actions">
            <input type="color" class="color-picker-input" value="${props.customColor || '#3388ff'}" onchange="updateLayerColor(${props.id}, this.value)" style="margin-right:2px;">
            <button class="btn-more" onclick="openContextMenu(event, ${props.id})">${SVG_ICONS.more}</button>
        </div>`;
        listContainer.appendChild(div);
    });

    // 프로젝트 선택기의 수치를 최신화
    renderProjectSelector();
}

// 레이어 팝업 내용 업데이트(면적, 거리 계산 포함)
function updateLayerInfo(layer) {
    const memo = layer.feature.properties.memo || "";
    let infoText = "";

    if (layer instanceof L.Marker) {
        const pos = layer.getLatLng();
        if (coordMode === 2) {
            infoText = "X:" + getTmCoords(pos.lat, pos.lng).x + ", Y:" + getTmCoords(pos.lat, pos.lng).y;
        } else if (coordMode === 1) {
            infoText = "N " + pos.lat.toFixed(4) + "° , E " + pos.lng.toFixed(4) + "°";
        } else {
            infoText = convertToDms(pos.lat, 'lat') + "<br>" + convertToDms(pos.lng, 'lng');
        }
    } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
        infoText = "<b>" + SVG_ICONS.ruler + " 거리:</b> " + (turf.length(layer.toGeoJSON(), { units: 'kilometers' }) * 1000).toFixed(2) + " m";
    } else if (layer instanceof L.Polygon) {
        infoText = "<b>" + SVG_ICONS.polygon + " 면적:</b> " + turf.area(layer.toGeoJSON()).toFixed(2) + " ㎡";
    }

    let popupContent = `<div style="font-size:14px; color:#3B82F6; font-weight:bold; margin-bottom:5px;">${memo}</div>`;
    popupContent += `<hr style="margin: 5px 0; border: none; border-top: 1px solid #f0f0f0;">`;

    if (infoText) popupContent += `<div style="font-size:12px; color:#666;">${infoText}</div>`;

    const id = layer.feature.properties.id;
    popupContent += `<div style="margin-top:8px; padding-top:8px; display:flex; gap:5px;">
        <button class="popup-btn" style="flex:1; background:#f0f0f0; color:#333;" onclick="enableSingleLayerEdit(${id})">수정</button>
        <button class="popup-btn" style="flex:1; background:#ffebee; color:#d32f2f;" onclick="deleteLayerById(${id})">삭제</button>
    </div>`;

    layer.bindPopup(popupContent);
}

// --- 데이터 저장/로드 헬퍼 ---

// 데이터 저장 (프로젝트 구조 반영)
function saveToStorage() {
    if (!currentProjectId) return; // 초기화 전이면 중단

    // 현재 프로젝트 찾기
    const project = projects.find(p => p.id === parseInt(currentProjectId));
    if (project) {
        project.features = drawnItems.toGeoJSON(); // 현재 그려진 내용을 프로젝트 데이터로 업데이트
        project.updatedAt = new Date().toISOString();
    }

    const storageData = {
        version: "2.0",
        currentProjectId: currentProjectId,
        projects: projects
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
}

// 데이터 로드 (마이그레이션 포함)
function loadFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) {
            // 데이터가 아예 없으면 기본 프로젝트 생성
            initDefaultProject();
            return;
        }

        const parsed = JSON.parse(saved);

        // 구 버전 데이터 감지 (배열이거나 FeatureCollection 인 경우)
        if (Array.isArray(parsed) || (parsed.type === "FeatureCollection")) {
            console.log("Legacy data detected. Migrating...");
            migrateLegacyData(parsed);
        } else if (parsed.version === "2.0") {
            // 신규 버전 데이터 로드
            projects = parsed.projects || [];
            currentProjectId = parsed.currentProjectId;

            // 만약 오류로 프로젝트가 없으면 초기화
            if (projects.length === 0) {
                initDefaultProject();
            } else {
                // 현재 프로젝트 ID가 유효하지 않으면 첫번째로 설정
                if (!projects.find(p => p.id === parseInt(currentProjectId))) {
                    currentProjectId = projects[0].id;
                }
                renderProjectSelector();
                loadCurrentProjectFeatures();
            }
        } else {
            // 알 수 없는 형식이면 초기화
            initDefaultProject();
        }
    } catch (e) {
        console.error("Load failed:", e);
        initDefaultProject();
    }
}

// 초기 프로젝트 생성
function initDefaultProject() {
    const defaultProject = {
        id: Date.now(),
        name: "기본 프로젝트",
        features: { type: "FeatureCollection", features: [] },
        createdAt: new Date().toISOString()
    };
    projects = [defaultProject];
    currentProjectId = defaultProject.id;

    saveToStorage();
    renderProjectSelector();
    // 빈 상태로 시작
}

// 레거시 데이터 마이그레이션
function migrateLegacyData(legacyData) {
    // GeoJSON 형식 맞추기
    let featureCollection = legacyData;
    if (Array.isArray(legacyData)) {
        // 혹시 단순 배열로 저장된 경우 (아주 아주 옛날 버전?)
        // (현재 코드는 FeatureCollection을 저장하므로 이 케이스는 드물겠지만 안전장치)
        featureCollection = { type: "FeatureCollection", features: legacyData };
    }

    const migratedProject = {
        id: Date.now(),
        name: "기본 프로젝트 (가져옴)",
        features: featureCollection,
        createdAt: new Date().toISOString()
    };

    projects = [migratedProject];
    currentProjectId = migratedProject.id;

    saveToStorage();
    renderProjectSelector();
    loadCurrentProjectFeatures();

    alert("이전 버전의 데이터가 '기본 프로젝트 (가져옴)'으로 이동되었습니다.");
}

// 현재 선택된 프로젝트의 데이터 지도에 표시
function loadCurrentProjectFeatures() {
    drawnItems.clearLayers(); // 기존 레이어 제거

    const project = projects.find(p => p.id === parseInt(currentProjectId));
    if (project && project.features) {
        restoreFeatures(project.features);
    }

    // UI 업데이트
    renderSurveyList();
}

function restoreFeatures(geoJsonData) {
    L.geoJSON(geoJsonData, {
        onEachFeature: function (feature, layer) {
            if (feature.properties) {
                layer.feature = feature;
                updateLayerInfo(layer);
            }
            const savedColor = feature.properties.customColor;
            if (feature.geometry.type === 'Point' && layer instanceof L.Marker)
                layer.setIcon(createColoredMarkerIcon(savedColor || '#0040ff'));
            else if (savedColor)
                layer.setStyle({ color: savedColor, fillColor: savedColor });

            drawnItems.addLayer(layer);
        }
    });
    renderSurveyList();
}


// --- 프로젝트 관리 기능 ---

// 프로젝트 선택 UI 렌더링
function renderProjectSelector() {
    const select = document.getElementById('project-select');
    if (!select) return;

    select.innerHTML = "";
    projects.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.text = p.name + ` (${p.features.features ? p.features.features.length : 0}개)`;
        if (p.id === parseInt(currentProjectId)) option.selected = true;
        select.appendChild(option);
    });
}

// 프로젝트 전환
window.switchProject = function (id) {
    saveToStorage(); // 현재 상태 저장 먼저
    currentProjectId = parseInt(id);
    loadCurrentProjectFeatures();
    renderProjectSelector(); // 개수 업데이트 등을 위해 다시 렌더링
};

// 새 프로젝트 생성
// 새 프로젝트 생성
window.createNewProject = function (initialName) {
    let defaultName = initialName || ("새 프로젝트 " + (projects.length + 1));
    // 이름 중복 방지 로직
    if (projects.some(p => p.name === defaultName)) {
        let cnt = 1;
        while (projects.some(p => p.name === `${defaultName} (${cnt})`)) cnt++;
        defaultName = `${defaultName} (${cnt})`;
    }

    const name = prompt("새 프로젝트 이름을 입력하세요:", defaultName);
    if (!name) return;

    // 현재 상태 저장
    saveToStorage();

    const newProject = {
        id: Date.now(),
        name: name,
        features: { type: "FeatureCollection", features: [] },
        createdAt: new Date().toISOString()
    };

    projects.push(newProject);

    // 새 프로젝트로 전환 (데이터 먼저 저장 후 ID 변경)
    saveToStorage();

    currentProjectId = newProject.id;

    // 중요: 기존 레이어 비우기
    drawnItems.clearLayers();

    saveToStorage(); // 새 프로젝트 상태(빈 상태)로 저장
    renderProjectSelector();
    renderSurveyList(); // 빈 리스트 렌더링
    alert(`'${name}' 프로젝트가 생성되었습니다.`);
};

// 프로젝트 이름 변경
window.editProjectName = function () {
    // 기본 프로젝트 보호 (첫 번째 프로젝트)
    if (projects.length > 0 && parseInt(currentProjectId) === projects[0].id) {
        alert("기본 프로젝트의 이름은 변경할 수 없습니다.");
        return;
    }

    const project = projects.find(p => p.id === parseInt(currentProjectId));
    if (!project) return;

    const newName = prompt("프로젝트 이름을 변경합니다:", project.name);
    if (newName && newName !== project.name) {
        project.name = newName;
        saveToStorage();
        renderProjectSelector();
    }
};

// 프로젝트 삭제
window.deleteCurrentProject = function () {
    // 기본 프로젝트 보호 (첫 번째 프로젝트)
    if (projects.length > 0 && parseInt(currentProjectId) === projects[0].id) {
        alert("기본 프로젝트는 삭제할 수 없습니다.");
        return;
    }

    if (projects.length <= 1) {
        alert("최소 하나의 프로젝트는 존재해야 합니다.");
        return;
    }

    const project = projects.find(p => p.id === parseInt(currentProjectId));
    if (!confirm(`'${project.name}' 프로젝트와 포함된 모든 기록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    // 삭제
    projects = projects.filter(p => p.id !== parseInt(currentProjectId));

    // 이전 프로젝트(또는 첫번째)로 전환
    currentProjectId = projects[0].id; // 보통 기본 프로젝트로 돌아감

    saveToStorage();
    renderProjectSelector();
    loadCurrentProjectFeatures();

    alert("삭제되었습니다.");
};


// --- 프로젝트 이동 기능 ---

let moveTargetLayerIds = []; // 이동할 레이어 ID 목록

window.openMoveProjectModal = function (layerId) {
    // 이동 대상 설정
    if (layerId) {
        moveTargetLayerIds = [layerId];
    } else {
        // 선택된 레이어 찾기
        moveTargetLayerIds = [];
        const layers = drawnItems.getLayers();
        layers.forEach(layer => {
            const props = layer.feature.properties;
            const checkbox = document.querySelector(`.survey-item input[onchange="toggleLayerVisibility(${props.id})"]`);
            // 주의: 현재 구조상 체크박스와 isHidden이 반대임 (체크됨=보임). 
            // 하지만 리스트 UI에서 checkbox dom을 직접 찾기는 까다로울 수 있음.
            // 대신 isHidden 값을 사용할 수도 있지만, "선택"이라는 개념이 "보임/숨김"과 다를 수 있음.
            // 여기서는 "보이는(체크된) 항목"을 이동한다고 가정하거나, 별도의 "선택" 모드가 없으므로 
            // "화면에 보이는(체크된) 항목"을 대상으로 함.
            if (!props.isHidden) {
                moveTargetLayerIds.push(props.id);
            }
        });

        if (moveTargetLayerIds.length === 0) {
            alert("이동할 기록이 없습니다. (체크된 항목이 이동됩니다)");
            return;
        }
    }

    // 프로젝트 목록 렌더링
    const list = document.getElementById('project-move-list');
    list.innerHTML = "";

    projects.forEach(p => {
        // 현재 프로젝트 제외
        if (p.id === parseInt(currentProjectId)) return;

        const btn = document.createElement('button');
        btn.style.cssText = "padding:12px; background:white; border:1px solid #ddd; border-radius:8px; text-align:left; cursor:pointer; font-size:14px; color:#333;";
        btn.innerHTML = `<b>${p.name}</b> <span style='color:#888; font-size:12px;'>(${p.features.features ? p.features.features.length : 0}개)</span>`;
        btn.onclick = () => executeMoveProject(p.id);
        list.appendChild(btn);
    });

    if (list.children.length === 0) {
        list.innerHTML = "<div style='text-align:center; padding:20px; color:#999;'>이동할 다른 프로젝트가 없습니다.</div>";
    }

    const overlay = document.getElementById('project-move-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
};

window.openMoveSelectionModal = function () {
    openMoveProjectModal(null);
};

window.closeMoveProjectModal = function () {
    const overlay = document.getElementById('project-move-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    moveTargetLayerIds = [];
};

function executeMoveProject(targetProjectId) {
    if (moveTargetLayerIds.length === 0) return;

    const targetProject = projects.find(p => p.id === parseInt(targetProjectId));
    if (!targetProject) return;

    // 대상 프로젝트의 features가 없으면 초기화
    if (!targetProject.features || !targetProject.features.features) {
        targetProject.features = { type: "FeatureCollection", features: [] };
    }

    let movedCount = 0;

    moveTargetLayerIds.forEach(id => {
        const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
        if (layer) {
            // 레이어의 GeoJSON 데이터를 대상 프로젝트에 추가
            const geoJSON = layer.toGeoJSON();
            targetProject.features.features.push(geoJSON);

            // 현재 맵에서 제거
            drawnItems.removeLayer(layer);
            movedCount++;
        }
    });

    if (movedCount > 0) {
        saveToStorage(); // 변경사항 저장 (현재 프로젝트: 제거됨, 대상 프로젝트: 추가됨)
        renderSurveyList();
        renderProjectSelector(); // 카운트 갱신
        alert(`${movedCount}개의 기록이 '${targetProject.name}'으로 이동되었습니다.`);
        closeMoveProjectModal();
    }
}

// 컨텍스트 메뉴(점3개) 열기 함수 (기존 구현이 없거나 찾기 어려워 새로 작성/대체)
// (기존 openContextMenu 중복 정의 제거)



/* --------------------------------------------------------------------------
   11. 기능: 위치 추적 (Feature: Geolocation)
   -------------------------------------------------------------------------- */
// GPS를 이용해 내 위치를 지도에 표시합니다.

function onTrackSuccess(pos) {
    updateLocationMarker(pos);
    if (isFollowing) map.panTo([pos.coords.latitude, pos.coords.longitude]);
}

function updateLocationMarker(pos) {
    if (pos.coords.accuracy === 0) return;
    const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
    if (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading)) { lastHeading = pos.coords.heading; }

    // 오차 범위 원
    if (!trackingCircle)
        trackingCircle = L.circle(latlng, { radius: pos.coords.accuracy, weight: 1, color: 'blue', opacity: 0.3, fillOpacity: 0.1 }).addTo(map);
    else
        trackingCircle.setLatLng(latlng).setRadius(pos.coords.accuracy);

    // 화살표 마커 (방향 반영)
    const arrowSvg = `<div style="transform: rotate(${lastHeading}deg); transform-origin: center center; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 100 100" width="20" height="20" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
                            <path d="M50 0 L100 100 L50 80 L0 100 Z" fill="#007bff" stroke="white" stroke-width="10" />
                        </svg>
                    </div>`;
    const arrowIcon = L.divIcon({ className: '', html: arrowSvg, iconSize: [20, 20], iconAnchor: [10, 10] });

    if (!trackingMarker)
        trackingMarker = L.marker(latlng, { icon: arrowIcon, zIndexOffset: 1000 }).addTo(map);
    else
        trackingMarker.setLatLng(latlng).setIcon(arrowIcon);

    // 주소 및 좌표 상태 업데이트
    getAddressFromCoords(pos.coords.latitude, pos.coords.longitude);
    lastGpsLat = pos.coords.latitude;
    lastGpsLng = pos.coords.longitude;
    updateCoordDisplay();
}

function toggleTracking() {
    const btn = document.getElementById('toggle-track-btn');
    if (!navigator.geolocation) { alert("GPS 미지원"); return; }

    if (isFollowing) {
        isFollowing = false;
        btn.classList.remove('tracking-btn-on');
        btn.classList.remove('tracking-active');
    } else {
        isFollowing = true;
        navigator.geolocation.getCurrentPosition(onTrackSuccess, null, { enableHighAccuracy: true });
        btn.classList.add('tracking-btn-on');
        btn.classList.add('tracking-active');
    }
}
// 선택된 레이어 일괄 삭제
window.deleteSelectedLayers = function () {
    let targetLayerIds = [];
    const layers = drawnItems.getLayers();

    // 선택(체크)된 레이어 식별
    layers.forEach(layer => {
        const props = layer.feature.properties;
        if (!props.isHidden) { // 여기서는 체크된(보이는) 레이어를 선택된 것으로 간주
            targetLayerIds.push(props.id);
        }
    });

    if (targetLayerIds.length === 0) {
        alert("삭제할 기록이 없습니다. (체크된 항목이 삭제됩니다)");
        return;
    }

    if (!confirm(`선택한 ${targetLayerIds.length}개의 기록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    let deletedCount = 0;
    targetLayerIds.forEach(id => {
        const layer = layers.find(l => l.feature.properties.id === id);
        if (layer) {
            drawnItems.removeLayer(layer);
            deletedCount++;
        }
    });

    if (deletedCount > 0) {
        saveToStorage();
        renderSurveyList();
        renderProjectSelector();
        alert(`${deletedCount}개의 기록이 삭제되었습니다.`);
    }
};
function findMe() {
    if (!navigator.geolocation) { alert("GPS 미지원"); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 19);
    }, function () { alert("위치 실패"); }, { enableHighAccuracy: true });
}



/* --------------------------------------------------------------------------
   12. 기능: 길찾기 (Feature: Navigation)
   -------------------------------------------------------------------------- */
let navTarget = { name: '', lat: 0, lng: 0 };

function openNavModal(name, lat, lng) {
    navTarget = { name: name || "목적지", lat: lat, lng: lng };
    const overlay = document.getElementById('nav-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

function closeNavModal() {
    const overlay = document.getElementById('nav-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

function executeNavigation(type) {
    const { name, lat, lng } = navTarget;
    let url = "";

    if (type === 'tmap') url = `tmap://route?goalname=${encodeURIComponent(name)}&goalx=${lng}&goaly=${lat}`;
    else if (type === 'naver') url = `nmap://navigation?dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(name)}&appname=F-Field`;
    else if (type === 'kakao') url = `kakaomap://route?ep=${lat},${lng}&by=CAR`;

    window.location.href = url;
    setTimeout(closeNavModal, 500);
}



/* --------------------------------------------------------------------------
   13. 기타 유틸리티 (Utils)
   -------------------------------------------------------------------------- */

function getTimestampString() {
    const now = new Date();
    return now.toISOString().slice(2, 10).replace(/-/g, "") + "_" + now.toTimeString().slice(0, 8).replace(/:/g, "");
}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) color += letters[Math.floor(Math.random() * 16)];
    return color;
}

function createColoredMarkerIcon(color) {
    return L.divIcon({
        className: '',
        html: `<svg viewBox="0 0 24 24" width="36" height="36" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" 
                      fill="${color}" stroke="white" stroke-width="1.5"/>
               </svg>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
    });
}

function getShortAddress(addressName) {
    if (!addressName) return "";
    const parts = addressName.split(' ');
    // 동, 리, 가 로 끝나는 부분 찾기
    for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].match(/(동|리|가)$/)) return parts.slice(i).join(' ');
    }
    return parts.length >= 2 ? parts.slice(parts.length - 2).join(' ') : addressName;
}

// 좌표 변환 (WGS84 -> TM)
function getTmCoords(lat, lng) {
    const xy = proj4("EPSG:4326", "EPSG:5186", [lng, lat]);
    return { x: Math.round(xy[0]), y: Math.round(xy[1]) };
}

function convertToDms(val, type) {
    const valAbs = Math.abs(val);
    const deg = Math.floor(valAbs);
    const minFloat = (valAbs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(2);
    return (val >= 0 ? (type === 'lat' ? "N" : "E") : (type === 'lat' ? "S" : "W")) + " " + deg + "° " + min + "' " + sec + "\"";
}



/* --------------------------------------------------------------------------
   14. 이벤트 리스너 및 초기화 (Events & Initialization)
   -------------------------------------------------------------------------- */

// 우클릭 방지
document.getElementById('map').oncontextmenu = function (e) { e.preventDefault(); e.stopPropagation(); return false; };

// 시작 시 데이터 로드 및 GPS 연결
loadFromStorage();

if (navigator.geolocation) {
    navigator.geolocation.watchPosition(onTrackSuccess, null, { enableHighAccuracy: true });

    // 딥링크(좌표 파라미터)가 없으면 내 위치로 이동
    const params = new URLSearchParams(window.location.search);
    if (!params.has('lat') || !params.has('lng')) {
        navigator.geolocation.getCurrentPosition(function (pos) {
            map.setView([pos.coords.latitude, pos.coords.longitude], 19);
        }, null, { enableHighAccuracy: true });
    }
}

// 딥링크 처리 (URL 파라미터로 위치 받기)
(function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get('lat'));
    const lng = parseFloat(params.get('lng'));

    if (!isNaN(lat) && !isNaN(lng)) {
        map.setView([lat, lng], 19);
        setTimeout(() => {
            showInfoPopup(lat, lng);
            fetchAndHighlightBoundary(lng, lat);
        }, 500);
    }
})();

// 일부 빠진 버튼 이벤트 핸들러들
function resetButtonStyles() { document.querySelectorAll('.bottom-btn').forEach(btn => btn.classList.remove('active-btn')); }
function highlightButton(btnId) { resetButtonStyles(); document.getElementById(btnId).classList.add('active-btn'); }

function saveCurrentPoint(lat, lng, addressName) {
    const shortName = getShortAddress(addressName);
    const marker = L.marker([lat, lng], { icon: createColoredMarkerIcon('#FF0000') });
    marker.feature = { type: "Feature", properties: { id: Date.now(), memo: shortName || "지점 기록", customColor: '#FF0000', isHidden: false } };
    updateLayerInfo(marker);
    drawnItems.addLayer(marker);
    saveToStorage();
    renderSurveyList();
    alert(`지점이 기록되었습니다.\n(${shortName})`);
    openSidebar();
    switchSidebarTab('record');
}

function saveCurrentBoundary(addressName) {
    if (!currentBoundaryLayer) { alert("영역이 선택되지 않았습니다."); return; }
    let shortName = getShortAddress(addressName);

    currentBoundaryLayer.eachLayer(function (layer) {
        const feature = layer.feature;
        const newLayer = L.geoJSON(feature, { style: { color: '#FF0000', weight: 4, opacity: 0.8, fillColor: '#FF0000', fillOpacity: 0.2 } });
        newLayer.eachLayer(innerLayer => {
            innerLayer.feature = innerLayer.feature || {};
            innerLayer.feature.properties = { id: Date.now(), memo: shortName || "지적 영역", customColor: '#FF0000', isHidden: false };
            updateLayerInfo(innerLayer);
            drawnItems.addLayer(innerLayer);
        });
    });

    saveToStorage();
    renderSurveyList();
    alert(`영역이 기록되었습니다.\n(${shortName})`);
    openSidebar();
    switchSidebarTab('record');
}

// 좌표 표시 업데이트, 모달 제어 등은 생략된 구현들을 포함해야 함...
// (이전 코드에서 필요한 나머지 조각들: updateCoordDisplay, openCoordModal 등)
let lastAddressCall = 0;
function getAddressFromCoords(lat, lng) {
    const now = Date.now();
    if (now - lastAddressCall < 2000) return;
    lastAddressCall = now;

    const callbackName = 'vworld_callback_' + Math.floor(Math.random() * 100000);
    window[callbackName] = function (data) {
        document.getElementById('address-display').innerText = (data.response.status === "OK") ? data.response.result[0].text : "주소 정보 없음";
        delete window[callbackName];
        document.getElementById(callbackName)?.remove();
    };
    const script = document.createElement('script'); script.id = callbackName;
    script.src = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&format=jsonp&type=BOTH&zipcode=false&simple=false&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

function updateCoordDisplay() {
    let lat = lastGpsLat;
    let lng = lastGpsLng;
    let text = "";
    if (coordMode === 2) {
        const tm = getTmCoords(lat, lng);
        text = "X: " + tm.x + " | Y: " + tm.y;
    } else if (coordMode === 1) text = "N " + lat.toFixed(4) + "° | E " + lng.toFixed(4) + "°";
    else text = convertToDms(lat, 'lat') + " | " + convertToDms(lng, 'lng');
    document.getElementById('coord-display').innerText = text;
}

function openCoordModal() {
    document.getElementsByName('coord-mode-select').forEach(r => { if (parseInt(r.value) === coordMode) r.checked = true; });
    const overlay = document.getElementById('coord-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

function closeCoordModal() {
    const overlay = document.getElementById('coord-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

function setCoordMode(mode) {
    coordMode = mode;
    updateCoordDisplay();
    setTimeout(closeCoordModal, 200);
}
// 초기 좌표 표시
updateCoordDisplay();

// 그 외 export/import 함수들
window.deleteLayerById = function (id) {
    if (confirm("해당 기록을 삭제합니다.")) {
        const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
        if (layer) drawnItems.removeLayer(layer);
        saveToStorage();
        renderSurveyList();
    }
};

window.editLayerMemo = function (id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    const newMemo = prompt("수정할 메모:", layer.feature.properties.memo);
    if (newMemo) {
        layer.feature.properties.memo = newMemo;
        updateLayerInfo(layer);
        saveToStorage();
        renderSurveyList();
    }
};

window.toggleLayerVisibility = function (id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (layer) {
        const isHidden = !layer.feature.properties.isHidden;
        layer.feature.properties.isHidden = isHidden;
        if (isHidden) {
            layer instanceof L.Marker ? layer.setOpacity(0) : layer.setStyle({ opacity: 0, fillOpacity: 0, stroke: false });
            layer.closePopup();
            if (layer._path) layer._path.style.pointerEvents = 'none';
        } else {
            layer instanceof L.Marker ? layer.setOpacity(1) : layer.setStyle({ opacity: 1, fillOpacity: 0.2, stroke: true });
            if (layer._path) layer._path.style.pointerEvents = 'auto';
        }
        saveToStorage();
        renderSurveyList();
    }
};

window.toggleAllLayers = function (isChecked) {
    drawnItems.getLayers().forEach(function (layer) {
        layer.feature.properties.isHidden = !isChecked;
        // visibility setter logic repeated... (생략 말고 구현)
        if (!isChecked) {
            layer instanceof L.Marker ? layer.setOpacity(0) : layer.setStyle({ opacity: 0, fillOpacity: 0, stroke: false });
            layer.closePopup();
            if (layer._path) layer._path.style.pointerEvents = 'none';
        } else {
            layer instanceof L.Marker ? layer.setOpacity(1) : layer.setStyle({ opacity: 1, fillOpacity: 0.2, stroke: true });
            if (layer._path) layer._path.style.pointerEvents = 'auto';
        }
    });
    saveToStorage();
    renderSurveyList();
};

window.exportSingleLayer = function (id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    let safeMemo = (layer.feature.properties.memo || "unnamed").replace(/[\\/:*?"<>|]/g, "_");
    saveOrShareFile(JSON.stringify(layer.toGeoJSON(), null, 2), safeMemo + ".geojson");
};

// 변경: 현재 프로젝트 전체 저장 (파일명: 프로젝트명_yymmdd)
// 변경: 현재 프로젝트 전체 저장 (파일명: 프로젝트명_yymmdd)
window.exportCurrentProject = function () {
    const project = projects.find(p => p.id === parseInt(currentProjectId));
    if (!project) return;

    // 현재 그려진 내용으로 features 갱신
    const currentFeatures = drawnItems.toGeoJSON();

    if (currentFeatures.features.length === 0) {
        alert("저장할 기록이 없습니다.");
        return;
    }

    // 메타데이터 주입 (스마트 불러오기용)
    currentFeatures.isProjectExport = true;
    currentFeatures.projectName = project.name;
    currentFeatures.exportedAt = new Date().toISOString();

    // 날짜 포맷 생성 (YYMMDD)
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yy}${mm}${dd}`;

    // 파일명 생성 (공백 등 특수문자 처리)
    const safeProjectName = project.name.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
    const fileName = `${safeProjectName}_${dateStr}.geojson`;

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentFeatures));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", fileName);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

function saveOrShareFile(content, fileName) {
    if (navigator.canShare && navigator.share) {
        const file = new File([content], fileName, { type: "application/json" });
        if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: 'F-Field 기록' }).catch(err => saveToDevice(content, fileName));
        } else saveToDevice(content, fileName);
    } else {
        saveToDevice(content, fileName);
    }
}

function saveToDevice(content, fileName) {
    const blob = new Blob([content], { type: "application/geo+json" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

window.zoomToLayer = function (id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    closeSidebar();
    if (layer instanceof L.Marker) {
        map.flyTo(layer.getLatLng(), 19);
        layer.openPopup();
    } else {
        map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 19 });
        setTimeout(() => layer.openPopup(), 1500);
    }
};

function triggerFileInput() { document.getElementById('geoJsonInput').click(); }
function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            const json = JSON.parse(e.target.result);

            // 스마트 불러오기: 프로젝트 파일 감지
            if (json.isProjectExport && json.projectName) {
                if (confirm(`프로젝트 '${json.projectName}' 데이터를 감지했습니다.\n새 프로젝트로 불러오시겠습니까?\n(취소 시 현재 프로젝트에 합쳐집니다)`)) {
                    // 새 프로젝트 생성 및 전환
                    createNewProject(json.projectName);
                    // 데이터 로드
                    restoreFeatures(json);
                    saveToStorage();
                    closeSidebar();
                    input.value = '';
                    return;
                }
            }

            // 일반 불러오기 (현재 프로젝트에 병합)
            restoreFeatures(json);
            saveToStorage();
            alert("완료");
            closeSidebar();
        } catch (err) { alert("오류: " + err); }
        input.value = '';
    };
    r.readAsText(file);
}

function clearAllData() {
    if (confirm("선택한 기록이 모두 삭제됩니다.")) {
        drawnItems.clearLayers();
        saveToStorage();
        renderSurveyList();
    }
}
window.updateLayerColor = function (id, newColor) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    if (layer instanceof L.Marker) layer.setIcon(createColoredMarkerIcon(newColor));
    else layer.setStyle({ color: newColor, fillColor: newColor });
    layer.feature.properties.customColor = newColor;
    saveToStorage();
};

// --- 누락된 기능 복구 (Missing Functions Restored) ---

window.toggleLayerVisibility = function (id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    const isHidden = !layer.feature.properties.isHidden;
    layer.feature.properties.isHidden = isHidden;

    if (isHidden) {
        if (layer instanceof L.Marker) layer.setOpacity(0);
        else layer.setStyle({ opacity: 0, fillOpacity: 0, stroke: false });
        layer.closePopup();
        if (layer._path) layer._path.style.pointerEvents = 'none';
    } else {
        if (layer instanceof L.Marker) layer.setOpacity(1);
        else layer.setStyle({ opacity: 1, fillOpacity: 0.2, stroke: true });
        if (layer._path) layer._path.style.pointerEvents = 'auto';
    }
    saveToStorage();
    renderSurveyList();
};

window.deleteLayerById = function (id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    if (confirm("정말로 삭제하시겠습니까?")) {
        drawnItems.removeLayer(layer);
        saveToStorage();
        renderSurveyList();
    }
};

window.editLayerMemo = function (id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    const newMemo = prompt("새로운 기록명을 입력하세요:", layer.feature.properties.memo);
    if (newMemo !== null) {
        layer.feature.properties.memo = newMemo;
        updateLayerInfo(layer);
        saveToStorage();
        renderSurveyList();
    }
};

/* --------------------------------------------------------------------------
   15. 기능: 컨텍스트 메뉴 (Context Menu)
   -------------------------------------------------------------------------- */
let currentContextId = null;

function initContextMenu() {
    if (document.getElementById('global-context-menu')) return;

    const menu = document.createElement('div');
    menu.id = 'global-context-menu';
    menu.className = 'more-context-menu';
    // 메뉴 항목: 저장, 이름 수정, 삭제
    menu.innerHTML = `
        <div class="more-menu-item" onclick="handleMenuAction('save')">
            ${SVG_ICONS.save} 저장
        </div>
        <div class="more-menu-item" onclick="handleMenuAction('edit')">
            ${SVG_ICONS.edit} 기록명 수정
        </div>
        <div class="more-menu-item" onclick="handleMenuAction('move')">
            ${SVG_ICONS.folder_move}
            프로젝트 이동
        </div>
        <div class="more-menu-item danger" onclick="handleMenuAction('delete')">
            ${SVG_ICONS.trash} 삭제
        </div>
    `;
    document.body.appendChild(menu);

    // 외부 클릭 시 메뉴 닫기
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.btn-more') && !e.target.closest('.more-context-menu')) {
            closeContextMenu();
        }
    }, true); // 캡처링 단계에서 잡아서 확실히 처리
}

window.openContextMenu = function (e, id) {
    e.stopPropagation();
    e.preventDefault();
    initContextMenu(); // 메뉴가 없으면 생성

    currentContextId = id;
    const menu = document.getElementById('global-context-menu');
    const rect = e.currentTarget.getBoundingClientRect();

    // 위치 계산: 버튼의 오른쪽 아래를 기준으로 정렬하되 화면 밖으로 나가지 않게
    let top = rect.bottom + 5;
    let right = window.innerWidth - rect.right;

    menu.style.top = top + 'px';
    menu.style.right = right + 'px';
    menu.style.left = 'auto';
    menu.style.display = 'flex';

    // 애니메이션 효과
    requestAnimationFrame(() => menu.classList.add('visible'));
};

window.closeContextMenu = function () {
    const menu = document.getElementById('global-context-menu');
    if (menu) {
        menu.classList.remove('visible');
        setTimeout(() => {
            if (!menu.classList.contains('visible')) menu.style.display = 'none';
        }, 100);
    }
    currentContextId = null;
};

window.handleMenuAction = function (action) {
    const id = currentContextId;
    if (!id) return;

    closeContextMenu();

    // UI가 업데이트된 후 실행 (alert/prompt가 메뉴를 가리지 않도록)
    setTimeout(() => {
        if (action === 'save') {
            exportSingleLayer(id);
        } else if (action === 'edit') {
            editLayerMemo(id);
        } else if (action === 'move') {
            openMoveProjectModal(id);
        } else if (action === 'delete') {
            deleteLayerById(id);
        }
    }, 50);
};

window.toggleAccordion = function (contentId, headerElement) {
    const content = document.getElementById(contentId);
    if (!content) return;

    // Computed Style을 확인하여 display 상태 체크 (class로 제어되므로)
    // 하지만 style.display를 직접 토글하는 방식이 간단함.
    // 초기에는 class에 의해 none임. style.display가 설정되지 않았을 수 있음.

    // getComputedStyle 사용이 안전함
    const isVisible = window.getComputedStyle(content).display === 'block';

    if (isVisible) {
        content.style.display = 'none';
        headerElement.classList.remove('active');
    } else {
        content.style.display = 'block';
        headerElement.classList.add('active');
    }
};


/* --------------------------------------------------------------------------
   14. 기능: 더보기 메뉴 토글 (Feature: More Menu Toggle)
   -------------------------------------------------------------------------- */
function toggleMoreMenu(event) {
    event.stopPropagation();
    closeAllDropdowns();
    const menu = document.getElementById('more-menu');
    menu.classList.toggle('visible');
}

function toggleProjectMenu(event) {
    event.stopPropagation();
    closeAllDropdowns();
    const menu = document.getElementById('project-menu');
    menu.classList.toggle('visible');
}

function closeAllDropdowns() {
    const dropdowns = document.querySelectorAll('.dropdown-menu');
    dropdowns.forEach(menu => {
        if (menu.classList.contains('visible')) {
            menu.classList.remove('visible');
        }
    });
}

// 외부 클릭 시 모든 메뉴 닫기
window.addEventListener('click', function (event) {
    closeAllDropdowns();
});
