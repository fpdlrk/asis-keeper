/* ==========================================================================
   screen-changes.js — 신규 단계: 원본과 다른 곳을 한 화면에 표시
     잠근 뒤(신규 단계)에만 동작합니다. 원본 단계에는 비교할 원본이 아직 확정되지 않아 표시하지 않습니다.

     - 탭 줄: 항목마다 상태(변경 · 신규 · 삭제됨) + 오른쪽에 '변경 n · 신규 n · 삭제 n' 요약
     - 정의 칸: 원본과 다른 칸은 노란 배경 + 칸 아래에 '원본: 값'
     - 표: 원본과 다른 칸은 노란 배경(마우스를 올리면 원본 값), 새로 넣은 줄은 초록,
           원본에만 있는 줄은 표 아래 '삭제된 줄 n'에 모아 보여 주고 [되살리기]
     - 삭제된 항목: 신규 쪽에 없는 원본 항목을 '삭제됨' 탭으로 보여 주고(읽기 전용) [되살리기]

   계산은 layer-diff.js, 원본 값은
     정의서 → app.screen.asisDefItems[탭] (잠긴 원본, 파일에서 읽은 값)
     SQL    → 화면에 숨겨 둔 원본 블록(#blocks-asis — 읽기 전용)
   ========================================================================== */

/* 칸 표시를 다시 계산하기 전 기다리는 시간(ms) — 입력할 때마다 계산하지 않도록 */
const CHANGE_MARK_DELAY = 150;
/* 칸 표시 타이머 */
let changeMarkTimer = null;

/* ======================= 항목 상태 ======================= */

/** 정의서 신규 항목의 상태 (same · changed · new) */
function defItemStateOf(tab, item) {
  const original = item.asisId ? (app.screen.asisDefItems[tab] || []).find(asis => asis.id === item.asisId) : null;
  return diffDefItem(tab, original || null, item).state;
}

/**
 * SQL 신규 블록의 짝인 원본 블록과 그 SQL 정의 (원본은 화면에 숨겨 둔 원본 블록에서 읽음)
 * @returns {{block: object, definition: object} | null} 짝이 없으면 null (신규 쿼리)
 */
function pairedAsisSqlOf(tobeInput, order, asisInputs) {
  const block = findPairedAsisBlock(tobeInput, order, asisInputs);
  return block ? {block, definition: readSqlDefinition('asis', block.element)} : null;
}

/** SQL 신규 블록의 상태 (same · changed · new) — 제목 · SQL 본문 · SQL 정의 · 파라미터 */
function sqlBlockStateOf(tobeInput, order, asisInputs) {
  const paired = pairedAsisSqlOf(tobeInput, order, asisInputs);
  if (!paired) return 'new';
  const changed = paired.block.title !== tobeInput.title
    || !isSameText(paired.block.sql, tobeInput.sql, app.ignoreFormat)
    || hasSqlDefinitionDiff(diffSqlDefinition(paired.definition, readSqlDefinition('tobe', tobeInput.element)));
  return changed ? 'changed' : 'same';
}

/** 탭 줄 오른쪽 요약: '변경 2 · 신규 1 · 삭제 1' (동일만 있으면 '모두 원본과 같음') */
function renderTabStateSummary(barId, states) {
  const box = $('#tabsSum-' + barId);
  if (!box) return;
  const count = state => states.filter(other => other === state).length;
  const parts = ['changed', 'new', 'gone'].filter(count).map(state => `<span class="st-${state}">${ITEM_STATE_LABELS[state]} ${count(state)}</span>`);
  const html = parts.length ? parts.join('<span class="sep">·</span>') : (states.length ? '<span class="muted">모두 원본과 같음</span>' : '');
  if (box.innerHTML !== html) box.innerHTML = html;
}

/* ======================= 삭제된 항목 (원본에만 있음) ======================= */

/** '삭제됨' 탭 하나 (알약 탭 줄 항목) */
const goneTabEntry = (asisId, title) => ({id: GONE_TAB_PREFIX + asisId, title, state: 'gone'});

/** 신규 쪽에 없는 정의서 원본 항목 */
const goneDefItems = tab => goneAsisItems(app.screen.asisDefItems[tab] || [], readDefInputs(tab));

/** 어느 신규 블록과도 짝이 아닌 원본 SQL 블록 (짝 규칙은 findPairedAsisBlock) */
function goneSqlBlocks() {
  const asisInputs = readBlockInputs('asis');
  const paired = new Set();
  readBlockInputs('tobe').forEach((tobeInput, order) => {
    const block = findPairedAsisBlock(tobeInput, order, asisInputs);
    if (block) paired.add(block.id);
  });
  return asisInputs.filter(block => !paired.has(block.id));
}

/** 삭제된 항목 보기의 머리: 이름 + '삭제됨' + [되살리기] */
const goneHeadHtml = (title, reviveAttrs) => `<div class="blk-h gone-h"><b class="gone-t">${escapeHtml(title)}</b>`
  + `<span class="tag bad">삭제됨</span><span class="muted">원본에만 있고 신규에서는 지운 항목입니다.</span><span class="sp"></span>`
  + `<button type="button" class="btn btn-s" ${reviveAttrs}>되살리기</button></div>`;

/** 정의서의 삭제된 원본 항목들 그리기 (#gone-<탭>, 읽기 전용) */
function renderGoneDefItems(tab) {
  const box = $('#gone-' + tab);
  if (!box) return;
  box.innerHTML = goneDefItems(tab).map(item => `<div class="blk gone-item" data-id="${GONE_TAB_PREFIX}${item.id}">`
    + goneHeadHtml(item.title || UNNAMED_DEF_TITLE, `data-revive-def="${tab}" data-bid="${escapeHtml(item.id)}"`)
    + defItemBodyHtml(tab, item, {readOnly: true, idBase: GONE_TAB_PREFIX + item.id})
    + `</div>`).join('');
}

/** SQL 의 삭제된 원본 블록들 그리기 (#gone-tobe, 읽기 전용) */
function renderGoneSqlBlocks() {
  const box = $('#gone-tobe');
  if (!box) return;
  box.innerHTML = goneSqlBlocks().map(input => {
    const definition = readSqlDefinition('asis', input.element);
    const goneId = GONE_TAB_PREFIX + input.id;
    return `<div class="blk gone-item" data-id="${goneId}">`
      + goneHeadHtml(input.title, `data-revive-sql="${escapeHtml(input.id)}"`)
      + infoFieldsHtml(SQL_INFO_FIELDS, definition.info, true)
      + `<pre class="gone-sql">${escapeHtml(input.sql) || '<span class="muted">(SQL 없음)</span>'}</pre>`
      + `<div class="sqlparams">${gridHtml(sqlParamsTableId('tobe', goneId), 'sql.params', {rows: definition.params, ids: definition.paramIds}, 'SQL 파라미터', true)}</div>`
      + `</div>`;
  }).join('');
}

/** [되살리기] 정의서 항목: 원본을 복사해 신규 항목으로 (표의 줄 id 는 그대로 — 줄끼리 다시 짝지어짐) */
function reviveDefItem(tab, asisId) {
  const original = (app.screen.asisDefItems[tab] || []).find(item => item.id === asisId);
  if (!original) return;
  insertDefItem(tab, copyDefItemAsTobe(original));
  toast('원본을 되살렸습니다. 등록해야 반영됩니다.');
}

/** [되살리기] SQL 블록: 원본 SQL · 정의 · 파라미터를 복사해 신규 블록으로 */
function reviveSqlBlock(asisId) {
  const original = readBlockInputs('asis').find(block => block.id === asisId);
  if (!original) return;
  const element = insertSqlBlock('tobe', {
    sql: original.sql,
    title: original.title,
    asisId,
    definition: readSqlDefinition('asis', original.element)
  });
  refreshPairedBlocks();
  renderSqlTabs('tobe');
  activateSqlTab('tobe', element.dataset.id);
  refreshIndicators();
  toast('원본을 되살렸습니다. 등록해야 반영됩니다.');
}

/* ======================= 칸 표시 ======================= */

/**
 * 정의 칸 표시: 원본과 다른 칸은 노란 배경 + 칸 아래 '원본: 값'
 * @param {HTMLElement} container 정의 칸이 들어 있는 요소 (항목 · 블록)
 * @param {object|null} originalInfo 원본 정의 칸 값 (null = 원본 없음 → 표시 지움)
 */
function applyInfoMarks(container, originalInfo) {
  container.querySelectorAll('.infobox [data-info]').forEach(field => {
    const label = field.closest('.infobox-f');
    const original = originalInfo ? comparableValue(originalInfo[field.dataset.info]) : '';
    const changed = !!originalInfo && original !== comparableValue(field.value);
    label.classList.toggle('info-chg', changed);
    let note = label.querySelector('.info-orig');
    if (!changed) {
      if (note) note.remove();
      return;
    }
    if (!note) {
      note = document.createElement('small');
      note.className = 'info-orig';
      label.append(note);
    }
    note.textContent = '원본: ' + (original || '(빈 칸)');
  });
}

/** 이름칸 표시: 원본과 이름이 다르면 노란 배경 + 마우스를 올리면 원본 이름 */
function applyTitleMark(input, originalTitle) {
  const changed = originalTitle !== null && comparableValue(originalTitle) !== comparableValue(input.value);
  input.classList.toggle('info-chg', changed);
  input.title = changed ? '원본 이름: ' + originalTitle : '';
}

/**
 * 표 표시: 원본과 다른 칸(노랑, 마우스를 올리면 원본 값) · 새 줄(초록) · 삭제된 줄 목록(표 아래)
 * @param {HTMLTableElement} table 신규 표
 * @param {{rows, ids}|null} original 원본 표 (null = 원본 없음 → 표시 지움)
 */
function applyGridMarks(table, original) {
  const columnsKey = table.dataset.cols;
  const diff = original
    ? diffGridRows(original, readGridOf(table), GRID_COLUMNS[columnsKey].cols.length)
    : {added: new Set(), deleted: [], changed: new Map()};
  const originalById = new Map(original ? original.ids.map((id, i) => [id, original.rows[i] || []]) : []);
  for (const tr of table.tBodies[0].rows) {
    const rowId = tr.dataset.rid;
    const changedColumns = diff.changed.get(rowId) || [];
    tr.classList.toggle('row-add', diff.added.has(rowId));
    [...tr.cells].forEach((td, col) => {
      const changed = changedColumns.includes(col);
      td.classList.toggle('cell-chg', changed);
      if (changed) td.title = '원본: ' + (comparableValue(originalById.get(rowId)[col]) || '(빈 칸)');
      else td.removeAttribute('title');
    });
  }
  app.screen.goneRows[table.id] = diff.deleted;
  const box = table.closest('.fld').querySelector('[data-gone-rows]');
  const html = goneRowsHtml(table.id, columnsKey, diff.deleted);
  if (box && box.innerHTML !== html) box.innerHTML = html;   // 같으면 그대로 (펼쳐 둔 목록이 접히지 않게)
}

/** 표 아래 '삭제된 줄 n' 목록 (원본에만 있는 줄 + 줄마다 [되살리기]) */
function goneRowsHtml(tableId, columnsKey, deletedRows) {
  if (!deletedRows.length) return '';
  const columns = GRID_COLUMNS[columnsKey].cols;
  const header = columns.map(col => `<th>${escapeHtml(col)}</th>`).join('') + '<th></th>';
  const rows = deletedRows.map(({id, cells}) => '<tr>' + columns.map((_, col) => `<td>${escapeHtml(cells[col] || '')}</td>`).join('')
    + `<td><button type="button" class="btn btn-s" data-revive-row="${tableId}" data-rid="${escapeHtml(id)}">되살리기</button></td></tr>`).join('');
  return `<details class="gone-rows-box"><summary>삭제된 줄 ${deletedRows.length}</summary>`
    + `<table class="gone-rows-t"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></details>`;
}

/** [되살리기] 삭제된 줄: 같은 줄 id 로 표 끝에 다시 넣음 (빈 줄만 있던 표면 빈 줄은 지움) */
function reviveGridRow(tableId, rowId) {
  const table = document.getElementById(tableId);
  const row = (app.screen.goneRows[tableId] || []).find(gone => gone.id === rowId);
  if (!table || !row) return;
  const body = table.tBodies[0];
  if (!readGridOf(table).rows.length) body.innerHTML = '';
  body.insertAdjacentHTML('beforeend', gridRowHtml(table.dataset.cols, row.cells, false, rowId));
  clearGridPasteUndo(tableId);
  refreshIndicators();
  refreshChangeMarks();
}

/** 칸 표시를 잠시 뒤에 다시 계산 (입력할 때마다 부름) */
function scheduleChangeMarks() {
  clearTimeout(changeMarkTimer);
  changeMarkTimer = setTimeout(refreshChangeMarks, CHANGE_MARK_DELAY);
}

/**
 * 지금 보이는 항목의 칸 표시 다시 계산 (신규 단계에서만)
 *   SQL 탭이면 고른 신규 블록, 정의서 탭이면 고른 항목 — 보이지 않는 항목은 탭을 고를 때 계산
 */
function refreshChangeMarks() {
  const screen = app.screen;
  if (!screen || !isLocked()) return;
  if (app.tab === 'sql') markActiveSqlBlock();
  else if (app.tab in DEF_TABS) markActiveDefItem(app.tab);
}

/** 고른 SQL 신규 블록의 정의 칸 · 파라미터 표 표시 */
function markActiveSqlBlock() {
  const activeId = app.screen.activeBlock.tobe;
  const tobeInputs = readBlockInputs('tobe');
  const order = tobeInputs.findIndex(input => input.id === activeId);
  if (order < 0) return;
  const input = tobeInputs[order];
  const paired = pairedAsisSqlOf(input, order, readBlockInputs('asis'));
  applyInfoMarks(input.element, paired ? paired.definition.info : null);
  applyGridMarks(document.getElementById(sqlParamsTableId('tobe', input.id)),
    paired ? {rows: paired.definition.params, ids: paired.definition.paramIds} : null);
}

/** 고른 정의서 신규 항목의 이름 · 정의 칸 · 표 표시 */
function markActiveDefItem(tab) {
  const itemId = app.screen.activeDef[tab];
  const element = $(`#defs-${tab} > .blk[data-id="${itemId}"]`);
  if (!element) return;   // 삭제된 원본 항목 탭(읽기 전용)은 표시 없음
  const item = findDefItem(tab, itemId) || {};
  const original = item.asisId ? (app.screen.asisDefItems[tab] || []).find(asis => asis.id === item.asisId) : null;
  applyTitleMark(element.querySelector('.def-title'), original ? original.title : null);
  applyInfoMarks(element, original ? original.info : null);
  for (const [key] of DEF_TABS[tab].grids) {
    applyGridMarks(document.getElementById(defGridTableId(tab, itemId, key)), original ? gridValueOf(original, key) : null);
  }
}
