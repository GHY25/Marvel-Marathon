# Marvel Marathon — Codex 구현 명세서 (MVP v1.0)

> **문서 목적:** 이 파일을 Codex에 제공하여 기존 GitHub Electron 템플릿 위에 **실제로 실행·저장·패키징 가능한 개인용 MCU 정주행 기록 앱**을 설계하고 구현하도록 한다. 단순한 UI 시안이나 정적 목업이 아니라, 기능이 작동하는 MVP가 목표다.
>
> **작성 기준일:** 2026-11-05 (Asia/Seoul)
> **기반 저장소:** https://github.com/Road-Glide/electron-vite-react-ts (기본 브랜치 `master`; 실제 작업 시작 시 현재 클론 상태 재확인)
> **주 사용자:** 한국어 UI를 쓰는 개인 사용자 / Windows 데스크톱 우선 / macOS·Linux는 가능하면 호환
> **개발 우선순위:** ① 데이터 정확성·안전성 ② 핵심 동작 완성 ③ 사용성·디자인 ④ 부가 기능

---

## 0. Codex에게 전달할 최상위 실행 지시

**이 문서 전체를 먼저 읽고**, 다음 원칙을 따라 현재 작업 디렉터리의 코드를 분석·수정·테스트하여 MVP를 완성한다.

1. **실제 코드를 먼저 조사한다.** 이 문서가 참고한 템플릿 구조는 2026-11-05 기준이다. `package.json`, `electron/main.ts`, `electron/preload.ts`, `electron/ipc.ts`, `src/renderer/App.tsx`, `src/types/renderer.d.ts`, `electron.vite.config.ts`, `tsconfig*`를 열어 현재 상태와 차이를 확인한다. 이미 구현된 기능과 기존 변경사항을 덮어쓰지 않는다.
2. **기존 보안·창 관리 기능을 보존한다.** 창 크기·위치 복원, 로깅, 환경별 시작 방식, 외부 링크 처리, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` 등을 불필요하게 변경하지 않는다.
3. **분석만 하고 끝내지 않는다.** 구현 순서와 결정 사항을 짧게 정리한 후 실제 코드를 수정하고, 가능한 검증 명령과 수동 스모크 테스트를 수행한다. 사용자에게 중간 승인이나 세부 기술 선택 질문을 반복하지 않는다. 명세의 합리적 기본값을 사용한다.
4. **기능마다 실제 데이터와 연결한다.** 버튼, 메뉴, 필터, 저장·수정·삭제, 통계는 실제 동작해야 한다. 가짜 통계 수치, 하드코딩된 사용자 리뷰, 항상 성공하는 백업 버튼 등은 허용하지 않는다.
5. **MVP와 후속 기능을 구분한다.** 이 문서에서 `P0`로 표시된 항목을 우선 완료하고, `P1/P2` 확장 기능 때문에 필수 기능 구현을 늦추지 않는다.
6. **패키징을 고려한다.** TypeScript 빌드가 통과하는 것만으로 완료로 선언하지 않는다. Electron 개발 실행, 앱 종료·재실행 시 데이터 영속성, 가능한 운영체제에서 패키지 실행을 확인한다.
7. **실행 환경 한계를 투명하게 보고한다.** 패키지 다운로드/GUI 실행/OS 패키징을 수행할 수 없는 경우, 어떤 테스트를 실제 실행했고 어떤 검증이 남았는지 구체적으로 기록한다. 실행하지 않은 테스트를 성공했다고 주장하지 않는다.
8. **완료 보고는 한국어로 작성한다.** 구현된 기능, 주요 변경 파일, 설치 및 실행 방법, 테스트 결과, 남은 문제, 향후 확장 항목을 명시한다.
9. **사용자 데이터 보존이 최우선이다.** DB 초기화, 마이그레이션, 백업 복원, 패키지 업데이트 시 사용자의 감상 기록이 삭제되지 않도록 한다. 데이터 전체 삭제나 복원 덮어쓰기는 반드시 확인 후 실행한다.
10. **외부 권한과 키 없이 작동하는 MVP를 우선 만든다.** TMDB API 키, 마블 로고나 영화 포스터 파일, 계정·클라우드 서버가 없어도 기본 기능이 완전하게 작동해야 한다.

### 기대 산출물

- 변경된 실제 앱 소스코드 및 의존성·빌드 설정
- 영화 초기 데이터(이 문서 §9의 MCU 영화 38편)
- 로컬 데이터 저장·마이그레이션·백업/복원 구현
- 기능 테스트와 주요 데이터 규칙 테스트
- 프로젝트 `README.md`의 실행/사용/백업 안내 업데이트
- 구현 결과 및 남은 한계에 대한 간단한 한국어 결과 보고

---

## 1. 프로젝트 정의

### 1.1 제품 개요

**Marvel Marathon**은 마블 시네마틱 유니버스(MCU) 극장 영화를 **개봉 순서대로 다시 감상**하는 개인 사용자를 위한 데스크톱 기록 앱이다. 사용자는 영화별 시청 이력, 별점, 한 줄 감상평을 저장하고 자신만의 정주행 진행 상황, 영화 랭킹, 평가 변화를 확인할 수 있다.

### 1.2 이 앱이 해결할 문제

- MCU 영화가 많아 어디까지 정주행했는지 기억하기 어렵다.
- 영화마다 매긴 별점과 한 줄평이 메모장·캘린더 등에 흩어진다.
- **첫 감상과 재감상 시 달라진 평가**를 비교하기 어렵다.
- 내 취향에 따른 MCU 영화 순위와 페이즈별 통계를 별도 계산 없이 보고 싶다.

### 1.3 제품 원칙

| 원칙 | 구체적인 적용 |
|---|---|
| 개인 중심 | 로그인·소셜 네트워크 불필요, 로컬 우선 |
| 오프라인 우선 | 네트워크 없이 영화 목록·기록·랭킹·통계 작동 |
| 재관람 우선 | 영화 1편에 감상 기록을 여러 개 연결 |
| 기록의 정확성 | 영화별 최신 평가와 개별 감상 이력을 구분 |
| 빠른 입력 | 영화 상세에서 날짜·별점·짧은 메모만으로 저장 |
| 데이터 소유권 | 백업 내보내기·가져오기 제공 |
| 차분한 몰입감 | 시네마틱 다크 테마, 카드 중심 레이아웃 |

### 1.4 대상 범위

- **포함:** MCU의 **이미 개봉한 극장 장편 영화** 38편(2026-11-05 기준), 페이즈 1~6, 각 영화의 여러 감상 기록.
- **제외:** 미개봉 예정 영화, 디즈니+ 오리지널 TV 시리즈, 애니메이션 시리즈, 마블 원작이지만 MCU 메인 영화 목록에 속하지 않는 작품, 영화 관람 플랫폼 연동.
- **정렬 기준:** 최초 버전은 **개봉 순서**(`releaseOrder`)만 공식 정주행 순서로 사용. 극중 시간순(chronological order)은 후속 확장.
- **화면 언어:** UI는 한국어. 영화 원제는 영문 원제 사용; 한국어 영화명은 검증된 경우에만 보조적으로 표시하는 확장 필드.
- **별점 범위:** 0.5~5.0점, 0.5점 단위. 별점을 아직 매기지 않은 감상 기록도 허용.
- **한 줄평 길이:** 최대 500자, 공백·줄바꿈 허용; 필수 입력 아님.
- **시청 날짜:** 사용자 로컬 날짜(`YYYY-MM-DD`); 미래 날짜는 기록할 수 없음.

### 1.5 개발 범위: P0 / P1 / P2

**P0 — 첫 구현에서 반드시 완성**

1. 기본 레이아웃, 사이드바, 전체 메뉴 이동.
2. MCU 영화 38편의 로컬 초기 목록·페이즈별 분류.
3. 영화 검색 및 시청 여부·페이즈 필터.
4. 영화 상세 페이지, 감상 기록 추가·수정·삭제.
5. 영화 1편에 여러 회차의 감상 기록(재관람) 저장.
6. 시청 진행률과 다음 미시청 영화 자동 계산.
7. 감상 기록 전체 조회(감상 일기).
8. 최신 유효 별점 기준의 내 영화 랭킹.
9. 핵심 통계(평균 별점, 페이즈별 시청 현황, 평점 분포 등).
10. 앱 종료 후 영속 저장, 예외 처리, 백업 내보내기·복원.
11. 실행·빌드·테스트, 사용 가능한 환경에서 패키징 스모크 테스트.

**P1 — P0 완료 후 여유가 있으면**

- 한국어 정식 영화명 보강, 사용자 지정 로컬 영화 커버 이미지, 평점 변화 그래프, 키보드 단축키, CSV 내보내기, 디자인 고도화.

**P2 — 이번 MVP에서 구현하지 않음**

- TMDB 자동 영화 검색/포스터 API, TV 시리즈 포함, 클라우드 동기화, 계정·친구 공유, 자동 영화 추천, AI 리뷰 분석, 푸시 알림, 외부 서비스 리뷰 연동, 앱 자동 업데이트.

---

## 2. 기술 및 기존 템플릿 분석 기준

### 2.1 기존 저장소에서 확인된 사실

- React 18 + TypeScript + electron-vite 기반 템플릿.
- 저장소 기본 구조:
  - `electron/main.ts`: 창 생성, 창 상태 저장 및 복원, Electron 생명주기.
  - `electron/preload.ts`: `contextBridge`를 통해 `window.electronAPI` 공개.
  - `electron/ipc.ts`: IPC 채널 상수와 핸들러. 초기에는 `app:open-external` 기능.
  - `src/renderer/App.tsx`: Vite/React 기본 데모 화면(교체 대상).
  - `src/renderer/main.tsx`: React 엔트리(최소 변경).
  - `src/types/renderer.d.ts`: `window.electronAPI` TypeScript 선언.
  - `src/styles/`: CSS 기반 스타일.
  - `electron.vite.config.ts`, `tsconfig.*`, `package.json`.
- `package.json`의 기본 명령: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`, `npm run format`, `npm run release`.
- `npm run build`는 TypeScript 프로젝트 빌드와 `electron-vite build`를 수행한다.
- `npm run release`는 `electron-builder`로 배포 패키징한다.
- 저장소 README 권장 환경은 Node.js **20.x 또는 22.x**, npm이다.
- 기존 창 설정은 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`이다.
- 템플릿은 브라우저에 raw `ipcRenderer`를 공개하지 않고 `window.electronAPI`만 노출한다.

참고: https://github.com/Road-Glide/electron-vite-react-ts

### 2.2 추가 의존성 결정 지침

권장 방향(무조건 고정하라는 뜻은 아님):

| 기능 | 권장 선택 | 비고 |
|---|---|---|
| 스타일 | 기존 CSS/CSS Modules 또는 Tailwind | 기존 템플릿의 빌드 안정성 우선. Tailwind 선택 시 올바른 버전 구성 |
| 라우팅 | `react-router-dom`의 `HashRouter` 또는 경량 자체 상태 라우터 | `file://`로 패키지 실행 시 새로고침이 깨지지 않아야 함 |
| 아이콘 | `lucide-react` | 경량 공통 아이콘 |
| 데이터베이스 | **SQLite**, 우선 `better-sqlite3` 검토 | Electron 네이티브 모듈 재빌드/패키징 확인 필수 |
| 런타임 검증 | `zod` 또는 동등한 검증 | UI 검증만으로 충분하지 않음; main IPC 입력 재검증 |
| 단위 테스트 | `vitest` | 기존 스크립트에 추가 |
| UI 통계 | CSS 기반 막대그래프 우선 | 작은 MVP에는 차트 라이브러리 없이도 충분함 |
| 상태 관리 | React Hooks + Context 또는 가벼운 query pattern | 거대한 전역 상태 프레임워크 도입 불필요 |

**SQLite 주의:** `better-sqlite3`는 네이티브 모듈이므로 사용 시 Electron 런타임 버전에 맞춘 빌드가 필요하다. `electron-builder install-app-deps`/재빌드, ASAR 내 모듈 위치, 배포본 로딩을 실험해야 한다. 개발 환경/패키징 환경에서 안정적으로 동작하지 않으면, **데이터 접근 계층 인터페이스를 유지**하면서 호환 가능한 SQLite 구현으로 대체하고 선택 이유를 문서화한다. 검증하지 않은 네이티브 패키징을 성공으로 보고하지 않는다.

**중요:** SQLite를 쓰든 대체 구현을 쓰든 **Renderer에서 Node `fs`나 DB 파일을 직접 열지 않는다.** 파일 I/O와 DB는 Electron Main 프로세스에서 처리한다.

### 2.3 앱 기본 메타데이터

- `package.json`의 `name`: `marvel-marathon`처럼 npm-safe한 이름으로 변경.
- 표시 제품명: `Marvel Marathon`.
- 적절한 고유 `appId` 지정(예: `dev.personal.marvelmarathon`; 배포 전 본인 도메인/식별자로 교체 가능).
- 버전 `0.1.0`부터 시작.
- 기존 템플릿 MIT 라이선스와 원저작권 표시는 유지.
- **공식 Marvel 로고·영화 포스터를 허락 없이 리포지토리/배포 패키지에 포함하지 않는다.** 1차 버전은 제목·페이즈·컬러 기반의 창작 커버 카드 사용. 비공식 개인 팬 프로젝트임을 설정/README에 명시.

---

## 3. 정보 구조(IA)와 내비게이션

### 3.1 메뉴 구조

```text
Marvel Marathon
├─ 대시보드 (Dashboard)             /dashboard
├─ 영화 목록 (Movies)              /movies
│   └─ 영화 상세 (Movie Detail)    /movies/:movieId
├─ 감상 일기 (Diary)                /diary
├─ 나의 랭킹 (Ranking)              /ranking
├─ 통계 (Statistics)                /statistics
└─ 설정 (Settings)                 /settings
```

- 최초 앱 진입 시 `/dashboard`.
- 왼쪽 고정 사이드바 폭 약 220~240px.
- 상단 영역에 현재 페이지 제목과 보조 설명.
- 주 콘텐츠 최대 너비 약 1280px, 내측 여백 24~32px.
- 데스크톱 최적화 기준 1200×800. 창을 줄여도 가로 스크롤을 강요하지 않도록 반응형 그리드 사용.
- 앱 내부 이동은 `HashRouter` 권장(`/#/movies/mcu-001` 등). 필요하면 기존 파일 로딩과의 호환성 확인.
- 영화 카드 클릭 → 상세, 뒤로 가기 및 브라우저/앱 내 기록 이동 정상 동작.

### 3.2 전체 공통 레이아웃

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Marvel Marathon   │ 페이지 제목                      (설정/보조동작)│
├───────────────────┼──────────────────────────────────────────────────┤
│ Dashboard         │                                                  │
│ Movies            │              선택된 페이지 콘텐츠                │
│ Diary             │                                                  │
│ My Ranking        │                                                  │
│ Statistics        │                                                  │
│ Settings          │                                                  │
│                   │                                                  │
│ Unofficial Fan App│                                                  │
└───────────────────┴──────────────────────────────────────────────────┘
```

### 3.3 공통 UI 상태 규칙

각 조회 화면은 반드시 다음 상태를 고려한다.

1. **Loading**: 로컬 DB 초기 로딩 중 Skeleton 또는 간단한 인디케이터.
2. **Success with data**: 정상 정보 표시.
3. **Empty**: 아직 감상 기록이 없음 / 검색 결과 0건 등을 구체적 문구로 안내.
4. **Error**: DB/IPC 오류는 짧고 이해 가능한 메시지 + 재시도 제공.
5. **Mutation feedback**: 저장·수정·삭제 성공 시 즉시 화면 갱신 및 Toast/인라인 피드백.
6. **Confirmation**: 삭제 및 백업 덮어쓰기는 사전 확인.

UI의 가짜 통계, 비활성인데 클릭 가능한 버튼, 구현되지 않은 메뉴 링크는 두지 않는다.

---

## 4. 페이지별 상세 화면·행동 명세

### 4.1 대시보드 `/dashboard` [P0]

**목표:** 앱을 켜자마자 '얼마나 봤는지 / 다음에 무엇을 볼지 / 최근 무엇을 기록했는지' 파악.

**UI 구성(상단부터):**

1. 타이틀: `MY MCU JOURNEY` / 보조 문구: `나만의 MCU 정주행 기록`.
2. **진행률 카드:** `시청 완료 영화 수 / 총 영화 수`, 진행률 %와 Progress Bar. 영화 '수'는 감상 횟수가 아니라 고유 영화 수.
3. KPI 카드: `시청한 영화 N편`, `총 감상 N회`, `나의 평균 별점 X.X / 5`, `재관람 N회`.
4. **다음 감상 영화:** 개봉 순서에서 감상 기록이 0개인 가장 앞의 영화. 제목, 연도, Phase, `영화 보기` 상세 링크.
5. **최근 기록:** 감상 날짜 기준 최신 5건. 영화 제목, 날짜, 별점(없으면 `평점 미등록`), 한 줄평 일부.
6. **페이즈별 진행률:** Phase 1~6 각각 완료/전체 진행 바(간결한 형태).

**처리 규칙:**

- 영화별 감상 기록이 하나라도 있으면 '시청 완료'.
- 모든 영화에 기록이 있으면 다음 영화 대신 `현재 등록된 MCU 영화를 모두 감상했어요!` 표시.
- 기록이 전혀 없으면 평균 별점 `—` 및 `첫 감상 기록 남기기` CTA.
- 백업을 복원하거나 기록을 삭제하면 KPI가 자동 재계산되어야 함.
- 통계 계산 정의는 §8을 따름(각 화면에서 서로 다른 방식으로 재계산하지 않음).

### 4.2 영화 목록 `/movies` [P0]

**목표:** 개봉 순서대로 MCU 영화를 훑어보고, 즉시 찾거나 감상한 영화를 확인.

**UI 구성:**

- `영화 검색` 텍스트 입력: 영문 영화 원제, 확인된 한국어 제목(존재 시) 부분 일치. 대소문자 무시, 공백 Trim.
- 페이즈 필터: `전체 / Phase 1 / ... / Phase 6` (단일 선택).
- 감상 상태 필터: `전체 / 시청 완료 / 미시청`.
- 정렬 기본값: `개봉 순서(오름차순)`; 다른 정렬은 P1로 연기해도 무방.
- 상단 결과 수: 예: `총 38편 중 6편 표시`.
- 영화 카드 Grid: 창 너비에 따라 2~5열, 카드 최소 너비 약 175~200px.
- 카드 요소: 커버 자리(창작 그래픽), 영문 영화명, 개봉 연도, Phase, 시청 상태 배지, 최근 평점(있다면), 감상 횟수.
- 영화 카드 전체 클릭 시 영화 상세로 이동.

**동작 규칙:**

- 검색과 필터는 **교집합**으로 적용.
- 감상 기록이 없는 영화는 '미시청'. 감상 기록은 있으나 별점이 없어도 '시청 완료'.
- 결과 0개면 `조건에 맞는 영화가 없습니다`와 필터 초기화 버튼 제공.
- 일부 영화에 한국어 공식 제목이 없더라도 영문 제목 검색은 항상 작동.
- 영화 목록은 앱에 번들된 고정 seed 기반. 외부 인터넷 조회를 필수로 만들지 말 것.

### 4.3 영화 상세 `/movies/:movieId` [P0]

**목표:** 한 영화의 기본 정보, 나의 평가, 전체 재관람 이력을 한눈에 보고 편집.

**UI 구성:**

- 상단 뒤로 가기 `← 영화 목록`.
- 대표 커버(창작 그래픽), 영화 원제, 연도, Phase, `MCU 개봉 #N`.
- 요약: `감상 N회`, `최근 감상일`, `현재 나의 별점`.
- 주요 CTA: **`+ 감상 기록 추가`**.
- 감상 기록 카드 목록: 최신 감상 날짜 우선(동일 날짜는 작성 최신순), 감상일, 별점, 500자 이내 감상평, `수정`, `삭제`.
- 평가 변화: 별점을 매긴 기록이 2개 이상이면 **날짜순 최근 두 유효 별점**의 차이를 `+0.5`, `-1.0`, `변화 없음`처럼 표시. 다른 회차의 별점이 비어 있으면 해당 회차는 비교에서 제외.
- 기록이 0개면 빈 상태 + CTA.
- 알 수 없는 `movieId`면 `영화를 찾을 수 없습니다` 화면과 목록 돌아가기.

**감상 추가/수정 폼 필드:**

| 필드 | 타입 | 기본값 | 검증 |
|---|---|---|---|
| 시청 날짜 | `date` | 사용자 로컬 오늘 | 유효한 ISO 달력 날짜, 미래 불가 |
| 별점 | 별 선택 / 0.5 단위 | 미선택(null) | null 또는 0.5~5.0의 0.5 배수 |
| 한 줄평 | textarea | 빈 문자열 | 최대 500자, 저장 시 양끝 공백 trim |

- 별점·리뷰 둘 다 비어 있어도 **시청 기록으로 저장 가능**. 이 경우 '시청 완료'지만 랭킹에는 포함하지 않음.
- `저장`: 메인 프로세스 검증 → DB에 영속 저장 → 해당 영화 상세 및 대시보드·랭킹·통계 갱신.
- `취소`: 데이터 저장하지 않고 폼 닫기.
- `수정`: 작성 시 폼에 원래 값을 불러와 수정하고 `updatedAt` 갱신.
- `삭제`: `이 감상 기록을 삭제할까요?` 확인 후 삭제. 마지막 기록 삭제 시 해당 영화는 '미시청'으로 돌아감.
- 같은 영화에 같은 날짜의 기록을 여러 건 저장하는 것을 허용한다(중복 검열 금지).
- 한 영화의 기록이 2회 이상이면 UI에서 `재관람`임을 표시. 별도 플래그는 저장할 필요 없음.

### 4.4 감상 일기 `/diary` [P0]

**목표:** 시간순으로 내가 본 모든 MCU 영화를 일기처럼 다시 보기.

- 각 항목: 영화 제목, Phase, 감상일, 별점 또는 미등록, 한 줄평, 상세로 이동 버튼.
- 정렬: `watchDate DESC`, 동률이면 `createdAt DESC`, 추가 동률은 `id DESC`.
- 검색: 영화 제목 기준 필터.
- 선택적 기본 필터: `전체 / 별점 있음 / 별점 없음`.
- 감상 기록 0건이면 `아직 감상 기록이 없습니다. 영화 목록에서 첫 기록을 남겨보세요.` + `영화 목록으로` 버튼.
- 기록 수정/삭제는 영화 상세에서 수행하게 해도 됨(일기 화면에 동일 편집 로직을 중복 작성하지 말 것).

### 4.5 나의 랭킹 `/ranking` [P0]

**목표:** 나만의 MCU 영화 순위표를 자동 완성.

- **영화별 최종 유효 별점**을 사용. 구체적으로 영화에 유효한 별점 기록이 여러 개 있으면 **감상 날짜가 가장 최신인 비-null 별점 기록** 하나를 현재 점수로 사용. 같은 감상일은 `createdAt`/`id`로 순서 결정.
- 한 영화가 여러 번 등장하지 않음. 평가받은 영화당 1행.
- 정렬: 점수 내림차순, 동점이면 `releaseOrder` 오름차순.
- 항목: 순위, 커버, 제목, 연도, Phase, 현재 점수, 마지막 유효 평가일, 총 감상 횟수.
- 별점이 없는 영화는 랭킹에서 제외하며 별도 안내 `아직 별점을 매긴 영화가 없습니다`.
- 선택적 상단 요약: 평가한 영화 수, 최고 평점 영화, 최저 평점 영화.
- **중요:** `마지막 감상 기록`에 평점이 비어 있어도, 이전 감상에서 매긴 최근 유효 별점이 있으면 랭킹에서 유지.

### 4.6 통계 `/statistics` [P0]

- 상단: 완료 영화 수/전체 수, 전체 감상 횟수, 평균 별점, 재관람 횟수.
- **페이즈별 진행률:** `Phase N 시청 완료 영화 수 / 해당 Phase 영화 수` 및 막대 표시.
- **페이즈별 평균 별점:** 해당 Phase의 영화별 현재 유효 점수 평균. 평가한 영화 0편이면 `—`.
- **별점 분포:** 영화별 현재 유효 점수 기준 0.5~5.0까지 10개 구간별 편수.
- **나의 최고 평가 TOP 5:** 랭킹 정렬을 재사용하여 최대 5편.
- 그래프는 1차 구현에서 접근성 있는 **CSS 막대그래프/표 형태**로 만들어도 충분하다. 무거운 차트 라이브러리가 반드시 필요한 것은 아니다.
- 각 지표 옆/툴팁에서 집계 기준을 사용자가 이해할 수 있도록 표시. 예: `평균 별점은 영화별 최신 유효 별점을 기준으로 계산`.

### 4.7 설정 `/settings` [P0]

- 앱 이름, 버전, `비공식 개인 팬 프로젝트` 안내.
- 데이터 저장 방식: `이 기기의 로컬 저장소에 보관됩니다`.
- `백업 내보내기 (.json)` → 운영체제 저장 대화상자 → 성공/취소/실패 피드백.
- `백업 가져오기 (.json)` → 파일 선택 → 파일 형식/데이터 검증 → **현재 기록 교체 경고 및 확인** → 안전하게 복원 → 전체 화면 데이터 새로고침.
- 유효하지 않은 파일을 가져왔을 때 기존 감상 기록이 **변경되지 않아야** 함.
- 현재 전체 감상 기록 수 및 앱에서 쓰는 영화 카탈로그 버전/편수 표시(선택).
- 이후 개발 항목으로 테마/언어 전환, 커버 이미지 관리, CSV 내보내기 추가 가능.

---
## 5. 핵심 사용자 플로우 및 예외 흐름

### 5.1 첫 실행 → 첫 영화 감상 기록

```text
앱 시작
  ↓
로컬 DB 없으면 DB/테이블 생성, 영화 38편 seed (기록 0건)
  ↓
대시보드 [0/38편 · 0% · 다음 감상: Iron Man]
  ↓
[영화 목록] → [Iron Man] 클릭
  ↓
[+ 감상 기록 추가]
  ↓
시청일(오늘 기본) + 별점 4.5 + 리뷰 입력
  ↓
[저장] → main IPC 검증 → DB INSERT
  ↓
영화 상세에 기록 1건 등장
  ↓
대시보드 [1/38편], 목록 '시청 완료', 랭킹에 Iron Man 등장
```

**수용 기준:** 등록한 데이터가 앱을 닫았다 다시 열어도 그대로 유지되어야 한다.

### 5.2 동일 영화 재관람

```text
Iron Man 상세 (기존 4.0점 기록 1건)
  ↓
[+ 감상 기록 추가] → 다른 날짜, 별점 4.5점 저장
  ↓
총 감상 2회 / 진행률은 여전히 1편 완료
  ↓
현재 영화 평점은 4.5 / 평가 변화 +0.5 / 재관람 횟수 +1
  ↓
기록 2건이 날짜별로 각각 유지(이전 리뷰 덮어쓰기 금지)
```

**수용 기준:** 동일 영화를 여러 번 봐도 **완료 영화 수는 1**, **총 감상 횟수는 누적**, **재관람 횟수는 첫 회를 제외한 추가 회차 수**다.

### 5.3 수정·삭제

- 감상 기록 수정: 상세 → `수정` → 기존 값 수정 → 저장 → 날짜순 재정렬 및 모든 관련 통계 갱신.
- 감상 기록 삭제: 상세 → `삭제` → 확인 → 행 삭제 → 관련 통계 갱신.
- 수정/삭제 시 오직 해당 entry ID만 변경·삭제. 같은 영화의 다른 감상 이력은 보존.
- 마지막 기록 삭제 시 영화는 다시 미시청이 되고, 대시보드 '다음 감상 영화'가 자동 바뀔 수 있음.
- 삭제 확인을 취소하면 어떤 변경도 발생하지 않음.

### 5.4 검색·필터

```text
영화 목록에서 "iron" 검색
  ↓
Iron Man 관련 영화가 표시됨
  ↓
Phase 1 선택 + 미시청 선택
  ↓
세 조건을 모두 만족하는 영화만 표시
  ↓
필터 초기화 → 38편 전체 목록
```

### 5.5 백업 복원

```text
설정 → 백업 내보내기
  ↓
OS 저장 대화상자 → JSON 생성
  ↓
감상 기록 변경/추가
  ↓
설정 → 백업 가져오기 → 파일 선택
  ↓
파일 구조 검증 → "현재 기록을 교체합니다" 확인
  ↓
트랜잭션으로 복원 → 전체 조회 데이터 갱신
```

- 백업 파일이 잘못되었거나 취소했다면 기존 DB는 그대로 유지.
- 백업 데이터는 예전 작성 ID/시청 날짜/평점/리뷰를 정확히 복구.

---

## 6. 구현 아키텍처 및 폴더 제안

### 6.1 아키텍처

```text
┌────────────────────────────── Renderer (React) ───────────────────────────┐
│ DashboardPage / MoviesPage / MovieDetailPage / DiaryPage / RankingPage   │
│ StatisticsPage / SettingsPage                                             │
│                         │                                                │
│                 typed window.electronAPI                                 │
└─────────────────────────┼────────────────────────────────────────────────┘
                          │ only narrow, named IPC methods
┌─────────────────────────▼────── Electron Preload ────────────────────────┐
│ contextBridge; maps each typed method → approved ipcRenderer.invoke      │
└─────────────────────────┼────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼────── Electron Main ────────────────────────────┐
│ ipc handlers → validate sender and args → service/repository              │
│                                   │                                      │
│                         SQLite database / backup dialog                 │
└──────────────────────────────────────────────────────────────────────────┘
```

**원칙:**

- `main.ts`에는 앱 생성/생명주기, DB 초기화 및 핸들러 등록만 둔다.
- 도메인 비즈니스 로직은 작게 분리된 모듈에 배치한다.
- Renderer에는 DB 접근 코드나 사용자의 로컬 파일 시스템 경로를 노출하지 않는다.
- 기록 로딩은 초기 전체 목록 규모가 매우 작으므로 단순하게 해도 된다. 저장/수정/삭제 후에는 캐시 갱신이나 재조회가 반드시 이루어져야 한다.
- 통계 계산은 공통 **순수 함수**로 구현하여 페이지별 집계 기준이 달라지지 않도록 한다.

### 6.2 제안 파일 구조

아래는 **추천 구조**이며, 기존 repo 구성 및 실제 빌드 요구사항에 맞게 합리적으로 조정 가능하다. 기존 파일을 무조건 삭제·이동하지 않는다.

```text
project-root/
├─ electron/
│  ├─ main.ts                   # 기존 창 생성/생명주기; DB 초기화 및 등록 연결
│  ├─ preload.ts                # 기존 contextBridge에 앱 API 추가
│  ├─ ipc.ts                    # 기존 external link IPC 유지
│  ├─ ipc-marathon.ts           # 새 IPC 핸들러 등록/인자 검증
│  ├─ db/
│  │  ├─ connection.ts         # DB 생성 및 닫기, pragma, app.getPath('userData')
│  │  ├─ migrations.ts         # 스키마 버전 및 트랜잭션 마이그레이션
│  │  ├─ movie-seed.ts         # 38편 고정 카탈로그
│  │  ├─ movie-repository.ts   # 영화 조회
│  │  └─ entry-repository.ts   # 감상 기록 CRUD
│  └─ services/
│     └─ backup-service.ts     # 내보내기/검증/복원/대화상자
├─ src/
│  ├─ shared/
│  │  ├─ types.ts              # IPC 경계의 직렬화 가능한 DTO
│  │  ├─ schemas.ts            # 런타임 입력 검증(또는 main에서 검증)
│  │  └─ statistics.ts         # 순수 통계·랭킹 함수
│  ├─ renderer/
│  │  ├─ main.tsx
│  │  ├─ App.tsx               # Router/AppShell
│  │  ├─ components/
│  │  │  ├─ AppSidebar.tsx
│  │  │  ├─ MovieCard.tsx
│  │  │  ├─ MovieCover.tsx
│  │  │  ├─ RatingInput.tsx
│  │  │  ├─ WatchEntryForm.tsx
│  │  │  ├─ WatchEntryCard.tsx
│  │  │  ├─ StatCard.tsx
│  │  │  ├─ PhaseProgress.tsx
│  │  │  ├─ EmptyState.tsx
│  │  │  └─ ConfirmDialog.tsx
│  │  ├─ pages/
│  │  │  ├─ DashboardPage.tsx
│  │  │  ├─ MoviesPage.tsx
│  │  │  ├─ MovieDetailPage.tsx
│  │  │  ├─ DiaryPage.tsx
│  │  │  ├─ RankingPage.tsx
│  │  │  ├─ StatisticsPage.tsx
│  │  │  └─ SettingsPage.tsx
│  │  ├─ hooks/
│  │  │  └─ useMarathonData.ts
│  │  └─ utils/
│  │     └─ format.ts          # 날짜·별점·문구 표시
│  ├─ styles/
│  │  ├─ index.css            # 색상 토큰/글꼴/기본 스타일
│  │  └─ App.css              # 또는 컴포넌트 단위 CSS
│  └─ types/
│     └─ renderer.d.ts        # window.electronAPI 타입 확장
├─ tests/
│  ├─ seed.test.ts
│  ├─ statistics.test.ts
│  ├─ entries.test.ts
│  └─ backup.test.ts
├─ README.md                   # 현재 프로젝트 사용 설명으로 업데이트
└─ package.json
```

### 6.3 아키텍처 불변식(invariants)

- 모든 감상 기록은 존재하는 `movie.id`를 참조해야 한다.
- 영화 메타데이터와 사용자 감상 기록은 별도 테이블에 둔다.
- 사용자 데이터는 영화 seed 동기화 때 **절대 초기화하지 않는다**.
- `watched` 플래그를 DB에 중복 보관하지 않는다. 감상 기록 수로 계산한다.
- `latestRating`과 `averageRating`은 DB에 중복 보관하지 않는다. 필요할 때 계산한다.
- renderer↔main 간 데이터는 문자열·숫자·boolean·null·배열·평범한 객체로 직렬화 가능해야 한다.
- 도메인 로직/통계는 IPC나 React에 종속되지 않는 순수 함수로 시험 가능해야 한다.

---

## 7. 데이터 모델, SQLite 스키마, 트랜잭션

### 7.1 공유 TypeScript DTO (권장)

```ts
export type Saga = 'Infinity Saga' | 'Multiverse Saga';

export interface Movie {
  id: string;             // 'mcu-001' 등 고정 안정 ID
  titleEn: string;
  titleKo: string | null;  // 미검증 시 null
  releaseYear: number;
  phase: 1 | 2 | 3 | 4 | 5 | 6;
  saga: Saga;
  releaseOrder: number;   // 1..38, 중복 없음
}

export interface WatchEntry {
  id: string;                 // UUID
  movieId: string;            // Movie.id 외래키
  watchDate: string;          // 'YYYY-MM-DD' 로컬 달력 날짜
  ratingTicks: number | null; // 1..10, 1칸=0.5점; null=미평가
  review: string;             // 최대 500자, 빈 문자열 허용
  createdAtUtc: string;       // ISO 8601 UTC timestamp
  updatedAtUtc: string;       // ISO 8601 UTC timestamp
}

export type CreateWatchEntryInput = Pick<
  WatchEntry, 'movieId' | 'watchDate' | 'ratingTicks' | 'review'
>;

export type UpdateWatchEntryInput = Pick<
  WatchEntry, 'watchDate' | 'ratingTicks' | 'review'
>;

export type AppErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'STORAGE_ERROR'
  | 'BACKUP_ERROR'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string } };
```

**숫자 오차 방지:** DB는 별점 4.5를 직접 floating-point로 저장하기보다 `ratingTicks = 9`로 저장하며, 화면 표시 시 `ratingTicks / 2`로 변환한다. 예: `null`=미평가, `1`=0.5, `8`=4.0, `10`=5.0.

### 7.2 SQL 스키마 제안

아래는 필수 구조 예시다. 실제 SQLite 라이브러리에 맞게 prepared statement, transaction, migration을 구현한다.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS movies (
  id TEXT PRIMARY KEY,
  title_en TEXT NOT NULL,
  title_ko TEXT NULL,
  release_year INTEGER NOT NULL CHECK (release_year BETWEEN 1900 AND 2100),
  phase INTEGER NOT NULL CHECK (phase BETWEEN 1 AND 6),
  saga TEXT NOT NULL CHECK (saga IN ('Infinity Saga', 'Multiverse Saga')),
  release_order INTEGER NOT NULL UNIQUE CHECK (release_order > 0)
);

CREATE TABLE IF NOT EXISTS watch_entries (
  id TEXT PRIMARY KEY,
  movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE RESTRICT,
  watch_date TEXT NOT NULL,
  rating_ticks INTEGER NULL CHECK (
    rating_ticks IS NULL OR (rating_ticks BETWEEN 1 AND 10)
  ),
  review TEXT NOT NULL DEFAULT '',
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK (length(review) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_watch_entries_movie_date
  ON watch_entries(movie_id, watch_date DESC, created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_watch_entries_date
  ON watch_entries(watch_date DESC, created_at_utc DESC);
```

추가 데이터 무결성 검증(유효한 날짜, 미래 날짜, ISO timestamp, 외래키 존재)은 **main IPC 검증 및 repository 레벨**에서도 수행. SQL `CHECK`만으로 정확한 달력 날짜를 모두 검증할 수 있다고 가정하지 않는다.

### 7.3 DB 저장 위치 및 개발·제품 데이터 분리

- `app.getPath('userData')` 아래에 DB 저장.
- 개발 실행(`app.isPackaged === false`)과 배포 실행(`app.isPackaged === true`)은 **서로 다른 DB 파일**을 사용해 개발 테스트가 실제 데이터에 영향을 주지 않도록 한다.
  - 예: `marvel-marathon.development.sqlite3`
  - 예: `marvel-marathon.sqlite3`
- CI/단위 테스트는 항상 임시 디렉터리·메모리 DB 사용. 실제 `userData` 경로를 건드리지 않는다.
- `app.setName`/`appId` 변경 시 데이터 경로가 바뀔 수 있으므로 앱 이름을 정한 뒤 지속적으로 유지한다.
- DB 초기화는 Electron `app.whenReady()` 이후에 실행하고, 페이지가 데이터 요청하기 전에 준비 완료해야 한다.
- SQLite 사용 시 `PRAGMA foreign_keys=ON` 및 적절한 `journal_mode=WAL` 확인. 종료 시 정상 close.

### 7.4 초기 seed 및 마이그레이션

- 최초 DB 시작 시 스키마 생성 후 §9 카탈로그 38편을 **한 번의 트랜잭션**으로 삽입.
- 재실행 때 seed가 중복 삽입되지 않아야 한다(`id` 고정 + UPSERT).
- 카탈로그 갱신 시 영화 메타데이터 변경만 허용하며 `watch_entries`는 유지.
- 미래 영화 추가 시 기존 사용자의 기록/평점/영화 ID를 바꾸지 않는다.
- SQLite 스키마 버전은 `PRAGMA user_version`으로 관리(초기 버전 1).
- 마이그레이션 실패 시 오류를 표시하고 **파괴적 재초기화 금지**.
- Seed에 없는 영화 ID를 가진 백업은 임의 영화명으로 자동 삽입하지 말고, 명시적인 검증 오류 또는 별도 호환성 정책을 사용.

### 7.5 CRUD 트랜잭션 및 정렬

- Create: 유효 영화 ID 확인 → 검증 → `crypto.randomUUID()` ID 생성 → insert → 생성된 entry 반환.
- Update: 해당 entry 존재 확인 → 입력 검증 → update(`updatedAtUtc` 변경) → 수정된 entry 반환.
- Delete: 해당 entry 존재 확인 → delete → 삭제된 ID 또는 성공 결과 반환.
- List: 모든 entry를 화면 모델로 변환. 날짜순 비교는 `YYYY-MM-DD` 문자열 비교로 가능하며, 동률일 때 timestamp·ID 사용.
- `createdAtUtc`는 기존 기록 수정 시 바꾸지 않음.
- 동시 저장 요청이 들어와도 데이터 충돌/손상 방지(동기 DB 또는 순차화된 쓰기 및 트랜잭션).
- 기록 저장 후 각 화면에서 '구버전 캐시'가 남지 않도록 재조회 또는 단일 중앙 상태 갱신.

---

## 8. 통계·랭킹 계산 공식 (모든 화면에서 동일해야 함)

**입력:** `movies: Movie[]`, `entries: WatchEntry[]`.

### 8.1 기본 정의

영화 `m`에 속하는 기록을 `E(m)`라 하자.

| 지표 | 정의 |
|---|---|
| 전체 영화 수 | `movies.length` (초기 38) |
| 시청 완료 영화 수 | `count(m where E(m).length > 0)` |
| 진행률 | `시청 완료 영화 수 / 전체 영화 수 × 100` (0건일 때 0%) |
| 총 감상 횟수 | `entries.length` |
| 재관람 횟수 | `Σ_m max(0, E(m).length - 1)` |
| 미시청 | `E(m).length === 0` |
| 다음 영화 | 미시청 영화 중 `releaseOrder` 최솟값 |
| 현재 영화 별점 | `E(m)` 중 `ratingTicks != null`인 **가장 최근 시청 기록**의 점수 |
| 평가 영화 수 | 현재 유효 별점이 존재하는 영화 수 |
| 전체 평균 별점 | 평가 영화들의 현재 유효 별점에 대한 단순 평균 |
| Phase 완료 | 해당 Phase에서 감상 기록 ≥1인 영화 수 / 해당 Phase의 전체 영화 수 |
| Phase 평균 별점 | 해당 Phase에서 유효 별점이 존재하는 영화들의 현재 점수 평균 |
| 별점 분포 | 영화별 현재 별점 기준 각 0.5점 구간의 영화 개수 |

**'최근' 판정 순서:** `watchDate DESC`, 같으면 `createdAtUtc DESC`, 같으면 `id DESC`. 사용자가 이전 날짜의 감상을 나중에 입력하더라도 **등록한 시각이 아니라 실제 감상 날짜**를 우선한다. 데이터 변경 시 모든 값 재계산.

### 8.2 평균 및 반올림

- 평균 계산은 내부적으로 `ratingTicks` 정수들의 평균을 구한 뒤 `÷ 2` 변환하면 정확도가 좋다.
- 표시는 소수점 1자리까지 반올림(예: 4.25 → 4.3). 내부 평점은 반올림해 저장하지 않는다.
- 별점이 0개면 `0.0`으로 오해시키지 말고 `—` 표시.
- 진행률은 UI용 정수 퍼센트로 반올림할 수 있지만 Progress Bar 원본 비율은 정확하게 계산.

### 8.3 랭킹 동점 처리

- 1차 정렬: `ratingTicks DESC`.
- 2차 정렬: `releaseOrder ASC`.
- 결과에 화면상 1,2,3… 순위를 부여(동일 점수 공동 순위 정책은 P1; MVP에서는 정렬 순서 번호 사용).

### 8.4 필수 계산 예시(테스트 입력)

1. Iron Man 감상 2회(4.0점 → 4.5점), Thor 감상 1회(3.5점)인 경우:
   - 완료 영화 수 **2편**, 총 감상 횟수 **3회**, 재관람 **1회**.
   - 현재 점수: Iron Man **4.5**, Thor **3.5**.
   - 전체 평균 **4.0**.
2. Iron Man을 세 번째 봤으나 별점을 입력하지 않았다면:
   - Iron Man 감상 횟수 **3회**, 현재 점수 **4.5 유지**.
3. Iron Man 기록 3건 중 마지막 1건을 삭제하면:
   - 감상 횟수 **2회**, 재관람 1회, 현재 유효 평점은 가장 최신 유효 기록 기준.
4. 어떤 영화의 유일한 기록을 삭제하면:
   - 해당 영화 '미시청', 완료 영화 수 1 감소, 다음 영화 추천 재계산.
5. 모든 영화에 감상 기록이 없으면:
   - 진행률 0%, 완료 0편, 평균 `—`, 랭킹 비어 있음.

통계 함수는 UI 컴포넌트 안에서 각각 구현하지 말고 `getCurrentRating`, `getWatchedMovieCount`, `buildRanking`, `buildStatistics`, `getNextMovie` 등으로 모듈화한다.

---
## 9. MCU 초기 카탈로그: 개봉 완료 극장 영화 38편

**기준:** 2026-11-05까지 개봉한 MCU 극장 영화를 개봉 순으로 나열한다. 원제/연도/페이즈/인덱스는 불변 ID와 함께 seed 파일에 저장한다. 현재 시점에 개봉하지 않은 `Avengers: Doomsday`(2026-12 예정), `Avengers: Secret Wars`(2027 예정)는 MVP 목록에서 제외한다.

**주의:** Disney+의 영화 순서 안내는 자사 서비스에서 이용 가능한 MCU 작품 중심으로 나열되어 일부 Sony 배급 Spider-Man 극장 영화가 빠질 수 있다. 따라서 `Homecoming`, `Far From Home`, `No Way Home`, `Brand New Day`도 MCU 영화 초기 카탈로그에 포함한다. Phase는 공식 MCU Phase 분류를 따른다.

### Phase 1 — Infinity Saga (6편)

| ID | 순서 | 영문 원제 | 연도 |
|---|---:|---|---:|
| mcu-001 | 1 | Iron Man | 2008 |
| mcu-002 | 2 | The Incredible Hulk | 2008 |
| mcu-003 | 3 | Iron Man 2 | 2010 |
| mcu-004 | 4 | Thor | 2011 |
| mcu-005 | 5 | Captain America: The First Avenger | 2011 |
| mcu-006 | 6 | The Avengers | 2012 |

### Phase 2 — Infinity Saga (6편)

| ID | 순서 | 영문 원제 | 연도 |
|---|---:|---|---:|
| mcu-007 | 7 | Iron Man 3 | 2013 |
| mcu-008 | 8 | Thor: The Dark World | 2013 |
| mcu-009 | 9 | Captain America: The Winter Soldier | 2014 |
| mcu-010 | 10 | Guardians of the Galaxy | 2014 |
| mcu-011 | 11 | Avengers: Age of Ultron | 2015 |
| mcu-012 | 12 | Ant-Man | 2015 |

### Phase 3 — Infinity Saga (11편)

| ID | 순서 | 영문 원제 | 연도 |
|---|---:|---|---:|
| mcu-013 | 13 | Captain America: Civil War | 2016 |
| mcu-014 | 14 | Doctor Strange | 2016 |
| mcu-015 | 15 | Guardians of the Galaxy Vol. 2 | 2017 |
| mcu-016 | 16 | Spider-Man: Homecoming | 2017 |
| mcu-017 | 17 | Thor: Ragnarok | 2017 |
| mcu-018 | 18 | Black Panther | 2018 |
| mcu-019 | 19 | Avengers: Infinity War | 2018 |
| mcu-020 | 20 | Ant-Man and the Wasp | 2018 |
| mcu-021 | 21 | Captain Marvel | 2019 |
| mcu-022 | 22 | Avengers: Endgame | 2019 |
| mcu-023 | 23 | Spider-Man: Far From Home | 2019 |

### Phase 4 — Multiverse Saga (7편)

| ID | 순서 | 영문 원제 | 연도 |
|---|---:|---|---:|
| mcu-024 | 24 | Black Widow | 2021 |
| mcu-025 | 25 | Shang-Chi and the Legend of the Ten Rings | 2021 |
| mcu-026 | 26 | Eternals | 2021 |
| mcu-027 | 27 | Spider-Man: No Way Home | 2021 |
| mcu-028 | 28 | Doctor Strange in the Multiverse of Madness | 2022 |
| mcu-029 | 29 | Thor: Love and Thunder | 2022 |
| mcu-030 | 30 | Black Panther: Wakanda Forever | 2022 |

### Phase 5 — Multiverse Saga (6편)

| ID | 순서 | 영문 원제 | 연도 |
|---|---:|---|---:|
| mcu-031 | 31 | Ant-Man and the Wasp: Quantumania | 2023 |
| mcu-032 | 32 | Guardians of the Galaxy Vol. 3 | 2023 |
| mcu-033 | 33 | The Marvels | 2023 |
| mcu-034 | 34 | Deadpool & Wolverine | 2024 |
| mcu-035 | 35 | Captain America: Brave New World | 2025 |
| mcu-036 | 36 | Thunderbolts* | 2025 |

### Phase 6 — Multiverse Saga (2026-11-05 현재 개봉 2편)

| ID | 순서 | 영문 원제 | 연도 |
|---|---:|---|---:|
| mcu-037 | 37 | The Fantastic Four: First Steps | 2025 |
| mcu-038 | 38 | Spider-Man: Brand New Day | 2026 |

**Seed 품질 검증:**

- 총 영화 **38편**. Phase별 수: P1=6, P2=6, P3=11, P4=7, P5=6, P6=2.
- `movie.id` 38개 전부 유일, `releaseOrder`도 1~38 연속이며 유일.
- Phase 1~3의 `saga=Infinity Saga`, Phase 4~6의 `saga=Multiverse Saga`.
- 미래 예정 영화는 seed에 없음.
- 포스터 파일·가짜 줄거리·실제 감상 기록은 seed에 포함하지 않음.
- 카탈로그 메타데이터의 정확성을 유지하기 위한 외부 근거는 문서 맨 아래 참고 링크에 제공.

---

## 10. Electron IPC 명세 및 런타임 검증

### 10.1 타입 있는 preload API

기존 `window.electronAPI.openExternal`을 보존하면서 아래 메서드를 **각각 명시적으로** 추가한다. 예시 계약:

```ts
export interface MarvelMarathonAPI {
  // 기존 템플릿 기능
  openExternal(url: string): Promise<void>;

  movies: {
    list(): Promise<ApiResult<Movie[]>>;
  };

  entries: {
    list(): Promise<ApiResult<WatchEntry[]>>;
    create(input: CreateWatchEntryInput): Promise<ApiResult<WatchEntry>>;
    update(id: string, input: UpdateWatchEntryInput): Promise<ApiResult<WatchEntry>>;
    delete(id: string): Promise<ApiResult<{ deletedId: string }>>;
  };

  backup: {
    export(): Promise<ApiResult<{
      status: 'saved' | 'cancelled';
      exportedCount?: number;
    }>>;
    import(): Promise<ApiResult<{
      status: 'restored' | 'cancelled';
      importedCount?: number;
    }>>;
  };
}
```

필요하면 앱 버전 조회(`app.getVersion()`)를 위한 `appInfo.get()`을 추가해도 된다. 하지만 임의 채널을 인자로 받는 `send(channel, ...args)`/`invoke(channel, ...)` 형태로 원시 IPC를 공개해서는 안 된다.

### 10.2 IPC 채널 권장 이름

| 채널 | Renderer API | Main 처리 |
|---|---|---|
| `marathon:movies:list` | `movies.list()` | 영화 전체 조회 |
| `marathon:entries:list` | `entries.list()` | 감상 기록 조회 |
| `marathon:entries:create` | `entries.create(input)` | 입력 검증 후 INSERT |
| `marathon:entries:update` | `entries.update(id, input)` | ID·입력 검증 후 UPDATE |
| `marathon:entries:delete` | `entries.delete(id)` | ID 검증 후 DELETE |
| `marathon:backup:export` | `backup.export()` | OS 저장 대화상자·JSON 저장 |
| `marathon:backup:import` | `backup.import()` | 파일 선택·검증·OS 확인·복원 |

기존 `app:open-external` 채널 유지. `IPC_CHANNELS` 중앙 상수 테이블 또는 별도 모듈에서 충돌 없이 관리한다.

### 10.3 IPC 보안 필수 규칙

1. **Sender 검증:** 모든 privileged IPC에서 실제 앱의 허용된 메인 frame/웹 콘텐츠에서 온 요청인지 확인. 신뢰하지 않은 iframe, 외부 URL, 임의 창의 요청은 거부.
2. **Runtime validation:** TypeScript 타입만 믿지 말고 Main에서 필드 타입, 길이, 범위, 영화 ID 존재, 날짜의 실제 유효성, null 허용 여부를 검사.
3. **직렬화 제한:** `fs`, `ipcRenderer`, `shell`, DB 인스턴스, 임의 파일 경로 접근 함수를 renderer로 공개하지 않음.
4. **입력 SQL 바인딩:** prepared statement 사용. 문자열 결합으로 SQL 구성 금지.
5. **에러 메시지:** Renderer에는 코드와 안전한 사용자용 문구만 반환. 원문 DB stack trace, 파일의 민감한 절대 경로, 개인 리뷰 본문을 에러에 포함하지 않음.
6. **외부 링크:** 기존 템플릿의 HTTP(S) URL 검증과 OS 브라우저 열기 정책 유지.
7. **배포 시 CSP:** Inline script나 원격 script를 무제한 허용하지 않음. 앱의 로컬 renderer 실행 방식에 맞는 안전한 CSP 적용.
8. **OS 파일 대화상자:** 백업 파일 경로는 Main의 native file dialog에서만 획득. Renderer에서 임의 읽기 경로를 보내는 API 금지.
9. **네이티브 모듈:** 기존 `sandbox: true`/`contextIsolation: true`를 꺼서 문제를 회피하지 않는다. DB는 Main에서만 사용하므로 일반적으로 renderer sandbox를 해제할 이유가 없다.

### 10.4 날짜 검증 상세

- `YYYY-MM-DD` 정확한 형식 요구.
- 윤년, 2월 30일, 13월 등 실제 존재하지 않는 날짜 거부.
- 사용자 로컬 현재 날짜보다 미래 날짜 거부.
- UTC timestamp(`createdAtUtc`)와 `watchDate`는 목적이 다르므로 **서로 변환해 덮어쓰지 않는다**.
- 시청일은 현지 날짜를 그대로 저장하고, 화면에서도 같은 날짜로 표시. `new Date('YYYY-MM-DD')`의 UTC 해석으로 하루 차이 발생하지 않도록 주의.
- 입력 경계값은 unit test로 검증(윤년 2/29, 비윤년 2/29, 미래 날짜).

---

## 11. 시각 디자인·상호작용 가이드

### 11.1 디자인 컨셉

- 이름: **Marvel Marathon** (개인 팬 프로젝트, 공식 브랜드 아님).
- 분위기: 영화관처럼 몰입감 있는 **dark cinematic dashboard**.
- UI 텍스트는 한국어 중심. 영화 제목은 영어를 기본 표기.
- 화려한 애니메이션보다 깔끔한 카드, 타이포그래피, 상태 구분과 가독성 우선.

### 11.2 컬러 토큰(예시)

| 토큰 | 값 | 사용 |
|---|---|---|
| `--bg` | `#0B0F17` | 배경 |
| `--surface` | `#151B27` | 카드, 사이드바 |
| `--surface-elevated` | `#1E2635` | Hover, 모달 |
| `--border` | `#2C3445` | 구분선 |
| `--text` | `#F3F5F9` | 핵심 텍스트 |
| `--muted` | `#A8B2C2` | 보조 텍스트 |
| `--accent` | `#E24A55` | CTA/진행률 |
| `--star` | `#F1BD5A` | 별점 |
| `--success` | `#60BFA6` | 시청 완료 배지 |

- 한 페이지 안에서 강한 강조색을 남용하지 않는다.
- 기본 본문 글자 크기 약 14~16px, 제목은 24~32px 범위.
- 밝은 텍스트와 어두운 배경 대비 확보. 특히 입력폼·필터·별점의 Focus/Selected 상태가 명확해야 함.

### 11.3 포스터 없는 상황을 위한 커버 컴포넌트

**P0 기본값:** 외부 이미지나 API 없이도 카드가 보기 좋아야 한다.

- `MovieCover`는 `movie.id`/`phase` 기반으로 일관적인 어두운 그라디언트 및 추상적 패턴을 만들고 **영화 제목/Phase/개봉 연도**를 텍스트로 표시.
- 동일 영화에는 앱 재시작 후에도 같은 컬러/커버 스타일이 나와야 한다. 불안정한 `Math.random()` 사용 금지.
- 커버의 텍스트가 길면 적절히 줄바꿈·줄임 처리하고 hover tooltip/스크린리더 제목 제공.
- 인터넷이나 TMDB 연결 실패 시에도 영화 카드가 깨지지 않아야 한다.
- **영화 포스터·캐릭터·공식 로고·스틸컷을 임의로 웹에서 복사해 프로젝트에 포함하지 않는다.** 필요하면 P1에서 사용자 본인의 로컬 이미지 선택 기능 제공.

### 11.4 카드 및 컴포넌트 상호작용

- 사이드바 활성 메뉴는 배경/색상·왼쪽 표시선 등으로 식별.
- 카드 hover는 부드럽고 짧게(약 150~200ms); `prefers-reduced-motion` 존중.
- 영화 포스터 자리 비율은 약 2:3.
- 별점 선택은 마우스뿐 아니라 키보드로 가능. 현재 선택된 별점 숫자(예: `4.5 / 5`)가 항상 문자로 표시되도록.
- 별점 입력에는 `평점 지우기` 버튼 제공. 반쪽 별 그래픽이 복잡하면 **0.5 단위 버튼/슬라이더 또는 combobox**로 구현하되, 0.5단위 선택이 분명해야 한다.
- 저장 중 버튼 중복 클릭 금지, 실패 시 입력값 보존.
- 모든 액션 버튼은 `type`, 접근 가능한 label, focus 상태, disabled 상태를 가진다.
- 통계 차트는 숫자 텍스트도 함께 제공해 색만으로 정보를 전달하지 않음.

### 11.5 빈 상태 및 마이크로카피 예시

| 상황 | 표시 문구 |
|---|---|
| 첫 실행 | `아직 감상 기록이 없어요. 첫 MCU 영화부터 시작해볼까요?` |
| 검색 0건 | `조건에 맞는 영화가 없습니다.` |
| 랭킹 0건 | `별점을 매기면 나만의 MCU 랭킹이 만들어져요.` |
| 모든 영화 시청 | `등록된 모든 MCU 영화를 감상했어요!` |
| 저장 완료 | `감상 기록을 저장했어요.` |
| 저장 오류 | `기록을 저장하지 못했어요. 다시 시도해 주세요.` |
| 삭제 확인 | `이 감상 기록을 삭제할까요? 삭제 후 복구할 수 없습니다.` |
| 백업 가져오기 | `현재 감상 기록을 선택한 백업으로 교체합니다. 계속할까요?` |
| 잘못된 백업 | `지원하지 않거나 손상된 백업 파일입니다. 기존 기록은 변경되지 않았습니다.` |

---

## 12. 백업·복원·데이터 안전 정책

### 12.1 MVP 백업 포맷

사람이 열어볼 수 있는 JSON을 사용. 영화 카탈로그는 앱에 내장되어 있으므로 **사용자 데이터인 감상 기록**을 백업한다. 형식 예:

```json
{
  "format": "marvel-marathon-backup",
  "formatVersion": 1,
  "exportedAtUtc": "2026-11-05T10:00:00.000Z",
  "catalogVersion": "mcu-2026-11-05",
  "watchEntries": [
    {
      "id": "sample-uuid",
      "movieId": "mcu-001",
      "watchDate": "2026-11-05",
      "ratingTicks": 9,
      "review": "다시 봐도 재미있다.",
      "createdAtUtc": "2026-11-05T10:00:00.000Z",
      "updatedAtUtc": "2026-11-05T10:00:00.000Z"
    }
  ]
}
```

위 내용은 **포맷 예시**이며 실제 사용자 기록 seed로 넣으면 안 된다.

### 12.2 내보내기

1. `dialog.showSaveDialog`로 저장 위치 선택, 기본 파일명 예: `marvel-marathon-backup-2026-11-05.json`.
2. 사용자가 취소하면 `status: cancelled` 반환, 오류 메시지 불필요.
3. 스냅샷을 검증된 JSON으로 직렬화해 파일에 저장. 파일 인코딩 UTF-8.
4. 디렉터리 쓰기 권한 오류 등은 안전하게 사용자에게 표시.
5. 리뷰의 개인정보를 로그에 남기지 않는다.

### 12.3 가져오기

1. `dialog.showOpenDialog`로 `.json` 파일 선택(경로를 Renderer가 직접 입력하지 않음).
2. 크기 상한(권장 10MB)과 `format`, `formatVersion`, 배열 구조, 모든 entry 필드, 영화 ID 유효성, UUID/ID 유일성, 날짜·별점·리뷰 길이 검증. 악의적인/초대형 백업에 대한 방어.
3. **교체 대화상자**를 표시. 취소 시 변경 없음.
4. 안전성 향상을 위해 현재 기록의 복구용 사본을 먼저 생성하거나, DB 트랜잭션 내에서 `DELETE watch_entries → INSERT imported entries`를 수행하고 오류 시 rollback. 가능하다면 두 방식 모두 적용.
5. 가져오기 후 영화 seed와 FK 제약조건이 유지되는지 확인.
6. UI 상태를 전부 갱신. `importedCount`와 성공 메시지 제공.
7. 지원되지 않는 미래 포맷 버전이면 **읽을 수 없는 백업**으로 보고 기존 데이터 유지. 사용자 기록을 조용히 버리지 말 것.

### 12.4 데이터 보존 테스트

- 2건 기록 후 앱 종료/재실행 → 동일 2건 유지.
- 백업 내보내기 후 기록 수정 → 백업 가져오기 → 원래 기록·별점 복원.
- 깨진 JSON/알 수 없는 영화 ID/중복 entry ID/잘못된 별점 → 복원 거부, 기존 DB 불변.
- 백업 가져오기 확인 대화상자에서 취소 → DB 불변.
- 버전 갱신·seed 재실행 → 사용자 기록 불변.

---
## 13. 검증 전략과 테스트 명세

단순히 `npm run build`가 통과했다고 기능이 완성된 것으로 간주하지 않는다. **데이터 규칙 단위 테스트 + CRUD 통합 테스트 + UI/Electron 스모크 테스트**를 병행한다.

### 13.1 반드시 추가할 자동 테스트

| ID | 우선도 | 테스트 | 기대 결과 |
|---|---|---|---|
| T01 | P0 | 카탈로그 개수/ID 검증 | 정확히 38편, 모든 ID 고유 |
| T02 | P0 | releaseOrder 검증 | 1~38 누락/중복 없이 오름차순 |
| T03 | P0 | Phase 집계 검증 | 6/6/11/7/6/2 |
| T04 | P0 | 새 DB 초기화 | 38편 생성, 감상 기록 0건 |
| T05 | P0 | 두 번째 실행/seed 재호출 | 영화 중복 없음, 기존 감상 기록 보존 |
| T06 | P0 | 새 기록 추가 | 1편 시청 완료, 총 감상 1회, 데이터 영속 |
| T07 | P0 | 동일 영화 재관람 기록 | 완료 편수는 유지, 총 감상 1 증가, 재관람 1 증가 |
| T08 | P0 | 별점 없는 기록 | 시청 완료 처리, 랭킹/평균 집계 제외 |
| T09 | P0 | 최신 별점 정렬 | 실제 감상 날짜 기준 최근 유효 별점 선택 |
| T10 | P0 | 최신 기록은 미평가 | 이전 유효 별점이 현재 점수로 남음 |
| T11 | P0 | 랭킹 동점 | 점수 내림차순 후 releaseOrder 오름차순 |
| T12 | P0 | 평균/분포 계산 | 영화별 현재 유효 별점만 집계, 재관람 중복 평균 금지 |
| T13 | P0 | 감상 기록 수정 | 특정 ID만 변경, createdAtUtc 유지, 통계 갱신 |
| T14 | P0 | 감상 기록 삭제 | 특정 ID만 삭제, 마지막 기록 삭제 시 미시청 |
| T15 | P0 | 잘못된 날짜 | 2026-02-30, 비윤년 2/29, 미래 날짜 입력 거부 |
| T16 | P0 | 잘못된 평점 | -0.5, 0, 5.5, 4.3, NaN, 문자열 거부 |
| T17 | P0 | 잘못된 리뷰 | 500자 초과 거부, 500자 허용 |
| T18 | P0 | 알 수 없는 movieId/entryId | 적절한 NOT_FOUND/INVALID_INPUT, 데이터 변경 없음 |
| T19 | P0 | JSON 백업 왕복 | 모든 entry ID·날짜·점수·리뷰 복원 |
| T20 | P0 | 잘못된 JSON 백업 | 복원 거부, 기존 DB 유지 |
| T21 | P0 | 교체 복원 취소 | 기존 DB 유지 |
| T22 | P0 | IPC 발신자/인자 검증 | 신뢰하지 않는 sender/잘못된 타입 거부 |
| T23 | P0 | 영화 필터 | 검색 + Phase + 시청 상태 교집합 |
| T24 | P0 | 기록 없는 상태 | 진행률 0%, 평균 `—`, 적절한 Empty UI |
| T25 | P0 | 모든 영화 시청 | 다음 영화 없음, 100%, 완료 메시지 |

테스트는 가능하면 `vitest`로 실행하며 **실제 파일 대화상자** 같은 OS UI는 별도 서비스 레벨의 직렬화·검증·복원 테스트와 수동 스모크 테스트로 분리한다.

### 13.2 수동 UI/기능 테스트 시나리오

**시나리오 A — 최초 실행:**

1. 개발용 DB가 없는 상태로 실행.
2. 앱이 정상 기동하고 대시보드 0/38편, 다음 영화 `Iron Man` 표시.
3. `영화 목록`을 열었을 때 38편이 목록에 나타남.
4. `Phase 1` 필터 시 6편만 남음.
5. 검색 `iron` 시 관련 작품이 표시됨.

**시나리오 B — 감상 기록/재관람:**

1. Iron Man 상세에서 2026-11-04, 4.0점, `첫 정주행` 기록 저장.
2. 기록 카드에 정확한 날짜·점수·리뷰 표시.
3. 두 번째 감상 2026-11-05, 4.5점, `다시 보니 더 좋다` 저장.
4. 해당 영화의 감상 2회, 평가 변화 +0.5, 정주행 완료 영화 1편, 총 감상 2회, 재관람 1회.
5. 랭킹에 Iron Man은 1개 행으로 나타나며 현재 점수는 4.5.
6. 앱 종료 후 재시작해 두 기록과 통계가 동일한지 확인.

**시나리오 C — 다른 영화 및 평균:**

1. Thor에 3.5점을 저장.
2. 전체 평균이 4.0인지 확인(4.5와 3.5의 평균).
3. Iron Man에 별점 없는 세 번째 감상 기록 추가.
4. 평균과 Iron Man 랭킹 점수가 그대로 유지되는지 확인.
5. 해당 기록 삭제 후 총 감상 횟수와 재관람 값이 감소하는지 확인.

**시나리오 D — 백업:**

1. 감상 기록 2건 이상 있는 상태에서 JSON 백업.
2. 기록 수정 또는 삭제.
3. 백업을 가져와 교체 확인.
4. 원래 기록과 점수로 복원되었는지 확인.
5. 손상된 백업과 잘못된 스키마 백업에 대해 데이터가 유지되는지 확인.

**시나리오 E — 사용자 경험:**

- 모든 사이드바 메뉴가 실제 페이지로 이동.
- 영화 카드 클릭 시 해당 영화 상세로 이동.
- 페이지 이동 후 검색·필터가 예측 가능한 상태로 작동.
- 저장 실패/취소 시 입력 내용을 잃지 않음.
- 화면 너비를 1000px 안팎으로 줄여도 주요 기능을 이용 가능.
- 키보드로 필터, 별점, 저장, 삭제 확인에 접근 가능.
- 미시청/시청 완료 및 별점 유무가 색상 외에도 텍스트로 식별.

### 13.3 개발 명령 검증

실제 `package.json`을 확인한 후 아래 순서대로 실행. 테스트 스크립트는 추가 구현 시 `npm run test`가 동작하도록 마련한다.

```bash
npm ci
npm run lint
npm run test
npm run build
npm run dev
# 앱을 실제로 실행할 수 있는 환경에서는 주요 화면/CRUD/재기동 확인
npm run release
# 가능한 경우 배포 결과물을 설치하거나 --dir 빌드로 실행하여 DB/IPC 검증
```

- `npm ci`가 현재 잠금파일과 맞지 않으면 먼저 의존성/잠금파일을 정합하게 수정한 후 재시도.
- `npm run lint`는 본 프로젝트 코드의 린트 에러가 없어야 함.
- `npm run test` 스크립트가 템플릿에 없으면 추가하고 동작 검증.
- `npm run build`는 TypeScript+electron-vite 성공.
- 네이티브 DB 모듈 사용 시 **Electron 패키징된 실행파일에서 실제 DB 열기/저장까지 확인**. 터미널 Node에서만 성공한 것은 충분하지 않음.
- 패키징 OS 제약이 있으면 해당 단계는 `미검증`으로 보고.

---

## 14. 단계별 구현 순서(작업 체크리스트)

**선행 조건:** 기존 코드 및 개발 환경 확인, git 변경 상태 파악. 이미 존재하는 변경사항을 지우지 않는다. 각 단계 종료 후 동작 확인, 가능하면 커밋 단위로 관리.

### Phase 0 — 기반 확인 및 설계 (먼저)

- [ ] 현재 파일 트리, 패키지/스크립트, 기본 빌드가 어떻게 동작하는지 확인.
- [ ] 기존 창 상태 복원, logger, preload, IPC, 환경 구분을 검토.
- [ ] 저장 방식/런타임 검증/라우팅 방식 결정(문서 기본값 권장).
- [ ] 작업 계획을 `README` 또는 별도 `docs/implementation-notes.md`에 간단히 기록.
- [ ] 필요한 의존성 추가. `npm run build` 기준선 확인.

### Phase 1 — 데이터베이스·도메인 [P0]

- [ ] 고정 영화 seed 38편 작성 및 shape/개수 테스트.
- [ ] `Movie`/`WatchEntry` DTO 정의.
- [ ] DB 연결·스키마·migration/seed 작성.
- [ ] 감상 기록 CRUD repository와 입력 검증 작성.
- [ ] 통계·랭킹 pure selector 구현, 단위 테스트.
- [ ] 기존 IPC/Preload에 typed 메서드 추가(기존 external link 유지).

**완료 기준:** UI 없이도 repository/unit test로 저장·재관람·통계를 검증할 수 있어야 한다.

### Phase 2 — 공통 UI 및 목록 [P0]

- [ ] React 기본 데모 제거/교체, 사이드바 및 라우팅 구현.
- [ ] CSS 디자인 토큰, 공통 카드·버튼·상태 컴포넌트 작성.
- [ ] 목록 로딩/오류/빈 상태 처리.
- [ ] 영화 목록 38편 + 페이즈·시청 상태·검색 필터 구현.
- [ ] 창작 영화 커버 컴포넌트 구현(외부 API 없이 동작).

**완료 기준:** 영화 목록과 상세로 자유롭게 이동하며 필터가 정상 작동.

### Phase 3 — 감상 기록 및 재관람 [P0]

- [ ] 영화 상세 구현.
- [ ] 날짜/별점/한 줄평 입력폼 및 저장 검증.
- [ ] 감상 기록 다건 조회, 수정, 삭제 및 확인 대화상자.
- [ ] 현재 유효 별점/평가 변화 표시.
- [ ] Diary 페이지 구현 및 데이터 동기화.

**완료 기준:** 사용자 감상 기록이 실제 DB에 저장되고 앱 재시작 후 유지.

### Phase 4 — 대시보드·랭킹·통계 [P0]

- [ ] 대시보드 진행률, 다음 영화, 최근 기록, KPI 구현.
- [ ] 영화별 최신 유효 별점 기반 랭킹 구현.
- [ ] 페이즈 진행률·평균 및 별점 분포 구현.
- [ ] 데이터 변경 즉시 모든 관련 화면 갱신.

**완료 기준:** 재관람 기록을 여러 건 넣어도 집계가 §8과 일치.

### Phase 5 — 백업·예외처리·품질 [P0]

- [ ] 설정 화면/비공식 팬 프로젝트 안내.
- [ ] JSON 내보내기 및 안전 복원 구현.
- [ ] 네이티브 저장/열기 대화상자 취소·오류 처리.
- [ ] 오류 상태, Toast, 삭제 확인, 입력 에러 피드백.
- [ ] 테스트 T01~T25 중 자동화 가능한 항목 완성.
- [ ] `lint`/`test`/`build`, 실제 Electron 실행, 재기동, 가능하면 패키지 스모크 테스트.
- [ ] `README.md` 설치/사용/백업 설명 업데이트, 최종 구현 결과 보고.

**완료 기준:** 아래 §15의 DoD 체크리스트 충족.

---

## 15. Definition of Done — MVP 완료 판정

Codex가 결과를 보고할 때 아래 항목별로 **완료/미완료/검증 불가**를 표시한다.

### 15.1 제품 기능

- [ ] 대시보드/영화 목록/감상 일기/랭킹/통계/설정이 모두 열리고 메뉴 이동 가능.
- [ ] 영화 목록이 정확히 **38편**이며 페이즈별 정렬 정확.
- [ ] 영문 영화명 검색, 페이즈 필터, 시청 여부 필터가 작동.
- [ ] 한 영화에 여러 감상 기록이 저장되고 이전 기록이 유지.
- [ ] 별점 0.5~5.0 선택, 별점 없음, 리뷰 입력, 시청일 수정 가능.
- [ ] 기록 추가/수정/삭제가 실제 영속 DB에 반영.
- [ ] 앱 재실행 후 기록 복원 및 상태 정상.
- [ ] 진행률, 현재 별점, 전체 평균, 재관람 수, Phase 통계, 랭킹 정확.
- [ ] 다음 미시청 영화가 자동으로 추천됨.
- [ ] JSON 백업 내보내기·가져오기, 취소/손상 파일 처리 정상.

### 15.2 기술·보안

- [ ] 기존 Electron 창·상태 복원·로깅·외부 링크 동작 보존.
- [ ] `contextIsolation`/`sandbox`/`nodeIntegration` 보안 설정 유지.
- [ ] Renderer에서 임의 파일 접근 또는 원시 IPC 접근 불가.
- [ ] Main IPC에서 sender 및 런타임 입력 검증.
- [ ] DB 초기 seed/migration이 사용자 데이터를 파괴하지 않음.
- [ ] 네이티브 DB 구현 시 Electron 런타임 및 배포본 동작 확인 또는 한계 명시.
- [ ] 외부 API 키/클라우드 서버 없이 핵심 기능 작동.
- [ ] 사용자가 제공하지 않은 개인 리뷰·평점으로 화면을 채우지 않음.

### 15.3 사용성·품질

- [ ] 마우스와 키보드로 주요 액션 가능.
- [ ] 로딩/빈 상태/오류 상태가 구분되어 있음.
- [ ] 다크 UI가 실제 데이터 및 여러 창 크기에서 무너지지 않음.
- [ ] 불필요한 공식 영화 포스터·상표 자산을 무단 포함하지 않음.
- [ ] `npm run lint`, `npm run test`, `npm run build` 결과를 정직하게 보고.
- [ ] 가능한 플랫폼에서 `npm run dev` 및 패키지 스모크 테스트.
- [ ] `README.md`에 재현 가능한 실행 절차와 DB/백업 안내 존재.

---

## 16. 구현 시 피해야 할 반패턴

1. **데모용 hardcoded state를 실제 기능처럼 꾸미기:** 처음부터 사용자 평점 4.5, 시청률 35% 등을 하드코딩하지 말 것.
2. **로컬스토리지 단독 사용:** MVP 영속 저장은 Main 프로세스 DB를 진실 원천(single source of truth)으로 유지. 임시 UI 필터 상태만 브라우저 상태로 관리 가능.
3. **영화당 감상 기록 1개 강제:** `UNIQUE(movie_id)` 같은 제약을 두지 말 것.
4. **평점 없는 감상을 미시청 처리:** 시청 기록과 평가는 서로 다른 차원.
5. **총 감상 횟수로 진행률 계산:** 진행률 분자는 유일 영화 수.
6. **과거 평점을 지워 최신 점수만 저장:** 재관람 분석 기능 훼손.
7. **감상 횟수 기준 별점 평균:** 여러 번 본 영화가 평균을 과하게 좌우함. §8 기준 사용.
8. **미검증 API 키 하드코딩 / 자동 웹 스크래핑:** 외부 API는 P2. 개발 난이도 불필요하게 증가.
9. **보안 옵션 해제:** Renderer에서 DB를 사용하려고 `nodeIntegration`을 켜거나 `sandbox`를 끄지 말 것.
10. **복원 전에 현재 DB 먼저 삭제:** 잘못된 JSON에서 데이터 유실. 반드시 검증·확인·트랜잭션 사용.
11. **미래 영화까지 완료 분모에 포함:** 현재 seed의 개봉 완료 38편만 기준.
12. **README만 작성하고 코드 미구현:** 본 작업의 목적은 실행 가능한 기능형 앱.
13. **단위 테스트만 통과하고 앱 실행 검증 누락:** Electron preload/IPC, native SQLite 런타임, 배포본도 확인.
14. **기존 템플릿 구조 전체 재작성:** 기존 기반을 유지하고 필요한 부분만 확장.

---

## 17. 완료 시 Codex 최종 보고 형식

결과 보고는 아래 내용을 포함한다.

```text
[Marvel Marathon MVP 구현 결과]

1. 구현한 기능
   - 메뉴/화면, 기록 저장, 랭킹, 통계, 백업 등

2. 주요 변경 파일
   - 파일 경로 및 역할 간단 요약

3. 실행 방법
   - Node/npm 요구사항, 설치, npm run dev, npm run release 등

4. 검증 결과
   - npm run lint: 성공/실패/미실행 + 이유
   - npm run test: 성공/실패/미실행 + 이유
   - npm run build: 성공/실패/미실행 + 이유
   - Electron GUI 스모크: 성공/실패/미검증 + 이유
   - 패키징 실행: 성공/실패/미검증 + 이유

5. 수용 기준
   - 핵심 P0 기능 완료 여부 및 확인 절차

6. 남은 이슈·향후 개선
   - 미완성 기능, 기술 부채, 배포 관련 주의점
```

**작업이 막혔을 때:** 무엇을 시도했고 어떤 이유로 막혔는지 로그/재현 명령을 요약하고, 기존 코드를 안전하게 유지한 상태에서 가능한 작업을 최대한 완료한다. 결과를 미래에 전달하겠다고 약속하지 않는다.

---

## 18. 참고 자료 및 사실 확인 출처

- 기존 템플릿 전체: https://github.com/Road-Glide/electron-vite-react-ts
- 템플릿 README와 파일 구조: https://github.com/Road-Glide/electron-vite-react-ts/blob/master/README.md
- 템플릿 `package.json`: https://github.com/Road-Glide/electron-vite-react-ts/blob/master/package.json
- 템플릿 Main 보안 설정: https://github.com/Road-Glide/electron-vite-react-ts/blob/master/electron/main.ts
- 템플릿 preload/IPC: https://github.com/Road-Glide/electron-vite-react-ts/blob/master/electron/preload.ts 및 https://github.com/Road-Glide/electron-vite-react-ts/blob/master/electron/ipc.ts
- Disney+ 공식 MCU 영화 개봉 순서 가이드(2026-11-04): https://www.disneyplus.com/explore/articles/marvel-movies-in-order
- Sony Pictures 공식 `Spider-Man: Brand New Day` 작품 정보: https://www.sonypictures.com/movies/spidermanbrandnewday
- MCU 영화 종합 개봉순/페이즈 대조: https://editorial.rottentomatoes.com/guide/marvel-movies-in-order/
- Electron Context Isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation
- Electron Security: https://www.electronjs.org/docs/latest/tutorial/security
- Electron IPC Main: https://www.electronjs.org/docs/latest/api/ipc-main
- electron-builder 공식 문서(네이티브 재빌드): https://www.electron.build/v26/docs/

### 기획 선택의 이유(짧은 결정 로그)

- **왜 서버가 없는가?** 개인 데스크톱용 MVP라서 계정/동기화보다 기록 기능 완성이 먼저다.
- **왜 38편 seed인가?** 외부 API 없이 초기 영화를 바로 탐색할 수 있고, 사용자 정주행을 초기 작품부터 지원한다.
- **왜 포스터 대신 창작 커버인가?** 라이선스가 불분명한 이미지 자산을 무단 배포하지 않고 오프라인 동작을 보장하기 위해서다.
- **왜 영화별 다건 감상 기록인가?** 이 프로젝트의 핵심 차별화인 '정주행에 따른 평가 변화'를 저장하기 위해서다.
- **왜 현재 별점은 최신 유효 점수인가?** 나중에 단순 시청 완료만 등록해도 이전에 작성한 평가가 사라지지 않도록 하기 위해서다.
- **왜 DB/백업이 P0인가?** 개인 감상평은 다시 만들기 어려운 사용자 데이터이므로 기록 보존이 첫 버전부터 필수다.

**최종 목표 한 줄:** `MCU 영화 38편을 개봉 순서로 탐색하고, 영화별 재관람과 별점을 기록하면 대시보드·랭킹·통계가 실시간 갱신되며, 종료 후에도 데이터가 안전하게 유지되는 Electron 데스크톱 앱.`
