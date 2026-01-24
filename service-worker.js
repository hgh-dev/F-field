// 버전이 바뀔 때마다 캐시 이름도 바꿔주면, 사용자는 새로운 파일을 다시 다운받습니다.
const CACHE_NAME = 'F-field-v1.1.0';

// 미리 저장해둘 파일 목록 (앱이 오프라인일 때도 실행되게 함)
const FILES_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './icon.png'
];

// 1. 설치하기 (Install) - 중요 파일들을 미리 내 폰에 저장(캐시)합니다.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] 파일 캐싱 중...');
            return cache.addAll(FILES_TO_CACHE);
        })
    );
});

// 2. 가로채기 (Fetch) - 인터넷 요청이 있을 때 캐시에서 먼저 찾아서 줍니다.
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // 캐시에 있으면 그거 주고, 없으면 인터넷에서 가져와라
            return response || fetch(event.request);
        })
    );
});
