/* ==========================================================================
   [모듈] 데이터 매니저 (data.js)
   [역할] 프로젝트 데이터 저장/불러오기 및 파일(GPX, GeoJSON) 내보내기/가져오기
   ========================================================================== */
import { STORAGE_KEY } from './config.js';
import { AppState } from './state.js';
import { drawnItems } from './draw.js';
import { renderSurveyList, updateLayerInfo, renderProjectSelector, closeSidebar, createNewProject, openSidebar, switchSidebarTab } from './ui.js';
import { getRandomColor, createColoredMarkerIcon, getShortAddress, getTimestampString } from './utils.js';
import { VWORLD_API_KEY } from './config.js';
import { map } from './map.js';
import { download as shpDownload, zip as shpZip } from '@crmackey/shp-write';


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

/**
 * 현재 지도에 표시된(현재 프로젝트) 레이어 전체가 보이도록 뷰를 맞춥니다.
 * @returns {boolean} 이동 성공 여부
 */
export function fitCurrentProjectToMap() {
    const layers = drawnItems.getLayers();
    if (!layers || layers.length === 0) return false;

    const bounds = drawnItems.getBounds();
    if (!bounds || !bounds.isValid()) return false;

    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
    return true;
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
            const emoji = feature.properties.customEmoji || null;
            const size = feature.properties.customMarkerSize || 3;
            const marker = L.marker(latlng, { icon: createColoredMarkerIcon(color, emoji, size) });
            return marker;
        },
        style: function (feature) {
            // 선/면 스타일 적용
            if (feature.geometry.type !== 'Point') {
                const color = feature.properties.customColor || getRandomColor();
                const styleObj = { color: color, fillColor: color };
                if (feature.geometry.type === 'Polygon') {
                    if (feature.properties.customFill === false) {
                        styleObj.fillOpacity = 0;
                    } else if (feature.properties.customFill === true) {
                        styleObj.fillOpacity = 0.2;
                    } else if (!AppState.isPolygonFill) {
                        styleObj.fillOpacity = 0;
                    } else {
                        styleObj.fillOpacity = 0.2;
                    }
                }

                const dashArray = feature.properties.customDashArray;
                if (dashArray === 'none') {
                    styleObj.stroke = false;
                } else if (dashArray) {
                    styleObj.dashArray = dashArray;
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
export async function exportSingleLayer(id) {
    // -----------------------------------------------------------
    // [교육용] exportSingleLayer
    // 선택한 단일 기록(Layer)을 파일로 내보내는 함수입니다.
    // - 모달 팝업에서 GeoJSON / Shapefile / GPX 형식을 선택하여 저장합니다.
    // -----------------------------------------------------------
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    // 파일 형식 선택 모달 표시 (패널 닫형 딥다음 처리)
    let format;
    try {
        format = await showExportFormatModal();
    } catch {
        // 취소 클릭 시 중단
        return;
    }

    // 파일명에 사용할 수 없는 문자 제거
    let safeMemo = (layer.feature.properties.memo || "unnamed").replace(/[\\/:*?"<>|]/g, "_");

    if (format === 'gpx') {
        const featureCollection = {
            type: "FeatureCollection",
            features: [layer.toGeoJSON()]
        };
        const gpxData = geoJsonToGpx(featureCollection, safeMemo);
        saveOrShareFile(gpxData, safeMemo + ".gpx", "application/gpx+xml");
    } else if (format === 'shp') {
        // Shapefile(.zip) 내보내기 (async)
        const featureCollection = {
            type: "FeatureCollection",
            features: [layer.toGeoJSON()]
        };
        try {
            await shpDownload(featureCollection, { name: safeMemo });
        } catch (e) {
            alert('Shapefile 내보내기 실패: ' + e);
        }
    } else {
        // GeoJSON (기본)
        saveOrShareFile(JSON.stringify(layer.toGeoJSON(), null, 2), safeMemo + ".geojson", "application/geo+json");
    }
};

/**
 * [선택 기록 일괄 저장]
 * 전달받은 레이어 배열과 형식을 기반으로 각 기록을 파일로 저장합니다.
 * 모달 없이 이미 선택된 format을 바로 사용합니다.
 */
export async function exportLayerWithFormat(layers, format) {
    if (!layers || layers.length === 0) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);

    // iOS 기기이면서 선택된 레이어가 2개 이상일 경우 하나의 zip(또는 단일 파일)으로 묶어서 처리
    if (isIOS && layers.length > 1) {
        if (format === 'shp') {
            // shp의 경우 각 레이어별로 shp 생성(zip 버퍼) 후, 단일 마스터 ZIP으로 묶어 내보내기
            try {
                const masterZip = new JSZip();
                const nameCounts = {};
                for (let i = 0; i < layers.length; i++) {
                    const layer = layers[i];
                    const baseMemo = (layer.feature.properties.memo || "unnamed").replace(/[\\/:*?"<>|]/g, "_");

                    let safeMemo = baseMemo;
                    if (nameCounts[baseMemo]) {
                        safeMemo = `${baseMemo}_${nameCounts[baseMemo]}`;
                        nameCounts[baseMemo]++;
                    } else {
                        nameCounts[baseMemo] = 1;
                    }

                    const featureCollection = { type: "FeatureCollection", features: [layer.toGeoJSON()] };
                    const shpBuffer = await shpZip(featureCollection);
                    masterZip.file(safeMemo + ".zip", shpBuffer);
                }
                const content = await masterZip.generateAsync({ type: "blob" });
                saveOrShareFile(content, `선택저장_${getTimestampString()}.zip`, "application/zip");
            } catch (e) {
                alert(`Shapefile 일괄 내보내기 실패: ${e}`);
            }
        } else {
            // GPX, GeoJSON은 jszip을 이용해 하나의 ZIP 파일로 압축
            try {
                const zip = new JSZip();
                const nameCounts = {};
                for (let i = 0; i < layers.length; i++) {
                    const layer = layers[i];

                    const baseMemo = (layer.feature.properties.memo || "unnamed").replace(/[\\/:*?"<>|]/g, "_");

                    let safeMemo = baseMemo;
                    if (nameCounts[baseMemo]) {
                        safeMemo = `${baseMemo}_${nameCounts[baseMemo]}`;
                        nameCounts[baseMemo]++;
                    } else {
                        nameCounts[baseMemo] = 1;
                    }

                    if (format === 'gpx') {
                        const featureCollection = { type: "FeatureCollection", features: [layer.toGeoJSON()] };
                        const gpxData = geoJsonToGpx(featureCollection, safeMemo);
                        zip.file(safeMemo + ".gpx", gpxData);
                    } else {
                        zip.file(safeMemo + ".geojson", JSON.stringify(layer.toGeoJSON(), null, 2));
                    }
                }
                const content = await zip.generateAsync({ type: "blob" });
                saveOrShareFile(content, `선택저장_${getTimestampString()}.zip`, "application/zip");
            } catch (e) {
                alert(`ZIP 압축 실패: ${e}`);
            }
        }
        return;
    }

    // 기존 방식 (PC, Android 또는 단일 파일)
    for (const layer of layers) {
        // 파일명에 사용할 수 없는 문자 제거
        const safeMemo = (layer.feature.properties.memo || "unnamed").replace(/[\\/:*?"<>|]/g, "_");

        if (format === 'gpx') {
            const featureCollection = { type: "FeatureCollection", features: [layer.toGeoJSON()] };
            const gpxData = geoJsonToGpx(featureCollection, safeMemo);
            saveOrShareFile(gpxData, safeMemo + ".gpx", "application/gpx+xml");
        } else if (format === 'shp') {
            const featureCollection = { type: "FeatureCollection", features: [layer.toGeoJSON()] };
            try {
                await shpDownload(featureCollection, { name: safeMemo });
            } catch (e) {
                alert(`"${safeMemo}" Shapefile 내보내기 실패: ${e}`);
            }
        } else {
            // GeoJSON 기본
            saveOrShareFile(JSON.stringify(layer.toGeoJSON(), null, 2), safeMemo + ".geojson", "application/geo+json");
        }
    }
}

/**
 * [내보내기 형식 선택 모달]
 * 모달 팝업을 열고, 사용자가 형식을 선택하면 resolve, 취소하면 reject하는 Promise를 반환합니다.
 */
function showExportFormatModal() {
    return new Promise((resolve, reject) => {
        const overlay = document.getElementById('export-format-modal-overlay');
        if (!overlay) { reject(); return; }

        // 기존 resolve 함수가 남아있으면 정리
        window._resolveExportFormat = (format) => {
            closeExportFormatModal();
            resolve(format);
        };

        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('visible'), 10);
    });
}

export function closeExportFormatModal() {
    const overlay = document.getElementById('export-format-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    // resolve를 명시적으로 호출하지 않으면 모달만 닫힌 (Promise는 양재말 대기)
    window._resolveExportFormat = null;
}

// 현재 프로젝트 전체 저장 (뮴조건 GeoJSON, 파일명: project_프로젝트명_날짜)
export function exportCurrentProject() {
    if (!confirm('현재 프로젝트를 기기에 저장합니다.\n프로젝트의 모든 기록이 한 개의 GeoJSON 파일로 저장됩니다.\nGeoJSON 파일은 QGIS에서 불러올 수 있습니다.')) return;

    const project = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (!project) return;

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

    // 프로젝트 내보내기 형식: 무조건 GeoJSON
    currentFeatures.isProjectExport = true;
    currentFeatures.projectName = project.name;
    currentFeatures.exportedAt = new Date().toISOString();

    const fileName = `project_${safeProjectName}_${dateStr}.geojson`;
    saveOrShareFile(JSON.stringify(currentFeatures), fileName, "application/geo+json");
};

export async function backupAllProjects() {
    if (!confirm('모든 프로젝트 파일(.GeoJSON)이 하나의 압축파일(.ZIP)로 저장됩니다.')) return;
    
    // 현재 작성중인 데이터부터 먼저 저장
    await saveToStorage();
    
    try {
        const zip = new JSZip();
        
        // 날짜 포맷 생성 (YYMMDD_HHMM)
        const now = new Date();
        const yy = String(now.getFullYear()).slice(2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const time = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
        const dateStr = `${yy}${mm}${dd}_${time}`;
        
        const nameCounts = {};
        
        for (const p of AppState.projects) {
            let features = p.features;
            if (!features || !features.features) {
                features = { type: "FeatureCollection", features: [] };
            }
            
            features.isProjectExport = true;
            features.projectName = p.name;
            features.exportedAt = new Date().toISOString();
            
            const baseName = (p.name || "unnamed").replace(/[\\/:*?"<>|]/g, "_");
            let safeName = baseName;
            
            if (nameCounts[baseName]) {
                safeName = `${baseName}_${nameCounts[baseName]}`;
                nameCounts[baseName]++;
            } else {
                nameCounts[baseName] = 1;
            }
            
            zip.file(`${safeName}.geojson`, JSON.stringify(features, null, 2));
        }
        
        const content = await zip.generateAsync({ type: "blob" });
        saveOrShareFile(content, `F-field_Backup_${dateStr}.zip`, "application/zip");
    } catch (e) {
        alert("백업 중 오류가 발생했습니다:\n" + e);
        console.error(e);
    }
}

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

function saveOrShareFile(content, fileName, mimeType = "application/json") {
    // 모바일 공유 기능(Navigator Share API) 지원 시 시도
    if (navigator.canShare && navigator.share) {
        const file = new File([content], fileName, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
            // iOS에서 title이나 text를 포함하면 '텍스트.txt' 같은 불필요한 파일이 같이 생성될 수 있으므로 파일만 전달
            navigator.share({ files: [file] }).catch(err => saveToDevice(content, fileName, mimeType));
        } else saveToDevice(content, fileName, mimeType);
    } else {
        saveToDevice(content, fileName, mimeType);
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
function saveToDevice(content, fileName, mimeType = "application/geo+json") {
    const blob = new Blob([content], { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // URL.revokeObjectURL(a.href); // (선택사항) 메모리 해제
}


export async function handleFileSelect(input) {
    // -----------------------------------------------------------
    // [다중 파일 불러오기]
    // - 여러 개의 파일을 동시에 선택해 처리할 수 있습니다.
    // - 프로젝트 파일(isProjectExport === true): 현재 지도에 그리지 않고 AppState.projects에 추가합니다.
    // - 단일 기록 파일: 현재 프로젝트에 레이어를 추가합니다.
    // - .zip 파일: shpjs를 사용해 Shapefile을 GeoJSON으로 변환합니다.
    // -----------------------------------------------------------
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    let newProjectCount = 0; // 백그라운드로 추가된 새 프로젝트 수
    let singleLayerCount = 0; // 현재 지도에 추가된 단일 기록 수
    let mergedDefaultCount = 0; // 기존에 병합된 기본 프로젝트 기록 수
    let errorCount = 0;

    let lastImportedProjectId = null; // 마지막으로 불러온 프로젝트 ID 추적

    for (const file of files) {
        try {
            let json; // 처리된 GeoJSON 객체

            const ext = file.name.toLowerCase().split('.').pop();
            const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

            if (ext === 'zip') {
                // --- Shapefile(.zip) 처리 ---

                // [1차 제한] 파일 용량 10MB 초과 시 차단
                const MAX_SHP_SIZE_MB = 10;
                if (file.size > MAX_SHP_SIZE_MB * 1024 * 1024) {
                    alert(`"${file.name}" 파일 용량이 ${MAX_SHP_SIZE_MB}MB를 초과합니다.\n모바일 환경에서는 처리하기 어렵습니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
                    errorCount++;
                    continue;
                }

                const arrayBuffer = await file.arrayBuffer();
                const geoJsonResult = await shp(arrayBuffer);
                // shpjs는 배열 또는 단일 FeatureCollection 반환
                if (Array.isArray(geoJsonResult)) {
                    // 여러 레이어: 첫 번째 것을 사용
                    json = geoJsonResult[0];
                } else {
                    json = geoJsonResult;
                }

                // 한글 깨짐 문제 방지를 위해, 도형 데이터의 memo를 추출한 파일명으로 덮어쓰기
                if (json && json.features) {
                    json.features.forEach(feature => {
                        if (!feature.properties) feature.properties = {};
                        feature.properties.memo = fileNameWithoutExt;
                    });
                }

                // [2차 제한] 파싱 후 버텍스(꼭짓점) 개수 5만 개 초과 시 차단
                const MAX_VERTICES = 50000;
                const vertexCount = countVertices(json);
                if (vertexCount > MAX_VERTICES) {
                    alert(`"${file.name}" 파일의 버텍스 개수가 너무 많습니다.\n모바일 환경에서는 ${MAX_VERTICES.toLocaleString()}개 이하만 불러올 수 있습니다.\n(현재: ${vertexCount.toLocaleString()}개)`);
                    errorCount++;
                    continue;
                }
            } else if (ext === 'gpx') {
                // --- GPX 처리 ---
                const text = await file.text();
                json = gpxToGeoJson(text);
            } else {
                // --- GeoJSON / JSON 처리 ---
                const text = await file.text();
                json = JSON.parse(text);
            }

            if (!json) {
                console.warn(`파일 변환 결과가 없습니다: ${file.name}`);
                errorCount++;
                continue;
            }

            // --- 프로젝트 파일 vs 단일 기록 파일 분기 ---
            if (json.isProjectExport === true && json.projectName) {
                if (json.projectName === "기본 프로젝트") {
                    const defaultP = AppState.projects.find(p => p.name === "기본 프로젝트");
                    if (defaultP) {
                        const importedFeats = json.features || [];
                        const featuresObj = { type: "FeatureCollection", features: [] };
                        
                        // ID 중복 방지 처리
                        for (let i = 0; i < importedFeats.length; i++) {
                            const f = importedFeats[i];
                            if (f.properties) {
                                f.properties.id = Date.now() + i + Math.floor(Math.random() * 100000);
                            }
                            featuresObj.features.push(f);
                        }
                        
                        if (AppState.currentProjectId === defaultP.id) {
                            // 현재 활성화된 프로젝트가 '기본 프로젝트'면 바로 지도에 추가
                            restoreFeatures(featuresObj);
                        } else {
                            // 백그라운드에서 추가
                            if (!defaultP.features) defaultP.features = { type: "FeatureCollection", features: [] };
                            if (!defaultP.features.features) defaultP.features.features = [];
                            defaultP.features.features.push(...featuresObj.features);
                            defaultP.updatedAt = new Date().toISOString();
                        }
                        
                        mergedDefaultCount += importedFeats.length;
                        continue; // 파일 처리 완료
                    }
                }

                let importedName = json.projectName;
                
                // 중복 이름 확인: 이미 존재하는 이름이면 (2), (3)... 등 붙이기
                let baseName = importedName;
                if (AppState.projects.some(p => p.name === baseName)) {
                    let cnt = 2;
                    while (AppState.projects.some(p => p.name === `${baseName} (${cnt})`)) {
                        cnt++;
                    }
                    importedName = `${baseName} (${cnt})`;
                }

                // [백그라운드 추가] 프로젝트 파일 → AppState.projects에 새 프로젝트로 추가
                const newProject = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    name: importedName,
                    features: json, // FeatureCollection 그대로 저장
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                AppState.projects.push(newProject);
                lastImportedProjectId = newProject.id; // 마지막 프로젝트 ID 기록
                newProjectCount++;
            } else {
                // [포그라운드 추가] 단일 기록 파일 → 현재 지도에 레이어 추가
                restoreFeatures(json);
                singleLayerCount++;
            }

        } catch (err) {
            console.error(`파일 처리 실패 [${file.name}]:`, err);
            errorCount++;
        }
    }

    // 모든 파일 처리 후 한 번만 저장 및 UI 갱신
    await saveToStorage();

    // 프로젝트를 불러온 경우 마지막 불러온 프로젝트를 자동 선택하여 지도에 표시
    if (lastImportedProjectId !== null) {
        AppState.currentProjectId = lastImportedProjectId;
        loadCurrentProjectFeatures();
    }

    renderProjectSelector();

    // 결과 알림
    const msgs = [];
    if (singleLayerCount > 0) msgs.push(`기록 ${singleLayerCount}건이 현재 프로젝트에 추가되었습니다.`);
    if (mergedDefaultCount > 0) msgs.push(`기본 프로젝트 기록 ${mergedDefaultCount}건이 앱의 기본 프로젝트에 병합되었습니다.`);
    if (newProjectCount > 0) msgs.push(`프로젝트 ${newProjectCount}개가 새로 추가되었습니다.`);
    if (errorCount > 0) msgs.push(`${errorCount}개 파일 처리 중 오류가 발생했습니다.`);

    if (msgs.length > 0) alert(msgs.join('\n'));

    input.value = ''; // 파일 input 초기화
}

/**
 * GeoJSON FeatureCollection 내 모든 버텍스(꼭짓점) 개수를 계산합니다.
 * coordinates 배열을 재귀적으로 순회해 [number, number] 쌍의 총 개수를 반환합니다.
 */
function countVertices(geojson) {
    if (!geojson) return 0;
    const features = geojson.features || [];

    // coordinates 배열에서 꼭짓점 개수 재귀 카운트
    function countCoords(coords) {
        if (!Array.isArray(coords)) return 0;
        // 가장 안쪽: [number, number] 형태인지 확인
        if (typeof coords[0] === 'number') return 1;
        return coords.reduce((sum, c) => sum + countCoords(c), 0);
    }

    return features.reduce((total, feature) => {
        if (!feature.geometry || !feature.geometry.coordinates) return total;
        return total + countCoords(feature.geometry.coordinates);
    }, 0);
}

export function clearAllData() {
    if (confirm("모든 프로젝트와 기록이 삭제되고, 앱이 최초 상태로 초기화됩니다.\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?")) {
        drawnItems.clearLayers();

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
