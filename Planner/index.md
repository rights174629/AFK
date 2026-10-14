# 🎮 AFK - 웹 프로젝트 허브 포털 기획 및 명세서

> **Neal.fun 감성의 인터랙티브 웹 토이 & 실시간 서비스 통합 포털**  
> W3C 공식 HTML5 규격 및 웹 접근성(a11y) 표준을 완벽 준수하여 제작된 허브 페이지

---

## 1. 개요 및 디자인 철학

1. **Neal.fun 감성의 비주얼**:
   - 상단 볼드 타이포그래피 (`AFK 🔥`) + 귀여운 애니메이션 아이콘.
   - 키치하고 위트 있는 장식 소품 (🎃 호박, 🪴 화초).
   - 굵고 선명한 블랙 아웃라인(`border: 2.5px solid #18181b`)과 둥근 모서리(`border-radius: 20px`).
2. **2열 반응형 그리드 쇼케이스**:
   - 가로형 직사각형 카드 (2.1 : 1 종횡비).
   - 마우스 호버 시 경쾌하게 살짝 떠오르는 부드러운 인터랙션 (`transform: translateY(-5px) scale(1.012)` + 소프트 섀도우).
3. **W3C 공식 HTML5 표준 명세 준수**:
   - 시맨틱 마크업: `<header role="banner">`, `<main role="main">`, `<section aria-label="...">`, `<article>`, `<footer role="contentinfo">`.
   - 메타 태그 완비: `charset="UTF-8"`, `viewport`, `theme-color`, `description`, `keywords`, `OpenGraph (og:title, og:image 등)`.
   - 접근성(a11y): 스크린 리더용 레이블(`aria-label`), 키보드 포커스(`:focus-visible`), 의미 없는 장식 요소의 `aria-hidden="true"`.

---

## 2. 프로젝트 쇼케이스 라인업

| 카드 번호 | 프로젝트 명 | 상태 | 링크 | 테마 및 비주얼 설명 |
| :---: | :--- | :---: | :---: | :--- |
| **01** | **Keep the Fire Alive** | **LIVE 🔥** | `/fire.html` | 밤하늘 픽셀 아트, 일렁이는 불꽃, 실시간 멀티플레이어 뱃지 |
| **02** | **Wiki Spy** | 준비 중 | `#` | 아이보리 클래식 배경, 돋보기, 선글라스, 레트로 타자기 |
| **03** | **Cursor Camp** | 준비 중 | `#` | 연두빛 잔디밭, 동글동글 튜브와 흰색 커서 화살표들 |
| **04** | **Infinite Craft** | 준비 중 | `#` | 미니멀 화이트, 원소 조합 버블 (`Lava` + `Water`) |
| **05** | **Sandboxels** | 준비 중 | `#` | 밤하늘 별빛과 픽셀 모래/용암 시뮬레이터 테마 |
| **06** | **The Password Game** | 준비 중 | `#` | 살구빛 배경과 클래식 붉은 테두리 인풋 박스 |
| **07** | **Spend Elon's Money** | 준비 중 | `#` | 비즈니스 일러스트, 슈퍼카, 요트, 초록색 뱃지 |
| **08** | **Space Elevator** | 준비 중 | `#` | 산뜻한 블루 모눈종이(블루프린트), 귀여운 우주인과 엘리베이터 |
| **09** | **Stimulation Clicker**| 준비 중 | `#` | 핫핑크 그라디언트, 네온 DVD 로고와 마우스 커서들 |
| **10** | **Internet Artifacts** | 준비 중 | `#` | 고문서 양피지 베이지와 클래식 세리프 타이포 |

---

## 3. 라우팅 구조

- `http://localhost:3000/` : 포털 허브 메인 (`public/index.html`)
- `http://localhost:3000/fire.html` : 실시간 장작불 서비스 (`public/fire.html`)
- 상단 `🏠 허브` 버튼을 통해 어디서든 자유롭게 포털과 장작불 페이지를 상호 이동 가능
