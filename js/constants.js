/**
 * 제어 옵션 및 렌더링에 필요한 전역 상수 정의 목록
 * 매직 넘버 사용 지양을 위해 Config.js 대신 사용
 */

// 아스키 문자는 밝은 픽셀에서 어두운 픽셀 순으로 배열합니다.
// (가장 밝은 영역엔 공백, 가장 어두운 영역엔 밀도가 높은 '@')
export const ASCII_CHARS = " .,:;+*?%S#@".split('');
export const ASCII_CHARS_REVERSED = [...ASCII_CHARS].reverse();

// 렌더링 초기 값
export const DEFAULT_SATURATION_THRESHOLD = 50; // 기본 채도 기준 (0~100)
export const DEFAULT_ASCII_DENSITY = 10;        // 기본 픽셀 블록 크기 (px)
export const DEFAULT_DELAY_FRAMES = 0;          // 기본 렌더링 딜레이 (프레임)
export const MAX_DELAY_FRAMES = 60;             // 최대 딜레이 허용치 (약 1초)
export const MAX_BLOOM_BLUR = 20;               // 최대 발광 수준 (px)

// 카메라 해상도 기본 제약조건 (성능 확보를 위해 FHD 이하 권장)
export const CAMERA_CONSTRAINTS = {
    video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user" // 전면 카메라 우선
    },
    audio: false // 현재 애플리케이션은 오디오 불필요
};

// ASCII 글꼴 설정
export const ASCII_FONT_FAMILY = "monospace";
export const MONOCHROME_COLOR = "#0f0"; // Matrix 스타일 터미널 그린
export const WHITE_COLOR = "#ffffff";
export const BLACK_COLOR = "#000000";
