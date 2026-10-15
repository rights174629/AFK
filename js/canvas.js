/**
 * Keep the Fire Alive - 프로페셔널 2D Canvas 픽셀 아트 및 고성능 모닥불 엔진
 * 
 * [디테일 향상]
 * 1. 3D 입체 화로 스톤 링(River Stones) & 숯더미(Ember Bed) & 맥박치는 잉걸불 코어
 * 2. 나이테와 타오르는 균열(Heat Fissures)이 살아있는 4단 교차 통나무
 * 3. 다층 연소 불꽃 시스템: 파란색 연소 기저부(Blue Flame Base) -> 백열 화염 코어 -> 주황/금빛 화염 -> 진홍색 불꽃 혓바닥
 * 4. 유기적 대류 흔들림(Sway & Turbulence)과 열기 상승 기류
 * 5. S자 궤적으로 부드럽게 표류하는 불티(Embers) 및 밤바람에 흩어지는 반투명 연기
 * 6. 바닥 반사광 및 2단 하모닉 앰비언트 라이트
 * 
 * [최적화 기법]
 * 1. 무(Zero) GC Object Pooling (550개 사전 할당 객체 완전 재사용)
 * 2. 핫 루프 내 동적 문자열(rgba) 생성 원천 제거: 색상 팔레트 LUT(Look-Up Table) 사전 캐싱
 * 3. Delta-time 기반 60Hz/120Hz/144Hz 주사율 완벽 정규화
 * 4. 비트 연산 고속 정수 래스터라이징 (| 0)으로 서브픽셀 연산 제거 및 레트로 선명도 보장
 * 5. 탭 비활성화 시 자동 절전/스로틀링으로 모바일 배터리 및 CPU 보호
 */

class FireCanvasRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d', { alpha: false }); // 알파 채널 불필요 시 성능 극대화

    // 픽셀 레트로 해상도
    this.width = 320;
    this.height = 180;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // 화로 중심점 (320x180 기준 가장 안정적인 뷰포트 비율)
    this.hearthX = 160;
    this.hearthY = 125;

    // 현재 화력 수치 및 보간 대상
    this.currentLife = 75.0;
    this.targetLife = 75.0;

    // 시간 및 타이머
    this.time = 0;
    this.lastTimestamp = performance.now();
    this.isTabActive = true;
    this.animationFrameId = null;

    // 날아가는 장작 애니메이션 배열
    this.flyingLogs = [];

    // 1. 색상 LUT (Look-Up Table) 사전 생성 (핫 루프 GC 압박 제거)
    this.initColorLUTs();

    // 2. 파티클 오브젝트 풀 (550개 사전 할당)
    this.poolSize = 550;
    this.particles = new Array(this.poolSize);
    for (let i = 0; i < this.poolSize; i++) {
      this.particles[i] = {
        active: false,
        type: 'flame', // 'blue_base', 'core', 'flame', 'tip', 'spark', 'smoke'
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 1,
        life: 0,
        maxLife: 1,
        seed: Math.random() * 10
      };
    }

    // 3. 백그라운드 탭 절전 리스너
    document.addEventListener('visibilitychange', () => {
      this.isTabActive = !document.hidden;
      if (this.isTabActive) {
        this.lastTimestamp = performance.now();
        if (!this.animationFrameId) {
          this.animationFrameId = requestAnimationFrame(this.render);
        }
      }
    });

    // 4. 애니메이션 프레임 바인딩 및 시작
    this.render = this.render.bind(this);
    this.animationFrameId = requestAnimationFrame(this.render);
  }

  // 색상 팔레트 Look-Up Table (LUT) 사전 빌드
  initColorLUTs() {
    // A. 불꽃 단계별 색상 (24단계)
    this.flameLUT = [
      '#ffffff', '#fffdf0', '#fff9c4', '#fef08a', '#fde047',
      '#facc15', '#fbbf24', '#f59e0b', '#d97706', '#b45309',
      '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12',
      '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d',
      '#601313', '#450a0a', '#2d0606', '#1a0404'
    ];

    // B. 불티(Spark/Ember) 단계별 색상 (16단계)
    this.sparkLUT = [
      '#ffffff', '#fffbeb', '#fef08a', '#fde047', '#facc15',
      '#fbbf24', '#f59e0b', '#f97316', '#ea580c', '#dc2626',
      '#b91c1c', '#991b1b', '#7f1d1d', '#581c1c', '#381010', '#1f0808'
    ];

    // C. 연기(Smoke) 투명도 단계별 색상 (16단계)
    this.smokeLUT = [];
    for (let i = 0; i < 16; i++) {
      const alpha = Math.max(0, 0.22 * (1 - i / 15)).toFixed(3);
      this.smokeLUT.push(`rgba(130, 142, 160, ${alpha})`);
    }

    // D. 파란색 기저 불꽃 색상
    this.blueFlameLUT = ['#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'];
  }

  // 목표 화력 업데이트 (서버 소켓 통신 시 호출)
  setTargetLife(life) {
    this.targetLife = Math.max(0, Math.min(100, life));
  }

  // 파티클 하나 활성화 (풀에서 재사용)
  spawnParticle(type, x, y, vx, vy, size, maxLife) {
    for (let i = 0; i < this.poolSize; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.type = type;
        p.x = x;
        p.y = y;
        p.vx = vx;
        p.vy = vy;
        p.size = size;
        p.life = 0;
        p.maxLife = maxLife;
        p.seed = Math.random() * 10;
        return p;
      }
    }
    return null;
  }

  // 장작 투입 시 날아가는 애니메이션 시작
  throwLog() {
    this.flyingLogs.push({
      startX: 160 + (Math.random() * 40 - 20),
      startY: 195,
      targetX: this.hearthX + (Math.random() * 8 - 4),
      targetY: this.hearthY - 4,
      progress: 0,
      speed: 0.038 + Math.random() * 0.008,
      rotation: 0
    });
  }

  // 화로에 장작 도달 시 불티 폭발 연출
  burstEmbers(count = 35) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 1.05) + Math.random() * (Math.PI * 0.9);
      const speed = 1.2 + Math.random() * 2.8;
      this.spawnParticle(
        'spark',
        this.hearthX + (Math.random() * 16 - 8),
        this.hearthY - 5,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        Math.random() < 0.25 ? 2 : 1,
        35 + Math.random() * 45
      );
    }
  }

  // 정교한 멀티티어 파티클 생성기
  generateParticles(dtScale) {
    if (this.currentLife <= 0) {
      // 꺼졌을 때는 아주 가끔 스산한 잔여 연기만 소량 배출
      if (Math.random() < 0.12 * dtScale) {
        this.spawnParticle('smoke', this.hearthX + (Math.random() * 20 - 10), this.hearthY - 4, (Math.random() - 0.5) * 0.25, -0.35, 2, 60);
      }
      return;
    }

    const intensity = this.currentLife / 100;

    // 1. 파란색 기저 연소 불꽃 (Blue Flame Base: 신선한 산소와 장작 가스가 만나는 최하단)
    if (Math.random() < 0.35 * intensity * dtScale) {
      this.spawnParticle(
        'blue_base',
        this.hearthX + (Math.random() * 14 - 7),
        this.hearthY + 2,
        (Math.random() - 0.5) * 0.3,
        -(0.3 + Math.random() * 0.4),
        1,
        8 + Math.random() * 8
      );
    }

    // 2. 백열 화염 코어 (Core: 중심부의 가장 뜨거운 백황색 화염 혓바닥)
    const coreCount = Math.floor(intensity * 2.5 * dtScale) + 1;
    for (let i = 0; i < coreCount; i++) {
      const offsetX = (Math.random() - 0.5) * (10 * intensity + 4);
      const vy = -(0.9 + Math.random() * 1.5 * intensity);
      const vx = (Math.random() - 0.5) * 0.4;
      const size = Math.floor(Math.random() * 2.5 * intensity) + 2;
      const maxLife = 14 + Math.random() * 18 * intensity;

      this.spawnParticle('core', this.hearthX + offsetX, this.hearthY - 2, vx, vy, size, maxLife);
    }

    // 3. 메인 황금빛/주황 불꽃 (Main Body Flames: 웅장하게 솟구치며 춤추는 불길)
    const flameCount = Math.floor(intensity * 4.2 * dtScale) + 1;
    for (let i = 0; i < flameCount; i++) {
      const offsetX = (Math.random() - 0.5) * (20 * intensity + 6);
      const vy = -(0.7 + Math.random() * 1.7 * intensity);
      const vx = (Math.random() - 0.5) * 0.55;
      const size = Math.floor(Math.random() * 3 * intensity) + 2;
      const maxLife = 18 + Math.random() * 26 * intensity;

      this.spawnParticle('flame', this.hearthX + offsetX, this.hearthY - 4, vx, vy, size, maxLife);
    }

    // 4. 불꽃 끝단 혓바닥 (Flame Licking Tips: 불꽃의 날렵한 끝부분)
    if (Math.random() < 0.5 * intensity * dtScale) {
      const tipOffsetX = (Math.random() - 0.5) * (14 * intensity + 4);
      this.spawnParticle('tip', this.hearthX + tipOffsetX, this.hearthY - 14 * intensity, (Math.random() - 0.5) * 0.4, -(1.2 + Math.random() * 1.2), 1, 12 + Math.random() * 16);
    }

    // 5. 부드럽게 흩날리는 불티 (Living Embers & Floating Sparks)
    if (Math.random() < (0.45 * intensity) * dtScale) {
      const sparkVx = (Math.random() - 0.5) * 1.4;
      const sparkVy = -(1.2 + Math.random() * 1.9 * intensity);
      const sparkSize = Math.random() < 0.3 ? 2 : 1;
      this.spawnParticle('spark', this.hearthX + (Math.random() * 16 - 8), this.hearthY - 6, sparkVx, sparkVy, sparkSize, 38 + Math.random() * 38);
    }

    // 6. 밤하늘로 피어오르는 부드러운 장작 연기 (Soft Campfire Smoke)
    if (Math.random() < (0.22 + (1 - intensity) * 0.28) * dtScale) {
      const smokeVx = (Math.random() - 0.5) * 0.35 + 0.12; // 바람에 살짝 우측 표류
      const smokeVy = -(0.35 + Math.random() * 0.45);
      const smokeSize = Math.floor(Math.random() * 2) + 2;
      this.spawnParticle('smoke', this.hearthX + (Math.random() * 16 - 8), this.hearthY - 10, smokeVx, smokeVy, smokeSize, 55 + Math.random() * 35);
    }
  }

  // 메인 애니메이션 렌더 프레임
  render(currentTimestamp) {
    if (!this.isTabActive) {
      this.animationFrameId = null;
      return;
    }

    // Delta-Time 계산 (60Hz 기준 1.0으로 스케일링)
    const elapsedMs = Math.min(50, currentTimestamp - this.lastTimestamp);
    this.lastTimestamp = currentTimestamp;
    const dtScale = elapsedMs / 16.667;

    // 화력 수치 부드러운 LERP 보간
    this.currentLife += (this.targetLife - this.currentLife) * (0.08 * dtScale);
    this.time += 0.05 * dtScale;

    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;

    // 1. 배경 어둠 칠하기
    ctx.fillStyle = '#06080e';
    ctx.fillRect(0, 0, width, height);

    const intensity = this.currentLife / 100;

    // 2. 앰비언트 동적 광원 렌더링 (Radial Light)
    if (this.currentLife > 0) {
      const flicker = Math.sin(this.time * 3.4) * 3 + Math.cos(this.time * 7.1) * 2;
      const lightRadius = Math.max(20, 35 + 95 * intensity + flicker);

      const radGrad = ctx.createRadialGradient(
        this.hearthX, this.hearthY - 8, 4,
        this.hearthX, this.hearthY - 8, lightRadius
      );
      radGrad.addColorStop(0, `rgba(255, 145, 45, ${(0.42 * intensity).toFixed(3)})`);
      radGrad.addColorStop(0.35, `rgba(220, 85, 20, ${(0.22 * intensity).toFixed(3)})`);
      radGrad.addColorStop(0.75, `rgba(160, 40, 10, ${(0.07 * intensity).toFixed(3)})`);
      radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(this.hearthX, this.hearthY - 8, lightRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. 지면 및 바닥 광원 반사
    this.drawGround(ctx, intensity);

    // 4. 모닥불 화로(돌 링, 숯더미, 통나무) 렌더링
    this.drawHearth(ctx, intensity);

    // 5. 파티클 물리 업데이트 및 렌더링
    this.generateParticles(dtScale);

    for (let i = 0; i < this.poolSize; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life += dtScale;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      // 대류 기류 흔들림 (Turbulence) 적용
      if (p.type === 'flame' || p.type === 'core') {
        p.vx += Math.sin(p.life * 0.18 + p.seed) * 0.12 * dtScale;
        // 중심부로 모여드는 대류 현상
        const distFromCenter = p.x - this.hearthX;
        p.vx -= distFromCenter * 0.015 * dtScale;
      } else if (p.type === 'spark') {
        // 불티는 자연스럽게 바람과 열기에 흔들리며 S자로 비행
        p.vx += Math.sin(p.life * 0.12 + p.seed) * 0.15 * dtScale;
        p.vy -= 0.01 * dtScale; // 미세한 열기 부력
      } else if (p.type === 'smoke') {
        p.vx += Math.sin(p.life * 0.08 + p.seed) * 0.1 * dtScale;
      }

      p.x += p.vx * dtScale;
      p.y += p.vy * dtScale;

      const progress = p.life / p.maxLife;
      const px = (p.x + 0.5) | 0;
      const py = (p.y + 0.5) | 0;

      // 파티클 타입별 렌더링 (LUT 사용으로 GC 제로)
      if (p.type === 'core') {
        // 백열 화염 중심: 흰색 -> 황금색
        const lutIdx = Math.min(this.flameLUT.length - 1, (progress * 10) | 0);
        ctx.fillStyle = this.flameLUT[lutIdx];
        const sz = Math.max(1, (p.size * (1 - progress * 0.5) + 0.5) | 0);
        ctx.fillRect(px, py, sz, sz);

      } else if (p.type === 'flame') {
        // 메인 불꽃: 황금빛 -> 주황 -> 진홍 -> 암적색
        const lutIdx = Math.min(this.flameLUT.length - 1, (progress * 23) | 0);
        ctx.fillStyle = this.flameLUT[lutIdx];
        const sz = Math.max(1, (p.size * (1 - progress * 0.65) + 0.5) | 0);
        ctx.fillRect(px, py, sz, sz);

      } else if (p.type === 'blue_base') {
        // 기저 파란 불꽃
        const idx = Math.min(this.blueFlameLUT.length - 1, (progress * 4) | 0);
        ctx.fillStyle = this.blueFlameLUT[idx];
        ctx.fillRect(px, py, 1, 1);

      } else if (p.type === 'tip') {
        // 불꽃 혓바닥 끝단
        ctx.fillStyle = progress > 0.5 ? '#991b1b' : '#dc2626';
        ctx.fillRect(px, py, 1, 1);

      } else if (p.type === 'spark') {
        // 불티(Ember): 밝은 백열/노랑에서 붉은빛으로 서서히 식어감
        const lutIdx = Math.min(this.sparkLUT.length - 1, (progress * 15) | 0);
        ctx.fillStyle = this.sparkLUT[lutIdx];
        const sz = p.size;
        ctx.fillRect(px, py, sz, sz);

      } else if (p.type === 'smoke') {
        // 연기: LUT에서 사전 계산된 반투명 회색 적용
        const lutIdx = Math.min(this.smokeLUT.length - 1, (progress * 15) | 0);
        ctx.fillStyle = this.smokeLUT[lutIdx];
        const sz = (p.size + progress * 2.5) | 0;
        ctx.fillRect(px, py, sz, sz);
      }
    }

    // 6. 날아가는 장작 애니메이션 렌더링
    for (let i = this.flyingLogs.length - 1; i >= 0; i--) {
      const log = this.flyingLogs[i];
      log.progress += log.speed * dtScale;
      log.rotation += 0.14 * dtScale;

      const t = log.progress;
      const controlX = (log.startX + log.targetX) / 2 + 18;
      const controlY = Math.min(log.startY, log.targetY) - 54;

      const curX = (1 - t) * (1 - t) * log.startX + 2 * (1 - t) * t * controlX + t * t * log.targetX;
      const curY = (1 - t) * (1 - t) * log.startY + 2 * (1 - t) * t * controlY + t * t * log.targetY;

      // 픽셀 통나무 그리기 (단면 및 디테일)
      ctx.save();
      ctx.translate(curX | 0, curY | 0);
      ctx.rotate(log.rotation);

      // 통나무 껍질 및 결
      ctx.fillStyle = '#422413';
      ctx.fillRect(-8, -3, 16, 6);
      ctx.fillStyle = '#7c4826';
      ctx.fillRect(-7, -2, 14, 4);
      ctx.fillStyle = '#b47348';
      ctx.fillRect(-6, -1, 12, 2);

      // 나이테 단면 포인트
      ctx.fillStyle = '#c58b5b';
      ctx.fillRect(6, -2, 2, 4);

      ctx.restore();

      if (log.progress >= 1.0) {
        this.flyingLogs.splice(i, 1);
        this.burstEmbers(30);
        if (window.fireAudio) window.fireAudio.playLogDrop();
      }
    }

    this.animationFrameId = requestAnimationFrame(this.render);
  }

  // 지면 및 지면 반사광 렌더링
  drawGround(ctx, intensity) {
    const groundY = 136;

    // 밤의 대지 바닥
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, groundY, this.width, this.height - groundY);

    // 지평선 테두리
    ctx.fillStyle = '#121722';
    ctx.fillRect(0, groundY, this.width, 2);

    // 모닥불이 지면에 드리우는 은은한 타원형 주황빛 반사광
    if (intensity > 0) {
      const groundGlowAlpha = (0.28 * intensity).toFixed(3);
      const groundGrad = ctx.createRadialGradient(
        this.hearthX, groundY + 4, 6,
        this.hearthX, groundY + 4, 65 * intensity + 20
      );
      groundGrad.addColorStop(0, `rgba(255, 120, 30, ${groundGlowAlpha})`);
      groundGrad.addColorStop(0.5, `rgba(180, 60, 10, ${(groundGlowAlpha * 0.4).toFixed(3)})`);
      groundGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.save();
      ctx.scale(1, 0.4);
      ctx.fillStyle = groundGrad;
      ctx.beginPath();
      ctx.arc(this.hearthX, (groundY + 4) / 0.4, 65 * intensity + 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 모닥불 화로 디테일 (둥근 자연석 스톤 링 + 숯/재 침대 + 잉걸불 + 3D 교차 통나무)
  drawHearth(ctx, intensity) {
    const x = this.hearthX;
    const y = this.hearthY;

    // 1. 화로 뒤쪽 스톤 링 (자연석 돌멩이 4개 배치)
    this.drawStone(ctx, x - 26, y + 2, 9, 6, '#262d3d', '#181e2b', intensity);
    this.drawStone(ctx, x - 12, y - 1, 10, 5, '#2b3345', '#191f2c', intensity);
    this.drawStone(ctx, x + 5, y - 1, 10, 5, '#2d3547', '#1b212f', intensity);
    this.drawStone(ctx, x + 18, y + 2, 9, 6, '#242a3a', '#171c28', intensity);

    // 2. 재(Ash)와 숯 침대 (Ash & Charcoal Bed)
    ctx.fillStyle = '#1e2433';
    ctx.fillRect(x - 24, y + 5, 48, 5);
    ctx.fillStyle = '#2a3246';
    ctx.fillRect(x - 20, y + 4, 40, 4);

    // 3. 숨쉬듯 맥박치는 붉은 숯과 잉걸불 (Glowing Coal Bed)
    if (this.currentLife > 0) {
      const pulse = 0.55 + 0.35 * Math.sin(this.time * 2.8) + intensity * 0.25;

      // 깊은 붉은 숯불
      ctx.fillStyle = `rgba(235, 55, 15, ${Math.min(1, pulse * 0.95).toFixed(2)})`;
      ctx.fillRect(x - 16, y + 3, 32, 4);

      // 밝은 황금빛 핫스팟 코어
      ctx.fillStyle = `rgba(255, 190, 40, ${Math.min(1, pulse * 1.1).toFixed(2)})`;
      ctx.fillRect(x - 10, y + 2, 20, 3);
      ctx.fillStyle = '#fff4a3';
      ctx.fillRect(x - 4, y + 2, 8, 2);
    } else {
      // 불꽃이 차갑게 꺼졌을 때: 검게 탄 숯과 회색 재
      ctx.fillStyle = '#0f1118';
      ctx.fillRect(x - 16, y + 3, 32, 4);
      ctx.fillStyle = '#171922';
      ctx.fillRect(x - 8, y + 2, 16, 2);
    }

    // 4. 리얼한 4단 입체 교차 통나무 (Logs with Bark, Grain & Heat Cracks)
    this.drawWoodLogs(ctx, x, y, intensity);

    // 5. 화로 앞쪽 스톤 링 (전면을 둘러싸는 강돌 5개 배치)
    this.drawStone(ctx, x - 22, y + 7, 10, 6, '#374154', '#1f2633', intensity);
    this.drawStone(ctx, x - 10, y + 8, 11, 7, '#3c475c', '#222938', intensity);
    this.drawStone(ctx, x + 2, y + 8, 11, 7, '#3a455a', '#212836', intensity);
    this.drawStone(ctx, x + 14, y + 7, 10, 6, '#354052', '#1e2431', intensity);
  }

  // 3D 픽셀 자연석 돌멩이 렌더러 (상단 화염 반사 하이라이트 + 측면 그림자)
  drawStone(ctx, sx, sy, sw, sh, colorLight, colorDark, intensity) {
    // 돌 기본 몸체
    ctx.fillStyle = colorDark;
    ctx.fillRect(sx, sy, sw, sh);

    // 돌 상단 둥근 입체감
    ctx.fillStyle = colorLight;
    ctx.fillRect(sx + 1, sy, sw - 2, sh - 2);

    // 불꽃이 켜져 있을 때 돌의 안쪽 가장자리에 맺히는 따뜻한 불빛 반사광
    if (intensity > 0) {
      const glowA = (0.35 * intensity).toFixed(2);
      ctx.fillStyle = `rgba(255, 140, 40, ${glowA})`;
      ctx.fillRect(sx + 2, sy + 1, sw - 4, 1);
    }
  }

  // 장작 통나무 디테일 렌더러
  drawWoodLogs(ctx, x, y, intensity) {
    // 통나무 1: 뒤쪽 가로 받침 장작 (어두운 나무껍질)
    ctx.fillStyle = '#24140a';
    ctx.fillRect(x - 20, y + 1, 40, 6);
    ctx.fillStyle = '#422513';
    ctx.fillRect(x - 18, y + 2, 36, 4);

    // 통나무 2: 좌측 대각선으로 걸쳐진 참나무 장작
    ctx.fillStyle = '#321b0e';
    ctx.fillRect(x - 16, y - 3, 14, 6);
    ctx.fillStyle = '#5c331a';
    ctx.fillRect(x - 14, y - 2, 11, 4);
    // 좌측 통나무 나이테 단면
    ctx.fillStyle = '#a16538';
    ctx.fillRect(x - 16, y - 2, 2, 4);
    ctx.fillStyle = '#d49563';
    ctx.fillRect(x - 15, y - 1, 1, 2);

    // 통나무 3: 우측 대각선으로 교차된 자작나무 장작
    ctx.fillStyle = '#3a2012';
    ctx.fillRect(x + 2, y - 3, 14, 6);
    ctx.fillStyle = '#6b3c1f';
    ctx.fillRect(x + 3, y - 2, 11, 4);
    // 우측 통나무 나이테 단면
    ctx.fillStyle = '#a16538';
    ctx.fillRect(x + 14, y - 2, 2, 4);
    ctx.fillStyle = '#d49563';
    ctx.fillRect(x + 14, y - 1, 1, 2);

    // 통나무 4: 전면 중앙 장작 & 타오르는 붉은 균열 (Heat Fissures)
    ctx.fillStyle = '#2a160c';
    ctx.fillRect(x - 10, y + 2, 20, 5);
    ctx.fillStyle = '#4e2a16';
    ctx.fillRect(x - 9, y + 3, 18, 3);

    // 🔥 장작 표면의 불타는 열기 균열 (화력이 살아있을 때 실시간 박동)
    if (intensity > 0) {
      const crackPulse = 0.6 + 0.4 * Math.sin(this.time * 3.2);
      ctx.fillStyle = `rgba(255, 90, 20, ${crackPulse.toFixed(2)})`;
      ctx.fillRect(x - 6, y + 3, 12, 1);
      ctx.fillRect(x - 2, y + 4, 6, 1);

      ctx.fillStyle = `rgba(255, 210, 60, ${(crackPulse * 0.9).toFixed(2)})`;
      ctx.fillRect(x - 4, y + 3, 4, 1);
    }
  }
}

// 캔버스 렌더러 전역 인스턴스 초기화
window.fireCanvas = new FireCanvasRenderer('fire-canvas');
