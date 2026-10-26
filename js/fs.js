/* ==========================================================================
   fs.js — 로컬 폴더 읽기·쓰기 (File System Access API)

   모든 함수는 "폴더 핸들 + 그 아래 상대 경로('a/b/c.txt')" 방식으로 씁니다.
   ========================================================================== */

/* ---- 폴더 ---- */

/**
 * 하위 폴더 핸들 얻기
 * @param {FileSystemDirectoryHandle} dir 기준 폴더
 * @param {string[]} names 내려갈 폴더 이름들
 * @param {boolean} create 없으면 만들지 여부 (false 면 없을 때 오류)
 */
async function getSubDir(dir, names, create) {
  for (const name of names) dir = await dir.getDirectoryHandle(name, {create});
  return dir;
}

/** 폴더 안에 이 이름의 하위 폴더가 있는지 */
async function hasSubDir(dir, name) {
  try {
    await dir.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}

/** 폴더 전체(하위 포함)를 다른 폴더로 복사 */
async function copyDirectory(source, target) {
  for await (const [name, handle] of source.entries()) {
    if (handle.kind === 'file') await writeFile(target, name, await handle.getFile());
    else await copyDirectory(handle, await target.getDirectoryHandle(name, {create: true}));
  }
}

/* ---- 파일 ---- */

/** 'a/b/c.txt' → {dirs: ['a','b'], name: 'c.txt'} */
function splitPath(path) {
  const dirs = path.split('/');
  const name = dirs.pop();
  return {dirs, name};
}

/** 파일 읽기 (File 객체). 없으면 null */
async function readFile(dir, path) {
  const {dirs, name} = splitPath(path);
  try {
    const folder = await getSubDir(dir, dirs, false);
    return await (await folder.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

/** 글자 파일 읽기. 없으면 null */
async function readText(dir, path) {
  const file = await readFile(dir, path);
  return file ? file.text() : null;
}

/** JSON 파일 읽기. 없거나 깨졌으면 fallback */
async function readJson(dir, path, fallback) {
  try {
    return JSON.parse(await readText(dir, path) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

/** 파일 쓰기 (중간 폴더가 없으면 만들고, 있으면 덮어씀) */
async function writeFile(dir, path, data) {
  const {dirs, name} = splitPath(path);
  const folder = await getSubDir(dir, dirs, true);
  const writable = await (await folder.getFileHandle(name, {create: true})).createWritable();
  await writable.write(data);
  await writable.close();
}

/** JSON 으로 보기 좋게 저장 */
const writeJson = (dir, path, value) => writeFile(dir, path, JSON.stringify(value, null, 2));

/**
 * 파일 삭제 후, 그 때문에 비게 된 상위 폴더도 정리 (dir 자신은 남김)
 * 예) removeFileAndEmptyDirs(tobeFiles, 'src/hr/emp.jsp') → emp.jsp 삭제, hr·src 가 비면 함께 삭제
 */
async function removeFileAndEmptyDirs(dir, path) {
  const {dirs, name} = splitPath(path);
  const chain = [dir];   // [dir, dir/a, dir/a/b] — 아래에서부터 비었는지 보기 위해 기억
  for (const folderName of dirs) chain.push(await lastOf(chain).getDirectoryHandle(folderName));
  await lastOf(chain).removeEntry(name);
  for (let i = dirs.length - 1; i >= 0; i--) {
    if (!(await isDirEmpty(chain[i + 1]))) break;
    await chain[i].removeEntry(dirs[i]);
  }
}

/** 폴더가 비어 있는지 */
async function isDirEmpty(dir) {
  for await (const _ of dir.keys()) return false;
  return true;
}

/** 파일 삭제 (없거나 실패해도 오류를 내지 않음) */
async function removeFileQuietly(dir, path) {
  try { await removeFileAndEmptyDirs(dir, path); } catch { /* 이미 없으면 그대로 둠 */ }
}

/* ---- 목록 ---- */

/** 한 폴더 바로 아래의 파일 이름들 (하위 폴더 제외) */
async function listFileNames(dir, path) {
  const names = [];
  try {
    const folder = await getSubDir(dir, path.split('/'), false);
    for await (const [name, handle] of folder.entries()) if (handle.kind === 'file') names.push(name);
  } catch { /* 폴더가 없으면 빈 목록 */ }
  return names.sort();
}

/**
 * 폴더 아래 모든 파일 (하위 폴더까지)
 * @returns {Promise<{relPath: string, handle: FileSystemFileHandle}[]>} relPath = prefix + 폴더 기준 상대 경로
 */
async function walkFiles(dir, prefix = '', found = []) {
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') found.push({relPath: prefix + name, handle});
    else await walkFiles(handle, prefix + name + '/', found);
  }
  return found;
}

/** 폴더 아래 모든 파일의 상대 경로 목록 (가나다순). 폴더가 없으면 빈 목록 */
async function listFilesDeep(dir, path) {
  try {
    const folder = await getSubDir(dir, path.split('/'), false);
    return (await walkFiles(folder)).map(item => item.relPath).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** 선택한 폴더(또는 끌어다 놓은 폴더) 안의 파일을 {file, relPath} 목록으로 읽기 */
async function readFolderFiles(folderHandle) {
  const items = [];
  for (const {relPath, handle} of await walkFiles(folderHandle, folderHandle.name + '/')) {
    items.push({file: await handle.getFile(), relPath});
  }
  return items;
}

/* ---- 내용 ---- */

/** 파일/Blob 의 SHA-256 해시 (16진수 문자열) — 원본이 바뀌었는지 확인할 때 씀 */
async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** 파일을 글자로 읽기. UTF-8 로 안 읽히면 EUC-KR 로 다시 읽음 (오래된 한글 소스 대응) */
async function decodeText(file) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch {
    return new TextDecoder('euc-kr').decode(bytes);
  }
}

/* ---- 경로 ---- */

/** 경로 정리: "D:\src\hr\emp.jsp" → "src/hr/emp.jsp" (역슬래시·드라이브 문자·앞쪽 / 제거) */
const normalizePath = text => String(text || '').trim()
  .replace(/\\/g, '/')
  .replace(/^[a-zA-Z]:/, '')
  .split('/').filter(part => part && part !== '.')
  .join('/');

/** 경로 오류 문구 (문제 없으면 '') */
function validatePath(path) {
  if (!path) return '파일 경로가 비어 있습니다.';
  const hasBadPart = path.split('/').some(part => part === '..' || INVALID_NAME_CHARS.test(part));
  return hasBadPart ? '사용할 수 없는 경로입니다: ' + path : '';
}

/** 메뉴(폴더) 이름 오류 문구 (문제 없으면 '') */
function validateFolderName(name) {
  const invalid = INVALID_NAME_CHARS.test(name) || name.startsWith('.') || RESERVED_FOLDER_NAMES.includes(name.toLowerCase());
  return invalid ? '사용할 수 없는 이름입니다. (특수문자, asis/tobe/attach/service/object/code 불가)' : '';
}

/** 경로의 파일 이름 부분 ("src/hr/emp.jsp" → "emp.jsp") */
const fileNameOf = path => lastOf(path.split('/'));

/**
 * '원본 위치'를 보고 파일의 저장 경로를 추정
 * @param {string} originPath 화면의 원본 위치 (파일 경로 또는 폴더 경로)
 * @param {string} fileName   파일 이름
 * @param {boolean} strict    true = 확실할 때만 (원본 위치가 그 파일이거나 폴더일 때). 자동 변환에서 씀
 * @returns {string} 추정 경로. 모르면 ''
 *
 * 예) 원본 위치 '/src/hr/emp.jsp' + 'emp.jsp' → 'src/hr/emp.jsp'
 *     원본 위치 '/src/hr'         + 'a.js'    → 'src/hr/a.js'
 *     원본 위치 '/src/hr/emp.jsp' + 'a.js'    → strict 면 '', 아니면 'src/hr/a.js'
 */
function guessFilePath(originPath, fileName, strict) {
  const origin = normalizePath(originPath);
  if (!origin) return '';
  const parts = origin.split('/');
  const last = lastOf(parts);
  if (last === fileName) return origin;
  if (!last.includes('.')) return origin + '/' + fileName;   // 점이 없으면 폴더로 봄
  if (strict || parts.length < 2) return '';
  return parts.slice(0, -1).join('/') + '/' + fileName;
}
