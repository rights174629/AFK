/**
 * The Slowest Garden in the World - 순수 Web Audio API 자연 사운드 합성 엔진
 * 1. 반딧불이 영롱한 차임 사운드 (Firefly Twinkle Chime - 펜타토닉 합성음)
 * 2. 숲속 산들바람 & 나뭇잎 서걱거림 앰비언스 (Filtered Noise + LFO)
 * 3. 토양 물주기 물방울 효과음 (Bubbly Water Splash Chords)
 * 4. 부활 이슬 효과음 (Harmonic Life Chime)
 * 5. 모바일 자동재생 정책 언락 및 노드 자동 해제(메모리 누수 방지)
 */

class GardenAudioEngine {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    this.isMuted = false;

    // 마스터 볼륨 게인 노드
    this.masterGain = null;
    this.windGain = null;
    this.rainGain = null;

    // 반딧불이 사운드 쓰로틀링 (최소 1.8초 간격)
    this.lastFireflyTime = 0;
    this.fireflyThrottleMs = 1800;

    // 펜타토닉 음계 (C6, D6, E6, G6, A6, C7, E7)
    this.fireflyScale = [1046.50, 1174.66, 1318.51, 1567.98, 1760.00, 2093.00, 2637.02];
  }

  init() {
    if (this.isInitialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        console.warn('[AUDIO] Web Audio API를 지원하지 않는 브라우저입니다.');
        return;
      }

      this.ctx = new AudioContext();

      // 마스터 게인 설정
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // 앰비언트 노드 초기화
      this.initAmbientWind();

      this.isInitialized = true;
      console.log('[AUDIO] 정원 Web Audio API 엔진이 성공적으로 초기화되었습니다.');

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch (err) {
      console.warn('[AUDIO INIT ERROR]', err);
    }
  }

  // 브라우저 첫 터치/클릭 시 오디오 컨텍스트 깨우기
  async unlock() {
    if (!this.isInitialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        // ignore
      }
    }
  }

  // 1. 산들바람 노이즈 앰비언스 생성
  initAmbientWind() {
    if (!this.ctx || !this.masterGain) return;

    // 2초 길이의 핑크/화이트 노이즈 버퍼 생성
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // 부드러운 핑크 노이즈 필터링
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      output[i] = (b0 + b1 + b2 + white * 0.1848) * 0.05;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // 바람 느낌을 위한 밴드패스 필터
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(320, this.ctx.currentTime);
    windFilter.Q.setValueAtTime(1.8, this.ctx.currentTime);

    // 바람이 살랑거리도록 LFO 오실레이터 연결
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.2, this.ctx.currentTime); // 5초 주기
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(140, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(windFilter.frequency);
    lfo.start();

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

    whiteNoise.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);

    whiteNoise.start();

    // 비(Rain) 앰비언트 노드
    const rainNoise = this.ctx.createBufferSource();
    rainNoise.buffer = noiseBuffer;
    rainNoise.loop = true;

    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // 기본은 맑음

    rainNoise.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);

    rainNoise.start();
  }

  // 날씨 상태에 따라 비소리 볼륨 조절
  updateWeather(weather) {
    if (!this.rainGain || !this.ctx) return;
    const targetRainVol = weather === 'RAIN' ? 0.15 : 0.0;
    this.rainGain.gain.setTargetAtTime(targetRainVol, this.ctx.currentTime, 1.2);
  }

  // 2. 반딧불이 반짝임 차임 사운드 (Web Audio API 펜타토닉 합성)
  playFireflyChime() {
    if (!this.ctx || this.isMuted) return;
    if (this.ctx.state === 'suspended') return;

    const now = Date.now();
    if (now - this.lastFireflyTime < this.fireflyThrottleMs) {
      return; // 1.8초 쓰로틀링으로 중첩 및 클리핑 방지
    }
    this.lastFireflyTime = now;

    try {
      const audioNow = this.ctx.currentTime;
      // 펜타토닉 음계 중 무작위 음 선택
      const baseFreq = this.fireflyScale[Math.floor(Math.random() * this.fireflyScale.length)];

      // 1) 맑은 Sine 오실레이터 (기본 음)
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(baseFreq, audioNow);
      // 살짝 반짝이는 미세 글리산도
      osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.025, audioNow + 0.15);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq, audioNow + 0.6);

      // 2) Triangle 오실레이터 (영롱한 하모닉스 배음)
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(baseFreq * 2, audioNow); // 옥타브 배음

      // 개별 엔벨로프 GainNode
      const chimeGain = this.ctx.createGain();
      // Attack 0.03초 -> Release 0.85초
      chimeGain.gain.setValueAtTime(0.0001, audioNow);
      chimeGain.gain.exponentialRampToValueAtTime(0.08, audioNow + 0.03);
      chimeGain.gain.exponentialRampToValueAtTime(0.00001, audioNow + 0.85);

      osc1.connect(chimeGain);
      osc2.connect(chimeGain);
      chimeGain.connect(this.masterGain);

      osc1.start(audioNow);
      osc2.start(audioNow);
      osc1.stop(audioNow + 0.9);
      osc2.stop(audioNow + 0.9);

      // 재생 완료 즉시 메모리에서 완전 해제
      osc1.onended = () => {
        osc1.disconnect();
        osc2.disconnect();
        chimeGain.disconnect();
      };
    } catch (e) {
      // ignore
    }
  }

  // 3. 물주기 효과음 (Bubbly Water Drop Splash)
  playWaterDrop() {
    if (!this.ctx || this.isMuted) return;
    this.unlock();

    try {
      const audioNow = this.ctx.currentTime;
      const notes = [520, 780, 1040];

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = audioNow + idx * 0.06;

        osc.type = 'sine';
        // 물방울 특유의 퐁당 상승 피치 스윕
        osc.frequency.setValueAtTime(freq * 0.75, startTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, startTime + 0.08);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.3);

        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      });
    } catch (e) {
      // ignore
    }
  }

  // 4. 시든 나무 부활 시 축복의 이슬 차임 사운드
  playDewRevival() {
    if (!this.ctx || this.isMuted) return;
    this.unlock();

    try {
      const audioNow = this.ctx.currentTime;
      const arpeggio = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]; // C 메이저 아르페지오

      arpeggio.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const time = audioNow + idx * 0.12;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.14, time + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.00001, time + 1.2);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 1.25);

        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      });
    } catch (e) {
      // ignore
    }
  }

  // 음소거 토글
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      const targetGain = this.isMuted ? 0.0 : 0.5;
      this.masterGain.gain.setValueAtTime(targetGain, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}

// 전역 싱글톤 인스턴스 생성
window.gardenAudio = new GardenAudioEngine();
