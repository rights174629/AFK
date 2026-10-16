/**
 * 🛠️ AFK Developer Sandbox Portal Controller (v2.0)
 * 마스터 셸 오케스트레이션 스크립트:
 * - Zero-Config MVP 자동 탐색 및 아이프레임 격리 제어
 * - 선언형 스키마 기반 실시간 UI 자동 생성
 * - 타임워프 가속기 (1x, 10x, 60x, 3600x)
 * - 자동 QA 진단기 & 링버퍼 가상 소켓 패킷 모니터
 * - 상태 스냅샷 및 URL 딥링크 복사
 * - 개발자 PIN 보안 게이트 (기본 PIN: 2026)
 */

(function () {
  'use strict';

  // --- 상태 관리 ---
  const state = {
    currentMvpId: null,
    currentMvpUrl: null,
    mvpList: [],
    currentConfig: null,
    controlValues: {},
    timeWarp: 1,
    activeTab: 'controls',
    isZenMode: false,
    socketLogs: [],
    maxSocketLogs: 40,
    logFilter: 'all',
    qaResults: []
  };

  // --- DOM 참조 캐시 ---
  const dom = {
    header: document.getElementById('master-header'),
    sidebar: document.getElementById('inspector-sidebar'),
    mvpSelect: document.getElementById('mvp-select'),
    refreshMvpsBtn: document.getElementById('refresh-mvps-btn'),
    localFileInput: document.getElementById('local-file-input'),
    openLocalBtn: document.getElementById('open-local-btn'),
    viewportFrame: document.getElementById('viewport-device-frame'),
    sandboxIframe: document.getElementById('sandbox-iframe'),
    viewportInfo: document.getElementById('viewport-info-text'),
    dragOverlay: document.getElementById('drag-overlay'),
    sandboxStage: document.getElementById('sandbox-stage'),
    hardReloadBtn: document.getElementById('hard-reload-btn'),
    zenModeBtn: document.getElementById('zen-mode-btn'),
    zenRestoreBtn: document.getElementById('zen-restore-btn'),

    // 뷰포트 프리셋 버튼
    viewportBtns: document.querySelectorAll('[data-viewport]'),
    // 타임워프 버튼
    warpBtns: document.querySelectorAll('[data-warp]'),

    // 탭 및 패널
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanels: document.querySelectorAll('.tab-panel'),
    qaTabBadge: document.getElementById('qa-tab-badge'),
    logTabBadge: document.getElementById('log-tab-badge'),

    // 컨트롤러 탭 컨테이너
    controlsContainer: document.getElementById('dynamic-controls-container'),
    actionsContainer: document.getElementById('dynamic-actions-container'),

    // QA 탭 요소
    qaSummaryPill: document.getElementById('qa-summary-pill'),
    qaListContainer: document.getElementById('qa-checklist-container'),
    rerunQaBtn: document.getElementById('rerun-qa-btn'),

    // 스냅샷 요소
    snapshotNameInput: document.getElementById('snapshot-name-input'),
    saveSnapshotBtn: document.getElementById('save-snapshot-btn'),
    copyUrlBtn: document.getElementById('copy-url-btn'),
    presetsListContainer: document.getElementById('presets-list-container'),

    // 소켓 로그 요소
    socketLogStream: document.getElementById('socket-log-stream'),
    clearLogsBtn: document.getElementById('clear-logs-btn'),
    logFilterBtns: document.querySelectorAll('[data-log-filter]'),
    injectEventInput: document.getElementById('inject-event-input'),
    injectPayloadInput: document.getElementById('inject-payload-input'),
    injectBtn: document.getElementById('inject-packet-btn'),

    // 보안 모달
    authModal: document.getElementById('auth-modal-backdrop'),
    authForm: document.getElementById('auth-form'),
    authPinInput: document.getElementById('auth-pin-input'),
    authCard: document.getElementById('auth-modal-card'),

    // 토스트 컨테이너
    toastContainer: document.getElementById('dev-toast-container')
  };

  // --- 토스트 알림 헬퍼 ---
  function showToast(message, icon = '✨') {
    if (!dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'dev-toast';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px) scale(0.95)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  // 🔑 개발자 전용 보안 PIN (여기서 원하시는 비밀번호로 언제든지 능동적 수정 가능)
  const DEV_SECRET_PIN = '1020';

  // --- 1. 개발자 PIN 인증 게이트 (보안) ---
  function initAuthGate() {
    // PIN 번호가 변경되면 이전 브라우저 세션은 자동 만료되어 즉시 재인증을 요구합니다.
    const savedPin = localStorage.getItem('afk_dev_auth_pin');
    const isAuthed = savedPin === DEV_SECRET_PIN;
    if (isAuthed) {
      if (dom.authModal) dom.authModal.classList.add('hidden');
      return;
    }

    if (dom.authForm && dom.authPinInput) {
      dom.authPinInput.focus();
      dom.authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = dom.authPinInput.value.trim();
        if (pin === DEV_SECRET_PIN) {
          localStorage.setItem('afk_dev_auth_pin', DEV_SECRET_PIN);
          dom.authModal.classList.add('hidden');
          showToast('개발자 포털 인증이 완료되었습니다!', '🔓');
        } else {
          dom.authCard.classList.add('shake');
          dom.authPinInput.value = '';
          dom.authPinInput.focus();
          showToast('잘못된 PIN 번호입니다.', '⚠️');
          setTimeout(() => dom.authCard.classList.remove('shake'), 400);
        }
      });
    }
  }

  // --- 2. MVP 목록 탐색 (Zero-Config Discovery) ---
  async function fetchMvpList() {
    let mvps = [];
    try {
      // 1. 서버 동적 스캔 API 시도
      const res = await fetch('/api/dev/mvps');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.mvps) && data.mvps.length > 0) {
          mvps = data.mvps;
        }
      }
    } catch (e) {
      console.warn('[DEV PORTAL] 서버 API 조회 실패, 정적 매니페스트로 폴백합니다.');
    }

    // 2. 정적 매니페스트 폴백
    if (mvps.length === 0) {
      try {
        const res = await fetch('mvp/manifest.json');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.mvps)) {
            mvps = data.mvps;
          }
        }
      } catch (e) {
        console.warn('[DEV PORTAL] 정적 매니페스트 폴백 실패, 기본 하드코딩 레지스트리 사용');
      }
    }

    // 3. 최종 안전망
    if (mvps.length === 0) {
      mvps = [
        { id: 'garden_mvp', title: '🌳 세상에서 가장 느린 정원 v2.0', url: 'mvp/garden_mvp.html' },
        { id: 'fire_mvp', title: '🔥 불꽃 테스트베드 v2.0', url: 'mvp/fire_mvp.html' }
      ];
    }

    state.mvpList = mvps;
    populateMvpSelect();
  }

  function populateMvpSelect() {
    if (!dom.mvpSelect) return;
    dom.mvpSelect.innerHTML = '';

    state.mvpList.forEach(mvp => {
      const opt = document.createElement('option');
      opt.value = mvp.id;
      opt.textContent = mvp.title || mvp.id;
      dom.mvpSelect.appendChild(opt);
    });

    // 로컬 파일 열기 옵션 추가
    const optLocal = document.createElement('option');
    optLocal.value = '__local_file__';
    optLocal.textContent = '📂 로컬 HTML 파일 직접 열기...';
    dom.mvpSelect.appendChild(optLocal);

    // URL 쿼리에 지정된 MVP 확인 (?mvp=garden_mvp)
    const urlParams = new URLSearchParams(window.location.search);
    const targetMvp = urlParams.get('mvp') || state.mvpList[0].id;

    if (state.mvpList.some(m => m.id === targetMvp)) {
      dom.mvpSelect.value = targetMvp;
      loadMvp(targetMvp);
    } else if (state.mvpList.length > 0) {
      dom.mvpSelect.value = state.mvpList[0].id;
      loadMvp(state.mvpList[0].id);
    }
  }

  // --- 3. MVP 아이프레임 로드 및 완전 격리 ---
  function loadMvp(mvpId) {
    const mvp = state.mvpList.find(m => m.id === mvpId);
    if (!mvp) return;

    state.currentMvpId = mvp.id;
    state.currentMvpUrl = mvp.url;

    // 아이프레임 안전 교체 (about:blank 로드 후 GC 유도)
    if (dom.sandboxIframe) {
      dom.sandboxIframe.src = 'about:blank';
      setTimeout(() => {
        const cleanUrl = mvp.url.includes('?') ? `${mvp.url}&devmode=1&mockSocket=1` : `${mvp.url}?devmode=1&mockSocket=1`;
        dom.sandboxIframe.src = cleanUrl;
        console.log(`[DEV PORTAL] MVP 로드됨: ${cleanUrl}`);
      }, 50);
    }

    // 소켓 로그 초기화 및 안내 메시지
    state.socketLogs = [];
    addSocketLog('IN', 'SANDBOX_ISOLATED', { status: 'Secure MockSocket active', mvp: mvp.id });
    renderSocketLogs();
  }

  // --- 4. 선언형 스키마 기반 컨트롤 패널 자동 렌더링 ---
  function renderControls(config) {
    if (!dom.controlsContainer || !dom.actionsContainer) return;
    dom.controlsContainer.innerHTML = '';
    dom.actionsContainer.innerHTML = '';

    if (!config) {
      dom.controlsContainer.innerHTML = '<div style="color: #64748b; font-size: 11px;">연결된 AFK_DEV_CONFIG 스키마가 없습니다.</div>';
      return;
    }

    // 1. 슬라이더 & 셀렉트 컨트롤 생성
    const controls = config.controls || [];
    controls.forEach(ctrl => {
      const itemEl = document.createElement('div');
      itemEl.className = 'control-item';

      const labelRow = document.createElement('div');
      labelRow.className = 'control-label-row';

      const labelText = document.createElement('span');
      labelText.className = 'control-label';
      labelText.textContent = ctrl.label;

      const valPill = document.createElement('span');
      valPill.className = 'control-value-pill';
      valPill.id = `val-pill-${ctrl.key}`;
      valPill.textContent = ctrl.value;

      labelRow.appendChild(labelText);
      labelRow.appendChild(valPill);
      itemEl.appendChild(labelRow);

      if (ctrl.type === 'range') {
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'control-slider';
        slider.min = ctrl.min;
        slider.max = ctrl.max;
        slider.step = ctrl.step || 1;
        slider.value = ctrl.value;
        slider.id = `ctrl-input-${ctrl.key}`;

        state.controlValues[ctrl.key] = ctrl.value;

        slider.addEventListener('input', (e) => {
          const val = e.target.value;
          valPill.textContent = val;
          state.controlValues[ctrl.key] = val;
          sendToIframe({ type: 'AFK_DEV_CONTROL_CHANGE', key: ctrl.key, value: val });
        });

        itemEl.appendChild(slider);
      } else if (ctrl.type === 'select') {
        const select = document.createElement('select');
        select.className = 'control-select';
        select.id = `ctrl-input-${ctrl.key}`;

        (ctrl.options || []).forEach(optVal => {
          const opt = document.createElement('option');
          opt.value = optVal;
          opt.textContent = optVal;
          if (optVal === ctrl.value) opt.selected = true;
          select.appendChild(opt);
        });

        state.controlValues[ctrl.key] = ctrl.value;

        select.addEventListener('change', (e) => {
          const val = e.target.value;
          valPill.textContent = val;
          state.controlValues[ctrl.key] = val;
          sendToIframe({ type: 'AFK_DEV_CONTROL_CHANGE', key: ctrl.key, value: val });
        });

        itemEl.appendChild(select);
      }

      dom.controlsContainer.appendChild(itemEl);
    });

    // 2. 원클릭 테스트 액션 버튼 생성
    const actions = config.actions || [];
    actions.forEach(act => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn-action ${act.danger ? 'danger' : ''}`;
      btn.textContent = act.label;

      btn.addEventListener('click', () => {
        sendToIframe({ type: 'AFK_DEV_TRIGGER_ACTION', actionId: act.id });
        showToast(`${act.label} 액션 실행`, '⚡');
      });

      dom.actionsContainer.appendChild(btn);
    });
  }

  // --- 5. QA 진단 결과 렌더링 ---
  function renderQAResults(results) {
    if (!dom.qaListContainer) return;
    dom.qaListContainer.innerHTML = '';
    state.qaResults = results || [];

    let passCount = 0;
    state.qaResults.forEach(item => {
      if (item.passed) passCount++;

      const itemEl = document.createElement('div');
      itemEl.className = 'qa-item';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'qa-item-title';
      titleWrap.innerHTML = `<span>${item.passed ? '🟢' : '🔴'}</span><span>${item.desc}</span>`;

      const badge = document.createElement('span');
      badge.className = `qa-item-badge ${item.passed ? 'pass' : 'fail'}`;
      badge.textContent = item.passed ? 'PASS' : 'FAIL';

      itemEl.appendChild(titleWrap);
      itemEl.appendChild(badge);
      dom.qaListContainer.appendChild(itemEl);
    });

    const total = state.qaResults.length;
    const isAllPass = total > 0 && passCount === total;

    if (dom.qaSummaryPill) {
      dom.qaSummaryPill.className = `qa-status-pill ${isAllPass ? 'pass' : 'fail'}`;
      dom.qaSummaryPill.textContent = isAllPass ? `🟢 ALL PASS (${passCount}/${total})` : `🔴 ${total - passCount} FAIL (${passCount}/${total})`;
    }

    if (dom.qaTabBadge) {
      dom.qaTabBadge.className = `tab-badge ${isAllPass ? 'pass' : 'fail'}`;
      dom.qaTabBadge.textContent = `${passCount}/${total}`;
    }
  }

  // --- 6. 가상 소켓 패킷 로그 모니터링 ---
  function addSocketLog(direction, event, data) {
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      direction,
      event,
      data,
      timestamp: new Date()
    };

    state.socketLogs.unshift(entry);
    if (state.socketLogs.length > state.maxSocketLogs) {
      state.socketLogs.pop();
    }

    renderSocketLogs();
  }

  function renderSocketLogs() {
    if (!dom.socketLogStream) return;
    dom.socketLogStream.innerHTML = '';

    const filtered = state.socketLogs.filter(log => {
      if (state.logFilter === 'in') return log.direction === 'IN';
      if (state.logFilter === 'out') return log.direction === 'OUT';
      return true;
    });

    filtered.forEach(log => {
      const entryEl = document.createElement('div');
      entryEl.className = 'log-entry';

      const dirBadge = document.createElement('span');
      dirBadge.className = `log-badge-dir ${log.direction === 'IN' ? 'in' : 'out'}`;
      dirBadge.textContent = log.direction === 'IN' ? '📥 IN' : '📤 OUT';

      const eventName = document.createElement('span');
      eventName.className = 'log-event-name';
      eventName.textContent = log.event;

      const payloadPreview = document.createElement('span');
      payloadPreview.className = 'log-payload-preview';
      payloadPreview.textContent = JSON.stringify(log.data);

      const timeSpan = document.createElement('span');
      timeSpan.className = 'log-timestamp';
      const h = String(log.timestamp.getHours()).padStart(2, '0');
      const m = String(log.timestamp.getMinutes()).padStart(2, '0');
      const s = String(log.timestamp.getSeconds()).padStart(2, '0');
      timeSpan.textContent = `${h}:${m}:${s}`;

      entryEl.appendChild(dirBadge);
      entryEl.appendChild(eventName);
      entryEl.appendChild(payloadPreview);
      entryEl.appendChild(timeSpan);

      // 클릭 시 JSON 확장 상세 뷰
      let isExpanded = false;
      entryEl.addEventListener('click', () => {
        isExpanded = !isExpanded;
        const existing = entryEl.querySelector('.log-expanded-payload');
        if (isExpanded) {
          if (!existing) {
            const exp = document.createElement('div');
            exp.className = 'log-expanded-payload';
            exp.textContent = JSON.stringify(log.data, null, 2);
            entryEl.appendChild(exp);
          }
        } else {
          if (existing) existing.remove();
        }
      });

      dom.socketLogStream.appendChild(entryEl);
    });

    if (dom.logTabBadge) {
      dom.logTabBadge.textContent = `${state.socketLogs.length}/${state.maxSocketLogs}`;
    }
  }

  // --- 7. 타임워프 엔진 제어 ---
  function setTimeWarp(mult) {
    state.timeWarp = mult;
    dom.warpBtns.forEach(btn => {
      const w = parseInt(btn.dataset.warp, 10);
      if (w === mult) {
        btn.classList.add('active', 'emerald');
      } else {
        btn.classList.remove('active', 'emerald');
      }
    });

    sendToIframe({ type: 'AFK_DEV_TIME_WARP', multiplier: mult });
    showToast(`시간 배속: ${mult}x 설정`, '⚡');
  }

  // --- 8. 뷰포트 프리셋 전환 ---
  function setViewport(mode) {
    if (!dom.viewportFrame) return;

    dom.viewportBtns.forEach(btn => {
      if (btn.dataset.viewport === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    dom.viewportFrame.className = `viewport-device-frame mode-${mode}`;

    const labels = {
      desktop: '🖥️ Desktop (100% Fluid)',
      iphone: '📱 iPhone 14 Pro (390 × 844 px)',
      tablet: '💻 iPad Mini (768 × 1024 px)'
    };

    if (dom.viewportInfo) {
      dom.viewportInfo.textContent = labels[mode] || mode;
    }
  }

  // --- 9. 스냅샷 저장 및 URL 공유 (State Snapshotter) ---
  function saveSnapshot() {
    const name = (dom.snapshotNameInput ? dom.snapshotNameInput.value.trim() : '') || `스냅샷 #${Date.now().toString().slice(-4)}`;
    const snapshot = {
      id: 'snap_' + Date.now(),
      name,
      mvpId: state.currentMvpId,
      time: new Date().toLocaleString(),
      values: { ...state.controlValues }
    };

    const saved = JSON.parse(localStorage.getItem('afk_dev_presets') || '[]');
    saved.unshift(snapshot);
    localStorage.setItem('afk_dev_presets', JSON.stringify(saved.slice(0, 15)));

    if (dom.snapshotNameInput) dom.snapshotNameInput.value = '';
    renderPresets();
    showToast(`프리셋 "${name}" 저장 완료!`, '📸');
  }

  function renderPresets() {
    if (!dom.presetsListContainer) return;
    dom.presetsListContainer.innerHTML = '';

    const presets = JSON.parse(localStorage.getItem('afk_dev_presets') || '[]');
    if (presets.length === 0) {
      dom.presetsListContainer.innerHTML = '<div style="color: #64748b; font-size: 11px;">저장된 프리셋이 없습니다.</div>';
      return;
    }

    presets.forEach(p => {
      const card = document.createElement('div');
      card.className = 'preset-card';

      const info = document.createElement('div');
      info.className = 'preset-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'preset-name';
      nameEl.textContent = p.name;

      const timeEl = document.createElement('div');
      timeEl.className = 'preset-time';
      timeEl.textContent = `${p.mvpId} · ${p.time}`;

      info.appendChild(nameEl);
      info.appendChild(timeEl);

      const actions = document.createElement('div');
      actions.className = 'preset-actions';

      const applyBtn = document.createElement('button');
      applyBtn.className = 'action-pill-btn';
      applyBtn.textContent = '적용';
      applyBtn.style.padding = '2px 8px';
      applyBtn.addEventListener('click', () => {
        applySnapshot(p.values);
        showToast(`프리셋 "${p.name}" 적용 완료!`, '✅');
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn-ghost';
      delBtn.textContent = '🗑️';
      delBtn.title = '프리셋 삭제';
      delBtn.addEventListener('click', () => {
        const filtered = presets.filter(x => x.id !== p.id);
        localStorage.setItem('afk_dev_presets', JSON.stringify(filtered));
        renderPresets();
        showToast('프리셋 삭제됨', '🗑️');
      });

      actions.appendChild(applyBtn);
      actions.appendChild(delBtn);

      card.appendChild(info);
      card.appendChild(actions);
      dom.presetsListContainer.appendChild(card);
    });
  }

  function applySnapshot(snapshotValues) {
    if (!snapshotValues) return;
    Object.keys(snapshotValues).forEach(key => {
      const val = snapshotValues[key];
      state.controlValues[key] = val;

      const pill = document.getElementById(`val-pill-${key}`);
      if (pill) pill.textContent = val;

      const input = document.getElementById(`ctrl-input-${key}`);
      if (input) input.value = val;
    });

    sendToIframe({ type: 'AFK_DEV_APPLY_SNAPSHOT', snapshot: snapshotValues });
  }

  function copyCurrentStateUrl() {
    const params = new URLSearchParams();
    params.set('mvp', state.currentMvpId || 'garden_mvp');

    Object.keys(state.controlValues).forEach(k => {
      params.set(k, state.controlValues[k]);
    });

    const fullUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      showToast('상태 재현 URL이 클립보드에 복사되었습니다!', '🔗');
    }).catch(() => {
      prompt('상태 URL 복사:', fullUrl);
    });
  }

  // --- 10. 샌드박스 하드 리셋 (Hard Reload) ---
  function hardReloadSandbox() {
    if (!dom.viewportFrame) return;

    showToast('샌드박스 프로세스 재생성 중...', '🧹');
    const oldIframe = document.getElementById('sandbox-iframe');
    if (oldIframe) {
      oldIframe.src = 'about:blank';
      oldIframe.remove();
    }

    setTimeout(() => {
      const newIframe = document.createElement('iframe');
      newIframe.id = 'sandbox-iframe';
      newIframe.className = 'sandbox-iframe';
      newIframe.setAttribute('allow', 'autoplay');

      const mvp = state.mvpList.find(m => m.id === state.currentMvpId);
      const url = mvp ? mvp.url : 'mvp/garden_mvp.html';
      const cleanUrl = url.includes('?') ? `${url}&devmode=1&mockSocket=1` : `${url}?devmode=1&mockSocket=1`;

      dom.viewportFrame.appendChild(newIframe);
      dom.sandboxIframe = newIframe;
      newIframe.src = cleanUrl;

      showToast('샌드박스 재생성 완료!', '🟢');
    }, 150);
  }

  // --- 11. 젠 모드 (Zen Mode) ---
  function toggleZenMode(force) {
    state.isZenMode = typeof force === 'boolean' ? force : !state.isZenMode;

    if (state.isZenMode) {
      dom.header.classList.add('zen-hidden');
      dom.sidebar.classList.add('zen-hidden');
      dom.zenRestoreBtn.classList.add('active');
      showToast('순수 화면 보기 모드 (Zen Mode) 활성화 (단축키 H)', '👁️');
    } else {
      dom.header.classList.remove('zen-hidden');
      dom.sidebar.classList.remove('zen-hidden');
      dom.zenRestoreBtn.classList.remove('active');
    }
  }

  // --- 12. postMessage 전송 및 수신 버스 ---
  function sendToIframe(msg) {
    if (dom.sandboxIframe && dom.sandboxIframe.contentWindow) {
      dom.sandboxIframe.contentWindow.postMessage(msg, '*');
    }
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'AFK_DEV_READY':
        console.log('[DEV PORTAL] MVP Ready 수신:', msg.config);
        state.currentConfig = msg.config;
        renderControls(msg.config);
        // URL 쿼리에 제어값이 포함되어 있다면 자동 복원
        applyUrlQueryParams();
        break;

      case 'AFK_DEV_QA_RESULTS':
        renderQAResults(msg.results);
        break;

      case 'AFK_DEV_SOCKET_LOG':
        addSocketLog(msg.direction, msg.event, msg.data);
        break;

      default:
        break;
    }
  });

  function applyUrlQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const snapshotValues = {};
    let hasSnapshot = false;

    if (state.currentConfig && state.currentConfig.controls) {
      state.currentConfig.controls.forEach(ctrl => {
        if (params.has(ctrl.key)) {
          const val = params.get(ctrl.key);
          snapshotValues[ctrl.key] = ctrl.type === 'range' ? parseFloat(val) : val;
          hasSnapshot = true;
        }
      });
    }

    if (hasSnapshot) {
      setTimeout(() => {
        applySnapshot(snapshotValues);
        showToast('URL 파라미터 상태가 자동 적용되었습니다.', '🔗');
      }, 200);
    }
  }

  // --- 13. 드래그 앤 드롭 로컬 HTML 파일 테스트 ---
  function initDragAndDrop() {
    if (!dom.sandboxStage || !dom.dragOverlay) return;

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.dragOverlay.classList.add('active');
    });

    dom.dragOverlay.addEventListener('dragleave', () => {
      dom.dragOverlay.classList.remove('active');
    });

    dom.dragOverlay.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.dragOverlay.classList.remove('active');

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleLocalFile(files[0]);
      }
    });

    if (dom.localFileInput) {
      dom.localFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleLocalFile(e.target.files[0]);
        }
      });
    }

    if (dom.openLocalBtn && dom.localFileInput) {
      dom.openLocalBtn.addEventListener('click', () => {
        dom.localFileInput.click();
      });
    }
  }

  function handleLocalFile(file) {
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      showToast('HTML 파일만 열 수 있습니다.', '⚠️');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const localId = `local_${file.name.replace(/\.[^/.]+$/, '')}`;

    const newMvp = {
      id: localId,
      title: `📁 [로컬] ${file.name}`,
      url: objectUrl
    };

    state.mvpList.push(newMvp);
    populateMvpSelect();
    dom.mvpSelect.value = localId;
    loadMvp(localId);

    showToast(`로컬 파일 "${file.name}" 로드 완료!`, '📂');
  }

  // --- 14. 이벤트 리스너 바인딩 ---
  function initEventListeners() {
    // 프로젝트 스위처 변경
    if (dom.mvpSelect) {
      dom.mvpSelect.addEventListener('change', (e) => {
        if (e.target.value === '__local_file__') {
          if (dom.localFileInput) dom.localFileInput.click();
        } else {
          loadMvp(e.target.value);
        }
      });
    }

    // 새로고침 버튼
    if (dom.refreshMvpsBtn) {
      dom.refreshMvpsBtn.addEventListener('click', () => {
        fetchMvpList();
        showToast('MVP 목록을 새로고침했습니다.', '🔄');
      });
    }

    // 뷰포트 프리셋 버튼
    dom.viewportBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setViewport(btn.dataset.viewport);
      });
    });

    // 타임워프 버튼
    dom.warpBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setTimeWarp(parseInt(btn.dataset.warp, 10));
      });
    });

    // 마스터 액션
    if (dom.hardReloadBtn) dom.hardReloadBtn.addEventListener('click', hardReloadSandbox);
    if (dom.zenModeBtn) dom.zenModeBtn.addEventListener('click', () => toggleZenMode());
    if (dom.zenRestoreBtn) dom.zenRestoreBtn.addEventListener('click', () => toggleZenMode(false));

    // 탭 전환
    dom.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        dom.tabBtns.forEach(b => b.classList.remove('active'));
        dom.tabPanels.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPanel = document.getElementById(`tab-panel-${tab}`);
        if (targetPanel) targetPanel.classList.add('active');
        state.activeTab = tab;
      });
    });

    // QA 재진단 버튼
    if (dom.rerunQaBtn) {
      dom.rerunQaBtn.addEventListener('click', () => {
        sendToIframe({ type: 'AFK_DEV_RUN_QA' });
        showToast('QA 진단 실행 중...', '🧪');
      });
    }

    // 스냅샷 저장 및 복사
    if (dom.saveSnapshotBtn) dom.saveSnapshotBtn.addEventListener('click', saveSnapshot);
    if (dom.copyUrlBtn) dom.copyUrlBtn.addEventListener('click', copyCurrentStateUrl);

    // 패킷 로그 비우기 및 필터
    if (dom.clearLogsBtn) {
      dom.clearLogsBtn.addEventListener('click', () => {
        state.socketLogs = [];
        renderSocketLogs();
        showToast('소켓 로그가 초기화되었습니다.', '🧹');
      });
    }

    dom.logFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        dom.logFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.logFilter = btn.dataset.logFilter;
        renderSocketLogs();
      });
    });

    // 가상 패킷 주입기
    if (dom.injectBtn && dom.injectEventInput && dom.injectPayloadInput) {
      dom.injectBtn.addEventListener('click', () => {
        const ev = dom.injectEventInput.value.trim();
        if (!ev) return;

        let payload = {};
        try {
          payload = JSON.parse(dom.injectPayloadInput.value.trim() || '{}');
        } catch (e) {
          showToast('JSON 형식 오류', '⚠️');
          return;
        }

        sendToIframe({ type: 'AFK_DEV_INJECT_MOCK_EVENT', event: ev, data: payload });
        showToast(`패킷 "${ev}" 주입 완료!`, '📡');
      });
    }

    // 단축키 바인딩
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        toggleZenMode();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        hardReloadSandbox();
      } else if (e.key === '1') {
        setTimeWarp(1);
      } else if (e.key === '2') {
        setTimeWarp(10);
      } else if (e.key === '3') {
        setTimeWarp(60);
      } else if (e.key === '4') {
        setTimeWarp(3600);
      } else if (e.key === 'Escape') {
        if (state.isZenMode) toggleZenMode(false);
      }
    });
  }

  // --- 15. 초기화 진입점 ---
  document.addEventListener('DOMContentLoaded', () => {
    initAuthGate();
    initEventListeners();
    initDragAndDrop();
    fetchMvpList();
    renderPresets();
    setViewport('desktop');
    console.log('[AFK DEV PORTAL] v2.0 초기화 완료');
  });
})();
