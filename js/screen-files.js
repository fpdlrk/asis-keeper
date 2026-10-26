/* ==========================================================================
   screen-files.js — 파일 목록 (기존 파일 · 신규 파일 · 첨부)
     - 파일·폴더 끌어다 놓기 / [파일 선택] / [폴더 선택]
     - 등록 대기 파일의 저장 경로 정하기 (원본 경로 그대로 저장)
     - 등록된 파일 목록, 신규 파일이 기존과 같은지 표시 (신규 / 수정 / 동일)

   파일 종류(kind): 'asis' 기존 파일, 'tobe' 신규 파일, 'attach' 참고 첨부
   등록 대기 파일: app.screen.pendingFiles[kind] = [{file: File, path: '저장 경로'}]
   ========================================================================== */

/* 목록 그리기 순번 (종류별). 그리는 도중 다시 그리면 이전의 해시 비교 결과는 버림 */
const fileListRenderSeq = {};

/** 파일을 올리는 영역 HTML (off = 숨김: 잠긴 기존 파일) */
const dropZoneHtml = (kind, off) => `<div class="drop${off ? ' off' : ''}" data-k="${kind}">${ICON.upload}`
  + '<span class="drop-t">파일이나 폴더를 끌어다 놓으세요. 폴더째 넣으면 하위 경로가 유지됩니다.</span>'
  + '<label class="btn btn-s">파일 선택<input type="file" multiple hidden></label>'
  + `<button type="button" class="btn btn-s" data-pickdir="${kind}">폴더 선택</button></div>`;

/** 올리기 영역에 파일 선택·끌어다 놓기 연결 */
function setupDropZone(kind) {
  const zone = document.querySelector(`.drop[data-k="${kind}"]`);
  if (!zone) return;
  zone.querySelector('input[type=file]').onchange = e => {
    addPendingFiles(kind, [...e.target.files].map(file => ({file, relPath: file.name})));
    e.target.value = '';   // 같은 파일을 다시 골라도 onchange 가 일어나도록
  };
  zone.ondragover = e => { e.preventDefault(); zone.classList.add('over'); };
  zone.ondragleave = () => zone.classList.remove('over');
  zone.ondrop = e => handleDrop(kind, zone, e);
}

/**
 * 끌어다 놓기 처리 — 폴더를 놓으면 하위 경로를 유지
 * 주의: 놓은 항목의 핸들은 이벤트 안에서 바로(동기적으로) 받아야 함 (await 뒤에는 dataTransfer 가 비워짐)
 */
async function handleDrop(kind, zone, e) {
  e.preventDefault();
  zone.classList.remove('over');
  if (zone.classList.contains('off')) return;
  const plainFiles = [...e.dataTransfer.files];
  const handlePromises = [...e.dataTransfer.items]
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFileSystemHandle ? item.getAsFileSystemHandle() : null);
  try {
    await withBusy('파일을 읽는 중…', async () => {
      const handles = await Promise.all(handlePromises);
      // 폴더 핸들을 못 얻는 환경이면 파일 이름만으로
      if (!handles.length || handles.some(handle => !handle)) {
        addPendingFiles(kind, plainFiles.map(file => ({file, relPath: file.name})));
        return;
      }
      const items = [];
      for (const handle of handles) {
        if (handle.kind === 'file') items.push({file: await handle.getFile(), relPath: handle.name});
        else items.push(...await readFolderFiles(handle));
      }
      addPendingFiles(kind, items);
    });
  } catch (error) {
    toastError('파일을 읽지 못했습니다', error);
  }
}

/** [폴더 선택]: 폴더 안의 파일을 하위 경로 그대로 등록 대기에 추가 */
async function pickFolderFiles(kind) {
  try {
    const folder = await showDirectoryPicker({mode: 'read', id: 'asis-keeper-src'});
    const items = await withBusy('파일을 읽는 중…', () => readFolderFiles(folder));
    if (!items.length) return toast('선택한 폴더에 파일이 없습니다.');
    addPendingFiles(kind, items);
  } catch (error) {
    if (error.name !== 'AbortError') toastError('폴더를 읽지 못했습니다', error);
  }
}

/**
 * 등록 대기 파일의 기본 저장 경로
 *   1) 폴더째 넣었으면 그 경로 그대로
 *   2) (신규 파일) 같은 이름의 기존 파일이 딱 하나면 그 경로 — 비교할 때 짝이 맞도록
 *   3) 작업 정보의 '원본 위치' 로 추정
 *   4) 그래도 모르면 파일 이름만
 */
function defaultSavePath(kind, relPath) {
  const path = normalizePath(relPath);
  if (kind === 'attach' || path.includes('/')) return path;
  if (kind === 'tobe') {
    const screen = app.screen;
    const sameName = [...screen.savedFiles.asis, ...screen.pendingFiles.asis.map(item => item.path)].filter(other => fileNameOf(other) === path);
    if (new Set(sameName).size === 1) return sameName[0];
  }
  const origin = $('#origin') ? $('#origin').value : app.screen.meta.origin;
  return guessFilePath(origin, path, false) || path;
}

/** 등록 대기 목록에 추가 (같은 경로가 이미 있으면 새 파일로 바꿈) */
function addPendingFiles(kind, items) {
  const pending = app.screen.pendingFiles;
  for (const {file, relPath} of items) {
    if (!(file instanceof File)) continue;
    const path = defaultSavePath(kind, relPath || file.name);
    pending[kind] = pending[kind].filter(item => item.path !== path);
    pending[kind].push({file, path});
  }
  renderFileList(kind);
}

/** 파일 목록 다시 그리기 (등록된 파일 → 등록 대기 파일 순) */
function renderFileList(kind) {
  const list = $('#list-' + kind);
  if (!list) return;
  const seq = fileListRenderSeq[kind] = (fileListRenderSeq[kind] || 0) + 1;
  list.innerHTML = '';
  for (const path of app.screen.savedFiles[kind]) list.append(createSavedFileItem(kind, path, seq));
  for (const item of app.screen.pendingFiles[kind]) list.append(createPendingFileItem(kind, item));
  refreshIndicators();
}

/** 등록된 파일 한 줄: 경로 · (신규 파일) 구분 태그 · 등록됨 · [비교] · ⋯(삭제) */
function createSavedFileItem(kind, path, seq) {
  const inAsis = app.screen.savedFiles.asis.includes(path);
  const item = document.createElement('li');
  item.innerHTML = `<code class="fp" title="${escapeHtml(path)}">${escapeHtml(path)}</code>`
    + (kind === 'tobe' ? '<span class="tag" data-kind></span>' : '')
    + '<span class="st">등록됨</span>';
  if (kind === 'tobe' && inAsis) item.append(createButton({label: '비교', onClick: () => openFileDiffWindow(path, null)}));
  // 기존 파일은 잠겨 있으면 지울 수 없고, 잠금을 푼 동안에만 지울 수 있습니다
  if (kind !== 'asis' || !app.screen.meta.asisLocked) {
    item.append(createMenuButton('파일 메뉴', () => [['삭제', () => deleteSavedFile(kind, path), 'danger', MENU_ICON.trash]]));
  }
  if (kind === 'tobe') showFileChangeKind(item.querySelector('[data-kind]'), path, inAsis, seq);
  return item;
}

/** 등록 대기 파일 한 줄: 저장 경로(고칠 수 있음) · 신규/수정 · 등록 대기/덮어쓰기 · [비교] · ✕ */
function createPendingFileItem(kind, pendingItem) {
  const screen = app.screen;
  const inAsis = screen.savedFiles.asis.includes(pendingItem.path);
  const item = document.createElement('li');
  item.className = 'pend';

  const pathInput = document.createElement('input');
  pathInput.type = 'text';
  pathInput.className = 'fpath';
  pathInput.value = pendingItem.path;
  pathInput.spellcheck = false;
  pathInput.title = '저장될 경로 (원본 위치 기준). 필요하면 고친 뒤 등록하세요.';
  pathInput.setAttribute('aria-label', pendingItem.file.name + ' 저장 경로');
  pathInput.onchange = () => {
    pendingItem.path = normalizePath(pathInput.value);
    renderFileList(kind);   // 경로가 바뀌면 신규/수정 구분과 [비교] 버튼도 바뀜
  };
  item.append(pathInput);

  if (kind !== 'attach') {
    const isModified = kind === 'tobe' && inAsis;
    item.insertAdjacentHTML('beforeend', `<span class="tag ${isModified ? 'warn' : 'ok'}">${isModified ? '수정' : '신규'}</span>`);
  }
  const overwrites = screen.savedFiles[kind].includes(pendingItem.path);
  item.insertAdjacentHTML('beforeend', `<span class="st wait">${overwrites ? '덮어쓰기' : '등록 대기'}</span>`);
  if (kind === 'tobe' && inAsis) item.append(createButton({label: '비교', onClick: () => openFileDiffWindow(pendingItem.path, pendingItem.file)}));
  item.append(createButton({
    label: '✕', className: 'icon', ariaLabel: '목록에서 빼기',
    onClick: () => {
      screen.pendingFiles[kind] = screen.pendingFiles[kind].filter(other => other !== pendingItem);
      renderFileList(kind);
    }
  }));
  return item;
}

/** 등록된 파일 삭제 (되돌릴 수 없음) */
async function deleteSavedFile(kind, path) {
  const ok = await askConfirm({title: '파일 삭제', desc: path + '\n이 파일을 삭제할까요? 삭제하면 되돌릴 수 없습니다.', okText: '삭제', danger: true});
  if (!ok) return;
  try {
    await withBusy('파일을 삭제하는 중…', async () => {
      const folder = await getSubDir(app.screen.dir, FILE_DIRS[kind].split('/'), false);
      await removeFileAndEmptyDirs(folder, path);
    });
  } catch (error) {
    return toastError('삭제 실패', error);
  }
  app.screen.savedFiles[kind] = app.screen.savedFiles[kind].filter(other => other !== path);
  renderFileList(kind);
}

/** 신규 파일이 기존과 같은지(해시) 태그로 표시: 신규 / 수정 / 동일 */
async function showFileChangeKind(tag, path, inAsis, seq) {
  if (!inAsis) {
    tag.textContent = '신규';
    tag.className = 'tag ok';
    return;
  }
  const dir = app.screen.dir;
  const asisFile = await readFile(dir, FILE_DIRS.asis + '/' + path);
  const tobeFile = await readFile(dir, FILE_DIRS.tobe + '/' + path);
  if (seq !== fileListRenderSeq.tobe || !asisFile || !tobeFile) return;
  const same = (await sha256(asisFile)) === (await sha256(tobeFile));
  tag.textContent = same ? '동일' : '수정';
  tag.className = 'tag ' + (same ? '' : 'warn');
}

/**
 * 등록 전 경로 점검 (형식 오류 · 같은 경로 두 개)
 * @returns {string} 오류 문구, 문제 없으면 ''
 */
function validatePendingPaths(kind) {
  const seen = new Set();
  for (const item of app.screen.pendingFiles[kind]) {
    item.path = normalizePath(item.path);
    const message = validatePath(item.path);
    if (message) return message;
    if (seen.has(item.path)) return '같은 경로의 파일이 두 개 있습니다: ' + item.path;
    seen.add(item.path);
  }
  return '';
}
