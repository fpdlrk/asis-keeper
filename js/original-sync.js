/* ==========================================================================
   original-sync.js — 잠금을 풀고 고친 원본을 다시 잠글 때 신규에 반영 (계산만 — 파일 · 화면은 screen-lock.js · screen-entity.js)

   왜: 원본을 신규로 복사하는 것은 처음 잠글 때(그리고 새로 넣은 원본 항목)뿐이라,
       잠금을 풀고 이미 있던 원본 항목을 고친 뒤 다시 잠그면 신규는 예전 값 그대로 남아 '원본과 다름'으로 표시됐음

   규칙: 칸마다 '잠금을 풀 때의 원본(기준)'과 비교합니다
     신규 = 기준  → 신규에서 손대지 않은 칸 → 고친 원본 값으로 바꿈
     신규 ≠ 기준  → 신규에서 따로 고친 칸 → 신규 값 그대로 (원본도 다르게 고쳤으면 '반영 못 함'으로 알림)
     표의 줄(줄 id 로 짝): 원본에 새로 넣은 줄은 신규 끝에 추가, 원본에서 지운 줄은 신규에서도 손대지 않았으면 지움
   기준이 없을 때(이 기능 전에 잠금을 푼 것): 원본에서 복사된 뒤 신규에서 고친 기록('수정 · …' 시스템 이력)이 없는 항목만
     원본 내용을 통째로 넣고, 고친 기록이 있는데 원본과 다르면 '반영 못 함'으로 알림
   결과는 모두 {값, changed: 신규가 바뀌었는지, conflict: 반영하지 못한 곳이 있는지} 모양입니다.
   ========================================================================== */

/* 반영한 항목에 남기는 시스템 이력의 머리 — '수정'으로 시작하지 않아야 '신규에서 고친 기록'으로 세지 않음 (wasEditedInTobe) */
const ORIGINAL_SYNC_LOG_PREFIX = '원본 고친 내용 반영';

/** JSON 으로 깊은 복사 */
const cloneJson = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** 칸 값이 같은지 (앞뒤 공백 무시 — 화면의 변경 표시와 같은 기준) */
const sameCell = (a, b) => comparableValue(a) === comparableValue(b);

/** 표의 줄이 같은지 */
function sameGridRow(a, b) {
  const width = Math.max(a.length, b.length);
  for (let col = 0; col < width; col++) if (!sameCell(a[col], b[col])) return false;
  return true;
}

/** ENTITY 연결이 같은지 (순서 무관) */
const sameIdSet = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());

/** SQL 본문이 같은지 (줄바꿈 모양만 맞춤) */
const sameSqlText = (a, b) => normalizeLineBreaks(a || '') === normalizeLineBreaks(b || '');

/**
 * 값 하나: 기준 · 고친 원본 · 신규 → 반영 결과
 * @returns {{value, changed: boolean, conflict: boolean}}
 */
function mergeOriginalValue(base, now, tobe, same = sameCell) {
  if (same(tobe, base)) return same(now, base) ? {value: tobe, changed: false, conflict: false} : {value: now, changed: true, conflict: false};
  return {value: tobe, changed: false, conflict: !same(now, base) && !same(now, tobe)};
}

/** 정의 칸 (key 마다) */
function mergeOriginalInfo(base, now, tobe) {
  const value = {...(tobe || {})};
  let changed = false, conflict = false;
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(now || {}), ...Object.keys(tobe || {})]);
  for (const key of keys) {
    const result = mergeOriginalValue((base || {})[key], (now || {})[key], (tobe || {})[key]);
    if (result.changed) value[key] = (now || {})[key] ?? '';
    changed = changed || result.changed;
    conflict = conflict || result.conflict;
  }
  return {value, changed, conflict};
}

/**
 * 표 ({rows, ids} — gridValueOf 모양). 신규 줄 순서는 그대로, 원본에 새로 넣은 줄은 끝에
 * @returns {{rows, ids, changed, conflict}}
 */
function mergeOriginalGrid(base, now, tobe) {
  const rowsById = grid => new Map(grid.ids.map((id, i) => [id, grid.rows[i] || []]));
  const baseById = rowsById(base), nowById = rowsById(now);
  const tobeIds = new Set(tobe.ids);
  const rows = [], ids = [];
  let changed = false, conflict = false;
  tobe.ids.forEach((id, i) => {
    const cells = tobe.rows[i] || [];
    const baseCells = baseById.get(id), nowCells = nowById.get(id);
    if (!baseCells) { rows.push(cells); ids.push(id); return; }   // 신규에서 넣은 줄
    if (!nowCells) {                                               // 원본에서 지운 줄: 신규에서 손대지 않았으면 함께 지움
      if (sameGridRow(cells, baseCells)) { changed = true; return; }
      conflict = true;
      rows.push(cells); ids.push(id);
      return;
    }
    const width = Math.max(cells.length, baseCells.length, nowCells.length);
    rows.push(Array.from({length: width}, (_, col) => {
      const result = mergeOriginalValue(baseCells[col], nowCells[col], cells[col]);
      changed = changed || result.changed;
      conflict = conflict || result.conflict;
      return result.value ?? '';
    }));
    ids.push(id);
  });
  now.ids.forEach((id, i) => {
    if (baseById.has(id) || tobeIds.has(id)) return;   // 기준에 있던 줄(신규에서 지웠으면 그대로 둠)은 넘어감
    rows.push([...(now.rows[i] || [])]);
    ids.push(id);
    changed = true;
  });
  return {rows, ids, changed, conflict};
}

/**
 * 정의서 항목 · ENTITY 내용 (제목 · 정의 칸 · 표 · ENTITY 연결)
 * @param {'service'|'object'|'code'|'entity'} tab
 * @returns {{item, changed, conflict}} item = 반영한 신규 (id · asisId · 이력은 신규 것 그대로)
 */
function mergeDefItemWithOriginal(tab, base, now, tobe) {
  const config = defConfigOf(tab);
  const title = mergeOriginalValue(base.title, now.title, tobe.title);
  const info = mergeOriginalInfo(base.info, now.info, tobe.info);
  const item = {...tobe, title: title.value ?? '', info: info.value, grids: {...(tobe.grids || {})}, rowIds: {...(tobe.rowIds || {})}};
  let changed = title.changed || info.changed, conflict = title.conflict || info.conflict;
  for (const [key] of config.grids) {
    const grid = mergeOriginalGrid(gridValueOf(base, key), gridValueOf(now, key), gridValueOf(tobe, key));
    item.grids[key] = grid.rows;
    item.rowIds[key] = grid.ids;
    changed = changed || grid.changed;
    conflict = conflict || grid.conflict;
  }
  if (config.entityLinks) {
    const links = mergeOriginalValue(base.entityIds, now.entityIds, tobe.entityIds, sameIdSet);
    if (links.changed) item.entityIds = [...(links.value || [])];
    changed = changed || links.changed;
    conflict = conflict || links.conflict;
  }
  return {item, changed, conflict};
}

/** SQL 파라미터 표를 {rows, ids} 로 */
const sqlParamsGrid = block => ({rows: block.params || [], ids: rowIdsOf(block.params || [], block.paramIds)});

/**
 * SQL 블록 (제목 · 본문 · 정의 칸 · 파라미터). 셋 다 {title, sql, info, params, paramIds}
 * @returns {{block: {title, sql, info, params, paramIds}, changed, conflict}}
 */
function mergeSqlBlockWithOriginal(base, now, tobe) {
  const title = mergeOriginalValue(base.title, now.title, tobe.title);
  const sql = mergeOriginalValue(base.sql, now.sql, tobe.sql, sameSqlText);
  const info = mergeOriginalInfo(base.info, now.info, tobe.info);
  const params = mergeOriginalGrid(sqlParamsGrid(base), sqlParamsGrid(now), sqlParamsGrid(tobe));
  return {
    block: {title: title.value ?? '', sql: sql.value ?? '', info: info.value, params: params.rows, paramIds: params.ids},
    changed: title.changed || sql.changed || info.changed || params.changed,
    conflict: title.conflict || sql.conflict || info.conflict || params.conflict
  };
}

/**
 * 기준이 없을 때: 신규에서 고친 적이 없으면 원본 내용으로 통째로 바꿈
 * @param {object} replaced 원본 내용으로 바꾼 신규
 * @param {boolean} differs 바꾼 것이 지금 신규와 다른지
 * @param {boolean} edited 신규에서 고친 기록이 있는지
 */
function replaceIfUntouched(tobe, replaced, differs, edited) {
  if (!differs) return {item: tobe, changed: false, conflict: false};
  if (edited) return {item: tobe, changed: false, conflict: true};
  return {item: replaced, changed: true, conflict: false};
}

/**
 * 정의서 항목 · SQL 블록이 원본에서 복사된 뒤 신규에서 고친 기록이 있는지
 * 복사할 때 원본의 이력도 함께 오므로 마지막 '원본에서 복사' 뒤만 봅니다 (그 표시가 없으면 전체)
 */
function wasEditedInTobe(log) {
  const entries = log || [];
  let start = 0;
  entries.forEach((entry, i) => { if (logSourceOf(entry) === 'system' && entry.text === '원본에서 복사') start = i + 1; });
  return entries.slice(start).some(entry => logSourceOf(entry) === 'system' && entry.text.startsWith('수정'));
}

/**
 * ENTITY 가 잠겨 있는 동안(= 신규를 고칠 때) 고친 기록이 있는지 — ENTITY 는 원본 · 신규 이력이 한 목록이라
 * '원본 잠금' / '원본 다시 잠금' ~ '잠금 풀기' 사이의 '수정 · …'만 신규에서 고친 것으로 봅니다
 */
function wasEntityEditedWhileLocked(log) {
  let locked = false;
  for (const entry of log || []) {
    if (logSourceOf(entry) !== 'system') continue;
    if (entry.text.startsWith('원본 잠금') || entry.text.startsWith('원본 다시 잠금')) locked = true;
    else if (entry.text.startsWith('잠금 풀기')) locked = false;
    else if (locked && entry.text.startsWith('수정')) return true;
  }
  return false;
}

/** 반영한 신규 항목에 남길 이력 글 — 무엇이 바뀌었는지는 수정 이력 글('수정 · …')의 뒷부분을 씀 */
const syncLogText = changeText => ORIGINAL_SYNC_LOG_PREFIX + (changeText ? changeText.replace(/^수정/, '') : '');
