/* ==========================================================================
   screen-sqltabs.js — 알약 탭 · SQL 탭 · 항목 이력
     - 알약 탭(공통): SQL · 서비스 · 오브젝트 · 공통코드관리 탭 안에서 항목 하나 = 탭 하나
         탭 줄 id = 'asis' | 'tobe' (SQL 원본 · 신규, 이 파일) | 'service' | 'object' | 'code' (정의서, screen-defs.js)
         탭이 넘치면: 스크롤바는 숨기고(UI 가 틀어지지 않게) 양 끝에 ‹ › 단추 + 가려진 쪽을 흐리게 표시.
         마우스 휠(가로로 움직임) · 탭 줄을 끌기 · [▾ 전체] 목록으로도 이동합니다.
         신규 단계에서는 탭마다 원본 대비 상태(변경 · 신규 · 삭제됨)와 탭 줄 오른쪽 요약을 붙입니다 (screen-changes.js)
         '삭제됨' 탭 = 원본에만 있는 항목 (id 앞에 GONE_TAB_PREFIX, × 없음, 누르면 읽기 전용 보기)
     - SQL 탭: 고른 탭의 SQL 블록만 보이고 나머지는 숨깁니다.
       블록은 모두 화면에 그대로 있으므로 등록·비교 탭·보고서는 예전처럼 화면 순서대로 읽습니다.
     - [+ SQL 추가] 창: 이름·SQL(필수) · 비교할 원본 SQL(신규만) · 이력(선택)
       창은 처음 추가할 때만 쓰고, 고치는 것은 탭 본문에서 합니다.
     - 항목 이력(공통): item.log = [{at, by, text, source}] — source 'user'(직접 남김) · 'system'(자동, change-log.js)
         SQL  → meta.sqlBlocks[kind][].log      정의서 → <dir>/asis.json · tobe.json 의 [].log
         이미 등록된 항목  → [이력 저장] 하면 바로 파일에 저장
         아직 등록 전인 항목 → 화면에만 남았다가 그 항목을 등록할 때 함께 저장
   ========================================================================== */

/* SQL 추가 창의 SQL 편집기 (처음 열 때 한 번 만들고 계속 다시 씀) */
let sqlAddEditor = null;

/* ======================= 알약 탭 (공통) ======================= */

/** SQL 탭 줄인지 (아니면 정의서 탭 줄) */
const isSqlTabBar = barId => barId === 'asis' || barId === 'tobe';

/** 탭 줄 자리 HTML (내용은 renderPillTabs 가 채움) + 항목이 하나도 없을 때의 안내 */
const pillTabsBarHtml = barId => `<div class="sqltabs"><div class="pilltabs-scroll">`
  + `<button type="button" class="pilltabs-arrow" data-pill-scroll="${barId}" data-dir="-1" aria-label="왼쪽 탭 보기" hidden>‹</button>`
  + `<div class="sqltabs-list" id="tabs-${barId}" role="tablist" aria-label="목록"></div>`
  + `<button type="button" class="pilltabs-arrow" data-pill-scroll="${barId}" data-dir="1" aria-label="오른쪽 탭 보기" hidden>›</button></div>`
  + `<span class="tabs-sum" id="tabsSum-${barId}"></span>`
  + `<div class="sqltabs-tools" id="tabsTools-${barId}"></div></div>`
  + `<div class="sqltabs-empty" id="tabsEmpty-${barId}" hidden></div>`;

/* 신규(원본 없음) 항목은 글자 대신 빨간 동그라미 안의 'N' 으로 표시 (CSS .sqltab[data-st="new"] .sqltab-st) */
const NEW_BADGE_TEXT = 'N';

/** 원본 대비 상태 글 (탭 이름 뒤) — 동일이면 비움, 신규는 N 표시 */
const pillStateText = state => (state === 'new' ? NEW_BADGE_TEXT : state && state !== 'same' ? ITEM_STATE_LABELS[state] : '');

/**
 * 탭 하나: [● 이름 상태] [×]
 * @param {{id: string, title: string, state?: string}} entry state: 'gone' 이면 삭제된 원본 항목 탭(× 없음)
 */
function pillTabHtml(barId, entry, removable) {
  const gone = entry.state === 'gone';
  return `<div class="sqltab${gone ? ' gone' : ''}" data-tab-bid="${escapeHtml(entry.id)}" data-st="${entry.state || ''}" title="${escapeHtml(entry.title)}">`
    + `<button type="button" class="sqltab-b" role="tab" aria-selected="false" data-pill-tab="${barId}" data-bid="${escapeHtml(entry.id)}">`
    + `<i class="sqltab-dot" title="등록하지 않은 변경이 있습니다"></i><span class="sqltab-t">${escapeHtml(entry.title)}</span>`
    + `<em class="sqltab-st">${pillStateText(entry.state)}</em></button>`
    + (removable && !gone ? `<button type="button" class="sqltab-x" data-pill-del="${barId}" data-bid="${escapeHtml(entry.id)}" title="삭제" aria-label="${escapeHtml(entry.title)} 삭제">×</button>` : '')
    + `</div>`;
}

/**
 * 탭 줄 그리기
 * @param {string} barId 탭 줄 id
 * @param {{id: string, title: string}[]} entries 화면 순서대로
 * @param {object} opt activeId(고른 탭), removable(× 표시), addLabel([+ …] 단추 글자, '' 이면 단추 없음), emptyText(항목이 없을 때 안내),
 *   emptyAction(안내 아래 단추 {label, data: {이름: 값}} — 누르면 화면 클릭 처리(handleScreenClick)가 data 로 받음)
 *   [▾ 전체]의 data-menu 는 누른 클릭으로 메뉴가 바로 닫히지 않게 하는 표시(dialog.js)
 */
function renderPillTabs(barId, entries, {activeId, removable, addLabel, emptyText, emptyAction}) {
  const list = $('#tabs-' + barId);
  if (!list) return;
  list.innerHTML = entries.map(entry => pillTabHtml(barId, entry, removable)).join('');
  list.onwheel = scrollTabsSideways;
  list.onscroll = () => updatePillTabOverflow(barId);
  list.onmousedown = startPillTabsDrag;
  watchPillTabsSize(list);
  $('#tabsTools-' + barId).innerHTML =
    `<button type="button" class="btn btn-s btn-ghost" data-pill-all="${barId}" data-menu="pilltabs" aria-haspopup="menu"${entries.length ? '' : ' disabled'}>▾ 전체 ${entries.length}</button>`
    + (addLabel ? `<button type="button" class="btn btn-s btn-pill-add" data-pill-add="${barId}">${escapeHtml(addLabel)}</button>` : '');
  const empty = $('#tabsEmpty-' + barId);
  empty.hidden = entries.length > 0;
  empty.textContent = emptyText;
  if (emptyAction) {
    const attrs = Object.entries(emptyAction.data).map(([name, value]) => `data-${name}="${escapeHtml(value)}"`).join(' ');
    empty.insertAdjacentHTML('beforeend', `<div class="empty-act"><button type="button" class="btn btn-s" ${attrs}>${escapeHtml(emptyAction.label)}</button></div>`);
  }
  markActivePillTab(barId, activeId);
  updatePillTabOverflow(barId);
}

/** 고른 탭 모양 맞추기 */
function markActivePillTab(barId, activeId) {
  $$(`#tabs-${barId} .sqltab`).forEach(tab => {
    const isActive = tab.dataset.tabBid === activeId;
    tab.classList.toggle('on', isActive);
    tab.querySelector('.sqltab-b').setAttribute('aria-selected', String(isActive));
  });
}

/** 고른 탭이 보이도록 탭 줄을 스크롤 */
function scrollPillTabIntoView(barId, id) {
  const tab = $(`#tabs-${barId} [data-tab-bid="${id}"]`);
  if (tab) tab.scrollIntoView({block: 'nearest', inline: 'nearest'});
}

/**
 * 탭 이름 · ● · 원본 대비 상태를 지금 상태로 (글이 바뀔 때만 다시 넣음)
 * @param {string} [state] same · changed · new (신규 단계에서만, 원본 단계는 '')
 */
function markPillTab(barId, id, title, dirty, state = '') {
  const tab = $(`#tabs-${barId} [data-tab-bid="${id}"]`);
  if (!tab) return;
  const label = tab.querySelector('.sqltab-t');
  const stateLabel = tab.querySelector('.sqltab-st');
  const stateText = pillStateText(state);
  if (label.textContent !== title || stateLabel.textContent !== stateText) {
    label.textContent = title;
    stateLabel.textContent = stateText;
    stateLabel.title = state === 'new' ? '신규 (원본 없음)' : '';
    tab.title = title;
    updatePillTabOverflow(barId);   // 글 길이가 바뀌면 넘침도 바뀔 수 있음
  }
  tab.dataset.st = state;
  tab.classList.toggle('dirty', dirty);
}

/** 탭에 ⚠ 경고 (예: 저장 서비스인데 ENTITY 가 없음). message 가 비면 지움 */
function markPillTabWarning(barId, id, message) {
  const tab = $(`#tabs-${barId} [data-tab-bid="${id}"]`);
  if (!tab) return;
  tab.classList.toggle('warn', !!message);
  const title = tab.querySelector('.sqltab-t').textContent;
  tab.title = message ? `${title} — ${message}` : title;
}

/* ---- 넘칠 때: ‹ › 단추 · 흐림 표시 · 끌어서 스크롤 ---- */

/* ‹ › 한 번에 움직일 비율 (탭 줄 너비 기준) */
const PILL_ARROW_SCROLL_RATIO = 0.7;
/* 끌어서 스크롤로 보는 최소 이동 거리(px) — 이보다 적게 움직이면 탭 클릭으로 봄 */
const PILL_DRAG_THRESHOLD = 5;

/* 탭 줄 크기 감시 (처음 쓸 때 만듦 — 파일을 읽는 순간에는 아무것도 실행하지 않는 규칙) */
let pillTabsResizeObserver = null;

/** 탭 줄 크기가 바뀌면(숨어 있던 화면 탭이 보일 때 · 창 크기 변경) ‹ › 를 다시 계산. 같은 요소를 여러 번 넣어도 한 번만 봄 */
function watchPillTabsSize(list) {
  if (!pillTabsResizeObserver) {
    pillTabsResizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) updatePillTabOverflow(entry.target.id.replace('tabs-', ''));
    });
  }
  pillTabsResizeObserver.observe(list);
}

/** 넘치는지 보고 ‹ › 단추(끝까지 갔으면 흐리게)와 양 끝 흐림 표시를 맞춤 */
function updatePillTabOverflow(barId) {
  const list = $('#tabs-' + barId);
  if (!list) return;
  const maxScroll = list.scrollWidth - list.clientWidth;
  const overflowing = maxScroll > 1;
  const atStart = list.scrollLeft <= 1;
  const atEnd = list.scrollLeft >= maxScroll - 1;
  list.parentElement.querySelectorAll('.pilltabs-arrow').forEach(arrow => {
    arrow.hidden = !overflowing;
    arrow.disabled = arrow.dataset.dir === '-1' ? atStart : atEnd;
  });
  list.classList.toggle('fade-l', overflowing && !atStart);
  list.classList.toggle('fade-r', overflowing && !atEnd);
}

/** ‹ › 단추: 탭 줄 너비의 70% 만큼 부드럽게 이동 */
function scrollPillTabs(barId, direction) {
  const list = $('#tabs-' + barId);
  if (list) list.scrollBy({left: direction * list.clientWidth * PILL_ARROW_SCROLL_RATIO, behavior: 'smooth'});
}

/** 끈 뒤에 따라오는 click 한 번을 막음 (끌기가 탭 고르기로 처리되지 않게) */
const swallowNextClick = e => {
  e.stopPropagation();
  e.preventDefault();
};

/**
 * 탭 줄을 마우스로 끌어 스크롤 (넘칠 때만)
 * 조금(PILL_DRAG_THRESHOLD) 이상 움직였을 때만 끌기로 봐서, 살짝 흔들린 클릭은 그대로 탭 고르기가 됩니다.
 */
function startPillTabsDrag(e) {
  const list = e.currentTarget;
  if (e.button !== 0 || list.scrollWidth <= list.clientWidth) return;
  const startX = e.clientX;
  const startScroll = list.scrollLeft;
  let dragging = false;

  const onMove = moveEvent => {
    const distance = moveEvent.clientX - startX;
    if (!dragging && Math.abs(distance) < PILL_DRAG_THRESHOLD) return;
    dragging = true;
    list.classList.add('dragging');
    list.scrollLeft = startScroll - distance;
    moveEvent.preventDefault();
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (!dragging) return;
    list.classList.remove('dragging');
    // 놓은 직후의 click 은 막고, click 이 오지 않는 경우(탭 줄 밖에서 놓음)를 위해 바로 다음 차례에 풀어 둠
    window.addEventListener('click', swallowNextClick, {capture: true, once: true});
    setTimeout(() => window.removeEventListener('click', swallowNextClick, {capture: true}), 0);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/** 탭 줄 위에서 마우스 휠을 굴리면 가로로 움직임 */
function scrollTabsSideways(e) {
  if (!e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // 가로 휠·터치패드는 브라우저에 맡김
  e.currentTarget.scrollLeft += e.deltaY;
  e.preventDefault();
}

/** [▾ 전체]: 탭 줄의 모든 항목을 목록으로 보여 주고 고르면 그 탭으로 */
function showAllPillTabs(barId, button) {
  const items = $$(`#tabs-${barId} .sqltab`).map((tab, i) => [
    `${i + 1}. ${tab.querySelector('.sqltab-t').textContent}`,
    () => activatePillTab(barId, tab.dataset.tabBid),
    '',
    tab.classList.contains('on') ? MENU_ICON.check : ''
  ]);
  showMenuBelow(button, items);
}

/** 탭 고르기 · 삭제 · 추가 — SQL 탭 줄이면 이 파일, 정의서 탭 줄이면 screen-defs.js 로 넘김 */
const activatePillTab = (barId, id) => (isSqlTabBar(barId) ? activateSqlTab(barId, id) : barId === 'entity' ? activateEntityTab(id) : activateDefTab(barId, id));
const deletePillTab = (barId, id) => (isSqlTabBar(barId) ? deleteSqlBlock(barId, id) : barId === 'entity' ? deleteEntity(id) : deleteDefItem(barId, id));
const addPillTab = barId => (isSqlTabBar(barId) ? addSqlBlock(barId) : barId === 'entity' ? addEntity() : addDefItem(barId));

/* ======================= SQL 탭 ======================= */

/** SQL 탭 줄의 블록 요소들 (신규 쪽은 삭제된 원본 블록 보기 #gone-tobe 포함) */
const sqlTabElements = kind => $$(`#blocks-${kind} > .blk${kind === 'tobe' ? ', #gone-tobe > .blk' : ''}`);

/** 고른 탭이 없거나 지워졌으면 첫 탭을 고름 */
function ensureActiveSqlTab(kind) {
  const screen = app.screen;
  const ids = sqlTabElements(kind).map(element => element.dataset.id);
  if (!ids.includes(screen.activeBlock[kind])) screen.activeBlock[kind] = ids[0] || '';
}

/**
 * SQL 탭 줄 다시 그리기 — 블록을 추가·삭제했을 때, 비교할 원본을 바꿨을 때 부름
 * 숨겨 둔 쪽(원본 단계의 신규 · 신규 단계의 원본)도 그려 두지만 보이지 않습니다.
 * 신규 단계의 신규 쪽에는 삭제된 원본 블록 탭이 붙습니다.
 */
function renderSqlTabs(kind) {
  const screen = app.screen;
  const showGone = kind === 'tobe' && isTabLocked('sql');
  if (showGone) renderGoneSqlBlocks();   // 탭 줄보다 먼저 (고른 탭 확인에 씀)
  ensureActiveSqlTab(kind);
  const entries = readBlockInputs(kind).map(({id, title}) => ({id, title}));
  if (showGone) entries.push(...goneSqlBlocks().map(block => goneTabEntry(block.id, block.title)));
  const readOnly = kind === 'asis' && isTabLocked('sql');
  renderPillTabs(kind, entries, {
    activeId: screen.activeBlock[kind],
    removable: !readOnly,
    addLabel: readOnly ? '' : '+ SQL 추가',
    emptyText: `아직 ${LAYER_LABELS[kind]} SQL이 없습니다. 오른쪽 위 [+ SQL 추가]로 넣어 주세요.`
  });
  showActiveSqlBlock(kind);
  refreshSqlTabMarks(kind);
}

/** 고른 탭의 블록만 보이게 하고 탭 모양을 맞춤 */
function showActiveSqlBlock(kind) {
  const activeId = app.screen.activeBlock[kind];
  sqlTabElements(kind).forEach(element => element.classList.toggle('on', element.dataset.id === activeId));
  markActivePillTab(kind, activeId);
}

/** SQL 탭 고르기 — 숨어 있던 편집기는 크기를 다시 계산해야 제대로 그려집니다 */
function activateSqlTab(kind, blockId) {
  const screen = app.screen;
  screen.activeBlock[kind] = blockId;
  showActiveSqlBlock(kind);
  for (const prefixKind of Object.keys(EDITOR_PREFIX)) {
    const editor = screen.editors[editorId(prefixKind, blockId)];
    if (editor) editor.resize(true);
  }
  if (kind === 'tobe') markChangedLines(blockId);
  scrollPillTabIntoView(kind, blockId);
  scheduleChangeMarks();
  renderMiniBar();
}

/**
 * SQL 하나가 등록 이후 바뀌었는지 (탭의 ● 표시)
 * @param {Array} savedRows 마지막 등록 때의 [id, 제목, asisId, SQL 정의·파라미터] 목록 (savedBlockOrder 를 풀어 놓은 것)
 */
function isSqlBlockChanged(kind, blockId, savedRows) {
  const screen = app.screen;
  if (kind === 'asis' && isTabLocked('sql')) return false;
  const saved = savedRows.find(([id]) => id === blockId);
  if (!saved) return true;   // 아직 등록하지 않은 SQL
  const element = $(`#blocks-${kind} .blk[data-id="${blockId}"]`);
  const block = findSqlBlock(kind, blockId) || {};
  if (element.querySelector('.bt').value.trim() !== saved[1]) return true;
  if ((block.asisId ?? null) !== saved[2]) return true;
  if (JSON.stringify(readSqlDefinition(kind, element)) !== JSON.stringify(saved[3])) return true;
  return [editorId(kind, blockId), editorId('rollback', blockId)].some(isEditorChanged);
}

/** SQL 탭 이름(본문 제목칸 값) · ● · 원본 대비 상태(신규 단계의 신규 쪽)를 지금 상태로 — 입력할 때마다 불림(refreshIndicators) */
function refreshSqlTabMarks(kind) {
  if (!$('#tabs-' + kind)) return;
  const savedRows = JSON.parse(app.screen.savedBlockOrder[kind] || '[]');
  const withState = kind === 'tobe' && isTabLocked('sql');
  const asisInputs = withState ? readBlockInputs('asis') : [];
  const states = [];
  readBlockInputs(kind).forEach((input, order) => {
    const state = withState ? sqlBlockStateOf(input, order, asisInputs) : '';
    states.push(state);
    markPillTab(kind, input.id, input.title, isSqlBlockChanged(kind, input.id, savedRows), state);
  });
  if (withState) renderTabStateSummary(kind, [...states, ...goneSqlBlocks().map(() => 'gone')]);
}

/* ======================= SQL 추가 창 ======================= */

/** 추가 창의 SQL 편집기 (처음 한 번만 만듦) */
function getSqlAddEditor() {
  if (!sqlAddEditor) {
    sqlAddEditor = ace.edit($('#saSql'), sqlEditorOptions(false));
    enableSqlAutocomplete(sqlAddEditor);
  }
  return sqlAddEditor;
}

/** '비교할 원본 SQL' 선택 항목: 원본 SQL 목록 + 없음(신규 쿼리, 처음 선택) */
function pairChoicesHtml() {
  const asisOptions = readBlockInputs('asis').map((block, i) => `<option value="${escapeHtml(block.id)}">${i + 1}. ${escapeHtml(block.title)}</option>`);
  return `<option value="${PAIR_SELECT_NONE}" selected>없음 (신규 쿼리)</option>` + asisOptions.join('');
}

/**
 * SQL 추가 창 열기
 * @param {'asis'|'tobe'} kind
 * @returns {Promise<{title: string, sql: string, asisId?: string, logText: string} | null>} 취소하면 null
 */
function askNewSqlBlock(kind) {
  return new Promise(resolve => {
    const modal = $('#sqlAddModal'), nameInput = $('#saName'), logInput = $('#saLog'), error = $('#saErr');
    const editor = getSqlAddEditor();
    $('#saTitle').textContent = 'SQL 추가';
    nameInput.value = '';
    logInput.value = '';
    editor.setOption('fontFamily', codeFontStack);   // 글꼴 설정을 바꿨을 수 있음
    editor.setValue('', -1);
    editor.session.getUndoManager().reset();
    error.hidden = true;
    $('#saPairRow').hidden = kind !== 'tobe' || isNewScreen(app.screen.meta);   // 신규 화면은 고를 원본이 없음 (값은 '없음' 그대로)
    if (kind === 'tobe') $('#saPair').innerHTML = pairChoicesHtml();

    const finish = result => {
      modal.hidden = true;
      $('#saOk').onclick = $('#saCancel').onclick = nameInput.oninput = nameInput.onkeydown = modal.onkeydown = null;
      closeActiveDialog = null;
      resolve(result);
    };
    const showError = (message, target) => {
      error.textContent = message;
      error.hidden = false;
      target.focus();
    };
    // 확인: 이름·SQL 은 필수. 빠졌으면 창을 닫지 않고 알려 줌
    const submit = () => {
      const title = toBlockTitle(nameInput.value.trim());
      const sql = editor.getValue();
      if (!title) return showError('이름을 입력해 주세요.', nameInput);
      if (!sql.trim()) return showError('SQL을 입력해 주세요.', editor);
      const pairValue = $('#saPair').value;
      finish({
        title,
        sql,
        asisId: kind === 'tobe' ? (pairValue === PAIR_SELECT_NONE ? NO_ASIS_PAIR : pairValue) : undefined,
        logText: logInput.value.trim()
      });
    };

    $('#saOk').onclick = submit;
    $('#saCancel').onclick = () => finish(null);
    nameInput.oninput = () => forceUpperCaseTitle(nameInput);   // 이름은 본문 제목칸과 같은 규칙(대문자)
    nameInput.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); editor.focus(); }
    };
    modal.onkeydown = e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    };
    closeActiveDialog = () => finish(null);   // Esc
    modal.hidden = false;
    editor.resize(true);
    nameInput.focus();
  });
}

/** [+ SQL 추가]: 창에서 받은 내용으로 탭을 하나 만들고 그 탭으로 이동 (등록은 저장 바·잠그기에서) */
async function addSqlBlock(kind) {
  const answer = await askNewSqlBlock(kind);
  if (!answer) return;
  const element = insertSqlBlock(kind, {sql: answer.sql, title: answer.title, asisId: answer.asisId, log: userLogOf(answer.logText)});
  refreshPairedBlocks();
  renderSqlTabs(kind);
  activateSqlTab(kind, element.dataset.id);
  refreshIndicators();
}

/* ======================= 항목 이력 (SQL · 정의서 공통) ======================= */

/** 등록할 때 항목 정보에 함께 적을 이력 (없으면 아무것도 적지 않음) */
const blockLogOf = item => (item.log && item.log.length ? {log: item.log} : {});

/** 이력 한 줄의 [시스템] / [사용자] / [화면] 꼬리표 */
const logSourceTagHtml = entry => `<span class="wl-src ${logSourceOf(entry)}">${LOG_SOURCE_LABELS[logSourceOf(entry)]}</span>`;

/* 이력 거르기 단추 — ENTITY 는 여러 화면이 함께 쓰므로 이 화면의 [화면] 이력을 섞지 않음 */
const LOG_FILTERS = ['all', 'user', 'system', 'screen'];
const SHARED_LOG_FILTERS = ['all', 'user', 'system'];
const hasScreenLog = scope => scope !== 'entity';

/**
 * 이력 목록 (최근 것이 위) — 한 항목은 한 줄: [시스템] 신규 생성 2026.10.27 (날짜는 내용 바로 뒤, 연한 색)
 * 그 항목의 이력 + 화면 전체의 이력([화면], screenLogEntries)을 시간순으로 섞어 보여 줍니다.
 * 쓴 사람과 정확한 시각은 줄에 마우스를 올리면 보입니다.
 * @param {'sql'|'def'|'entity'} scope
 */
function logItemsHtml(scope, item) {
  const screenEntries = hasScreenLog(scope) && app.screen ? screenLogEntries(app.screen.meta) : [];
  const entries = [...(item.log || []), ...screenEntries].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!entries.length) return '<li class="muted">아직 남긴 이력이 없습니다.</li>';
  return entries.map(entry => `<li class="src-${logSourceOf(entry)}" title="${escapeHtml(`${formatDateTime(entry.at)} · ${entry.by || '-'}`)}">`
    + logSourceTagHtml(entry)
    + `<span class="wl-t">${escapeHtml(entry.text)} <span class="wl-d">${escapeHtml(formatDay(entry.at))}</span></span></li>`).join('');
}

/** 화면에 있는 그 항목의 이력 목록을 다시 그림 (이력을 남긴 뒤 · 등록 뒤) */
function renderItemLog(scope, kind, item) {
  const list = $(`[data-log-list="${logListKey(scope, kind, item.id)}"]`);
  if (list) list.innerHTML = logItemsHtml(scope, item);
}

/** 화면의 모든 항목 이력 목록을 다시 그림 — 화면 이력([화면])은 모든 목록에 섞여 있어 등록 · 상태 변경 때 함께 바뀜 */
function renderAllItemLogs() {
  const screen = app.screen;
  if (!screen) return;
  for (const kind of ['asis', 'tobe']) screen.blocks[kind].forEach(block => renderItemLog('sql', kind, block));
  for (const tab of Object.keys(DEF_TABS)) (screen.defItems[tab] || []).forEach(item => renderItemLog('def', tab, item));
  (screen.entities || []).forEach(record => renderItemLog('entity', 'entity', record));
}

/** [전체 · 사용자 · 시스템 · 화면]: 목록에서 그 출처만 보이게 (보이기만 바꿈 — CSS .wlog-list[data-filter]) */
function filterItemLog(button) {
  const box = button.closest('.blk-log');
  box.querySelector('.wlog-list').dataset.filter = button.dataset.logFilter;
  box.querySelectorAll('[data-log-filter]').forEach(other => other.classList.toggle('on', other === button));
}

/** 이력 목록 요소를 찾을 때 쓰는 이름 (같은 id 가 SQL·정의서에 함께 있을 수 있어 종류까지 붙임) */
const logListKey = (scope, kind, itemId) => `${scope}-${kind}-${itemId}`;

/**
 * 항목 본문 아래의 이력 영역: 목록 + 입력칸 + [이력 저장]
 * @param {'sql'|'def'} scope SQL 블록 / 정의서 항목
 * @param {string} kind SQL 은 'asis'|'tobe', 정의서는 'service'|'object'|'code'
 */
const itemLogHtml = (scope, kind, item) => `<div class="blk-log">
    <div class="blk-sub wlog-h">${ICON.clock}이력 <span class="muted">최근 것이 위 · 시스템 = 등록할 때 자동 기록${hasScreenLog(scope) ? ' · 화면 = 상태 변경 · 삭제 · 잠금' : ''}</span><span class="sp"></span>
      <span class="wlog-filter" role="group" aria-label="이력 거르기">${(hasScreenLog(scope) ? LOG_FILTERS : SHARED_LOG_FILTERS).map(value =>
        `<button type="button" class="${value === 'all' ? 'on' : ''}" data-log-filter="${value}">${value === 'all' ? '전체' : LOG_SOURCE_LABELS[value]}</button>`).join('')}</span></div>
    <ul class="wlog-list" data-log-list="${logListKey(scope, kind, item.id)}" aria-label="이력">${logItemsHtml(scope, item)}</ul>
    <div class="wlog-in"><textarea data-log-input="${item.id}" data-log-scope="${scope}" data-kind="${kind}" rows="2" aria-label="이력 입력"
      placeholder="예: 조회 조건에 사용 여부 추가 (Ctrl+Enter 로 저장)"></textarea>
      <button type="button" class="btn btn-s btn-primary" data-log-save="${item.id}" data-log-scope="${scope}" data-kind="${kind}">이력 저장</button></div>
  </div>`;

/**
 * 이력을 남길 대상 찾기
 * @returns {{item: object, savedItem: object|undefined, persist: Function}}
 *   item: 화면의 항목 정보, savedItem: 마지막으로 등록된 항목(없으면 아직 등록 전), persist: 등록된 목록을 파일에 쓰기
 */
function findLogTarget(scope, kind, itemId) {
  const screen = app.screen;
  if (scope === 'sql') {
    const savedList = (screen.meta.sqlBlocks && screen.meta.sqlBlocks[kind]) || [];
    return {item: findSqlBlock(kind, itemId), savedItem: savedList.find(saved => saved.id === itemId), persist: saveMeta};
  }
  if (scope === 'entity') {   // 프로젝트 공통 ENTITY — 등록된 목록을 루트 파일에
    return {
      item: findEntity(itemId),
      savedItem: screen.savedEntities.find(record => record.id === itemId),
      persist: () => saveEntities(app.root, screen.savedEntities)
    };
  }
  return {
    item: (screen.defItems[kind] || []).find(item => item.id === itemId),
    savedItem: (screen.savedDefItems[kind] || []).find(item => item.id === itemId),
    persist: () => writeJson(screen.dir, defLayerFile(kind, layerOf(kind)), screen.savedDefItems[kind].map(storedDefItem))
  };
}

/**
 * [이력 저장]: 입력칸 내용을 지금 시각·작업자와 함께 이 항목의 이력에 추가
 *   이미 등록된 항목이면 바로 파일에 저장 (잠긴 기존 SQL 도 이력은 남길 수 있음 — 원본 SQL 은 그대로)
 *   등록 전인 항목이면 화면에만 남기고, 그 항목을 등록할 때 함께 저장
 */
async function saveItemLog(scope, kind, itemId) {
  const {item, savedItem, persist} = findLogTarget(scope, kind, itemId);
  const input = $(`[data-log-input="${itemId}"][data-log-scope="${scope}"][data-kind="${kind}"]`);
  if (!item || !input) return;
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return toast('남길 이력을 입력해 주세요.');
  }
  const entry = {at: new Date().toISOString(), by: currentWorkerName(), text, source: 'user'};
  try {
    if (savedItem) {
      const previousLog = savedItem.log;
      await withBusy('이력을 저장하는 중…', async () => {
        savedItem.log = [...(savedItem.log || []), entry];
        try {
          await persist();
        } catch (error) {
          savedItem.log = previousLog;   // 저장하지 못했으면 화면에도 남기지 않음
          throw error;
        }
      });
    }
    item.log = [...(item.log || []), entry];
    input.value = '';
    renderItemLog(scope, kind, item);
    toast(savedItem ? '이력을 저장했습니다.' : '이력을 남겼습니다. 이 항목을 등록할 때 함께 저장됩니다.');
  } catch (error) {
    toastError('저장 실패', error);
  }
}
