// service-worker.js (하이브리드 전략)

const STATIC_CACHE_NAME = 'F-field-v2.1.2';
const MAP_CACHE_NAME = 'F-field-map-v1';

// 1. 설치: 기본 뼈대만 캐싱 (라이브러리 등 변하지 않는 것들)
const STATIC_URLS = [
    'https://unpkg.com/leaflet@1.7.1/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.7.1/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js',
    'https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.4.4/proj4.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js',
    './icon-192.png',
    './icon-512.png',
    './manifest.json',
    './index.html',
    './config.js',
    './state.js',
    './map.js',
    './draw.js',
    './data.js',
    './ui.js',
    './utils.js',
    './script.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // 대기 없이 즉시 활성화
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS))
    );
});

// 가장 오래된 캐시 지우기 함수 (일괄 삭제 방식)
function trimCache(cacheName, maxItems) {
    caches.open(cacheName).then((cache) => {
        cache.keys().then((keys) => {
            if (keys.length > maxItems) {
                // 초과한 개수만큼 잘라서 삭제 대상 배열 만들기
                const keysToDelete = keys.slice(0, keys.length - maxItems);
                Promise.all(keysToDelete.map(key => cache.delete(key)))
                    .then(() => console.log(`[Service Worker] Deleted ${keysToDelete.length} old cache items from ${cacheName}.`));
            }
        });
    });
}

// 2. 활성화: 구버전 캐시 정리
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [STATIC_CACHE_NAME, MAP_CACHE_NAME];
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (!cacheWhitelist.includes(key)) {
                    return caches.delete(key);
                }
            }));
        }).then(() => self.clients.claim())
    );
});

// 3. 요청 처리 (여기가 핵심!)
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // WMS 및 실시간 API 요청은 캐싱하지 않고 즉시 통과 (CORS 에러 및 뻥튀기 방지)
    if (url.includes('/req/wms') || url.includes('/req/data') || url.includes('/req/search') || url.includes('/req/address')) {
        return;
    }

    // 전략 A: 지도 타일 이미지 (VWorld, Esri 등) -> "캐시 우선 (Cache First)"
    // 목적: 무조건 속도! 타일은 잘 안 바뀌니까 저장된 거 먼저 씀.
    if (url.includes('api.vworld.kr') || url.includes('arcgisonline.com') || url.includes('openstreetmap.org')) {
        event.respondWith(
            caches.open(MAP_CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    // 캐시에 있으면 그거 줌 (0.01초)
                    if (cachedResponse) return cachedResponse;

                    // 없으면 인터넷에서 받아와서 저장 후 줌
                    return fetch(event.request).then((networkResponse) => {
                        cache.put(event.request, networkResponse.clone()).then(() => {
                            trimCache(MAP_CACHE_NAME, 15000);
                        });
                        return networkResponse;
                    });
                });
            })
        );
        return; // 여기서 종료
    }

    // 전략 B: 내 코드 (index.html, script.js 등) -> "네트워크 우선 (Network First)"
    // 목적: 최신 업데이트 반영! 인터넷 되면 무조건 새거 받아옴. 안 될 때만 캐시 씀.
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // 인터넷에서 잘 받아왔으면? -> 캐시도 최신으로 교체해두고, 브라우저에 줌
                return caches.open(STATIC_CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                // 인터넷이 끊겼거나 에러나면? -> 어쩔 수 없이 캐시된 거라도 보여줌 (오프라인 지원)
                return caches.match(event.request);
            })
    );
});