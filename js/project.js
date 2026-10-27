/* ==========================================================================
   project.js — 프로젝트(루트 폴더)를 여러 개 등록하고 골라 쓰기

   상단 왼쪽의 프로젝트 단추를 누르면 등록한 목록이 나오고, 고르면 그 폴더로 전환합니다.

   ※ 브라우저는 세션이 끊기면 폴더 권한을 잃습니다.
     핸들은 IndexedDB 에 남지만 다시 열 때 한 번 허용을 받아야 하고,
     그 허용 요청(requestPermission)은 클릭 같은 사용자 동작 안에서만 띄울 수 있습니다.
     그래서 시작할 때는 권한이 살아 있는 경우에만 자동으로 열고,
     끊겼으면 단추에 열쇠 표시만 띄웠다가 목록에서 고르는 순간 허용을 요청합니다.

   저장 구조 (IndexedDB, settings.js)
     projects      : [{id, name, handle, lastOpenedAt}]
     lastProjectId : 마지막으로 연 프로젝트 id
   ========================================================================== */

/** 프로젝트 id 만들기 — 폴더 이름과 무관한 고유 값 (이름이 같은 폴더를 여러 개 등록할 수 있게) */
const newProjectId = () => 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);

/** 루트를 가리키는 이름: 프로젝트 이름 (없으면 폴더 이름) */
const rootLabel = () => (app.project ? app.project.name : (app.root ? app.root.name : ''));

/* 폴더 권한이 끊겨 아직 열지 못한 상태인지 (상단 단추의 열쇠 표시) */
let projectNeedsPermission = false;

/* ======================= 목록 읽기·쓰기 ======================= */

/** 등록한 프로젝트 목록 (읽을 수 없으면 빈 목록) */
async function loadProjects() {
  try {
    return (await settings.get(SETTING_KEYS.projects)) || [];
  } catch {
    return [];
  }
}

/** 목록 저장 */
const saveProjects = list => settings.set(SETTING_KEYS.projects, list);

/**
 * 예전 버전에서 쓰던 단일 루트 설정(SETTING_KEYS.root)을 프로젝트 목록으로 옮김 — 처음 한 번만
 * 폴더 이름으로 저장해 둔 설정(접어 둔 폴더, 탐색기 경로)도 새 id 기준으로 옮깁니다.
 * @param {object[]} projects 지금 목록
 * @returns {Promise<object[]>} 옮긴 뒤의 목록
 */
async function migrateLegacyProject(projects) {
  if (projects.length) return projects;
  let handle = null;
  try {
    handle = await settings.get(SETTING_KEYS.root);
  } catch { /* 저장된 값이 없으면 옮길 것도 없음 */ }
  if (!handle) return projects;

  const project = {id: newProjectId(), name: handle.name, handle, lastOpenedAt: new Date().toISOString()};
  for (const makeKey of [SETTING_KEYS.closedFolders, SETTING_KEYS.rootPath]) {
    try {
      const saved = await settings.get(makeKey(handle.name));
      if (saved !== undefined) await settings.setQuietly(makeKey(project.id), saved);
    } catch { /* 옮기지 못해도 앱 동작에는 영향 없음 */ }
  }
  const list = [project];
  await saveProjects(list);
  await settings.setQuietly(SETTING_KEYS.lastProjectId, project.id);
  return list;
}

/** 마지막으로 연 시각 기록 + 다음에 열 프로젝트로 저장 */
async function touchProject(project) {
  const list = (await loadProjects())
    .map(item => (item.id === project.id ? {...item, lastOpenedAt: new Date().toISOString()} : item));
  await saveProjects(list).catch(() => {});
  await settings.setQuietly(SETTING_KEYS.lastProjectId, project.id);
}

/* ======================= 상단 단추 ======================= */

/**
 * 상단 프로젝트 단추 갱신
 * @param {boolean} needsPermission true = 폴더 권한이 끊겨 아직 열지 못한 상태 (열쇠 표시)
 */
function renderProjectButton(needsPermission) {
  const button = $('#btnProject');
  const name = app.project ? app.project.name : '프로젝트 선택';
  projectNeedsPermission = !!needsPermission;
  $('#projName').textContent = name;
  $('#projLock').hidden = !needsPermission;
  button.classList.toggle('empty', !app.project);
  button.title = !app.project
    ? '폴더를 등록해 시작하세요'
    : needsPermission
      ? `${name} · 폴더 권한이 끊겼습니다. 눌러 다시 허용하세요.`
      : `${name} · 눌러 프로젝트 전환`;
}

/** 마지막으로 연 시각을 '방금 · 3일 전' 처럼 */
function describeSince(iso) {
  const time = new Date(iso).getTime();
  if (!time) return '';
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return minutes + '분 전';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + '시간 전';
  const days = Math.floor(hours / 24);
  return days < 30 ? days + '일 전' : Math.floor(days / 30) + '달 전';
}

/* ======================= 열기 · 추가 · 이름 변경 · 제거 ======================= */

/**
 * 프로젝트 열기 — 권한을 확인하고(끊겼으면 요청) 루트 폴더로 설정
 * 반드시 클릭 안에서 불려야 합니다 (requestPermission 제약)
 */
async function openProject(project) {
  if (!project) return;
  if (app.root && app.project && app.project.id === project.id) return;   // 이미 열려 있음
  if (!(await confirmLeaveScreen())) return;
  try {
    const granted = (await project.handle.queryPermission({mode: 'readwrite'})) === 'granted'
      || (await project.handle.requestPermission({mode: 'readwrite'})) === 'granted';
    if (!granted) return toast('폴더 접근 권한이 허용되지 않았습니다.');
  } catch (error) {
    if (isNotFoundError(error)) return dropMissingProject(project);
    return toastError('폴더를 열지 못했습니다', error);
  }
  if (!(await folderExists(project.handle))) return dropMissingProject(project);   // 핸들은 남아 있어도 폴더가 지워졌을 수 있음
  app.project = project;
  renderProjectButton(false);
  await touchProject(project);
  await setRootFolder(project.handle);
}

/** [프로젝트 추가…] — 폴더를 고르고 이름을 붙여 목록에 넣고 바로 엶 */
async function addProject() {
  if (!(await confirmLeaveScreen())) return;
  let handle;
  try {
    handle = await showDirectoryPicker({mode: 'readwrite', id: 'asis-keeper'});
  } catch (error) {
    if (error.name !== 'AbortError') toastError('폴더를 선택하지 못했습니다', error);   // 사용자가 취소한 경우는 알리지 않음
    return;
  }
  const answer = await askText({
    title: '프로젝트 추가',
    desc: '폴더: ' + handle.name,
    label: '프로젝트 이름',
    value: handle.name,
    okText: '추가',
    hint: '목록에서 구분할 이름입니다. 폴더 이름과 달라도 되고, 나중에 바꿀 수 있습니다.',
    validate: name => (name ? '' : '이름을 입력하세요.')
  });
  if (!answer) return;

  const project = {id: newProjectId(), name: answer.value, handle, lastOpenedAt: new Date().toISOString()};
  try {
    await saveProjects([...(await loadProjects()), project]);
  } catch (error) {
    return toastError('프로젝트를 저장하지 못했습니다', error);
  }
  app.project = project;
  renderProjectButton(false);
  await settings.setQuietly(SETTING_KEYS.lastProjectId, project.id);
  await setRootFolder(handle);
  toast(`"${project.name}" 프로젝트를 추가했습니다.`);
}

/** [프로젝트 이름 변경] — 폴더 이름은 그대로 두고 목록에 보이는 이름만 바꿈 */
async function renameProject(project) {
  const answer = await askText({
    title: '프로젝트 이름 변경',
    desc: '폴더: ' + project.handle.name,
    label: '새 이름',
    value: project.name,
    okText: '변경',
    hint: '목록과 상단·보고서에 쓰이는 이름입니다. 폴더 이름은 바뀌지 않습니다.',
    validate: name => (name ? '' : '이름을 입력하세요.')
  });
  if (!answer || answer.value === project.name) return;
  try {
    await saveProjects((await loadProjects()).map(item => (item.id === project.id ? {...item, name: answer.value} : item)));
  } catch (error) {
    return toastError('이름을 저장하지 못했습니다', error);
  }
  if (app.project && app.project.id === project.id) {
    app.project = {...app.project, name: answer.value};
    renderProjectButton(projectNeedsPermission);
    renderBreadcrumb();
  }
  toast('프로젝트 이름을 바꿨습니다.');
}

/** [목록에서 제거] — 목록과 그 프로젝트 설정만 지우고, 폴더와 파일은 건드리지 않음 */
async function removeProject(project) {
  const ok = await askConfirm({
    title: '목록에서 제거',
    desc: `"${project.name}" 을 목록에서 뺄까요?\n폴더와 파일은 그대로 남고, 목록에서만 사라집니다.`,
    okText: '제거',
    danger: true
  });
  if (!ok) return;
  if (!(await confirmLeaveScreen())) return;
  if (await forgetProject(project)) toast('목록에서 제거했습니다.');
}

/**
 * 프로젝트를 목록과 그 설정(접어 둔 폴더·탐색기 경로)에서 지움. 열려 있던 프로젝트면 닫음. 폴더·파일은 건드리지 않음
 * @returns {Promise<boolean>} 목록 저장에 성공했는지
 */
async function forgetProject(project) {
  try {
    await saveProjects((await loadProjects()).filter(item => item.id !== project.id));
  } catch (error) {
    toastError('목록을 저장하지 못했습니다', error);
    return false;
  }
  await settings.remove(SETTING_KEYS.closedFolders(project.id));
  await settings.remove(SETTING_KEYS.rootPath(project.id));
  if (app.project && app.project.id === project.id) await closeProject();
  return true;
}

/** 프로젝트 폴더가 디스크에서 없어졌을 때: 알리고 목록에서 지움 (열어 둔 화면의 입력은 저장할 곳이 없어 함께 사라짐) */
async function dropMissingProject(project) {
  if (!(await forgetProject(project))) return;
  await askConfirm({
    title: '폴더가 없습니다',
    desc: `"${project.name}" 폴더를 찾을 수 없습니다.\n지워졌거나 다른 곳으로 옮겨진 것 같아 목록에서 제거했습니다.\n옮긴 것이라면 [프로젝트 추가]로 새 위치를 다시 등록해 주세요.`,
    okText: '확인',
    noCancel: true
  });
}

/** 열린 프로젝트 닫기 (제거했을 때) — 트리와 본문을 처음 상태로 (오른쪽 영역·브레드크럼은 showHome 이 정리) */
async function closeProject() {
  app.project = null;
  app.root = null;
  app.screen = null;
  app.statusFilter = null;
  treeState.closedKeys = new Set();
  $('#btnReport').disabled = true;
  renderProjectButton(false);
  await renderTree();
  showHome();
}

/* ======================= 전환 메뉴 ======================= */

/** 상단 프로젝트 단추의 목록 메뉴 */
async function showProjectMenu() {
  const projects = await loadProjects();
  const items = [];
  for (const project of projects) {
    const isOpen = !!app.root && !!app.project && app.project.id === project.id;
    let granted = false;
    try {
      granted = (await project.handle.queryPermission({mode: 'readwrite'})) === 'granted';
    } catch { /* 핸들을 읽을 수 없으면 권한 필요로 봄 */ }
    const icon = isOpen ? MENU_ICON.check : (granted ? MENU_ICON.folderOpen : MENU_ICON.key);
    const trailing = isOpen ? '열려 있음' : (granted ? describeSince(project.lastOpenedAt) : '권한 다시 허용');
    items.push([project.name, () => openProject(project), '', icon, trailing]);
  }
  if (projects.length) items.push('-');
  items.push(['프로젝트 추가…', addProject, '', MENU_ICON.folderAdd]);
  if (app.project) {
    const current = app.project;
    items.push(
      ['프로젝트 이름 변경', () => renameProject(current), '', MENU_ICON.rename],
      ['목록에서 제거', () => removeProject(current), 'danger', MENU_ICON.trash]
    );
  }
  showMenuBelow($('#btnProject'), items, 'left');
}

/* ======================= 시작 ======================= */

function initProjects() {
  $('#btnProject').onclick = showProjectMenu;
}

/**
 * 시작할 때: 마지막으로 연 프로젝트를 복원
 * 권한이 살아 있으면 바로 열고, 끊겼으면 단추에 열쇠 표시만 띄웁니다
 * (시작 시점에는 사용자 동작이 없어 권한을 요청할 수 없기 때문)
 */
async function restoreLastProject() {
  const projects = await migrateLegacyProject(await loadProjects());
  if (!projects.length) {
    renderProjectButton(false);
    return;
  }
  let lastId = null;
  try {
    lastId = await settings.get(SETTING_KEYS.lastProjectId);
  } catch { /* 없으면 목록의 첫 프로젝트 */ }
  const project = projects.find(item => item.id === lastId) || projects[0];
  app.project = project;
  try {
    if ((await project.handle.queryPermission({mode: 'readwrite'})) === 'granted') {
      if (!(await folderExists(project.handle))) return dropMissingProject(project);
      renderProjectButton(false);
      await setRootFolder(project.handle);
      return;
    }
  } catch { /* 핸들을 읽을 수 없으면 아래의 '권한 필요' 안내로 */ }
  renderProjectButton(true);
  showHome();
}
