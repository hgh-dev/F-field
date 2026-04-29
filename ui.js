/* ==========================================================================
   [모듈] UI 통합 Export 모듈 (ui.js)
   [역할]
   - 분리된 UI 기능 모듈(ui-search/ui-bottomsheet/ui-project/ui-photo/ui-core)을 한 경로로 다시 노출합니다.
   - 외부 모듈(script/draw/data)이 내부 구조를 몰라도 기존처럼 `./ui.js`만 import 하도록 호환성을 유지합니다.
   [동작 원리 요약]
   - 이 파일은 직접 큰 UI 로직을 가지지 않고, 각 기능 파일의 export를 재노출하는 얇은 통합 레이어입니다.
   - 내부 구조가 바뀌어도 외부 호출 경로를 고정해 점진적 리팩터링 부담을 줄입니다.
   ========================================================================== */
export * from './ui-search.js?v=2.4.11';
export * from './ui-bottomsheet.js?v=2.4.11';
export * from './ui-project.js?v=2.4.11';
export * from './ui-photo.js?v=2.4.11';
export * from './ui-core.js?v=2.4.11';
