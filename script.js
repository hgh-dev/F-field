/* ==========================================================================
   [모듈] 메인 컨트롤 타워 (script.js)
   [역할] 초기화 및 모듈 조립 (Entry Point)
   ========================================================================== */

import { APP_MODE, VWORLD_API_KEY, STORAGE_KEY, SEARCH_HISTORY_KEY, SEARCH_SETTING_KEY, SVG_ICONS } from './config.js';
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
    getAddressFromCoords, closeExportFormatModal, exportLayerWithFormat
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


export function renderSurveyList() {
    uiRenderSurveyList();
}

export function updateLayerInfo(layer) {
    uiUpdateLayerInfo(layer);
}

// 레이어 상태 변수 노출 (draw.js 등에서 사용)
export { currentBottomSheetLayerId, setCurrentBottomSheetLayerId };



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

function onTrackSuccess(pos) {
    updateLocationMarker(pos);
    if (AppState.isFollowing) map.panTo([pos.coords.latitude, pos.coords.longitude]);
}

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

function findMe() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    if (!navigator.geolocation) { alert("지역 위치 서비스가 지원되지 않는 디바이스입니다."); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 19);
    }, function () { alert("위치 정보를 가져오는 데 실패했습니다."); }, { enableHighAccuracy: true });
}

// 맵 클릭 이벤트 (UI.js로 옮기기엔 map 선언 위치와 엮여있어 여기에 둠)
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

map.on('dblclick', function (e) {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    map.panTo(e.latlng, { animate: true, duration: 0.3 });
    showInfoPopup(e.latlng.lat, e.latlng.lng);
    fetchAndHighlightBoundary(e.latlng.lng, e.latlng.lat);
});

// 트랙 기록 관련 래퍼 (AppState 의존성 때문)
let noSleepVideo = null;

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

export function releaseWakeLock() {
    if (AppState.wakeLock !== null) {
        AppState.wakeLock.release().then(() => { AppState.wakeLock = null; });
    }
    if (noSleepVideo) {
        noSleepVideo.pause();
    }
}

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && AppState.currentDrawer === 'track') {
        requestWakeLock();
    }
});

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

function stopTrackWatch() {
    if (AppState.trackWatchId !== null) {
        navigator.geolocation.clearWatch(AppState.trackWatchId);
        AppState.trackWatchId = null;
    }
}

function cancelTrackRecording() {
    stopTrackWatch();
    if (AppState.trackPolyline) { map.removeLayer(AppState.trackPolyline); AppState.trackPolyline = null; }
    resetTrackUI();
}

function resetTrackUI() {
    AppState.currentDrawer = null;
    AppState.lastTrackLatLng = null;
    document.body.classList.remove('recording-mode');
    document.getElementById('track-action-toolbar').style.display = 'none';
    resetButtonStyles();
    releaseWakeLock();
    unlockSleepMode();
}

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
            input.value = ''; // 초기화

            const tempDiv = document.getElementById('temp-inputs-new-photo-point');
            if (tempDiv) tempDiv.remove();

            // 이미지 선택/촬영 후 마커 찍기 그리기 도구 실행
            startDraw('marker');
        });
    });
}

function addTrackPhotoPoint(event) {
    if (!AppState.lastTrackLatLng) { alert('GPS 위치 수신 대기 중...'); return; }
    const trackColor = AppState.trackPolyline ? AppState.trackPolyline.options.color : '#3388ff';
    const markerId = Date.now();
    const marker = L.marker(AppState.lastTrackLatLng, { icon: createColoredMarkerIcon(trackColor) });
    marker.feature = {
        type: 'Feature',
        properties: { id: markerId, memo: '트랙 사진', isHidden: false, customColor: trackColor }
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

// 초기화 이벤트
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

    // GPS 시작
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



window.findMe = findMe;
window.toggleTracking = toggleTracking;
window.switchProject = (id) => {
    saveToStorage();
    AppState.currentProjectId = parseInt(id);
    loadCurrentProjectFeatures();
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

window.closeImportWarningModal = () => {
    const overlay = document.getElementById('import-warning-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
};

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
window.setPolygonFill = (value) => {
    const isFill = (value === 'true' || value === true);
    AppState.isPolygonFill = isFill;
    localStorage.setItem('setting_polygon_fill', isFill.toString());

    drawnItems.getLayers().forEach(layer => {
        // layer.feature.geometry는 새로 그린 직후엔 객체가 없습니다. (새로고침해야 생성됨)
        // 따라서 L.Polygon 객체인지 여부로 다이렉트 확인합니다.
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
    else copyText(`${shareData.text}\n${shareUrl}`);
};
window.clearAllData = clearAllData;
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

window.exportSelectedLayers = async () => {
    // 체크된(화면에 표시된, isHidden이 false인) 레이어 목록 수집
    const layers = drawnItems.getLayers().filter(
        l => l.feature && l.feature.properties && !l.feature.properties.isHidden
    );

    if (layers.length === 0) {
        alert("선택된 기록이 없습니다.");
        return;
    }

    // 파일 형식 선택 모달 표시
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
        return; // 취소
    }

    // 선택된 형식으로 각 레이어 일괄 저장
    await exportLayerWithFormat(layers, format);
    alert(`${layers.length}개의 기록을 ${format.toUpperCase()} 형식으로 저장합니다.`);
};

window.exportCurrentProject = exportCurrentProject;
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
window.closeExportFormatModal = closeExportFormatModal;


