/* ==========================================================================
   screen-lock.js — 원본 잠그기 · 잠금 풀기 · 원본 확인(해시)

   화면마다 잠금이 하나 있고, 잠금이 곧 작업 단계입니다 (meta.asisLocked).
     원본 단계(잠그기 전): 모든 탭에 원본을 입력. 저장 바 [등록]은 원본을 임시로 저장
     [원본 등록 후 잠그기]: 바뀐 내용을 모두 등록 → 아직 신규 쪽에 없는 원본 항목을 신규로 복사 → 해시 기록 → 잠금
     신규 단계(잠근 뒤): 모든 탭에서 신규를 고침. 원본과 다른 곳은 screen-changes.js 가 표시
     [잠금 풀기]: 사유를 받아 이력에 남기고 원본 단계로 (신규 작업 내용은 그대로 보관)
   잠그거나 풀면 화면 전체를 다시 그립니다 — 단계마다 보이는 쪽과 고칠 수 있는 칸이 다르기 때문입니다.

   잠금 관련 meta 값
     asisLocked     : 잠겼는지
     asisSavedAt    : 처음 잠근 시각 (다시 잠가도 그대로)
     asisLockedIds  : 지난번 잠글 때의 원본 항목 id {sql: [...], service: [...], …}
                      — 다시 잠글 때 '이번에 새로 넣은 원본'만 신규로 복사하기 위해 씀
     hashes         : 원본 파일 · meta.json 안의 원본 SQL 목록 해시 (findChangedFiles 로 확인)
     asisUnlockLog  : 잠금 해제 이력 [{at, by, reason, relockedAt}]
   ========================================================================== */

/* 잠금을 풀 때 받는 사유의 최소 길이 (한두 글자로 넘기지 못하게) */
const MIN_UNLOCK_REASON_LENGTH = 5;

/** 원본이 잠겼는지 (= 신규 단계인지) */
const isLocked = () => !!app.screen.meta.asisLocked;

/** 지금 고치는 쪽: 원본 단계면 'asis', 신규 단계면 'tobe' */
const currentLayer = () => (isLocked() ? 'tobe' : 'asis');

/** 잠금을 푼 적이 있는지 (처음 잠그기 전인지 / 다시 잠그는 것인지 구분할 때 씀) */
const wasAsisUnlocked = meta => (meta.asisUnlockLog || []).length > 0;

/* ======================= 화면 위 안내 ======================= */

/** 단계 안내 띠 — 신규 단계: 잠김 + [잠금 풀기] / 원본 단계: 안내 + [원본 등록 후 잠그기] */
function phaseBannerHtml(meta) {
  if (meta.asisLocked) {
    return `<div class="banner lock">${ICON.lock}<b>원본 잠김 · 신규 작업 단계</b>`
      + `<span class="muted">${escapeHtml(meta.asisSavedAt || '')} 등록. 원본과 다른 곳은 색으로 표시됩니다.</span><span class="sp"></span>`
      + `<button type="button" class="btn btn-s" id="unlockAsis" title="사유를 남기면 원본을 다시 고칠 수 있습니다">${ICON.unlock}잠금 풀기</button></div>`;
  }
  const reopened = wasAsisUnlocked(meta);
  const head = reopened
    ? `${ICON.unlock}<b>잠금이 풀려 있습니다 · 원본 수정 중</b><span class="muted">원본을 고친 뒤 다시 잠가 주세요. 신규 작업 내용은 그대로 보관되어 있습니다.</span>`
    : `${ICON.warn}<b>원본 단계</b><span class="muted">SQL · 서비스 · 오브젝트 · 공통코드관리에 원본을 넣고 잠그세요. 잠근 뒤부터 신규 작업을 합니다.</span>`;
  return `<div class="banner info">${head}<span class="sp"></span><button type="button" class="btn btn-s btn-primary" id="saveAsis">`
    + `${reopened ? '고친 원본 다시 잠그기' : '원본 등록 후 잠그기'}</button></div>`;
}

/** 잠금 해제 이력 띠 — 푼 적이 없으면 아무것도 그리지 않습니다 (해제 중·다시 잠근 뒤 모두 남음) */
function unlockLogBannerHtml(meta) {
  const entries = meta.asisUnlockLog || [];
  if (!entries.length) return '';
  const items = entries.map(entry => `<li>${escapeHtml(formatDateTime(entry.at))}`
    + `<span class="sep">·</span>${escapeHtml(entry.by || '-')}`
    + `<span class="sep">·</span><b>${escapeHtml(entry.reason || '')}</b>`
    + (entry.relockedAt
      ? `<span class="ul-end">${escapeHtml(formatDateTime(entry.relockedAt))} 다시 잠금</span>`
      : `<span class="ul-end open">아직 잠그지 않음</span>`)
    + `</li>`).join('');
  return `<div class="banner warn unlocklog">${ICON.unlock}<ul aria-label="잠금 해제 이력">${items}</ul></div>`;
}

/* ======================= 잠그기 ======================= */

/** 잠글 원본이 하나라도 있는지 (SQL · 정의서 항목 · 예전에 올린 원본 파일) */
function hasOriginalContent() {
  const screen = app.screen;
  return readBlockInputs('asis').length > 0
    || Object.keys(DEF_TABS).some(tab => readDefInputs(tab).length > 0)
    || screen.savedFiles.asis.length > 0 || screen.pendingFiles.asis.length > 0;
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
 *   복사 대상: 신규 쪽 어느 항목도 가리키지 않고, 지난번 잠글 때(asisLockedIds)에도 없던 원본 항목
 *   — 지난번에도 있었는데 신규에 없으면 사용자가 신규에서 지운 것이므로 다시 넣지 않습니다.
 *   예전에 잠근 적이 있지만 asisLockedIds 가 없는 화면(이 기능 전)은 SQL 을 복사하지 않습니다.
 *   (그때는 '신규에 없는 원본 SQL = 지운 쿼리'였기 때문)
 * 파일에서 읽어 파일에 씁니다 (호출 전에 원본 등록이 끝나 있어야 함). 화면은 잠근 뒤 다시 그립니다.
 */
async function copyNewOriginalsToTobe(dir, meta) {
  const lockedBefore = meta.asisLockedIds || {};
  const skipSql = !meta.asisLockedIds && !!meta.asisSavedAt;

  if (!skipSql) {
    const asisList = (meta.sqlBlocks && meta.sqlBlocks.asis) || [];
    const tobeList = [...((meta.sqlBlocks && meta.sqlBlocks.tobe) || [])];
    const paired = pairedAsisSqlIds(tobeList, asisList);
    const before = new Set(lockedBefore.sql || []);
    for (const block of asisList) {
      if (paired.has(block.id) || before.has(block.id)) continue;
      const id = newBlockId();
      const file = `tobe/sql/${id}.sql`;
      await writeFile(dir, file, (await readText(dir, block.file)) || '');
      tobeList.push({id, title: block.title, file, asisId: block.id, ...sqlDefinitionOf(block), ...blockLogOf(block)});
    }
    meta.sqlBlocks = {...(meta.sqlBlocks || {}), tobe: tobeList};
  }

  for (const tab of Object.keys(DEF_TABS)) {
    const {asis, tobe} = await loadDefLayers(dir, tab, false);   // 신규 파일이 없으면 빈 목록
    const before = new Set(lockedBefore[tab] || []);
    const pointed = new Set(tobe.map(item => item.asisId).filter(Boolean));
    const copies = asis.filter(item => !pointed.has(item.id) && !before.has(item.id)).map(copyDefItemAsTobe);
    await writeJson(dir, defLayerFile(tab, 'tobe'), [...tobe, ...copies].map(storedDefItem));
  }
}

/** 지금 원본 항목 id 들 (다음에 다시 잠글 때 비교용 — asisLockedIds) */
async function originalItemIds(dir, meta) {
  const ids = {sql: ((meta.sqlBlocks && meta.sqlBlocks.asis) || []).map(block => block.id)};
  for (const tab of Object.keys(DEF_TABS)) ids[tab] = (await loadDefLayers(dir, tab, false)).asis.map(item => item.id);
  return ids;
}

/**
 * 원본 해시 모음 — 원본 SQL 파일 + 예전 원본 파일(asis/files) + 정의서 원본 파일 + meta.json 안의 원본 SQL 목록(정의 · 파라미터 포함)
 * 저장이 끝난 파일에서 다시 읽어 계산하므로, 잠금을 풀고 고친 뒤 다시 잠글 때도 지금 내용이 기준이 됩니다.
 * @returns {Promise<object>} {경로 또는 META_HASH_TARGETS 키: 해시}
 */
async function hashOriginal(dir, meta, savedAsisFilePaths) {
  const hashes = {};
  const paths = [
    ...((meta.sqlBlocks && meta.sqlBlocks.asis) || []).map(block => block.file),
    ...savedAsisFilePaths.map(path => FILE_DIRS.asis + '/' + path),
    ...Object.keys(DEF_TABS).map(tab => defLayerFile(tab, 'asis'))
  ];
  for (const path of paths) {
    const file = await readFile(dir, path);
    if (file) hashes[path] = await sha256(file);
  }
  for (const key of Object.keys(META_HASH_TARGETS)) hashes[key] = await sha256(metaHashBlob(key, meta));
  return hashes;
}

/** [원본 등록 후 잠그기] / [고친 원본 다시 잠그기] — 되돌리기 어려우므로 확인을 받음 */
async function lockOriginal() {
  const screen = app.screen;
  const reopened = wasAsisUnlocked(screen.meta);
  if (!hasOriginalContent()) return toast('잠글 원본이 없습니다. SQL · 서비스 · 오브젝트 · 공통코드관리 중 한 곳 이상에 원본을 넣어 주세요.');
  const pathError = pendingPathError();
  if (pathError) return toast(pathError);
  const ok = await askConfirm({
    title: reopened ? '고친 원본 다시 잠그기' : '원본 등록 후 잠그기',
    desc: (reopened
      ? '다시 잠그면 지금 원본이 새 기준이 되고, 고칠 수 없습니다.\n잠금을 푼 동안 새로 넣은 원본 항목은 신규 쪽에도 복사됩니다.\n잠금 해제 이력은 그대로 남습니다.'
      : '모든 탭의 원본을 등록하고 잠급니다. 잠근 뒤에는 원본을 고칠 수 없습니다.\n원본은 신규 쪽으로 복사되고, 이후 신규를 고치면 원본과 다른 곳이 표시됩니다.')
      + '\n등록하지 않은 다른 변경도 함께 등록됩니다. 계속할까요?',
    okText: reopened ? '다시 잠그기' : '등록 후 잠그기'
  });
  if (!ok) return;

  try {
    await withBusy('원본을 등록하고 잠그는 중…', async () => {
      const {dir, meta} = screen;
      // 1) 바뀐 내용 등록 (원본 단계라 SQL · 정의서는 원본 쪽에 저장) + 원본은 바뀌지 않았어도 지금 모양으로 다시 저장
      //    (예전 파일 구조에서 읽은 원본도 새 파일로 남겨 해시를 기록하기 위함)
      const isOriginalSection = section => section === 'sql' || section in DEF_TABS;
      await saveSections(SAVE_SECTIONS.map(([section]) => section).filter(section => !isOriginalSection(section) && isDirty(section)));
      await saveAsisBlocks();
      await savePendingFiles('asis');
      for (const tab of Object.keys(DEF_TABS)) await saveDefItems(tab);
      // 2) 새로 넣은 원본을 신규 쪽으로 복사
      await copyNewOriginalsToTobe(dir, meta);
      // 3) 해시 · 잠금 표시 저장. 다시 잠근 경우 마지막 해제 이력에 '다시 잠근 시각'을 적음
      meta.asisLockedIds = await originalItemIds(dir, meta);
      meta.hashes = await hashOriginal(dir, meta, screen.savedFiles.asis);
      meta.asisLocked = true;
      if (!meta.asisSavedAt) meta.asisSavedAt = new Date().toLocaleString('ko-KR');   // 최초 등록 시각은 그대로 보존
      closeLastUnlockEntry(meta);
      await saveMeta();
    });
  } catch (error) {
    toastError('저장 실패', error);
    return;
  }
  await openScreen(screen.path, true);   // 신규 단계 화면으로 다시 그림
  toast(reopened ? '고친 원본을 다시 잠갔습니다.' : '원본을 등록하고 잠갔습니다. 이제 신규 작업을 시작하세요.');
}

/* ======================= 잠금 풀기 ======================= */

/** 아직 열려 있는(다시 잠그지 않은) 해제 이력에 다시 잠근 시각을 적음 */
function closeLastUnlockEntry(meta) {
  const log = meta.asisUnlockLog || [];
  if (!log.length || lastOf(log).relockedAt) return;
  meta.asisUnlockLog = [...log.slice(0, -1), {...lastOf(log), relockedAt: new Date().toISOString()}];
}

/**
 * [잠금 풀기] — 사유를 반드시 받아 이력에 남기고 원본 단계로
 * 원본 보관이 목적인 도구이므로 사유 없이는 풀 수 없게 막고, 남긴 사유는 지울 수 없습니다.
 * 등록하지 않은 변경이 있으면 먼저 등록합니다 (화면을 다시 그리면 사라지므로).
 */
async function unlockAsis() {
  const screen = app.screen;
  if (!screen || !isLocked()) return;
  if (hasUnsavedChanges()) {
    const saveFirst = await askConfirm({
      title: '등록하지 않은 변경이 있습니다',
      desc: '잠금을 풀기 전에 지금 변경을 먼저 등록합니다. 계속할까요?',
      okText: '등록하고 계속'
    });
    if (!saveFirst || !(await saveDirtySections())) return;
  }
  const answer = await askText({
    title: '원본 잠금 풀기',
    desc: '원본은 변경 전 상태를 그대로 남겨 두기 위해 잠가 둡니다.\n잘못 넣은 원본을 바로잡는 경우에만 잠금을 풀어 주세요.\n잠금을 푼 동안 신규 작업 내용은 그대로 보관됩니다.',
    label: '잠금을 푸는 사유 (필수)',
    placeholder: '예: 등록 당시 누락된 WHERE 절 보완 (티켓 A-123)',
    hint: '적으신 사유는 이 화면의 ‘잠금 해제 이력’에 남고, 지울 수 없습니다.',
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
      screen.meta.asisUnlockLog = [...(screen.meta.asisUnlockLog || []),
        {at: new Date().toISOString(), by: currentWorkerName(), reason: answer.value, relockedAt: ''}];
      screen.meta.asisLocked = false;
      await saveMeta();
    });
  } catch (error) {
    toastError('저장 실패', error);
    return;
  }
  await openScreen(screen.path, true);   // 원본 단계 화면으로 다시 그림
  toast('잠금을 풀었습니다. 원본을 고친 뒤 다시 잠가 주세요.');
}

/* ======================= 원본 확인 ======================= */

/** 원본 확인 표시: 잠긴 원본이 등록 때와 같은지 (상단 작업 정보 줄) */
async function verifyIntegrity() {
  const badge = $('#integrity');
  if (!badge) return;
  const screen = app.screen;
  if (!isLocked()) {
    // 잠금을 푼 상태와 아직 잠그지 않은 상태를 구분해 보여 줌
    badge.innerHTML = wasAsisUnlocked(screen.meta)
      ? `<span class="tag warn">${ICON.unlock}잠금 해제 중</span>`
      : '<span class="tag">원본 단계</span>';
    $('#warn').innerHTML = '';
    return;
  }
  const changed = await findChangedFiles(screen.dir, screen.meta.hashes);
  if (screen !== app.screen) return;   // 확인하는 사이 다른 화면으로 이동함
  badge.innerHTML = changed.length
    ? `<span class="tag bad">${ICON.warn}원본 변경 감지</span>`
    : `<span class="tag ok">${ICON.check}원본 일치</span>`;
  $('#warn').innerHTML = changed.length
    ? `<div class="banner bad">${ICON.warn}<div><b>잠글 때와 다른 원본이 있습니다.</b> 이 원본으로 복원하기 전에 확인하세요.`
      + `<ul>${changed.map(item => `<li><code>${escapeHtml(item.path + ' (' + item.reason + ')')}</code></li>`).join('')}</ul></div></div>`
    : '';
}
