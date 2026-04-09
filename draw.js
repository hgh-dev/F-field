/* ==========================================================================
   [모듈] 그리기 및 측량 도구 (draw.js)
   [역할] 지도 위 점, 선, 면 그리기, 도형 편집, GPS 트랙 기록
   ========================================================================== */
import { map } from './map.js';
import { AppState } from './state.js';
import { updateLayerInfo, renderSurveyList, switchSidebarTab, highlightButton, resetButtonStyles, openBottomSheet, closeBottomSheet, currentBottomSheetLayerId, setCurrentBottomSheetLayerId } from './ui.js';
import { getRandomColor, getTimestampString, createColoredMarkerIcon } from './utils.js';
import { saveToStorage } from './data.js';



/* --------------------------------------------------------------------------
   1. 초기 설정 및 상태 (Init & State)
   -------------------------------------------------------------------------- */
// 지도 위에 점, 선, 면을 그리고 수정하는 기능입니다.

/* [패치] Leaflet 라이브러리의 터치 오류 방지 */
// 선 그리기 도구 사용 시 모바일에서 터치가 튀는 문제를 해결합니다.
L.Draw.Polyline.prototype._onTouch = function (e) { return; };


export const drawnItems = new L.FeatureGroup(); // 그려진 도형들을 담을 그룹
export let currentEditLayerId = null;  // 현재 수정 모드 중인 레이어 ID
export let editLayerOriginalLatLng = null; // 마커 수정 전 원래 위치 (되돌리기/취소용)
// bindPopup 등의 메소드를 그룹 전체에 일괄 적용하거나 이벤트를 전파받을 수 있습니다.
map.addLayer(drawnItems);

// Leaflet.draw 가상 버텍스(중간점) 아이콘 커스터마이징
// _createMiddleMarker 오버라이드: 실제 버텍스보다 작고 반투명하게 표시
(function () {
    if (L.Edit && L.Edit.PolyVerticesEdit) {
        const origCreateMiddleMarker = L.Edit.PolyVerticesEdit.prototype._createMiddleMarker;
        L.Edit.PolyVerticesEdit.prototype._createMiddleMarker = function (marker1, marker2) {
            origCreateMiddleMarker.call(this, marker1, marker2);
            // Leaflet.draw 1.0.x 버전에서는 marker1._middleRight에 생성된 객체가 할당됨
            const middleMarker = marker1._middleRight;
            if (middleMarker) {
                // 기존의 일반(네모) 버텍스 아이콘 정보를 저장
                const origIcon = middleMarker.options.icon || new L.DivIcon({ iconSize: new L.Point(10, 10), className: 'leaflet-div-icon leaflet-editing-icon' });

                middleMarker.setIcon(L.divIcon({
                    html: '+',
                    iconSize: new L.Point(14, 14),
                    className: 'leaflet-div-icon leaflet-editing-icon leaflet-middle-icon'
                }));
                // CSS 설정이 적용되도록 0.6 투명도 재할당
                middleMarker.setOpacity(1);

                // 가상 버텍스(+)를 클릭하거나 끌어서(Drag) 실제 버텍스로 전환할 때
                // 아이콘을 다시 원래의 네모 버텍스로 롤백합니다.
                middleMarker.once('mousedown touchstart click dragstart', function () {
                    this.setIcon(origIcon);
                    this.setOpacity(1); // 실제 버텍스이므로 완전 불투명하게
                });
            }
        };
    }
})();


// 기본 아이콘 설정 (파란색)
const defaultSurveyIcon = createColoredMarkerIcon('#0040ff');

// 그리기 도구 설정 (Leaflet.Draw)
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


/* --------------------------------------------------------------------------
2. 그리기 제어 (Drawing Controls)
-------------------------------------------------------------------------- */
/* 2-1. 그리기 시작/완료/취소 */
export function startDraw(type) {
    if (AppState.currentDrawer || currentEditLayerId !== null) return; // 측량/수정 모드 중 중복 시작 차단

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

    document.body.classList.add('recording-mode'); // UI 모드 변경

    // 수동 종료 처리를 위한 후킹
    if (AppState.currentDrawer && (type === 'polygon' || type === 'polyline')) {
        AppState.currentDrawer._originalFinishShape = AppState.currentDrawer._finishShape;
        AppState.currentDrawer._finishShape = function () {
            if (AppState.isManualFinish) { this._originalFinishShape(); }
        };
    }
    AppState.currentDrawer.enable();
    actionToolbar.style.display = 'flex';
}

// 그리기 완료
export function completeDrawing() {
    if (AppState.currentDrawer) {
        AppState.isManualFinish = true;
        if (AppState.currentDrawer.completeShape) AppState.currentDrawer.completeShape();
        else if (AppState.currentDrawer._finishShape) AppState.currentDrawer._finishShape();
        else AppState.currentDrawer.disable();
        AppState.isManualFinish = false;
    }
    resetDrawingState();
}

// 그리기 취소
export function cancelDrawing() {
    if (AppState.currentDrawer) {
        AppState.currentDrawer.disable();
        AppState.currentDrawer = null;
    }
    resetDrawingState();
}

function resetDrawingState() {
    document.body.classList.remove('recording-mode');
    actionToolbar.style.display = 'none';
    resetButtonStyles();

    if (AppState.pendingPhotos) {
        AppState.pendingPhotos = null;
    }
    AppState.currentDrawColor = null;
}



/* --------------------------------------------------------------------------
3. 트랙 기록 (GPS Tracking)
-------------------------------------------------------------------------- */
// GPS 좌표로 점 추가 (그리기 도중)
export function addGpsVertex() {
    if (!AppState.currentDrawer) return;
    if (!navigator.geolocation) { alert("GPS 미지원"); return; }

    navigator.geolocation.getCurrentPosition(function (pos) {
        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);

        if (AppState.currentDrawer instanceof L.Draw.Marker) {
            const markerColor = AppState.currentDrawColor || '#0040ff';
            const marker = L.marker(latlng, { icon: createColoredMarkerIcon(markerColor) });
            AppState.currentDrawer.disable();
            AppState.currentDrawer = null;
            map.fire(L.Draw.Event.CREATED, { layer: marker, layerType: 'marker' });
            resetDrawingState();
        } else {
            AppState.currentDrawer.addVertex(latlng);
        }
        map.panTo(latlng);
    }, function () {
        alert("GPS 수신 실패");
    }, { enableHighAccuracy: true });
}

export function deleteLastVertex() {
    if (AppState.currentDrawer && AppState.currentDrawer.deleteLastVertex) AppState.currentDrawer.deleteLastVertex();
}

/* --------------------------------------------------------------------------
4. 도형 편집 (Editing Features)
-------------------------------------------------------------------------- */
// 개별 레이어 수정 (목록에서 "수정" 클릭 시)
export function enableSingleLayerEdit(id) {

    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    if (layer instanceof L.Marker) {
        // 되돌리기를 위해 원래 위치 저장
        editLayerOriginalLatLng = layer.getLatLng();
        layer.dragging.enable();
    } else {
        if (!layer.editing) {
            // Leaflet.Edit 모듈 초기화 확인
            if (L.Edit && L.Edit.Poly) layer.editing = new L.Edit.Poly(layer);
            else { alert("수정 모듈 오류"); return; }
        }
        if (layer.editing) layer.editing.enable();
        else { alert("수정 불가 도형"); return; }
        // 되돌리기를 위해 원래 좌표 백업 (JSON 직렬화로 불변 복사본 생성)
        editLayerOriginalLatLng = JSON.parse(JSON.stringify(layer.getLatLngs()));
    }

    layer.closePopup();
    alert("측량한 기록의 버텍스를 수정합니다. 수정이 완료되면 하단의 [수정 완료] 버튼을 누르세요.");
    document.body.classList.add('recording-mode'); // 파란 비네팅 유지

    // 현재 편집 레이어 저장 및 하단 완료 버튼 표시
    currentEditLayerId = id;
    document.getElementById('edit-action-toolbar').style.display = 'flex';
};

/**
 * [수정 완료]
 * 하단 [수정 완료] 버튼 클릭 시 호출됩니다.
 * 편집을 종료하고 저장, UI를 갱신합니다.
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

    // 편집 종료
    if (layer instanceof L.Marker) layer.dragging.disable();
    else if (layer.editing) layer.editing.disable();

    // 화면 및 저장소 갱신
    updateLayerInfo(layer);
    saveToStorage();
    renderSurveyList();

    // UI 상태 복원
    document.body.classList.remove('recording-mode');
    document.getElementById('edit-action-toolbar').style.display = 'none';
    editLayerOriginalLatLng = null;
    currentEditLayerId = null;

    // 수정한 레이어의 바텀 시트 다시 열기
    layer.fire('click');
};

/**
 * [되돌리기] - 편집 내용을 취소하고 편집 모드는 유지
 */
export function revertSingleEdit() {

    if (currentEditLayerId === null) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === currentEditLayerId);
    if (!layer) return;

    if (layer instanceof L.Marker) {
        // 마커: 원래 위치로 복원 (편집 모드 유지)
        if (editLayerOriginalLatLng) layer.setLatLng(editLayerOriginalLatLng);
    } else if (editLayerOriginalLatLng) {
        // 도형: disable() 후 setLatLngs 후 편집 핸들러를 새로 생성
        // (disable()이 버텍스 위치를 _latlngs에 덮어쓰는 문제를 피하기 위해 새 인스턴스 사용)
        if (layer.editing) layer.editing.disable();
        layer.setLatLngs(editLayerOriginalLatLng); // 선 + _latlngs 원본으로 복원
        layer.editing = new L.Edit.Poly(layer);    // 이전 상태 완전 초기화
        layer.editing.enable();                    // 현재 _latlngs(원본)으로 버텍스 생성
    }
};

/**
 * [취소] - 편집 내용을 취소하고 편집 모드 종료
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
        // 마커: 원래 위치로 복원 후 드래깅 종료
        if (editLayerOriginalLatLng) layer.setLatLng(editLayerOriginalLatLng);
        layer.dragging.disable();
    } else {
        // 도형: 원본 좌표로 복원 후 편집 종료
        if (layer.editing) layer.editing.disable();
        if (editLayerOriginalLatLng) {
            layer.setLatLngs(editLayerOriginalLatLng);
            // 편집 핸들러 새로 생성하여 이전 상태 초기화
            layer.editing = new L.Edit.Poly(layer);
        }
    }

    // UI 상태 복원
    document.body.classList.remove('recording-mode');
    document.getElementById('edit-action-toolbar').style.display = 'none';
    editLayerOriginalLatLng = null;
    currentEditLayerId = null;

    layer.openPopup();
};

/* 2-2. 이벤트 리스너 (map.on('draw:created') 등) */
// 그리기 완료 이벤트 (도형 생성 시)
map.on(L.Draw.Event.CREATED, function (event) {
    // [교육용] 도형이 다 그려지면 이 이벤트가 발생합니다.
    // 생성된 레이어에 고유 ID와 커스텀 속성(feature)을 추가하여 관리합니다.
    const layer = event.layer;
    let memo = prompt("기록명 입력:", getTimestampString());
    if (memo === null) return; // 취소 시 무시
    if (!memo) memo = getTimestampString();

    const randomColor = AppState.currentDrawColor || getRandomColor();
    layer.feature = {
        type: "Feature",
        properties: { memo: memo, id: Date.now(), isHidden: false, customColor: randomColor }
    };

    // 사진 첨부 점 측량 (Pending Photos) 확인
    if (AppState.pendingPhotos && AppState.pendingPhotos.length > 0) {
        layer.feature.properties.photos = AppState.pendingPhotos;
        AppState.pendingPhotos = null;
        
        // 사진 추가로 만든 점은 카메라 이모지를 기본으로 설정
        layer.feature.properties.customEmoji = '📷';
        layer.feature.properties.customMarkerSize = 3;
    }

    if (event.layerType === 'marker') {
        const emoji = layer.feature.properties.customEmoji || null;
        const size = layer.feature.properties.customMarkerSize || 3;
        layer.setIcon(createColoredMarkerIcon(randomColor, emoji, size));
    } else {
        layer.setStyle({ color: randomColor, fillColor: randomColor });
        if (event.layerType === 'polygon' && !AppState.isPolygonFill) {
            layer.setStyle({ fillOpacity: 0 });
        }
    }

    updateLayerInfo(layer);
    drawnItems.addLayer(layer);
    saveToStorage();

    resetDrawingState();
    AppState.currentDrawer = null;

    layer.openPopup();
    switchSidebarTab('record');
    renderSurveyList();
});

// 편집 이벤트 핸들러
map.on('draw:edited', function (e) {
    e.layers.eachLayer(updateLayerInfo);
    saveToStorage();
    renderSurveyList();
});



