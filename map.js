/* ==========================================================================
   [모듈] 지도 및 레이어 매니저 (map.js)
   [역할] Leaflet 지도 객체 생성 및 각종 배경/지적도/오버레이 레이어 관리
   ========================================================================== */
import { VWORLD_API_KEY } from './config.js?v=2.2.3';
import { AppState } from './state.js?v=2.2.3';

/* --------------------------------------------------------------------------
   1. 지도 초기화 (Map Initialization)
   -------------------------------------------------------------------------- */
/**
 * Leaflet Map 생성
 * - zoomControl: false (기본 줌 버튼 숨김 -> 커스텀 버튼 사용)
 * - tap: false (모바일 터치 더블 클릭 이슈 방지)
 * - maxZoom: 22 (최대 확대 레벨)
 */
export const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    tap: false,
    maxZoom: 22,
    doubleClickZoom: false, // 더블 클릭 시 확대되는 기본 기능을 막고, '정보 팝업'을 띄우는 기능으로 대신 사용함
    renderer: L.canvas({ padding: 0.5, tolerance: 15 }) // 터치 반경 확장(15px)을 위해 캔버스로 원복 (유령 레이어 버그 제거되어 정상작동 예상)
}).setView([37.245911, 126.960302], 17); // 초기 중심 좌표(수원)와 줌 레벨(17)

/* --------------------------------------------------------------------------
   2. 레이어 정의 (Layers Definition)
   -------------------------------------------------------------------------- */

// 줌 컨트롤(확대/축소 버튼)을 왼쪽 아래에 추가
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// 스케일 컨트롤(지도 축척 막대) 추가 (imperial: false -> 마일 단위 끔, metric: true -> 미터 단위 켬)
L.control.scale({ imperial: false, metric: true }).addTo(map);

/* 2-1. 커스텀 Pane 설정 */
/**
 * 레이어의 z-index(쌓이는 순서)를 정밀하게 제어하기 위해 사용합니다.
 * - zIndex: 350 (TilePane(200) < nasGukPane(350) < OverlayPane(400))
 * - pointerEvents: 'none' (지도가 클릭 이벤트를 받을 수 있도록 투과시킴)
 */
map.createPane('nasGukPane');
map.getPane('nasGukPane').style.zIndex = 350;
map.getPane('nasGukPane').style.pointerEvents = 'none';

map.createPane('nasImdoPane');
map.getPane('nasImdoPane').style.zIndex = 360;
map.getPane('nasImdoPane').style.pointerEvents = 'none';

map.createPane('nasHeritagePane');
map.getPane('nasHeritagePane').style.zIndex = 390; // 산림보호구역(400) 아래
map.getPane('nasHeritagePane').style.pointerEvents = 'none';

map.createPane('nasRestrictionPane');
map.getPane('nasRestrictionPane').style.zIndex = 410; // 산림보호구역(overlayPane 기본 400) 위
map.getPane('nasRestrictionPane').style.pointerEvents = 'none';

/**
 * [Proj4js 좌표계 정의]
 * - EPSG:4326 (WGS84): GPS 기본 좌표 (위도, 경도)
 * - EPSG:5186 (Korea 2010): 한국 국토지리정보원 표준 (TM, 중부원점)
 * - EPSG:3857 (Web Mercator): 구글/네이버 등 웹 지도 표준
 * 
 * VWorld나 공공데이터는 다양한 좌표계를 쓰므로 변환이 필수적입니다.
 */
proj4.defs("EPSG:5186", "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs");
proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");



/* 2-2. 배경 지도 (Base Maps) */
// 지도에 표시할 다양한 지도 데이터(타일)를 정의합니다.

/**
 * [TileLayer]
 * 이미지가 타일(조각) 형태로 제공되는 지도 서비스입니다.
 * URL의 {z}, {x}, {y} 부분이 줌 레벨과 좌표로 자동 치환되어 서버에 이미지를 요청합니다.
 */

// 1. VWorld 기본 배경 지도 (일반 지도)
export const vworldBase = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', {
    key: VWORLD_API_KEY,
    layer: 'Base',
    ext: 'png',
    attribution: 'VWorld',
    maxNativeZoom: 19, // 서버가 제공하는 최대 줌 레벨
    maxZoom: 22,       // 클라이언트에서 확대해서 보여줄 최대 레벨 (이미지가 깨질 수 있음)
    crossOrigin: true
});

// 2. VWorld 위성(영상) 지도
export const vworldSatellite = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', {
    key: VWORLD_API_KEY,
    layer: 'Satellite',
    ext: 'jpeg',
    attribution: 'VWorld',
    maxNativeZoom: 19,
    maxZoom: 22,
    crossOrigin: true
});

// 3. VWorld 하이브리드 오버레이 (도로, 지명 등 투명 배경)
// 위성 지도 위에 겹쳐서 보기 위해 사용합니다. (opacity: 1)
export const vworldHybrid = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', {
    key: VWORLD_API_KEY,
    layer: 'Hybrid',
    ext: 'png',
    opacity: 1,
    attribution: 'VWorld',
    maxNativeZoom: 19,
    maxZoom: 22,
    crossOrigin: true
});

// 8. Esri 위성지도 (World Imagery)
// VWorld 위성 지도가 안 나올 때를 대비한 대체 지도입니다.
export const esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri World Imagery',
    maxNativeZoom: 19,
    maxZoom: 22,
    crossOrigin: true
});

/* 2-3. 지적도 및 오버레이 (Overlays) */
/**
 * 서버가 요청받은 영역(Bounding Box)만큼 이미지를 '생성'해서 보내주는 방식입니다.
 * - 지적도처럼 투명 배경이 필요한 레이어에 적합합니다.
 */

// 4. 지적도 (LX, 편집도)
export const vworldLxLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    layers: 'lt_c_landinfobasemap', // 지적편집도 레이어명
    styles: '',
    format: 'image/png',
    transparent: true,
    opacity: 0.6, // 반투명하게 설정하여 아래 위성지도가 비치도록 함
    version: '1.3.0',
    maxZoom: 22,
    maxNativeZoom: 19,
    detectRetina: true,
    tileSize: 512, // 고해상도 처리를 위해 타일 크기 조정
    zoomOffset: 0,
    className: 'cadastral-layer' // CSS로 스타일 제어를 위해 클래스 추가
});

// 5. 연속 지적도 (실제 지적선)
export const vworldContinuousLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    layers: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun', // 부번, 본번 레이어 동시 요청
    styles: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun',
    format: 'image/png',
    transparent: true,
    opacity: 0.6,
    version: '1.3.0',
    maxZoom: 22,
    maxNativeZoom: 19,
    detectRetina: true,
    tileSize: 512,
    zoomOffset: 0,
    className: 'cadastral-layer'
});

// 6. 국유림 레이어 (직접 호스팅하는 커스텀 타일)
// GitHub Pages 등에 올려둔 타일 이미지를 불러옵니다.
export const nasGukLayer = L.tileLayer('https://hgh-dev.github.io/map_data/suwon/guk/{z}/{x}/{y}.png', {
    minZoom: 12,
    maxZoom: 22,
    maxNativeZoom: 18,
    tms: false, // TMS 방식(Y축 반전)이 아니므로 false
    pane: 'nasGukPane', // 아까 만든 커스텀 Pane에 배치하여 항상 위에 표시됨
    opacity: 1,
    attribution: 'Suwon Guk',
    crossOrigin: true
});

// 6-1. 임도망도 레이어 (직접 호스팅하는 커스텀 타일)
export const nasImdoLayer = L.tileLayer('https://hgh-dev.github.io/map_data/suwon/imdo/{z}/{x}/{y}.png', {
    minZoom: 12,
    maxZoom: 22,
    maxNativeZoom: 18,
    tms: false,
    pane: 'nasImdoPane',
    opacity: 1,
    attribution: 'Suwon Imdo',
    crossOrigin: true
});

// 7. 행정경계 레이어 (통합 WMS)
// 시도, 시군구, 읍면동, 리 경계를 한 번에 불러옵니다.
export const mergedAdminLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    layers: 'lt_c_adsido,lt_c_adsigg,lt_c_ademd,lt_c_adri',
    styles: 'lt_c_adsido,lt_c_adsigg,lt_c_ademd,lt_c_adri',
    format: 'image/png',
    transparent: true,
    opacity: 1,
    version: '1.3.0',
    minZoom: 6, // 너무 넓은 지역(전국)에서는 데이터 양이 많아 렉이 걸리므로 줌 제한
    maxZoom: 22,
    maxNativeZoom: 18,
    className: 'admin-layer'
});

// 8. 개발제한구역 (WMS)
export const vworldRestrictionLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    layers: 'lt_c_ud801',
    styles: 'lt_c_ud801',
    format: 'image/png',
    transparent: true,
    opacity: 0.7,
    version: '1.3.0',
    minZoom: 8,
    maxZoom: 22,
    maxNativeZoom: 19,
    pane: 'nasRestrictionPane', // 산림보호구역보다 위에 표시
    className: 'restriction-layer'
});

// 9. 국가유산 지정/보호구역 (WMS)
export const vworldHeritageLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    layers: 'lt_c_uo301',
    styles: 'lt_c_uo301',
    format: 'image/png',
    transparent: true,
    opacity: 0.7,
    version: '1.3.0',
    minZoom: 12,
    maxZoom: 22,
    maxNativeZoom: 19,
    pane: 'nasHeritagePane', // 산림보호구역보다 아래에 표시
    className: 'heritage-layer'
});

// 산림보호구역 (WMS)
export const vworldForestLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uf151', styles: 'lt_c_uf151', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'forest-layer'
});

// 10. 도시자연공원구역 (WMS)
export const vworldCityparkLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uq162', styles: 'lt_c_uq162', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'citypark-layer'
});

// 11. 임업 및 산촌 진흥권역 (WMS)
export const vworldForestryLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uf602', styles: 'lt_c_uf602', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'forestry-layer'
});

// 12. 자연환경보전지역 (WMS)
export const vworldEnvpreserveLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uq114', styles: 'lt_c_uq114', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'envpreserve-layer'
});

// 13. 백두대간보호지역 (WMS)
export const vworldBaekduLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uf901', styles: 'lt_c_uf901', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 8, maxZoom: 22, maxNativeZoom: 19, className: 'baekdu-layer'
});

// 14. 습지보호지역 (WMS)
export const vworldWetlandLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_wgisarwet', styles: 'lt_c_wgisarwet', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'wetland-layer'
});

// 15. 야생생물보호 (WMS)
export const vworldWildlifeLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_um221', styles: 'lt_c_um221', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'wildlife-layer'
});

// 16. 상수원보호 (WMS)
export const vworldWatersourceLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_um710', styles: 'lt_c_um710', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'watersource-layer'
});

// 17. 자연공원 (WMS) - 국립, 군립, 도립 묶음
export const vworldNatureparkLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_wgisnpgug,lt_c_wgisnpgun,lt_c_wgisnpdo', styles: 'lt_c_wgisnpgug,lt_c_wgisnpgun,lt_c_wgisnpdo', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 8, maxZoom: 22, maxNativeZoom: 19, className: 'naturepark-layer'
});

// 18. 사업지구경계도 (WMS)
export const vworldBizzoneLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_lhzone', styles: 'lt_c_lhzone', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'bizzone-layer'
});


// 초기 레이어 추가 (위성지도 + 연속지적도 + 하이브리드)
map.addLayer(vworldSatellite);
map.addLayer(vworldContinuousLayer);
map.addLayer(vworldHybrid);

// 초기 행정경계 레이어 설정
if (document.getElementById('chk-admin') && document.getElementById('chk-admin').checked) {
    toggleOverlay('admin', true);
}


/* --------------------------------------------------------------------------
   3. 레이어 제어 함수 (Layer Control Functions)
   -------------------------------------------------------------------------- */

// 배경 지도 토글 (ON/OFF)
export function toggleBaseLayer(isChecked) {
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
export function changeBaseMap(type) {
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
export function updateLayerOrder() {
    // 1. 하이브리드 먼저 (가장 아래)
    if (map.hasLayer(vworldHybrid)) vworldHybrid.bringToFront();

    // 2. 지적도 (하이브리드 위)
    if (map.hasLayer(vworldLxLayer)) vworldLxLayer.bringToFront();
    if (map.hasLayer(vworldContinuousLayer)) vworldContinuousLayer.bringToFront();

    // 3. 행정경계가 가장 위에 오도록
    if (map.hasLayer(mergedAdminLayer)) mergedAdminLayer.bringToFront();
}

// 지적도 종류 변경 (연속지적도 vs LX)
export function changeCadastralMap(type) {
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
export function toggleOverlay(type, isChecked) {
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

    } else if (type === 'nasImdo') {
        layer = nasImdoLayer;

    } else if (type === 'restriction') {
        layer = vworldRestrictionLayer;

    } else if (type === 'heritage') {
        layer = vworldHeritageLayer;

    } else if (type === 'citypark') {
        layer = vworldCityparkLayer;
    } else if (type === 'forestry') {
        layer = vworldForestryLayer;
    } else if (type === 'envpreserve') {
        layer = vworldEnvpreserveLayer;
    } else if (type === 'baekdu') {
        layer = vworldBaekduLayer;
    } else if (type === 'wetland') {
        layer = vworldWetlandLayer;
    } else if (type === 'wildlife') {
        layer = vworldWildlifeLayer;
    } else if (type === 'watersource') {
        layer = vworldWatersourceLayer;
    } else if (type === 'naturepark') {
        layer = vworldNatureparkLayer;
    } else if (type === 'bizzone') {
        layer = vworldBizzoneLayer;

    } else if (type === 'forest') {
        layer = vworldForestLayer;
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



/* --------------------------------------------------------------------------
   4. 외부 API 연동 (External API Data)
   -------------------------------------------------------------------------- */


/* --------------------------------------------------------------------------
   5. 오프라인 지도 (Offline Map)
   -------------------------------------------------------------------------- */
/**
 * 주어진 영역(bounds)과 줌 레벨 범위에 해당하는 타일 URL 배열을 반환합니다.
 */
export function getOfflineMapUrls(bounds, minZoom, maxZoom) {
    const urls = [];
    const minLat = bounds.getSouth();
    const maxLat = bounds.getNorth();
    const minLng = bounds.getWest();
    const maxLng = bounds.getEast();

    function lng2tile(lon, zoom) { return Math.floor((lon + 180) / 360 * Math.pow(2, zoom)); }
    function lat2tile(lat, zoom) { return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)); }

    // 현재 활성화된 모든 타일 레이어(WMS 포함) 수집
    const activeTileLayers = [];
    map.eachLayer((layer) => {
        if (typeof layer.getTileUrl === 'function') {
            activeTileLayers.push(layer);
        }
    });

    for (let z = minZoom; z <= maxZoom; z++) {
        let xtileMin = lng2tile(minLng, z);
        let xtileMax = lng2tile(maxLng, z);
        let ytileMin = lat2tile(maxLat, z); // lat은 북쪽이 값이 크므로 y좌표는 북쪽이 최소값
        let ytileMax = lat2tile(minLat, z);

        // 최대/최소값 오류 보정
        const minX = Math.min(xtileMin, xtileMax);
        const maxX = Math.max(xtileMin, xtileMax);
        const minY = Math.min(ytileMin, ytileMax);
        const maxY = Math.max(ytileMin, ytileMax);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const coords = { x: x, y: y, z: z };
                activeTileLayers.forEach(layer => {
                    try {
                        let url = layer.getTileUrl(coords);
                        if (url) urls.push(url);
                    } catch (e) {
                        console.warn('Failed to generate tile URL for layer', e);
                    }
                });
            }
        }
    }
    // 중복 URL 제거 후 반환
    return [...new Set(urls)];
}
