/* ==========================================================================
   [모듈] 공통 유틸리티 (utils.js)
   [역할]
   - 날짜/문자열 포맷, 좌표 변환, 아이콘 생성, 복사/이미지 전처리 같은 보조 기능을 제공합니다.
   [동작 원리 요약]
   - 가능하면 입력값 -> 결과값 형태의 순수 함수로 구성해 다른 모듈에서 재사용합니다.
   - 브라우저 API(clipboard/canvas/proj4)가 필요한 함수는 fallback이나 예외 처리로 안정성을 보강합니다.
   ========================================================================== */
import { SVG_ICONS } from './config.js?v=2.5.0';

/* ==========================================================================
   1) 포맷/생성 유틸
   ========================================================================== */

/**
 * 기록/측량 모드의 공통 시각 상태를 전환합니다.
 */
export function setRecordingModeActive(isActive) {
    document.body.classList.toggle('recording-mode', isActive);
}

/**
 * 현재 시각을 파일명에 쓰기 쉬운 문자열(YYMMDD_HHMMSS)로 반환합니다.
 */
export function getTimestampString() {
    const now = new Date();
    return now.toISOString().slice(2, 10).replace(/-/g, "") + "_" + now.toTimeString().slice(0, 8).replace(/:/g, "");
}

/**
 * 랜덤 HEX 색상 문자열(#RRGGBB)을 생성합니다.
 * 동작 원리: 16진수 문자 6자리를 무작위로 뽑아 결합합니다.
 */
export function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) color += letters[Math.floor(Math.random() * 16)];
    return color;
}

/**
 * 색상/이모지/크기 옵션으로 Leaflet divIcon을 생성합니다.
 * 동작 원리:
 * - emoji가 있으면 텍스트 이모지 아이콘을 사용합니다.
 * - 없으면 SVG 핀 아이콘을 사용합니다.
 * - sizeMap으로 아이콘 크기와 anchor를 함께 맞춰 팝업 위치 오차를 줄입니다.
 */
export function createColoredMarkerIcon(color, emoji = null, size = 3) {
    const sizeMap = {
        1: { emojiSize: 14, iconSize: 26, anchor: 13 },
        2: { emojiSize: 17, iconSize: 31, anchor: 15.5 },
        3: { emojiSize: 20, iconSize: 36, anchor: 18 },
        4: { emojiSize: 24, iconSize: 42, anchor: 21 },
        5: { emojiSize: 28, iconSize: 48, anchor: 24 }
    };
    const s = sizeMap[size] || sizeMap[3];

    if (emoji) {
        return L.divIcon({
            className: 'custom-emoji-marker',
            html: `<div style="font-size: ${s.emojiSize}px; color: white; text-shadow: 
                -1.5px -1.5px 1px white, 
                 1.5px -1.5px 1px white, 
                -1.5px  1.5px 1px white, 
                 1.5px  1.5px 1px white, 
                -1.5px  0px   1px white, 
                 1.5px  0px   1px white, 
                 0px   -1.5px 1px white, 
                 0px    1.5px 1px white,
                 0px    0px   2.5px white,
                 0 2px 5px rgba(0,0,0,0.4); text-align: center; line-height: 1.2;">${emoji}</div>`,
            iconSize: [s.iconSize, s.iconSize],
            iconAnchor: [s.anchor, s.anchor],
            popupAnchor: [0, -s.anchor]
        });
    }

    return L.divIcon({
        className: '',
        html: `<svg viewBox="0 0 24 24" width="${s.iconSize}" height="${s.iconSize}" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" 
                      fill="${color}" stroke="white" stroke-width="0.8"/>
               </svg>`,
        iconSize: [s.iconSize, s.iconSize],
        iconAnchor: [s.anchor, s.iconSize],
        popupAnchor: [0, -s.iconSize]
    });
}

/**
 * 텍스트를 클립보드에 복사합니다.
 * 동작 원리: 우선 navigator.clipboard를 사용하고, 실패 시 textarea+execCommand로 fallback 합니다.
 */
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

/**
 * 주소 문자열에서 뒤쪽 핵심 구간(동/리/가)을 우선 추출해 짧은 주소를 만듭니다.
 */
export function getShortAddress(addressName) {
    if (!addressName) return "";
    const parts = addressName.split(' ');
    for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].match(/(동|리|가)$/)) return parts.slice(i).join(' ');
    }
    return parts.length >= 2 ? parts.slice(parts.length - 2).join(' ') : addressName;
}

/* ==========================================================================
   2) 좌표/변환 유틸
   ========================================================================== */
/**
 * WGS84(lat,lng)를 TM(EPSG:5186) 좌표로 변환합니다.
 * 동작 원리: proj4 변환 결과를 반올림해 정수 미터 좌표로 반환합니다.
 */
export function getTmCoords(lat, lng) {
    // proj4는 index.html에서 전역으로 로드되어 있다고 가정합니다.
    const xy = proj4("EPSG:4326", "EPSG:5186", [lng, lat]);
    return { x: Math.round(xy[0]), y: Math.round(xy[1]) };
}

/**
 * TM(EPSG:5186) 좌표를 WGS84(lat,lng)로 변환합니다.
 */
export function getWgs84FromTm(x, y) {
    const coords = proj4("EPSG:5186", "EPSG:4326", [x, y]);
    return { lat: coords[1], lng: coords[0] };
}

/**
 * Decimal 좌표를 도분초(DMS) 문자열로 변환합니다.
 * type은 'lat' 또는 'lng'를 받아 방향 문자(N/S/E/W)를 결정합니다.
 */
export function convertToDms(val, type) {
    const valAbs = Math.abs(val);
    const deg = Math.floor(valAbs);
    const minFloat = (valAbs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(2);
    return (val >= 0 ? (type === 'lat' ? "N" : "E") : (type === 'lat' ? "S" : "W")) + " " + deg + "° " + min + "' " + sec + "\"";
}

/**
 * 도/분/초 + 방향 문자를 Decimal 좌표로 변환합니다.
 */
export function dmsToDecimal(deg, min, sec, type) {
    let dec = parseFloat(deg) + parseFloat(min) / 60 + parseFloat(sec) / 3600;
    if (type === 'S' || type === 'W') {
        dec = dec * -1;
    }
    return dec;
}

/* ==========================================================================
   3) 미디어/입력 유틸
   ========================================================================== */
/**
 * base64 이미지를 최대 폭 기준으로 리사이즈하고 JPEG base64로 반환합니다.
 * 동작 원리: Image -> Canvas drawImage -> toDataURL 순서로 재인코딩합니다.
 */
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

/**
 * 국가지점번호(예: 가나 1234 5678)를 WGS84 좌표로 변환합니다.
 * 동작 원리:
 * - 한글 격자 문자를 인덱스로 바꿔 TM 격자 좌표를 계산합니다.
 * - 계산한 좌표(EPSG:5179)를 proj4로 WGS84로 변환합니다.
 * @returns {[number, number] | null} [lng, lat] 또는 변환 실패 시 null
 */
export function parseNationalPointNumber(text) {
    const match = text.match(/^([가-하])([가-하])\s*(\d{4})\s*(\d{4})$/);
    if (!match) return null;

    const chars = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
    const char1 = match[1];
    const char2 = match[2];
    const num1 = parseInt(match[3], 10);
    const num2 = parseInt(match[4], 10);

    const index1 = chars.indexOf(char1);
    const index2 = chars.indexOf(char2);

    if (index1 === -1 || index2 === -1) return null;

    const x = (index1 + 7) * 100000 + num1 * 10;
    const y = (index2 + 13) * 100000 + num2 * 10;

    try {
        const coords = proj4("EPSG:5179", "EPSG:4326", [x, y]);
        return coords; // [lng, lat] 배열 반환
    } catch (e) {
        console.error("좌표 변환 실패", e);
        return null;
    }
}
