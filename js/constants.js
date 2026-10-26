/* ==========================================================================
   constants.js — 앱 전체에서 쓰는 고정값 모음

   ※ 이 앱의 js 파일들은 일반 <script> 로 index.html 에 적힌 순서대로 읽힙니다.
     (file:// 로 열면 브라우저가 ES 모듈(import/export)을 막기 때문)
     그래서 각 파일 맨 위에 선언한 const / let / function 은 모든 파일이 함께 씁니다.
     - 이름이 겹치면 안 됩니다. (window 의 기본 속성 이름 screen, status, name, history 등도 피하기)
     - 파일을 읽는 순간 실행되는 코드는 두지 않습니다. 실행은 main.js 의 boot() 에서 시작합니다.
   ========================================================================== */

/* ---- 화면 상태 ----
   배열 순서(0~3)가 곧 상태 번호입니다. CSS 의 .s0 ~ .s3 색, 상태 선택 상자 value 와 짝을 이룹니다. */
const STATUS_LIST = ['요청', '진행', '개발', '운영'];
const STATUS_PROD = 3;          // '운영' 의 번호 (운영 반영률 계산용)
const STATUS_DEV = 2;           // '개발' 의 번호 ('개발 이상' 판단용)
/* 예전 버전에서 쓰던 상태 이름 → 지금 이름 */
const LEGACY_STATUS_NAMES = {'작업중': '진행', '개발배포': '개발', '운영배포': '운영', '테스트': '진행', '배포완료': '운영'};

/* ---- 화면(메뉴) 폴더 규칙 ---- */
/* 화면 폴더 안에서 데이터를 담는 하위 폴더 이름. 메뉴 이름으로 쓸 수 없고, 트리에도 나오지 않습니다. */
const RESERVED_FOLDER_NAMES = ['asis', 'tobe', 'attach', 'service', 'object', 'code'];
/* 윈도우 파일 이름에 쓸 수 없는 문자 */
const INVALID_NAME_CHARS = /[\\/:*?"<>|]/;

/* ---- 화면 폴더 안의 파일 위치 ---- */
/* 파일 저장 구조 버전. 2 = asis/files, tobe/files 아래에 원본 경로 그대로 저장 (migrate.js 참고) */
const FILE_STRUCTURE_VERSION = 2;
/* 파일 종류별 저장 폴더 (기존 파일 / 신규 파일 / 참고 첨부) */
const FILE_DIRS = {asis: 'asis/files', tobe: 'tobe/files', attach: 'attach'};
/* 신규 SQL 을 덮어쓸 때 이전 버전을 남기는 폴더 */
const TOBE_HISTORY_DIR = 'tobe/history';

/* 글(텍스트) 입력란 id → 저장 파일 */
const TEXT_FIELD_FILES = {
  memo: 'memo.md',
  svOverview: 'service/overview.md',
  svAttr: 'service/attributes.md',
  svFunc: 'service/functions.md',
  obAttr: 'object/attributes.md',
  obChild: 'object/children.md',
  cdCommon: 'code/common.md',
  cdSystem: 'code/system.md'
};
/* 표(그리드) id → 저장 파일 */
const GRID_FILES = {obj: 'object/overview.json', code: 'code/overview.json'};
/* 표의 열 이름과 입력 종류 (types: 열 번호 → input type) */
const GRID_COLUMNS = {
  obj: {cols: ['이름', '화면표시명', '링크', '유형', '높이', '넓이'], types: {}},
  code: {cols: ['코드분류', '코드분류명', '시작일', '종료일'], types: {2: 'date', 3: 'date'}}
};
/* 정의서 탭별로 들어 있는 글 입력란 / 표 */
const TAB_TEXT_FIELDS = {service: ['svOverview', 'svAttr', 'svFunc'], object: ['obAttr', 'obChild'], code: ['cdCommon', 'cdSystem']};
const TAB_GRID_FIELDS = {object: ['obj'], code: ['code']};

/* 글자로 비교할 수 있는 파일 확장자 (나머지는 해시로만 비교) */
const TEXT_FILE_PATTERN = /\.(sql|jsp|java|xml|js|jsx|ts|vue|html?|css|properties|txt|json|md|ya?ml|sh|bat|ftl|vm|tag|tld)$/i;

/* ---- 아이콘 (인라인 SVG 문자열) ---- */
const ICON = {
  folder: '<svg class="ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  caret: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  upload: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  logo: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>'
};
