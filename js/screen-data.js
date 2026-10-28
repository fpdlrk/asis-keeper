/* ==========================================================================
   screen-data.js — 화면(메뉴) 폴더의 데이터를 읽는 공통 함수
   화면 폴더 = meta.json 이 있는 폴더. 트리·현황·보고서·변환에서 함께 씁니다.
   ========================================================================== */

/** 상태 이름 정리: 예전 이름은 지금 이름으로, 모르는 값은 '진행' */
const normalizeStatus = name => STATUS_LIST.includes(name) ? name : (LEGACY_STATUS_NAMES[name] || '진행');

/** meta 의 상태 이름 */
const statusOf = meta => normalizeStatus(meta && meta.status);

/** meta 의 상태 번호 (0~3) */
const statusIndexOf = meta => STATUS_LIST.indexOf(statusOf(meta));

/** 상태 이력에서 그 상태가 마지막으로 기록된 날짜 (없으면 '-') — 보고서의 개발/운영 반영일 */
function lastStatusDate(meta, statusName) {
  const entries = (meta.statusLog || []).filter(entry => normalizeStatus(entry.status) === statusName);
  return entries.length ? formatDateTime(lastOf(entries).at) : '-';
}

/** 화면 폴더(메뉴)만 골라 이름순으로: 예약 폴더(asis 등)와 '.' 으로 시작하는 폴더 제외 */
async function listChildFolders(dir) {
  const names = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory' && !RESERVED_FOLDER_NAMES.includes(name) && !name.startsWith('.')) names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b, 'ko'));
}

/**
 * 루트 아래 모든 화면 찾기
 * @returns {Promise<{dir, path: string[], meta: object}[]>}
 */
async function findAllScreens(dir, path = [], found = []) {
  for (const name of await listChildFolders(dir)) {
    const childDir = await dir.getDirectoryHandle(name);
    const childPath = [...path, name];
    const meta = await readJson(childDir, 'meta.json', null);
    if (meta) found.push({dir: childDir, path: childPath, meta});
    await findAllScreens(childDir, childPath, found);
  }
  return found;
}

/**
 * SQL 블록 목록 읽기 (예전 단일 파일 구조 asis/sql.sql, tobe/sql.sql 도 읽음)
 * @param {'asis'|'tobe'} kind
 * @returns {Promise<{id, title, file, rb?, info?, params?, paramIds, sql, rbText}[]>} rb = (예전) 롤백 SQL 파일
 */
async function loadSqlBlocks(dir, meta, kind) {
  let list = meta.sqlBlocks && meta.sqlBlocks[kind];
  if (!list) {
    const legacyFile = kind === 'asis' ? 'asis/sql.sql' : 'tobe/sql.sql';
    const legacyRollback = 'tobe/rollback.sql';
    const hasLegacy = (await readFile(dir, legacyFile)) || (kind === 'tobe' && await readFile(dir, legacyRollback));
    if (!hasLegacy) list = [];
    else if (kind === 'asis') list = [{id: 'legacy', title: '기존 SQL', file: legacyFile}];
    else list = [{id: 'legacy', title: '신규 SQL', file: legacyFile, rb: legacyRollback}];
  }
  const blocks = [];
  for (const block of list) {
    blocks.push({
      ...block,
      paramIds: rowIdsOf(block.params, block.paramIds),
      sql: await readText(dir, block.file) || '',
      rbText: block.rb ? (await readText(dir, block.rb)) || '' : ''
    });
  }
  return blocks;
}

/**
 * 신규 SQL 블록과 짝이 되는 기존 블록 찾기 (나란히 보기·비교 탭·보고서가 함께 씁니다)
 *   asisId 가 있으면  → 그 id 의 기존 블록 (없어졌으면 null)
 *   asisId 가 ''      → 짝 없음 = 신규 쿼리
 *   asisId 가 없으면   → 예전 데이터이므로 같은 순서의 기존 블록
 * @param {{asisId?: string}} tobeBlock 신규 블록
 * @param {number} order 신규 블록의 순서(0부터)
 * @param {{id: string}[]} asisBlocks 기존 블록 목록
 * @returns {object|null}
 */
function findPairedAsisBlock(tobeBlock, order, asisBlocks) {
  if (tobeBlock.asisId === NO_ASIS_PAIR) return null;
  if (tobeBlock.asisId) return asisBlocks.find(block => block.id === tobeBlock.asisId) || null;
  return asisBlocks[order] || null;
}

/**
 * 등록 시점의 해시와 지금 파일을 비교해 달라진 파일 찾기 (원본 무결성 확인)
 * @param {object} hashes {상대경로: 해시}
 * @param {object} [opt]
 * @param {boolean} [opt.stopAtFirst] 하나만 찾으면 멈춤 (있는지 여부만 필요할 때)
 * @returns {Promise<{path: string, reason: string}[]>} reason: '파일 없음' | '내용이 달라짐'
 */
async function findChangedFiles(dir, hashes, {stopAtFirst = false} = {}) {
  const changed = [];
  for (const [path, savedHash] of Object.entries(hashes || {})) {
    // meta.json 안의 값(META_HASH_TARGETS)은 그 값을 글로 바꿔 비교
    const file = path in META_HASH_TARGETS
      ? metaHashBlob(path, await readJson(dir, 'meta.json', {}))
      : await readFile(dir, path);
    if (!file) changed.push({path, reason: '파일 없음'});
    else if (await sha256(file) !== savedHash) changed.push({path, reason: '내용이 달라짐'});
    if (stopAtFirst && changed.length) break;
  }
  return changed;
}

/* ======================= 티켓번호 (일련번호) =======================
   쓰는 법: const seq = await openTicketSequence(app.root); … nextTicket(seq) … ; await saveTicketSequence(seq);
   다음 번호 = max(마지막으로 낸 번호(.ticket-seq.json), 화면들이 쓰는 가장 큰 6자리 번호) + 1
   — 손으로 넣은 예전 티켓(6자리 숫자가 아님)은 순번 계산에서 빼고, 이미 쓰는 번호는 건너뜀 */

/** 6자리 일련번호 모양인지 */
const isSequenceTicket = ticket => new RegExp(`^\\d{${TICKET_DIGITS}}$`).test(ticket);

/** 숫자 → '000123' */
const formatTicket = number => String(number).padStart(TICKET_DIGITS, '0');

/**
 * 티켓 순번 열기: 프로젝트의 모든 화면이 쓰는 번호 + 마지막으로 낸 번호
 * @returns {Promise<{root, used: Set<string>, last: number}>}
 */
async function openTicketSequence(root) {
  const used = new Set((await findAllScreens(root)).map(({meta}) => String(meta.ticket || '')).filter(Boolean));
  const saved = await readJson(root, TICKET_SEQ_FILE, {});
  const largestUsed = [...used].filter(isSequenceTicket).reduce((max, ticket) => Math.max(max, Number(ticket)), 0);
  return {root, used, last: Math.max(Number(saved.last) || 0, largestUsed)};
}

/** 다음 티켓번호 (순번을 하나 올리고 그 번호를 씀으로 표시 — 여러 개를 연달아 내도 겹치지 않음) */
function nextTicket(seq) {
  let number = seq.last + 1;
  while (seq.used.has(formatTicket(number))) number++;
  if (number >= 10 ** TICKET_DIGITS) throw new Error(`티켓번호가 ${formatTicket(10 ** TICKET_DIGITS - 1)}까지 모두 쓰였습니다.`);
  seq.last = number;
  const ticket = formatTicket(number);
  seq.used.add(ticket);
  return ticket;
}

/** 마지막으로 낸 번호를 루트에 저장 (번호를 냈으면 꼭 부름) */
const saveTicketSequence = seq => writeJson(seq.root, TICKET_SEQ_FILE, {last: seq.last});

/** 폴더(하위 포함) 안의 모든 화면에 새 티켓번호를 붙임 — 메뉴를 복사했을 때 (복사본이 원래 번호를 그대로 쓰지 않게) */
async function assignNewTickets(dir, seq) {
  const ownMeta = await readJson(dir, 'meta.json', null);
  if (ownMeta) await writeJson(dir, 'meta.json', {...ownMeta, ticket: nextTicket(seq)});
  for (const {dir: screenDir, meta} of await findAllScreens(dir)) await writeJson(screenDir, 'meta.json', {...meta, ticket: nextTicket(seq)});
}

/* ======================= 탭별 원본 잠금 =======================
   meta.tabLocks = {탭: {locked, savedAt, lockedIds, hashes, unlockLog}}  (탭 = LAYER_TABS)
     locked    : 잠겼는지 (= 그 탭이 신규 단계인지)
     savedAt   : 처음 잠근 시각 (다시 잠가도 그대로)
     lockedIds : 지난번 잠글 때의 원본 항목 id (다시 잠글 때 '새로 넣은 원본'만 신규로 복사). 한 번도 안 잠갔으면 null
     hashes    : 그 탭 원본의 해시 {경로 또는 META_HASH_TARGETS 키: 해시}
     unlockLog : 잠금 해제 이력 [{at, by, reason, relockedAt}] */

/** 탭 이름 (안내 · 현황 · 보고서) */
const layerTabLabel = tab => (tab === 'sql' ? 'SQL' : DEF_TABS[tab].label);

/** 잠그지 않은 탭의 잠금 정보 */
const emptyTabLock = () => ({locked: false, savedAt: '', lockedIds: null, hashes: {}, unlockLog: []});

/**
 * 화면의 탭별 잠금 정보 (언제나 LAYER_TABS 가 모두 들어 있음)
 * meta.tabLocks 가 없으면 예전 값(화면 하나에 잠금 하나 — LEGACY_LOCK_KEYS)으로 만듭니다:
 *   잠금 · 처음 잠근 시각은 모든 탭이 같게, 해시는 경로로 나눔(정의서 폴더 아래는 그 탭, 나머지는 SQL),
 *   해제 이력은 SQL 탭으로 (예전 잠금은 SQL 원본을 위한 것이었음)
 */
function tabLocksOf(meta) {
  if (meta.tabLocks) return Object.fromEntries(LAYER_TABS.map(tab => [tab, {...emptyTabLock(), ...(meta.tabLocks[tab] || {})}]));
  const defTabOfPath = path => Object.keys(DEF_TABS).find(tab => path.startsWith(DEF_TABS[tab].dir + '/')) || 'sql';
  const hashEntries = Object.entries(meta.hashes || {});
  return Object.fromEntries(LAYER_TABS.map(tab => [tab, {
    locked: !!meta.asisLocked,
    savedAt: meta.asisSavedAt || '',
    lockedIds: meta.asisLockedIds ? meta.asisLockedIds[tab] || [] : null,
    hashes: Object.fromEntries(hashEntries.filter(([path]) => defTabOfPath(path) === tab)),
    unlockLog: tab === 'sql' ? meta.asisUnlockLog || [] : []
  }]));
}

/** 탭이 잠겼는지 */
const isTabLockedIn = (meta, tab) => tabLocksOf(meta)[tab].locked;

/** 잠긴 탭이 하나라도 있는지 */
const anyTabLocked = meta => LAYER_TABS.some(tab => isTabLockedIn(meta, tab));

/** 잠금을 풀어 둔 채인 탭 (해제 이력이 있는데 지금 안 잠김) */
const reopenedTabs = meta => {
  const locks = tabLocksOf(meta);
  return LAYER_TABS.filter(tab => !locks[tab].locked && locks[tab].unlockLog.length > 0);
};

/** 잠긴 탭들의 원본 해시를 하나로 (원본 확인 · 현황 · 보고서) */
const lockedHashesOf = meta => Object.assign({}, ...Object.values(tabLocksOf(meta)).filter(lock => lock.locked).map(lock => lock.hashes));

/** 탭 하나의 잠금 정보 저장 (meta 만 바꿈 — saveMeta 는 부르는 쪽에서). 예전 값은 이때 지움 */
function setTabLock(meta, tab, lock) {
  meta.tabLocks = {...tabLocksOf(meta), [tab]: lock};
  for (const key of LEGACY_LOCK_KEYS) delete meta[key];
}

/** META_HASH_TARGETS 의 값을 해시용 Blob 으로 (잠글 때와 확인할 때 같은 방식) */
const metaHashBlob = (key, meta) => new Blob([JSON.stringify(META_HASH_TARGETS[key](meta))], {type: 'application/json'});

/* ======================= 표의 줄 id ======================= */

/** 줄 id 가 없는 예전 데이터: 순서대로 'L0', 'L1' … (원본과 신규가 같은 순서끼리 짝지어짐) */
const legacyRowIds = rows => (rows || []).map((_, i) => LEGACY_ROW_ID_PREFIX + i);

/** 저장된 줄 id (없거나 줄 수와 다르면 예전 방식 id) */
const rowIdsOf = (rows, ids) => (Array.isArray(ids) && ids.length === (rows || []).length ? ids : legacyRowIds(rows));

/* ======================= 정의서 항목 (서비스 · 오브젝트 · 공통코드관리) ======================= */

/**
 * 예전 글을 표의 줄로 바꾸기 — 칸이 표보다 많으면 남는 값은 마지막 칸에 이어 붙임(버리지 않음)
 * @param {string} text 예전 글 입력란 내용
 * @param {number} columnCount 표의 열 수
 */
function textToGridRows(text, columnCount) {
  return splitTableText(text)
    .filter(cells => cells.some(Boolean))
    .map(cells => (cells.length <= columnCount
      ? cells
      : [...cells.slice(0, columnCount - 1), cells.slice(columnCount - 1).filter(Boolean).join(' ')]));
}

/**
 * 예전 '개요' 표의 첫 줄을 정의 칸 값으로 (LEGACY_OVERVIEW_INFO 가 있는 탭만 — 공통코드관리)
 * 개요 표가 정의 칸으로 바뀌었기 때문입니다. 둘째 줄부터는 옮기지 않습니다(개요는 한 줄로 쓰던 표).
 * @returns {object} {칸 key: 값} (빈 칸 제외)
 */
function overviewRowToInfo(tab, overviewRows) {
  const keys = LEGACY_OVERVIEW_INFO[tab];
  const row = keys && (overviewRows || [])[0];
  if (!row) return {};
  return Object.fromEntries(keys.map((key, i) => [key, String(row[i] ?? '').trim()]).filter(([, value]) => value));
}

/** 빈 표 묶음 {표 키: []} */
const emptyDefGrids = tab => Object.fromEntries(defConfigOf(tab).grids.map(([key]) => [key, []]));

/**
 * 표로 바꾸기 전 파일(LEGACY_DEF_FILES)을 읽어 '기본' 항목 하나로 만들기
 * @returns {Promise<object|null>} 예전 내용이 하나도 없으면 null
 */
async function readLegacyDefItem(dir, tab) {
  const legacy = LEGACY_DEF_FILES[tab];
  const grids = emptyDefGrids(tab);
  if (legacy.grid) {
    const rows = await readJson(dir, legacy.grid, []);
    grids.overview = (Array.isArray(rows) ? rows : []).filter(cells => Array.isArray(cells) && cells.some(Boolean));
  }
  for (const [key, file] of Object.entries(legacy.texts)) {
    grids[key] = textToGridRows(await readText(dir, file) || '', GRID_COLUMNS[`${tab}.${key}`].cols.length);
  }
  // 개요 표가 정의 칸으로 바뀐 탭은 개요를 정의 칸으로 옮김
  const info = overviewRowToInfo(tab, grids.overview);
  if (!DEF_TABS[tab].grids.some(([key]) => key === 'overview')) delete grids.overview;
  if (!Object.values(grids).some(rows => rows.length) && !Object.keys(info).length) return null;
  return {id: LEGACY_DEF_ITEM.id, title: LEGACY_DEF_ITEM.title, info, grids, log: []};
}

/** 정의서 파일 경로: 원본 <dir>/asis.json · 신규 <dir>/tobe.json */
const defLayerFile = (tab, layer) => `${DEF_TABS[tab].dir}/${layer}.json`;

/** 원본/신규로 나누기 전의 정의서 파일 경로 (<dir>/items.json) */
const legacyDefItemsFile = tab => `${DEF_TABS[tab].dir}/${LEGACY_DEF_ITEMS_FILE}`;

/** 정의서 탭의 모든 데이터 파일 (검색 · 복사할 때 이력 지우기) */
const defDataFiles = tab => [defLayerFile(tab, 'asis'), defLayerFile(tab, 'tobe'), legacyDefItemsFile(tab)];

/** 저장된 항목을 화면에서 쓰는 모양으로 (빠진 값 채우기 · 예전 개요 표 → 정의 칸 · 줄 id) */
function normalizeDefItem(tab, item) {
  // 지금 탭에 있는 표만 (정의 칸으로 바뀐 예전 '개요' 표 등은 빼야 다시 저장할 때 남지 않음)
  const grids = Object.fromEntries(defConfigOf(tab).grids.map(([key]) => [key, (item.grids || {})[key] || []]));
  const rowIds = Object.fromEntries(Object.keys(grids).map(key => [key, rowIdsOf(grids[key], (item.rowIds || {})[key])]));
  return {
    id: item.id,
    ...(item.asisId !== undefined ? {asisId: item.asisId} : {}),
    title: item.title || '',
    info: item.info || overviewRowToInfo(tab, item.grids && item.grids.overview),   // 정의 칸이 생기기 전 항목은 개요 표에서
    grids,
    rowIds,
    ...(Array.isArray(item.entityIds) ? {entityIds: item.entityIds} : {}),   // 서비스가 쓰는 ENTITY
    log: item.log || []
  };
}

/** 정의서 파일 하나 읽기 (없으면 null) */
async function readDefFile(dir, tab, path) {
  const saved = await readJson(dir, path, null);
  return Array.isArray(saved) ? saved.map(item => normalizeDefItem(tab, item)) : null;
}

/**
 * 원본 항목 위에 신규 항목 만들기 — 신규 단계에서 '복사해서 고치기'의 시작점
 * 새 id 를 주고 asisId 로 원본을 가리킵니다. 표의 줄 id 는 그대로 두어 줄끼리 짝지어집니다.
 */
const copyDefItemAsTobe = item => ({...JSON.parse(JSON.stringify(item)), id: newId('d'), asisId: item.id});

/**
 * 정의서 탭의 원본 · 신규 항목 읽기 (화면 · 보고서 · 잠그기가 함께 씀)
 *   원본: asis.json → 없으면 예전 items.json → 그것도 없으면 더 예전 파일(글 입력란 · 개요 표)을 '기본' 항목으로
 *   신규: tobe.json → 없으면 잠긴 화면은 원본을 복사해 시작(아직 신규 작업 전), 잠그기 전이면 빈 목록
 * @param {boolean} locked 그 탭의 원본이 잠겼는지 (isTabLockedIn)
 * @returns {Promise<{asis: object[], tobe: object[]}>}
 */
async function loadDefLayers(dir, tab, locked) {
  let asis = await readDefFile(dir, tab, defLayerFile(tab, 'asis'));
  if (!asis) asis = await readDefFile(dir, tab, legacyDefItemsFile(tab));
  if (!asis) {
    const legacyItem = await readLegacyDefItem(dir, tab);
    asis = legacyItem ? [normalizeDefItem(tab, legacyItem)] : [];
  }
  let tobe = await readDefFile(dir, tab, defLayerFile(tab, 'tobe'));
  if (!tobe) tobe = locked ? asis.map(copyDefItemAsTobe) : [];
  return {asis, tobe};
}

/** 정의서 항목을 파일에 저장하는 모양으로 (빈 정의 칸 · 빈 이력은 적지 않음) */
const storedDefItem = item => ({
  id: item.id,
  ...(item.asisId !== undefined ? {asisId: item.asisId} : {}),
  title: item.title,
  ...(Object.keys(item.info || {}).length ? {info: item.info} : {}),
  grids: item.grids,
  rowIds: item.rowIds,
  ...(item.entityIds && item.entityIds.length ? {entityIds: item.entityIds} : {}),
  ...(item.log && item.log.length ? {log: item.log} : {})
});
