/* ==========================================================================
   migrate.js — 파일 저장 구조 자동 변환 (구조 버전 1 → 2)

   버전 1: asis/files/emp.jsp 처럼 파일 이름만으로 저장 → 경로가 다른 같은 이름 파일이 서로 덮어씀
   버전 2: asis/files/src/hr/emp.jsp 처럼 원본 경로 그대로 저장

   루트 폴더를 열 때 한 번 실행합니다. 화면의 '원본 위치'(meta.origin)로 경로를 확실히 알 수 있는
   파일만 옮기고, 잠긴 기존(ASIS) 파일은 해시가 맞을 때만 옮깁니다. 결과는 루트의 .migration/ 에 기록.
   ========================================================================== */

/**
 * 화면 하나 변환
 * @param {{dir, path: string[], meta: object}} screenInfo
 * @param {string[]} log 기록할 줄을 여기에 추가
 * @returns {Promise<number>} 옮긴 파일 수. 원본이 바뀌어 건너뛰었으면 -1
 */
async function migrateScreenFiles(screenInfo, log) {
  const {dir, meta} = screenInfo;
  const where = screenInfo.path.join(' / ');
  const hashes = meta.hashes || {};

  // 1) 옮길 계획 세우기: [저장 폴더, 지금 이름, 새 경로]
  const plan = [];
  const asisNewPath = {};   // 기존 파일 이름 → 새 경로 (같은 이름의 신규 파일도 같은 경로로 맞추기 위해)
  for (const name of await listFileNames(dir, FILE_DIRS.asis)) {
    const newPath = guessFilePath(meta.origin, name, true);
    if (newPath && newPath !== name) {
      plan.push([FILE_DIRS.asis, name, newPath]);
      asisNewPath[name] = newPath;
    }
  }
  for (const name of await listFileNames(dir, FILE_DIRS.tobe)) {
    const newPath = asisNewPath[name] || guessFilePath(meta.origin, name, true);
    if (newPath && newPath !== name) plan.push([FILE_DIRS.tobe, name, newPath]);
  }

  // 2) 잠긴 원본이 등록 때와 다르면 이 화면은 손대지 않음 (변경된 원본을 새 해시로 덮어쓰지 않도록)
  const plannedAsis = {};
  for (const [folder, name] of plan) {
    const key = folder + '/' + name;
    if (folder === FILE_DIRS.asis && hashes[key]) plannedAsis[key] = hashes[key];
  }
  if ((await findChangedFiles(dir, plannedAsis, {stopAtFirst: true})).length) {
    log.push(`[건너뜀] ${where}: 원본이 등록 시점과 달라 이 화면은 변환하지 않았습니다.`);
    return -1;
  }

  // 3) 옮기기: 복사 → 복사본 해시 확인 → 원래 파일 삭제
  let moved = 0;
  for (const [folder, name, newPath] of plan) {
    const from = folder + '/' + name;
    const to = folder + '/' + newPath;
    if (await readFile(dir, to)) {
      log.push(`[건너뜀] ${where}: ${to} 이(가) 이미 있어 ${from} 은(는) 그대로 두었습니다.`);
      continue;
    }
    const file = await readFile(dir, from);
    const hash = await sha256(file);
    await writeFile(dir, to, file);
    if (await sha256(await readFile(dir, to)) !== hash) {
      await removeFileAndEmptyDirs(dir, to);
      throw new Error(to + ' 복사 후 내용이 일치하지 않아 중단했습니다.');
    }
    await removeFileAndEmptyDirs(await getSubDir(dir, folder.split('/'), false), name);
    if (hashes[from]) {          // 해시 기록도 새 경로로 옮김
      hashes[to] = hashes[from];
      delete hashes[from];
    }
    log.push(`[이동] ${where}: ${from} → ${to}`);
    moved++;
  }

  // 4) 변환 완료 표시 (다음에 다시 변환하지 않도록)
  meta.filesV = FILE_STRUCTURE_VERSION;
  await writeJson(dir, 'meta.json', meta);
  return moved;
}

/**
 * 루트 아래 아직 변환하지 않은 화면을 모두 변환
 * @returns {Promise<string>} 결과 안내 문구. 변환할 것이 없었으면 ''
 */
async function migrateAllScreens() {
  const targets = (await findAllScreens(app.root)).filter(screenInfo => (screenInfo.meta.filesV || 1) < FILE_STRUCTURE_VERSION);
  if (!targets.length) return '';

  const log = [];
  let movedFiles = 0, changedScreens = 0, skippedScreens = 0;
  for (const screenInfo of targets) {
    try {
      const moved = await migrateScreenFiles(screenInfo, log);
      if (moved < 0) skippedScreens++;
      else if (moved > 0) { movedFiles += moved; changedScreens++; }
    } catch (error) {
      skippedScreens++;
      log.push(`[오류] ${screenInfo.path.join(' / ')}: ${error.message}`);
    }
  }
  if (!movedFiles && !skippedScreens) return '';

  const logName = '.migration/files-v2_' + timestamp() + '.txt';
  const lines = ['파일 경로 구조 변환 기록 (' + new Date().toLocaleString('ko-KR') + ')', '원본 위치(origin)를 기준으로 파일을 원본 경로 구조로 옮겼습니다.', '', ...log];
  await writeFile(app.root, logName, '﻿' + lines.join('\r\n'));   // ﻿: 메모장에서 한글이 깨지지 않게
  return `기존 데이터의 파일 구조를 변환했습니다: 화면 ${changedScreens}개, 파일 ${movedFiles}개 이동`
    + (skippedScreens ? `, ${skippedScreens}개 화면은 건너뜀` : '')
    + `. 자세한 내용은 루트 폴더의 ${logName} 에 기록했습니다.`;
}
