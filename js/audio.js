/**
 * Keep the Fire Alive - 프로페셔널 절차적 장작불 ASMR 오디오 엔진
 * 순수 Web Audio API를 활용하여 배경 노이즈(화이트노이즈/치찰음)는 최대한 억제하고,
 * 선명하고 맑은 장작 타닥타닥 파열음(Wood Crackle & Snap)과 포근한 저음만을 합성합니다.
 */

class FireAudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.volume = 0.95;
    this.fireLife = 75;
    this.isInitialized = false;

    // 메인 오디오 노드
    this.compressor = null;
    this.masterGain = null;
    this.crackleGain = null;
    this.sizzleGain = null;
    this.rumbleGain = null;
    this.windGain = null;

    // 캐시된 웜 핑크 노이즈 버퍼
    this.noiseBuffer = null;

    // 타이머
    this.crackleTimer = null;
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

      // 0. 다이내믹스 컴프레서 (피크 클리핑 방지 및 맑은 타격감 유지)
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(8, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(3.5, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.1, this.ctx.currentTime);
      this.compressor.connect(this.ctx.destination);

      // 1. 마스터 게인 노드
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.compressor);

      // 2. 부드러운 핑크 노이즈 버퍼 생성 (화이트 노이즈의 거친 치찰음 제거)
      this.noiseBuffer = this.createNoiseBuffer();

      // 3. 은은하고 부드러운 불길 저음 (Soft Rumble - 서브우퍼 대역만 통과)
      this.initRumble();

      // 4. 장작 지글거림 (극소량만 배경에 살짝 배치하여 노이즈 최소화)
      this.initSizzle();

      // 5. 맑고 찰진 장작 타닥타닥 소리 (Crackle & Wood Snap Engine)
      this.initCrackle();

      // 6. 부드러운 밤바람 (Gentle Night Breeze)
      this.initWind();

      this.isInitialized = true;
      this.updateVolumes(this.fireLife);
      console.log('[FIRE AUDIO] 노이즈 억제 및 고해상도 타닥타닥 ASMR 오디오 엔진 가동 완료');
    } catch (e) {
      console.warn('[FIRE AUDIO ERROR] Web Audio 초기화 실패:', e);
    }
  }

  // 폴 켈렛(Paul Kellet)의 핑크 노이즈 필터링: 거친 화이트 노이즈 "샤아-" 치찰음을 제거하고 온화한 사운드 버퍼 생성
  createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  // 1. 깊고 조용한 불길 베이스 (90Hz 이하 초저음만 남겨 잡음 배제)
  initRumble() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(85, this.ctx.currentTime);

    this.rumbleGain = this.ctx.createGain();
    this.rumbleGain.gain.setValueAtTime(0.15, this.ctx.currentTime);

    noise.connect(lpf);
    lpf.connect(this.rumbleGain);
    this.rumbleGain.connect(this.masterGain);

    noise.start();
  }

  // 2. 장작 지글거림 (배경 치찰음 노이즈를 요청에 따라 대폭 축소)
  initSizzle() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(1400, this.ctx.currentTime);
    bpf.Q.setValueAtTime(1.0, this.ctx.currentTime);

    this.sizzleGain = this.ctx.createGain();
    // 노이즈 방지를 위해 거의 들리지 않을 정도로 미세하게만 설정 (기존 0.12 -> 0.02)
    this.sizzleGain.gain.setValueAtTime(0.02, this.ctx.currentTime);

    noise.connect(bpf);
    bpf.connect(this.sizzleGain);
    this.sizzleGain.connect(this.masterGain);

    noise.start();
  }

  // 3. 맑고 찰진 장작 타닥타닥 소리 (Wood Snap & Crackle Engine)
  initCrackle() {
    this.crackleGain = this.ctx.createGain();
    // 타닥타닥 파열음은 선명하고 확실하게 유지
    this.crackleGain.gain.setValueAtTime(1.4, this.ctx.currentTime);
    this.crackleGain.connect(this.masterGain);

    const scheduleNextCrackle = () => {
      if (!this.ctx || this.isMuted) {
        this.crackleTimer = setTimeout(scheduleNextCrackle, 100);
        return;
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      if (this.fireLife > 0) {
        const intensity = Math.max(0.15, this.fireLife / 100);

        const dice = Math.random();
        if (dice < 0.35) {
          this.playClusterPop(); // "타다닥!" 연쇄 팝
        } else if (dice < 0.72) {
          this.playWoodSnap();   // 맑고 찰진 통나무 갈라짐 "탁!"
        } else {
          this.playWoodPop();    // 송진 터지는 예리한 파열음 "딱!"
        }

        // 지연 시간: 적절한 리듬으로 기분 좋게 타닥거리도록 배치
        const minDelay = 60 / intensity;
        const maxDelay = 260 / intensity;
        const nextDelay = Math.random() * (maxDelay - minDelay) + minDelay;
        this.crackleTimer = setTimeout(scheduleNextCrackle, nextDelay);
      } else {
        this.crackleTimer = setTimeout(scheduleNextCrackle, 1000);
      }
    };

    scheduleNextCrackle();
  }

  // A. 맑고 찰진 나무 갈라짐 스냅 ("탁!") - 잔여 노이즈 테일 없이 즉시 감쇠되는 맑은 파열음
  playWoodSnap() {
    if (!this.ctx || this.ctx.state !== 'running' || this.fireLife <= 0) return;

    const now = this.ctx.currentTime;
    // 노이즈가 남지 않도록 극도로 짧은 5ms ~ 12ms로 순간 감쇠
    const dur = 0.005 + Math.random() * 0.007;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200 + Math.random() * 2200, now);
    filter.Q.setValueAtTime(4.5, now);

    const noiseGain = this.ctx.createGain();
    const snapVol = (0.55 + Math.random() * 0.6) * Math.min(1.2, (this.fireLife / 100) + 0.3);
    noiseGain.gain.setValueAtTime(snapVol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.crackleGain);

    noise.start(now);
    noise.stop(now + dur);

    // 따뜻한 목질 공명 (우디 팝 사운드 380Hz ~ 140Hz decay)
    if (Math.random() < 0.6) {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = 'triangle';
      const baseFreq = 320 + Math.random() * 280;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + dur * 1.8);

      oscGain.gain.setValueAtTime(snapVol * 0.45, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 1.8);

      osc.connect(oscGain);
      oscGain.connect(this.crackleGain);

      osc.start(now);
      osc.stop(now + dur * 1.8);
    }
  }

  // B. 송진/수분 팽창 파열음 ("딱!") - 노이즈 지속 없이 날렵한 팝
  playWoodPop() {
    if (!this.ctx || this.ctx.state !== 'running' || this.fireLife <= 0) return;

    const now = this.ctx.currentTime;
    const dur = 0.004 + Math.random() * 0.008;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600 + Math.random() * 2000, now);
    filter.Q.setValueAtTime(5.0, now);

    const gain = this.ctx.createGain();
    const popVol = (0.6 + Math.random() * 0.6) * Math.min(1.2, (this.fireLife / 100) + 0.25);
    gain.gain.setValueAtTime(popVol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.crackleGain);

    noise.start(now);
    noise.stop(now + dur);
  }

  // C. 연쇄 파열음 ("타다닥... 탁!")
  playClusterPop() {
    const burstCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < burstCount; i++) {
      setTimeout(() => {
        if (Math.random() < 0.65) {
          this.playWoodSnap();
        } else {
          this.playWoodPop();
        }
      }, i * (18 + Math.random() * 30));
    }
  }

  // 4. 고요한 밤바람 앰비언스 (노이즈 느낌 없이 아주 부드럽고 잔잔하게)
  initWind() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'lowpass';
    bpf.frequency.setValueAtTime(200, this.ctx.currentTime);

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(0.08, this.ctx.currentTime);
    lfoGain.gain.setValueAtTime(50, this.ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(bpf.frequency);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.03, this.ctx.currentTime);

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

    // 배경 노이즈(sizzle)는 0.035 이하로 억제하여 맑고 고요한 환경 조성
    this.rumbleGain.gain.setTargetAtTime(ratio * 0.18, now, 0.3);
    this.sizzleGain.gain.setTargetAtTime(ratio * 0.025, now, 0.3);
    this.crackleGain.gain.setTargetAtTime(Math.min(1.6, ratio * 1.35 + 0.15), now, 0.3);
    this.windGain.gain.setTargetAtTime(0.02 + (1 - ratio) * 0.06, now, 0.4);
  }

  // 장작 던졌을 때 통나무 충격음 (Thud)
  playLogDrop() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.18);

    gain.gain.setValueAtTime(0.7 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.22);

    setTimeout(() => {
      this.playClusterPop();
    }, 60);
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

    gain.gain.setValueAtTime(0.55 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);

    this.playWoodPop();
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
