/* ==========================================================================
   layer-diff.js — 원본(asis)과 신규(tobe) 비교 계산
     화면의 표시(screen-changes.js) · 보고서(report.js)가 함께 씁니다.
     값만 받아 결과를 돌려주는 함수만 둡니다 (화면 요소는 건드리지 않음).

   용어
     정의 칸 : info {칸 key: 값}            — 칸 목록은 SQL_INFO_FIELDS / DEF_TABS[탭].info
     표      : {rows: [[칸…]…], ids: [줄 id…]} — 줄은 줄 id 로 짝지음 (같은 id = 같은 줄)
     항목 상태: same(동일) · changed(변경) · new(신규 — 원본 없음) · gone(삭제됨 — 원본에만 있음)
   ========================================================================== */

/* 항목 상태 이름 (탭 줄 · 보고서). 동일은 따로 표시하지 않음 */
const ITEM_STATE_LABELS = {same: '동일', changed: '변경', new: '신규', gone: '삭제됨'};

/** 비교용 값 정리 (앞뒤 공백 무시, 없는 값은 '') */
const comparableValue = value => String(value ?? '').trim();

/**
 * 정의 칸 비교
 * @param {{key: string}[]} fields 칸 목록
 * @returns {string[]} 값이 다른 칸의 key
 */
const changedInfoKeys = (fields, before, after) => (fields || [])
  .map(field => field.key)
  .filter(key => comparableValue((before || {})[key]) !== comparableValue((after || {})[key]));

/** 항목의 표 하나를 비교용 모양으로 {rows, ids} */
const gridValueOf = (item, key) => {
  const rows = (item.grids && item.grids[key]) || [];
  return {rows, ids: rowIdsOf(rows, item.rowIds && item.rowIds[key])};
};

/**
 * 표 비교 — 줄은 줄 id 로 짝짓고, 짝이 있는 줄은 칸마다 비교
 * @param {{rows: string[][], ids: string[]}} before 원본
 * @param {{rows: string[][], ids: string[]}} after  신규
 * @param {number} columnCount 열 수
 * @returns {{added: Set<string>, deleted: {id: string, cells: string[]}[], changed: Map<string, number[]>}}
 *   added: 신규에만 있는 줄 id · deleted: 원본에만 있는 줄 · changed: 줄 id → 값이 다른 열 번호
 */
function diffGridRows(before, after, columnCount) {
  const beforeById = new Map(before.ids.map((id, i) => [id, before.rows[i] || []]));
  const afterIds = new Set(after.ids);
  const added = new Set(), changed = new Map();
  after.ids.forEach((id, i) => {
    const original = beforeById.get(id);
    if (!original) {
      added.add(id);
      return;
    }
    const cells = after.rows[i] || [];
    const columns = [];
    for (let col = 0; col < columnCount; col++) {
      if (comparableValue(original[col]) !== comparableValue(cells[col])) columns.push(col);
    }
    if (columns.length) changed.set(id, columns);
  });
  const deleted = before.ids.filter(id => !afterIds.has(id)).map(id => ({id, cells: beforeById.get(id)}));
  return {added, deleted, changed};
}

/** 표 비교 결과에 차이가 있는지 */
const hasGridDiff = diff => diff.added.size > 0 || diff.deleted.length > 0 || diff.changed.size > 0;

/**
 * 정의서 항목 비교
 * @param {string} tab 정의서 탭
 * @param {object|null} before 원본 항목 (없으면 신규 항목)
 * @param {object} after 신규 항목
 * @returns {{state, titleChanged, info: string[], grids: object, linksAdded: string[], linksRemoved: string[]}}
 *   grids: 표 키 → diffGridRows 결과 · links: 서비스의 ENTITY 연결(entityIds) 중 새로 연결 / 연결을 푼 id
 */
function diffDefItem(tab, before, after) {
  const {info: infoFields = [], grids: gridList} = defConfigOf(tab);
  if (!before) return {state: 'new', titleChanged: false, info: [], grids: {}, linksAdded: [], linksRemoved: []};
  const grids = Object.fromEntries(gridList.map(([key]) =>
    [key, diffGridRows(gridValueOf(before, key), gridValueOf(after, key), GRID_COLUMNS[`${tab}.${key}`].cols.length)]));
  const titleChanged = comparableValue(before.title) !== comparableValue(after.title);
  const info = changedInfoKeys(infoFields, before.info, after.info);
  const beforeLinks = before.entityIds || [], afterLinks = after.entityIds || [];
  const linksAdded = afterLinks.filter(id => !beforeLinks.includes(id));
  const linksRemoved = beforeLinks.filter(id => !afterLinks.includes(id));
  const changed = titleChanged || info.length > 0 || Object.values(grids).some(hasGridDiff) || linksAdded.length > 0 || linksRemoved.length > 0;
  return {state: changed ? 'changed' : 'same', titleChanged, info, grids, linksAdded, linksRemoved};
}

/**
 * SQL 정의 · 파라미터 비교 (SQL 본문은 diff.js 의 줄 비교로 따로)
 * @param {{info, params, paramIds}} before 원본 블록
 * @param {{info, params, paramIds}} after  신규 블록
 * @returns {{info: string[], params: object}} params: diffGridRows 결과
 */
const diffSqlDefinition = (before, after) => ({
  info: changedInfoKeys(SQL_INFO_FIELDS, before.info, after.info),
  params: diffGridRows(
    {rows: before.params || [], ids: rowIdsOf(before.params, before.paramIds)},
    {rows: after.params || [], ids: rowIdsOf(after.params, after.paramIds)},
    GRID_COLUMNS['sql.params'].cols.length)
});

/** SQL 정의 · 파라미터에 차이가 있는지 */
const hasSqlDefinitionDiff = diff => diff.info.length > 0 || hasGridDiff(diff.params);

/**
 * 신규 쪽 어느 항목도 가리키지 않는 원본 항목 = 신규에서 빠진(삭제된) 항목 (정의서용 — SQL 은 findPairedAsisBlock 규칙)
 * @param {{id: string}[]} asisItems
 * @param {{asisId?: string}[]} tobeItems
 */
function goneAsisItems(asisItems, tobeItems) {
  const pointed = new Set(tobeItems.map(item => item.asisId).filter(Boolean));
  return asisItems.filter(item => !pointed.has(item.id));
}
