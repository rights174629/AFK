/**
 * 🛠️ AFK DevBridge (v2.0)
 * 모든 MVP 파일에 1줄로 삽입되어 developermode.html 마스터 셸과 postMessage 버스로 통신하는
 * 초경량(Zero-Dependency) 샌드박스 브릿지 스크립트.
 * 
 * - 실서버 네트워크 격리 (MockSocket)
 * - 선언형 스키마(AFK_DEV_CONFIG) 연동 및 자동 제어 버스
 * - 실시간 QA 자동 진단기 실행기
 * - 시간 배속기 (Time-Warp Engine) & 가상 소켓 패킷 로거
 */

(function () {
  'use strict';

  const urlParams = new URLSearchParams(window.location.search);
  const isDevMode = urlParams.get('devmode') === '1' || window.parent !== window;
  const isMockSocket = urlParams.get('mockSocket') === '1' || isDevMode;

  console.log(`[AFK DEV-BRIDGE] 초기화됨 (DevMode: ${isDevMode}, MockSocket: ${isMockSocket})`);

  // --- 1. MockSocket 구현 (실서버 완벽 격리 & 시뮬레이션) ---
  class MockSocket {
    constructor() {
      this.id = 'mock_' + Math.random().toString(36).substring(2, 8);
      this.connected = true;
      this.listeners = new Map();
      this.totalWaterings = 0;
      this.totalLogs = 0;
      this.mockMoisture = 75.0;
      this.mockFireLife = 75.0;
    }

    on(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(callback);
      return this;
    }

    off(event, callback) {
      if (!this.listeners.has(event)) return this;
      if (!callback) {
        this.listeners.delete(event);
      } else {
        const arr = this.listeners.get(event).filter(fn => fn !== callback);
        this.listeners.set(event, arr);
      }
      return this;
    }

    emit(event, data) {
      // 1. 부모 창으로 송신 패킷 전송
      postToParent({
        type: 'AFK_DEV_SOCKET_LOG',
        direction: 'OUT',
        event,
        data,
        timestamp: Date.now()
      });

      // 2. 가상 서버 로직 처리
      setTimeout(() => {
        this.handleMockServerResponse(event, data);
      }, 30);

      return this;
    }

    trigger(event, data) {
      // 수신 패킷 로깅
      postToParent({
        type: 'AFK_DEV_SOCKET_LOG',
        direction: 'IN',
        event,
        data,
        timestamp: Date.now()
      });

      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.forEach(fn => {
          try { fn(data); } catch (e) { console.error('[MOCK SOCKET ERROR]', e); }
        });
      }
    }

    disconnect() {
      this.connected = false;
      return this;
    }

    connect() {
      this.connected = true;
      setTimeout(() => this.trigger('connect'), 10);
      return this;
    }

    handleMockServerResponse(event, data) {
      if (event === 'water_plant') {
        if (this.mockMoisture >= 100.0) {
          // 100% 무반응 검증
          postToParent({
            type: 'AFK_DEV_SOCKET_LOG',
            direction: 'IN',
            event: 'IGNORED_100%_NOOP',
            data: { reason: 'Soil already saturated' },
            timestamp: Date.now()
          });
          return;
        }

        this.mockMoisture = Math.min(100.0, this.mockMoisture + 10.0);
        this.totalWaterings++;
        this.trigger('plant_watered', {
          newMoisture: Number(this.mockMoisture.toFixed(2)),
          status: this.mockMoisture >= 70 ? 'LUSH' : 'HEALTHY',
          totalWaterings: this.totalWaterings,
          growthProgress: 80.0
        });
      } else if (event === 'send_garden_chat') {
        this.trigger('new_garden_chat', {
          id: 'mock_msg_' + Date.now(),
          sender: (data && data.sender) || '가상 방랑자',
          message: (data && data.message) || '',
          timestamp: Date.now()
        });
      } else if (event === 'strike_dew') {
        this.mockMoisture = 75.0;
        this.trigger('dew_progress', { current: 1, target: 1 });
        this.trigger('garden_revived', {
          moisture: 75.0,
          status: 'LUSH',
          growthProgress: 0.0,
          activeGrowthSec: 0
        });
      } else if (event === 'request_garden_sync') {
        this.trigger('garden_tick', {
          moisture: this.mockMoisture,
          status: 'HEALTHY',
          growthProgress: 80.0,
          activeGrowthSec: 1000,
          totalWaterings: this.totalWaterings,
          weather: 'CLEAR',
          season: 'SUMMER',
          serverTime: Date.now(),
          kst: { hour: 14, minute: 0, second: 0, month: 7 },
          users: 1
        });
      } else if (event === 'add_log') {
        this.mockFireLife = Math.min(100.0, this.mockFireLife + 8.0);
        this.totalLogs++;
        this.trigger('fire_updated', {
          newLife: Number(this.mockFireLife.toFixed(2)),
          status: this.mockFireLife >= 70 ? 'BLAZING' : 'STEADY',
          totalLogs: this.totalLogs
        });
      } else if (event === 'send_chat') {
        this.trigger('new_chat', {
          id: 'mock_fmsg_' + Date.now(),
          sender: (data && data.sender) || '가상 캠퍼',
          message: (data && data.message) || '',
          timestamp: Date.now()
        });
      } else if (event === 'strike_flint') {
        this.mockFireLife = 75.0;
        this.trigger('flint_progress', { current: 1, target: 1 });
        this.trigger('fire_revived', {
          life: 75.0,
          status: 'STEADY'
        });
      }
    }
  }

  // Socket.io 가로채기 (실서버 연결 원천 차단)
  let activeMockSocket = null;
  if (isMockSocket) {
    activeMockSocket = new MockSocket();
    window.io = function () {
      console.log('[AFK DEV-BRIDGE] io() 호출 감지 -> MockSocket 반환');
      setTimeout(() => {
        activeMockSocket.trigger('connect');
      }, 50);
      return activeMockSocket;
    };
    window.io.connect = window.io;
    window.__AFK_MOCK_SOCKET = activeMockSocket;
  }

  // --- 2. postMessage 부모 통신 헬퍼 ---
  function postToParent(msg) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  }

  // --- 3. 시간 배속기 (Time-Warp Engine) ---
  let timeWarpMultiplier = 1;
  let simulatedDayCounter = 1;
  let simulatedHour = 14.0;
  let timeWarpInterval = null;

  function setTimeWarp(mult) {
    timeWarpMultiplier = Math.max(1, mult);
    console.log(`[AFK DEV-BRIDGE] 타임워프 배속 설정: ${timeWarpMultiplier}x`);

    if (timeWarpInterval) {
      clearInterval(timeWarpInterval);
      timeWarpInterval = null;
    }

    if (timeWarpMultiplier > 1) {
      // 1초마다 실시간 시간과 쿨다운을 배속만큼 전진
      const tickRateMs = Math.max(50, Math.floor(1000 / Math.min(timeWarpMultiplier, 20)));
      const timeDeltaSec = (tickRateMs / 1000) * timeWarpMultiplier;

      timeWarpInterval = setInterval(() => {
        // 1. 시간대 전진 (0~24시)
        simulatedHour = (simulatedHour + (timeDeltaSec / 3600) * 12) % 24;
        if (window.AFK_DEV_HOOKS && window.AFK_DEV_HOOKS.onControlChange) {
          window.AFK_DEV_HOOKS.onControlChange('currentHour', simulatedHour);
        }

        // 2. 쿨다운 가속 처리 (localStorage 확인)
        const expiry = localStorage.getItem('garden_water_cooldown_expiry');
        if (expiry) {
          const expTime = parseInt(expiry, 10);
          const newExp = expTime - (timeDeltaSec * 1000);
          localStorage.setItem('garden_water_cooldown_expiry', newExp);
        }
      }, tickRateMs);
    }
  }

  // --- 4. 자동 QA 검사기 실행기 ---
  function runQAChecks() {
    const config = window.AFK_DEV_CONFIG || {};
    const checks = config.qaChecks || [];

    const results = checks.map(item => {
      try {
        const passed = !!item.check();
        return { id: item.id, desc: item.desc, passed };
      } catch (err) {
        return { id: item.id, desc: item.desc, passed: false, error: err.message };
      }
    });

    postToParent({
      type: 'AFK_DEV_QA_RESULTS',
      results,
      timestamp: Date.now()
    });

    return results;
  }

  // --- 5. 부모 창으로부터의 메시지 수신 버스 ---
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'AFK_DEV_INIT_REQUEST':
      case 'AFK_DEV_PING':
        sendReadyState();
        break;

      case 'AFK_DEV_CONTROL_CHANGE':
        if (window.AFK_DEV_HOOKS && typeof window.AFK_DEV_HOOKS.onControlChange === 'function') {
          window.AFK_DEV_HOOKS.onControlChange(msg.key, msg.value);
        }
        // QA 자동 재진단
        setTimeout(runQAChecks, 100);
        break;

      case 'AFK_DEV_TRIGGER_ACTION':
        if (window.AFK_DEV_HOOKS && typeof window.AFK_DEV_HOOKS.onAction === 'function') {
          window.AFK_DEV_HOOKS.onAction(msg.actionId);
        }
        // 액션 수행 후 QA 자동 진단
        setTimeout(runQAChecks, 300);
        break;

      case 'AFK_DEV_RUN_QA':
        runQAChecks();
        break;

      case 'AFK_DEV_TIME_WARP':
        setTimeWarp(msg.multiplier || 1);
        break;

      case 'AFK_DEV_INJECT_MOCK_EVENT':
        if (activeMockSocket) {
          activeMockSocket.trigger(msg.event, msg.data);
        }
        break;

      case 'AFK_DEV_APPLY_SNAPSHOT':
        if (msg.snapshot && window.AFK_DEV_HOOKS && window.AFK_DEV_HOOKS.onControlChange) {
          Object.keys(msg.snapshot).forEach(key => {
            window.AFK_DEV_HOOKS.onControlChange(key, msg.snapshot[key]);
          });
          setTimeout(runQAChecks, 150);
        }
        break;

      default:
        break;
    }
  });

  // --- 6. 초기 로드 시 부모로 선언형 스키마 전송 ---
  function sendReadyState() {
    const config = window.AFK_DEV_CONFIG || null;
    postToParent({
      type: 'AFK_DEV_READY',
      config,
      timestamp: Date.now()
    });
    // 첫 진단 실행
    setTimeout(runQAChecks, 400);
  }

  // 페이지 로드 완료 시 자동 공표
  if (document.readyState === 'complete') {
    setTimeout(sendReadyState, 100);
  } else {
    window.addEventListener('load', () => setTimeout(sendReadyState, 100));
  }

  // 외부 노출 객체
  window.AFK_DEV_BRIDGE = {
    postToParent,
    runQAChecks,
    setTimeWarp,
    getMockSocket: () => activeMockSocket
  };
})();
