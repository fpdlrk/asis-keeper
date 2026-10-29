/* ==========================================================================
   diff.js — 변경 전(ASIS) / 변경 후(TOBE) 비교
     - diffLines()        : 줄 단위 비교 (LCS 알고리즘)
     - sideBySideHtml()   : 나란히 보기 표 HTML — 비교 창 · 보고서가 함께 씀
     - 비교 창(#diffModal) : SQL 블록 하나(원본과) / 파일 하나
   ========================================================================== */

/* 이보다 큰 비교(기존 줄 수 × 신규 줄 수)는 계산이 너무 오래 걸려 줄 비교를 생략 */
const MAX_DIFF_CELLS = 4e6;
/* 바뀐 줄 앞뒤로 보여 줄 같은 줄 수 (나머지는 "⋯ 동일한 n줄 생략 ⋯") */
const DIFF_CONTEXT_LINES = 3;
/* 이보다 큰 파일은 글자 비교 대신 해시로만 비교 */
const MAX_TEXT_DIFF_BYTES = 2e6;

/* 비교 창 상태: SQL 비교면 {tobeBlockId}, 파일 비교면 {path} */
let diffWindowState = null;

/* ======================= 비교 계산 ======================= */

/**
 * 줄 단위 비교
 * @param {string[]} before 변경 전 줄들
 * @param {string[]} after  변경 후 줄들
 * @param {boolean} [ignoreFormat] true = 공백·대소문자만 다른 줄은 같은 줄로 봄
 * @returns {Array<[' ', string, string] | ['-', string] | ['+', string]> | null}
 *   ' ' 같음(변경 전 줄, 변경 후 줄 — 무시 옵션이면 글자가 조금 다를 수 있어 둘 다 줌), '-' 삭제, '+' 추가. 너무 크면 null
 */
function diffLines(before, after, ignoreFormat = false) {
  const n = before.length, m = after.length;
  if (n * m > MAX_DIFF_CELLS) return null;
  // 비교할 값: 무시 옵션이면 정리한 값으로 비교하고, 보여 줄 때는 원래 줄을 씀
  const beforeKeys = ignoreFormat ? before.map(formatInsensitiveLine) : before;
  const afterKeys = ignoreFormat ? after.map(formatInsensitiveLine) : after;
  // common[i][j] = before[i..] 와 after[j..] 의 가장 긴 공통 줄 수
  const common = Array.from({length: n + 1}, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      common[i][j] = beforeKeys[i] === afterKeys[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const rows = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (beforeKeys[i] === afterKeys[j]) { rows.push([' ', before[i], after[j]]); i++; j++; }
    else if (common[i + 1][j] >= common[i][j + 1]) rows.push(['-', before[i++]]);
    else rows.push(['+', after[j++]]);
  }
  while (i < n) rows.push(['-', before[i++]]);
  while (j < m) rows.push(['+', after[j++]]);
  return rows;
}

/**
 * 바뀐 줄 번호 (0부터) — 편집기에서 바뀐 줄을 색칠할 때 씀
 * @returns {{deleted: number[], added: number[]} | null} 너무 커서 비교 못 하면 null
 */
function findChangedLineNumbers(beforeText, afterText, ignoreFormat = false) {
  const rows = diffLines(normalizeLineBreaks(beforeText).split('\n'), normalizeLineBreaks(afterText).split('\n'), ignoreFormat);
  if (!rows) return null;
  const deleted = [], added = [];
  let beforeLine = 0, afterLine = 0;
  for (const [mark] of rows) {
    if (mark === ' ') { beforeLine++; afterLine++; }
    else if (mark === '-') deleted.push(beforeLine++);
    else added.push(afterLine++);
  }
  return {deleted, added};
}

/** 표 칸 안의 글자 (빈 칸은 높이가 유지되도록 &nbsp;) */
const diffCellHtml = text => (text === undefined || text === '') ? '&nbsp;' : escapeHtml(text);

/**
 * 변경 전/후 나란히 보기 표 HTML
 * 바뀐 곳 앞뒤 DIFF_CONTEXT_LINES 줄만 보여 주고, 나머지 같은 줄은 접습니다.
 * @param {boolean} [ignoreFormat] 공백·대소문자 차이 무시. 기본은 화면의 옵션(app.ignoreFormat). 보고서는 false 로 부름
 * @param {string} [originalName] 안내 글에서 변경 전을 부르는 이름 — 앱은 '원본', 보고서는 'ASIS'(REPORT_ORIGINAL_NAME)
 */
function sideBySideHtml(before, after, ignoreFormat = app.ignoreFormat, originalName = '원본') {
  before = normalizeLineBreaks(before);
  after = normalizeLineBreaks(after);
  if (before === after) return `<p class="note">변경 없음 (${originalName}과 동일)</p>`;
  if (ignoreFormat && isSameText(before, after, true)) return '<p class="note">변경 없음 (공백·줄바꿈·대소문자 차이만 있음)</p>';
  if (!before.trim()) return '<div class="cap">신규 등록</div><pre class="add">' + escapeHtml(after) + '</pre>';
  if (!after.trim()) return `<div class="cap">신규 내용 없음 (${originalName} 내용)</div><pre class="del">` + escapeHtml(before) + '</pre>';

  const rows = diffLines(before.split('\n'), after.split('\n'), ignoreFormat);
  if (!rows) {   // 너무 커서 줄 비교를 못 하면 통째로 나란히
    return '<table class="sbs"><tbody><tr><td><pre>' + escapeHtml(before) + '</pre></td><td><pre>' + escapeHtml(after) + '</pre></td></tr></tbody></table>';
  }

  // 연속된 삭제(-)/추가(+)를 한 줄씩 짝지어 [왼쪽, 오른쪽] 표 줄로 만듦
  const tableRows = [];   // {changed, left, right}
  let deletedRun = [], addedRun = [], deletedTotal = 0, addedTotal = 0;
  const flushRun = () => {
    const height = Math.max(deletedRun.length, addedRun.length);
    for (let k = 0; k < height; k++) tableRows.push({changed: true, left: deletedRun[k], right: addedRun[k]});
    deletedTotal += deletedRun.length;
    addedTotal += addedRun.length;
    deletedRun = [];
    addedRun = [];
  };
  for (const [mark, text, afterText] of rows) {
    if (mark === ' ') { flushRun(); tableRows.push({changed: false, left: text, right: afterText}); }
    else if (mark === '-') deletedRun.push(text);
    else addedRun.push(text);
  }
  flushRun();

  // 바뀐 줄 근처만 보여 줌
  const visible = tableRows.map(() => false);
  tableRows.forEach((row, i) => {
    if (!row.changed) return;
    for (let k = Math.max(0, i - DIFF_CONTEXT_LINES); k <= Math.min(tableRows.length - 1, i + DIFF_CONTEXT_LINES); k++) visible[k] = true;
  });
  const gapRow = count => `<tr><td colspan="2" class="gap">⋯ 동일한 ${count}줄 생략 ⋯</td></tr>`;
  const cellClass = (row, side) => !row.changed ? '' : (row[side] === undefined ? 'blank' : (side === 'left' ? 'del' : 'add'));
  let body = '', hidden = 0;
  tableRows.forEach((row, i) => {
    if (!visible[i]) { hidden++; return; }
    if (hidden) { body += gapRow(hidden); hidden = 0; }
    body += `<tr><td class="${cellClass(row, 'left')}">${diffCellHtml(row.left)}</td><td class="${cellClass(row, 'right')}">${diffCellHtml(row.right)}</td></tr>`;
  });
  if (hidden) body += gapRow(hidden);
  return `<table class="sbs"><thead><tr><th>변경 전 (ASIS)</th><th>변경 후 (TOBE)</th></tr></thead><tbody>${body}</tbody></table>`
    + `<p class="note">삭제 ${deletedTotal}줄 · 추가 ${addedTotal}줄</p>`;
}

/**
 * 파일 두 개 비교
 * @returns {Promise<{kind: 'same'|'modified', html: string}>}
 */
async function compareFiles(path, beforeFile, afterFile) {
  const canCompareText = TEXT_FILE_PATTERN.test(path) && beforeFile.size <= MAX_TEXT_DIFF_BYTES && afterFile.size <= MAX_TEXT_DIFF_BYTES;
  if (!canCompareText) {
    const same = (await sha256(beforeFile)) === (await sha256(afterFile));
    return {
      kind: same ? 'same' : 'modified',
      html: same
        ? '<p class="note">두 파일이 같습니다. (SHA-256 일치)</p>'
        : '<p class="note">텍스트로 비교할 수 없는 파일(바이너리/대용량)입니다. 내용은 서로 다릅니다. (SHA-256 불일치)</p>'
    };
  }
  const before = await decodeText(beforeFile), after = await decodeText(afterFile);
  const same = isSameText(before, after, app.ignoreFormat);
  return {kind: same ? 'same' : 'modified', html: sideBySideHtml(before, after)};
}

/* ======================= "공백·대소문자 무시" 옵션 ======================= */

/** 옵션 체크박스 HTML (SQL 탭에 넣음. 비교 창 · 소스 비교 창 것은 index.html 에 있음) */
const ignoreFormatToggleHtml = () => `<label class="opt-check" title="띄어쓰기·들여쓰기·줄바꿈과 대소문자 차이는 변경으로 보지 않습니다. (문자열 값의 대소문자 차이도 무시되며, 보고서는 항상 그대로 비교합니다)">`
  + `<input type="checkbox" data-ignore-format${app.ignoreFormat ? ' checked' : ''}>공백·대소문자 무시</label>`;

/** 옵션 바꾸기: 모든 체크박스를 맞추고, 보이는 비교 결과를 다시 그림 */
function setIgnoreFormat(ignore) {
  app.ignoreFormat = ignore;
  settings.setQuietly(SETTING_KEYS.ignoreFormat, ignore);
  $$('[data-ignore-format]').forEach(checkbox => { checkbox.checked = ignore; });
  if (!$('#srcDiffModal').hidden) renderSourceDiff();   // 소스 비교 창은 화면이 없어도 씀
  if (!app.screen) return;
  readBlockInputs('tobe').forEach(block => markChangedLines(block.id));   // 신규 SQL 탭의 바뀐 줄 표시
  refreshIndicators();   // SQL 탭의 원본 대비 상태(변경/동일)도 옵션에 따라 달라짐
  if (!$('#diffModal').hidden) renderDiffWindow();
}

/* ======================= 비교 창 ======================= */

/** 비교 창의 "비교할 기존 SQL" 선택 상자 보이기/숨기기 (파일 비교에는 필요 없음) */
function showDiffBlockPicker(show) {
  $('#dfALabel').style.display = $('#dfA').style.display = show ? '' : 'none';
}

/** 신규 SQL 블록 하나를 기존 SQL 과 비교하는 창 (기본은 그 블록에 연결한 기존 블록) */
function openSqlDiffWindow(tobeBlockId) {
  const asisBlocks = readBlockInputs('asis');
  if (!asisBlocks.length) return toast('비교할 원본 SQL 블록이 없습니다.');
  const tobeBlocks = readBlockInputs('tobe');
  const order = tobeBlocks.findIndex(block => block.id === tobeBlockId);
  diffWindowState = {tobeBlockId};

  $('#dfTitle').textContent = '원본과 비교 · ' + tobeBlocks[order].title;
  const picker = $('#dfA');
  picker.innerHTML = asisBlocks.map((block, i) => `<option value="${escapeHtml(block.id)}">${i + 1}. ${escapeHtml(block.title)}</option>`).join('');
  const paired = findPairedAsisBlock(tobeBlocks[order], order, asisBlocks);
  picker.value = (paired || asisBlocks[0]).id;
  showDiffBlockPicker(true);
  $('#dfHint').textContent = '신규 SQL은 아직 등록하지 않은 입력값까지 포함합니다.';
  renderSqlDiffWindow();
  $('#diffModal').hidden = false;
}

/** 비교 창 내용(SQL) 다시 그리기 — 기존 블록을 바꿔 고를 때도 씀 */
function renderSqlDiffWindow() {
  const before = getEditorValue(editorId('asis', $('#dfA').value));
  const after = getEditorValue(editorId('tobe', diffWindowState.tobeBlockId));
  $('#dfBody').innerHTML = sideBySideHtml(before, after);
}

/**
 * 파일 하나를 같은 경로의 기존 파일과 비교하는 창
 * @param {File} [pendingFile] 아직 등록하지 않은 신규 파일 (없으면 등록된 신규 파일)
 */
async function openFileDiffWindow(path, pendingFile) {
  diffWindowState = {path, pendingFile};
  if (!(await renderFileDiffWindow())) return;
  $('#dfTitle').textContent = '원본과 비교 · ' + path;
  showDiffBlockPicker(false);
  $('#dfHint').textContent = pendingFile ? '등록 대기 중인 신규 파일과 비교합니다.' : '';
  $('#diffModal').hidden = false;
}

/** 비교 창 내용(파일) 그리기. 파일을 못 찾으면 false */
async function renderFileDiffWindow() {
  const {path, pendingFile} = diffWindowState;
  const dir = app.screen.dir;
  const beforeFile = await readFile(dir, FILE_DIRS.asis + '/' + path);
  const afterFile = pendingFile || await readFile(dir, FILE_DIRS.tobe + '/' + path);
  if (!beforeFile || !afterFile) {
    toast('비교할 파일을 찾지 못했습니다.');
    return false;
  }
  $('#dfBody').innerHTML = (await compareFiles(path, beforeFile, afterFile)).html;
  return true;
}

/** 열려 있는 비교 창 다시 그리기 (SQL 이든 파일이든) */
function renderDiffWindow() {
  if (!diffWindowState) return;
  if (diffWindowState.tobeBlockId) renderSqlDiffWindow();
  else renderFileDiffWindow();
}

function initDiff() {
  $('#dfA').onchange = () => { if (diffWindowState && diffWindowState.tobeBlockId) renderSqlDiffWindow(); };
  $('#dfClose').onclick = () => { $('#diffModal').hidden = true; };
  // "공백·대소문자 무시" 체크박스는 여러 곳(SQL 탭 · 비교 창 · 소스 비교 창)에 있으므로 문서 전체에서 받음
  document.addEventListener('change', e => {
    if (e.target.matches('[data-ignore-format]')) setIgnoreFormat(e.target.checked);
  });
}
