# 작업 인계 문서 (HANDOFF)

다른 환경에서 Claude(또는 다른 사람)가 이어서 작업할 때 읽는 문서입니다.
프로젝트 자체의 구조·규칙은 **`README.md`가 원본**입니다. 이 문서는 **"지금까지 무엇을 왜 바꿨고, 무엇이 남았는지"** 만 다룹니다.

- 작성 시점: 2026-10-26 (1차) · **2026-10-27 갱신 (2차)**
- 1차 작업(아래 1장): `82ccc06`, `0e041fa`로 커밋됨
- 2차 작업(아래 2장): **아직 커밋하지 않은 워킹트리 상태** — 커밋은 사용자가 직접 합니다(Claude 는 커밋하지 않음)
- 실행: `index.html`을 **Chrome 또는 Edge로** 엽니다(더블클릭). 서버·빌드·설치 없음

---

## 0. 먼저 읽을 것

| 순서 | 파일 | 이유 |
|---|---|---|
| 1 | `README.md` 의 **코드 규칙 0번** | 이 저장소의 최상위 원칙(사람이 읽고 고칠 수 있는 코드) |
| 2 | `README.md` 전체 | 폴더 구조, 상태 모델, 데이터 포맷, SQL 탭·이력 |
| 3 | 이 문서 | 최근 작업 내역과 남은 일 |

### 반드시 지킬 것 (어기면 앱이 통째로 깨집니다)

- **ES 모듈 금지.** `file://`에서 `import`가 막혀, 모든 `js/*.js`는 일반 `<script>`로 읽히고 **전역 네임스페이스를 공유**합니다.
  - 파일 간 **이름이 겹치면 즉시 깨집니다.** 새 전역을 만들면 아래 명령으로 확인하세요.
  - `window` 기본 속성 이름(`screen`, `status`, `name`, `history`, `closed`)을 전역으로 쓰지 마세요.
- **파일을 읽는 즉시 실행되는 코드 금지.** 선언만 두고, 실행은 `main.js`의 `boot()` → 각 파일의 `init*()`.
- 새 파일은 `index.html` 스크립트 목록에서 **그 파일이 쓰는 파일보다 뒤, `main.js`보다 앞**에.
- 사용자 입력을 HTML에 넣을 땐 **반드시 `escapeHtml()`**.
- `alert`/`confirm`/`prompt` 금지 → `askText`/`askConfirm`/`toast`.
- `js/vendor/*.js`(Ace)는 직접 고치지 않습니다.

### 변경 후 검증 (이 저장소엔 테스트가 없습니다)

```bash
# 1) 문법
for f in js/*.js; do node --check "$f" >/dev/null 2>&1 || echo "SYNTAX ERROR: $f"; done

# 2) 파일 간 전역 이름 충돌 (이 코드베이스에서 가장 위험한 지점) — 출력이 없어야 정상
grep -rhoE "^(const|let|var|function|async function) +[A-Za-z_$][A-Za-z0-9_$]*" js/*.js \
  | sed -E 's/^(const|let|var|function|async function) +//' | sort | uniq -d

# 3) 지운 함수·요소를 아직 참조하는 곳이 없는지
grep -rn "지운이름" js/ index.html
```

**자동 테스트가 없으므로 문법 통과 = 동작 확인이 아닙니다.** 아래 "확인 필요" 항목은 Chrome에서 직접 눌러 봐야 합니다.

---

## 1. 1차 작업 (7가지, 커밋됨)

### ① 기존(ASIS) 잠금 풀기 — 사유 필수 + 해제 이력

**배경**: 등록 후 잠그면 되돌릴 수 없어, 잘못 등록한 내용을 고칠 방법이 없었음.

- 잠긴 안내 띠 오른쪽의 `ASIS 원본 일치` 배지(`#integrity2`)를 **`[잠금 풀기]` 버튼**으로 교체
  (무결성 배지는 원래 상단 작업 정보 줄 `#integrity`에 같은 내용이 있어 정보 손실 없음 → `#integrity2`는 완전히 제거됨)
- 클릭 → `askText`로 **사유 필수**(`MIN_UNLOCK_REASON_LENGTH = 5`자 이상)
- 사유는 `meta.asisUnlockLog = [{at, by, reason, relockedAt}]`에 누적, **지우는 기능 없음**
- 해제 이력이 있으면 기존 SQL 탭에 **띠가 하나 더** 표시(전체 이력 목록)
- 다시 잠글 때(`registerAsis`) **해시를 지금 내용으로 재계산**(`hashAsisFiles`) + 마지막 이력에 `relockedAt` 기록
- `meta.asisSavedAt`(최초 등록 시각)은 **다시 잠가도 바뀌지 않음**

**파생 수정(중요)**: 해제 상태를 사실과 다르게 출력하던 두 곳을 함께 고침
- `dashboard.js` 점검 필요 → `잠금 해제 중` 항목 신설 (이전엔 "ASIS 없음"으로 잘못 집계)
- `report.js` 원본 무결성 → `잠금 해제 상태 (다시 등록되지 않음) · 잠금 해제 N회`
  **사유 전문은 고객 전달용 보고서에 넣지 않음**(횟수만). 앱 화면에만 남김

주요 함수: `unlockAsis` / `showAsisAsUnlocked` / `setAsisEditorsReadOnly` / `closeLastUnlockEntry` / `hashAsisFiles` (`screen-save.js`),
`unlockLogBannerHtml` / `wasAsisUnlocked` (`screen.js`)

### ② SQL 블록 제목 대문자 강제

- 화면 표시가 아니라 **저장값까지 대문자**(CSS `text-transform` 미사용 — 그러면 `meta.json`엔 소문자가 남음)
- `toBlockTitle()` 규칙 하나로 모으고 **제목이 들어오는 모든 경로**에 적용: 직접 입력 · 붙여넣기 자동 분리 · `readBlockInputs()` · (2차) [+ SQL 추가] 창
- 입력 중 변환은 **커서 자리 유지 + 값이 바뀔 때만 대입** → 한글 IME 조합이 끊기지 않음 (`forceUpperCaseTitle`)
- 기존에 저장된 소문자 제목은 일괄 변경하지 않음(그 블록을 손댈 때 바뀜)

### ③ 좌측 트리: 메뉴 복사 + 폴더(묶음) 개념 + 컨텍스트 메뉴 정비

**메뉴 복사**: 이동 창(`#moveModal`)을 `mode: 'move' | 'copy'`로 공용화
- 이름 자동: `사원조회` → `사원조회_COPY`, 중복이면 `_COPY2`, `_COPY3`… (`uniqueCopyName`)
- 위치를 고르는 순간 **확정될 이름을 미리 표시**
- 복사는 **현재 위치도 선택 가능**(이동은 불가)
- 창에 체크박스: `작업 기록(상태 · 상태 이력 · ASIS 잠금)까지 그대로 복사` — **기본 해제**
  해제 시 `resetCopiedWorkLog()`가 복사본의 모든 `meta.json`을 '요청' 상태로 초기화하고 `asisLocked`/`asisSavedAt`/`hashes`/`asisUnlockLog` 제거
  (2차부터 SQL 이력 `sqlBlocks[].log`도 제거)
  (이유: 등록 기록까지 복제되면 현황 대시보드와 운영 반영률이 같은 작업을 두 번 셈)

**폴더(묶음) 개념**: `meta.json` 유무로 화면/폴더가 갈립니다. 데이터 모델은 원래 이걸 지원했고 **만드는 UI만 없었음**
- `하위 폴더 추가`(`addSubFolder`) 신설 — `meta.json`을 만들지 않음
- 트리에서 폴더는 **폴더 아이콘 + 굵은 이름**, 비어 있어도 폴더로 표시(`isFolder = !isScreen || hasChildren`)
- **VS Code 규칙**: 화면(메뉴)은 파일과 같은 끝 노드 → 하위 추가 불가 + **이동·복사 위치 목록에서도 제외**
  (`collectMoveDestinations`가 `meta.json` 있는 폴더를 건너뜀)
- 파생: 폴더가 하나도 없으면 이동 창이 "전부 비활성인 빈 창"이 되므로, 그 경우 창을 열지 않고 안내

**컨텍스트 메뉴 최종 형태**:

| 항목 | 화면(메뉴) | 폴더 | 루트(사이드바 빈 곳) |
|---|---|---|---|
| 하위 폴더 추가 | — | ✓ | ✓ |
| 하위 메뉴 추가 | — | ✓ | ✓ |
| 탐색기 경로 복사 | ✓ | ✓ | ✓ |
| 메뉴 복사 | ✓ | — | — |
| 이동 | `메뉴 이동` | `폴더 이동` | — |
| 이름 변경 | ✓ | ✓ | — |
| 루트 경로 다시 설정 | — | — | ✓ |

- 라벨 `폴더 경로 복사` → **`탐색기 경로 복사`**(메뉴 복사와 헷갈려서)
- **루트 메뉴는 좌측 사이드바의 빈 공간 우클릭**에서만 열립니다(루트는 트리에 노드로 그려지지 않음)

### ④ 메뉴에 아이콘

- `MENU_ICON` (`constants.js`): `folderAdd` `pageAdd` `clipboard` `copy` `move` `rename` `settings` `compare` `trash` `check` `folderOpen` `key`
- `showMenu` 항목 튜플 확장: `[문구, 함수, 'danger', 아이콘HTML, 오른쪽꼬리말]`, `'-'` 하나면 구분선
- `showMenuBelow(button, items, align)` — `'left'` 추가(상단 왼쪽 단추용)
- 아이콘 HTML은 `MENU_ICON` 고정값만 들어가고 문구는 `escapeHtml` 통과

### ⑤ 잠금 해제 이력 띠 문구 축소 + `.banner` 여백

- 머리글(`잠금 해제 이력 N회`)과 설명문 제거 → 아이콘 + 목록만
- `.banner` `padding: 12px 14px → 6px 14px`, `margin-bottom: 14px → 4px` (**공용 클래스라 다른 띠도 함께 얇아짐**)

### ⑥ 프로젝트(루트 폴더) 여러 개 — 신규 파일 `js/project.js`

**배경**: `루트 폴더 선택` 버튼 하나뿐이라 프로젝트를 바꿀 때마다 폴더 피커에서 경로를 다시 찾아야 했음.

- 상단 **왼쪽**(브랜드 옆)에 전환 드롭다운 `#btnProject`. 기존 `#btnPick`·`#btnResume` 제거
- 저장: `projects = [{id, name, handle, lastOpenedAt}]`, `lastProjectId`
- **`id`는 폴더 이름과 무관한 고유 값** → `closed:<id>`, `rootPath:<id>`
  **(기존 버그 수정)** 이름이 같은 다른 폴더끼리 접힘 상태·탐색기 경로가 섞이던 문제
- `name`은 별명(폴더 이름과 달라도 됨) → `rootLabel()`이 상단·브레드크럼·보고서 표지·보고서 기본 제목에 사용
- **권한**: 세션이 끊기면 폴더 권한이 풀림. `requestPermission()`은 **클릭 안에서만** 가능
  → 시작 시엔 `queryPermission`이 granted일 때만 자동으로 열고, 아니면 단추에 🔑 표시.
  목록에서 고르는 순간 허용 요청. **이 상태가 `app.project`는 있고 `app.root`는 `null`인 구간**
- 기존 사용자 데이터는 `migrateLegacyProject()`가 첫 실행 때 자동 이전
- `목록에서 제거`는 목록과 그 프로젝트 설정만 지움(폴더·파일은 그대로)
- 제거·전환·추가 모든 경로에 `confirmLeaveScreen()` 적용
- `settings.remove()` 신설

삭제된 함수: `pickRootFolder` `resumeRootFolder` `restoreLastRoot` (tree.js)

### ⑦ 기존↔신규 SQL 짝을 **명시적 연결**로 (index 기준 폐기)

**배경**: 짝을 **순서(index)** 로 찾고 있어서, 신규 쿼리 하나를 중간에 끼우면 그 뒤가 전부 밀려 엉뚱한 쌍이 됐음.

- `meta.sqlBlocks.tobe[].asisId` 신설
  - `'<기존 블록 id>'` → 그 블록과 비교
  - `''`(`NO_ASIS_PAIR`) → 짝 없음 = 신규 쿼리. **왼쪽 칸이 숨겨지고 신규 SQL만 넓게**(`.blk.no-pair`)
  - **값 없음** → 예전 데이터, 같은 순서(선택 상자에 `자동(순서)` 표시). **다음 등록 때 실제 값으로 굳음**
- **새 블록은 `없음(신규 쿼리)`에서 시작**
- 선택 상자는 **블록 머리**(`.blk-h`)에 둡니다. 왼쪽 칸(`.pane-l`)은 `없음`일 때 숨겨지므로
  **그 안에 두면 다시 고를 수 없게 됩니다** — 실제로 한 번 그렇게 만들었다가 고쳤습니다
- 짝 찾기는 `findPairedAsisBlock()`(`screen-data.js`) **한 곳**으로 모음 →
  나란히 보기 · 비교 탭 · 비교 창 · 보고서 · `기존 SQL 가져오기`가 전부 이 함수를 사용
- 비교 탭·보고서가 **`변경` / `신규 쿼리` / `신규에 없음`** 3분류로 구분

---

## 2. 2차 작업 (2026-10-27, 아직 커밋 안 함)

### ⑧ 마우스를 올리면 나타나는 복사 아이콘 + ⋯ 메뉴의 '복사' 제거

- SQL 편집기 오른쪽 위, SQL 제목칸 오른쪽 끝에 복사 아이콘(`.copy-hover`) — `hoverCopyButtonHtml()` (`screen.js`)
  - 편집기: `createEditor`가 Ace 편집기를 만든 뒤 `data-copy-ed="<편집기 id>"` 버튼을 붙임 → `copyEditorText`
  - 제목칸: `.bt`를 `.bt-wrap`으로 감싸고 `data-copy-title` 버튼 → `copyBlockTitle` (`screen-blocks.js`)
    **신규 SQL 제목에만** 붙임(`blockTitleHtml(block, disabled, withCopy)`, `.bt-wrap.has-copy`). 기존 SQL 제목의 복사 아이콘은 사용자 요청으로 뺌
- 신규·기존 블록 ⋯ 메뉴에서 '복사' 항목 삭제. 글 입력란(메모 등)의 [복사] 버튼은 그대로 둠
- **잠긴 기존 SQL 블록 머리의 [복사] 버튼도 삭제**(편집기 복사 아이콘과 겹침). 이제 잠그면 ⋯ 메뉴를 지우기만 하고(`showAsisAsLocked`), 풀면 `asisBlockMenuHtml`로 다시 붙임(`showAsisAsUnlocked`) — 예전의 [복사] ↔ ⋯ 바꿔 끼우기는 없어짐

### ⑨ SQL 자동완성 — 신규 파일 `js/sql-complete.js`, `js/vendor/ace-ext-language_tools.js`

- SQL 문법 색칠은 원래부터 `ace/mode/sql`로 되어 있었음(바꿀 것 없음)
- 자동완성 모듈이 기존 `ace-bundle.js`에 없어서 **같은 버전(1.45.2)의 공식 `ext-language_tools.js`** 를 별도 파일로 추가
  (`ace-bundle.js`는 손대지 않음. 필요한 의존 모듈은 묶음에 모두 있음. 네트워크 요청 없음)
- 제안 두 가지: **이 화면 SQL 에 나온 이름**(테이블·컬럼, 위쪽) + **SQL 키워드**(친 글자가 대문자면 대문자로)
- 두 글자 이상이면 저절로, Ctrl+Space 로 언제든. 비교용(`p:`) 편집기는 제외
- **스니펫(`enableSnippets`)은 켜지 않음** — 켜면 스니펫 파일을 따로 읽으려 하는데 `file://`에서는 못 읽음
- 목록이 떠 있을 때 Enter 는 제안을 입력함(Ace 기본)

### ⑩ 기존·신규 탭의 '기존 파일 / 신규 파일' 영역 제거

- 파일은 **첨부 탭에서만** 올림. 기존·신규 탭의 올리기 영역과 목록(`#list-asis`, `#list-tobe`)을 뺌
- **예전에 올린 `asis/files`·`tobe/files`는 그대로** — 비교 탭·보고서·원본 무결성 확인·해시 계산에서 계속 읽힘(읽는 코드는 남겨 둠). 화면에서 보거나 지울 수는 없음
- 그 자리에 한때 탭 단위 '작업 이력'(`meta.workLog`)을 넣었으나 ⑪의 **SQL 마다 쌓는 이력으로 대체해 제거**함. `workLog`는 어디에도 쓰지 않음

### ⑪ SQL 을 탭으로 — 신규 파일 `js/screen-sqltabs.js`

**배경**: SQL 블록을 세로로 이어 붙이다 보니 몇 개만 넣어도 보기 불편하고, 다른 SQL 을 잘못 고칠 위험이 있었음.
사용자와 정한 방식: **가로 탭 + 넘치면 스크롤 + [▾ 전체] 목록 단추**, 이력은 **SQL 마다 따로**.

- **SQL 하나 = 탭 하나.** 고른 탭의 블록만 `.blk.on`으로 보이고 나머지는 숨김
  - **설계 핵심**: 블록은 모두 DOM 에 그대로 둠 → `readBlockInputs`(화면 순서대로 읽기)를 쓰는 등록·비교 탭·보고서·짝 찾기 코드를 **하나도 고치지 않음**
  - 지금 보는 탭: `app.screen.activeBlock = {asis, tobe}`. '변경 취소'로 다시 불러와도 유지(`openScreen` reload)
  - 숨어 있던 Ace 편집기는 보일 때 `resize(true)` 필요(`activateSqlTab`)
- 탭 줄(`renderSqlTabs`): 알약 모양(화면 탭과 구분) · 넘치면 좌우 스크롤(휠도 가로로) · 오른쪽 **[▾ 전체 n]** 목록 메뉴 · **[+ SQL 추가]**
  - 탭 × 로 삭제(`deleteSqlBlock`, 확인 창). 잠긴 기존 SQL 은 × 와 [+ SQL 추가] 없음
  - 등록하지 않은 변경이 있는 탭에 ● (`refreshSqlTabMarks` ← `refreshIndicators`가 입력마다 부름). 본문 제목을 고치면 탭 이름도 바로 바뀜
  - 잠그기·잠금 풀기(`showAsisAsLocked`/`showAsisAsUnlocked`)는 예전처럼 추가 단추를 직접 넣고 빼지 않고 `renderSqlTabs('asis')`를 부름
- **[+ SQL 추가] 창**(`#sqlAddModal`, `askNewSqlBlock`): 이름·SQL **필수**, 비교할 기존 SQL(신규만, 기본 '없음'), 이력(선택). Ctrl+Enter 로 추가, Esc 로 닫기
  - 창은 **처음 추가할 때만**. 수정은 탭 본문에서
  - 추가한 SQL 은 다른 입력처럼 저장 바 [등록](기존은 '등록 후 잠그기')으로 저장
  - 창의 SQL 편집기도 색칠·자동완성 됨. 단, 창 안에서는 '여러 SQL 붙여넣기 → 나누기'를 하지 않음(탭 본문 편집기에서는 됨 → 탭 여러 개로 나뉨)
- SQL 이 하나도 없으면 **빈 블록을 자동으로 만들지 않고** 안내만 보여 줌 (예전엔 빈 블록 하나로 시작)
- 편집기 기본 높이 `SQL_EDITOR_HEIGHT` 260 → 400px (한 번에 하나만 보이므로)
- Ace 설정을 `sqlEditorOptions()`(`screen.js`)로 모음 — 화면 편집기와 추가 창 편집기가 함께 씀
- 메뉴 높이가 화면을 넘지 않게 `#ctx`에 `max-height: 70vh` + 스크롤 (SQL 이 많을 때 [▾ 전체] 목록용)

**SQL 마다 쌓는 이력** (탭 본문 아래)
- 저장: `meta.sqlBlocks.{asis|tobe}[].log = [{at, by, text}]`. 목록은 최근 것이 위, 한 항목은 두 줄(윗줄 `날짜 · 작업자`, 아랫줄 내용 — `logItemsHtml`)
- **이미 등록된 SQL** → [이력 저장]/Ctrl+Enter 즉시 `meta.json`에 저장(잠긴 기존 SQL 도 가능 — 원본 SQL·해시와 무관)
- **등록 전 SQL** → 화면(`block.log`)에만 있다가 그 SQL 을 등록할 때 `blockLogOf(block)`로 함께 저장(`registerAsis`, `saveTobeBlocks`)
- 고치기·지우기 없음. SQL 을 삭제하면 이력도 사라짐
- 작업자 이름은 `currentWorkerName()`(`screen-save.js`)로 모음 — 상태 이력·잠금 해제 이력·SQL 이력이 함께 씀

### ⑫ 지워진 폴더 처리

**배경**: 탐색기에서 폴더를 지워도 앱에 그대로 남아 있었음. 브라우저가 기억한 폴더 핸들은 폴더를 지워도 남고, 권한도 'granted'로 나오기 때문.

- `folderExists(handle)` (`fs.js`): 실제로 읽어 봐서 확인. **`NotFoundError`일 때만 없다고 봄**(권한 등 다른 오류로 목록에서 지우지 않게)
- 프로젝트 폴더가 없으면 → '폴더가 없습니다' 안내 + 목록·설정에서 제거(`dropMissingProject` → `forgetProject`)
  - 시작할 때(`restoreLastProject`), 목록에서 고를 때(`openProject`), 창으로 돌아올 때 확인
- 창 포커스(`window focus` → `recheckFolders`, `tree.js`): 루트가 없으면 위처럼, 열어 둔 화면 폴더가 없으면 닫고 현황으로, 그 밖엔 트리를 다시 그림(탐색기에서 지우거나 추가한 메뉴 반영). 처리 중이거나 창이 떠 있으면 건너뜀
- 지워진 메뉴를 누르면(`openScreen`) 오류 대신 안내 후 다시 확인
- `removeProject`의 목록·설정 삭제 부분을 `forgetProject`로 꺼내 함께 씀

### ⑬ 신규 SQL 탭의 [기존과 나란히 / 신규만] 단추 제거

**배경**: 블록 머리의 '비교할 기존 SQL' 선택 상자에서 '없음'을 고르면 이미 왼쪽 칸이 숨고 신규 SQL 만 넓게 보임(`.blk.no-pair`). 화면 전체에 거는 단추와 블록마다의 선택이 겹쳐 헷갈렸음.

- 이제 짝이 있으면 늘 기존과 나란히, 없으면 신규만 — **블록마다의 선택 하나로 정함**
- 지운 것: 단추(`.seg [data-view]`), `tobeViewMode`, `setTobeViewMode`, 설정 키 `SETTING_KEYS.tobeView`(+ `main.js`에서 읽던 코드), CSS `.seg` · `.blocks.v-side` · `.blocks.v-solo`
- 좁은 화면(1100px 이하)에서 두 칸을 위아래로 쌓던 규칙은 `.blk-b` / `.pane-l`에 그대로 적용
- 예전에 브라우저에 저장된 `tobeView` 값은 읽지 않을 뿐 남아 있어도 문제없음

### ⑭ 표(오브젝트·코드분류)에 여러 칸·여러 줄 붙여넣기

**배경**: 엑셀·DB 도구에서 `LEM_TEST_0001   MT_TEST_0001   테스트입니다.` 같은 줄을 복사해 붙이면 한 칸에 통째로 들어갔음.

- `#main`의 `paste` → `handleGridPaste` (`screen-save.js`). 표(`table.grid`) 안 입력칸일 때만 동작
- 나누기(`parsePastedTable`): 칸은 탭, **어느 줄에도 탭이 없으면 공백 2칸 이상**(`GRID_PASTE_SPACE_SPLIT`). 끝의 빈 줄은 버림
- **덮어쓰기**(사용자가 고름): 붙여넣은 칸부터 오른쪽·아래로 채움. 줄이 모자라면 행 추가. 범위 밖의 기존 칸은 그대로
- 표의 칸 수를 넘는 값은 버리고 알림. 날짜 칸은 `toDateInputValue`로 `YYYY-MM-DD`로 바꾸고, 못 알아보면 비우고 알림
- 값 하나(탭·줄바꿈·연속 공백 없음)면 브라우저 기본 붙여넣기
- **Ctrl+Z 되돌리기 · Ctrl+Y / Ctrl+Shift+Z 다시 실행**(사용자 요청): 칸에 값을 직접 넣으므로 브라우저 되돌리기 기록에 안 남음 →
  표마다 `app.screen.gridPasteHistory[gridId] = {undo, redo}`에 표 모습(`gridSnapshot`)을 쌓음(최대 `MAX_GRID_PASTE_UNDO`=20)
  - 붙여넣기: 직전 모습을 undo 에, redo 는 비움(`rememberGridBeforePaste`)
  - Ctrl+Z / Ctrl+Y: `handleGridUndoRedo`가 한쪽에서 꺼내 그 모습으로 tbody 를 다시 그리고(`restoreGridSnapshot`), 바로 전 모습은 반대쪽에 넣음. 늘어났던 행도 함께 사라지고/생김
  - 해당 기록이 없으면 가로채지 않음 → 브라우저 기본 동작
  - 붙여넣은 뒤 그 표에 **직접 입력**하거나 **행 추가·삭제**를 하면 두 기록 모두 지움(`clearGridPasteUndo`).
    붙여넣기 이후에 고친 내용이 되돌리기로 함께 사라지지 않게 하기 위함
  - 붙여넣기 → Z → Z → Y → Shift+Z → Z → 새 붙여넣기(redo 비움) 순서를 가짜 표로 node 에서 돌려 확인함
- 나누기·날짜 변환은 예시 입력(공백 구분 한 줄/세 줄, 탭·빈 칸, 날짜 6가지 형식)으로 node 에서 확인함. 화면에서의 동작은 미확인

### ⑮ 서비스 · 오브젝트 · 코드분류 탭을 SQL 탭과 같은 UI 로 — 신규 파일 `js/screen-defs.js`

**배경(사용자 요청)**: 세 탭의 글 입력란(TEXTAREA)을 모두 표로 바꾸고, SQL 처럼 [+ 추가] → 탭, 탭마다 이력. "SQL 의 UI 를 그대로, 안의 내용만 다르게".
표의 세부 열은 아직 정해지지 않아 **임시안으로 진행하고 나중에 받기로 함**.

- 구조(사용자 확인): **탭 하나 = 항목 하나**(서비스 A, 서비스 B…), 탭 본문 = 이름 + 표 여러 개 + 이력
  - 서비스: 개요 · 속성정의 · 기능정의 / 오브젝트: 개요 · 속성 · 하위 오브젝트 / 코드분류: 개요 · 공통코드내역관리 · 시스템코드관리
  - 표 구성 `DEF_TABS`, 열 `GRID_COLUMNS['<탭>.<표 키>']` (`constants.js`). 오브젝트·코드분류 개요는 예전 열 그대로, **나머지 열은 임시안**
- [+ 서비스 추가] 등 창(`#defAddModal`, `askNewDefItem`): 이름 필수 · 이력 선택. 이름은 대문자로 바꾸지 않음(`.def-title` — SQL 제목만 대문자)
- 저장: 저장 바 [등록] → `<탭>/items.json` (`saveDefItems`). 변경 감지 `isDefTabChanged`/`refreshDefTabMarks`는 `defSignature`로 비교
  (칸 수를 열 수에 맞추고 공백·빈 줄을 정리 — 예전 표처럼 칸 수가 다른 값도 같으면 같다고 봄)
- **예전 데이터**(`loadDefItems`, `screen-data.js`): `items.json`이 없으면 예전 글·개요 표를 '기본' 항목(`LEGACY_DEF_ITEM`) 하나로 옮겨 보여 줌.
  글은 `splitTableText`(붙여넣기와 같은 규칙)로 나누고 넘치는 칸은 마지막 칸에 이어 붙임(`textToGridRows`). 등록된 것으로 봄(● 없음).
  항목을 다 지우고 등록하면 `[]`를 저장 → 예전 파일을 다시 옮기지 않음. 예전 파일은 지우지 않음
- 보고서: 항목마다 이름 + 내용 있는 표만(`definitionSectionHtml`). 이력은 넣지 않음. 검색(`matchesSearch`)은 `items.json`과 예전 파일을 함께 봄.
  메뉴 복사에서 '작업 기록까지 복사'를 끄면 `items.json`의 이력도 지움(`resetCopiedWorkLog`)

**함께 바꾼 공통 구조 (중요)**
- **알약 탭 공통화**(`screen-sqltabs.js`): 탭 줄 id(`asis`·`tobe`·`service`·`object`·`code`)로 SQL/정의서를 나눔(`isSqlTabBar`).
  `pillTabsBarHtml` · `renderPillTabs` · `markPillTab` · `markActivePillTab` · `showAllPillTabs` · `activatePillTab`/`deletePillTab`/`addPillTab`(넘겨주기).
  탭 줄 요소 id 가 `#sqltabs-<kind>` → **`#tabs-<id>`** 로 바뀜. 클릭 속성: `data-pill-tab` `data-pill-del` `data-pill-all` `data-pill-add` (+ `data-bid`)
- **항목 이력 공통화**: `itemLogHtml(scope, kind, item)`(scope `'sql'|'def'`), `saveItemLog` ← `findLogTarget`(등록된 항목·파일 쓰기 함수 찾기).
  속성 `data-log-save` `data-log-input` `data-log-scope` `data-kind`, 목록 `data-log-list="<scope>-<kind>-<id>"`. `sqlLogHtml`/`saveSqlLog`는 없어짐
- **표 공통화**: 같은 종류의 표가 여러 개 생기므로 `gridHtml(tableId, columnsKey, rows)` / `gridRowHtml(columnsKey, cells)`로 바꾸고
  표에 `data-cols`를 둠. 행 추가(`data-add`=표 id) · 삭제 · 붙여넣기 · Ctrl+Z/Y 기록(`gridPasteHistory[표 id]`)이 모두 표 id 기준.
  `readGridRows(gridId)` → `readGridRowsOf(table)`
- 지운 것: `GRID_FILES` `TAB_TEXT_FIELDS` `TAB_GRID_FIELDS` `textFieldHtml` `saveGrid` `screen.grids` `screen.savedGrids`, 글 입력란 7개
  (`TEXT_FIELD_FILES`·`TEXT_EDITOR_HEIGHTS`는 이제 메모만), `data-copy` 클릭 처리(쓰는 단추가 없어짐)
- 글을 줄·칸으로 나누는 규칙을 `splitTableText`(`utils.js`)로 옮김 — 표 붙여넣기(`parsePastedTable`)와 예전 글 옮기기가 함께 씀
- node 에서 확인함: 예전 글(공백 구분·탭 구분·넘치는 칸) → 표, 예전 개요 표 → '변경 없음', `items.json = []`이면 다시 옮기지 않음

### ⑯ 표(그리드) 고도화 — 신규 파일 `js/screen-grid.js`

**배경(사용자 요청)**: 칸마다 `<input>`이라 여러 칸을 드래그해 복사할 수 없었음. "드래그로 고른 칸을 `값<탭>값<탭>값` 줄 형태로 복사" + 키보드 조작 + 날짜 `20260101` → `2026-01-01`.

- 방식: `<input>` 표를 그대로 두고 그 위에 범위 선택을 얹음(외부 표 라이브러리는 쓰지 않음 — 붙여넣기·Ctrl+Z/Y·화면 모양과 따로 놀고, 코드 규칙 0번과 멀어짐)
- 범위: `gridSelection = {table, anchor, focus}` (모듈 전역). 표시는 `td.cell-sel`
  - 드래그: `document` mousedown → `gridDrag` 시작, mouseover 로 다른 칸에 들어가는 순간 시작 칸의 글자 선택을 멈추고(blur) 범위 모드,
    `body.grid-dragging`(user-select:none). mouseup 에 시작 칸으로 커서를 돌려 Ctrl+C·Delete·Shift+방향키를 바로 받게 함
  - Shift+클릭: 시작 칸 = 기존 범위의 시작 → 지금 커서 칸 → 누른 칸
- 키(`handleGridKeydown`, #main keydown): Ctrl+Z/Y(`handleGridUndoRedo`) → 범위 Ctrl+C/X(`writeClipboardText`) · Delete/Backspace(`clearGridSelectionCells`, 되돌리기 가능) · Esc
  → 방향키/Enter/Tab 이동(`focusGridCell`은 글자 전체 선택), Shift+방향키 범위 넓히기. ←→ 는 `isCaretAtEdge`일 때만(범위가 있으면 늘 칸 단위). `isComposing`(한글 조합 중)은 건드리지 않음
  - Enter 로 마지막 줄 아래로 가면 줄 추가(`appendGridRow` — 되돌리기 기록은 지우지 않음)
- 한 칸만 선택(범위 없음)일 때 Ctrl+C·Delete 는 브라우저 기본(글자 단위)
- 날짜 칸: `type="date"` 대신 글 입력칸 + `data-type="date"`. 칸을 떠날 때(`change`) `toDateInputValue`로 맞추고, 못 알아보면 그대로 두고 `.invalid`.
  `toDateInputValue`는 없는 날짜(2026-02-30, 13월)도 거름. 붙여넣기에서는 예전처럼 못 알아본 값을 비우고 알림
- 옮김: 행 추가·삭제, 붙여넣기(`parsePastedTable`·`handleGridPaste`), 되돌리기/다시 실행을 `screen-save.js`에서 이 파일로.
  `rememberGridBeforePaste` → `rememberGridState`(범위 지우기도 씀). `handleGridUndoRedo(e, table)`는 처리했으면 true 를 돌려줌.
  이벤트 연결은 `initGrids()`(`main.js`에서 `initScreen()` 다음에 부름). 표 입력 시 범위 풀기·기록 지우기는 `handleGridInput`
- node 에서 확인함: 범위 → 탭/줄바꿈 글(거꾸로 끌어도 같음), Tab 줄 넘김·표 끝, 위치 맞춤, ←→ 규칙, 날짜 7가지
- **엑셀처럼 칸에 바로 입력하는 모양**(사용자 요청): 입력 중인 칸은 칸 전체가 연한 파란색 + 옅은 파란 안쪽 선, 칸 사이 세로 줄.
  - **원인(중요)**: 표가 정의서의 `.fld` 안에 있어 `.fld input[type=text]`(흰 배경·테두리·포커스 시 어두운 테두리+그림자)가 표 입력칸에 걸렸음 →
    흰 입력칸이 칸 배경(범위 선택 파랑)을 가려 드래그해도 표시가 안 났고, 포커스 때 검은 테두리가 보였음
  - 해결: `table.grid input[type="text"]`(명시도 0,2,2 > `.fld input[type=text]` 0,2,1)로 테두리·배경·그림자를 모두 없애 투명하게. `:focus`도 같은 방식으로 덮음
  - 칸 색은 `td`에: `table.grid td:has(> input:focus)` — `:focus-within`을 쓰면 행 삭제(✕) 칸도 파래져서 입력칸에 커서가 있을 때만으로 좁힘
  - 색은 `:root` 토큰 `--grid-focus-bg` · `--grid-focus-line` · `--grid-sel-bg`

### ⑰ 알약 탭 줄이 넘칠 때 — 스크롤바 숨김 + ‹ › + 흐림 + 끌어서 스크롤

**배경(사용자 요청)**: 탭을 많이 추가하면 가로 스크롤바가 생겨 UI 가 틀어짐. 사용자와 정한 방식: '숨긴 스크롤바 + 양 끝 ‹ › + 흐림 표시' + '끌어서 스크롤'.

- 공통 탭 줄(`screen-sqltabs.js`)이라 SQL · 서비스 · 오브젝트 · 코드분류 모두 적용
- 탭 줄 모양: `.pilltabs-scroll` 안에 `[‹] .sqltabs-list [›]`. 스크롤바는 `scrollbar-width: none` + `::-webkit-scrollbar`로 숨김
- `updatePillTabOverflow(barId)`: 넘치면 ‹ › 보이기(끝이면 흐리게 disabled), 가려진 쪽 끝을 `mask-image`로 흐리게(`.fade-l` / `.fade-r`)
  - 부르는 곳: 탭 줄 그릴 때, 스크롤할 때(`onscroll`), 탭 이름 길이가 바뀔 때(`markPillTab`), 탭 줄 크기가 바뀔 때(`ResizeObserver` — 숨어 있던 화면 탭이 보일 때·창 크기 변경)
  - `ResizeObserver`는 처음 쓸 때 만듦(`watchPillTabsSize`) — 파일을 읽는 순간 코드를 실행하지 않는 규칙 때문
- ‹ ›: `data-pill-scroll` + `data-dir` → `scrollPillTabs`(탭 줄 너비 70% 부드럽게)
- 끌기: `startPillTabsDrag` — 5px(`PILL_DRAG_THRESHOLD`) 이상 움직였을 때만 끌기. 놓은 직후 click 한 번은 `swallowNextClick`으로 막고(탭 고르기 방지),
  click 이 안 오는 경우를 위해 `setTimeout 0`으로 바로 풀어 둠

### ⑱ 화면 머리(`.scr-head`)의 탭 아래 줄을 본문 폭 끝까지

- 줄이 `.tabs`의 `border-bottom`이라 `.scr-head`의 양옆 여백(32px, 좁은 화면 16px)만큼 짧았음 → 줄을 `.scr-head`의 `border-bottom`으로 옮김.
  양옆 여백은 그대로(내용에만 적용). 고른 탭 밑줄은 `.tab`의 `margin-bottom: -1px`로 지금처럼 이 줄에 겹침

---

## 3. 새로 생긴 전역 심볼 (이름 충돌 주의)

### 1차

| 파일 | 심볼 |
|---|---|
| `constants.js` | `menuIconSvg` `MENU_ICON` `NO_ASIS_PAIR` |
| `screen-data.js` | `findPairedAsisBlock` |
| `screen.js` | `wasAsisUnlocked` `unlockLogBannerHtml` |
| `screen-blocks.js` | `toBlockTitle` `forceUpperCaseTitle` `PAIR_SELECT_NONE` `PAIR_SELECT_AUTO` `fillPairSelect` `setTobePair` |
| `screen-save.js` | `MIN_UNLOCK_REASON_LENGTH` `hashAsisFiles` `unlockAsis` `closeLastUnlockEntry` `setAsisEditorsReadOnly` `showAsisAsUnlocked` |
| `tree.js` | `COPY_NAME_SUFFIX` `MAX_COPY_NAME_TRIES` `uniqueCopyName` `resetCopiedWorkLog` `copyMenuFolder` `copySelectedMenu` `MOVE_DIALOG_TEXT` `addSubFolder` |
| `project.js` (신규) | `newProjectId` `rootLabel` `projectNeedsPermission` `loadProjects` `saveProjects` `migrateLegacyProject` `touchProject` `renderProjectButton` `describeSince` `openProject` `addProject` `renameProject` `removeProject` `closeProject` `showProjectMenu` `initProjects` `restoreLastProject` |

`app.project`가 `state.js`에 추가됐습니다.

### 2차

| 파일 | 심볼 |
|---|---|
| `fs.js` | `isNotFoundError` `folderExists` |
| `screen.js` | `hoverCopyButtonHtml` `sqlEditorOptions` (+ 화면 상태에 `activeBlock`, `gridPasteHistory`) |
| `screen-blocks.js` | `copyBlockTitle` `asisBlockMenuHtml` · **삭제**: `addSqlBlock`(→ `screen-sqltabs.js`로 옮김), `tobeViewMode`, `setTobeViewMode` |
| `settings.js` | **삭제**: `SETTING_KEYS.tobeView` |
| `screen-save.js` | `currentWorkerName` `GRID_PASTE_SPACE_SPLIT` `parsePastedTable` `toDateInputValue` `handleGridPaste` `MAX_GRID_PASTE_UNDO` `gridSnapshot` `gridPasteHistoryOf` `rememberGridBeforePaste` `clearGridPasteUndo` `restoreGridSnapshot` `handleGridUndoRedo` |
| `sql-complete.js` (신규) | `SQL_AUTOCOMPLETE_MIN_PREFIX` `SQL_WORD_PATTERN` `SQL_WORD_MIN_LENGTH` `SQL_COMPLETION_SCORE` `sqlKeywordsOf` `collectScreenSqlWords` `sqlKeywordCompleter` `sqlScreenWordCompleter` `enableSqlAutocomplete` |
| `screen-sqltabs.js` (신규) | `sqlAddEditor` `sqlTabsBarHtml` `sqlTabHtml` `sqlTabToolsHtml` `ensureActiveSqlTab` `renderSqlTabs` `showActiveSqlBlock` `activateSqlTab` `scrollTabsSideways` `showAllSqlTabs` `isSqlBlockChanged` `refreshSqlTabMarks` `getSqlAddEditor` `pairChoicesHtml` `askNewSqlBlock` `addSqlBlock` `blockLogOf` `sqlLogItemsHtml` `sqlLogHtml` `saveSqlLog` |
| `project.js` | `forgetProject` `dropMissingProject` |
| `tree.js` | `folderCheckRunning` `recheckFolders` |
| `constants.js` (⑮) | `DEF_TABS` `LEGACY_DEF_FILES` `LEGACY_DEF_ITEM` · `GRID_COLUMNS` 키가 `'<탭>.<표 키>'`로 바뀜 · **삭제**: `GRID_FILES` `TAB_TEXT_FIELDS` `TAB_GRID_FIELDS` |
| `utils.js` (⑮) | `TABLE_TEXT_SPACE_SPLIT` `splitTableText` (← `screen-save.js`의 `GRID_PASTE_SPACE_SPLIT` 대체) |
| `screen-data.js` (⑮) | `textToGridRows` `emptyDefGrids` `readLegacyDefItem` `loadDefItems` |
| `screen.js` (⑮) | `readGridRowsOf` (+ 화면 상태 `defItems` `savedDefItems` `activeDef`) · **삭제**: `readGridRows` `textFieldHtml` |
| `screen-sqltabs.js` (⑮) | `isSqlTabBar` `pillTabsBarHtml` `pillTabHtml` `renderPillTabs` `markActivePillTab` `scrollPillTabIntoView` `markPillTab` `showAllPillTabs` `activatePillTab` `deletePillTab` `addPillTab` `logItemsHtml` `logListKey` `itemLogHtml` `findLogTarget` `saveItemLog` · **삭제**: `sqlTabsBarHtml` `sqlTabHtml` `sqlTabToolsHtml` `showAllSqlTabs` `sqlLogItemsHtml` `sqlLogHtml` `saveSqlLog` |
| `screen-defs.js` (신규, ⑮) | `UNNAMED_DEF_TITLE` `defGridTableId` `defItemHtml` `defPanelHtml` `readDefInputs` `defSignature` `isDefTabChanged` `refreshDefTabMarks` `ensureActiveDef` `renderDefTabs` `showActiveDefItem` `activateDefTab` `askNewDefItem` `addDefItem` `deleteDefItem` `saveDefItems` |
| `screen-save.js` (⑮) | **삭제**: `saveGrid` |
| `screen-sqltabs.js` (⑰) | `PILL_ARROW_SCROLL_RATIO` `PILL_DRAG_THRESHOLD` `pillTabsResizeObserver` `watchPillTabsSize` `updatePillTabOverflow` `scrollPillTabs` `swallowNextClick` `startPillTabsDrag` |
| `screen-grid.js` (신규, ⑯) | `gridSelection` `gridDrag` `gridColumnCount` `gridCellPosition` `gridCellInput` `clampGridPosition` `focusGridCell` `gridSelectionBounds` `isMultiCellSelection` `clearGridSelection` `setGridSelection` `gridSelectionText` `writeClipboardText` `clearGridSelectionCells` `handleGridMouseDown` `handleGridMouseOver` `handleGridMouseUp` `isCaretAtEdge` `gridTabTarget` `appendGridRow` `handleGridKeydown` `handleGridDateChange` `handleGridInput` `initGrids` · **옮겨 옴**(← `screen-save.js`): `addGridRow` `deleteGridRow` `parsePastedTable` `toDateInputValue` `handleGridPaste` `MAX_GRID_PASTE_UNDO` `gridSnapshot` `gridPasteHistoryOf` `clearGridPasteUndo` `restoreGridSnapshot` `handleGridUndoRedo` · **이름 변경**: `rememberGridBeforePaste` → `rememberGridState` |

새 화면 클릭 속성(`handleScreenClick`, `screen-save.js`): `data-copy-ed` `data-copy-title` `data-sqltab` `data-sqltab-del` `data-sqltab-all` `data-sqllog` (+ `data-kind`).
`data-addblk`는 이제 [+ SQL 추가] 창을 엽니다.

스크립트 순서(`index.html`): `ace-bundle.js` → **`ace-ext-language_tools.js`** → … → `sql.js` → **`sql-complete.js`** → … → `screen-blocks.js` → **`screen-sqltabs.js`** → …

---

## 4. `meta.json` 스키마 변화 (모두 하위 호환)

```jsonc
{
  "status": "진행",
  "statusLog": [{ "status": "요청", "at": "ISO", "by": "홍길동" }],
  "asisLocked": true,
  "asisSavedAt": "2026. 10. 26. 오후 10:09:08",   // 최초 등록 시각. 다시 잠가도 안 바뀜
  "hashes": { "asis/sql/b1.sql": "sha256…" },      // 다시 잠글 때 재계산됨
  "asisUnlockLog": [                               // ★ 1차
    { "at": "ISO", "by": "홍길동", "reason": "누락된 WHERE 절 보완", "relockedAt": "ISO 또는 ''" }
  ],
  "sqlBlocks": {
    "asis": [{ "id": "b…", "title": "사원조회", "file": "asis/sql/b….sql",
               "log": [{ "at": "ISO", "by": "홍길동", "text": "…" }] }],   // ★ 2차: SQL 마다 쌓는 이력
    "tobe": [{ "id": "b…", "title": "사원조회", "file": "tobe/sql/b….sql", "rb": "…",
               "asisId": "b…",                                            // ★ 1차
               "log": [ … ] }]                                            // ★ 2차
  }
}
```

**정의서 `<탭>/items.json` (⑮, 신규 파일)**

```jsonc
[
  { "id": "b…", "title": "사원조회 서비스",
    "grids": { "overview": [["SVC_0001", "사원조회", "…"]], "attrs": [], "funcs": [] },   // 표 키는 DEF_TABS[탭].grids
    "log": [{ "at": "ISO", "by": "홍길동", "text": "…" }] }                             // 이력이 없으면 log 를 적지 않음
]
```
- 파일이 없으면 예전 파일을 '기본'(id `legacy`) 항목으로 옮겨 보여 줌 / `[]`이면 항목 없음(예전 파일을 다시 옮기지 않음)

**없는 필드를 읽을 때의 규칙** — 예전 데이터를 깨뜨리지 않도록 반드시 유지:
- `asisUnlockLog` 없음 → 한 번도 잠금을 풀지 않은 화면
- `asisId` 없음 → **같은 순서**로 짝 (`findPairedAsisBlock`)
- `log` 없음 → 이력이 없는 SQL (이력이 비어 있으면 `log`를 아예 적지 않음)

---

## 5. 확인이 필요한 것 (브라우저에서 직접)

### 2차 — 아직 확인 안 함

문법·전역 이름 충돌 검사까지만 했습니다. 아래는 **눌러 봐야 압니다.**

- [ ] **SQL 탭 전환** — 숨어 있던 편집기가 탭을 고를 때 제대로 그려지는지(빈 칸·잘린 줄 없음), 신규 탭의 바뀐 줄 색칠·스크롤 연동
- [ ] **[+ SQL 추가] 창** — 이름/SQL 을 비우면 안내가 뜨고 창이 안 닫히는지, 이름 대문자 변환(한글 IME), 비교할 기존 SQL 선택, Esc·Ctrl+Enter
- [ ] **탭이 많을 때** — 휠 가로 스크롤, [▾ 전체] 목록 이동, 고른 탭이 보이게 스크롤되는지
- [ ] **탭 ×** — 확인 창 후 삭제, 보던 탭을 지우면 첫 탭으로, 마지막 하나를 지우면 안내 표시
- [ ] **● 표시** — 내용·이름·짝을 바꾸면 붙고, 등록하면 사라지는지
- [ ] **SQL 이력** — 등록된 SQL 은 즉시 저장(다시 열어도 남음), 등록 전 SQL 은 등록 후 남는지, 잠긴 기존 SQL 에도 남는지
- [ ] **잠그기·잠금 풀기** 후 탭 줄의 × / [+ SQL 추가]가 사라졌다 다시 생기는지
- [ ] **여러 SQL 붙여넣기 → 탭으로 나누기**(탭 본문 편집기에서)
- [ ] **자동완성** — `SE` 같은 키워드, 다른 SQL 에 나온 테이블 이름이 뜨는지
- [ ] **복사 아이콘** — 편집기·제목칸 위치, 잠금을 풀었다 다시 잠가도 남는지
- [ ] **보기 단추 제거 뒤** — 신규 SQL 탭 위에 단추가 없고, 짝이 있는 블록은 나란히·'없음'은 신규만 넓게 보이는지, 창을 좁히면 두 칸이 위아래로 쌓이는지
- [x] **표 붙여넣기** — 사용자 확인: 잘 됨
- [x] **표 붙여넣기 Ctrl+Z** — 사용자 확인: 잘 됨
- [ ] **표 붙여넣기 Ctrl+Y** — 되돌린 뒤 Ctrl+Y(또는 Ctrl+Shift+Z)로 다시 실행, 되돌리기·다시 실행 번갈아, 새로 붙여넣은 뒤엔 Ctrl+Y 가 안 먹는지
- [x] **정의서 탭(⑮)** — 사용자 확인: 잘 됨 — [+ 서비스 추가] 창(이름 비우면 안내), 탭 전환·×·▾ 전체·●, 표 입력·붙여넣기·Ctrl+Z/Y, 이력(등록 전/후), [등록] 후 다시 열어도 남는지
- [ ] **정의서 예전 데이터** — 예전에 글·개요 표를 적어 둔 화면을 열면 '기본' 탭에 표로 옮겨져 보이고 ● 가 없는지, 등록하면 `items.json`이 생기는지
- [ ] **정의서 보고서** — 항목 이름과 내용 있는 표만 나오는지
- [ ] **SQL 탭 회귀** — 알약 탭·이력 공통화 뒤에도 SQL 탭 전환·×·▾ 전체·[+ SQL 추가]·SQL 이력이 그대로 되는지
- [ ] **표 고도화(⑯)** — 여러 칸 드래그 → Ctrl+C → 메모장/엑셀에 붙여 탭으로 나뉘는지, 거꾸로·위로 끌기, Shift+클릭·Shift+방향키, Delete 로 범위 비우기 + Ctrl+Z,
  방향키·Enter(마지막 줄에서 줄 추가)·Tab, 한 칸 안에서 글자 드래그 선택이 여전히 되는지, 한글 입력 중 Enter, 날짜 `20260101` → `2026-01-01`·잘못된 날짜 빨간 표시
- [x] **탭 줄 넘침(⑰)** — 사용자 확인: 잘 나옴 — 탭을 많이 추가했을 때 스크롤바 없이 ‹ › 가 나오고 끝에서 흐려지는지, 가려진 쪽이 흐리게 보이는지, 끌어서 스크롤 · 끈 뒤 탭이 눌리지 않는지 · 살짝 흔든 클릭은 탭이 골라지는지, 창 크기를 줄였다 늘렸을 때
- [ ] **화면 머리 줄(⑱)** — 탭 아래 줄이 본문 양 끝까지 닿고, 고른 탭의 진한 밑줄이 그 줄에 딱 겹치는지, 양옆 여백은 그대로인지
- [ ] **지워진 폴더** — 프로젝트 폴더를 지우고 앱 창을 누르면 '폴더가 없습니다' + 목록에서 제거, 메뉴 폴더를 지우면 트리에서 사라지는지

### 1차 — 확인 완료 (2026-10-27, 문제 없음)

- [x] **프로젝트 전환 전반** — 추가 → 전환 → 이름 변경 → 제거
- [x] **브라우저를 완전히 닫았다 열기** → 단추에 🔑가 뜨는지, 클릭 시 권한 창이 뜨는지
- [x] **IndexedDB에 핸들 배열 저장** — `projects` 배열 안의 `FileSystemDirectoryHandle`이 제대로 복원되는지
- [x] **기존 사용자 데이터 이전**(`migrateLegacyProject`) — 예전 `root` 키가 있던 환경에서 첫 실행
- [x] **ASIS 잠금 풀기 → 수정 → 다시 잠그기** 한 바퀴, 해시 재계산과 무결성 배지
- [x] **메뉴 복사** — 하위 메뉴가 있는 폴더, 체크박스 on/off 양쪽
- [x] **빈 폴더 생성** — 파일이 하나도 없는 폴더가 탐색기에 실제로 만들어지는지
- [x] **`asisId` 선택 상자** — `없음` 선택 시 왼쪽 칸이 사라지는지, 예전 데이터에 `자동(순서)`가 뜨는지, 등록 후 값이 굳는지
- [x] **SQL 제목 한글 입력** — IME 조합 중 커서가 튀지 않는지

---

## 6. 남은 일 / 논의할 것

### 2차에서 생긴 것

0. **정의서 표의 열 이름 확정** — 지금은 임시안(`GRID_COLUMNS`의 service.* · object.attrs/children · code.common/system). 사용자가 나중에 항목을 줄 예정

1. ~~신규 SQL 탭의 [기존과 나란히 / 신규만] 단추가 필요한지~~ → **제거함** (⑬)
2. **자동완성 Enter 동작** — 목록이 떠 있으면 Enter 가 줄바꿈 대신 제안을 입력함. Tab 으로만 고르게 바꿀지
3. **예전 기존·신규 파일** — 화면에서 보거나 지울 수 없음(비교·보고서에는 나옴). 첨부로 옮기는 기능이 필요할 수 있음
4. **SQL 이력 수정·삭제** — 지금은 없음(잘못 적으면 고칠 방법 없음)
5. ~~잠긴 기존 SQL 블록 머리의 [복사] 버튼~~ → **삭제함** (⑧)
6. **잠긴 예전 데이터(`legacy` 블록, `meta.sqlBlocks` 없음)** — 이력이 '등록할 때 함께 저장'으로 처리되는데 잠겨 있어 등록되지 않음. 드문 경우라 그대로 둠

### 1차에서 논의했던 것 (정리 완료 — 지금 동작을 유지)

1. **`메뉴 복사` 라벨** — 지금은 화면에만 뜨므로 문제없지만, 복사를 폴더로 확장한다면 라벨 재검토 필요
2. **루트 컨텍스트 메뉴 발견성** — 사이드바 빈 공간 우클릭에서만 열림
3. **보고서에 잠금 해제 사유 전문** — 횟수만 넣음(고객 전달용이라 내부 사정 노출 우려)
4. **`copyFolderPath` 함수명·다이얼로그 문구** — 라벨만 '탐색기 경로 복사'로 바꿨고 내부 이름/제목은 그대로
5. **마지막 띠와 SQL 블록 영역 간격** — `.banner` 여백 4px 유지

---

## 7. 변경된 파일

### 2차 (아직 커밋 안 함)

```
신규:  js/screen-sqltabs.js, js/screen-defs.js, js/screen-grid.js, js/sql-complete.js, js/vendor/ace-ext-language_tools.js
수정:  index.html (스크립트 3개 · #sqlAddModal), README.md, HANDOFF.md, css/app.css,
       js/constants.js  js/utils.js  js/screen-data.js  js/report.js
       js/fs.js  js/project.js  js/tree.js  js/main.js  js/settings.js
       js/screen.js  js/screen-blocks.js  js/screen-save.js  js/screen-files.js(주석만)
```

### 1차 (커밋 `82ccc06`, `0e041fa`)

```
신규:  js/project.js, HANDOFF.md
수정:  index.html, README.md, css/app.css,
       js/constants.js  js/state.js    js/settings.js  js/dialog.js
       js/screen-data.js js/tree.js    js/dashboard.js js/diff.js
       js/screen.js     js/screen-blocks.js js/screen-files.js
       js/screen-save.js js/report.js  js/main.js
```
