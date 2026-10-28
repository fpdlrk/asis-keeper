/* ==========================================================================
   screen-grid.js — 표(그리드) 기능 (서비스 · 오브젝트 · 공통코드관리의 모든 표 + SQL 파라미터 표)
     표 모양은 screen.js 의 gridHtml / gridRowHtml — 칸마다 <input>(고르는 열은 <select>), 표 요소에 고유 id 와 열 구성(data-cols)
     고르는 칸: 방향키는 칸 이동(값은 마우스 · 글자 입력 · Alt+↓ 로 고름), 지우면 기본값(첫 값), 목록에 없는 값을 붙여넣으면 기본값

     - 행 추가 · 삭제
     - 셀 범위 선택: 드래그 · Shift+클릭 · Shift+방향키 → 파란색으로 표시
         한 칸 안에서 끌면 평소처럼 글자가 선택되고, 다른 칸으로 넘어가는 순간 범위 선택으로 바뀝니다.
     - Ctrl+C / Ctrl+X: 범위를 '칸은 탭, 줄은 줄바꿈' 글로 복사(엑셀과 같은 형식) · Delete / Backspace: 범위 비우기
     - 키보드: 방향키(칸 이동) · Enter / Shift+Enter(아래 / 위, 마지막 줄에서 Enter 면 줄 추가)
               Tab / Shift+Tab(옆 칸, 줄 끝이면 다음 줄) · Esc(범위 선택 풀기)
         ←→ 는 글자 맨 앞/끝에 있거나 칸 전체가 선택됐을 때만 옆 칸으로 — 칸 안에서 글자를 고칠 때는 평소처럼 움직입니다.
         방향키로 들어간 칸은 글자 전체가 선택되어, 바로 치면 엑셀처럼 내용이 바뀝니다.
     - 여러 칸 · 여러 줄 붙여넣기 (덮어쓰기)
     - 되돌리기(Ctrl+Z) · 다시 실행(Ctrl+Y): 붙여넣기 · 범위 지우기
     - 날짜 칸: 20260101 처럼 숫자만 쳐도 칸을 떠날 때 2026-01-01 로 맞춤. 날짜가 아니면 빨갛게 표시
     - 읽기 전용 표(칸이 readonly — 잠긴 기존 SQL 의 파라미터 표): 고르기 · 복사 · 이동만 되고 붙여넣기 · 지우기 · 줄 추가는 막음
   ========================================================================== */

/* 지금 선택된 범위 {table, anchor: {row, col}, focus: {row, col}} — 없으면 null. anchor 는 시작 칸(입력 커서가 있는 칸) */
let gridSelection = null;
/* 마우스로 끄는 중인 정보 {table, anchor, ranging} — ranging: 다른 칸으로 넘어가 범위 선택이 시작됐는지 */
let gridDrag = null;

/* ======================= 칸 찾기 ======================= */

/** 표의 열 수 (마지막의 행 삭제 칸 제외) */
const gridColumnCount = table => GRID_COLUMNS[table.dataset.cols].cols.length;

/** 칸 위치 {row, col} — row 는 본문 줄 순서, col 은 열 순서 (둘 다 0부터) */
function gridCellPosition(cell) {
  const td = cell.closest('td');
  return {row: [...td.closest('tbody').rows].indexOf(td.parentElement), col: td.cellIndex};
}

/** 위치의 입력칸 (없으면 null) — 글 입력칸 또는 고르는 칸 */
function gridCellInput(table, {row, col}) {
  const tr = table.tBodies[0].rows[row];
  const td = tr && tr.cells[col];
  return td ? td.querySelector(GRID_CELL_SELECTOR) : null;
}

/** 표의 칸 요소인지 (글 입력칸 · 고르는 칸) */
const isGridCellElement = element => !!element && (element.tagName === 'INPUT' || element.tagName === 'SELECT') && !!element.closest('table.grid');

/** 고칠 수 없는 칸인지 (잠긴 표: 글 칸은 readonly, 고르는 칸은 disabled) */
const isGridCellLocked = cell => cell.readOnly || cell.disabled;

/**
 * 칸에 값 넣기 (붙여넣기 · 지우기)
 * @returns {boolean} 고르는 칸에 목록에 없는 값이 와서 기본값으로 바꿨으면 false
 */
function setGridCellValue(cell, value) {
  if (cell.tagName !== 'SELECT') {
    cell.value = value;
    return true;
  }
  const allowed = [...cell.options].some(option => option.value === value);
  cell.value = allowed ? value : cell.options[0].value;
  return allowed || !value;
}

/** 위치를 표 안으로 맞춤 */
const clampGridPosition = (table, row, col) => ({
  row: Math.max(0, Math.min(row, table.tBodies[0].rows.length - 1)),
  col: Math.max(0, Math.min(col, gridColumnCount(table) - 1))
});

/** 칸으로 이동: 글자 전체를 선택해 바로 치면 내용이 바뀌게 (엑셀과 같음) */
function focusGridCell(table, position) {
  const input = gridCellInput(table, position);
  if (!input) return;
  input.focus();
  if (input.tagName === 'INPUT') input.select();
}

/* ======================= 범위 선택 ======================= */

/** 범위의 위·아래·왼·오른쪽 끝 */
function gridSelectionBounds({anchor, focus}) {
  return {
    top: Math.min(anchor.row, focus.row), bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.col, focus.col), right: Math.max(anchor.col, focus.col)
  };
}

/** 두 칸 이상이 선택됐는지 (한 칸이면 평소의 입력·복사로 둠) */
const isMultiCellSelection = selection => !!selection
  && (selection.anchor.row !== selection.focus.row || selection.anchor.col !== selection.focus.col);

/** 범위 표시 지우기 */
function clearGridSelection() {
  if (gridSelection && gridSelection.table.isConnected) {
    gridSelection.table.querySelectorAll('td.cell-sel').forEach(td => td.classList.remove('cell-sel'));
  }
  gridSelection = null;
}

/** 범위를 정하고 파란색으로 표시 */
function setGridSelection(table, anchor, focus) {
  clearGridSelection();
  gridSelection = {table, anchor, focus};
  const {top, bottom, left, right} = gridSelectionBounds(gridSelection);
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      const tr = table.tBodies[0].rows[row];
      if (tr && tr.cells[col]) tr.cells[col].classList.add('cell-sel');
    }
  }
}

/** 범위의 값을 '칸은 탭, 줄은 줄바꿈' 글로 (엑셀에 붙이면 칸이 그대로 나뉨) */
function gridSelectionText(selection) {
  const {top, bottom, left, right} = gridSelectionBounds(selection);
  const lines = [];
  for (let row = top; row <= bottom; row++) {
    const cells = [];
    for (let col = left; col <= right; col++) {
      const input = gridCellInput(selection.table, {row, col});
      cells.push(input ? input.value : '');
    }
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

/** 클립보드에 글 쓰기 (클립보드를 못 쓰면 임시 입력란을 선택해 복사 명령) */
async function writeClipboardText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.append(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }
}

/** 범위 비우기 (되돌릴 수 있게 지우기 전 모습을 기억) */
function clearGridSelectionCells(selection) {
  const {table, anchor} = selection;
  rememberGridState(table.id, table.tBodies[0], anchor.row, anchor.col);
  const {top, bottom, left, right} = gridSelectionBounds(selection);
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      const input = gridCellInput(table, {row, col});
      if (input) {
        setGridCellValue(input, '');   // 고르는 칸은 기본값으로
        input.classList.remove('invalid');
      }
    }
  }
  refreshIndicators();
}

/* ======================= 마우스 ======================= */

/** 누름: 표 칸이면 끌기 시작(Shift 면 범위 넓히기), 표 밖이면 범위 선택 풀기 */
function handleGridMouseDown(e) {
  const input = e.target.closest ? e.target.closest('table.grid input, table.grid select') : null;
  if (!input) {
    clearGridSelection();
    return;
  }
  if (e.button !== 0) return;
  const table = input.closest('table');
  const position = gridCellPosition(input);
  if (e.shiftKey) {
    // 범위의 시작 칸: 이미 고른 범위의 시작 → 지금 커서가 있는 같은 표의 칸 → 누른 칸
    const focused = document.activeElement;
    const focusedInTable = isGridCellElement(focused) && focused.closest('table') === table;
    const anchor = gridSelection && gridSelection.table === table ? gridSelection.anchor
      : focusedInTable ? gridCellPosition(focused) : position;
    e.preventDefault();   // 글자 선택·커서 이동 대신 범위 선택
    setGridSelection(table, anchor, position);
    gridCellInput(table, anchor).focus();
    return;
  }
  clearGridSelection();
  gridDrag = {table, anchor: position, ranging: false};
}

/** 끄는 중 다른 칸 위로: 처음 넘어가는 순간 글자 선택을 멈추고 범위 선택으로 */
function handleGridMouseOver(e) {
  if (!gridDrag || !(e.buttons & 1)) return;
  const td = e.target.closest ? e.target.closest('td') : null;
  if (!td || td.closest('table') !== gridDrag.table || td.cellIndex >= gridColumnCount(gridDrag.table)) return;
  const position = gridCellPosition(td);
  if (!gridDrag.ranging) {
    if (position.row === gridDrag.anchor.row && position.col === gridDrag.anchor.col) return;
    gridDrag.ranging = true;
    document.body.classList.add('grid-dragging');
    const anchorInput = gridCellInput(gridDrag.table, gridDrag.anchor);
    if (anchorInput.tagName === 'INPUT') anchorInput.setSelectionRange(0, 0);
    anchorInput.blur();
    window.getSelection().removeAllRanges();
  }
  setGridSelection(gridDrag.table, gridDrag.anchor, position);
}

/** 놓음: 범위를 고른 뒤에는 시작 칸에 커서를 둬서 Ctrl+C · Delete · Shift+방향키를 바로 쓸 수 있게 */
function handleGridMouseUp() {
  if (!gridDrag) return;
  if (gridDrag.ranging) {
    document.body.classList.remove('grid-dragging');
    const anchorInput = gridCellInput(gridDrag.table, gridDrag.anchor);
    if (anchorInput) {
      anchorInput.focus({preventScroll: true});
      if (anchorInput.tagName === 'INPUT') anchorInput.setSelectionRange(anchorInput.value.length, anchorInput.value.length);
    }
  }
  gridDrag = null;
}

/* ======================= 키보드 ======================= */

/**
 * 커서가 칸의 끝에 있는지 (←→ 로 옆 칸에 갈지 정할 때)
 * 칸 전체가 선택됐으면(방향키로 들어온 칸) 어느 쪽이든 끝으로 봄. 고르는 칸은 늘 끝으로 봄
 */
function isCaretAtEdge(input, edge) {
  if (input.tagName !== 'INPUT') return true;
  const {selectionStart: start, selectionEnd: end, value} = input;
  if (start === 0 && end === value.length) return true;
  if (start !== end) return false;
  return edge === 'start' ? start === 0 : end === value.length;
}

/** Tab 으로 갈 칸 (줄 끝이면 다음 줄 처음, 표 끝이면 null — 표 밖으로 나감) */
function gridTabTarget(table, {row, col}, backward) {
  const lastCol = gridColumnCount(table) - 1;
  const lastRow = table.tBodies[0].rows.length - 1;
  if (!backward) return col < lastCol ? {row, col: col + 1} : (row < lastRow ? {row: row + 1, col: 0} : null);
  return col > 0 ? {row, col: col - 1} : (row > 0 ? {row: row - 1, col: lastCol} : null);
}

/** 표 맨 아래에 빈 줄 추가 (Enter 로 내려갈 때 — 되돌리기 기록은 그대로 둠) */
function appendGridRow(table) {
  table.tBodies[0].insertAdjacentHTML('beforeend', gridRowHtml(table.dataset.cols, []));
  refreshIndicators();
}

/** 표 칸에서 누른 키 처리 (되돌리기 · 복사 · 지우기 · 칸 이동 · 범위 넓히기) */
function handleGridKeydown(e) {
  const input = e.target;
  const table = isGridCellElement(input) ? input.closest('table.grid') : null;
  if (!table || e.isComposing || e.keyCode === 229) return;   // 한글 조합 중에는 건드리지 않음
  if (handleGridUndoRedo(e, table)) return;

  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key;
  const selection = gridSelection && gridSelection.table === table ? gridSelection : null;
  const multi = isMultiCellSelection(selection);

  const readOnly = isGridCellLocked(input);
  if (ctrl && multi && (key.toLowerCase() === 'c' || key.toLowerCase() === 'x')) {
    e.preventDefault();
    writeClipboardText(gridSelectionText(selection));
    const cut = key.toLowerCase() === 'x' && !readOnly;   // 읽기 전용 표는 잘라 내기도 복사만
    if (cut) clearGridSelectionCells(selection);
    toast(cut ? '잘라 냈습니다.' : '복사했습니다.');
    return;
  }
  if (multi && (key === 'Delete' || key === 'Backspace')) {
    e.preventDefault();
    if (!readOnly) clearGridSelectionCells(selection);
    return;
  }
  if (key === 'Escape' && selection) {
    clearGridSelection();
    return;
  }
  if (ctrl || e.altKey) return;

  const position = gridCellPosition(input);
  // 범위를 고른 상태에서는 ←→ 도 늘 칸 단위로 움직임
  const steps = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0],
    ArrowLeft: selection || isCaretAtEdge(input, 'start') ? [0, -1] : null,
    ArrowRight: selection || isCaretAtEdge(input, 'end') ? [0, 1] : null,
    Enter: [e.shiftKey ? -1 : 1, 0]
  };

  if (e.shiftKey && key.startsWith('Arrow')) {
    if (!steps[key]) return;   // 칸 안에서 글자 선택 (Shift+←→)
    e.preventDefault();
    const anchor = selection ? selection.anchor : position;
    const from = selection ? selection.focus : position;
    setGridSelection(table, anchor, clampGridPosition(table, from.row + steps[key][0], from.col + steps[key][1]));
    return;
  }

  let target = null;
  if (key === 'Tab') {
    target = gridTabTarget(table, position, e.shiftKey);
    if (!target) return;   // 표 끝: 평소처럼 다음 요소로
  } else if (steps[key]) {
    target = {row: position.row + steps[key][0], col: position.col + steps[key][1]};
    if (key === 'Enter' && !e.shiftKey && !readOnly && target.row >= table.tBodies[0].rows.length) appendGridRow(table);
    target = clampGridPosition(table, target.row, target.col);
  } else {
    return;
  }
  e.preventDefault();
  clearGridSelection();
  focusGridCell(table, target);
}

/* ======================= 날짜 칸 ======================= */

/**
 * 날짜 칸 값 맞추기: 20260101 · 2026.1.1 · 2026. 01. 01 · 2026/01/01 · 2026-01-01 → 2026-01-01
 * @returns {string} 날짜로 알아볼 수 없으면 '' (없는 날짜 — 2026-02-30 등 — 도 '')
 */
function toDateInputValue(text) {
  const match = String(text).trim().match(/^(\d{4})\s*[.\-/]?\s*(\d{1,2})\s*[.\-/]?\s*(\d{1,2})\.?$/);
  if (!match) return '';
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 날짜 칸(표 · 정의 칸)을 떠날 때: 알아볼 수 있으면 2026-01-01 형식으로, 아니면 그대로 두고 빨갛게 */
function handleGridDateChange(e) {
  const input = e.target;
  if (!input.matches || !input.matches('input[data-type="date"]')) return;
  const value = input.value.trim();
  const date = value ? toDateInputValue(value) : '';
  if (date) input.value = date;
  input.classList.toggle('invalid', !!value && !date);
  input.title = value && !date ? '날짜 형식이 아닙니다. 예: 20260101' : '';
  refreshIndicators();
}

/* ======================= 행 추가 · 삭제 ======================= */

/** 표에 빈 줄 추가 (tableId: 표 요소 id, 열 구성은 표의 data-cols) */
function addGridRow(tableId) {
  const table = document.getElementById(tableId);
  table.tBodies[0].insertAdjacentHTML('beforeend', gridRowHtml(table.dataset.cols, []));
  clearGridPasteUndo(tableId);
  clearGridSelection();
  refreshIndicators();
}

/** 표의 줄 삭제 (마지막 줄이면 빈 줄 하나를 남김) */
function deleteGridRow(button) {
  const body = button.closest('tbody');
  const table = button.closest('table');
  button.closest('tr').remove();
  if (!body.children.length) body.insertAdjacentHTML('beforeend', gridRowHtml(table.dataset.cols, []));
  clearGridPasteUndo(table.id);
  clearGridSelection();
  refreshIndicators();
}

/**
 * 빈 줄 지우기 — 모든 칸이 비었거나 기본값(고르는 칸의 첫 값)인 줄. 등록한 뒤 화면을 저장된 모양과 맞추기 위함
 * (저장할 때는 readGridOf 가 이미 빈 줄을 빼고 읽음). 줄이 하나도 안 남게 되면 빈 줄 하나는 남김(입력할 자리)
 */
function removeEmptyGridRows(table) {
  const columnsKey = table.dataset.cols;
  const isEmptyRow = tr => [...tr.querySelectorAll(GRID_CELL_SELECTOR)].every((cell, col) => cell.value.trim() === gridCellDefault(columnsKey, col));
  const emptyRows = [...table.tBodies[0].rows].filter(isEmptyRow);
  if (emptyRows.length === table.tBodies[0].rows.length) emptyRows.shift();
  if (!emptyRows.length) return;
  emptyRows.forEach(tr => tr.remove());
  clearGridPasteUndo(table.id);
  clearGridSelection();
}

/* ======================= 여러 칸 · 여러 줄 붙여넣기 ======================= */

/**
 * 붙여넣은 글을 표 모양(줄 × 칸)으로 나누기 — 나누는 규칙은 splitTableText (utils.js)
 * @returns {string[][] | null} 값이 하나뿐이면 null — 그 칸에 평소처럼 붙여넣음
 */
function parsePastedTable(text) {
  const rows = splitTableText(text);
  if (!rows.length || (rows.length === 1 && rows[0].length === 1)) return null;
  return rows;
}

/**
 * 표 칸에 붙여넣기: 여러 칸·여러 줄이면 붙여넣은 칸부터 오른쪽·아래로 채움 (덮어쓰기)
 *   - 줄이 모자라면 행을 추가
 *   - 표의 칸 수를 넘는 값은 버리고 알림
 *   - 날짜 칸은 날짜 형식으로 바꾸고, 알아볼 수 없으면 비우고 알림
 * 값 하나만 붙여넣으면 아무것도 하지 않음 (브라우저 기본 붙여넣기)
 */
function handleGridPaste(e) {
  const input = e.target;
  const table = isGridCellElement(input) ? input.closest('table.grid') : null;
  if (!table || isGridCellLocked(input)) return;
  const rows = parsePastedTable(e.clipboardData && e.clipboardData.getData('text/plain'));
  if (!rows) return;
  e.preventDefault();

  const columnsKey = table.dataset.cols;
  const {cols, types} = GRID_COLUMNS[columnsKey];
  const body = table.tBodies[0];
  const {row: startRow, col: startCol} = gridCellPosition(input);
  rememberGridState(table.id, body, startRow, startCol);
  clearGridSelection();
  let droppedCount = 0, badDateCount = 0, badChoiceCount = 0;

  rows.forEach((cells, offset) => {
    while (body.rows.length <= startRow + offset) body.insertAdjacentHTML('beforeend', gridRowHtml(columnsKey, []));
    const rowInputs = body.rows[startRow + offset].querySelectorAll(GRID_CELL_SELECTOR);
    cells.forEach((value, i) => {
      const col = startCol + i;
      if (col >= cols.length) {
        if (value) droppedCount++;
        return;
      }
      if (types[col] === 'date') {
        const date = toDateInputValue(value);
        if (value && !date) badDateCount++;
        rowInputs[col].value = date;
        rowInputs[col].classList.remove('invalid');
      } else if (!setGridCellValue(rowInputs[col], value)) {
        badChoiceCount++;
      }
    });
  });
  // 붙여넣은 범위를 선택해 보여 줌 (바로 Ctrl+C · Delete 할 수 있게)
  const lastCol = Math.min(startCol + Math.max(...rows.map(cells => cells.length)) - 1, cols.length - 1);
  setGridSelection(table, {row: startRow, col: startCol}, {row: startRow + rows.length - 1, col: lastCol});
  refreshIndicators();

  let message = `${rows.length}줄을 붙여넣었습니다. 잘못 붙였으면 Ctrl+Z 로 되돌릴 수 있습니다.`;
  if (droppedCount) message += ` 표의 칸 수(${cols.length}칸)를 넘는 값 ${droppedCount}개는 버렸습니다.`;
  if (badDateCount) message += ` 날짜로 알아볼 수 없는 값 ${badDateCount}개는 비웠습니다.`;
  if (badChoiceCount) message += ` 고를 수 없는 값 ${badChoiceCount}개는 기본값으로 넣었습니다.`;
  toast(message);
}

/* ======================= 되돌리기(Ctrl+Z) · 다시 실행(Ctrl+Y, Ctrl+Shift+Z) =======================
   붙여넣기·범위 지우기는 칸에 값을 직접 넣으므로 브라우저의 되돌리기 기록에 남지 않습니다.
   그래서 표마다 모습을 따로 기억합니다: app.screen.gridPasteHistory[표 id] = {undo: [...], redo: [...]}
     붙여넣기 · 범위 지우기 → 직전 모습을 undo 에 쌓고 redo 는 비움
     Ctrl+Z → undo 에서 꺼내 그 모습으로. 되돌리기 직전 모습은 redo 에
     Ctrl+Y → redo 에서 꺼내 그 모습으로. 다시 실행 직전 모습은 undo 에
   그 표에 직접 입력하거나 행을 추가·삭제하면 기록을 모두 지웁니다 —
   그 뒤의 Ctrl+Z/Y 는 브라우저가 평소처럼 처리하고, 이후에 고친 내용이 함께 사라지지 않게 하기 위함입니다. */

/* 표마다 기억해 둘 되돌리기 개수 */
const MAX_GRID_PASTE_UNDO = 20;

/** 표의 지금 모습 (빈 줄 포함, 줄 id + 모든 칸 값) — 되돌려도 줄 id 가 그대로여야 원본과의 짝이 유지됨 */
const gridSnapshot = body => [...body.rows].map(row => ({id: row.dataset.rid, cells: [...row.querySelectorAll(GRID_CELL_SELECTOR)].map(cell => cell.value)}));

/** 이 표의 되돌리기·다시 실행 기록 (없으면 빈 기록을 만듦) */
function gridPasteHistoryOf(tableId) {
  const all = app.screen.gridPasteHistory;
  if (!all[tableId]) all[tableId] = {undo: [], redo: []};
  return all[tableId];
}

/** 바꾸기 직전 모습을 기억 (되돌린 뒤 커서를 둘 칸 위치도 함께). 새로 바꾸면 다시 실행 기록은 버림 */
function rememberGridState(tableId, body, row, col) {
  const history = gridPasteHistoryOf(tableId);
  history.undo = [...history.undo, {rows: gridSnapshot(body), row, col}].slice(-MAX_GRID_PASTE_UNDO);
  history.redo = [];
}

/** 이 표의 되돌리기·다시 실행 기록 지우기 */
function clearGridPasteUndo(tableId) {
  if (app.screen) delete app.screen.gridPasteHistory[tableId];
}

/** 기억해 둔 모습으로 표를 다시 그리고, 바꿨던 칸에 커서를 둠 */
function restoreGridSnapshot(table, {rows, row, col}) {
  clearGridSelection();
  const body = table.tBodies[0];
  body.innerHTML = rows.map(({id, cells}) => gridRowHtml(table.dataset.cols, cells, false, id)).join('');
  const cell = gridCellInput(table, {row, col});
  if (cell) cell.focus();
  refreshIndicators();
}

/**
 * 표 칸에서 Ctrl+Z(되돌리기) · Ctrl+Y / Ctrl+Shift+Z(다시 실행)
 * @returns {boolean} 처리했으면 true. 해당 기록이 없으면 false — 브라우저 기본 동작(입력한 글자 되돌리기·다시 실행)
 */
function handleGridUndoRedo(e, table) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  const key = e.key.toLowerCase();
  const isUndo = key === 'z' && !e.shiftKey;
  const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
  if (!isUndo && !isRedo) return false;
  const history = app.screen.gridPasteHistory[table.id];
  const source = history && (isUndo ? history.undo : history.redo);
  if (!source || !source.length) return false;
  e.preventDefault();

  const target = source.pop();
  // 지금 모습은 반대쪽 기록에 넣어 둠 (되돌린 것을 다시 실행하거나, 다시 실행한 것을 또 되돌릴 수 있게)
  (isUndo ? history.redo : history.undo).push({rows: gridSnapshot(table.tBodies[0]), row: target.row, col: target.col});
  restoreGridSnapshot(table, target);
  toast(isUndo ? '되돌렸습니다. 다시 실행하려면 Ctrl+Y' : '다시 실행했습니다. 되돌리려면 Ctrl+Z');
  return true;
}

/* ======================= 이벤트 연결 ======================= */

/** 표에 직접 입력하면: 범위 선택을 풀고, 되돌리기 기록을 지움 (그 뒤 Ctrl+Z/Y 는 브라우저 기본) */
function handleGridInput(e) {
  const table = e.target.closest ? e.target.closest('table.grid') : null;
  if (!table) return;
  clearGridSelection();
  clearGridPasteUndo(table.id);
}

function initGrids() {
  const main = $('#main');
  document.addEventListener('mousedown', handleGridMouseDown);
  document.addEventListener('mouseover', handleGridMouseOver);
  window.addEventListener('mouseup', handleGridMouseUp);
  main.addEventListener('keydown', handleGridKeydown);
  main.addEventListener('paste', handleGridPaste);
  main.addEventListener('change', handleGridDateChange);
  main.addEventListener('input', handleGridInput);
}
