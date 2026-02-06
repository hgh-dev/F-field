// [중요] 버전이 바뀔 때마다 여기 숫자를 꼭 바꿔주세요! (예: v1.1.2)
const CACHE_NAME = 'F-field-v1.5.1';

// 미리 저장해둘 파일 목록
const FILES_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './icon.png',
    './script.js' // 스크립트 파일도 추가하는 것이 좋습니다.
];

// 1. 설치 (Install) - 캐시 생성 및 파일 저장 (대기 없이 즉시 설치)
self.addEventListener('install', (event) => {
    // skipWaiting: 대기 중인 서비스 워커를 즉시 활성화 (새로고침 시 바로 적용되게 함)
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] 파일 캐싱 중...', CACHE_NAME);
            return cache.addAll(FILES_TO_CACHE);
        })
    );
});

// 2. 활성화 (Activate) - 이전 버전 캐시 삭제 (중요!)
self.addEventListener('activate', (event) => {
    // clients.claim: 활성화되자마자 모든 페이지를 제어함
    event.waitUntil(self.clients.claim());

    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                // 현재 버전(CACHE_NAME)과 다른 옛날 캐시는 모두 삭제
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] 옛날 캐시 삭제:', key);
                    return caches.delete(key);
                }
            }));
        })
    );
});

// 3. 요청 가로채기 (Fetch) - 캐시 우선, 없으면 네트워크 (이게 질문하신 부분!)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // 캐시에 있으면 그거 주고, 없으면 인터넷에서 가져와라
            return response || fetch(event.request);
        })
    );
});