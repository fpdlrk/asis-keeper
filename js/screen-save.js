/* ==========================================================================
   screen-save.js — 등록과 상태
     - 기존 내용 등록 후 잠그기 (해시를 함께 저장 → 나중에 원본이 바뀌었는지 확인)
     - 저장 바의 [등록] / [변경 취소], Ctrl+S
     - 상태 변경 (바로 저장 + 이력 기록)
     - 원본 무결성 확인 표시
     - 화면 안의 버튼 이벤트 연결 (initScreen)
   ========================================================================== */

const LOCKED_SAVE_MESSAGE = '기존 내용은 잠겨 있어 저장할 수 없습니다. 수정은 ‘신규 SQL’ 탭에서 하세요.';

/** meta.json 저장 */
const saveMeta = () => writeJson(app.screen.dir, 'meta.json', app.screen.meta);

/* ======================= 기존 내용 등록 후 잠그기 ======================= */

/** [기존 내용 등록 후 잠그기] — 되돌릴 수 없으므로 확인을 받음 */
async function registerAsis() {
  const screen = app.screen;
  const filledBlocks = readBlockInputs('asis').filter(block => block.sql.trim());   // 빈 블록은 등록하지 않음
  if (!filledBlocks.length && !screen.pendingFiles.asis.length) return toast('등록할 기존 SQL 또는 파일이 없습니다.');
  const pathError = validatePendingPaths('asis');
  if (pathError) return toast(pathError);
  const ok = await askConfirm({title: '기존 내용 등록 후 잠그기', desc: '등록하면 기존(ASIS) 내용은 수정·삭제할 수 없습니다.\n내용을 확인하셨나요?', okText: '등록 후 잠그기'});
  if (!ok) return;

  try {
    await withBusy('기존 내용을 등록하고 잠그는 중…', async () => {
      const hashes = {}, blockList = [];
      // 1) SQL 블록 저장 + 해시
      for (const input of filledBlocks) {
        const block = findSqlBlock('asis', input.id);
        const content = new Blob([input.sql], {type: 'text/plain'});
        await writeFile(screen.dir, block.file, content);
        hashes[block.file] = await sha256(content);
        block.title = input.title;
        blockList.push({id: block.id, title: block.title, file: block.file});
        screen.savedValues[editorId('asis', block.id)] = input.sql;
      }
      // 2) 기존 파일 저장 + 해시
      for (const {file, path} of screen.pendingFiles.asis) {
        const filePath = FILE_DIRS.asis + '/' + path;
        await writeFile(screen.dir, filePath, file);
        hashes[filePath] = await sha256(file);
      }
      // 3) 잠금 표시 저장
      screen.meta.sqlBlocks = {...(screen.meta.sqlBlocks || {}), asis: blockList};
      Object.assign(screen.meta, {asisLocked: true, asisSavedAt: new Date().toLocaleString('ko-KR'), hashes});
      await saveMeta();
      screen.pendingFiles.asis = [];
      // 4) 등록하지 않은 빈 블록은 화면에서 지움
      for (const input of readBlockInputs('asis')) {
        if (filledBlocks.some(filled => filled.id === input.id)) continue;
        destroyEditor(editorId('asis', input.id));
        input.element.remove();
        screen.blocks.asis = screen.blocks.asis.filter(block => block.id !== input.id);
      }
      screen.savedFiles.asis = await listFilesDeep(screen.dir, FILE_DIRS.asis);
      screen.savedBlockOrder.asis = blockOrderSignature('asis');
      showAsisAsLocked();
    });
    toast('기존 내용을 등록하고 잠갔습니다.');
  } catch (error) {
    toastError('저장 실패', error);
  }
}

/** 화면을 다시 그리지 않고 기존 SQL 탭만 잠긴 모양으로 바꿈 (다른 탭에서 입력 중인 내용을 지키기 위해) */
function showAsisAsLocked() {
  const screen = app.screen;
  for (const [id, editor] of Object.entries(screen.editors)) {
    if (!id.startsWith(EDITOR_PREFIX.asis)) continue;
    editor.setReadOnly(true);
    editor.setHighlightActiveLine(false);
  }
  $$('#blocks-asis .bt').forEach(input => { input.disabled = true; });
  // ⋯ 메뉴(복사·삭제) → [복사] 버튼
  $$('#blocks-asis [data-menu]').forEach(button => {
    button.outerHTML = `<button type="button" class="btn btn-s" data-copy="${editorId('asis', button.dataset.bid)}">복사</button>`;
  });
  $('#blocks-asis').classList.add('locked');
  const addButton = $('[data-addblk="asis"]');
  if (addButton) addButton.remove();
  $('.drop[data-k="asis"]').classList.add('off');
  $('#asisBanner').className = 'banner lock';
  $('#asisBanner').innerHTML = lockedBannerHtml(screen.meta);
  renderFileList('asis');
  renderFileList('tobe');   // 신규 파일의 수정/동일 구분이 바뀔 수 있음
  verifyIntegrity();
  refreshPairedBlocks();
  refreshIndicators();
}

/* ======================= 저장 바의 [등록] ======================= */

/** 글 입력란 하나 저장 (비어 있고 원래도 없던 파일은 만들지 않음) */
async function saveTextField(fieldId) {
  const screen = app.screen;
  const value = getEditorValue(fieldId);
  if (value.trim() || screen.savedValues[fieldId]) await writeFile(screen.dir, TEXT_FIELD_FILES[fieldId], value);
  screen.savedValues[fieldId] = value;
}

/** 표 하나 저장 */
async function saveGrid(gridId) {
  const screen = app.screen;
  const rows = readGridRows(gridId);
  if (rows.length || screen.savedGrids[gridId] !== '[]') await writeJson(screen.dir, GRID_FILES[gridId], rows);
  screen.savedGrids[gridId] = JSON.stringify(rows);
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
  for (const input of readBlockInputs('tobe')) {
    const block = findSqlBlock('tobe', input.id);
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
    blockList.push({id: block.id, title: block.title, file: block.file, rb: block.rb});
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
    for (const fieldId of TAB_TEXT_FIELDS[section]) await saveTextField(fieldId);
    for (const gridId of TAB_GRID_FIELDS[section] || []) await saveGrid(gridId);
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
      const changedBy = ($('#worker') ? $('#worker').value.trim() : '') || screen.meta.worker || '';
      screen.meta.statusLog = [...(screen.meta.statusLog || []), {status: statusName, at: new Date().toISOString(), by: changedBy}];
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

/** 원본 무결성 표시: 잠긴 기존 파일이 등록 때와 같은지 (상단 작업 정보 줄 + 기존 SQL 탭 안내) */
async function verifyIntegrity() {
  const badge = $('#integrity');
  if (!badge) return;
  const screen = app.screen;
  if (!screen.meta.asisLocked) {
    badge.innerHTML = '<span class="tag">ASIS 미등록</span>';
    $('#warn').innerHTML = '';
    return;
  }
  const changed = await findChangedFiles(screen.dir, screen.meta.hashes);
  if (screen !== app.screen) return;   // 확인하는 사이 다른 화면으로 이동함
  const html = changed.length
    ? `<span class="tag bad">${ICON.warn}원본 변경 감지</span>`
    : `<span class="tag ok">${ICON.check}ASIS 원본 일치</span>`;
  badge.innerHTML = html;
  const bannerBadge = $('#integrity2');
  if (bannerBadge) bannerBadge.innerHTML = html;
  $('#warn').innerHTML = changed.length
    ? `<div class="banner bad">${ICON.warn}<div><b>저장 당시와 다른 원본 파일이 있습니다.</b> 이 원본으로 복원하기 전에 확인하세요.`
      + `<ul>${changed.map(item => `<li><code>${escapeHtml(item.path + ' (' + item.reason + ')')}</code></li>`).join('')}</ul></div></div>`
    : '';
}

/* ======================= 이벤트 연결 ======================= */

/** 표에 빈 줄 추가 */
function addGridRow(gridId) {
  $('#grid-' + gridId + ' tbody').insertAdjacentHTML('beforeend', gridRowHtml(gridId, []));
  refreshIndicators();
}

/** 표의 줄 삭제 (마지막 줄이면 빈 줄 하나를 남김) */
function deleteGridRow(button) {
  const body = button.closest('tbody');
  const gridId = button.closest('table').id.replace('grid-', '');
  button.closest('tr').remove();
  if (!body.children.length) body.insertAdjacentHTML('beforeend', gridRowHtml(gridId, []));
  refreshIndicators();
}

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
  else if (data.add) addGridRow(data.add);                       // 표 [+ 행 추가]
  else if (data.del !== undefined) deleteGridRow(button);        // 표 줄 ✕
  else if (data.copy) copyEditorText(data.copy);                 // [복사]
  else if (data.from) importAsisSql(data.from);                  // [기존 SQL 가져오기]
  else if (data.addblk) addSqlBlock(data.addblk);                // [+ SQL 블록 추가]
  else if (data.hist) loadHistoryVersion(data.hist);             // 변경 이력 [편집기로 불러오기]
  else if (data.pickdir) pickFolderFiles(data.pickdir);          // [폴더 선택]
  else if (data.view) setTobeViewMode(data.view);                // 기존과 나란히 / 신규만
  else if (data.menu === 'tobe') {
    showMenuBelow(button, [
      ['복사', () => copyEditorText(editorId('tobe', data.bid))],
      ['기존과 비교 (창으로 보기)', () => openSqlDiffWindow(data.bid)],
      ['블록 삭제', () => deleteSqlBlock('tobe', data.bid), 'danger']
    ]);
  } else if (data.menu === 'asis') {
    showMenuBelow(button, [
      ['복사', () => copyEditorText(editorId('asis', data.bid))],
      ['블록 삭제', () => deleteSqlBlock('asis', data.bid), 'danger']
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
  main.addEventListener('change', e => { if (e.target.id === 'stSel') changeStatus(Number(e.target.value)); });
  // 무엇이든 입력하면 탭 표시·저장 바 갱신
  main.addEventListener('input', refreshIndicators);
  sidePanel.addEventListener('input', refreshIndicators);
  document.addEventListener('keydown', handleSaveShortcut);
  // 등록하지 않은 변경이 있는데 창을 닫으려 하면 브라우저 경고
  window.addEventListener('beforeunload', e => {
    if (app.screen && hasUnsavedChanges()) { e.preventDefault(); e.returnValue = ''; }
  });
}
