/* ==========================================================================
   screen.js — 화면(메뉴) 하나 열기 · 그리기 · 탭 · 변경 감지

   화면 관련 코드는 네 파일로 나뉩니다.
     screen.js        : 화면 상태, 열기/그리기, 편집기 만들기, 탭, 변경 감지(저장 바 표시)
     screen-blocks.js : SQL 블록 (그리기·삭제, 기존과 나란히 보기, 바뀐 줄 표시, 변경 이력)
     screen-sqltabs.js: 알약 탭(공통) · SQL 탭 ([+ SQL 추가] 창) · 항목 이력(공통)
     screen-defs.js   : 정의서 탭 (서비스 · 오브젝트 · 코드분류 — 항목마다 탭 · 표 · 이력)
     screen-files.js  : 파일 목록 (끌어다 놓기, 저장 경로, 신규/수정/동일 표시)
     screen-save.js   : 등록 · 잠그기 · 상태 변경 · 원본 무결성 확인, 화면 이벤트 연결

   탭: 기존 SQL · 신규 SQL · 비교 · 서비스 · 오브젝트 · 코드분류 · 첨부
   오른쪽 영역: 상태 이력(위 50%) · 메모(아래 50%)
   등록은 하단 저장 바 하나로 모음. 단, 기존(ASIS)은 되돌릴 수 없어 "등록 후 잠그기"로 따로 등록.
   ========================================================================== */

/* ---- 탭 · 등록 영역 ---- */
const SCREEN_TABS = [
  ['asis', '기존 SQL'], ['tobe', '신규 SQL'], ['cmp', '비교'],
  ['service', '서비스'], ['object', '오브젝트'], ['code', '코드분류'], ['attach', '첨부']
];
/* 저장 바의 [등록] 이 다루는 영역과 이름 (등록 순서대로). 'common' = 티켓·작업자·원본 위치·메모 */
const SAVE_SECTIONS = [
  ['common', '작업 정보'], ['tobe', '신규 SQL'], ['service', '서비스'],
  ['object', '오브젝트'], ['code', '코드분류'], ['attach', '첨부']
];

/* ---- 편집기 ----
   편집기 id 규칙
     글 입력란: TEXT_FIELD_FILES 의 키 (memo)
     SQL 블록 : 접두어 + 블록 id  →  a:기존 SQL  t:신규 SQL  r:(예전) 롤백 SQL  p:신규 탭 왼쪽의 기존 SQL(읽기 전용) */
const EDITOR_PREFIX = {asis: 'a:', tobe: 't:', rollback: 'r:', pair: 'p:'};
const editorId = (kind, blockId) => EDITOR_PREFIX[kind] + blockId;
/* 글 입력란 높이(px). 여기에 없는 id 는 SQL 편집기 */
const TEXT_EDITOR_HEIGHTS = {memo: 110};
const SQL_EDITOR_HEIGHT = 400;   // SQL 탭은 한 번에 하나만 보이므로 넉넉하게 (아래 모서리를 끌어 조절 가능)
const ROLLBACK_EDITOR_HEIGHT = 120;

/** 작업 정보(상단 한 줄) 입력칸 id = meta 의 키 */
const COMMON_FIELDS = ['ticket', 'worker', 'origin'];

/**
 * 새 화면 상태 만들기 (app.screen 에 들어감)
 */
function createScreenState(path, dir, meta) {
  return {
    path,                 // 화면 경로 ['인사', '사원조회']
    dir,                  // 화면 폴더 핸들
    meta,                 // meta.json 내용
    initialValues: {},    // 편집기 id → 처음 그릴 때 넣을 값
    blocks: {asis: [], tobe: []},       // SQL 블록 정보
    activeBlock: {asis: '', tobe: ''},  // 지금 보고 있는 SQL 탭(블록 id)
    defItems: {},         // 정의서 탭 → 항목 [{id, title, grids, log}] (표의 지금 값은 화면에서 읽음, screen-defs.js)
    savedDefItems: {},    // 정의서 탭 → 마지막으로 등록된 항목 목록 (변경 감지 · 이력 바로 저장용)
    activeDef: {},        // 정의서 탭 → 지금 보고 있는 항목 id
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

/** 표의 지금 값 (빈 줄 제외) */
const readGridRowsOf = table => [...table.tBodies[0].rows]
  .map(row => [...row.querySelectorAll('input')].map(input => input.value.trim()))
  .filter(cells => cells.some(Boolean));

/** 영역에 등록된 내용이 있는지 (탭의 ✓ 표시) */
function isRegistered(section) {
  const screen = app.screen;
  if (section === 'asis') return !!screen.meta.asisLocked;
  if (section === 'tobe') return screen.hasSavedTobe || screen.savedFiles.tobe.length > 0;
  if (section === 'attach') return screen.savedFiles.attach.length > 0;
  if (section === 'common') return !!(screen.savedValues.memo || '').trim();
  if (section in DEF_TABS) return (screen.savedDefItems[section] || []).length > 0;
  return false;
}

/** 영역에 등록하지 않은 변경이 있는지 (탭의 ● 표시, 저장 바) */
function isDirty(section) {
  const screen = app.screen;
  if (!screen) return false;
  if (section === 'asis') return !screen.meta.asisLocked && (isBlockListChanged('asis') || screen.pendingFiles.asis.length > 0);
  if (section === 'tobe') return isBlockListChanged('tobe') || screen.pendingFiles.tobe.length > 0;
  if (section === 'attach') return screen.pendingFiles.attach.length > 0;
  if (section === 'common') {
    const fieldChanged = COMMON_FIELDS.some(field => $('#' + field) && $('#' + field).value.trim() !== (screen.meta[field] || ''));
    return fieldChanged || isEditorChanged('memo');
  }
  if (section in DEF_TABS) return isDefTabChanged(section);
  return false;
}

/** 화면 어디든 등록하지 않은 변경이 있는지 */
const hasUnsavedChanges = () => ['asis', ...SAVE_SECTIONS.map(([section]) => section)].some(isDirty);

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

  // 탭(과 오른쪽 메모 제목) 옆 표시. 'common' 표시는 메모 제목 옆에 있음
  for (const section of [...SCREEN_TABS.map(([id]) => id), 'common']) {
    const mark = document.querySelector(`.mk[data-m="${section}"]`);
    if (!mark || section === 'cmp') continue;
    const dirty = isDirty(section), registered = isRegistered(section);
    mark.className = 'mk ' + (dirty ? 'dirty' : registered ? 'done' : '');
    mark.textContent = dirty ? '' : registered ? '✓' : '';
    mark.title = dirty ? '아직 등록하지 않은 변경이 있습니다' : registered ? '등록된 내용이 있습니다' : '';
  }

  // 첨부 탭 이름에 개수, 신규 SQL 탭 위 요약
  const attachLabel = $('.tab[data-t="attach"] .tl');
  if (attachLabel) attachLabel.textContent = '첨부' + (screen.savedFiles.attach.length ? ' ' + screen.savedFiles.attach.length : '');
  const tobeSummary = $('#tobeSum');
  if (tobeSummary) tobeSummary.textContent = `SQL ${$$('#blocks-tobe .blk').length}개`;
  refreshSqlTabMarks('asis');
  refreshSqlTabMarks('tobe');
  for (const tab of Object.keys(DEF_TABS)) refreshDefTabMarks(tab);

  // 저장 바
  const dirtySections = SAVE_SECTIONS.filter(([section]) => isDirty(section));
  const asisDirty = isDirty('asis');
  $('#sbText').innerHTML = (dirtySections.length
    ? `<i class="dot warn"></i><b>등록하지 않은 변경 ${dirtySections.length}건</b><span class="muted">${dirtySections.map(([, label]) => label).join(' · ')}</span>`
    : `<span class="muted ok-t">${ICON.check} 모든 변경이 등록되었습니다</span>`)
    + (asisDirty ? '<span class="muted">· 기존 내용은 ‘기존 SQL’ 탭에서 등록 후 잠급니다</span>' : '');
  $('#btnSaveAll').disabled = !dirtySections.length;
  $('#btnDiscard').disabled = !dirtySections.length && !asisDirty;
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
    const previousScreen = app.screen;
    const screen = createScreenState(path, dir, meta);
    if (reload && previousScreen) {   // '변경 취소' 뒤에도 보던 SQL 탭·정의서 항목 유지
      screen.activeBlock = {...previousScreen.activeBlock};
      screen.activeDef = {...previousScreen.activeDef};
    }
    app.screen = screen;
    // 처음 보여 줄 탭: 기존 내용이 아직 없으면 기존 SQL, 등록했으면 신규 SQL
    if (!reload) app.tab = meta.asisLocked ? 'tobe' : 'asis';

    for (const [fieldId, file] of Object.entries(TEXT_FIELD_FILES)) screen.initialValues[fieldId] = await readText(dir, file) || '';
    screen.blocks.asis = await loadSqlBlocks(dir, meta, 'asis');
    screen.blocks.tobe = await loadSqlBlocks(dir, meta, 'tobe');
    for (const block of screen.blocks.asis) screen.initialValues[editorId('asis', block.id)] = block.sql;
    for (const block of screen.blocks.tobe) {
      screen.initialValues[editorId('tobe', block.id)] = block.sql;
      screen.initialValues[editorId('rollback', block.id)] = block.rbText;
    }
    for (const tab of Object.keys(DEF_TABS)) {
      screen.defItems[tab] = await loadDefItems(dir, tab);
      screen.savedDefItems[tab] = JSON.parse(JSON.stringify(screen.defItems[tab]));   // 등록된 상태 (따로 복사해 둠)
    }
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
 * @param {string} dataAttr 'data-copy-ed="편집기 id"' 또는 'data-copy-title'
 */
const hoverCopyButtonHtml = dataAttr =>
  `<button type="button" class="copy-hover" ${dataAttr} title="복사" aria-label="복사">${MENU_ICON.copy}</button>`;

/**
 * 표의 한 줄
 * @param {string} columnsKey GRID_COLUMNS 의 키 (예: 'service.attrs')
 */
function gridRowHtml(columnsKey, cells) {
  const {cols, types} = GRID_COLUMNS[columnsKey];
  // 날짜 칸도 글 입력칸으로 둡니다 — 20260101 처럼 숫자만 쳐도 칸을 떠날 때 2026-01-01 로 맞춤(screen-grid.js),
  // 브라우저 날짜 입력칸은 방향키·범위 선택·복사와 함께 쓰기 어렵기 때문
  const typeAttrs = type => (type === 'date' ? ' data-type="date" inputmode="numeric" placeholder="예: 20260101"' : '');
  const inputs = cols.map((col, i) => `<td><input type="text" aria-label="${col}"${typeAttrs(types[i])} value="${escapeHtml(cells[i] || '')}"></td>`).join('');
  return `<tr>${inputs}<td><button type="button" class="icon" data-del aria-label="행 삭제">✕</button></td></tr>`;
}

/**
 * 표 전체 + [+ 행 추가] (행이 없으면 빈 줄 하나)
 * 같은 종류의 표가 화면에 여러 개 있을 수 있어(정의서 항목마다), 표마다 고유 id 를 주고 열 구성은 data-cols 로 찾습니다.
 * @param {string} tableId    표 요소 id (화면 안에서 고유)
 * @param {string} columnsKey GRID_COLUMNS 의 키
 */
function gridHtml(tableId, columnsKey, rows) {
  const header = GRID_COLUMNS[columnsKey].cols.map(col => `<th>${col}</th>`).join('');
  const body = (rows && rows.length ? rows : [[]]).map(cells => gridRowHtml(columnsKey, cells)).join('');
  return `<div class="gridwrap"><table class="grid" id="${tableId}" data-cols="${columnsKey}"><thead><tr>${header}<th></th></tr></thead><tbody>${body}</tbody></table></div>`
    + `<button type="button" class="btn-add sm" data-add="${tableId}">+ 행 추가</button>`;
}

/** 상태 이력 목록 — 한 줄 형식: [요청] 2026.10.20 · 홍길동 (바꾼 사람 기록이 없으면 이 화면의 작업자, 그것도 없으면 -) */
function statusLogHtml(meta) {
  const entries = (meta.statusLog || []).slice().reverse();
  if (!entries.length) return '<li class="muted">기록된 상태 변경이 없습니다.</li>';
  return entries.map(entry => {
    const name = normalizeStatus(entry.status);
    return `<li title="${escapeHtml(formatDateTime(entry.at))}"><b class="st-t s${STATUS_LIST.indexOf(name)}">[${escapeHtml(name)}]</b> `
      + `${escapeHtml(formatDay(entry.at))} <span class="sep">·</span> ${escapeHtml(entry.by || meta.worker || '-')}</li>`;
  }).join('');
}

/** 잠금을 푼 적이 있는지 (처음 등록 전인지 / 다시 잠근 것인지 구분할 때 씀) */
const wasAsisUnlocked = meta => (meta.asisUnlockLog || []).length > 0;

/** 기존 SQL 탭 위 안내: 잠긴 뒤 — 오른쪽 [잠금 풀기]로 사유를 남기고 다시 편집할 수 있습니다 */
const lockedBannerHtml = meta => `${ICON.lock}<b>${escapeHtml(meta.asisSavedAt || '')} 등록 · 잠김</b>`
  + `<span class="muted">수정할 내용은 ‘신규 SQL’ 탭에서 작업하세요.</span><span class="sp"></span>`
  + `<button type="button" class="btn btn-s" id="unlockAsis" title="사유를 남기면 기존 내용을 다시 편집할 수 있습니다">${ICON.unlock}잠금 풀기</button>`;

/** 기존 SQL 탭 위 안내: 잠그기 전 (처음 등록 전 / 잠금을 푼 뒤) */
function unlockedBannerHtml(meta) {
  const reopened = wasAsisUnlocked(meta);
  const head = reopened
    ? `${ICON.unlock}<b>잠금이 풀려 있습니다</b><span class="muted">수정을 마치면 다시 등록해 잠가 주세요. 다시 잠그면 지금 내용이 새 원본 기준이 됩니다.</span>`
    : `${ICON.warn}<b>아직 등록하지 않았습니다</b><span class="muted">등록하면 잠겨서 이후 수정·삭제할 수 없습니다.</span>`;
  return head + `<span class="sp"></span><button type="button" class="btn btn-s btn-primary" id="saveAsis">`
    + `${reopened ? '수정 내용 등록 후 다시 잠그기' : '기존 내용 등록 후 잠그기'}</button>`;
}

/** 잠금 해제 이력 띠 — 푼 적이 없으면 아무것도 그리지 않습니다 (해제 중·다시 잠근 뒤 모두 남음) */
function unlockLogBannerHtml(meta) {
  const entries = meta.asisUnlockLog || [];
  if (!entries.length) return '';
  const items = entries.map(entry => `<li>${escapeHtml(formatDateTime(entry.at))}`
    + `<span class="sep">·</span>${escapeHtml(entry.by || '-')}`
    + `<span class="sep">·</span><b>${escapeHtml(entry.reason || '')}</b>`
    + (entry.relockedAt
      ? `<span class="ul-end">${escapeHtml(formatDateTime(entry.relockedAt))} 다시 잠금</span>`
      : `<span class="ul-end open">아직 잠그지 않음</span>`)
    + `</li>`).join('');
  return `<div class="banner warn unlocklog">${ICON.unlock}<ul aria-label="잠금 해제 이력">${items}</ul></div>`;
}

/** 화면 위쪽: 제목 · 작업 정보 한 줄 · 경고 · 탭 */
function screenHeaderHtml(meta) {
  const statusIndex = statusIndexOf(meta);
  const statusOptions = STATUS_LIST.map((name, i) => `<option value="${i}"${i === statusIndex ? ' selected' : ''}>${name}</option>`).join('');
  const tabs = SCREEN_TABS.map(([id, label]) =>
    `<button type="button" role="tab" class="tab" data-t="${id}" aria-selected="false"><span class="tl">${label}</span><em class="mk" data-m="${id}"></em></button>`).join('');
  return `<div class="scr-head">
    <div class="row1"><h1 class="h1">${escapeHtml(lastOf(app.screen.path))}</h1></div>
    <div class="meta">
      <label>티켓<input type="text" id="ticket" class="inl" value="${escapeHtml(meta.ticket || '')}" placeholder="-"></label>
      <label>작업자<input type="text" id="worker" class="inl" value="${escapeHtml(meta.worker || '')}" placeholder="-"></label>
      <label title="파일을 올릴 때 저장 경로의 기본값으로 쓰입니다">원본 위치<input type="text" id="origin" class="inl mono" value="${escapeHtml(meta.origin || '')}" placeholder="예: /src/main/webapp/hr/"></label>
      <label>상태<select id="stSel" class="stpill s${statusIndex}" title="바꾸면 바로 저장되고 이력이 남습니다">${statusOptions}</select></label>
      <span id="integrity"></span>
    </div>
    <div id="warn"></div>
    <nav class="tabs" role="tablist" aria-label="화면 탭">${tabs}</nav>
  </div>`;
}

/** 탭별 내용 */
function screenPanelsHtml(meta) {
  const screen = app.screen;
  const locked = !!meta.asisLocked;
  return `<div class="scr-body">
    <div class="panel" data-t="asis">
      <div class="banner ${locked ? 'lock' : 'info'}" id="asisBanner">${locked ? lockedBannerHtml(meta) : unlockedBannerHtml(meta)}</div>
      <div id="asisUnlockLog">${unlockLogBannerHtml(meta)}</div>
      ${pillTabsBarHtml('asis')}
      <div id="blocks-asis" class="blocks${locked ? ' locked' : ''}">${screen.blocks.asis.map(block => sqlBlockHtml('asis', block, locked)).join('')}</div>
    </div>

    <div class="panel" data-t="tobe">
      <div class="toolbar"><span class="muted" id="tobeSum"></span><span class="sp"></span>
        ${ignoreFormatToggleHtml()}</div>
      ${pillTabsBarHtml('tobe')}
      <div id="blocks-tobe" class="blocks">${screen.blocks.tobe.map(block => sqlBlockHtml('tobe', block, false)).join('')}</div>
      <div id="hist"></div>
    </div>

    <div class="panel" data-t="cmp">
      <div class="toolbar"><span class="muted">등록하지 않은 입력값과 대기 파일까지 포함해 비교합니다.</span><span class="sp"></span>${ignoreFormatToggleHtml()}</div>
      <div id="cmpBody"></div>
    </div>

    ${Object.keys(DEF_TABS).map(defPanelHtml).join('')}
    <div class="panel narrow" data-t="attach"><p class="muted">명세서, 화면 캡처 같은 참고 파일을 올리고 등록하세요. 보고서의 ‘참고 파일’에 실립니다.</p>${dropZoneHtml('attach')}<ul class="files" id="list-attach"></ul></div>
  </div>`;
}

/** 하단 저장 바 */
const saveBarHtml = () => `<div class="savebar" id="savebar"><span id="sbText" class="sb-text"></span><span class="sp"></span>
  <button type="button" class="btn btn-s btn-ghost" id="btnDiscard">변경 취소</button>
  <button type="button" class="btn btn-s btn-primary" id="btnSaveAll">등록 <kbd>Ctrl+S</kbd></button></div>`;

/** 오른쪽 영역: 상태 이력(위 50%) · 메모(아래 50%), 각각 넘치면 스크롤 */
const sidePanelHtml = meta => `
  <section class="rs-sec" aria-label="상태 이력">
    <div class="rs-h"><b>상태 이력</b><span class="muted">상태를 바꾸면 자동 기록</span></div>
    <ul class="stlog" id="stlog">${statusLogHtml(meta)}</ul>
  </section>
  <section class="rs-sec" aria-label="메모">
    <div class="rs-h"><b>메모</b><span class="muted">비고 · 변경 요약</span><em class="mk" data-m="common"></em></div>
    <div class="ed" data-id="memo"></div>
  </section>`;

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
  const barId = app.tab;
  const activeId = isSqlTabBar(barId) ? screen.activeBlock[barId] : (barId in DEF_TABS ? screen.activeDef[barId] : '');
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
  $('#rside').innerHTML = sidePanelHtml(meta);
  $('#rside').hidden = false;
  $('#app').classList.add('has-screen');

  // 편집기를 만들고, 지금 값을 "등록된 값" 으로 기억 (변경 감지 기준)
  $$('#main .ed, #rside .ed').forEach(createEditor);
  screen.savedBlockOrder.asis = blockOrderSignature('asis');
  screen.savedBlockOrder.tobe = blockOrderSignature('tobe');
  screen.hasSavedTobe = hasSavedTobeSql();
  renderSqlTabs('asis');
  renderSqlTabs('tobe');
  for (const tab of Object.keys(DEF_TABS)) renderDefTabs(tab);

  await renderTobeHistory();
  for (const kind of Object.keys(FILE_DIRS)) {
    renderFileList(kind);
    setupDropZone(kind);
  }
  $$('.tab').forEach(button => { button.onclick = () => showTab(button.dataset.t); });
  if (!SCREEN_TABS.some(([id]) => id === app.tab)) app.tab = 'tobe';
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
  const readOnly = (id.startsWith(EDITOR_PREFIX.asis) && !!screen.meta.asisLocked) || id.startsWith(EDITOR_PREFIX.pair);
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
  if (tabId === 'tobe') refreshPairedBlocks();
  if (tabId === 'cmp') renderCompareTab();
  renderMiniBar();
}
