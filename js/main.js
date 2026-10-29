/* ==========================================================================
   main.js — 시작점
   브라우저를 검사한 뒤(Chrome/Edge 만 지원) 각 파일의 init* 함수를 순서대로 부릅니다.
   반드시 index.html 의 스크립트 목록 맨 마지막에 있어야 합니다.
   ========================================================================== */

/** 지원하지 않는 브라우저 안내 후 5초 뒤 창 닫기 시도 */
function showUnsupportedBrowser() {
  $('#unsupported').hidden = false;
  const message = $('#closeMsg');
  let secondsLeft = 5;
  const tick = () => {
    if (secondsLeft > 0) {
      message.textContent = secondsLeft + '초 후 이 창을 닫습니다.';
      secondsLeft--;
      setTimeout(tick, 1000);
      return;
    }
    window.close();
    // 사용자가 직접 연 탭은 스크립트로 닫히지 않을 수 있음
    setTimeout(() => { message.textContent = '브라우저 정책상 자동으로 닫히지 않았습니다. Ctrl+W로 이 탭을 닫아 주세요.'; }, 400);
  };
  tick();
}

/** 편집기 파일(js/vendor/ace-bundle.js)을 못 읽었을 때 안내 */
function showEditorMissing() {
  $('#unsupported').hidden = false;
  $('#unsupported h1').textContent = '편집기 파일을 불러오지 못했습니다';
  $('#unsupported p').textContent = 'js/vendor/ace-bundle.js 파일이 index.html 과 같은 폴더 구조로 함께 있는지 확인해 주세요.';
}

(function boot() {
  // 폴더 읽기·쓰기(File System Access API), 설정 저장(IndexedDB), 해시(crypto.subtle)가 필요
  const supported = typeof window.showDirectoryPicker === 'function' && !!window.indexedDB && !!(window.crypto && crypto.subtle);
  if (!supported) return showUnsupportedBrowser();
  if (typeof window.ace !== 'object') return showEditorMissing();

  $('#app').hidden = false;
  initDialogs();
  initProjects();
  initTree();
  initScreen();
  initGrids();
  initDiff();
  initSourceDiff();
  initGlobalSearch();
  initSessionLocation();
  initReport();
  initFonts();
  settings.get(SETTING_KEYS.ignoreFormat).then(ignore => {
    app.ignoreFormat = ignore === true;
    $$('[data-ignore-format]').forEach(checkbox => { checkbox.checked = app.ignoreFormat; });
  }).catch(() => {});
  showHome();
  restoreLastProject();
})();
