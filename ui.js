/* ==========================================================================
   [모듈] UI 매니저 (ui.js)
   [역할] 사이드바, 바텀시트, 모달창 등 화면 시각 요소 제어
   ========================================================================== */
import { VWORLD_API_KEY, SEARCH_HISTORY_KEY, SEARCH_SETTING_KEY, SVG_ICONS } from './config.js';
import { AppState } from './state.js';
import { map, vworldBase, vworldSatellite, vworldHybrid, esriSatelliteLayer, vworldLxLayer, vworldContinuousLayer, nasGukLayer, toggleOverlay, updateLayerOrder, getOfflineMapUrls, topoMapLayer } from './map.js';
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

// 초기화: 저장된 검색 설정 불러오기
(function initSearchSettings() {
    const setting = localStorage.getItem(SEARCH_SETTING_KEY);
    if (setting !== null) { isSearchHistoryEnabled = (setting === 'true'); }
})();

export function setIsSearchHistoryEnabled(val) { isSearchHistoryEnabled = val; }
export function setCurrentBottomSheetLayerId(id) { currentBottomSheetLayerId = id; }

/* --------------------------------------------------------------------------
   1. 사이드바 제어 (Sidebar)
   -------------------------------------------------------------------------- */
/* 1-1. 열기 및 닫기 */

export function openSidebar() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    syncSidebarUI();
    renderSurveyList();
    const overlay = document.getElementById('sidebar-overlay');
    overlay.style.display = 'block';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

export function closeSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/* 1-2. 탭 전환 및 UI 동기화 */
export function syncSidebarUI() {
    const hasBase = map.hasLayer(vworldBase);
    const hasSat = map.hasLayer(vworldSatellite);
    const hasEsri = map.hasLayer(esriSatelliteLayer);
    const hasTopo = map.hasLayer(topoMapLayer);

    const chkBase = document.getElementById('chk-base-layer');
    if (chkBase) chkBase.checked = (hasBase || hasSat || hasEsri || hasTopo);

    const baseSat = document.querySelector('input[name="baseMap"][value="satellite"]');
    const baseEsri = document.querySelector('input[name="baseMap"][value="esri"]');
    const baseBase = document.querySelector('input[name="baseMap"][value="base"]');
    const baseTopo = document.querySelector('input[name="baseMap"][value="topo"]');

    if (hasSat && baseSat) baseSat.checked = true;
    else if (hasEsri && baseEsri) baseEsri.checked = true;
    else if (hasTopo && baseTopo) baseTopo.checked = true;
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

export function switchSidebarTab(tabName) {
    document.getElementById('tab-btn-map').classList.remove('active');
    document.getElementById('tab-btn-record').classList.remove('active');
    document.getElementById('content-map').classList.remove('active');
    document.getElementById('content-record').classList.remove('active');

    document.getElementById('tab-btn-' + tabName).classList.add('active');
    document.getElementById('content-' + tabName).classList.add('active');

}

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

    // (이전에 검색창에서 string을 넘겼을 때의 하위호환이었으나 제거 후 완전 분리)

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

function handleSearchResults(items) {
    if (items.length === 1) {
        moveToSearchResult(items[0]);
    } else {
        renderSearchResultList(items);
        document.getElementById('search-result-panel').style.display = 'block';
    }
}

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

export function closeSearchResult() {
    const panel = document.getElementById('search-result-panel');
    if (panel) panel.style.display = 'none';
    const input = document.getElementById('search-input-address');
    if (input) input.focus();
}

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
function getActiveHistoryKey() {
    const activeTab = document.querySelector('.search-tab-btn.active');
    const tabId = activeTab ? activeTab.dataset.tab : 'address';
    return tabId === 'national' ? SEARCH_HISTORY_KEY + '_national' : SEARCH_HISTORY_KEY;
}

export function getHistory() { const json = localStorage.getItem(getActiveHistoryKey()); return json ? JSON.parse(json) : []; }
export function saveHistory(list) { localStorage.setItem(getActiveHistoryKey(), JSON.stringify(list)); }

export function addToHistory(keyword) {
    let list = getHistory();
    list = list.filter(item => item !== keyword);
    list.unshift(keyword);
    if (list.length > 10) list = list.slice(0, 10);
    saveHistory(list);
}

export function toggleHistorySave(checked) {
    isSearchHistoryEnabled = checked;
    localStorage.setItem(SEARCH_SETTING_KEY, checked);
    const list = document.getElementById('history-list');
    const clearBtn = document.querySelector('.btn-clear-history');
    if (list) list.style.display = checked ? 'block' : 'none';
    if (clearBtn) clearBtn.style.display = checked ? 'inline-block' : 'none';
}

export function clearHistoryAll() {
    if (confirm("검색 기록을 모두 삭제하시겠습니까?")) {
        saveHistory([]);
        renderHistoryList();
    }
}

export function deleteHistoryItem(index) {
    const list = getHistory();
    list.splice(index, 1);
    saveHistory(list);
    renderHistoryList();
}

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
export function openBottomSheet(title, bodyHtml) {
    document.getElementById('bottom-sheet-body').innerHTML = bodyHtml;
    document.getElementById('bottom-sheet').classList.remove('full-open');
    document.getElementById('bottom-sheet').classList.add('open');
}

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

export function toggleBottomSheetState() {
    const bottomSheet = document.getElementById('bottom-sheet');
    if (bottomSheet.classList.contains('open')) {
        bottomSheet.classList.toggle('full-open');
    }
}

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

export function handleBottomSheetEdit() {
    const layerId = currentBottomSheetLayerId;
    closeBottomSheet();
    if (layerId !== null) {
        enableSingleLayerEdit(layerId);
    }
}

export function handleBottomSheetDelete() {
    if (currentBottomSheetLayerId !== null) {
        deleteLayerById(currentBottomSheetLayerId);
    } else {
        closeBottomSheet();
    }
}

/* 3-2. 정보 팝업 및 지적도 조회 */
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
/* 3-1. 설정, 내비게이션 등 공통 모달 */

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

export function openMoveSelectionModal() {
    openMoveProjectModal(null);
}

export function closeMoveProjectModal() {
    const overlay = document.getElementById('project-move-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    moveTargetLayerIds = [];
}

export function openLocationActionModal() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    const overlay = document.getElementById('location-action-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

export function closeLocationActionModal() {
    const overlay = document.getElementById('location-action-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

export function openSettingsModal() {
    closeSidebar();
    document.getElementsByName('coord-mode-select').forEach(r => { if (parseInt(r.value) === AppState.coordMode) r.checked = true; });
    document.getElementsByName('export-format-select').forEach(r => { if (r.value === AppState.exportFormat) r.checked = true; });
    document.getElementsByName('track-interval-select').forEach(r => { if (parseInt(r.value) === AppState.trackInterval) r.checked = true; });
    document.getElementsByName('polygon-fill-select').forEach(r => { if ((r.value === 'true') === AppState.isPolygonFill) r.checked = true; });
    const overlay = document.getElementById('settings-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

export function closeSettingsModal() {
    const overlay = document.getElementById('settings-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

export function openNavModal(name, lat, lng) {
    navTarget = { name: name || "목적지", lat: lat, lng: lng };
    const overlay = document.getElementById('nav-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

export function closeNavModal() {
    const overlay = document.getElementById('nav-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

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

export function openSearchModal(name) {
    searchTarget = { name: name || "검색" };
    const overlay = document.getElementById('search-modal-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

export function closeSearchModal() {
    const overlay = document.getElementById('search-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

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

export function resetButtonStyles() {
    document.querySelectorAll('.bottom-btn').forEach(btn => btn.classList.remove('active-btn'));
}

export function highlightButton(btnId) {
    resetButtonStyles();
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('active-btn');
}

/* --------------------------------------------------------------------------
   6. 기타 UI 요소 (Utility UI)
   -------------------------------------------------------------------------- */
/* 6-1. 전체화면, 좌표 표시 및 절전 모드 */

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

export function initSleepSlider() {
    const sliderThumb = document.getElementById('sleep-slider-thumb');
    if (!sliderThumb) return;
    sliderThumb.addEventListener('touchstart', onSleepSliderTouchStart, { passive: false });
    document.addEventListener('touchmove', onSleepSliderTouchMove, { passive: false });
    document.addEventListener('touchend', onSleepSliderTouchEnd);
}

function onSleepSliderTouchStart(e) {
    const overlay = document.getElementById('sleep-mode-overlay');
    if (!overlay || overlay.style.display === 'none') return;
    const sliderThumb = document.getElementById('sleep-slider-thumb');
    AppState.isDraggingSleepSlider = true;
    AppState.sleepStartX = e.touches[0].clientX;
    sliderThumb.classList.add('dragging');
    AppState.sleepMaxDragX = sliderThumb.parentElement.offsetWidth - 60;
}

function onSleepSliderTouchMove(e) {
    if (!AppState.isDraggingSleepSlider) return;
    e.preventDefault();
    const sliderThumb = document.getElementById('sleep-slider-thumb');
    AppState.sleepCurrentX = e.touches[0].clientX - AppState.sleepStartX;
    if (AppState.sleepCurrentX < 0) AppState.sleepCurrentX = 0;
    if (AppState.sleepCurrentX > AppState.sleepMaxDragX) AppState.sleepCurrentX = AppState.sleepMaxDragX;
    sliderThumb.style.transform = `translateX(${AppState.sleepCurrentX}px)`;
}

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

export function toggleMoreMenu(event) {
    event.stopPropagation();
    closeAllDropdowns();
    const menu = document.getElementById('more-menu');
    if (menu) menu.classList.toggle('visible');
}

export function toggleProjectMenu(event) {
    event.stopPropagation();
    closeAllDropdowns();
    const menu = document.getElementById('project-menu');
    if (menu) menu.classList.toggle('visible');
}

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
/* 7-2. 사진 확대 및 갤러리 */

/* 3-2. 사진 및 메모 모달 */
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

export function nextPhoto() {
    if (currentPhotoList.length <= 1) return;
    currentPhotoIndex = (currentPhotoIndex + 1) % currentPhotoList.length;
    updateModalImage();
}

export function prevPhoto() {
    if (currentPhotoList.length <= 1) return;
    currentPhotoIndex = (currentPhotoIndex - 1 + currentPhotoList.length) % currentPhotoList.length;
    updateModalImage();
}

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

export function closePhotoModal() {
    const modal = document.getElementById('photo-modal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('photo-modal-img').src = "";
    }, 300);
}

/* --------------------------------------------------------------------------
   8. 이벤트 리스너 (DOM Events)
   -------------------------------------------------------------------------- */
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

    // 오프라인 지도 확대 레벨 체크 이벤트
    map.on('zoomend', updateOfflineButton);
    map.on('moveend', updateOfflineButton);
    setTimeout(updateOfflineButton, 100);
}

/* --------------------------------------------------------------------------
   9. 목록 렌더링 및 레이어 관리 (Rendering & Layers)
   -------------------------------------------------------------------------- */
/* 9-1. 프로젝트 관리 */

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
}

export function createNewProject(initialName) {
    let defaultName = initialName || ("새 프로젝트 " + (AppState.projects.length + 1));
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
    window.switchProject(newProject.id);
}

export function editProjectName() {
    const p = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (!p) return;
    const newName = prompt("프로젝트 이름 수정:", p.name);
    if (!newName || newName === p.name) return;
    p.name = newName;
    saveToStorage();
    renderProjectSelector();
}

export function deleteCurrentProject() {
    if (AppState.projects.length <= 1) { alert("최소 하나 이상의 프로젝트가 필요합니다."); return; }
    if (!confirm(`현재 프로젝트 '${AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId)).name}'와 모든 기록이 삭제됩니다. 계속하시겠습니까?`)) return;
    AppState.projects = AppState.projects.filter(p => p.id !== parseInt(AppState.currentProjectId));
    window.switchProject(AppState.projects[0].id);
}

/* 9-2. 조사 기록 리스트 및 가시성 제어 */
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

    layers.forEach(function (layer) {
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
            <input type="color" class="color-picker-input" value="${props.customColor || '#3388ff'}" onchange="updateLayerColor(${props.id}, this.value)">
            <button class="btn-more" onclick="openContextMenu(event, ${props.id})">${SVG_ICONS.more}</button>
        </div>`;
        listContainer.appendChild(div);
    });
}

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
        openBottomSheet(memo || '측량 기록', popupContent);
        document.getElementById('bottom-sheet').classList.add('full-open');
    });


    layer.openPopup = function () {
        currentBottomSheetLayerId = id;
        const moreBtn = document.getElementById('bottom-sheet-more-btn');
        if (moreBtn) moreBtn.style.display = 'flex';
        openBottomSheet(memo || '측량 기록', popupContent);
        document.getElementById('bottom-sheet').classList.add('full-open');
        return this;
    };
    layer.closePopup = function () { closeBottomSheet(); return this; };
}
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

export function deleteLayerById(id) {

    if (confirm("정말로 이 기록을 삭제하시겠습니까?")) {
        const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
        if (layer) drawnItems.removeLayer(layer);
        saveToStorage();
        renderSurveyList();
        closeBottomSheet();
    }
}

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
    }
}

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

export function updateLayerColor(id, newColor) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    if (layer instanceof L.Marker) layer.setIcon(createColoredMarkerIcon(newColor));
    else layer.setStyle({ color: newColor, fillColor: newColor });
    layer.feature.properties.customColor = newColor;
    saveToStorage();
}


/* --------------------------------------------------------------------------
   10. 오프라인 지도 기능 (Offline Map)
   -------------------------------------------------------------------------- */
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

/* --- 전역 바인딩 (UI 관련) --- */
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.switchSearchTab = switchSearchTab;
window.renderCoordSearchInputs = renderCoordSearchInputs;
window.switchSidebarTab = switchSidebarTab;
window.unlockHiddenLayers = unlockHiddenLayers;
window.toggleSearchBox = toggleSearchBox;
window.executeSearch = executeSearch;
window.closeSearchResult = closeSearchResult;
window.showHistoryPanel = showHistoryPanel;
window.toggleHistorySave = toggleHistorySave;
window.clearHistoryAll = clearHistoryAll;
window.deleteHistoryItem = deleteHistoryItem;
window.closeBottomSheet = closeBottomSheet;
window.toggleBottomSheetState = toggleBottomSheetState;
window.toggleBottomSheetMoreMenu = toggleBottomSheetMoreMenu;
window.handleBottomSheetEdit = handleBottomSheetEdit;
window.handleBottomSheetDelete = handleBottomSheetDelete;
window.editLayerDescription = editLayerDescription;
window.closeMemoModal = closeMemoModal;
window.saveMemoAction = saveMemoAction;
window.editLayerMemo = editLayerMemo;
window.createNewProject = createNewProject;
window.createNewProjectAndMove = createNewProjectAndMove;
window.editProjectName = editProjectName;
window.deleteCurrentProject = deleteCurrentProject;
window.openMoveProjectModal = openMoveProjectModal;
window.openMoveSelectionModal = openMoveSelectionModal;
window.closeMoveProjectModal = closeMoveProjectModal;
window.startSleepMode = startSleepMode;
window.unlockSleepMode = unlockSleepMode;
window.toggleAccordion = toggleAccordion;
window.toggleMoreMenu = toggleMoreMenu;
window.toggleProjectMenu = toggleProjectMenu;
window.openPhotoSelectMenu = openPhotoSelectMenu;
window.closePhotoSelectMenu = closePhotoSelectMenu;
window.handlePhotoMenuAction = handlePhotoMenuAction;
window.processPhotoFiles = processPhotoFiles;
window.deletePhoto = deletePhoto;
window.openPhotoModal = openPhotoModal;
window.nextPhoto = nextPhoto;
window.prevPhoto = prevPhoto;
window.downloadCurrentPhoto = downloadCurrentPhoto;
window.closePhotoModal = closePhotoModal;
window.openNavModal = openNavModal;
window.closeNavModal = closeNavModal;
window.executeNavigation = executeNavigation;
window.fetchAndHighlightBoundary = fetchAndHighlightBoundary;
window.copyText = copyText;
window.deleteLayerById = deleteLayerById;
window.toggleLayerVisibility = toggleLayerVisibility;
window.zoomToLayer = zoomToLayer;
window.updateLayerColor = updateLayerColor;
window.openLocationActionModal = openLocationActionModal;
window.closeLocationActionModal = closeLocationActionModal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.shareLocationText = shareLocationText;
window.openContextMenu = openContextMenu;
window.handleMenuAction = handleMenuAction;
window.downloadOfflineMap = downloadOfflineMap;
