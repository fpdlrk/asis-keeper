/* ==========================================================================
   tree.js — 왼쪽 영역
     - 루트 폴더 선택 / 지난번 루트 다시 열기
     - 화면 트리 (상태 필터 · 검색 · 접기/펼치기)
     - 폴더 메뉴 (파일 추가 · 이름 변경 · 이동 · 경로 복사 · 삭제)
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
  if (app.project) settings.setQuietly(SETTING_KEYS.closedFolders(app.project.id), [...treeState.closedKeys]);
};

/* ======================= 루트 폴더 ======================= */

/**
 * 고른 프로젝트의 폴더를 루트로 설정: 접힘 상태 불러오기 → 파일 구조 변환 → 트리 그리기 → 현황 화면
 * 프로젝트 등록·전환은 js/project.js 에서 하고, 여기서는 폴더가 정해진 뒤의 일만 합니다.
 */
async function setRootFolder(handle) {
  await withBusy('프로젝트를 여는 중… (파일 구조 확인 포함)', async () => {
    app.root = handle;
    $('#btnReport').disabled = false;
    app.screen = null;
    app.statusFilter = null;
    app.notice = '';
    try {
      treeState.closedKeys = new Set((app.project && await settings.get(SETTING_KEYS.closedFolders(app.project.id))) || []);
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
    crumb.innerHTML = '<span class="muted">프로젝트가 열려 있지 않습니다</span>';
    return;
  }
  const parts = app.screen ? app.screen.path : [];
  crumb.innerHTML = `<button type="button" class="crumb-root mono" title="현황 보기">${escapeHtml(rootLabel())}</button>`
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
  // SQL 정의 · 파라미터는 meta.json 안에 있음
  const sqlDefinitionText = Object.values(meta.sqlBlocks || {}).flat()
    .flatMap(block => [...Object.values(block.info || {}), ...(block.params || []).flat()]).join('\n').toLowerCase();
  if (sqlDefinitionText.includes(query)) return true;

  // 내용까지 찾을 파일: 메모 + 정의서(표 · 예전 글) + SQL 블록 (예전 구조 파일 포함)
  const files = [
    ...Object.values(TEXT_FIELD_FILES),
    ...Object.keys(DEF_TABS).flatMap(defDataFiles),
    ...Object.values(LEGACY_DEF_FILES).flatMap(legacy => [legacy.grid, ...Object.values(legacy.texts)].filter(Boolean))
  ];
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
  const isScreen = !!meta;                             // meta.json 이 있으면 화면(페이지), 없으면 메뉴를 묶는 폴더
  const hasChildren = childList.children.length > 0;
  const isFolder = !isScreen || hasChildren;           // 묶음 폴더는 비어 있어도 폴더로 보여 줌
  const isClosed = hasChildren && !isFiltering() && treeState.closedKeys.has(key);

  const item = document.createElement('li');
  item.dataset.key = key;
  if (isClosed) item.classList.add('closed');

  const node = document.createElement('a');
  node.className = 'node' + (isFolder ? ' fd' : '');
  node.tabIndex = 0;
  node.setAttribute('role', 'treeitem');
  node.style.paddingLeft = (8 + (path.length - 1) * 22) + 'px';
  if (hasChildren) node.setAttribute('aria-expanded', String(!isClosed));
  node.title = path.join(' / ')
    + (isScreen ? (statusIndex >= 0 ? ' · ' + STATUS_LIST[statusIndex] : '') : ' · 폴더 (메뉴 묶음)');
  const caret = hasChildren ? `<span class="tw">${ICON.caret}</span>` : '';
  const folderIcon = isScreen ? '' : ICON.folder;      // 화면과 폴더를 한눈에 구분
  const trailing = hasChildren
    ? (childScreenCount ? `<span class="cnt">${childScreenCount}</span>` : '')
    : (statusIndex >= 0 ? `<i class="dot s${statusIndex}" aria-label="${STATUS_LIST[statusIndex]}"></i>` : '');
  node.innerHTML = caret + folderIcon + `<span class="nm">${escapeHtml(name)}</span>` + trailing;
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
    showFolderMenu({x: e.clientX, y: e.clientY}, {dir, parent: parentDir, name, path, isScreen});
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
const describeLocation = path => [rootLabel(), ...path].join(' › ');

/**
 * 우클릭 메뉴
 * @param {{dir, parent, name, path, isScreen}} target
 *   parent 가 null 이면 루트, isScreen 이 true 면 화면(메뉴)
 *   화면은 그 자체가 내용을 담는 페이지이므로 그 아래에는 아무것도 넣을 수 없습니다 (담을 수 있는 것은 폴더와 루트뿐)
 */
function showFolderMenu(position, target) {
  const items = [];
  // 담는 것(폴더)을 먼저, 담기는 것(화면)을 다음에
  if (!target.isScreen) {
    items.push(
      ['하위 폴더 추가', () => addSubFolder(target), '', MENU_ICON.folderAdd],
      ['파일 추가', () => addSubMenu(target), '', MENU_ICON.pageAdd]
    );
  }
  items.push(['탐색기 경로 복사', () => copyFolderPath(target), '', MENU_ICON.clipboard]);
  if (target.parent) {
    // 복사는 화면(메뉴)만. 폴더는 묶음이라 통째로 복제할 일이 없고, 이동 이름도 '폴더 이동'으로 구분합니다.
    if (target.isScreen) items.push(['메뉴 복사', () => openMoveDialog(target, 'copy'), '', MENU_ICON.copy]);
    items.push(
      [(target.isScreen ? '메뉴' : '폴더') + ' 이동', () => openMoveDialog(target, 'move'), '', MENU_ICON.move],
      ['이름 변경', () => renameMenuFolder(target), '', MENU_ICON.rename],
      ['삭제', () => deleteMenuFolder(target), 'danger', MENU_ICON.trash]
    );
  } else {
    items.push(['루트 경로 다시 설정', () => copyFolderPath(target, true), '', MENU_ICON.settings]);
  }
  showMenu(position, items);
}

/**
 * 하위 폴더(메뉴 묶음) 추가
 * meta.json 을 만들지 않습니다 — 그래서 본문에 입력하는 화면이 없고, 눌러도 열고 닫기만 합니다.
 * 화면으로 쓸 것은 addSubMenu() 로 만듭니다.
 */
async function addSubFolder(target) {
  const answer = await askText({
    title: '하위 폴더 추가',
    desc: '위치: ' + describeLocation(target.path),
    label: '폴더 이름',
    okText: '추가',
    hint: '폴더는 메뉴를 묶어 두는 칸입니다. 본문에 입력하는 화면이 없고, 눌러도 열고 닫기만 합니다.'
      + ' 특수문자 \\ / : * ? " < > | 와 asis, tobe 같은 예약어는 쓸 수 없습니다.',
    validate: name => !name ? '이름을 입력하세요.' : validateFolderName(name)
  });
  if (!answer) return;
  if (await hasSubDir(target.dir, answer.value)) return toast('같은 이름의 폴더가 이미 있습니다.');
  try {
    await withBusy('폴더를 만드는 중…', async () => {
      await target.dir.getDirectoryHandle(answer.value, {create: true});
      treeState.closedKeys.delete(target.path.join('/'));   // 새 폴더가 보이도록 상위 폴더를 펼침
      await renderTree();
    });
    toast('폴더를 만들었습니다.');
  } catch (error) {
    toastError('폴더 생성 실패', error);
  }
}

/** 파일(화면 폴더) 추가 — meta.json 을 만들므로 본문에 화면이 열립니다. 티켓번호는 자동으로 붙음 */
async function addSubMenu(target) {
  const answer = await askText({
    title: '파일 추가',
    desc: '위치: ' + describeLocation(target.path),
    label: '파일(화면) 이름',
    okText: '추가',
    hint: '본문에서 SQL·파일·정의서를 입력하는 화면이 만들어집니다. 묶음만 필요하면 ‘하위 폴더 추가’를 쓰세요.'
      + ' 특수문자 \\ / : * ? " < > | 와 asis, tobe 같은 예약어는 쓸 수 없습니다.',
    check: '만든 뒤 바로 열기',
    checked: true,
    validate: name => !name ? '이름을 입력하세요.' : validateFolderName(name)
  });
  if (!answer) return;
  if (await hasSubDir(target.dir, answer.value)) return toast('같은 이름의 폴더가 이미 있습니다.');
  try {
    await withBusy('메뉴를 만드는 중…', async () => {
      const seq = await openTicketSequence(app.root);
      const ticket = nextTicket(seq);
      const newDir = await target.dir.getDirectoryHandle(answer.value, {create: true});
      const now = new Date();
      await writeJson(newDir, 'meta.json', {
        ticket,
        status: '요청',
        filesV: FILE_STRUCTURE_VERSION,
        createdAt: now.toLocaleString('ko-KR'),
        statusLog: [{status: '요청', at: now.toISOString()}]
      });
      await saveTicketSequence(seq);
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

/**
 * 삭제 (메뉴 · 폴더) — 하위 메뉴와 그 안의 SQL · 정의서 · 첨부 · 이력까지 모두 지움. 되돌릴 수 없음
 * 실수를 막기 위해 이름을 그대로 입력해야 지울 수 있습니다.
 */
async function deleteMenuFolder(target) {
  const kindName = target.isScreen ? '메뉴' : '폴더';
  let screenCount = 0;
  try {
    screenCount = (await findAllScreens(target.dir)).length + (target.isScreen ? 1 : 0);
  } catch (error) {
    return toastError('삭제 실패', error);
  }
  const contents = target.isScreen
    ? (screenCount > 1 ? `이 메뉴와 그 안의 메뉴 ${screenCount - 1}개` : '이 메뉴')
    : (screenCount ? `이 폴더와 그 안의 메뉴 ${screenCount}개` : '이 폴더와 그 안의 모든 것');
  const answer = await askText({
    title: `${kindName} 영구 삭제`,
    desc: `⚠ 삭제하면 되돌릴 수 없습니다. 휴지통에도 남지 않습니다.

`
      + `위치: ${describeLocation(target.path)}
`
      + `${contents}의 원본·신규 SQL, 정의서, 첨부 파일, 상태·잠금·작업 이력이 모두 지워집니다.`,
    label: `지우려면 ${kindName} 이름 ‘${target.name}’을 그대로 입력하세요`,
    placeholder: target.name,
    okText: '영구 삭제',
    danger: true,
    validate: value => (value === target.name ? '' : '이름이 맞지 않습니다. 이름을 그대로 입력해야 지울 수 있습니다.')
  });
  if (!answer) return;
  try {
    await withBusy(`${kindName}를 지우는 중…`, async () => {
      await target.parent.removeEntry(target.name, {recursive: true});
      // 지운 폴더(또는 그 아래)의 화면을 보고 있었다면 현황으로 (등록 안 된 변경도 함께 지워진 것이므로 묻지 않음)
      if (app.screen && isPathUnder(app.screen.path, target.path)) {
        app.screen = null;
        showHome();
      }
      await renderTree();
    });
    toast(`‘${target.name}’ ${kindName}를 삭제했습니다.`);
  } catch (error) {
    toastError('삭제 실패', error);
  }
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

/* ======================= 메뉴 복사 ======================= */

/* 복사한 폴더 이름 뒤에 붙이는 말. 같은 이름이 또 있으면 _COPY2, _COPY3 … 으로 늘립니다. */
const COPY_NAME_SUFFIX = '_COPY';
/* 이름 뒤 숫자를 몇까지 시도할지 */
const MAX_COPY_NAME_TRIES = 99;

/**
 * 복사한 폴더에 쓸 이름 ('사원조회' → '사원조회_COPY', 이미 있으면 '사원조회_COPY2' …)
 * @returns {Promise<string>} 빈 문자열이면 쓸 수 있는 이름을 찾지 못함
 */
async function uniqueCopyName(destDir, baseName) {
  const firstName = baseName + COPY_NAME_SUFFIX;
  if (!(await hasSubDir(destDir, firstName))) return firstName;
  for (let number = 2; number <= MAX_COPY_NAME_TRIES; number++) {
    const name = firstName + number;
    if (!(await hasSubDir(destDir, name))) return name;
  }
  return '';
}

/**
 * 복사한 폴더(하위 포함) 안의 모든 화면에서 작업 기록을 지움 — 내용만 가져올 때 씀
 * 상태는 '요청'으로 돌리고, 상태 이력은 새로 시작하고, 원본 잠금·해시·잠금 해제 이력·SQL 이력·정의서 항목 이력은 지웁니다.
 * (잠금이 풀린 원본 단계로 시작 — 원본 · 신규 내용은 그대로)
 * (원본의 등록 기록이 복사본에도 남으면 현황 집계와 보고서가 같은 작업을 두 번 센 것처럼 보이기 때문)
 */
async function resetCopiedWorkLog(dir) {
  const meta = await readJson(dir, 'meta.json', null);
  if (meta) {
    const now = new Date();
    const cleaned = {...meta, status: STATUS_LIST[0], createdAt: now.toLocaleString('ko-KR'),
      statusLog: [{status: STATUS_LIST[0], at: now.toISOString()}]};
    for (const key of ['tabLocks', 'activityLog', ...LEGACY_LOCK_KEYS]) delete cleaned[key];
    // SQL 마다 쌓은 이력도 작업 기록이므로 지움 (SQL 내용·이름·짝은 그대로)
    if (cleaned.sqlBlocks) {
      cleaned.sqlBlocks = Object.fromEntries(Object.entries(cleaned.sqlBlocks)
        .map(([kind, blocks]) => [kind, (blocks || []).map(({log, ...rest}) => rest)]));
    }
    await writeJson(dir, 'meta.json', cleaned);
    // 정의서 항목마다 쌓은 이력도 지움 (이름·표는 그대로)
    for (const path of Object.keys(DEF_TABS).flatMap(defDataFiles)) {
      const items = await readJson(dir, path, null);
      if (Array.isArray(items)) await writeJson(dir, path, items.map(({log, ...rest}) => rest));
    }
  }
  for (const name of await listChildFolders(dir)) await resetCopiedWorkLog(await dir.getDirectoryHandle(name));
}

/**
 * 폴더를 다른 위치에 복사 (실패하면 만든 폴더를 지워 원래 상태로 되돌림)
 * @param {{dir, name}} target 복사할 폴더
 * @param {FileSystemDirectoryHandle} destParent 복사해 넣을 상위 폴더
 * @param {string} newName 복사본 이름
 * @param {boolean} keepWorkLog true = 상태·이력·잠금까지 그대로, false = 작업 기록 초기화
 * 어느 쪽이든 복사본의 화면에는 새 티켓번호를 붙입니다 (티켓번호는 겹치면 안 됨)
 */
async function copyMenuFolder(target, destParent, newName, keepWorkLog) {
  const seq = await openTicketSequence(app.root);
  const newDir = await destParent.getDirectoryHandle(newName, {create: true});
  try {
    await copyDirectory(target.dir, newDir);
    if (!keepWorkLog) await resetCopiedWorkLog(newDir);
    await assignNewTickets(newDir, seq);
    await saveTicketSequence(seq);
  } catch (error) {
    await destParent.removeEntry(newName, {recursive: true});
    throw error;
  }
}

/** 메뉴 복사 창의 [복사] — 열어 둔 화면은 그대로 두므로 이동 확인을 받지 않습니다 */
async function copySelectedMenu(target, destination) {
  const newName = await uniqueCopyName(destination.dir, target.name);
  if (!newName) return toast(`쓸 수 있는 복사 이름이 없습니다. ${COPY_NAME_SUFFIX} 폴더를 정리해 주세요.`);
  const keepWorkLog = $('#mvKeep').checked;
  $('#moveModal').hidden = true;
  try {
    await withBusy('메뉴를 복사하는 중…', async () => {
      await copyMenuFolder(target, destination.dir, newName, keepWorkLog);
      treeState.closedKeys.delete(destination.path.join('/'));   // 복사한 메뉴가 보이도록 상위 폴더를 펼침
      await renderTree();
    });
    toast(`"${newName}" 으로 복사했습니다.`);
  } catch (error) {
    toastError('복사 실패', error);
  }
}

/* ======================= 위치 선택 창 (이동 · 복사 공용) ======================= */

/** 창의 글자. 이동과 복사가 같은 창(#moveModal)을 씁니다. */
const MOVE_DIALOG_TEXT = {
  move: {
    okText: '이동',
    title: noun => noun + ' 이동',
    info: (noun, name) => noun === '폴더'
      ? `"${name}" 폴더를 하위 내용과 함께 옮길 위치를 선택하세요.`
      : `"${name}" 메뉴를 옮길 위치를 선택하세요.`,
    pick: '이동할 위치를 선택하세요.', picked: '이동 위치: '
  },
  copy: {
    okText: '복사',
    title: () => '메뉴 복사',
    info: (noun, name) => `"${name}" 메뉴를 복사할 위치를 선택하세요. 이름 뒤에 ${COPY_NAME_SUFFIX} 가 붙습니다.`,
    pick: '복사할 위치를 선택하세요.', picked: '복사 위치: '
  }
};

/**
 * 넣을 수 있는 위치 목록 (루트와 폴더만)
 * 제외 대상
 *   - 옮길/복사할 폴더 자신과 그 아래 (자기 안으로는 넣을 수 없음)
 *   - 화면(메뉴) 폴더와 그 아래 (화면 안에는 아무것도 넣을 수 없음)
 */
async function collectMoveDestinations(dir, path, depth, target, found = []) {
  found.push({dir, path, depth, name: path.length ? lastOf(path) : rootLabel()});
  for (const name of await listChildFolders(dir)) {
    const childPath = [...path, name];
    if (isSamePath(childPath, target.path)) continue;
    const childDir = await dir.getDirectoryHandle(name);
    if (await readJson(childDir, 'meta.json', null)) continue;
    await collectMoveDestinations(childDir, childPath, depth + 1, target, found);
  }
  return found;
}

/**
 * 위치 선택 창 열기
 * @param {{dir, parent, name, path}} target 옮기거나 복사할 폴더
 * @param {'move'|'copy'} [mode] 복사는 지금 있는 위치에도 넣을 수 있어 '현재 위치'를 막지 않습니다.
 */
async function openMoveDialog(target, mode = 'move') {
  const text = MOVE_DIALOG_TEXT[mode];
  const destinations = await collectMoveDestinations(app.root, [], 0, target);
  const currentParent = target.path.slice(0, -1);
  // 고를 수 있는 위치가 없으면 창을 열지 않음 (이동은 지금 있는 위치를 다시 고를 수 없으므로 루트뿐이면 갈 곳이 없음)
  if (!destinations.some(destination => mode === 'copy' || !isSamePath(destination.path, currentParent))) {
    return toast('옮길 수 있는 위치가 없습니다. 먼저 ‘하위 폴더 추가’로 폴더를 만들어 주세요.');
  }
  const list = $('#mvList');
  moveState = {target, destination: null, mode};
  list.innerHTML = '';
  const noun = target.isScreen ? '메뉴' : '폴더';
  $('#mvTitle').textContent = text.title(noun);
  $('#mvOk').textContent = text.okText;
  $('#mvInfo').textContent = text.info(noun, target.name);
  $('#mvKeepRow').hidden = mode !== 'copy';
  $('#mvKeep').checked = false;

  for (const destination of destinations) {
    const isCurrent = isSamePath(destination.path, currentParent);
    const blocked = isCurrent && mode === 'move';   // 이동은 지금 있는 위치를 다시 고를 수 없음
    const option = createButton({label: '', className: 'mv-item' + (blocked ? ' off' : '')});
    option.disabled = blocked;
    option.style.paddingLeft = (10 + destination.depth * 16) + 'px';
    option.setAttribute('role', 'option');
    option.title = [rootLabel(), ...destination.path].join(' / ');
    option.innerHTML = ICON.folder + `<span class="nm">${escapeHtml(destination.name)}</span>` + (isCurrent ? '<span class="tag">현재 위치</span>' : '');
    if (!blocked) {
      option.onclick = async () => {
        moveState.destination = destination;
        list.querySelectorAll('.mv-item').forEach(other => other.classList.remove('sel'));
        option.classList.add('sel');
        $('#mvOk').disabled = false;
        $('#mvSel').textContent = text.picked + describeLocation(destination.path);
        // 복사는 고른 위치에 따라 이름이 달라지므로(_COPY2 …) 미리 보여 줍니다
        if (mode !== 'copy') return;
        const newName = await uniqueCopyName(destination.dir, target.name);
        if (moveState.destination !== destination) return;   // 그 사이 다른 위치를 골랐으면 버림
        $('#mvSel').textContent = `${text.picked}${describeLocation(destination.path)} · 새 이름: ${newName || '(이름을 만들 수 없음)'}`;
      };
    }
    list.append(option);
  }
  $('#mvSel').textContent = text.pick;
  $('#mvOk').disabled = true;
  $('#moveModal').hidden = false;
}

/** 위치 선택 창의 [이동] / [복사] */
async function confirmMove() {
  const {target, destination, mode} = moveState || {};
  if (!destination) return;
  if (mode === 'copy') return copySelectedMenu(target, destination);
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
  if (!app.project) return toast('프로젝트를 먼저 열어 주세요.');
  const key = SETTING_KEYS.rootPath(app.project.id);   // 프로젝트별로 따로 저장 (이름이 같은 폴더끼리 섞이지 않게)
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

/* 폴더 다시 확인이 진행 중인지 (창 포커스가 연달아 와도 한 번만) */
let folderCheckRunning = false;

/**
 * 탐색기에서 돌아왔을 때(창 포커스) 폴더가 아직 있는지 확인하고 트리를 새로 그림
 *   - 프로젝트(루트) 폴더가 없어졌으면 알리고 목록에서 제거
 *   - 열어 둔 화면 폴더가 없어졌으면 알리고 현황으로
 *   - 그 밖에는 트리만 다시 그려, 탐색기에서 지우거나 추가한 메뉴·폴더를 반영
 * 처리 중이거나 확인·입력 창이 떠 있을 때는 건너뜁니다.
 */
async function recheckFolders() {
  if (!app.root || folderCheckRunning || isBusy() || closeActiveDialog) return;
  folderCheckRunning = true;
  try {
    if (!(await folderExists(app.root))) {
      await dropMissingProject(app.project);
      return;
    }
    if (app.screen && !(await folderExists(app.screen.dir))) {
      const name = lastOf(app.screen.path);
      app.screen = null;
      showHome();
      toast(`‘${name}’ 폴더가 없어져 화면을 닫았습니다.`);
    }
    await renderTree();
  } finally {
    folderCheckRunning = false;
  }
}

function initTree() {
  window.addEventListener('focus', recheckFolders);
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
    showFolderMenu({x: e.clientX, y: e.clientY}, {dir: app.root, parent: null, name: rootLabel(), path: []});
  };
  $('#mvCancel').onclick = () => { $('#moveModal').hidden = true; };
  $('#mvOk').onclick = confirmMove;
  // 다른 프로그램(탐색기 등)에서 폴더가 바뀌었을 수 있으니 창으로 돌아오면 트리를 다시 그림
  window.addEventListener('focus', () => { if (app.root) renderTree(); });
}
