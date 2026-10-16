const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 25000,
  pingTimeout: 20000,
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// Render 리버스 프록시 신뢰 설정
app.enable('trust proxy');

// HTTP 접속 시 자동으로 HTTPS로 리다이렉트 (주의 요함 경고 방지)
app.use((req, res, next) => {
  if (req.secure || req.headers['x-forwarded-proto'] === 'https' || req.hostname === 'localhost' || req.hostname === '127.0.0.1') {
    return next();
  }
  return res.redirect(301, `https://${req.headers.host}${req.url}`);
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  // 브라우저가 항상 HTTPS로 접속하도록 HSTS 헤더 적용
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'fire_state.json');
const GARDEN_STATE_FILE = path.join(DATA_DIR, 'garden_state.json');

// --- 닉네임 생성 단어 풀 ---
const ADJECTIVES = ['따뜻한', '포근한', '조용한', '빛나는', '새벽의', '달빛의', '은은한', '고요한', '꿈꾸는', '다정한'];
const ANIMALS = ['여우', '부엉이', '사슴', '고양이', '늑대', '토끼', '곰', '파랑새', '수달', '다람쥐'];

function generateNickname() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${adj} ${animal}#${num}`;
}

// --- 불꽃 상태 정의 ---
function calculateStatus(life) {
  if (life <= 0) return 'EXTINGUISHED';
  if (life >= 70) return 'BLAZING';
  if (life >= 30) return 'STEADY';
  return 'DYING';
}

let state = {
  fireLife: 75.0,
  status: 'STEADY',
  globalStartTime: Date.now(),
  totalLogs: 0,
  lastSavedAt: Date.now()
};

// --- 정원(Garden) 상태 정의 및 쿨다운 관리 ---
function calculateGardenStatus(moisture) {
  if (moisture <= 0) return 'WITHERED';
  if (moisture >= 70) return 'LUSH';
  if (moisture >= 30) return 'HEALTHY';
  return 'THIRSTY';
}

let gardenState = {
  moisture: 75.0,           // 토양 수분 게이지 (0.0 ~ 100.0%)
  status: 'HEALTHY',        // 'LUSH', 'HEALTHY', 'THIRSTY', 'WITHERED'
  growthProgress: 0.0,      // 30일 목표 대비 누적 성장률 (0.00% ~ 100.00%)
  activeGrowthSec: 0,       // 나무가 시들지 않고 건강하게 자란 누적 시간(초)
  totalWaterings: 0,        // 누적 물주기 횟수
  plantedAt: Date.now(),    // 씨앗을 심은 최초 시각
  weather: 'CLEAR',         // 'CLEAR', 'RAIN', 'SNOW', 'BREEZE'
  treeSeed: 20261015,       // 거목 생성 시드
  lastSavedAt: Date.now()
};

// 최근 채팅 큐 (최대 30개 유지)
const recentChats = [];
const recentGardenChats = [];

// 쿨다운 관리 (IP 또는 소켓 기반)
// 장작 쿨다운: 180초 (3분)
const LOG_COOLDOWN_MS = 180 * 1000;
const WATER_COOLDOWN_MS = 180 * 1000;
const CHAT_COOLDOWN_MS = 3 * 1000;
const logCooldowns = new Map();
const waterCooldowns = new Map();
const chatCooldowns = new Map();

// 부활 의식 참여자
const resurrectionClicks = new Set();
const FLINT_GOAL = 3;

const dewClicks = new Set();
const DEW_GOAL = 3;

// --- 영속 데이터 디렉토리 확인 및 로드 ---
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      const now = Date.now();
      const downtimeSec = Math.max(0, (now - (data.lastSavedAt || now)) / 1000);

      let compensatedLife = data.fireLife - (downtimeSec * 0.08);
      if (compensatedLife <= 0) {
        state.fireLife = 0;
        state.status = 'EXTINGUISHED';
      } else {
        state.fireLife = Math.min(100.0, Math.max(0, compensatedLife));
        state.status = calculateStatus(state.fireLife);
      }

      state.globalStartTime = data.globalStartTime || now;
      state.totalLogs = data.totalLogs || 0;
      console.log(`[STATE LOADED] 이전 상태 복원 완료. 다운타임: ${downtimeSec.toFixed(1)}초, 복원된 화력: ${state.fireLife.toFixed(1)}%`);
    } else {
      saveState();
    }
  } catch (err) {
    console.error('[STATE LOAD ERROR]', err);
  }
}

function saveState() {
  try {
    state.lastSavedAt = Date.now();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[STATE SAVE ERROR]', err);
  }
}

function loadGardenState() {
  try {
    if (fs.existsSync(GARDEN_STATE_FILE)) {
      const raw = fs.readFileSync(GARDEN_STATE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      const now = Date.now();
      const downtimeSec = Math.max(0, (now - (data.lastSavedAt || now)) / 1000);

      // 다운타임 수분 감쇠 보정 (초당 약 0.015 감쇠)
      let compensatedMoisture = (data.moisture !== undefined ? data.moisture : 75.0) - (downtimeSec * 0.015);
      if (compensatedMoisture <= 0) {
        gardenState.moisture = 0;
        gardenState.status = 'WITHERED';
      } else {
        gardenState.moisture = Math.min(100.0, Math.max(0, compensatedMoisture));
        gardenState.status = calculateGardenStatus(gardenState.moisture);
      }

      gardenState.growthProgress = typeof data.growthProgress === 'number' ? data.growthProgress : 0.0;
      gardenState.activeGrowthSec = typeof data.activeGrowthSec === 'number' ? data.activeGrowthSec : 0;
      gardenState.totalWaterings = data.totalWaterings || 0;
      gardenState.plantedAt = data.plantedAt || now;
      gardenState.weather = data.weather || 'CLEAR';
      gardenState.treeSeed = data.treeSeed || 20261015;
      console.log(`[GARDEN STATE LOADED] 정원 복원 완료. 수분: ${gardenState.moisture.toFixed(1)}%, 성장률: ${gardenState.growthProgress.toFixed(2)}%`);
    } else {
      saveGardenState();
    }
  } catch (err) {
    console.error('[GARDEN STATE LOAD ERROR]', err);
  }
}

function saveGardenState() {
  try {
    gardenState.lastSavedAt = Date.now();
    fs.writeFileSync(GARDEN_STATE_FILE, JSON.stringify(gardenState, null, 2), 'utf-8');
  } catch (err) {
    console.error('[GARDEN STATE SAVE ERROR]', err);
  }
}

loadState();
loadGardenState();

// 10초마다 자동 스냅샷 저장
setInterval(() => {
  saveState();
  saveGardenState();
}, 10000);

// 서버 정상 종료 시 저장
process.on('SIGINT', () => {
  saveState();
  saveGardenState();
  process.exit();
});
process.on('SIGTERM', () => {
  saveState();
  saveGardenState();
  process.exit();
});

// --- HTML 이스케이프 및 살균 ---
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, 80)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 비속어 간이 필터
const FORBIDDEN_WORDS = ['시발', '씨발', '병신', '개새', '존나', '좆', 'fuck', 'shit', 'bitch'];
function filterProfanity(text) {
  let filtered = text;
  for (const word of FORBIDDEN_WORDS) {
    const reg = new RegExp(word, 'gi');
    filtered = filtered.replace(reg, '***');
  }
  return filtered;
}

// --- 1초 주기 중앙 화력 & 정원 틱 타이머 ---
let weatherCycleCounter = 0;

setInterval(() => {
  const userCount = io.engine.clientsCount;
  const now = Date.now();

  // 1. 장작불(Fire) 틱
  if (state.fireLife > 0) {
    const decayRate = userCount <= 2 ? 0.04 : 0.08;
    state.fireLife = Math.max(0, state.fireLife - decayRate);
    const newStatus = calculateStatus(state.fireLife);

    if (newStatus !== state.status) {
      state.status = newStatus;
      if (state.status === 'EXTINGUISHED') {
        const durationMs = now - state.globalStartTime;
        io.emit('fire_extinct', {
          durationMs,
          totalLogs: state.totalLogs
        });
        console.log(`[EXTINCTION] 불꽃이 소멸되었습니다. 지속 시간: ${Math.floor(durationMs / 1000)}초`);
      }
    }
  }

  // 2. 정원(Garden) 틱 (30일 = 2,592,000초 기준)
  // KST 표준시 계산 (UTC+9)
  const kstNow = new Date(now + 9 * 3600 * 1000);
  const kstHours = kstNow.getUTCHours();
  const kstMinutes = kstNow.getUTCMinutes();
  const kstSeconds = kstNow.getUTCSeconds();
  const month = kstNow.getUTCMonth() + 1;

  let season = 'SPRING';
  if (month >= 3 && month <= 5) season = 'SPRING';
  else if (month >= 6 && month <= 8) season = 'SUMMER';
  else if (month >= 9 && month <= 11) season = 'AUTUMN';
  else season = 'WINTER';

  // 10분마다 자연스러운 날씨 변화
  weatherCycleCounter++;
  if (weatherCycleCounter >= 600) {
    weatherCycleCounter = 0;
    const r = Math.random();
    if (season === 'WINTER') {
      gardenState.weather = r < 0.6 ? 'CLEAR' : (r < 0.85 ? 'SNOW' : 'BREEZE');
    } else {
      gardenState.weather = r < 0.6 ? 'CLEAR' : (r < 0.85 ? 'RAIN' : 'BREEZE');
    }
    console.log(`[WEATHER SHIFT] 현재 날씨가 ${gardenState.weather}(계절: ${season})로 변경되었습니다.`);
  }

  if (gardenState.moisture > 0) {
    // 새벽/소수 접속자 보호를 위한 감쇠율 조정
    const gardenDecayRate = userCount <= 2 ? 0.015 : 0.03;
    // 비가 내릴 때는 미세 자연 수분 공급 (+0.015/초)
    const rainGain = gardenState.weather === 'RAIN' ? 0.015 : 0;
    gardenState.moisture = Math.min(100.0, Math.max(0, gardenState.moisture - gardenDecayRate + rainGain));
    const newGardenStatus = calculateGardenStatus(gardenState.moisture);

    if (newGardenStatus !== gardenState.status) {
      gardenState.status = newGardenStatus;
      if (gardenState.status === 'WITHERED') {
        io.emit('garden_withered', {
          growthProgress: Number(gardenState.growthProgress.toFixed(4)),
          totalWaterings: gardenState.totalWaterings
        });
        console.log(`[WITHERED] 정원의 토양이 메말라 나무가 시들었습니다.`);
      }
    }

    if (gardenState.status !== 'WITHERED') {
      let mult = 1.0;
      if (gardenState.status === 'LUSH') mult = 1.15; // 광합성 보너스
      else if (gardenState.status === 'THIRSTY') mult = 0.6; // 메마름 페널티

      gardenState.activeGrowthSec += mult;
      // 30일(2,592,000초) 누적 성장률 (0.00% ~ 100.00%)
      gardenState.growthProgress = Math.min(100.0, (gardenState.activeGrowthSec / 2592000) * 100);
    }
  }

  // 매 1초마다 접속자들에게 종합 상태 브로드캐스트
  io.emit('fire_tick', {
    life: Number(state.fireLife.toFixed(2)),
    status: state.status,
    serverTime: now,
    users: userCount,
    totalLogs: state.totalLogs
  });

  io.emit('garden_tick', {
    moisture: Number(gardenState.moisture.toFixed(2)),
    status: gardenState.status,
    growthProgress: Number(gardenState.growthProgress.toFixed(4)),
    activeGrowthSec: Math.floor(gardenState.activeGrowthSec),
    totalWaterings: gardenState.totalWaterings,
    weather: gardenState.weather,
    season,
    serverTime: now,
    kst: { hour: kstHours, minute: kstMinutes, second: kstSeconds, month },
    users: userCount
  });
}, 1000);

// --- 정적 파일 서빙 및 라우팅 ---
app.use(express.static(__dirname));

// 파비콘 404 방지
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 나무 에셋 라우팅
app.get(['/tree.png', '/assets/tree.png'], (req, res) => {
  res.sendFile(path.join(__dirname, 'pngtree-a-tree-in-pixel-art-style-png-image_15060073.png'));
});

// 메인 포털 허브 (AFK)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 실시간 장작불 서비스 (Keep the Fire Alive)
app.get(['/fire', '/fire.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'fire.html'));
});

// 실시간 정원 서비스 (The Slowest Garden in the World)
app.get(['/garden', '/garden.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'garden.html'));
});


// --- Socket.io 실시간 이벤트 핸들링 ---
io.on('connection', (socket) => {
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  const initialNickname = generateNickname();

  console.log(`[USER CONNECTED] ID: ${socket.id} (IP: ${clientIp}) - 현재 접속자: ${io.engine.clientsCount}명`);

  // KST 표준시 계산
  const now = Date.now();
  const kstNow = new Date(now + 9 * 3600 * 1000);
  const kstHours = kstNow.getUTCHours();
  const kstMinutes = kstNow.getUTCMinutes();
  const kstSeconds = kstNow.getUTCSeconds();
  const month = kstNow.getUTCMonth() + 1;
  let season = 'SPRING';
  if (month >= 3 && month <= 5) season = 'SPRING';
  else if (month >= 6 && month <= 8) season = 'SUMMER';
  else if (month >= 9 && month <= 11) season = 'AUTUMN';
  else season = 'WINTER';

  // 1. 장작불 초기 상태 전송
  socket.emit('fire_init', {
    life: Number(state.fireLife.toFixed(2)),
    status: state.status,
    globalStartTime: state.globalStartTime,
    users: io.engine.clientsCount,
    totalLogs: state.totalLogs,
    recentChats,
    suggestedNickname: initialNickname
  });

  // 2. 정원 초기 상태 전송
  socket.emit('garden_init', {
    moisture: Number(gardenState.moisture.toFixed(2)),
    status: gardenState.status,
    growthProgress: Number(gardenState.growthProgress.toFixed(4)),
    activeGrowthSec: Math.floor(gardenState.activeGrowthSec),
    plantedAt: gardenState.plantedAt,
    totalWaterings: gardenState.totalWaterings,
    weather: gardenState.weather,
    season,
    serverTime: now,
    kst: { hour: kstHours, minute: kstMinutes, second: kstSeconds, month },
    users: io.engine.clientsCount,
    recentChats: recentGardenChats,
    suggestedNickname: initialNickname
  });

  // 전체 접속자 수 즉시 업데이트 알림
  io.emit('user_count', { users: io.engine.clientsCount });

  // === [FIRE] 이벤트 ===
  // 장작 넣기 요청 처리
  socket.on('add_log', () => {
    const curTime = Date.now();
    const lastAdd = logCooldowns.get(clientIp) || 0;
    const elapsed = curTime - lastAdd;

    if (elapsed < LOG_COOLDOWN_MS) {
      const remainingSec = Math.ceil((LOG_COOLDOWN_MS - elapsed) / 1000);
      return socket.emit('cooldown_error', { remainingSec });
    }

    if (state.status === 'EXTINGUISHED') {
      return socket.emit('action_error', { message: '불이 꺼져있어 장작을 넣을 수 없습니다. 부활 의식이 필요합니다.' });
    }

    logCooldowns.set(clientIp, curTime);
    state.fireLife = Math.min(100.0, state.fireLife + 8.0);
    state.totalLogs += 1;
    state.status = calculateStatus(state.fireLife);

    console.log(`[LOG ADDED] IP: ${clientIp} -> 화력: ${state.fireLife.toFixed(1)}%`);

    io.emit('log_added', {
      newLife: Number(state.fireLife.toFixed(2)),
      status: state.status,
      totalLogs: state.totalLogs
    });
  });

  // 장작불 채팅
  socket.on('send_chat', (data) => {
    if (!data || typeof data.message !== 'string') return;

    const curTime = Date.now();
    const lastChat = chatCooldowns.get(socket.id) || 0;
    if (curTime - lastChat < CHAT_COOLDOWN_MS) {
      return socket.emit('chat_error', { message: '채팅은 3초에 한 번만 전송할 수 있습니다.' });
    }

    chatCooldowns.set(socket.id, curTime);

    const cleanSender = sanitizeText(data.sender || initialNickname);
    const cleanMsg = filterProfanity(sanitizeText(data.message.trim()));
    if (!cleanMsg) return;

    const chatItem = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sender: cleanSender,
      message: cleanMsg,
      timestamp: Date.now()
    };

    recentChats.push(chatItem);
    if (recentChats.length > 30) recentChats.shift();

    io.emit('new_chat', chatItem);
  });

  // 장작불 부활 의식: 부싯돌 치기
  socket.on('strike_flint', () => {
    if (state.status !== 'EXTINGUISHED') return;

    resurrectionClicks.add(socket.id);
    const currentFlintCount = resurrectionClicks.size;

    io.emit('flint_progress', {
      current: currentFlintCount,
      target: FLINT_GOAL
    });

    if (currentFlintCount >= FLINT_GOAL || (io.engine.clientsCount === 1 && currentFlintCount >= 1)) {
      state.fireLife = 65.0;
      state.status = 'STEADY';
      state.globalStartTime = Date.now();
      resurrectionClicks.clear();
      saveState();

      io.emit('fire_ignited', {
        life: state.fireLife,
        status: state.status,
        globalStartTime: state.globalStartTime
      });

      const igniteMsg = {
        id: `sys_${Date.now()}`,
        sender: '시스템',
        message: '🔥 새로운 온기가 모여 불꽃이 다시 피어올랐습니다! (DAY 1 시작)',
        timestamp: Date.now(),
        isSystem: true
      };
      recentChats.push(igniteMsg);
      io.emit('new_chat', igniteMsg);
      console.log('[FIRE REBORN] 새로운 불꽃이 점화되었습니다!');
    }
  });

  // 장작불 재동기화
  socket.on('request_sync', () => {
    socket.emit('fire_tick', {
      life: Number(state.fireLife.toFixed(2)),
      status: state.status,
      serverTime: Date.now(),
      users: io.engine.clientsCount,
      totalLogs: state.totalLogs
    });
  });

  // === [GARDEN] 이벤트 ===
  // 1. 물주기 요청 (수분 100% 무반응 규칙 적용)
  socket.on('water_plant', () => {
    // [핵심 가드] 수분이 이미 100%일 때는 쿨다운 소모 없이 완전 무반응(No-Op)
    if (gardenState.moisture >= 100.0) {
      return;
    }

    const curTime = Date.now();
    const lastWater = waterCooldowns.get(clientIp) || 0;
    const elapsed = curTime - lastWater;

    if (elapsed < WATER_COOLDOWN_MS) {
      const remainingSec = Math.ceil((WATER_COOLDOWN_MS - elapsed) / 1000);
      return socket.emit('water_cooldown_error', { remainingSec });
    }

    if (gardenState.status === 'WITHERED') {
      return socket.emit('garden_action_error', { message: '나무가 시들어 있어 물을 줄 수 없습니다. 이슬 부활 의식이 필요합니다.' });
    }

    waterCooldowns.set(clientIp, curTime);
    gardenState.moisture = Math.min(100.0, gardenState.moisture + 10.0);
    gardenState.totalWaterings += 1;
    gardenState.status = calculateGardenStatus(gardenState.moisture);

    console.log(`[PLANT WATERED] IP: ${clientIp} -> 수분: ${gardenState.moisture.toFixed(1)}%, 누적: ${gardenState.totalWaterings}`);

    io.emit('plant_watered', {
      newMoisture: Number(gardenState.moisture.toFixed(2)),
      status: gardenState.status,
      totalWaterings: gardenState.totalWaterings,
      growthProgress: Number(gardenState.growthProgress.toFixed(4))
    });
  });

  // 2. 정원 채팅
  socket.on('send_garden_chat', (data) => {
    if (!data || typeof data.message !== 'string') return;

    const curTime = Date.now();
    const lastChat = chatCooldowns.get(socket.id) || 0;
    if (curTime - lastChat < CHAT_COOLDOWN_MS) {
      return socket.emit('garden_chat_error', { message: '채팅은 3초에 한 번만 전송할 수 있습니다.' });
    }

    chatCooldowns.set(socket.id, curTime);

    const cleanSender = sanitizeText(data.sender || initialNickname);
    const cleanMsg = filterProfanity(sanitizeText(data.message.trim()));
    if (!cleanMsg) return;

    const chatItem = {
      id: `gchat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sender: cleanSender,
      message: cleanMsg,
      timestamp: Date.now()
    };

    recentGardenChats.push(chatItem);
    if (recentGardenChats.length > 30) recentGardenChats.shift();

    io.emit('new_garden_chat', chatItem);
  });

  // 3. 시든 나무 부활 의식: 생명의 이슬 모으기
  socket.on('strike_dew', () => {
    if (gardenState.status !== 'WITHERED') return;

    dewClicks.add(socket.id);
    const currentDewCount = dewClicks.size;

    io.emit('dew_progress', {
      current: currentDewCount,
      target: DEW_GOAL
    });

    if (currentDewCount >= DEW_GOAL || (io.engine.clientsCount === 1 && currentDewCount >= 1)) {
      gardenState.moisture = 60.0;
      gardenState.status = 'HEALTHY';
      dewClicks.clear();
      saveGardenState();

      io.emit('garden_revived', {
        moisture: gardenState.moisture,
        status: gardenState.status,
        growthProgress: Number(gardenState.growthProgress.toFixed(4))
      });

      const reviveMsg = {
        id: `sys_${Date.now()}`,
        sender: '시스템',
        message: '💧 생명의 이슬이 모여 시든 거목이 다시 푸르게 깨어났습니다!',
        timestamp: Date.now(),
        isSystem: true
      };
      recentGardenChats.push(reviveMsg);
      io.emit('new_garden_chat', reviveMsg);
      console.log('[GARDEN REVIVED] 정원이 부활했습니다!');
    }
  });

  // 4. 정원 탭 복귀 시 즉각 재동기화
  socket.on('request_garden_sync', () => {
    const curNow = Date.now();
    const curKst = new Date(curNow + 9 * 3600 * 1000);
    socket.emit('garden_tick', {
      moisture: Number(gardenState.moisture.toFixed(2)),
      status: gardenState.status,
      growthProgress: Number(gardenState.growthProgress.toFixed(4)),
      activeGrowthSec: Math.floor(gardenState.activeGrowthSec),
      totalWaterings: gardenState.totalWaterings,
      weather: gardenState.weather,
      season,
      serverTime: curNow,
      kst: { hour: curKst.getUTCHours(), minute: curKst.getUTCMinutes(), second: curKst.getUTCSeconds(), month: curKst.getUTCMonth() + 1 },
      users: io.engine.clientsCount
    });
  });

  // 접속 종료 처리
  socket.on('disconnect', () => {
    resurrectionClicks.delete(socket.id);
    dewClicks.delete(socket.id);
    chatCooldowns.delete(socket.id);
    console.log(`[USER DISCONNECTED] ID: ${socket.id} - 잔여 접속자: ${io.engine.clientsCount}명`);
    io.emit('user_count', { users: io.engine.clientsCount });
  });
});

// --- 서버 시작 ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🌿 [Keep the Fire Alive & The Slowest Garden] 서버 가동`);
  console.log(`🌐 포트: ${PORT} (0.0.0.0 바인딩 완료)`);
  console.log(`🌱 정원 경로: /garden 또는 /garden.html`);
  console.log(`🔥 장작불 경로: /fire 또는 /fire.html`);
  console.log(`===============================================`);
});
