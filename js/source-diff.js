/* ==========================================================================
   source-diff.js — 소스 비교 창 (상단 오른쪽 [소스 비교])
     아무 두 소스를 왼쪽 · 오른쪽에 붙여넣어 비교합니다. ("이 소스와 저 소스" 비교)
     모양은 SQL 블록의 원본(왼쪽) · 신규(오른쪽) 나란히 보기와 같습니다 (.blk-b · .pane):
       - 바뀐 줄을 편집기 안에서 색칠 (왼쪽 = 지운 줄, 오른쪽 = 넣은 줄) + 위쪽에 'n줄 변경'
       - 두 편집기 스크롤이 함께 움직임 (linkScrollTogether — screen-blocks.js)
     - 입력이 잠시 멈추면 자동으로 다시 비교 (SOURCE_DIFF_DELAY)
     - 열린 화면이 있으면 그 화면의 원본 · 신규 SQL 을 골라 불러올 수 있음 (등록하지 않은 입력값 포함)
     - [좌우 바꾸기] · [모두 지우기] · 공백·대소문자 무시 옵션(다른 비교 화면과 함께 움직임)
     편집기는 처음 열 때 한 번 만들고 계속 다시 씁니다 (창을 닫았다 열어도 넣은 소스가 남음).
   ========================================================================== */

/* 입력이 멈춘 뒤 다시 비교하기까지 기다리는 시간(ms) */
const SOURCE_DIFF_DELAY = 300;

/* 왼쪽 · 오른쪽 편집기 {left, right} (처음 열 때 만듦) */
let sourceDiffEditors = null;
/* 다시 비교 타이머 */
let sourceDiffTimer = null;
/* 지금 칠해 둔 바뀐 줄 표시 [[session, markerId], …] */
let sourceDiffMarkers = [];

/** 왼쪽 · 오른쪽 편집기 (처음 한 번만 만듦) */
function getSourceDiffEditors() {
  if (!sourceDiffEditors) {
    sourceDiffEditors = {left: ace.edit($('#sdLeft'), sqlEditorOptions(false)), right: ace.edit($('#sdRight'), sqlEditorOptions(false))};
    for (const editor of Object.values(sourceDiffEditors)) editor.session.on('change', scheduleSourceDiff);
    linkScrollTogether(sourceDiffEditors.left, sourceDiffEditors.right);
  }
  return sourceDiffEditors;
}

/** '화면의 SQL 불러오기' 선택 항목: 열린 화면의 원본 · 신규 SQL (화면이 없으면 안내만) */
function screenSqlChoicesHtml() {
  if (!app.screen) return '<option value="">열린 화면 없음</option>';
  const options = ['asis', 'tobe'].flatMap(kind => readBlockInputs(kind)
    .map(block => `<option value="${kind}:${escapeHtml(block.id)}">${LAYER_LABELS[kind]} · ${escapeHtml(block.title)}</option>`));
  return '<option value="">화면의 SQL 불러오기…</option>' + options.join('');
}

/**
 * 선택 상자에서 고른 SQL 을 그쪽 편집기에 넣음
 * @param {'left'|'right'} side
 * @param {string} value '<asis|tobe>:<블록 id>'
 */
function loadScreenSqlInto(side, value) {
  if (!value || !app.screen) return;
  const [kind, blockId] = value.split(':');
  getSourceDiffEditors()[side].setValue(getEditorValue(editorId(kind, blockId)), -1);
}

/** 칠해 둔 바뀐 줄 표시 지우기 */
function clearSourceDiffMarks() {
  for (const [session, markerId] of sourceDiffMarkers) session.removeMarker(markerId);
  sourceDiffMarkers = [];
}

/** 바뀐 줄 다시 색칠하고 위쪽에 'n줄 변경' (SQL 블록의 markChangedLines 와 같은 규칙) */
function renderSourceDiff() {
  const {left, right} = getSourceDiffEditors();
  const badge = $('#sdChg');
  clearSourceDiffMarks();
  const before = left.getValue(), after = right.getValue();
  if (!before.trim() || !after.trim()) {
    badge.textContent = '';
    return;
  }
  if (app.ignoreFormat && isSameText(before, after, true)) {
    badge.textContent = '변경 없음';
    badge.className = 'chg';
    return;
  }
  const changed = findChangedLineNumbers(before, after, app.ignoreFormat);
  if (!changed) {
    badge.textContent = '대용량 · 줄 비교 생략';
    badge.className = 'chg';
    return;
  }
  const Range = ace.require('ace/range').Range;
  const markLine = (editor, line, cssClass) => sourceDiffMarkers.push([editor.session, editor.session.addMarker(new Range(line, 0, line, 1), cssClass, 'fullLine')]);
  changed.deleted.forEach(line => markLine(left, line, 'ln-del'));
  changed.added.forEach(line => markLine(right, line, 'ln-add'));
  const count = Math.max(changed.deleted.length, changed.added.length);
  badge.textContent = count ? `${count}줄 변경` : '변경 없음';
  badge.className = 'chg ' + (count ? 'warn' : '');
}

/** 입력이 멈추면 다시 비교 */
function scheduleSourceDiff() {
  clearTimeout(sourceDiffTimer);
  sourceDiffTimer = setTimeout(renderSourceDiff, SOURCE_DIFF_DELAY);
}

/** [소스 비교]: 창 열기 */
function openSourceDiff() {
  const editors = getSourceDiffEditors();
  for (const editor of Object.values(editors)) editor.setOption('fontFamily', codeFontStack);   // 글꼴 설정을 바꿨을 수 있음
  for (const id of ['#sdLoadLeft', '#sdLoadRight']) $(id).innerHTML = screenSqlChoicesHtml();
  $('#srcDiffModal [data-ignore-format]').checked = app.ignoreFormat;
  $('#srcDiffModal').hidden = false;
  for (const editor of Object.values(editors)) editor.resize(true);   // 숨어 있다 보이므로 크기를 다시 계산
  renderSourceDiff();
  editors.left.focus();
}

/** [좌우 바꾸기] */
function swapSourceDiff() {
  const {left, right} = getSourceDiffEditors();
  const leftText = left.getValue();
  left.setValue(right.getValue(), -1);
  right.setValue(leftText, -1);
}

/** [모두 지우기] */
function clearSourceDiff() {
  const {left, right} = getSourceDiffEditors();
  left.setValue('', -1);
  right.setValue('', -1);
  left.focus();
}

function initSourceDiff() {
  $('#btnSourceDiff').onclick = openSourceDiff;
  $('#sdClose').onclick = () => { $('#srcDiffModal').hidden = true; };
  $('#sdSwap').onclick = swapSourceDiff;
  $('#sdClear').onclick = clearSourceDiff;
  $('#sdLoadLeft').onchange = e => { loadScreenSqlInto('left', e.target.value); e.target.value = ''; };
  $('#sdLoadRight').onchange = e => { loadScreenSqlInto('right', e.target.value); e.target.value = ''; };
  // 창 크기가 바뀌면 편집기도 다시 맞춤 (편집기가 창 높이를 채우므로)
  window.addEventListener('resize', () => {
    if (sourceDiffEditors && !$('#srcDiffModal').hidden) Object.values(sourceDiffEditors).forEach(editor => editor.resize());
  });
}
