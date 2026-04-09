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
// 컬러 마커 아이콘 생성 (이모지 지원)
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

// 좌표 변환 (TM -> WGS84)
export function getWgs84FromTm(x, y) {
    const coords = proj4("EPSG:5186", "EPSG:4326", [x, y]);
    return { lat: coords[1], lng: coords[0] };
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

// 도분초 배열을 소수점(Decimal)으로 변환
export function dmsToDecimal(deg, min, sec, type) {
    let dec = parseFloat(deg) + parseFloat(min) / 60 + parseFloat(sec) / 3600;
    if (type === 'S' || type === 'W') {
        dec = dec * -1;
    }
    return dec;
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

// 국가지점번호 -> 위경도 변환 함수
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
