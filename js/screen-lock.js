/* ==========================================================================
   screen-lock.js — 탭별 원본 잠그기 · 잠금 풀기 · 원본 확인(해시)

   원본/신규가 있는 탭(LAYER_TABS: SQL · 서비스 · 오브젝트 · 공통코드관리)마다 잠금이 하나씩 있고,
   잠금이 곧 그 탭의 작업 단계입니다 (meta.tabLocks[탭] — 읽기 · 예전 값 변환은 screen-data.js tabLocksOf).
     원본 단계(잠그기 전): 그 탭에 원본을 입력. 저장 바 [등록]은 원본을 임시로 저장
     [원본 등록 후 잠그기]: 바뀐 내용을 모두 등록 → 그 탭에서 아직 신규 쪽에 없는 원본 항목을 신규로 복사 → 해시 기록 → 잠금
     신규 단계(잠근 뒤): 그 탭에서 신규를 고침. 원본과 다른 곳은 screen-changes.js 가 표시
     [잠금 풀기]: 사유를 받아 그 탭의 이력에 남기고 원본 단계로 (신규 작업 내용은 그대로 보관)
                 이때의 원본을 기준으로 기억해 둠(unlockBase) → 다시 잠글 때 고친 원본을 신규에서 손대지 않은 칸에 반영 (original-sync.js)
   잠그거나 풀면 화면 전체를 다시 그립니다 — 단계마다 보이는 쪽과 고칠 수 있는 칸이 다르기 때문입니다.
   안내 띠와 단추는 각 탭 맨 위에 있습니다 (tabPhaseHtml).
   ========================================================================== */

/* 잠금을 풀 때 받는 사유의 최소 길이 (한두 글자로 넘기지 못하게) */
const MIN_UNLOCK_REASON_LENGTH = 5;

/** 열린 화면의 그 탭이 잠겼는지 (= 신규 단계인지) */
const isTabLocked = tab => isTabLockedIn(app.screen.meta, tab);

/** 그 탭에서 지금 고치는 쪽: 원본 단계면 'asis', 신규 단계면 'tobe' */
const layerOf = tab => (isTabLocked(tab) ? 'tobe' : 'asis');

/* ======================= 탭 위 안내 ======================= */

/** 단계 안내 띠 — 신규 단계: 잠김 + [잠금 풀기] / 원본 단계: 안내 + [원본 등록 후 잠그기] */
function phaseBannerHtml(meta, tab) {
  const lock = tabLocksOf(meta)[tab];
  const label = layerTabLabel(tab);
  // 신규 화면: 원본이 없어 잠그기 · 잠금 풀기 단추가 없음
  if (isNewScreen(meta)) {
    return `<div class="banner note">${ICON.info}<b>신규 화면 · 원본 없음</b>`
      + `<span class="muted">처음부터 새로 만드는 화면이라 원본을 넣거나 잠그지 않습니다. ${label} 신규를 바로 작성하세요.</span></div>`;
  }
  if (lock.locked) {
    return `<div class="banner note">${ICON.info}<b>${label} 원본 잠김 · 신규 작업 중</b>`
      + `<span class="muted">${escapeHtml(lock.savedAt)} 등록. 원본과 다른 곳은 색으로 표시됩니다.</span><span class="sp"></span>`
      + `<button type="button" class="btn btn-s" data-unlock-tab="${tab}" title="사유를 남기면 이 탭의 원본을 다시 고칠 수 있습니다">${ICON.unlock}잠금 풀기</button></div>`;
  }
  const reopened = lock.unlockLog.length > 0;
  const head = reopened
    ? `${ICON.info}<b>잠금이 풀려 있습니다 · ${label} 원본 수정 중</b><span class="muted">원본을 고친 뒤 다시 잠가 주세요. 신규 작업 내용은 그대로 보관되어 있습니다.</span>`
    : `${ICON.info}<b>${label} 원본 단계</b><span class="muted">이 탭에 원본을 넣고 잠그세요. 잠근 뒤부터 이 탭은 신규 작업을 합니다.</span>`;
  return `<div class="banner pre-lock">${head}<span class="sp"></span><button type="button" class="btn btn-s btn-primary" data-lock-tab="${tab}">`
    + `${reopened ? '고친 원본 다시 잠그기' : '원본 등록 후 잠그기'}</button></div>`;
}

/**
 * 탭 맨 위: 단계 안내
 * 잠금 · 잠금 풀기(사유) 기록은 따로 띠로 보이지 않고 항목 이력의 [화면]에 나옵니다 (change-log.js screenLogEntries)
 */
const tabPhaseHtml = tab => `<div class="phase">${phaseBannerHtml(app.screen.meta, tab)}</div>`;

/* ======================= 탭마다 다른 부분 ======================= */

/** 그 탭에 잠글 원본이 하나라도 있는지 (SQL 은 예전에 올린 원본 파일도) */
function hasOriginalContent(tab) {
  const screen = app.screen;
  if (tab !== 'sql') return readDefInputs(tab).length > 0;
  return readBlockInputs('asis').length > 0 || screen.savedFiles.asis.length > 0 || screen.pendingFiles.asis.length > 0;
}

/** 그 탭의 원본을 지금 모양으로 저장 (바뀌지 않았어도 — 예전 파일 구조에서 읽은 원본도 새 파일로 남겨 해시를 기록하기 위함) */
async function saveOriginalOf(tab) {
  if (tab !== 'sql') return saveDefItems(tab);
  await saveAsisBlocks();
  await savePendingFiles('asis');
}

/** 신규 블록들이 짝으로 가리키는 원본 SQL 블록 id (짝 규칙은 findPairedAsisBlock) */
function pairedAsisSqlIds(tobeList, asisList) {
  const ids = new Set();
  tobeList.forEach((tobeBlock, order) => {
    const paired = findPairedAsisBlock(tobeBlock, order, asisList);
    if (paired) ids.add(paired.id);
  });
  return ids;
}

/**
 * 이번에 새로 넣은 원본 항목을 신규 쪽으로 복사 (신규 작업의 시작점)
 *   복사 대상: 신규 쪽 어느 항목도 가리키지 않고, 지난번 잠글 때(lockedIds)에도 없던 원본 항목
 *   — 지난번에도 있었는데 신규에 없으면 사용자가 신규에서 지운 것이므로 다시 넣지 않습니다.
 *   예전에 잠근 적이 있지만 lockedIds 가 없는 SQL 탭(원본/신규 구조 전)은 복사하지 않습니다.
 *   (그때는 '신규에 없는 원본 SQL = 지운 쿼리'였기 때문)
 * 파일에서 읽어 파일에 씁니다 (호출 전에 원본 저장이 끝나 있어야 함). 화면은 잠근 뒤 다시 그립니다.
 * @param {object} lock 잠그기 전의 그 탭 잠금 정보
 */
async function copyNewOriginalsToTobe(dir, meta, tab, lock) {
  const lockedBefore = new Set(lock.lockedIds || []);
  if (tab !== 'sql') {
    const {asis, tobe} = await loadDefLayers(dir, tab, false);   // 신규 파일이 없으면 빈 목록
    const pointed = new Set(tobe.map(item => item.asisId).filter(Boolean));
    const copies = asis.filter(item => !pointed.has(item.id) && !lockedBefore.has(item.id))
      .map(item => ({...copyDefItemAsTobe(item), log: [...(item.log || []), systemLogEntry('원본에서 복사')]}));
    await writeJson(dir, defLayerFile(tab, 'tobe'), [...tobe, ...copies].map(storedDefItem));
    return;
  }
  if (lock.lockedIds === null && lock.savedAt) return;
  const asisList = (meta.sqlBlocks && meta.sqlBlocks.asis) || [];
  const tobeList = [...((meta.sqlBlocks && meta.sqlBlocks.tobe) || [])];
  const paired = pairedAsisSqlIds(tobeList, asisList);
  for (const block of asisList) {
    if (paired.has(block.id) || lockedBefore.has(block.id)) continue;
    const id = newBlockId();
    const file = `tobe/sql/${id}.sql`;
    await writeFile(dir, file, (await readText(dir, block.file)) || '');
    tobeList.push({id, title: block.title, file, asisId: block.id, ...sqlDefinitionOf(block), log: [...(block.log || []), systemLogEntry('원본에서 복사')]});
  }
  meta.sqlBlocks = {...(meta.sqlBlocks || {}), tobe: tobeList};
}

/**
 * 잠금을 풀 때의 원본 (다시 잠글 때 '신규에서 손대지 않은 칸'을 가리는 기준 — 잠금 정보의 unlockBase 로 meta.json 에 저장)
 *   정의서: 항목의 내용(제목 · 정의 칸 · 표 · ENTITY 연결) / SQL: 블록의 제목 · 본문 · 정의 칸 · 파라미터
 */
async function originalSnapshotOf(dir, meta, tab) {
  if (tab !== 'sql') {
    return (await loadDefLayers(dir, tab, false)).asis
      .map(item => cloneJson({id: item.id, title: item.title, info: item.info, grids: item.grids, rowIds: item.rowIds, entityIds: item.entityIds || []}));
  }
  return (await loadSqlBlocks(dir, meta, 'asis'))
    .map(block => cloneJson({id: block.id, title: block.title, sql: block.sql, info: block.info || {}, params: block.params || [], paramIds: block.paramIds || []}));
}

/**
 * 다시 잠글 때: 잠금을 푼 동안 고친 원본을 짝인 신규 항목에 반영 (규칙은 original-sync.js 머리 설명)
 * 원본 저장 · 새 원본 복사(copyNewOriginalsToTobe)가 끝난 뒤 부릅니다. SQL 은 meta.sqlBlocks 를 고치므로 부른 쪽이 saveMeta
 * @param {object} lock 잠그기 전의 그 탭 잠금 정보 (unlockBase 가 없으면 예전에 푼 잠금 — 신규에서 고친 기록으로 가림)
 * @returns {Promise<{synced: string[], skipped: string[]}>} 반영한 항목 이름 / 신규에서 따로 고쳐 다 반영하지 못한 항목 이름
 */
async function syncEditedOriginalsToTobe(dir, meta, tab, lock) {
  const base = Array.isArray(lock.unlockBase) ? new Map(lock.unlockBase.map(item => [item.id, item])) : null;
  const result = {synced: [], skipped: []};
  const record = (title, outcome) => {
    if (outcome.changed) result.synced.push(title);
    if (outcome.conflict) result.skipped.push(title);
  };

  if (tab !== 'sql') {
    const {asis, tobe} = await loadDefLayers(dir, tab, false);
    const asisById = new Map(asis.map(item => [item.id, item]));
    const merged = tobe.map(item => {
      const now = item.asisId ? asisById.get(item.asisId) : null;
      if (!now || (base && !base.has(now.id))) return item;   // 짝 없음 · 이번에 새로 넣은 원본(방금 복사됨)
      const outcome = base
        ? mergeDefItemWithOriginal(tab, base.get(now.id), now, item)
        : replaceDefItemWithOriginal(tab, now, item);
      record(item.title || UNNAMED_DEF_TITLE, outcome);
      if (outcome.changed) appendSystemLog(outcome.item, syncLogText(defChangeLogText(tab, item, outcome.item)));
      return outcome.item;
    });
    if (result.synced.length) await writeJson(dir, defLayerFile(tab, 'tobe'), merged.map(storedDefItem));
    return result;
  }

  if (!meta.sqlBlocks) return result;
  const asisBlocks = await loadSqlBlocks(dir, meta, 'asis');
  const tobeList = [];
  for (const [order, entry] of (meta.sqlBlocks.tobe || []).entries()) {
    const now = findPairedAsisBlock(entry, order, asisBlocks);
    if (!now || (base && !base.has(now.id))) { tobeList.push(entry); continue; }
    const current = {title: entry.title, sql: (await readText(dir, entry.file)) || '', info: entry.info || {}, params: entry.params || [], paramIds: entry.paramIds || []};
    const outcome = base
      ? mergeSqlBlockWithOriginal(base.get(now.id), now, current)
      : replaceSqlBlockWithOriginal(now, current, entry.log);
    record(entry.title, outcome);
    if (!outcome.changed) { tobeList.push(entry); continue; }
    const after = outcome.block;
    if (!sameSqlText(after.sql, current.sql)) await writeFile(dir, entry.file, after.sql);
    const {info: _info, params: _params, paramIds: _paramIds, ...rest} = entry;   // 정의 · 파라미터는 반영한 값으로 다시 씀
    const updated = {...rest, title: after.title, ...sqlDefinitionOf(after)};
    appendSystemLog(updated, syncLogText(sqlChangeLogText(sqlLogShape(entry.asisId, current), sqlLogShape(entry.asisId, after))));
    tobeList.push(updated);
  }
  meta.sqlBlocks = {...meta.sqlBlocks, tobe: tobeList};
  return result;
}

/** 수정 이력 글(sqlChangeLogText)이 받는 모양 */
const sqlLogShape = (asisId, block) => ({title: block.title, asisId, sql: block.sql,
  definition: {info: block.info, params: block.params, paramIds: block.paramIds}});

/** 기준이 없을 때(예전에 푼 잠금) 정의서 항목: 신규에서 고친 적이 없으면 원본 내용으로 */
function replaceDefItemWithOriginal(tab, now, tobe) {
  const replaced = {...tobe, title: now.title, info: cloneJson(now.info || {}), grids: cloneJson(now.grids), rowIds: cloneJson(now.rowIds),
    ...(defConfigOf(tab).entityLinks ? {entityIds: [...(now.entityIds || [])]} : {})};
  return replaceIfUntouched(tobe, replaced, diffDefItem(tab, tobe, replaced).state !== 'same', wasEditedInTobe(tobe.log));
}

/** 기준이 없을 때(예전에 푼 잠금) SQL 블록: 신규에서 고친 적이 없으면 원본 내용으로 */
function replaceSqlBlockWithOriginal(now, current, log) {
  const replaced = cloneJson({title: now.title, sql: now.sql, info: now.info || {}, params: now.params || [], paramIds: rowIdsOf(now.params || [], now.paramIds)});
  const differs = sqlChangeLogText(sqlLogShape('', current), sqlLogShape('', replaced)) !== '';
  const outcome = replaceIfUntouched(current, replaced, differs, wasEditedInTobe(log));
  return {block: outcome.item, changed: outcome.changed, conflict: outcome.conflict};
}

/**
 * 다시 잠근 뒤 알림 — 반영한 것은 알림(toast)으로, 다 반영하지 못한 것은 창으로 (무엇을 확인할지 남도록)
 * @param {string} where 탭 이름 또는 'ENTITY'
 */
async function showOriginalSyncResult(where, sync) {
  if (sync.synced.length) toast(`고친 원본을 ${where} 신규 ${sync.synced.length}개 항목에 반영했습니다.`);
  if (!sync.skipped.length) return;
  await askConfirm({
    title: '신규에 다 반영하지 못한 원본 변경',
    desc: '잠금을 푼 동안 원본을 고쳤지만, 같은 곳을 신규에서도 따로 고쳐 신규 값을 그대로 두었습니다.\n'
      + '원본과 다른 곳은 색으로 표시되니 확인하고 필요하면 신규를 직접 맞춰 주세요.\n\n'
      + sync.skipped.map(title => '· ' + title).join('\n'),
    okText: '확인',
    noCancel: true
  });
}

/** 그 탭의 지금 원본 항목 id (다음에 다시 잠글 때 비교용 — lockedIds) */
async function originalIdsOf(dir, meta, tab) {
  if (tab === 'sql') return ((meta.sqlBlocks && meta.sqlBlocks.asis) || []).map(block => block.id);
  return (await loadDefLayers(dir, tab, false)).asis.map(item => item.id);
}

/**
 * 그 탭의 원본 해시
 *   SQL   : 원본 SQL 파일 + 예전 원본 파일(asis/files) + meta.json 안의 원본 SQL 목록(정의 · 파라미터 포함)
 *   정의서: <dir>/asis.json
 * 저장이 끝난 파일에서 다시 읽어 계산하므로, 잠금을 풀고 고친 뒤 다시 잠글 때도 지금 내용이 기준이 됩니다.
 * @returns {Promise<object>} {경로 또는 META_HASH_TARGETS 키: 해시}
 */
async function hashOriginalOf(dir, meta, tab, savedAsisFilePaths) {
  const hashes = {};
  const paths = tab === 'sql'
    ? [...((meta.sqlBlocks && meta.sqlBlocks.asis) || []).map(block => block.file), ...savedAsisFilePaths.map(path => FILE_DIRS.asis + '/' + path)]
    : [defLayerFile(tab, 'asis')];
  for (const path of paths) {
    const file = await readFile(dir, path);
    if (file) hashes[path] = await sha256(file);
  }
  if (tab === 'sql') {
    for (const key of Object.keys(META_HASH_TARGETS)) hashes[key] = await sha256(metaHashBlob(key, meta));
  }
  return hashes;
}

/* ======================= 잠그기 ======================= */

/** 아직 열려 있는(다시 잠그지 않은) 해제 이력에 다시 잠근 시각을 적은 새 목록 */
function closeLastUnlockEntry(log) {
  if (!log.length || lastOf(log).relockedAt) return log;
  return [...log.slice(0, -1), {...lastOf(log), relockedAt: new Date().toISOString()}];
}

/** [원본 등록 후 잠그기] / [고친 원본 다시 잠그기] — 그 탭만. 되돌리기 어려우므로 확인을 받음 */
async function lockTab(tab) {
  const screen = app.screen;
  const lock = tabLocksOf(screen.meta)[tab];
  const label = layerTabLabel(tab);
  const reopened = lock.unlockLog.length > 0;
  if (!hasOriginalContent(tab)) return toast(`잠글 ${label} 원본이 없습니다. 먼저 원본을 넣어 주세요.`);
  const pathError = pendingPathError();
  if (pathError) return toast(pathError);
  // 잠글 때도 등록이 일어나므로 저장 서비스의 ENTITY 필수를 지킴 (서비스 탭은 바뀌지 않았어도 다시 저장함)
  if ((tab === 'service' || isDirty('service')) && await blockServicesWithoutEntity()) return;
  const ok = await askConfirm({
    title: `${label} ${reopened ? '고친 원본 다시 잠그기' : '원본 등록 후 잠그기'}`,
    desc: (reopened
      ? `다시 잠그면 지금 ${label} 원본이 새 기준이 되고, 고칠 수 없습니다.\n잠금을 푼 동안 새로 넣은 원본 항목은 신규 쪽에도 복사되고,\n고친 원본 내용은 신규에서 손대지 않은 칸에 반영됩니다.\n잠금을 풀 때 남긴 사유는 이력에 그대로 남습니다.`
      : `${label} 탭의 원본을 등록하고 잠급니다. 잠근 뒤에는 원본을 고칠 수 없습니다.\n원본은 신규 쪽으로 복사되고, 이후 신규를 고치면 원본과 다른 곳이 표시됩니다.`)
      + '\n등록하지 않은 다른 변경도 함께 등록됩니다. 계속할까요?',
    okText: reopened ? '다시 잠그기' : '등록 후 잠그기'
  });
  if (!ok) return;

  let sync = {synced: [], skipped: []};
  try {
    await withBusy(`${label} 원본을 등록하고 잠그는 중…`, async () => {
      const {dir, meta} = screen;
      // 1) 바뀐 내용 등록 (화면을 다시 그리면 사라지므로) + 이 탭의 원본은 바뀌지 않았어도 지금 모양으로 다시 저장
      await saveSections(SAVE_SECTIONS.map(([section]) => section).filter(section => section !== tab && isDirty(section)));
      await saveOriginalOf(tab);
      // 2) 새로 넣은 원본을 신규 쪽으로 복사 + 다시 잠그면 고친 원본을 신규에서 손대지 않은 칸에 반영
      await copyNewOriginalsToTobe(dir, meta, tab, lock);
      if (reopened) sync = await syncEditedOriginalsToTobe(dir, meta, tab, lock);
      // 3) 해시 · 잠금 정보 저장. 다시 잠근 경우 마지막 해제 이력에 '다시 잠근 시각'을 적음
      setTabLock(meta, tab, {
        locked: true,
        savedAt: lock.savedAt || new Date().toLocaleString('ko-KR'),   // 처음 잠근 시각은 그대로 보존
        lockedIds: await originalIdsOf(dir, meta, tab),
        hashes: await hashOriginalOf(dir, meta, tab, screen.savedFiles.asis),
        unlockLog: closeLastUnlockEntry(lock.unlockLog)
      });
      addActivityLog(meta, `${label} 원본 ${reopened ? '다시 ' : ''}잠금`);
      await saveMeta();
    });
  } catch (error) {
    toastError('저장 실패', error);
    return;
  }
  await openScreen(screen.path, true);   // 이 탭을 신규 단계 화면으로 다시 그림
  toast(reopened ? `고친 ${label} 원본을 다시 잠갔습니다.` : `${label} 원본을 등록하고 잠갔습니다. 이제 이 탭은 신규 작업을 합니다.`);
  if (reopened) await showOriginalSyncResult(label, sync);
}

/* ======================= 잠금 풀기 ======================= */

/**
 * [잠금 풀기] — 그 탭만. 사유를 반드시 받아 그 탭의 이력에 남기고 원본 단계로
 * 원본 보관이 목적인 도구이므로 사유 없이는 풀 수 없게 막고, 남긴 사유는 지울 수 없습니다.
 * 등록하지 않은 변경이 있으면 먼저 등록합니다 (화면을 다시 그리면 사라지므로).
 */
async function unlockTab(tab) {
  const screen = app.screen;
  if (!screen || !isTabLocked(tab)) return;
  if (isNewScreen(screen.meta)) return toast('신규 화면은 원본이 없어 잠금을 풀 수 없습니다.');
  const label = layerTabLabel(tab);
  if (hasUnsavedChanges()) {
    const saveFirst = await askConfirm({
      title: '등록하지 않은 변경이 있습니다',
      desc: '잠금을 풀기 전에 지금 변경을 먼저 등록합니다. 계속할까요?',
      okText: '등록하고 계속'
    });
    if (!saveFirst || !(await saveDirtySections())) return;
  }
  const answer = await askText({
    title: `${label} 원본 잠금 풀기`,
    desc: '원본은 변경 전 상태를 그대로 남겨 두기 위해 잠가 둡니다.\n잘못 넣은 원본을 바로잡거나 원본을 더 넣을 때만 잠금을 풀어 주세요.\n잠금을 푼 동안 이 탭의 신규 작업 내용은 그대로 보관됩니다.',
    label: '잠금을 푸는 사유 (필수)',
    placeholder: '예: 등록 당시 누락된 WHERE 절 보완 (티켓 A-123)',
    hint: `적으신 사유는 이 화면 ${label} 탭 이력([화면])에 남고, 지울 수 없습니다.`,
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
      const lock = tabLocksOf(screen.meta)[tab];
      setTabLock(screen.meta, tab, {
        ...lock,
        locked: false,
        unlockBase: await originalSnapshotOf(screen.dir, screen.meta, tab),   // 다시 잠글 때 신규에 반영할 기준 (다시 잠그면 지워짐)
        unlockLog: [...lock.unlockLog, {at: new Date().toISOString(), by: currentWorkerName(), reason: answer.value, relockedAt: ''}]
      });
      addActivityLog(screen.meta, `${label} 잠금 풀기 (사유: ${answer.value})`);
      await saveMeta();
    });
  } catch (error) {
    toastError('저장 실패', error);
    return;
  }
  await openScreen(screen.path, true);   // 이 탭을 원본 단계 화면으로 다시 그림
  toast(`${label} 잠금을 풀었습니다. 원본을 고친 뒤 다시 잠가 주세요.`);
}

/* ======================= 원본 확인 ======================= */

/** 원본 확인 표시 (상단 작업 정보 줄): 잠긴 탭들의 원본이 잠글 때와 같은지 + 잠금을 풀어 둔 탭 */
async function verifyIntegrity() {
  const badge = $('#integrity');
  if (!badge) return;
  const screen = app.screen;
  const reopened = reopenedTabs(screen.meta).map(layerTabLabel);
  const reopenedTag = reopened.length ? `<span class="tag warn">${ICON.unlock}잠금 해제 중: ${escapeHtml(reopened.join(', '))}</span>` : '';
  if (isNewScreen(screen.meta)) {
    badge.innerHTML = '<span class="tag new-screen" title="원본 없이 처음부터 새로 만드는 화면입니다">신규 화면</span>';
    $('#warn').innerHTML = '';
    return;
  }
  if (!anyTabLocked(screen.meta)) {
    badge.innerHTML = reopenedTag || '<span class="tag">원본 단계</span>';
    $('#warn').innerHTML = '';
    return;
  }
  const changed = await findChangedFiles(screen.dir, lockedHashesOf(screen.meta));
  if (screen !== app.screen) return;   // 확인하는 사이 다른 화면으로 이동함
  badge.innerHTML = (changed.length
    ? `<span class="tag bad">${ICON.warn}원본 변경 감지</span>`
    : `<span class="tag ok">${ICON.check}원본 변경 없음</span>`) + reopenedTag;
  $('#warn').innerHTML = changed.length
    ? `<div class="banner bad">${ICON.warn}<div><b>잠글 때와 다른 원본이 있습니다.</b> 이 원본으로 복원하기 전에 확인하세요.`
      + `<ul>${changed.map(item => `<li><code>${escapeHtml(item.path + ' (' + item.reason + ')')}</code></li>`).join('')}</ul></div></div>`
    : '';
}
