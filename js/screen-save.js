/* ==========================================================================
   screen-save.js — 등록과 상태
     - 기존 내용 등록 후 잠그기 (해시를 함께 저장 → 나중에 원본이 바뀌었는지 확인)
     - 저장 바의 [등록] / [변경 취소], Ctrl+S
     - 상태 변경 (바로 저장 + 이력 기록)
     - 원본 무결성 확인 표시
     - 화면 안의 버튼 이벤트 연결 (initScreen)
   ========================================================================== */

const LOCKED_SAVE_MESSAGE = '기존 내용은 잠겨 있어 저장할 수 없습니다. 수정은 ‘신규 SQL’ 탭에서 하세요.';

/* 잠금을 풀 때 받는 사유의 최소 길이 (한두 글자로 넘기지 못하게) */
const MIN_UNLOCK_REASON_LENGTH = 5;

/** meta.json 저장 */
const saveMeta = () => writeJson(app.screen.dir, 'meta.json', app.screen.meta);

/** 이력에 남길 사람: 화면 위 '작업자' 칸 (등록 전 입력값 포함), 비었으면 저장된 작업자 */
const currentWorkerName = () => ($('#worker') ? $('#worker').value.trim() : '') || app.screen.meta.worker || '';

/* ======================= 기존 내용 등록 후 잠그기 ======================= */

/**
 * 잠글 때 저장할 해시 모음 — 등록한 SQL 블록 파일 + asis/files 아래 모든 파일
 * 저장이 끝난 파일에서 다시 읽어 계산하므로, 잠금을 풀고 고친 뒤 다시 잠글 때도 지금 내용이 기준이 됩니다.
 * @param {FileSystemDirectoryHandle} dir 화면 폴더
 * @param {{file: string}[]} blockList    등록한 기존 SQL 블록 목록
 * @param {string[]} savedFilePaths       asis/files 기준 상대 경로 목록
 * @returns {Promise<object>} {화면 폴더 기준 경로: 해시}
 */
async function hashAsisFiles(dir, blockList, savedFilePaths) {
  const hashes = {};
  const paths = [...blockList.map(block => block.file), ...savedFilePaths.map(path => FILE_DIRS.asis + '/' + path)];
  for (const path of paths) {
    const file = await readFile(dir, path);
    if (file) hashes[path] = await sha256(file);
  }
  return hashes;
}

/** [기존 내용 등록 후 잠그기] / [수정 내용 등록 후 다시 잠그기] — 되돌릴 수 없으므로 확인을 받음 */
async function registerAsis() {
  const screen = app.screen;
  const reopened = wasAsisUnlocked(screen.meta);   // 잠금을 푼 뒤 다시 잠그는 경우
  const filledBlocks = readBlockInputs('asis').filter(block => block.sql.trim());   // 빈 블록은 등록하지 않음
  // 다시 잠글 때는 블록을 다 지우고 파일만 남겨 둘 수도 있어, 이미 등록된 파일이 있으면 통과시킵니다.
  if (!filledBlocks.length && !screen.pendingFiles.asis.length && !screen.savedFiles.asis.length) {
    return toast('등록할 기존 SQL 또는 파일이 없습니다.');
  }
  const pathError = validatePendingPaths('asis');
  if (pathError) return toast(pathError);
  const ok = await askConfirm({
    title: reopened ? '수정 내용 등록 후 다시 잠그기' : '기존 내용 등록 후 잠그기',
    desc: reopened
      ? '다시 잠그면 지금 내용이 새 원본 기준이 되고, 수정·삭제할 수 없습니다.\n잠금 해제 이력은 그대로 남습니다.\n내용을 확인하셨나요?'
      : '등록하면 기존(ASIS) 내용은 수정·삭제할 수 없습니다.\n내용을 확인하셨나요?',
    okText: reopened ? '다시 잠그기' : '등록 후 잠그기'
  });
  if (!ok) return;

  try {
    await withBusy('기존 내용을 등록하고 잠그는 중…', async () => {
      const blockList = [];
      // 1) SQL 블록 저장
      for (const input of filledBlocks) {
        const block = findSqlBlock('asis', input.id);
        await writeFile(screen.dir, block.file, new Blob([input.sql], {type: 'text/plain'}));
        block.title = input.title;
        blockList.push({id: block.id, title: block.title, file: block.file, ...blockLogOf(block)});
        screen.savedValues[editorId('asis', block.id)] = input.sql;
      }
      // 2) 잠금을 푼 뒤 삭제한 블록의 파일 지우기
      for (const block of screen.removedAsisBlocks) await removeFileQuietly(screen.dir, block.file);
      screen.removedAsisBlocks = [];
      // 3) 기존 파일 저장
      for (const {file, path} of screen.pendingFiles.asis) await writeFile(screen.dir, FILE_DIRS.asis + '/' + path, file);
      screen.pendingFiles.asis = [];
      screen.savedFiles.asis = await listFilesDeep(screen.dir, FILE_DIRS.asis);
      // 4) 해시는 저장이 끝난 뒤 파일에서 다시 계산 (다시 잠글 때 기준을 지금 내용으로 갱신)
      screen.meta.hashes = await hashAsisFiles(screen.dir, blockList, screen.savedFiles.asis);
      // 5) 잠금 표시 저장. 다시 잠근 경우 마지막 해제 이력에 '다시 잠근 시각'을 적음
      screen.meta.sqlBlocks = {...(screen.meta.sqlBlocks || {}), asis: blockList};
      screen.meta.asisLocked = true;
      if (!screen.meta.asisSavedAt) screen.meta.asisSavedAt = new Date().toLocaleString('ko-KR');   // 최초 등록 시각은 그대로 보존
      closeLastUnlockEntry(screen.meta);
      await saveMeta();
      // 6) 등록하지 않은 빈 블록은 화면에서 지움
      for (const input of readBlockInputs('asis')) {
        if (filledBlocks.some(filled => filled.id === input.id)) continue;
        destroyEditor(editorId('asis', input.id));
        input.element.remove();
        screen.blocks.asis = screen.blocks.asis.filter(block => block.id !== input.id);
      }
      screen.savedBlockOrder.asis = blockOrderSignature('asis');
      showAsisAsLocked();
    });
    toast(reopened ? '수정 내용을 등록하고 다시 잠갔습니다.' : '기존 내용을 등록하고 잠갔습니다.');
  } catch (error) {
    toastError('저장 실패', error);
  }
}

/* ======================= 잠금 풀기 ======================= */

/** 아직 열려 있는(다시 잠그지 않은) 해제 이력에 다시 잠근 시각을 적음 */
function closeLastUnlockEntry(meta) {
  const log = meta.asisUnlockLog || [];
  if (!log.length || lastOf(log).relockedAt) return;
  meta.asisUnlockLog = [...log.slice(0, -1), {...lastOf(log), relockedAt: new Date().toISOString()}];
}

/**
 * [잠금 풀기] — 사유를 반드시 받아 이력에 남기고, 기존 SQL 탭을 다시 편집할 수 있게 함
 * 원본 보관이 목적인 도구이므로 사유 없이는 풀 수 없게 막고, 남긴 사유는 지울 수 없습니다.
 */
async function unlockAsis() {
  const screen = app.screen;
  if (!screen || !screen.meta.asisLocked) return;
  const answer = await askText({
    title: '기존 내용 잠금 풀기',
    desc: '기존(ASIS)은 변경 전 상태를 그대로 남겨 두기 위해 잠가 둡니다.\n잘못 등록한 내용을 바로잡는 경우에만 잠금을 풀어 주세요.',
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
      showAsisAsUnlocked();
    });
    toast('잠금을 풀었습니다. 수정한 뒤 다시 등록해 잠가 주세요.');
  } catch (error) {
    toastError('저장 실패', error);
  }
}

/** 기존 SQL 편집기 전체에 읽기 전용 여부를 적용 (커서·활성 줄 표시까지 createEditor 와 같게 맞춤) */
function setAsisEditorsReadOnly(readOnly) {
  for (const [id, editor] of Object.entries(app.screen.editors)) {
    if (!id.startsWith(EDITOR_PREFIX.asis)) continue;
    editor.setReadOnly(readOnly);
    editor.setHighlightActiveLine(!readOnly);
    editor.setOption('highlightGutterLine', !readOnly);
    editor.renderer.$cursorLayer.element.style.display = readOnly ? 'none' : '';
    if (!readOnly) watchSqlPaste(editor, id);   // 잠그기 전처럼 붙여넣기 → 블록 분리 제안
  }
}

/** 화면을 다시 그리지 않고 기존 SQL 탭만 잠긴 모양으로 바꿈 (다른 탭에서 입력 중인 내용을 지키기 위해) */
function showAsisAsLocked() {
  const screen = app.screen;
  setAsisEditorsReadOnly(true);
  $$('#blocks-asis .bt').forEach(input => { input.disabled = true; });
  // ⋯ 메뉴(삭제)는 잠그면 쓸 수 없으므로 지움 (복사는 편집기·제목칸의 복사 아이콘으로)
  $$('#blocks-asis [data-menu="asis"]').forEach(button => button.remove());
  $('#blocks-asis').classList.add('locked');
  renderSqlTabs('asis');   // 탭의 삭제(×)·[+ SQL 추가] 단추가 사라짐
  $('#asisBanner').className = 'banner lock';
  $('#asisBanner').innerHTML = lockedBannerHtml(screen.meta);
  $('#asisUnlockLog').innerHTML = unlockLogBannerHtml(screen.meta);   // '다시 잠금' 시각 반영
  verifyIntegrity();
  refreshPairedBlocks();
  refreshIndicators();
}

/** 화면을 다시 그리지 않고 기존 SQL 탭만 편집할 수 있는 모양으로 되돌림 (showAsisAsLocked 의 반대) */
function showAsisAsUnlocked() {
  const screen = app.screen;
  setAsisEditorsReadOnly(false);
  $$('#blocks-asis .bt').forEach(input => { input.disabled = false; });
  // ⋯ 메뉴(삭제)를 블록 머리 끝에 다시 붙임
  $$('#blocks-asis .blk').forEach(element => {
    if (!element.querySelector('[data-menu="asis"]')) element.querySelector('.blk-h').insertAdjacentHTML('beforeend', asisBlockMenuHtml(element.dataset.id));
  });
  $('#blocks-asis').classList.remove('locked');
  renderSqlTabs('asis');   // 탭의 삭제(×)·[+ SQL 추가] 단추를 다시 보여 줌
  $('#asisBanner').className = 'banner info';
  $('#asisBanner').innerHTML = unlockedBannerHtml(screen.meta);
  $('#asisUnlockLog').innerHTML = unlockLogBannerHtml(screen.meta);
  verifyIntegrity();
  refreshPairedBlocks();
  refreshIndicators();
  showTab('asis');   // 다른 탭에서 풀었어도 수정할 곳을 바로 보여 줌
}

/* ======================= 저장 바의 [등록] ======================= */

/** 글 입력란 하나 저장 (비어 있고 원래도 없던 파일은 만들지 않음) */
async function saveTextField(fieldId) {
  const screen = app.screen;
  const value = getEditorValue(fieldId);
  if (value.trim() || screen.savedValues[fieldId]) await writeFile(screen.dir, TEXT_FIELD_FILES[fieldId], value);
  screen.savedValues[fieldId] = value;
}


/** 등록 대기 파일 저장 */
async function savePendingFiles(kind) {
  const screen = app.screen;
  for (const {file, path} of screen.pendingFiles[kind]) await writeFile(screen.dir, FILE_DIRS[kind] + '/' + path, file);
  screen.pendingFiles[kind] = [];
  screen.savedFiles[kind] = await listFilesDeep(screen.dir, FILE_DIRS[kind]);
  renderFileList(kind);
}

/** 신규 SQL 블록 저장 — 덮어쓰기 전 내용은 tobe/history 에 남김. 삭제한 블록의 파일도 지움 */
async function saveTobeBlocks() {
  const screen = app.screen;
  const blockList = [];
  const asisBlocks = readBlockInputs('asis');
  const tobeInputs = readBlockInputs('tobe');
  for (const [order, input] of tobeInputs.entries()) {
    const block = findSqlBlock('tobe', input.id);
    // 아직 지정하지 않은 예전 블록은 지금 짝(같은 순서)을 실제 값으로 굳힙니다 — 이후 순서가 바뀌어도 비교가 유지됩니다
    if (block.asisId === undefined) {
      const paired = findPairedAsisBlock(input, order, asisBlocks);
      block.asisId = paired ? paired.id : NO_ASIS_PAIR;
    }
    const parts = [[editorId('tobe', block.id), block.file, 'sql'], [editorId('rollback', block.id), block.rb, 'rollback']]
      .filter(([id]) => screen.editors[id]);   // 롤백은 칸이 있을 때만
    for (const [id, filePath, historyTag] of parts) {
      const value = getEditorValue(id);
      const savedValue = screen.savedValues[id] || '';
      if (value !== savedValue && savedValue.trim()) {
        await writeFile(screen.dir, `${TOBE_HISTORY_DIR}/${timestamp()}_${block.id}_${historyTag}.sql`, savedValue);
      }
      if (value.trim() || savedValue) await writeFile(screen.dir, filePath, value);
      screen.savedValues[id] = value;
    }
    block.title = input.title;
    blockList.push({id: block.id, title: block.title, file: block.file, rb: block.rb, asisId: block.asisId, ...blockLogOf(block)});
  }
  for (const block of screen.removedTobeBlocks) {
    await removeFileQuietly(screen.dir, block.file);
    if (block.rb) await removeFileQuietly(screen.dir, block.rb);
  }
  screen.removedTobeBlocks = [];
  screen.meta.sqlBlocks = {...(screen.meta.sqlBlocks || {}), tobe: blockList};
  await saveMeta();
  screen.blocks.tobe = screen.blocks.tobe.filter(block => blockList.some(saved => saved.id === block.id));
  screen.savedBlockOrder.tobe = blockOrderSignature('tobe');
  screen.hasSavedTobe = hasSavedTobeSql();
}

/** 영역 하나 등록 */
async function saveSection(section) {
  const screen = app.screen;
  if (section === 'tobe') {
    await saveTobeBlocks();
    await savePendingFiles('tobe');
    await renderTobeHistory();
  } else if (section === 'attach') {
    await savePendingFiles('attach');
  } else if (section === 'common') {
    for (const field of COMMON_FIELDS) screen.meta[field] = $('#' + field).value.trim();
    await saveTextField('memo');
    await saveMeta();
  } else {
    await saveDefItems(section);   // 서비스 · 오브젝트 · 코드분류 (screen-defs.js)
  }
}

/** 저장 바 [등록]: 바뀐 영역을 모두 등록 (기존 내용은 제외 — 따로 잠그기로 등록) */
async function saveAllChanges() {
  if (!app.screen) return;
  const sections = SAVE_SECTIONS.map(([section]) => section).filter(isDirty);
  if (!sections.length) {
    return toast(isDirty('asis') ? '기존 내용은 ‘기존 SQL’ 탭의 ‘등록 후 잠그기’로 등록합니다.' : '등록할 변경이 없습니다.');
  }
  for (const kind of ['tobe', 'attach']) {
    if (!sections.includes(kind)) continue;
    const pathError = validatePendingPaths(kind);
    if (pathError) {
      showTab(kind);
      return toast(pathError);
    }
  }
  try {
    await withBusy('등록하는 중…', async () => {
      for (const section of sections) await saveSection(section);
    });
    toast('등록했습니다.');
  } catch (error) {
    toastError('저장 실패', error);
  } finally {
    refreshIndicators();
  }
}

/** 저장 바 [변경 취소]: 등록하지 않은 변경을 버리고 다시 불러옴 */
async function discardChanges() {
  if (!hasUnsavedChanges()) return;
  const ok = await askConfirm({title: '변경 취소', desc: '등록하지 않은 변경을 모두 버리고 마지막으로 등록한 상태로 되돌릴까요?', okText: '변경 버리기', danger: true});
  if (!ok) return;
  await openScreen(app.screen.path, true);
  toast('변경을 취소했습니다.');
}

/* ======================= 상태 · 무결성 ======================= */

/** 상태 변경: 바로 저장하고, 바꾼 사람(작업자)과 함께 이력에 남김 */
async function changeStatus(statusIndex) {
  const screen = app.screen;
  if (!screen) return;
  const statusName = STATUS_LIST[statusIndex];
  try {
    if (statusName !== statusOf(screen.meta)) {
      screen.meta.statusLog = [...(screen.meta.statusLog || []), {status: statusName, at: new Date().toISOString(), by: currentWorkerName()}];
    }
    await withBusy('상태를 저장하는 중…', async () => {
      screen.meta.status = statusName;
      await saveMeta();
      $('#stSel').className = 'stpill s' + statusIndex;
      $('#stlog').innerHTML = statusLogHtml(screen.meta);
      await renderTree();
    });
    toast('상태: ' + statusName);
  } catch (error) {
    toastError('저장 실패', error);
  }
}

/** 원본 무결성 표시: 잠긴 기존 파일이 등록 때와 같은지 (상단 작업 정보 줄) */
async function verifyIntegrity() {
  const badge = $('#integrity');
  if (!badge) return;
  const screen = app.screen;
  if (!screen.meta.asisLocked) {
    // 잠금을 푼 상태와 아직 등록하지 않은 상태를 구분해 보여 줌
    badge.innerHTML = wasAsisUnlocked(screen.meta)
      ? `<span class="tag warn">${ICON.unlock}잠금 해제 중</span>`
      : '<span class="tag">ASIS 미등록</span>';
    $('#warn').innerHTML = '';
    return;
  }
  const changed = await findChangedFiles(screen.dir, screen.meta.hashes);
  if (screen !== app.screen) return;   // 확인하는 사이 다른 화면으로 이동함
  badge.innerHTML = changed.length
    ? `<span class="tag bad">${ICON.warn}원본 변경 감지</span>`
    : `<span class="tag ok">${ICON.check}ASIS 원본 일치</span>`;
  $('#warn').innerHTML = changed.length
    ? `<div class="banner bad">${ICON.warn}<div><b>저장 당시와 다른 원본 파일이 있습니다.</b> 이 원본으로 복원하기 전에 확인하세요.`
      + `<ul>${changed.map(item => `<li><code>${escapeHtml(item.path + ' (' + item.reason + ')')}</code></li>`).join('')}</ul></div></div>`
    : '';
}

/* ======================= 이벤트 연결 ======================= */

/**
 * 화면 안 버튼 클릭 처리 (본문 #main 과 오른쪽 #rside 에 함께 연결)
 * 버튼은 화면을 열 때마다 새로 그려지므로, 바깥 요소 하나에서 data-* 속성으로 구분해 처리합니다.
 */
function handleScreenClick(e) {
  const button = e.target.closest('button');
  if (!button || !app.screen) return;
  const data = button.dataset;

  if (button.id === 'btnSaveAll') saveAllChanges();
  else if (button.id === 'btnDiscard') discardChanges();
  else if (button.id === 'saveAsis') registerAsis();
  else if (button.id === 'unlockAsis') unlockAsis();
  else if (data.add) addGridRow(data.add);                       // 표 [+ 행 추가]
  else if (data.del !== undefined) deleteGridRow(button);        // 표 줄 ✕
  else if (data.copyEd) copyEditorText(data.copyEd);             // 편집기 오른쪽 위 복사 아이콘
  else if (data.copyTitle !== undefined) copyBlockTitle(button); // SQL 블록 제목칸 복사 아이콘
  else if (data.pillTab) activatePillTab(data.pillTab, data.bid);   // 알약 탭 고르기 (SQL · 정의서)
  else if (data.pillDel) deletePillTab(data.pillDel, data.bid);     // 알약 탭 ×
  else if (data.pillAll) showAllPillTabs(data.pillAll, button);     // 알약 탭 [▾ 전체]
  else if (data.pillAdd) addPillTab(data.pillAdd);                  // [+ SQL 추가] · [+ 서비스 추가] …
  else if (data.logSave) saveItemLog(data.logScope, data.kind, data.logSave);   // 항목 이력 [이력 저장]
  else if (data.from) importAsisSql(data.from);                  // [기존 SQL 가져오기]
  else if (data.hist) loadHistoryVersion(data.hist);             // 변경 이력 [편집기로 불러오기]
  else if (data.pickdir) pickFolderFiles(data.pickdir);          // [폴더 선택]
  else if (data.menu === 'tobe') {
    showMenuBelow(button, [
      ['기존과 비교 (창으로 보기)', () => openSqlDiffWindow(data.bid), '', MENU_ICON.compare],
      ['블록 삭제', () => deleteSqlBlock('tobe', data.bid), 'danger', MENU_ICON.trash]
    ]);
  } else if (data.menu === 'asis') {
    showMenuBelow(button, [
      ['블록 삭제', () => deleteSqlBlock('asis', data.bid), 'danger', MENU_ICON.trash]
    ]);
  }
}

/** Ctrl+S: 기존 SQL 탭에서 잠그기 전이면 잠그기, 그 밖에는 저장 바 [등록] */
function handleSaveShortcut(e) {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
  e.preventDefault();   // 브라우저의 "페이지 저장" 막기
  const screen = app.screen;
  if (!screen) return;
  const onAsisTab = app.tab === 'asis';
  if (onAsisTab && !screen.meta.asisLocked && isDirty('asis')) return registerAsis();
  if (onAsisTab && screen.meta.asisLocked && !SAVE_SECTIONS.some(([section]) => isDirty(section))) return toast(LOCKED_SAVE_MESSAGE);
  saveAllChanges();
}

function initScreen() {
  const main = $('#main'), sidePanel = $('#rside');
  main.addEventListener('click', handleScreenClick);
  sidePanel.addEventListener('click', handleScreenClick);
  main.addEventListener('change', e => {
    if (e.target.id === 'stSel') changeStatus(Number(e.target.value));
    else if (e.target.dataset.pairSel) setTobePair(e.target.dataset.pairSel, e.target.value);   // 비교할 기존 SQL 선택
  });
  // 무엇이든 입력하면 탭 표시·저장 바 갱신. SQL 블록 제목은 입력하는 대로 대문자로 고침
  main.addEventListener('input', e => {
    // SQL 제목은 입력하는 대로 대문자로 (정의서 항목 이름은 그대로)
    if (e.target.classList.contains('bt') && !e.target.classList.contains('def-title')) forceUpperCaseTitle(e.target);
    refreshIndicators();
  });
  sidePanel.addEventListener('input', refreshIndicators);
  // 항목 이력 입력칸(SQL · 정의서): Ctrl+Enter 로 저장 (그냥 Enter 는 줄바꿈)
  main.addEventListener('keydown', e => {
    const itemId = e.target.dataset && e.target.dataset.logInput;
    if (itemId && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveItemLog(e.target.dataset.logScope, e.target.dataset.kind, itemId);
    }
  });
  document.addEventListener('keydown', handleSaveShortcut);
  // 등록하지 않은 변경이 있는데 창을 닫으려 하면 브라우저 경고
  window.addEventListener('beforeunload', e => {
    if (app.screen && hasUnsavedChanges()) { e.preventDefault(); e.returnValue = ''; }
  });
}
