/* ==========================================================================
   screen.js — 화면(메뉴) 하나 열기 · 그리기 · 탭 · 변경 감지

   화면 관련 코드는 여러 파일로 나뉩니다.
     screen.js         : 화면 상태, 열기/그리기, 편집기 만들기, 탭, 변경 감지(저장 바 표시), 표 · 정의 칸 HTML
     screen-blocks.js  : SQL 블록 (그리기·삭제, 원본과 나란히 보기, 바뀐 줄 표시, 변경 이력)
     screen-sqltabs.js : 알약 탭(공통) · SQL 탭 ([+ SQL 추가] 창) · 항목 이력(공통)
     screen-defs.js    : 정의서 탭 (서비스 · 오브젝트 · 공통코드관리 — 항목마다 탭 · 정의 칸 · 표 · 이력)
     screen-changes.js : 신규 단계에서 원본과 다른 곳 표시 · 삭제된 항목/줄 · 되살리기
     screen-lock.js    : 원본 잠그기 · 잠금 풀기 · 원본 확인(해시)
     screen-grid.js    : 표 조작 (범위 선택 · 키보드 · 붙여넣기 · 되돌리기)
     screen-files.js   : 파일 목록 (끌어다 놓기, 저장 경로, 신규/수정/동일 표시)
     screen-save.js    : 등록 · 상태 변경, 화면 이벤트 연결

   탭: SQL · 서비스 · 오브젝트 · 공통코드관리 · 첨부 (두 소스 비교는 상단 [소스 비교] 창 — source-diff.js)
   원본 / 신규: 탭마다(SQL · 서비스 · 오브젝트 · 공통코드관리) 잠그기 전(원본 단계)에는 원본을, 잠근 뒤(신규 단계)에는 신규를 고칩니다 (screen-lock.js)
   화면 이력(상태 변경 · 삭제 · 잠금)은 상태 옆 [이력] 창, 변경 요약(메모)은 '요약·첨부' 탭 (오른쪽 영역은 없앰)
   등록은 하단 저장 바 하나로 모음. 잠그기는 각 탭 맨 위 단계 안내 띠의 단추로.
   ========================================================================== */

/* ---- 탭 · 등록 영역 ---- */
const SCREEN_TABS = [
  ['sql', 'SQL'],
  ['service', '서비스'], ['entity', 'ENTITY'], ['object', '오브젝트'], ['code', '공통코드관리'], ['attach', '요약·첨부']
];
/* 저장 바의 [등록] 이 다루는 영역과 이름 (등록 순서대로). 'common' = 작업자 · 원본 위치 · 변경 요약(메모)
   'sql' 과 정의서 탭은 그 탭에서 지금 고치는 쪽(원본 단계 → 원본, 신규 단계 → 신규)에 저장 */
const SAVE_SECTIONS = [
  ['common', '작업 정보 · 변경 요약'], ['sql', 'SQL'], ['service', '서비스'], ['entity', 'ENTITY'],
  ['object', '오브젝트'], ['code', '공통코드관리'], ['attach', '첨부']
];

/* ---- 편집기 ----
   편집기 id 규칙
     글 입력란: TEXT_FIELD_FILES 의 키 (memo)
     SQL 블록 : 접두어 + 블록 id  →  a:원본 SQL  t:신규 SQL  r:(예전) 롤백 SQL  p:신규 블록 왼쪽의 원본 SQL(읽기 전용) */
const EDITOR_PREFIX = {asis: 'a:', tobe: 't:', rollback: 'r:', pair: 'p:'};
const editorId = (kind, blockId) => EDITOR_PREFIX[kind] + blockId;
/* 글 입력란 높이(px). 여기에 없는 id 는 SQL 편집기 */
const TEXT_EDITOR_HEIGHTS = {memo: 160};
const SQL_EDITOR_HEIGHT = 400;   // SQL 탭은 한 번에 하나만 보이므로 넉넉하게 (아래 모서리를 끌어 조절 가능)
const ROLLBACK_EDITOR_HEIGHT = 120;

/** 작업 정보(상단 한 줄) 입력칸 id = meta 의 키 (티켓번호는 자동으로 붙고 고칠 수 없어 빠짐) */
const COMMON_FIELDS = ['worker', 'origin'];

/**
 * 새 화면 상태 만들기 (app.screen 에 들어감)
 */
function createScreenState(path, dir, meta) {
  return {
    path,                 // 화면 경로 ['인사', '사원조회']
    dir,                  // 화면 폴더 핸들
    meta,                 // meta.json 내용
    initialValues: {},    // 편집기 id → 처음 그릴 때 넣을 값
    blocks: {asis: [], tobe: []},       // SQL 블록 정보 (원본 · 신규)
    activeBlock: {asis: '', tobe: ''},  // 지금 보고 있는 SQL 탭(블록 id)
    defItems: {},         // 정의서 탭 → 지금 고치는 쪽 항목 [{id, asisId?, title, info, grids, rowIds, log}] (screen-defs.js)
    savedDefItems: {},    // 정의서 탭 → 그 쪽의 마지막으로 등록된 항목 목록 (변경 감지 · 이력 바로 저장용)
    asisDefItems: {},     // 정의서 탭 → 원본 항목 (신규 단계에서 비교 · 삭제된 항목 표시, screen-changes.js)
    activeDef: {},        // 정의서 탭(과 'entity') → 지금 보고 있는 항목 id
    entities: [],         // 프로젝트 공통 ENTITY (루트의 ENTITY_FILE — entity-data.js · screen-entity.js)
    savedEntities: [],    // ENTITY 의 마지막 등록 상태
    entityFilter: 'all',  // ENTITY 탭 보기: 'all'(전체, 처음) | 'used'(이 화면에서 쓰는 것) — 처음부터 'used' 면 연결 전 ENTITY 가 안 보여 사라진 것처럼 보임
    goneRows: {},         // 표 id → 원본에만 있는 줄 [{id, cells}] (삭제된 줄 되살리기용, screen-changes.js)
    removedTobeBlocks: [],              // 삭제한 신규 블록 (등록할 때 파일도 지움)
    removedAsisBlocks: [],              // 잠금을 푼 뒤 삭제한 등록된 기존 블록 (다시 잠글 때 파일도 지움)
    savedFiles: {asis: [], tobe: [], attach: []},    // 등록된 파일 경로
    pendingFiles: {asis: [], tobe: [], attach: []},  // 등록 대기 파일 {file, path}
    editors: {},          // 편집기 id → 편집기 (Ace 또는 글 입력란 래퍼)
    savedValues: {},      // 편집기 id → 마지막으로 등록된 값 (변경 감지용)
    savedBlockOrder: {},  // 'asis'|'tobe' → 블록 순서·제목 JSON
    hasSavedTobe: false,  // 등록된 신규 SQL 이 있는지
    lineMarkers: {},      // 블록 id → 바뀐 줄 색칠 표시들
    markTimers: {},       // 블록 id → 바뀐 줄 다시 계산 타이머
    gridPasteHistory: {}  // 표 id → 붙여넣기 되돌리기·다시 실행 기록 {undo, redo} (Ctrl+Z / Ctrl+Y, screen-grid.js)
  };
}

/* ======================= 값 · 변경 감지 ======================= */

/** 편집기 값 (편집기가 없으면 '') */
const getEditorValue = id => {
  const editor = app.screen.editors[id];
  return editor ? editor.getValue() : '';
};

/** 편집기 값이 마지막 등록 값과 다른지 */
const isEditorChanged = id => {
  const editor = app.screen.editors[id];
  return !!editor && editor.getValue() !== app.screen.savedValues[id];
};

/* 표의 칸 요소 (글 입력칸 · 고르는 칸) */
const GRID_CELL_SELECTOR = 'input, select';

/** 열의 기본값 — 고르는 칸은 첫 값, 글 칸은 '' */
const gridCellDefault = (columnsKey, col) => ((GRID_COLUMNS[columnsKey].options || {})[col] || [''])[0];

/**
 * 표의 지금 값 {rows: 칸 값들, ids: 줄 id 들} (빈 줄 제외)
 * 모든 칸이 기본값인 줄은 빈 줄로 봅니다 — 고르는 칸(기본 '미적용')만 있는 새 줄이 저장되지 않게
 * 줄 id(tr 의 data-rid)는 원본과 신규의 같은 줄을 짝짓는 데 씁니다 (layer-diff.js)
 */
function readGridOf(table) {
  const columnsKey = table.dataset.cols;
  const rows = [], ids = [];
  for (const tr of table.tBodies[0].rows) {
    const cells = [...tr.querySelectorAll(GRID_CELL_SELECTOR)].map(cell => cell.value.trim());
    if (!cells.some((value, col) => value !== gridCellDefault(columnsKey, col))) continue;
    rows.push(cells);
    ids.push(tr.dataset.rid);
  }
  return {rows, ids};
}

/** 영역에 등록된 내용이 있는지 (탭의 ✓ 표시) */
function isRegistered(section) {
  const screen = app.screen;
  if (section === 'sql') {
    return isTabLocked('sql')
      ? screen.hasSavedTobe || screen.savedFiles.tobe.length > 0
      : ((screen.meta.sqlBlocks && screen.meta.sqlBlocks.asis) || []).length > 0;
  }
  if (section === 'attach') return screen.savedFiles.attach.length > 0;
  if (section === 'common') return !!(screen.savedValues.memo || '').trim();
  if (section in DEF_TABS) return (screen.savedDefItems[section] || []).length > 0;
  if (section === 'entity') return screen.savedEntities.length > 0;
  return false;
}

/** 영역에 등록하지 않은 변경이 있는지 (탭의 ● 표시, 저장 바) */
function isDirty(section) {
  const screen = app.screen;
  if (!screen) return false;
  if (section === 'sql') return isBlockListChanged(layerOf('sql')) || screen.pendingFiles[layerOf('sql')].length > 0;
  if (section === 'attach') return screen.pendingFiles.attach.length > 0;
  if (section === 'common') {
    const fieldChanged = COMMON_FIELDS.some(field => $('#' + field) && $('#' + field).value.trim() !== (screen.meta[field] || ''));
    return fieldChanged || isEditorChanged('memo');
  }
  if (section in DEF_TABS) return isDefTabChanged(section);
  if (section === 'entity') return isEntityTabChanged();
  return false;
}

/** 화면 어디든 등록하지 않은 변경이 있는지 */
const hasUnsavedChanges = () => SAVE_SECTIONS.some(([section]) => isDirty(section));

/**
 * 다른 곳으로 이동해도 되는지: 등록하지 않은 변경이 있으면 버리고 이동할지 물음
 * @returns {Promise<boolean>}
 */
async function confirmLeaveScreen() {
  if (!app.screen || !hasUnsavedChanges()) return true;
  return askConfirm({title: '등록하지 않은 변경이 있습니다', desc: '이동하면 입력한 내용이 사라집니다. 계속할까요?', okText: '버리고 이동', danger: true});
}

/** 탭 표시(✓ 등록됨 / ● 미등록)와 하단 저장 바를 지금 상태로 갱신 — 입력할 때마다 불림 */
function refreshIndicators() {
  const screen = app.screen;
  if (!screen || !$('#savebar')) return;

  // 탭 옆 표시. '요약·첨부' 탭은 변경 요약(메모)까지 함께 봄 (메모는 'common' 영역으로 등록)
  const memoChanged = isEditorChanged('memo'), memoSaved = !!(screen.savedValues.memo || '').trim();
  for (const section of SCREEN_TABS.map(([id]) => id)) {
    const mark = document.querySelector(`.mk[data-m="${section}"]`);
    if (!mark) continue;
    const dirty = isDirty(section) || (section === 'attach' && memoChanged);
    const registered = isRegistered(section) || (section === 'attach' && memoSaved);
    mark.className = 'mk ' + (dirty ? 'dirty' : registered ? 'done' : '');
    mark.textContent = dirty ? '' : registered ? '✓' : '';
    mark.title = dirty ? '아직 등록하지 않은 변경이 있습니다' : registered ? '등록된 내용이 있습니다' : '';
  }

  // 첨부 탭 이름에 개수, 탭 줄의 이름 · ● · 원본 대비 상태
  const attachLabel = $('.tab[data-t="attach"] .tl');
  if (attachLabel) attachLabel.textContent = '요약·첨부' + (screen.savedFiles.attach.length ? ' ' + screen.savedFiles.attach.length : '');
  refreshSqlTabMarks(layerOf('sql'));
  for (const tab of Object.keys(DEF_TABS)) refreshDefTabMarks(tab);
  refreshEntityTabMarks();
  scheduleChangeMarks();

  // 저장 바 (원본 단계인 탭은 '(원본)'을 붙여 원본으로 저장된다는 것을 알림)
  const dirtySections = SAVE_SECTIONS.filter(([section]) => isDirty(section));
  const sectionLabel = ([section, label]) => label + (LAYER_TABS.includes(section) && !isTabLocked(section) ? '(원본)' : '');
  $('#sbText').innerHTML = dirtySections.length
    ? `<i class="dot warn"></i><b>등록하지 않은 변경 ${dirtySections.length}건</b><span class="muted">${dirtySections.map(sectionLabel).join(' · ')}</span>`
    : `<span class="muted ok-t">${ICON.check} 모든 변경이 등록되었습니다</span>`;
  $('#btnSaveAll').disabled = !dirtySections.length;
  $('#btnDiscard').disabled = !dirtySections.length;
  renderMiniBar();
}

/* ======================= 화면 열기 ======================= */

/**
 * 화면 열기
 * @param {string[]} path 화면 경로
 * @param {boolean} [reload] true = '변경 취소'로 다시 불러오기 (이동 확인을 건너뛰고, 보던 탭 유지)
 */
async function openScreen(path, reload) {
  if (!reload && !(await confirmLeaveScreen())) return;
  let dir;
  try {
    dir = await getSubDir(app.root, path, false);
  } catch (error) {
    if (!isNotFoundError(error)) return toastError('화면을 열지 못했습니다', error);
    // 탐색기에서 지웠거나 옮긴 폴더: 알리고 트리를 새로 그려 목록에서 없앰 (루트째 없어졌으면 프로젝트를 목록에서 제거)
    toast(`‘${lastOf(path)}’ 폴더가 없습니다. 목록을 새로 고칩니다.`);
    await recheckFolders();
    return;
  }
  await withBusy('화면을 여는 중…', async () => {
    const meta = await readJson(dir, 'meta.json', {});
    // 루트를 열 때 파일 구조 변환을 마쳤으므로, 이후 이 화면에 저장하는 파일은 새 구조
    if (!meta.filesV) meta.filesV = FILE_STRUCTURE_VERSION;
    // 티켓번호가 없는 예전 화면은 지금 붙여 바로 저장
    if (!meta.ticket) {
      const seq = await openTicketSequence(app.root);
      meta.ticket = nextTicket(seq);
      await writeJson(dir, 'meta.json', meta);
      await saveTicketSequence(seq);
    }
    const previousScreen = app.screen;
    const screen = createScreenState(path, dir, meta);
    if (reload && previousScreen) {   // '변경 취소' 뒤에도 보던 SQL 탭·정의서 항목 유지
      screen.activeBlock = {...previousScreen.activeBlock};
      screen.activeDef = {...previousScreen.activeDef};
    }
    app.screen = screen;
    if (!reload) app.tab = 'sql';

    for (const [fieldId, file] of Object.entries(TEXT_FIELD_FILES)) screen.initialValues[fieldId] = await readText(dir, file) || '';
    screen.blocks.asis = await loadSqlBlocks(dir, meta, 'asis');
    screen.blocks.tobe = await loadSqlBlocks(dir, meta, 'tobe');
    for (const block of screen.blocks.asis) screen.initialValues[editorId('asis', block.id)] = block.sql;
    for (const block of screen.blocks.tobe) {
      screen.initialValues[editorId('tobe', block.id)] = block.sql;
      screen.initialValues[editorId('rollback', block.id)] = block.rbText;
    }
    // 정의서: 화면에는 지금 고치는 쪽만, 원본은 비교용으로 따로 (탭마다 잠금이 따로)
    for (const tab of Object.keys(DEF_TABS)) {
      const locked = isTabLockedIn(meta, tab);
      const layers = await loadDefLayers(dir, tab, locked);
      screen.asisDefItems[tab] = layers.asis;
      screen.defItems[tab] = locked ? layers.tobe : layers.asis;
      screen.savedDefItems[tab] = JSON.parse(JSON.stringify(screen.defItems[tab]));   // 등록된 상태 (따로 복사해 둠)
    }
    // 프로젝트 공통 ENTITY (화면을 열 때마다 새로 읽음 — 다른 화면에서 고친 내용이 보이게)
    screen.entities = await loadEntities(app.root);
    screen.savedEntities = JSON.parse(JSON.stringify(screen.entities));
    if (reload && previousScreen) screen.entityFilter = previousScreen.entityFilter;
    for (const kind of Object.keys(FILE_DIRS)) screen.savedFiles[kind] = await listFilesDeep(dir, FILE_DIRS[kind]);

    homeRenderSeq++;   // 그리던 현황(대시보드)이 있으면 멈춤
    renderBreadcrumb();
    await renderTree();
    await renderScreen();
  });
}

/* ======================= 화면 그리기 ======================= */

/**
 * 마우스를 올리면 나타나는 복사 아이콘 버튼 (SQL 편집기 · SQL 블록 제목칸)
 * 글 입력란의 [복사] 버튼(data-copy)과 속성 이름을 나눠, 어느 단추인지 코드에서 헷갈리지 않게 함
 * @param {string} dataAttr 'data-copy-ed="편집기 id"' 또는 'data-copy-input'(같은 칸의 입력칸 복사)
 */
const hoverCopyButtonHtml = dataAttr =>
  `<button type="button" class="copy-hover" ${dataAttr} title="복사" aria-label="복사">${MENU_ICON.copy}</button>`;

/**
 * 표의 한 줄
 * @param {string} columnsKey GRID_COLUMNS 의 키 (예: 'service.attrs')
 * @param {string[]} cells 칸 값
 * @param {boolean} [readOnly] 고칠 수 없는 줄
 * @param {string} [rowId] 줄 id (없으면 새로 만듦 — 새로 넣은 줄)
 */
function gridRowHtml(columnsKey, cells, readOnly = false, rowId = newId('r')) {
  const {cols, types, options = {}} = GRID_COLUMNS[columnsKey];
  // 날짜 칸도 글 입력칸으로 둡니다 — 20260101 처럼 숫자만 쳐도 칸을 떠날 때 2026-01-01 로 맞춤(screen-grid.js),
  // 브라우저 날짜 입력칸은 방향키·범위 선택·복사와 함께 쓰기 어렵기 때문
  const typeAttrs = type => (type === 'date' ? ' data-type="date" inputmode="numeric" placeholder="예: 20260101"' : '');
  const cellHtml = (col, i) => {
    if (types[i] === 'select') {
      // 목록에 없는 값(예전 데이터 등)은 기본값(첫 값)으로 보임
      const value = options[i].includes(cells[i]) ? cells[i] : options[i][0];
      return `<select aria-label="${col}"${readOnly ? ' disabled' : ''}>`
        + options[i].map(option => `<option${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('') + '</select>';
    }
    return `<input type="text" aria-label="${col}"${typeAttrs(types[i])}${readOnly ? ' readonly' : ''} value="${escapeHtml(cells[i] || '')}">`;
  };
  const inputs = cols.map((col, i) => `<td>${cellHtml(col, i)}</td>`).join('');
  return `<tr data-rid="${escapeHtml(rowId)}">${inputs}<td><button type="button" class="icon" data-del aria-label="행 삭제">✕</button></td></tr>`;
}

/* ======================= 정의 칸 (SQL 정의 · 공통코드 정의) ======================= */

/**
 * 정의 칸 묶음 HTML — 칸마다 이름 + 입력칸(오른쪽 끝에 복사 아이콘)
 * 복사 아이콘과 '내용 있음' 배경은 CSS :placeholder-shown 으로 정하므로, 입력칸에는 늘 placeholder 를 둡니다(보이지 않는 " ").
 * @param {object[]} fields 칸 목록 (SQL_INFO_FIELDS, DEF_TABS[탭].info)
 * @param {object} [info] 저장된 값 {key: 값}
 * @param {boolean} [locked] 고칠 수 없게 (글자 고르기·복사는 됨)
 */
function infoFieldsHtml(fields, info = {}, locked = false) {
  const html = fields.map(({key, label, options, multiline, wide, type, width}) => {
    const value = (info || {})[key] || '';
    const attrs = `data-info="${key}" aria-label="${label}"`;
    let control;
    if (options) {
      control = `<select ${attrs}${locked ? ' disabled' : ''}>`
        + options.map(option => `<option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${option ? escapeHtml(option) : '선택'}</option>`).join('')
        + '</select>';
    } else {
      const readOnly = locked ? ' readonly' : '';
      const typeAttrs = type === 'date' ? ' data-type="date" inputmode="numeric" placeholder="예: 20260101"' : ' placeholder=" "';
      const field = multiline
        ? `<textarea ${attrs} rows="2" placeholder=" "${readOnly}>${escapeHtml(value)}</textarea>`
        : `<input type="text" ${attrs}${typeAttrs} value="${escapeHtml(value)}"${readOnly}>`;
      control = `<span class="copy-wrap">${field}${hoverCopyButtonHtml('data-copy-input')}</span>`;
    }
    const fixedWidth = width ? ` style="flex: 0 0 ${width}"` : '';   // 너비를 정한 칸 (예: 높이 · 너비 100px)
    return `<label class="infobox-f${wide ? ' wide' : ''}"${fixedWidth}><span>${label}</span>${control}</label>`;
  }).join('');
  return `<div class="infobox"><div class="infobox-g">${html}</div></div>`;
}

/** 정의 칸 값 읽기 — container 안의 [data-info] 칸 (앞뒤 공백 제거, 빈 칸 제외, 칸 순서대로) */
function readInfoFields(container) {
  const info = {};
  container.querySelectorAll('[data-info]').forEach(field => {
    const value = field.value.trim();
    if (value) info[field.dataset.info] = value;
  });
  return info;
}

/**
 * 표 하나: 제목 줄(제목 + 오른쪽 끝 [+ 행 추가]) + 표 (행이 없으면 빈 줄 하나) + 삭제된 줄 자리(신규 단계, screen-changes.js)
 * 같은 종류의 표가 화면에 여러 개 있을 수 있어(정의서 항목마다), 표마다 고유 id 를 주고 열 구성은 data-cols 로 찾습니다.
 * @param {string} tableId    표 요소 id (화면 안에서 고유)
 * @param {string} columnsKey GRID_COLUMNS 의 키
 * @param {{rows: string[][], ids?: string[]}} grid 표 값 (ids 가 없으면 예전 방식 줄 id)
 * @param {string} title      표 제목 (예: '속성정의')
 * @param {boolean} [readOnly] 고칠 수 없는 표 — 원본(잠긴 뒤) · 삭제된 항목 (고르기·복사는 됨. 행 추가·삭제 단추는 숨김)
 */
function gridHtml(tableId, columnsKey, grid, title, readOnly = false) {
  const {cols, widths} = GRID_COLUMNS[columnsKey];
  const header = cols.map(col => `<th>${col}</th>`).join('');
  // 열 너비를 정한 표(GRID_COLUMNS[].widths)는 <colgroup> 으로 너비를 주고 고정 배치 — 너비를 안 준 열이 남은 폭을 나눠 가짐
  const colgroup = widths
    ? `<colgroup>${cols.map((_, i) => `<col${widths[i] ? ` style="width: ${widths[i]}"` : ''}>`).join('')}<col class="col-del"></colgroup>`
    : '';
  const rows = (grid && grid.rows) || [];
  const ids = rowIdsOf(rows, grid && grid.ids);
  const body = rows.length
    ? rows.map((cells, i) => gridRowHtml(columnsKey, cells, readOnly, ids[i])).join('')
    : gridRowHtml(columnsKey, [], readOnly);
  const addButton = readOnly ? '' : `<button type="button" class="btn btn-s" data-add="${tableId}">+ 행 추가</button>`;
  return `<div class="fld${readOnly ? ' readonly' : ''}"><div class="fld-h"><span class="fld-l grid-title">${escapeHtml(title)}</span>${addButton}</div>`
    + `<div class="gridwrap"><table class="grid${widths ? ' fixed-cols' : ''}" id="${tableId}" data-cols="${columnsKey}">${colgroup}<thead><tr>${header}<th></th></tr></thead><tbody>${body}</tbody></table></div>`
    + `<div class="gone-rows" data-gone-rows="${tableId}"></div></div>`;
}

/** 화면 위쪽: 제목 · 작업 정보 한 줄 · 경고 · 탭 (원본이 잠긴 탭은 이름 옆에 자물쇠) */
function screenHeaderHtml(meta) {
  const statusIndex = statusIndexOf(meta);
  const statusOptions = STATUS_LIST.map((name, i) => `<option value="${i}"${i === statusIndex ? ' selected' : ''}>${name}</option>`).join('');
  // 신규 화면은 잠근 원본이 없으므로 자물쇠를 붙이지 않음
  const lockMark = id => (LAYER_TABS.includes(id) && isTabLockedIn(meta, id) && !isNewScreen(meta) ?`<span class="tab-lk" title="원본 잠김 · 신규 작업 중">${ICON.lock}</span>` : '');
  const tabs = SCREEN_TABS.map(([id, label]) =>
    `<button type="button" role="tab" class="tab" data-t="${id}" aria-selected="false">${lockMark(id)}<span class="tl">${label}</span><em class="mk" data-m="${id}"></em></button>`).join('');
  return `<div class="scr-head">
    <div class="row1"><h1 class="h1">${escapeHtml(lastOf(app.screen.path))}</h1></div>
    <div class="meta">
      <label title="화면을 만들 때 자동으로 붙는 번호입니다 (고칠 수 없음)">티켓<input type="text" id="ticket" class="inl mono" value="${escapeHtml(meta.ticket || '')}" placeholder="-" disabled></label>
      <label>작업자<input type="text" id="worker" class="inl" value="${escapeHtml(meta.worker || '')}" placeholder="-"></label>
      <label title="파일을 올릴 때 저장 경로의 기본값으로 쓰입니다">원본 위치<input type="text" id="origin" class="inl mono" value="${escapeHtml(meta.origin || '')}" placeholder="예: /src/main/webapp/hr/"></label>
      <label>상태<select id="stSel" class="stpill s${statusIndex}" title="바꾸면 바로 저장되고 이력이 남습니다">${statusOptions}</select></label>      <span id="integrity"></span>
    </div>
    <div id="warn"></div>
    <nav class="tabs" role="tablist" aria-label="화면 탭">${tabs}</nav>
  </div>`;
}

/**
 * 탭별 내용
 * SQL 탭에는 원본 블록과 신규 블록을 함께 그리고 단계에 맞는 쪽만 보입니다.
 * 신규 단계의 원본 블록은 숨긴 채 읽기 전용으로 두고, 신규 블록 왼쪽 비교 · 원본 대비 표시가 여기서 원본 값을 읽습니다.
 */
function screenPanelsHtml(meta) {
  const screen = app.screen;
  const locked = isTabLockedIn(meta, 'sql');
  return `<div class="scr-body">
    <div class="panel" data-t="sql">
      ${tabPhaseHtml('sql')}
      <div class="layer" data-layer="asis"${locked ? ' hidden' : ''}>
        ${pillTabsBarHtml('asis')}
        <div id="blocks-asis" class="blocks${locked ? ' locked' : ''}">${screen.blocks.asis.map(block => sqlBlockHtml('asis', block, locked)).join('')}</div>
      </div>
      <div class="layer" data-layer="tobe"${locked ? '' : ' hidden'}>
        ${isNewScreen(meta) ? '' : `<div class="toolbar"><span class="muted">신규 SQL 마다 왼쪽에 원본을 나란히 보여 주고 바뀐 줄을 색칠합니다.</span><span class="sp"></span>
          ${ignoreFormatToggleHtml()}</div>`}<!-- 신규 화면은 비교할 원본이 없어 안내 · 공백·대소문자 무시를 빼고 그림 -->
        ${pillTabsBarHtml('tobe')}
        <div id="blocks-tobe" class="blocks">${screen.blocks.tobe.map(block => sqlBlockHtml('tobe', block, false)).join('')}</div>
        <div id="gone-tobe" class="blocks"></div>
        <div id="hist"></div>
      </div>
    </div>

    ${Object.keys(DEF_TABS).map(defPanelHtml).join('')}
    ${entityPanelHtml()}
    <div class="panel" data-t="attach">
      <section class="attach-sec">
        <div class="sec-h"><span class="fld-l grid-title">변경 요약</span><span class="ent-hint">화면 전체의 변경 요약 · 보고서의 ‘변경 내용 요약’에 실립니다</span></div>
        <div class="ed" data-id="memo"></div>
      </section>
      <section class="attach-sec">
        <div class="sec-h"><span class="fld-l grid-title">첨부</span><span class="ent-hint">명세서, 화면 캡처 같은 참고 파일 · 보고서의 ‘참고 파일’에 실립니다</span></div>
        ${dropZoneHtml('attach')}<ul class="files" id="list-attach"></ul>
      </section>
    </div>
  </div>`;
}

/** 하단 저장 바 */
const saveBarHtml = () => `<div class="savebar" id="savebar"><span id="sbText" class="sb-text"></span><span class="sp"></span>
  <button type="button" class="btn btn-s btn-ghost" id="btnDiscard">변경 취소</button>
  <button type="button" class="btn btn-s btn-primary" id="btnSaveAll">등록 <kbd>Ctrl+S</kbd></button></div>`;

/* ======================= 화면 요약 줄 =======================
   스크롤로 위쪽 머리(화면 탭 줄)가 사라지면 맨 위에 한 줄짜리 요약 줄이 내려옵니다.
   머리는 그대로 올라가고 요약 줄은 본문 위에 겹쳐 나타나므로, 본문 자리가 바뀌지 않아 덜컥거리지 않습니다.
   내용: 화면 경로 · 상태 · 화면 탭(누르면 이동) · 지금 보는 SQL/항목 이름(누르면 맨 위로) */

/* 화면 머리를 지켜보는 감시자 (화면을 그릴 때마다 새로 만듦) */
let miniBarObserver = null;

/** 요약 줄 자리 — 높이 0 으로 맨 위에 붙어 있고, 안의 줄이 위에서 내려옴 */
const miniBarShellHtml = () => '<div class="scr-mini" id="scrMini"><div class="scr-mini-bar" id="scrMiniBar"></div></div>';

/**
 * 지금 보는 SQL 블록 / 정의서 항목의 이름과 ● 여부 — 알약 탭 줄에서 읽음
 * @returns {{title: string, dirty: boolean} | null} 알약 탭이 없는 탭(비교·첨부)이거나 항목이 없으면 null
 */
function currentPillItem() {
  const screen = app.screen;
  const barId = app.tab === 'sql' ? layerOf('sql') : app.tab;
  const activeId = isSqlTabBar(barId) ? screen.activeBlock[barId] : (barId in DEF_TABS || barId === 'entity' ? screen.activeDef[barId] : '');
  const tab = activeId ? $(`#tabs-${barId} [data-tab-bid="${activeId}"]`) : null;
  return tab ? {title: tab.querySelector('.sqltab-t').textContent, dirty: tab.classList.contains('dirty')} : null;
}

/** 요약 줄 내용 HTML */
function miniBarHtml() {
  const screen = app.screen;
  const statusIndex = statusIndexOf(screen.meta);
  const tabs = SCREEN_TABS.map(([id, label]) => {
    const mark = $(`.mk[data-m="${id}"]`);
    const dirty = !!mark && mark.classList.contains('dirty');
    return `<button type="button" class="mini-tab${id === app.tab ? ' on' : ''}${dirty ? ' dirty' : ''}" data-mini-tab="${id}">${label}</button>`;
  }).join('');
  const item = currentPillItem();
  const itemHtml = item
    ? `<button type="button" class="mini-item" data-mini-top title="맨 위로 (탭 목록 보기)">${item.dirty ? '<i class="mini-dot"></i>' : ''}<span>${escapeHtml(item.title)}</span></button>`
    : '';
  return `<span class="mini-path" title="${escapeHtml(screen.path.join(' / '))}">${escapeHtml(screen.path.join(' › '))}</span>`
    + `<span class="mini-st" style="color: var(--s${statusIndex})">${escapeHtml(STATUS_LIST[statusIndex])}</span>`
    + `<nav class="mini-tabs" aria-label="화면 탭">${tabs}</nav>${itemHtml}`;
}

/** 요약 줄 다시 그리기 — 탭을 바꾸거나 입력할 때마다 불림. 내용이 같으면 그대로 둠 */
function renderMiniBar() {
  const bar = $('#scrMiniBar');
  if (!bar || !app.screen) return;
  const html = miniBarHtml();
  if (bar.innerHTML !== html) bar.innerHTML = html;
}

/** 화면 탭 줄이 스크롤로 위로 사라지면 요약 줄을 보여 줌 */
function watchScreenHeadForMiniBar() {
  if (miniBarObserver) miniBarObserver.disconnect();
  const tabsRow = $('#main .scr-head .tabs');
  if (!tabsRow) return;
  miniBarObserver = new IntersectionObserver(([entry]) => {
    const rootTop = entry.rootBounds ? entry.rootBounds.top : 0;
    const scrolledAway = !entry.isIntersecting && entry.boundingClientRect.bottom <= rootTop;
    const shell = $('#scrMini');
    if (shell) shell.classList.toggle('show', scrolledAway);
  }, {root: $('#main'), threshold: 0});
  miniBarObserver.observe(tabsRow);
}

/** 요약 줄의 이름을 누르면: 맨 위로 (머리와 알약 탭 줄이 다시 보임) */
const scrollScreenToTop = () => $('#main').scrollTo({top: 0, behavior: 'smooth'});

/** 열린 화면 전체 그리기 */
async function renderScreen() {
  const screen = app.screen;
  const meta = screen.meta;
  // SQL 이 하나도 없으면 빈 블록을 만들지 않고 '[+ SQL 추가]' 안내를 보여 줍니다 (renderSqlTabs)
  $('#main').innerHTML = `<div class="scr">${miniBarShellHtml()}${screenHeaderHtml(meta)}${screenPanelsHtml(meta)}${saveBarHtml()}</div>`;

  // 편집기를 만들고, 지금 값을 "등록된 값" 으로 기억 (변경 감지 기준)
  $$('#main .ed').forEach(createEditor);
  screen.savedBlockOrder.asis = blockOrderSignature('asis');
  screen.savedBlockOrder.tobe = blockOrderSignature('tobe');
  screen.hasSavedTobe = hasSavedTobeSql();
  renderSqlTabs('asis');
  renderSqlTabs('tobe');
  for (const tab of Object.keys(DEF_TABS)) renderDefTabs(tab);
  renderEntityTabs();
  verifyEntityHashes();

  await renderTobeHistory();
  for (const kind of Object.keys(FILE_DIRS)) {
    renderFileList(kind);
    setupDropZone(kind);
  }
  $$('.tab').forEach(button => { button.onclick = () => showTab(button.dataset.t); });
  if (!SCREEN_TABS.some(([id]) => id === app.tab)) app.tab = 'sql';
  showTab(app.tab);
  refreshIndicators();
  verifyIntegrity();
  watchScreenHeadForMiniBar();
}

/** SQL 편집기(Ace) 설정 — 화면의 편집기와 [+ SQL 추가] 창의 편집기가 함께 씀 */
const sqlEditorOptions = readOnly => ({
  mode: 'ace/mode/sql', theme: 'ace/theme/chrome', useWorker: false, showPrintMargin: false,
  fontSize: '12.5px', tabSize: 4, fontFamily: codeFontStack,
  readOnly, highlightActiveLine: !readOnly, highlightGutterLine: !readOnly
});

/**
 * 편집기 만들기: 글 입력란은 <textarea>, SQL 은 Ace 편집기
 * 두 종류를 같은 방식(getValue/setValue/…)으로 다루기 위해 textarea 는 Ace 와 같은 모양의 래퍼로 감쌉니다.
 * @param {HTMLElement} placeholder <div class="ed" data-id="편집기 id">
 */
function createEditor(placeholder) {
  const screen = app.screen;
  const id = placeholder.dataset.id;
  const initialValue = screen.initialValues[id] || '';

  if (id in TEXT_EDITOR_HEIGHTS) {
    const textarea = document.createElement('textarea');
    textarea.className = 'ta';
    textarea.spellcheck = false;
    textarea.style.height = TEXT_EDITOR_HEIGHTS[id] + 'px';
    textarea.value = initialValue;
    textarea.setAttribute('aria-label', id === 'memo' ? '비고 / 메모' : id);
    placeholder.replaceWith(textarea);
    screen.savedValues[id] = textarea.value;
    screen.editors[id] = {
      getValue: () => textarea.value,
      setValue: value => { textarea.value = value; },
      destroy() {},
      resize() {},
      selectAll() { textarea.select(); },
      clearSelection() { textarea.setSelectionRange(0, 0); }
    };
    return;
  }

  // 읽기 전용: 잠긴 기존 SQL, 신규 탭 왼쪽의 기존 SQL
  const readOnly = (id.startsWith(EDITOR_PREFIX.asis) && isTabLocked('sql')) || id.startsWith(EDITOR_PREFIX.pair);
  placeholder.style.height = (id.startsWith(EDITOR_PREFIX.rollback) ? ROLLBACK_EDITOR_HEIGHT : SQL_EDITOR_HEIGHT) + 'px';
  placeholder.style.lineHeight = '22px';   // 시안: 코드 12.5px / 줄 높이 22px
  const editor = ace.edit(placeholder, sqlEditorOptions(readOnly));
  editor.setValue(initialValue, -1);
  editor.session.getUndoManager().reset();   // 처음 넣은 값은 되돌리기 기록에서 제외
  screen.savedValues[id] = editor.getValue();
  if (readOnly) editor.renderer.$cursorLayer.element.style.display = 'none';
  placeholder.insertAdjacentHTML('beforeend', hoverCopyButtonHtml(`data-copy-ed="${id}"`));   // 오른쪽 위 복사 아이콘
  editor.session.on('change', () => {
    refreshIndicators();
    if (id.startsWith(EDITOR_PREFIX.tobe)) scheduleLineMarks(id.slice(EDITOR_PREFIX.tobe.length));
  });
  new ResizeObserver(() => editor.resize()).observe(placeholder);   // 크기 조절(드래그) 시 다시 그림
  screen.editors[id] = editor;
  if (!readOnly) watchSqlPaste(editor, id);   // SQL 여러 개를 붙여넣으면 블록으로 나눌지 물음
  if (!id.startsWith(EDITOR_PREFIX.pair)) enableSqlAutocomplete(editor);   // 비교용(늘 읽기 전용) 편집기만 빼고
  if (id.startsWith(EDITOR_PREFIX.tobe)) linkPairScroll(id.slice(EDITOR_PREFIX.tobe.length));
}

/** 편집기 지우기 */
function destroyEditor(id) {
  const screen = app.screen;
  if (!screen.editors[id]) return;
  screen.editors[id].destroy();
  delete screen.editors[id];
  delete screen.savedValues[id];
}

/** 모든 편집기 다시 그리기 (보이지 않다가 보이게 될 때 크기를 다시 계산) */
const resizeAllEditors = () => Object.values(app.screen.editors).forEach(editor => editor.resize());

/** 탭 바꾸기 */
function showTab(tabId) {
  app.tab = tabId;
  $$('.panel').forEach(panel => { panel.hidden = panel.dataset.t !== tabId; });
  $$('.tab').forEach(button => {
    const active = button.dataset.t === tabId;
    button.classList.toggle('on', active);
    button.setAttribute('aria-selected', String(active));
  });
  resizeAllEditors();
  if (tabId === 'sql' && isTabLocked('sql')) refreshPairedBlocks();
  scheduleChangeMarks();
  renderMiniBar();
}

