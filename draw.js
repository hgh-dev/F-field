/* ==========================================================================
   [모듈] 그리기/편집 모듈 (draw.js)
   [역할]
   - 지도에서 점/선/면 기록 생성을 시작/완료/취소합니다.
   - 기존 레이어를 단건 편집(완료/되돌리기/취소)하고 결과를 저장합니다.
   - GPS 좌표를 그리기 도구의 버텍스로 주입해 현장 기록을 돕습니다.
   [동작 원리 요약]
   - Leaflet.Draw 인스턴스를 AppState.currentDrawer로 관리해 모드 충돌을 막습니다.
   - 생성/편집 이벤트에서 feature 속성을 갱신하고 saveToStorage()로 즉시 동기화합니다.
   - 렌더링(UI)과 데이터 저장을 같은 지점에서 호출해 상태 불일치를 줄입니다.
   ========================================================================== */
import { map } from './map.js?v=2.4.9';
import { AppState } from './state.js?v=2.4.9';
import { updateLayerInfo, renderSurveyList, switchSidebarTab, highlightButton, resetButtonStyles, openBottomSheet, closeBottomSheet, currentBottomSheetLayerId, setCurrentBottomSheetLayerId } from './ui.js?v=2.4.9';
import { getRandomColor, getTimestampString, createColoredMarkerIcon } from './utils.js?v=2.4.9';
import { saveToStorage } from './data.js?v=2.4.9';
import { requestWakeLock, releaseWakeLock } from './wake-lock.js?v=2.4.9';



/* ==========================================================================
   1) 초기화/공용 상태
   ========================================================================== */
// 모바일 환경에서 Polyline 터치 이벤트가 중복 처리되는 문제를 막기 위한 패치입니다.
// 원리: 내부 _onTouch 핸들러를 noop으로 바꿔 터치 드로잉 오작동을 우회합니다.
L.Draw.Polyline.prototype._onTouch = function (e) { return; };


// 앱에서 관리하는 모든 사용자 도형이 모이는 레이어 그룹입니다.
// 원리: 개별 레이어 대신 그룹 단위로 add/remove/edit 대상을 통일하면 제어가 단순해집니다.
export const drawnItems = new L.FeatureGroup();
// 현재 편집 중인 레이어 ID (없으면 null)
export let currentEditLayerId = null;
// 편집 취소/되돌리기용 원본 좌표 스냅샷
export let editLayerOriginalLatLng = null;
map.addLayer(drawnItems);

// Leaflet.draw 가상 버텍스(중간점) 아이콘 커스터마이징
// 원리: _createMiddleMarker를 감싸 middle marker를 "+" 형태로 바꿔
// "새 버텍스 추가 지점"임을 시각적으로 구분합니다.
(function () {
    if (L.Edit && L.Edit.PolyVerticesEdit) {
        const origCreateMiddleMarker = L.Edit.PolyVerticesEdit.prototype._createMiddleMarker;
        L.Edit.PolyVerticesEdit.prototype._createMiddleMarker = function (marker1, marker2) {
            origCreateMiddleMarker.call(this, marker1, marker2);
            // Leaflet.draw 1.0.x에서는 생성된 middle marker 참조가 marker1._middleRight에 들어갑니다.
            const middleMarker = marker1._middleRight;
            if (middleMarker) {
                // 실제 버텍스로 전환될 때 원복할 수 있도록 기존 아이콘을 보관합니다.
                const origIcon = middleMarker.options.icon || new L.DivIcon({ iconSize: new L.Point(10, 10), className: 'leaflet-div-icon leaflet-editing-icon' });

                middleMarker.setIcon(L.divIcon({
                    html: '+',
                    iconSize: new L.Point(14, 14),
                    className: 'leaflet-div-icon leaflet-editing-icon leaflet-middle-icon'
                }));
                // icon 교체 직후 스타일이 즉시 반영되도록 opacity를 다시 적용합니다.
                middleMarker.setOpacity(1);

                // 가상 버텍스(+)가 실제 버텍스로 승격되는 순간 원래 아이콘으로 되돌립니다.
                middleMarker.once('mousedown touchstart click dragstart', function () {
                    this.setIcon(origIcon);
                    this.setOpacity(1);
                });
            }
        };
    }
})();


// 기본 점 기록 아이콘(파란색)입니다.
const defaultSurveyIcon = createColoredMarkerIcon('#0040ff');

// Leaflet.Draw 툴바 설정입니다.
// 원리: draw 옵션에서 사용 가능한 도형 타입을 제한해 앱 요구사항(점/선/면)만 노출합니다.
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

// 그리기 중 액션 버튼(완료/취소 등) 하단 툴바 DOM 참조
const actionToolbar = document.getElementById('action-toolbar');
const completeDrawingBtn = actionToolbar ? actionToolbar.querySelector('.btn-done') : null;
const SNAP_DISTANCE_PX = 14;
let snapGuideLayer = null;

function normalizeLatLng(latlng) {
    return latlng ? L.latLng(latlng.lat, latlng.lng) : null;
}

function isSnapEnabled() {
    return AppState.isSnapEnabled === true;
}

function getPointDistance(pointA, pointB) {
    return pointA.distanceTo(pointB);
}

function getClosestPointOnSegment(targetPoint, startPoint, endPoint) {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared === 0) return startPoint;

    const t = Math.max(0, Math.min(1, (((targetPoint.x - startPoint.x) * dx) + ((targetPoint.y - startPoint.y) * dy)) / lengthSquared));
    return L.point(startPoint.x + (dx * t), startPoint.y + (dy * t));
}

function collectLayerSnapGeometry(layer) {
    const vertices = [];
    const segments = [];

    if (layer instanceof L.Marker) {
        vertices.push(normalizeLatLng(layer.getLatLng()));
        return { vertices, segments };
    }

    if (typeof layer.getLatLngs !== 'function') return { vertices, segments };

    const appendPath = (pathLatLngs, shouldClose) => {
        const path = pathLatLngs.map(normalizeLatLng).filter(Boolean);
        if (path.length === 0) return;

        path.forEach(vertex => vertices.push(vertex));
        for (let i = 1; i < path.length; i++) {
            segments.push([path[i - 1], path[i]]);
        }
        if (shouldClose && path.length > 2) {
            segments.push([path[path.length - 1], path[0]]);
        }
    };

    const traverseLatLngs = (latlngs, shouldClose) => {
        if (!Array.isArray(latlngs) || latlngs.length === 0) return;
        if (latlngs[0] && typeof latlngs[0].lat === 'number' && typeof latlngs[0].lng === 'number') {
            appendPath(latlngs, shouldClose);
            return;
        }
        latlngs.forEach(inner => traverseLatLngs(inner, shouldClose));
    };

    traverseLatLngs(layer.getLatLngs(), layer instanceof L.Polygon);
    return { vertices, segments };
}

function findSnapTarget(latlng, excludedLayer = null) {
    if (!isSnapEnabled()) return null;
    if (!latlng) return null;

    const targetPoint = map.latLngToContainerPoint(latlng);
    let bestVertex = null;
    let bestSegment = null;

    drawnItems.getLayers().forEach(layer => {
        if (layer.feature?.properties?.isHidden === true) return;
        if (excludedLayer && layer === excludedLayer) return;

        const geometry = collectLayerSnapGeometry(layer);
        geometry.vertices.forEach(vertex => {
            const vertexPoint = map.latLngToContainerPoint(vertex);
            const distance = getPointDistance(targetPoint, vertexPoint);
            if (distance > SNAP_DISTANCE_PX) return;
            if (!bestVertex || distance < bestVertex.distance) {
                bestVertex = { latlng: vertex, distance };
            }
        });

        geometry.segments.forEach(([startLatLng, endLatLng]) => {
            const startPoint = map.latLngToContainerPoint(startLatLng);
            const endPoint = map.latLngToContainerPoint(endLatLng);
            const snappedPoint = getClosestPointOnSegment(targetPoint, startPoint, endPoint);
            const distance = getPointDistance(targetPoint, snappedPoint);
            if (distance > SNAP_DISTANCE_PX) return;
            if (!bestSegment || distance < bestSegment.distance) {
                bestSegment = { latlng: map.containerPointToLatLng(snappedPoint), distance };
            }
        });
    });

    if (bestVertex) return { latlng: bestVertex.latlng, type: 'vertex', distance: bestVertex.distance };
    if (bestSegment) return { latlng: bestSegment.latlng, type: 'segment', distance: bestSegment.distance };
    return null;
}

function getSnapResult(latlng, excludedLayer = null) {
    const normalizedLatLng = normalizeLatLng(latlng);
    if (!isSnapEnabled()) {
        return {
            latlng: normalizedLatLng,
            isSnapped: false,
            snapTarget: null
        };
    }
    const snapTarget = findSnapTarget(normalizedLatLng, excludedLayer);
    return {
        latlng: snapTarget ? normalizeLatLng(snapTarget.latlng) : normalizedLatLng,
        isSnapped: !!snapTarget,
        snapTarget
    };
}

function getSnappedLatLng(latlng, excludedLayer = null) {
    return getSnapResult(latlng, excludedLayer).latlng;
}

function getRawPointerLatLng(drawHandler, e) {
    if (e && e.originalEvent && drawHandler && drawHandler._map) {
        return normalizeLatLng(drawHandler._map.mouseEventToLatLng(e.originalEvent));
    }
    return normalizeLatLng(e && e.latlng ? e.latlng : null);
}

function shouldSkipDuplicateSnapMove(drawHandler, e) {
    if (!drawHandler || !drawHandler._map || !e || !e.originalEvent) return false;
    const containerPoint = drawHandler._map.mouseEventToContainerPoint(e.originalEvent);
    const pointKey = `${Math.round(containerPoint.x)}:${Math.round(containerPoint.y)}`;
    if (drawHandler._lastSnapMousePointKey === pointKey) return true;
    drawHandler._lastSnapMousePointKey = pointKey;
    return false;
}

function ensureSnapGuideLayer() {
    if (snapGuideLayer) return snapGuideLayer;
    snapGuideLayer = L.circleMarker([0, 0], {
        radius: 6,
        color: '#2563eb',
        weight: 2,
        fillColor: '#ffffff',
        fillOpacity: 0.95,
        interactive: false
    });
    return snapGuideLayer;
}

function updateSnapGuide(latlng, isSnapped) {
    if (!isSnapEnabled()) {
        clearSnapGuide();
        return;
    }
    if (!isSnapped || !latlng) {
        if (snapGuideLayer && map.hasLayer(snapGuideLayer)) map.removeLayer(snapGuideLayer);
        return;
    }

    const guide = ensureSnapGuideLayer();
    guide.setLatLng(latlng);
    if (!map.hasLayer(guide)) guide.addTo(map);
}

function clearSnapGuide() {
    if (snapGuideLayer && map.hasLayer(snapGuideLayer)) map.removeLayer(snapGuideLayer);
}

export function syncSnapToggleButtons() {
    const isEnabled = isSnapEnabled();
    document.getElementsByName('snap-enabled-select').forEach(input => {
        input.checked = (input.value === String(isEnabled));
    });
}

export function setSnapEnabled(value) {
    AppState.isSnapEnabled = (value === true || value === 'true');
    localStorage.setItem('setting_snap_enabled', AppState.isSnapEnabled ? 'true' : 'false');
    if (!AppState.isSnapEnabled) clearSnapGuide();
    syncSnapToggleButtons();
}

const originalPolylineAddVertex = L.Draw.Polyline.prototype.addVertex;
L.Draw.Polyline.prototype.addVertex = function (latlng) {
    return originalPolylineAddVertex.call(this, getSnappedLatLng(latlng));
};

const originalPolylineMouseMove = L.Draw.Polyline.prototype._onMouseMove;
L.Draw.Polyline.prototype._onMouseMove = function (e) {
    const originalLatLng = getRawPointerLatLng(this, e);
    if (!originalLatLng) return originalPolylineMouseMove.call(this, e);
    if (shouldSkipDuplicateSnapMove(this, e)) return;

    const snapResult = getSnapResult(originalLatLng);
    const snappedLatLng = snapResult.latlng;
    updateSnapGuide(snappedLatLng, snapResult.isSnapped);

    const newPos = this._map.latLngToLayerPoint(snappedLatLng);
    this._currentLatLng = snappedLatLng;
    this._updateTooltip(snappedLatLng);
    this._updateGuide(newPos);
    this._mouseMarker.setLatLng(snappedLatLng);

    if (e && e.originalEvent) L.DomEvent.preventDefault(e.originalEvent);
};

const originalMarkerMouseMove = L.Draw.Marker.prototype._onMouseMove;
L.Draw.Marker.prototype._onMouseMove = function (e) {
    const originalLatLng = getRawPointerLatLng(this, e);
    if (!originalLatLng) return originalMarkerMouseMove.call(this, e);
    if (shouldSkipDuplicateSnapMove(this, e)) return;

    const snapResult = getSnapResult(originalLatLng);
    const snappedLatLng = snapResult.latlng;
    updateSnapGuide(snappedLatLng, snapResult.isSnapped);
    this._tooltip.updatePosition(snappedLatLng);
    this._mouseMarker.setLatLng(snappedLatLng);

    if (!this._marker) {
        this._marker = this._createMarker(snappedLatLng);
        this._marker.on('click', this._onClick, this);
        this._map
            .on('click', this._onClick, this)
            .addLayer(this._marker);
    } else {
        this._marker.setLatLng(this._mouseMarker.getLatLng());
    }
};

const originalEditPolyMarkerDrag = L.Edit.PolyVerticesEdit.prototype._onMarkerDrag;
L.Edit.PolyVerticesEdit.prototype._onMarkerDrag = function (e) {
    const marker = e.target;
    const originalLatLng = normalizeLatLng(marker.getLatLng());
    const snapResult = getSnapResult(originalLatLng, this._poly);

    if (snapResult.isSnapped) {
        marker.setLatLng(snapResult.latlng);
        updateSnapGuide(snapResult.latlng, true);
    } else {
        updateSnapGuide(null, false);
    }

    return originalEditPolyMarkerDrag.call(this, e);
};

const originalEditPolyFireEdit = L.Edit.PolyVerticesEdit.prototype._fireEdit;
L.Edit.PolyVerticesEdit.prototype._fireEdit = function () {
    clearSnapGuide();
    return originalEditPolyFireEdit.call(this);
};

function handleEditableMarkerDrag(e) {
    const marker = e.target;
    const originalLatLng = normalizeLatLng(marker.getLatLng());
    const snapResult = getSnapResult(originalLatLng, marker);
    if (snapResult.isSnapped) {
        marker.setLatLng(snapResult.latlng);
        updateSnapGuide(snapResult.latlng, true);
    } else {
        updateSnapGuide(null, false);
    }
}

function clearSnapGuideOnEditEnd() {
    clearSnapGuide();
}

function bindMarkerEditSnap(layer) {
    if (!layer || !(layer instanceof L.Marker)) return;
    if (!layer._snapEditDragHandler) layer._snapEditDragHandler = handleEditableMarkerDrag;
    if (!layer._snapEditDragEndHandler) layer._snapEditDragEndHandler = clearSnapGuideOnEditEnd;
    layer.on('drag', layer._snapEditDragHandler);
    layer.on('dragend', layer._snapEditDragEndHandler);
}

function unbindMarkerEditSnap(layer) {
    if (!layer || !(layer instanceof L.Marker)) return;
    if (layer._snapEditDragHandler) layer.off('drag', layer._snapEditDragHandler);
    if (layer._snapEditDragEndHandler) layer.off('dragend', layer._snapEditDragEndHandler);
}

/**
 * 현재 그리기 타입별 "완료 가능 최소 버텍스 수"를 반환합니다.
 */
function getRequiredVertexCountForCurrentDrawer() {
    if (AppState.currentDrawer instanceof L.Draw.Polygon) return 3;
    if (AppState.currentDrawer instanceof L.Draw.Polyline) return 2;
    return 0;
}

/**
 * 현재 그리기 스케치의 버텍스 수를 반환합니다.
 */
function getCurrentDrawingVertexCount() {
    if (!AppState.currentDrawer) return 0;
    if (Array.isArray(AppState.currentDrawer._markers)) return AppState.currentDrawer._markers.length;

    if (AppState.currentDrawer._poly && typeof AppState.currentDrawer._poly.getLatLngs === 'function') {
        const latlngs = AppState.currentDrawer._poly.getLatLngs();
        if (!Array.isArray(latlngs)) return 0;
        if (latlngs.length > 0 && Array.isArray(latlngs[0])) return latlngs[0].length;
        return latlngs.length;
    }
    return 0;
}

/**
 * 그리기 진행 상태에 맞춰 "기록 완료" 버튼 활성 상태를 갱신합니다.
 */
function updateDrawingCompleteButtonState() {
    if (!completeDrawingBtn) return;
    const requiredVertexCount = getRequiredVertexCountForCurrentDrawer();
    if (requiredVertexCount === 0) {
        completeDrawingBtn.disabled = false;
        return;
    }
    completeDrawingBtn.disabled = getCurrentDrawingVertexCount() < requiredVertexCount;
}


/* ==========================================================================
   2) 그리기 제어
   ========================================================================== */
/**
 * 선택한 타입(point/line/polygon)의 그리기 모드를 시작합니다.
 * 동작 원리: Drawer 인스턴스를 생성해 enable()하고, 완료/취소 UI를 함께 활성화합니다.
 */
export function startDraw(type) {
    // 이미 그리기/편집 모드라면 중복 진입을 막습니다.
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    closeBottomSheet();

    // 도형 1개 단위로 기본 색상을 먼저 고정해 생성/스타일/저장 단계에서 일관되게 사용합니다.
    const randomColor = getRandomColor();
    AppState.currentDrawColor = randomColor;

    const options = {
        touchIcon: null,
        showLength: true,
        allowIntersection: true,
        shapeOptions: {
            color: randomColor,
            fillColor: randomColor,
            weight: 4,
            opacity: 0.85,
            fillOpacity: AppState.isPolygonFill ? 0.2 : 0
        }
    };

    if (type === 'polygon') {
        AppState.currentDrawer = new L.Draw.Polygon(map, options);
        highlightButton('btn-poly');
    } else if (type === 'polyline') {
        AppState.currentDrawer = new L.Draw.Polyline(map, options);
        highlightButton('btn-line');
    } else if (type === 'marker') {
        AppState.currentDrawer = new L.Draw.Marker(map, { icon: createColoredMarkerIcon(randomColor) });
        highlightButton('btn-point');
    }

    // 기록 모드 시각 상태(비네팅/버튼 강조)를 적용합니다.
    document.body.classList.add('recording-mode');
    requestWakeLock();

    // 수동 완료 버튼으로만 종료되게 _finishShape를 감싸서 제어합니다.
    // 원리: 자동 finish 호출을 AppState.isManualFinish 플래그로 게이트합니다.
    if (AppState.currentDrawer && (type === 'polygon' || type === 'polyline')) {
        AppState.currentDrawer._originalFinishShape = AppState.currentDrawer._finishShape;
        AppState.currentDrawer._finishShape = function () {
            if (AppState.isManualFinish) { this._originalFinishShape(); }
        };
    }
    AppState.currentDrawer.enable();
    AppState.currentDrawer._lastSnapMousePointKey = null;
    actionToolbar.style.display = 'flex';
    updateDrawingCompleteButtonState();
}

/**
 * 현재 그리기를 완료 처리합니다.
 * 동작 원리: Drawer 구현별 complete API 차이를 순차 fallback으로 흡수합니다.
 */
export function completeDrawing() {
    if (AppState.currentDrawer) {
        // 수동 완료 구간에서만 _finishShape가 동작하도록 임시 플래그를 켭니다.
        AppState.isManualFinish = true;
        if (AppState.currentDrawer.completeShape) AppState.currentDrawer.completeShape();
        else if (AppState.currentDrawer._finishShape) AppState.currentDrawer._finishShape();
        else AppState.currentDrawer.disable();
        AppState.isManualFinish = false;
    }
    resetDrawingState();
}

/**
 * 현재 그리기를 취소하고 입력 중 상태를 정리합니다.
 */
export function cancelDrawing() {
    if (AppState.currentDrawer) {
        AppState.currentDrawer.disable();
        AppState.currentDrawer._lastSnapMousePointKey = null;
        AppState.currentDrawer = null;
    }
    resetDrawingState();
}

/**
 * 그리기 UI/임시 상태를 기본값으로 되돌립니다.
 * 동작 원리: Drawer 외부 상태(UI class, pendingPhotos, 색상 캐시)를 한 곳에서 정리합니다.
 */
function resetDrawingState() {
    document.body.classList.remove('recording-mode');
    actionToolbar.style.display = 'none';
    if (completeDrawingBtn) completeDrawingBtn.disabled = false;
    clearSnapGuide();
    resetButtonStyles();
    releaseWakeLock();

    // 점 생성 직전에 보관하던 첨부 사진 임시 버퍼를 비웁니다.
    if (AppState.pendingPhotos) {
        AppState.pendingPhotos = null;
    }
    // 다음 그리기 시작 시 새 색상을 뽑도록 초기화
    AppState.currentDrawColor = null;
}



/* ==========================================================================
   3) GPS 입력
   ========================================================================== */
/**
 * 현재 GPS 좌표를 그리기 도구에 추가합니다.
 * 동작 원리:
 * - 마커 모드면 즉시 CREATED 이벤트를 강제로 발생시켜 일반 생성 플로우를 재사용합니다.
 * - 선/면 모드면 addVertex로 꼭짓점만 추가합니다.
 */
export function addGpsVertex() {
    if (!AppState.currentDrawer) return;
    if (!navigator.geolocation) { alert("GPS 미지원"); return; }

    // 브라우저 위치 API로 1회 좌표를 가져옵니다.
    navigator.geolocation.getCurrentPosition(function (pos) {
        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);

        if (AppState.currentDrawer instanceof L.Draw.Marker) {
            const markerColor = AppState.currentDrawColor || '#0040ff';
            const marker = L.marker(latlng, { icon: createColoredMarkerIcon(markerColor) });
            // Marker는 "점 1개=완료"이므로 Drawer를 종료한 뒤 CREATED 이벤트로 후속 처리 통일
            AppState.currentDrawer.disable();
            AppState.currentDrawer._lastSnapMousePointKey = null;
            AppState.currentDrawer = null;
            map.fire(L.Draw.Event.CREATED, { layer: marker, layerType: 'marker' });
            resetDrawingState();
        } else {
            // Polyline/Polygon은 현재 스케치에 버텍스만 누적
            AppState.currentDrawer.addVertex(latlng);
            updateDrawingCompleteButtonState();
        }
        // 입력 지점으로 화면 중심을 이동해 현장 사용성을 높입니다.
        map.panTo(latlng);
    }, function () {
        alert("GPS 수신 실패");
    // 고정밀 옵션은 느릴 수 있지만 위치 정확도를 우선합니다.
    }, { enableHighAccuracy: true });
}

/**
 * 현재 스케치의 마지막 버텍스를 삭제합니다.
 */
export function deleteLastVertex() {
    if (AppState.currentDrawer && AppState.currentDrawer.deleteLastVertex) {
        AppState.currentDrawer.deleteLastVertex();
        updateDrawingCompleteButtonState();
    }
}

/* ==========================================================================
   4) 도형 편집
   ========================================================================== */
/**
 * 목록에서 선택한 단일 레이어를 편집 모드로 전환합니다.
 * 동작 원리: 레이어 타입(마커/선면)에 따라 편집기(Dragging 또는 L.Edit.Poly)를 다르게 적용합니다.
 */
export function enableSingleLayerEdit(id) {

    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    if (layer instanceof L.Marker) {
        // 마커는 좌표 1개만 관리하므로 원본 LatLng를 그대로 백업합니다.
        editLayerOriginalLatLng = layer.getLatLng();
        layer.dragging.enable();
        bindMarkerEditSnap(layer);
    } else {
        if (!layer.editing) {
            // 폴리곤/폴리라인은 Leaflet 편집 모듈 인스턴스를 생성해 편집 핸들을 붙입니다.
            if (L.Edit && L.Edit.Poly) layer.editing = new L.Edit.Poly(layer);
            else { alert("수정 모듈 오류"); return; }
        }
        if (layer.editing) layer.editing.enable();
        else { alert("수정 불가 도형"); return; }
        // getLatLngs()는 참조가 섞일 수 있어 깊은 복사본(JSON)으로 원본 상태를 고정합니다.
        editLayerOriginalLatLng = JSON.parse(JSON.stringify(layer.getLatLngs()));
    }

    layer.closePopup();
    alert("측량한 기록의 버텍스를 수정합니다. 수정이 완료되면 하단의 [수정 완료] 버튼을 누르세요.");
    closeBottomSheet();
    document.body.classList.add('recording-mode');

    // 현재 편집 대상과 편집용 툴바를 함께 활성화합니다.
    currentEditLayerId = id;
    document.getElementById('edit-action-toolbar').style.display = 'flex';
};

/**
 * 편집을 확정하고 저장/화면을 갱신합니다.
 * 동작 원리: 편집 종료 -> 속성 갱신 -> 저장 -> UI 복원 순서로 처리합니다.
 */
export function completeSingleEdit() {

    if (currentEditLayerId === null) return;

    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === currentEditLayerId);
    if (!layer) {
        document.getElementById('edit-action-toolbar').style.display = 'none';
        document.body.classList.remove('recording-mode');
        currentEditLayerId = null;
        return;
    }

    // 편집 핸들러를 비활성화해 좌표 수정을 종료합니다.
    if (layer instanceof L.Marker) {
        unbindMarkerEditSnap(layer);
        layer.dragging.disable();
    } else if (layer.editing) layer.editing.disable();

    // 좌표 변경분을 feature 정보로 재계산하고 즉시 저장합니다.
    updateLayerInfo(layer);
    saveToStorage();
    renderSurveyList();

    // 편집 모드 UI/임시 상태를 정리합니다.
    document.body.classList.remove('recording-mode');
    document.getElementById('edit-action-toolbar').style.display = 'none';
    clearSnapGuide();
    editLayerOriginalLatLng = null;
    currentEditLayerId = null;

    // 편집 완료 직후 상세 바텀시트를 다시 열어 결과 확인 흐름을 유지합니다.
    layer.fire('click');
};

/**
 * 편집 내용을 원본으로 되돌리되, 편집 모드는 유지합니다.
 * 동작 원리: 원본 스냅샷(editLayerOriginalLatLng)을 다시 적용합니다.
 */
export function revertSingleEdit() {

    if (currentEditLayerId === null) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === currentEditLayerId);
    if (!layer) return;

    if (layer instanceof L.Marker) {
        // 마커는 단일 좌표 복원만으로 되돌리기가 완료됩니다.
        if (editLayerOriginalLatLng) layer.setLatLng(editLayerOriginalLatLng);
        clearSnapGuide();
    } else if (editLayerOriginalLatLng) {
        // 선/면은 편집기 내부 캐시가 있어 "disable -> 좌표복원 -> 편집기 재생성" 순서가 안전합니다.
        if (layer.editing) layer.editing.disable();
        layer.setLatLngs(editLayerOriginalLatLng);
        layer.editing = new L.Edit.Poly(layer);
        layer.editing.enable();
    }
};

/**
 * 편집 내용을 원복하고 편집 모드를 종료합니다.
 * 동작 원리: revert 동작 후 툴바/모드 상태까지 함께 닫습니다.
 */
export function cancelSingleEdit() {

    if (currentEditLayerId === null) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === currentEditLayerId);
    if (!layer) {
        document.getElementById('edit-action-toolbar').style.display = 'none';
        document.body.classList.remove('recording-mode');
        currentEditLayerId = null;
        return;
    }

    if (layer instanceof L.Marker) {
        // 마커: 위치 원복 후 드래그 종료
        if (editLayerOriginalLatLng) layer.setLatLng(editLayerOriginalLatLng);
        unbindMarkerEditSnap(layer);
        layer.dragging.disable();
    } else {
        // 선/면: 원본 좌표 적용 후 편집 종료
        if (layer.editing) layer.editing.disable();
        if (editLayerOriginalLatLng) {
            layer.setLatLngs(editLayerOriginalLatLng);
            // 다음 편집 시작 시 깨끗한 상태를 보장하도록 편집기를 재생성합니다.
            layer.editing = new L.Edit.Poly(layer);
        }
    }

    // 편집 UI 상태를 초기화합니다.
    document.body.classList.remove('recording-mode');
    document.getElementById('edit-action-toolbar').style.display = 'none';
    clearSnapGuide();
    editLayerOriginalLatLng = null;
    currentEditLayerId = null;

    layer.openPopup();
};

/* ==========================================================================
   5) 이벤트 처리
   ========================================================================== */
// 선/면 버텍스가 추가될 때마다 완료 버튼 상태를 즉시 재평가합니다.
map.on(L.Draw.Event.DRAWVERTEX, function () {
    updateDrawingCompleteButtonState();
});

/**
 * draw:created
 * 동작 원리: Leaflet.Draw가 생성한 레이어를 앱 표준 feature 구조로 보강한 뒤
 * drawnItems/AppState/UI 저장 흐름으로 연결합니다.
 */
map.on(L.Draw.Event.CREATED, function (event) {
    const layer = event.layer;
    let memo = null;
    // 실수로 취소를 눌렀을 때를 대비해, 취소 의사를 한 번 더 확인합니다.
    while (memo === null) {
        memo = prompt("기록명 입력:", getTimestampString());
        if (memo !== null) break;

        const shouldCancelSave = confirm("기록 저장을 취소하시겠습니까?\n측량한 기록이 사라집니다.");
        if (shouldCancelSave) {
            if (AppState.currentDrawer) {
                AppState.currentDrawer.disable();
                AppState.currentDrawer._lastSnapMousePointKey = null;
                AppState.currentDrawer = null;
            }
            resetDrawingState();
            return;
        }
    }
    if (!memo) memo = getTimestampString();

    // 생성 직후 feature 메타를 붙여 앱 내부 식별/필터/스타일 기준을 통일합니다.
    const randomColor = AppState.currentDrawColor || getRandomColor();
    layer.feature = {
        type: "Feature",
        properties: { memo: memo, id: Date.now(), isHidden: false, customColor: randomColor }
    };

    // 점 생성 전 임시 보관했던 사진 목록이 있으면 이 레이어에 1회 귀속시킵니다.
    if (AppState.pendingPhotos && AppState.pendingPhotos.length > 0) {
        layer.feature.properties.photos = AppState.pendingPhotos;
        AppState.pendingPhotos = null;
        
        // 사진 기반 포인트임을 바로 구분할 수 있게 카메라 이모지를 기본값으로 사용합니다.
        layer.feature.properties.customEmoji = '📷';
        layer.feature.properties.customMarkerSize = 3;
    }

    if (event.layerType === 'marker') {
        // 마커는 아이콘 기반 스타일(색상/이모지/크기)을 적용합니다.
        const emoji = layer.feature.properties.customEmoji || null;
        const size = layer.feature.properties.customMarkerSize || 3;
        layer.setIcon(createColoredMarkerIcon(randomColor, emoji, size));
    } else {
        // 선/면은 path 스타일(color/fill)을 적용합니다.
        layer.setStyle({ color: randomColor, fillColor: randomColor });
        if (event.layerType === 'polygon' && !AppState.isPolygonFill) {
            layer.setStyle({ fillOpacity: 0 });
        }
    }

    // 속성 반영 -> 그룹 추가 -> 저장 순으로 처리해 상태를 일관되게 유지합니다.
    updateLayerInfo(layer);
    drawnItems.addLayer(layer);
    saveToStorage();

    // 그리기 모드를 종료하고 UI를 기본 상태로 복원합니다.
    resetDrawingState();
    if (AppState.currentDrawer) AppState.currentDrawer._lastSnapMousePointKey = null;
    AppState.currentDrawer = null;

    // 생성된 레이어의 상세 확인 흐름을 바로 열어 사용자 피드백을 빠르게 제공합니다.
    layer.openPopup();
    switchSidebarTab('record');
    renderSurveyList();
});

/**
 * draw:edited
 * 동작 원리: 다중 편집 결과 레이어 집합(e.layers)을 순회해 정보 재계산 후 저장합니다.
 */
map.on('draw:edited', function (e) {
    e.layers.eachLayer(updateLayerInfo);
    saveToStorage();
    renderSurveyList();
});
