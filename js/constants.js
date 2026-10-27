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

/* 신규 SQL 블록의 '비교할 기존 SQL' 지정 (meta.sqlBlocks.tobe[].asisId)
     '<기존 블록 id>' = 그 블록과 비교   '' = 짝 없음(신규 쿼리)
   값이 아예 없으면 예전 데이터 → 같은 순서의 기존 블록과 비교 (screen-data.js findPairedAsisBlock) */
const NO_ASIS_PAIR = '';

/* 글(텍스트) 입력란 id → 저장 파일 (지금은 오른쪽 메모 하나. 정의서 탭의 글 입력란은 표로 바뀜 — DEF_TABS) */
const TEXT_FIELD_FILES = {
  memo: 'memo.md'
};

/* ---- 정의서 탭 (서비스 · 오브젝트 · 코드분류) — screen-defs.js ----
   탭 안에서 항목(예: 서비스 하나)마다 알약 탭을 만들고, 항목 본문에 표 여러 개 + 이력을 둡니다.
   저장: <file> = [{id, title, grids: {표 키: [[칸, …], …]}, log?: [{at, by, text}]}]
   grids: [표 키, 화면에 보일 이름] — 표의 열은 GRID_COLUMNS['<탭>.<표 키>'] */
const DEF_TABS = {
  service: {label: '서비스', file: 'service/items.json', grids: [['overview', '개요'], ['attrs', '속성정의'], ['funcs', '기능정의']]},
  object: {label: '오브젝트', file: 'object/items.json', grids: [['overview', '개요'], ['attrs', '속성'], ['children', '하위 오브젝트']]},
  code: {label: '코드분류', file: 'code/items.json', grids: [['overview', '개요'], ['common', '공통코드내역관리'], ['system', '시스템코드관리']]}
};

/* 표의 열 이름과 입력 종류 — 키: '<정의서 탭>.<표 키>' (types: 열 번호 → input type)
   ※ 개요 두 개(object.overview, code.overview)를 뺀 나머지 열은 임시안입니다. 항목이 확정되면 여기만 고치면 됩니다.
     열을 바꿔도 저장된 값은 열 순서대로 들어가므로, 열 순서를 바꿀 때는 기존 데이터를 확인하세요. */
const GRID_COLUMNS = {
  'service.overview': {cols: ['서비스ID', '서비스명', '설명'], types: {}},
  'service.attrs': {cols: ['속성ID', '속성명', '타입', '필수', '설명'], types: {}},
  'service.funcs': {cols: ['기능ID', '기능명', '설명'], types: {}},
  'object.overview': {cols: ['이름', '화면표시명', '링크', '유형', '높이', '넓이'], types: {}},
  'object.attrs': {cols: ['속성명', '값', '설명'], types: {}},
  'object.children': {cols: ['이름', '화면표시명', '유형', '설명'], types: {}},
  'code.overview': {cols: ['코드분류', '코드분류명', '시작일', '종료일'], types: {2: 'date', 3: 'date'}},
  'code.common': {cols: ['코드분류', '코드', '코드명', '정렬순서', '사용여부'], types: {}},
  'code.system': {cols: ['코드분류', '코드', '코드명', '정렬순서', '사용여부'], types: {}}
};

/* 표로 바꾸기 전의 정의서 파일 — <탭>/items.json 이 없을 때 이 내용을 '기본' 항목 하나로 옮겨 보여 줍니다(screen-data.js loadDefItems).
   글은 줄·칸으로 나눠 표에 넣습니다(붙여넣기와 같은 규칙). 예전 파일은 지우지 않습니다. */
const LEGACY_DEF_FILES = {
  service: {grid: null, texts: {overview: 'service/overview.md', attrs: 'service/attributes.md', funcs: 'service/functions.md'}},
  object: {grid: 'object/overview.json', texts: {attrs: 'object/attributes.md', children: 'object/children.md'}},
  code: {grid: 'code/overview.json', texts: {common: 'code/common.md', system: 'code/system.md'}}
};
/* 예전 내용을 옮겨 만든 항목의 id·이름 */
const LEGACY_DEF_ITEM = {id: 'legacy', title: '기본'};

/* 글자로 비교할 수 있는 파일 확장자 (나머지는 해시로만 비교) */
const TEXT_FILE_PATTERN = /\.(sql|jsp|java|xml|js|jsx|ts|vue|html?|css|properties|txt|json|md|ya?ml|sh|bat|ftl|vm|tag|tld)$/i;

/* ---- 아이콘 (인라인 SVG 문자열) ---- */
const ICON = {
  folder: '<svg class="ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  caret: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-1.3"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  upload: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  logo: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>'
};

/* ---- 우클릭 메뉴 아이콘 (ICON 과 같은 모양 규칙: 선 굵기 1.8, 색은 글자색을 따름) ---- */
const menuIconSvg = paths => `<svg class="ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"`
  + ` stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const MENU_ICON = {
  /** 폴더 + 더하기 — 하위 폴더(묶음) 추가 */
  folderAdd: menuIconSvg('<path d="M3 7.5a1 1 0 0 1 1-1h3.5l2 2H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M12 11.5v4M10 13.5h4"/>'),
  /** 문서 + 더하기 — 하위 메뉴(화면) 추가 */
  pageAdd: menuIconSvg('<path d="M13.5 3.5H7a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z"/><path d="M13.5 3.5V8H18"/><path d="M12 11.5v5M9.5 14h5"/>'),
  /** 클립보드 — 탐색기 경로 복사 */
  clipboard: menuIconSvg('<path d="M9.5 4.5h5v2.5h-5z"/><path d="M14.5 5.5H17a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1h2.5"/>'),
  /** 겹친 사각형 — 복사 */
  copy: menuIconSvg('<rect x="9.5" y="9.5" width="10" height="10" rx="1.5"/><path d="M15 6.5v-1a1 1 0 0 0-1-1H5.5a1 1 0 0 0-1 1V14a1 1 0 0 0 1 1h1"/>'),
  /** 폴더 + 들어가는 화살표 — 이동 */
  move: menuIconSvg('<path d="M3 7.5a1 1 0 0 1 1-1h3.5l2 2H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9.5 13.5h5M12.5 11l2.5 2.5-2.5 2.5"/>'),
  /** 연필 — 이름 변경 */
  rename: menuIconSvg('<path d="M4.5 19.5h4l10-10a2.47 2.47 0 0 0-3.5-3.5l-10 10z"/><path d="M13.5 7 17 10.5"/>'),
  /** 조절 손잡이 — 루트 경로 다시 설정 */
  settings: menuIconSvg('<path d="M4 8h8M17 8h3M4 16h3M12 16h8"/><circle cx="14.5" cy="8" r="2.2"/><circle cx="9.5" cy="16" r="2.2"/>'),
  /** 나란히 놓인 두 칸 — 기존과 비교 */
  compare: menuIconSvg('<rect x="3.5" y="5" width="7" height="14" rx="1"/><rect x="13.5" y="5" width="7" height="14" rx="1"/>'),
  /** 휴지통 — 삭제 */
  trash: menuIconSvg('<path d="M4.5 7h15M9.5 7V4.5h5V7"/><path d="M6.5 7l.8 12.1a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9L17.5 7"/><path d="M10.5 11v5.5M13.5 11v5.5"/>'),
  /** 체크 — 지금 열려 있는 프로젝트 */
  check: menuIconSvg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  /** 폴더 — 등록해 둔 프로젝트 */
  folderOpen: menuIconSvg('<path d="M3 7.5a1 1 0 0 1 1-1h3.5l2 2H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'),
  /** 열쇠 — 폴더 권한이 끊겨 다시 허용이 필요한 프로젝트 */
  key: menuIconSvg('<circle cx="8" cy="8" r="3.5"/><path d="M10.5 10.5 19 19M16 16l-2 2M19 19l1.5-1.5"/>')
};
