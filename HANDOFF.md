# 작업 인계 문서 (HANDOFF)

다른 환경에서 Claude(또는 다른 사람)가 이어서 작업할 때 읽는 문서입니다.
프로젝트 자체의 구조·규칙은 **`README.md`가 원본**입니다. 이 문서는 **"지금까지 무엇을 왜 바꿨고, 무엇이 남았는지"** 만 다룹니다.

- 작성 시점: 2026-10-26
- 기준 커밋: `7f4055d 첫커밋` (아래 작업은 **아직 커밋되지 않은 워킹트리 상태**)
- 실행: `index.html`을 **Chrome 또는 Edge로** 엽니다(더블클릭). 서버·빌드·설치 없음

---

## 0. 먼저 읽을 것

| 순서 | 파일 | 이유 |
|---|---|---|
| 1 | `README.md` 의 **코드 규칙 0번** | 이 저장소의 최상위 원칙(사람이 읽고 고칠 수 있는 코드) |
| 2 | `README.md` 전체 | 폴더 구조, 상태 모델, 데이터 포맷 |
| 3 | 이 문서 | 최근 작업 내역과 남은 일 |

### 반드시 지킬 것 (어기면 앱이 통째로 깨집니다)

- **ES 모듈 금지.** `file://`에서 `import`가 막혀, 모든 `js/*.js`는 일반 `<script>`로 읽히고 **전역 네임스페이스를 공유**합니다.
  - 파일 간 **이름이 겹치면 즉시 깨집니다.** 새 전역을 만들면 아래 명령으로 확인하세요.
  - `window` 기본 속성 이름(`screen`, `status`, `name`, `history`, `closed`)을 전역으로 쓰지 마세요.
- **파일을 읽는 즉시 실행되는 코드 금지.** 선언만 두고, 실행은 `main.js`의 `boot()` → 각 파일의 `init*()`.
- 새 파일은 `index.html` 스크립트 목록에서 **그 파일이 쓰는 파일보다 뒤, `main.js`보다 앞**에.
- 사용자 입력을 HTML에 넣을 땐 **반드시 `escapeHtml()`**.
- `alert`/`confirm`/`prompt` 금지 → `askText`/`askConfirm`/`toast`.

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

## 1. 이번에 한 작업 (7가지)

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
- `toBlockTitle()` 규칙 하나로 모으고 **제목이 들어오는 모든 경로**에 적용: 직접 입력 · 붙여넣기 자동 분리 · `readBlockInputs()`
- 입력 중 변환은 **커서 자리 유지 + 값이 바뀔 때만 대입** → 한글 IME 조합이 끊기지 않음 (`forceUpperCaseTitle`)
- 기존에 저장된 소문자 제목은 일괄 변경하지 않음(그 블록을 손댈 때 바뀜)

### ③ 좌측 트리: 메뉴 복사 + 폴더(묶음) 개념 + 컨텍스트 메뉴 정비

**메뉴 복사**: 이동 창(`#moveModal`)을 `mode: 'move' | 'copy'`로 공용화
- 이름 자동: `사원조회` → `사원조회_COPY`, 중복이면 `_COPY2`, `_COPY3`… (`uniqueCopyName`)
- 위치를 고르는 순간 **확정될 이름을 미리 표시**
- 복사는 **현재 위치도 선택 가능**(이동은 불가)
- 창에 체크박스: `작업 기록(상태 · 상태 이력 · ASIS 잠금)까지 그대로 복사` — **기본 해제**
  해제 시 `resetCopiedWorkLog()`가 복사본의 모든 `meta.json`을 '요청' 상태로 초기화하고 `asisLocked`/`asisSavedAt`/`hashes`/`asisUnlockLog` 제거
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
- **루트 메뉴는 좌측 사이드바의 빈 공간 우클릭**에서만 열립니다(루트는 트리에 노드로 그려지지 않음). 발견하기 어려운 위치 — 개선 여지 있음

### ④ 메뉴에 아이콘

- `MENU_ICON` (`constants.js`) 10종: `folderAdd` `pageAdd` `clipboard` `copy` `move` `rename` `settings` `compare` `trash` `check` `folderOpen` `key`
- `showMenu` 항목 튜플 확장: `[문구, 함수, 'danger', 아이콘HTML, 오른쪽꼬리말]`, `'-'` 하나면 구분선
- `showMenuBelow(button, items, align)` — `'left'` 추가(상단 왼쪽 단추용)
- 아이콘 HTML은 `MENU_ICON` 고정값만 들어가고 문구는 `escapeHtml` 통과

### ⑤ 잠금 해제 이력 띠 문구 축소 + `.banner` 여백

- 머리글(`잠금 해제 이력 N회`)과 설명문 제거 → 아이콘 + 목록만
- `.banner` `padding: 12px 14px → 6px 14px`, `margin-bottom: 14px → 4px` (**공용 클래스라 다른 띠도 함께 얇아짐**)

### ⑥ 프로젝트(루트 폴더) 여러 개 — 신규 파일 `js/project.js`

**배경**: `루트 폴더 선택` 버튼 하나뿐이라 프로젝트를 바꿀 때마다 폴더 피커에서 경로를 다시 찾아야 했음.
설정 키가 이미 루트별로 분리돼 있어 **데이터 설계는 반쯤 준비돼 있었음**.

- 상단 **왼쪽**(브랜드 옆)에 전환 드롭다운 `#btnProject`. 기존 `#btnPick`·`#btnResume` 제거
- 저장: `projects = [{id, name, handle, lastOpenedAt}]`, `lastProjectId`
- **`id`는 폴더 이름과 무관한 고유 값** → `closed:<id>`, `rootPath:<id>`
  **(기존 버그 수정)** 이름이 같은 다른 폴더끼리 접힘 상태·탐색기 경로가 섞이던 문제
- `name`은 별명(폴더 이름과 달라도 됨) → `rootLabel()`이 상단·브레드크럼·보고서 표지·보고서 기본 제목에 사용
- **권한**: 세션이 끊기면 폴더 권한이 풀림. `requestPermission()`은 **클릭 안에서만** 가능
  → 시작 시엔 `queryPermission`이 granted일 때만 자동으로 열고, 아니면 단추에 🔑 표시.
  목록에서 고르는 순간 허용 요청. **이 상태가 `app.project`는 있고 `app.root`는 `null`인 구간**
- 기존 사용자 데이터는 `migrateLegacyProject()`가 첫 실행 때 자동 이전(옛 `root` 핸들 + `closed:<이름>` · `rootPath:<이름>` → 새 id 키)
- `목록에서 제거`는 목록과 그 프로젝트 설정만 지움(폴더·파일은 그대로)
- 제거·전환·추가 모든 경로에 `confirmLeaveScreen()` 적용
- `settings.remove()` 신설

삭제된 함수: `pickRootFolder` `resumeRootFolder` `restoreLastRoot` (tree.js)

### ⑦ 기존↔신규 SQL 짝을 **명시적 연결**로 (index 기준 폐기)

**배경**: 짝을 **순서(index)** 로 찾고 있어서, 신규 쿼리 하나를 중간에 끼우면 그 뒤가 전부 밀려 엉뚱한 쌍이 됐음.
(참고: `+ SQL 블록 추가`는 원래도 TOBE 블록만 만들었음. 왼쪽 칸은 데이터가 아니라 **읽기 전용 뷰**였음)

- `meta.sqlBlocks.tobe[].asisId` 신설
  - `'<기존 블록 id>'` → 그 블록과 비교
  - `''`(`NO_ASIS_PAIR`) → 짝 없음 = 신규 쿼리. **왼쪽 칸이 숨겨지고 신규 SQL만 넓게**(`.blk.no-pair`)
  - **값 없음** → 예전 데이터, 같은 순서(선택 상자에 `자동(순서)` 표시). **다음 등록 때 실제 값으로 굳음**
- **새 블록은 `없음(신규 쿼리)`에서 시작** (요청하신 동작이 기본값)
- 선택 상자는 **블록 머리**(`.blk-h`)에 둡니다. 왼쪽 칸(`.pane-l`)은 `없음`일 때 숨겨지므로
  **그 안에 두면 다시 고를 수 없게 됩니다** — 실제로 한 번 그렇게 만들었다가 고쳤습니다
- 짝 찾기는 `findPairedAsisBlock()`(`screen-data.js`) **한 곳**으로 모음 →
  나란히 보기 · 비교 탭 · 비교 창 · 보고서 · `기존 SQL 가져오기`가 전부 이 함수를 사용
- 비교 탭·보고서가 **`변경` / `신규 쿼리` / `신규에 없음`** 3분류로 구분(이전엔 구분 불가)
- 비교 탭 칩 이름도 정리: `SQL 변경` `SQL 신규` `SQL 기존만` `파일 수정` `파일 신규` `파일 동일` `파일 기존만`

---

## 2. 새로 생긴 전역 심볼 (이름 충돌 주의)

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

---

## 3. `meta.json` 스키마 변화 (모두 하위 호환)

```jsonc
{
  "status": "진행",
  "statusLog": [{ "status": "요청", "at": "ISO", "by": "홍길동" }],
  "asisLocked": true,
  "asisSavedAt": "2026. 10. 26. 오후 10:09:08",   // 최초 등록 시각. 다시 잠가도 안 바뀜
  "hashes": { "asis/sql/b1.sql": "sha256…" },      // 다시 잠글 때 재계산됨
  "asisUnlockLog": [                               // ★ 신규
    { "at": "ISO", "by": "홍길동", "reason": "누락된 WHERE 절 보완", "relockedAt": "ISO 또는 ''" }
  ],
  "sqlBlocks": {
    "asis": [{ "id": "b…", "title": "사원조회", "file": "asis/sql/b….sql" }],
    "tobe": [{ "id": "b…", "title": "사원조회", "file": "tobe/sql/b….sql", "rb": "…", "asisId": "b…" }]
    //                                                                      ↑ ★ 신규
  }
}
```

**없는 필드를 읽을 때의 규칙** — 예전 데이터를 깨뜨리지 않도록 반드시 유지:
- `asisUnlockLog` 없음 → 한 번도 잠금을 풀지 않은 화면
- `asisId` 없음 → **같은 순서**로 짝 (`findPairedAsisBlock`)

---

## 4. 확인이 필요한 것 (브라우저에서 직접)

문법·참조 정합성까지만 검증했습니다. 아래는 **눌러 봐야 압니다.**

- [ ] **프로젝트 전환 전반** — 추가 → 전환 → 이름 변경 → 제거
- [ ] **브라우저를 완전히 닫았다 열기** → 단추에 🔑가 뜨는지, 클릭 시 권한 창이 뜨는지
- [ ] **IndexedDB에 핸들 배열 저장** — `projects` 배열 안의 `FileSystemDirectoryHandle`이 제대로 복원되는지
- [ ] **기존 사용자 데이터 이전**(`migrateLegacyProject`) — 예전 `root` 키가 있던 환경에서 첫 실행
- [ ] **ASIS 잠금 풀기 → 수정 → 다시 잠그기** 한 바퀴, 해시 재계산과 무결성 배지
- [ ] **메뉴 복사** — 하위 메뉴가 있는 폴더, 체크박스 on/off 양쪽
- [ ] **빈 폴더 생성** — 파일이 하나도 없는 폴더가 탐색기에 실제로 만들어지는지
- [ ] **`asisId` 선택 상자** — `없음` 선택 시 왼쪽 칸이 사라지는지, 예전 데이터에 `자동(순서)`가 뜨는지, 등록 후 값이 굳는지
- [ ] **SQL 제목 한글 입력** — IME 조합 중 커서가 튀지 않는지

---

## 5. 남은 일 / 논의 중이던 것

1. **`메뉴 복사` 라벨** — 지금은 화면에만 뜨므로 문제없지만, 복사를 폴더로 확장한다면 라벨 재검토 필요
2. **루트 컨텍스트 메뉴 발견성** — 사이드바 빈 공간 우클릭에서만 열림. 사용자가 "어디 있냐"고 물었던 지점.
   프로젝트 드롭다운 안으로 `루트 경로 다시 설정`을 옮기는 것이 자연스러울 수 있음
3. **보고서에 잠금 해제 사유 전문** — 현재는 횟수만. 넣을지는 미결(고객 전달용이라 내부 사정 노출 우려)
4. **`copyFolderPath` 함수명·다이얼로그 문구** — 라벨만 '탐색기 경로 복사'로 바꿨고 내부 이름/제목은 그대로
5. **마지막 띠와 SQL 블록 영역 간격** — `.banner` 여백을 4px로 줄이면서 함께 좁아짐. 되돌릴지 미결

---

## 6. 변경된 파일

```
신규:  js/project.js, HANDOFF.md
수정:  index.html, README.md, css/app.css,
       js/constants.js  js/state.js    js/settings.js  js/dialog.js
       js/screen-data.js js/tree.js    js/dashboard.js js/diff.js
       js/screen.js     js/screen-blocks.js js/screen-files.js
       js/screen-save.js js/report.js  js/main.js
수정 없음: js/utils.js, js/fs.js, js/sql.js, js/migrate.js, js/fonts.js, js/vendor/ace-bundle.js
```

아직 커밋하지 않았습니다. `git diff`로 전체 변경을 볼 수 있습니다.
