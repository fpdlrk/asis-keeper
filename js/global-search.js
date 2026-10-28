/* ==========================================================================
   global-search.js — 전체 검색 창 (상단 [검색] · Ctrl+Shift+F)

   좌측 트리 검색은 파일 · 폴더 이름만 찾고(tree.js matchesTreeName), 내용은 여기서 찾습니다.
   찾는 범위 (화면마다):
     1. 화면 정보: 이름 · 티켓 · 작업자 · 원본 위치
     2. SQL 정의 · 파라미터
     3. 변경 요약(메모) · 정의서 내용(정의 칸 · 표) · 원본/신규 SQL 본문
     4. 블록 제목 (SQL 제목 · 정의서 항목 이름)
     5. 사용자가 남긴 이력 글 (시스템 자동 기록은 빼고)
   + 프로젝트 공통 ENTITY (이름 · 정의 칸 · 표 · 사용자 이력) — 화면과 따로 묶어 보여 줌
   결과는 화면별로 묶고 '어디서 찾았는지'와 앞뒤 글을 보여 주며, 누르면 그 화면의 탭 · 항목으로 이동합니다.
   대소문자는 구분하지 않습니다. 파일을 읽기만 하고 고치지 않습니다.
   ========================================================================== */

/* 입력이 멈추고 이만큼(ms) 뒤에 찾음 (글자마다 모든 화면을 읽지 않게) */
const GLOBAL_SEARCH_DELAY = 300;
/* 찾은 글자 앞뒤로 보여 줄 글자 수 */
const SNIPPET_BEFORE = 30;
const SNIPPET_AFTER = 50;
/* 화면 하나에서 보여 줄 결과 수 (넘으면 '외 n건') */
const MAX_HITS_PER_SCREEN = 20;
/* 결과 묶음 이름 — 프로젝트 공통 ENTITY */
const ENTITY_GROUP_TITLE = 'ENTITY (프로젝트 공통)';

/* 검색 상태: timer = 입력 대기 타이머, seq = 검색 순번(새 검색이 시작되면 이전 결과는 버림), hits = 지금 보이는 결과의 이동 정보 */
const globalSearch = {timer: null, seq: 0, hits: []};

/* ======================= 찾기 ======================= */

/**
 * 글 안에서 검색어를 찾아 결과 한 줄 만들기
 * @param {string} text 찾을 글
 * @param {string} query 소문자 검색어
 * @param {string} where 찾은 곳 이름 (예: 'SQL · 사원조회 (신규)')
 * @param {object} target 누르면 갈 곳 {path, tab?, kind?, itemId?, scope?, find?}
 * @param {boolean} [withLine] 몇 번째 줄인지 붙임 (SQL 본문)
 * @returns {object|null} 못 찾으면 null
 */
function findInText(text, query, where, target, withLine = false) {
  const value = String(text == null ? '' : text);
  const index = value.toLowerCase().indexOf(query);
  if (index < 0) return null;
  const line = withLine ? value.slice(0, index).split('\n').length : 0;
  return {where: line ? `${where} · ${line}행` : where, snippet: snippetHtml(value, index, query.length), target};
}

/** 찾은 곳 앞뒤 글 (줄바꿈은 빈칸으로, 찾은 글자는 <mark>) */
function snippetHtml(text, index, length) {
  const start = Math.max(0, index - SNIPPET_BEFORE);
  const end = Math.min(text.length, index + length + SNIPPET_AFTER);
  const flat = part => escapeHtml(part.replace(/\s+/g, ' '));
  return (start > 0 ? '…' : '') + flat(text.slice(start, index)) + `<mark>${flat(text.slice(index, index + length))}</mark>`
    + flat(text.slice(index + length, end)) + (end < text.length ? '…' : '');
}

/** 결과 목록에 더하기 (null 은 건너뜀) */
const pushHit = (hits, hit) => { if (hit) hits.push(hit); };

/** 사용자가 남긴 이력 글만 (시스템 자동 기록은 검색에서 뺌) */
const userLogTexts = item => (item.log || []).filter(entry => logSourceOf(entry) === 'user').map(entry => entry.text);

/** 정의 칸 · 표 · 이력에서 찾기 (정의서 항목 · ENTITY 공통) */
function findInDefItem(hits, query, config, item, whereBase, target) {
  pushHit(hits, findInText(item.title, query, `${whereBase} · 제목`, target));
  for (const field of config.info || []) {
    pushHit(hits, findInText((item.info || {})[field.key], query, `${whereBase} · ${field.label}`, target));
  }
  for (const [gridKey, gridLabel] of config.grids || []) {
    const cells = ((item.grids || {})[gridKey] || []).map(row => row.join('\t')).join('\n');
    pushHit(hits, findInText(cells, query, `${whereBase} · ${gridLabel}`, target));
  }
  for (const text of userLogTexts(item)) pushHit(hits, findInText(text, query, `${whereBase} · 이력`, target));
}

/** 화면 하나에서 찾기 */
async function searchScreen(screenInfo, query) {
  const {dir, path, meta} = screenInfo;
  const hits = [];
  const screenTarget = {path};

  // 1. 화면 정보
  pushHit(hits, findInText(lastOf(path), query, '화면 이름', screenTarget));
  pushHit(hits, findInText(meta.ticket, query, '티켓', screenTarget));
  pushHit(hits, findInText(meta.worker, query, '작업자', screenTarget));
  pushHit(hits, findInText(meta.origin, query, '원본 위치', screenTarget));

  // 3. 변경 요약(메모)
  pushHit(hits, findInText(await readText(dir, TEXT_FIELD_FILES.memo), query, '변경 요약', {path, tab: 'attach'}));

  // SQL: 4. 제목 · 3. 본문 · 2. 정의 · 파라미터 · 5. 이력
  for (const kind of ['asis', 'tobe']) {
    for (const block of await loadSqlBlocks(dir, meta, kind)) {
      const where = `SQL · ${block.title || '(제목 없음)'} (${LAYER_LABELS[kind]})`;
      const target = {path, tab: 'sql', kind, itemId: block.id, scope: 'sql'};
      pushHit(hits, findInText(block.title, query, `${where} · 제목`, target));
      pushHit(hits, findInText(block.sql, query, where, {...target, find: query}, true));
      pushHit(hits, findInText(block.rbText, query, `${where} · 롤백`, target, true));
      for (const field of SQL_INFO_FIELDS) {
        pushHit(hits, findInText((block.info || {})[field.key], query, `${where} · ${field.label}`, target));
      }
      pushHit(hits, findInText((block.params || []).map(row => row.join('\t')).join('\n'), query, `${where} · 파라미터`, target));
      for (const text of userLogTexts(block)) pushHit(hits, findInText(text, query, `${where} · 이력`, target));
    }
  }

  // 정의서: 4. 이름 · 3. 정의 칸 · 표 · 5. 이력
  for (const tab of Object.keys(DEF_TABS)) {
    const layers = await loadDefLayers(dir, tab, isTabLockedIn(meta, tab));
    for (const kind of ['asis', 'tobe']) {
      for (const item of layers[kind]) {
        const where = `${DEF_TABS[tab].label} · ${item.title || UNNAMED_DEF_TITLE} (${LAYER_LABELS[kind]})`;
        findInDefItem(hits, query, DEF_TABS[tab], item, where, {path, tab, kind, itemId: item.id, scope: 'def'});
      }
    }
  }
  return hits;
}

/** 프로젝트 공통 ENTITY 에서 찾기 (원본 · 신규 둘 다) */
async function searchEntities(query) {
  const hits = [];
  for (const record of await loadEntities(app.root)) {
    const target = {entityId: record.id};
    for (const kind of ['asis', 'tobe']) {
      const layer = record[kind];
      if (layer) findInDefItem(hits, query, ENTITY_DEF, {...layer, log: []}, `${layer.title || UNNAMED_DEF_TITLE} (${LAYER_LABELS[kind]})`, target);
    }
    // 이력은 ENTITY 마다 하나 (원본 · 신규 구분 없음)
    for (const text of userLogTexts(record)) pushHit(hits, findInText(text, query, `${entityRecordTitle(record)} · 이력`, target));
  }
  return hits;
}

/* ======================= 결과 그리기 ======================= */

/** 결과 묶음 하나 (화면 또는 ENTITY) — 머리 + 결과 줄 (넘치면 '외 n건') */
function searchGroupHtml(title, subTitle, statusIndex, hits) {
  const shown = hits.slice(0, MAX_HITS_PER_SCREEN);
  const rows = shown.map(hit => {
    globalSearch.hits.push(hit);
    return `<li><button type="button" class="gs-hit" data-hit="${globalSearch.hits.length - 1}">`
      + `<span class="gs-where">${escapeHtml(hit.where)}</span><span class="gs-snip">${hit.snippet}</span></button></li>`;
  }).join('');
  const more = hits.length > shown.length ? `<li class="gs-more">외 ${hits.length - shown.length}건</li>` : '';
  const status = statusIndex >= 0 ? `<span class="gs-st"><span class="dot s${statusIndex}"></span>${STATUS_LIST[statusIndex]}</span>` : '';
  return `<section class="gs-group"><div class="gs-gh"><b>${escapeHtml(title)}</b>`
    + (subTitle ? `<span class="muted">${escapeHtml(subTitle)}</span>` : '') + `<span class="sp"></span>${status}</div><ul>${rows}${more}</ul></section>`;
}

/** 검색 실행 — 화면을 하나씩 읽으며 진행을 보여 주고, 다 찾으면 결과를 그림 */
async function runGlobalSearch() {
  const query = $('#gsInput').value.trim().toLowerCase();
  const seq = ++globalSearch.seq;
  const result = $('#gsResult');
  const status = $('#gsStatus');
  globalSearch.hits = [];
  if (!query) {
    status.textContent = '';
    result.innerHTML = '<p class="gs-empty muted">찾을 글자를 입력하세요. 화면 이름 · 티켓 · 작업자 · SQL · 정의서 · 변경 요약 · ENTITY · 이력 글을 찾습니다.</p>';
    return;
  }
  if (!app.root) {
    result.innerHTML = '<p class="gs-empty muted">먼저 프로젝트를 여세요.</p>';
    return;
  }
  try {
    const screens = await findAllScreens(app.root);
    const groups = [];
    let hitCount = 0;
    for (let i = 0; i < screens.length; i++) {
      if (seq !== globalSearch.seq) return;   // 그 사이 검색어가 바뀜
      status.textContent = `찾는 중… (${i + 1} / ${screens.length} 화면)`;
      const hits = await searchScreen(screens[i], query);
      if (hits.length) {
        groups.push({title: lastOf(screens[i].path), subTitle: screens[i].path.slice(0, -1).join(' / '), statusIndex: statusIndexOf(screens[i].meta), hits});
        hitCount += hits.length;
      }
    }
    const entityHits = await searchEntities(query);
    if (seq !== globalSearch.seq) return;
    hitCount += entityHits.length;
    const html = groups.map(group => searchGroupHtml(group.title, group.subTitle, group.statusIndex, group.hits)).join('')
      + (entityHits.length ? searchGroupHtml(ENTITY_GROUP_TITLE, '', -1, entityHits) : '');
    status.textContent = hitCount ? `${groups.length}개 화면${entityHits.length ? ' + ENTITY' : ''} · ${hitCount}건` : '';
    result.innerHTML = html || '<p class="gs-empty muted">찾는 내용이 없습니다.</p>';
  } catch (error) {
    if (seq === globalSearch.seq) status.textContent = '';
    toastError('검색 실패', error);
  }
}

/** 입력할 때마다 — 잠깐 멈추면 찾음 */
function scheduleGlobalSearch() {
  clearTimeout(globalSearch.timer);
  globalSearch.timer = setTimeout(runGlobalSearch, GLOBAL_SEARCH_DELAY);
}

/* ======================= 이동 ======================= */

/** 결과를 눌렀을 때: 창을 닫고 그 화면 → 탭 → 항목으로 (SQL 본문이면 찾은 글자를 선택) */
async function goToSearchHit(hit) {
  const target = hit.target;
  $('#gsModal').hidden = true;
  if (target.entityId) return goToEntityHit(target.entityId);
  if (!app.screen || !isSamePath(app.screen.path, target.path)) await openScreen(target.path);
  if (!app.screen || !isSamePath(app.screen.path, target.path)) return;   // 이동을 취소했거나 화면이 없어짐
  if (!target.tab) return scrollScreenToTop();
  showTab(target.tab);
  if (target.scope === 'sql') goToSqlHit(target);
  if (target.scope === 'def') goToDefHit(target);
  scrollScreenToTop();
}

/**
 * SQL 결과로 이동 — 지금 보이는 쪽(원본 단계 = 원본, 신규 단계 = 신규)의 블록을 고름
 * 신규 단계에서 원본 SQL 을 찾았으면 그 원본과 짝인 신규 블록(왼쪽 칸이 그 원본)으로 갑니다.
 */
function goToSqlHit(target) {
  const screen = app.screen;
  const visibleKind = layerOf('sql');
  let blockId = target.kind === visibleKind ? target.itemId : '';
  let editorKind = target.kind;
  if (!blockId && target.kind === 'asis') {
    const paired = screen.blocks.tobe.find(block => block.asisId === target.itemId);
    if (paired) { blockId = paired.id; editorKind = 'pair'; }
  }
  if (!blockId) return toast(target.kind === 'tobe' ? '신규 SQL 은 원본을 잠근 뒤에 보입니다.' : '이 원본 SQL 과 짝인 신규 SQL 이 없습니다.');
  activateSqlTab(visibleKind, blockId);
  selectFoundText(screen.editors[editorId(editorKind, blockId)], target.find);
}

/** 정의서 결과로 이동 — 보이는 쪽에 그 항목이 없으면(신규 단계의 원본) 그 원본과 짝인 신규 항목으로 */
function goToDefHit(target) {
  const items = app.screen.defItems[target.tab] || [];
  const item = items.find(entry => entry.id === target.itemId) || items.find(entry => entry.asisId === target.itemId);
  if (!item) return toast(target.kind === 'tobe' ? '신규 항목은 원본을 잠근 뒤에 보입니다.' : '이 원본과 짝인 신규 항목이 없습니다.');
  activateDefTab(target.tab, item.id);
}

/** SQL 편집기에서 찾은 글자 선택 (편집기가 없거나 찾을 글자가 없으면 그냥 둠) */
function selectFoundText(editor, text) {
  if (!editor || !text) return;
  editor.resize(true);
  editor.find(text, {caseSensitive: false, wrap: true, start: {row: 0, column: 0}});
  editor.focus();
}

/**
 * ENTITY 결과로 이동 — ENTITY 는 화면마다 있는 ENTITY 탭에서 봄
 * 열린 화면이 있으면 그 화면, 없으면 그 ENTITY 를 쓰는 첫 화면을 엽니다.
 */
async function goToEntityHit(entityId) {
  if (!app.screen) {
    const usages = await findEntityUsages(app.root, entityId);
    if (!usages.length) return toast('화면을 하나 연 뒤 ENTITY 탭에서 볼 수 있습니다. (이 ENTITY 를 쓰는 서비스가 없습니다)');
    await openScreen(usages[0].path);
    if (!app.screen) return;
  }
  goToEntity(entityId);
}

/* ======================= 창 ======================= */

/** 창 열기 — 지난 검색어를 그대로 두고 전체 선택 (바로 고쳐 쓰거나 다시 찾기 쉽게) */
function openGlobalSearch() {
  const input = $('#gsInput');
  $('#gsModal').hidden = false;
  input.focus();
  input.select();
  runGlobalSearch();   // 그 사이 내용이 바뀌었을 수 있어 다시 찾음
}

/** Ctrl+Shift+F — SQL 편집기 안에서도 열리도록 캡처 단계에서 받음 */
function handleGlobalSearchShortcut(e) {
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== 'f') return;
  if ($('#app').hidden) return;
  e.preventDefault();
  e.stopPropagation();
  openGlobalSearch();
}

function initGlobalSearch() {
  $('#btnGlobalSearch').onclick = openGlobalSearch;
  $('#gsClose').onclick = () => { $('#gsModal').hidden = true; };
  $('#gsInput').oninput = scheduleGlobalSearch;
  $('#gsInput').onkeydown = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(globalSearch.timer);
    runGlobalSearch();
  };
  $('#gsResult').onclick = e => {
    const button = e.target.closest('[data-hit]');
    if (button) goToSearchHit(globalSearch.hits[Number(button.dataset.hit)]);
  };
  window.addEventListener('keydown', handleGlobalSearchShortcut, true);
}
