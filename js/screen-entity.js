/* ==========================================================================
   screen-entity.js — ENTITY 탭 (프로젝트 공통 ENTITY 를 화면에서 보고 고침)
     - 데이터는 화면 폴더가 아니라 루트의 ENTITY_FILE 한 곳 (entity-data.js) — 여기서 고치면 이 ENTITY 를 쓰는 모든 화면에 반영
     - 모양은 정의서 탭과 같음: ENTITY 하나 = 알약 탭 하나, 본문 = 이름 + 정의 칸 + 표(ENTITY_DEF) + 이력
     - 원본 잠금은 ENTITY 마다: 본문 위 안내 띠의 [원본 등록 후 잠그기] / [잠금 풀기]
         원본 단계 → 원본을 고침 / 잠근 뒤 → 신규를 고치고 원본과 다른 곳을 표시 / 원본 없는 새 ENTITY → 처음부터 신규
     - 보기: [전체](처음) · [이 화면 서비스가 쓰는 것](이 화면 서비스가 연결한 ENTITY)
     - [사용하는 서비스]: 프로젝트에서 이 ENTITY 를 쓰는 서비스 목록 → 누르면 그 화면의 그 서비스로
     - 삭제: 쓰는 서비스가 있으면 막음
     - 등록: 저장 바 [등록] (영역 'entity') → saveEntityTab

   화면 상태 (app.screen)
     entities      : ENTITY 목록 (entity-data.js 의 모양, 고치는 쪽 내용은 화면에서 읽어 등록할 때 넣음)
     savedEntities : 마지막 등록 상태 (변경 감지 · 시스템 이력 비교용)
     entityFilter  : 'all'(처음) | 'used'
   ========================================================================== */

/* 보기 이름 (단추에는 뒤에 개수가 붙음) · 마우스를 올리면 보이는 설명 */
const ENTITY_FILTER_LABELS = {all: '전체', used: '이 화면 서비스가 쓰는 것'};
const ENTITY_FILTER_HINTS = {
  all: '프로젝트의 모든 ENTITY 를 봅니다',
  used: '이 화면의 저장 서비스에 [+ ENTITY 연결]로 연결한 ENTITY 만 봅니다'
};

/** 열린 화면의 ENTITY 찾기 */
const findEntity = id => app.screen.entities.find(record => record.id === id);

/** 이 화면의 서비스가 쓰는 ENTITY id (등록 전 연결 포함) */
const usedEntityIds = () => new Set((app.screen.defItems.service || []).flatMap(item => item.entityIds || []));

/** 빈 내용 (이름만) */
const emptyEntityLayer = title => ({title, info: {}, grids: emptyDefGrids('entity'), rowIds: {}});

/* ======================= 그리기 ======================= */

/** ENTITY 본문 위 안내 띠: 원본 없음 / 원본 잠김 + [잠금 풀기] / 원본 단계 + [원본 등록 후 잠그기] */
function entityPhaseHtml(record) {
  const id = escapeHtml(record.id);
  if (!record.asis) {
    return `<div class="banner new-note">${ICON.info}<b>원본 없는 새 ENTITY</b><span class="muted">처음부터 신규로 만든 ENTITY 입니다.</span></div>`;
  }
  if (record.locked) {
    return `<div class="banner note">${ICON.info}<b>원본 잠김 · 신규 작업 중</b>`
      + `<span class="muted">${escapeHtml(record.savedAt)} 등록. 원본과 다른 곳은 색으로 표시됩니다.</span><span data-entity-hash="${id}"></span><span class="sp"></span>`
      + `<button type="button" class="btn btn-s" data-entity-unlock="${id}" title="사유를 남기면 이 ENTITY 의 원본을 다시 고칠 수 있습니다">${ICON.unlock}잠금 풀기</button></div>`;
  }
  const reopened = record.unlockLog.length > 0;
  return `<div class="banner pre-lock">${ICON.info}<b>${reopened ? '잠금이 풀려 있습니다 · 원본 수정 중' : '원본 단계'}</b>`
    + `<span class="muted">${reopened ? '원본을 고친 뒤 다시 잠가 주세요. 신규 작업 내용은 그대로 보관되어 있습니다.' : '이 ENTITY 의 원본을 넣고 잠그세요. 잠근 뒤부터 신규 작업을 합니다.'}</span><span class="sp"></span>`
    + `<button type="button" class="btn btn-s btn-primary" data-entity-lock="${id}">${reopened ? '고친 원본 다시 잠그기' : '원본 등록 후 잠그기'}</button></div>`;
}

/** ENTITY 하나: 이름 + [사용하는 서비스] + 안내 띠 + 사용 목록 자리 + 본문(지금 고치는 쪽) + 이력 */
function entityItemHtml(record) {
  const layer = entityLayerOf(record);
  const data = record[layer] || emptyEntityLayer('');
  const id = escapeHtml(record.id);
  return `<div class="blk" data-id="${id}" data-layer="${layer}">
    <div class="blk-h"><span class="bt-wrap"><input type="text" class="bt def-title" value="${escapeHtml(data.title)}"
      aria-label="ENTITY 이름" placeholder="이름 입력" ${TITLE_VIEW_ATTRS}></span><span class="sp"></span>
      <button type="button" class="btn btn-s" data-entity-usage="${id}">사용하는 서비스</button></div>
    <div class="ent-phase">${entityPhaseHtml(record)}</div>
    <div class="ent-usage" data-usage-for="${id}"></div>
    ${defItemBodyHtml('entity', data, {idBase: record.id})}
    ${itemLogHtml('entity', 'entity', record)}
  </div>`;
}

/** ENTITY 탭 안쪽: 안내(프로젝트 공통 · 보기) + 탭 줄 + ENTITY 들 */
function entityPanelInnerHtml() {
  const filter = app.screen.entityFilter;
  const filterButtons = Object.entries(ENTITY_FILTER_LABELS)
    .map(([value, label]) => `<button type="button" class="${value === filter ? 'on' : ''}" data-entity-filter="${value}" title="${ENTITY_FILTER_HINTS[value]}">${label}</button>`).join('');
  return `<div class="phase"><div class="banner note">${ICON.info}<b>프로젝트 공통 ENTITY</b>`
    + `<span class="muted">여기서 고치면 이 ENTITY 를 쓰는 모든 화면에 반영됩니다. 원본은 ENTITY 마다 따로 잠급니다.</span><span class="sp"></span>`
    + `<span class="seg" role="group" aria-label="보기">${filterButtons}</span></div></div>`
    + pillTabsBarHtml('entity')
    + `<div id="defs-entity" class="blocks">${app.screen.entities.map(entityItemHtml).join('')}</div>`;
}

/** ENTITY 탭 (화면을 그릴 때) */
const entityPanelHtml = () => `<div class="panel" data-t="entity">${entityPanelInnerHtml()}</div>`;

/** ENTITY 탭만 다시 그리기 (잠그기 · 풀기 뒤 — 고치는 쪽이 바뀜. 부르기 전에 등록을 마쳐야 함) */
function rerenderEntityPanel() {
  const panel = $('.panel[data-t="entity"]');
  panel.innerHTML = entityPanelInnerHtml();
  renderEntityTabs();
  verifyEntityHashes();
}

/** 잠긴 ENTITY 마다 원본이 잠글 때와 같은지 표시 */
async function verifyEntityHashes() {
  for (const record of app.screen.entities) {
    const badge = $(`[data-entity-hash="${record.id}"]`);
    if (!badge || !record.hash) continue;
    const changed = await isEntityOriginalChanged(record);
    badge.innerHTML = changed ? `<span class="tag bad">${ICON.warn}원본 변경 감지</span>` : `<span class="tag ok">${ICON.check}원본 변경 없음</span>`;
  }
}

/* ======================= 값 · 변경 감지 ======================= */

/** 화면의 ENTITY 를 순서대로 읽기 {id, layer(고치는 쪽), data: {title, info, grids, rowIds}} */
const readEntityInputs = () => $$('#defs-entity > .blk')
  .map(element => ({id: element.dataset.id, layer: element.dataset.layer, data: readDefItemElement('entity', element, element.dataset.id)}));

/** 변경 비교용 문자열 (고치는 쪽 + 내용) */
const entitySignature = (id, layer, data) => JSON.stringify([layer, defSignature('entity', {...data, id})]);

/** 마지막 등록 상태의 비교용 문자열 {id → 문자열} */
const savedEntitySignatures = () => new Map(app.screen.savedEntities.map(record => {
  const layer = entityLayerOf(record);
  return [record.id, entitySignature(record.id, layer, record[layer] || emptyEntityLayer(''))];
}));

/** ENTITY 탭에 등록하지 않은 변경이 있는지 (추가 · 삭제 · 순서 · 이름 · 정의 칸 · 표) */
function isEntityTabChanged() {
  if (!$('#defs-entity')) return false;
  const current = readEntityInputs().map(({id, layer, data}) => [id, entitySignature(id, layer, data)]);
  const saved = [...savedEntitySignatures()];
  return JSON.stringify(current) !== JSON.stringify(saved);
}

/** 원본 대비 상태: 잠김 → 동일/변경, 원본 없음 → 신규, 원본 단계 → 표시 없음 */
function entityStateOf(record, data) {
  if (!record.asis) return 'new';
  return record.locked ? diffDefItem('entity', record.asis, data).state : '';
}

/** 탭 이름 · ● · 상태를 지금 상태로 — 입력할 때마다 불림(refreshIndicators) */
function refreshEntityTabMarks() {
  if (!$('#tabs-entity')) return;
  const saved = savedEntitySignatures();
  for (const {id, layer, data} of readEntityInputs()) {
    markPillTab('entity', id, data.title || UNNAMED_DEF_TITLE, saved.get(id) !== entitySignature(id, layer, data), entityStateOf(findEntity(id), data));
  }
}

/* ======================= 탭 · 보기 ======================= */

/** 지금 보기에서 보이는 ENTITY id */
function visibleEntityIds() {
  const all = app.screen.entities.map(record => record.id);
  if (app.screen.entityFilter === 'all') return new Set(all);
  const used = usedEntityIds();
  return new Set(all.filter(id => used.has(id)));
}

/** 탭 줄 다시 그리기 — 화면을 그릴 때, 추가 · 삭제 · 연결이 바뀔 때 · 보기를 바꿀 때 */
function renderEntityTabs() {
  const screen = app.screen;
  const visible = visibleEntityIds();
  const inputs = readEntityInputs().filter(({id}) => visible.has(id));
  if (!inputs.some(({id}) => id === screen.activeDef.entity)) screen.activeDef.entity = inputs.length ? inputs[0].id : '';
  renderPillTabs('entity', inputs.map(({id, data}) => ({id, title: data.title || UNNAMED_DEF_TITLE})), {
    activeId: screen.activeDef.entity,
    removable: true,
    addLabel: '+ ENTITY 추가',
    emptyText: entityEmptyText(),
    emptyAction: screen.entityFilter === 'used' && screen.entities.length ? {label: '전체 보기', data: {'entity-filter': 'all'}} : null
  });
  renderEntityFilterCounts();
  showActiveEntity();
  refreshEntityTabMarks();
}

/** 보이는 ENTITY 가 없을 때 안내 — 보기 · 저장 서비스가 있는지에 따라 */
function entityEmptyText() {
  if (app.screen.entityFilter !== 'used') return '아직 ENTITY 가 없습니다. 오른쪽 위 [+ ENTITY 추가]로 넣어 주세요.';
  const hasSaveService = readDefInputs('service').some(item => comparableValue((item.info || {}).serviceType) === SERVICE_TYPE_SAVE);
  return hasSaveService
    ? '이 화면의 저장 서비스에 연결한 ENTITY 가 없습니다. 서비스 탭에서 [+ ENTITY 연결]로 연결하면 여기에 보입니다.'
    : '이 화면에는 저장 서비스가 없어 쓰는 ENTITY 가 없습니다.';
}

/** 보기 단추 글자에 개수 붙이기 — [전체 12] [이 화면 서비스가 쓰는 것 3] (연결이 바뀌면 renderEntityTabs 가 다시 부름) */
function renderEntityFilterCounts() {
  const all = app.screen.entities.map(record => record.id);
  const used = usedEntityIds();
  const counts = {all: all.length, used: all.filter(id => used.has(id)).length};
  $$('[data-entity-filter]').forEach(button => {
    if (button.closest('.seg')) button.textContent = `${ENTITY_FILTER_LABELS[button.dataset.entityFilter]} ${counts[button.dataset.entityFilter]}`;
  });
}

/** 고른 ENTITY 만 보이게 */
function showActiveEntity() {
  const activeId = app.screen.activeDef.entity;
  $$('#defs-entity > .blk').forEach(element => element.classList.toggle('on', element.dataset.id === activeId));
  markActivePillTab('entity', activeId);
}

/** ENTITY 탭 고르기 (지금 보기에서 안 보이는 ENTITY 면 [전체]로 바꿈) */
function activateEntityTab(id) {
  const screen = app.screen;
  if (!visibleEntityIds().has(id)) {
    screen.entityFilter = 'all';
    $$('[data-entity-filter]').forEach(button => button.classList.toggle('on', button.dataset.entityFilter === 'all'));
    screen.activeDef.entity = id;
    renderEntityTabs();
  }
  screen.activeDef.entity = id;
  showActiveEntity();
  scrollPillTabIntoView('entity', id);
  scheduleChangeMarks();
  renderMiniBar();
}

/** 보기 바꾸기 ([이 화면 서비스가 쓰는 것] / [전체]) */
function setEntityFilter(value) {
  app.screen.entityFilter = value;
  $$('[data-entity-filter]').forEach(button => button.classList.toggle('on', button.dataset.entityFilter === value));
  renderEntityTabs();
}

/** 고른 ENTITY 의 원본 대비 표시 (잠긴 ENTITY 만 — 이름 · 정의 칸 · 표) */
function markActiveEntity() {
  const id = app.screen.activeDef.entity;
  const element = $(`#defs-entity > .blk[data-id="${id}"]`);
  const record = element && findEntity(id);
  if (!record) return;
  const original = record.locked ? record.asis : null;
  applyTitleMark(element.querySelector('.def-title'), original ? original.title : null);
  applyInfoMarks(element, original ? original.info : null);
  for (const [key] of ENTITY_DEF.grids) {
    applyGridMarks(document.getElementById(defGridTableId('entity', id, key)), original ? gridValueOf(original, key) : null);
  }
}

/* ======================= 추가 · 삭제 ======================= */

/**
 * [+ ENTITY 추가]: 이름 · 구분(기존 ENTITY 는 원본부터 / 새 ENTITY 는 원본 없음) · 이력을 받아 만듦 (등록은 저장 바에서)
 * @param {object} [opt]
 * @param {boolean} [opt.activate] true = ENTITY 탭으로 가서 그 ENTITY 를 보여 줌 (서비스에서 만들 때는 false — 서비스 화면에 머묾)
 * @returns {Promise<string|null>} 만든 ENTITY id, 취소하면 null
 */
async function addEntity({activate = true} = {}) {
  const answer = await askNewDefItem('entity');
  if (!answer) return null;
  const layer = emptyEntityLayer(answer.title);
  const isOriginal = answer.choice === 'original';
  const record = {id: newId('e'), asis: isOriginal ? layer : null, tobe: isOriginal ? null : layer,
    locked: false, savedAt: '', hash: '', unlockLog: [], log: userLogOf(answer.logText)};
  app.screen.entities.push(record);
  $('#defs-entity').insertAdjacentHTML('beforeend', entityItemHtml(record));
  if (activate) {
    showTab('entity');
    activateEntityTab(record.id);
  } else {
    renderEntityTabs();
  }
  refreshIndicators();
  return record.id;
}

/**
 * 탭 × : ENTITY 삭제 — 쓰는 서비스가 있으면 막음 (이 화면은 등록 전 연결 포함, 다른 화면은 등록된 내용)
 * 지우면 모든 화면에서 사라지므로 강하게 확인합니다. 파일에서는 다음 [등록] 때 빠짐
 */
async function deleteEntity(id) {
  const screen = app.screen;
  const element = $(`#defs-entity > .blk[data-id="${id}"]`);
  const record = findEntity(id);
  if (!element || !record) return;
  const title = element.querySelector('.def-title').value.trim() || UNNAMED_DEF_TITLE;
  let usages;
  try {
    usages = (await withBusy('이 ENTITY 를 쓰는 서비스를 찾는 중…', () => findEntityUsages(app.root, id)))
      .filter(usage => !isSamePath(usage.path, screen.path));   // 이 화면은 화면의 값(등록 전 연결 포함)으로 봄
  } catch (error) {
    return toastError('확인 실패', error);
  }
  const where = [...(usedEntityIds().has(id) ? ['이 화면의 서비스'] : []), ...usages.map(usage => [...usage.path, usage.title].join(' › '))];
  if (where.length) {
    return askConfirm({
      title: '삭제할 수 없습니다',
      desc: `‘${title}’ ENTITY 를 쓰는 서비스가 있습니다. 먼저 서비스에서 연결을 풀어 주세요.\n\n`
        + where.slice(0, 10).join('\n') + (where.length > 10 ? `\n외 ${where.length - 10}곳` : ''),
      okText: '확인',
      noCancel: true
    });
  }
  const ok = await askConfirm({
    title: 'ENTITY 삭제',
    desc: `‘${title}’ ENTITY 를 삭제할까요?\n프로젝트 공통이라 모든 화면에서 사라집니다.`
      + (record.asis ? '\n원본 · 신규 · 이력이 모두 지워집니다.' : '\n신규 내용과 이력이 모두 지워집니다.')
      + '\n등록하면 되돌릴 수 없습니다.',
    okText: '삭제',
    danger: true
  });
  if (!ok) return;
  ENTITY_DEF.grids.forEach(([key]) => clearGridPasteUndo(defGridTableId('entity', id, key)));
  element.remove();
  screen.entities = screen.entities.filter(other => other.id !== id);
  renderEntityTabs();
  refreshIndicators();
}

/* ======================= 등록 ======================= */

/**
 * ENTITY 탭 등록 (저장 바 — 영역 'entity'): 화면의 내용을 고치는 쪽에 넣고 프로젝트 ENTITY 파일에 저장
 * 시스템 이력: 처음 등록이면 생성(원본 단계 '원본 등록', 원본 없는 새 ENTITY '신규 생성'), 아니면 바뀐 것
 * 지운 ENTITY 는 이 화면의 화면 이력에 남김
 */
async function saveEntityTab() {
  const screen = app.screen;
  const savedById = new Map(screen.savedEntities.map(record => [record.id, record]));
  const inputs = readEntityInputs();
  for (const {id, layer, data} of inputs) {
    const record = findEntity(id);
    const previous = savedById.get(id);
    const previousLayer = previous && previous[layer];
    appendSystemLog(record, previousLayer ? defChangeLogText('entity', previousLayer, data) : creationLogText(record, layer, true));
    record[layer] = data;
  }
  screen.entities = inputs.map(({id}) => findEntity(id));
  const removed = screen.savedEntities.filter(record => !inputs.some(input => input.id === record.id));
  for (const record of removed) addActivityLog(screen.meta, `ENTITY ‘${entityRecordTitle(record)}’ 삭제`);
  if (removed.length) await saveMeta();
  await saveEntities(app.root, screen.entities);
  screen.savedEntities = JSON.parse(JSON.stringify(screen.entities));
}

/* ======================= 잠그기 · 잠금 풀기 (ENTITY 마다) ======================= */

/** 등록하지 않은 변경이 있으면 먼저 등록할지 묻고 등록 (잠그기 · 풀기는 ENTITY 탭을 다시 그리므로) */
async function saveBeforeEntityLockChange() {
  if (!hasUnsavedChanges()) return true;
  const ok = await askConfirm({title: '등록하지 않은 변경이 있습니다', desc: '계속하기 전에 지금 변경을 먼저 등록합니다. 계속할까요?', okText: '등록하고 계속'});
  return ok && saveDirtySections();
}

/** ENTITY 원본 잠그기 — 처음이면 원본을 신규로 복사, 해시 기록 */
async function lockEntity(id) {
  const record = findEntity(id);
  if (!record || !record.asis) return;
  const reopened = record.unlockLog.length > 0;
  const ok = await askConfirm({
    title: `ENTITY ${reopened ? '고친 원본 다시 잠그기' : '원본 등록 후 잠그기'}`,
    desc: (reopened ? '다시 잠그면 지금 원본이 새 기준이 되고, 고칠 수 없습니다.' : '이 ENTITY 의 원본을 잠급니다. 잠근 뒤에는 원본을 고칠 수 없고, 원본을 복사한 신규를 고칩니다.')
      + '\n등록하지 않은 변경도 함께 등록됩니다. 계속할까요?',
    okText: reopened ? '다시 잠그기' : '등록 후 잠그기'
  });
  if (!ok || !(await saveDirtySections())) return;
  let sync = {synced: [], skipped: []};
  try {
    await withBusy('ENTITY 원본을 잠그는 중…', async () => {
      const copied = !record.tobe;
      if (copied) record.tobe = copyEntityLayer(record.asis);
      else if (reopened) sync = syncEntityOriginal(record);   // 잠금을 푼 동안 고친 원본 → 신규에서 손대지 않은 칸에
      delete record.unlockBase;
      record.locked = true;
      if (!record.savedAt) record.savedAt = new Date().toLocaleString('ko-KR');
      record.hash = await entityOriginalHash(record);
      record.unlockLog = closeLastUnlockEntry(record.unlockLog);
      appendSystemLog(record, `원본 ${reopened ? '다시 ' : ''}잠금${copied ? ' · 원본을 신규로 복사' : ''}`);
      await saveEntities(app.root, app.screen.entities);
      app.screen.savedEntities = JSON.parse(JSON.stringify(app.screen.entities));
    });
  } catch (error) {
    return toastError('저장 실패', error);
  }
  rerenderEntityPanel();
  activateEntityTab(id);
  toast('ENTITY 원본을 잠갔습니다. 이제 신규를 고칩니다.');
  if (reopened) await showOriginalSyncResult('ENTITY', sync);
}

/**
 * 다시 잠글 때 고친 원본을 신규에 반영 (규칙은 original-sync.js) — 기준(unlockBase)이 없으면 잠긴 동안 신규를 고친 적이 없을 때만 통째로
 * @returns {{synced: string[], skipped: string[]}}
 */
function syncEntityOriginal(record) {
  const outcome = record.unlockBase
    ? mergeDefItemWithOriginal('entity', record.unlockBase, record.asis, record.tobe)
    : replaceIfUntouched(record.tobe, copyEntityLayer(record.asis),
      diffDefItem('entity', record.tobe, record.asis).state !== 'same', wasEntityEditedWhileLocked(record.log));
  const title = entityRecordTitle(record);
  if (outcome.changed) {
    const before = record.tobe;
    const {title: newTitle, info, grids, rowIds} = outcome.item;
    record.tobe = {title: newTitle, info, grids, rowIds};
    appendSystemLog(record, syncLogText(defChangeLogText('entity', before, record.tobe)));
  }
  return {synced: outcome.changed ? [title] : [], skipped: outcome.conflict ? [title] : []};
}

/** ENTITY 잠금 풀기 — 사유 필수, 이력에 남김 */
async function unlockEntity(id) {
  const record = findEntity(id);
  if (!record || !record.locked || !(await saveBeforeEntityLockChange())) return;
  const answer = await askText({
    title: 'ENTITY 원본 잠금 풀기',
    desc: '원본은 변경 전 상태를 남겨 두기 위해 잠가 둡니다.\n잘못 넣은 원본을 바로잡을 때만 풀어 주세요. 신규 작업 내용은 그대로 보관됩니다.\n프로젝트 공통이라 모든 화면에 반영됩니다.',
    label: '잠금을 푸는 사유 (필수)',
    placeholder: '예: 등록 당시 누락된 컬럼 보완',
    okText: '잠금 풀기',
    validate: value => {
      if (!value) return '잠금을 푸는 사유를 입력해 주세요.';
      if (value.length < MIN_UNLOCK_REASON_LENGTH) return `사유를 ${MIN_UNLOCK_REASON_LENGTH}자 이상 적어 주세요.`;
      return '';
    }
  });
  if (!answer) return;
  try {
    await withBusy('잠금을 푸는 중…', async () => {
      record.locked = false;
      record.unlockBase = copyEntityLayer(record.asis);   // 다시 잠글 때 신규에 반영할 기준
      record.unlockLog = [...record.unlockLog, {at: new Date().toISOString(), by: currentWorkerName(), reason: answer.value, relockedAt: ''}];
      appendSystemLog(record, `잠금 풀기 (사유: ${answer.value})`);
      await saveEntities(app.root, app.screen.entities);
      app.screen.savedEntities = JSON.parse(JSON.stringify(app.screen.entities));
    });
  } catch (error) {
    return toastError('저장 실패', error);
  }
  rerenderEntityPanel();
  activateEntityTab(id);
  toast('잠금을 풀었습니다. 원본을 고친 뒤 다시 잠가 주세요.');
}

/* ======================= 사용하는 서비스 ======================= */

/** [사용하는 서비스]: 프로젝트에서 이 ENTITY 를 쓰는 서비스 목록 (등록된 내용 기준) — 누르면 그 화면의 그 서비스로 */
async function showEntityUsages(id) {
  const box = $(`[data-usage-for="${id}"]`);
  if (!box) return;
  let usages;
  try {
    usages = await withBusy('이 ENTITY 를 쓰는 서비스를 찾는 중…', () => findEntityUsages(app.root, id));
  } catch (error) {
    return toastError('찾기 실패', error);
  }
  const rows = usages.map(usage => `<li><button type="button" class="link-btn" data-open-service="${escapeHtml(JSON.stringify(usage.path))}" data-bid="${escapeHtml(usage.itemId)}">`
    + `${escapeHtml([...usage.path, usage.title].join(' › '))}</button></li>`).join('');
  box.innerHTML = `<div class="ent-usage-box"><b>이 ENTITY 를 쓰는 서비스</b><span class="muted"> · 등록된 내용 기준</span>`
    + (rows ? `<ul>${rows}</ul>` : '<p class="muted">쓰는 서비스가 없습니다.</p>') + '</div>';
}

/** 사용 목록에서 서비스를 누르면: 그 화면을 열고 서비스 탭의 그 항목으로 */
async function openServiceItem(path, itemId) {
  if (!app.screen || !isSamePath(app.screen.path, path)) await openScreen(path);
  if (!app.screen || !isSamePath(app.screen.path, path)) return;   // 이동을 취소함
  showTab('service');
  activateDefTab('service', itemId);
  scrollScreenToTop();
}
