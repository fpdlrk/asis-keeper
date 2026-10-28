/* ==========================================================================
   screen-save.js — 등록과 상태
     - 저장 바의 [등록] / [변경 취소], Ctrl+S
         등록은 탭마다 지금 고치는 쪽에 저장: 원본 단계 → 원본(임시 저장, 잠그기 전까지 고칠 수 있음) / 신규 단계 → 신규
         잠그기 · 잠금 풀기 · 원본 확인은 screen-lock.js
     - 상태 변경 (바로 저장 + 이력 기록)
     - 화면 안의 버튼 이벤트 연결 (initScreen)
   ========================================================================== */

/** meta.json 저장 */
const saveMeta = () => writeJson(app.screen.dir, 'meta.json', app.screen.meta);

/** 이력에 남길 사람: 화면 위 '작업자' 칸 (등록 전 입력값 포함), 비었으면 저장된 작업자 */
const currentWorkerName = () => ($('#worker') ? $('#worker').value.trim() : '') || app.screen.meta.worker || '';

/* ======================= 영역별 저장 ======================= */

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

/**
 * 마지막 등록 때의 SQL 블록 상태 (savedBlockOrder 를 풀어 놓은 것) — 시스템 이력에 '무엇이 바뀌었는지' 적을 때 비교 기준
 * @returns {Map<string, {title, asisId, definition}>} 블록 id → 상태 (없으면 아직 등록 전인 블록)
 */
const savedSqlStatesOf = kind => new Map(JSON.parse(app.screen.savedBlockOrder[kind] || '[]')
  .map(([id, title, asisId, definition]) => [id, {title, asisId, definition}]));

/**
 * SQL 블록 하나의 시스템 이력: 처음 등록이면 생성, 아니면 바뀐 것 (change-log.js)
 * savedValues 를 새 값으로 바꾸기 전에 불러야 함 (이전 SQL 을 거기서 읽음)
 */
function logSqlBlockChange(kind, block, input, savedStates) {
  const previous = savedStates.get(block.id);
  if (!previous) return appendSystemLog(block, creationLogText(block, kind));
  const current = {title: input.element.querySelector('.bt').value.trim(), asisId: block.asisId ?? null, definition: readSqlDefinition(kind, input.element), sql: input.sql};
  appendSystemLog(block, sqlChangeLogText({...previous, sql: app.screen.savedValues[editorId(kind, block.id)] || ''}, current));
}

/** 원본 SQL 블록 저장 (원본 단계의 [등록] · 잠그기). 지운 블록의 파일도 지움 */
async function saveAsisBlocks() {
  const screen = app.screen;
  const savedStates = savedSqlStatesOf('asis');
  const blockList = [];
  for (const input of readBlockInputs('asis')) {
    const block = findSqlBlock('asis', input.id);
    logSqlBlockChange('asis', block, input, savedStates);
    await writeFile(screen.dir, block.file, input.sql);
    block.title = input.title;
    Object.assign(block, readSqlDefinition('asis', input.element));
    blockList.push({id: block.id, title: block.title, file: block.file, ...sqlDefinitionOf(block), ...blockLogOf(block)});
    screen.savedValues[editorId('asis', block.id)] = input.sql;
  }
  for (const block of screen.removedAsisBlocks) {
    await removeFileQuietly(screen.dir, block.file);
    addActivityLog(screen.meta, `원본 SQL ‘${block.title}’ 삭제`);
  }
  screen.removedAsisBlocks = [];
  screen.meta.sqlBlocks = {...(screen.meta.sqlBlocks || {}), asis: blockList};
  await saveMeta();
  screen.savedBlockOrder.asis = blockOrderSignature('asis');
}

/** 신규 SQL 블록 저장 — 덮어쓰기 전 내용은 tobe/history 에 남김. 삭제한 블록의 파일도 지움 */
async function saveTobeBlocks() {
  const screen = app.screen;
  const savedStates = savedSqlStatesOf('tobe');
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
    logSqlBlockChange('tobe', block, input, savedStates);
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
    Object.assign(block, readSqlDefinition('tobe', input.element));
    blockList.push({id: block.id, title: block.title, file: block.file, rb: block.rb, asisId: block.asisId, ...sqlDefinitionOf(block), ...blockLogOf(block)});
  }
  for (const block of screen.removedTobeBlocks) {
    await removeFileQuietly(screen.dir, block.file);
    if (block.rb) await removeFileQuietly(screen.dir, block.rb);
    if (savedStates.has(block.id)) addActivityLog(screen.meta, `신규 SQL ‘${block.title}’ 삭제`);   // 등록 전에 지운 것은 남기지 않음
  }
  screen.removedTobeBlocks = [];
  screen.meta.sqlBlocks = {...(screen.meta.sqlBlocks || {}), tobe: blockList};
  await saveMeta();
  screen.blocks.tobe = screen.blocks.tobe.filter(block => blockList.some(saved => saved.id === block.id));
  screen.savedBlockOrder.tobe = blockOrderSignature('tobe');
  screen.hasSavedTobe = hasSavedTobeSql();
}

/**
 * 영역 하나 등록 — SQL · 정의서는 지금 고치는 쪽(원본/신규)에 저장
 * 등록한 뒤: 그 영역 표의 빈 줄을 화면에서도 지우고, 새로 쌓인 시스템 이력을 화면에 다시 그림
 */
async function saveSection(section) {
  const screen = app.screen;
  await saveSectionData(section);
  const container = section === 'sql' ? $('#blocks-' + layerOf('sql')) : (section in DEF_TABS || section === 'entity' ? $('#defs-' + section) : null);
  if (container) container.querySelectorAll('table.grid').forEach(removeEmptyGridRows);
  renderAllItemLogs();   // 이 영역의 새 이력 + 화면 이력(항목 삭제 등)은 모든 항목의 목록에 보이므로 전부 다시 그림
}

/** 영역 하나의 데이터 저장 (saveSection 이 부름) */
async function saveSectionData(section) {
  const screen = app.screen;
  if (section === 'sql') {
    if (isTabLocked('sql')) {
      await saveTobeBlocks();
      await savePendingFiles('tobe');
      await renderTobeHistory();
    } else {
      await saveAsisBlocks();
      await savePendingFiles('asis');
    }
  } else if (section === 'attach') {
    await savePendingFiles('attach');
  } else if (section === 'common') {
    for (const field of COMMON_FIELDS) screen.meta[field] = $('#' + field).value.trim();
    await saveTextField('memo');
    await saveMeta();
  } else if (section === 'entity') {
    await saveEntityTab();   // 프로젝트 공통 ENTITY (screen-entity.js)
  } else {
    await saveDefItems(section);   // 서비스 · 오브젝트 · 공통코드관리 (screen-defs.js)
  }
}

/** 여러 영역 차례로 등록 (기다림 표시는 부르는 쪽에서) */
async function saveSections(sections) {
  for (const section of sections) await saveSection(section);
}

/** 등록 대기 파일의 저장 경로 확인 (SQL 탭에서 지금 고치는 쪽 파일 · 첨부). 문제가 없으면 '' */
const pendingPathError = () => validatePendingPaths(layerOf('sql')) || validatePendingPaths('attach');

/**
 * 등록하지 않은 변경이 있는 영역을 모두 등록 (저장 바 [등록] · 잠금 풀기 전)
 * @returns {Promise<boolean>} 다 등록했으면 true
 */
async function saveDirtySections() {
  // 저장 서비스는 ENTITY 가 꼭 있어야 등록됨 (빠뜨리지 않게 — screen-entity-links.js)
  if (isDirty('service') && await blockServicesWithoutEntity()) return false;
  const pathError = pendingPathError();
  if (pathError) {
    showTab(validatePendingPaths('attach') ? 'attach' : 'sql');
    toast(pathError);
    return false;
  }
  try {
    await withBusy('등록하는 중…', () => saveSections(SAVE_SECTIONS.map(([section]) => section).filter(isDirty)));
    return true;
  } catch (error) {
    toastError('저장 실패', error);
    return false;
  } finally {
    refreshIndicators();
  }
}

/** 저장 바 [등록] (Ctrl+S): 바뀐 영역을 모두 등록 */
async function saveAllChanges() {
  if (!app.screen) return;
  if (!hasUnsavedChanges()) return toast('등록할 변경이 없습니다.');
  if (await saveDirtySections()) toast('등록했습니다.');
}

/** 저장 바 [변경 취소]: 등록하지 않은 변경을 버리고 다시 불러옴 */
async function discardChanges() {
  if (!hasUnsavedChanges()) return;
  const ok = await askConfirm({title: '변경 취소', desc: '등록하지 않은 변경을 모두 버리고 마지막으로 등록한 상태로 되돌릴까요?', okText: '변경 버리기', danger: true});
  if (!ok) return;
  await openScreen(app.screen.path, true);
  toast('변경을 취소했습니다.');
}

/* ======================= 상태 ======================= */

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
      renderMiniBar();
      renderAllItemLogs();   // 상태 변경은 항목 이력의 [화면]에 보임
      await renderTree();
    });
    toast('상태: ' + statusName);
  } catch (error) {
    toastError('저장 실패', error);
  }
}

/* ======================= 이벤트 연결 ======================= */

/**
 * 화면 안 버튼 클릭 처리 (본문 #main 에 연결)
 * 버튼은 화면을 열 때마다 새로 그려지므로, 바깥 요소 하나에서 data-* 속성으로 구분해 처리합니다.
 */
function handleScreenClick(e) {
  const button = e.target.closest('button');
  if (!button || !app.screen) return;
  const data = button.dataset;

  if (button.id === 'btnSaveAll') saveAllChanges();
  else if (button.id === 'btnDiscard') discardChanges();
  else if (data.lockTab) lockTab(data.lockTab);                  // 탭 위 [원본 등록 후 잠그기]
  else if (data.unlockTab) unlockTab(data.unlockTab);            // 탭 위 [잠금 풀기]
  else if (data.add) addGridRow(data.add);                       // 표 [+ 행 추가]
  else if (data.del !== undefined) deleteGridRow(button);        // 표 줄 ✕
  else if (data.copyEd) copyEditorText(data.copyEd);             // 편집기 오른쪽 위 복사 아이콘
  else if (data.copyInput !== undefined) copyInputText(button);   // 입력칸 오른쪽 끝 복사 아이콘 (SQL 제목 · 정의 칸)
  else if (data.miniTab) showTab(data.miniTab);                     // 요약 줄의 화면 탭
  else if (data.miniTop !== undefined) scrollScreenToTop();         // 요약 줄의 SQL/항목 이름 → 맨 위로
  else if (data.pillScroll) scrollPillTabs(data.pillScroll, Number(data.dir));   // 알약 탭 줄 ‹ ›
  else if (data.pillTab) activatePillTab(data.pillTab, data.bid);   // 알약 탭 고르기 (SQL · 정의서)
  else if (data.pillDel) deletePillTab(data.pillDel, data.bid);     // 알약 탭 ×
  else if (data.pillAll) showAllPillTabs(data.pillAll, button);     // 알약 탭 [▾ 전체]
  else if (data.pillAdd) addPillTab(data.pillAdd);                  // [+ SQL 추가] · [+ 서비스 추가] …
  else if (data.reviveSql) reviveSqlBlock(data.reviveSql);          // 삭제된 원본 SQL [되살리기]
  else if (data.reviveDef) reviveDefItem(data.reviveDef, data.bid); // 삭제된 원본 정의서 항목 [되살리기]
  else if (data.reviveRow) reviveGridRow(data.reviveRow, data.rid); // 삭제된 줄 [되살리기]
  else if (data.logSave) saveItemLog(data.logScope, data.kind, data.logSave);   // 항목 이력 [이력 저장]
  else if (data.logFilter) filterItemLog(button);                   // 항목 이력 [전체 · 사용자 · 시스템]
  else if (data.linkEntity) showEntityLinkMenu(button, data.linkEntity);         // 서비스 [+ ENTITY 연결]
  else if (data.unlinkEntity) unlinkEntity(data.bid, data.unlinkEntity);         // 서비스 ENTITY 이름표 ×
  else if (data.gotoEntity) goToEntity(data.gotoEntity);                        // 서비스 ENTITY 이름표 → ENTITY 탭
  else if (data.entityFilter) setEntityFilter(data.entityFilter);               // ENTITY 탭 보기
  else if (data.entityLock) lockEntity(data.entityLock);                        // ENTITY [원본 등록 후 잠그기]
  else if (data.entityUnlock) unlockEntity(data.entityUnlock);                  // ENTITY [잠금 풀기]
  else if (data.entityUsage) showEntityUsages(data.entityUsage);                // ENTITY [사용하는 서비스]
  else if (data.openService) openServiceItem(JSON.parse(data.openService), data.bid);   // 사용 목록의 서비스 → 그 화면
  else if (data.hist) loadHistoryVersion(data.hist);             // 변경 이력 [편집기로 불러오기]
  else if (data.pickdir) pickFolderFiles(data.pickdir);          // [폴더 선택]
  else if (data.menu === 'tobe') {
    showMenuBelow(button, [
      ['원본과 비교 (창으로 보기)', () => openSqlDiffWindow(data.bid), '', MENU_ICON.compare],
      ['비교할 원본 바꾸기', () => showPairMenu(button, data.bid), '', MENU_ICON.settings],
      ['블록 삭제', () => deleteSqlBlock('tobe', data.bid), 'danger', MENU_ICON.trash]
    ]);
  } else if (data.menu === 'asis') {
    showMenuBelow(button, [
      ['블록 삭제', () => deleteSqlBlock('asis', data.bid), 'danger', MENU_ICON.trash]
    ]);
  }
}

/** Ctrl+S: 저장 바 [등록] */
function handleSaveShortcut(e) {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
  e.preventDefault();   // 브라우저의 "페이지 저장" 막기
  if (app.screen) saveAllChanges();
}

function initScreen() {
  const main = $('#main');
  main.addEventListener('click', handleScreenClick);
  main.addEventListener('change', e => {
    if (e.target.id === 'stSel') changeStatus(Number(e.target.value));
    else if (e.target.dataset.info === 'serviceType' && e.target.closest('#defs-service')) handleServiceTypeChange(e.target);   // 저장 서비스면 ENTITY 영역
  });
  // 무엇이든 입력하면 탭 표시·저장 바 갱신. SQL 블록 제목은 입력하는 대로 대문자로 고침
  main.addEventListener('input', e => {
    // SQL 제목은 입력하는 대로 대문자로 (정의서 항목 이름은 그대로)
    if (e.target.classList.contains('bt') && !e.target.classList.contains('def-title')) forceUpperCaseTitle(e.target);
    refreshIndicators();
  });
  // 블록 제목칸: 더블클릭 = 고치기 시작, Enter/Esc/다른 곳 클릭 = 마침 (screen-blocks.js)
  main.addEventListener('dblclick', e => {
    if (e.target.classList && e.target.classList.contains('bt')) startTitleEdit(e.target);
  });
  main.addEventListener('keydown', handleTitleKeydown);
  main.addEventListener('focusout', e => {
    if (e.target.classList && e.target.classList.contains('bt')) finishTitleEdit(e.target);
  });
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
