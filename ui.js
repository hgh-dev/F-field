/* ==========================================================================
   [모듈] UI 매니저 (ui.js)
   [역할] 사이드바/바텀시트/모달/목록 렌더링 등 앱의 화면 상호작용을 총괄 제어
   [입력] AppState, 지도(map), 레이어(drawnItems), 로컬 저장소(localStorage)
   [출력] DOM 갱신, 지도 이동/스타일 변경, 전역(window) UI 액션 바인딩
   ========================================================================== */
import { VWORLD_API_KEY, SEARCH_HISTORY_KEY, SEARCH_SETTING_KEY, SVG_ICONS } from './config.js';
import { AppState } from './state.js';
import { map, vworldBase, vworldSatellite, vworldHybrid, esriSatelliteLayer, vworldLxLayer, vworldContinuousLayer, nasGukLayer, toggleOverlay, updateLayerOrder, getOfflineMapUrls } from './map.js';
import { drawnItems, startDraw, currentEditLayerId, completeDrawing, cancelDrawing, enableSingleLayerEdit } from './draw.js';
import { getTimestampString, getRandomColor, createColoredMarkerIcon, copyText, getTmCoords, getWgs84FromTm, convertToDms, dmsToDecimal, getShortAddress, resizeImage, parseNationalPointNumber } from './utils.js';
import { saveToStorage, loadCurrentProjectFeatures, exportSingleLayer } from './data.js';


// --- 전역 UI 상태 ---
export let isSearchHistoryEnabled = true;
export let currentBottomSheetLayerId = null;
export let currentMemoLayerId = null;
export let moveTargetLayerIds = [];
export let navTarget = { name: '', lat: 0, lng: 0 };
export let currentPhotoList = [];
export let currentPhotoIndex = 0;
export let currentPhotoLayerId = null;
export let currentContextId = null;
let isUiRuntimeInitialized = false;

/**
 * [함수] initSearchSettings
 * [역할] 초기 이벤트와 기본 상태를 설정한다.
 * [원리] 로컬 스토리지의 SEARCH_SETTING_KEY 값을 읽고,
 *        문자열 true/false를 앱 전역 검색기록 플래그로 변환해 초기 상태를 맞춘다.
 */
function initSearchSettings() {
    const setting = localStorage.getItem(SEARCH_SETTING_KEY);
    if (setting !== null) { isSearchHistoryEnabled = (setting === 'true'); }
}

/**
 * [함수] setIsSearchHistoryEnabled
 * [역할] 외부 입력값으로 내부 상태를 설정한다.
 * [원리] 외부에서 전달된 값을 내부 상태 변수에 직접 반영해,
 *        후속 UI 로직이 같은 기준 상태를 참조하도록 만든다.
 */
export function setIsSearchHistoryEnabled(val) { isSearchHistoryEnabled = val; }
/**
 * [함수] setCurrentBottomSheetLayerId
 * [역할] 외부 입력값으로 내부 상태를 설정한다.
 * [원리] 외부에서 전달된 값을 내부 상태 변수에 직접 반영해,
 *        후속 UI 로직이 같은 기준 상태를 참조하도록 만든다.
 */
export function setCurrentBottomSheetLayerId(id) { currentBottomSheetLayerId = id; }

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
    overlay.style.display = 'block';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
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
   2. 검색 및 위치 관리 (Search & Location)
   -------------------------------------------------------------------------- */
/* 2-1. 검색창 제어 및 API 호출 */

/**
 * [함수] toggleSearchBox
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleSearchBox() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    const box = document.getElementById('search-container');
    if (box.style.display === 'flex' || box.style.display === 'block') { // index.html 수정을 위해 조건 완화
        box.style.display = 'none';
        document.getElementById('history-panel').style.display = 'none';
        const resultPanel = document.getElementById('search-result-panel');
        if (resultPanel) resultPanel.style.display = 'none';
    } else {
        box.style.display = 'flex'; // 혹은 탭이 flex-direction: column
        renderCoordSearchInputs();

        // 기존 탭 상태에 맞춰 포커스 (기본 주소)
        const activeTab = document.querySelector('.search-tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'national') {
            document.getElementById('search-input-national').focus();
        } else if (activeTab && activeTab.dataset.tab === 'coord') {
            // coord 내의 첫번째 input 포커스
            const firstInput = document.querySelector('#search-coord-inputs input');
            if (firstInput) firstInput.focus();
        } else {
            document.getElementById('search-input-address').focus();
        }
    }
}

/**
 * [함수] switchSearchTab
 * [역할] 활성 대상(탭/모드)을 바꾸고 연관 UI를 동기화한다.
 * [원리] 선택된 탭/모드 값을 기준으로 active 클래스와 표시 대상을 재설정하고,
 *        필요한 후속 렌더링 함수를 호출해 화면과 상태가 같은 기준을 보게 만든다.
 */
export function switchSearchTab(tabId) {
    document.querySelectorAll('.search-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) btn.classList.add('active');
    });

    document.querySelectorAll('.search-tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    const targetContent = document.getElementById('search-content-' + tabId);
    if (targetContent) {
        targetContent.classList.add('active');
        targetContent.style.display = 'flex';
    }

    if (tabId === 'address') {
        const input = document.getElementById('search-input-address');
        if (input) input.focus();
        showHistoryPanel();
    } else if (tabId === 'national') {
        const input = document.getElementById('search-input-national');
        if (input) input.focus();
        document.getElementById('search-result-panel').style.display = 'none';
        showHistoryPanel();
    } else if (tabId === 'coord') {
        renderCoordSearchInputs();
        document.getElementById('history-panel').style.display = 'none';
        document.getElementById('search-result-panel').style.display = 'none';
    }
}

/**
 * [함수] renderCoordSearchInputs
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 원본 데이터(AppState/레이어 컬렉션)를 정렬·필터링해 표시 순서를 정하고,
 *        DOM 노드 또는 HTML을 재구성해 현재 상태를 화면에 다시 그린다.
 */
export function renderCoordSearchInputs() {
    const container = document.getElementById('search-coord-inputs');
    if (!container) return;
    container.innerHTML = "";
    if (AppState.coordMode === 0) { // DMS
        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:45px; text-align:center;">위도(N)</span>
                <input type="number" id="coord-lat-d" placeholder="37" style="flex:1;"><span style="font-size:13px; font-weight:bold;">°</span>
                <input type="number" id="coord-lat-m" placeholder="14" style="flex:1;"><span style="font-size:13px; font-weight:bold;">'</span>
                <input type="number" id="coord-lat-s" placeholder="44.80" style="flex:1;"><span style="font-size:13px; font-weight:bold;">"</span>
            </div>
            <div style="display:flex; align-items:center; gap:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:45px; text-align:center;">경도(E)</span>
                <input type="number" id="coord-lng-d" placeholder="126" style="flex:1;"><span style="font-size:13px; font-weight:bold;">°</span>
                <input type="number" id="coord-lng-m" placeholder="57" style="flex:1;"><span style="font-size:13px; font-weight:bold;">'</span>
                <input type="number" id="coord-lng-s" placeholder="35.45" style="flex:1;"><span style="font-size:13px; font-weight:bold;">"</span>
            </div>
        `;
    } else if (AppState.coordMode === 1) { // Decimal
        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:45px; text-align:center;">위도(N)</span>
                <input type="number" step="any" id="coord-lat-dec" placeholder="37.245778" style="flex:1;">
            </div>
            <div style="display:flex; align-items:center; gap:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:45px; text-align:center;">경도(E)</span>
                <input type="number" step="any" id="coord-lng-dec" placeholder="126.959847" style="flex:1;">
            </div>
        `;
    } else if (AppState.coordMode === 2) { // TM
        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:25px; text-align:center;">X</span>
                <input type="number" step="any" id="coord-x-tm" placeholder="196437.47" style="flex:1;">
            </div>
            <div style="display:flex; align-items:center; gap:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:25px; text-align:center;">Y</span>
                <input type="number" step="any" id="coord-y-tm" placeholder="516290.12" style="flex:1;">
            </div>
        `;
    }
}

/**
 * [함수] callVworldSearchApi
 * [역할] 외부 API 호출을 래핑해 비동기 결과를 반환한다.
 * [원리] JSONP 콜백 이름을 동적으로 만들고 script 요청을 발행한 뒤,
 *        응답 콜백에서 정제된 결과 배열을 Promise resolve로 반환한다.
 */
export function callVworldSearchApi(query, type) {
    return new Promise(resolve => {
        const callbackName = 'vworld_search_' + type + '_' + Math.floor(Math.random() * 100000);
        window[callbackName] = function (data) {
            delete window[callbackName];
            document.getElementById(callbackName)?.remove();
            if (data.response.status === "OK" && data.response.result && data.response.result.items.length > 0) {
                const items = data.response.result.items.map(item => ({ ...item, searchType: type }));
                resolve(items);
            } else {
                resolve([]);
            }
        };
        const script = document.createElement('script');
        script.id = callbackName;
        script.onerror = () => resolve([]);
        script.src = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=50&page=1&query=${encodeURIComponent(query)}&type=${type}&format=json&errorformat=json&key=${VWORLD_API_KEY}&callback=${callbackName}`;
        document.body.appendChild(script);
    });
}

/**
 * [함수] callVworldCoordApi
 * [역할] 외부 API 호출을 래핑해 비동기 결과를 반환한다.
 * [원리] JSONP 콜백 이름을 동적으로 만들고 script 요청을 발행한 뒤,
 *        응답 콜백에서 정제된 결과 배열을 Promise resolve로 반환한다.
 */
export function callVworldCoordApi(query, type) {
    return new Promise(resolve => {
        const callbackName = 'vworld_coord_' + Math.floor(Math.random() * 100000);
        window[callbackName] = function (data) {
            delete window[callbackName];
            document.getElementById(callbackName)?.remove();
            if (data.response.status === "OK" && data.response.result) {
                const coordResult = data.response.result;
                resolve([{
                    point: coordResult.point,
                    title: query,
                    address: {
                        road: (type === 'ROAD' && coordResult.refined) ? coordResult.refined.text : "",
                        parcel: (type === 'PARCEL' && coordResult.refined) ? coordResult.refined.text : ""
                    },
                    searchType: type
                }]);
            } else {
                resolve([]);
            }
        };
        const script = document.createElement('script');
        script.id = callbackName;
        script.onerror = () => resolve([]);
        script.src = `https://api.vworld.kr/req/address?service=address&request=getCoord&version=2.0&crs=epsg:4326&address=${encodeURIComponent(query)}&refine=true&simple=false&format=json&type=${type || 'PARCEL'}&key=${VWORLD_API_KEY}&callback=${callbackName}`;
        document.body.appendChild(script);
    });
}

/**
 * [함수] executeSearch
 * [역할] 사용자 선택에 따라 실제 동작(이동/저장/연결)을 수행한다.
 * [원리] 검색 타입(주소/국가지점번호/좌표)에 따라 입력 파싱 경로를 분기하고,
 *        VWorld 조회 결과를 병합·중복제거·정렬한 뒤 지도 이동과 결과 패널 표시를 제어한다.
 */
export async function executeSearch(typeStr = 'address') {
    if (typeStr === 'national') {
        const query = document.getElementById('search-input-national').value;
        if (!query) return;

        if (isSearchHistoryEnabled) { addToHistory(query); }
        document.getElementById('history-panel').style.display = 'none';

        const coords = parseNationalPointNumber(query);
        if (coords) {
            const result = {
                point: { x: coords[0], y: coords[1] },
                title: "국가지점번호",
                address: { road: query, parcel: "" }
            };
            moveToSearchResult(result);
            closeSearchResult();
        } else {
            alert("잘못된 국가지점번호 형식입니다.");
        }
        return;
    } else if (typeStr === 'coord') {
        let lat, lng;
        if (AppState.coordMode === 0) {
            const latD = document.getElementById('coord-lat-d').value;
            const latM = document.getElementById('coord-lat-m').value;
            const latS = document.getElementById('coord-lat-s').value;
            const lngD = document.getElementById('coord-lng-d').value;
            const lngM = document.getElementById('coord-lng-m').value;
            const lngS = document.getElementById('coord-lng-s').value;
            if (!latD || !lngD) return alert("위도, 경도(도) 값을 입력해주세요.");
            lat = dmsToDecimal(latD, latM || 0, latS || 0, 'N');
            lng = dmsToDecimal(lngD, lngM || 0, lngS || 0, 'E');
        } else if (AppState.coordMode === 1) {
            lat = parseFloat(document.getElementById('coord-lat-dec').value);
            lng = parseFloat(document.getElementById('coord-lng-dec').value);
            if (isNaN(lat) || isNaN(lng)) return alert("위도, 경도 값을 입력해주세요.");
        } else if (AppState.coordMode === 2) {
            const x = parseFloat(document.getElementById('coord-x-tm').value);
            const y = parseFloat(document.getElementById('coord-y-tm').value);
            if (isNaN(x) || isNaN(y)) return alert("X, Y 좌표를 입력해주세요.");
            const wgs = getWgs84FromTm(x, y);
            lat = wgs.lat;
            lng = wgs.lng;
        }

        const result = {
            point: { x: lng, y: lat },
            title: "입력 좌표",
            address: { road: "", parcel: "" }
        };
        moveToSearchResult(result);
        closeSearchResult();
        return;
    }

    // address type
    const queryEl = document.getElementById('search-input-address');
    let query = queryEl ? queryEl.value : "";

    if (!query) return;

    if (isSearchHistoryEnabled) { addToHistory(query); }
    document.getElementById('history-panel').style.display = 'none';
    if (queryEl) queryEl.value = query;

    try {
        const [addrResults, placeResults, roadResults, parcelResults] = await Promise.all([
            callVworldSearchApi(query, 'ADDRESS'),
            callVworldSearchApi(query, 'PLACE'),
            callVworldCoordApi(query, 'ROAD'),
            callVworldCoordApi(query, 'PARCEL')
        ]);

        const combined = [...addrResults, ...placeResults, ...roadResults, ...parcelResults];

        // 중복 좌표 제거
        const seen = new Set();
        const uniqueItems = [];
        for (const item of combined) {
            const hash = `${Number(item.point.x).toFixed(6)},${Number(item.point.y).toFixed(6)}`;
            if (!seen.has(hash)) {
                seen.add(hash);
                uniqueItems.push(item);
            }
        }

        // 카테고리 우선순위 (1: 주소, 2: 지번, 3: 도로명, 4: 장소)
        const typeOrder = { 'ADDRESS': 1, 'PARCEL': 2, 'ROAD': 3, 'PLACE': 4 };

        // 우선순위에 따라 정렬하되, 동일 순위 내에서는 검색어가 포함된 항목을 상단으로 올림
        uniqueItems.sort((a, b) => {
            const orderA = typeOrder[a.searchType] || 99;
            const orderB = typeOrder[b.searchType] || 99;

            if (orderA !== orderB) {
                return orderA - orderB;
            }

            const aParcel = a.address?.parcel || "";
            const bParcel = b.address?.parcel || "";
            const aRoad = a.address?.road || "";
            const bRoad = b.address?.road || "";

            const aMatch = aParcel.includes(query) || aRoad.includes(query) ? 1 : 0;
            const bMatch = bParcel.includes(query) || bRoad.includes(query) ? 1 : 0;
            return bMatch - aMatch;
        });

        if (uniqueItems.length > 0) {
            handleSearchResults(uniqueItems);
        } else {
            alert("검색 결과가 없습니다.\n정확한 주소를 입력해보세요.");
        }
    } catch (e) {
        console.error("검색 중 오류 발생:", e);
        alert("검색 중 오류가 발생했습니다.");
    }
}

/**
 * [함수] handleSearchResults
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 이벤트 컨텍스트를 해석해 예외/가드 조건을 먼저 처리하고,
 *        조건에 맞는 작업 함수로 분기해 사용자 의도에 맞는 동작을 실행한다.
 */
function handleSearchResults(items) {
    if (items.length === 1) {
        moveToSearchResult(items[0]);
    } else {
        renderSearchResultList(items);
        document.getElementById('search-result-panel').style.display = 'block';
    }
}

/**
 * [함수] renderSearchResultList
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 원본 데이터(AppState/레이어 컬렉션)를 정렬·필터링해 표시 순서를 정하고,
 *        DOM 노드 또는 HTML을 재구성해 현재 상태를 화면에 다시 그린다.
 */
export function renderSearchResultList(items) {
    const listEl = document.getElementById('search-result-list');
    if (!listEl) return;
    listEl.innerHTML = "";
    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'search-result-item';
        const roadAddr = item.address?.road || "";
        const parcelAddr = item.address?.parcel || "";
        const title = item.title || roadAddr || parcelAddr;
        let html = `<div class="search-result-title">`;
        if (item.searchType === 'ADDRESS') {
            html += `<span class="badge" style="background:#9c27b0;color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;margin-right:4px;">주소</span>`;
        } else if (item.searchType === 'ROAD') {
            html += `<span class="badge" style="background:#2196f3;color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;margin-right:4px;">도로명</span>`;
        } else if (item.searchType === 'PLACE') {
            html += `<span class="badge" style="background:#4caf50;color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;margin-right:4px;">장소</span>`;
        } else if (item.searchType === 'PARCEL') {
            html += `<span class="badge" style="background:#ff9800;color:#fff;padding:2px 4px;border-radius:3px;font-size:11px;margin-right:4px;">지번</span>`;
        }
        html += `${title}</div>`;
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

/**
 * [함수] closeSearchResult
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeSearchResult() {
    const panel = document.getElementById('search-result-panel');
    if (panel) panel.style.display = 'none';
    const input = document.getElementById('search-input-address');
    if (input) input.focus();
}

/**
 * [함수] moveToSearchResult
 * [역할] 대상을 다른 위치/컨텍스트로 이동시킨다.
 * [원리] 대상 좌표 또는 엔티티를 기준으로 이동 목적을 계산하고,
 *        지도 위치 또는 데이터 소속을 실제로 이동한 뒤 연관 UI를 정리한다.
 */
function moveToSearchResult(result) {
    const point = result.point;
    map.flyTo([point.y, point.x], 16, { duration: 1.5 });
    showInfoPopup(point.y, point.x);
    fetchAndHighlightBoundary(point.x, point.y);

    // 검색해서 목적지 이동 시, 열려있던 검색창과 패널들 자동으로 닫기
    const box = document.getElementById('search-container');
    if (box && (box.style.display === 'flex' || box.style.display === 'block')) {
        box.style.display = 'none';
        const historyPanel = document.getElementById('history-panel');
        if (historyPanel) historyPanel.style.display = 'none';
        const resultPanel = document.getElementById('search-result-panel');
        if (resultPanel) resultPanel.style.display = 'none';
    }
}

/* 2-3. 검색 기록 관리 */
/**
 * [함수] getActiveHistoryKey
 * [역할] 현재 조건에 맞는 값을 조회해 반환한다.
 * [원리] 현재 활성 탭/상태를 기준으로 조회 키를 계산하고,
 *        해당 키에 대응하는 값을 읽어 호출자에 반환한다.
 */
function getActiveHistoryKey() {
    const activeTab = document.querySelector('.search-tab-btn.active');
    const tabId = activeTab ? activeTab.dataset.tab : 'address';
    return tabId === 'national' ? SEARCH_HISTORY_KEY + '_national' : SEARCH_HISTORY_KEY;
}

/**
 * [함수] getHistory
 * [역할] 현재 조건에 맞는 값을 조회해 반환한다.
 * [원리] 현재 활성 탭/상태를 기준으로 조회 키를 계산하고,
 *        해당 키에 대응하는 값을 읽어 호출자에 반환한다.
 */
export function getHistory() { const json = localStorage.getItem(getActiveHistoryKey()); return json ? JSON.parse(json) : []; }
/**
 * [함수] saveHistory
 * [역할] 변경된 내용을 저장소 또는 상태에 기록한다.
 * [원리] 현재 편집 대상과 입력값 유효성을 확인한 뒤,
 *        속성 반영 후 저장소 업데이트와 관련 UI 리렌더를 함께 실행한다.
 */
export function saveHistory(list) { localStorage.setItem(getActiveHistoryKey(), JSON.stringify(list)); }

/**
 * [함수] addToHistory
 * [역할] 새 항목을 중복 규칙에 맞게 추가한다.
 * [원리] 기존 목록에서 중복 여부를 정리한 뒤 새 항목을 선두에 추가하고,
 *        최대 개수 제한을 적용해 기록 데이터가 과도하게 커지지 않도록 유지한다.
 */
export function addToHistory(keyword) {
    let list = getHistory();
    list = list.filter(item => item !== keyword);
    list.unshift(keyword);
    if (list.length > 10) list = list.slice(0, 10);
    saveHistory(list);
}

/**
 * [함수] toggleHistorySave
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleHistorySave(checked) {
    isSearchHistoryEnabled = checked;
    localStorage.setItem(SEARCH_SETTING_KEY, checked);
    const list = document.getElementById('history-list');
    const clearBtn = document.querySelector('.btn-clear-history');
    if (list) list.style.display = checked ? 'block' : 'none';
    if (clearBtn) clearBtn.style.display = checked ? 'inline-block' : 'none';
}

/**
 * [함수] clearHistoryAll
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function clearHistoryAll() {
    if (confirm("검색 기록을 모두 삭제하시겠습니까?")) {
        saveHistory([]);
        renderHistoryList();
    }
}

/**
 * [함수] deleteHistoryItem
 * [역할] 대상을 삭제하고 후속 UI/저장 상태를 정리한다.
 * [원리] 삭제 대상 존재와 사용자 확인을 먼저 검증한 뒤,
 *        컬렉션에서 제거하고 저장·리스트 갱신·선택 상태 정리를 순서대로 수행한다.
 */
export function deleteHistoryItem(index) {
    const list = getHistory();
    list.splice(index, 1);
    saveHistory(list);
    renderHistoryList();
}

/**
 * [함수] showHistoryPanel
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function showHistoryPanel() {
    const chk = document.getElementById('chk-history-save');
    if (chk) chk.checked = isSearchHistoryEnabled;

    const list = document.getElementById('history-list');
    const clearBtn = document.querySelector('.btn-clear-history');
    if (list) list.style.display = isSearchHistoryEnabled ? 'block' : 'none';
    if (clearBtn) clearBtn.style.display = isSearchHistoryEnabled ? 'inline-block' : 'none';

    if (isSearchHistoryEnabled) {
        renderHistoryList();
    }
    document.getElementById('history-panel').style.display = 'block';
}

/**
 * [함수] renderHistoryList
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 원본 데이터(AppState/레이어 컬렉션)를 정렬·필터링해 표시 순서를 정하고,
 *        DOM 노드 또는 HTML을 재구성해 현재 상태를 화면에 다시 그린다.
 */
export function renderHistoryList() {
    const list = getHistory();
    const ul = document.getElementById('history-list');
    if (!ul) return;
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
        spanText.onclick = () => {
            const activeTab = document.querySelector('.search-tab-btn.active');
            const tabId = activeTab ? activeTab.dataset.tab : 'address';
            const inputEl = document.getElementById(tabId === 'national' ? 'search-input-national' : 'search-input-address');
            if (inputEl) inputEl.value = text;
            executeSearch(tabId);
        };
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
   3. 바텀시트 제어 (BottomSheet)
   -------------------------------------------------------------------------- */
/* 3-1. 바텀시트 열기/닫기 및 상태 제어 */
/**
 * [함수] openBottomSheet
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openBottomSheet(title, bodyHtml) {
    document.getElementById('bottom-sheet-body').innerHTML = bodyHtml;
    document.getElementById('bottom-sheet').classList.remove('full-open');
    document.getElementById('bottom-sheet').classList.add('open');
}

/**
 * [함수] closeBottomSheet
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeBottomSheet() {
    const bs = document.getElementById('bottom-sheet');
    if (!bs) return;
    bs.classList.remove('open');
    bs.classList.remove('full-open');
    const moreMenu = document.getElementById('bottom-sheet-more-menu');
    if (moreMenu) {
        moreMenu.style.display = 'none';
        moreMenu.classList.remove('visible');
    }
    currentBottomSheetLayerId = null;
}

/**
 * [함수] toggleBottomSheetState
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleBottomSheetState() {
    const bottomSheet = document.getElementById('bottom-sheet');
    if (bottomSheet.classList.contains('open')) {
        bottomSheet.classList.toggle('full-open');
    }
}

/**
 * [함수] toggleBottomSheetMoreMenu
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleBottomSheetMoreMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('bottom-sheet-more-menu');
    if (!menu) return;
    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'flex';
        setTimeout(() => menu.classList.add('visible'), 10);
    } else {
        menu.classList.remove('visible');
        setTimeout(() => menu.style.display = 'none', 100);
    }
}

/**
 * [함수] isLeafletLatLngPoint
 * [역할] 입력 대상이 조건을 만족하는지 불리언으로 판별한다.
 * [원리] 입력 객체의 타입과 필수 필드를 순서대로 검사해,
 *        후속 로직 분기에서 재사용할 불리언 판정 결과를 반환한다.
 */
function isLeafletLatLngPoint(point) {
    return !!point && typeof point.lat === 'number' && typeof point.lng === 'number';
}

/**
 * [함수] isSimplePolygonLayer
 * [역할] 입력 대상이 조건을 만족하는지 불리언으로 판별한다.
 * [원리] 입력 객체의 타입과 필수 필드를 순서대로 검사해,
 *        후속 로직 분기에서 재사용할 불리언 판정 결과를 반환한다.
 */
function isSimplePolygonLayer(layer) {
    if (!(layer instanceof L.Polygon)) return false;
    const latlngs = layer.getLatLngs();
    return Array.isArray(latlngs)
        && latlngs.length > 0
        && Array.isArray(latlngs[0])
        && latlngs[0].length > 0
        && isLeafletLatLngPoint(latlngs[0][0]);
}

/**
 * [함수] cloneRing
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function cloneRing(ring) {
    return ring.map(point => L.latLng(point.lat, point.lng));
}

/**
 * [함수] normalizeRing
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function normalizeRing(ring) {
    if (!Array.isArray(ring)) return [];
    const normalized = cloneRing(ring);
    if (normalized.length > 1) {
        const first = normalized[0];
        const last = normalized[normalized.length - 1];
        if (first.lat === last.lat && first.lng === last.lng) {
            normalized.pop();
        }
    }
    return normalized;
}

/**
 * [함수] getNormalizedPolygonRings
 * [역할] 현재 조건에 맞는 값을 조회해 반환한다.
 * [원리] 현재 활성 탭/상태를 기준으로 조회 키를 계산하고,
 *        해당 키에 대응하는 값을 읽어 호출자에 반환한다.
 */
function getNormalizedPolygonRings(layer) {
    if (!isSimplePolygonLayer(layer)) return [];
    const latlngs = layer.getLatLngs();
    return latlngs
        .map(ring => normalizeRing(ring))
        .filter(ring => ring.length >= 3);
}

/**
 * [함수] hasHoleRings
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function hasHoleRings(layer) {
    const rings = getNormalizedPolygonRings(layer);
    return rings.length > 1;
}

/**
 * [함수] getRingOrientationSign
 * [역할] 현재 조건에 맞는 값을 조회해 반환한다.
 * [원리] 현재 활성 탭/상태를 기준으로 조회 키를 계산하고,
 *        해당 키에 대응하는 값을 읽어 호출자에 반환한다.
 */
function getRingOrientationSign(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    let signedArea2 = 0;
    for (let i = 0; i < ring.length; i++) {
        const curr = ring[i];
        const next = ring[(i + 1) % ring.length];
        signedArea2 += (curr.lng * next.lat) - (next.lng * curr.lat);
    }
    if (Math.abs(signedArea2) < 1e-12) return 0;
    return signedArea2 > 0 ? 1 : -1;
}

/**
 * [함수] hideBottomSheetMoreMenu
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function hideBottomSheetMoreMenu() {
    const menu = document.getElementById('bottom-sheet-more-menu');
    if (!menu) return;
    menu.classList.remove('visible');
    setTimeout(() => menu.style.display = 'none', 100);
}

/**
 * [함수] syncBottomSheetHoleMenuForLayer
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function syncBottomSheetHoleMenuForLayer(layer) {
    const holeItem = document.getElementById('bottom-sheet-hole-item');
    const holeFillItem = document.getElementById('bottom-sheet-hole-fill-item');
    const rings = getNormalizedPolygonRings(layer);

    if (holeItem) {
        holeItem.style.display = rings.length === 1 ? 'flex' : 'none';
    }
    if (holeFillItem) {
        holeFillItem.style.display = rings.length > 1 ? 'flex' : 'none';
    }
}

/**
 * [함수] findContainingPolygonForHole
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function findContainingPolygonForHole(sourceLayer, sourceGeoJson) {
    const sourceOuterCoords = sourceGeoJson?.geometry?.coordinates?.[0] || [];
    let bestLayer = null;
    let bestArea = Infinity;

    drawnItems.getLayers().forEach(candidate => {
        if (candidate === sourceLayer) return;
        if (!isSimplePolygonLayer(candidate)) return;
        if (candidate?.feature?.properties?.isHidden) return;

        const candidateGeoJson = candidate.toGeoJSON();
        let isInside = false;

        try {
            isInside = turf.booleanWithin(sourceGeoJson, candidateGeoJson);
        } catch (err) {
            isInside = false;
        }

        if (!isInside && Array.isArray(sourceOuterCoords) && sourceOuterCoords.length > 0) {
            try {
                isInside = sourceOuterCoords.every(coord =>
                    turf.booleanPointInPolygon(turf.point(coord), candidateGeoJson, { ignoreBoundary: false })
                );
            } catch (err) {
                isInside = false;
            }
        }

        if (!isInside) return;

        let area = Infinity;
        try {
            area = turf.area(candidateGeoJson);
        } catch (err) {
            area = Infinity;
        }

        if (area < bestArea) {
            bestArea = area;
            bestLayer = candidate;
        }
    });

    return bestLayer;
}

/**
 * [함수] handleBottomSheetEdit
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 이벤트 컨텍스트를 해석해 예외/가드 조건을 먼저 처리하고,
 *        조건에 맞는 작업 함수로 분기해 사용자 의도에 맞는 동작을 실행한다.
 */
export function handleBottomSheetEdit() {
    const layerId = currentBottomSheetLayerId;
    closeBottomSheet();
    if (layerId !== null) {
        enableSingleLayerEdit(layerId);
    }
}

/**
 * [함수] handleBottomSheetDelete
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 이벤트 컨텍스트를 해석해 예외/가드 조건을 먼저 처리하고,
 *        조건에 맞는 작업 함수로 분기해 사용자 의도에 맞는 동작을 실행한다.
 */
export function handleBottomSheetDelete() {
    if (currentBottomSheetLayerId !== null) {
        deleteLayerById(currentBottomSheetLayerId);
    } else {
        closeBottomSheet();
    }
}

/**
 * [함수] handleBottomSheetHole
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 선택 폴리곤과 포함 관계를 turf로 판정해 대상 폴리곤을 찾고,
 *        링 방향(orientation)을 보정해 hole ring을 삽입한 뒤 저장/리스트/UI를 연쇄 갱신한다.
 */
export function handleBottomSheetHole() {
    hideBottomSheetMoreMenu();

    if (currentBottomSheetLayerId === null) {
        closeBottomSheet();
        return;
    }

    const sourceLayer = drawnItems.getLayers().find(l => l.feature?.properties?.id === currentBottomSheetLayerId);
    if (!sourceLayer) {
        alert("선택한 도형을 찾을 수 없습니다.");
        closeBottomSheet();
        return;
    }

    const sourceRings = getNormalizedPolygonRings(sourceLayer);
    if (sourceRings.length !== 1) {
        alert("구멍 그리기는 구멍이 없는 단일 폴리곤에서만 사용할 수 있습니다.");
        return;
    }

    const sourceOuterRing = sourceRings[0];
    if (sourceOuterRing.length < 3) {
        alert("구멍으로 변환할 폴리곤 좌표가 올바르지 않습니다.");
        return;
    }

    const sourceGeoJson = sourceLayer.toGeoJSON();
    const targetLayer = findContainingPolygonForHole(sourceLayer, sourceGeoJson);

    if (!targetLayer) {
        alert("현재 폴리곤을 포함하는 배경 폴리곤을 찾지 못했습니다.");
        return;
    }

    if (!confirm("선택한 폴리곤의 모양으로 배경 폴리곤에 구멍을 그립니다. 선택한 폴리곤은 기록에서 삭제됩니다.")) return;

    const targetLatLngs = targetLayer.getLatLngs();
    if (!Array.isArray(targetLatLngs) || targetLatLngs.length === 0 || !Array.isArray(targetLatLngs[0])) {
        alert("배경 폴리곤 좌표를 읽을 수 없습니다.");
        return;
    }

    const targetOuterRing = normalizeRing(targetLatLngs[0]);
    if (targetOuterRing.length < 3) {
        alert("배경 폴리곤 좌표가 올바르지 않습니다.");
        return;
    }

    const holeRing = cloneRing(sourceOuterRing);
    const outerSign = getRingOrientationSign(targetOuterRing);
    const holeSign = getRingOrientationSign(holeRing);
    if (outerSign !== 0 && holeSign !== 0 && outerSign === holeSign) {
        holeRing.reverse();
    }

    const nextLatLngs = targetLatLngs.map(ring => normalizeRing(ring));
    nextLatLngs.push(holeRing);

    targetLayer.setLatLngs(nextLatLngs);
    updateLayerInfo(targetLayer);
    drawnItems.removeLayer(sourceLayer);

    closeBottomSheet();
    saveToStorage();
    renderSurveyList();
    scheduleViewportVectorOptimization();
    targetLayer.openPopup();
}

/**
 * [함수] handleBottomSheetHoleFill
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 홀 링 목록을 분리해 개별 면 레이어를 생성하고 속성을 상속한 뒤,
 *        원본 폴리곤은 외곽 링만 남겨 복구하면서 저장·렌더·최적화를 함께 실행한다.
 */
export function handleBottomSheetHoleFill() {
    hideBottomSheetMoreMenu();

    if (currentBottomSheetLayerId === null) {
        closeBottomSheet();
        return;
    }

    const sourceLayer = drawnItems.getLayers().find(l => l.feature?.properties?.id === currentBottomSheetLayerId);
    if (!sourceLayer) {
        alert("선택한 도형을 찾을 수 없습니다.");
        closeBottomSheet();
        return;
    }

    if (!hasHoleRings(sourceLayer)) {
        alert("채울 수 있는 구멍이 없습니다.");
        return;
    }

    const rings = getNormalizedPolygonRings(sourceLayer);
    const outerRing = rings[0];
    const holeRings = rings.slice(1);
    const holeCount = holeRings.length;

    if (!confirm(`현재 폴리곤의 구멍 ${holeCount}개를 면 기록으로 생성하고, 원본 폴리곤의 구멍은 채웁니다.`)) return;

    const parentProps = sourceLayer.feature?.properties || {};
    const parentMemo = parentProps.memo || getTimestampString();
    const parentColor = parentProps.customColor || getRandomColor();

    const existingIds = new Set(
        drawnItems.getLayers()
            .map(layer => layer?.feature?.properties?.id)
            .filter(id => id !== undefined && id !== null)
    );

    const makeUniqueId = () => {
        let id = Date.now() + Math.floor(Math.random() * 1000000);
        while (existingIds.has(id)) {
            id += 1;
        }
        existingIds.add(id);
        return id;
    };

    const newLayers = [];

    holeRings.forEach((holeRing, index) => {
        const newLayer = L.polygon(cloneRing(holeRing));
        const customFill = Object.prototype.hasOwnProperty.call(parentProps, 'customFill')
            ? parentProps.customFill
            : undefined;
        const customDashArray = Object.prototype.hasOwnProperty.call(parentProps, 'customDashArray')
            ? parentProps.customDashArray
            : null;

        const fillMemo = holeCount === 1
            ? `${parentMemo} (구멍 채움)`
            : `${parentMemo} (구멍 채움 ${index + 1})`;

        newLayer.feature = {
            type: "Feature",
            properties: {
                memo: fillMemo,
                id: makeUniqueId(),
                isHidden: false,
                customColor: parentColor,
                customDashArray: customDashArray,
                ...(customFill === undefined ? {} : { customFill: customFill })
            }
        };

        const fillOpacity = customFill === false
            ? 0
            : (customFill === true ? 0.2 : (AppState.isPolygonFill ? 0.2 : 0));

        newLayer.setStyle({
            color: parentColor,
            fillColor: parentColor,
            dashArray: customDashArray === 'none' ? null : customDashArray,
            stroke: customDashArray !== 'none',
            fillOpacity: fillOpacity
        });

        updateLayerInfo(newLayer);
        drawnItems.addLayer(newLayer);
        newLayers.push(newLayer);
    });

    sourceLayer.setLatLngs([cloneRing(outerRing)]);
    updateLayerInfo(sourceLayer);

    closeBottomSheet();
    saveToStorage();
    renderSurveyList();
    scheduleViewportVectorOptimization();

    if (newLayers.length > 0) {
        newLayers[0].openPopup();
    } else {
        sourceLayer.openPopup();
    }
}

/* 3-2. 정보 팝업 및 지적도 조회 */
/**
 * [함수] showInfoPopup
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 역지오코딩 JSONP 결과에서 지번/도로명/우편번호를 추출하고,
 *        현재 좌표 표시 모드에 맞는 텍스트를 구성해 바텀시트 콘텐츠로 조립한다.
 */
export function showInfoPopup(lat, lng) {
    const callbackName = 'vworld_popup_' + Math.floor(Math.random() * 100000);
    window[callbackName] = function (data) {
        let parcelAddr = "주소 정보 없음";
        let roadAddr = "";
        let zipcode = "";

        if (data.response.status === "OK") {
            const results = data.response.result;
            let tempParcelZip = "";
            let tempRoadZip = "";

            results.forEach(item => {
                if (item.type === 'parcel') {
                    parcelAddr = item.text;
                    if (item.zipcode) tempParcelZip = item.zipcode;
                }
                else if (item.type === 'road') {
                    roadAddr = item.text;
                    if (item.zipcode) tempRoadZip = item.zipcode;
                }
            });

            zipcode = tempRoadZip || tempParcelZip || "";

            if (parcelAddr === "주소 정보 없음" && roadAddr !== "") {
                parcelAddr = roadAddr;
                roadAddr = "";
            }
        }

        if (AppState.currentSearchMarker) map.removeLayer(AppState.currentSearchMarker);
        AppState.currentSearchMarker = L.marker([lat, lng], { icon: createColoredMarkerIcon('#FF0000') }).addTo(map);

        let infoText = "";
        if (AppState.coordMode === 2) {
            infoText = "X:" + getTmCoords(lat, lng).x + " | " + "Y:" + getTmCoords(lat, lng).y;
        } else if (AppState.coordMode === 1) {
            infoText = "N " + lat.toFixed(4) + "°, " + "E " + lng.toFixed(4) + "°";
        } else {
            infoText = convertToDms(lat, 'lat') + " " + convertToDms(lng, 'lng');
        }

        const content = `<div style="min-width: 210px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <b onclick="copyText(this.innerText, false, '지번 주소')" style="color:#3B82F6; font-size: 16px; line-height: 1.2; word-break: keep-all; cursor: pointer;">${parcelAddr}</b>
                                </div>
                            </div>
                            <hr style="margin: 12px 0; border: none; border-top: 1px solid #f0f0f0;">
                            ${roadAddr ? `
                            <div style="display:flex; align-items:baseline; font-size: 14px; color: #555; margin-bottom: 8px;">
                                <span class="badge-road" style="flex-shrink:0; width:33px; display:inline-block; text-align:center;">도로명</span>
                                <span onclick="copyText(this.innerText, false, '도로명 주소')" style="margin-left: 5px; line-height: 1.5; word-break: keep-all; cursor: pointer;">${roadAddr}</span>
                            </div>` : ''}
                            <div style="display:flex; align-items:baseline; font-size: 14px; color: #555; margin-bottom: ${zipcode ? '8px' : '30px'};">
                                <span class="badge-coord" style="flex-shrink:0; width:33px; display:inline-block; text-align:center;">좌표</span>
                                <div onclick="copyText(this.innerText, false, '좌표')" style="margin-left: 5px; line-height: 1.5; cursor: pointer;">${infoText}</div>
                            </div>
                            ${zipcode ? `
                            <div style="display:flex; align-items:baseline; font-size: 14px; color: #555; margin-bottom: 30px;">
                                <span style="background:#f3f4f6; color:#4b5563; padding:2px 4px; border-radius:3px; font-size:10px; width:33px; display:inline-block; text-align:center; flex-shrink:0;">우편</span>
                                <span onclick="copyText(this.innerText, false, '우편번호')" style="margin-left: 5px; line-height: 1.5; cursor: pointer;">${zipcode}</span>
                            </div>` : ''}
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
                                <button class="popup-btn" style="flex:1; background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="openSearchModal('${parcelAddr}')">
                                    <div style="width:16px; height:16px;">${SVG_ICONS.search}</div>
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
        if (document.getElementById('bottom-sheet-more-btn')) {
            document.getElementById('bottom-sheet-more-btn').style.display = 'none';
        }
        openBottomSheet(parcelAddr, content);
        delete window[callbackName];
        document.getElementById(callbackName)?.remove();
    };
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&format=jsonp&type=BOTH&zipcode=true&simple=false&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

/**
 * [함수] fetchAndHighlightBoundary
 * [역할] 외부 데이터를 조회해 결과를 지도/화면에 반영한다.
 * [원리] 외부 API 응답 상태와 결과 유효성을 검증하고,
 *        성공 시 지도 레이어/버튼을 갱신하고 실패 시 재시도 가능한 상태로 되돌린다.
 */
export function fetchAndHighlightBoundary(x, y) {
    const callbackName = 'vworld_boundary_' + Math.floor(Math.random() * 100000);
    const btn = document.getElementById('btn-landeum-popup');
    if (btn) {
        btn.innerText = "로딩 중...";
        btn.classList.add('disabled');
    }
    window[callbackName] = function (data) {
        delete window[callbackName];
        document.getElementById(callbackName)?.remove();
        if (data.response.status === "OK" && data.response.result.featureCollection.features.length > 0) {
            const feature = data.response.result.featureCollection.features[0];
            if (AppState.currentBoundaryLayer) map.removeLayer(AppState.currentBoundaryLayer);
            AppState.currentBoundaryLayer = L.geoJSON(feature, {
                style: {
                    color: '#FF0000', weight: 4, opacity: 0.8,
                    fillColor: '#FF0000', fillOpacity: 0
                }
            }).addTo(map);
            if (feature.properties && feature.properties.pnu) {
                updatePopupLandEumButton(feature.properties.pnu);
            }
        } else {
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

/**
 * [함수] updatePopupLandEumButton
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updatePopupLandEumButton(pnu) {
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
   4. 모달 및 팝업 제어 (Modal & Popup)
   -------------------------------------------------------------------------- */
/* 4-1. 메모, 프로젝트 이동 및 설정 모달 */
/* 4-2. 설정, 내비게이션 등 공통 모달 */

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
 * [함수] openMoveProjectModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openMoveProjectModal(layerId) {
    if (layerId) {
        moveTargetLayerIds = [layerId];
    } else {
        moveTargetLayerIds = [];
        const layers = drawnItems.getLayers();
        layers.forEach(layer => {
            if (!layer.feature.properties.isHidden) {
                moveTargetLayerIds.push(layer.feature.properties.id);
            }
        });
        if (moveTargetLayerIds.length === 0) {
            alert("이동할 기록이 없습니다. (체크된 항목이 이동됩니다)");
            return;
        }
    }

    const list = document.getElementById('project-move-list');
    list.innerHTML = "";



    let otherProjectsCount = 0;
    AppState.projects.forEach(p => {
        if (p.id === parseInt(AppState.currentProjectId)) return;
        otherProjectsCount++;
        const btn = document.createElement('button');
        btn.style.cssText = "padding:14px; background:white; border:1px solid #ddd; border-radius:12px; text-align:left; cursor:pointer; font-size:15px; color:#333;";
        btn.innerHTML = `<b>${p.name}</b> <span style='color:#888; font-size:13px;'>(${p.features.features ? p.features.features.length : 0}개)</span>`;
        btn.onclick = () => executeMoveProject(p.id);
        list.appendChild(btn);
    });

    if (otherProjectsCount === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = 'text-align:center; padding:10px; color:#999; font-size:13px;';
        emptyMsg.innerText = "이동할 다른 프로젝트가 없습니다.";
        list.appendChild(emptyMsg);
    }

    const overlay = document.getElementById('project-move-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

/**
 * [함수] createNewProjectAndMove
 * [역할] 새 데이터를 만들고 목록/상태에 반영한다.
 * [원리] 이름/ID/생성시각 같은 기본값 규칙을 적용해 새 객체를 만들고,
 *        목록·선택 상태를 갱신해 방금 생성한 항목이 즉시 UI에 반영되게 한다.
 */
export function createNewProjectAndMove() {
    let defaultName = "새 프로젝트 " + (AppState.projects.length + 1);
    if (AppState.projects.some(p => p.name === defaultName)) {
        let cnt = 1;
        while (AppState.projects.some(p => p.name === `${defaultName} (${cnt})`)) cnt++;
        defaultName = `${defaultName} (${cnt})`;
    }
    const name = prompt("새 프로젝트 이름을 입력하세요:", defaultName);
    if (!name) return;

    const newProject = {
        id: Date.now(),
        name: name,
        features: { type: "FeatureCollection", features: [] },
        createdAt: new Date().toISOString()
    };
    AppState.projects.push(newProject);
    renderProjectSelector();

    executeMoveProject(newProject.id);
}

/**
 * [함수] executeMoveProject
 * [역할] 사용자 선택에 따라 실제 동작(이동/저장/연결)을 수행한다.
 * [원리] 사용자 선택값을 실제 실행 경로(URL/이동/저장 작업)로 변환하고,
 *        완료 후 모달 닫기·화면 갱신 등 후속 UI 정리까지 한 흐름으로 처리한다.
 */
function executeMoveProject(targetProjectId) {
    if (moveTargetLayerIds.length === 0) return;
    const targetProject = AppState.projects.find(p => p.id === parseInt(targetProjectId));
    if (!targetProject) return;
    if (!targetProject.features || !targetProject.features.features) {
        targetProject.features = { type: "FeatureCollection", features: [] };
    }
    let movedCount = 0;
    moveTargetLayerIds.forEach(id => {
        const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
        if (layer) {
            targetProject.features.features.push(layer.toGeoJSON());
            drawnItems.removeLayer(layer);
            movedCount++;
        }
    });
    if (movedCount > 0) {
        saveToStorage();
        renderSurveyList();
        alert(`${movedCount}개의 기록이 '${targetProject.name}'으로 이동되었습니다.`);
        closeMoveProjectModal();
        window.switchProject(targetProject.id); // 이동한 프로젝트로 자동 전환
    }
}

/**
 * [함수] openMoveSelectionModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openMoveSelectionModal() {
    openMoveProjectModal(null);
}

/**
 * [함수] closeMoveProjectModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeMoveProjectModal() {
    const overlay = document.getElementById('project-move-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    moveTargetLayerIds = [];
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

export let searchTarget = { name: "" };

/**
 * [함수] openSearchModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openSearchModal(name) {
    searchTarget = { name: name || "검색" };
    const overlay = document.getElementById('search-modal-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

/**
 * [함수] closeSearchModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeSearchModal() {
    const overlay = document.getElementById('search-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] executeMapSearch
 * [역할] 사용자 선택에 따라 실제 동작(이동/저장/연결)을 수행한다.
 * [원리] 사용자 선택값을 실제 실행 경로(URL/이동/저장 작업)로 변환하고,
 *        완료 후 모달 닫기·화면 갱신 등 후속 UI 정리까지 한 흐름으로 처리한다.
 */
export function executeMapSearch(type) {
    const { name } = searchTarget;
    let url = "";
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (type === 'naver') {
        if (isMobile) {
            url = `nmap://search?query=${encodeURIComponent(name)}&appname=F-Field`;
        } else {
            url = `https://map.naver.com/v5/search/${encodeURIComponent(name)}`;
        }
    } else if (type === 'kakao') {
        if (isMobile) {
            url = `kakaomap://search?q=${encodeURIComponent(name)}`;
        } else {
            url = `https://map.kakao.com/link/search/${encodeURIComponent(name)}`;
        }
    } else if (type === 'google') {
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
    }
    window.open(url, '_blank');
    setTimeout(closeSearchModal, 500);
}

/* --------------------------------------------------------------------------
   5. 피드백 및 시각 요소 (Feedback & Visuals)
   -------------------------------------------------------------------------- */
/* 5-1. 버튼 스타일 및 토스트 */

/**
 * [함수] resetButtonStyles
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function resetButtonStyles() {
    document.querySelectorAll('.bottom-btn').forEach(btn => btn.classList.remove('active-btn'));
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
    if (btn) btn.classList.add('active-btn');
}

/* --------------------------------------------------------------------------
   6. 기타 UI 요소 (Utility UI)
   -------------------------------------------------------------------------- */
/* 6-1. 전체화면, 좌표 표시 및 절전 모드 */

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

/* 6-2. 컨텍스트 메뉴 */

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

/* --------------------------------------------------------------------------
   7. 사진 관리 UI (Photo Management)
   -------------------------------------------------------------------------- */
/* 7-1. 사진 선택/업로드 모달 */
/* 7-2. 사진 확대 및 갤러리 */
/**
 * [함수] openPhotoSelectMenu
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openPhotoSelectMenu(e, id) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    currentPhotoLayerId = id;
    const overlay = document.getElementById('photo-modal-overlay');
    const container = document.getElementById('photo-modal-container');
    if (overlay && container) {
        overlay.style.display = 'flex';
        container.style.display = 'flex';
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            container.classList.add('visible');
        });
    }
}

/**
 * [함수] closePhotoSelectMenu
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closePhotoSelectMenu() {
    const overlay = document.getElementById('photo-modal-overlay');
    const container = document.getElementById('photo-modal-container');
    if (overlay && container) {
        overlay.classList.remove('visible');
        container.classList.remove('visible');
        setTimeout(() => {
            if (!overlay.classList.contains('visible')) {
                overlay.style.display = 'none';
                container.style.display = 'none';
            }
        }, 200);
    }
    currentPhotoLayerId = null;
}

/**
 * [함수] handlePhotoMenuAction
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 이벤트 컨텍스트를 해석해 예외/가드 조건을 먼저 처리하고,
 *        조건에 맞는 작업 함수로 분기해 사용자 의도에 맞는 동작을 실행한다.
 */
export function handlePhotoMenuAction(type) {
    if (!currentPhotoLayerId) return;
    const targetId = currentPhotoLayerId;
    closePhotoSelectMenu();
    setTimeout(() => {
        if (type === 'camera') {
            const input = document.getElementById(`input-cam-${targetId}`);
            if (input) input.click();
        } else if (type === 'gallery') {
            const input = document.getElementById(`input-gal-${targetId}`);
            if (input) input.click();
        }
    }, 100);
}

/**
 * [함수] processPhotoFiles
 * [역할] 입력 데이터를 후처리한 뒤 저장/표시에 반영한다.
 * [원리] 입력 데이터(파일/값)를 비동기로 변환·검증한 뒤,
 *        대상 속성에 반영하고 저장 및 화면 갱신을 연쇄 실행한다.
 */
export function processPhotoFiles(input, layerId) {
    const files = input.files;
    if (!files || files.length === 0) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === layerId);
    if (!layer) return;
    if (!layer.feature.properties.photos) {
        layer.feature.properties.photos = [];
    }
    const currentCount = layer.feature.properties.photos.length;
    const newCount = files.length;
    if (currentCount + newCount > 5) {
        alert(`사진은 최대 5장까지만 저장할 수 있습니다.`);
        input.value = '';
        return;
    }
    const promises = Array.from(files).map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                resizeImage(e.target.result, 800, 0.8).then(resizedBase64 => {
                    resolve(resizedBase64);
                });
            };
            reader.readAsDataURL(file);
        });
    });
    Promise.all(promises).then(results => {
        results.forEach(base64 => {
            layer.feature.properties.photos.push(base64);
        });
        saveToStorage();
        updateLayerInfo(layer);
        if (AppState.currentDrawer !== 'track') {
            layer.fire('click');
        } else {
            renderSurveyList();
        }
        input.value = '';
        const tempContainer = document.getElementById(`temp-inputs-${layerId}`);
        if (tempContainer) {
            tempContainer.remove();
        }
    });
}

/**
 * [함수] deletePhoto
 * [역할] 대상을 삭제하고 후속 UI/저장 상태를 정리한다.
 * [원리] 삭제 대상 존재와 사용자 확인을 먼저 검증한 뒤,
 *        컬렉션에서 제거하고 저장·리스트 갱신·선택 상태 정리를 순서대로 수행한다.
 */
export function deletePhoto(layerId, index) {
    if (!confirm("이 사진을 삭제하시겠습니까?")) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === layerId);
    if (layer && layer.feature.properties.photos) {
        layer.feature.properties.photos.splice(index, 1);
        saveToStorage();
        updateLayerInfo(layer);
        layer.fire('click');
    }
}

/**
 * [함수] openPhotoModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openPhotoModal(layerId, index) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === layerId);
    if (!layer || !layer.feature.properties.photos) return;
    currentPhotoList = layer.feature.properties.photos;
    currentPhotoIndex = index;
    updateModalImage();
    const modal = document.getElementById('photo-modal');
    modal.style.display = 'flex';
    setTimeout(() => { modal.classList.add('visible'); }, 10);
}

/**
 * [함수] updateModalImage
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updateModalImage() {
    const img = document.getElementById('photo-modal-img');
    const prevBtn = document.getElementById('photo-prev-btn');
    const nextBtn = document.getElementById('photo-next-btn');
    const counter = document.getElementById('photo-counter');
    if (currentPhotoList.length > 0) {
        img.src = currentPhotoList[currentPhotoIndex];
    }
    if (currentPhotoList.length > 1) {
        prevBtn.style.display = 'block';
        nextBtn.style.display = 'block';
    } else {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
    }
    counter.innerText = `${currentPhotoIndex + 1} / ${currentPhotoList.length}`;
}

/**
 * [함수] nextPhoto
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function nextPhoto() {
    if (currentPhotoList.length <= 1) return;
    currentPhotoIndex = (currentPhotoIndex + 1) % currentPhotoList.length;
    updateModalImage();
}

/**
 * [함수] prevPhoto
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function prevPhoto() {
    if (currentPhotoList.length <= 1) return;
    currentPhotoIndex = (currentPhotoIndex - 1 + currentPhotoList.length) % currentPhotoList.length;
    updateModalImage();
}

/**
 * [함수] downloadCurrentPhoto
 * [역할] 현재 데이터를 파일 형태로 내려받게 한다.
 * [원리] 현재 선택 대상에서 파일/리소스 정보를 구성해 내려받기를 시작하고,
 *        진행 상태와 완료 후 UI 복구를 함께 처리해 사용자 피드백을 유지한다.
 */
export function downloadCurrentPhoto() {
    if (currentPhotoList.length === 0) return;
    const base64Str = currentPhotoList[currentPhotoIndex];
    const link = document.createElement('a');
    const now = new Date();
    const timestamp = now.getFullYear().toString().slice(2) +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + "_" +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
    link.download = `photo_${timestamp}.jpg`;
    link.href = base64Str;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * [함수] closePhotoModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closePhotoModal() {
    const modal = document.getElementById('photo-modal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('photo-modal-img').src = "";
    }, 300);
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
   8. 이벤트 리스너 (DOM Events)
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
   9. 목록 렌더링 및 레이어 관리 (Rendering & Layers)
   -------------------------------------------------------------------------- */
/* 9-1. 프로젝트 관리 */

/**
 * [함수] renderProjectSelector
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 원본 데이터(AppState/레이어 컬렉션)를 정렬·필터링해 표시 순서를 정하고,
 *        DOM 노드 또는 HTML을 재구성해 현재 상태를 화면에 다시 그린다.
 */
export function renderProjectSelector() {
    const select = document.getElementById('project-select');
    if (!select) return;

    select.innerHTML = "";
    AppState.projects.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.text = p.name + ` (${p.features.features ? p.features.features.length : 0}개)`;
        if (p.id === parseInt(AppState.currentProjectId)) option.selected = true;
        select.appendChild(option);
    });

    // 기록 관리 탭의 현재 프로젝트 배너 갱신
    const currentProject = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    const bannerName = document.getElementById('current-project-name');
    if (bannerName && currentProject) {
        bannerName.textContent = currentProject.name;
    }

    // 지도 상단 중앙의 프로젝트 배지 갱신
    const mapBadge = document.getElementById('map-active-project-badge');
    if (mapBadge && currentProject) {
        mapBadge.textContent = currentProject.name;
        mapBadge.style.display = 'block';
    }

    // 프로젝트 목록 카드도 함께 갱신
    renderProjectList();
}

/**
 * [함수] createNewProject
 * [역할] 새 데이터를 만들고 목록/상태에 반영한다.
 * [원리] 이름/ID/생성시각 같은 기본값 규칙을 적용해 새 객체를 만들고,
 *        목록·선택 상태를 갱신해 방금 생성한 항목이 즉시 UI에 반영되게 한다.
 */
export function createNewProject(initialName) {
    let defaultName = initialName;
    if (!defaultName) {
        let cnt = 1;
        while (AppState.projects.some(p => p.name === `새 프로젝트 ${cnt}`)) {
            cnt++;
        }
        defaultName = `새 프로젝트 ${cnt}`;
    } else if (AppState.projects.some(p => p.name === defaultName)) {
        let cnt = 1;
        while (AppState.projects.some(p => p.name === `${defaultName} (${cnt})`)) {
            cnt++;
        }
        defaultName = `${defaultName} (${cnt})`;
    }
    const name = prompt("새 프로젝트 이름을 입력하세요:", defaultName);
    if (!name) return;
    if (name === "기본 프로젝트") {
        alert("'기본 프로젝트' 이름은 사용할 수 없습니다.");
        return;
    }
    const newProject = {
        id: Date.now(),
        name: name,
        features: { type: "FeatureCollection", features: [] },
        createdAt: new Date().toISOString()
    };
    AppState.projects.push(newProject);
    window.switchProject(newProject.id);
}

/**
 * [함수] editProjectName
 * [역할] 기존 데이터 편집 흐름을 시작하거나 변경값을 반영한다.
 * [원리] 대상 엔티티를 조회해 기존 값을 입력 UI에 채운 뒤,
 *        사용자 확정값을 속성에 반영하고 저장/리렌더 흐름으로 후처리한다.
 */
export function editProjectName() {
    const p = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (!p) return;
    if (p.name === "기본 프로젝트") {
        alert("기본 프로젝트의 이름은 변경할 수 없습니다.");
        return;
    }
    const newName = prompt("프로젝트 이름 수정:", p.name);
    if (!newName || newName === p.name) return;
    if (newName === "기본 프로젝트") {
        alert("'기본 프로젝트' 이름은 사용할 수 없습니다.");
        return;
    }
    p.name = newName;
    saveToStorage();
    renderProjectSelector();
}

/**
 * [함수] deleteCurrentProject
 * [역할] 대상을 삭제하고 후속 UI/저장 상태를 정리한다.
 * [원리] 삭제 대상 존재와 사용자 확인을 먼저 검증한 뒤,
 *        컬렉션에서 제거하고 저장·리스트 갱신·선택 상태 정리를 순서대로 수행한다.
 */
export function deleteCurrentProject() {
    const projectToDelete = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (!projectToDelete) return;
    if (projectToDelete.name === "기본 프로젝트") {
        alert("기본 프로젝트는 삭제할 수 없습니다.");
        return;
    }
    if (AppState.projects.length <= 1) { alert("최소 하나 이상의 프로젝트가 필요합니다."); return; }
    if (!confirm(`'${projectToDelete.name}' 프로젝트와 모든 기록이 삭제됩니다. 계속하시겠습니까?`)) return;
    AppState.projects = AppState.projects.filter(p => p.id !== parseInt(AppState.currentProjectId));
    window.switchProject(AppState.projects[0].id);
}

/* 프로젝트 목록 카드 렌더링 (프로젝트 관리 탭) */
/**
 * [함수] renderProjectList
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 기본 프로젝트와 일반 프로젝트를 분리한 뒤 정렬 옵션을 적용하고,
 *        카드·드롭다운 액션 DOM을 동적으로 구성해 프로젝트 전환/관리 동선을 연결한다.
 */
export function renderProjectList() {
    const container = document.getElementById('project-list-area');
    if (!container) return;

    container.innerHTML = '';

    if (AppState.projects.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#999; font-size:13px;">프로젝트가 없습니다.</div>';
        return;
    }

    let defaultProject = null;
    let otherProjects = [];
    AppState.projects.forEach(p => {
        if (p.name === "기본 프로젝트" && !defaultProject) {
            defaultProject = p;
        } else {
            otherProjects.push(p);
        }
    });

    // 다른 프로젝트 정렬 적용
    otherProjects.sort((a, b) => {
        let valA, valB;
        if (AppState.projectSortBy === 'name') {
            valA = (a.name || "").toLowerCase();
            valB = (b.name || "").toLowerCase();
        } else {
            valA = new Date(a.createdAt || 0).getTime();
            valB = new Date(b.createdAt || 0).getTime();
        }
        let diff = 0;
        if (valA < valB) diff = -1;
        if (valA > valB) diff = 1;

        return AppState.projectSortOrder === 'asc' ? diff : -diff;
    });

    const displayProjects = [];
    if (defaultProject) displayProjects.push(defaultProject);
    displayProjects.push(...otherProjects);

    displayProjects.forEach((p, index) => {
        const featureCount = p.features && p.features.features ? p.features.features.length : 0;
        const isActive = (p.id === parseInt(AppState.currentProjectId));
        const isDefault = (p.name === "기본 프로젝트" && index === 0);

        if ((defaultProject && index === 1) || (!defaultProject && index === 0)) {
            const header = document.createElement('div');
            header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding:0 5px;';
            header.innerHTML = `
                <span style="font-size:12px; font-weight:bold; color:#777;">생성된 프로젝트</span>
                <div class="dropdown-container" style="flex-shrink:0;">
                    <button onclick="openProjectSortModal()" class="btn-more" title="정렬"
                        style="background:none; border:none; padding:3px; cursor:pointer; color:#9ca3af; border-radius:6px; display:flex; align-items:center; justify-content:center;">
                        <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" /></svg>
                    </button>
                </div>
            `;
            container.appendChild(header);
        }

        const card = document.createElement('div');
        card.style.cssText = [
            'display:flex', 'align-items:center', 'gap:10px',
            'padding:12px 10px', `margin-bottom:${isDefault ? '20px' : '6px'}`,
            'border-radius:10px', 'cursor:pointer',
            'border:1.5px solid ' + (isActive ? '#3B82F6' : '#e5e7eb'),
            'background:' + (isActive ? '#EFF6FF' : '#fff'),
            'transition:all 0.15s ease',
        ].join(';');

        // 아이콘 영역
        const iconEl = document.createElement('div');
        iconEl.style.cssText = 'width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:' + (isActive ? '#3B82F6' : '#f3f4f6');
        iconEl.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:${isActive ? '#fff' : '#9ca3af'}"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>`;

        // 텍스트 영역
        const textEl = document.createElement('div');
        textEl.style.cssText = 'flex:1; min-width:0;';

        // 날짜 포맷 (YYYY.MM.DD HH:MM:SS)
        let dateStr = "";
        if (p.createdAt) {
            const d = new Date(p.createdAt);
            const yy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            dateStr = `<div style="font-size:11px; color:#9ca3af; margin-top:2px;">${yy}.${mm}.${dd} ${hh}:${mins}:${ss} 생성</div>`;
        }

        textEl.innerHTML = `
            <div style="font-size:14px; font-weight:${isActive ? '700' : '500'}; color:${isActive ? '#1D4ED8' : '#374151'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
            <div style="font-size:12px; color:#9ca3af; margin-top:2px;">기록 ${featureCount}개</div>
            ${dateStr}
        `;

        // 액션 드롭다운 메뉴
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'dropdown-container';
        dropdownContainer.style.cssText = 'flex-shrink:0;';
        // 카드 클릭(프로젝트 전환) 방지
        dropdownContainer.onclick = (e) => e.stopPropagation();

        const moreBtn = document.createElement('button');
        moreBtn.className = 'btn-more';
        moreBtn.title = '더보기';
        moreBtn.style.cssText = 'background:none; border:none; padding:5px; cursor:pointer; color:#9ca3af; border-radius:6px;';
        moreBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:currentColor;"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`;

        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'dropdown-menu';

        moreBtn.onclick = (e) => {
            e.stopPropagation();
            closeAllDropdowns();
            dropdownMenu.classList.toggle('visible');
        };

        // 저장 아이템
        const saveItem = document.createElement('div');
        saveItem.className = 'dropdown-item';
        saveItem.innerHTML = `<svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" /></svg> 프로젝트 저장`;
        saveItem.onclick = (e) => {
            e.stopPropagation();
            dropdownMenu.classList.remove('visible');
            window.switchProject(p.id);
            if (window.exportCurrentProject) {
                window.exportCurrentProject();
            }
        };
        dropdownMenu.appendChild(saveItem);

        if (p.name !== "기본 프로젝트") {
            const editItem = document.createElement('div');
            editItem.className = 'dropdown-item';
            editItem.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> 이름 변경`;
            editItem.onclick = (e) => {
                e.stopPropagation();
                dropdownMenu.classList.remove('visible');
                window.switchProject(p.id);
                editProjectName();
            };
            dropdownMenu.appendChild(editItem);

            const deleteItem = document.createElement('div');
            deleteItem.className = 'dropdown-item danger';
            deleteItem.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> 프로젝트 삭제`;
            deleteItem.onclick = (e) => {
                e.stopPropagation();
                dropdownMenu.classList.remove('visible');
                window.switchProject(p.id);
                deleteCurrentProject();
            };
            dropdownMenu.appendChild(deleteItem);
        }

        dropdownContainer.appendChild(moreBtn);
        dropdownContainer.appendChild(dropdownMenu);

        card.appendChild(iconEl);
        card.appendChild(textEl);
        card.appendChild(dropdownContainer);

        // 카드 클릭 시 해당 프로젝트로 전환 (이미 활성이면 기록 관리 탭도 이동)
        card.onclick = () => {
            window.switchProject(p.id);
            if (isActive) {
                switchSidebarTab('record');
            }
        };

        container.appendChild(card);
    });

    if (defaultProject && otherProjects.length === 0) {
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding:0 5px;';
        header.innerHTML = `
            <span style="font-size:12px; font-weight:bold; color:#777;">생성된 프로젝트</span>
            <div class="dropdown-container" style="flex-shrink:0;">
                <button onclick="openProjectSortModal()" class="btn-more" title="정렬"
                    style="background:none; border:none; padding:3px; cursor:pointer; color:#9ca3af; border-radius:6px; display:flex; align-items:center; justify-content:center;">
                    <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" /></svg>
                </button>
            </div>
        `;
        container.appendChild(header);
    }
}

/* 9-2. 조사 기록 리스트 및 가시성 제어 */
/**
 * [함수] renderSurveyList
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 레이어 목록을 정렬 기준으로 재배열하고 각 타입별 스타일 프리뷰를 생성해,
 *        가시성 토글·줌 이동·컨텍스트 메뉴 동작을 리스트 아이템에 연결한다.
 */
export function renderSurveyList() {
    const listContainer = document.getElementById('survey-list-area');
    if (!listContainer) return;
    listContainer.innerHTML = "";
    const layers = drawnItems.getLayers();
    const chkSelectAll = document.getElementById('chk-select-all');
    const allVisible = layers.length > 0 && layers.every(l => !l.feature.properties.isHidden);
    if (chkSelectAll) chkSelectAll.checked = (layers.length > 0 && allVisible);

    if (layers.length === 0) {
        listContainer.innerHTML = '<div style="padding:15px; text-align:center; color:#999; font-size:12px;">기록 없음</div>';
        return;
    }

    // --- 정렬 ---
    // AppState.sortBy: 'date'(기록 일시) | 'name'(파일명/기록명)
    // AppState.sortOrder: 'asc'(오름차순) | 'desc'(내림차순)
    const sortedLayers = [...layers].sort((a, b) => {
        const pa = a.feature.properties;
        const pb = b.feature.properties;
        let cmp = 0;
        if (AppState.sortBy === 'name') {
            const na = (pa.memo || '').toLowerCase();
            const nb = (pb.memo || '').toLowerCase();
            cmp = na.localeCompare(nb, 'ko');
        } else {
            // 'date': props.id는 Date.now() 기반 타임스탬프
            cmp = (pa.id || 0) - (pb.id || 0);
        }
        return AppState.sortOrder === 'asc' ? cmp : -cmp;
    });

    sortedLayers.forEach(function (layer) {
        const props = layer.feature.properties || {};
        const isHidden = props.isHidden === true;
        const typeIcon = (layer instanceof L.Marker) ? SVG_ICONS.marker : (layer instanceof L.Polygon ? SVG_ICONS.polygon : (props.isTrack ? SVG_ICONS.track : SVG_ICONS.ruler));
        let dateStr = "";
        if (props.id) {
            const d = new Date(props.id);
            if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
                dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
            }
        }
        const div = document.createElement('div');
        div.className = 'survey-item';
        const displayColor = props.customColor || (layer instanceof L.Marker ? '#FF0000' : '#3388ff');
        const customEmoji = props.customEmoji || null;

        let bgStyle = "";
        let btnContent = "";
        let buttonStyle = "width:28px; height:28px; border-radius:50%; flex-shrink:0; cursor:pointer; box-sizing:border-box;";

        if (layer instanceof L.Marker) {
            // 점 기록은 마커/이모지 자체를 버튼으로 표시
            buttonStyle = "width:28px; height:28px; border:none; background:transparent; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; padding:0;";
            bgStyle = "";

            if (customEmoji) {
                btnContent = `<span style="font-size: 22px; line-height: 1;">${customEmoji}</span>`;
            } else {
                const fallbackColor = displayColor === 'transparent' ? '#ccc' : displayColor;
                btnContent = `<svg viewBox="0 0 24 24" width="24" height="24" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" 
                              fill="${fallbackColor}" stroke="white" stroke-width="1"/>
                    </svg>`;
            }
        } else if (layer instanceof L.Polygon) {
            let customFill = props.customFill === true || (props.customFill === undefined && AppState.isPolygonFill);
            const isNone = props.customDashArray === 'none';
            const isDashed = props.customDashArray && !isNone;

            const bStyle = isNone ? 'solid' : (isDashed ? 'dashed' : 'solid');
            const bColor = isNone ? '#eee' : displayColor;

            // 선 기록과 동일하게 사각형 모양 (안쪽 여백 포함)
            buttonStyle = "width:28px; height:28px; border:1px solid #ddd; border-radius:4px; background:transparent; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; box-sizing:border-box; padding:1px;";
            bgStyle = "";

            let fillStyle = customFill ? `background:${displayColor}; opacity:0.4;` : "background:transparent;";
            btnContent = `
                    <div style="width:100%; height:100%; border-radius:2px; box-sizing:border-box; border: 2px ${bStyle} ${bColor}; overflow:hidden;">
                        <div style="width:100%; height:100%; ${fillStyle}"></div>
                    </div>`;
        } else {
            // 선 (Polyline)
            const isNone = props.customDashArray === 'none';
            const isDashed = props.customDashArray && !isNone;

            const bStyle = isNone ? 'solid' : (isDashed ? 'dashed' : 'solid');
            const bColor = isNone ? '#eee' : displayColor;

            // 대각선으로 꽉 차게 변경하여 점선/실선 구분이 잘 되도록 함 (내부 여백 1px 추가)
            buttonStyle = "width:28px; height:28px; border:1px solid #ddd; border-radius:4px; background:transparent; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; box-sizing:border-box; padding:1px;";
            btnContent = `<div style="width:100%; height:100%; overflow:hidden; border-radius:2px; display:flex; align-items:center; justify-content:center;"><div style="width:38px; height:0; border-top: 3px ${bStyle} ${bColor}; transform: rotate(-45deg);"></div></div>`;
        }

        const styleBtnHTML = `<button class="style-setting-btn" style="${buttonStyle} ${bgStyle}" title="스타일 설정" onclick="openStyleModal(${props.id})">${btnContent}</button>`;

        div.innerHTML = `
        <div class="survey-check-area">
            <input type="checkbox" class="survey-checkbox" ${!isHidden ? "checked" : ""} onchange="toggleLayerVisibility(${props.id})">
        </div>
        <span style="flex-shrink:0; display:flex; align-items:center; color:#999;">${typeIcon}</span>
        <div class="survey-info" onclick="zoomToLayer(${props.id})">
            <div class="survey-name">${props.memo}</div>
            ${dateStr ? `<div style="font-size:11px; color:#aaa; margin-top:1px;">${dateStr}</div>` : ''}
        </div>
        <div class="survey-actions">
            ${styleBtnHTML}
            <button class="btn-more" onclick="openContextMenu(event, ${props.id})">${SVG_ICONS.more}</button>
        </div>`;
        listContainer.appendChild(div);
    });
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
    if (photos.length > 0) {
        popupContent += `<div class="photo-container" style="margin-top:10px; margin-bottom:10px;">`;
        photos.forEach((photo, index) => {
            popupContent += `<div class="photo-thumbnail-wrapper" style="width:85px; height:85px;"><img src="${photo}" class="photo-thumbnail" style="border-radius:4px;" onclick="openPhotoModal(${id}, ${index})"><button class="btn-delete-photo" onclick="deletePhoto(${id}, ${index})">✕</button></div>`;
        });
        popupContent += `</div>`;
    }

    popupContent += `<div style="margin-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:5px;">
        <input type="file" id="input-cam-${id}" accept="image/*" capture="environment" style="display:none;" onchange="processPhotoFiles(this, ${id})">
        <input type="file" id="input-gal-${id}" accept="image/*" multiple style="display:none;" onchange="processPhotoFiles(this, ${id})">
        <button onclick="editLayerDescription(${id})" class="popup-btn" style="background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;">
            <svg viewBox="0 0 24 24" style="width:14px; height:14px; fill:#555;"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>메모
        </button>
        <button onclick="openPhotoSelectMenu(event, ${id})" class="popup-btn" style="background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;">
            <svg viewBox="0 0 24 24" style="width:14px; height:14px; fill:#555;"><path d="M19 7v2.99s-1.99.01-2 0V7h-3s.01-1.99 0-2h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z"/></svg>사진
        </button>
    </div></div></div>`;

    if (layer._path) layer._path.style.pointerEvents = 'visiblePainted';
    else layer.once('add', () => { if (layer._path) layer._path.style.pointerEvents = 'visiblePainted'; });

    layer.off('click').on('click', function (e) {
        if (AppState.currentDrawer || currentEditLayerId !== null) return;
        AppState.isLayerClicked = true;
        setTimeout(() => { AppState.isLayerClicked = false; }, 50);
        if (e && e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        if (layer instanceof L.Marker) map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 17), { duration: 0.5 });
        else map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 19 });
        currentBottomSheetLayerId = id;
        const moreBtn = document.getElementById('bottom-sheet-more-btn');
        if (moreBtn) moreBtn.style.display = 'flex';
        syncBottomSheetHoleMenuForLayer(layer);
        openBottomSheet(memo || '측량 기록', popupContent);
        document.getElementById('bottom-sheet').classList.add('full-open');
    });


    layer.openPopup = function () {
        currentBottomSheetLayerId = id;
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
        layer.feature.properties.isHidden = isHidden;
        if (isHidden) {
            layer instanceof L.Marker ? layer.setOpacity(0) : layer.setStyle({ opacity: 0, fillOpacity: 0, stroke: false });
            layer.closePopup();
            if (layer._path) layer._path.style.pointerEvents = 'none';
        } else {
            layer instanceof L.Marker ? layer.setOpacity(1) : layer.setStyle({ opacity: 1, fillOpacity: 0.2, stroke: true });
            if (layer._path) layer._path.style.pointerEvents = 'visiblePainted';
        }
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
   9-3. 스타일 설정 모달 (Style Modal)
   -------------------------------------------------------------------------- */
let currentStyleLayerId = null;
let currentStyleType = null;
let tempStyleColor = '#3B82F6';
let tempLineStyle = 'solid';
let tempMarkerStyle = '';
let tempMarkerSize = 3;
let tempFillStyle = 'on';

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
    tempMarkerStyle = props.customEmoji || '';
    tempMarkerSize = props.customMarkerSize || 3;

    const overlay = document.getElementById('style-modal-overlay');
    const lineSec = document.getElementById('style-line-section');
    const markerSec = document.getElementById('style-marker-section');
    const polySec = document.getElementById('style-polygon-section');
    const markerSizeSec = document.getElementById('style-marker-size-section');

    if (layer instanceof L.Marker) {
        currentStyleType = 'marker';
        if (lineSec) lineSec.style.display = 'none';
        if (markerSec) markerSec.style.display = 'block';
        if (markerSizeSec) markerSizeSec.style.display = 'block';
        if (polySec) polySec.style.display = 'none';
    } else if (layer instanceof L.Polygon) {
        currentStyleType = 'polygon';
        if (lineSec) lineSec.style.display = 'block';
        if (markerSec) markerSec.style.display = 'none';
        if (markerSizeSec) markerSizeSec.style.display = 'none';
        if (polySec) polySec.style.display = 'block';
        tempFillStyle = props.customFill === false ? 'off' : (props.customFill === true ? 'on' : (AppState.isPolygonFill ? 'on' : 'off'));
    } else {
        currentStyleType = 'line';
        if (lineSec) lineSec.style.display = 'block';
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
    document.querySelectorAll('#style-fill-choices .style-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.fill === tempFillStyle);
    });

    const sizeInput = document.getElementById('style-marker-size');
    const sizeLabel = document.getElementById('style-marker-size-label');
    if (sizeInput) sizeInput.value = tempMarkerSize;
    if (sizeLabel) sizeLabel.innerText = tempMarkerSize;
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
 * [함수] selectFillStyle
 * [역할] 선택값을 임시 상태로 반영하고 UI를 동기화한다.
 * [원리] 사용자 선택값을 임시 상태(temp*)에 기록하고,
 *        선택 UI를 다시 칠해 현재 선택 항목이 시각적으로 즉시 반영되게 한다.
 */
export function selectFillStyle(fill) {
    tempFillStyle = fill;
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
        if (tempLineStyle === 'dashed') props.customDashArray = '5, 5';
        else if (tempLineStyle === 'none') props.customDashArray = 'none';
        else props.customDashArray = null;

        if (currentStyleType === 'polygon') {
            props.customFill = tempFillStyle === 'on';
        }

        layer.setStyle({
            color: tempStyleColor,
            fillColor: tempStyleColor,
            dashArray: props.customDashArray === 'none' ? null : props.customDashArray,
            stroke: props.customDashArray !== 'none',
            fillOpacity: currentStyleType === 'polygon' && props.customFill === true ? 0.2 : 0,
            opacity: 0.8
        });
    }

    saveToStorage();
    renderSurveyList();
    scheduleViewportVectorOptimization();
    closeStyleModal();
}


/* --------------------------------------------------------------------------
   10. 오프라인 지도 기능 (Offline Map)
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
   11. 토스트 알림 및 로딩 (Toast & Loading)
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   11-1. 조사 기록 정렬 모달 (Sort Modal)
   -------------------------------------------------------------------------- */
/**
 * [함수] openSortModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openSortModal() {
    const overlay = document.getElementById('sort-modal-overlay');
    if (!overlay) return;

    // 현재 정렬 상태를 라디오 버튼에 반영
    document.querySelectorAll('input[name="sort-by"]').forEach(r => {
        r.checked = (r.value === AppState.sortBy);
    });
    document.querySelectorAll('input[name="sort-order"]').forEach(r => {
        r.checked = (r.value === AppState.sortOrder);
    });

    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);
}

/**
 * [함수] closeSortModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeSortModal() {
    const overlay = document.getElementById('sort-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] applySortSetting
 * [역할] 임시 설정값을 실제 상태와 화면에 확정 반영한다.
 * [원리] 임시 상태로 보관한 설정값을 실제 데이터/레이어 속성에 커밋한 뒤,
 *        저장과 목록 재렌더를 수행해 적용 결과를 전체 UI에 동기화한다.
 */
export function applySortSetting() {
    // 모달 내 라디오 버튼에서 선택한 정렬 옵션 읽기
    const byEl = document.querySelector('input[name="sort-by"]:checked');
    const orderEl = document.querySelector('input[name="sort-order"]:checked');
    if (byEl) {
        AppState.sortBy = byEl.value;
        localStorage.setItem('setting_sort_by', byEl.value);
    }
    if (orderEl) {
        AppState.sortOrder = orderEl.value;
        localStorage.setItem('setting_sort_order', orderEl.value);
    }
    closeSortModal();
    renderSurveyList(); // 정렬 옵션 적용 후 목록 다시 그리기
}

/* --------------------------------------------------------------------------
   11-2. 프로젝트 정렬 모달 (Project Sort Modal)
   -------------------------------------------------------------------------- */
/**
 * [함수] openProjectSortModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openProjectSortModal() {
    const overlay = document.getElementById('project-sort-modal-overlay');
    if (!overlay) return;

    document.querySelectorAll('input[name="project-sort-by"]').forEach(r => {
        r.checked = (r.value === AppState.projectSortBy);
    });
    document.querySelectorAll('input[name="project-sort-order"]').forEach(r => {
        r.checked = (r.value === AppState.projectSortOrder);
    });

    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);
}

/**
 * [함수] closeProjectSortModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeProjectSortModal() {
    const overlay = document.getElementById('project-sort-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] applyProjectSortSetting
 * [역할] 임시 설정값을 실제 상태와 화면에 확정 반영한다.
 * [원리] 임시 상태로 보관한 설정값을 실제 데이터/레이어 속성에 커밋한 뒤,
 *        저장과 목록 재렌더를 수행해 적용 결과를 전체 UI에 동기화한다.
 */
export function applyProjectSortSetting() {
    const byEl = document.querySelector('input[name="project-sort-by"]:checked');
    const orderEl = document.querySelector('input[name="project-sort-order"]:checked');
    if (byEl) {
        AppState.projectSortBy = byEl.value;
        localStorage.setItem('setting_project_sort_by', byEl.value);
    }
    if (orderEl) {
        AppState.projectSortOrder = orderEl.value;
        localStorage.setItem('setting_project_sort_order', orderEl.value);
    }
    closeProjectSortModal();
    renderProjectList();
}

/* --------------------------------------------------------------------------
   12. 런타임 초기화 및 전역 바인딩 (Runtime Bootstrap)
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
        selectFillStyle,
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
