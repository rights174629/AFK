const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000
});

const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'fire_state.json');

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

// 최근 채팅 큐 (최대 30개 유지)
const recentChats = [];

// 쿨다운 관리 (IP 또는 소켓 기반)
// 장작 쿨다운: 180초 (3분) - 로컬 테스트 편의를 위해 기본 180초
const LOG_COOLDOWN_MS = 180 * 1000;
const CHAT_COOLDOWN_MS = 3 * 1000;
const logCooldowns = new Map();
const chatCooldowns = new Map();

// 부활 의식 (부싯돌 클릭 참여자)
const resurrectionClicks = new Set();
const FLINT_GOAL = 3; // 필요 참여자 수

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

      // 다운타임 감쇠 보정 (초당 약 0.08 감쇠)
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

loadState();

// 10초마다 자동 스냅샷 저장
setInterval(saveState, 10000);

// 서버 정상 종료 시 저장
process.on('SIGINT', () => {
  saveState();
  process.exit();
});
process.on('SIGTERM', () => {
  saveState();
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

// --- 1초 주기 중앙 화력 틱 타이머 ---
setInterval(() => {
  const userCount = io.engine.clientsCount;

  if (state.fireLife > 0) {
    // 접속자가 적을 때는 감쇠 속도를 늦춰 새벽 사망 방지 (Cold Start 방어)
    const decayRate = userCount <= 2 ? 0.04 : 0.08;
    state.fireLife = Math.max(0, state.fireLife - decayRate);
    const newStatus = calculateStatus(state.fireLife);

    if (newStatus !== state.status) {
      state.status = newStatus;
      if (state.status === 'EXTINGUISHED') {
        const durationMs = Date.now() - state.globalStartTime;
        io.emit('fire_extinct', {
          durationMs,
          totalLogs: state.totalLogs
        });
        console.log(`[EXTINCTION] 불꽃이 소멸되었습니다. 지속 시간: ${Math.floor(durationMs / 1000)}초`);
      }
    }
  }

  // 매 1초마다 모든 접속자에게 브로드캐스트
  io.emit('fire_tick', {
    life: Number(state.fireLife.toFixed(2)),
    status: state.status,
    serverTime: Date.now(),
    users: userCount,
    totalLogs: state.totalLogs
  });
}, 1000);

// --- 정적 파일 서빙 및 라우팅 ---
app.use(express.static(path.join(__dirname, 'public')));

// 메인 포털 허브 (AFK)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 실시간 장작불 서비스 (Keep the Fire Alive)
app.get(['/fire', '/fire.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fire.html'));
});


// --- Socket.io 실시간 이벤트 핸들링 ---
io.on('connection', (socket) => {
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  const initialNickname = generateNickname();

  console.log(`[USER CONNECTED] ID: ${socket.id} (IP: ${clientIp}) - 현재 접속자: ${io.engine.clientsCount}명`);

  // 접속자에게 초기 종합 상태 전송
  socket.emit('fire_init', {
    life: Number(state.fireLife.toFixed(2)),
    status: state.status,
    globalStartTime: state.globalStartTime,
    users: io.engine.clientsCount,
    totalLogs: state.totalLogs,
    recentChats,
    suggestedNickname: initialNickname
  });

  // 전체 접속자 수 즉시 업데이트 알림
  io.emit('user_count', { users: io.engine.clientsCount });

  // 1. 장작 넣기 요청 처리
  socket.on('add_log', () => {
    const now = Date.now();
    const lastAdd = logCooldowns.get(clientIp) || 0;
    const elapsed = now - lastAdd;

    if (elapsed < LOG_COOLDOWN_MS) {
      const remainingSec = Math.ceil((LOG_COOLDOWN_MS - elapsed) / 1000);
      return socket.emit('cooldown_error', { remainingSec });
    }

    if (state.status === 'EXTINGUISHED') {
      return socket.emit('action_error', { message: '불이 꺼져있어 장작을 넣을 수 없습니다. 부활 의식이 필요합니다.' });
    }

    // 쿨다운 등록
    logCooldowns.set(clientIp, now);

    // 장작 투입 (+8% 회복, 최대 100)
    state.fireLife = Math.min(100.0, state.fireLife + 8.0);
    state.totalLogs += 1;
    state.status = calculateStatus(state.fireLife);

    console.log(`[LOG ADDED] IP: ${clientIp} -> 화력: ${state.fireLife.toFixed(1)}%`);

    // 모든 접속자에게 불티 연출 트리거 브로드캐스트
    io.emit('log_added', {
      newLife: Number(state.fireLife.toFixed(2)),
      status: state.status,
      totalLogs: state.totalLogs
    });
  });

  // 2. 실시간 채팅 수신 및 검증 브로드캐스트
  socket.on('send_chat', (data) => {
    if (!data || typeof data.message !== 'string') return;

    const now = Date.now();
    const lastChat = chatCooldowns.get(socket.id) || 0;
    if (now - lastChat < CHAT_COOLDOWN_MS) {
      return socket.emit('chat_error', { message: '채팅은 3초에 한 번만 전송할 수 있습니다.' });
    }

    chatCooldowns.set(socket.id, now);

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

  // 3. 부활 의식: 부싯돌 치기
  socket.on('strike_flint', () => {
    if (state.status !== 'EXTINGUISHED') return;

    resurrectionClicks.add(socket.id);
    const currentFlintCount = resurrectionClicks.size;

    io.emit('flint_progress', {
      current: currentFlintCount,
      target: FLINT_GOAL
    });

    if (currentFlintCount >= FLINT_GOAL || (io.engine.clientsCount === 1 && currentFlintCount >= 1)) {
      // 새로운 불꽃 점화!
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

      // 시스템 채팅 메시지
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

  // 4. 백그라운드 탭 복귀 시 즉각 재동기화 요청
  socket.on('request_sync', () => {
    socket.emit('fire_tick', {
      life: Number(state.fireLife.toFixed(2)),
      status: state.status,
      serverTime: Date.now(),
      users: io.engine.clientsCount,
      totalLogs: state.totalLogs
    });
  });

  // 접속 종료 처리
  socket.on('disconnect', () => {
    resurrectionClicks.delete(socket.id);
    chatCooldowns.delete(socket.id);
    console.log(`[USER DISCONNECTED] ID: ${socket.id} - 잔여 접속자: ${io.engine.clientsCount}명`);
    io.emit('user_count', { users: io.engine.clientsCount });
  });
});

// --- 서버 시작 ---
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🔥 [Keep the Fire Alive] 서버가 가동되었습니다.`);
  console.log(`🌐 접속 주소: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
