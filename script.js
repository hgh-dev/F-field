/* ==========================================================================
   [모듈] 엔트리/오케스트레이션 모듈 (script.js)
   [역할]
   - 앱 시작 시 필요한 모듈을 조립하고 초기화 순서를 관리합니다.
   - 지도 이벤트, 위치 추적, 트랙 기록, 버전 체크 같은 상위 흐름을 연결합니다.
   - HTML 인라인 이벤트에서 사용할 window 브리지 함수를 등록합니다.
   [동작 원리 요약]
   - 실제 기능은 각 모듈(map/draw/data/ui/utils)에 두고, 이 파일은 연결과 순서 제어를 담당합니다.
   - 상태는 AppState를 기준으로 공유하며, 저장/렌더링은 중요한 상태 전환 직후 즉시 호출합니다.
   - DOMContentLoaded 시점에 초기화를 일괄 수행해 UI/데이터/지도 상태를 동기화합니다.
   ========================================================================== */

import { APP_MODE, APP_VERSION, VWORLD_API_KEY, STORAGE_KEY, SEARCH_HISTORY_KEY, SEARCH_SETTING_KEY, SVG_ICONS } from './config.js';
import { AppState } from './state.js';

import {
    map, vworldBase, vworldSatellite, vworldHybrid, esriSatelliteLayer,
    vworldLxLayer, vworldContinuousLayer, nasGukLayer, mergedAdminLayer,
    toggleBaseLayer, changeBaseMap, updateLayerOrder, changeCadastralMap,
    toggleOverlay
} from './map.js';
import {
    drawnItems, startDraw, completeDrawing, cancelDrawing,
    addGpsVertex, deleteLastVertex, currentEditLayerId, editLayerOriginalLatLng,
    enableSingleLayerEdit, completeSingleEdit, revertSingleEdit, cancelSingleEdit
} from './draw.js';



import {
    saveToStorage, loadFromStorage, loadCurrentProjectFeatures,
    restoreFeatures, exportSingleLayer, exportCurrentProject,
    handleFileSelect, clearAllData, saveCurrentPoint, saveCurrentBoundary,
    fitCurrentProjectToMap,
    getAddressFromCoords, closeExportFormatModal, exportLayerWithFormat, backupAllProjects
} from './data.js';

import {
    getRandomColor, getTimestampString, createColoredMarkerIcon,
    copyText, getTmCoords, convertToDms
} from './utils.js';

import {
    openSidebar, closeSidebar, switchSidebarTab, unlockHiddenLayers,
    toggleSearchBox, executeSearch, closeSearchResult, showHistoryPanel,
    toggleHistorySave, clearHistoryAll, deleteHistoryItem,
    openBottomSheet, closeBottomSheet, toggleBottomSheetState,
    toggleBottomSheetMoreMenu, handleBottomSheetEdit, handleBottomSheetDelete,
    showInfoPopup, fetchAndHighlightBoundary, editLayerDescription,
    closeMemoModal, saveMemoAction, editLayerMemo, renderProjectSelector,
    createNewProject, editProjectName, deleteCurrentProject,
    openMoveProjectModal, openMoveSelectionModal, closeMoveProjectModal,
    highlightButton, resetButtonStyles, openNavModal, closeNavModal,
    executeNavigation, openSearchModal, closeSearchModal, executeMapSearch, updateCoordDisplay,
    startSleepMode, unlockSleepMode, initSleepSlider, toggleAccordion,
    toggleMoreMenu, toggleProjectMenu, openPhotoSelectMenu,
    closePhotoSelectMenu, handlePhotoMenuAction, processPhotoFiles,
    deletePhoto, openPhotoModal, nextPhoto, prevPhoto,
    downloadCurrentPhoto, closePhotoModal, initUiEventListeners,
    deleteLayerById, toggleLayerVisibility, zoomToLayer, updateLayerColor,
    openLocationActionModal, closeLocationActionModal,
    openSettingsModal, closeSettingsModal, shareLocationText,
    openContextMenu, handleMenuAction, syncSidebarUI,

    renderSurveyList as uiRenderSurveyList,
    updateLayerInfo as uiUpdateLayerInfo,
    currentBottomSheetLayerId,
    setCurrentBottomSheetLayerId
} from './ui.js';


/* ==========================================================================
   1) UI 브리지 래퍼
   ========================================================================== */
/**
 * UI 모듈의 목록 렌더 함수를 엔트리에서 재노출합니다.
 * 동작 원리: 호출 경로를 script.js로 통일해도 실제 구현은 ui.js 단일 소스를 유지합니다.
 */
export function renderSurveyList() {
    uiRenderSurveyList();
}

/**
 * 레이어 메타 정보 갱신 함수를 엔트리에서 재노출합니다.
 */
export function updateLayerInfo(layer) {
    uiUpdateLayerInfo(layer);
}

// 바텀시트 현재 선택 레이어 상태를 공용으로 노출합니다.
export { currentBottomSheetLayerId, setCurrentBottomSheetLayerId };

/* ==========================================================================
   2) 딥링크/위치 추적
   ========================================================================== */
/**
 * URL 딥링크(lat,lng)를 읽어 해당 좌표로 이동하고 정보 조회를 실행합니다.
 * 동작 원리: setView 직후 약간 지연 후 조회를 호출해 지도 이동/렌더 타이밍 경합을 줄입니다.
 */
async function handleDeepLink() {
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
}

/**
 * 위치 추적 성공 콜백입니다.
 * 동작 원리: 위치 마커/좌표 UI 갱신 후, 팔로우 모드일 때만 지도 중심을 이동합니다.
 */
function onTrackSuccess(pos) {
    updateLocationMarker(pos);
    if (AppState.isFollowing) map.panTo([pos.coords.latitude, pos.coords.longitude]);
}

/**
 * 현재 위치 관련 시각 요소(정확도 원/방향 마커/좌표/주소)를 갱신합니다.
 * 동작 원리: heading 값을 회전 아이콘에 반영해 이동 방향을 직관적으로 표시합니다.
 */
function updateLocationMarker(pos) {
    if (pos.coords.accuracy === 0) return;
    const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
    if (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading)) { AppState.lastHeading = pos.coords.heading; }

    if (!AppState.trackingCircle)
        AppState.trackingCircle = L.circle(latlng, { radius: pos.coords.accuracy, weight: 1, color: 'blue', opacity: 0.3, fillOpacity: 0.1 }).addTo(map);
    else
        AppState.trackingCircle.setLatLng(latlng).setRadius(pos.coords.accuracy);

    const arrowSvg = `<div style="transform: rotate(${AppState.lastHeading}deg); transform-origin: center center; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 100 100" width="20" height="20" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
                            <path d="M50 0 L100 100 L50 80 L0 100 Z" fill="#007bff" stroke="white" stroke-width="10" />
                        </svg>
                    </div>`;
    const arrowIcon = L.divIcon({ className: '', html: arrowSvg, iconSize: [20, 20], iconAnchor: [10, 10] });

    if (!AppState.trackingMarker)
        AppState.trackingMarker = L.marker(latlng, { icon: arrowIcon, zIndexOffset: 1000 }).addTo(map);
    else
        AppState.trackingMarker.setLatLng(latlng).setIcon(arrowIcon);

    getAddressFromCoords(pos.coords.latitude, pos.coords.longitude);
    AppState.lastGpsLat = pos.coords.latitude;
    AppState.lastGpsLng = pos.coords.longitude;
    updateCoordDisplay();
}

/**
 * 내 위치 자동 추적(팔로우) 모드를 토글합니다.
 */
function toggleTracking() {
    const btn = document.getElementById('toggle-track-btn');
    if (!navigator.geolocation) { alert("GPS 미지원"); return; }

    if (AppState.isFollowing) {
        AppState.isFollowing = false;
        btn.classList.remove('tracking-btn-on');
        btn.classList.remove('tracking-active');
    } else {
        AppState.isFollowing = true;
        navigator.geolocation.getCurrentPosition(onTrackSuccess, null, { enableHighAccuracy: true });
        btn.classList.add('tracking-btn-on');
        btn.classList.add('tracking-active');
    }
}

/**
 * 현재 위치로 한 번 이동합니다.
 * 동작 원리: 그리기/편집 중에는 작업 중단을 피하기 위해 동작을 막습니다.
 */
function findMe() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    if (!navigator.geolocation) { alert("지역 위치 서비스가 지원되지 않는 디바이스입니다."); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 19);
    }, function () { alert("위치 정보를 가져오는 데 실패했습니다."); }, { enableHighAccuracy: true });
}

/* ==========================================================================
   3) 지도 인터랙션 이벤트
   ========================================================================== */
// 지도 단일 클릭: 임시 경계/검색 마커/바텀시트를 정리합니다.
map.on('click', function (e) {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    if (AppState.isLayerClicked) return;


    if (AppState.currentBoundaryLayer) {
        map.removeLayer(AppState.currentBoundaryLayer);
        AppState.currentBoundaryLayer = null;
    }
    if (AppState.currentSearchMarker) {
        map.removeLayer(AppState.currentSearchMarker);
        AppState.currentSearchMarker = null;
    }
    closeBottomSheet();
});

// 지도 더블클릭: 해당 지점의 정보 팝업/경계 조회를 실행합니다.
map.on('dblclick', function (e) {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    map.panTo(e.latlng, { animate: true, duration: 0.3 });
    showInfoPopup(e.latlng.lat, e.latlng.lng);
    fetchAndHighlightBoundary(e.latlng.lng, e.latlng.lat);
});

/* ==========================================================================
   4) 트랙 기록 + 화면 절전 방지
   ========================================================================== */
// Wake Lock 미지원 브라우저 fallback용 무음 비디오 핸들입니다.
let noSleepVideo = null;

/**
 * 트랙 기록 중 화면 꺼짐을 방지합니다.
 * 동작 원리: 지원 브라우저는 Wake Lock API, 미지원은 숨김 비디오 재생으로 대체합니다.
 */
export async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            AppState.wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) { console.error(err); }

    if (!noSleepVideo) {
        noSleepVideo = document.createElement('video');
        noSleepVideo.setAttribute('playsinline', '');
        noSleepVideo.setAttribute('muted', '');
        noSleepVideo.muted = true;
        noSleepVideo.loop = true;
        noSleepVideo.style.display = 'none';
        noSleepVideo.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMQAAAAhmcmVlAAAAQG1kYXQhCAgEAAAAAAARAAABvQAQAQAAEgQA//4AAAAAABIAAAAB100AAAAABAAeIBAEAAABXAAAAAAB//4AAAAAABIAAAAAAEEAAAAB2AAAAAAEAAB+GZ0sAAAAAABAAAAABAAAAAB/AAABAAAAAQBBbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAABDcAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAzx0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAD6AAAAAAMAAAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAQAAAAEAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAA+gAAAAAAAEAAAAAAIhtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAAPoAAAEtwBQAAAAAAAZaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAAAAAAAAO21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAKRzdGJsAAAALnN0c2QAAAAAAAAAAQAAAB5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAABhzdHRzAAAAAAAAAAEAAAABAAAEtwAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAAAAAAAAAQAAABQAAAAUc3RjbwAAAAAAAAABAAAALAAAAA==';
        document.body.appendChild(noSleepVideo);
    }
    noSleepVideo.play().catch(e => console.error("NoSleep fallback failed", e));
}

/**
 * 화면 절전 방지 상태를 해제합니다.
 */
export function releaseWakeLock() {
    if (AppState.wakeLock !== null) {
        AppState.wakeLock.release().then(() => { AppState.wakeLock = null; });
    }
    if (noSleepVideo) {
        noSleepVideo.pause();
    }
}

// 백그라운드 복귀 시 트랙 모드면 wake lock을 다시 요청합니다.
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && AppState.currentDrawer === 'track') {
        requestWakeLock();
    }
});

/**
 * GPS 트랙 기록을 시작합니다.
 * 동작 원리:
 * - watchPosition으로 연속 좌표를 수집합니다.
 * - 직전 좌표와의 거리가 trackInterval 이상일 때만 선분 점을 추가합니다.
 */
function startTrackRecording() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    if (!navigator.geolocation) { alert('그리기 GPS가 지원되지 않는 기기입니다.'); return; }

    const confirmMsg = "트랙 기록을 시작합니다.\n\n1. 화면을 끄거나 다른 앱을 실행하면 GPS가 중단되어 트랙 기록이 끊어집니다. 이를 방지하기 위해 기록 중에는 화면이 자동으로 꺼지지 않습니다.\n\n2. 배터리 소모를 최소화하려면 하단의 [절전] 버튼을 눌러주세요. 화면이 까맣게 변하며, '오른쪽으로 밀어서 해제'로 돌아올 수 있습니다.\n\n3. 기록 중 [사진 추가] 버튼을 누르면 해당 위치에 독립적인 '점'이 생성되어 촬영한 사진이나 갤러리의 사진을 기록으로 추가할 수 있습니다.\n\n계속하시겠습니까?";

    if (!confirm(confirmMsg)) return;

    AppState.currentDrawer = 'track';
    document.body.classList.add('recording-mode');
    AppState.lastTrackLatLng = null;

    const randomColor = getRandomColor();
    AppState.trackPolyline = L.polyline([], { color: randomColor, weight: 4, opacity: 0.85 }).addTo(map);
    document.getElementById('track-action-toolbar').style.display = 'flex';
    requestWakeLock();

    AppState.trackWatchId = navigator.geolocation.watchPosition(
        function (pos) {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const newLatLng = L.latLng(lat, lng);

            if (!AppState.lastTrackLatLng) {
                AppState.trackPolyline.addLatLng(newLatLng);
                AppState.lastTrackLatLng = newLatLng;
                map.panTo(newLatLng);
                return;
            }

            const from = turf.point([AppState.lastTrackLatLng.lng, AppState.lastTrackLatLng.lat]);
            const to = turf.point([lng, lat]);
            const distM = turf.distance(from, to, { units: 'kilometers' }) * 1000;

            if (distM >= AppState.trackInterval) {
                AppState.trackPolyline.addLatLng(newLatLng);
                AppState.lastTrackLatLng = newLatLng;
                map.panTo(newLatLng);
            }
        },
        null, { enableHighAccuracy: true, maximumAge: 0 }
    );
}

/**
 * 동작 중인 GPS watchPosition 구독을 중지합니다.
 */
function stopTrackWatch() {
    if (AppState.trackWatchId !== null) {
        navigator.geolocation.clearWatch(AppState.trackWatchId);
        AppState.trackWatchId = null;
    }
}

/**
 * 트랙 기록을 취소하고 임시 폴리라인을 제거합니다.
 */
function cancelTrackRecording() {
    stopTrackWatch();
    if (AppState.trackPolyline) { map.removeLayer(AppState.trackPolyline); AppState.trackPolyline = null; }
    resetTrackUI();
}

/**
 * 트랙 기록 UI/상태를 기본값으로 되돌립니다.
 * 동작 원리: 드로어 상태, 툴바, wake lock, 절전모드까지 한 번에 정리합니다.
 */
function resetTrackUI() {
    AppState.currentDrawer = null;
    AppState.lastTrackLatLng = null;
    document.body.classList.remove('recording-mode');
    document.getElementById('track-action-toolbar').style.display = 'none';
    resetButtonStyles();
    releaseWakeLock();
    unlockSleepMode();
}

/**
 * 트랙 기록을 확정해 일반 레이어(Polyline)로 저장합니다.
 * 동작 원리: 임시 trackPolyline을 feature가 있는 영구 레이어로 변환한 뒤 저장합니다.
 */
function completeTrackRecording() {
    stopTrackWatch();
    const latlngs = AppState.trackPolyline ? AppState.trackPolyline.getLatLngs() : [];
    if (latlngs.length < 2) {
        alert('기록된 좌표가 너무 적습니다.');
        cancelTrackRecording();
        return;
    }
    const trackColor = AppState.trackPolyline ? AppState.trackPolyline.options.color : getRandomColor();
    if (AppState.trackPolyline) { map.removeLayer(AppState.trackPolyline); AppState.trackPolyline = null; }

    const memo = prompt('기록명 입력:', '트랙_' + getTimestampString());
    if (memo === null) { resetTrackUI(); return; }

    const layer = L.polyline(latlngs, { color: trackColor, weight: 4 });
    layer.feature = {
        type: 'Feature',
        properties: { memo: memo || getTimestampString(), id: Date.now(), isHidden: false, customColor: trackColor, isTrack: true }
    };

    updateLayerInfo(layer);
    drawnItems.addLayer(layer);
    saveToStorage();
    renderSurveyList();
    switchSidebarTab('record');
    resetTrackUI();
}

/* ==========================================================================
   5) 사진 기록 보조
   ========================================================================== */
/**
 * 사진 첨부용 점 기록 시작 메뉴를 엽니다.
 * 동작 원리: 임시 file input DOM을 만들고 메뉴 선택(촬영/갤러리)으로 분기합니다.
 */
export function startPhotoPoint() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;

    const tempId = 'new-photo-point';
    let div = document.getElementById(`temp-inputs-${tempId}`);
    if (!div) {
        div = document.createElement('div');
        div.id = `temp-inputs-${tempId}`;
        div.style.display = 'none';
        div.innerHTML = `<input type="file" id="input-cam-${tempId}" accept="image/*" capture="environment" onchange="processPendingPhotoFiles(this)">
                         <input type="file" id="input-gal-${tempId}" accept="image/*" multiple onchange="processPendingPhotoFiles(this)">`;
        document.body.appendChild(div);
    }
    openPhotoSelectMenu(null, tempId);
}

/**
 * 사진 점 기록 전처리(리사이즈/임시저장) 후 마커 그리기를 시작합니다.
 * 동작 원리: 파일을 base64로 읽고 resizeImage를 거쳐 AppState.pendingPhotos에 보관합니다.
 */
export function processPendingPhotoFiles(input) {
    const files = input.files;
    if (!files || files.length === 0) return;
    if (files.length > 5) {
        alert('사진은 최대 5장까지만 저장할 수 있습니다.');
        input.value = '';
        return;
    }

    import('./utils.js').then(({ resizeImage }) => {
        const promises = Array.from(files).map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = function (e) {
                    resizeImage(e.target.result, 800, 0.8).then(resolve);
                };
                reader.readAsDataURL(file);
            });
        });
        Promise.all(promises).then(results => {
            AppState.pendingPhotos = results;
            input.value = '';

            const tempDiv = document.getElementById('temp-inputs-new-photo-point');
            if (tempDiv) tempDiv.remove();

            // 전처리 완료 후 마커 드로어를 시작하면 created 이벤트에서 사진이 레이어에 귀속됩니다.
            startDraw('marker');
        });
    });
}

/**
 * 트랙 기록 중 현재 위치에 사진 포인트를 추가합니다.
 * 동작 원리: 현재 track 색상을 공유하는 마커를 만들고, 즉시 저장 후 파일 선택 메뉴를 엽니다.
 */
function addTrackPhotoPoint(event) {
    if (!AppState.lastTrackLatLng) { alert('GPS 위치 수신 대기 중...'); return; }
    const trackColor = AppState.trackPolyline ? AppState.trackPolyline.options.color : '#3388ff';
    const markerId = Date.now();
    const marker = L.marker(AppState.lastTrackLatLng, { icon: createColoredMarkerIcon(trackColor, '📷', 3) });
    marker.feature = {
        type: 'Feature',
        properties: { id: markerId, memo: '트랙사진_' + getTimestampString(), isHidden: false, customColor: trackColor, customEmoji: '📷', customMarkerSize: 3 }
    };
    drawnItems.addLayer(marker);
    updateLayerInfo(marker);
    saveToStorage();
    renderSurveyList();

    const tempId = `temp-inputs-${markerId}`;
    if (!document.getElementById(tempId)) {
        const div = document.createElement('div');
        div.id = tempId; div.style.display = 'none';
        div.innerHTML = `<input type="file" id="input-cam-${markerId}" accept="image/*" capture="environment" onchange="processPhotoFiles(this, ${markerId})">
                         <input type="file" id="input-gal-${markerId}" accept="image/*" multiple onchange="processPhotoFiles(this, ${markerId})">`;
        document.body.appendChild(div);
    }
    openPhotoSelectMenu(event, markerId);
}

/* ==========================================================================
   6) 버전 체크/강제 업데이트
   ========================================================================== */

/**
 * 현재 앱 버전과 서버 최신 버전을 비교해 업데이트 배지를 표시합니다.
 * 동작 원리: 캐시 우회를 위해 쿼리 타임스탬프를 붙여 config.js를 가져옵니다.
 */
async function checkAppVersion() {
    // 현재 실행 중 버전을 UI에 표시합니다.
    const versionEl = document.getElementById('app-version-display');
    if (versionEl) versionEl.textContent = APP_VERSION;

    try {
        // 캐시 우회 fetch
        const res = await fetch('./config.js?t=' + Date.now());
        if (!res.ok) return;
        const text = await res.text();

        // 파일 텍스트에서 APP_VERSION 값을 추출합니다.
        const match = text.match(/APP_VERSION\s*=\s*"([^"]+)"/);
        if (!match) return;

        const serverVersion = match[1];
        if (serverVersion !== APP_VERSION) {
            // 버전 차이가 있으면 배지만 노출하고, 실제 업데이트는 사용자 액션으로 수행합니다.
            const badge = document.getElementById('update-badge');
            if (badge) badge.style.display = 'inline';
        }
    } catch (e) {
        // 버전 체크 실패는 앱 핵심 기능과 무관하므로 로그만 남기고 계속 진행합니다.
        console.warn('버전 체크 실패:', e);
    }
}

/**
 * 캐시/서비스워커를 정리한 뒤 앱을 강제 새로고침합니다.
 */
async function forceAppUpdate() {
    if (!confirm('최신 버전으로 업데이트합니다.')) return;
    try {
        // Cache Storage 전체 삭제
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));

        // 서비스워커 등록 해제
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(reg => reg.unregister()));
        }
    } catch (e) {
        console.warn('캐시 삭제 실패:', e);
    }
    window.location.reload(true);
}

/* ==========================================================================
   7) 앱 부트스트랩 (DOMContentLoaded)
   ========================================================================== */
/**
 * 앱 시작 초기화 루틴입니다.
 * 동작 원리: 모드별 UI 분기 -> 이벤트 바인딩 -> 저장 데이터 로드 -> 지도/UI 동기화 순으로 진행합니다.
 */
document.addEventListener('DOMContentLoaded', async () => {
    if (APP_MODE === 'public') {
        document.body.classList.add('has-ad-main');

        const btnLock = document.getElementById('btn-lock');
        if (btnLock) btnLock.style.display = 'none';

        const adMain = document.getElementById('ad-container-main');
        if (adMain) adMain.style.display = 'block';


        const blockFeature = (e) => {
            e.preventDefault();
            e.stopPropagation();
            alert("일반 버전에서는 제공되지 않는 기능입니다.");
        };

        const btnTrack = document.getElementById('btn-track');
        if (btnTrack) {
            btnTrack.style.opacity = '0.5';
            btnTrack.addEventListener('click', blockFeature, true);
        }

        const btnPhotoPoint = document.getElementById('btn-photo-point');
        if (btnPhotoPoint) {
            btnPhotoPoint.style.opacity = '0.5';
            btnPhotoPoint.addEventListener('click', blockFeature, true);
        }
    } else if (APP_MODE === 'premium') {
        const btnLock = document.getElementById('btn-lock');
        if (btnLock) btnLock.style.display = 'none';

        const adMain = document.getElementById('ad-container-main');
        if (adMain) adMain.style.display = 'none';

    } else {
        // internal 모드
        const adMain = document.getElementById('ad-container-main');
        if (adMain) adMain.style.display = 'none';
    }

    initUiEventListeners();
    initSleepSlider();
    await loadFromStorage();
    await handleDeepLink();
    updateLayerOrder();
    syncSidebarUI();
    checkAppVersion();

    // 위치 추적 시작: 실시간 마커 갱신 + (딥링크가 없을 때만) 초기 중심 이동
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(onTrackSuccess, null, { enableHighAccuracy: true });
        const params = new URLSearchParams(window.location.search);
        if (!params.has('lat')) {
            navigator.geolocation.getCurrentPosition(pos => {
                map.setView([pos.coords.latitude, pos.coords.longitude], 19);
            }, null, { enableHighAccuracy: true });
        }
    }
});



/* ==========================================================================
   8) window 브리지 (HTML 인라인 이벤트 연동)
   ========================================================================== */
// HTML onclick 등에서 직접 호출할 수 있도록 핵심 함수를 window에 연결합니다.
window.findMe = findMe;
window.toggleTracking = toggleTracking;
// 프로젝트 전환 시 현재 프로젝트를 먼저 저장한 뒤 새 프로젝트를 로드합니다.
window.switchProject = (id) => {
    saveToStorage();
    AppState.currentProjectId = parseInt(id);
    loadCurrentProjectFeatures();
    fitCurrentProjectToMap();
    renderProjectSelector();
};
window.startTrackRecording = startTrackRecording;
window.completeTrackRecording = completeTrackRecording;
window.cancelTrackRecording = cancelTrackRecording;
window.addTrackPhotoPoint = addTrackPhotoPoint;
window.startPhotoPoint = startPhotoPoint;
window.processPendingPhotoFiles = processPendingPhotoFiles;
window.saveCurrentPoint = saveCurrentPoint;
window.saveCurrentBoundary = saveCurrentBoundary;
window.openSearchModal = openSearchModal;
window.closeSearchModal = closeSearchModal;
window.executeMapSearch = executeMapSearch;
// 가져오기 경고 모달을 거쳐 파일 입력을 열어줍니다.
window.triggerFileInput = () => {
    if (localStorage.getItem('hide_import_warning') === 'true') {
        document.getElementById('geoJsonInput').click();
    } else {
        const overlay = document.getElementById('import-warning-modal-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            setTimeout(() => overlay.classList.add('visible'), 10);
        }
    }
};

// 가져오기 경고 모달 닫기
window.closeImportWarningModal = () => {
    const overlay = document.getElementById('import-warning-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
};

// 경고 확인 후 파일 선택창 열기 (옵션에 따라 이후 경고 숨김 저장)
window.proceedWithImport = () => {
    const chk = document.getElementById('chk-hide-import-warning');
    if (chk && chk.checked) {
        localStorage.setItem('hide_import_warning', 'true');
    }
    window.closeImportWarningModal();
    document.getElementById('geoJsonInput').click();
};

window.clearAllData = clearAllData;
window.setCoordMode = (mode) => {
    AppState.coordMode = parseInt(mode);
    localStorage.setItem('setting_coord_mode', mode);
    updateCoordDisplay();
};
window.setTrackInterval = (value) => {
    AppState.trackInterval = parseInt(value);
    localStorage.setItem('setting_track_interval', value);
};
// 폴리곤 채움 표시 전역 설정을 즉시 지도 레이어 스타일에 반영합니다.
window.setPolygonFill = (value) => {
    const isFill = (value === 'true' || value === true);
    AppState.isPolygonFill = isFill;
    localStorage.setItem('setting_polygon_fill', isFill.toString());

    drawnItems.getLayers().forEach(layer => {
        // 새로 생성 직후에는 geometry 메타가 없을 수 있어 Leaflet 타입(L.Polygon)으로 판별합니다.
        if (layer instanceof L.Polygon) {
            if (layer.feature && layer.feature.properties && typeof layer.feature.properties.customFill === 'boolean') {
                layer.setStyle({ fillOpacity: layer.feature.properties.customFill ? 0.2 : 0 });
            } else {
                layer.setStyle({ fillOpacity: isFill ? 0.2 : 0 });
            }
        }
    });
};
window.copyCurrentAddress = () => {
    const text = document.getElementById('address-display').innerText;
    if (text && text !== "주소 확인 중...") copyText(text, false, "주소");
};
window.copyCurrentCoords = () => {
    const text = document.getElementById('coord-display').innerText;
    copyText(text, false, "좌표");
};
window.shareMyLocation = () => {
    const address = document.getElementById('address-display').innerText || "주소 정보 없음";
    const coordText = document.getElementById('coord-display').innerText || "0, 0";
    const lat = AppState.lastGpsLat;
    const lng = AppState.lastGpsLng;
    const shareUrl = `${window.location.origin}${window.location.pathname}?lat=${lat}&lng=${lng}`;
    const shareData = {
        title: '[F-Field] 내 위치 공유',
        text: `\n주소: ${address}\n좌표: ${coordText}\n\n링크: ${shareUrl}`,
        url: shareUrl
    };
    if (navigator.share) navigator.share(shareData);
    // Web Share API 미지원 브라우저는 텍스트 복사로 대체합니다.
    else copyText(`${shareData.text}\n${shareUrl}`);
};
window.clearAllData = clearAllData;
// 목록 전체 선택/해제를 "isHidden + 레이어 스타일"로 동기화합니다.
window.toggleAllLayers = (isChecked) => {
    drawnItems.getLayers().forEach(layer => {
        layer.feature.properties.isHidden = !isChecked;
        if (!isChecked) {
            layer instanceof L.Marker ? layer.setOpacity(0) : layer.setStyle({ opacity: 0, fillOpacity: 0, stroke: false });
            layer.closePopup();
            if (layer._path) layer._path.style.pointerEvents = 'none';
        } else {
            let fillOpq = 0.2;
            if (layer instanceof L.Polygon && !AppState.isPolygonFill) {
                fillOpq = 0;
            }
            if (layer instanceof L.Marker) {
                layer.setOpacity(1);
            } else {
                layer.setStyle({ opacity: 1, fillOpacity: fillOpq, stroke: true });
            }
            if (layer._path) layer._path.style.pointerEvents = 'visiblePainted';
        }
    });
    saveToStorage();
    uiRenderSurveyList();
};

// 현재 선택된(숨김 아님) 레이어를 일괄 삭제합니다.
window.deleteSelectedLayers = () => {
    let deletedCount = 0;
    const layersToRemove = [];

    drawnItems.getLayers().forEach(layer => {
        if (layer.feature && layer.feature.properties && !layer.feature.properties.isHidden) {
            layersToRemove.push(layer);
        }
    });

    if (layersToRemove.length === 0) {
        alert("선택된 기록이 없습니다.");
        return;
    }

    if (!confirm(`선택한 ${layersToRemove.length}개의 기록을 삭제하시겠습니까?\n(삭제 후 복구할 수 없습니다.)`)) return;

    layersToRemove.forEach(layer => {
        drawnItems.removeLayer(layer);
        if (layer._popup) layer.closePopup();
        deletedCount++;
    });

    if (deletedCount > 0) {
        saveToStorage();
        uiRenderSurveyList();
    }
};

// 현재 선택된(숨김 아님) 레이어를 일괄 내보냅니다.
window.exportSelectedLayers = async () => {
    // 화면 표시 중(isHidden=false) 레이어를 내보내기 대상으로 수집
    const layers = drawnItems.getLayers().filter(
        l => l.feature && l.feature.properties && !l.feature.properties.isHidden
    );

    if (layers.length === 0) {
        alert("선택된 기록이 없습니다.");
        return;
    }

    // 포맷 선택 모달을 Promise로 열고 결과를 받습니다.
    let format;
    try {
        format = await new Promise((resolve, reject) => {
            const overlay = document.getElementById('export-format-modal-overlay');
            if (!overlay) { reject(); return; }
            window._resolveExportFormat = (f) => {
                closeExportFormatModal();
                resolve(f);
            };
            overlay.style.display = 'flex';
            setTimeout(() => overlay.classList.add('visible'), 10);
        });
    } catch {
        return;
    }

    // 선택된 포맷으로 일괄 저장
    await exportLayerWithFormat(layers, format);
    alert(`${layers.length}개의 기록을 ${format.toUpperCase()} 형식으로 저장합니다.`);
};

window.exportCurrentProject = exportCurrentProject;
window.backupAllProjects = backupAllProjects;
window.toggleOverlay = toggleOverlay;
window.toggleBaseLayer = toggleBaseLayer;
window.changeCadastralMap = changeCadastralMap;
window.changeBaseMap = changeBaseMap;
window.startDraw = startDraw;
window.completeDrawing = completeDrawing;
window.cancelDrawing = cancelDrawing;
window.addGpsVertex = addGpsVertex;
window.deleteLastVertex = deleteLastVertex;
window.completeSingleEdit = completeSingleEdit;
window.revertSingleEdit = revertSingleEdit;
window.cancelSingleEdit = cancelSingleEdit;
window.handleFileSelect = handleFileSelect;
window.forceAppUpdate = forceAppUpdate;
window.closeExportFormatModal = closeExportFormatModal;
