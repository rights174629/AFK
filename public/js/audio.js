/**
 * Keep the Fire Alive - Web Audio API 절차적 ASMR 오디오 엔진
 * 외부 오디오 파일 없이 순수 Web Audio 노이즈 합성을 통해 장작불, 바람, 타격음을 생성합니다.
 */

class FireAudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.volume = 0.7;
    this.fireLife = 75;
    this.isInitialized = false;

    // 게인 노드
    this.masterGain = null;
    this.crackleGain = null;
    this.rumbleGain = null;
    this.windGain = null;

    // 타닥거림 스케줄러 타이머
    this.crackleTimer = null;
  }

  init() {
    if (this.isInitialized) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    // 1. 마스터 게인
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // 2. 불길 저음 (Rumble / Roar)
    this.initRumble();

    // 3. 타닥거림 (Crackle / Pop)
    this.initCrackle();

    // 4. 밤바람 앰비언스 (Night Wind)
    this.initWind();

    this.isInitialized = true;
    this.updateVolumes(this.fireLife);
  }

  // 1초 분량의 화이트 노이즈 버퍼 생성 헬퍼
  createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // 불길 웅장한 저음 (Rumble)
  initRumble() {
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.createNoiseBuffer();
    noiseSource.loop = true;

    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(140, this.ctx.currentTime);

    this.rumbleGain = this.ctx.createGain();
    this.rumbleGain.gain.setValueAtTime(0.25, this.ctx.currentTime);

    noiseSource.connect(lpf);
    lpf.connect(this.rumbleGain);
    this.rumbleGain.connect(this.masterGain);

    noiseSource.start();
  }

  // 타닥거리는 장작 스파이크 (Crackle)
  initCrackle() {
    this.crackleGain = this.ctx.createGain();
    this.crackleGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this.crackleGain.connect(this.masterGain);

    // 무작위 스파이크 펄스 생성 루프
    const triggerCrackle = () => {
      if (!this.ctx || this.isMuted) {
        this.crackleTimer = setTimeout(triggerCrackle, 100);
        return;
      }

      // 화력에 비례하여 빈도와 크기 조절
      const intensity = Math.max(0.05, this.fireLife / 100);
      const delay = Math.random() * (250 / intensity) + (40 / intensity);

      if (this.fireLife > 0 && Math.random() < intensity) {
        this.playPopSound();
      }

      this.crackleTimer = setTimeout(triggerCrackle, delay);
    };

    triggerCrackle();
  }

  // 단발성 장작 팝/스파크 사운드
  playPopSound() {
    if (!this.ctx || this.ctx.state !== 'running') return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800 + Math.random() * 2400, this.ctx.currentTime);
    filter.Q.setValueAtTime(4.0, this.ctx.currentTime);

    const now = this.ctx.currentTime;
    const duration = 0.008 + Math.random() * 0.025; // 8ms ~ 33ms의 아주 짧은 팝
    const popVolume = (0.2 + Math.random() * 0.5) * (this.fireLife / 100);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200 + Math.random() * 600, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + duration);

    gain.gain.setValueAtTime(popVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.crackleGain);

    osc.start(now);
    osc.stop(now + duration);
  }

  // 밤바람 앰비언스 (Wind)
  initWind() {
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.createNoiseBuffer();
    noiseSource.loop = true;

    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.setValueAtTime(320, this.ctx.currentTime);
    bpf.Q.setValueAtTime(1.5, this.ctx.currentTime);

    // 바람 세기 천천히 요동치게 하는 LFO
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(0.15, this.ctx.currentTime); // 0.15Hz (느린 바람결)
    lfoGain.gain.setValueAtTime(120, this.ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(bpf.frequency);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.15, this.ctx.currentTime);

    noiseSource.connect(bpf);
    bpf.connect(this.windGain);
    this.windGain.connect(this.masterGain);

    noiseSource.start();
    lfo.start();
  }

  // 화력 수치에 따른 동적 볼륨 모듈레이션
  updateVolumes(life) {
    this.fireLife = life;
    if (!this.ctx || !this.isInitialized) return;

    const now = this.ctx.currentTime;
    const ratio = Math.max(0, Math.min(1, life / 100));

    // 불이 세면 장작소리와 럼블이 커지고, 불이 꺼지면 바람 소리가 지배적
    this.rumbleGain.gain.setTargetAtTime(ratio * 0.35, now, 0.5);
    this.crackleGain.gain.setTargetAtTime(ratio * 0.6, now, 0.5);
    this.windGain.gain.setTargetAtTime(0.1 + (1 - ratio) * 0.25, now, 0.5);
  }

  // 장작 던졌을 때 통나무 충격음 (Thud)
  playLogDrop() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.15);

    gain.gain.setValueAtTime(0.4 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  // 부싯돌 타격음 (Sparks)
  playFlintSpark() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(3000, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);

    gain.gain.setValueAtTime(0.3 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.09);
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
