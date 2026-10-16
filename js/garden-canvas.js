/**
 * The Slowest Garden in the World - 3-Layer 도트 거목 & 자연환경 캔버스 렌더링 엔진
 * Layer 1: Background Sky (실시간 KST 태양/달 궤도, 하늘 그라데이션, 별빛, 구름)
 * Layer 2: Static Tree & Soil Layer (오프스크린 캐싱, 레퍼런스 거목 렌더링, 30일 성장 스케일, 토양 수분/균열/꽃)
 * Layer 3: Dynamic Particle Layer (반딧불이 + 오디오 연동, 비/눈/바람, 나뭇잎 미세 흔들림, 물주기 연출)
 */

class GardenCanvasEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // 내부 논리 해상도 (선명한 픽셀아트 비율: 320x180)
    this.width = 320;
    this.height = 180;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // 상태 저장 변수
    this.growthProgress = 0.0;    // 0.0% ~ 100.0%
    this.targetGrowth = 0.0;
    this.moisture = 75.0;         // 0.0% ~ 100.0%
    this.targetMoisture = 75.0;
    this.status = 'HEALTHY';      // 'LUSH', 'HEALTHY', 'THIRSTY', 'WITHERED'
    this.weather = 'CLEAR';       // 'CLEAR', 'RAIN', 'SNOW', 'BREEZE'
    this.season = 'SPRING';       // 'SPRING', 'SUMMER', 'AUTUMN', 'WINTER'
    this.kstHour = 12.0;          // 0.0 ~ 24.0

    // 오프스크린 캐시 캔버스 (CPU 점유율 90% 절감)
    this.treeCacheCanvas = document.createElement('canvas');
    this.treeCacheCanvas.width = this.width;
    this.treeCacheCanvas.height = this.height;
    this.treeCacheCtx = this.treeCacheCanvas.getContext('2d');
    this.needsCacheRedraw = true;
    this.lastCachedGrowth = -1;
    this.lastCachedStatus = '';
    this.lastCachedSeason = '';

    // 레퍼런스 나무 이미지 로드 및 투명화 처리
    this.treeImage = new Image();
    this.isTreeImageLoaded = false;
    this.processedTreeCanvas = document.createElement('canvas');
    this.initTreeImage();

    // 동적 파티클 풀
    this.fireflies = [];
    this.initFireflies(16);

    this.weatherParticles = [];
    this.initWeatherParticles(35);

    this.waterSplashParticles = [];

    this.clouds = [
      { x: 20, y: 22, w: 38, h: 10, speed: 1.2 },
      { x: 110, y: 14, w: 52, h: 12, speed: 0.9 },
      { x: 220, y: 28, w: 44, h: 11, speed: 1.5 },
      { x: 290, y: 18, w: 32, h: 9, speed: 1.1 }
    ];

    this.stars = [];
    this.initStars(45);

    // 가뭄 균열 좌표 (결정론적 고정 지그재그)
    this.crackPaths = this.generateCrackPaths();

    // 델타 타임 및 애니메이션 루프 제어
    this.lastFrameTime = performance.now();
    this.animationFrameId = null;
    this.isPaused = false;
    this.leafSwayTime = 0;

    this.initVisibilityListener();
    this.startLoop();
  }

  // 레퍼런스 나무 이미지 로드
  initTreeImage() {
    this.treeImage.crossOrigin = 'anonymous';
    this.treeImage.src = '/tree.png';

    this.treeImage.onload = () => {
      // 이미지 배경 투명화 및 도트 최적화
      const w = this.treeImage.width;
      const h = this.treeImage.height;
      this.processedTreeCanvas.width = w;
      this.processedTreeCanvas.height = h;
      const pCtx = this.processedTreeCanvas.getContext('2d');
      pCtx.drawImage(this.treeImage, 0, 0);

      try {
        const imgData = pCtx.getImageData(0, 0, w, h);
        const data = imgData.data;
        // 흰색/밝은 회색 배경을 투명하게 알파 처리
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r > 238 && g > 238 && b > 238) {
            data[i + 3] = 0; // 완전 투명
          }
        }
        pCtx.putImageData(imgData, 0, 0);
      } catch (err) {
        // cross-origin 이슈 발생 시 원본 이미지 사용
      }

      this.isTreeImageLoaded = true;
      this.needsCacheRedraw = true;
      console.log('[CANVAS] 레퍼런스 도트 거목 에셋 로드 및 배경 투명화 완료');
    };

    this.treeImage.onerror = () => {
      console.warn('[CANVAS] 나무 이미지 로드 실패, 절차적 픽셀 거목 렌더러로 폴백합니다.');
      this.isTreeImageLoaded = false;
      this.needsCacheRedraw = true;
    };
  }

  // 1. 별빛 초기화
  initStars(count) {
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * (this.height * 0.65),
        baseAlpha: 0.3 + Math.random() * 0.7,
        blinkSpeed: 1.5 + Math.random() * 3.5,
        offset: Math.random() * Math.PI * 2
      });
    }
  }

  // 2. 반딧불이 초기화
  initFireflies(count) {
    this.fireflies = [];
    for (let i = 0; i < count; i++) {
      this.fireflies.push({
        x: 80 + Math.random() * 160,
        y: 60 + Math.random() * 85,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.3,
        glow: Math.random(),
        glowSpeed: 1.2 + Math.random() * 1.5,
        size: Math.random() > 0.5 ? 1.5 : 1,
        hadChimed: false
      });
    }
  }

  // 3. 날씨 파티클 초기화
  initWeatherParticles(count) {
    this.weatherParticles = [];
    for (let i = 0; i < count; i++) {
      this.weatherParticles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vy: 1.5 + Math.random() * 2.5,
        vx: (Math.random() - 0.5) * 0.5,
        length: 2 + Math.random() * 3,
        type: 'RAIN'
      });
    }
  }

  // 4. 가뭄 균열 지그재그 경로 사전 생성
  generateCrackPaths() {
    const groundY = 138;
    return [
      [
        { x: 60, y: groundY + 4 },
        { x: 68, y: groundY + 9 },
        { x: 65, y: groundY + 16 },
        { x: 74, y: groundY + 24 },
        { x: 70, y: groundY + 32 }
      ],
      [
        { x: 195, y: groundY + 3 },
        { x: 202, y: groundY + 8 },
        { x: 198, y: groundY + 15 },
        { x: 208, y: groundY + 22 },
        { x: 216, y: groundY + 30 }
      ],
      [
        { x: 250, y: groundY + 6 },
        { x: 244, y: groundY + 12 },
        { x: 252, y: groundY + 19 },
        { x: 248, y: groundY + 28 }
      ],
      [
        { x: 105, y: groundY + 8 },
        { x: 112, y: groundY + 15 },
        { x: 108, y: groundY + 23 }
      ]
    ];
  }

  // 페이지 비가시성 대응 (배터리 및 CPU 0% 절전 모드)
  initVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.isPaused = true;
        if (this.animationFrameId) {
          cancelAnimationFrame(this.animationFrameId);
          this.animationFrameId = null;
        }
      } else {
        this.isPaused = false;
        this.lastFrameTime = performance.now();
        this.startLoop();
      }
    });
  }

  // 상태 업데이트 메서드
  updateState(data) {
    if (!data) return;

    if (typeof data.moisture === 'number') this.targetMoisture = data.moisture;
    if (typeof data.growthProgress === 'number') this.targetGrowth = data.growthProgress;
    if (data.status) this.status = data.status;
    if (data.weather) this.weather = data.weather;
    if (data.season) this.season = data.season;

    if (data.kst) {
      this.kstHour = data.kst.hour + data.kst.minute / 60 + data.kst.second / 3600;
    }

    // 캐시 리드로우 조건 검증
    if (
      Math.abs(this.growthProgress - this.lastCachedGrowth) > 0.05 ||
      this.status !== this.lastCachedStatus ||
      this.season !== this.lastCachedSeason
    ) {
      this.needsCacheRedraw = true;
    }
  }

  // 메인 애니메이션 렌더링 루프
  startLoop() {
    const loop = (currentTime) => {
      if (this.isPaused) return;

      // Delta-time 스파이크 방지 (최대 50ms 클램핑)
      const dt = Math.min(currentTime - this.lastFrameTime, 50);
      this.lastFrameTime = currentTime;

      // 부드러운 상태 보간
      this.moisture += (this.targetMoisture - this.moisture) * 0.08;
      this.growthProgress += (this.targetGrowth - this.growthProgress) * 0.05;
      this.leafSwayTime += dt * 0.0015;

      // 캔버스 초기화
      this.ctx.clearRect(0, 0, this.width, this.height);

      // --- LAYER 1: Background Sky, Sun/Moon, Stars, Clouds ---
      this.renderSky(this.ctx);

      // --- LAYER 2: Static Tree & Soil Layer (오프스크린 캐시 사용) ---
      if (this.needsCacheRedraw) {
        this.renderTreeAndSoilToCache();
        this.needsCacheRedraw = false;
        this.lastCachedGrowth = this.growthProgress;
        this.lastCachedStatus = this.status;
        this.lastCachedSeason = this.season;
      }
      this.ctx.drawImage(this.treeCacheCanvas, 0, 0);

      // --- LAYER 3: Dynamic Particles (눈, 비, 반딧불이, 물방울, 미세 바람) ---
      this.renderDynamicLayer(this.ctx, dt);

      this.animationFrameId = requestAnimationFrame(loop);
    };

    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(loop);
    }
  }

  // ==========================================
  // LAYER 1: 실시간 하늘 및 일주운동 렌더링
  // ==========================================
  renderSky(ctx) {
    const hour = this.kstHour; // 0.0 ~ 24.0

    // 시간대별 하늘 그라데이션 컬러 팔레트 선형 보간 (RGB Lerp)
    let skyTop, skyBottom;

    if (hour >= 5.0 && hour < 7.0) {
      // 1) 새벽 여명 (05~07시): 신비로운 보랏빛/자주빛에서 코랄 핑크
      const t = (hour - 5.0) / 2.0;
      skyTop = this.lerpColor([38, 20, 56], [45, 85, 155], t);
      skyBottom = this.lerpColor([210, 115, 90], [130, 195, 230], t);
    } else if (hour >= 7.0 && hour < 17.0) {
      // 2) 한낮 (07~17시): 청명한 파란 하늘과 부드러운 하늘빛 지평선
      skyTop = 'rgb(30, 95, 185)';
      skyBottom = 'rgb(140, 205, 245)';
    } else if (hour >= 17.0 && hour < 19.5) {
      // 3) 노을/황혼 (17~19.5시): 붉은 주황 노을과 깊어지는 보랏빛 밤하늘
      const t = (hour - 17.0) / 2.5;
      skyTop = this.lerpColor([30, 95, 185], [18, 12, 38], t);
      skyBottom = this.lerpColor([235, 120, 45], [55, 25, 60], t);
    } else {
      // 4) 한밤중 (19.5~05시): 깊은 밤하늘 네이비-블랙
      skyTop = 'rgb(4, 8, 16)';
      skyBottom = 'rgb(12, 24, 38)';
    }

    const grad = ctx.createLinearGradient(0, 0, 0, this.height * 0.8);
    grad.addColorStop(0, skyTop);
    grad.addColorStop(1, skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // 밤/새벽 별빛 렌더링
    const isNight = hour >= 18.5 || hour < 5.5;
    if (isNight) {
      const nightIntensity = hour >= 20.0 || hour < 4.5 ? 1.0 : 0.6;
      ctx.fillStyle = '#ffffff';
      this.stars.forEach((star) => {
        const blink = Math.sin(performance.now() * 0.003 * star.blinkSpeed + star.offset);
        const alpha = Math.max(0, star.baseAlpha * (0.6 + blink * 0.4) * nightIntensity);
        ctx.globalAlpha = alpha;
        ctx.fillRect(Math.floor(star.x), Math.floor(star.y), 1, 1);
      });
      ctx.globalAlpha = 1.0;
    }

    // 도트 태양(Sun) 일주운동: 06:00 ~ 18:00 (포물선 궤도)
    if (hour >= 5.5 && hour <= 18.5) {
      const sunProgress = (hour - 5.5) / 13.0; // 0.0 ~ 1.0
      const sunX = this.width * sunProgress;
      const sunY = (this.height * 0.72) - Math.sin(sunProgress * Math.PI) * (this.height * 0.52);

      // 태양 은은한 광원 코로나
      ctx.fillStyle = 'rgba(254, 240, 138, 0.25)';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 14, 0, Math.PI * 2);
      ctx.fill();

      // 태양 도트 본체 (7x7 원형 도트)
      ctx.fillStyle = '#fef08a';
      this.drawPixelCircle(ctx, Math.floor(sunX), Math.floor(sunY), 4, '#fef08a');
      this.drawPixelCircle(ctx, Math.floor(sunX), Math.floor(sunY), 3, '#ffffff');
    }

    // 도트 달(Moon) 일주운동: 18:00 ~ 06:00
    if (hour > 18.0 || hour < 6.0) {
      const moonHour = hour >= 18.0 ? hour - 18.0 : hour + 6.0;
      const moonProgress = moonHour / 12.0; // 0.0 ~ 1.0
      const moonX = this.width * moonProgress;
      const moonY = (this.height * 0.72) - Math.sin(moonProgress * Math.PI) * (this.height * 0.48);

      // 달빛 은은한 후광
      ctx.fillStyle = 'rgba(224, 242, 254, 0.2)';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
      ctx.fill();

      // 달 도트 본체 (우아한 크레센트 달)
      this.drawPixelCircle(ctx, Math.floor(moonX), Math.floor(moonY), 4, '#e0f2fe');
      this.drawPixelCircle(ctx, Math.floor(moonX) + 2, Math.floor(moonY) - 1, 3, skyTop);
    }

    // 구름 천천히 이동 렌더링
    ctx.fillStyle = isNight ? 'rgba(25, 45, 65, 0.45)' : 'rgba(255, 255, 255, 0.65)';
    this.clouds.forEach((cloud) => {
      cloud.x += cloud.speed * 0.05;
      if (cloud.x > this.width + cloud.w) {
        cloud.x = -cloud.w;
      }
      this.drawPixelCloud(ctx, Math.floor(cloud.x), Math.floor(cloud.y), cloud.w, cloud.h);
    });
  }

  // ==========================================
  // LAYER 2: 오프스크린 캐시 렌더링 (거목 + 토양)
  // ==========================================
  renderTreeAndSoilToCache() {
    const cCtx = this.treeCacheCtx;
    cCtx.clearRect(0, 0, this.width, this.height);

    const groundY = 138;

    // 1. 하단 토양 횡단면 렌더링 (수분 상태에 따른 극적 변화)
    this.renderSoil(cCtx, groundY);

    // 2. 도트 거목(Tree) 렌더링 (30일 성장 스케일 반영)
    this.renderTree(cCtx, groundY);
  }

  // 토양 렌더링 (LUSH, HEALTHY, THIRSTY, WITHERED)
  renderSoil(ctx, groundY) {
    const m = this.moisture;

    // 토양 기본 컬러 팔레트
    let soilColor, grassColor, highlightGrass;
    if (m >= 70.0) {
      // LUSH: 윤기 나는 다크 초콜릿 토양 + 풍성한 연두 잔디
      soilColor = '#24140a';
      grassColor = '#16a34a';
      highlightGrass = '#4ade80';
    } else if (m >= 30.0) {
      // HEALTHY: 차분한 갈색 토양 + 표준 초록 잔디
      soilColor = '#382212';
      grassColor = '#22c55e';
      highlightGrass = '#86efac';
    } else if (m > 0) {
      // THIRSTY: 황토 모래빛 토양 + 누런 잔디
      soilColor = '#664a32';
      grassColor = '#a38438';
      highlightGrass = '#d4b358';
    } else {
      // WITHERED: 푸석한 회갈색 사막 토양 + 바랜 회록색 잔디
      soilColor = '#4a3d34';
      grassColor = '#635d55';
      highlightGrass = '#7e7870';
    }

    // 흙 본체 채우기
    ctx.fillStyle = soilColor;
    ctx.fillRect(0, groundY, this.width, this.height - groundY);

    // 지면 상단 잔디 띠 렌더링 (지그재그 도트)
    ctx.fillStyle = grassColor;
    ctx.fillRect(0, groundY - 2, this.width, 3);
    for (let x = 0; x < this.width; x += 3) {
      const h = ((x * 7) % 5 > 2) ? 2 : 1;
      ctx.fillRect(x, groundY - 2 - h, 2, h);
    }

    // LUSH 상태: 잔디 위에 작은 들꽃 & 아침 이슬 반사광
    if (m >= 70.0) {
      ctx.fillStyle = highlightGrass;
      for (let x = 15; x < this.width; x += 18) {
        ctx.fillRect(x, groundY - 4, 1, 2);
      }

      // 들꽃 (핑크, 노랑, 하늘색 작은 도트)
      const flowerColors = ['#f472b6', '#facc15', '#38bdf8'];
      for (let i = 0; i < 9; i++) {
        const fx = 35 + i * 28 + (i % 2) * 6;
        ctx.fillStyle = flowerColors[i % 3];
        ctx.fillRect(fx, groundY - 3, 2, 2);
      }

      // 물웅덩이/이슬 반사광
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(85, groundY + 1, 4, 1);
      ctx.fillRect(235, groundY + 2, 5, 1);
    }

    // THIRSTY 및 WITHERED 상태: 도트 가뭄 균열(Cracks) 렌더링
    if (m < 30.0) {
      ctx.strokeStyle = '#18100a';
      ctx.lineWidth = m <= 0 ? 2 : 1;

      this.crackPaths.forEach((path) => {
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
      });
    }
  }

  // 도트 나무 렌더링
  renderTree(ctx, groundY) {
    const prog = Math.max(0, Math.min(100, this.growthProgress));

    // 씨앗/새싹 상태 (성장률 0.5% 미만 극초기)
    if (prog < 0.5) {
      this.renderSeedling(ctx, this.width / 2, groundY);
      return;
    }

    // 30일 성장 스케일 인자 (0.12 ~ 1.0)
    // 0%일 때는 귀여운 묘목 크기 -> 100%일 때는 거대한 위용의 도트 거목
    const scaleFactor = 0.12 + 0.88 * (prog / 100.0);

    const treeCenterX = this.width / 2;
    const treeBaseY = groundY + 4; // 땅속 뿌리 연결선

    ctx.save();
    ctx.translate(treeCenterX, treeBaseY);
    ctx.scale(scaleFactor, scaleFactor);

    if (this.isTreeImageLoaded) {
      // 1) 레퍼런스 이미지 기반 풍성한 도트 거목 렌더링
      const imgW = this.processedTreeCanvas.width;
      const imgH = this.processedTreeCanvas.height;

      // 이미지 기준 하단 뿌리 중심점을 (0, 0)에 정렬
      const drawW = 190;
      const drawH = 190;
      const drawX = -drawW / 2;
      const drawY = -drawH + 16;

      ctx.drawImage(this.processedTreeCanvas, drawX, drawY, drawW, drawH);

      // 계절 테마 덧입히기 (벚꽃 하이라이트 / 눈송이 쌓임)
      this.applySeasonalTreeOverlays(ctx, drawX, drawY, drawW, drawH);

      // 시듦(Withered) 상태일 때 나뭇잎 갈색/회색 디스플레이 오버레이
      if (this.status === 'WITHERED') {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(95, 75, 55, 0.45)';
        ctx.fillRect(drawX, drawY, drawW, drawH);
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // 2) 레퍼런스 스타일 절차적(Procedural) 도트 거목 폴백 렌더러
      this.renderProceduralOakTree(ctx);
    }

    ctx.restore();
  }

  // 극초기 씨앗/새싹 렌더링
  renderSeedling(ctx, x, y) {
    ctx.fillStyle = '#6e3b1e';
    ctx.fillRect(x - 2, y - 2, 4, 3); // 씨앗
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(x - 1, y - 6, 2, 4); // 작은 새싹 줄기
    ctx.fillRect(x - 3, y - 8, 2, 2); // 왼쪽 떡잎
    ctx.fillRect(x + 1, y - 8, 2, 2); // 오른쪽 떡잎
  }

  // 계절 오버레이 (봄: 벚꽃 핑크 / 겨울: 눈 쌓임 / 가을: 단풍빛)
  applySeasonalTreeOverlays(ctx, x, y, w, h) {
    if (this.season === 'SPRING') {
      // 연분홍 벚꽃잎 하이라이트 도트
      ctx.fillStyle = 'rgba(251, 207, 232, 0.75)';
      for (let i = 0; i < 28; i++) {
        const px = x + 25 + (i * 17) % (w - 50);
        const py = y + 20 + (i * 23) % (h * 0.55);
        ctx.fillRect(px, py, 2, 2);
      }
    } else if (this.season === 'AUTUMN') {
      // 황금빛/단풍빛 포인트
      ctx.fillStyle = 'rgba(245, 158, 11, 0.65)';
      for (let i = 0; i < 35; i++) {
        const px = x + 20 + (i * 19) % (w - 40);
        const py = y + 15 + (i * 29) % (h * 0.6);
        ctx.fillRect(px, py, 2, 2);
      }
    } else if (this.season === 'WINTER') {
      // 나뭇가지/수관 위에 쌓인 하얀 도트 눈송이
      ctx.fillStyle = '#f8fafc';
      for (let i = 0; i < 30; i++) {
        const px = x + 30 + (i * 21) % (w - 60);
        const py = y + 25 + (i * 19) % (h * 0.5);
        ctx.fillRect(px, py, 3, 1);
      }
    }
  }

  // 절차적(Procedural) 도트 거목 폴백 렌더러 (4단계 명암 팔레트)
  renderProceduralOakTree(ctx) {
    // 굵고 든든한 뿌리와 기둥
    ctx.fillStyle = '#3b2114';
    ctx.fillRect(-16, -55, 32, 55); // 중심 기둥
    ctx.fillRect(-28, -12, 14, 12); // 좌측 뿌리
    ctx.fillRect(14, -12, 14, 12);  // 우측 뿌리

    // 기둥 명암과 나무껍질 결
    ctx.fillStyle = '#6e3b1e';
    ctx.fillRect(-8, -50, 16, 45);
    ctx.fillStyle = '#c27d44';
    ctx.fillRect(-3, -45, 6, 38);

    // 수관 클러스터 (Layer 1 심부 그림자 -> Layer 2 중간 -> Layer 3 햇빛 하이라이트)
    const blobs = [
      { x: 0, y: -90, r: 42 },
      { x: -35, y: -75, r: 32 },
      { x: 35, y: -75, r: 32 },
      { x: -50, y: -55, r: 24 },
      { x: 50, y: -55, r: 24 }
    ];

    // Layer 1: 어두운 그림자 실루엣
    blobs.forEach((b) => this.drawPixelCircle(ctx, b.x, b.y, b.r, '#142e1f'));
    // Layer 2: 풍성한 미드 그린
    blobs.forEach((b) => this.drawPixelCircle(ctx, b.x, b.y - 2, b.r - 4, '#1f572c'));
    // Layer 3: 생생한 브라이트 그린
    blobs.forEach((b) => this.drawPixelCircle(ctx, b.x + 2, b.y - 5, b.r - 8, '#479c38'));
    // Layer 4: 햇빛 하이라이트
    blobs.forEach((b) => this.drawPixelCircle(ctx, b.x + 4, b.y - 8, b.r - 14, '#9be964'));
  }

  // ==========================================
  // LAYER 3: 동적 파티클 및 실시간 인터랙션
  // ==========================================
  renderDynamicLayer(ctx, dt) {
    const isNight = this.kstHour >= 18.0 || this.kstHour < 6.0;

    // 1. 밤 시간대 반딧불이(Fireflies) 렌더링 & 오디오 차임 연동
    if (isNight && this.status !== 'WITHERED') {
      this.fireflies.forEach((f) => {
        // 자연스러운 방황 운동
        f.x += f.vx;
        f.y += f.vy;

        if (f.x < 40 || f.x > this.width - 40) f.vx *= -1;
        if (f.y < 35 || f.y > 135) f.vy *= -1;

        f.glow += f.glowSpeed * dt * 0.001;
        const brightness = Math.sin(f.glow);

        // 가장 밝게 점멸하는 순간(피크)에 반딧불이 사운드 트리거
        if (brightness > 0.96 && !f.hadChimed) {
          f.hadChimed = true;
          if (window.gardenAudio) {
            window.gardenAudio.playFireflyChime();
          }
        } else if (brightness < 0.2) {
          f.hadChimed = false;
        }

        if (brightness > 0) {
          const alpha = brightness * 0.9;
          ctx.fillStyle = `rgba(163, 230, 53, ${alpha})`;
          ctx.fillRect(Math.floor(f.x), Math.floor(f.y), f.size, f.size);

          // 부드러운 발광 헐레이션
          ctx.fillStyle = `rgba(217, 249, 157, ${alpha * 0.35})`;
          ctx.fillRect(Math.floor(f.x) - 1, Math.floor(f.y) - 1, f.size + 2, f.size + 2);
        }
      });
    }

    // 2. 날씨 파티클 (비 / 눈 / 산들바람)
    if (this.weather === 'RAIN') {
      ctx.fillStyle = 'rgba(125, 211, 252, 0.75)';
      this.weatherParticles.forEach((p) => {
        p.y += p.vy * (dt / 16);
        p.x += p.vx * (dt / 16);
        if (p.y > 138) {
          p.y = -5;
          p.x = Math.random() * this.width;
        }
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, p.length);
      });
    } else if (this.weather === 'SNOW') {
      ctx.fillStyle = '#ffffff';
      this.weatherParticles.forEach((p) => {
        p.y += p.vy * 0.4 * (dt / 16);
        p.x += Math.sin(p.y * 0.05) * 0.6;
        if (p.y > 138) {
          p.y = -5;
          p.x = Math.random() * this.width;
        }
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2);
      });
    }

    // 3. 물주기 클릭 시 쏟아지는 물방울 연출 (Cascading Water Splash)
    for (let i = this.waterSplashParticles.length - 1; i >= 0; i--) {
      const wp = this.waterSplashParticles[i];
      wp.x += wp.vx;
      wp.y += wp.vy;
      wp.vy += 0.25; // 중력
      wp.life -= dt * 0.002;

      if (wp.life <= 0 || wp.y >= 140) {
        this.waterSplashParticles.splice(i, 1);
        continue;
      }

      ctx.fillStyle = `rgba(56, 189, 248, ${Math.max(0, wp.life)})`;
      ctx.fillRect(Math.floor(wp.x), Math.floor(wp.y), wp.size, wp.size);
    }
  }

  // 물주기 애니메이션 트리거 (50개의 영롱한 물방울 파티클 방출)
  triggerWaterEffect() {
    const startX = this.width / 2;
    const startY = 40;

    for (let i = 0; i < 45; i++) {
      this.waterSplashParticles.push({
        x: startX + (Math.random() - 0.5) * 35,
        y: startY + Math.random() * 20,
        vx: (Math.random() - 0.5) * 1.8,
        vy: 1.0 + Math.random() * 2.5,
        size: Math.random() > 0.5 ? 2 : 1,
        life: 0.8 + Math.random() * 0.4
      });
    }

    // 토양에 수분이 들어갔으므로 캐시 리드로우
    this.needsCacheRedraw = true;
  }

  // ==========================================
  // 유틸리티 도트 드로잉 헬퍼
  // ==========================================
  drawPixelCircle(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) {
          ctx.fillRect(cx + x, cy + y, 1, 1);
        }
      }
    }
  }

  drawPixelCloud(ctx, x, y, w, h) {
    ctx.fillRect(x + 4, y, w - 8, h);
    ctx.fillRect(x, y + 3, w, h - 4);
    ctx.fillRect(x + 2, y + 1, w - 4, h - 2);
  }

  lerpColor(a, b, t) {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r}, ${g}, ${bl})`;
  }
}

// 전역 싱글톤 인스턴스
window.GardenCanvasEngine = GardenCanvasEngine;
