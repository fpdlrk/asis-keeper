# ASIS 원본 보관함

변경 전(ASIS) 원본을 화면별로 잠가 보관하고, 변경 후(TOBE)와 비교해 고객 전달용 보고서를 만드는 오프라인 도구입니다.

## 실행
`index.html`을 Chrome 또는 Edge로 엽니다(더블클릭). 서버나 설치가 필요 없고, 폴더 전체(`css/`, `js/` 포함)를 함께 옮기면 됩니다.

## 폴더 구조

| 파일 | 내용 |
|---|---|
| `index.html` | 화면 골격(상단·사이드바·본문·오른쪽 영역), 모달 마크업, 스크립트 로드 순서 |
| `css/app.css` | 앱 스타일. 1 토큰 → 2 기본 요소 → 3 레이아웃 → 4 트리 → 5 대시보드 → 6 화면 → 7 SQL 블록 → 8 파일 → 9 저장 바 → 10 비교 → 11 모달 → 12 반응형 |
| `js/vendor/ace-bundle.js` | Ace 편집기(BSD-3). 직접 수정하지 않음 |
| **기반** | |
| `js/constants.js` | 고정값: 상태 목록, 파일 위치, 표 열, 아이콘 |
| `js/state.js` | 앱 상태 `app` (루트, 열린 화면, 탭, 필터) |
| `js/utils.js` | DOM·글자·날짜·알림 도우미 (`$`, `createButton`, `escapeHtml`, `formatDay`, `toast` …) |
| `js/settings.js` | 브라우저 설정 저장(IndexedDB) `settings.get/set`, 설정 키 `SETTING_KEYS` |
| `js/fs.js` | 폴더·파일 읽기/쓰기, 해시, 경로 정리 |
| `js/screen-data.js` | 화면 폴더 데이터 읽기: 화면 찾기, SQL 블록 읽기, 원본 변경 확인 `findChangedFiles` |
| `js/sql.js` | SQL 도우미: 쿼리 나누기 `splitSqlStatements`, 공백·대소문자 무시 비교 `isSameText` |
| **기능** | |
| `js/dialog.js` | 입력 창 `askText`, 확인 창 `askConfirm`, 처리 중 표시 `withBusy`, 메뉴 `showMenu` |
| `js/migrate.js` | 예전 파일 구조(파일명만) → 원본 경로 구조 자동 변환 |
| `js/tree.js` | 루트 폴더 선택, 화면 트리·검색·상태 필터, 폴더 메뉴(추가·이름 변경·이동), 상단 위치 표시 |
| `js/dashboard.js` | 첫 화면(안내 / 현황 대시보드·점검 필요·최근 변경) |
| `js/diff.js` | 줄 단위 비교, 나란히 보기 표, 비교 창, 비교 탭 |
| `js/screen.js` | 화면 상태 · 열기 · 그리기 · 편집기 · 탭 · 변경 감지(저장 바 표시) |
| `js/screen-blocks.js` | SQL 블록 · 기존과 나란히 보기(바뀐 줄 표시, 스크롤 연동) · 신규 SQL 변경 이력 |
| `js/screen-files.js` | 파일 목록 · 끌어다 놓기 · 저장 경로 · 신규/수정/동일 표시 |
| `js/screen-save.js` | 등록 · 잠그기 · 상태 변경 · 원본 무결성 표시 · 화면 이벤트 연결 |
| `js/report.js` | 보고서 생성(보고서 CSS 포함) |
| `js/fonts.js` | 글꼴 설정 |
| `js/main.js` | 시작점: 브라우저 검사 후 각 파일의 `init*()` 호출 |

## 상태 모델
- `app` — 앱 전체 상태 (`js/state.js`)
  - `app.root` 루트 폴더 핸들, `app.tab` 보고 있는 탭, `app.statusFilter` 상태 필터, `app.statusCounts` 상태별 화면 수
  - `app.screen` 열려 있는 화면. 현황일 때는 `null`. 구조는 `createScreenState()`(`js/screen.js`) 참고
- 편집기 id 규칙: 글 입력란은 `TEXT_FIELD_FILES`의 키(`memo` 등), SQL 블록은 접두어 + 블록 id
  - `a:` 기존 SQL, `t:` 신규 SQL, `p:` 신규 탭 왼쪽의 기존 SQL(읽기 전용), `r:` 예전 롤백 SQL
  - 직접 문자열을 만들지 말고 `editorId('tobe', blockId)`를 씁니다.
- 변경 감지: 처음 그릴 때와 등록할 때 값을 `app.screen.savedValues`에 기억하고, 지금 값과 비교합니다(`isDirty`).

## 코드 규칙
1. **스크립트 구조**: `file://`에서는 ES 모듈(`import`)을 쓸 수 없어 일반 `<script>`를 `index.html`에 적힌 순서대로 읽습니다.
   - 각 파일 최상위의 `const`/`let`/`function`은 모든 파일이 공유합니다. **이름이 겹치면 안 되고**, `window` 기본 속성 이름(`screen`, `status`, `name`, `history`, `closed` 등)도 피합니다.
   - 파일을 읽는 순간 실행되는 코드는 두지 않습니다. 이벤트 연결은 각 파일의 `init*()` 안에서 하고, `main.js`가 순서대로 부릅니다.
   - 새 파일은 `index.html`의 스크립트 목록에서 그 파일이 쓰는 파일보다 뒤, `main.js`보다 앞에 넣습니다.
2. **이름**: 무엇인지 알 수 있는 이름을 씁니다. 한 글자 변수나 줄임말(예: `ed`, `kv`, `m`)은 쓰지 않습니다.
3. **주석**: 파일 머리에 역할을, 함수마다 하는 일·인자·반환값을 적습니다. 왜 그렇게 했는지가 필요하면 이유도 남깁니다.
4. **공통 함수**: 두 번 이상 쓰는 로직은 공통 함수로 만듭니다. 새로 만들기 전에 `utils.js`, `fs.js`, `screen-data.js`, `dialog.js`에 이미 있는지 먼저 봅니다.
5. **브라우저 기본 창 금지**: `alert`/`confirm`/`prompt` 대신 `askText`/`askConfirm`/`toast`를 씁니다.
6. **오래 걸리는 작업**: 파일을 읽고 쓰는 작업은 `withBusy('…하는 중…', async () => { … })`로 감싸 다른 조작을 막습니다. 확인 창은 `withBusy` 바깥에서 띄웁니다.
7. **HTML에 넣는 글자**: 사용자가 입력한 값은 반드시 `escapeHtml()`을 거칩니다.

## 데이터 폴더 구조 (루트 아래 화면 폴더마다)
```
meta.json                 상태·티켓·작업자·원본 위치·상태 이력·SQL 블록 목록·ASIS 해시
memo.md                   비고/메모
asis/sql/*.sql            기존 SQL (등록하면 잠김)
asis/files/<원본 경로>    기존 파일 (등록하면 잠김)
tobe/sql/*.sql            신규 SQL
tobe/files/<원본 경로>    신규 파일
tobe/history/*            신규 SQL 이전 버전
service/ object/ code/    정의서
attach/                   참고 파일
```
루트에는 `.reports/`(보고서), `.migration/`(구조 변환 기록)이 생깁니다.
