/* ==========================================================================
   [모듈] 데이터 관리 모듈 (data.js)
   [역할]
   - 프로젝트/레이어 데이터를 브라우저 저장소(localForage)와 동기화합니다.
   - GeoJSON/GPX/Shapefile 파일의 내보내기와 가져오기를 처리합니다.
   - 현재 위치/영역 저장과 좌표 기반 주소 조회를 지원합니다.
   [동작 원리 요약]
   - 화면의 실제 도형 상태(drawnItems)를 GeoJSON으로 바꿔 AppState에 반영한 뒤 저장합니다.
   - 파일 입출력은 내부 표준 구조(GeoJSON FeatureCollection)로 한 번 통일해서 처리합니다.
   - 비동기 I/O(localForage, 파일 파싱, 압축)는 async/await로 순서를 보장합니다.
   ========================================================================== */
import { STORAGE_KEY } from './config.js?v=2.4.11';
import { AppState } from './state.js?v=2.4.11';
import { drawnItems } from './draw.js?v=2.4.11';
import { renderSurveyList, updateLayerInfo, renderProjectSelector, closeSidebar, createNewProject, openSidebar, switchSidebarTab } from './ui.js?v=2.4.11';
import { getRandomColor, createColoredMarkerIcon, getShortAddress, getTimestampString } from './utils.js?v=2.4.11';
import { VWORLD_API_KEY } from './config.js?v=2.4.11';
import { map } from './map.js?v=2.4.11';
import { zip as shpZip } from '@crmackey/shp-write';


/* ==========================================================================
   1) 프로젝트 저장/복원
   ========================================================================== */
/**
 * 현재 프로젝트 상태를 localForage(IndexedDB)에 저장합니다.
 * 동작 원리: "지도 레이어 -> AppState -> IndexedDB" 순서로 단계를 분리해
 * 저장 시점의 화면 상태와 저장소 상태가 일치하도록 만듭니다.
 */
export async function saveToStorage() {
    // 프로젝트가 아직 선택되지 않은 초기 상태라면 저장하지 않습니다.
    if (!AppState.currentProjectId) return;

    // currentProjectId는 UI/저장 과정에서 문자열일 수 있어 parseInt로 타입을 맞춘 뒤 비교합니다.
    const projectIndex = AppState.projects.findIndex(p => p.id === parseInt(AppState.currentProjectId));
    if (projectIndex !== -1) {
        const orderedLayers = getLayersForStorageOrder();
        orderedLayers.forEach((layer, index) => {
            if (!layer.feature) layer.feature = { type: "Feature", properties: {} };
            if (!layer.feature.properties) layer.feature.properties = {};
            layer.feature.properties.displayOrder = index;
        });

        // Leaflet 레이어는 직렬화가 어려우므로 표준 포맷(GeoJSON)으로 변환해 저장 가능한 형태로 바꿉니다.
        AppState.projects[projectIndex].features = {
            type: "FeatureCollection",
            features: orderedLayers.map(layer => layer.toGeoJSON())
        };
        AppState.projects[projectIndex].updatedAt = new Date().toISOString();

        // UI에서 프로젝트 이름을 변경한 경우 저장 데이터와 이름을 맞춥니다.
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

    // localForage는 내부적으로 IndexedDB를 사용해 큰 객체도 문자열 변환 없이 저장할 수 있습니다.
    try {
        await localforage.setItem(STORAGE_KEY, storageData);
    } catch (err) {
        console.error("Storage save failed:", err);
        alert("데이터 저장 실패: " + err);
    }
}

function getLayersForStorageOrder() {
    return [...drawnItems.getLayers()].sort((a, b) => {
        const orderA = Number(a.feature?.properties?.displayOrder);
        const orderB = Number(b.feature?.properties?.displayOrder);
        const hasOrderA = Number.isFinite(orderA);
        const hasOrderB = Number.isFinite(orderB);

        if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB;
        if (hasOrderA !== hasOrderB) return hasOrderA ? -1 : 1;

        return (a.feature?.properties?.id || 0) - (b.feature?.properties?.id || 0);
    });
}

/**
 * 저장소에서 프로젝트 데이터를 불러오고, 필요하면 구버전 데이터를 마이그레이션합니다.
 * 동작 원리: 먼저 "구버전 호환"을 처리하고, 이후 "현재 버전 복원"을 수행합니다.
 */
export async function loadFromStorage() {
    try {
        // 1) 예전 LocalStorage 데이터가 있으면 localForage로 1회 이전합니다.
        //    (LocalStorage는 용량/성능 제약이 커서 IndexedDB 기반 저장소로 이동)
        const oldData = localStorage.getItem(STORAGE_KEY);
        if (oldData) {
            console.log("Migrating from LocalStorage to localForage...");
            try {
                const parsedOld = JSON.parse(oldData);
                await localforage.setItem(STORAGE_KEY, parsedOld);
                localStorage.removeItem(STORAGE_KEY);
                console.log("Migration successful.");
            } catch (e) {
                console.error("Migration failed:", e);
            }
        }

        // 2) 현재 저장소(localForage)에서 데이터를 읽습니다.
        const savedData = await localforage.getItem(STORAGE_KEY);

        if (!savedData) {
            initDefaultProject();
            return;
        }

        // localForage는 JSON 문자열이 아니라 객체를 반환합니다.
        const parsed = savedData;

        // 저장 데이터 형식(레거시/신버전)을 확인해 복원합니다.
        // 형식을 먼저 판별해두면 이후 코드가 단순해지고 예외 케이스가 줄어듭니다.
        if (Array.isArray(parsed) || (parsed.type === "FeatureCollection")) {
            console.log("Legacy data detected. Migrating...");
            await migrateLegacyData(parsed);
        } else if (parsed.version === "2.0") {
            AppState.projects = parsed.projects || [];
            AppState.currentProjectId = parsed.currentProjectId;

            // 비정상 데이터(프로젝트 없음)라면 기본 프로젝트를 다시 만듭니다.
            if (AppState.projects.length === 0) {
                initDefaultProject();
            } else {
                // 앱 시작 시에는 마지막으로 열었던 프로젝트 대신 기본 프로젝트를 우선 선택합니다.
                const defaultProject = AppState.projects.find(p => p.name === "기본 프로젝트");
                if (defaultProject) {
                    AppState.currentProjectId = defaultProject.id;
                } else if (!AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId))) {
                    // 현재 ID가 유효하지 않으면 첫 프로젝트를 기본 선택으로 설정합니다.
                    AppState.currentProjectId = AppState.projects[0].id;
                }
                renderProjectSelector();
                loadCurrentProjectFeatures();
            }
        } else {
            // 알 수 없는 포맷이면 안전하게 초기화합니다.
            initDefaultProject();
        }
    } catch (e) {
        console.error("Load failed:", e);
        initDefaultProject();
    }
}

/**
 * 앱 최초 실행 상태에서 사용할 기본 프로젝트를 생성합니다.
 * 동작 원리: 최소 1개의 프로젝트가 항상 존재하도록 보장해
 * 이후 로직(선택, 렌더링, 저장)이 null 체크 없이 동작하게 만듭니다.
 */
function initDefaultProject() {
    const defaultProject = {
        // Date.now()를 간단한 유니크 ID로 사용합니다(충분히 낮은 충돌 확률).
        id: Date.now(),
        name: "기본 프로젝트",
        features: { type: "FeatureCollection", features: [] },
        createdAt: new Date().toISOString()
    };
    AppState.projects = [defaultProject];
    AppState.currentProjectId = defaultProject.id;

    saveToStorage();
    renderProjectSelector();
}

/**
 * 레거시 형식(배열 또는 FeatureCollection)을 현재 프로젝트 구조로 변환합니다.
 * 동작 원리: "형식 통일 -> 상태 반영 -> 화면 복원 -> 저장" 순서로 진행합니다.
 */
async function migrateLegacyData(legacyData) {
    // 배열 형식이라면 FeatureCollection으로 감싸 표준 구조로 통일합니다.
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
    // 복원 후 저장 순서를 지켜야 다음 실행 시에도 동일한 구조를 유지할 수 있습니다.
    // (저장을 먼저 하면 화면 상태와 저장 상태가 어긋날 수 있음)
    loadCurrentProjectFeatures();
    await saveToStorage();

}

/**
 * 현재 선택된 프로젝트의 레이어를 지도에 다시 표시합니다.
 * 동작 원리: "초기화 후 재구성" 방식으로 중복 렌더링을 방지합니다.
 */
export function loadCurrentProjectFeatures() {
    // 기존 지도 레이어를 먼저 비워야, 프로젝트 전환 시 이전 프로젝트 도형이 남지 않습니다.
    drawnItems.clearLayers();

    const project = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (project && project.features) {
        restoreFeatures(project.features);
    }

    // 레이어 리스트 UI를 현재 지도 상태와 동기화합니다.
    renderSurveyList();
}

/**
 * 현재 지도에 표시된(현재 프로젝트) 레이어 전체가 보이도록 뷰를 맞춥니다.
 * 동작 원리: 레이어 그룹의 bounds를 계산해 map.fitBounds로 카메라를 자동 이동합니다.
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

/**
 * SHP/DBF 불러오기 시 잘릴 수 있는 속성명(최대 10자)을 표준 키로 보정합니다.
 * 동작 원리:
 * - DBF 필드 길이 제한으로 `customColor -> customcolo`처럼 잘린 키를 원래 키로 매핑합니다.
 * - 타입(숫자/불리언)으로 쓰이는 값은 후속 렌더링 충돌을 막기 위해 한 번 더 정규화합니다.
 */
function normalizeImportedFeatureProperties(feature) {
    if (!feature || typeof feature !== 'object') return;
    const props = feature.properties || (feature.properties = {});

    const pickFirstDefined = (keys) => {
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(props, key) && props[key] !== undefined && props[key] !== null && props[key] !== '') {
                return props[key];
            }
        }
        return undefined;
    };

    const assignIfMissing = (targetKey, aliasKeys) => {
        if (props[targetKey] !== undefined && props[targetKey] !== null && props[targetKey] !== '') return;
        const value = pickFirstDefined(aliasKeys);
        if (value !== undefined) props[targetKey] = value;
    };

    assignIfMissing('customColor', ['customcolo', 'CUSTOMCOLO', 'customcolor', 'CUSTOMCOLOR', 'color', 'COLOR']);
    assignIfMissing('customEmoji', ['customemoj', 'CUSTOMEMOJ']);
    assignIfMissing('customMarkerSize', ['custommarke', 'CUSTOMMARKE']);
    assignIfMissing('customDashArray', ['customdash', 'CUSTOMDASH']);
    assignIfMissing('customWeight', ['customweig', 'CUSTOMWEIG', 'weight', 'WEIGHT']);
    assignIfMissing('customFillOpacity', ['customfill', 'CUSTOMFILL', 'fillopacit', 'FILLOPACIT']);
    assignIfMissing('description', ['descriptio', 'DESCRIPTIO']);

    if (props.customMarkerSize !== undefined) {
        const parsed = parseInt(props.customMarkerSize, 10);
        if (!Number.isNaN(parsed)) {
            props.customMarkerSize = Math.min(5, Math.max(1, parsed));
        }
    }
    if (props.customWeight !== undefined) {
        const parsed = parseInt(props.customWeight, 10);
        if (!Number.isNaN(parsed)) {
            props.customWeight = Math.min(5, Math.max(1, parsed));
        }
    }
    if (props.customFillOpacity !== undefined) {
        const parsed = parseFloat(props.customFillOpacity);
        if (!Number.isNaN(parsed)) {
            props.customFillOpacity = Math.min(1, Math.max(0, parsed));
        }
    }

    if (typeof props.isHidden === 'string') {
        const v = props.isHidden.trim().toLowerCase();
        props.isHidden = (v === 'true' || v === 't' || v === '1' || v === 'y');
    }
    if (typeof props.customFill === 'string') {
        const v = props.customFill.trim().toLowerCase();
        props.customFill = (v === 'true' || v === 't' || v === '1' || v === 'y');
    }
}

/**
 * GeoJSON을 Leaflet 레이어로 복원해 현재 프로젝트 레이어 그룹(drawnItems)에 추가합니다.
 * 동작 원리: L.geoJSON의 콜백(pointToLayer/style/onEachFeature)으로
 * 지오메트리 타입별 생성 규칙, 스타일 규칙, 속성 후처리를 분리합니다.
 */
export function restoreFeatures(geoJsonData) {
    const orderedGeoJsonData = getGeoJsonDataInDisplayOrder(geoJsonData);

    L.geoJSON(orderedGeoJsonData, {
        pointToLayer: function (feature, latlng) {
            // Point는 pointToLayer 콜백이 호출될 때마다 개별 마커로 생성됩니다.
            // 이때 색상/이모지/크기를 아이콘 옵션에 주입해 시각 상태를 복원합니다.
            normalizeImportedFeatureProperties(feature);
            const props = feature.properties || (feature.properties = {});
            if (!props.customColor) props.customColor = getRandomColor();

            const color = props.customColor;
            const emoji = props.customEmoji || null;
            const size = props.customMarkerSize || 3;
            const marker = L.marker(latlng, { icon: createColoredMarkerIcon(color, emoji, size) });
            return marker;
        },
        style: function (feature) {
            normalizeImportedFeatureProperties(feature);
            // style 콜백은 Point를 제외한 지오메트리에 적용됩니다.
            // 반환한 styleObj가 Leaflet path 옵션으로 적용됩니다.
            if (feature.geometry.type !== 'Point') {
                const color = feature.properties.customColor || getRandomColor();
                const weight = Number.isFinite(Number(feature.properties.customWeight))
                    ? Math.min(5, Math.max(1, parseInt(feature.properties.customWeight, 10)))
                    : 3;
                const styleObj = { color: color, fillColor: color, weight: weight };
                if (feature.geometry.type === 'Polygon') {
                    if (Number.isFinite(Number(feature.properties.customFillOpacity))) {
                        styleObj.fillOpacity = Math.min(1, Math.max(0, parseFloat(feature.properties.customFillOpacity)));
                    } else if (feature.properties.customFill === false) {
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
            normalizeImportedFeatureProperties(feature);
            // onEachFeature는 레이어 생성 직후 1회 호출되며, 속성 연결/후처리를 수행합니다.
            if (feature.properties) {
                // 필수 속성(id, customColor)이 없으면 기본값을 채웁니다.
                if (!feature.properties.id) feature.properties.id = Date.now() + Math.floor(Math.random() * 1000);
                if (!feature.properties.customColor) {
                    if (layer.options.icon) {
                        // 마커는 pointToLayer에서 이미 customColor를 보정합니다.
                        feature.properties.customColor = feature.properties.customColor || '#FF0000';
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

    // 레이어 복원 완료 후 목록 UI를 다시 렌더링해 "지도 상태 = 목록 상태"를 맞춥니다.
    renderSurveyList();
}

function getGeoJsonDataInDisplayOrder(geoJsonData) {
    if (!geoJsonData || !Array.isArray(geoJsonData.features)) return geoJsonData;

    return {
        ...geoJsonData,
        features: [...geoJsonData.features].sort((a, b) => {
            const orderA = Number(a.properties?.displayOrder);
            const orderB = Number(b.properties?.displayOrder);
            const hasOrderA = Number.isFinite(orderA);
            const hasOrderB = Number.isFinite(orderB);

            if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB;
            if (hasOrderA !== hasOrderB) return hasOrderA ? -1 : 1;

            return (a.properties?.id || 0) - (b.properties?.id || 0);
        })
    };
}

/* ==========================================================================
   2) 파일 내보내기
   ========================================================================== */
/**
 * Shapefile 내보내기 옵션을 생성합니다.
 * 동작 원리:
 * - zip 파일명(name)과 내부 shp/shx/dbf/prj 파일 basename(types)을 같은 값으로 고정합니다.
 * - @crmackey/shp-write는 선 타입 키로 `polyline`을 사용하므로 line/ polyline 둘 다 설정합니다.
 */
function buildShpExportOptions(baseName) {
    return {
        name: baseName,
        types: {
            point: baseName,
            multipoint: baseName,
            line: baseName,
            polyline: baseName,
            polygon: baseName,
            pointz: baseName,
            multipointz: baseName,
            polylinez: baseName,
            polygonz: baseName
        }
    };
}

/**
 * Blob/ArrayBuffer/TypedArray 입력을 ArrayBuffer로 정규화합니다.
 */
async function toArrayBuffer(data) {
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    if (data && typeof data.arrayBuffer === "function") return await data.arrayBuffer();
    throw new Error("지원하지 않는 바이너리 형식입니다.");
}

/**
 * SHP ZIP 내부의 .shp/.shx 쌍을 검사해, 뒤쪽 0 패딩이 있으면 자동 보정합니다.
 * 동작 원리:
 * - SHX 인덱스로 SHP 유효 길이를 계산한 뒤 0 패딩 꼬리를 제거합니다.
 * - 보정이 발생한 경우에만 ZIP을 재생성합니다.
 */
async function sanitizeShpZipPaddingIfNeeded(rawZipData) {
    if (typeof JSZip === "undefined") return rawZipData;

    const zipArrayBuffer = await toArrayBuffer(rawZipData);
    const zip = await JSZip.loadAsync(zipArrayBuffer);
    const allEntries = Object.values(zip.files).filter(entry => !entry.dir);
    const shpEntries = allEntries.filter(entry => /\.shp$/i.test(entry.name));
    if (shpEntries.length === 0) return rawZipData;

    const findSiblingEntry = (baseName, ext) => {
        const target = `${baseName}.${ext}`.toLowerCase();
        return allEntries.find(entry => entry.name.toLowerCase() === target) || null;
    };

    let hasAnyFix = false;

    for (const shpEntry of shpEntries) {
        const baseName = shpEntry.name.replace(/\.shp$/i, '');
        const shxEntry = findSiblingEntry(baseName, 'shx');
        if (!shxEntry) continue;

        const shpBuffer = await shpEntry.async('arraybuffer');
        const shxBuffer = await shxEntry.async('arraybuffer');
        const fixedShpBuffer = trimShpPaddingByShx(shpBuffer, shxBuffer, shpEntry.name);

        if (fixedShpBuffer.byteLength !== shpBuffer.byteLength) {
            hasAnyFix = true;
            zip.file(shpEntry.name, fixedShpBuffer);
        }
    }

    if (!hasAnyFix) return rawZipData;
    return await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

/**
 * SHP ZIP을 생성하고, 필요 시 패딩 보정을 적용해 안정적인 결과를 반환합니다.
 */
async function generateStableShpZip(featureCollection, baseName) {
    const rawZip = await shpZip(featureCollection, buildShpExportOptions(baseName));
    return await sanitizeShpZipPaddingIfNeeded(rawZip);
}

/**
 * 단일 SHP ZIP을 생성해 파일로 저장합니다.
 */
async function exportShpFile(featureCollection, baseName) {
    const stableZip = await generateStableShpZip(featureCollection, baseName);
    saveOrShareFile(stableZip, `${baseName}.zip`, "application/zip");
}

/**
 * 현재 프로젝트에서 선택한 단일 레이어를 원하는 포맷으로 저장합니다.
 * 동작 원리: 사용자가 포맷을 고르면 동일한 레이어를 포맷별 변환기(GeoJSON/GPX/SHP)로 보냅니다.
 */
export async function exportSingleLayer(id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    // 모달은 Promise 기반으로 동작하며, 사용자가 선택한 값이 resolve로 반환됩니다.
    let format;
    try {
        format = await showExportFormatModal();
    } catch {
        // 모달 취소 시 함수 실행을 종료합니다.
        return;
    }

    // 운영체제마다 파일명 제한 문자가 있어, 저장 실패를 막기 위해 안전 문자로 치환합니다.
    let safeMemo = (layer.feature.properties.memo || "unnamed").replace(/[\\/:*?"<>|]/g, "_");

    if (format === 'gpx') {
        const featureCollection = {
            type: "FeatureCollection",
            features: [layer.toGeoJSON()]
        };
        const gpxData = geoJsonToGpx(featureCollection, safeMemo);
        saveOrShareFile(gpxData, safeMemo + ".gpx", "application/gpx+xml");
    } else if (format === 'shp') {
        // Shapefile은 여러 파일(.shp/.shx/.dbf...) 세트라 라이브러리가 zip으로 묶어 생성합니다.
        const featureCollection = {
            type: "FeatureCollection",
            features: [layer.toGeoJSON()]
        };
        try {
            await exportShpFile(featureCollection, safeMemo);
        } catch (e) {
            alert('Shapefile 내보내기 실패: ' + e);
        }
    } else {
        // GeoJSON은 JSON 텍스트라 pretty 출력(null, 2)으로 디버깅/확인이 쉽습니다.
        saveOrShareFile(JSON.stringify(layer.toGeoJSON(), null, 2), safeMemo + ".geojson", "application/geo+json");
    }
};

/**
 * 선택된 여러 레이어를 지정한 포맷으로 일괄 저장합니다.
 * iOS에서 다중 파일 저장 제한이 있어, 2개 이상이면 ZIP으로 묶어 처리합니다.
 * 동작 원리: 기기 조건(iOS 여부 + 파일 개수)을 먼저 판별해 저장 전략을 분기합니다.
 */
export async function exportLayerWithFormat(layers, format) {
    if (!layers || layers.length === 0) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);

    // iOS Safari는 다중 다운로드 UX가 제한적이어서 한 번의 ZIP 다운로드로 우회합니다.
    if (isIOS && layers.length > 1) {
        if (format === 'shp') {
            // SHP는 레이어마다 생성물이 이미 zip이므로, master zip 안에 다시 파일로 넣는 구조입니다.
            try {
                const masterZip = new JSZip();
                const nameCounts = {};
                for (let i = 0; i < layers.length; i++) {
                    const layer = layers[i];
                    const baseMemo = (layer.feature.properties.memo || "unnamed").replace(/[\\/:*?"<>|]/g, "_");

                    let safeMemo = baseMemo;
                    // 같은 이름 파일이 겹치면 덮어쓰기 되므로 카운터를 붙여 고유 파일명으로 만듭니다.
                    if (nameCounts[baseMemo]) {
                        safeMemo = `${baseMemo}_${nameCounts[baseMemo]}`;
                        nameCounts[baseMemo]++;
                    } else {
                        nameCounts[baseMemo] = 1;
                    }

                    const featureCollection = { type: "FeatureCollection", features: [layer.toGeoJSON()] };
                    const shpBuffer = await generateStableShpZip(featureCollection, safeMemo);
                    masterZip.file(safeMemo + ".zip", shpBuffer);
                }
                const content = await masterZip.generateAsync({ type: "blob" });
                saveOrShareFile(content, `선택저장_${getTimestampString()}.zip`, "application/zip");
            } catch (e) {
                alert(`Shapefile 일괄 내보내기 실패: ${e}`);
            }
        } else {
            // GPX/GeoJSON은 텍스트 결과물을 직접 ZIP 엔트리로 추가할 수 있습니다.
            try {
                const zip = new JSZip();
                const nameCounts = {};
                for (let i = 0; i < layers.length; i++) {
                    const layer = layers[i];

                    const baseMemo = (layer.feature.properties.memo || "unnamed").replace(/[\\/:*?"<>|]/g, "_");

                    let safeMemo = baseMemo;
                    // 같은 이름 충돌 방지
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

    // PC/Android 또는 단일 파일은 브라우저 다운로드를 반복 호출해 바로 저장합니다.
    for (const layer of layers) {
        // 파일명 충돌/오류를 줄이기 위해 이름 정규화
        const safeMemo = (layer.feature.properties.memo || "unnamed").replace(/[\\/:*?"<>|]/g, "_");

        if (format === 'gpx') {
            const featureCollection = { type: "FeatureCollection", features: [layer.toGeoJSON()] };
            const gpxData = geoJsonToGpx(featureCollection, safeMemo);
            saveOrShareFile(gpxData, safeMemo + ".gpx", "application/gpx+xml");
        } else if (format === 'shp') {
            const featureCollection = { type: "FeatureCollection", features: [layer.toGeoJSON()] };
            try {
                await exportShpFile(featureCollection, safeMemo);
            } catch (e) {
                alert(`"${safeMemo}" Shapefile 내보내기 실패: ${e}`);
            }
        } else {
            // 지정 포맷이 없으면 기본값으로 GeoJSON 저장
            saveOrShareFile(JSON.stringify(layer.toGeoJSON(), null, 2), safeMemo + ".geojson", "application/geo+json");
        }
    }
}

/**
 * 내보내기 포맷 선택 모달을 열고, 선택 결과를 Promise로 반환합니다.
 * 동작 원리: 모달 버튼이 window._resolveExportFormat(format)을 호출하면 Promise가 완료됩니다.
 */
function showExportFormatModal() {
    return new Promise((resolve, reject) => {
        const overlay = document.getElementById('export-format-modal-overlay');
        if (!overlay) { reject(); return; }

        // 모달 내부 버튼(onclick)에서 접근하기 쉽게 전역 함수로 연결합니다.
        window._resolveExportFormat = (format) => {
            closeExportFormatModal();
            resolve(format);
        };

        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('visible'), 10);
    });
}

/**
 * 내보내기 모달을 닫고, 이전 선택 콜백을 정리합니다.
 * 동작 원리: 콜백 참조를 지워 이전 모달 상태가 다음 모달 호출에 누수되지 않게 합니다.
 */
export function closeExportFormatModal() {
    const overlay = document.getElementById('export-format-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    // 선택 없이 닫힐 수 있으므로 전역 콜백만 정리합니다.
    window._resolveExportFormat = null;
}

/**
 * 현재 프로젝트 전체를 하나의 GeoJSON 파일로 저장합니다.
 * 동작 원리: FeatureCollection에 프로젝트 메타 필드를 추가해
 * 다시 가져올 때 "프로젝트 파일"임을 판별할 수 있게 합니다.
 */
export function exportCurrentProject() {
    if (!confirm('현재 프로젝트를 기기에 저장합니다.\n프로젝트의 모든 기록이 한 개의 GeoJSON 파일로 저장됩니다.\nGeoJSON 파일은 QGIS에서 불러올 수 있습니다.')) return;

    const project = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (!project) return;

    const currentFeatures = drawnItems.toGeoJSON();

    if (currentFeatures.features.length === 0) {
        alert("저장할 기록이 없습니다.");
        return;
    }

    // 날짜를 파일명에 넣으면 같은 이름의 백업을 구분하기 쉽습니다.
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yy}${mm}${dd}`;
    const safeProjectName = project.name.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");

    // 앱 내부에서 인식할 메타 필드(프로젝트 내보내기 여부/이름/시각)를 주입합니다.
    currentFeatures.isProjectExport = true;
    currentFeatures.projectName = project.name;
    currentFeatures.exportedAt = new Date().toISOString();

    const fileName = `project_${safeProjectName}_${dateStr}.geojson`;
    saveOrShareFile(JSON.stringify(currentFeatures), fileName, "application/geo+json");
};

/**
 * 모든 프로젝트를 각각 GeoJSON으로 만든 뒤 하나의 ZIP으로 백업합니다.
 * 동작 원리: 프로젝트 단위 파일을 ZIP 엔트리로 추가해 "한 번에 백업/복원"을 가능하게 합니다.
 */
export async function backupAllProjects() {
    if (!confirm('모든 프로젝트 파일(.GeoJSON)이 하나의 압축파일(.ZIP)로 저장됩니다.')) return;
    
    // 저장 직전의 편집 내용을 누락하지 않기 위해 먼저 저장 동기화를 수행합니다.
    await saveToStorage();
    
    try {
        const zip = new JSZip();
        
        // 초 단위까지는 필요 없어서 분 단위(YYMMDD_HHMM)로 백업 버전을 구분합니다.
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
            
            // 같은 프로젝트명 충돌 시 파일명이 덮어써지지 않도록 번호를 붙입니다.
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

/* ==========================================================================
   3) 포맷 변환/저장 유틸리티
   ========================================================================== */
/**
 * GeoJSON FeatureCollection을 GPX(XML 문자열)로 변환합니다.
 * 동작 원리: 지오메트리 타입(Point/LineString/Polygon)을 GPX 요소(wpt/trk)로 매핑해 직렬화합니다.
 */
function geoJsonToGpx(geoJson, projectName) {
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

        // GPX 표준엔 색상 필드가 없어서 extensions에 customColor를 넣어 앱 간 색상 손실을 줄입니다.
        const extensions = color ? `<extensions><color>${color}</color></extensions>` : "";

        if (feature.geometry.type === 'Point') {
            // Point는 단일 좌표이므로 waypoint(wpt)로 1:1 매핑합니다.
            gpx += `
  <wpt lat="${coords[1]}" lon="${coords[0]}">
    <name>${name}</name>
    <desc>${props.description || ""}</desc>${extensions}
  </wpt>`;
        } else if (feature.geometry.type === 'LineString') {
            // 선(LineString)은 순서가 있는 점 목록이므로 track(trk/trkseg/trkpt) 구조로 변환합니다.
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
            // Polygon은 GPX 면 타입이 없으므로 외곽 링을 닫힌 track처럼 저장합니다.
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

/**
 * GPX(XML 문자열)를 GeoJSON FeatureCollection으로 변환합니다.
 * 동작 원리: XML 노드를 읽어 좌표 배열을 만들고, GeoJSON Feature 객체로 재조립합니다.
 */
function gpxToGeoJson(gpxText) {
    // DOMParser는 문자열 XML을 탐색 가능한 문서 객체(DOM)로 바꿔줍니다.
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, "text/xml");
    const features = [];

    // extensions/color가 있으면 복원하고, 없으면 null을 반환해 호출부 기본값을 사용합니다.
    function getColor(node) {
        const ext = node.getElementsByTagName("extensions")[0];
        if (ext) {
            const colorTag = ext.getElementsByTagName("color")[0];
            if (colorTag) return colorTag.textContent;
        }
        return null;
    }

    // waypoint(wpt) -> GeoJSON Point
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
                // 과거/외부 GPX는 색상이 없는 경우가 많아 앱 기본색으로 보정합니다.
                customColor: getColor(wpts[i]) || '#FF0000',
                isHidden: false
            }
        });
    }

    // track(trk) -> GeoJSON LineString
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
                properties: { id: Date.now() + 1000 + i, memo: name, customColor: getColor(trks[i]) || '#0040ff', customWeight: 3, isHidden: false }
            });
        }
    }

    // route(rte)도 선형 데이터이므로 LineString으로 동일 처리합니다.
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
                properties: { id: Date.now() + 2000 + i, memo: name, customColor: getColor(rtes[i]) || '#0040ff', customWeight: 3, isHidden: false }
            });
        }
    }

    return { type: "FeatureCollection", features: features };
}

/**
 * 가능한 경우 모바일 공유 API를 사용하고, 불가능하면 다운로드로 저장합니다.
 * 동작 원리: capability detection(navigator.canShare)로 런타임에서 지원 여부를 판별합니다.
 */
function saveOrShareFile(content, fileName, mimeType = "application/json") {
    // 지원 환경에서는 공유 시트로 넘기고, 실패/미지원이면 다운로드 fallback으로 처리합니다.
    if (navigator.canShare && navigator.share) {
        const file = new File([content], fileName, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
            // iOS에서는 files만 넘겨야 불필요한 텍스트 파일이 생성되지 않습니다.
            navigator.share({ files: [file] }).catch(err => saveToDevice(content, fileName, mimeType));
        } else saveToDevice(content, fileName, mimeType);
    } else {
        saveToDevice(content, fileName, mimeType);
    }
}

/**
 * 브라우저 다운로드 방식으로 파일을 기기에 저장합니다.
 * 동작 원리: Blob -> objectURL -> 숨김 a 태그 클릭 순서로 브라우저 다운로드를 트리거합니다.
 */
function saveToDevice(content, fileName, mimeType = "application/geo+json") {
    const blob = new Blob([content], { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 필요하면 URL.revokeObjectURL(a.href)로 메모리를 즉시 해제할 수 있습니다.
}


/* ==========================================================================
   4) 파일 가져오기
   ========================================================================== */
/**
 * shpjs 파싱 결과를 FeatureCollection으로 정규화합니다.
 * 동작 원리:
 * - 단일 FeatureCollection은 그대로 사용합니다.
 * - 배열/객체(레이어 맵) 형태는 FeatureCollection들만 추려 하나로 병합합니다.
 */
function normalizeShpGeoJsonResult(rawResult) {
    const isFeatureCollection = (obj) => {
        return !!obj && obj.type === "FeatureCollection" && Array.isArray(obj.features);
    };

    if (isFeatureCollection(rawResult)) {
        return rawResult;
    }

    if (Array.isArray(rawResult)) {
        const collections = rawResult.filter(isFeatureCollection);
        if (collections.length === 0) return null;
        if (collections.length === 1) return collections[0];
        return {
            type: "FeatureCollection",
            features: collections.flatMap(fc => fc.features)
        };
    }

    if (rawResult && typeof rawResult === "object") {
        const collections = Object.values(rawResult).filter(isFeatureCollection);
        if (collections.length === 0) return null;
        if (collections.length === 1) return collections[0];
        return {
            type: "FeatureCollection",
            features: collections.flatMap(fc => fc.features)
        };
    }

    return null;
}

/**
 * 값이 Promise인지 여부와 관계없이 최종 값을 반환합니다.
 */
async function resolveMaybePromise(value) {
    if (value && typeof value.then === "function") {
        return await value;
    }
    return value;
}

/**
 * SHX 인덱스를 이용해 SHP에서 유효한 마지막 레코드 끝 위치(byte)를 계산합니다.
 * 동작 원리:
 * - SHX의 각 엔트리(offset/contentLength)는 16-bit word 단위입니다.
 * - end = (offset * 2) + 8(record header) + (contentLength * 2)
 * - 모든 레코드 end 중 최댓값을 실제 유효 데이터 끝으로 사용합니다.
 */
function getExpectedShpEndFromShx(shxBuffer) {
    if (!(shxBuffer instanceof ArrayBuffer) || shxBuffer.byteLength < 100) return null;

    const view = new DataView(shxBuffer);
    const declaredShxBytes = view.getUint32(24, false) * 2;
    const usableBytes = (declaredShxBytes >= 100 && declaredShxBytes <= shxBuffer.byteLength)
        ? declaredShxBytes
        : shxBuffer.byteLength;
    const recordCount = Math.floor((usableBytes - 100) / 8);
    if (recordCount <= 0) return null;

    let maxEnd = 100;
    for (let i = 0; i < recordCount; i++) {
        const offset = 100 + (i * 8);
        const recordOffsetWords = view.getUint32(offset, false);
        const contentLengthWords = view.getUint32(offset + 4, false);
        const recordEndBytes = (recordOffsetWords * 2) + 8 + (contentLengthWords * 2);
        if (Number.isFinite(recordEndBytes) && recordEndBytes > maxEnd) {
            maxEnd = recordEndBytes;
        }
    }

    return maxEnd > 100 ? maxEnd : null;
}

/**
 * 일부 선 SHP에서 뒤쪽 0 패딩 때문에 shpjs가 빈 레코드로 오해하는 문제를 방지합니다.
 * 동작 원리:
 * - SHX 기반 유효 끝 위치가 SHP 실제 길이보다 짧고
 * - 잘려나갈 꼬리 바이트가 모두 0이면, 해당 패딩만 제거해 파싱합니다.
 */
function trimShpPaddingByShx(shpBuffer, shxBuffer, shpNameForLog = "") {
    if (!(shpBuffer instanceof ArrayBuffer)) return shpBuffer;

    const expectedEnd = getExpectedShpEndFromShx(shxBuffer);
    if (!expectedEnd || expectedEnd <= 100 || expectedEnd >= shpBuffer.byteLength) {
        return shpBuffer;
    }

    const tailBytes = new Uint8Array(shpBuffer, expectedEnd);
    const hasNonZeroTail = tailBytes.some(byte => byte !== 0);
    if (hasNonZeroTail) return shpBuffer;

    const trimmed = shpBuffer.slice(0, expectedEnd);
    if (trimmed.byteLength >= 28) {
        // SHP 헤더의 file length(16-bit word 단위)를 실제 바이트 길이에 맞춰 갱신합니다.
        new DataView(trimmed).setUint32(24, Math.floor(trimmed.byteLength / 2), false);
    }
    return trimmed;
}

/**
 * shp(arrayBuffer) 파싱 실패 시 ZIP 내부를 직접 파싱하는 폴백입니다.
 * 동작 원리:
 * - .shp/.prj는 우선 파싱하고, .dbf는 실패해도 빈 속성으로 대체합니다.
 * - 최종 결과는 FeatureCollection(또는 배열) 형태로 반환해 기존 흐름과 호환합니다.
 */
async function parseShpZipWithDbfFallback(arrayBuffer, originalError) {
    if (typeof JSZip === "undefined" || !shp || typeof shp.parseShp !== "function" || typeof shp.combine !== "function") {
        throw originalError;
    }

    const zip = await JSZip.loadAsync(arrayBuffer);
    const allEntries = Object.values(zip.files).filter(entry => !entry.dir);
    const shpEntries = allEntries.filter(entry => /\.shp$/i.test(entry.name));
    if (shpEntries.length === 0) throw originalError;

    const findSiblingEntry = (baseName, ext) => {
        const target = `${baseName}.${ext}`.toLowerCase();
        return allEntries.find(entry => entry.name.toLowerCase() === target) || null;
    };

    const collections = [];

    for (const shpEntry of shpEntries) {
        const baseName = shpEntry.name.replace(/\.shp$/i, '');
        const prjEntry = findSiblingEntry(baseName, 'prj');
        const dbfEntry = findSiblingEntry(baseName, 'dbf');
        const shxEntry = findSiblingEntry(baseName, 'shx');

        let shpBuffer = await shpEntry.async('arraybuffer');
        const prjText = prjEntry ? await prjEntry.async('text') : undefined;
        if (shxEntry) {
            try {
                const shxBuffer = await shxEntry.async('arraybuffer');
                shpBuffer = trimShpPaddingByShx(shpBuffer, shxBuffer, shpEntry.name);
            } catch {}
        }

        const geometryRows = await resolveMaybePromise(shp.parseShp(shpBuffer, prjText));

        let propertyRows = [];
        if (dbfEntry) {
            try {
                const dbfBuffer = await dbfEntry.async('arraybuffer');
                propertyRows = await resolveMaybePromise(shp.parseDbf(dbfBuffer));
            } catch (dbfErr) {
                propertyRows = [];
            }
        }

        // DBF가 없거나 파싱 실패해도 geometry 개수만큼 빈 속성을 맞춰 결합합니다.
        const safeProperties = Array.isArray(propertyRows) && propertyRows.length > 0
            ? propertyRows
            : (Array.isArray(geometryRows) ? geometryRows.map(() => ({})) : []);

        const combined = await resolveMaybePromise(shp.combine([geometryRows, safeProperties]));
        if (combined && combined.type === "FeatureCollection" && Array.isArray(combined.features)) {
            collections.push(combined);
        }
    }

    if (collections.length === 0) throw originalError;
    if (collections.length === 1) return collections[0];
    return collections;
}

/**
 * 선택한 파일(GeoJSON/GPX/SHP ZIP)을 읽어 현재 앱 데이터에 반영합니다.
 * 동작 원리: 파일 확장자로 파서를 결정한 뒤, 결과를 GeoJSON으로 통일해
 * "프로젝트 단위 추가"와 "현재 프로젝트 레이어 추가"를 분기 처리합니다.
 */
export async function handleFileSelect(input) {
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    // 파일별 성공/병합/오류를 누적해 마지막에 한 번만 사용자에게 요약합니다.
    let newProjectCount = 0;
    let singleLayerCount = 0;
    let mergedDefaultCount = 0;
    let errorCount = 0;
    let firstErrorMessage = "";

    // 여러 프로젝트 파일을 가져올 수 있으므로 마지막 프로젝트 ID를 따로 추적합니다.
    let lastImportedProjectId = null;

    for (const file of files) {
        try {
            // 어떤 파일 형식이든 이후 로직 단순화를 위해 GeoJSON 객체로 통일합니다.
            let json;

            const ext = file.name.toLowerCase().split('.').pop();
            const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

            if (ext === 'zip') {
                // Shapefile(.zip)은 바이너리(ArrayBuffer)로 읽어 파싱합니다.
                const MAX_SHP_SIZE_MB = 10;
                if (file.size > MAX_SHP_SIZE_MB * 1024 * 1024) {
                    alert(`"${file.name}" 파일 용량이 ${MAX_SHP_SIZE_MB}MB를 초과합니다.\n모바일 환경에서는 처리하기 어렵습니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
                    errorCount++;
                    continue;
                }

                const arrayBuffer = await file.arrayBuffer();
                let geoJsonResult;
                try {
                    geoJsonResult = await shp(arrayBuffer);
                } catch (shpErr) {
                    geoJsonResult = await parseShpZipWithDbfFallback(arrayBuffer, shpErr);
                }

                json = normalizeShpGeoJsonResult(geoJsonResult);
                if (!json) {
                    throw new Error("SHP 파싱 결과를 FeatureCollection으로 변환하지 못했습니다.");
                }

                // DBF 인코딩 차이로 속성 문자열이 깨질 수 있어, memo를 파일명으로 보정합니다.
                if (json && json.features) {
                    json.features.forEach(feature => {
                        if (!feature.properties) feature.properties = {};
                        feature.properties.memo = fileNameWithoutExt;
                    });
                }

                // 정점 수 제한으로 모바일 브라우저의 메모리/렌더링 과부하를 예방합니다.
                const MAX_VERTICES = 50000;
                const vertexCount = countVertices(json);
                if (vertexCount > MAX_VERTICES) {
                    alert(`"${file.name}" 파일의 버텍스 개수가 너무 많습니다.\n모바일 환경에서는 ${MAX_VERTICES.toLocaleString()}개 이하만 불러올 수 있습니다.\n(현재: ${vertexCount.toLocaleString()}개)`);
                    errorCount++;
                    continue;
                }
            } else if (ext === 'gpx') {
                // GPX 텍스트를 읽고 변환기(gpxToGeoJson)로 표준 구조로 변환합니다.
                const text = await file.text();
                json = gpxToGeoJson(text);
            } else {
                // GeoJSON/JSON은 JSON.parse로 객체화합니다.
                const text = await file.text();
                json = JSON.parse(text);
            }

            if (!json) {
                console.warn(`파일 변환 결과가 없습니다: ${file.name}`);
                errorCount++;
                continue;
            }

            // 프로젝트 메타 필드 존재 여부로 "프로젝트 백업 파일"인지 판별합니다.
            if (json.isProjectExport === true && json.projectName) {
                if (json.projectName === "기본 프로젝트") {
                    const defaultP = AppState.projects.find(p => p.name === "기본 프로젝트");
                    if (defaultP) {
                        const importedFeats = json.features || [];
                        const featuresObj = { type: "FeatureCollection", features: [] };
                        
                        // 가져온 도형 ID가 기존 도형과 같으면 충돌하므로 새 ID를 재발급합니다.
                        for (let i = 0; i < importedFeats.length; i++) {
                            const f = importedFeats[i];
                            if (f.properties) {
                                f.properties.id = Date.now() + i + Math.floor(Math.random() * 100000);
                            }
                            featuresObj.features.push(f);
                        }
                        
                        if (AppState.currentProjectId === defaultP.id) {
                            // 현재 열려 있으면 즉시 렌더링하고,
                            restoreFeatures(featuresObj);
                        } else {
                            // 아니면 데이터만 병합해 나중에 프로젝트 전환 시 표시되게 합니다.
                            if (!defaultP.features) defaultP.features = { type: "FeatureCollection", features: [] };
                            if (!defaultP.features.features) defaultP.features.features = [];
                            defaultP.features.features.push(...featuresObj.features);
                            defaultP.updatedAt = new Date().toISOString();
                        }
                        
                        mergedDefaultCount += importedFeats.length;
                        // 기본 프로젝트 병합을 끝냈으므로 이 파일 루프는 종료합니다.
                        continue;
                    }
                }

                let importedName = json.projectName;
                
                // 이름이 같으면 "(2), (3)..."을 붙여 파일 시스템/목록 충돌을 막습니다.
                let baseName = importedName;
                if (AppState.projects.some(p => p.name === baseName)) {
                    let cnt = 2;
                    while (AppState.projects.some(p => p.name === `${baseName} (${cnt})`)) {
                        cnt++;
                    }
                    importedName = `${baseName} (${cnt})`;
                }

                // 프로젝트 파일은 현재 프로젝트에 합치지 않고 새 프로젝트 엔트리로 추가합니다.
                const newProject = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    name: importedName,
                    // 프로젝트 단위 복원을 위해 전체 FeatureCollection을 그대로 저장합니다.
                    features: json,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                AppState.projects.push(newProject);
                lastImportedProjectId = newProject.id;
                newProjectCount++;
            } else {
                // 단일 기록은 현재 컨텍스트(현재 프로젝트)에 즉시 반영합니다.
                restoreFeatures(json);
                singleLayerCount++;
            }

        } catch (err) {
            console.error(`파일 처리 실패 [${file.name}]:`, err);
            errorCount++;
            if (!firstErrorMessage) {
                firstErrorMessage = `${file.name}: ${err?.message || err}`;
            }
        }
    }

    // 파일마다 저장하지 않고 마지막에 한 번만 저장해 I/O 횟수를 줄입니다.
    await saveToStorage();

    // 마지막 프로젝트를 자동 선택해 사용자가 방금 가져온 데이터를 바로 확인할 수 있게 합니다.
    if (lastImportedProjectId !== null) {
        AppState.currentProjectId = lastImportedProjectId;
        loadCurrentProjectFeatures();
    }

    renderProjectSelector();

    // 작업 결과를 단일 알림으로 보여줘 연속 alert를 피합니다.
    const msgs = [];
    if (singleLayerCount > 0) msgs.push(`기록 ${singleLayerCount}건이 현재 프로젝트에 추가되었습니다.`);
    if (mergedDefaultCount > 0) msgs.push(`기본 프로젝트 기록 ${mergedDefaultCount}건이 앱의 기본 프로젝트에 병합되었습니다.`);
    if (newProjectCount > 0) msgs.push(`프로젝트 ${newProjectCount}개가 새로 추가되었습니다.`);
    if (errorCount > 0) msgs.push(`${errorCount}개 파일 처리 중 오류가 발생했습니다.`);
    if (firstErrorMessage) msgs.push(`오류 상세: ${firstErrorMessage}`);

    if (msgs.length > 0) alert(msgs.join('\n'));

    // 같은 파일을 다시 선택할 수 있도록 input 값을 초기화합니다.
    input.value = '';
}

/**
 * GeoJSON 내 전체 버텍스(꼭짓점) 수를 계산합니다.
 * 동작 원리: 중첩 배열을 재귀로 내려가며 [lng, lat] 쌍을 1개 정점으로 계산합니다.
 */
function countVertices(geojson) {
    if (!geojson) return 0;
    const features = geojson.features || [];

    // 좌표 깊이(Point/Line/Polygon/MultiPolygon)가 다르므로 재귀가 가장 단순한 공통 해법입니다.
    function countCoords(coords) {
        if (!Array.isArray(coords)) return 0;
        // 가장 안쪽 배열([lng, lat])이면 꼭짓점 1개로 계산합니다.
        if (typeof coords[0] === 'number') return 1;
        return coords.reduce((sum, c) => sum + countCoords(c), 0);
    }

    return features.reduce((total, feature) => {
        if (!feature.geometry || !feature.geometry.coordinates) return total;
        return total + countCoords(feature.geometry.coordinates);
    }, 0);
}

/* ==========================================================================
   5) 데이터 초기화/기록 생성/주소 조회
   ========================================================================== */
/**
 * 모든 프로젝트와 기록을 삭제하고 기본 프로젝트 1개만 남기도록 초기화합니다.
 * 동작 원리: 빈 상태 대신 기본 프로젝트를 즉시 재생성해 앱의 최소 동작 조건을 유지합니다.
 */
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

/**
 * 현재 좌표를 빨간 마커 기록으로 저장합니다.
 * 동작 원리: 좌표 -> Leaflet 마커 -> feature 메타 부여 -> 저장/렌더링 순서로 처리합니다.
 */
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

/**
 * 현재 선택된 경계 레이어를 기록으로 저장합니다.
 * 동작 원리: 멀티 지오메트리를 flatten으로 단일 feature들로 나눈 뒤
 * 각 feature를 레이어로 다시 생성해 공통 저장 규칙을 적용합니다.
 */
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
                style: { color: '#FF0000', weight: 3, opacity: 0.8, fillColor: '#FF0000', fillOpacity: AppState.isPolygonFill ? 0.2 : 0 }
            });

            newLayer.eachLayer(function (innerLayer) {
                innerLayer.feature = innerLayer.feature || {};
                innerLayer.feature.properties = {
                    id: uniqueId,
                    memo: shortName || "지적 영역",
                    customColor: '#FF0000',
                    customWeight: 3,
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

// 주소 조회 API 연속 호출을 줄이기 위한 마지막 호출 시각(2초 간격 제한, 간단한 throttle)
let lastAddressCall = 0;
/**
 * 좌표(lat, lng)를 브이월드 JSONP API로 조회해 화면의 주소 표시 영역을 업데이트합니다.
 * 동작 원리: JSONP 방식으로 script 태그를 동적 삽입하고, 콜백 함수에서 결과를 수신합니다.
 */
export function getAddressFromCoords(lat, lng) {
    const now = Date.now();
    if (now - lastAddressCall < 2000) return;
    lastAddressCall = now;

    // JSONP는 전역 함수명이 필요하므로 요청마다 고유 콜백 이름을 만듭니다.
    const callbackName = 'vworld_callback_' + Math.floor(Math.random() * 100000);
    window[callbackName] = function (data) {
        const el = document.getElementById('address-display');
        if (el) el.innerText = (data.response.status === "OK") ? data.response.result[0].text : "주소 정보 없음";
        // 메모리 누수/이름 충돌 방지를 위해 콜백과 script 태그를 정리합니다.
        delete window[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();
    };
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&format=jsonp&type=BOTH&zipcode=false&simple=false&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}
