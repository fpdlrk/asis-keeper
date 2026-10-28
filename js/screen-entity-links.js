/* ==========================================================================
   screen-entity-links.js — 서비스의 ENTITY 연결 (저장 서비스만)
     - 서비스 유형(정의 칸 serviceType)이 '저장'이면 본문에 '사용 ENTITY' 영역이 나옴
         [+ ENTITY 연결] → 프로젝트의 ENTITY 고르기 · 새로 만들기 / 이름 누르면 ENTITY 탭으로 / × 로 연결 풀기
     - 연결은 서비스 항목의 entityIds (정의서 원본/신규 · 변경 감지 · 시스템 이력에 그대로 들어감)
     - 빠뜨리지 않게: 저장 서비스인데 연결이 없으면 탭에 ⚠, 등록할 수 없음(blockServicesWithoutEntity — 저장 바 등록 · 서비스 탭 잠그기)
     - 유형을 저장이 아닌 것으로 바꾸면 연결을 풀지 확인
     - 신규 단계: 원본보다 새로 연결한 ENTITY 는 초록, 원본에서 빠진 ENTITY 는 아래에 따로 표시
   ========================================================================== */

/** 저장 서비스인데 연결된 ENTITY 가 없는지 (탭의 ⚠ · 등록할 때 확인) */
const serviceNeedsEntity = item => comparableValue((item.info || {}).serviceType) === SERVICE_TYPE_SAVE && !(item.entityIds || []).length;

/**
 * 등록을 막아야 하는지 — 저장 서비스인데 ENTITY 가 없으면 안내하고 그 서비스로 이동
 * @returns {Promise<boolean>} 막았으면 true
 */
async function blockServicesWithoutEntity() {
  const missing = readDefInputs('service').filter(serviceNeedsEntity);
  if (!missing.length) return false;
  await askConfirm({
    title: 'ENTITY 를 연결해 주세요',
    desc: '저장 서비스는 ENTITY 를 하나 이상 연결해야 등록할 수 있습니다.\n\n'
      + missing.map(item => '· ' + (item.title || UNNAMED_DEF_TITLE)).join('\n'),
    okText: '확인',
    noCancel: true
  });
  showTab('service');
  activateDefTab('service', missing[0].id);
  scrollScreenToTop();
  return true;
}

/** 연결된 ENTITY 이름표들 (없으면 안내) */
function entityChipsHtml(itemId, entityIds, readOnly) {
  if (!entityIds.length) return '<span class="ent-empty">연결된 ENTITY 가 없습니다. 저장 서비스는 ENTITY 를 하나 이상 연결해 주세요.</span>';
  return entityIds.map(id => `<span class="ent-chip" data-entity-id="${escapeHtml(id)}">`
    + `<button type="button" class="ent-go" data-goto-entity="${escapeHtml(id)}" title="ENTITY 탭에서 보기">${escapeHtml(entityTitleOf(id))}</button>`
    + (readOnly ? '' : `<button type="button" class="ent-x" data-unlink-entity="${escapeHtml(id)}" data-bid="${escapeHtml(itemId)}" aria-label="연결 풀기" title="연결 풀기">×</button>`)
    + '</span>').join('');
}

/**
 * 서비스 본문의 '사용 ENTITY' 영역 (저장 서비스일 때만 보임 — 유형을 바꾸면 handleServiceTypeChange 가 보이고 숨김)
 * @param {boolean} readOnly 삭제된 원본 항목 보기 (고칠 수 없음)
 */
function entityLinksHtml(item, readOnly) {
  const isSave = comparableValue((item.info || {}).serviceType) === SERVICE_TYPE_SAVE;
  return `<div class="ent-links"${isSave ? '' : ' hidden'}>
    <div class="ent-links-h"><span class="fld-l grid-title">ENTITY</span><span class="ent-hint">저장 서비스가 쓰는 ENTITY · 이름을 누르면 ENTITY 탭으로</span><span class="sp"></span>
      ${readOnly ? '' : `<button type="button" class="btn btn-s" data-link-entity="${escapeHtml(item.id)}" data-menu="entity-link" aria-haspopup="menu">+ ENTITY 연결</button>`}</div>
    <div class="ent-chips">${entityChipsHtml(item.id, item.entityIds || [], readOnly)}</div>
    <div class="ent-removed" hidden></div>
  </div>`;
}

/** 서비스 항목 요소 */
const serviceElementOf = itemId => $(`#defs-service > .blk[data-id="${itemId}"]`);

/** 연결이 바뀐 뒤: 이름표 · ENTITY 탭(이 화면에서 쓰는 것) · 표시 다시 그림 */
function afterEntityLinkChange(itemId) {
  const item = findDefItem('service', itemId);
  const element = serviceElementOf(itemId);
  if (item && element) element.querySelector('.ent-chips').innerHTML = entityChipsHtml(itemId, item.entityIds || [], false);
  renderEntityTabs();
  refreshIndicators();
}

/** 연결하기 */
function linkEntity(itemId, entityId) {
  const item = findDefItem('service', itemId);
  if (!item || (item.entityIds || []).includes(entityId)) return;
  item.entityIds = [...(item.entityIds || []), entityId];
  afterEntityLinkChange(itemId);
}

/** 연결 풀기 (ENTITY 자체는 그대로) */
function unlinkEntity(itemId, entityId) {
  const item = findDefItem('service', itemId);
  if (!item) return;
  item.entityIds = (item.entityIds || []).filter(id => id !== entityId);
  afterEntityLinkChange(itemId);
}

/**
 * [+ ENTITY 연결]: 아직 연결하지 않은 ENTITY 목록 + '새 ENTITY 만들기…'
 * 단추에 data-menu 가 있어야 누른 클릭으로 메뉴가 바로 닫히지 않음 (dialog.js — 메뉴 바깥 클릭이면 닫기)
 */
function showEntityLinkMenu(button, itemId) {
  const item = findDefItem('service', itemId);
  if (!item) return;
  const linked = item.entityIds || [];
  const candidates = app.screen.entities.filter(record => !linked.includes(record.id));
  const items = candidates.map(record => [entityTitleOf(record.id), () => linkEntity(itemId, record.id), '', '']);
  if (items.length) items.push('-');
  items.push(['새 ENTITY 만들기…', () => createAndLinkEntity(itemId), '', MENU_ICON.pageAdd]);
  showMenuBelow(button, items);
}

/** '새 ENTITY 만들기…': 추가 창으로 만들고 바로 연결 (서비스 화면에 머묾) — ENTITY 내용은 ENTITY 탭에서 채움 */
async function createAndLinkEntity(itemId) {
  const entityId = await addEntity({activate: false});
  if (!entityId) return;
  linkEntity(itemId, entityId);
  toast(`ENTITY ‘${entityTitleOf(entityId)}’를 만들어 연결했습니다. 이름을 누르면 ENTITY 탭에서 내용을 채울 수 있습니다.`);
}

/** 이름표를 누르면: ENTITY 탭의 그 ENTITY 로 */
function goToEntity(entityId) {
  showTab('entity');
  activateEntityTab(entityId);
  scrollScreenToTop();
}

/**
 * 서비스 유형을 바꿨을 때 — 저장이면 '사용 ENTITY' 영역을 보이고, 아니면 숨김
 * 저장이 아닌 것으로 바꾸는데 연결이 있으면 연결을 풀지 묻고, 취소하면 유형을 되돌림
 */
async function handleServiceTypeChange(select) {
  const element = select.closest('.blk');
  const item = element && findDefItem('service', element.dataset.id);
  if (!item) return;
  const isSave = select.value === SERVICE_TYPE_SAVE;
  if (!isSave && (item.entityIds || []).length) {
    const ok = await askConfirm({
      title: '서비스 유형 바꾸기',
      desc: `연결된 ENTITY ${item.entityIds.length}개가 있습니다. 연결을 풀고 바꿀까요?\n(ENTITY 자체는 지워지지 않습니다)`,
      okText: '연결 풀고 바꾸기'
    });
    if (!ok) {
      select.value = SERVICE_TYPE_SAVE;
      refreshIndicators();
      return;
    }
    item.entityIds = [];
    afterEntityLinkChange(item.id);
  }
  element.querySelector('.ent-links').hidden = !isSave;
  refreshIndicators();
}

/** 신규 단계: 원본보다 새로 연결한 ENTITY 는 초록, 원본에서 빠진 ENTITY 는 아래에 따로 (screen-changes.js 가 부름) */
function applyEntityLinkMarks(element, item, original) {
  const box = element.querySelector('.ent-links');
  if (!box) return;
  const originalIds = original ? original.entityIds || [] : null;
  const currentIds = item.entityIds || [];
  box.querySelectorAll('.ent-chip').forEach(chip => chip.classList.toggle('ent-new', !!originalIds && !originalIds.includes(chip.dataset.entityId)));
  const removed = originalIds ? originalIds.filter(id => !currentIds.includes(id)) : [];
  const removedBox = box.querySelector('.ent-removed');
  removedBox.hidden = !removed.length;
  removedBox.textContent = removed.length ? '원본에서 빠진 ENTITY: ' + removed.map(entityTitleOf).join(', ') : '';
}
