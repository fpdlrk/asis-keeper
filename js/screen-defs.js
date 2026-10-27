/* ==========================================================================
   screen-defs.js — 정의서 탭 (서비스 · 오브젝트 · 공통코드관리)
     - SQL 탭과 같은 모양: 항목(예: 서비스 하나) = 알약 탭 하나 (탭 줄은 screen-sqltabs.js 의 공통 함수)
       [+ 추가] 창(이름 필수 · 이력 선택), 탭 × 로 삭제, [▾ 전체], 등록하지 않은 변경이 있으면 ●
     - 항목 본문: 이름 + 정의 칸(DEF_TABS[탭].info 가 있는 탭만 — 공통코드관리) + 표 여러 개(DEF_TABS[탭].grids, 열은 GRID_COLUMNS)
       + 이력(screen-sqltabs.js itemLogHtml)
       표는 SQL 처럼 여러 칸·여러 줄 붙여넣기, Ctrl+Z / Ctrl+Y 가 됩니다(screen-save.js).
     - 등록: 저장 바 [등록] → <탭>/items.json (saveDefItems)
     - 읽기와 예전 파일(글 입력란·개요 표) 옮기기: screen-data.js loadDefItems

   항목 정보: app.screen.defItems[탭] = [{id, title, info, grids, log}]
     정의 칸 · 표의 지금 값은 화면에서 읽습니다(readDefInputs). info · grids 는 처음 그릴 때의 값입니다.
   ========================================================================== */

/* 이름이 비었을 때 탭에 보일 이름 */
const UNNAMED_DEF_TITLE = '(이름 없음)';

/* ======================= 그리기 ======================= */

/** 표 요소 id — 정의서 탭 · 항목 · 표마다 고유 */
const defGridTableId = (tab, itemId, gridKey) => `grid-${tab}-${itemId}-${gridKey}`;

/** 항목 하나의 본문: 이름 + 정의 칸(있는 탭만) + 표들 + 이력 */
function defItemHtml(tab, item) {
  const infoFields = DEF_TABS[tab].info;
  const grids = DEF_TABS[tab].grids.map(([key, label]) => gridHtml(defGridTableId(tab, item.id, key), `${tab}.${key}`, item.grids[key], label)).join('');
  return `<div class="blk" data-id="${item.id}">
    <div class="blk-h"><span class="bt-wrap"><input type="text" class="bt def-title" value="${escapeHtml(item.title)}"
      aria-label="${DEF_TABS[tab].label} 이름" placeholder="이름 입력"></span></div>
    ${infoFields ? infoFieldsHtml(infoFields, item.info) : ''}
    <div class="def-grids">${grids}</div>
    ${itemLogHtml('def', tab, item)}
  </div>`;
}

/** 정의서 탭 하나의 내용: 탭 줄 + 항목들 (고른 항목만 보임) */
const defPanelHtml = tab => `<div class="panel" data-t="${tab}">${pillTabsBarHtml(tab)}`
  + `<div id="defs-${tab}" class="blocks">${(app.screen.defItems[tab] || []).map(item => defItemHtml(tab, item)).join('')}</div></div>`;

/* ======================= 값 · 변경 감지 ======================= */

/**
 * 화면의 항목을 순서대로 읽기 (이름 · 정의 칸 · 표의 지금 값, 빈 칸 · 빈 줄 제외)
 * @returns {{id: string, title: string, info: object, grids: object}[]}
 */
function readDefInputs(tab) {
  return $$(`#defs-${tab} > .blk`).map(element => {
    const itemId = element.dataset.id;
    const grids = Object.fromEntries(DEF_TABS[tab].grids.map(([key]) =>
      [key, readGridRowsOf(document.getElementById(defGridTableId(tab, itemId, key)))]));
    return {id: itemId, title: element.querySelector('.def-title').value.trim(), info: readInfoFields(element), grids};
  });
}

/**
 * 변경 비교용 문자열 (이력은 빼고 id · 이름 · 정의 칸 · 표)
 * 칸 수를 열 수에 맞추고 앞뒤 공백·빈 줄을 정리해 비교합니다 — 예전 파일에서 옮긴 값처럼 칸 수가 다른 줄도 같은 값이면 같다고 보기 위해서
 */
function defSignature(tab, item) {
  const grids = DEF_TABS[tab].grids.map(([key]) => {
    const columnCount = GRID_COLUMNS[`${tab}.${key}`].cols.length;
    return (item.grids[key] || [])
      .map(cells => Array.from({length: columnCount}, (_, i) => String(cells[i] ?? '').trim()))
      .filter(cells => cells.some(Boolean));
  });
  const info = (DEF_TABS[tab].info || []).map(({key}) => String((item.info || {})[key] ?? '').trim());
  return JSON.stringify([item.id, item.title, info, grids]);
}

/** 정의서 탭에 등록하지 않은 변경이 있는지 (항목 추가·삭제·순서 · 이름 · 정의 칸 · 표) */
function isDefTabChanged(tab) {
  if (!$('#defs-' + tab)) return false;
  const current = readDefInputs(tab).map(item => defSignature(tab, item));
  const saved = (app.screen.savedDefItems[tab] || []).map(item => defSignature(tab, item));
  return JSON.stringify(current) !== JSON.stringify(saved);
}

/** 탭 이름(본문 이름칸 값)과 ● 표시를 지금 상태로 — 입력할 때마다 불림(refreshIndicators) */
function refreshDefTabMarks(tab) {
  if (!$('#tabs-' + tab)) return;
  const savedById = new Map((app.screen.savedDefItems[tab] || []).map(item => [item.id, defSignature(tab, item)]));
  for (const item of readDefInputs(tab)) {
    markPillTab(tab, item.id, item.title || UNNAMED_DEF_TITLE, savedById.get(item.id) !== defSignature(tab, item));
  }
}

/* ======================= 탭 ======================= */

/** 고른 항목이 없거나 지워졌으면 첫 항목을 고름 */
function ensureActiveDef(tab) {
  const screen = app.screen;
  const itemIds = $$(`#defs-${tab} > .blk`).map(element => element.dataset.id);
  if (!itemIds.includes(screen.activeDef[tab])) screen.activeDef[tab] = itemIds[0] || '';
}

/** 탭 줄 다시 그리기 — 화면을 그릴 때, 항목을 추가·삭제했을 때 부름 */
function renderDefTabs(tab) {
  const screen = app.screen;
  const label = DEF_TABS[tab].label;
  ensureActiveDef(tab);
  const entries = readDefInputs(tab).map(item => ({id: item.id, title: item.title || UNNAMED_DEF_TITLE}));
  renderPillTabs(tab, entries, {
    activeId: screen.activeDef[tab],
    removable: true,
    addLabel: `+ ${label} 추가`,
    emptyText: `아직 ${label} 항목이 없습니다. 오른쪽 위 [+ ${label} 추가]로 넣어 주세요.`
  });
  showActiveDefItem(tab);
  refreshDefTabMarks(tab);
}

/** 고른 항목만 보이게 하고 탭 모양을 맞춤 */
function showActiveDefItem(tab) {
  const activeId = app.screen.activeDef[tab];
  $$(`#defs-${tab} > .blk`).forEach(element => element.classList.toggle('on', element.dataset.id === activeId));
  markActivePillTab(tab, activeId);
}

/** 항목 탭 고르기 */
function activateDefTab(tab, itemId) {
  app.screen.activeDef[tab] = itemId;
  showActiveDefItem(tab);
  scrollPillTabIntoView(tab, itemId);
  renderMiniBar();
}

/* ======================= 추가 · 삭제 ======================= */

/**
 * 항목 추가 창 (#defAddModal): 이름(필수) · 이력(선택)
 * @returns {Promise<{title: string, logText: string} | null>} 취소하면 null
 */
function askNewDefItem(tab) {
  return new Promise(resolve => {
    const modal = $('#defAddModal'), nameInput = $('#daName'), logInput = $('#daLog'), error = $('#daErr');
    $('#daTitle').textContent = `${DEF_TABS[tab].label} 추가`;
    nameInput.value = '';
    logInput.value = '';
    error.hidden = true;

    const finish = result => {
      modal.hidden = true;
      $('#daOk').onclick = $('#daCancel').onclick = nameInput.onkeydown = modal.onkeydown = null;
      closeActiveDialog = null;
      resolve(result);
    };
    const submit = () => {
      const title = nameInput.value.trim();
      if (!title) {
        error.textContent = '이름을 입력해 주세요.';
        error.hidden = false;
        nameInput.focus();
        return;
      }
      finish({title, logText: logInput.value.trim()});
    };

    $('#daOk').onclick = submit;
    $('#daCancel').onclick = () => finish(null);
    nameInput.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    };
    modal.onkeydown = e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    };
    closeActiveDialog = () => finish(null);   // Esc
    modal.hidden = false;
    nameInput.focus();
  });
}

/** [+ 추가]: 창에서 받은 이름으로 빈 표를 가진 항목을 만들고 그 탭으로 이동 (등록은 저장 바에서) */
async function addDefItem(tab) {
  const answer = await askNewDefItem(tab);
  if (!answer) return;
  const screen = app.screen;
  const log = answer.logText ? [{at: new Date().toISOString(), by: currentWorkerName(), text: answer.logText}] : [];
  const item = {id: newBlockId(), title: answer.title, info: {}, grids: emptyDefGrids(tab), log};
  screen.defItems[tab].push(item);
  $('#defs-' + tab).insertAdjacentHTML('beforeend', defItemHtml(tab, item));
  renderDefTabs(tab);
  activateDefTab(tab, item.id);
  refreshIndicators();
  // 정의 칸이 있으면 첫 정의 칸, 없으면 첫 표의 첫 칸으로
  const firstCell = $(`#defs-${tab} > .blk[data-id="${item.id}"] [data-info]`) || $(`#${defGridTableId(tab, item.id, DEF_TABS[tab].grids[0][0])} input`);
  if (firstCell) firstCell.focus();
}

/** 탭 × : 항목 삭제 (등록된 항목이면 다음 등록 때 파일에서도 빠짐) */
async function deleteDefItem(tab, itemId) {
  const screen = app.screen;
  const element = $(`#defs-${tab} > .blk[data-id="${itemId}"]`);
  if (!element) return;
  const title = element.querySelector('.def-title').value.trim() || UNNAMED_DEF_TITLE;
  const registered = (screen.savedDefItems[tab] || []).some(item => item.id === itemId);
  const ok = await askConfirm({
    title: `${DEF_TABS[tab].label} 삭제`,
    desc: `‘${title}’ 항목을 삭제할까요? 이 항목의 표와 이력도 함께 지워집니다.`
      + (registered ? '\n등록하면 저장된 내용에서도 지워집니다.' : ''),
    okText: '삭제',
    danger: true
  });
  if (!ok) return;
  DEF_TABS[tab].grids.forEach(([key]) => clearGridPasteUndo(defGridTableId(tab, itemId, key)));
  element.remove();
  screen.defItems[tab] = screen.defItems[tab].filter(item => item.id !== itemId);
  renderDefTabs(tab);   // 지운 탭을 보고 있었으면 첫 탭으로
  refreshIndicators();
}

/* ======================= 등록 ======================= */

/**
 * 정의서 탭 등록: 화면의 항목(이름 · 정의 칸 · 표) + 이력을 <탭>/items.json 에 저장 (saveSection 에서 부름)
 * 항목을 모두 지웠어도 빈 목록을 저장합니다 — 그래야 예전 파일을 다시 옮겨 오지 않습니다.
 */
async function saveDefItems(tab) {
  const screen = app.screen;
  const items = readDefInputs(tab).map(input => {
    const item = screen.defItems[tab].find(other => other.id === input.id) || {};
    const info = Object.keys(input.info).length ? {info: input.info} : {};
    return {id: input.id, title: input.title, ...info, grids: input.grids, ...blockLogOf(item)};
  });
  await writeJson(screen.dir, DEF_TABS[tab].file, items);
  screen.savedDefItems[tab] = JSON.parse(JSON.stringify(items));
}
