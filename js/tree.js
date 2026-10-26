/* ==========================================================================
   tree.js — 왼쪽 영역
     - 루트 폴더 선택 / 지난번 루트 다시 열기
     - 화면 트리 (상태 필터 · 검색 · 접기/펼치기)
     - 폴더 메뉴 (하위 메뉴 추가 · 이름 변경 · 이동 · 경로 복사)
     - 상단 위치 표시(브레드크럼)
   ========================================================================== */

/* 트리 상태 */
const treeState = {
  query: '',              // 검색어 (소문자)
  closedKeys: new Set(),  // 접어 둔 폴더 경로('인사/급여') 목록 — 루트별로 저장
  renderSeq: 0,           // 그리기 순번: 그리는 도중 다시 그리기가 시작되면 이전 결과는 버림
  searchTimer: null       // 검색어 입력 후 잠깐 기다렸다 그리기 위한 타이머
};
/* 메뉴 이동 창 상태: {target: 옮길 폴더, destination: 고른 위치} */
let moveState = null;

/** 검색 중이거나 상태 필터가 걸려 있는지 (이때는 접힌 폴더도 모두 펼쳐 보여 줌) */
const isFiltering = () => !!treeState.query || app.statusFilter !== null;

/** 접어 둔 폴더 목록 저장 */
const saveClosedFolders = () => {
  if (app.root) settings.setQuietly(SETTING_KEYS.closedFolders(app.root.name), [...treeState.closedKeys]);
};

/* ======================= 루트 폴더 ======================= */

/** 루트 폴더 열기: 설정 저장 → 파일 구조 변환 → 트리 그리기 → 현황 화면 */
async function setRootFolder(handle) {
  await withBusy('루트 폴더를 여는 중… (파일 구조 확인 포함)', async () => {
    app.root = handle;
    await settings.set(SETTING_KEYS.root, handle);
    $('#btnResume').hidden = true;
    $('#btnReport').disabled = false;
    app.screen = null;
    app.statusFilter = null;
    app.notice = '';
    try {
      treeState.closedKeys = new Set((await settings.get(SETTING_KEYS.closedFolders(handle.name))) || []);
    } catch {
      treeState.closedKeys = new Set();
    }
    try {
      app.notice = await migrateAllScreens();
    } catch (error) {
      toastError('파일 구조 변환 실패', error);
    }
    await renderTree();
  });
  showHome();
}

/** [루트 폴더 선택] 버튼 */
async function pickRootFolder() {
  if (!(await confirmLeaveScreen())) return;
  try {
    await setRootFolder(await showDirectoryPicker({mode: 'readwrite', id: 'asis-keeper'}));
  } catch (error) {
    if (error.name !== 'AbortError') toastError('폴더를 선택하지 못했습니다', error);   // 사용자가 취소한 경우는 알리지 않음
  }
}

/** ["○○" 이어서 열기] 버튼: 브라우저가 권한을 다시 물어봄 */
async function resumeRootFolder() {
  const handle = $('#btnResume').savedHandle;
  if ((await handle.requestPermission({mode: 'readwrite'})) === 'granted') await setRootFolder(handle);
  else toast('폴더 접근 권한이 허용되지 않았습니다.');
}

/** 시작할 때: 지난번 루트 폴더 권한이 살아 있으면 바로 열고, 아니면 "이어서 열기" 버튼을 보여 줌 */
async function restoreLastRoot() {
  try {
    const handle = await settings.get(SETTING_KEYS.root);
    if (!handle) return;
    if ((await handle.queryPermission({mode: 'readwrite'})) === 'granted') {
      await setRootFolder(handle);
      return;
    }
    const button = $('#btnResume');
    button.savedHandle = handle;
    button.textContent = '"' + handle.name + '" 이어서 열기';
    button.hidden = false;
    showHome();
  } catch { /* 저장된 값이 없거나 읽을 수 없으면 처음 화면 그대로 */ }
}

/** 현황(대시보드)으로 가기 — 등록 안 한 변경이 있으면 먼저 확인 */
async function goHome() {
  if (!(await confirmLeaveScreen())) return;
  app.screen = null;
  renderTree();
  showHome();
}

/** 상단 위치 표시: [루트] › 메뉴 › 화면. 루트 이름을 누르면 현황으로 */
function renderBreadcrumb() {
  const crumb = $('#crumb');
  if (!app.root) {
    crumb.innerHTML = '<span class="muted">루트 폴더가 선택되지 않았습니다</span>';
    return;
  }
  const parts = app.screen ? app.screen.path : [];
  crumb.innerHTML = `<button type="button" class="crumb-root mono" title="현황 보기">${escapeHtml(app.root.name)}</button>`
    + parts.map((part, i) => `<span class="sep" aria-hidden="true">›</span><span${i === parts.length - 1 ? ' class="here"' : ''}>${escapeHtml(part)}</span>`).join('');
}

/* ======================= 검색 ======================= */

/**
 * 화면이 검색어에 맞는지: 이름·티켓·작업자·원본 위치를 먼저 보고, 없으면 메모·SQL 내용까지 찾음
 * @param {FileSystemDirectoryHandle} dir 화면 폴더
 */
async function matchesSearch(dir, name, meta) {
  const query = treeState.query;
  if (!query) return true;
  const summary = [name, meta && meta.ticket, meta && meta.worker, meta && meta.origin].filter(Boolean).join('\n').toLowerCase();
  if (summary.includes(query)) return true;
  if (!meta) return false;

  // 내용까지 찾을 파일: 글 입력란 + SQL 블록 (예전 구조 파일 포함)
  const files = Object.values(TEXT_FIELD_FILES);
  const sqlBlocks = meta.sqlBlocks || {};
  for (const kind of ['asis', 'tobe']) {
    for (const block of sqlBlocks[kind] || []) {
      files.push(block.file);
      if (block.rb) files.push(block.rb);
    }
  }
  if (!meta.sqlBlocks) files.push('asis/sql.sql', 'tobe/sql.sql');
  for (const file of files) {
    const text = await readText(dir, file);
    if (text && text.toLowerCase().includes(query)) return true;
  }
  return false;
}

/* ======================= 트리 ======================= */

/**
 * 폴더 접기/펼치기
 * @param {HTMLLIElement} item 트리 항목
 * @param {boolean} [open] true 펼치기 / false 접기 / 생략하면 반대로
 */
function toggleTreeNode(item, open) {
  const key = item.dataset.key;
  if (!key || !item.querySelector(':scope > ul')) return;   // 하위 메뉴가 없으면 접을 것도 없음
  const willClose = open === undefined ? !item.classList.contains('closed') : !open;
  item.classList.toggle('closed', willClose);
  item.firstElementChild.setAttribute('aria-expanded', String(!willClose));
  if (willClose) treeState.closedKeys.add(key);
  else treeState.closedKeys.delete(key);
  saveClosedFolders();
}

/**
 * 트리 항목(<li>) 하나 만들기
 * 시안 규칙: 폴더(하위 메뉴 있음)는 ▾ + 굵은 이름 + 하위 화면 수 / 화면은 이름 + 상태 점. 들여쓰기는 단계마다 22px
 */
function createTreeItem({dir, parentDir, name, path, meta, statusIndex, childList, childScreenCount}) {
  const key = path.join('/');
  const isFolder = childList.children.length > 0;
  const isClosed = isFolder && !isFiltering() && treeState.closedKeys.has(key);

  const item = document.createElement('li');
  item.dataset.key = key;
  if (isClosed) item.classList.add('closed');

  const node = document.createElement('a');
  node.className = 'node' + (isFolder ? ' fd' : '');
  node.tabIndex = 0;
  node.setAttribute('role', 'treeitem');
  node.style.paddingLeft = (8 + (path.length - 1) * 22) + 'px';
  if (isFolder) node.setAttribute('aria-expanded', String(!isClosed));
  node.title = path.join(' / ') + (statusIndex >= 0 ? ' · ' + STATUS_LIST[statusIndex] : '');   // 폴더 자신의 상태는 여기서 확인
  const caret = isFolder ? `<span class="tw">${ICON.caret}</span>` : '';
  const trailing = isFolder
    ? (childScreenCount ? `<span class="cnt">${childScreenCount}</span>` : '')
    : (statusIndex >= 0 ? `<i class="dot s${statusIndex}" aria-label="${STATUS_LIST[statusIndex]}"></i>` : '');
  node.innerHTML = caret + `<span class="nm">${escapeHtml(name)}</span>` + trailing;
  if (app.screen && isSamePath(app.screen.path, path)) node.classList.add('sel');

  // 화면(meta 있음)은 열고, 화면이 아닌 폴더는 접고 펼침. ▾ 는 언제나 접고 펼침
  const activate = () => (meta ? openScreen(path) : toggleTreeNode(item));
  node.onclick = e => {
    if (e.target.closest('.tw')) { e.stopPropagation(); toggleTreeNode(item); return; }
    activate();
  };
  node.onkeydown = e => {
    if (e.key === 'Enter') activate();
    else if (e.key === 'ArrowLeft') { e.preventDefault(); toggleTreeNode(item, false); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); toggleTreeNode(item, true); }
  };
  node.oncontextmenu = e => {
    e.preventDefault();
    showFolderMenu({x: e.clientX, y: e.clientY}, {dir, parent: parentDir, name, path});
  };

  item.append(node);
  if (isFolder) item.append(childList);
  return item;
}

/**
 * 트리 한 단계 그리기 (하위는 재귀)
 * @param {number[]} counter 상태별 화면 수를 여기에 더함
 * @param {number} seq 그리기 순번 (바뀌면 중단)
 * @returns {Promise<{list: HTMLUListElement, hasVisible: boolean, screenCount: number}>}
 */
async function buildTreeBranch(dir, path, counter, seq) {
  const list = document.createElement('ul');
  list.setAttribute('role', 'group');
  let hasVisible = false, screenCount = 0;

  for (const name of await listChildFolders(dir)) {
    if (seq !== treeState.renderSeq) break;
    const childDir = await dir.getDirectoryHandle(name);
    const childPath = [...path, name];
    const meta = await readJson(childDir, 'meta.json', null);
    const statusIndex = meta ? statusIndexOf(meta) : -1;
    if (statusIndex >= 0) { counter[statusIndex]++; screenCount++; }

    const child = await buildTreeBranch(childDir, childPath, counter, seq);
    screenCount += child.screenCount;

    // 상태 필터·검색에 맞지 않아도, 맞는 하위 항목이 있으면 경로를 보여 주기 위해 남김
    const matches = (app.statusFilter === null || statusIndex === app.statusFilter) && await matchesSearch(childDir, name, meta);
    if (!matches && !child.hasVisible) continue;
    hasVisible = true;
    list.append(createTreeItem({dir: childDir, parentDir: dir, name, path: childPath, meta, statusIndex, childList: child.list, childScreenCount: child.screenCount}));
  }
  return {list, hasVisible, screenCount};
}

/**
 * 트리 전체 다시 그리기
 * 다 그린 뒤 한 번에 바꿔 끼우므로 스크롤 위치가 튀지 않음
 */
async function renderTree() {
  const tree = $('#tree');
  const seq = ++treeState.renderSeq;
  const counter = [0, 0, 0, 0];
  if (!app.root) {
    tree.replaceChildren();
    app.statusCounts = counter;
    renderStatusSummary();
    return;
  }
  // 열려 있는 화면의 상위 폴더는 펼쳐 둠
  if (app.screen) {
    for (let depth = 1; depth < app.screen.path.length; depth++) treeState.closedKeys.delete(app.screen.path.slice(0, depth).join('/'));
  }
  const {list, hasVisible} = await buildTreeBranch(app.root, [], counter, seq);
  if (seq !== treeState.renderSeq) return;   // 그 사이 다시 그리기가 시작됨

  const items = [...list.children];
  if (!hasVisible) {
    const empty = document.createElement('li');
    empty.className = 'nohit';
    empty.textContent = isFiltering() ? '조건에 맞는 화면이 없습니다.' : '아직 메뉴가 없습니다. 이곳을 우클릭해 메뉴를 추가하세요.';
    items.push(empty);
  }
  tree.replaceChildren(...items);
  app.statusCounts = counter;
  renderStatusSummary();
}

/** 상태 선택 상자(항목별 화면 수)와 운영 반영률 표시 갱신 */
function renderStatusSummary() {
  const counts = app.statusCounts;
  const total = counts.reduce((sum, n) => sum + n, 0);
  const prodPercent = total ? Math.round(counts[STATUS_PROD] / total * 100) : 0;

  const select = $('#stFilter');
  for (const option of select.options) {
    const index = option.value === 'all' ? null : Number(option.value);
    option.textContent = index === null ? `전체 ${total}` : `${STATUS_LIST[index]} ${counts[index]}`;
  }
  select.value = app.statusFilter === null ? 'all' : String(app.statusFilter);
  select.className = 'stf' + (app.statusFilter === null ? '' : ' s' + app.statusFilter);

  $('#gfill').style.width = prodPercent + '%';
  $('#gauge').setAttribute('aria-valuenow', prodPercent);
  $('#gtxt').textContent = `${counts[STATUS_PROD]} / ${total} · ${prodPercent}%`;
}

/* ======================= 폴더 메뉴 ======================= */

/** 폴더 위치를 "루트 › 인사 › 사원조회" 형태로 */
const describeLocation = path => [app.root.name, ...path].join(' › ');

/**
 * 우클릭 메뉴
 * @param {{dir, parent, name, path}} target parent 가 null 이면 루트
 */
function showFolderMenu(position, target) {
  const items = [['하위 메뉴 추가', () => addSubMenu(target)], ['폴더 경로 복사', () => copyFolderPath(target)]];
  if (target.parent) items.push(['메뉴 이동', () => openMoveDialog(target)], ['이름 변경', () => renameMenuFolder(target)]);
  else items.push(['루트 경로 다시 설정', () => copyFolderPath(target, true)]);
  showMenu(position, items);
}

/** 하위 메뉴(화면 폴더) 추가 */
async function addSubMenu(target) {
  const answer = await askText({
    title: '하위 메뉴 추가',
    desc: '위치: ' + describeLocation(target.path),
    label: '메뉴(폴더) 이름',
    okText: '추가',
    hint: '특수문자 \\ / : * ? " < > | 와 asis, tobe 같은 예약어는 쓸 수 없습니다.',
    check: '만든 뒤 바로 열기',
    checked: true,
    validate: name => !name ? '이름을 입력하세요.' : validateFolderName(name)
  });
  if (!answer) return;
  if (await hasSubDir(target.dir, answer.value)) return toast('같은 이름의 폴더가 이미 있습니다.');
  try {
    await withBusy('메뉴를 만드는 중…', async () => {
      const newDir = await target.dir.getDirectoryHandle(answer.value, {create: true});
      const now = new Date();
      await writeJson(newDir, 'meta.json', {
        status: '요청',
        filesV: FILE_STRUCTURE_VERSION,
        createdAt: now.toLocaleString('ko-KR'),
        statusLog: [{status: '요청', at: now.toISOString()}]
      });
      treeState.closedKeys.delete(target.path.join('/'));   // 새 메뉴가 보이도록 상위 폴더를 펼침
      if (answer.checked) await openScreen([...target.path, answer.value]);
      else await renderTree();
    });
    toast('폴더를 만들었습니다.');
  } catch (error) {
    toastError('폴더 생성 실패', error);
  }
}

/**
 * 폴더를 다른 이름/위치로 옮김 (이름 변경과 메뉴 이동이 함께 씀)
 * 브라우저에는 폴더 이동 기능이 없어서 "새 폴더에 복사 → 원래 폴더 삭제" 로 처리합니다.
 * 복사 중 실패하면 만든 새 폴더를 지워 원래 상태로 되돌립니다.
 * @param {{dir, parent, name, path}} target 옮길 폴더
 * @param {FileSystemDirectoryHandle} destParent 옮겨 갈 상위 폴더
 * @param {string} newName 새 이름
 */
async function relocateFolder(target, destParent, newName) {
  const newDir = await destParent.getDirectoryHandle(newName, {create: true});
  try {
    await copyDirectory(target.dir, newDir);
  } catch (error) {
    await destParent.removeEntry(newName, {recursive: true});
    throw error;
  }
  await target.parent.removeEntry(target.name, {recursive: true});
  // 옮긴 폴더(또는 그 아래)의 화면을 보고 있었다면 현황으로 (경로가 바뀌었으므로)
  if (app.screen && isPathUnder(app.screen.path, target.path)) {
    app.screen = null;
    showHome();
  }
  await renderTree();
}

/** 이름 변경 */
async function renameMenuFolder(target) {
  const answer = await askText({
    title: '이름 변경',
    desc: '위치: ' + describeLocation(target.path),
    label: '새 이름',
    value: target.name,
    okText: '변경',
    validate: name => !name ? '이름을 입력하세요.' : validateFolderName(name)
  });
  if (!answer || answer.value === target.name) return;
  if (await hasSubDir(target.parent, answer.value)) return toast('같은 이름의 폴더가 이미 있습니다.');
  if (!(await confirmLeaveScreen())) return;
  try {
    await withBusy('이름을 바꾸는 중…', () => relocateFolder(target, target.parent, answer.value));
    toast('이름을 변경했습니다.');
  } catch (error) {
    toastError('이름 변경 실패', error);
  }
}

/** 옮길 수 있는 위치 목록 (옮길 폴더 자신과 그 아래는 제외) */
async function collectMoveDestinations(dir, path, depth, target, found = []) {
  found.push({dir, path, depth, name: path.length ? lastOf(path) : app.root.name});
  for (const name of await listChildFolders(dir)) {
    const childPath = [...path, name];
    if (isSamePath(childPath, target.path)) continue;
    await collectMoveDestinations(await dir.getDirectoryHandle(name), childPath, depth + 1, target, found);
  }
  return found;
}

/** 메뉴 이동 창 열기 */
async function openMoveDialog(target) {
  const destinations = await collectMoveDestinations(app.root, [], 0, target);
  const currentParent = target.path.slice(0, -1);
  const list = $('#mvList');
  moveState = {target, destination: null};
  list.innerHTML = '';
  $('#mvInfo').textContent = '"' + target.name + '" 폴더(하위 메뉴 포함)를 옮길 위치를 선택하세요.';

  for (const destination of destinations) {
    const isCurrent = isSamePath(destination.path, currentParent);
    const option = createButton({label: '', className: 'mv-item' + (isCurrent ? ' off' : '')});
    option.disabled = isCurrent;
    option.style.paddingLeft = (10 + destination.depth * 16) + 'px';
    option.setAttribute('role', 'option');
    option.title = [app.root.name, ...destination.path].join(' / ');
    option.innerHTML = ICON.folder + `<span class="nm">${escapeHtml(destination.name)}</span>` + (isCurrent ? '<span class="tag">현재 위치</span>' : '');
    if (!isCurrent) {
      option.onclick = () => {
        moveState.destination = destination;
        list.querySelectorAll('.mv-item').forEach(other => other.classList.remove('sel'));
        option.classList.add('sel');
        $('#mvSel').textContent = '이동 위치: ' + describeLocation(destination.path);
        $('#mvOk').disabled = false;
      };
    }
    list.append(option);
  }
  $('#mvSel').textContent = '이동할 위치를 선택하세요.';
  $('#mvOk').disabled = true;
  $('#moveModal').hidden = false;
}

/** 메뉴 이동 창의 [이동] */
async function confirmMove() {
  const {target, destination} = moveState || {};
  if (!destination) return;
  if (await hasSubDir(destination.dir, target.name)) return toast('이동할 위치에 같은 이름의 폴더가 이미 있습니다.');
  if (!(await confirmLeaveScreen())) return;
  $('#moveModal').hidden = true;
  try {
    await withBusy('메뉴를 옮기는 중…', () => relocateFolder(target, destination.dir, target.name));
    toast('이동했습니다.');
  } catch (error) {
    toastError('이동 실패', error);
  }
}

/**
 * 폴더의 전체 경로를 클립보드에 복사 (브라우저는 탐색기를 직접 열 수 없어 경로를 대신 줌)
 * 처음 한 번은 루트 폴더의 실제 경로(예: D:\asis-backup)를 물어보고 저장합니다.
 * @param {boolean} [resetRootPath] true 면 저장된 루트 경로를 다시 입력받음
 */
async function copyFolderPath(target, resetRootPath) {
  const key = SETTING_KEYS.rootPath(app.root.name);
  let rootPath = resetRootPath ? '' : await settings.get(key);
  if (!rootPath) {
    const answer = await askText({
      title: resetRootPath ? '루트 경로 다시 설정' : '루트 폴더 경로 입력',
      label: '루트 폴더의 전체 경로',
      placeholder: '예: D:\\asis-backup',
      mono: true,
      okText: '저장',
      desc: '한 번만 입력하면 저장됩니다. 브라우저는 탐색기를 직접 열 수 없어, 폴더의 전체 경로를 복사해 드립니다.',
      validate: value => value ? '' : '경로를 입력하세요.'
    });
    if (!answer) return;
    rootPath = answer.value;
    await settings.set(key, rootPath);
    if (resetRootPath) return toast('루트 경로를 저장했습니다.');
  }
  const separator = rootPath.includes('\\') ? '\\' : '/';
  const fullPath = [rootPath.replace(/[\\/]+$/, ''), ...target.path].join(separator);
  try {
    await navigator.clipboard.writeText(fullPath);
    toast('경로를 복사했습니다. 탐색기 주소창에 붙여넣으세요.');
  } catch {
    // 클립보드를 쓸 수 없으면 직접 복사하도록 보여 줌
    await askText({title: '폴더 경로', desc: '아래 경로를 복사(Ctrl+C)해 탐색기 주소창에 붙여넣으세요.', label: '경로', value: fullPath, readonly: true, mono: true, okText: '닫기', noCancel: true});
  }
}

/* ======================= 이벤트 연결 ======================= */

function initTree() {
  $('#btnPick').onclick = pickRootFolder;
  $('#btnResume').onclick = resumeRootFolder;

  // 검색: 입력이 멈추고 0.25초 뒤에 그리기 (글자마다 다시 그리지 않도록)
  $('#q').oninput = () => {
    clearTimeout(treeState.searchTimer);
    treeState.searchTimer = setTimeout(() => {
      treeState.query = $('#q').value.trim().toLowerCase();
      renderTree();
    }, 250);
  };
  // 검색창에서 Esc: 검색어 지우기 (창 닫기 Esc 보다 먼저 처리)
  $('#q').onkeydown = e => {
    if (e.key !== 'Escape' || !$('#q').value) return;
    e.stopPropagation();
    $('#q').value = '';
    treeState.query = '';
    renderTree();
  };
  // 상태 필터: 트리와 검색 모두 고른 상태 안에서만
  $('#stFilter').onchange = e => {
    app.statusFilter = e.target.value === 'all' ? null : Number(e.target.value);
    renderTree();
  };
  // 상단 위치 표시의 루트 이름 → 현황
  $('#crumb').onclick = e => { if (e.target.closest('.crumb-root')) goHome(); };
  // 트리 빈 곳 우클릭 → 루트 바로 아래에 메뉴 추가
  $('.side').oncontextmenu = e => {
    if (!app.root || e.target.closest('.node, input, select')) return;
    e.preventDefault();
    showFolderMenu({x: e.clientX, y: e.clientY}, {dir: app.root, parent: null, name: app.root.name, path: []});
  };
  $('#mvCancel').onclick = () => { $('#moveModal').hidden = true; };
  $('#mvOk').onclick = confirmMove;
  // 다른 프로그램(탐색기 등)에서 폴더가 바뀌었을 수 있으니 창으로 돌아오면 트리를 다시 그림
  window.addEventListener('focus', () => { if (app.root) renderTree(); });
}
