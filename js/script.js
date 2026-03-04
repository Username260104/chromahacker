import {
    ASCII_CHARS,
    ASCII_CHARS_REVERSED,
    DEFAULT_SATURATION_THRESHOLD,
    DEFAULT_ASCII_DENSITY,
    DEFAULT_DELAY_FRAMES,
    MAX_DELAY_FRAMES,
    MAX_BLOOM_BLUR,
    CAMERA_CONSTRAINTS,
    ASCII_FONT_FAMILY,
    MONOCHROME_COLOR,
    WHITE_COLOR,
    BLACK_COLOR
} from './Config.js';

/**
 * 전역 상태 객체 (UI 연동)
 */
const state = {
    saturationThreshold: DEFAULT_SATURATION_THRESHOLD, // 0~100 (%)
    asciiDensity: DEFAULT_ASCII_DENSITY,               // px 단위
    delayFrames: DEFAULT_DELAY_FRAMES,                 // ASCII 반영 지연 프레임
    colorMode: "original",                             // "original", "monochrome", "white"
    textOnlyMode: false,                               // 배경 영상 숨기기 모드
    hideTextBackground: true,                          // 텍스트 위치의 검정 배경 숨기기 모드
    enableBloom: true                                  // 채도 비례 발광 효과
};

// 프레임 버퍼: 지연(Delay) 기능 구동을 위해 과거 프레임 이미지 데이터를 저장하는 원형 큐 구조
const frameBuffer = [];
let frameBufferIndex = 0;

/**
 * DOM 요소 참조
 */
const video = document.getElementById('webcam');
const mainCanvas = document.getElementById('mainCanvas');
const ctx = mainCanvas.getContext('2d', { willReadFrequently: true }); // 그래픽 가속 최적화 힌트

// 오프스크린 캔버스로 원본 비디오 데이터 버퍼링용으로 사용함
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

// UI 제어 요소
const thresholdSlider = document.getElementById('saturationThreshold');
const thresholdLabel = document.getElementById('saturationValue');
const densitySlider = document.getElementById('asciiDensity');
const densityLabel = document.getElementById('densityValue');
const delaySlider = document.getElementById('asciiDelay');
const delayLabel = document.getElementById('delayValue');
const colorSelect = document.getElementById('colorMode');
const textOnlyCheckbox = document.getElementById('textOnlyMode');
const hideTextBackgroundCheckbox = document.getElementById('hideTextBackground');
const enableBloomCheckbox = document.getElementById('enableBloom');

/**
 * RGB 배열을 HSL 값으로 변환하는 유틸리티 함수. 
 * 마스킹 여부 판단과 밝기 측정에 모두 사용됨.
 * @param {number} r 적색 (0-255)
 * @param {number} g 녹색 (0-255)
 * @param {number} b 청색 (0-255)
 * @returns {Array} [h (0-360), s (0-100), l (0-100)] 배열 형태 반환
 */
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // 명암만 있는 흑백
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    // 통상적인 360, 100%, 100% 스케일로 변환
    return [
        Math.round(h * 360),
        Math.round(s * 100),
        Math.round(l * 100)
    ];
}

/**
 * 사용자 미디어를 초기화합니다.
 */
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        video.srcObject = stream;

        // 메타데이터가 파싱된 직후 캔버스 해상도 업데이트
        video.addEventListener('loadedmetadata', () => {
            adjustCanvasSize();
            // 렌더링 루프 시작
            requestAnimationFrame(renderLoop);
        });
    } catch (error) {
        console.error("웹캠 접근 실패. 권한 문제 또는 로컬 서버 환경인지 확인하십시오.", error);
        alert("웹캠을 사용할 수 없습니다. 권한 승인이 필요합니다.");
    }
}

/**
 * 비디오 비율을 캔버스의 내부 좌표계 픽셀에 동기화.
 * (CSS는 오브젝트를 채우기만 하고, 내부 좌표 밀도는 여기서 결정)
 */
function adjustCanvasSize() {
    // 디바이스 물리 픽셀비를 적용하면 성능 하락의 주 요소가 되므로
    // HTML Video 스케일 수준의 논리 픽셀을 기반으로 캔버스를 할당
    mainCanvas.width = video.videoWidth;
    mainCanvas.height = video.videoHeight;
    offscreenCanvas.width = video.videoWidth;
    offscreenCanvas.height = video.videoHeight;

    // 버퍼 초기화
    frameBuffer.length = 0;
    frameBufferIndex = 0;
}

/**
 * 메인 렌더링 루프 (모든 프레임 처리 로직)
 */
function renderLoop() {
    // 1. 영상 재생 상태 확인
    if (video.readyState === video.HAVE_ENOUGH_DATA) {

        const w = mainCanvas.width;
        const h = mainCanvas.height;
        const density = state.asciiDensity;

        // 2. 오프스크린 캔버스에 비디오 프레임 복사
        offscreenCtx.drawImage(video, 0, 0, w, h);

        // 3. 메인 캔버스 배경 처리
        if (state.textOnlyMode) {
            ctx.fillStyle = BLACK_COLOR;
            ctx.fillRect(0, 0, w, h);
        } else {
            // 원본 이미지를 깔아줌 (저채도 영역은 자동으로 원본으로 보임)
            ctx.drawImage(offscreenCanvas, 0, 0, w, h);
        }

        // 4. 오프스크린 데이터를 버퍼에 저장하고, 과거 프레임 데이터를 꺼내어 ASCII 랜더링용으로 사용
        const currentFrameData = offscreenCtx.getImageData(0, 0, w, h);

        // 원형 버퍼(Ring Buffer) 패턴으로 과거 프레임 기록
        // 최대 프레임 크기만큼 큐를 유지
        if (frameBuffer.length < MAX_DELAY_FRAMES + 1) {
            frameBuffer.push(currentFrameData);
        } else {
            frameBuffer[frameBufferIndex] = currentFrameData;
        }

        // 지연시킬 프레임 수 인덱스 계산 (데이터가 충분하지 않으면 가장 오래된 프레임 참조)
        let delayIndex = frameBuffer.length - 1 - state.delayFrames;
        if (delayIndex < 0) delayIndex = 0; // 아직 버퍼가 다 차지 않았을 경우 에지 케이스 

        // 원형 버퍼 내의 실제 읽기 위치 보정
        const readIndex = (frameBufferIndex + frameBuffer.length - state.delayFrames) % frameBuffer.length;

        // 과거 프레임 데이터를 분석 대상으로 삼음
        const targetFrameData = frameBuffer[readIndex] || frameBuffer[0];
        const data = targetFrameData.data;

        // 버퍼 인덱스 진행
        frameBufferIndex = (frameBufferIndex + 1) % (MAX_DELAY_FRAMES + 1);

        // 5. 폰트 속성 설정 (단위 해상도 기준)
        ctx.font = `${density}px ${ASCII_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 6. 블록 기반 픽셀 샘플링 (Density 간격으로 순회)
        for (let y = 0; y < h; y += density) {
            for (let x = 0; x < w; x += density) {
                // (x, y) 좌표의 RGBA 배열 인덱스 계산
                const index = (y * w + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                // a (alpha) = data[index + 3];

                // HSL 변환 후 픽셀 속성 검사
                const [, s, l] = rgbToHsl(r, g, b);

                // 채도가 임계값을 넘을 때만 오버레이
                if (s >= state.saturationThreshold) {

                    // a) 원본 픽셀 덮어씌움 (블랙 배경 그리기)
                    // (density 넓이의 사각형으로 원본 영상을 지움)
                    if (!state.hideTextBackground) {
                        ctx.shadowBlur = 0; // 배경의 사각형에 그림자가 생기는 것 방지
                        ctx.fillStyle = BLACK_COLOR;
                        ctx.fillRect(Math.floor(x - density / 2), Math.floor(y - density / 2), density, density);
                    }

                    // b) ASCII 팩터 계산 (밝기 기반 배열 추출)
                    // L은 0~100이고, ASCII 배열의 길이 인덱스에 매핑
                    const charIndex = Math.floor((l / 100) * (ASCII_CHARS.length - 1));
                    // 본래 흰색 빛에 가까울 수록 공백이거나 특수문자, 매우 어두운 색은 밀도 높은 문자여야 한다.
                    const char = ASCII_CHARS[charIndex];

                    // c) 텍스트 스타일 채우기
                    if (state.colorMode === "original") {
                        // 원본 피사체 색상을 남김
                        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    } else if (state.colorMode === "monochrome") {
                        ctx.fillStyle = MONOCHROME_COLOR;
                    } else {
                        ctx.fillStyle = WHITE_COLOR;
                    }

                    // 채도(S) 기반 Bloom 발광 효과 적용
                    if (state.enableBloom) {
                        ctx.shadowColor = ctx.fillStyle;
                        ctx.shadowBlur = (s / 100) * MAX_BLOOM_BLUR;
                    } else {
                        ctx.shadowBlur = 0;
                    }

                    // d) 텍스트 렌더링
                    ctx.fillText(char, x, y);

                    // 다음 픽셀 처리를 위해 초기화
                    ctx.shadowBlur = 0;
                }
            }
        }
    }

    // 다음 스크린 새로고침 주기에 다시 호출 (무한 루프)
    requestAnimationFrame(renderLoop);
}

/**
 * 이벤트 리스너: 사용자 UI 제어
 */
function bindEvents() {
    // 1. 임계값(Threshold) 조절
    thresholdSlider.addEventListener('input', (e) => {
        state.saturationThreshold = parseInt(e.target.value, 10);
        thresholdLabel.textContent = `${state.saturationThreshold}%`;
    });

    // 2. ASCII 밀도 조절
    densitySlider.addEventListener('input', (e) => {
        state.asciiDensity = parseInt(e.target.value, 10);
        densityLabel.textContent = `${state.asciiDensity}px`;
    });

    // 3. ASCII 딜레이 조절
    delaySlider.addEventListener('input', (e) => {
        state.delayFrames = parseInt(e.target.value, 10);
        delayLabel.textContent = `${state.delayFrames}F`;
    });

    // 4. 색상 모드 조절
    colorSelect.addEventListener('change', (e) => {
        state.colorMode = e.target.value;
    });

    // 5. 배경 화면 숨기기
    textOnlyCheckbox.addEventListener('change', (e) => {
        state.textOnlyMode = e.target.checked;
    });

    // 6. 텍스트 배경 가림막 없애기
    hideTextBackgroundCheckbox.addEventListener('change', (e) => {
        state.hideTextBackground = e.target.checked;
    });

    // 7. 채도 비례 발광 효과
    enableBloomCheckbox.addEventListener('change', (e) => {
        state.enableBloom = e.target.checked;
    });

    // 8. 패널 표시/숨기기 토글 (단축키 'q' 또는 'Q')
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'q') {
            const panel = document.getElementById('control-panel');
            // getComputedStyle 또는 인라인 스타일을 확인하여 display 토글
            if (window.getComputedStyle(panel).display === 'none') {
                panel.style.display = 'flex';
            } else {
                panel.style.display = 'none';
            }
        }
    });

    // 브라우저 리사이징 시 비디오 종횡비가 깨지지 않게 해상도를 재계산 (비디오 소스 변경 시에도)
    window.addEventListener('resize', adjustCanvasSize);
}

/**
 * UI 설정 초기화
 * 전역 상태(Config 기반)를 참조하여 슬라이더와 체크박스의 초기값을 동기화
 */
function initUI() {
    thresholdSlider.value = state.saturationThreshold;
    thresholdLabel.textContent = `${state.saturationThreshold}%`;

    densitySlider.value = state.asciiDensity;
    densityLabel.textContent = `${state.asciiDensity}px`;

    delaySlider.max = MAX_DELAY_FRAMES;
    delaySlider.value = state.delayFrames;
    delayLabel.textContent = `${state.delayFrames}F`;

    colorSelect.value = state.colorMode;
    textOnlyCheckbox.checked = state.textOnlyMode;
    hideTextBackgroundCheckbox.checked = state.hideTextBackground;
    enableBloomCheckbox.checked = state.enableBloom;
}

// 애플리케이션 진입점
function bootstrap() {
    initUI();
    bindEvents();
    initCamera();
}

// 스크립트 로드 시 즉시 시작
bootstrap();
