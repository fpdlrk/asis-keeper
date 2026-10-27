# DB 전환 검토 (로컬 폴더 버전 + 서버/DB 버전 함께 쓰기)

- 작성: 2026-10-27 · 상태: **검토만 함 (코드 변경 없음)**
- 목적: 지금의 로컬 폴더 버전을 유지하면서, 프로젝트마다 "로컬 폴더" 또는 "서버(DB)"를 골라 쓰게 할 수 있는지와 방법 정리
- 결론: **가능.** 단, 어떤 DB 를 쓰든 먼저 "저장소 연결부"를 한 겹으로 모으는 작업이 필요하고, 이것이 전체에서 가장 큰 부분

---

## 1. 먼저 해야 할 일 — 저장소 인터페이스 정리 (백엔드와 무관)

### 지금 상태 (2026-10-27 기준 측정)
- 화면 코드 곳곳이 폴더를 직접 다룸
  - `fs.js` 도우미(`readText` `readJson` `readFile` `writeFile` `writeJson` `listFilesDeep` `listFileNames` `listChildFolders` `getSubDir` `hasSubDir` `removeFileQuietly` `copyFolder`) 호출: **13개 파일에서 약 85번**
    (tree.js 17 · fs.js 17 · screen-save.js 13 · screen-data.js 10 · migrate.js 9 · diff.js 4 · screen.js 4 · report.js 3 · screen-files.js 3 · screen-blocks.js 2 · dashboard.js · screen-defs.js · screen-sqltabs.js 각 1)
  - 브라우저 폴더 기능(`getDirectoryHandle` `getFileHandle` `removeEntry` `showDirectoryPicker` `queryPermission` `requestPermission` 등) 직접 사용: **6개 파일**
    (tree.js 10 · fs.js 8 · project.js 7 · main.js · screen-data.js · screen-files.js 각 1)
  - 화면 상태에 폴더 핸들(`app.root`, `app.screen.dir`)을 들고 다님

### 할 일
- "파일 경로" 대신 **업무 단위**로 묻는 저장소 인터페이스 하나로 모음. 예:
  - 트리: 메뉴/폴더 목록 · 추가 · 이름 변경 · 이동 · 복사
  - 화면: 열기(meta + SQL 블록 + 정의서 항목 + 첨부 목록) · 저장(영역별) · 상태 변경 · 잠그기/잠금 풀기
  - 이력: SQL 이력 · 정의서 항목 이력 추가 · 신규 SQL 이전 버전
  - 첨부: 올리기 · 내려받기 · 삭제 / 보고서용 전체 읽기 / 검색
- 구현 두 개
  - **로컬 폴더용**: 지금 코드를 그대로 옮김 (동작 변화 없음)
  - **DB용**: 아래 3장에서 고른 백엔드
- 프로젝트 목록(`project.js`)에 종류를 둠: `{id, name, type: 'folder' | 'server', handle | serverUrl}` → 상단 프로젝트 단추에서 그대로 섞어 쓰기
- 이 단계만 해 두면 백엔드는 나중에 바꿀 수 있음. **이 단계만 먼저 하는 것을 추천**

---

## 2. 꼭 먼저 확인할 것

1. **고객 소스(SQL)를 외부에 저장해도 되는가** — 이 도구에는 고객사 운영 SQL 이 들어감.
   SI 계약·보안 서약상 외부 클라우드 저장이 금지된 경우가 많음 → 금지면 SaaS(Supabase 클라우드 등)는 탈락
2. **고객사 개발망이 인터넷에 연결되는가(망분리)** — 안 되면 SaaS 는 쓸 수 없고 사내 서버 방식만 가능

---

## 3. 백엔드 선택지

| | Spring + DB (사내 서버) | Supabase (SaaS) | PocketBase (사내, 경량) |
|---|---|---|---|
| 구성 | Java 서버 + PostgreSQL/Oracle 등, REST API 직접 구현 | DB·로그인·파일 저장소·API 제공, 화면에서 바로 호출 | 실행 파일 하나(SQLite·로그인·파일·REST 포함) |
| 개발량 | 많음 (API·인증·파일 업로드·배포) | 적음 (테이블 설계 + 권한 규칙) | 적음 |
| 데이터 위치 | 사내망 | **외부 클라우드** | 사내망 |
| 망분리 | 가능 | **불가** | 가능 |
| 운영 | 서버·배포·백업 직접 | 거의 없음 (무료 플랜: 1주 미사용 시 일시 정지, 용량 제한) | 파일 하나 실행 + 백업 |
| 비용 | 서버 + 인력 | 무료로 시작, 운영은 월 25달러 수준(Pro) | 서버만 |
| 맞는 경우 | 회사 표준이 Java, 장기 운영·여러 팀 | 외부 저장 허용 + 빨리 만들기 | 소규모 팀, 사내망, 가볍게 |

### 그 밖의 방법
- **공유 폴더(NAS·공유 드라이브)에 지금 버전 그대로** — 코드 수정 없음. 네트워크 드라이브를 루트로 고르면 같이 봄. 동시 수정 충돌·권한 관리는 없음. **당장 공유만 필요하면 가장 빠름**
- **Supabase 를 사내 서버에 직접 설치(Docker)** — 데이터 유출 문제는 없지만 설치·운영이 무거움
- **Firebase** — Supabase 와 비슷한 SaaS(문서형 DB). 데이터 유출 문제 동일, 이 앱의 표 구조에는 Supabase 가 더 맞음

### 추천 순서
1. 당장 같이 써야 하면 → 공유 폴더로 지금 버전
2. DB 로 갈 거면 → **1장의 저장소 인터페이스 정리**부터 (동작은 그대로)
3. 백엔드: 데이터 반출 불가·망분리면 **PocketBase**(가볍게) 또는 **Spring**(회사 표준·장기 운영) / 외부 클라우드 허용이면 **Supabase**

---

## 4. DB 버전에서 달라지거나 새로 생각할 것

- **동시 수정**: 같은 화면을 두 사람이 고치면 나중 저장이 앞사람 것을 덮어씀 → 저장 때 판 번호(version)를 비교해 "다른 사람이 먼저 고쳤습니다" 알림(낙관적 잠금) 필요
  (지금 공유 폴더로 쓸 때도 같은 문제 있음)
- **로그인·권한**: 지금 '작업자' 칸은 손으로 적음 → DB 버전은 로그인 사용자가 이력(`by`)에 자동으로. 프로젝트별 보기/쓰기 권한
- **ASIS 잠금 강화**: 지금은 해시로 "바뀌었는지 확인"만 가능 → DB 는 잠긴 데이터를 **서버가 수정 거부**(Supabase 는 RLS 권한 규칙, Spring 은 API 에서 검사)
- **실행 방식**: 서버 버전은 더블클릭(`file://`)이 아니라 서버 주소로 접속하는 것이 맞음
  (`file://`에서 서버를 부르면 출처가 `null`이라 CORS 를 느슨하게 열어야 함 → 보안상 비추천).
  로컬 폴더 버전은 지금처럼 더블클릭 유지
- **코드 규칙 유지**: 빌드·프레임워크 없이 가능. Supabase/PocketBase 는 JS 클라이언트 한 파일을 `js/vendor/`에 두면 됨. Spring 은 서버만 Java 빌드, 화면은 지금 그대로
- **첨부 파일**: Supabase Storage / PocketBase 파일 필드 / Spring 파일 저장(또는 S3 호환 저장소)
- **이전·내보내기**: 기존 폴더 → DB 올리기, DB → 폴더 내려받기 기능이 있으면 두 버전을 오갈 수 있음 (지금의 폴더 구조가 곧 내보내기 형식)
- **보고서**: 지금처럼 화면에서 만들되 데이터만 저장소 인터페이스로 읽음

---

## 5. DB 표 구조 초안 (지금 폴더 구조와 1:1)

지금 데이터 형식은 `README.md`의 "데이터 폴더 구조"와 `HANDOFF.md` 4장(`meta.json` 스키마, `<탭>/items.json`) 참고.

| 표 | 주요 열 | 지금의 위치 |
|---|---|---|
| `projects` | id, name, 만든 사람 | 루트 폴더 |
| `nodes` | id, project_id, parent_id, name, kind(`screen` \| `folder`), 정렬 | 트리의 폴더 (meta.json 유무) |
| `screens` | node_id, status, ticket, worker, origin, asis_locked, asis_saved_at, hashes, **version** | meta.json |
| `status_logs` | screen_id, status, at, by | meta.statusLog |
| `unlock_logs` | screen_id, at, by, reason, relocked_at | meta.asisUnlockLog |
| `sql_blocks` | id, screen_id, kind(`asis` \| `tobe`), title, sql, asis_id, 순서 | meta.sqlBlocks + asis/sql · tobe/sql |
| `sql_history` | block_id, at, sql | tobe/history |
| `def_items` | id, screen_id, tab(`service` \| `object` \| `code`), title, grids(JSON), 순서 | `<탭>/items.json` |
| `item_logs` | 대상(sql_block / def_item), at, by, text | sqlBlocks[].log · items[].log |
| `memos` | screen_id, text | memo.md |
| `attachments` | screen_id, 경로, 크기, 해시, 저장소 위치 | attach/ (예전 asis/files · tobe/files 포함) |

- 정의서 표(`grids`)는 열 구성이 아직 바뀌는 중이라 JSON 한 칸으로 두는 것이 안전 (열이 확정되면 나눠도 됨)

---

## 6. 다음에 이어서 할 때

- 2장의 두 가지(외부 저장 허용 여부, 망분리 여부)를 먼저 정함 → 3장에서 백엔드 선택
- 그다음 1장 "저장소 인터페이스 정리"부터 시작 (로컬 폴더 버전의 동작이 그대로인지 확인하며 진행)
- 표 구조(5장)는 백엔드가 정해지면 확정
