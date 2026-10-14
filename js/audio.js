/**
 * Keep the Fire Alive - 프로페셔널 절차적 장작불 ASMR 오디오 엔진
 * 외부 오디오 파일 없이 순수 Web Audio API를 활용하여
 * 진짜 장작이 타닥타닥 갈라지는 소리(Crackle & Pop), 불티 터지는 소리, 깊은 불길 럼블, 밤바람을 합성합니다.
 */

class FireAudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.volume = 0.85; // 기본 볼륨 향상
    this.fireLife = 75;
    this.isInitialized = false;

    // 메인 게인 노드
    this.masterGain = null;
    this.crackleGain = null;
    this.sizzleGain = null;
    this.rumbleGain = null;
    this.windGain = null;

    // 타이머
    this.crackleTimer = null;
    this.clusterTimer = null;
  }

  init() {
    if (this.isInitialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      // 1. 마스터 게인
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // 2. 불길 깊은 저음 (Deep Fire Rumble)
      this.initRumble();

      // 3. 지글지글 타는 소리 (Hiss & Sizzle)
      this.initSizzle();

      // 4. 타닥거리는 장작 파열음 (Real Wood Crackle & Snap)
      this.initCrackle();

      // 5. 밤바람 앰비언스 (Night Wind)
      this.initWind();

      this.isInitialized = true;
      this.updateVolumes(this.fireLife);
      console.log('[FIRE AUDIO] 프로페셔널 ASMR 오디오 엔진이 시작되었습니다.');
    } catch (e) {
      console.warn('[FIRE AUDIO ERROR] Web Audio 초기화 실패:', e);
    }
  }

  // 2초 분량의 화이트 노이즈 버퍼 생성
  createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // 1. 깊고 아늑한 불길 베이스 (Rumble)
  initRumble() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    noise.loop = true;

    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(120, this.ctx.currentTime);

    this.rumbleGain = this.ctx.createGain();
    this.rumbleGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

    noise.connect(lpf);
    lpf.connect(this.rumbleGain);
    this.rumbleGain.connect(this.masterGain);

    noise.start();
  }

  // 2. 장작 표면이 바스락거리며 타는 지글거림 (Sizzle)
  initSizzle() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    noise.loop = true;

    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(1800, this.ctx.currentTime);
    bpf.Q.setValueAtTime(1.2, this.ctx.currentTime);

    this.sizzleGain = this.ctx.createGain();
    this.sizzleGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    noise.connect(bpf);
    bpf.connect(this.sizzleGain);
    this.sizzleGain.connect(this.masterGain);

    noise.start();
  }

  // 3. 진짜 장작이 타닥타닥 튀는 파열음 스케줄러 (Crackle & Snap)
  initCrackle() {
    this.crackleGain = this.ctx.createGain();
    this.crackleGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
    this.crackleGain.connect(this.masterGain);

    // 고빈도 랜덤 타닥거림 루프
    const scheduleNextCrackle = () => {
      if (!this.ctx || this.isMuted) {
        this.crackleTimer = setTimeout(scheduleNextCrackle, 100);
        return;
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      if (this.fireLife > 0) {
        const intensity = Math.max(0.1, this.fireLife / 100);

        // 확률적으로 단발 팝 또는 연쇄 팝("타다닥!") 발생
        if (Math.random() < 0.35) {
          this.playClusterPop(); // 2~3연타 타다닥!
        } else {
          this.playSingleSnap(); // 1타 틱! 탁!
        }

        // 지연 시간: 화력이 셀수록 더 자주 타닥거림
        const minDelay = 40 / intensity;
        const maxDelay = 220 / intensity;
        const nextDelay = Math.random() * (maxDelay - minDelay) + minDelay;
        this.crackleTimer = setTimeout(scheduleNextCrackle, nextDelay);
      } else {
        this.crackleTimer = setTimeout(scheduleNextCrackle, 1000);
      }
    };

    scheduleNextCrackle();
  }

  // 단발성 장작 클릭/스냅 (나무가 쩍 갈라지거나 작은 불티가 팍 튀는 소리)
  playSingleSnap() {
    if (!this.ctx || this.ctx.state !== 'running' || this.fireLife <= 0) return;

    const now = this.ctx.currentTime;
    const dur = 0.003 + Math.random() * 0.015; // 3ms ~ 18ms 초단시간 파열음

    // 노이즈 버퍼 소스 생성
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();

    // 밴드패스 필터로 나무의 공명 주파수(1000Hz ~ 4000Hz) 강조
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200 + Math.random() * 2600, now);
    filter.Q.setValueAtTime(4.0 + Math.random() * 8.0, now);

    // 급격한 지수 감쇠 엔벨로프 (찰진 타격감)
    const gain = this.ctx.createGain();
    const snapVol = (0.3 + Math.random() * 0.7) * (this.fireLife / 100);
    gain.gain.setValueAtTime(snapVol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.crackleGain);

    noise.start(now);
    noise.stop(now + dur);
  }

  // 연쇄 팝 ("타다닥... 탁!")
  playClusterPop() {
    const burstCount = 2 + Math.floor(Math.random() * 3); // 2~4회 연속
    for (let i = 0; i < burstCount; i++) {
      setTimeout(() => {
        this.playSingleSnap();
      }, i * (15 + Math.random() * 35));
    }
  }

  // 4. 밤바람 앰비언스 (Night Wind)
  initWind() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    noise.loop = true;

    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(300, this.ctx.currentTime);
    bpf.Q.setValueAtTime(1.2, this.ctx.currentTime);

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime);
    lfoGain.gain.setValueAtTime(100, this.ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(bpf.frequency);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.15, this.ctx.currentTime);

    noise.connect(bpf);
    bpf.connect(this.windGain);
    this.windGain.connect(this.masterGain);

    noise.start();
    lfo.start();
  }

  // 화력 수치에 따른 실시간 사운드 밸런스 조정
  updateVolumes(life) {
    this.fireLife = life;
    if (!this.ctx || !this.isInitialized) return;

    const now = this.ctx.currentTime;
    const ratio = Math.max(0, Math.min(1, life / 100));

    // 화력이 높을수록: 타닥거림과 럼블이 크고 풍성함
    // 화력이 꺼질수록: 장작 소리는 잦아들고 밤바람 소리가 부각됨
    this.rumbleGain.gain.setTargetAtTime(ratio * 0.45, now, 0.4);
    this.sizzleGain.gain.setTargetAtTime(ratio * 0.12, now, 0.4);
    this.crackleGain.gain.setTargetAtTime(ratio * 0.9, now, 0.4);
    this.windGain.gain.setTargetAtTime(0.1 + (1 - ratio) * 0.35, now, 0.5);
  }

  // 장작 던졌을 때 통나무 충격음 (Thud)
  playLogDrop() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.16);

    gain.gain.setValueAtTime(0.6 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  // 부싯돌 타격음 (Sparks)
  playFlintSpark() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(3200, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.09);

    gain.gain.setValueAtTime(0.5 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  // 볼륨 및 음소거 제어
  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}

window.fireAudio = new FireAudioManager();
