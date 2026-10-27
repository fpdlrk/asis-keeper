/* ==========================================================================
   screen-blocks.js — SQL 블록 (탭으로 하나씩 보여 주는 것은 screen-sqltabs.js)
     SQL 탭 하나에 원본(asis) 블록과 신규(tobe) 블록이 함께 그려지고, 단계에 따라 한쪽만 보입니다.
       원본 단계(잠그기 전): 원본 블록을 편집 / 신규 단계(잠근 뒤): 신규 블록을 편집, 원본 블록은 숨김(읽기 전용)
     - 블록 그리기 · 끼워 넣기 · 삭제 · 복사 · 원본 SQL 가져오기
     - 신규 블록의 "원본과 나란히" 보기: 블록마다 고른 원본 SQL 을 왼쪽에 보여 주고 (없음이면 신규만 넓게)
       바뀐 줄을 색칠, 두 편집기 스크롤을 함께 움직임
     - 신규 SQL 변경 이력 (등록하면서 덮어쓴 이전 버전)

   블록 정보: {id, title, file, rb?, asisId?(신규만), info?, params?, paramIds?, log?, sql, rbText}
     info     = SQL 정의 {화면표시명 등 — SQL_INFO_FIELDS 의 key: 값} (값이 있는 칸만)
     params   = SQL 파라미터 표 [[파라미터명, 순서, 파라미터 유형, 인아웃 유형], …] (빈 줄 제외)
     paramIds = 파라미터 표의 줄 id (원본 줄과 짝짓기)
     log  = 이 SQL 에 남긴 이력 [{at, by, text}] (screen-sqltabs.js)
     file = SQL 파일 경로 (asis/sql/<id>.sql, tobe/sql/<id>.sql)
     rb   = 예전 버전의 롤백 SQL 파일 (지금은 새로 만들지 않음. 내용이 있는 블록만 칸을 보여 줌)
   ========================================================================== */

/* 바뀐 줄 표시를 다시 계산하기 전 기다리는 시간(ms) — 입력할 때마다 계산하지 않도록 */
const LINE_MARK_DELAY = 250;
/* 스크롤을 조작한 편집기를 "앞장선 쪽"으로 기억하는 시간(ms) */
const SCROLL_LEADER_HOLD = 800;
/* 변경 이력에 보여 줄 개수 */
const MAX_HISTORY_SHOWN = 15;

/* ======================= 블록 정보 ======================= */

/** 새 블록 id (시간 + 임의 글자) */
const newBlockId = () => newId('b');

/**
 * 새 SQL 블록 정보 만들기
 * @param {'asis'|'tobe'} kind
 * @param {number} order 몇 번째 블록인지 (2 이상이면 제목에 번호)
 */
function createSqlBlock(kind, order) {
  const id = newBlockId();
  const title = (kind === 'asis' ? '원본 SQL' : '신규 SQL') + (order > 1 ? ' ' + order : '');
  const block = {id, title, file: `${kind}/sql/${id}.sql`, info: {}, params: [], paramIds: [], log: [], sql: '', rbText: ''};
  // 새로 만든 신규 블록은 짝 없음(신규 쿼리)에서 시작합니다 — 비교할 기존 SQL 은 사용자가 고릅니다
  if (kind === 'tobe') block.asisId = NO_ASIS_PAIR;
  return block;
}

/** 블록 정보 찾기 */
const findSqlBlock = (kind, blockId) => app.screen.blocks[kind].find(block => block.id === blockId);

/** 블록 제목 규칙: 항상 대문자 (한글·숫자는 그대로) */
const toBlockTitle = title => String(title || '').toUpperCase();

/**
 * 제목 입력칸을 대문자로 고치기 (입력할 때마다 불림)
 * 값이 바뀔 때만 다시 넣고 커서 자리를 되돌립니다 — 한글 입력 중 조합이 끊기지 않게 하기 위함입니다.
 * @param {HTMLInputElement} input 제목 입력칸(.bt)
 */
function forceUpperCaseTitle(input) {
  const upper = toBlockTitle(input.value);
  if (upper === input.value) return;
  const {selectionStart, selectionEnd} = input;
  input.value = upper;
  input.setSelectionRange(selectionStart, selectionEnd);
}

/**
 * 화면에 있는 블록을 순서대로 읽기 (제목·SQL 은 지금 입력된 값)
 * @returns {{id, element, title, sql, asisId}[]} asisId 는 신규 블록에만 (findPairedAsisBlock 용)
 */
function readBlockInputs(kind) {
  const defaultTitle = kind === 'asis' ? '원본 SQL' : '신규 SQL';
  return $$(`#blocks-${kind} .blk`).map(element => ({
    id: element.dataset.id,
    element,
    title: toBlockTitle(element.querySelector('.bt').value.trim()) || defaultTitle,
    sql: getEditorValue(editorId(kind, element.dataset.id)),
    asisId: (findSqlBlock(kind, element.dataset.id) || {}).asisId
  }));
}

/** 블록 순서·제목·연결한 기존 블록·SQL 정의·파라미터를 문자열로 (등록 후 바뀌었는지 비교용) */
const blockOrderSignature = kind => JSON.stringify($$(`#blocks-${kind} .blk`).map(element => {
  const block = findSqlBlock(kind, element.dataset.id) || {};
  return [element.dataset.id, element.querySelector('.bt').value.trim(), block.asisId ?? null, readSqlDefinition(kind, element)];
}));

/* ======================= SQL 정의 · 파라미터 ======================= */

/** 파라미터 표 요소 id — 종류 · 블록마다 고유 */
const sqlParamsTableId = (kind, blockId) => `grid-sql-${kind}-${blockId}`;

/**
 * 블록의 SQL 정의 · 파라미터를 화면에서 읽기 (앞뒤 공백 제거, 빈 칸 · 빈 줄 제외)
 * @param {HTMLElement} element 블록 요소(.blk)
 * @returns {{info: object, params: string[][], paramIds: string[]}}
 */
function readSqlDefinition(kind, element) {
  const table = document.getElementById(sqlParamsTableId(kind, element.dataset.id));
  const params = table ? readGridOf(table) : {rows: [], ids: []};
  return {info: readInfoFields(element), params: params.rows, paramIds: params.ids};
}

/** 등록할 때 블록 정보에 함께 적을 SQL 정의 · 파라미터 (비어 있으면 적지 않음) */
const sqlDefinitionOf = ({info, params, paramIds}) => ({
  ...(Object.keys(info || {}).length ? {info} : {}),
  ...(params && params.length ? {params, paramIds} : {})
});

/** 블록 위쪽의 SQL 정의 칸 (SQL_INFO_FIELDS). locked: 잠긴 기존 SQL 이면 고칠 수 없게 (글자 고르기·복사는 됨) */
const sqlInfoHtml = (block, locked) => infoFieldsHtml(SQL_INFO_FIELDS, block.info, locked);

/** 블록 아래쪽(이력 바로 위)의 SQL 파라미터 표 */
const sqlParamsHtml = (kind, block, locked) =>
  `<div class="sqlparams">${gridHtml(sqlParamsTableId(kind, block.id), 'sql.params', {rows: block.params, ids: block.paramIds}, 'SQL 파라미터', locked)}</div>`;

/** 블록이 등록 이후 바뀌었는지 (추가·삭제·제목·SQL). 왼쪽 비교용 편집기(p:)는 제외 */
function isBlockListChanged(kind) {
  if (blockOrderSignature(kind) !== app.screen.savedBlockOrder[kind]) return true;
  return $$(`#blocks-${kind} .ed`).some(element => !element.dataset.id.startsWith(EDITOR_PREFIX.pair) && isEditorChanged(element.dataset.id));
}

/** 등록된 신규 SQL(또는 예전 롤백 SQL) 내용이 있는지 */
const hasSavedTobeSql = () => Object.entries(app.screen.savedValues)
  .some(([id, value]) => (id.startsWith(EDITOR_PREFIX.tobe) || id.startsWith(EDITOR_PREFIX.rollback)) && value.trim());

/* ======================= 블록 그리기 ======================= */

/**
 * 블록 제목 입력칸
 * @param {boolean} disabled 잠긴 기존 SQL 이면 true
 * @param {boolean} withCopy 마우스를 올리면 나타나는 복사 아이콘을 붙일지 (신규 SQL 만 — 기존 SQL 제목에는 두지 않음)
 */
const blockTitleHtml = (block, disabled, withCopy) => `<span class="bt-wrap${withCopy ? ' has-copy' : ''}">`
  + `<input type="text" class="bt" value="${escapeHtml(block.title)}" aria-label="SQL 블록 제목" placeholder="제목 입력"${disabled ? ' disabled' : ''}>`
  + `${withCopy ? hoverCopyButtonHtml('data-copy-input') : ''}</span>`;

/** 기존 SQL 블록의 ⋯ 메뉴(삭제) 단추 — 잠그기 전에만 둡니다. 복사는 편집기·제목칸의 복사 아이콘으로 */
const asisBlockMenuHtml = blockId =>
  `<button type="button" class="icon" data-menu="asis" data-bid="${blockId}" aria-label="블록 메뉴 (삭제)">⋯</button>`;

/**
 * SQL 블록 HTML
 *   기존(asis): 제목 + ⋯메뉴(삭제 — 잠그기 전에만) + SQL 정의 + 편집기 + 파라미터 표 + 이력
 *   신규(tobe): 제목 + 바뀐 줄 수 + [기존 SQL 가져오기] + ⋯메뉴 + SQL 정의 + [왼쪽: 기존(읽기 전용) | 오른쪽: 신규] + 파라미터 표 + 이력
 */
function sqlBlockHtml(kind, block, locked) {
  if (kind === 'asis') {
    const action = locked ? '' : asisBlockMenuHtml(block.id);
    return `<div class="blk" data-id="${block.id}">
      <div class="blk-h">${blockTitleHtml(block, locked, false)}<span class="sp"></span>${action}</div>
      ${sqlInfoHtml(block, locked)}
      <div class="ed" data-id="${editorId('asis', block.id)}"></div>${sqlParamsHtml(kind, block, locked)}${itemLogHtml('sql', kind, block)}</div>`;
  }
  const rollback = (block.rbText || '').trim()
    ? `<div class="blk-sub">롤백 SQL <span class="muted">이전에 입력한 내용입니다. 비우고 등록하면 이 칸은 사라집니다.</span></div><div class="ed" data-id="${editorId('rollback', block.id)}"></div>`
    : '';
  // '비교할 기존 SQL' 선택 상자는 블록 머리에 둡니다 — 왼쪽 칸은 '없음'일 때 숨겨지므로 그 안에 두면 다시 고를 수 없습니다
  return `<div class="blk" data-id="${block.id}">
    <div class="blk-h">${blockTitleHtml(block, false, true)}<span class="chg" data-chg="${block.id}"></span><span class="sp"></span>
      <label class="pair-pick">원본<select class="pair-sel" data-pair-sel="${block.id}" aria-label="비교할 원본 SQL 블록"></select></label>
      <button type="button" class="btn btn-s" data-from="${block.id}">원본 SQL 가져오기</button>
      <button type="button" class="icon" data-menu="tobe" data-bid="${block.id}" aria-label="블록 메뉴 (원본과 비교, 삭제)">⋯</button></div>
    ${sqlInfoHtml(block, false)}
    <div class="blk-b">
      <div class="pane pane-l"><div class="pane-h">${ICON.lock}원본 · 읽기 전용<span class="pair-t" data-pair-t="${block.id}"></span></div>
        <div class="ed" data-id="${editorId('pair', block.id)}"></div><div class="pair-none" data-pair-none="${block.id}" hidden>고른 원본 SQL 블록이 없어졌습니다. 블록 머리에서 다시 골라 주세요.</div></div>
      <div class="pane pane-r"><div class="pane-h acc">신규 (편집)</div><div class="ed" data-id="${editorId('tobe', block.id)}"></div></div>
    </div>
    ${rollback}
    ${sqlParamsHtml(kind, block, false)}
    ${itemLogHtml('sql', kind, block)}
  </div>`;
}

/* ======================= 블록 추가 · 삭제 · 복사 ======================= */

/**
 * 새 블록을 화면에 끼워 넣기 ([+ SQL 추가] 창과 붙여넣기 분리가 함께 씀)
 * 탭 줄은 부른 쪽에서 renderSqlTabs 로 다시 그립니다.
 * @param {'asis'|'tobe'} kind
 * @param {object} [opt]
 * @param {HTMLElement} [opt.after] 이 블록 바로 뒤에 (없으면 맨 뒤)
 * @param {string} [opt.sql]   넣을 SQL — 등록 전 입력값으로 들어가므로 "등록하지 않은 변경"으로 표시됨
 * @param {string} [opt.title] 제목 (없으면 '신규 SQL 3' 같은 기본 제목)
 * @param {string} [opt.asisId] (신규만) 비교할 원본 블록 id. 없으면 짝 없음
 * @param {object[]} [opt.log] 처음 이력
 * @param {{info, params, paramIds}} [opt.definition] SQL 정의 · 파라미터 (원본을 되살릴 때)
 * @returns {HTMLElement} 새 블록 요소
 */
function insertSqlBlock(kind, {after = null, sql = '', title = '', asisId, log, definition} = {}) {
  const container = $('#blocks-' + kind);
  const block = createSqlBlock(kind, container.children.length + 1);
  if (title) block.title = toBlockTitle(title);
  if (kind === 'tobe' && asisId !== undefined) block.asisId = asisId;
  if (log) block.log = log;
  if (definition) Object.assign(block, JSON.parse(JSON.stringify(definition)));
  app.screen.blocks[kind].push(block);
  const html = sqlBlockHtml(kind, block, false);
  if (after) after.insertAdjacentHTML('afterend', html);
  else container.insertAdjacentHTML('beforeend', html);
  const element = after ? after.nextElementSibling : container.lastElementChild;
  element.querySelectorAll('.ed').forEach(createEditor);
  if (sql) app.screen.editors[editorId(kind, block.id)].setValue(sql, -1);
  return element;
}

/* ======================= 붙여넣기 → 블록 자동 분리 ======================= */

/**
 * SQL 편집기 붙여넣기 감시: 붙여넣은 내용에 SQL 이 2개 이상이면 블록으로 나눌지 물음
 * 대상: 기존 SQL(잠그기 전) · 신규 SQL 편집기. 비교용(p:)·롤백(r:) 편집기는 제외
 */
function watchSqlPaste(editor, id) {
  const kind = id.startsWith(EDITOR_PREFIX.asis) ? 'asis' : id.startsWith(EDITOR_PREFIX.tobe) ? 'tobe' : null;
  if (!kind || editor.sqlPasteWatched) return;   // 잠금을 여러 번 풀어도 감시는 한 번만 붙임
  editor.sqlPasteWatched = true;
  const blockId = id.slice(EDITOR_PREFIX[kind].length);
  editor.on('paste', event => {
    const statements = splitSqlStatements(event.text);
    if (statements.length < 2) return;   // 쿼리 하나면 평소처럼 붙여넣기
    const pastedText = event.text;
    event.text = '';   // 일단 붙여넣지 않고, 물어본 뒤 처리 (Ace 는 event.text 를 붙여넣음)
    offerSqlSplit(kind, blockId, editor, pastedText, statements);
  });
}

/**
 * 블록으로 나눌지 묻고 처리
 *   나누기   : 지금 블록이 비어 있으면 첫 SQL 은 여기에, 나머지는 바로 뒤에 새 블록으로 (쿼리 앞 주석은 제목으로)
 *   그대로   : 원래 붙여넣으려던 위치에 그대로 붙여넣기
 */
async function offerSqlSplit(kind, blockId, editor, pastedText, statements) {
  const count = statements.length;
  const split = await askConfirm({
    title: 'SQL 탭으로 나누기',
    desc: `붙여넣은 내용에 SQL이 ${count}개 있습니다.\nSQL 탭 ${count}개로 나눌까요?\n(PL/SQL처럼 안에 ; 가 있는 문장이면 ‘그대로 붙여넣기’를 고르세요)`,
    okText: '탭으로 나누기',
    cancelText: '그대로 붙여넣기'
  });
  if (!split) {
    editor.focus();
    editor.insert(pastedText);
    return;
  }
  let remaining = statements;
  let previous = $(`#blocks-${kind} .blk[data-id="${blockId}"]`);
  if (!editor.getValue().trim()) {
    editor.setValue(statements[0].sql, -1);
    if (statements[0].title) previous.querySelector('.bt').value = toBlockTitle(statements[0].title);
    remaining = statements.slice(1);
  }
  for (const statement of remaining) previous = insertSqlBlock(kind, {after: previous, sql: statement.sql, title: statement.title});
  refreshPairedBlocks();
  renderSqlTabs(kind);
  refreshIndicators();
  toast(`SQL ${count}개를 탭으로 나눴습니다.`);
}

/** 블록 삭제 (등록된 블록의 파일은 다음 등록 때 함께 지움) */
async function deleteSqlBlock(kind, blockId) {
  const screen = app.screen;
  const element = $(`#blocks-${kind} .blk[data-id="${blockId}"]`);
  const block = findSqlBlock(kind, blockId);
  if (!element) return;
  // 잠금을 푼 기존 블록은 이미 파일이 있으므로, 다시 잠글 때 파일까지 지워야 함
  const savedAsisBlocks = (screen.meta.sqlBlocks && screen.meta.sqlBlocks.asis) || [];
  const wasRegistered = kind === 'asis' && savedAsisBlocks.some(saved => saved.id === blockId);
  const title = element.querySelector('.bt').value.trim() || block.title;
  const pairedOriginal = kind === 'tobe' && block && block.asisId;
  const desc = `‘${title}’ SQL을 삭제할까요? 이 SQL의 정의·파라미터·이력도 함께 지워집니다.`
    + (kind === 'tobe' || wasRegistered ? '\n등록하면 저장된 파일도 함께 삭제됩니다.' : '')
    + (pairedOriginal ? '\n원본은 그대로 남고 ‘삭제됨’으로 표시됩니다. 언제든 되살릴 수 있습니다.' : '');
  if (!(await askConfirm({title: 'SQL 삭제', desc, okText: '삭제', danger: true}))) return;

  clearLineMarks(blockId);
  clearGridPasteUndo(sqlParamsTableId(kind, blockId));
  Object.keys(EDITOR_PREFIX).forEach(prefixKind => destroyEditor(editorId(prefixKind, blockId)));
  element.remove();
  if (kind === 'tobe') screen.removedTobeBlocks.push(block);
  else if (wasRegistered) screen.removedAsisBlocks.push(block);
  screen.blocks[kind] = screen.blocks[kind].filter(other => other.id !== blockId);
  refreshPairedBlocks();
  renderSqlTabs(kind);   // 지운 탭을 보고 있었으면 첫 탭으로
  refreshIndicators();
}

/** 편집기 내용 복사 (클립보드를 못 쓰면 선택 후 복사 명령) */
async function copyEditorText(id) {
  const text = getEditorValue(id);
  if (!text) return toast('복사할 내용이 없습니다.');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const editor = app.screen.editors[id];
    editor.selectAll();
    document.execCommand('copy');
    editor.clearSelection();
  }
  toast('복사했습니다.');
}

/** 입력칸 복사 — 복사 아이콘과 같은 칸에 있는 입력칸 값 (SQL 블록 제목 · SQL 정의 칸) */
async function copyInputText(button) {
  const input = button.parentElement.querySelector('input, textarea');
  const text = input.value.trim();
  if (!text) return toast('복사할 내용이 없습니다.');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 클립보드를 못 쓰면 선택 후 복사 명령 (잠긴 칸은 선택이 안 되므로 잠깐 풀었다가 되돌림)
    const wasDisabled = input.disabled;
    input.disabled = false;
    input.select();
    document.execCommand('copy');
    input.setSelectionRange(0, 0);
    input.disabled = wasDisabled;
  }
  toast('복사했습니다.');
}

/** [기존 SQL 가져오기]: 이 블록에 연결한 기존 블록의 SQL 을 신규 블록에 복사 */
async function importAsisSql(tobeBlockId) {
  const tobeBlocks = readBlockInputs('tobe');
  const order = tobeBlocks.findIndex(block => block.id === tobeBlockId);
  const asisBlock = findPairedAsisBlock(tobeBlocks[order], order, readBlockInputs('asis'));
  if (!asisBlock) return toast('가져올 원본 SQL 블록이 없습니다. 블록 머리의 ‘원본’에서 비교할 블록을 먼저 고르세요.');
  if (!asisBlock.sql.trim()) return toast('가져올 원본 SQL이 없습니다.');
  const tobeId = editorId('tobe', tobeBlockId);
  if (getEditorValue(tobeId).trim()) {
    const ok = await askConfirm({title: '원본 SQL 가져오기', desc: '지금 입력한 신규 SQL이 원본 SQL로 바뀝니다. 계속할까요?', okText: '가져오기'});
    if (!ok) return;
  }
  app.screen.editors[tobeId].setValue(asisBlock.sql, -1);
  toast('원본 SQL을 가져왔습니다. 수정한 뒤 등록하세요.');
}

/* ======================= 기존과 나란히 보기 ======================= */

/* '비교할 기존 SQL' 선택 상자에서 '짝 없음'을 나타내는 값 (빈 값은 select 에서 다루기 번거로워 따로 둠) */
const PAIR_SELECT_NONE = '__none__';
/* 예전 데이터(지정이 없어 같은 순서로 짝지은 상태)를 나타내는 값 */
const PAIR_SELECT_AUTO = '__auto__';

/**
 * '비교할 기존 SQL' 선택 상자 채우기
 * @param {HTMLSelectElement} select 선택 상자
 * @param {object} tobeBlock 신규 블록 (asisId 를 봄)
 * @param {number} order 신규 블록 순서
 * @param {object[]} asisBlocks 기존 블록 목록
 * @param {object|null} pairedBlock 지금 짝지어진 기존 블록
 */
function fillPairSelect(select, tobeBlock, order, asisBlocks, pairedBlock) {
  if (!select) return;
  const options = asisBlocks.map((block, i) => `<option value="${escapeHtml(block.id)}">${i + 1}. ${escapeHtml(block.title)}</option>`);
  options.push(`<option value="${PAIR_SELECT_NONE}">없음 (신규 쿼리)</option>`);
  // 아직 지정하지 않은 예전 데이터는 지금 짝을 '자동(순서)'로 보여 주고, 고르면 그때 확정됩니다
  if (tobeBlock.asisId === undefined) {
    const autoLabel = pairedBlock ? `자동(순서) · ${pairedBlock.title}` : '자동(순서) · 짝 없음';
    options.unshift(`<option value="${PAIR_SELECT_AUTO}">${escapeHtml(autoLabel)}</option>`);
  }
  const value = tobeBlock.asisId === undefined
    ? PAIR_SELECT_AUTO
    : (pairedBlock ? pairedBlock.id : PAIR_SELECT_NONE);
  const html = options.join('');
  if (select.innerHTML !== html) select.innerHTML = html;
  select.value = value;
  select.classList.toggle('none', !pairedBlock);
  select.title = pairedBlock ? '비교 중: ' + pairedBlock.title : '비교할 원본 SQL 을 고르면 왼쪽에 나란히 보입니다';
}

/**
 * '비교할 기존 SQL' 을 바꿨을 때 — 신규 블록에 연결 정보를 적고 다시 그림
 * @param {string} tobeBlockId 신규 블록 id
 * @param {string} selectedValue 선택 상자 값 (기존 블록 id | PAIR_SELECT_NONE | PAIR_SELECT_AUTO)
 */
function setTobePair(tobeBlockId, selectedValue) {
  const block = findSqlBlock('tobe', tobeBlockId);
  if (!block || selectedValue === PAIR_SELECT_AUTO) return;   // '자동(순서)'는 고를 수 없고 표시만 함
  block.asisId = selectedValue === PAIR_SELECT_NONE ? NO_ASIS_PAIR : selectedValue;
  refreshPairedBlocks();
  renderSqlTabs('tobe');   // 짝이 바뀌면 '삭제됨'(어느 신규와도 짝이 아닌 원본) 탭도 바뀜
  refreshIndicators();
}

/**
 * 신규 블록마다 같은 순서의 기존 블록을 왼쪽(p:)에 채우고 바뀐 줄 표시
 * 신규 탭을 열 때, 블록을 추가·삭제할 때 불림
 */
function refreshPairedBlocks() {
  const screen = app.screen;
  const asisBlocks = readBlockInputs('asis');
  readBlockInputs('tobe').forEach((tobeBlock, order) => {
    const pairEditor = screen.editors[editorId('pair', tobeBlock.id)];
    if (!pairEditor) return;
    const asisBlock = findPairedAsisBlock(tobeBlock, order, asisBlocks);
    const element = tobeBlock.element;
    fillPairSelect(element.querySelector('[data-pair-sel]'), tobeBlock, order, asisBlocks, asisBlock);
    element.querySelector('[data-pair-t]').textContent = asisBlock ? ' · ' + asisBlock.title : '';
    // 고른 블록이 없어진 경우에만 안내를 띄웁니다 ('없음'을 고른 경우는 왼쪽 칸 자체를 숨김)
    const lostPair = !asisBlock && !!tobeBlock.asisId;
    element.classList.toggle('no-pair', !asisBlock && !lostPair);
    element.querySelector('[data-pair-none]').hidden = !lostPair;
    pairEditor.container.style.display = asisBlock ? '' : 'none';

    const text = asisBlock ? asisBlock.sql : '';
    if (pairEditor.getValue() !== text) pairEditor.setValue(text, -1);
    screen.savedValues[editorId('pair', tobeBlock.id)] = text;   // 비교용이라 변경으로 치지 않음
    pairEditor.resize();
    // 왼쪽을 오른쪽과 같은 스크롤 위치에서 시작
    const tobeEditor = screen.editors[editorId('tobe', tobeBlock.id)];
    if (tobeEditor) {
      pairEditor.session.setScrollTop(tobeEditor.session.getScrollTop());
      pairEditor.session.setScrollLeft(tobeEditor.session.getScrollLeft());
    }
    markChangedLines(tobeBlock.id);
  });
}

/** 입력이 잠깐 멈추면 바뀐 줄 다시 표시 */
function scheduleLineMarks(blockId) {
  const timers = app.screen.markTimers;
  clearTimeout(timers[blockId]);
  timers[blockId] = setTimeout(() => markChangedLines(blockId), LINE_MARK_DELAY);
}

/** 바뀐 줄 색칠 지우기 */
function clearLineMarks(blockId) {
  for (const [session, markerId] of app.screen.lineMarkers[blockId] || []) session.removeMarker(markerId);
  app.screen.lineMarkers[blockId] = [];
}

/** 기존(왼쪽)과 신규(오른쪽)의 바뀐 줄을 색칠하고, 블록 제목 옆에 "n줄 변경" 표시 */
function markChangedLines(blockId) {
  const screen = app.screen;
  const tobeEditor = screen.editors[editorId('tobe', blockId)];
  const pairEditor = screen.editors[editorId('pair', blockId)];
  const badge = $(`[data-chg="${blockId}"]`);
  if (!tobeEditor || !badge) return;
  clearLineMarks(blockId);

  const hasPair = pairEditor && pairEditor.container.style.display !== 'none';
  if (!hasPair) {
    badge.textContent = tobeEditor.getValue().trim() ? '신규' : '';
    badge.className = 'chg ok';
    return;
  }
  // "공백·대소문자 무시" 옵션: 줄을 다르게 나눈 것까지 포함해 차이가 그것뿐이면 변경 없음
  if (app.ignoreFormat && isSameText(pairEditor.getValue(), tobeEditor.getValue(), true)) {
    badge.textContent = '변경 없음';
    badge.className = 'chg';
    return;
  }
  const changed = findChangedLineNumbers(pairEditor.getValue(), tobeEditor.getValue(), app.ignoreFormat);
  if (!changed) {
    badge.textContent = '대용량 · 줄 비교 생략';
    badge.className = 'chg';
    return;
  }
  const Range = ace.require('ace/range').Range;
  const markLine = (editor, line, cssClass) => screen.lineMarkers[blockId].push([editor.session, editor.session.addMarker(new Range(line, 0, line, 1), cssClass, 'fullLine')]);
  changed.deleted.forEach(line => markLine(pairEditor, line, 'ln-del'));
  changed.added.forEach(line => markLine(tobeEditor, line, 'ln-add'));
  const count = Math.max(changed.deleted.length, changed.added.length);
  badge.textContent = count ? `${count}줄 변경` : '변경 없음';
  badge.className = 'chg ' + (count ? 'warn' : '');
}

/**
 * 나란히 보기: 기존(왼쪽) · 신규(오른쪽) 편집기 스크롤을 함께 움직임 (세로·가로)
 * 사용자가 휠·클릭·키보드로 조작한 쪽("앞장선 쪽")만 상대를 따라오게 합니다.
 * 줄 수가 달라 짧은 쪽이 끝에서 멈출 때, 그 멈춤이 긴 쪽을 끌어당기지 않도록 하기 위해서입니다.
 */
function linkPairScroll(blockId) {
  const screen = app.screen;
  const left = screen.editors[editorId('pair', blockId)];
  const right = screen.editors[editorId('tobe', blockId)];
  if (!left || !right) return;
  let leader = null, leaderUntil = 0;
  const takeLead = editor => { leader = editor; leaderUntil = Date.now() + SCROLL_LEADER_HOLD; };
  const isLeader = editor => leader === editor && Date.now() < leaderUntil;

  for (const [source, follower] of [[left, right], [right, left]]) {
    ['wheel', 'pointerdown', 'keydown', 'touchstart'].forEach(type => {
      source.container.addEventListener(type, () => takeLead(source), {capture: true, passive: true});
    });
    source.session.on('changeScrollTop', top => {
      if (!isLeader(source)) return;
      leaderUntil = Date.now() + SCROLL_LEADER_HOLD;   // 스크롤이 이어지는 동안 계속 앞장섬
      follower.session.setScrollTop(top);
    });
    source.session.on('changeScrollLeft', scrollLeft => {
      if (!isLeader(source)) return;
      leaderUntil = Date.now() + SCROLL_LEADER_HOLD;
      follower.session.setScrollLeft(scrollLeft);
    });
  }
}

/* ======================= 신규 SQL 변경 이력 ======================= */

/* 이력 파일 이름: 20261023-153012_<블록id>_sql.sql (예전 파일은 블록 id 없음, rollback 도 있음) */
const HISTORY_FILE_PATTERN = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})_(?:([^_]+)_)?(sql|rollback)\.sql$/;

/**
 * 이력 파일 이름 해석
 * @returns {{label: string, kind: 'sql'|'rollback', block: object|undefined} | null}
 */
function parseHistoryName(fileName) {
  const match = fileName.match(HISTORY_FILE_PATTERN);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, blockId, kind] = match;
  const blocks = app.screen.blocks.tobe;
  // 블록 id 가 없거나 지워진 블록이면 예전 단일 블록 → 첫 블록 순으로 연결
  const block = blocks.find(b => b.id === blockId) || blocks.find(b => b.id === 'legacy') || blocks[0];
  return {label: `${year}-${month}-${day} ${hour}:${minute}:${second}`, kind, block};
}

/** 변경 이력 목록 그리기 (최근 MAX_HISTORY_SHOWN 개) */
async function renderTobeHistory() {
  const box = $('#hist');
  if (!box) return;
  const names = (await listFileNames(app.screen.dir, TOBE_HISTORY_DIR)).sort().reverse()
    .filter(name => {
      const info = parseHistoryName(name);
      // 롤백 이력은 그 블록에 롤백 칸이 있을 때만
      return !info || info.kind === 'sql' || (info.block && app.screen.editors[editorId('rollback', info.block.id)]);
    })
    .slice(0, MAX_HISTORY_SHOWN);
  if (!names.length) {
    box.innerHTML = '';
    return;
  }
  const describe = name => {
    const info = parseHistoryName(name);
    if (!info) return name;
    return `${info.label} · ${info.block ? info.block.title : '삭제된 블록'} ${info.kind === 'sql' ? '신규 SQL' : '롤백 SQL'}`;
  };
  box.innerHTML = '<h2 class="sec">변경 이력 <span class="muted">등록하면서 덮어쓴 이전 버전</span></h2><ul class="files">'
    + names.map(name => `<li><span class="fp">${escapeHtml(describe(name))}</span><button type="button" class="btn btn-s" data-hist="${escapeHtml(name)}">편집기로 불러오기</button></li>`).join('')
    + '</ul>';
}

/** 이력의 이전 버전을 편집기로 불러오기 (등록해야 반영) */
async function loadHistoryVersion(fileName) {
  const info = parseHistoryName(fileName);
  const id = info && info.block && editorId(info.kind === 'sql' ? 'tobe' : 'rollback', info.block.id);
  if (!id || !app.screen.editors[id]) return toast('불러올 SQL 블록이 없습니다.');
  const text = await readText(app.screen.dir, TOBE_HISTORY_DIR + '/' + fileName);
  if (getEditorValue(id).trim()) {
    const ok = await askConfirm({title: '이전 버전 불러오기', desc: '지금 입력된 내용이 이전 버전으로 바뀝니다. 계속할까요?', okText: '불러오기'});
    if (!ok) return;
  }
  app.screen.editors[id].setValue(text || '', -1);
  toast('이전 버전을 불러왔습니다. 등록해야 반영됩니다.');
}
