/* ==========================================================================
   screen-defs.js — 정의서 탭 (서비스 · 오브젝트 · 공통코드관리)
     - SQL 탭과 같은 모양: 항목(예: 서비스 하나) = 알약 탭 하나 (탭 줄은 screen-sqltabs.js 의 공통 함수)
       [+ 추가] 창(이름 필수 · 이력 선택), 탭 × 로 삭제, [▾ 전체], 등록하지 않은 변경이 있으면 ●
     - 항목 본문: 이름 + 정의 칸(DEF_TABS[탭].info 가 있는 탭만) + 표 여러 개(DEF_TABS[탭].grids, 열은 GRID_COLUMNS)
       + 이력(screen-sqltabs.js itemLogHtml)
     - 원본 / 신규: 화면에는 그 탭에서 지금 고치는 쪽(layerOf)만 그립니다. 잠금은 탭마다 따로(screen-lock.js)
         원본 단계 → 원본 항목을 고침 / 신규 단계 → 신규 항목을 고침
         신규 단계의 상태 표시 · 원본과 다른 칸 · 삭제된 항목/줄은 screen-changes.js
     - 등록: 저장 바 [등록] → <dir>/asis.json 또는 <dir>/tobe.json (saveDefItems)
     - 읽기와 예전 파일 옮기기: screen-data.js loadDefLayers

   항목 정보 (app.screen)
     defItems[탭]      = 지금 고치는 쪽 항목 [{id, asisId?, title, info, grids, rowIds, log}]
     savedDefItems[탭] = 그 쪽의 마지막 등록 상태 (변경 감지 · 이력 바로 저장용)
     asisDefItems[탭]  = 원본 항목 (신규 단계에서 비교 · 삭제된 항목 표시용)
     정의 칸 · 표의 지금 값은 화면에서 읽습니다(readDefInputs). defItems 의 info · grids 는 처음 그릴 때의 값입니다.
   ========================================================================== */

/* 이름이 비었을 때 탭에 보일 이름 */
const UNNAMED_DEF_TITLE = '(이름 없음)';

/* ======================= 그리기 ======================= */

/** 표 요소 id — 정의서 탭 · 항목 · 표마다 고유 (삭제된 원본 항목 보기는 itemId 앞에 GONE_TAB_PREFIX) */
const defGridTableId = (tab, itemId, key) => `grid-${tab}-${itemId}-${key}`;

/** 지금 고치는 쪽의 항목 정보 */
const findDefItem = (tab, itemId) => (app.screen.defItems[tab] || []).find(item => item.id === itemId);

/**
 * 항목 본문: 정의 칸(있는 탭만) + 표들
 * @param {object} [opt]
 * @param {boolean} [opt.readOnly] 고칠 수 없게 (삭제된 원본 항목 보기)
 * @param {string} [opt.idBase] 표 id 에 쓸 항목 id (기본은 item.id)
 */
function defItemBodyHtml(tab, item, {readOnly = false, idBase = item.id} = {}) {
  const config = defConfigOf(tab);
  const grids = config.grids
    .map(([key, label]) => gridHtml(defGridTableId(tab, idBase, key), `${tab}.${key}`, gridValueOf(item, key), label, readOnly))
    .join('');
  return (config.info ? infoFieldsHtml(config.info, item.info, readOnly) : '')
    + (config.entityLinks ? entityLinksHtml(item, readOnly) : '')   // 저장 서비스의 ENTITY 연결 (screen-entity-links.js)
    + (grids ? `<div class="def-grids">${grids}</div>` : '');
}

/** 항목 하나 (고치는 쪽): 이름 + 본문 + 이력 */
const defItemHtml = (tab, item) => `<div class="blk" data-id="${item.id}">
    <div class="blk-h"><span class="bt-wrap"><input type="text" class="bt def-title" value="${escapeHtml(item.title)}"
      aria-label="${DEF_TABS[tab].label} 이름" placeholder="이름 입력" ${TITLE_VIEW_ATTRS}></span></div>
    ${defItemBodyHtml(tab, item)}
    ${itemLogHtml('def', tab, item)}
  </div>`;

/** 정의서 탭 하나의 내용: 단계 안내 + 탭 줄 + 항목들(고른 항목만 보임) + 삭제된 원본 항목 보기(신규 단계) */
const defPanelHtml = tab => `<div class="panel" data-t="${tab}">${tabPhaseHtml(tab)}${pillTabsBarHtml(tab)}`
  + `<div id="defs-${tab}" class="blocks">${(app.screen.defItems[tab] || []).map(item => defItemHtml(tab, item)).join('')}</div>`
  + `<div id="gone-${tab}" class="blocks"></div></div>`;

/* ======================= 값 · 변경 감지 ======================= */

/**
 * 화면의 항목을 순서대로 읽기 (이름 · 정의 칸 · 표의 지금 값, 빈 칸 · 빈 줄 제외)
 * @returns {{id, asisId?, title, info, grids, rowIds}[]}
 */
function readDefInputs(tab) {
  return $$(`#defs-${tab} > .blk`).map(element => {
    const itemId = element.dataset.id;
    const item = findDefItem(tab, itemId) || {};
    return {
      id: itemId,
      ...(item.asisId !== undefined ? {asisId: item.asisId} : {}),
      ...readDefItemElement(tab, element, itemId),
      ...(defConfigOf(tab).entityLinks ? {entityIds: [...(item.entityIds || [])]} : {})   // 연결은 화면이 아니라 항목 정보에 있음
    };
  });
}

/**
 * 항목 요소 하나의 지금 값 {title, info, grids, rowIds} (빈 칸 · 빈 줄 제외) — 정의서 항목 · ENTITY 가 함께 씀
 * @param {string} idBase 표 id 에 쓴 항목 id (defGridTableId)
 */
function readDefItemElement(tab, element, idBase) {
  const grids = {}, rowIds = {};
  for (const [key] of defConfigOf(tab).grids) {
    const grid = readGridOf(document.getElementById(defGridTableId(tab, idBase, key)));
    grids[key] = grid.rows;
    rowIds[key] = grid.ids;
  }
  return {title: element.querySelector('.def-title').value.trim(), info: readInfoFields(element), grids, rowIds};
}

/**
 * 변경 비교용 문자열 (이력은 빼고 id · 원본 짝 · 이름 · 정의 칸 · 표 · 줄 id)
 * 칸 수를 열 수에 맞추고 앞뒤 공백·빈 줄을 정리해 비교합니다 — 예전 파일에서 옮긴 값처럼 칸 수가 다른 줄도 같은 값이면 같다고 보기 위해서
 */
function defSignature(tab, item) {
  const config = defConfigOf(tab);
  const grids = config.grids.map(([key]) => {
    const columnCount = GRID_COLUMNS[`${tab}.${key}`].cols.length;
    const {rows, ids} = gridValueOf(item, key);
    return rows
      .map((cells, i) => [ids[i], ...Array.from({length: columnCount}, (_, col) => comparableValue(cells[col]))])
      .filter(([, ...cells]) => cells.some(Boolean));
  });
  const info = (config.info || []).map(({key}) => comparableValue((item.info || {})[key]));
  const links = [...(item.entityIds || [])].sort();
  return JSON.stringify([item.id, item.asisId ?? null, item.title, info, grids, links]);
}

/** 정의서 탭에 등록하지 않은 변경이 있는지 (항목 추가·삭제·순서 · 이름 · 정의 칸 · 표) */
function isDefTabChanged(tab) {
  if (!$('#defs-' + tab)) return false;
  const current = readDefInputs(tab).map(item => defSignature(tab, item));
  const saved = (app.screen.savedDefItems[tab] || []).map(item => defSignature(tab, item));
  return JSON.stringify(current) !== JSON.stringify(saved);
}

/** 탭 이름(본문 이름칸 값) · ● · 원본 대비 상태(신규 단계)를 지금 상태로 — 입력할 때마다 불림(refreshIndicators) */
function refreshDefTabMarks(tab) {
  if (!$('#tabs-' + tab)) return;
  const savedById = new Map((app.screen.savedDefItems[tab] || []).map(item => [item.id, defSignature(tab, item)]));
  const states = [];
  for (const item of readDefInputs(tab)) {
    const state = isTabLocked(tab) ? defItemStateOf(tab, item) : '';
    states.push(state);
    markPillTab(tab, item.id, item.title || UNNAMED_DEF_TITLE, savedById.get(item.id) !== defSignature(tab, item), state);
    if (defConfigOf(tab).entityLinks) markPillTabWarning(tab, item.id, serviceNeedsEntity(item) ? '저장 서비스인데 연결된 ENTITY 가 없습니다' : '');
  }
  if (isTabLocked(tab)) renderTabStateSummary(tab, [...states, ...goneDefItems(tab).map(() => 'gone')]);
}

/* ======================= 탭 ======================= */

/** 고른 항목이 없거나 지워졌으면 첫 항목을 고름 (삭제된 원본 항목 탭 포함) */
function ensureActiveDef(tab) {
  const screen = app.screen;
  const ids = $$(`#defs-${tab} > .blk, #gone-${tab} > .blk`).map(element => element.dataset.id);
  if (!ids.includes(screen.activeDef[tab])) screen.activeDef[tab] = ids[0] || '';
}

/** 탭 줄 다시 그리기 — 화면을 그릴 때, 항목을 추가·삭제·되살렸을 때 부름 */
function renderDefTabs(tab) {
  const screen = app.screen;
  const label = DEF_TABS[tab].label;
  if (isTabLocked(tab)) renderGoneDefItems(tab);   // 삭제된 원본 항목 보기 (탭 줄보다 먼저 — 고른 탭 확인에 씀)
  ensureActiveDef(tab);
  const entries = readDefInputs(tab).map(item => ({id: item.id, title: item.title || UNNAMED_DEF_TITLE}));
  if (isTabLocked(tab)) entries.push(...goneDefItems(tab).map(item => goneTabEntry(item.id, item.title || UNNAMED_DEF_TITLE)));
  renderPillTabs(tab, entries, {
    activeId: screen.activeDef[tab],
    removable: true,
    addLabel: `+ ${label} 추가`,
    emptyText: `아직 ${LAYER_LABELS[layerOf(tab)]} ${label} 항목이 없습니다. 오른쪽 위 [+ ${label} 추가]로 넣어 주세요.`
  });
  showActiveDefItem(tab);
  refreshDefTabMarks(tab);
}

/** 고른 항목만 보이게 하고 탭 모양을 맞춤 */
function showActiveDefItem(tab) {
  const activeId = app.screen.activeDef[tab];
  $$(`#defs-${tab} > .blk, #gone-${tab} > .blk`).forEach(element => element.classList.toggle('on', element.dataset.id === activeId));
  markActivePillTab(tab, activeId);
}

/** 항목 탭 고르기 */
function activateDefTab(tab, itemId) {
  app.screen.activeDef[tab] = itemId;
  showActiveDefItem(tab);
  scrollPillTabIntoView(tab, itemId);
  scheduleChangeMarks();
  renderMiniBar();
}

/* ======================= 추가 · 삭제 ======================= */

/**
 * 항목 추가 창 (#defAddModal): 이름(필수) · 꼭 고르는 것(설정의 addChoice — 예: 서비스 유형, ENTITY 구분) · 이력(선택)
 * @returns {Promise<{title: string, choice: string, logText: string} | null>} 취소하면 null. choice 는 addChoice 가 없으면 ''
 */
function askNewDefItem(tab) {
  return new Promise(resolve => {
    const modal = $('#defAddModal'), nameInput = $('#daName'), logInput = $('#daLog'), error = $('#daErr');
    const config = defConfigOf(tab);
    const choice = config.addChoice;
    $('#daTitle').textContent = tab === 'entity' ? 'ENTITY 추가' : `${LAYER_LABELS[layerOf(tab)]} ${config.label} 추가`;
    nameInput.value = '';
    logInput.value = '';
    error.hidden = true;
    // 꼭 고르는 것: 기본값 없이 보여 주어 직접 고르게 함 (예: 저장 서비스를 빠뜨리지 않게)
    $('#daChoiceRow').hidden = !choice;
    if (choice) {
      $('#daChoiceLabel').innerHTML = `${escapeHtml(choice.label)} <em class="req">*</em>`;
      $('#daChoices').innerHTML = choice.options.map(([value, label]) =>
        `<label class="radio"><input type="radio" name="daChoice" value="${escapeHtml(value)}"><span>${escapeHtml(label)}</span></label>`).join('');
    }

    const finish = result => {
      modal.hidden = true;
      $('#daOk').onclick = $('#daCancel').onclick = nameInput.onkeydown = modal.onkeydown = null;
      closeActiveDialog = null;
      resolve(result);
    };
    const submit = () => {
      const title = nameInput.value.trim();
      const picked = $('#daChoices input:checked');
      const showError = (message, target) => {
        error.textContent = message;
        error.hidden = false;
        target.focus();
      };
      if (!title) return showError('이름을 입력해 주세요.', nameInput);
      if (choice && !picked) return showError(`${choice.label}을(를) 골라 주세요.`, $('#daChoices input'));
      finish({title, choice: picked ? picked.value : '', logText: logInput.value.trim()});
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

/**
 * 고치는 쪽 목록 끝에 항목을 넣고 그 탭으로 이동 (추가 · 되살리기가 함께 씀. 등록은 저장 바에서)
 * @param {object} item {id, asisId?, title, info, grids, rowIds, log}
 */
function insertDefItem(tab, item) {
  app.screen.defItems[tab].push(item);
  $('#defs-' + tab).insertAdjacentHTML('beforeend', defItemHtml(tab, item));
  renderDefTabs(tab);
  activateDefTab(tab, item.id);
  refreshIndicators();
}

/** [+ 추가]: 창에서 받은 이름으로 빈 항목을 만듦. 신규 단계에서 만든 항목은 원본이 없는 '신규' */
async function addDefItem(tab) {
  const answer = await askNewDefItem(tab);
  if (!answer) return;
  const choice = defConfigOf(tab).addChoice;
  const item = {
    id: newId('d'),
    ...(isTabLocked(tab) ? {asisId: NO_ASIS_PAIR} : {}),
    title: answer.title,
    info: choice ? {[choice.key]: answer.choice} : {},   // 예: 서비스 유형
    grids: emptyDefGrids(tab),
    rowIds: {},
    ...(defConfigOf(tab).entityLinks ? {entityIds: []} : {}),
    log: userLogOf(answer.logText)
  };
  insertDefItem(tab, item);
  // 정의 칸이 있으면 첫 정의 칸, 없으면 첫 표의 첫 칸으로
  const element = $(`#defs-${tab} > .blk[data-id="${item.id}"]`);
  const firstField = element.querySelector('[data-info]') || element.querySelector('table.grid input');
  if (firstField) firstField.focus();
}

/** 탭 × : 항목 삭제 (등록된 항목이면 다음 등록 때 파일에서도 빠짐). 원본이 있는 신규 항목은 '삭제됨'으로 남음 */
async function deleteDefItem(tab, itemId) {
  const screen = app.screen;
  const element = $(`#defs-${tab} > .blk[data-id="${itemId}"]`);
  if (!element) return;
  const title = element.querySelector('.def-title').value.trim() || UNNAMED_DEF_TITLE;
  const item = findDefItem(tab, itemId) || {};
  const registered = (screen.savedDefItems[tab] || []).some(saved => saved.id === itemId);
  const ok = await askConfirm({
    title: `${DEF_TABS[tab].label} 삭제`,
    desc: `‘${title}’ 항목을 삭제할까요? 이 항목의 표와 이력도 함께 지워집니다.`
      + (registered ? '\n등록하면 저장된 내용에서도 지워집니다.' : '')
      + (item.asisId ? '\n원본은 그대로 남고 ‘삭제됨’으로 표시됩니다. 언제든 되살릴 수 있습니다.' : ''),
    okText: '삭제',
    danger: true
  });
  if (!ok) return;
  DEF_TABS[tab].grids.forEach(([key]) => clearGridPasteUndo(defGridTableId(tab, itemId, key)));
  element.remove();
  screen.defItems[tab] = screen.defItems[tab].filter(other => other.id !== itemId);
  renderDefTabs(tab);   // 지운 탭을 보고 있었으면 첫 탭으로 (원본이 있으면 '삭제됨' 탭이 생김)
  refreshIndicators();
}

/* ======================= 등록 ======================= */

/**
 * 정의서 탭 등록: 화면의 항목(이름 · 정의 칸 · 표) + 이력을 지금 고치는 쪽 파일에 저장 (saveSection 에서 부름)
 *   원본 단계 → <dir>/asis.json, 신규 단계 → <dir>/tobe.json
 * 항목을 모두 지웠어도 빈 목록을 저장합니다 — 그래야 예전 파일을 다시 옮겨 오지 않습니다.
 */
async function saveDefItems(tab) {
  const screen = app.screen;
  const layer = layerOf(tab);
  const inputs = readDefInputs(tab);
  // 시스템 이력: 처음 등록이면 생성, 아니면 바뀐 것 (마지막 등록 상태와 비교 — change-log.js)
  const previousById = new Map((screen.savedDefItems[tab] || []).map(item => [item.id, item]));
  for (const input of inputs) {
    const item = findDefItem(tab, input.id);
    const previous = previousById.get(input.id);
    appendSystemLog(item, previous ? defChangeLogText(tab, previous, input) : creationLogText(item, layer));
  }
  const items = inputs.map(input => ({...input, log: (findDefItem(tab, input.id) || {}).log || []}));
  await writeJson(screen.dir, defLayerFile(tab, layer), items.map(storedDefItem));
  // 지운 항목은 항목 이력이 함께 사라지므로 화면 이력에 남김
  const removed = [...previousById.values()].filter(previous => !inputs.some(input => input.id === previous.id));
  for (const item of removed) addActivityLog(screen.meta, `${LAYER_LABELS[layer]} ${DEF_TABS[tab].label} ‘${item.title || UNNAMED_DEF_TITLE}’ 삭제`);
  if (removed.length) await saveMeta();
  screen.savedDefItems[tab] = JSON.parse(JSON.stringify(items));
}
