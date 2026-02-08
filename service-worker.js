// service-worker.js (개발 모드: 캐시 사용 안 함)

const CACHE_NAME = 'F-field';

// 1. 설치: 즉시 활성화
self.addEventListener('install', (event) => {
    console.log('[Service Worker] 개발 모드로 설치됨');
    self.skipWaiting();
});

// 2. 활성화: 옛날 캐시 싹 다 지우기 (중요!)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                console.log('[Service Worker] 기존 캐시 삭제:', key);
                return caches.delete(key);
            }));
        }).then(() => self.clients.claim())
    );
});

// 3. 요청: 무조건 인터넷에서 새로 받기 (저장 안 함)
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});