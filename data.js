/* ==========================================================================
   [모듈] 데이터 매니저 (data.js)
   [역할] 프로젝트 데이터 저장/불러오기 및 파일(GPX, GeoJSON) 내보내기/가져오기
   ========================================================================== */
import { STORAGE_KEY } from './config.js';
import { AppState } from './state.js';
import { drawnItems } from './draw.js';
import { renderSurveyList, updateLayerInfo, renderProjectSelector, closeSidebar, createNewProject, openSidebar, switchSidebarTab } from './ui.js';
import { getRandomColor, createColoredMarkerIcon, getShortAddress } from './utils.js';
import { VWORLD_API_KEY } from './config.js';
import { map } from './map.js';


/* 1. 로컬 저장소 관리 (Local Storage) */
/**
 * [localForage 저장 (IndexedDB)]
 * - 브라우저의 IndexedDB를 사용하여 대용량 데이터를 비동기로 저장합니다.
 * - 객체(Object)를 직접 저장할 수 있습니다.
 */
export async function saveToStorage() {
    if (!AppState.currentProjectId) return; // 초기화 전이면 중단

    // 현재 프로젝트 찾기
    const projectIndex = AppState.projects.findIndex(p => p.id === parseInt(AppState.currentProjectId));
    if (projectIndex !== -1) {
        // [중요] 현재 그려진 레이어 상태를 프로젝트 객체에 반영
        AppState.projects[projectIndex].features = drawnItems.toGeoJSON();
        AppState.projects[projectIndex].updatedAt = new Date().toISOString();

        // 프로젝트 이름 동기화 (선택 버튼의 텍스트가 변경되었을 수 있음)
        const nameBtn = document.getElementById('project-select-btn');
        if (nameBtn) {
            AppState.projects[projectIndex].name = nameBtn.textContent;
        }
    }

    const storageData = {
        version: "2.0",
        currentProjectId: AppState.currentProjectId,
        projects: AppState.projects
    };

    // 객체 그대로 저장 (비동기)
    try {
        await localforage.setItem(STORAGE_KEY, storageData);
    } catch (err) {
        console.error("Storage save failed:", err);
        alert("데이터 저장 실패: " + err);
    }
}

// 데이터 로드 (마이그레이션 포함)
export async function loadFromStorage() {
    try {
        // [1] 마이그레이션: 구 버전(LocalStorage) 확인
        const oldData = localStorage.getItem(STORAGE_KEY);
        if (oldData) {
            console.log("Migrating from LocalStorage to localForage...");
            try {
                const parsedOld = JSON.parse(oldData);
                // 새 저장소(IndexedDB)로 이동
                await localforage.setItem(STORAGE_KEY, parsedOld);
                // 구 저장소(LocalStorage) 삭제
                localStorage.removeItem(STORAGE_KEY);
                console.log("Migration successful.");
            } catch (e) {
                console.error("Migration failed:", e);
            }
        }

        // [2] 데이터 불러오기 (IndexedDB)
        const savedData = await localforage.getItem(STORAGE_KEY);

        if (!savedData) {
            // 데이터가 아예 없으면 기본 프로젝트 생성
            initDefaultProject();
            return;
        }

        /**
         * [데이터 복원]
         * 저장된 객체를 전역 변수에 할당하고 UI를 갱신합니다.
         */
        const parsed = savedData; // localForage는 객체를 반환함

        // 데이터 버전 체크 및 복구
        if (Array.isArray(parsed) || (parsed.type === "FeatureCollection")) {
            console.log("Legacy data detected. Migrating...");
            await migrateLegacyData(parsed);
        } else if (parsed.version === "2.0") {
            // 신규 버전 데이터 로드
            AppState.projects = parsed.projects || [];
            AppState.currentProjectId = parsed.currentProjectId;

            // 만약 오류로 프로젝트가 없으면 초기화
            if (AppState.projects.length === 0) {
                initDefaultProject();
            } else {
                // 현재 프로젝트 ID가 유효하지 않으면 첫번째로 설정
                if (!AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId))) {
                    AppState.currentProjectId = AppState.projects[0].id;
                }
                renderProjectSelector();
                loadCurrentProjectFeatures();
            }
        } else {
            // [호환성] 버전 정보가 없거나 알 수 없는 형식이면 초기화
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
    AppState.projects = [defaultProject];
    AppState.currentProjectId = defaultProject.id;

    saveToStorage();
    renderProjectSelector();
    // 빈 상태로 시작
}

// 레거시 데이터 마이그레이션
async function migrateLegacyData(legacyData) {
    // 구 버전 데이터 변환
    let featureCollection = legacyData;
    if (Array.isArray(legacyData)) {
        featureCollection = { type: "FeatureCollection", features: legacyData };
    }
    const migratedProject = {
        id: Date.now(),
        name: "기본 프로젝트",
        features: featureCollection,
        createdAt: new Date().toISOString()
    };
    AppState.projects = [migratedProject];
    AppState.currentProjectId = migratedProject.id;

    renderProjectSelector();
    loadCurrentProjectFeatures(); // 1. 먼저 그려진 레이어를 복원하고
    await saveToStorage(); // 2. 그 상태를 저장해야 함 (순서 중요!)

}

// 현재 선택된 프로젝트의 데이터 지도에 표시
export function loadCurrentProjectFeatures() {
    drawnItems.clearLayers(); // 기존 레이어 제거

    const project = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (project && project.features) {
        restoreFeatures(project.features);
    }

    // UI 업데이트
    renderSurveyList();
}

export function restoreFeatures(geoJsonData) {
    // -----------------------------------------------------------
    // [교육용] restoreFeatures
    // 저장된 GeoJSON 데이터를 기반으로 지도에 도형(Layer)을 복구하는 핵심 함수입니다.
    // - L.geoJSON: GeoJSON 데이터를 Leaflet 레이어로 변환합니다.
    // - pointToLayer: Point 타입(마커) 생성 시 아이콘과 색상을 정의합니다.
    // - style: LineString/Polygon 타입(선/면) 생성 시 스타일(색상 등)을 정의합니다.
    // - onEachFeature: 각 레이어가 생성된 후 추가적인 속성(ID, Memo)을 연결합니다.
    // -----------------------------------------------------------
    L.geoJSON(geoJsonData, {
        pointToLayer: function (feature, latlng) {
            // 마커 생성 시 색상 적용
            const color = feature.properties.customColor || getRandomColor();
            const marker = L.marker(latlng, { icon: createColoredMarkerIcon(color) });
            return marker;
        },
        style: function (feature) {
            // 선/면 스타일 적용
            if (feature.geometry.type !== 'Point') {
                const color = feature.properties.customColor || getRandomColor();
                const styleObj = { color: color, fillColor: color };
                if (feature.geometry.type === 'Polygon' && !AppState.isPolygonFill) {
                    styleObj.fillOpacity = 0;
                }
                return styleObj;
            }
        },
        onEachFeature: function (feature, layer) {
            // 속성 바인딩 및 레이어 추가
            if (feature.properties) {
                // 기존 properties 유지하면서 필요한 기본값 설정
                if (!feature.properties.id) feature.properties.id = Date.now() + Math.floor(Math.random() * 1000);
                if (!feature.properties.customColor) {
                    // 스타일에서 생성된 색상을 properties에 역으로 저장 (중요)
                    if (layer.options.icon) {
                        // 마커의 경우 아이콘에서 색상을 추출하기 어려우므로, 위 pointToLayer에서 설정한 로직을 따라감
                        // 이미 properties.customColor가 있으면 사용, 없으면 랜덤
                        feature.properties.customColor = feature.properties.customColor || getRandomColor();
                    } else {
                        feature.properties.customColor = layer.options.color || getRandomColor();
                    }
                }

                layer.feature = feature;
                updateLayerInfo(layer);
            }
            drawnItems.addLayer(layer);
        }
    });

    // 모든 레이어 추가 후 리스트 갱신
    renderSurveyList();
}

/* 2. 파일 내보내기 및 가져오기 (Import/Export) */
export function exportSingleLayer(id) {
    // -----------------------------------------------------------
    // [교육용] exportSingleLayer
    // 선택한 단일 기록(Layer)을 파일로 내보내는 함수입니다.
    // - AppState.exportFormat 변수(설정 값)에 따라 GPX 또는 GeoJSON 형식을 선택합니다.
    // - GPX 내보내기 시: geoJsonToGpx 유틸리티를 사용하기 위해 
    //   단일 Layer를 FeatureCollection 형태로 감싸서 전달합니다.
    // -----------------------------------------------------------
    if (!confirm('기록을 기기에 저장합니다.')) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    // 파일명에 사용할 수 없는 문자 제거
    let safeMemo = (layer.feature.properties.memo || "unnamed").replace(/[\\/:*?"<>|]/g, "_");

    if (AppState.exportFormat === 'gpx') {
        const featureCollection = {
            type: "FeatureCollection",
            features: [layer.toGeoJSON()]
        };
        const gpxData = geoJsonToGpx(featureCollection, safeMemo);
        saveOrShareFile(gpxData, safeMemo + ".gpx", "application/gpx+xml");
    } else {
        saveOrShareFile(JSON.stringify(layer.toGeoJSON(), null, 2), safeMemo + ".geojson", "application/geo+json");
    }
};

// 변경: 현재 프로젝트 전체 저장 (파일명: 프로젝트명_yymmdd)
export function exportCurrentProject() {
    if (!confirm('현재 프로젝트를 기기에 저장합니다.')) return;

    const project = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (!project) return;

    // 현재 그려진 내용으로 features 갱신
    const currentFeatures = drawnItems.toGeoJSON();

    if (currentFeatures.features.length === 0) {
        alert("저장할 기록이 없습니다.");
        return;
    }

    // 날짜 포맷 생성 (YYMMDD)
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yy}${mm}${dd}`;
    const safeProjectName = project.name.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");

    if (AppState.exportFormat === 'gpx') {
        const gpxData = geoJsonToGpx(currentFeatures, project.name);
        const fileName = `${safeProjectName}_${dateStr}.gpx`;
        saveOrShareFile(gpxData, fileName, "application/gpx+xml");
    } else {
        // GeoJSON (기본)
        currentFeatures.isProjectExport = true;
        currentFeatures.projectName = project.name;
        currentFeatures.exportedAt = new Date().toISOString();

        const fileName = `${safeProjectName}_${dateStr}.geojson`;
        saveOrShareFile(JSON.stringify(currentFeatures), fileName, "application/geo+json");
    }
};


function geoJsonToGpx(geoJson, projectName) {
    // -----------------------------------------------------------
    // [교육용] geoJsonToGpx
    // GeoJSON 데이터를 GPX(XML) 포맷의 문자열로 변환합니다.
    // - GPX 1.1 스키마를 따릅니다.
    // - 사용자 정의 색상(customColor)을 저장하기 위해 <extensions> 태그를 활용합니다.
    //   이는 표준 GPX 스펙은 아니지만, 주요 지도 앱들에서 널리 지원되는 방식입니다.
    // -----------------------------------------------------------
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="F-Field" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${projectName}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>`;

    geoJson.features.forEach(feature => {
        const props = feature.properties || {};
        const name = props.memo || "기록";
        const color = props.customColor || "";
        const coords = feature.geometry.coordinates;

        // [중요] 색상 정보 유지: <extensions><color>#RRGGBB</color></extensions>
        const extensions = color ? `<extensions><color>${color}</color></extensions>` : "";

        if (feature.geometry.type === 'Point') {
            // Point -> <wpt> (Waypoint)
            gpx += `
  <wpt lat="${coords[1]}" lon="${coords[0]}">
    <name>${name}</name>
    <desc>${props.description || ""}</desc>${extensions}
  </wpt>`;
        } else if (feature.geometry.type === 'LineString') {
            // LineString -> <trk> (Track)
            gpx += `
  <trk>
    <name>${name}</name>${extensions}
    <trkseg>`;
            coords.forEach(pt => {
                gpx += `
      <trkpt lat="${pt[1]}" lon="${pt[0]}"></trkpt>`;
            });
            gpx += `
    </trkseg>
  </trk>`;
        } else if (feature.geometry.type === 'Polygon') {
            // Polygon -> Track (Closed Loop)
            // GeoJSON Polygon coordinates are array of rings (usually just one)
            // Ring[0] is the outer boundary
            if (coords.length > 0) {
                gpx += `
  <trk>
    <name>${name} (면)</name>
    <desc>Converted from Polygon</desc>${extensions}
    <trkseg>`;
                coords[0].forEach(pt => {
                    gpx += `
      <trkpt lat="${pt[1]}" lon="${pt[0]}"></trkpt>`;
                });
                gpx += `
    </trkseg>
  </trk>`;
            }
        }
    });

    gpx += `
</gpx>`;
    return gpx;
}

function gpxToGeoJson(gpxText) {
    // -----------------------------------------------------------
    // [교육용] gpxToGeoJson
    // GPX(XML) 문자열을 파싱하여 GeoJSON 객체로 변환합니다.
    // - 브라우저 내장 API인 DOMParser를 사용하여 XML을 탐색합니다.
    // - <wpt>는 Point로, <trk>와 <rte>는 LineString으로 변환합니다.
    // - <extensions> 태그 내의 색상 정보를 추출하여 customColor 속성에 할당합니다.
    // -----------------------------------------------------------
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, "text/xml");
    const features = [];

    // [Helper] 색상 추출 함수
    function getColor(node) {
        // XML 노드 하위의 <extensions> -> <color> 태그 탐색
        const ext = node.getElementsByTagName("extensions")[0];
        if (ext) {
            const colorTag = ext.getElementsByTagName("color")[0];
            if (colorTag) return colorTag.textContent;
        }
        return null;
    }

    // 1. Waypoints (wpt) -> Point Feature
    const wpts = xmlDoc.getElementsByTagName("wpt");
    for (let i = 0; i < wpts.length; i++) {
        const lat = parseFloat(wpts[i].getAttribute("lat"));
        const lon = parseFloat(wpts[i].getAttribute("lon"));
        const name = wpts[i].getElementsByTagName("name")[0]?.textContent || "GPX Point";

        features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: {
                id: Date.now() + i,
                memo: name,
                customColor: getColor(wpts[i]) || '#FF0000', // 저장된 색상 없으면 빨강
                isHidden: false
            }
        });
    }

    // 2. Tracks (trk) -> LineString Feature
    const trks = xmlDoc.getElementsByTagName("trk");
    for (let i = 0; i < trks.length; i++) {
        const name = trks[i].getElementsByTagName("name")[0]?.textContent || "GPX Track";
        const trkpts = trks[i].getElementsByTagName("trkpt");
        const coords = [];

        for (let j = 0; j < trkpts.length; j++) {
            const lat = parseFloat(trkpts[j].getAttribute("lat"));
            const lon = parseFloat(trkpts[j].getAttribute("lon"));
            coords.push([lon, lat]);
        }

        if (coords.length > 1) {
            features.push({
                type: "Feature",
                geometry: { type: "LineString", coordinates: coords },
                properties: { id: Date.now() + 1000 + i, memo: name, customColor: getColor(trks[i]) || '#0040ff', isHidden: false }
            });
        }
    }

    // Routes -> LineString (혹시 모를 지원)
    const rtes = xmlDoc.getElementsByTagName("rte");
    for (let i = 0; i < rtes.length; i++) {
        const name = rtes[i].getElementsByTagName("name")[0]?.textContent || "GPX Route";
        const rtepts = rtes[i].getElementsByTagName("rtept");
        const coords = [];

        for (let j = 0; j < rtepts.length; j++) {
            const lat = parseFloat(rtepts[j].getAttribute("lat"));
            const lon = parseFloat(rtepts[j].getAttribute("lon"));
            coords.push([lon, lat]);
        }

        if (coords.length > 1) {
            features.push({
                type: "Feature",
                geometry: { type: "LineString", coordinates: coords },
                properties: { id: Date.now() + 2000 + i, memo: name, customColor: getColor(rtes[i]) || '#0040ff', isHidden: false }
            });
        }
    }

    return { type: "FeatureCollection", features: features };
}

function saveOrShareFile(content, fileName) {
    // 모바일 공유 기능(Navigator Share API) 지원 시 시도
    if (navigator.canShare && navigator.share) {
        const file = new File([content], fileName, { type: "application/json" });
        if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: 'F-Field 기록' }).catch(err => saveToDevice(content, fileName));
        } else saveToDevice(content, fileName);
    } else {
        saveToDevice(content, fileName);
    }
}

/**
 * [파일 다운로드 (PC/미지원 브라우저)]
 * JavaScript에서 파일을 생성하고 다운로드하게 만드는 표준적인 방법입니다.
 * 
 * 1. Blob 객체 생성: 텍스트 데이터를 바이너리 데이터 덩어리(Blob)로 만듭니다.
 * 2. URL 생성: Blob 객체를 가리키는 임시 URL(blob:...)을 만듭니다.
 * 3. 링크 클릭: 보이지 않는 <a> 태그를 만들어 URL을 연결하고 click() 합니다.
 * 4. 해제: 메모리 누수를 막기 위해 URL 객체를 해제(revokeObjectURL)합니다.
 */
function saveToDevice(content, fileName) {
    const blob = new Blob([content], { type: "application/geo+json" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // URL.revokeObjectURL(a.href); // (선택사항) 메모리 해제
}


export function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;

    const r = new FileReader();
    r.onload = function (e) {
        try {
            let json;
            // GPX 파일 감지 및 변환
            if (file.name.toLowerCase().endsWith('.gpx')) {
                json = gpxToGeoJson(e.target.result);
                // GPX 불러오기는 병합 모드로 동작하도록 유도하거나, 아래에서 통합 처리
            } else {
                json = JSON.parse(e.target.result);
            }

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


export function clearAllData() {
    if (confirm("현재 프로젝트의 모든 기록이 삭제됩니다.")) {
        drawnItems.clearLayers();
        saveToStorage();
        renderSurveyList();
    }
}

export function saveCurrentPoint(lat, lng, addressName) {
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

export function saveCurrentBoundary(addressName) {
    if (!AppState.currentBoundaryLayer) { alert("영역이 선택되지 않았습니다."); return; }
    let shortName = getShortAddress(addressName);
    let addedCount = 0;

    AppState.currentBoundaryLayer.eachLayer(function (layer) {
        const feature = layer.feature;
        const flattened = turf.flatten(feature);

        flattened.features.forEach(function (singleFeature) {
            const uniqueId = Date.now() + addedCount;
            addedCount++;

            const newLayer = L.geoJSON(singleFeature, {
                style: { color: '#FF0000', weight: 4, opacity: 0.8, fillColor: '#FF0000', fillOpacity: AppState.isPolygonFill ? 0.2 : 0 }
            });

            newLayer.eachLayer(function (innerLayer) {
                innerLayer.feature = innerLayer.feature || {};
                innerLayer.feature.properties = {
                    id: uniqueId,
                    memo: shortName || "지적 영역",
                    customColor: '#FF0000',
                    isHidden: false
                };
                updateLayerInfo(innerLayer);
                drawnItems.addLayer(innerLayer);
            });
        });
    });

    saveToStorage();
    renderSurveyList();

    if (AppState.currentBoundaryLayer) {
        map.removeLayer(AppState.currentBoundaryLayer);
        AppState.currentBoundaryLayer = null;
    }

    alert(`영역이 기록되었습니다.\n(${shortName})`);
    openSidebar();
    switchSidebarTab('record');
}

let lastAddressCall = 0;
export function getAddressFromCoords(lat, lng) {
    const now = Date.now();
    if (now - lastAddressCall < 2000) return;
    lastAddressCall = now;

    const callbackName = 'vworld_callback_' + Math.floor(Math.random() * 100000);
    window[callbackName] = function (data) {
        const el = document.getElementById('address-display');
        if (el) el.innerText = (data.response.status === "OK") ? data.response.result[0].text : "주소 정보 없음";
        delete window[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();
    };
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&format=jsonp&type=BOTH&zipcode=false&simple=false&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}