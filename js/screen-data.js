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
 * @returns {Promise<{id, title, file, rb?, sql, rbText}[]>} rb = (예전) 롤백 SQL 파일
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
    const file = await readFile(dir, path);
    if (!file) changed.push({path, reason: '파일 없음'});
    else if (await sha256(file) !== savedHash) changed.push({path, reason: '내용이 달라짐'});
    if (stopAtFirst && changed.length) break;
  }
  return changed;
}
