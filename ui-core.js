/* ==========================================================================
   [모듈] 공통 UI 모듈 (ui-core.js)
   [역할] 사이드바/공통 모달/컨텍스트 메뉴/레이어 상세/스타일 UI 등 공통 화면 상호작용 제어
   [입력] AppState, 지도(map), 레이어(drawnItems), 로컬 저장소(localStorage)
   [출력] DOM 갱신, 지도 이동/스타일 변경, 전역(window) UI 액션 바인딩
   ========================================================================== */
import { SVG_ICONS } from './config.js?v=2.5.0';
import { AppState } from './state.js?v=2.5.0';
import { map, vworldBase, vworldSatellite, vworldHybrid, esriSatelliteLayer, vworldLxLayer, vworldContinuousLayer, nasGukLayer, toggleOverlay, getOfflineMapUrls } from './map.js?v=2.5.0';
import { drawnItems, currentEditLayerId } from './draw.js?v=2.5.0';
import { createColoredMarkerIcon, copyText, getTmCoords, convertToDms } from './utils.js?v=2.5.0';
import { saveToStorage, exportSingleLayer } from './data.js?v=2.5.0';
import {
    initSearchSettings,
    toggleSearchBox,
    switchSearchTab,
    renderCoordSearchInputs,
    executeSearch,
    closeSearchResult,
    toggleHistorySave,
    clearHistoryAll,
    deleteHistoryItem,
    showHistoryPanel,
} from './ui-search.js?v=2.5.0';
import {
    setCurrentBottomSheetLayerId,
    openBottomSheet,
    closeBottomSheet,
    toggleBottomSheetState,
    toggleBottomSheetMoreMenu,
    syncBottomSheetHoleMenuForLayer,
    handleBottomSheetEdit,
    handleBottomSheetStyle,
    handleBottomSheetBringToFront,
    handleBottomSheetBringForward,
    handleBottomSheetSendToBack,
    handleBottomSheetSendBackward,
    handleBottomSheetDelete,
    handleBottomSheetHole,
    handleBottomSheetHoleFill,
    showInfoPopup,
    fetchAndHighlightBoundary,
} from './ui-bottomsheet.js?v=2.5.0';
import {
    createNewProject,
    editProjectName,
    deleteCurrentProject,
    renderProjectList,
    openMoveProjectModal,
    createNewProjectAndMove,
    openMoveSelectionModal,
    closeMoveProjectModal,
    renderSurveyList,
    openSortModal,
    closeSortModal,
    applySortSetting,
    openProjectSortModal,
    closeProjectSortModal,
    applyProjectSortSetting
} from './ui-project.js?v=2.5.0';
import {
    createLayerPhotoSection,
    openPhotoSelectMenu,
    closePhotoSelectMenu,
    handlePhotoMenuAction,
    processPhotoFiles,
    deletePhoto,
    openPhotoModal,
    nextPhoto,
    prevPhoto,
    downloadCurrentPhoto,
    closePhotoModal
} from './ui-photo.js?v=2.5.0';


// --- 전역 UI 상태 ---
export let currentMemoLayerId = null;
export let navTarget = { name: '', lat: 0, lng: 0 };
export let currentContextId = null;
let isUiRuntimeInitialized = false;

function isDockedSidebarViewport() {
    return window.matchMedia('(min-width: 1024px) and (orientation: landscape)').matches;
}

function refreshMapAfterSidebarLayout() {
    setTimeout(() => map.invalidateSize({ animate: false }), 310);
}

/* --------------------------------------------------------------------------
   1. 사이드바 제어 (Sidebar)
   -------------------------------------------------------------------------- */
/* 1-1. 열기 및 닫기 */

/**
 * [함수] openSidebar
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openSidebar() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    syncSidebarUI();
    renderSurveyList();
    const overlay = document.getElementById('sidebar-overlay');
    document.body.classList.toggle('sidebar-docked-open', isDockedSidebarViewport());
    overlay.style.display = 'block';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
    refreshMapAfterSidebarLayout();
}

/**
 * [함수] closeSidebar
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    overlay.classList.remove('visible');
    document.body.classList.remove('sidebar-docked-open');
    refreshMapAfterSidebarLayout();
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/* 1-2. 탭 전환 및 UI 동기화 */
/**
 * [함수] syncSidebarUI
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function syncSidebarUI() {
    const hasBase = map.hasLayer(vworldBase);
    const hasSat = map.hasLayer(vworldSatellite);
    const hasEsri = map.hasLayer(esriSatelliteLayer);

    const chkBase = document.getElementById('chk-base-layer');
    if (chkBase) chkBase.checked = (hasBase || hasSat || hasEsri);

    const baseSat = document.querySelector('input[name="baseMap"][value="satellite"]');
    const baseEsri = document.querySelector('input[name="baseMap"][value="esri"]');
    const baseBase = document.querySelector('input[name="baseMap"][value="base"]');

    if (hasSat && baseSat) baseSat.checked = true;
    else if (hasEsri && baseEsri) baseEsri.checked = true;
    else if (hasBase && baseBase) baseBase.checked = true;

    const chkHybrid = document.getElementById('chk-hybrid');
    if (chkHybrid) chkHybrid.checked = map.hasLayer(vworldHybrid);

    const hasContinuous = map.hasLayer(vworldContinuousLayer);
    const hasLx = map.hasLayer(vworldLxLayer);
    const chkCadastral = document.getElementById('chk-cadastral');
    if (chkCadastral) chkCadastral.checked = (hasContinuous || hasLx);

    const cadLx = document.querySelector('input[name="cadastralMap"][value="lx"]');
    const cadCont = document.querySelector('input[name="cadastralMap"][value="continuous"]');

    if (hasLx && cadLx) cadLx.checked = true;
    else if (cadCont) cadCont.checked = true;

    toggleOverlay('cadastral', (hasContinuous || hasLx));

    const chkNasGuk = document.getElementById('chk-nas-guk');
    if (chkNasGuk) chkNasGuk.checked = map.hasLayer(nasGukLayer);
}

/**
 * [함수] switchSidebarTab
 * [역할] 활성 대상(탭/모드)을 바꾸고 연관 UI를 동기화한다.
 * [원리] 선택된 탭/모드 값을 기준으로 active 클래스와 표시 대상을 재설정하고,
 *        필요한 후속 렌더링 함수를 호출해 화면과 상태가 같은 기준을 보게 만든다.
 */
export function switchSidebarTab(tabName) {
    // 모든 탭 버튼과 콘텐츠 비활성화
    ['map', 'project', 'record'].forEach(t => {
        const btn = document.getElementById('tab-btn-' + t);
        const content = document.getElementById('content-' + t);
        if (btn) btn.classList.remove('active');
        if (content) content.classList.remove('active');
    });

    const activeBtn = document.getElementById('tab-btn-' + tabName);
    const activeContent = document.getElementById('content-' + tabName);
    if (activeBtn) activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');

    // 프로젝트 탭 열 때 목록 렌더링
    if (tabName === 'project') {
        renderProjectList();
    }
}

/* --------------------------------------------------------------------------
   2. 접근 제어 UI (Access Control)
   -------------------------------------------------------------------------- */
/**
 * [함수] unlockHiddenLayers
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function unlockHiddenLayers() {
    const section = document.getElementById('hidden-layer-section');
    const btnLock = document.getElementById('btn-lock');

    if (section.style.display === 'block') {
        alert("이미 잠금이 해제되었습니다.");
        return;
    }

    // 커스텀 다이얼로그 동적 생성
    const overlay = document.createElement('div');
    overlay.className = 'nav-modal-overlay visible';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';

    const modal = document.createElement('div');
    modal.style.width = '80%';
    modal.style.maxWidth = '280px';
    modal.style.backgroundColor = '#fff';
    modal.style.borderRadius = '14px';
    modal.style.padding = '20px';
    modal.style.boxShadow = '0 10px 25px rgba(0,0,0,0.1)';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.gap = '16px';
    modal.style.transition = 'transform 0.3s ease-out';
    modal.onclick = (e) => e.stopPropagation();

    const title = document.createElement('div');
    title.innerText = '암호를 입력하세요';
    title.style.fontSize = '15px';
    title.style.fontWeight = 'bold';
    title.style.textAlign = 'center';
    title.style.color = '#333';

    const input = document.createElement('input');
    input.type = 'password';
    input.pattern = '[0-9]*';
    input.inputMode = 'numeric';
    input.style.width = '100%';
    input.style.padding = '12px';
    input.style.fontSize = '18px';
    input.style.border = '1.5px solid #e5e5ea';
    input.style.borderRadius = '8px';
    input.style.textAlign = 'center';
    input.style.letterSpacing = '5px';
    input.style.boxSizing = 'border-box';
    input.style.outline = 'none';
    input.style.transition = 'border-color 0.2s';
    input.onfocus = () => {
        input.style.borderColor = '#007aff';
        // 모바일 가상 키보드 회피를 위해 모달을 위로 올림
        if (window.innerWidth <= 768) {
            modal.style.transform = 'translateY(-15vh)';
        }
    };
    input.onblur = () => {
        input.style.borderColor = '#e5e5ea';
        modal.style.transform = 'translateY(0)';
    };

    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '10px';

    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = '취소';
    cancelBtn.style.flex = '1';
    cancelBtn.style.padding = '10px';
    cancelBtn.style.background = '#f2f2f7';
    cancelBtn.style.border = 'none';
    cancelBtn.style.borderRadius = '8px';
    cancelBtn.style.fontWeight = 'bold';
    cancelBtn.style.fontSize = '14px';
    cancelBtn.style.color = '#8e8e93';

    const confirmBtn = document.createElement('button');
    confirmBtn.innerText = '확인';
    confirmBtn.style.flex = '1';
    confirmBtn.style.padding = '10px';
    confirmBtn.style.background = '#007aff';
    confirmBtn.style.border = 'none';
    confirmBtn.style.borderRadius = '8px';
    confirmBtn.style.fontWeight = 'bold';
    confirmBtn.style.fontSize = '14px';
    confirmBtn.style.color = 'white';

    btnGroup.appendChild(cancelBtn);
    btnGroup.appendChild(confirmBtn);

    modal.appendChild(title);
    modal.appendChild(input);
    modal.appendChild(btnGroup);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    input.focus();

    const cleanup = () => { document.body.removeChild(overlay); };

    cancelBtn.onclick = cleanup;
    overlay.onclick = cleanup;

    const doSubmit = () => {
        const val = input.value;
        cleanup();
        if (!val) return;
        if (btoa(val) === 'ODkwNg==') {
            section.style.display = 'block';
            btnLock.innerHTML = SVG_ICONS.unlock;
            btnLock.style.color = '#3B82F6';
            alert("잠금이 해제되었습니다. 비공개 정보가 유출되지 않도록 주의하세요.");
        } else {
            alert("암호가 올바르지 않습니다.");
        }
    };
    confirmBtn.onclick = doSubmit;
    input.onkeypress = (e) => { if (e.key === 'Enter') doSubmit(); };
}

/* --------------------------------------------------------------------------
   3. 모달 및 팝업 제어 (Modal & Popup)
   -------------------------------------------------------------------------- */
/* 3-1. 메모/위치/설정/내비게이션 모달 */

/**
 * [함수] editLayerDescription
 * [역할] 기존 데이터 편집 흐름을 시작하거나 변경값을 반영한다.
 * [원리] 대상 엔티티를 조회해 기존 값을 입력 UI에 채운 뒤,
 *        사용자 확정값을 속성에 반영하고 저장/리렌더 흐름으로 후처리한다.
 */
export function editLayerDescription(id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    currentMemoLayerId = id;
    const existing = layer.feature.properties.description || "";
    document.getElementById('memo-input-textarea').value = existing;
    const overlay = document.getElementById('memo-modal-overlay');
    const container = document.getElementById('memo-modal-container');
    overlay.style.display = 'flex';
    container.style.display = 'flex';
    setTimeout(() => {
        overlay.classList.add('visible');
        container.classList.add('visible');
        document.getElementById('memo-input-textarea').focus();
    }, 10);
}

/**
 * [함수] closeMemoModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeMemoModal() {
    const overlay = document.getElementById('memo-modal-overlay');
    const container = document.getElementById('memo-modal-container');
    overlay.classList.remove('visible');
    container.classList.remove('visible');
    setTimeout(() => {
        overlay.style.display = 'none';
        container.style.display = 'none';
    }, 200);
    currentMemoLayerId = null;
}

/**
 * [함수] saveMemoAction
 * [역할] 변경된 내용을 저장소 또는 상태에 기록한다.
 * [원리] 현재 편집 대상과 입력값 유효성을 확인한 뒤,
 *        속성 반영 후 저장소 업데이트와 관련 UI 리렌더를 함께 실행한다.
 */
export function saveMemoAction() {
    if (currentMemoLayerId === null) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === currentMemoLayerId);
    if (!layer) { closeMemoModal(); return; }
    const input = document.getElementById('memo-input-textarea').value;
    layer.feature.properties.description = input;
    updateLayerInfo(layer);
    saveToStorage();
    renderSurveyList();
    layer.fire('click');
    closeMemoModal();
}

/**
 * [함수] editLayerMemo
 * [역할] 기존 데이터 편집 흐름을 시작하거나 변경값을 반영한다.
 * [원리] 대상 엔티티를 조회해 기존 값을 입력 UI에 채운 뒤,
 *        사용자 확정값을 속성에 반영하고 저장/리렌더 흐름으로 후처리한다.
 */
export function editLayerMemo(id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    const existing = layer.feature.properties.memo || "";
    const input = prompt("기록명을 입력하세요:", existing);
    if (input === null || input.trim() === "") return;
    layer.feature.properties.memo = input.trim();
    updateLayerInfo(layer);
    saveToStorage();
    renderSurveyList();
    layer.fire('click');
}


/**
 * [함수] openLocationActionModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openLocationActionModal() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    const overlay = document.getElementById('location-action-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

/**
 * [함수] closeLocationActionModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeLocationActionModal() {
    const overlay = document.getElementById('location-action-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] openSettingsModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openSettingsModal() {
    closeSidebar();
    document.getElementsByName('coord-mode-select').forEach(r => { if (parseInt(r.value) === AppState.coordMode) r.checked = true; });
    document.getElementsByName('track-interval-select').forEach(r => { if (parseInt(r.value) === AppState.trackInterval) r.checked = true; });
    document.getElementsByName('polygon-fill-select').forEach(r => { if ((r.value === 'true') === AppState.isPolygonFill) r.checked = true; });
    document.getElementsByName('snap-enabled-select').forEach(r => { if ((r.value === 'true') === AppState.isSnapEnabled) r.checked = true; });
    const overlay = document.getElementById('settings-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

/**
 * [함수] closeSettingsModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeSettingsModal() {
    const overlay = document.getElementById('settings-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] openNavModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openNavModal(name, lat, lng) {
    navTarget = { name: name || "목적지", lat: lat, lng: lng };
    const overlay = document.getElementById('nav-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

/**
 * [함수] closeNavModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeNavModal() {
    const overlay = document.getElementById('nav-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] executeNavigation
 * [역할] 사용자 선택에 따라 실제 동작(이동/저장/연결)을 수행한다.
 * [원리] 사용자 선택값을 실제 실행 경로(URL/이동/저장 작업)로 변환하고,
 *        완료 후 모달 닫기·화면 갱신 등 후속 UI 정리까지 한 흐름으로 처리한다.
 */
export function executeNavigation(type) {
    const { name, lat, lng } = navTarget;
    let url = "";
    if (type === 'tmap') url = `tmap://route?goalname=${encodeURIComponent(name)}&goalx=${lng}&goaly=${lat}`;
    else if (type === 'naver') url = `nmap://navigation?dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(name)}&appname=F-Field`;
    else if (type === 'kakao') url = `kakaomap://route?ep=${lat},${lng}&by=CAR`;
    window.location.href = url;
    setTimeout(closeNavModal, 500);
}

/* --------------------------------------------------------------------------
   4. 피드백 및 시각 요소 (Feedback & Visuals)
   -------------------------------------------------------------------------- */
/* 4-1. 버튼 스타일 제어 */

/**
 * [함수] resetButtonStyles
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function resetButtonStyles() {
    document.querySelectorAll('.bottom-btn').forEach(btn => btn.classList.remove('active-btn'));
    resetRecordFabMain();
}

/**
 * [함수] highlightButton
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function highlightButton(btnId) {
    resetButtonStyles();
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.classList.add('active-btn');
        setRecordFabMainIcon(btn);
    }
}

export function toggleRecordFab() {
    const fab = document.getElementById('record-fab');
    if (!fab) return;

    const mainBtn = document.getElementById('record-fab-main');
    if (mainBtn?.classList.contains('is-recording')) {
        closeRecordFab();
        return;
    }

    const isExpanded = fab.classList.toggle('expanded');
    if (mainBtn) {
        mainBtn.setAttribute('aria-label', isExpanded ? '기록 도구 닫기' : '기록 도구 열기');
    }
}

export function closeRecordFab() {
    const fab = document.getElementById('record-fab');
    if (!fab) return;

    fab.classList.remove('expanded');
    const mainBtn = document.getElementById('record-fab-main');
    if (mainBtn) mainBtn.setAttribute('aria-label', '기록 도구 열기');
}

function resetRecordFabMain() {
    closeRecordFab();
    const mainBtn = document.getElementById('record-fab-main');
    const activeIcon = document.getElementById('record-fab-active-icon');
    if (mainBtn) mainBtn.classList.remove('is-recording');
    if (activeIcon) activeIcon.innerHTML = '';
}

function setRecordFabMainIcon(sourceBtn) {
    closeRecordFab();
    const mainBtn = document.getElementById('record-fab-main');
    const activeIcon = document.getElementById('record-fab-active-icon');
    const icon = sourceBtn?.querySelector('.icon-box');
    if (!mainBtn || !activeIcon || !icon) return;

    activeIcon.innerHTML = icon.innerHTML;
    mainBtn.classList.add('is-recording');
}

/* --------------------------------------------------------------------------
   5. 기타 UI 요소 (Utility UI)
   -------------------------------------------------------------------------- */
/* 5-1. 전체화면, 좌표 표시 및 절전 모드 */

/**
 * [함수] updateCoordDisplay
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updateCoordDisplay() {
    let lat = AppState.lastGpsLat;
    let lng = AppState.lastGpsLng;
    let text = "";
    if (AppState.coordMode === 2) {
        const tm = getTmCoords(lat, lng);
        text = "X: " + tm.x + " | Y: " + tm.y;
    } else if (AppState.coordMode === 1) text = "N " + lat.toFixed(4) + "° | E " + lng.toFixed(4) + "°";
    else text = convertToDms(lat, 'lat') + " | " + convertToDms(lng, 'lng');
    const el = document.getElementById('coord-display');
    if (el) el.innerText = text;
}

/**
 * [함수] initSleepSlider
 * [역할] 초기 이벤트와 기본 상태를 설정한다.
 * [원리] 초기 1회 실행 구간에서 기본값과 이벤트 연결을 세팅하고,
 *        중복 등록/중복 실행을 방지하는 가드 조건으로 안정성을 확보한다.
 */
export function initSleepSlider() {
    const sliderThumb = document.getElementById('sleep-slider-thumb');
    if (!sliderThumb) return;
    sliderThumb.addEventListener('touchstart', onSleepSliderTouchStart, { passive: false });
    document.addEventListener('touchmove', onSleepSliderTouchMove, { passive: false });
    document.addEventListener('touchend', onSleepSliderTouchEnd);
}

/**
 * [함수] onSleepSliderTouchStart
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function onSleepSliderTouchStart(e) {
    const overlay = document.getElementById('sleep-mode-overlay');
    if (!overlay || overlay.style.display === 'none') return;
    const sliderThumb = document.getElementById('sleep-slider-thumb');
    AppState.isDraggingSleepSlider = true;
    AppState.sleepStartX = e.touches[0].clientX;
    sliderThumb.classList.add('dragging');
    AppState.sleepMaxDragX = sliderThumb.parentElement.offsetWidth - 60;
}

/**
 * [함수] onSleepSliderTouchMove
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function onSleepSliderTouchMove(e) {
    if (!AppState.isDraggingSleepSlider) return;
    e.preventDefault();
    const sliderThumb = document.getElementById('sleep-slider-thumb');
    AppState.sleepCurrentX = e.touches[0].clientX - AppState.sleepStartX;
    if (AppState.sleepCurrentX < 0) AppState.sleepCurrentX = 0;
    if (AppState.sleepCurrentX > AppState.sleepMaxDragX) AppState.sleepCurrentX = AppState.sleepMaxDragX;
    sliderThumb.style.transform = `translateX(${AppState.sleepCurrentX}px)`;
}

/**
 * [함수] onSleepSliderTouchEnd
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function onSleepSliderTouchEnd(e) {
    if (!AppState.isDraggingSleepSlider) return;
    AppState.isDraggingSleepSlider = false;
    const sliderThumb = document.getElementById('sleep-slider-thumb');
    sliderThumb.classList.remove('dragging');
    if (AppState.sleepCurrentX >= AppState.sleepMaxDragX * 0.85) {
        unlockSleepMode();
    } else {
        sliderThumb.style.transform = `translateX(0px)`;
    }
}

/**
 * [함수] startSleepMode
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function startSleepMode() {
    const overlay = document.getElementById('sleep-mode-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        const sliderThumb = document.getElementById('sleep-slider-thumb');
        if (sliderThumb) sliderThumb.style.transform = `translateX(0px)`;
    }
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`전체화면 요청 실패: ${err.message}`);
        });
    }
}

/**
 * [함수] unlockSleepMode
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function unlockSleepMode() {
    const overlay = document.getElementById('sleep-mode-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        const sliderThumb = document.getElementById('sleep-slider-thumb');
        if (sliderThumb) sliderThumb.style.transform = `translateX(0px)`;
    }
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
            console.log(`전체화면 해제 실패: ${err.message}`);
        });
    }
}

/* 5-2. 컨텍스트 메뉴 및 드롭다운 */

/**
 * [함수] initContextMenu
 * [역할] 초기 이벤트와 기본 상태를 설정한다.
 * [원리] 초기 1회 실행 구간에서 기본값과 이벤트 연결을 세팅하고,
 *        중복 등록/중복 실행을 방지하는 가드 조건으로 안정성을 확보한다.
 */
export function initContextMenu() {
    if (document.getElementById('global-context-menu')) return;
    const menu = document.createElement('div');
    menu.id = 'global-context-menu';
    menu.className = 'more-context-menu';
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
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.btn-more') && !e.target.closest('.more-context-menu')) {
            closeContextMenu();
        }
    }, true);
}

/**
 * [함수] openContextMenu
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openContextMenu(e, id) {
    e.stopPropagation();
    e.preventDefault();
    initContextMenu();
    currentContextId = id;
    const menu = document.getElementById('global-context-menu');
    const rect = e.currentTarget.getBoundingClientRect();
    let top = rect.bottom + 5;
    let right = window.innerWidth - rect.right;
    menu.style.top = top + 'px';
    menu.style.right = right + 'px';
    menu.style.left = 'auto';
    menu.style.display = 'flex';
    requestAnimationFrame(() => menu.classList.add('visible'));
}

/**
 * [함수] closeContextMenu
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeContextMenu() {
    const menu = document.getElementById('global-context-menu');
    if (menu) {
        menu.classList.remove('visible');
        setTimeout(() => {
            if (!menu.classList.contains('visible')) menu.style.display = 'none';
        }, 100);
    }
    currentContextId = null;
}

/**
 * [함수] handleMenuAction
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 이벤트 컨텍스트를 해석해 예외/가드 조건을 먼저 처리하고,
 *        조건에 맞는 작업 함수로 분기해 사용자 의도에 맞는 동작을 실행한다.
 */
export function handleMenuAction(action) {
    const id = currentContextId;
    if (!id) return;
    closeContextMenu();
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
}

/**
 * [함수] toggleAccordion
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleAccordion(contentId, headerElement) {
    const content = document.getElementById(contentId);
    if (!content) return;
    const isVisible = window.getComputedStyle(content).display === 'block';
    if (isVisible) {
        content.style.display = 'none';
        headerElement.classList.remove('active');
    } else {
        content.style.display = 'block';
        headerElement.classList.add('active');
    }
}

/**
 * [함수] toggleMoreMenu
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleMoreMenu(event) {
    event.stopPropagation();
    closeAllDropdowns();
    const menu = document.getElementById('more-menu');
    if (menu) menu.classList.toggle('visible');
}

/**
 * [함수] toggleProjectMenu
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleProjectMenu(event) {
    event.stopPropagation();
    closeAllDropdowns();
    const menu = document.getElementById('project-menu');
    if (menu) menu.classList.toggle('visible');
}

/**
 * [함수] closeAllDropdowns
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeAllDropdowns() {
    const dropdowns = document.querySelectorAll('.dropdown-menu');
    dropdowns.forEach(menu => {
        if (menu.classList.contains('visible')) {
            menu.classList.remove('visible');
        }
    });
}

// 줌아웃일수록 선/면을 더 단순화해 렌더링 부담을 줄임
/**
 * [함수] getSmoothFactorForZoom
 * [역할] 현재 조건에 맞는 값을 조회해 반환한다.
 * [원리] 현재 활성 탭/상태를 기준으로 조회 키를 계산하고,
 *        해당 키에 대응하는 값을 읽어 호출자에 반환한다.
 */
function getSmoothFactorForZoom(zoom) {
    if (zoom >= 15) return 1; // 15레벨 이상은 원본에 가깝게 유지
    if (zoom === 14) return 2;
    if (zoom === 13) return 4;
    if (zoom <= 11) return 10;
    return 7; // zoom 12
}

/**
 * [함수] isLineOrPolygonLayer
 * [역할] 입력 대상이 조건을 만족하는지 불리언으로 판별한다.
 * [원리] 입력 객체의 타입과 필수 필드를 순서대로 검사해,
 *        후속 로직 분기에서 재사용할 불리언 판정 결과를 반환한다.
 */
function isLineOrPolygonLayer(layer) {
    return layer instanceof L.Polyline && !(layer instanceof L.Marker);
}

/**
 * [함수] optimizeVectorLayerForViewport
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function optimizeVectorLayerForViewport(layer, viewBounds, zoom) {
    if (!isLineOrPolygonLayer(layer)) return;

    const smoothFactor = getSmoothFactorForZoom(zoom);
    if (layer.options.smoothFactor !== smoothFactor) {
        layer.options.smoothFactor = smoothFactor;
        if (typeof layer.redraw === 'function') layer.redraw();
    }

    const isHidden = layer.feature?.properties?.isHidden === true;
    const layerBounds = typeof layer.getBounds === 'function' ? layer.getBounds() : null;
    const isInView = !!(layerBounds && layerBounds.isValid() && viewBounds.intersects(layerBounds));
    const path = layer._path;
    if (!path) return;

    // 화면 밖/숨김 상태 도형은 path 자체를 숨겨서 렌더링 비용을 낮춤
    if (isHidden || !isInView) {
        path.style.display = 'none';
        path.style.pointerEvents = 'none';
    } else {
        path.style.display = '';
        path.style.pointerEvents = 'visiblePainted';
    }
}

/**
 * [함수] optimizeViewportVectorRendering
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function optimizeViewportVectorRendering() {
    const viewBounds = map.getBounds();
    const zoom = map.getZoom();
    drawnItems.getLayers().forEach(layer => optimizeVectorLayerForViewport(layer, viewBounds, zoom));
}

let isViewportOptimizationScheduled = false;
/**
 * [함수] scheduleViewportVectorOptimization
 * [역할] 비용이 큰 작업을 지연 예약해 호출 빈도를 제어한다.
 * [원리] requestAnimationFrame 예약 플래그를 사용해 연속 호출을 하나로 합치고,
 *        고비용 렌더 작업을 프레임 단위로 지연 실행해 성능 부담을 줄인다.
 */
export function scheduleViewportVectorOptimization() {
    if (isViewportOptimizationScheduled) return;
    isViewportOptimizationScheduled = true;
    requestAnimationFrame(() => {
        isViewportOptimizationScheduled = false;
        optimizeViewportVectorRendering();
    });
}

/* --------------------------------------------------------------------------
   6. 이벤트 리스너 (DOM Events)
   -------------------------------------------------------------------------- */
/**
 * [함수] initUiEventListeners
 * [역할] 초기 이벤트와 기본 상태를 설정한다.
 * [원리] 문서/지도/레이어 이벤트를 한 번에 등록해 외부 클릭 닫기와 스와이프 동작을 처리하고,
 *        zoom/move 변화 시 오프라인 버튼 상태 및 벡터 렌더 최적화를 예약 호출한다.
 */
export function initUiEventListeners() {
    // 검색창 외부 클릭 시 닫기
    document.addEventListener('mousedown', function (e) {
        const sc = document.getElementById('search-container');
        const btn = document.getElementById('btn-search-toggle');
        if (sc && sc.style.display === 'flex' && !sc.contains(e.target) && !btn.contains(e.target)) {
            sc.style.display = 'none';
        }
    });

    // 화면 터치 시 더보기 메뉴 닫기
    document.addEventListener('click', function (event) {
        const moreMenu = document.getElementById('bottom-sheet-more-menu');
        const moreBtn = document.getElementById('bottom-sheet-more-btn');
        if (moreMenu && moreMenu.classList.contains('visible')) {
            if (!moreMenu.contains(event.target) && (!moreBtn || !moreBtn.contains(event.target))) {
                moreMenu.classList.remove('visible');
                setTimeout(() => moreMenu.style.display = 'none', 100);
            }
        }
    });

    // 외부 클릭 시 모든 드롭다운 메뉴 닫기
    window.addEventListener('click', function () {
        closeAllDropdowns();
    });

    // 우클릭(컨텍스트 메뉴) 방지
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { passive: false });

    window.addEventListener('resize', function () {
        const overlay = document.getElementById('sidebar-overlay');
        if (!overlay || !overlay.classList.contains('visible')) return;

        document.body.classList.toggle('sidebar-docked-open', isDockedSidebarViewport());
        refreshMapAfterSidebarLayout();
    });

    // 바텀시트 스와이프 드래그 닫기 기능
    const bs = document.getElementById('bottom-sheet');
    if (bs) {
        let startY = 0;
        let isDragging = false;
        let isScrollTop = true;

        const onDragStart = (e) => {
            if (!bs.classList.contains('open')) return;
            isScrollTop = bs.scrollTop <= 0;
            if (!isScrollTop) return;
            startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            isDragging = true;
            bs.style.transition = 'none';
        };

        const onDragMove = (e) => {
            if (!isDragging || !isScrollTop) return;
            let clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            let deltaY = clientY - startY;
            if (deltaY > 0) {
                if (e.cancelable) e.preventDefault();
                bs.style.transform = `translate(-50%, ${deltaY}px)`;
            } else {
                bs.style.transform = `translate(-50%, 0px)`;
            }
        };

        const onDragEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;
            bs.style.transition = '';
            let clientY = e.type.includes('mouse') ? e.clientY : (e.changedTouches ? e.changedTouches[0].clientY : startY);
            let deltaY = clientY - startY;
            const isFullOpen = bs.classList.contains('full-open');

            if (deltaY < -50) {
                if (!isFullOpen) bs.classList.add('full-open');
                bs.style.transform = '';
            } else if (deltaY > 50 && isFullOpen) {
                bs.classList.remove('full-open');
                bs.style.transform = '';
            } else if (deltaY > 100 && !isFullOpen) {
                closeBottomSheet();
                setTimeout(() => { bs.style.transform = ''; }, 300);
            } else {
                bs.style.transform = '';
            }
        };

        bs.addEventListener('touchstart', onDragStart, { passive: true });
        bs.addEventListener('touchmove', onDragMove, { passive: false });
        bs.addEventListener('touchend', onDragEnd);
        bs.addEventListener('touchcancel', onDragEnd);
        bs.addEventListener('mousedown', onDragStart);
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    }

    // 오프라인 지도 확대 레벨 체크 + 선/면 렌더링 최적화
    map.on('zoomend', updateOfflineButton);
    map.on('moveend', updateOfflineButton);
    map.on('zoomend moveend', scheduleViewportVectorOptimization);
    drawnItems.on('layeradd layerremove', scheduleViewportVectorOptimization);

    setTimeout(updateOfflineButton, 100);
    setTimeout(scheduleViewportVectorOptimization, 120);
}

/* --------------------------------------------------------------------------
   7. 레이어 상세 및 관리 (Layer Detail & Management)
   -------------------------------------------------------------------------- */
/* 7-1. 상세 팝업, 가시성, 이동, 공유 */

/**
 * 숨김/표시 상태에 따라 레이어 상호작용 가능 여부를 동기화합니다.
 */
function setLayerInteractivity(layer, isInteractive) {
    if (layer instanceof L.Marker) {
        layer.options.interactive = isInteractive;
        const pointerEvents = isInteractive ? 'auto' : 'none';
        const applyMarkerPointerEvents = () => {
            if (layer._icon) layer._icon.style.pointerEvents = pointerEvents;
            if (layer._shadow) layer._shadow.style.pointerEvents = pointerEvents;
        };
        if (layer._icon || layer._shadow) applyMarkerPointerEvents();
        else layer.once('add', applyMarkerPointerEvents);
        return;
    }

    const pointerEvents = isInteractive ? 'visiblePainted' : 'none';
    if (layer._path) layer._path.style.pointerEvents = pointerEvents;
    else layer.once('add', () => { if (layer._path) layer._path.style.pointerEvents = pointerEvents; });
}

/**
 * 레이어 설정(채우기/선표시)에 맞는 가시 상태를 계산해 반영합니다.
 */
export function applyLayerVisibilityState(layer, isHidden = layer?.feature?.properties?.isHidden === true) {
    if (!layer || !layer.feature?.properties) return;
    layer.feature.properties.isHidden = isHidden;

    if (isHidden) {
        if (layer instanceof L.Marker) {
            layer.setOpacity(0);
        } else {
            layer.setStyle({ opacity: 0, fillOpacity: 0, stroke: false });
        }
        layer.closePopup();
        setLayerInteractivity(layer, false);
        return;
    }

    if (layer instanceof L.Marker) {
        layer.setOpacity(1);
    } else {
        const fillOpacity = getLayerFillOpacity(layer);
        const stroke = layer.feature?.properties?.customDashArray !== 'none';
        layer.setStyle({ opacity: 1, fillOpacity, stroke });
    }
    setLayerInteractivity(layer, true);
}


/**
 * [함수] updateLayerInfo
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 레이어 타입(점/선/면)에 따라 좌표·거리·면적 표시값을 계산하고,
 *        팝업 이벤트와 바텀시트 동작을 재바인딩해 선택/편집 흐름을 일관되게 유지한다.
 */
export function updateLayerInfo(layer) {
    const memo = layer.feature.properties.memo || "";
    let infoText = "";
    if (layer instanceof L.Marker) {
        const pos = layer.getLatLng();
        if (AppState.coordMode === 2) infoText = "X:" + getTmCoords(pos.lat, pos.lng).x + ", Y:" + getTmCoords(pos.lat, pos.lng).y;
        else if (AppState.coordMode === 1) infoText = "N " + pos.lat.toFixed(4) + "° , E " + pos.lng.toFixed(4) + "°";
        else infoText = convertToDms(pos.lat, 'lat') + ", " + convertToDms(pos.lng, 'lng');
    } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
        infoText = "<b>" + SVG_ICONS.ruler + " 거리:</b> " + (turf.length(layer.toGeoJSON(), { units: 'kilometers' }) * 1000).toFixed(2) + " m";
    } else if (layer instanceof L.Polygon) {
        const areaM2 = turf.area(layer.toGeoJSON());
        const areaPyeong = areaM2 * 0.3025;
        infoText = "<b>" + SVG_ICONS.polygon + " 면적:</b> " + areaM2.toFixed(2) + " ㎡ (" + areaPyeong.toFixed(2) + "평)";
    }

    let popupContent = `<div style="display:flex; align-items:center; gap:6px; margin-bottom:5px;">
        <span style="font-size:16px; color:#3B82F6; font-weight:bold;">${memo}</span>
        <button onclick="editLayerMemo(${layer.feature.properties.id})" title="기록명 수정" style="background:none; border:none; padding:0; cursor:pointer; color:#3B82F6; opacity:0.7; display:flex; align-items:center;">
            <svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:#3B82F6;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
    </div><hr style="margin: 12px 0; border: none; border-top: 1px solid #f0f0f0;">`;

    if (infoText) {
        if (layer instanceof L.Marker) {
            popupContent += `<div style="display:flex; align-items:baseline; font-size: 14px; color: #555; margin-bottom: 15px;"><span class="badge-coord" style="flex-shrink:0; width:36px; display:inline-block; text-align:center;">좌표</span><div style="margin-left: 5px; line-height: 1.5;">${infoText}</div></div>`;
        } else {
            popupContent += `<div style="font-size:14px; color:#666; line-height:1.5; margin-bottom:15px;">${infoText}</div>`;
        }
    }

    const id = layer.feature.properties.id;
    popupContent += `<div class="bottom-sheet-extra"><div class="extra-inner">`;
    const description = layer.feature.properties.description || "";
    if (description) popupContent += `<div style="background:#f8f9fa; padding:8px; border-radius:6px; white-space:pre-wrap; font-size:14px; color:#333; line-height:1.5; margin: 15px 0;">${description}</div>`;

    const photos = layer.feature.properties.photos || [];
    const photoSection = createLayerPhotoSection(id, photos);
    popupContent += photoSection.thumbnailsHtml;

    popupContent += `<div style="${photoSection.gridStyle}">
        ${photoSection.inputElementsHtml}
        <button onclick="editLayerDescription(${id})" class="popup-btn" style="background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;">
            <svg viewBox="0 0 24 24" style="width:14px; height:14px; fill:#555;"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>메모
        </button>
        ${photoSection.actionButtonHtml}
    </div></div></div>`;

    applyLayerVisibilityState(layer, layer.feature?.properties?.isHidden === true);

    layer.off('click').on('click', function (e) {
        if (layer.feature?.properties?.isHidden === true) return;
        if (AppState.currentDrawer || currentEditLayerId !== null) return;
        AppState.isLayerClicked = true;
        setTimeout(() => { AppState.isLayerClicked = false; }, 50);
        if (e && e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        if (layer instanceof L.Marker) map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 17), { duration: 0.5 });
        else map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 19 });
        setCurrentBottomSheetLayerId(id);
        const moreBtn = document.getElementById('bottom-sheet-more-btn');
        if (moreBtn) moreBtn.style.display = 'flex';
        syncBottomSheetHoleMenuForLayer(layer);
        openBottomSheet(memo || '측량 기록', popupContent);
        document.getElementById('bottom-sheet').classList.add('full-open');
    });


    layer.openPopup = function () {
        setCurrentBottomSheetLayerId(id);
        const moreBtn = document.getElementById('bottom-sheet-more-btn');
        if (moreBtn) moreBtn.style.display = 'flex';
        syncBottomSheetHoleMenuForLayer(layer);
        openBottomSheet(memo || '측량 기록', popupContent);
        document.getElementById('bottom-sheet').classList.add('full-open');
        return this;
    };
    layer.closePopup = function () { closeBottomSheet(); return this; };
}
/**
 * [함수] shareLocationText
 * [역할] 공유용 텍스트/링크를 구성해 전달한다.
 * [원리] 현재 좌표 표시 모드에 맞는 공유 문구를 조합하고,
 *        Web Share 지원 여부에 따라 시스템 공유 또는 클립보드 복사로 분기한다.
 */
export function shareLocationText(address, lat, lng) {
    let coordText = `${lat}, ${lng}`;
    if (AppState.coordMode === 2) {
        const tm = getTmCoords(lat, lng);
        coordText = `X: ${tm.x}, Y: ${tm.y}`;
    } else if (AppState.coordMode === 1) {
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

    if (navigator.share) navigator.share(shareData);
    else copyText(`${shareData.text}\n${shareUrl}`);
}

/**
 * [함수] deleteLayerById
 * [역할] 대상을 삭제하고 후속 UI/저장 상태를 정리한다.
 * [원리] 삭제 대상 존재와 사용자 확인을 먼저 검증한 뒤,
 *        컬렉션에서 제거하고 저장·리스트 갱신·선택 상태 정리를 순서대로 수행한다.
 */
export function deleteLayerById(id) {

    if (confirm("정말로 이 기록을 삭제하시겠습니까?")) {
        const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
        if (layer) drawnItems.removeLayer(layer);
        saveToStorage();
        renderSurveyList();
        scheduleViewportVectorOptimization();
        closeBottomSheet();
    }
}

/**
 * [함수] toggleLayerVisibility
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleLayerVisibility(id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (layer) {
        const isHidden = !layer.feature.properties.isHidden;
        applyLayerVisibilityState(layer, isHidden);
        saveToStorage();
        renderSurveyList();
        scheduleViewportVectorOptimization();
    }
}

/**
 * [함수] zoomToLayer
 * [역할] 지도 화면을 대상 위치/범위로 이동·확대한다.
 * [원리] 대상 레이어 타입에 맞춰 flyTo/fitBounds 중 적절한 이동 방식을 선택하고,
 *        이동 완료 타이밍에 맞춰 상세 정보 UI를 열어 탐색 흐름을 이어준다.
 */
export function zoomToLayer(id) {
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
}

/**
 * [함수] updateLayerColor
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updateLayerColor(id, newColor) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    const emoji = layer.feature.properties.customEmoji || null;
    const size = layer.feature.properties.customMarkerSize || 3;
    if (layer instanceof L.Marker) layer.setIcon(createColoredMarkerIcon(newColor, emoji, size));
    else layer.setStyle({ color: newColor, fillColor: newColor });
    layer.feature.properties.customColor = newColor;
    saveToStorage();
}

/* --------------------------------------------------------------------------
   7-2. 스타일 설정 모달 (Style Modal)
   -------------------------------------------------------------------------- */
let currentStyleLayerId = null;
let currentStyleType = null;
let tempStyleColor = '#3B82F6';
let tempLineStyle = 'solid';
let tempLineWeight = 3;
let tempMarkerStyle = '';
let tempMarkerSize = 3;
let tempFillOpacity = 0.2;

function normalizeOpacityValue(value, fallback = 0.2) {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(1, Math.max(0, Math.round(parsed * 10) / 10));
}

function getLayerFillOpacity(layer) {
    if (!(layer instanceof L.Polygon)) return 0;

    const props = layer.feature?.properties || {};
    if (Number.isFinite(Number(props.customFillOpacity))) {
        return normalizeOpacityValue(props.customFillOpacity);
    }
    if (props.customFill === false) return 0;
    if (props.customFill === true) return 0.2;
    return AppState.isPolygonFill ? 0.2 : 0;
}

/**
 * [함수] openStyleModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openStyleModal(id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    currentStyleLayerId = id;
    const props = layer.feature.properties || {};

    tempStyleColor = props.customColor || (layer instanceof L.Marker ? '#FF0000' : '#3388ff');
    tempLineStyle = props.customDashArray === 'none' ? 'none' : (props.customDashArray ? 'dashed' : 'solid');
    tempLineWeight = Number.isFinite(Number(props.customWeight)) ? Math.min(5, Math.max(1, parseInt(props.customWeight, 10))) : 3;
    tempMarkerStyle = props.customEmoji || '';
    tempMarkerSize = props.customMarkerSize || 3;

    const overlay = document.getElementById('style-modal-overlay');
    const lineSec = document.getElementById('style-line-section');
    const lineWeightSec = document.getElementById('style-line-weight-section');
    const markerSec = document.getElementById('style-marker-section');
    const polySec = document.getElementById('style-polygon-section');
    const markerSizeSec = document.getElementById('style-marker-size-section');

    if (layer instanceof L.Marker) {
        currentStyleType = 'marker';
        if (lineSec) lineSec.style.display = 'none';
        if (lineWeightSec) lineWeightSec.style.display = 'none';
        if (markerSec) markerSec.style.display = 'block';
        if (markerSizeSec) markerSizeSec.style.display = 'block';
        if (polySec) polySec.style.display = 'none';
    } else if (layer instanceof L.Polygon) {
        currentStyleType = 'polygon';
        if (lineSec) lineSec.style.display = 'block';
        if (lineWeightSec) lineWeightSec.style.display = 'block';
        if (markerSec) markerSec.style.display = 'none';
        if (markerSizeSec) markerSizeSec.style.display = 'none';
        if (polySec) polySec.style.display = 'block';
        tempFillOpacity = getLayerFillOpacity(layer);
    } else {
        currentStyleType = 'line';
        if (lineSec) lineSec.style.display = 'block';
        if (lineWeightSec) lineWeightSec.style.display = 'block';
        if (markerSec) markerSec.style.display = 'none';
        if (markerSizeSec) markerSizeSec.style.display = 'none';
        if (polySec) polySec.style.display = 'none';
    }

    // 컬러피커 초기값 동기화
    const colorPicker = document.getElementById('style-custom-color');
    if (colorPicker && tempStyleColor.startsWith('#')) {
        colorPicker.value = tempStyleColor.substring(0, 7);
    }

    updateStyleModalUI();

    if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('visible'), 10);
    }
}

/**
 * [함수] closeStyleModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeStyleModal() {
    const overlay = document.getElementById('style-modal-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        setTimeout(() => { if (!overlay.classList.contains('visible')) overlay.style.display = 'none'; }, 300);
    }
}

/**
 * [함수] updateStyleModalUI
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
function updateStyleModalUI() {
    document.querySelectorAll('#style-color-palette .color-circle').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === tempStyleColor);
    });
    document.querySelectorAll('#style-line-choices .style-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.style === tempLineStyle);
    });
    document.querySelectorAll('#style-marker-choices .emoji-btn').forEach(btn => {
        btn.classList.toggle('selected', (btn.dataset.emoji || '') === tempMarkerStyle);
    });
    const sizeInput = document.getElementById('style-marker-size');
    const sizeLabel = document.getElementById('style-marker-size-label');
    if (sizeInput) sizeInput.value = tempMarkerSize;
    if (sizeLabel) sizeLabel.innerText = tempMarkerSize;

    const weightInput = document.getElementById('style-line-weight');
    const weightLabel = document.getElementById('style-line-weight-label');
    if (weightInput) weightInput.value = tempLineWeight;
    if (weightLabel) weightLabel.innerText = tempLineWeight;

    const fillOpacityInput = document.getElementById('style-fill-opacity');
    const fillOpacityLabel = document.getElementById('style-fill-opacity-label');
    if (fillOpacityInput) fillOpacityInput.value = tempFillOpacity;
    if (fillOpacityLabel) fillOpacityLabel.innerText = tempFillOpacity.toFixed(1).replace(/\.0$/, '');
}

/**
 * [함수] selectStyleColor
 * [역할] 선택값을 임시 상태로 반영하고 UI를 동기화한다.
 * [원리] 사용자 선택값을 임시 상태(temp*)에 기록하고,
 *        선택 UI를 다시 칠해 현재 선택 항목이 시각적으로 즉시 반영되게 한다.
 */
export function selectStyleColor(color) {
    tempStyleColor = color;
    updateStyleModalUI();
    if (color && color.startsWith('#')) {
        const picker = document.getElementById('style-custom-color');
        if (picker) picker.value = color.substring(0, 7);
    }
}

/**
 * [함수] selectLineStyle
 * [역할] 선택값을 임시 상태로 반영하고 UI를 동기화한다.
 * [원리] 사용자 선택값을 임시 상태(temp*)에 기록하고,
 *        선택 UI를 다시 칠해 현재 선택 항목이 시각적으로 즉시 반영되게 한다.
 */
export function selectLineStyle(style) {
    tempLineStyle = style;
    updateStyleModalUI();
}

/**
 * [함수] updateLineWeightLabel
 * [역할] 선 굵기 슬라이더 값을 화면 라벨에 반영한다.
 * [원리] 임시 선택값을 1~5 범위 숫자로 정규화한 뒤 표시값과 상태를 함께 갱신한다.
 */
export function updateLineWeightLabel(val) {
    tempLineWeight = Math.min(5, Math.max(1, parseInt(val, 10) || 3));
    const weightLabel = document.getElementById('style-line-weight-label');
    if (weightLabel) weightLabel.innerText = tempLineWeight;
}

/**
 * [함수] selectLineWeight
 * [역할] 선택한 선 굵기를 임시 상태로 저장한다.
 * [원리] 슬라이더 입력값을 1~5 범위로 제한해 적용 시 레이어 스타일에 사용한다.
 */
export function selectLineWeight(val) {
    tempLineWeight = Math.min(5, Math.max(1, parseInt(val, 10) || 3));
    updateStyleModalUI();
}

/**
 * [함수] updateFillOpacityLabel
 * [역할] 면 투명도 슬라이더 값을 화면 라벨에 반영한다.
 * [원리] 입력값을 0~1 범위의 0.1 단위 값으로 정규화해 임시 상태와 라벨을 함께 갱신한다.
 */
export function updateFillOpacityLabel(val) {
    tempFillOpacity = normalizeOpacityValue(val, AppState.isPolygonFill ? 0.2 : 0);
    const fillOpacityLabel = document.getElementById('style-fill-opacity-label');
    if (fillOpacityLabel) fillOpacityLabel.innerText = tempFillOpacity.toFixed(1).replace(/\.0$/, '');
}

/**
 * [함수] selectFillOpacity
 * [역할] 선택한 면 투명도를 임시 상태로 저장한다.
 * [원리] 슬라이더 입력값을 정규화한 뒤 스타일 모달 UI와 적용 대기 상태를 동기화한다.
 */
export function selectFillOpacity(val) {
    tempFillOpacity = normalizeOpacityValue(val, AppState.isPolygonFill ? 0.2 : 0);
    updateStyleModalUI();
}

/**
 * [함수] selectMarkerStyle
 * [역할] 선택값을 임시 상태로 반영하고 UI를 동기화한다.
 * [원리] 사용자 선택값을 임시 상태(temp*)에 기록하고,
 *        선택 UI를 다시 칠해 현재 선택 항목이 시각적으로 즉시 반영되게 한다.
 */
export function selectMarkerStyle(emoji) {
    tempMarkerStyle = emoji;
    updateStyleModalUI();
}

/**
 * [함수] updateMarkerSizeLabel
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updateMarkerSizeLabel(val) {
    const sizeLabel = document.getElementById('style-marker-size-label');
    if (sizeLabel) sizeLabel.innerText = val;
}

/**
 * [함수] selectMarkerSize
 * [역할] 선택값을 임시 상태로 반영하고 UI를 동기화한다.
 * [원리] 사용자 선택값을 임시 상태(temp*)에 기록하고,
 *        선택 UI를 다시 칠해 현재 선택 항목이 시각적으로 즉시 반영되게 한다.
 */
export function selectMarkerSize(val) {
    tempMarkerSize = parseInt(val, 10);
}

/**
 * [함수] applyStyleSettings
 * [역할] 임시 설정값을 실제 상태와 화면에 확정 반영한다.
 * [원리] 임시 상태로 보관한 설정값을 실제 데이터/레이어 속성에 커밋한 뒤,
 *        저장과 목록 재렌더를 수행해 적용 결과를 전체 UI에 동기화한다.
 */
export function applyStyleSettings() {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === currentStyleLayerId);
    if (!layer) return;

    const props = layer.feature.properties;
    props.customColor = tempStyleColor;

    if (currentStyleType === 'marker') {
        props.customEmoji = tempMarkerStyle;
        props.customMarkerSize = tempMarkerSize;
        layer.setIcon(createColoredMarkerIcon(tempStyleColor, tempMarkerStyle, tempMarkerSize));
    } else {
        props.customWeight = tempLineWeight;

        if (tempLineStyle === 'dashed') props.customDashArray = '5, 5';
        else if (tempLineStyle === 'none') props.customDashArray = 'none';
        else props.customDashArray = null;

        if (currentStyleType === 'polygon') {
            props.customFillOpacity = tempFillOpacity;
            delete props.customFill;
        }

        layer.setStyle({
            color: tempStyleColor,
            fillColor: tempStyleColor,
            weight: tempLineWeight,
            dashArray: props.customDashArray === 'none' ? null : props.customDashArray,
            stroke: props.customDashArray !== 'none',
            fillOpacity: currentStyleType === 'polygon' ? tempFillOpacity : 0,
            opacity: 0.8
        });
    }

    saveToStorage();
    renderSurveyList();
    scheduleViewportVectorOptimization();
    closeStyleModal();
}


/* --------------------------------------------------------------------------
   8. 오프라인 지도 기능 (Offline Map)
   -------------------------------------------------------------------------- */
/**
 * [함수] updateOfflineButton
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updateOfflineButton() {
    const btn = document.getElementById('btn-offline-map');
    const textSpan = document.getElementById('btn-offline-map-text');
    if (!btn || !textSpan) return;

    textSpan.innerText = '다운로드';

    if (map.getZoom() < 15) {
        btn.disabled = true;
        btn.style.backgroundColor = '#ccc';
    } else {
        btn.disabled = false;
        btn.style.backgroundColor = '#007bff';
    }
}

/**
 * [함수] downloadOfflineMap
 * [역할] 현재 데이터를 파일 형태로 내려받게 한다.
 * [원리] 현재 지도 범위를 패딩 확장해 타일 URL 목록을 만들고 Cache Storage에 청크 저장하며,
 *        진행률 모달·오류 처리·버튼 잠금/해제를 함께 관리해 다운로드 과정을 시각화한다.
 */
export async function downloadOfflineMap() {
    const zoom = map.getZoom();
    if (zoom < 15) return;

    const btn = document.getElementById('btn-offline-map');
    if (btn) btn.disabled = true;

    const minZoom = 15;
    const maxZoom = 18;
    // 현재 화면 바운스(Bounds)에 약 20%의 여유영역(패딩)을 추가하여 
    // 확대하거나 살짝 이동했을 때 주변부가 누락되는 현상을 방지합니다.
    const expandedBounds = map.getBounds().pad(0.2);
    const urls = getOfflineMapUrls(expandedBounds, minZoom, maxZoom);

    // 약 25KB 당 계산 (MB)
    const mbSize = (urls.length * 25 / 1024).toFixed(1);

    if (!confirm(`총 ${urls.length}개의 파일 (약 ${mbSize} MB)을 다운로드합니다. 데이터가 소모됩니다.\n진행하시겠습니까?`)) {
        if (btn) btn.disabled = false;
        return;
    }

    const overlay = document.getElementById('offline-download-modal-overlay');
    const progressEl = document.getElementById('offline-download-progress');
    const totalEl = document.getElementById('offline-download-total');

    if (overlay) {
        overlay.style.display = 'flex';
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
    }
    if (totalEl) totalEl.innerText = urls.length;
    if (progressEl) progressEl.innerText = '0';

    try {
        const cache = await caches.open('F-field-map-v1');
        let count = 0;

        // chunk fetch
        const chunkSize = 10;
        for (let i = 0; i < urls.length; i += chunkSize) {
            const chunk = urls.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (url) => {
                try {
                    const response = await fetch(url, { mode: 'cors' });
                    if (response.ok || response.type === 'opaque') {
                        await cache.put(url, response.clone());
                    }
                } catch (e) {
                    console.error("Tile fetch error:", url, e);
                } finally {
                    count++;
                    if (progressEl) progressEl.innerText = count;
                }
            }));
        }

        alert('오프라인 지도 저장이 완료되었습니다.');
    } catch (e) {
        console.error('Offline map download failed:', e);
        alert('다운로드 중 오류가 발생했습니다.');
    } finally {
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (!overlay.classList.contains('visible')) overlay.style.display = 'none';
            }, 200);
        }
        if (btn) btn.disabled = false;
    }
}

/* --------------------------------------------------------------------------
   9. 런타임 초기화 및 전역 바인딩 (Runtime Bootstrap)
   -------------------------------------------------------------------------- */

/**
 * [함수] bindUiActionsToWindow
 * [역할] 함수와 전역/이벤트 엔트리포인트를 연결한다.
 * [원리] HTML 인라인 이벤트에서 호출되는 함수를 Object.assign으로 한 번에 등록해,
 *        전역 바인딩 누락을 줄이고 UI 엔트리포인트를 단일 블록에서 관리한다.
 */
function bindUiActionsToWindow() {
    Object.assign(window, {
        openSidebar,
        closeSidebar,
        switchSearchTab,
        renderCoordSearchInputs,
        switchSidebarTab,
        unlockHiddenLayers,
        toggleSearchBox,
        executeSearch,
        closeSearchResult,
        showHistoryPanel,
        toggleHistorySave,
        clearHistoryAll,
        deleteHistoryItem,
        closeBottomSheet,
        toggleBottomSheetState,
        toggleBottomSheetMoreMenu,
        handleBottomSheetEdit,
        handleBottomSheetStyle,
        handleBottomSheetBringToFront,
        handleBottomSheetBringForward,
        handleBottomSheetSendToBack,
        handleBottomSheetSendBackward,
        handleBottomSheetHole,
        handleBottomSheetHoleFill,
        handleBottomSheetDelete,
        editLayerDescription,
        closeMemoModal,
        saveMemoAction,
        editLayerMemo,
        createNewProject,
        createNewProjectAndMove,
        editProjectName,
        deleteCurrentProject,
        renderProjectList,
        openMoveProjectModal,
        openMoveSelectionModal,
        closeMoveProjectModal,
        startSleepMode,
        unlockSleepMode,
        toggleAccordion,
        toggleMoreMenu,
        toggleProjectMenu,
        openPhotoSelectMenu,
        closePhotoSelectMenu,
        handlePhotoMenuAction,
        processPhotoFiles,
        deletePhoto,
        openPhotoModal,
        nextPhoto,
        prevPhoto,
        downloadCurrentPhoto,
        closePhotoModal,
        openNavModal,
        closeNavModal,
        executeNavigation,
        showInfoPopup,
        fetchAndHighlightBoundary,
        copyText,
        deleteLayerById,
        toggleLayerVisibility,
        zoomToLayer,
        updateLayerColor,
        openLocationActionModal,
        closeLocationActionModal,
        openSettingsModal,
        closeSettingsModal,
        shareLocationText,
        openContextMenu,
        handleMenuAction,
        downloadOfflineMap,
        openStyleModal,
        closeStyleModal,
        selectStyleColor,
        selectLineStyle,
        updateLineWeightLabel,
        selectLineWeight,
        updateFillOpacityLabel,
        selectFillOpacity,
        selectMarkerStyle,
        updateMarkerSizeLabel,
        selectMarkerSize,
        applyStyleSettings,
        openSortModal,
        closeSortModal,
        applySortSetting,
        openProjectSortModal,
        closeProjectSortModal,
        applyProjectSortSetting,
        toggleRecordFab,
        closeRecordFab,
    });
}

/**
 * [함수] initializeUiRuntime
 * [역할] 초기 이벤트와 기본 상태를 설정한다.
 * [원리] 초기화 가드 플래그로 중복 실행을 막고,
 *        검색 설정 로드 후 전역 액션 바인딩 순서로 런타임 시작 상태를 확정한다.
 */
function initializeUiRuntime() {
    if (isUiRuntimeInitialized) return;
    isUiRuntimeInitialized = true;

    initSearchSettings();
    bindUiActionsToWindow();
}

initializeUiRuntime();
