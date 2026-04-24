/* ==========================================================================
   [모듈] 화면 꺼짐 방지 모듈 (wake-lock.js)
   [역할]
   - 기록 입력 중 화면이 자동으로 꺼지지 않도록 Screen Wake Lock을 관리합니다.
   - Wake Lock 미지원 브라우저에서는 숨김 무음 비디오 재생으로 보조합니다.
   ========================================================================== */
import { AppState } from './state.js?v=2.4.9';

// Wake Lock 미지원 브라우저 fallback용 무음 비디오 핸들입니다.
let noSleepVideo = null;

/**
 * 기록 중 화면 꺼짐을 방지합니다.
 */
export async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            AppState.wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) { console.error(err); }

    if (!noSleepVideo) {
        noSleepVideo = document.createElement('video');
        noSleepVideo.setAttribute('playsinline', '');
        noSleepVideo.setAttribute('muted', '');
        noSleepVideo.muted = true;
        noSleepVideo.loop = true;
        noSleepVideo.style.display = 'none';
        noSleepVideo.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMQAAAAhmcmVlAAAAQG1kYXQhCAgEAAAAAAARAAABvQAQAQAAEgQA//4AAAAAABIAAAAB100AAAAABAAeIBAEAAABXAAAAAAB//4AAAAAABIAAAAAAEEAAAAB2AAAAAAEAAB+GZ0sAAAAAABAAAAABAAAAAB/AAABAAAAAQBBbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAABDcAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAzx0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAD6AAAAAAMAAAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAQAAAAEAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAA+gAAAAAAAEAAAAAAIhtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAAPoAAAEtwBQAAAAAAAZaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAAAAAAAAO21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAKRzdGJsAAAALnN0c2QAAAAAAAAAAQAAAB5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAABhzdHRzAAAAAAAAAAEAAAABAAAEtwAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAAAAAAAAAQAAABQAAAAUc3RjbwAAAAAAAAABAAAALAAAAA==';
        document.body.appendChild(noSleepVideo);
    }
    noSleepVideo.play().catch(e => console.error("NoSleep fallback failed", e));
}

/**
 * 화면 절전 방지 상태를 해제합니다.
 */
export function releaseWakeLock() {
    if (AppState.wakeLock !== null) {
        AppState.wakeLock.release()
            .catch(err => console.error(err))
            .finally(() => { AppState.wakeLock = null; });
    }
    if (noSleepVideo) {
        noSleepVideo.pause();
    }
}

// 백그라운드 복귀 시 기록 모드면 wake lock을 다시 요청합니다.
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && document.body.classList.contains('recording-mode')) {
        requestWakeLock();
    }
});
