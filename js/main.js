/**
 * Keep the Fire Alive - 클라이언트 메인 오케스트레이션 스크립트
 * 소켓 동기화, 개인 체류 시간, 전역 불꽃 생존 시간, 쿨다운, UI 이벤트 통합
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. 소켓 서버 대상 주소 스마트 결정 (모바일 Wi-Fi IP, GitHub Pages, 로컬호스트 모두 지원)
  const urlParams = new URLSearchParams(window.location.search);
  const queryServer = urlParams.get('server');
  const savedServer = localStorage.getItem('campfire_custom_server');

  let defaultServer = '';
  const currentHost = window.location.hostname;
  const isDirect3000 = (window.location.protocol.startsWith('http') && window.location.port === '3000');

  if (isDirect3000) {
    defaultServer = undefined; // 현재 호스트 바로 연결
  } else if (!currentHost || currentHost === 'localhost' || currentHost === '127.0.0.1') {
    defaultServer = 'http://localhost:3000';
  } else if (/^\d+\.\d+\.\d+\.\d+$/.test(currentHost)) {
    // 스마트폰에서 192.168.x.x 로 접속한 경우
    defaultServer = `http://${currentHost}:3000`;
  } else {
    // GitHub Pages (*.github.io) 등 외부에서 접속한 경우
    defaultServer = 'http://192.168.55.180:3000';
  }

  let serverTarget = queryServer || savedServer || defaultServer;

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
      console.log(`[SOCKET CONNECTED] 실시간 서버(${serverTarget || '호스트'})에 연결 완료! ID: ${socket.id}`);
      const userDot = document.querySelector('.user-indicator-dot');
      if (userDot) userDot.style.backgroundColor = '#2ecc71';
    });

    socket.on('connect_error', (err) => {
      console.warn(`[SOCKET RETRY] 서버(${serverTarget}) 연결 실패:`, err.message);
      const userCountEl = document.getElementById('user-count');
      const userDot = document.querySelector('.user-indicator-dot');
      if (userDot) userDot.style.backgroundColor = '#f59e0b';
      if (userCountEl) {
        userCountEl.innerHTML = `<span style="color: #f59e0b;">서버 연결 중 (설정⚙️)</span>`;
        userCountEl.style.cursor = 'pointer';
        userCountEl.onclick = () => {
          const newUrl = prompt(
            '실시간 백엔드 서버 주소를 입력하세요:\n(같은 Wi-Fi 휴대폰: http://192.168.55.180:3000\n클라우드 배포 시: https://서버주소)',
            serverTarget || 'http://192.168.55.180:3000'
          );
          if (newUrl && newUrl.trim()) {
            localStorage.setItem('campfire_custom_server', newUrl.trim());
            window.location.reload();
          }
        };
      }
    });
  } else {
    console.warn('[OFFLINE MODE] Socket.io CDN 로드 실패로 로컬 시뮬레이션 모드로 작동합니다.');
    const listeners = {};
    socket = {
      on: (ev, fn) => { listeners[ev] = listeners[ev] || []; listeners[ev].push(fn); },
      emit: (ev, data) => {}
    };
  }

  // 모바일 화면에서는 초기에 채팅창을 기본 접어두어 불꽃 화면 확보
  if (window.innerWidth <= 768) {
    const chatWidget = document.getElementById('chat-widget');
    if (chatWidget) chatWidget.classList.add('minimized');
  }




  // DOM 요소 참조
  const myStayTimeEl = document.getElementById('my-stay-time');
  const fireLifetimeEl = document.getElementById('fire-lifetime');
  const userCountEl = document.getElementById('user-count');
  const healthFillEl = document.getElementById('fire-health-fill');
  const healthTextEl = document.getElementById('fire-health-text');
  const addLogBtn = document.getElementById('add-log-btn');
  const cooldownProgressEl = document.getElementById('cooldown-progress');
  const btnTextEl = document.getElementById('add-log-btn-text');
  const muteBtn = document.getElementById('mute-btn');
  const chatToggleBtn = document.getElementById('chat-toggle-btn');
  const audioPromptOverlay = document.getElementById('audio-prompt-overlay');
  const toastContainer = document.getElementById('toast-container');
  const extinctModal = document.getElementById('extinct-modal');
  const strikeFlintBtn = document.getElementById('strike-flint-btn');
  const flintProgressFill = document.getElementById('flint-progress-fill');
  const flintStatusText = document.getElementById('flint-status-text');
  const extinctDurationText = document.getElementById('extinct-duration');
  const extinctLogsText = document.getElementById('extinct-total-logs');

  // 채팅 매니저 인스턴스 생성
  const chatManager = new window.CampfireChatManager(socket);

  // 세션 타임스탬프
  const sessionStartTime = Date.now();
  let globalFireStartTime = Date.now();
  let cooldownInterval = null;
  let remainingCooldownSec = 0;

  // 1. 개인 체류 시간 및 전역 불꽃 생존 시간 실시간 타이머 (Date.now 차분)
  function formatHMS(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }

  function formatDaysHMS(ms) {
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hrs = String(Math.floor((totalSec % 86400) / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    return `DAY ${days} · ${hrs}:${mins}:${secs}`;
  }

  setInterval(() => {
    // 개인 체류 시간 업데이트
    const stayMs = Date.now() - sessionStartTime;
    if (myStayTimeEl) myStayTimeEl.textContent = formatHMS(stayMs);

    // 전체 불꽃 생존 시간 업데이트
    const fireMs = Math.max(0, Date.now() - globalFireStartTime);
    if (fireLifetimeEl) fireLifetimeEl.textContent = formatDaysHMS(fireMs);
  }, 1000);

  // 2. 화면 토스트 알림 헬퍼
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

  // 3. 쿨다운 타이머 시작 함수 (180초)
  function startCooldown(seconds) {
    remainingCooldownSec = seconds;
    addLogBtn.disabled = true;

    if (cooldownInterval) clearInterval(cooldownInterval);

    cooldownInterval = setInterval(() => {
      remainingCooldownSec--;
      const progressPercent = ((180 - remainingCooldownSec) / 180) * 100;
      if (cooldownProgressEl) cooldownProgressEl.style.width = `${progressPercent}%`;

      const mins = Math.floor(remainingCooldownSec / 60);
      const secs = String(remainingCooldownSec % 60).padStart(2, '0');
      btnTextEl.textContent = `장작 준비 중 (${mins}:${secs})`;

      if (remainingCooldownSec <= 0) {
        clearInterval(cooldownInterval);
        addLogBtn.disabled = false;
        btnTextEl.textContent = '🪵 장작 넣기 (+8%)';
        if (cooldownProgressEl) cooldownProgressEl.style.width = '0%';
      }
    }, 1000);
  }

  // 4. 장작 넣기 버튼 이벤트
  if (addLogBtn) {
    addLogBtn.addEventListener('click', () => {
      if (addLogBtn.disabled) return;

      // 낙관적 UI: 내 화면에서 즉시 장작 비행 애니메이션 발동
      if (window.fireCanvas) window.fireCanvas.throwLog();

      // 서버로 장작 투입 요청 전송
      socket.emit('add_log');

      // 쿨다운 시작 (서버 검증과 동기화)
      startCooldown(180);
    });
  }

  // 5. 오디오 자동재생 해제 오버레이
  function unlockAudio() {
    if (window.fireAudio) window.fireAudio.init();
    if (audioPromptOverlay) {
      audioPromptOverlay.style.opacity = '0';
      setTimeout(() => {
        audioPromptOverlay.style.display = 'none';
      }, 500);
    }
  }

  if (audioPromptOverlay) {
    audioPromptOverlay.addEventListener('click', unlockAudio);
  }

  // 6. 음소거 토글
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      if (!window.fireAudio.isInitialized) {
        unlockAudio();
      }
      const isMuted = window.fireAudio.toggleMute();
      muteBtn.textContent = isMuted ? '🔇 음소거' : '🔊 소리 켜짐';
    });
  }

  // 7. 채팅창 접기/펼치기 토글 버튼
  if (chatToggleBtn) {
    chatToggleBtn.addEventListener('click', () => {
      const widget = document.getElementById('chat-widget');
      if (widget) widget.classList.toggle('minimized');
    });
  }

  // 8. 부활 의식: 부싯돌 치기
  if (strikeFlintBtn) {
    strikeFlintBtn.addEventListener('click', () => {
      if (window.fireAudio) window.fireAudio.playFlintSpark();
      if (window.fireCanvas) window.fireCanvas.burstEmbers(15);
      socket.emit('strike_flint');
    });
  }

  // 9. 백그라운드 탭 복귀 시 즉각 재동기화
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      socket.emit('request_sync');
    }
  });

  // --- Socket.io 서버 이벤트 리스너 ---

  // 초기 상태 로드
  socket.on('fire_init', (data) => {
    globalFireStartTime = data.globalStartTime || Date.now();

    if (userCountEl) userCountEl.textContent = `${data.users}명이 함께 불을 쬐는 중`;
    if (window.fireCanvas) window.fireCanvas.setTargetLife(data.life);
    if (window.fireAudio) window.fireAudio.updateVolumes(data.life);

    if (healthFillEl) healthFillEl.style.width = `${data.life}%`;
    if (healthTextEl) healthTextEl.textContent = `${data.life.toFixed(1)}% (${data.status})`;

    chatManager.setNickname(data.suggestedNickname);
    chatManager.loadRecentChats(data.recentChats);

    if (data.status === 'EXTINGUISHED') {
      showExtinctModal(data);
    }
  });

  // 1초 주기 틱
  socket.on('fire_tick', (data) => {
    if (userCountEl) userCountEl.textContent = `${data.users}명이 함께 불을 쬐는 중`;

    if (window.fireCanvas) window.fireCanvas.setTargetLife(data.life);
    if (window.fireAudio) window.fireAudio.updateVolumes(data.life);

    if (healthFillEl) healthFillEl.style.width = `${data.life}%`;
    if (healthTextEl) healthTextEl.textContent = `${data.life.toFixed(1)}% (${data.status})`;

    if (data.status === 'EXTINGUISHED' && extinctModal.style.display !== 'flex') {
      showExtinctModal(data);
    }
  });

  // 접속자 수 변경
  socket.on('user_count', (data) => {
    if (userCountEl) userCountEl.textContent = `${data.users}명이 함께 불을 쬐는 중`;
  });

  // 다른 유저가 장작을 넣음
  socket.on('log_added', (data) => {
    if (window.fireCanvas) {
      window.fireCanvas.setTargetLife(data.newLife);
      window.fireCanvas.burstEmbers(35);
    }
    if (window.fireAudio) {
      window.fireAudio.updateVolumes(data.newLife);
      window.fireAudio.playLogDrop();
    }
    showToast('누군가 온기를 더했습니다! (+8%)');
  });

  // 쿨다운 오류 피드백
  socket.on('cooldown_error', (data) => {
    startCooldown(data.remainingSec);
    showToast(`아직 장작을 넣을 수 없습니다. (${data.remainingSec}초 남음)`);
  });

  // 불꽃 소멸 처리
  function showExtinctModal(data) {
    if (!extinctModal) return;
    extinctModal.style.display = 'flex';
    document.getElementById('canvas-container').style.filter = 'grayscale(100%) brightness(0.6)';

    if (extinctDurationText && data.durationMs) {
      extinctDurationText.textContent = formatDaysHMS(data.durationMs);
    }
    if (extinctLogsText && data.totalLogs !== undefined) {
      extinctLogsText.textContent = `${data.totalLogs}개`;
    }
  }

  socket.on('fire_extinct', (data) => {
    showExtinctModal(data);
    showToast('불꽃이 차갑게 식었습니다...');
  });

  // 부활 진행 상태 수신
  socket.on('flint_progress', (data) => {
    const percent = Math.min(100, (data.current / data.target) * 100);
    if (flintProgressFill) flintProgressFill.style.width = `${percent}%`;
    if (flintStatusText) flintStatusText.textContent = `부싯돌 불꽃 모으는 중 (${data.current}/${data.target})`;
  });

  // 불꽃 부활 완료
  socket.on('fire_ignited', (data) => {
    if (extinctModal) extinctModal.style.display = 'none';
    document.getElementById('canvas-container').style.filter = 'none';

    globalFireStartTime = data.globalStartTime;
    if (window.fireCanvas) {
      window.fireCanvas.setTargetLife(data.life);
      window.fireCanvas.burstEmbers(60);
    }
    if (window.fireAudio) window.fireAudio.updateVolumes(data.life);

    showToast('새로운 불꽃이 피어올랐습니다! (DAY 1 시작)');
  });
});
