# Marvel Marathon

MCU 영화 38편을 개봉 순서로 탐색하고 감상 날짜, 별점, 감상평을 남기는 개인용 Electron 앱입니다. 로그인이나 API 키 없이 오프라인에서 동작하며, 같은 영화를 다시 본 기록도 각각 보존합니다.

## 시작하기

Windows 10/11, Node.js **24 LTS** 및 npm을 권장합니다. 개발 도구가 지원하는 Node 범위는 22.13 이상 22.x, 24.x, 26 이상입니다.

```powershell
git clone https://github.com/GHY25/Marvel-Marathon.git
cd Marvel-Marathon
npm ci
npm run dev
```

이미 프로젝트를 받은 경우 해당 폴더에서 `npm ci`와 `npm run dev`만 실행하세요.

postinstall이 Electron 바이너리를 설치합니다. 프록시 등으로 다운로드가 실패하면 네트워크 설정 후 `node node_modules/electron/install.js`를 다시 실행하세요.

Electron을 실행하지 않는 CI 코드 검사에서는 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`로 실행 파일 다운로드만 생략할 수 있습니다. 실제 앱 실행과 패키징에는 Electron 바이너리가 필요합니다.

```powershell
npm run lint          # 정적 검사
npm test              # 도메인 / SQLite / 백업 / 보안 테스트
npm run build         # TypeScript + Electron/React 번들
npm start             # 빌드한 앱 실행
npm run test:e2e      # 실제 Electron UI 테스트 (별도 임시 DB)
npm run package:dir   # 설치 없이 실행할 배포 폴더
npm run release       # 현재 OS용 설치 패키지
```

Windows 결과물은 `release/Marvel-Marathon-0.1.0-Setup.exe`입니다. 설치 없이 실행하려면 `release/win-unpacked/Marvel Marathon.exe`를 사용하며 같은 폴더의 나머지 파일도 함께 보관해야 합니다. 로컬 빌드는 코드 서명이 없는 개인 개발용 배포본입니다. macOS/Linux 빌드 설정도 포함되어 있지만 이 작업에서는 Windows에서 검증합니다.

## 사용법

- **나의 우주:** 잡아서 이동하고 확대할 수 있는 하나의 우주 지도. 영화 한 편을 감상할 때마다 별 하나가 켜지며, 38개의 별로 여섯 Phase의 별자리를 완성합니다. 별을 선택하면 영화 상세로 이동하고, 다음 미시청 영화·최근 기록·기존 통계도 함께 제공합니다.
- **영화 목록:** 제목 검색, 페이즈, 시청 여부를 함께 필터링. 카드에서 영화 상세로 이동.
- **영화 상세:** 날짜·0.5~5.0 별점·최대 500자 감상평을 추가·수정·삭제. 별을 한 번 누르면 반 개, 같은 별을 다시 누르면 한 개가 채워집니다. 예를 들어 세 번째 별은 2.5점 → 3.0점으로 전환됩니다. 별점과 감상평은 생략 가능.
- **감상 일기:** 모든 감상을 시청일 기준으로 조회하고 제목/별점 유무로 검색.
- **나의 랭킹:** 영화마다 최신 유효 평점 하나를 사용. 미평가 재관람은 이전 별점을 지우지 않음.
- **통계:** 고유 시청 영화 수, 재관람 수, 영화별 평균 평점, 별점 분포, 페이즈별 현황.
- **설정:** JSON 백업 내보내기/가져오기, 밝은/어두운 우주 테마, 앱 정보. 상단의 해·달 버튼으로도 테마를 바꿀 수 있습니다.

시청일은 로컬 달력 날짜 그대로 보관하며 미래 날짜는 거부합니다. 최신순은 `시청일 → 작성 시각 → ID` 내림차순입니다. 평균은 감상 횟수가 아닌 **영화별 최신 유효 평점**의 평균이고, 평점 동점인 영화는 개봉 순으로 표시합니다.

별 수집은 별점과 무관합니다. 날짜만 남겨도 별이 켜지고, 재관람은 별을 늘리지 않습니다. 한 영화의 마지막 기록을 삭제하거나 다른 백업을 복원하면 우주와 Phase 완성 상태도 즉시 다시 계산합니다.

테마 선택만 렌더러의 로컬 설정으로 저장하며 감상 기록은 계속 SQLite를 사용합니다. 테마는 앱을 다시 열어도 유지되고 감상 기록 JSON 백업에는 포함되지 않습니다.

### 우주 지도 조작

| 조작                                                 | 동작                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 지도 드래그                                          | 우주를 이동합니다. 빠르게 놓으면 짧은 관성이 이어집니다.                                                 |
| 마우스 휠 / 상단 `+`·`−` 버튼                        | 확대·축소합니다. 휠은 마우스가 가리키는 위치를 기준으로 확대합니다.                                      |
| Phase 수집 카드                                      | 해당 별자리로 이동합니다. 다른 Phase의 별도 그대로 유지됩니다.                                           |
| 전체 보기 버튼                                       | 38개의 별이 있는 우주 전체를 한 화면에 맞춥니다.                                                         |
| 전체 화면 아이콘 / `Esc`                             | 우주 지도만 화면 가득 펼칩니다. 종료 아이콘이나 `Esc`로 원래 창에 돌아옵니다.                            |
| 지도에 키보드 초점을 둔 뒤 방향키 / `+`·`−` / `Home` | 이동 / 확대·축소 / 전체 보기를 실행합니다. `Tab`으로 영화 별을 선택하고 `Enter`로 상세를 열 수 있습니다. |

왼쪽 아래 미니맵은 전체 우주에서 현재 보고 있는 영역을 표시합니다. 별자리는 카시오페이아·백조·오리온·북두칠성·사자자리의 낫·작은개자리의 형태를 영화 수에 맞춰 재구성했습니다. 실제 관측용 천문 지도는 아니며, [별자리 참고 자료와 배치 기준](docs/constellation-references.md)에 조정 내용을 기록했습니다.

밝은 테마와 어두운 테마 모두 같은 지도 조작을 지원합니다. 운영체제의 **동작 줄이기** 설정을 켜면 배경·별의 반복 애니메이션과 이동 관성, 별자리 사이의 이동 애니메이션이 멈춥니다.

## 실제 포스터와 내 이미지

1. [TMDB 계정 설정 → API](https://www.themoviedb.org/settings/api)에서 API를 신청합니다. [공식 발급 안내](https://developer.themoviedb.org/docs/getting-started)에 따라 데스크톱 브라우저에서 신청하고 이용 약관에 동의하세요.
2. 앱 **설정 → 영화 포스터**에 `API Key` 또는 `API Read Access Token`을 붙여 넣고 **키 저장**을 누릅니다. 채팅이나 소스 코드에 키를 넣을 필요가 없습니다.
3. **포스터 자동 가져오기**를 누르면 38편을 검색해 한국어 → 영어 → 언어 표시 없는 포스터 순으로 찾습니다. 제목·개봉 연도가 정확하게 일치하지 않거나 포스터가 없으면 기존 우주 커버를 유지하고 실패 이유를 표시합니다.
4. 영화 상세의 **내 이미지로 변경**에서 JPG/PNG를 선택할 수 있습니다. 최대 10MB·2,400만 화소를 지원하고, 앱이 복사하므로 원본 파일을 옮겨도 유지됩니다. 직접 선택한 이미지는 자동 가져오기에서 덮어쓰지 않습니다. **자동 포스터로 되돌리기**로 이전 자동 포스터를 다시 사용합니다.

기본 자동 가져오기는 이미 저장된 포스터를 건너뜁니다. **저장된 TMDB 포스터도 새로 받기**를 체크하면 자동 포스터만 갱신합니다. 진행 중 중지할 수 있고, 이미 저장한 이미지는 유지됩니다. 네트워크·인증·요청 한도 오류는 전체 작업을 중단해 반복 요청을 피합니다. 키가 없어도 기존 기록 기능과 직접 이미지 선택은 사용 가능합니다.

이미지는 최대 500×750 JPEG로 정규화하여 로컬 SQLite에 저장합니다. 재시작과 오프라인에서도 사용하며, 네트워크 요청은 가져오기 버튼을 눌렀을 때만 실행합니다. API 키는 Electron `safeStorage`로 암호화하여 저장하며 렌더러에 다시 반환하지 않습니다. Windows에서는 현재 사용자 계정의 보안 저장소에 연결됩니다. 키 삭제는 이미 받은 포스터를 지우지 않습니다.

**감상 기록 JSON 백업에는 포스터와 API 키가 포함되지 않습니다.** 복원해도 현재 기기의 포스터 설정은 바뀌지 않습니다. 다른 기기에서는 키를 다시 입력해 자동 포스터를 받거나 원하는 이미지를 다시 선택하세요. 사용자 이미지 원본은 별도로 보관하세요.

## 내 데이터와 백업

데이터는 Electron Main의 SQLite에만 저장합니다. 기본 Windows 경로는 `%APPDATA%\Marvel Marathon\`입니다.

| 용도               | 파일 / 폴더                              |
| ------------------ | ---------------------------------------- |
| 개발·빌드 미리보기 | `marvel-marathon.development.sqlite3`    |
| 패키지 실행        | `marvel-marathon.sqlite3`                |
| 복원 전 자동 사본  | `recovery-backups/before-restore-*.json` |
| 창 위치·크기       | `window-state.*.json`                    |

WAL/FK/트랜잭션을 사용하고 카탈로그를 다시 동기화해도 감상 기록은 초기화하지 않습니다. 앱을 실행한 채 SQLite 파일 하나만 복사하면 WAL에 남아 있는 변경을 놓칠 수 있으므로 설정의 **백업 내보내기**를 이용하세요.

백업 가져오기는 현재 기록 전체를 교체합니다. 파일 형식·크기(10 MiB)·ID·날짜·평점·리뷰·중복을 먼저 검증하고, 사용자 확인 후 기존 기록의 복구용 JSON을 저장한 다음 트랜잭션으로 교체합니다. 취소나 검증 실패 시 기존 데이터는 유지됩니다. 복구용 사본도 같은 가져오기 메뉴에서 선택할 수 있습니다.

테스트는 임시 디렉터리를 사용하며 실제 사용자 DB를 열지 않습니다. Electron 테스트 전용 경로는 `MARATHON_TEST_MODE=1`과 `MARATHON_USER_DATA_DIR=<절대 경로>`를 함께 지정해야 적용됩니다.

## 구조와 보안

- `electron/main.ts`: 기존 템플릿의 창 복원·로깅·생명주기, DB 초기화.
- `electron/db/repository.ts`: SQLite 마이그레이션, seed, 감상 CRUD.
- `electron/services/backup-service.ts`: 검증·원자적 백업 파일 쓰기·복원.
- `electron/services/poster-service.ts`, `tmdb-client.ts`, `poster-image.ts`: TMDB 검색, 다운로드 중지·진행률, 이미지 검증·정규화, 캐시.
- `electron/ipc-marathon.ts`, `electron/security.ts`, `electron/preload.ts`: 발신 창/frame/URL 검사와 명시적 타입 API.
- `src/shared/`: 38편 카탈로그, DTO, 검증, 공통 통계.
- `src/renderer/`: 한국어 UI, HashRouter, 공통 상태와 접근 가능한 입력폼.
- `tests/`: 도메인·저장 통합·보안 및 실제 Electron UI 자동화.

`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`를 유지합니다. 렌더러에는 원시 IPC·파일 경로·DB 접근을 공개하지 않으며 외부 이동과 창 생성을 제한합니다. SQLite는 Electron 내장 모듈을 사용해 별도 네이티브 애드온 재빌드가 필요 없습니다.

## 범위와 출처

**비공식 개인 팬 프로젝트**이며 Marvel 또는 Disney와 관련된 공식 제품이 아닙니다. 기본 커버와 앱 아이콘은 직접 만든 추상 그래픽이며 영화명은 작품 식별용입니다. 영화 포스터를 배포본에 미리 포함하지 않고, 사용자가 키를 등록한 후 TMDB에서 가져오거나 직접 고릅니다. 포스터의 권리는 각 권리자에게 있습니다.

TMDB의 [공식 로고](https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg)를 변경 없이 `public/tmdb-logo.svg`에 포함하고 설정의 앱 정보에 출처와 고지문을 표시합니다. **This product uses the TMDB API but is not endorsed or certified by TMDB.** 비상업용 API는 출처 표기를 조건으로 무료이며, 상업용 이용은 별도 조건을 확인해야 합니다. [TMDB FAQ](https://developer.themoviedb.org/docs/faq)

카탈로그 기준은 2026-11-05, 38편, Phase별 6/6/11/7/6/2편입니다. 미개봉 Avengers 작품은 제외합니다. [Disney+ 개봉순 안내](https://www.disneyplus.com/explore/articles/marvel-movies-in-order), [Sony Pictures의 Brand New Day](https://www.sonypictures.com/movies/spidermanbrandnewday)를 대조했습니다.

원본 템플릿: [Road-Glide/electron-vite-react-ts](https://github.com/Road-Glide/electron-vite-react-ts). 원본 MIT 라이선스와 Chris Ham의 저작권 표기를 [LICENSE](LICENSE)에 보존합니다.

세부 기준은 [제공 명세](docs/implementation-spec.md), 선택 이유는 [구현 기록](docs/implementation-notes.md), 실제 검증 결과는 [검증 보고서](docs/validation.md)를 참고하세요. 포스터·사용자 커버는 후속 사용자 요청으로 추가했습니다. 한국어 공식 영화명·CSV·클라우드 동기화는 포함하지 않았습니다.
