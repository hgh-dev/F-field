/* ==========================================================================
   프로젝트: 국유림 현장조사 앱 (F-Field)
   버전: v1.3.0
   작성일: 2026-01-25
   설명: K-GeoP 연동 기능 추가, 지점 저장 기능 추가
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. 전역 변수 설정 (Global Variables)
-------------------------------------------------------------------------- */

const VWORLD_API_KEY = "EE6276F5-3176-37ED-8478-85C820FB8529";
const STORAGE_KEY = "my_survey_data_v4";
const SEARCH_HISTORY_KEY = 'my_search_history';
const SEARCH_SETTING_KEY = 'my_search_setting_enabled';

let coordMode = 0; // 0: DMS, 1: Decimal, 2: TM
let isFollowing = false;
let watchId = null;
let isManualFinish = false;
let lastHeading = 0;

let trackingMarker = null;
let trackingCircle = null;
let currentDrawer = null;
let currentBoundaryLayer = null; // 지적 경계 레이어
let currentSearchMarker = null; // 검색/더블클릭 마커

/* --------------------------------------------------------------------------
   2. 아이콘 디자인 (SVG Images)
-------------------------------------------------------------------------- */
const SVG_ICONS = {
    marker: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
    polygon: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M12 2L2 9L6 21H18L22 9L12 2Z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    ruler: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M23 8c0 1.1-.9 2-2 2-.18 0-.35-.02-.51-.07l-3.56 3.55c.05.16.07.34.07.52 0 1.1-.9 2-2 2s-2-.9-2-2c0-.18.02-.36.07-.52l-2.55-2.55c-.16.05-.34.07-.52.07s-.36-.02-.52-.07l-4.55 4.56c.05.16.07.33.07.51 0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2c.18 0 .35.02.51.07l4.56-4.55C8.02 9.36 8 9.18 8 9c0-1.1.9-2 2-2s2 .9 2 2c0 .18-.02.36-.07.52l2.55 2.55c.16-.05.34-.07.52-.07s.36.02.52.07l3.55-3.56C19.02 8.35 19 8.18 19 8c0-1.1.9-2 2-2s2 .9 2 2z"/></svg>`,
    edit: `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    save: `<svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
    memo: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
    memo: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
    close: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    car: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
    lock: `<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`,
    unlock: `<svg viewBox="0 0 24 24"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c.55 0 1 .45 1 1s-.45 1-1 1H7c-1.66 0-3 1.34-3 3v2H3c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/></svg>`
};

/* [패치] Leaflet 라이브러리의 터치 오류 방지 */
L.Draw.Polyline.prototype._onTouch = function (e) { return; };


/* --------------------------------------------------------------------------
   3. 지도 생성 및 레이어(Layer) 설정
-------------------------------------------------------------------------- */

const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    tap: false,
    maxZoom: 22,
    doubleClickZoom: false
}).setView([37.245911, 126.960302], 17);

L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.control.scale({ imperial: false, metric: true }).addTo(map);

map.createPane('nasGukPane');
map.getPane('nasGukPane').style.zIndex = 350;
map.getPane('nasGukPane').style.pointerEvents = 'none';

proj4.defs("EPSG:5186", "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs");

const vworldBase = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', { key: VWORLD_API_KEY, layer: 'Base', ext: 'png', attribution: 'VWorld', maxNativeZoom: 19, maxZoom: 22 });
const vworldSatellite = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', { key: VWORLD_API_KEY, layer: 'Satellite', ext: 'jpeg', attribution: 'VWorld', maxNativeZoom: 19, maxZoom: 22 });
const vworldHybrid = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', { key: VWORLD_API_KEY, layer: 'Hybrid', ext: 'png', attribution: 'VWorld', maxNativeZoom: 19, maxZoom: 22 });
const vworldLxLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", { key: VWORLD_API_KEY, layers: 'lt_c_landinfobasemap', styles: '', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', maxZoom: 22, maxNativeZoom: 19, detectRetina: true, tileSize: 512, zoomOffset: 0, className: 'cadastral-layer' });
const vworldContinuousLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", { key: VWORLD_API_KEY, layers: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun', styles: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun', format: 'image/png', transparent: true, opacity: 0.6, version: '1.3.0', maxZoom: 22, maxNativeZoom: 19, detectRetina: true, tileSize: 512, zoomOffset: 0, className: 'cadastral-layer' });
const nasGukLayer = L.tileLayer('https://hgh-dev.github.io/map_data/suwon/guk/{z}/{x}/{y}.png', { minZoom: 1, maxZoom: 22, maxNativeZoom: 18, tms: false, pane: 'nasGukPane', opacity: 1, attribution: 'Suwon Guk' });

// [기능추가] 산림보호구역 Data API 레이어
let forestDataLayer = null;
let isForestActive = false;
let lastForestRequestId = 0;

map.addLayer(vworldSatellite);

map.addLayer(vworldContinuousLayer); // 기본값: 연속지적도
map.addLayer(vworldHybrid);


/* --------------------------------------------------------------------------
   4. 지도 조작 및 UI 기능 
-------------------------------------------------------------------------- */

function showInfoPopup(lat, lng) {
    const callbackName = 'vworld_popup_' + Math.floor(Math.random() * 100000);
    window[callbackName] = function (data) {
        let parcelAddr = "주소 정보 없음";
        let roadAddr = "";

        if (data.response.status === "OK") {
            const results = data.response.result;
            results.forEach(item => {
                if (item.type === 'parcel') {
                    parcelAddr = item.text;
                } else if (item.type === 'road') {
                    roadAddr = item.text;
                }
            });
            // 만약 지번 주소가 없는데 도로명 주소만 있다면 도로명 주소를 메인으로 사용 (예외 처리)
            if (parcelAddr === "주소 정보 없음" && roadAddr !== "") {
                parcelAddr = roadAddr;
                roadAddr = "";
            }
        }

        if (currentSearchMarker) {
            map.removeLayer(currentSearchMarker);
        }

        // 점 측량과 동일한 스타일의 마커 생성 (빨간색)
        currentSearchMarker = L.marker([lat, lng], { icon: createColoredMarkerIcon('#FF0000') }).addTo(map);

        // 점 측량과 동일한 스타일의 팝업 내용
        let infoText = "";
        if (coordMode === 2) {
            infoText = "X:" + getTmCoords(lat, lng).x + " | " + "Y:" + getTmCoords(lat, lng).y;
        } else if (coordMode === 1) {
            infoText = "N " + lat.toFixed(4) + "°, " + "E " + lng.toFixed(4) + "°";
        } else {
            infoText = convertToDms(lat, 'lat') + " " + convertToDms(lng, 'lng');
        }

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
        const scriptTag = document.getElementById(callbackName);
        if (scriptTag) scriptTag.remove();
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&format=jsonp&type=BOTH&zipcode=false&simple=false&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

map.on('dblclick', function (e) {
    showInfoPopup(e.latlng.lat, e.latlng.lng);
    fetchAndHighlightBoundary(e.latlng.lng, e.latlng.lat);
});

// [기능추가] 지도 클릭 시 지적 경계 및 마커 해제
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

// [기능추가] 팝업 내 토지e음 버튼 업데이트
function updatePopupLandEumButton(pnu) {
    const btn = document.getElementById('btn-landeum-popup');
    if (btn) {
        btn.classList.remove('disabled');
        btn.disabled = false;
        btn.onclick = function () {
            // [패치] 바로 열람이 되도록 파라미터 추가
            window.open(`https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?pnu=${pnu}&mode=search&isNoScr=script&add=land`, '_blank');
        };
        btn.innerText = "토지e음 조회";
        btn.style.backgroundColor = "#007bff";
        btn.style.color = "#fff";
        btn.style.border = "1px solid #007bff";
    }
}

// [기능추가] 텍스트 복사 함수
function copyText(text, silent = false, itemLabel = "주소") {
    const msg = `${itemLabel}가 복사되었습니다.`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (!silent) alert(msg);
        }).catch(err => {
            console.error("복사 실패:", err);
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

// [기능추가] 팝업 위치 공유 함수
function shareLocationText(address, lat, lng) {
    let coordText = `${lat}, ${lng}`;

    // 현재 좌표 모드에 맞춰 공유 텍스트 형식 변환
    if (coordMode === 2) { // TM
        const tm = getTmCoords(lat, lng);
        coordText = `X: ${tm.x}, Y: ${tm.y}`;
    } else if (coordMode === 1) { // Decimal
        coordText = `N ${parseFloat(lat).toFixed(4)}° , E ${parseFloat(lng).toFixed(4)}°`;
    } else { // DMS (기본)
        coordText = `${convertToDms(lat, 'lat')}, ${convertToDms(lng, 'lng')}`;
    }

    // 내 위치 공유(shareMyLocation)와 동일한 포맷 사용
    const shareUrl = `${window.location.origin}${window.location.pathname}?lat=${lat}&lng=${lng}`;

    const shareData = {
        title: '[F-Field] 위치 공유',
        text: `\n주소: ${address}\n좌표: ${coordText}\n\n링크를 클릭하면 공유된 위치로 이동합니다.`,
        url: shareUrl
    };

    if (navigator.share) {
        navigator.share(shareData).catch(err => {
            console.log('공유 취소 또는 실패', err);
        });
    } else {
        // PC 등 navigator.share 미지원 시 클립보드 복사 (URL + 텍스트)
        const clipText = `${shareData.text}\n${shareUrl}`;
        copyText(clipText);
    }
}

document.getElementById('map').oncontextmenu = function (e) { e.preventDefault(); e.stopPropagation(); return false; };

// [UI] 사이드바 열기 애니메이션
function openSidebar() {
    syncSidebarUI();
    renderSurveyList();
    const overlay = document.getElementById('sidebar-overlay');
    overlay.style.display = 'block';

    // 부드러운 애니메이션 효과를 위해 약간의 지연
    setTimeout(() => {
        overlay.classList.add('visible');
    }, 10);
}

// [UI] 사이드바 닫기 애니메이션
function closeSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    overlay.classList.remove('visible');

    // CSS transition(0.3s)이 끝난 후 숨김 처리
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 300);
}

function syncSidebarUI() {
    const hasBase = map.hasLayer(vworldBase);
    const hasSat = map.hasLayer(vworldSatellite);
    document.getElementById('chk-base-layer').checked = (hasBase || hasSat);
    if (hasSat) {
        document.querySelector('input[name="baseMap"][value="satellite"]').checked = true;
    } else if (hasBase) {
        document.querySelector('input[name="baseMap"][value="base"]').checked = true;
    }
    toggleBaseLayer(hasBase || hasSat);
    document.getElementById('chk-hybrid').checked = map.hasLayer(vworldHybrid);

    const hasContinuous = map.hasLayer(vworldContinuousLayer);
    const hasLx = map.hasLayer(vworldLxLayer);
    document.getElementById('chk-cadastral').checked = (hasContinuous || hasLx);
    if (hasLx) {
        document.querySelector('input[name="cadastralMap"][value="lx"]').checked = true;
    } else {
        // 기본값: continuous
        document.querySelector('input[name="cadastralMap"][value="continuous"]').checked = true;
    }
    toggleOverlay('cadastral', (hasContinuous || hasLx));
    document.getElementById('chk-nas-guk').checked = map.hasLayer(nasGukLayer);

}

// [기능추가] 지적 경계 가져오기 및 강조 표시
function fetchAndHighlightBoundary(x, y) {
    // x: longitude, y: latitude
    const callbackName = 'vworld_boundary_' + Math.floor(Math.random() * 100000);

    // [기능추가] 로딩 중 표시 (재시도 시 유용)
    const btn = document.getElementById('btn-landeum-popup');
    if (btn) {
        btn.innerText = "로딩 중...";
        btn.classList.add('disabled');
        // btn.disabled = true; // [수정] 클릭해서 재시도 가능하도록 비활성화 속성 제거
    }

    window[callbackName] = function (data) {
        delete window[callbackName];
        document.getElementById(callbackName)?.remove();

        if (data.response.status === "OK" && data.response.result && data.response.result.featureCollection.features.length > 0) {
            const feature = data.response.result.featureCollection.features[0];

            if (currentBoundaryLayer) {
                map.removeLayer(currentBoundaryLayer);
            }

            // 강조 스타일 적용 (빨간색 굵은 테두리, 채우기 없음)
            currentBoundaryLayer = L.geoJSON(feature, {
                style: {
                    color: '#FF0000',
                    weight: 4,
                    opacity: 0.8,
                    fillColor: '#FF0000',
                    fillOpacity: 0
                }
            }).addTo(map);

            // [기능추가] PNU 추출 및 팝업 버튼 업데이트
            if (feature.properties && feature.properties.pnu) {
                updatePopupLandEumButton(feature.properties.pnu);
            }
        } else {
            // [기능추가] 실패 시 재시도 활성화
            const btn = document.getElementById('btn-landeum-popup');
            if (btn) {
                btn.innerText = "재시도";
                btn.classList.remove('disabled');
                btn.disabled = false;
                btn.style.backgroundColor = "#999"; // 회색 배경 (실패/대기 상태 의미)
                btn.style.color = "white";
                btn.onclick = function () {
                    fetchAndHighlightBoundary(x, y);
                };
            }
        }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    // VWorld Data API: LP_PA_CBND_BUBUN (연속지적도)
    script.src = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_API_KEY}&domain=${window.location.hostname}&geomFilter=POINT(${x} ${y})&format=json&errorformat=json&callback=${callbackName}`;
    document.body.appendChild(script);
}

// [기능추가] 주소명 단축 함수
function getShortAddress(addressName) {
    if (!addressName) return "";
    let shortName = addressName;
    const parts = addressName.split(' ');
    let targetIdx = -1;
    // 뒤에서부터 탐색하여 '동', '리', '가'로 끝나는 부분 찾기
    for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].match(/(동|리|가)$/)) {
            targetIdx = i;
            break;
        }
    }
    if (targetIdx !== -1) {
        shortName = parts.slice(targetIdx).join(' ');
    } else if (parts.length >= 2) {
        // '동/리/가'가 없으면 뒤에서 두 단어만 사용 (예비책)
        shortName = parts.slice(parts.length - 2).join(' ');
    }
    return shortName;
}

// [기능추가] 현재 강조된 지적 경계를 폴리곤 기록으로 저장
function saveCurrentBoundary(addressName) {
    if (!currentBoundaryLayer) {
        alert("선택된 영역이 없습니다. 지도를 더블클릭하여 영역을 선택해주세요.");
        return;
    }

    // [기능수정] 주소명 단축 (마지막 단위 행정명 + 지번)
    let shortName = getShortAddress(addressName);

    currentBoundaryLayer.eachLayer(function (layer) {
        // GeoJSON 레이어에서 좌표 추출하여 새로운 Polygon 생성
        // layer.feature.geometry가 Polygon 혹은 MultiPolygon일 수 있음
        const feature = layer.feature;
        const newLayer = L.geoJSON(feature, {
            style: {
                color: '#FF0000',
                weight: 4,
                opacity: 0.8,
                fillColor: '#FF0000',
                fillOpacity: 0.2
            }
        });

        // L.GeoJSON은 LayerGroup이므로 내부 레이어를 꺼내야 함 (보통 하나임)
        newLayer.eachLayer(function (innerLayer) {
            // 속성 설정
            innerLayer.feature = innerLayer.feature || {};
            innerLayer.feature.type = "Feature";
            innerLayer.feature.properties = innerLayer.feature.properties || {};
            innerLayer.feature.properties.id = Date.now();
            innerLayer.feature.properties.memo = shortName || "지적 영역";
            innerLayer.feature.properties.customColor = '#FF0000';
            innerLayer.feature.properties.isHidden = false;

            updateLayerInfo(innerLayer); // [버그수정] 팝업 바인딩 및 면적 계산 적용
            drawnItems.addLayer(innerLayer);
        });
    });

    saveToStorage();
    renderSurveyList();
    alert(`영역이 기록되었습니다.\n기록명: ${shortName}`);
    openSidebar(); // 기록 확인을 위해 사이드바 열기
    switchSidebarTab('record');
}

// [기능추가] 현재 선택된 위치를 점(Marker) 기록으로 저장
function saveCurrentPoint(lat, lng, addressName) {
    const shortName = getShortAddress(addressName);
    const marker = L.marker([lat, lng], { icon: createColoredMarkerIcon('#FF0000') });

    marker.feature = {
        type: "Feature",
        properties: {
            id: Date.now(),
            memo: shortName || "지점 기록",
            customColor: '#FF0000',
            isHidden: false
        }
    };

    updateLayerInfo(marker);
    drawnItems.addLayer(marker);

    saveToStorage();
    renderSurveyList();
    alert(`지점이 기록되었습니다.\n기록명: ${shortName}`);
    openSidebar();
    switchSidebarTab('record');
}

// [기능추가] 내 위치 공유하기

// [기능추가] 내 위치 공유하기
function shareMyLocation() {
    const center = map.getCenter();
    const lat = center.lat;
    const lng = center.lng;
    const address = document.getElementById('address-display').innerText;

    // 현재 페이지 URL에 좌표 파라미터 추가
    // 주의: hash router를 사용하는 경우 처리가 다를 수 있음. 여기서는 query parameter 사용.
    const shareUrl = `${window.location.origin}${window.location.pathname}?lat=${lat}&lng=${lng}`;

    let coordText = "";
    if (coordMode === 2) {
        const tm = getTmCoords(lat, lng);
        coordText = `X: ${tm.x}, Y: ${tm.y}`;
    } else if (coordMode === 1) {
        coordText = `N ${lat.toFixed(4)}° , E ${lng.toFixed(4)}°`;
    } else {
        coordText = `${convertToDms(lat, 'lat')}, ${convertToDms(lng, 'lng')}`;
    }

    const shareData = {
        title: '[F-Field] 내 위치 공유',
        text: `\n주소: ${address}\n좌표: ${coordText}\n\n링크를 클릭하면 공유된 위치로 이동합니다.`,
        url: shareUrl
    };

    if (navigator.share) {
        navigator.share(shareData)
            .then(() => console.log('공유 성공'))
            .catch((error) => console.log('공유 실패/취소', error));
    } else {
        // PC 등 navigator.share 미지원 시 클립보드 복사
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert("공유 링크가 클립보드에 복사되었습니다.\n" + shareUrl);
        }).catch(err => {
            prompt("URL을 복사하세요:", shareUrl);
        });
    }
}

/* --------------------------------------------------------------------------
   5. 검색 기능
-------------------------------------------------------------------------- */
let isSearchHistoryEnabled = true;

(function initSearchSettings() {
    const setting = localStorage.getItem(SEARCH_SETTING_KEY);
    if (setting !== null) { isSearchHistoryEnabled = (setting === 'true'); }
    document.getElementById('chk-history-save').checked = isSearchHistoryEnabled;
})();

/* --------------------------------------------------------------------------
   13. 길찾기 기능 (Navigation)
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

    if (type === 'tmap') {
        url = `tmap://route?goalname=${encodeURIComponent(name)}&goalx=${lng}&goaly=${lat}`;
    } else if (type === 'naver') {
        url = `nmap://navigation?dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(name)}&appname=F-Field`;
    } else if (type === 'kakao') {
        url = `kakaomap://route?ep=${lat},${lng}&by=CAR`;
    }

    // 모바일이 아니거나 앱이 없을 경우를 대비해 처리할 수 있지만, 
    // 기본적으로 URL Scheme 시도
    window.location.href = url;

    // 약간의 딜레이 후 모달 닫기
    setTimeout(closeNavModal, 500);
}

function toggleSearchBox() {
    const box = document.getElementById('search-container');
    if (box.style.display === 'flex') {
        box.style.display = 'none';
    } else {
        box.style.display = 'flex';
        document.getElementById('search-input').focus();
    }
}

document.addEventListener('mousedown', function (e) {
    const sc = document.getElementById('search-container');
    const btn = document.getElementById('btn-search-toggle');
    if (sc.style.display === 'flex' && !sc.contains(e.target) && !btn.contains(e.target)) {
        sc.style.display = 'none';
    }
});

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
    const script = document.createElement('script'); script.id = callbackName;
    script.src = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=50&page=1&query=${encodeURIComponent(query)}&type=${type}&format=json&errorformat=json&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

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
    const script = document.createElement('script'); script.id = callbackName;
    script.src = `https://api.vworld.kr/req/address?service=address&request=getCoord&version=2.0&crs=epsg:4326&address=${encodeURIComponent(query)}&refine=true&simple=false&format=json&type=${type || 'PARCEL'}&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

function executeSearch(keyword) {
    const query = keyword || document.getElementById('search-input').value;
    if (!query) return;

    if (isSearchHistoryEnabled) { addToHistory(query); }
    document.getElementById('history-panel').style.display = 'none';
    document.getElementById('search-input').value = query;

    // 1. ADDRESS (주소 검색) - 최대 50건 조회
    callVworldSearchApi(query, 'ADDRESS', function (addrResults) {
        if (addrResults && addrResults.length > 0) {
            handleSearchResults(addrResults);
        } else {
            // 2. PLACE (장소 검색) - 최대 50건 조회
            callVworldSearchApi(query, 'PLACE', function (placeResults) {
                if (placeResults && placeResults.length > 0) {
                    handleSearchResults(placeResults);
                } else {
                    // 3. ROAD (도로명 주소 지오코딩) - 1건만 조회됨
                    callVworldCoordApi(query, 'ROAD', function (roadResult) {
                        if (roadResult) {
                            handleSingleResult(roadResult, query, 'ROAD');
                        } else {
                            // 4. PARCEL (지번 주소 지오코딩) - 1건만 조회됨
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

function handleSingleResult(coordResult, query, type) {
    // 지오코딩 결과는 1개만 오므로 바로 이동
    // type: 'ROAD' or 'PARCEL'
    const finalResult = {
        point: coordResult.point,
        title: query,
        address: {
            road: (type === 'ROAD' && coordResult.refined && coordResult.refined.text) ? coordResult.refined.text : "",
            parcel: (type === 'PARCEL' && coordResult.refined && coordResult.refined.text) ? coordResult.refined.text : ""
        }
    };
    moveToSearchResult(finalResult);
}

function handleSearchResults(items) {
    if (items.length === 1) {
        moveToSearchResult(items[0]);
    } else {
        renderSearchResultList(items);
        document.getElementById('search-result-panel').style.display = 'block';
    }
}

function renderSearchResultList(items) {
    const listEl = document.getElementById('search-result-list');
    listEl.innerHTML = "";

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'search-result-item';

        let roadAddr = item.address.road || "";
        let parcelAddr = item.address.parcel || "";

        // 검색 결과 타입(장소 vs 주소)에 따라 title이 다를 수 있음
        const title = item.title || roadAddr || parcelAddr;

        let html = `<div class="search-result-title">${title}</div>`;

        if (roadAddr) {
            html += `<div class="search-result-addr"><span class="badge-road">도로명</span> ${roadAddr}</div>`;
        }
        if (parcelAddr) {
            html += `<div class="search-result-addr"><span class="badge-parcel">지번</span> ${parcelAddr}</div>`;
        }

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

    // 검색 결과에서도 전체 주소를 표시하기 위해 showInfoPopup (반향 지리코딩) 사용
    showInfoPopup(point.y, point.x);

    // 검색 위치의 지적 경계 강조
    fetchAndHighlightBoundary(point.x, point.y);
}

function getHistory() { const json = localStorage.getItem(SEARCH_HISTORY_KEY); return json ? JSON.parse(json) : []; }
function saveHistory(list) { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list)); }

function addToHistory(keyword) {
    let list = getHistory();
    list = list.filter(function (item) { return item !== keyword; });
    list.unshift(keyword);
    if (list.length > 10) { list = list.slice(0, 10); }
    saveHistory(list);
}

function toggleHistorySave(checked) {
    isSearchHistoryEnabled = checked;
    localStorage.setItem(SEARCH_SETTING_KEY, checked);
    if (!checked) { document.getElementById('history-panel').style.display = 'none'; }
}

function clearHistoryAll() {
    if (confirm("검색 기록을 모두 삭제하시겠습니까?")) {
        saveHistory([]); renderHistoryList();
    }
}

function deleteHistoryItem(index) {
    const list = getHistory();
    list.splice(index, 1);
    saveHistory(list);
    renderHistoryList();
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
        const li = document.createElement('li'); li.className = 'history-item';

        const spanText = document.createElement('span');
        spanText.className = 'history-text';
        spanText.innerText = text;
        spanText.onclick = function () { executeSearch(text); };

        const btnDel = document.createElement('span');
        btnDel.className = 'btn-del-history';
        btnDel.innerHTML = SVG_ICONS.close;
        btnDel.onclick = function (e) { e.stopPropagation(); deleteHistoryItem(index); };

        li.appendChild(spanText);
        li.appendChild(btnDel);
        ul.appendChild(li);
    });
}
function showHistoryPanel() { renderHistoryList(); document.getElementById('history-panel').style.display = 'block'; }

/* --------------------------------------------------------------------------
   6. 레이어 제어
-------------------------------------------------------------------------- */
function toggleBaseLayer(isChecked) {
    const optionsDiv = document.getElementById('base-layer-options');
    if (isChecked) {
        optionsDiv.style.display = 'block';
        const selectedValue = document.querySelector('input[name="baseMap"]:checked').value;
        changeBaseMap(selectedValue);
    } else {
        optionsDiv.style.display = 'none';
        map.removeLayer(vworldSatellite); map.removeLayer(vworldBase);
    }
}

function changeBaseMap(type) {
    if (!document.getElementById('chk-base-layer').checked) return;
    if (type === 'satellite') {
        map.addLayer(vworldSatellite); map.removeLayer(vworldBase);
    } else {
        map.addLayer(vworldBase); map.removeLayer(vworldSatellite);
    }
    if (map.hasLayer(vworldLxLayer)) vworldLxLayer.bringToFront();
    if (map.hasLayer(vworldContinuousLayer)) vworldContinuousLayer.bringToFront();
    if (map.hasLayer(vworldHybrid)) vworldHybrid.bringToFront();
}

function changeCadastralMap(type) {
    if (!document.getElementById('chk-cadastral').checked) return;
    if (type === 'lx') {
        map.addLayer(vworldLxLayer); map.removeLayer(vworldContinuousLayer);
    } else {
        // continuous (기본값)
        map.addLayer(vworldContinuousLayer); map.removeLayer(vworldLxLayer);
    }
}

function toggleOverlay(type, isChecked) {
    let layer;
    if (type === 'hybrid') layer = vworldHybrid;
    else if (type === 'cadastral') {
        const optionsDiv = document.getElementById('cadastral-layer-options');
        if (isChecked) {
            optionsDiv.style.display = 'block';
            const selectedValue = document.querySelector('input[name="cadastralMap"]:checked').value;
            changeCadastralMap(selectedValue);
        } else {
            optionsDiv.style.display = 'none';
            map.removeLayer(vworldLxLayer);
            map.removeLayer(vworldContinuousLayer);
        }
        return; // changeCadastralMap에서 레이어 추가/제거 하므로 여기서 리턴
    }
    else if (type === 'nasGuk') layer = nasGukLayer;
    else if (type === 'forest') {
        isForestActive = isChecked;
        if (isChecked) {
            if (!forestDataLayer) {
                forestDataLayer = L.geoJSON(null, {
                    style: {
                        color: "#00FF00",
                        weight: 2,
                        opacity: 0.6,
                        fillOpacity: 0.1,
                        dashArray: '5, 5'
                    },
                    onEachFeature: function (feature, layer) {
                        // 필요한 경우 팝업 추가
                        if (feature.properties) {
                            // 속성 이름 확인 필요 (보통 pnu 등)
                            let popupContent = "산림보호구역";
                            layer.bindPopup(popupContent);
                        }
                    }
                }).addTo(map);
            } else {
                map.addLayer(forestDataLayer);
            }
            fetchForestData();
        } else {
            if (forestDataLayer) {
                map.removeLayer(forestDataLayer);
                forestDataLayer.clearLayers();
            }
        }
        return; // 일반 레이어 처리와 다름
    }

    if (isChecked) {
        map.addLayer(layer);
        if (type !== 'nasGuk') layer.bringToFront();
    } else {
        map.removeLayer(layer);
    }
}

// [기능추가] 산림보호구역 데이터 가져오기 (Data API)
function fetchForestData() {
    if (!isForestActive || !forestDataLayer) return;

    if (map.getZoom() < 13) {
        // 줌 레벨이 낮으면 데이터 삭제 (성능 문제)
        forestDataLayer.clearLayers();
        return;
    }

    const bounds = map.getBounds();
    const min = bounds.getSouthWest();
    const max = bounds.getNorthEast();
    const bbox = `${min.lng},${min.lat},${max.lng},${max.lat}`;

    // 요청 ID 생성 (경쟁 상태 방지)
    const requestId = ++lastForestRequestId;

    // JSONP 콜백 동적 생성
    const callbackName = 'vworld_forest_' + Date.now();
    window[callbackName] = function (data) {
        // 최신 요청이 아니면 무시
        if (requestId !== lastForestRequestId) {
            delete window[callbackName];
            document.body.removeChild(script);
            return;
        }

        if (data.response.status === "OK") {
            forestDataLayer.clearLayers(); // 기존 데이터 삭제
            const features = data.response.result.featureCollection.features;
            forestDataLayer.addData(features);
        } else {
            // 데이터가 없거나 에러인 경우 레이어 유지 또는 삭제 선택 (여기선 유지)
            // forestDataLayer.clearLayers(); 
            // console.warn("산림보호구역 데이터 없음:", data.response.error);
        }
        delete window[callbackName];
        document.body.removeChild(script);
    };

    const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_UF151&key=${VWORLD_API_KEY}&domain=${window.location.hostname}&geomFilter=BOX(${bbox})&format=json&errorFormat=json&size=1000&callback=${callbackName}`;

    const script = document.createElement('script');
    script.src = url;
    document.body.appendChild(script);
}

// 지도 이동 종료 시 데이터 갱신
map.on('moveend', function () {
    if (isForestActive) {
        fetchForestData();
    }
});

/* --------------------------------------------------------------------------
   7. 좌표 및 주소 표시
-------------------------------------------------------------------------- */
function convertToDms(val, type) {
    const valAbs = Math.abs(val);
    const deg = Math.floor(valAbs);
    const minFloat = (valAbs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(2);
    return (val >= 0 ? (type === 'lat' ? "N" : "E") : (type === 'lat' ? "S" : "W")) + " " + deg + "° " + min + "' " + sec + "\"";
}

function getTmCoords(lat, lng) {
    const xy = proj4("EPSG:4326", "EPSG:5186", [lng, lat]);
    return { x: Math.round(xy[0]), y: Math.round(xy[1]) };
}

let lastGpsLat = 37.245911; // 초기값: 지도 초기 중심
let lastGpsLng = 126.960302;

function updateCoordDisplay() {
    // [기능수정] 지도가 아닌 GPS 위치(또는 고정된 위치) 기준으로 좌표 표시
    let lat = lastGpsLat;
    let lng = lastGpsLng;

    let text = "";
    if (coordMode === 2) {
        text = "X: " + getTmCoords(lat, lng).x + " | Y: " + getTmCoords(lat, lng).y;
    } else if (coordMode === 1) {
        text = "N " + lat.toFixed(4) + "° | E " + lng.toFixed(4) + "°";
    } else {
        text = convertToDms(lat, 'lat') + " | " + convertToDms(lng, 'lng');
    }
    document.getElementById('coord-display').innerText = text;
}
// [기능수정] 좌표 모드 토글 대신 모달 열기
function openCoordModal() {
    // 현재 선택된 모드 라디오 버튼 체크
    const radios = document.getElementsByName('coord-mode-select');
    radios.forEach(radio => {
        if (parseInt(radio.value) === coordMode) {
            radio.checked = true;
        }
    });

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

    // 모달 닫을 때 약간의 딜레이를 주어 사용자가 선택되었음을 인지하게 함
    setTimeout(closeCoordModal, 200);
}
// map.on('move', updateCoordDisplay); // [기능수정] 지도 움직임에 따라 좌표가 변하지 않도록 주석 처리
updateCoordDisplay();

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

/* --------------------------------------------------------------------------
   8. 그리기 도구 (Drawing)
-------------------------------------------------------------------------- */

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) color += letters[Math.floor(Math.random() * 16)];
    return color;
}

function getTimestampString() {
    const now = new Date();
    return now.toISOString().slice(2, 10).replace(/-/g, "") + "_" + now.toTimeString().slice(0, 8).replace(/:/g, "");
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

const defaultSurveyIcon = createColoredMarkerIcon('#0040ff');

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

function resetButtonStyles() { document.querySelectorAll('.bottom-btn').forEach(btn => btn.classList.remove('active-btn')); }
function highlightButton(btnId) { resetButtonStyles(); document.getElementById(btnId).classList.add('active-btn'); }

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

    // [UI] 녹화 모드 표시
    document.body.classList.add('recording-mode');

    if (currentDrawer && (type === 'polygon' || type === 'polyline')) {
        currentDrawer._originalFinishShape = currentDrawer._finishShape;
        currentDrawer._finishShape = function () {
            if (isManualFinish) { this._originalFinishShape(); }
        };
    }
    currentDrawer.enable();
    actionToolbar.style.display = 'flex';
}

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
            actionToolbar.style.display = 'none';
            resetButtonStyles();
        } else {
            currentDrawer.addVertex(latlng);
        }
        map.panTo(latlng);
    }, function () {
        alert("GPS 수신 실패");
    }, { enableHighAccuracy: true });
}

function deleteLastVertex() { if (currentDrawer && currentDrawer.deleteLastVertex) currentDrawer.deleteLastVertex(); }

function completeDrawing() {
    if (currentDrawer) {
        isManualFinish = true;
        if (currentDrawer.completeShape) currentDrawer.completeShape();
        else if (currentDrawer._finishShape) currentDrawer._finishShape();
        else currentDrawer.disable();
        isManualFinish = false;
    }
    document.body.classList.remove('recording-mode');
    actionToolbar.style.display = 'none';
    resetButtonStyles();
}

function cancelDrawing() {
    if (currentDrawer) {
        currentDrawer.disable();
        currentDrawer = null;
    }
    document.body.classList.remove('recording-mode');
    actionToolbar.style.display = 'none';
    resetButtonStyles();
}

function updateLayerInfo(layer) {
    let popupContent = "";
    let infoText = "";
    const memo = layer.feature.properties.memo || "";

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

    popupContent = "<b>" + SVG_ICONS.memo + " 메모:</b> " + memo;
    if (infoText) popupContent += "<br>" + infoText;

    // [UI] 수정/삭제 버튼 추가
    const id = layer.feature.properties.id;
    popupContent += `<div style="margin-top:8px; border-top:1px solid #eee; padding-top:8px; display:flex; gap:5px;">
        <button class="popup-btn" style="flex:1; background:#f0f0f0; color:#333;" onclick="enableSingleLayerEdit(${id})">수정</button>
        <button class="popup-btn" style="flex:1; background:#ffebee; color:#d32f2f;" onclick="deleteLayerById(${id})">삭제</button>
    </div>`;

    layer.bindPopup(popupContent);
    layer.feature.properties.popupContent = popupContent;
}

// [기능추가] 개별 레이어 수정 모드
window.enableSingleLayerEdit = function (id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    if (layer instanceof L.Marker) {
        // 마커는 드래그 가능하게 설정
        layer.dragging.enable();
    } else {
        // 폴리곤/폴리라인은 편집 모드 활성화 (Leaflet.Draw)
        // [버그수정] GeoJSON으로 생성된 레이어는 layer.editing이 초기화되지 않았을 수 있음
        if (!layer.editing) {
            if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
                // Try to initialize editing handler
                if (L.Edit && L.Edit.Poly) {
                    layer.editing = new L.Edit.Poly(layer);
                } else {
                    alert("수정 모듈(L.Edit)을 로드하지 못했습니다.");
                    return;
                }
            }
        }

        if (layer.editing) {
            layer.editing.enable();
        } else {
            alert("이 도형은 수정할 수 없습니다. (MultiPolygon 등 지원되지 않는 형식일 수 있음)");
            return;
        }
    }

    layer.closePopup();
    alert("수정 모드입니다.\n도형의 점을 드래그하여 수정하세요.\n완료하려면 지도 바탕을 터치하세요.");
    document.body.classList.add('recording-mode'); // [UI] 수정 모드 표시

    // 지도 클릭 시 수정 종료 이벤트 (1회성)
    // 주의: 드래그 중 클릭 발생 방지를 위해 약간의 딜레이/조건 필요할 수 있음
    // 여기서는 단순하게 map click event 사용

    const finishHandler = function () {
        if (layer instanceof L.Marker) {
            layer.dragging.disable();
        } else {
            if (layer.editing) layer.editing.disable();
        }

        updateLayerInfo(layer);
        saveToStorage();
        renderSurveyList();

        map.off('click', finishHandler); // 이벤트 리스너 제거
        document.body.classList.remove('recording-mode'); // [UI] 수정 모드 해제
        alert("수정 완료");
    };

    // setTimeout을 써서 "현재" 클릭 이벤트가 바로 트리거되지 않도록 함
    setTimeout(() => {
        map.once('click', finishHandler);
    }, 100);
};

map.on(L.Draw.Event.CREATED, function (event) {
    const layer = event.layer;
    let memo = prompt("메모 입력:", getTimestampString());
    if (memo === null) return;
    if (!memo) memo = getTimestampString();

    const randomColor = getRandomColor();
    layer.feature = { type: "Feature", properties: { memo: memo, id: Date.now(), isHidden: false, customColor: randomColor } };

    if (event.layerType === 'marker') {
        layer.setIcon(createColoredMarkerIcon(randomColor));
        layer.feature.properties.customColor = randomColor;
    } else {
        layer.setStyle({ color: randomColor, fillColor: randomColor });
    }

    updateLayerInfo(layer);
    drawnItems.addLayer(layer);
    saveToStorage();
    actionToolbar.style.display = 'none';
    currentDrawer = null;
    resetButtonStyles();
    layer.openPopup();

    // [UI] 저장 후에는 기록 탭으로 이동
    switchSidebarTab('record');
    renderSurveyList();
});

map.on('draw:edited', function (e) { e.layers.eachLayer(updateLayerInfo); saveToStorage(); renderSurveyList(); });
map.on('draw:drawstop', function () { setTimeout(function () { if (!currentDrawer) actionToolbar.style.display = 'none'; }, 100); });

/* --------------------------------------------------------------------------
   9. 데이터 관리 (목록 표시, 저장, 삭제)
-------------------------------------------------------------------------- */

function renderSurveyList() {
    const listContainer = document.getElementById('survey-list-area');
    const countSpan = document.getElementById('record-count');
    listContainer.innerHTML = "";

    const layers = drawnItems.getLayers();
    countSpan.innerText = "(" + layers.length + "개)";

    const allVisible = layers.length > 0 && layers.every(function (l) { return !l.feature.properties.isHidden; });
    document.getElementById('chk-select-all').checked = (layers.length > 0 && allVisible);

    if (layers.length === 0) {
        listContainer.innerHTML = '<div style="padding:15px; text-align:center; color:#999; font-size:12px;">기록 없음</div>';
        return;
    }

    layers.slice().reverse().forEach(function (layer) {
        const props = layer.feature.properties || {};
        const id = props.id;
        const isHidden = props.isHidden === true;
        const typeIcon = (layer instanceof L.Marker) ? SVG_ICONS.marker : (layer instanceof L.Polygon ? SVG_ICONS.polygon : SVG_ICONS.ruler);

        const div = document.createElement('div');
        div.className = 'survey-item';
        div.innerHTML = `
        <div class="survey-check-area">
            <input type="checkbox" class="survey-checkbox" ${!isHidden ? "checked" : ""} onchange="toggleLayerVisibility(${id})">
        </div>
        <div class="survey-info" onclick="zoomToLayer(${id})">
            <div class="survey-name">${typeIcon} ${props.memo} <button class="btn-edit-memo-inline" onclick="event.stopPropagation(); editLayerMemo(${id})">${SVG_ICONS.edit}</button></div>
        </div>
        <div class="survey-actions">
            <input type="color" class="color-picker-input" value="${props.customColor || '#3388ff'}" onchange="updateLayerColor(${id}, this.value)">
            <button class="action-icon-btn btn-del" onclick="deleteLayerById(${id})">${SVG_ICONS.trash}</button>
            <button class="action-icon-btn btn-save-single" onclick="exportSingleLayer(${id})">${SVG_ICONS.save}</button>
        </div>`;
        listContainer.appendChild(div);
    });
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

window.updateLayerColor = function (id, newColor) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    if (layer instanceof L.Marker) layer.setIcon(createColoredMarkerIcon(newColor));
    else layer.setStyle({ color: newColor, fillColor: newColor });
    layer.feature.properties.customColor = newColor;
    saveToStorage();
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
    const layers = drawnItems.getLayers();
    layers.forEach(function (layer) {
        layer.feature.properties.isHidden = !isChecked;
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

window.deleteLayerById = function (id) {
    if (confirm("해당 기록을 삭제합니다.")) {
        const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
        if (layer) drawnItems.removeLayer(layer);
        saveToStorage();
        renderSurveyList();
    }
};

/* [Android 호환성] 데이터 저장 및 공유 기능 */

function saveToDevice(content, fileName) {
    const blob = new Blob([content], { type: "application/geo+json" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    console.log("파일 다운로드 완료:", fileName);
}

function saveOrShareFile(content, fileName) {
    if (!navigator.canShare) {
        saveToDevice(content, fileName);
        return;
    }

    const file = new File([content], fileName, { type: "application/json" });

    if (navigator.canShare({ files: [file] })) {
        navigator.share({
            files: [file],
            title: 'F-Field 기록',
            text: fileName + ' 파일을 공유합니다.'
        })
            .then(() => {
                console.log("공유 성공");
            })
            .catch((error) => {
                console.warn("공유 실패/취소 -> 다운로드로 전환", error);
                saveToDevice(content, fileName);
            });
    } else {
        console.log("공유 불가 -> 다운로드로 전환");
        saveToDevice(content, fileName);
    }
}

window.exportSingleLayer = function (id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    let safeMemo = (layer.feature.properties.memo || "unnamed").replace(/[\\/:*?"<>|]/g, "_");
    const fileName = safeMemo + ".geojson";
    const content = JSON.stringify(layer.toGeoJSON(), null, 2);

    saveOrShareFile(content, fileName);
};

window.exportSelectedGeoJSON = function () {
    const allLayers = drawnItems.getLayers();
    const visibleLayers = allLayers.filter(function (layer) { return !layer.feature.properties.isHidden; });

    if (visibleLayers.length === 0) { alert("저장할 항목이 선택되지 않았습니다."); return; }
    if (!confirm('선택한 기록이 한 개의 파일로 저장됩니다.')) { return; }

    const featureCollection = L.layerGroup(visibleLayers).toGeoJSON();
    const fileName = "Project_" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".geojson";
    const content = JSON.stringify(featureCollection, null, 2);

    saveOrShareFile(content, fileName);
};


function saveToStorage() { localStorage.setItem(STORAGE_KEY, JSON.stringify(drawnItems.toGeoJSON())); }

function restoreFeatures(geoJsonData) {
    L.geoJSON(geoJsonData, {
        onEachFeature: function (feature, layer) {
            if (feature.properties && feature.properties.memo) {
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

function loadFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) restoreFeatures(JSON.parse(saved));
    } catch (e) { }
}

function clearAllData() {
    if (confirm("선택한 기록이 모두 삭제됩니다.")) {
        drawnItems.clearLayers();
        saveToStorage();
        renderSurveyList();
    }
}

function triggerFileInput() { document.getElementById('geoJsonInput').click(); }
function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = function (e) {
        try {
            restoreFeatures(JSON.parse(e.target.result));
            saveToStorage();
            alert("완료");
            closeSidebar();
        } catch (err) { alert("오류"); }
        input.value = '';
    };
    r.readAsText(file);
}

/* --------------------------------------------------------------------------
   10. GPS 위치 추적 (Geolocation)
-------------------------------------------------------------------------- */
function updateLocationMarker(pos) {
    if (pos.coords.accuracy === 0) return;
    const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
    if (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading)) { lastHeading = pos.coords.heading; }

    if (!trackingCircle)
        trackingCircle = L.circle(latlng, { radius: pos.coords.accuracy, weight: 1, color: 'blue', opacity: 0.3, fillOpacity: 0.1 }).addTo(map);
    else
        trackingCircle.setLatLng(latlng).setRadius(pos.coords.accuracy);

    const arrowSvg = `<div style="transform: rotate(${lastHeading}deg); transform-origin: center center; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;" class="gps-arrow-icon">
                        <svg viewBox="0 0 100 100" width="20" height="20" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
                            <path d="M50 0 L100 100 L50 80 L0 100 Z" fill="#007bff" stroke="white" stroke-width="10" />
                        </svg>
                    </div>`;
    const arrowIcon = L.divIcon({ className: '', html: arrowSvg, iconSize: [20, 20], iconAnchor: [10, 10] });

    if (!trackingMarker)
        trackingMarker = L.marker(latlng, { icon: arrowIcon, zIndexOffset: 1000 }).addTo(map);
    else
        trackingMarker.setLatLng(latlng).setIcon(arrowIcon);

    getAddressFromCoords(pos.coords.latitude, pos.coords.longitude);

    // [기능수정] GPS 좌표 저장 및 상단바 업데이트
    lastGpsLat = pos.coords.latitude;
    lastGpsLng = pos.coords.longitude;
    updateCoordDisplay();
}

function onTrackSuccess(pos) {
    updateLocationMarker(pos);
    if (isFollowing) map.panTo([pos.coords.latitude, pos.coords.longitude]);
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

function onFirstLoadSuccess(pos) { map.setView([pos.coords.latitude, pos.coords.longitude], 19); }
function findMe() {
    if (!navigator.geolocation) { alert("GPS 미지원"); return; }
    navigator.geolocation.getCurrentPosition(onFirstLoadSuccess, function () { alert("위치 실패"); }, { enableHighAccuracy: true });
}

loadFromStorage();
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(onTrackSuccess, null, { enableHighAccuracy: true });
    // [기능수정] 공유 링크(lat, lng)가 없을 때만 내 위치로 초기 이동
    const params = new URLSearchParams(window.location.search);
    if (!params.has('lat') || !params.has('lng')) {
        navigator.geolocation.getCurrentPosition(onFirstLoadSuccess, null, { enableHighAccuracy: true });
    }
}

/* --------------------------------------------------------------------------
   11. UI 탭 전환 기능 (New)
-------------------------------------------------------------------------- */
function switchSidebarTab(tabName) {
    // 1. 탭 버튼 상태 초기화
    document.getElementById('tab-btn-map').classList.remove('active');
    document.getElementById('tab-btn-record').classList.remove('active');

    // 2. 탭 내용 숨기기
    document.getElementById('content-map').classList.remove('active');
    document.getElementById('content-record').classList.remove('active');

    // 3. 선택한 탭 활성화
    document.getElementById('tab-btn-' + tabName).classList.add('active');
    document.getElementById('content-' + tabName).classList.add('active');
}


/* --------------------------------------------------------------------------
   14. 비공개 레이어 잠금 기능
-------------------------------------------------------------------------- */
window.unlockHiddenLayers = function () {
    const section = document.getElementById('hidden-layer-section');
    const chkNasGuk = document.getElementById('chk-nas-guk');
    const btnLock = document.getElementById('btn-lock');

    // 이미 해제된 상태라면 동작 없음 (또는 다시 잠글 수도 있지만 요구사항은 아님)
    if (section.style.display === 'block') {
        alert("이미 잠금이 해제되었습니다.");
        return;
    }

    const input = prompt("암호를 입력하세요:");
    if (!input) return;

    // Base64 인코딩 후 비교 (암호: 8906 -> ODkwNg==)
    if (btoa(input) === 'ODkwNg==') {
        section.style.display = 'block';
        // chkNasGuk.checked = true; // 기본값 꺼짐 유지
        // toggleOverlay('nasGuk', true);

        // 아이콘 변경 (Unlock)
        btnLock.innerHTML = SVG_ICONS.unlock;
        btnLock.style.color = '#3B82F6'; // 파란색으로 활성화 표시
        alert("잠금이 해제되었습니다. 비공개 정보가 유출되지 않도록 주의하세요.");
    } else {
        alert("암호가 올바르지 않습니다.");
    }
};

/* --------------------------------------------------------------------------
   12. 초기 실행 및 딥링크 처리
-------------------------------------------------------------------------- */
(function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const latParam = params.get('lat');
    const lngParam = params.get('lng');

    if (latParam && lngParam) {
        const lat = parseFloat(latParam);
        const lng = parseFloat(lngParam);

        if (!isNaN(lat) && !isNaN(lng)) {
            // 지도 이동 및 정보 표시
            map.setView([lat, lng], 19); // 줌 레벨을 높게 설정하여 정확한 위치 표시

            // 약간의 지연 후 팝업 및 경계 표시 (지도 로딩 안정화)
            setTimeout(() => {
                showInfoPopup(lat, lng);
                fetchAndHighlightBoundary(lng, lat);
            }, 500);
        }
    }
})();