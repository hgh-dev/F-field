/* ==========================================================================
   프로젝트: 국유림 현장조사 앱
   버전: v1.0.1 (Bug Fix)
   작성일: 2025-12-27
   설명: iOS 파일 저장 호환성 문제 해결 (Web Share API 적용)
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. 전역 변수 설정 (Global Variables)
-------------------------------------------------------------------------- */

const VWORLD_API_KEY = "EE6276F5-3176-37ED-8478-85C820FB8529";
const STORAGE_KEY = "my_survey_data_v4";
const SEARCH_HISTORY_KEY = 'my_search_history';
const SEARCH_SETTING_KEY = 'my_search_setting_enabled';

let isTmMode = false;
let isFollowing = false;
let watchId = null;
let isManualFinish = false;
let lastHeading = 0;

let trackingMarker = null;
let trackingCircle = null;
let currentDrawer = null;

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
    close: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`
};

/* [패치] Leaflet 라이브러리의 터치 오류 방지 */
L.Draw.Polyline.prototype._onTouch = function (e) { return; };


/* --------------------------------------------------------------------------
   3. 지도 생성 및 레이어(Layer) 설정
-------------------------------------------------------------------------- */

const map = L.map('map', { 
    zoomControl: false,
    tap: false,
    maxZoom: 22,
    doubleClickZoom: false
}).setView([36.3569, 127.3844], 13);

L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.control.scale({ imperial: false, metric: true }).addTo(map);

map.createPane('nasGukPane');
map.getPane('nasGukPane').style.zIndex = 350;
map.getPane('nasGukPane').style.pointerEvents = 'none';

proj4.defs("EPSG:5186", "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs");

const vworldBase = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', { key: VWORLD_API_KEY, layer: 'Base', ext: 'png', attribution: 'VWorld', maxNativeZoom: 19, maxZoom: 22 });
const vworldSatellite = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', { key: VWORLD_API_KEY, layer: 'Satellite', ext: 'jpeg', attribution: 'VWorld', maxNativeZoom: 19, maxZoom: 22 });
const vworldHybrid = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', { key: VWORLD_API_KEY, layer: 'Hybrid', ext: 'png', attribution: 'VWorld', maxNativeZoom: 19, maxZoom: 22 });
const vworldCadastral = L.tileLayer.wms("https://api.vworld.kr/req/wms", { key: VWORLD_API_KEY, layers: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun', styles: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun', format: 'image/png', transparent: true, opacity: 0.6, version: '1.3.0', maxZoom: 22, maxNativeZoom: 19, detectRetina: true, tileSize: 512, zoomOffset: 0, className: 'cadastral-layer' });
const nasGukLayer = L.tileLayer('https://hussell.synology.me/dev/F-field/map/suwon/guk/{z}/{x}/{y}.png', { minZoom: 1, maxZoom: 22, maxNativeZoom: 18, tms: false, pane: 'nasGukPane', opacity: 1, attribution: 'Suwon Guk' });

map.addLayer(vworldSatellite);
map.addLayer(vworldCadastral);
map.addLayer(vworldHybrid);
map.addLayer(nasGukLayer);

/* --------------------------------------------------------------------------
   4. 지도 조작 및 UI 기능 
-------------------------------------------------------------------------- */

function showInfoPopup(lat, lng) {
    const callbackName = 'vworld_popup_' + Math.floor(Math.random() * 100000);
    window[callbackName] = function (data) {
        let addrText = "주소 검색 실패";
        if (data.response.status === "OK") { 
            const result = data.response.result[0]; 
            addrText = result.text; 
        } else { 
            addrText = "주소 정보 없음"; 
        }
        
        const content = `<div class="info-popup-content">
                            <span class="info-popup-title">${SVG_ICONS.marker} 선택 위치 주소</span>
                            <span style="font-size:13px; font-weight:normal;">${addrText}</span>
                       </div>`;
        L.popup().setLatLng([lat, lng]).setContent(content).openOn(map);
        
        delete window[callbackName]; 
        const scriptTag = document.getElementById(callbackName); 
        if (scriptTag) scriptTag.remove();
    };

    const script = document.createElement('script'); 
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&format=jsonp&type=BOTH&zipcode=false&simple=false&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

map.on('dblclick', function(e) { showInfoPopup(e.latlng.lat, e.latlng.lng); });
document.getElementById('map').oncontextmenu = function(e) { e.preventDefault(); e.stopPropagation(); return false; };

function openSidebar() { 
    syncSidebarUI();
    renderSurveyList();
    document.getElementById('sidebar-overlay').style.display = 'block';
}
function closeSidebar() { 
    document.getElementById('sidebar-overlay').style.display = 'none';
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
    document.getElementById('chk-cadastral').checked = map.hasLayer(vworldCadastral);
    document.getElementById('chk-nas-guk').checked = map.hasLayer(nasGukLayer);
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
            callback(data.response.result.items[0]); 
        else 
            callback(null);
    };
    const script = document.createElement('script'); script.id = callbackName;
    script.src = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=1&page=1&query=${encodeURIComponent(query)}&type=${type}&format=json&errorformat=json&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

function callVworldCoordApi(query, callback) {
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
    script.src = `https://api.vworld.kr/req/address?service=address&request=getCoord&version=2.0&crs=epsg:4326&address=${encodeURIComponent(query)}&refine=true&simple=false&format=json&type=PARCEL&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

function executeSearch(keyword) {
    const query = keyword || document.getElementById('search-input').value;
    if (!query) return;

    if (isSearchHistoryEnabled) { addToHistory(query); }
    document.getElementById('history-panel').style.display = 'none';
    document.getElementById('search-input').value = query;

    callVworldSearchApi(query, 'ADDRESS', function (addressResult) {
        if (addressResult) { 
            moveToSearchResult(addressResult); 
        } else {
            callVworldSearchApi(query, 'PLACE', function (placeResult) {
                if (placeResult) { 
                    moveToSearchResult(placeResult); 
                } else {
                    callVworldCoordApi(query, function (coordResult) {
                        if (coordResult) { 
                            const finalResult = { point: coordResult.point, title: query, address: { road: "", parcel: "지번/임야 주소 검색됨" } }; 
                            moveToSearchResult(finalResult); 
                        } else { 
                            alert("검색 결과가 없습니다.\n정확한 주소(예: 화성시 장안면 장안리 산124)를 입력해보세요."); 
                        }
                    });
                }
            });
        }
    });
}

function moveToSearchResult(result) {
    const point = result.point; 
    map.flyTo([point.y, point.x], 16, { duration: 1.5 });
    L.popup().setLatLng([point.y, point.x])
             .setContent("<b>" + (result.title || "검색 위치") + "</b><br>" + (result.address ? (result.address.road || result.address.parcel || "") : ""))
             .openOn(map);
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
    if (map.hasLayer(vworldCadastral)) vworldCadastral.bringToFront();
    if (map.hasLayer(vworldHybrid)) vworldHybrid.bringToFront();
}

function toggleOverlay(type, isChecked) {
    let layer; 
    if (type === 'hybrid') layer = vworldHybrid; 
    else if (type === 'cadastral') layer = vworldCadastral; 
    else if (type === 'nasGuk') layer = nasGukLayer;
    
    if (isChecked) { 
        map.addLayer(layer); 
        if (type !== 'nasGuk') layer.bringToFront(); 
    } else { 
        map.removeLayer(layer); 
    }
}

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

function updateCoordDisplay() { 
    const center = map.getCenter(); 
    const text = isTmMode ? "X: " + getTmCoords(center.lat, center.lng).x + " | Y: " + getTmCoords(center.lat, center.lng).y : convertToDms(center.lat, 'lat') + " | " + convertToDms(center.lng, 'lng'); 
    document.getElementById('coord-display').innerText = text; 
}
function toggleCoordMode() { isTmMode = !isTmMode; updateCoordDisplay(); }
map.on('move', updateCoordDisplay); 
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
    actionToolbar.style.display = 'none'; 
    resetButtonStyles(); 
}

function cancelDrawing() {
    if (currentDrawer) {
        currentDrawer.disable();
        currentDrawer = null;
    }
    actionToolbar.style.display = 'none';
    resetButtonStyles();
}

function updateLayerInfo(layer) {
    let popupContent = ""; 
    let infoText = ""; 
    const memo = layer.feature.properties.memo || "";

    if (layer instanceof L.Marker) { 
        const pos = layer.getLatLng(); 
        infoText = isTmMode ? "X:" + getTmCoords(pos.lat, pos.lng).x + ", Y:" + getTmCoords(pos.lat, pos.lng).y : convertToDms(pos.lat, 'lat') + "<br>" + convertToDms(pos.lng, 'lng'); 
    } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) { 
        infoText = "<b>" + SVG_ICONS.ruler + " 거리:</b> " + (turf.length(layer.toGeoJSON(), { units: 'kilometers' }) * 1000).toFixed(2) + " m"; 
    } else if (layer instanceof L.Polygon) { 
        infoText = "<b>" + SVG_ICONS.polygon + " 면적:</b> " + turf.area(layer.toGeoJSON()).toFixed(2) + " ㎡"; 
    }
    
    popupContent = "<b>" + SVG_ICONS.memo + " 메모:</b> " + memo; 
    if (infoText) popupContent += "<br>" + infoText;
    
    layer.bindPopup(popupContent); 
    layer.feature.properties.popupContent = popupContent;
}

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

// [v1.0.1] iOS 호환성을 위한 저장/공유 통합 함수
function saveOrShareFile(content, fileName) {
    const file = new File([content], fileName, { type: "application/json" });

    // navigator.share: 모바일 기기의 '공유' 기능을 호출 (iOS 호환)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
            files: [file],
            title: 'F-Field 기록 저장',
            text: fileName + ' 파일을 저장합니다.'
        }).catch(err => {
            console.log('공유 취소 또는 실패:', err);
        });
    } else {
        // PC 또는 공유 미지원 브라우저: 기존 방식(a 태그 다운로드) 사용
        const blob = new Blob([content], { type: "application/geo+json" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
    }
}

// [v1.0.1] 개별 파일 저장 함수 수정
window.exportSingleLayer = function (id) { 
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id); 
    if (!layer) return; 

    const fileName = (layer.feature.properties.memo || "unnamed") + ".geojson";
    const content = JSON.stringify(layer.toGeoJSON(), null, 2);
    
    saveOrShareFile(content, fileName);
};

// [v1.0.1] 전체 파일 저장 함수 수정
window.exportSelectedGeoJSON = function () {
    const allLayers = drawnItems.getLayers();
    const visibleLayers = allLayers.filter(function (layer) { return !layer.feature.properties.isHidden; });
    if (visibleLayers.length === 0) { alert("저장할 항목이 선택되지 않았습니다."); return; }
    if (!confirm('선택한 기록이 한 개의 파일로 저장됩니다.')) { return; }
    
    const featureCollection = L.layerGroup(visibleLayers).toGeoJSON();
    const fileName = "Works_" + new Date().toISOString().slice(0, 10) + ".geojson";
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
    navigator.geolocation.getCurrentPosition(onFirstLoadSuccess, null, { enableHighAccuracy: true }); 
}
