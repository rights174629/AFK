/**
 * Keep the Fire Alive - 2D Canvas 픽셀 아트 및 파티클 엔진
 * 320x180 저해상도 픽셀 뷰포트 + 가비지 컬렉션(GC) 부하 없는 Object Pooling 적용
 */

class FireCanvasRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // 픽셀 레트로 해상도
    this.width = 320;
    this.height = 180;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // 화로 중심점 (모바일 및 데스크톱 균형 최적화)
    this.hearthX = 160;
    this.hearthY = 125;

    // 현재 화력 수치 및 보간 대상
    this.currentLife = 75.0;
    this.targetLife = 75.0;

    // 파티클 오브젝트 풀 (400개 사전 할당)
    this.poolSize = 400;
    this.particles = [];
    for (let i = 0; i < this.poolSize; i++) {
      this.particles.push({
        active: false,
        type: 'flame', // 'flame', 'spark', 'smoke'
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 1,
        life: 0,
        maxLife: 1,
        colorIndex: 0
      });
    }

    // 날아가는 장작 애니메이션 배열
    this.flyingLogs = [];

    // 불빛 펄스 타이머
    this.flickerTimer = 0;

    // 애니메이션 프레임 바인딩
    this.render = this.render.bind(this);
    requestAnimationFrame(this.render);
  }

  // 목표 화력 업데이트 (서버에서 수신 시)
  setTargetLife(life) {
    this.targetLife = Math.max(0, Math.min(100, life));
  }

  // 파티클 하나 활성화 (풀에서 가져오기)
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
        return p;
      }
    }
    return null;
  }

  // 장작 투입 시 날아가는 애니메이션 시작
  throwLog() {
    this.flyingLogs.push({
      startX: 160 + (Math.random() * 40 - 20),
      startY: 190,
      targetX: this.hearthX,
      targetY: this.hearthY - 4,
      progress: 0,
      speed: 0.035 + Math.random() * 0.01,
      rotation: 0
    });
  }

  // 화로에 장작 도달 시 불티 폭발
  burstEmbers(count = 30) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 1.1) + Math.random() * (Math.PI * 0.8);
      const speed = 1.0 + Math.random() * 2.5;
      this.spawnParticle(
        'spark',
        this.hearthX + (Math.random() * 12 - 6),
        this.hearthY - 6,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        1,
        30 + Math.random() * 40
      );
    }
  }

  // 파티클 생성 루프
  generateParticles() {
    if (this.currentLife <= 0) {
      // 꺼졌을 때는 아주 가끔 연기만 약간
      if (Math.random() < 0.15) {
        this.spawnParticle('smoke', this.hearthX + (Math.random() * 16 - 8), this.hearthY - 4, (Math.random() - 0.5) * 0.3, -0.4, 2, 60);
      }
      return;
    }

    const intensity = this.currentLife / 100;
    const flameCount = Math.floor(intensity * 4) + 1;

    // 1. 불꽃 파티클 생성
    for (let i = 0; i < flameCount; i++) {
      const offsetX = (Math.random() - 0.5) * (18 * intensity + 6);
      const vy = -(0.8 + Math.random() * 1.6 * intensity);
      const vx = (Math.random() - 0.5) * 0.5;
      const size = Math.floor(Math.random() * 3 * intensity) + 2;
      const maxLife = 15 + Math.random() * 25 * intensity;

      this.spawnParticle('flame', this.hearthX + offsetX, this.hearthY - 4, vx, vy, size, maxLife);
    }

    // 2. 튀는 불티 (Ember) 생성
    if (Math.random() < 0.35 * intensity) {
      const sparkVx = (Math.random() - 0.5) * 1.2;
      const sparkVy = -(1.2 + Math.random() * 1.8 * intensity);
      this.spawnParticle('spark', this.hearthX + (Math.random() * 12 - 6), this.hearthY - 6, sparkVx, sparkVy, 1, 35 + Math.random() * 30);
    }

    // 3. 연기 파티클
    if (Math.random() < 0.2 + (1 - intensity) * 0.3) {
      const smokeVx = (Math.random() - 0.5) * 0.4 + 0.15; // 바람에 살짝 날림
      const smokeVy = -(0.4 + Math.random() * 0.5);
      this.spawnParticle('smoke', this.hearthX + (Math.random() * 14 - 7), this.hearthY - 8, smokeVx, smokeVy, 3, 50 + Math.random() * 30);
    }
  }

  // 메인 렌더링 프레임
  render() {
    // 1. 화력 수치 부드러운 선형 보간 (LERP)
    this.currentLife += (this.targetLife - this.currentLife) * 0.08;
    this.flickerTimer += 0.1;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 2. 동적 주변 앰비언트 라이트 (Radial Light)
    if (this.currentLife > 0) {
      const intensity = this.currentLife / 100;
      const flicker = Math.sin(this.flickerTimer * 3) * 3 + Math.cos(this.flickerTimer * 7) * 2;
      const lightRadius = Math.max(15, 30 + 80 * intensity + flicker);

      const radGrad = ctx.createRadialGradient(
        this.hearthX, this.hearthY - 10, 4,
        this.hearthX, this.hearthY - 10, lightRadius
      );
      radGrad.addColorStop(0, `rgba(255, 140, 40, ${0.35 * intensity})`);
      radGrad.addColorStop(0.4, `rgba(220, 80, 20, ${0.18 * intensity})`);
      radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(this.hearthX, this.hearthY - 10, lightRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. 픽셀 지면 베이스 렌더링
    ctx.fillStyle = '#0b0d13';
    ctx.fillRect(0, 136, this.width, 44);
    ctx.fillStyle = '#141824';
    ctx.fillRect(0, 136, this.width, 2);

    // 4. 화로 및 장작더미 도트 그리기
    this.drawHearth(ctx);

    // 5. 파티클 업데이트 및 렌더링
    this.generateParticles();

    for (let i = 0; i < this.poolSize; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life++;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      p.x += p.vx;
      p.y += p.vy;

      const progress = p.life / p.maxLife;

      if (p.type === 'flame') {
        // 불꽃 파티클: 밑에서 위로 가면서 노랑 -> 주황 -> 붉은색
        let color;
        if (progress < 0.3) {
          color = '#fffae0'; // 가장 뜨거운 중심 (밝은 황백색)
        } else if (progress < 0.6) {
          color = '#ffaa22'; // 황금빛 주황
        } else if (progress < 0.85) {
          color = '#e63920'; // 강렬한 붉은빛
        } else {
          color = '#6b1e14'; // 불꽃 끝단 암적색
        }
        ctx.fillStyle = color;
        const currentSize = Math.max(1, Math.round(p.size * (1 - progress * 0.7)));
        ctx.fillRect(Math.round(p.x), Math.round(p.y), currentSize, currentSize);

      } else if (p.type === 'spark') {
        // 튀는 불티: 밝은 노랑 주황, 반짝임
        ctx.fillStyle = progress > 0.8 ? '#ff5500' : '#ffe066';
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);

      } else if (p.type === 'smoke') {
        // 연기: 회색, 점점 흩어짐
        const alpha = (1 - progress) * 0.25;
        ctx.fillStyle = `rgba(140, 150, 165, ${alpha})`;
        const currentSize = Math.round(p.size + progress * 3);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), currentSize, currentSize);
      }
    }

    // 6. 날아가는 장작 애니메이션 렌더링
    for (let i = this.flyingLogs.length - 1; i >= 0; i--) {
      const log = this.flyingLogs[i];
      log.progress += log.speed;
      log.rotation += 0.12;

      // 2차 베지에 곡선 (포물선 궤적)
      const t = log.progress;
      const controlX = (log.startX + log.targetX) / 2 + 15;
      const controlY = Math.min(log.startY, log.targetY) - 50; // 위로 높게 솟구침

      const curX = (1 - t) * (1 - t) * log.startX + 2 * (1 - t) * t * controlX + t * t * log.targetX;
      const curY = (1 - t) * (1 - t) * log.startY + 2 * (1 - t) * t * controlY + t * t * log.targetY;

      // 픽셀 통나무 그리기
      ctx.save();
      ctx.translate(curX, curY);
      ctx.rotate(log.rotation);
      ctx.fillStyle = '#7c4826';
      ctx.fillRect(-7, -2, 14, 4);
      ctx.fillStyle = '#b47348';
      ctx.fillRect(-6, -1, 12, 2);
      ctx.restore();

      if (log.progress >= 1.0) {
        this.flyingLogs.splice(i, 1);
        this.burstEmbers(25);
        if (window.fireAudio) window.fireAudio.playLogDrop();
      }
    }

    requestAnimationFrame(this.render);
  }

  // 픽셀 화로 및 숯더미 렌더링
  drawHearth(ctx) {
    const x = this.hearthX;
    const y = this.hearthY;

    // 재(Ash) 바닥
    ctx.fillStyle = '#222634';
    ctx.fillRect(x - 22, y + 6, 44, 4);
    ctx.fillRect(x - 18, y + 4, 36, 3);

    // 붉게 타오르는 숯 (Ember Bed)
    if (this.currentLife > 0) {
      const emberAlpha = 0.4 + (this.currentLife / 100) * 0.6;
      ctx.fillStyle = `rgba(255, 80, 20, ${emberAlpha})`;
      ctx.fillRect(x - 14, y + 2, 28, 4);
      ctx.fillStyle = `rgba(255, 200, 50, ${emberAlpha * 0.8})`;
      ctx.fillRect(x - 8, y + 1, 16, 3);
    } else {
      // 꺼졌을 때 검게 식은 숯
      ctx.fillStyle = '#11131a';
      ctx.fillRect(x - 14, y + 2, 28, 4);
    }

    // 장작 통나무 교차 배치 (픽셀 도트)
    // 뒤쪽 통나무 (어두운 갈색)
    ctx.fillStyle = '#3a2012';
    ctx.fillRect(x - 18, y + 1, 36, 5);
    ctx.fillStyle = '#5a351d';
    ctx.fillRect(x - 17, y + 2, 34, 3);

    // 왼쪽 대각선 통나무
    ctx.fillStyle = '#502e1a';
    ctx.fillRect(x - 14, y - 2, 12, 5);
    ctx.fillRect(x - 12, y - 4, 10, 4);

    // 오른쪽 대각선 통나무
    ctx.fillStyle = '#6b3e23';
    ctx.fillRect(x + 2, y - 2, 12, 5);
    ctx.fillRect(x + 4, y - 4, 10, 4);

    // 통나무 단면 나이테 포인트
    ctx.fillStyle = '#c58b5b';
    ctx.fillRect(x - 13, y - 1, 2, 2);
    ctx.fillRect(x + 11, y - 1, 2, 2);
  }
}

window.fireCanvas = new FireCanvasRenderer('fire-canvas');
