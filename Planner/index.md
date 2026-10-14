# 🎮 AFK - 웹 프로젝트 허브 포털 기획 및 명세서

> **AFK 인터랙티브 웹 토이 & 실시간 서비스 통합 포털**  
> GitHub Pages 및 Node.js 실시간 환경을 모두 완벽 지원하는 W3C 웹 표준 허브

---

## 1. 프로젝트 구조 (GitHub Pages 호환 구조)

GitHub Pages는 레포지토리 최상단 루트(`/`)의 `index.html`을 기본 진입점으로 읽습니다. 이에 맞춰 모든 웹 리소스가 최상단에 배치되었습니다:

```text
Project HTML/
├── index.html          <-- [최상단 루트] AFK 메인 포털 허브 (GitHub Pages 진입점)
├── fire.html           <-- [최상단 루트] Keep the Fire Alive (장작불 서비스)
├── css/
│   ├── portal.css      <-- AFK 포털 전용 스타일
│   └── style.css       <-- 장작불 서비스 전용 픽셀 ASMR 스타일
├── js/
│   ├── audio.js        <-- Web Audio 절차적 ASMR 오디오 합성 엔진
│   ├── canvas.js       <-- 픽셀 캔버스 렌더링 및 파티클 엔진
│   ├── chat.js         <-- 실시간 채팅 및 XSS 방어
│   └── main.js         <-- 소켓 오케스트레이션 및 체류 시간 타이머
├── server.js           <-- 로컬 및 클라우드 소켓 백엔드
├── data/               <-- 영속 데이터 스냅샷
└── Planner/            <-- 기획 및 기술 명세서
```

---

## 2. 프로젝트 쇼케이스 라인업

- **01. Keep the Fire Alive (LIVE 🔥)**:
  - 전 세계가 함께 돌보는 하나의 실시간 장작불 & 힐링 공간.
  - 픽셀 불꽃, 파티클 연출, Web Audio 타닥거림 ASMR, 실시간 채팅 지원.
- **02. Next Project (Coming Soon ✨)**:
  - 향후 추가될 차기 인터랙티브 웹 프로젝트 슬롯.
