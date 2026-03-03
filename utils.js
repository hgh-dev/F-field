/* ==========================================================================
   [모듈] 유틸리티 함수 (utils.js)
   [역할] 날짜 포맷, 좌표 변환, 랜덤 색상 생성 등 순수 계산용 헬퍼 함수 모음
   ========================================================================== */
import { SVG_ICONS } from './config.js';

/* 1. 데이터 포맷 및 생성 */

// 타임스탬프 생성 (YYMMDD_HHMMSS 형식)
export function getTimestampString() {
    const now = new Date();
    return now.toISOString().slice(2, 10).replace(/-/g, "") + "_" + now.toTimeString().slice(0, 8).replace(/:/g, "");
}

// 랜덤 색상 생성
export function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) color += letters[Math.floor(Math.random() * 16)];
    return color;
}

// 컬러 마커 아이콘 생성
export function createColoredMarkerIcon(color) {
    return L.divIcon({
        className: '',
        html: `<svg viewBox="0 0 24 24" width="36" height="36" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" 
                      fill="${color}" stroke="white" stroke-width="0.8"/>
               </svg>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
    });
}

// 텍스 복사 헬퍼 함수
export function copyText(text, silent = false, itemLabel = "주소") {
    const msg = `${itemLabel}가 복사되었습니다.`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (!silent) alert(msg);
        }).catch(err => {
            console.error(err);
            prompt("복사하세요:", text);
        });
    } else {
        const tempInput = document.createElement("textarea");
        document.body.appendChild(tempInput);
        tempInput.value = text;
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        if (!silent) alert(msg);
    }
}

// 주소 요약 (동, 리, 가 위주)
export function getShortAddress(addressName) {
    if (!addressName) return "";
    const parts = addressName.split(' ');
    for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].match(/(동|리|가)$/)) return parts.slice(i).join(' ');
    }
    return parts.length >= 2 ? parts.slice(parts.length - 2).join(' ') : addressName;
}

/* 2. 좌표 및 변환 */
// 좌표 변환 (WGS84 -> TM)
export function getTmCoords(lat, lng) {
    // proj4는 전역 객체로 가정 (index.html에서 로드)
    const xy = proj4("EPSG:4326", "EPSG:5186", [lng, lat]);
    return { x: Math.round(xy[0]), y: Math.round(xy[1]) };
}

// 도분초(DMS) 변환
export function convertToDms(val, type) {
    const valAbs = Math.abs(val);
    const deg = Math.floor(valAbs);
    const minFloat = (valAbs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(2);
    return (val >= 0 ? (type === 'lat' ? "N" : "E") : (type === 'lat' ? "S" : "W")) + " " + deg + "° " + min + "' " + sec + "\"";
}

// 이미지 리사이징 (Canvas 사용)
export function resizeImage(base64Str, maxWidth = 1024, quality = 0.8) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = function () {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            resolve(canvas.toDataURL('image/jpeg', quality));
        };
    });
}
