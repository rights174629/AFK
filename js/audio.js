/**
 * Keep the Fire Alive - 프로페셔널 절차적 장작불 ASMR 오디오 엔진
 * 외부 오디오 파일 없이 순수 Web Audio API를 활용하여
 * 진짜 장작이 타닥타닥 갈라지는 소리(Wood Crackle & Snap), 불티 터지는 소리(Pops),
 * 깊은 불길 럼블(Deep Rumble), 지글거림(Sizzle), 그리고 밤바람(Night Wind)을 실시간 합성합니다.
 */

class FireAudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.volume = 1.0; // 볼륨 기본값 최대치로 상향
    this.fireLife = 75;
    this.isInitialized = false;

    // 메인 오디오 노드
    this.compressor = null;
    this.masterGain = null;
    this.crackleGain = null;
    this.sizzleGain = null;
    this.rumbleGain = null;
    this.windGain = null;

    // 캐시된 노이즈 버퍼
    this.noiseBuffer = null;

    // 타이머
    this.crackleTimer = null;
    this.microCrackleTimer = null;
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

      // 0. 다이내믹스 컴프레서 (소리 뭉개짐/클리핑 방지 및 타닥타닥 파열음의 입체감/타격감 극대화)
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(4.5, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);
      this.compressor.connect(this.ctx.destination);

      // 1. 마스터 게인 노드
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.compressor);

      // 2. 노이즈 버퍼 생성 (재사용)
      this.noiseBuffer = this.createNoiseBuffer();

      // 3. 불길 깊은 저음 (Deep Fire Rumble)
      this.initRumble();

      // 4. 지글지글 타는 소리 (Hiss & Sizzle)
      this.initSizzle();

      // 5. 타닥타닥 갈라지는 장작 파열음 엔진 (Crackle & Wood Snap Engine)
      this.initCrackle();

      // 6. 밤바람 앰비언스 (Night Wind)
      this.initWind();

      this.isInitialized = true;
      this.updateVolumes(this.fireLife);
      console.log('[FIRE AUDIO] 고해상도 타닥타닥 ASMR 오디오 엔진이 성공적으로 가동되었습니다.');
    } catch (e) {
      console.warn('[FIRE AUDIO ERROR] Web Audio 초기화 실패:', e);
    }
  }

  // 3초 분량의 부드러운 화이트 노이즈 버퍼 생성
  createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 3;
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
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(110, this.ctx.currentTime);

    this.rumbleGain = this.ctx.createGain();
    this.rumbleGain.gain.setValueAtTime(0.3, this.ctx.currentTime);

    noise.connect(lpf);
    lpf.connect(this.rumbleGain);
    this.rumbleGain.connect(this.masterGain);

    noise.start();
  }

  // 2. 장작 표면이 바스락거리며 타는 지글거림 (Sizzle)
  initSizzle() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(2200, this.ctx.currentTime);
    bpf.Q.setValueAtTime(1.4, this.ctx.currentTime);

    this.sizzleGain = this.ctx.createGain();
    this.sizzleGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

    noise.connect(bpf);
    bpf.connect(this.sizzleGain);
    this.sizzleGain.connect(this.masterGain);

    noise.start();
  }

  // 3. 진짜 장작이 타닥타닥 튀는 파열음 스케줄러 (Crackle & Snap Engine)
  initCrackle() {
    this.crackleGain = this.ctx.createGain();
    // 볼륨을 풍성하고 확실하게 키움 (기존 0.85 -> 1.45)
    this.crackleGain.gain.setValueAtTime(1.45, this.ctx.currentTime);
    this.crackleGain.connect(this.masterGain);

    // 메인 타닥타닥 루프 (메인 스냅, 팝, 클러스터)
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

        // 다양한 장작 파열음 배리에이션
        const dice = Math.random();
        if (dice < 0.32) {
          this.playClusterPop(); // 2~4연타 "타다닥!"
        } else if (dice < 0.65) {
          this.playWoodSnap();   // 찰진 나무 갈라지는 소리 "탁!"
        } else if (dice < 0.85) {
          this.playWoodPop();    // 송진/수분 팽창 팝 "딱!"
        } else {
          this.playMicroSizzle(); // 순간적인 치지직 지글거림
        }

        // 지연 시간: 화력이 셀수록 더욱 빈번하게 타닥거림
        const minDelay = 35 / intensity;
        const maxDelay = 180 / intensity;
        const nextDelay = Math.random() * (maxDelay - minDelay) + minDelay;
        this.crackleTimer = setTimeout(scheduleNextCrackle, nextDelay);
      } else {
        this.crackleTimer = setTimeout(scheduleNextCrackle, 1000);
      }
    };

    // 고주파 잔모래/재 튀는 마이크로 크랙클 서브루프
    const scheduleMicroCrackle = () => {
      if (!this.ctx || this.isMuted || this.fireLife <= 0) {
        this.microCrackleTimer = setTimeout(scheduleMicroCrackle, 150);
        return;
      }

      if (Math.random() < 0.7) {
        this.playMicroSizzle();
      }

      const nextDelay = 40 + Math.random() * 90;
      this.microCrackleTimer = setTimeout(scheduleMicroCrackle, nextDelay);
    };

    scheduleNextCrackle();
    scheduleMicroCrackle();
  }

  // A. 찰진 나무 갈라짐 스냅 ("탁!") - 고주파 노이즈 임펄스 + 통나무 체적 공명(Pitch blip)
  playWoodSnap() {
    if (!this.ctx || this.ctx.state !== 'running' || this.fireLife <= 0) return;

    const now = this.ctx.currentTime;
    const dur = 0.008 + Math.random() * 0.016; // 8ms ~ 24ms

    // 1) 고주파 크랙클 노이즈 버스트
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000 + Math.random() * 3200, now);
    filter.Q.setValueAtTime(3.5 + Math.random() * 5.0, now);

    const noiseGain = this.ctx.createGain();
    const snapVol = (0.55 + Math.random() * 0.7) * Math.min(1.2, (this.fireLife / 100) + 0.3);
    noiseGain.gain.setValueAtTime(snapVol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.crackleGain);

    noise.start(now);
    noise.stop(now + dur);

    // 2) 나무 몸통 목질 공명 (우디 팝 사운드 350Hz ~ 150Hz decay)
    if (Math.random() < 0.5) {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = 'triangle';
      const baseFreq = 300 + Math.random() * 350;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + dur * 1.5);

      oscGain.gain.setValueAtTime(snapVol * 0.45, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 1.5);

      osc.connect(oscGain);
      oscGain.connect(this.crackleGain);

      osc.start(now);
      osc.stop(now + dur * 1.5);
    }
  }

  // B. 송진/수분 터지는 예리한 파열음 ("딱!")
  playWoodPop() {
    if (!this.ctx || this.ctx.state !== 'running' || this.fireLife <= 0) return;

    const now = this.ctx.currentTime;
    const dur = 0.005 + Math.random() * 0.012;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2800 + Math.random() * 2500, now);

    const gain = this.ctx.createGain();
    const popVol = (0.6 + Math.random() * 0.65) * Math.min(1.2, (this.fireLife / 100) + 0.25);
    gain.gain.setValueAtTime(popVol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.crackleGain);

    noise.start(now);
    noise.stop(now + dur);
  }

  // C. 미세 지글거림 & 자잘한 불티 튀는 소리 (Micro-Sizzle)
  playMicroSizzle() {
    if (!this.ctx || this.ctx.state !== 'running' || this.fireLife <= 0) return;

    const now = this.ctx.currentTime;
    const dur = 0.003 + Math.random() * 0.008;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3500 + Math.random() * 4000, now);
    filter.Q.setValueAtTime(5.0, now);

    const gain = this.ctx.createGain();
    const sizzleVol = (0.25 + Math.random() * 0.35) * (this.fireLife / 100);
    gain.gain.setValueAtTime(sizzleVol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.crackleGain);

    noise.start(now);
    noise.stop(now + dur);
  }

  // D. 연쇄 파열음 ("타다닥... 탁!")
  playClusterPop() {
    const burstCount = 2 + Math.floor(Math.random() * 3); // 2~4연속
    for (let i = 0; i < burstCount; i++) {
      setTimeout(() => {
        if (Math.random() < 0.6) {
          this.playWoodSnap();
        } else {
          this.playWoodPop();
        }
      }, i * (14 + Math.random() * 32));
    }
  }

  // 4. 밤바람 앰비언스 (Night Wind)
  initWind() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(280, this.ctx.currentTime);
    bpf.Q.setValueAtTime(1.0, this.ctx.currentTime);

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(0.1, this.ctx.currentTime);
    lfoGain.gain.setValueAtTime(90, this.ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(bpf.frequency);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

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

    // 화력이 높을수록: 타닥거림과 럼블이 크고 선명하게 울림
    // 화력이 꺼질수록: 장작 소리는 잦아들고 밤바람 소리가 차분하게 부각됨
    this.rumbleGain.gain.setTargetAtTime(ratio * 0.4, now, 0.3);
    this.sizzleGain.gain.setTargetAtTime(ratio * 0.18, now, 0.3);
    this.crackleGain.gain.setTargetAtTime(Math.min(1.8, ratio * 1.5 + 0.15), now, 0.3);
    this.windGain.gain.setTargetAtTime(0.08 + (1 - ratio) * 0.35, now, 0.4);
  }

  // 장작 던졌을 때 통나무 충격음 (Thud)
  playLogDrop() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.18);

    gain.gain.setValueAtTime(0.75 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.22);

    // 장작이 떨어지면서 일어나는 불티 연쇄음 함께 재생
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
    osc.frequency.setValueAtTime(3400, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.09);

    gain.gain.setValueAtTime(0.6 * this.volume, now);
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
