/* ==========================================================================
   entity-data.js — 프로젝트 공통 ENTITY 데이터 (루트의 ENTITY_FILE)
     화면 · 보고서 · 삭제 확인이 함께 씁니다 (화면 요소는 건드리지 않음).

   ENTITY 하나 = {id, asis, tobe, locked, savedAt, hash, unlockLog, log}
     asis / tobe : 원본 / 신규 내용 {title, info, grids, rowIds} — 없으면 null
                   asis 가 null 이면 '원본 없는 새 ENTITY' (처음부터 신규만 고침)
     locked      : 원본이 잠겼는지 — 잠그면 원본을 신규로 복사하고, 이후 신규를 고침 (ENTITY 마다 따로)
     savedAt     : 처음 잠근 시각 · hash: 잠글 때 원본 해시 (원본 확인)
     unlockLog   : 잠금 해제 이력 [{at, by, reason, relockedAt}] · log: 이력 [{at, by, text, source}]
     unlockBase  : 잠금을 풀 때의 원본 (다시 잠글 때 고친 원본을 신규에 반영하는 기준 — original-sync.js). 잠겨 있으면 없음
   서비스는 항목의 entityIds 로 ENTITY 를 가리킵니다 (screen-entity-links.js).
   ========================================================================== */

/** 지금 고치는 쪽: 잠겼으면 신규, 원본이 있으면 원본, 원본 없는 새 ENTITY 는 신규 */
const entityLayerOf = record => (record.locked || !record.asis ? 'tobe' : 'asis');

/** 화면에 보일 이름 (고치는 쪽 → 원본 → 신규 순) */
const entityRecordTitle = record => ((record[entityLayerOf(record)] || record.asis || record.tobe || {}).title || UNNAMED_DEF_TITLE);

/** 내용 하나를 화면에서 쓰는 모양으로 (normalizeDefItem 재사용) */
function normalizeEntityLayer(layer) {
  if (!layer) return null;
  const {title, info, grids, rowIds} = normalizeDefItem('entity', {...layer, id: ''});
  return {title, info, grids, rowIds};
}

/** 저장된 ENTITY 를 화면에서 쓰는 모양으로 */
const normalizeEntity = raw => ({
  id: raw.id,
  asis: normalizeEntityLayer(raw.asis),
  tobe: normalizeEntityLayer(raw.tobe),
  locked: !!raw.locked,
  savedAt: raw.savedAt || '',
  hash: raw.hash || '',
  unlockLog: raw.unlockLog || [],
  unlockBase: normalizeEntityLayer(raw.unlockBase),
  log: raw.log || []
});

/** 프로젝트의 모든 ENTITY 읽기 (파일이 없으면 빈 목록) */
async function loadEntities(root) {
  const saved = await readJson(root, ENTITY_FILE, []);
  return (Array.isArray(saved) ? saved : []).map(normalizeEntity);
}

/** 내용 하나를 파일에 저장하는 모양으로 (빈 정의 칸은 적지 않음) */
const storedEntityLayer = layer => (layer
  ? {title: layer.title, ...(Object.keys(layer.info || {}).length ? {info: layer.info} : {}), grids: layer.grids, rowIds: layer.rowIds}
  : null);

/** ENTITY 를 파일에 저장하는 모양으로 */
const storedEntity = record => ({
  id: record.id,
  asis: storedEntityLayer(record.asis),
  tobe: storedEntityLayer(record.tobe),
  locked: record.locked,
  ...(record.savedAt ? {savedAt: record.savedAt} : {}),
  ...(record.hash ? {hash: record.hash} : {}),
  ...(record.unlockLog.length ? {unlockLog: record.unlockLog} : {}),
  ...(record.unlockBase ? {unlockBase: storedEntityLayer(record.unlockBase)} : {}),
  ...(record.log.length ? {log: record.log} : {})
});

/** 프로젝트의 ENTITY 모두 저장 */
const saveEntities = (root, records) => writeJson(root, ENTITY_FILE, records.map(storedEntity));

/** 원본 해시 (잠글 때 기록 · 확인할 때 같은 방식으로 계산) */
const entityOriginalHash = async record => sha256(new Blob([JSON.stringify(storedEntityLayer(record.asis))], {type: 'application/json'}));

/** 잠긴 원본이 잠글 때와 다른지 (해시가 없으면 확인하지 않음 → false) */
async function isEntityOriginalChanged(record) {
  return !!(record.locked && record.hash && (await entityOriginalHash(record)) !== record.hash);
}

/** 원본 내용을 신규의 시작점으로 복사 (줄 id 그대로 — 줄끼리 짝지어짐) */
const copyEntityLayer = layer => JSON.parse(JSON.stringify(layer));

/** ENTITY 이름 찾기 (열린 화면의 ENTITY → 보고서용 목록 순, 없으면 id 그대로) — 이력 · 보고서 글에 씀 */
function entityTitleOf(id) {
  const records = (app.screen && app.screen.entities) || app.entityCache || [];
  const record = records.find(other => other.id === id);
  return record ? entityRecordTitle(record) : id;
}

/**
 * 프로젝트에서 그 ENTITY 를 쓰는 서비스 (등록된 내용 기준)
 * 화면마다 서비스 탭에서 지금 고치는 쪽(잠겼으면 신규, 아니면 원본)만 봅니다 — 그 화면을 열면 보이는 것과 같게
 * @returns {Promise<{path: string[], itemId: string, title: string}[]>}
 */
async function findEntityUsages(root, entityId) {
  const usages = [];
  for (const {dir, path, meta} of await findAllScreens(root)) {
    const locked = isTabLockedIn(meta, 'service');
    const layers = await loadDefLayers(dir, 'service', locked);
    for (const item of locked ? layers.tobe : layers.asis) {
      if ((item.entityIds || []).includes(entityId)) usages.push({path, itemId: item.id, title: item.title || UNNAMED_DEF_TITLE});
    }
  }
  return usages;
}
