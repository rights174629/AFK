/**
 * The Slowest Garden in the World - 클라이언트 메인 오케스트레이션 스크립트
 * 1. 실시간 소켓 동기화 및 오프라인 폴백 시뮬레이션
 * 2. 180초(3분) 물주기 쿨다운 관리 (localStorage 영속화)
 * 3. [핵심] 수분 100% 포화 시 완전 무반응(No-Op) 가드
 * 4. 픽셀 수치 일절 비공개 & 상단 [머문 시간] 옆 [🌱 성장률: XX.X%] 배지 연동
 * 5. KST 실제 시간 기반 계절/날씨/일주운동 메타 태그 업데이트
 * 6. 시듦(Withered) 상태 감지 및 생명의 이슬 협동 부활 모달 제어
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. 소켓 서버 대상 스마트 결정 (동일 도메인, HTTPS, 커스텀 주소 지원)
  const urlParams = new URLSearchParams(window.location.search);
  const queryServer = urlParams.get('server');
  const savedServer = localStorage.getItem('campfire_custom_server');
  const isWebProtocol = window.location.protocol.startsWith('http');

  let serverTarget;
  if (queryServer) {
    serverTarget = queryServer;
  } else if (window.location.protocol === 'https:') {
    if (savedServer && savedServer.startsWith('https://')) {
      serverTarget = savedServer;
    } else {
      serverTarget = undefined;
    }
  } else if (savedServer) {
    serverTarget = savedServer;
  } else if (isWebProtocol) {
    serverTarget = undefined;
  } else {
    serverTarget = 'https://localhost:3000';
  }

  let socket;
  if (typeof io !== 'undefined') {
    socket = io(serverTarget, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      timeout: 10000
    });

    socket.on('connect', () => {
      console.log(`[SOCKET CONNECTED] 정원 실시간 서버에 연결되었습니다! ID: ${socket.id}`);
      const userDot = document.querySelector('.user-indicator-dot');
      if (userDot) userDot.style.backgroundColor = '#22c55e';
    });

    socket.on('connect_error', (err) => {
      console.warn('[SOCKET RETRY] 정원 서버 연결 시도 중:', err.message);
      const userDot = document.querySelector('.user-indicator-dot');
      if (userDot) userDot.style.backgroundColor = '#f59e0b';
      const userCountEl = document.getElementById('user-count');
      if (userCountEl) {
        userCountEl.innerHTML = `<span style="color: #f59e0b;">서버 재연결 중...</span>`;
      }
    });
  } else {
    console.warn('[OFFLINE MODE] Socket.io CDN 미로드로 인해 로컬 시뮬레이션 모드로 작동합니다.');
    const listeners = {};
    socket = {
      on: (ev, fn) => { listeners[ev] = listeners[ev] || []; listeners[ev].push(fn); },
      emit: (ev, data) => { }
    };
  }

  // 캔버스 엔진 생성
  const gardenCanvas = new window.GardenCanvasEngine('garden-canvas');
  window.gardenCanvas = gardenCanvas;

  // 채팅 매니저 생성
  const chatManager = new window.GardenChatManager(socket);

  // 데스크톱에서는 채팅창 기본 오픈, 모바일에서는 정원 시야 확보를 위해 닫힘 유지
  if (window.innerWidth > 768) {
    chatManager.open();
  }

  // DOM 요소 참조
  const myStayTimeEl = document.getElementById('my-stay-time');
  const growthRateEl = document.getElementById('garden-growth-rate');
  const gardenLifetimeEl = document.getElementById('garden-lifetime');
  const userCountEl = document.getElementById('user-count');
  const moistureFillEl = document.getElementById('moisture-fill');
  const moistureTextEl = document.getElementById('moisture-text');
  const waterBtn = document.getElementById('water-btn');
  const cooldownProgressEl = document.getElementById('cooldown-progress');
  const waterBtnTextEl = document.getElementById('water-btn-text');
  const muteBtn = document.getElementById('mute-btn');
  const audioPromptOverlay = document.getElementById('audio-prompt-overlay');
  const toastContainer = document.getElementById('toast-container');
  const witheredModal = document.getElementById('withered-modal');
  const strikeDewBtn = document.getElementById('strike-dew-btn');
  const dewProgressFill = document.getElementById('dew-progress-fill');
  const dewStatusText = document.getElementById('dew-status-text');
  const witheredDurationText = document.getElementById('withered-duration');
  const witheredWateringsText = document.getElementById('withered-total-waterings');

  // 환경 메타 태그
  const seasonTagEl = document.getElementById('season-tag');
  const weatherTagEl = document.getElementById('weather-tag');
  const timeTagEl = document.getElementById('time-tag');

  // 상태 변수
  const sessionStartTime = Date.now();
  let plantedAt = Date.now();
  let currentMoisture = 75.0;
  let currentStatus = 'HEALTHY';
  let activeGrowthSec = 0;
  let cooldownInterval = null;
  let remainingCooldownSec = 0;

  // 화면 토스트 알림 헬퍼
  function showToast(message) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }
  window.showToast = showToast;

  // 시간 포맷팅 헬퍼
  function formatHMS(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }

  function formatDaysHMS(sec) {
    const days = Math.floor(sec / 86400) + 1; // DAY 1 시작
    const remSec = sec % 86400;
    const hrs = String(Math.floor(remSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((remSec % 3600) / 60)).padStart(2, '0');
    const secs = String(remSec % 60).padStart(2, '0');
    return `DAY ${days} · ${hrs}:${mins}:${secs}`;
  }

  // 1초 주기 타이머 (개인 머문 시간 카운트)
  setInterval(() => {
    const stayMs = Date.now() - sessionStartTime;
    if (myStayTimeEl) myStayTimeEl.textContent = formatHMS(stayMs);
  }, 1000);

  // 쿨다운 시작 함수 (180초 = 3분)
  function startCooldown(seconds) {
    remainingCooldownSec = seconds;
    waterBtn.disabled = true;

    // 새로고침 방어용 만료 시각 로컬 저장
    const expiryTime = Date.now() + seconds * 1000;
    localStorage.setItem('garden_water_cooldown_expiry', expiryTime);

    if (cooldownInterval) clearInterval(cooldownInterval);

    cooldownInterval = setInterval(() => {
      remainingCooldownSec--;
      const progressPercent = Math.max(0, Math.min(100, ((180 - remainingCooldownSec) / 180) * 100));
      if (cooldownProgressEl) cooldownProgressEl.style.width = `${progressPercent}%`;

      const mins = Math.floor(remainingCooldownSec / 60);
      const secs = String(remainingCooldownSec % 60).padStart(2, '0');
      if (waterBtnTextEl) waterBtnTextEl.textContent = `물주기 준비 중 (${mins}:${secs})`;

      if (remainingCooldownSec <= 0) {
        clearInterval(cooldownInterval);
        localStorage.removeItem('garden_water_cooldown_expiry');
        waterBtn.disabled = false;
        if (cooldownProgressEl) cooldownProgressEl.style.width = '0%';
        updateWaterButtonState();
      }
    }, 1000);
  }

  // 저장된 쿨다운 복원
  const savedExpiry = localStorage.getItem('garden_water_cooldown_expiry');
  if (savedExpiry) {
    const diffSec = Math.ceil((parseInt(savedExpiry, 10) - Date.now()) / 1000);
    if (diffSec > 0 && diffSec <= 180) {
      startCooldown(diffSec);
    } else {
      localStorage.removeItem('garden_water_cooldown_expiry');
    }
  }

  // 수분 100% 포화 및 버튼 상태 반영 (Troubleshooting 2)
  function updateWaterButtonState() {
    if (remainingCooldownSec > 0) return;

    if (currentMoisture >= 100.0) {
      waterBtn.classList.add('saturated');
      waterBtn.setAttribute('title', '토양 수분이 100%이므로 물을 줄 수 없습니다.');
      if (waterBtnTextEl) waterBtnTextEl.textContent = '💧 토양 수분 가득참 (100%)';
    } else {
      waterBtn.classList.remove('saturated');
      waterBtn.removeAttribute('title');
      waterBtn.disabled = false;
      if (waterBtnTextEl) waterBtnTextEl.textContent = '💧 물주기 (+10%)';
    }
  }

  // 물주기 버튼 클릭 이벤트 핸들러
  if (waterBtn) {
    waterBtn.addEventListener('click', () => {
      // [핵심 가드 1] 수분이 이미 100%일 때는 완전 무반응 (No-Op)
      // 쿨다운 소모 X, 효과음 X, 파티클 X, 서버 요청 X
      if (currentMoisture >= 100.0) {
        showToast('토양에 수분이 이미 가득 차 있습니다. (100% 포화)');
        return;
      }

      if (waterBtn.disabled || remainingCooldownSec > 0) return;

      if (currentStatus === 'WITHERED') {
        showToast('나무가 시들어 있어 물을 줄 수 없습니다. 이슬 부활이 필요합니다.');
        return;
      }

      // 화면에 즉각 물방울 애니메이션 및 사운드 발동
      if (window.gardenCanvas) window.gardenCanvas.triggerWaterEffect();
      if (window.gardenAudio) window.gardenAudio.playWaterDrop();

      // 서버로 물주기 요청 전송
      socket.emit('water_plant');

      // 쿨다운 시작 (180초)
      startCooldown(180);
    });
  }

  // 오디오 자동재생 해제 오버레이
  function unlockAudio() {
    if (window.gardenAudio) {
      window.gardenAudio.unlock();
    }
    if (audioPromptOverlay) {
      audioPromptOverlay.style.opacity = '0';
      setTimeout(() => {
        audioPromptOverlay.style.display = 'none';
      }, 400);
    }
  }

  if (audioPromptOverlay) {
    audioPromptOverlay.addEventListener('click', unlockAudio);
    audioPromptOverlay.addEventListener('touchstart', unlockAudio, { passive: true });
  }

  const globalAudioWakeup = () => {
    if (window.gardenAudio) {
      window.gardenAudio.unlock();
    }
  };
  document.addEventListener('pointerdown', globalAudioWakeup, { once: true });
  document.addEventListener('touchstart', globalAudioWakeup, { once: true, passive: true });
  document.addEventListener('keydown', globalAudioWakeup, { once: true });

  // 음소거 토글
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      if (window.gardenAudio) {
        window.gardenAudio.unlock();
        const isMuted = window.gardenAudio.toggleMute();
        muteBtn.textContent = isMuted ? '🔇 음소거' : '🔊 소리 켜짐';
        muteBtn.classList.toggle('active', !isMuted);
      }
    });
  }

  // 부활 의식: 생명의 이슬 모으기
  if (strikeDewBtn) {
    strikeDewBtn.addEventListener('click', () => {
      if (window.gardenAudio) window.gardenAudio.playWaterDrop();
      if (window.gardenCanvas) window.gardenCanvas.triggerWaterEffect();
      socket.emit('strike_dew');
    });
  }

  // 백그라운드 탭 복귀 시 즉각 재동기화 (Delta-Time Spike 방어)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      socket.emit('request_garden_sync');
    }
  });

  // UI 상태 갱신 헬퍼
  function applyGardenState(data) {
    if (!data) return;

    currentMoisture = data.moisture;
    currentStatus = data.status;
    activeGrowthSec = data.activeGrowthSec || 0;

    // 1. 머문 시간 바로 옆 [🌱 성장률: XX.X%] 배지 갱신 (픽셀 수치 일절 비공개)
    if (growthRateEl) {
      const prog = typeof data.growthProgress === 'number' ? data.growthProgress : 0.0;
      growthRateEl.textContent = `${prog.toFixed(1)}%`;
    }

    // 2. 전체 나무 생존 시간 카운터 갱신 (DAY 1 ~ 30)
    if (gardenLifetimeEl) {
      gardenLifetimeEl.textContent = formatDaysHMS(activeGrowthSec);
    }

    // 3. 수분 게이지 바 & 텍스트 갱신
    if (moistureFillEl) {
      moistureFillEl.style.width = `${Math.min(100, Math.max(0, currentMoisture))}%`;
      moistureFillEl.className = 'moisture-fill';
      if (currentStatus === 'LUSH') moistureFillEl.classList.add('lush');
      else if (currentStatus === 'THIRSTY') moistureFillEl.classList.add('thirsty');
      else if (currentStatus === 'WITHERED') moistureFillEl.classList.add('withered');
    }

    if (moistureTextEl) {
      let statusDesc = '무럭무럭 자라는 중';
      if (currentStatus === 'LUSH') statusDesc = '광합성 보너스 (1.15x)';
      else if (currentStatus === 'THIRSTY') statusDesc = '목마름 페널티 (0.6x)';
      else if (currentStatus === 'WITHERED') statusDesc = '성장 멈춤 (시듦)';
      moistureTextEl.textContent = `수분 ${currentMoisture.toFixed(1)}% (${currentStatus} · ${statusDesc})`;
    }

    // 4. 환경 메타 태그 갱신
    if (seasonTagEl && data.season) {
      const seasonMap = {
        SPRING: '🌸 봄',
        SUMMER: '🌿 여름',
        AUTUMN: '🍁 가을',
        WINTER: '❄️ 겨울'
      };
      seasonTagEl.textContent = seasonMap[data.season] || data.season;
    }

    if (weatherTagEl && data.weather) {
      const weatherMap = {
        CLEAR: '☀️ 맑음',
        RAIN: '🌧️ 비',
        SNOW: '❄️ 눈',
        BREEZE: '🍃 산들바람'
      };
      weatherTagEl.textContent = weatherMap[data.weather] || data.weather;
      if (window.gardenAudio) window.gardenAudio.updateWeather(data.weather);
    }

    if (timeTagEl && data.kst) {
      const h = data.kst.hour;
      let timeStr = '☀️ 한낮';
      if (h >= 5 && h < 7) timeStr = '🌅 새벽 여명';
      else if (h >= 7 && h < 17) timeStr = '☀️ 청명한 낮';
      else if (h >= 17 && h < 19.5) timeStr = '🌇 붉은 노을';
      else timeStr = '🌙 별빛 밤';
      timeTagEl.textContent = timeStr;
    }

    // 5. 접속자 수 배지
    if (userCountEl && typeof data.users === 'number') {
      userCountEl.textContent = `${data.users}명이 함께 식물이 자라는 것을 보고 있음`;
    }

    // 6. 물주기 버튼 상태 업데이트 (수분 100% 무반응 대응)
    updateWaterButtonState();

    // 7. 캔버스 상태 동기화
    if (window.gardenCanvas) {
      window.gardenCanvas.updateState(data);
    }

    // 8. 시듦(Withered) 모달 체크
    if (currentStatus === 'WITHERED' && witheredModal && witheredModal.style.display !== 'flex') {
      showWitheredModal(data);
    }
  }

  function showWitheredModal(data) {
    if (!witheredModal) return;
    witheredModal.style.display = 'flex';
    document.getElementById('canvas-container').style.filter = 'grayscale(80%) brightness(0.7)';

    if (witheredDurationText && data.activeGrowthSec !== undefined) {
      witheredDurationText.textContent = formatDaysHMS(data.activeGrowthSec);
    }
    if (witheredWateringsText && data.totalWaterings !== undefined) {
      witheredWateringsText.textContent = `${data.totalWaterings}회`;
    }
  }

  // --- 소켓 이벤트 리스너 ---

  // 정원 초기 상태 로드
  socket.on('garden_init', (data) => {
    plantedAt = data.plantedAt || Date.now();
    applyGardenState(data);
    chatManager.setNickname(data.suggestedNickname);
    chatManager.loadRecentChats(data.recentChats);
  });

  // 1초 주기 틱 수신
  socket.on('garden_tick', (data) => {
    applyGardenState(data);
  });

  // 접속자 수 변동
  socket.on('user_count', (data) => {
    if (userCountEl && typeof data.users === 'number') {
      userCountEl.textContent = `${data.users}명이 함께 식물이 자라는 것을 보고 있음`;
    }
  });

  // 누군가 물을 줌
  socket.on('plant_watered', (data) => {
    if (window.gardenCanvas) {
      window.gardenCanvas.triggerWaterEffect();
      window.gardenCanvas.updateState({
        moisture: data.newMoisture,
        status: data.status,
        growthProgress: data.growthProgress
      });
    }
    if (window.gardenAudio) window.gardenAudio.playWaterDrop();
    applyGardenState({
      moisture: data.newMoisture,
      status: data.status,
      growthProgress: data.growthProgress,
      activeGrowthSec: activeGrowthSec
    });
    showToast('누군가 정원에 시원한 물을 주었습니다! (+10%)');
  });

  // 쿨다운 오류 피드백
  socket.on('water_cooldown_error', (data) => {
    startCooldown(data.remainingSec);
    showToast(`아직 물을 줄 수 없습니다. (${data.remainingSec}초 남음)`);
  });

  // 시듦 발생
  socket.on('garden_withered', (data) => {
    showWitheredModal({
      activeGrowthSec,
      totalWaterings: data.totalWaterings
    });
    showToast('정원의 토양이 메말라 거목이 시들었습니다...');
  });

  // 부활 진행 수신
  socket.on('dew_progress', (data) => {
    const percent = Math.min(100, (data.current / data.target) * 100);
    if (dewProgressFill) dewProgressFill.style.width = `${percent}%`;
    if (dewStatusText) dewStatusText.textContent = `생명의 이슬 모으는 중 (${data.current}/${data.target})`;
  });

  // 부활 완료 (새 씨앗 심기 완료)
  socket.on('garden_revived', (data) => {
    if (witheredModal) witheredModal.style.display = 'none';
    document.getElementById('canvas-container').style.filter = 'none';

    // 1명 부활 즉시 물주기가 가능하도록 쿨다운 초기화
    if (cooldownInterval) clearInterval(cooldownInterval);
    remainingCooldownSec = 0;
    localStorage.removeItem('garden_water_cooldown_expiry');
    if (cooldownProgressEl) cooldownProgressEl.style.width = '0%';
    if (waterBtn) {
      waterBtn.disabled = false;
      waterBtn.classList.remove('saturated');
    }
    if (waterBtnTextEl) waterBtnTextEl.textContent = '💧 물주기 (+10%)';

    activeGrowthSec = data.activeGrowthSec || 0;
    plantedAt = Date.now();

    if (window.gardenCanvas) {
      window.gardenCanvas.triggerWaterEffect();
      window.gardenCanvas.updateState({
        moisture: data.moisture,
        status: data.status,
        growthProgress: data.growthProgress
      });
    }
    if (window.gardenAudio) window.gardenAudio.playDewRevival();

    applyGardenState({
      moisture: data.moisture,
      status: data.status,
      growthProgress: data.growthProgress,
      activeGrowthSec
    });

    showToast('🌱 새로운 씨앗이 심어졌습니다! (지금 바로 첫 물을 줄 수 있습니다)');
  });
});
