/* ==========================================================================
   [모듈] 전역 상태 관리 (state.js)
   [역할] 앱 전체에서 공유되는 상태 변수 모음 (AppState)
   ========================================================================== */
export const AppState = {
    // [기본 설정 상태]
    coordMode: parseInt(localStorage.getItem('setting_coord_mode')) || 0, // 좌표 표시 방식 (0: DMS, 1: Decimal, 2: TM)
    isPolygonFill: localStorage.getItem('setting_polygon_fill') !== 'false', // 면 피처 채우기 여부 (기본값 true)

    // [지도 및 마커 상태]
    isFollowing: false, // '내 위치 따라가기' 버튼이 켜져 있는지 여부
    watchId: null,      // geolocation.watchPosition()이 반환하는 ID (추적 중지 시 필요)
    lastHeading: 0,     // 나침반 방향 (0~360도), 디바이스 orientation 이벤트로 업데이트됨
    lastGpsLat: 37.245911, // 마지막으로 수신된 GPS 위도 (기본값: 수원)
    lastGpsLng: 126.960302, // 마지막으로 수신된 GPS 경도

    // [프로젝트 상태]
    trackingMarker: null,    // 내 위치를 표시하는 화살표 마커
    trackingCircle: null,    // GPS 오차 범위(정확도)를 보여주는 파란 원
    currentBoundaryLayer: null, // 지적도 검색 시 나타나는 붉은색 테두리 (선택된 땅)
    currentSearchMarker: null,  // 주소 검색이나 클릭 시 나타나는 빨간 핀

    // [그리기 도구 (Leaflet.Draw) 상태]
    currentDrawer: null,     // 현재 활성화된 그리기 도구 객체 (Polygon, Polyline, Marker 등)
    isManualFinish: false,   // '그리기 완료' 버튼을 눌렀을 때, 로직 중복 실행을 방지하기 위한 플래그

    // [산림 데이터 상태]
    forestDataLayer: null,   // 산림보호구역 데이터를 보여주는 GeoJSON 레이어
    isForestActive: false,   // 산림보호구역 레이어가 켜져 있는지 여부
    lastForestRequestId: 0,  // 비동기 요청 순서 꼬임 방지용 시퀀스 ID

    // [프로젝트 관리]
    projects: [],             // 모든 프로젝트와 그 안의 기록들을 담고 있는 배열
    currentProjectId: null,   // 현재 작업 중인 프로젝트의 ID (projects 배열 내 객체의 id)

    // [기록 정렬 상태]
    sortBy: localStorage.getItem('setting_sort_by') || 'date',       // 정렬 기준 ('date' | 'name')
    sortOrder: localStorage.getItem('setting_sort_order') || 'asc',  // 정렬 방향 ('asc' | 'desc')

    // [트랙 기록 모드 상태]
    trackInterval: parseInt(localStorage.getItem('setting_track_interval')) || 10, // 트랙 기록 간격 (단위: m)
    trackWatchId: null,      // GPS watchPosition 피드 시구체 ID
    trackPolyline: null,     // 트랙 모드에서 김고 있는 임시 polyline 레이어
    lastTrackLatLng: null,   // 마지막으로 기록된 좌표 (거리 계산 기준점)

    // [절전 모드 및 화면 꺼짐 방지]
    wakeLock: null,
    sleepSliderThumb: null,
    isDraggingSleepSlider: false,
    sleepStartX: 0,
    sleepCurrentX: 0,
    sleepMaxDragX: 0,
    isLayerClicked: false, // 레이어 클릭 시 맵 클릭 이벤트 전파 방지용 플래그
    pendingPhotos: null // 사진 점 측량 시 임시 저장용 사진 배열
};

