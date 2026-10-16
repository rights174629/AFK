# 🛠️ AFK 개발자 전용 샌드박스 포털 (`developermode.html`) 구축 및 아키텍처 마스터 플랜 (v2.0 — 초경량·자동 관리형 에디션)

본 문서는 현재 라이브 서비스 중인 **`https://afk-ukbs.onrender.com/`** (`server.js` + `index.html` + `fire.html`) 환경에 영향을 주지 않고, **`https://afk-ukbs.onrender.com/developermode.html`** 경로로 접속하여 제작 중인 신규 웹 토이들(예: `세상에서 가장 느린 정원` 등)의 **UI MVP 및 핵심 기능을 가장 쉽게 관리하고 테스트할 수 있는 개발자 전용 포털** 구축 계획서입니다.

---

## 0. 기존(v1.0) 계획의 부족한 점 자기반성 및 외부 레퍼런스 벤치마킹

기존 v1.0 계획서를 **"유지보수와 관리의 용이성(Ease of Management)"** 관점에서 엄격히 재검토한 결과, 다음과 같은 치명적인 관리 병목(Pain Points)이 발견되었으며, 이를 해결하기 위해 웹 인터랙티브/게임 업계 표준 도구들의 아키텍처를 조사·도입했습니다.

### 0.1 기존 v1.0 계획의 4가지 부족했던 점 (Self-Critique)
1. **MVP 파일 이중 관리 문제 (Dual-Maintenance Trap)**:
   - 기존 계획처럼 `developermode.html` 내부에 MVP 코드를 직접 인라인으로 합쳐 넣으면, 나중에 `garden.html`을 수정할 때마다 `developermode.html`도 똑같이 복사·붙여넣기 해야 하는 이중 작업이 발생합니다.
   - **보완**: 각 MVP는 독립된 HTML 파일(예: `mvp/garden_mvp.html`)로 그대로 두고, `developermode.html`은 이를 **`<iframe>` 샌드박스**로 불러와 [Window.postMessage()](https://www.google.com/search?q=https%3A%2F%2Fdeveloper.mozilla.org%2Fen-US%2Fdocs%2FWeb%2FAPI%2FWindow%2FpostMessage) 브릿지로만 제어하도록 분리해야 **코드 중복이 0%**가 됩니다.
2. **새 프로젝트 추가 시 포털 HTML을 매번 뜯어고쳐야 하는 번거로움**:
   - 앞으로 3번째, 4번째 웹 토이를 만들 때마다 슬라이더와 테스트 버튼 HTML을 수동으로 짜는 것은 관리가 불가능합니다.
   - **보완**: [Tweakpane](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fcocopon%2Ftweakpane) 및 [lil-gui](https://www.google.com/search?q=https%3A%2F%2Flil-gui.georgealways.com%2F)가 사용하는 **선언형 스키마 기반 자동 UI 생성(Auto-Generated Controls)** 방식을 도입하여, JSON 설정 몇 줄만 적으면 슬라이더·드롭다운·프리셋 버튼이 자동 생성되게 만듭니다.
3. **MVP 추가 등록의 수동 작업**:
   - **보완**: `server.js`가 `/mvp` 폴더 내의 `.html` 파일 목록을 자동으로 스캔해 내려주는 `GET /api/dev/mvps` API(및 정적 매니페스트 폴백)를 구현하여, **폴더에 파일만 넣으면 개발자 포털 목록에 자동 등록(Zero-Config Discovery)**되도록 개선합니다.
4. **테스트 결과 공유 및 시간 배속(Time-Warp) 부재**:
   - 하루 단위로 자라는 나무나 3분 쿨다운을 실제 시간으로 기다리는 것은 비효율적이며, 발견한 특정 상태(예: "가을 + 밤 22시 + 수분 15% 가뭄 균열")를 북마크하거나 공유할 방법이 없었습니다.
   - **보완**: **시간 배속기(`1x`, `10x`, `60x`, `3600x`)**와 **URL 쿼리스트링 스냅샷(`?mvp=garden&day=24&moisture=15&hour=22`)** 공유 및 `localStorage` 자동 저장 기능을 추가합니다.

### 0.2 외부 개발자 사례 벤치마킹 요약
| 레퍼런스 도구 / 아키텍처 | 핵심 설계 패턴 | `developermode.html`에 적용할 포인트 |
| :--- | :--- | :--- |
| **[Tweakpane](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fcocopon%2Ftweakpane) & [lil-gui](https://www.google.com/search?q=https%3A%2F%2Flil-gui.georgealways.com%2F)** | JS 객체/스키마만 넘기면 슬라이더, 셀렉트, 모니터링 그래프를 자동 렌더링 | MVP마다 컨트롤 패널 HTML을 새로 짜지 않고 `DEV_SCHEMA` 객체 하나로 우측 인스펙터 자동 생성 |
| **[MDN Sandboxed IFrames](https://www.google.com/search?q=https%3A%2F%2Fweb.dev%2Farticles%2Fsandboxed-iframes) & [postMessage](https://www.google.com/search?q=https%3A%2F%2Fdeveloper.mozilla.org%2Fen-US%2Fdocs%2FWeb%2FAPI%2FWindow%2FpostMessage)** | 호스트 페이지와 프리뷰 `<iframe>`을 격리하고 메시지 버스로만 상태 통신 | `developermode.html`(호스트) ↔ `mvp/garden_mvp.html`(아이프레임) 간 완전한 스타일/타이머/메모리 격리 |
| **Storybook URL Knobs / State Snapshots** | 현재 조작한 UI 파라미터를 URL 쿼리스트링으로 직렬화 | 특정 버그나 멋진 풍경 상태를 `[🔗 현재 상태 링크 복사]` 버튼 하나로 저장·재현 |

---

## 1. 핵심 아키텍처: "관리 포인트 제로(Zero-Config) 구조"

### 1.1 폴더 및 파일 구조 (단순하고 직관적인 관리)
새로운 MVP를 만들 때 개발자는 **`mvp/` 폴더에 HTML 파일 하나만 넣으면 끝**납니다.

```text
/ (프로젝트 루트 - https://afk-ukbs.onrender.com/)
├── index.html                # 일반 유저용 메인 포털 허브
├── fire.html                 # 라이브 서비스 1: Keep the Fire Alive
├── garden.html               # 라이브 서비스 2: 세상에서 가장 느린 정원 (배포본)
├── developermode.html        # 🛠️ 개발자 전용 통합 테스트 포털 (마스터 셸)
├── js/
│   └── dev-bridge.js         # 모든 MVP에 1줄로 삽입하는 초경량(2KB) 통신 브릿지
├── mvp/                      # 🧪 UI MVP 전용 폴더 (여기에 넣으면 자동 인식!)
│   ├── manifest.json         # 정적 환경(GitHub Pages 등) 폴백용 MVP 목록
│   ├── garden_mvp.html       # 세상에서 가장 느린 정원 v2.0 UI MVP
│   └── fire_mvp.html         # 불꽃 UI 테스트베드 MVP
└── server.js                 # /developermode 라우트 및 /mvp 폴더 자동 스캔 API 포함
```

---

### 1.2 핵심 기술 1: 1줄 삽입으로 끝나는 `dev-bridge.js` & 선언형 스키마
각 UI MVP 파일(`garden_mvp.html` 등) 하단에 작은 스크립트 블록 하나만 정의해 두면, `developermode.html`이 해당 MVP를 불러올 때 **어떤 슬라이더와 버튼을 띄워야 하는지 스스로 파악하여 컨트롤 패널을 자동 생성**합니다.

```javascript
// mvp/garden_mvp.html 내부에 선언하는 스키마 예시 (관리 극대화)
window.AFK_DEV_CONFIG = {
  id: 'garden_mvp',
  title: '🌳 세상에서 가장 느린 정원 v2.0',
  version: '2.0.0',
  // 1. 슬라이더/셀렉트 컨트롤 자동 생성 정의
  controls: [
    { key: 'simDay', label: '경과 일수 (일일 성장)', type: 'range', min: 1, max: 30, step: 1, value: 24 },
    { key: 'moisture', label: '토양 수분 (%)', type: 'range', min: 0, max: 100, step: 1, value: 85 },
    { key: 'currentHour', label: '실시간 시각 (0~24시)', type: 'range', min: 0, max: 23.9, step: 0.25, value: 14 },
    { key: 'season', label: '계절 변화', type: 'select', options: ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'], value: 'SUMMER' },
    { key: 'weather', label: '날씨 변화', type: 'select', options: ['CLEAR', 'RAIN', 'SNOW'], value: 'CLEAR' }
  ],
  // 2. 원클릭 테스트 액션 버튼 자동 생성 정의
  actions: [
    { id: 'test_100_noop', label: '💧 수분 100% 무반응 검증' },
    { id: 'test_dry_soil', label: '🏜️ 메마른 토양(15% 균열)' },
    { id: 'test_firefly_sound', label: '✨ 밤하늘 반딧불이 소리' },
    { id: 'skip_cooldown', label: '⚡ 3분 쿨다운 즉시 해제' },
    { id: 'sim_other_user', label: '👥 타인 물주기 연출' },
    { id: 'test_wither', label: '🍂 시듦(0%) 모달 호출', danger: true }
  ],
  // 3. 자동 QA 스모크 테스트 진단 규칙
  qaChecks: [
    { id: 'no_pixel_text', desc: '픽셀(px) 수치 비노출 여부', check: () => !document.body.innerText.includes('px') },
    { id: 'has_growth_badge', desc: '머문 시간 옆 나무 성장률(%) 표시', check: () => !!document.getElementById('tree-growth-rate') },
    { id: 'noop_at_100', desc: '수분 100% 시 물주기 무반응 작동', check: () => window.__test100NoOpPassed === true },
    { id: 'chat_toggle_ok', desc: '채팅 ON/OFF 토글 정상 작동', check: () => !!document.getElementById('chat-toggle-btn') }
  ]
};
```
- **장점**: 나중에 새로운 MVP(예: `별자리 관찰 사이트`, `비 오는 창가 사이트`)를 만들 때도 `developermode.html` 코드는 **단 한 글자도 수정할 필요가 없습니다.** 새 MVP 파일 안에 `window.AFK_DEV_CONFIG`만 적어두면 개발자 포털이 알아서 맞춤 슬라이더와 QA 체크리스트를 그려줍니다.

---

### 1.3 핵심 기술 2: `server.js`의 `/mvp` 디렉토리 자동 스캔 API
`server.js`에 всего 15줄 내외의 API를 추가하여, `mvp/` 폴더에 있는 파일들을 자동으로 읽어오게 만듭니다.

```javascript
// 1. 개발자 포털 페이지 서빙 (검색엔진 색인 방지 헤더 포함)
app.get(['/developermode', '/developermode.html', '/dev'], (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'developermode.html'));
});

// 2. /mvp 폴더 내의 HTML 파일 목록 자동 스캔 API (관리 자동화)
app.get('/api/dev/mvps', (req, res) => {
  const mvpDir = path.join(__dirname, 'mvp');
  if (!fs.existsSync(mvpDir)) return res.json({ mvps: [] });
  const files = fs.readdirSync(mvpDir).filter(f => f.endsWith('.html'));
  res.json({
    mvps: files.map(filename => ({
      id: filename.replace('.html', ''),
      url: `/mvp/${filename}`,
      filename
    }))
  });
});
```
- 만약 서버 없이 로컬 파일이나 정적 호스팅으로 열었을 때는 자동으로 내장된 기본 MVP 레지스트리(`FALLBACK_MVP_LIST`)로 폴백(Fallback)하여 언제 어디서나 에러 없이 열립니다.

---

### 1.4 핵심 기술 3: 시간 배속기 (Time-Warp Engine) & 스냅샷 공유
1. **글로벌 타임 워프 (`1x`, `10x`, `60x`, `600x`)**:
   - 개발자 포털 상단에서 배속 버튼을 누르면, 아이프레임 내부의 타이머 틱(`1000ms`) 주기를 가속하거나 델타 타임(`dt * speedMultiplier`)을 곱해 **3분(180초) 쿨다운을 3초 만에 테스트**하거나 **하루(24시간) 태양·달의 일주운동을 24초 만에 감상**할 수 있습니다.
2. **스냅샷 북마크 & URL 공유 (`State Snapshotter`)**:
   - 테스트 도중 마음에 드는 색감이나 버그 상황을 발견하면 `[📸 스냅샷 저장]`을 눌러 브라우저 `localStorage`에 프리셋으로 저장하거나, `[🔗 상태 URL 복사]`를 눌러 쿼리스트링이 포함된 링크로 즉시 복원할 수 있습니다.

---

## 2. 제작 및 운영 시 발생 가능한 오류, 사전 예방책, 즉각 대처 프로토콜

관리가 쉬운 포털을 구축할 때 발생할 수 있는 **8가지 핵심 오류 시나리오**와 예방·대처 매뉴얼입니다.

| 번호 | 발생 가능한 오류 현상 | 근본 원인 (Root Cause) | 사전 예방 방법 (Prevention) | 오류 발생 시 대처 방법 (Recovery) |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **새 MVP 파일을 추가했는데 개발자 포털 목록에 안 뜨거나 경로 404 에러 발생** | 파일 경로 오타, 대소문자 불일치(Render Linux 서버는 대소문자 엄격 구분), 또는 서버 미실행 상태 | 파일명을 소문자 스네이크케이스(`garden_mvp.html`)로 통일하고, `/api/dev/mvps` 자동 스캔과 정적 `FALLBACK_MVP_LIST` 이중 안전망 적용 | 포털 상단 **`[🔄 MVP 목록 새로고침]`** 또는 **`[📂 로컬 HTML 파일 직접 열기(Drag & Drop)]`** 기능으로 서버 재시작 없이 즉시 로드하여 테스트 |
| **2** | **`file://` 로컬 더블클릭 실행 시 `iframe` 내부 접근 보안 에러 (`SecurityError: Blocked a frame with origin "null"`)** | 브라우저의 동일 출처 정책(SOP) 때문에 `file://`에서는 부모 창이 `iframe.contentWindow.document`를 직접 읽을 수 없음 | 부모 창에서 `iframe` DOM을 직접 참조하지 않고, 모든 출처에서 안전하게 동작하는 **[window.postMessage()](https://www.google.com/search?q=https%3A%2F%2Fdeveloper.mozilla.org%2Fen-US%2Fdocs%2FWeb%2FAPI%2FWindow%2FpostMessage) 비동기 메시지 프로토콜**만 사용 | `postMessage` 응답이 1초 내에 없으면 자동으로 **단일 페이지 내장 렌더러(In-Page Embedded Mode)**로 폴백하여 로컬에서도 100% 작동 보장 |
| **3** | **MVP 테스트 중 실수로 라이브 서버(`fire.html`)의 화력이나 접속자 수를 건드리는 현상** | MVP 내부에 라이브 `io()` 연결 코드가 활성화된 채로 로드됨 | `developermode.html`이 MVP 로드 시 URL에 `?devmode=1&mockSocket=1` 파라미터를 자동 부여하여, MVP가 이를 감지하면 무조건 `MockSocket`으로만 작동하게 강제 | 상단 상태 표시줄에 **`[🟢 SANDBOX ISOLATED (실서버 연결 차단됨)]`** 배지를 상시 표시하고, 실서버 패킷 감지 시 즉시 소켓 `disconnect()` 강제 호출 |
| **4** | **MVP를 여러 번 전환하거나 배속(`60x`) 테스트를 돌린 후 브라우저가 느려지거나 소리가 겹침** | 이전 MVP의 `setInterval`, `requestAnimationFrame`, `AudioContext` 오실레이터가 메모리에 남음 | `iframe` 기반 아키텍처를 사용하여 MVP 전환 시 `iframe.src = 'about:blank'` 후 교체함으로써 브라우저가 이전 윈도우의 **모든 타이머·오디오·DOM 메모리를 100% 자동 가비지 컬렉션(GC)**하도록 설계 | 상단 툴바의 **`[🧹 샌드박스 강제 재부팅 (Hard Reload)]`** 버튼 클릭 시 아이프레임 컨테이너를 완전히 파괴 후 재생성 |
| **5** | **수분 100% 무반응 테스트나 픽셀 비노출 규칙이 코드 수정 후 깨졌는데 개발자가 눈치채지 못함** | UI를 수정하다가 실수로 `px` 텍스트를 다시 넣거나 `moisture >= 100` 가드 조건을 지움 | 우측 인스펙터의 **`[✅ 자동 QA 진단기 (Auto-QA)]`**가 상태 변경 시마다 실시간으로 DOM 텍스트와 버튼 반응 여부를 검사 | 위반 사항 발생 시 상단 QA 배지가 즉시 **`🔴 FAIL (픽셀 텍스트 검출됨 / 100% 무반응 실패)`**로 바뀌며 원인 위치를 하이라이트 |
| **6** | **모바일(아이폰/안드로이드)에서 개발자 포털 접속 시 조작 패널이 화면을 다 가려서 나무가 안 보임** | 데스크톱용 3단 레이아웃이 좁은 모바일 화면을 압도함 | 반응형 브레이크포인트(`768px`) 적용 및 **`[👁️ 순수 화면만 보기 (Zen Mode, 단축키 H)]`** 토글 버튼을 제공하여 클릭 한 번에 모든 개발자 툴바를 숨김/표시 | 모바일에서는 인스펙터 패널이 하단 슬라이드업 바텀 시트(Bottom Sheet)로 동작하여 정원 시야를 85% 이상 확보 |
| **7** | **시간 배속(`60x`) 실행 중 비·눈·반딧불이 파티클이 화면 밖으로 튕겨 나가는 물리 오류** | 프레임 델타 타임(`dt`)에 큰 배속을 곱할 때 한 프레임 이동량이 캔버스 크기(`210px`)를 초과함 | **시간(시계·쿨다운·일차) 배속**과 **캔버스 물리 파티클 프레임 속도**를 분리(Decoupling). 시계와 쿨다운만 빠르게 감고 비·눈·반딧불이는 부드러운 `30fps` 정속 유지 | 파티클 좌표가 `< 0` 또는 `> canvas.height`를 벗어나면 즉시 모듈로(`%`) 연산으로 화면 안쪽으로 래핑(Wrapping) 복구 |
| **8** | **일반 방문자가 `/developermode.html`에 접속하여 미공개 차기작을 스포일러 당하는 문제** | 공개 URL이므로 주소를 추측해 들어오거나 검색엔진 로봇이 수집함 | `server.js`에서 `X-Robots-Tag: noindex, nofollow` 헤더 전송 + 클라이언트 측 **간편 개발자 PIN 잠금(기본값 `2026`, `localStorage`에 1회 인증 시 영구 기억)** 적용 | 비인가 접근 시 깔끔한 `AFK Developer Gate` 모달이 뜨며 `[메인 허브로 돌아가기]` 버튼으로 안내 |

---

## 3. 전 기기 최적화 및 초경량 성능 설계 (Optimization Plan)

1. **`iframe` 프로세스 격리 & 오프스크린 캔버스 캐싱 (`treeCacheCanvas`)**:
   - 가장 무거운 연산인 **첨부 이미지 기반 4단계 명암의 풍성한 도트 거목 + 토양 균열/잔디 렌더링**은 성장률이나 계절·태양 방향이 바뀔 때만 오프스크린 버퍼에 1회 다시 그립니다.
   - 개발자 포털의 UI(슬라이더, 로그 창, FPS 미터)는 호스트 DOM에서 돌아가고, MVP 캔버스는 격리된 레이어에서 `30fps` 캡으로 돌아가므로 저사양 노트북이나 스마트폰에서도 발열이 발생하지 않습니다.
2. **가상 소켓 이벤트 로그의 고정 크기 링 버퍼 (Ring Buffer)**:
   - 송수신 패킷(`water_plant`, `garden_tick`, `firefly_chime`, `IGNORED_100%_NOOP`) 로그는 최신 **40개**만 메모리에 유지하고 이전 DOM 노드는 즉시 삭제하여 하루 종일 켜두어도 메모리 누수(Memory Leak)가 `0MB`에 수렴합니다.
3. **비활성 탭 자동 일시정지 (`Page Visibility API`)**:
   - 개발자가 코드를 수정하러 안티그래비티 IDE 창으로 포커스를 옮기거나 다른 탭을 볼 때(`document.hidden === true`), 포털의 렌더링 루프와 반딧불이 오디오 합성을 즉시 일시 정지하여 개발 PC의 CPU/배터리 자원을 아껴줍니다.

---

## 4. `developermode.html` 핵심 기능 구성표 (한눈에 보기)

| 영역 | 주요 기능 | 관리 및 사용 편의성 포인트 |
| :--- | :--- | :--- |
| **상단 마스터 바** | • 프로젝트 스위처 (`세상에서 가장 느린 정원 v2.0` / `불꽃 테스트베드` / `+ 로컬 파일 열기`)<br>• 뷰포트 프리셋 (`Desktop 100%` / `iPhone 390×844` / `Tablet 768×1024`)<br>• 타임 워프 배속기 (`1x` / `10x` / `60x`) & `[👁️ Zen Mode (패널 숨기기)]` | 단축키 지원 및 원클릭 해상도/배속 전환 |
| **중앙 샌드박스 뷰** | • 현재 선택된 MVP 실행 화면 (`🏠 허브`, `⏳ 머문 시간`, `🌱 나무 성장률 %`, `DAY 1~30`, `N명 시청 중`, `💬 채팅 ON/OFF`, `💧 3분 물주기`) | 픽셀(`px`) 표기 완전 제거, 수분 100% 무반응, 실시간 태양·달·비·눈·반딧불이 소리 완벽 작동 |
| **우측 탭 1: 🛠️ 컨트롤러** | • `AFK_DEV_CONFIG` 스키마 기반 자동 생성 슬라이더 (경과 일수, 토양 수분, 시간대, 계절, 날씨)<br>• 원클릭 프리셋 버튼 (`수분 100% 무반응`, `메마른 토양 균열`, `반딧불이 소리`, `쿨다운 스킵`) | 새 MVP 추가 시 JSON 설정만 적으면 UI 자동 생성 |
| **우측 탭 2: ✅ 자동 QA & 스냅샷** | • 핵심 요구사항 6개 항목 실시간 자동 검증 (`PASS` / `FAIL` 배지)<br>• 현재 상태 프리셋 저장(`localStorage`) 및 `[🔗 상태 재현 URL 복사]` | 수동으로 일일이 확인하지 않아도 요구사항 누락 여부를 0.1초 만에 자동 진단 |
| **우측 탭 3: 📡 가상 소켓 로그** | • `MockSocket` 실시간 송수신 패킷 뷰어 및 `[🧹 로그 비우기]` / `[🔄 하드 리셋]` | 서버 연결 없이도 소켓 이벤트 흐름을 눈으로 디버깅 가능 |
