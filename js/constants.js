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

/* ---- 티켓번호 ----
   화면(메뉴)을 만들 때 자동으로 붙는 6자리 일련번호 000001 ~ 999999. 프로젝트(루트)마다 하나씩 올라가고 겹치지 않습니다.
   화면에서는 고칠 수 없습니다. (screen-data.js openTicketSequence · nextTicket — 티켓이 없는 예전 화면은 열 때 붙임) */
const TICKET_DIGITS = 6;
/* 마지막으로 낸 번호를 기억하는 루트의 파일 — 화면을 지워도 그 번호를 다시 쓰지 않기 위함 */
const TICKET_SEQ_FILE = '.ticket-seq.json';
/* 트리 순서 파일 — 폴더(루트 포함)마다 그 아래 메뉴 · 폴더를 만든 순서대로 이름을 적어 둠 (screen-data.js listChildFolders)
   브라우저 폴더 기능은 만든 시각을 알려 주지 않으므로 직접 기록합니다. '.' 로 시작해 트리에 안 나옴 */
const FOLDER_ORDER_FILE = '.order.json';

/* ---- 화면(메뉴) 폴더 규칙 ---- */
/* 화면 폴더 안에서 데이터를 담는 하위 폴더 이름. 메뉴 이름으로 쓸 수 없고, 트리에도 나오지 않습니다. */
const RESERVED_FOLDER_NAMES = ['asis', 'tobe', 'attach', 'service', 'object', 'code'];
/* 윈도우 파일 이름에 쓸 수 없는 문자 */
const INVALID_NAME_CHARS = /[\\/:*?"<>|]/;
/* 윈도우가 장치 이름으로 쓰는 이름 — 폴더 이름으로 쓸 수 없음 (대소문자 무관, 'CON.txt' 처럼 뒤에 점이 붙어도 안 됨) */
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/* ---- 화면 폴더 안의 파일 위치 ---- */
/* 파일 저장 구조 버전. 2 = asis/files, tobe/files 아래에 원본 경로 그대로 저장 (migrate.js 참고) */
const FILE_STRUCTURE_VERSION = 2;
/* 파일 종류별 저장 폴더 (기존 파일 / 신규 파일 / 참고 첨부) */
const FILE_DIRS = {asis: 'asis/files', tobe: 'tobe/files', attach: 'attach'};
/* 신규 SQL 을 덮어쓸 때 이전 버전을 남기는 폴더 */
const TOBE_HISTORY_DIR = 'tobe/history';

/* ---- 원본(asis) / 신규(tobe) ----
   원본/신규가 있는 탭(LAYER_TABS: SQL · 서비스 · 오브젝트 · 공통코드관리)마다 잠금이 하나씩 있습니다(meta.tabLocks[탭]).
     잠그기 전 = 원본 단계: 그 탭에 원본을 입력
     잠근 뒤   = 신규 단계: 그 탭에서 신규를 고치고, 원본과 다른 곳을 표시 (screen-changes.js)
   잠글 때 아직 신규 쪽에 없는 원본 항목은 신규 쪽으로 복사합니다 (screen-lock.js). */
const LAYER_LABELS = {asis: '원본', tobe: '신규'};

/* 신규 항목이 가리키는 원본 항목 (SQL 블록 · 정의서 항목의 asisId)
   표의 줄은 줄 id(rowIds)로 짝짓습니다 — 원본을 복사한 줄은 같은 id, 새로 넣은 줄은 새 id.
   줄 id 가 없는 예전 데이터는 순서대로 'L0', 'L1' … 을 붙여 같은 순서끼리 짝짓습니다. */
const LEGACY_ROW_ID_PREFIX = 'L';

/* 알약 탭 줄에서 '삭제됨'(원본에만 있는 항목) 탭의 id 접두어 — 실제 항목 id 앞에 붙임 */
const GONE_TAB_PREFIX = 'gone-';

/* 원본 확인(해시)에 넣는 meta.json 안의 값 — 파일이 아니라 meta.json 의 일부라 이름에 # 을 붙여 구분 (screen-data.js findChangedFiles) */
const META_HASH_TARGETS = {
  'meta.json#sqlBlocks.asis': meta => (meta.sqlBlocks && meta.sqlBlocks.asis) || []
};

/* 신규 SQL 블록의 '비교할 기존 SQL' 지정 (meta.sqlBlocks.tobe[].asisId)
     '<기존 블록 id>' = 그 블록과 비교   '' = 짝 없음(신규 쿼리)
   값이 아예 없으면 예전 데이터 → 같은 순서의 기존 블록과 비교 (screen-data.js findPairedAsisBlock) */
const NO_ASIS_PAIR = '';

/* 글(텍스트) 입력란 id → 저장 파일 (지금은 오른쪽 메모 하나. 정의서 탭의 글 입력란은 표로 바뀜 — DEF_TABS) */
const TEXT_FIELD_FILES = {
  memo: 'memo.md'
};

/* ---- 정의서 탭 (서비스 · 오브젝트 · 공통코드관리) — screen-defs.js ----
   탭 안에서 항목(예: 서비스 하나)마다 알약 탭을 만들고, 항목 본문에 [정의 칸] + 표 여러 개 + 이력을 둡니다.
   저장: <dir>/asis.json(원본) · <dir>/tobe.json(신규)
     = [{id, asisId?(신규만), title, info?: {칸 key: 값}, grids: {표 키: [[칸, …], …]}, rowIds: {표 키: [줄 id, …]}, log?: [{at, by, text}]}]
     예전 <dir>/items.json 은 원본으로 읽습니다 (screen-data.js loadDefLayers)
   info : 정의 칸 목록(SQL_INFO_FIELDS 와 같은 형식) — 있는 탭만
   grids: [표 키, 화면에 보일 이름] — 표의 열은 GRID_COLUMNS['<탭>.<표 키>']
   ※ 공통코드관리 탭의 키는 예전 이름 그대로 'code' (저장 폴더 code/ 와 맞춤) */
const DEF_TABS = {
  // 서비스 표의 키는 예전 이름 그대로 (overview = 메세지정의, attrs = 기능정의, funcs = 권한제어) — 저장된 데이터와 맞추기 위함. preprocess = 전처리
  // serviceType: 조회 / 저장 — 저장 서비스는 ENTITY 를 연결함(entityLinks, screen-entity-links.js). 추가할 때 꼭 고르게 함(addChoice)
  service: {label: '서비스', dir: 'service', entityLinks: true,
    addChoice: {key: 'serviceType', label: '서비스 유형', options: [['조회', '조회용'], ['저장', '저장용 — ENTITY 를 연결합니다']]},
    info: [
    {key: 'serviceType', label: '서비스 유형', options: ['', '조회', '저장'], width: '100px'},
    {key: 'transactionName', label: '트랜잭션명'},
    {key: 'commandClass', label: '커멘드클래스명'},
    {key: 'twoPcYn', label: '2PC지원여부'},
    {key: 'logYn', label: '로그사용여부'},
    {key: 'remark', label: '비고'}
  ], grids: [['overview', '메세지정의'], ['attrs', '기능정의'], ['funcs', '권한제어(사용자 그룹)'], ['preprocess', '전처리']]},
  // 정의 칸 key 는 예전 이름 그대로(저장된 값과 맞추기 위함). '이름'(name)은 항목 이름과 겹쳐 뺌
  object: {label: '오브젝트', dir: 'object', info: [
    {key: 'displayName', label: '화면표시명'},
    {key: 'type', label: '오브젝트 유형'},
    {key: 'link', label: '오브젝트 링크'},
    {key: 'height', label: '높이', width: '100px'},
    {key: 'width', label: '너비', width: '100px'},
    {key: 'remark', label: '비고'}
  ], grids: [['attrs', '오브젝트 속성'], ['children', '하위 오브젝트']]},
  code: {label: '공통코드관리', dir: 'code', info: [
    {key: 'codeGroup', label: '코드분류'},
    {key: 'codeGroupName', label: '코드분류명'},
    {key: 'startDate', label: '시작일', type: 'date'},
    {key: 'endDate', label: '종료일', type: 'date'},
    {key: 'dataChangeYn', label: '자료변경여부'},
    {key: 'remark', label: '비고'}
  ], grids: [['common', '공통코드관리'], ['system', '시스템코드관리']]}
};

/* 예전 '개요' 표(첫 줄)를 정의 칸으로 옮길 때의 순서 — 공통코드관리 · 오브젝트의 개요 표가 정의 칸이 됨
   (screen-data.js overviewRowToInfo) */
const LEGACY_OVERVIEW_INFO = {
  code: ['codeGroup', 'codeGroupName', 'startDate', 'endDate'],
  object: ['name', 'displayName', 'link', 'type', 'height', 'width']   // 오브젝트 개요 표 [이름, 화면표시명, 링크, 유형, 높이, 넓이]
};

/* 표의 열 이름과 입력 종류 — 키: '<정의서 탭>.<표 키>'
   types: 열 번호 → 'date'(날짜 글 입력칸) | 'select'(고르는 칸)
   widths: 열 번호 → 열 너비(CSS 값). 있으면 그 열만 그 너비이고, 너비를 안 준 열이 남은 폭을 나눠 가짐 (screen.js gridHtml)
   options: 열 번호 → 고르는 값 목록 (첫 값이 기본값 — 새 줄 · 지운 칸 · 목록에 없는 값은 기본값)
   ※ code.system 의 열은 아직 임시안입니다 (나머지는 사용자가 정한 항목). 항목이 확정되면 여기만 고치면 됩니다.
     열을 바꿔도 저장된 값은 열 순서대로 들어가므로, 열 순서를 바꿀 때는 기존 데이터를 확인하세요. */
const GRID_COLUMNS = {
  'service.overview': {cols: ['속성타입', '값타입', '트랜잭션 속성명', '기본값', '비고'], types: {}},
  'service.attrs': {cols: ['기능구분', '기능명', '적용순서', '요청메세지 이름', '응답메세지 이름', '결과트리반환'], types: {}},
  'service.funcs': {cols: ['사용자그룹ID', '사용자그룹명', '적용여부'], types: {2: 'select'}, options: {2: ['미적용', '적용']}},
  'service.preprocess': {cols: ['옵션명', '값', '비고'], types: {}},
  // 속성구분코드 · 속성이름은 같은 너비로 나눌 때(약 33%)의 절반, 남은 폭은 속성값
  'object.attrs': {cols: ['속성구분코드', '속성이름', '속성값'], types: {}, widths: {0: '16.5%', 1: '16.5%'}},
  'object.children': {cols: ['순서', '자식오브젝트명', '자식오브젝트 출력명'], types: {}, widths: {0: '100px'}},
  'code.common': {cols: ['순번', '코드', '코드명', '시작일', '종료일', '주코드', '시스템코드', '참조코드', '어휘코드', '코드약명', '외국어명', '비고'],
    types: {3: 'date', 4: 'date'}},
  'code.system': {cols: ['코드분류', '코드', '코드명', '정렬순서', '사용여부'], types: {}},
  // SQL 블록마다 하나씩 있는 파라미터 표 (screen-blocks.js)
  'sql.params': {cols: ['파라미터명', '순서', '파라미터 유형', '인아웃 유형'], types: {}}
};

/* SQL 블록 위쪽의 'SQL 정의' 칸 — key 는 meta.sqlBlocks[종류][].info 에 저장되는 이름 (그리기: screen.js infoFieldsHtml)
   options: 고르는 칸(첫 값 '' = 고르지 않음) · multiline: 여러 줄 · wide: 한 줄 전체 · type: 'date' 날짜(20260101 → 2026-01-01)
   width: 칸 너비 고정(CSS 값, 예: '100px' — 나머지 칸이 남은 폭을 나눔) */
const SQL_INFO_FIELDS = [
  {key: 'displayName', label: '화면표시명'},
  {key: 'dataSource', label: '데이터소스'},
  {key: 'useYn', label: '사용여부'},
  {key: 'version', label: '버전'},
  {key: 'status', label: '상태'},
  {key: 'comment', label: '커맨트'}
];

/* 표로 바꾸기 전의 정의서 파일 — <탭>/items.json 이 없을 때 이 내용을 '기본' 항목 하나로 옮겨 보여 줍니다(screen-data.js loadDefLayers — 원본으로).
   글은 줄·칸으로 나눠 표에 넣습니다(붙여넣기와 같은 규칙). 예전 파일은 지우지 않습니다. */
const LEGACY_DEF_FILES = {
  service: {grid: null, texts: {overview: 'service/overview.md', attrs: 'service/attributes.md', funcs: 'service/functions.md'}},
  object: {grid: 'object/overview.json', texts: {attrs: 'object/attributes.md', children: 'object/children.md'}},
  code: {grid: 'code/overview.json', texts: {common: 'code/common.md', system: 'code/system.md'}}
};
/* ---- ENTITY (프로젝트 공통) ----
   저장 서비스가 쓰는 ENTITY. 여러 화면의 여러 서비스가 같은 ENTITY 를 함께 쓰므로 화면 폴더가 아니라 루트(ENTITY_FILE)에 한 벌만 보관합니다.
   ENTITY 마다 원본 · 신규 · 잠금을 함께 가집니다 (entity-data.js). 화면마다 'ENTITY' 탭으로 보고 고칩니다 (screen-entity.js).
   info: 정의 칸 (사용자가 정한 항목). grids: 표 — 아직 없음 (필요하면 [표 키, 이름] 과 GRID_COLUMNS['entity.<표 키>'] 추가)
   addChoice: 추가할 때 꼭 고르는 것 — 원본(기존 ENTITY)부터 넣을지, 원본 없는 새 ENTITY 인지 */
const ENTITY_DEF = {
  label: 'ENTITY',
  addChoice: {key: 'origin', label: 'ENTITY 구분', options: [['original', '기존 ENTITY — 원본부터 입력'], ['new', '새 ENTITY — 원본 없음']]},
  info: [
    // 엔터티명은 블록 위 이름칸(제목)이 맡으므로 정의 칸에 두지 않음
    {key: 'displayName', label: '화면표시명'},
    {key: 'historyTypeCode', label: '이력관리 유형 코드'},
    {key: 'unitWorkCode', label: '단위업무코드'},
    {key: 'writerType', label: '작성자 유형'},
    {key: 'logYn', label: '로그사용여부'}
  ],
  grids: []
};
/* 프로젝트 공통 ENTITY 를 보관하는 루트의 파일 ('.' 으로 시작하는 폴더라 트리에 나오지 않음) */
const ENTITY_FILE = '.entity/entities.json';
/* 저장 서비스의 유형 값 (이 값일 때 ENTITY 연결 영역이 나옴) */
const SERVICE_TYPE_SAVE = '저장';

/** 정의서 탭 · ENTITY 의 설정 (그리기 · 비교 · 이력이 함께 씀) */
const defConfigOf = tab => (tab === 'entity' ? ENTITY_DEF : DEF_TABS[tab]);

/* 원본/신규가 있는 탭 (탭마다 원본 잠금이 따로 있음 — screen-data.js tabLocksOf). ENTITY 는 ENTITY 마다 따로 잠금 */
const LAYER_TABS = ['sql', ...Object.keys(DEF_TABS)];

/* 화면 종류 (meta.screenKind) — 파일 추가 창에서 고름. 없으면 기존 화면(예전 데이터 포함)
   기존: 탭마다 원본을 넣고 잠근 뒤 신규 작업 / 신규: 원본이 없는 새 화면 — 모든 탭이 처음부터 신규 단계(잠그기 · 잠금 풀기 없음) */
const SCREEN_KIND_NEW = 'new';
/* 신규 화면을 만들 때(화면 이력)와 신규 화면의 항목을 처음 등록할 때(항목 이력) 남기는 글 */
const NEW_SCREEN_LOG_TEXT = '신규 화면으로 만듦 (원본 없음)';
const SCREEN_KIND_CHOICES = [
  {value: '', label: '기존 화면 변경', hint: '원본(ASIS)을 넣고 잠근 뒤 신규로 고칩니다'},
  {value: SCREEN_KIND_NEW, label: '신규 화면', hint: '원본 없이 모든 탭을 처음부터 신규로 작성합니다'}
];
/* 예전(화면 하나에 잠금 하나) meta 값 — 읽을 때 탭별 잠금으로 바꾸고, 잠그거나 풀 때 지움 */
const LEGACY_LOCK_KEYS = ['asisLocked', 'asisSavedAt', 'asisLockedIds', 'hashes', 'asisUnlockLog'];

/* 원본/신규로 나누기 전의 정의서 파일 이름 (<dir>/items.json) — 원본으로 읽음 */
const LEGACY_DEF_ITEMS_FILE = 'items.json';
/* 예전 내용을 옮겨 만든 항목의 id·이름 */
const LEGACY_DEF_ITEM = {id: 'legacy', title: '기본'};

/* 글자로 비교할 수 있는 파일 확장자 (나머지는 해시로만 비교) */
const TEXT_FILE_PATTERN = /\.(sql|jsp|java|xml|js|jsx|ts|vue|html?|css|properties|txt|json|md|ya?ml|sh|bat|ftl|vm|tag|tld)$/i;

/* ---- 아이콘 (인라인 SVG 문자열) ---- */
const ICON = {
  folder: '<svg class="ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  caret: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',   // 항목 이력 제목
  unlock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-1.3"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  upload: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  /** 둥근 원 안의 느낌표 — 안내 */
  info: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>',
  logo: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>'
};

/* ---- 우클릭 메뉴 아이콘 (ICON 과 같은 모양 규칙: 선 굵기 1.8, 색은 글자색을 따름) ---- */
const menuIconSvg = paths => `<svg class="ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"`
  + ` stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const MENU_ICON = {
  /** 폴더 + 더하기 — 하위 폴더(묶음) 추가 */
  folderAdd: menuIconSvg('<path d="M3 7.5a1 1 0 0 1 1-1h3.5l2 2H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M12 11.5v4M10 13.5h4"/>'),
  /** 문서 + 더하기 — 파일(화면) 추가 */
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
