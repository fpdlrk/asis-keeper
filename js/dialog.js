/* ==========================================================================
   dialog.js — 앱 전용 창과 표시
     - askText()    : 한 줄 입력 창 (브라우저 prompt 대체)
     - askConfirm() : 확인 창 (브라우저 confirm 대체)
     - withBusy()   : 처리 중 표시 (작업이 끝날 때까지 화면을 막음)
     - showMenu()   : 우클릭·⋯ 버튼 메뉴
   입력 창과 확인 창은 index.html 의 #dlg 하나를 같이 씁니다.
   ========================================================================== */

/* ---- 입력 창 · 확인 창 ---- */

/** 열려 있는 창을 닫는 함수 (Esc 로 닫을 때 씀). 창이 없으면 null */
let closeActiveDialog = null;

/**
 * #dlg 창의 공통 부분(제목·설명·버튼)을 채우고, 닫는 함수를 만들어 줌
 * @param {object} opt   title, desc, okText, cancelText(취소 버튼 글자), danger(빨간 확인 버튼), noCancel(취소 버튼 숨김)
 * @param {Function} resolve  Promise 를 끝낼 함수
 * @returns {Function} finish(result) — 창을 닫고 result 로 끝냄
 */
function prepareDialog(opt, resolve) {
  const dialog = $('#dlg'), okButton = $('#dlgOk'), cancelButton = $('#dlgCancel');
  $('#dlgTitle').textContent = opt.title || '확인';
  $('#dlgDesc').textContent = opt.desc || '';
  $('#dlgDesc').hidden = !opt.desc;
  okButton.textContent = opt.okText || '확인';
  okButton.classList.toggle('btn-danger', !!opt.danger);
  cancelButton.hidden = !!opt.noCancel;
  cancelButton.textContent = opt.cancelText || '취소';

  const finish = result => {
    dialog.hidden = true;
    okButton.onclick = cancelButton.onclick = dialog.onkeydown = $('#dlgInput').onkeydown = null;
    closeActiveDialog = null;
    resolve(result);
  };
  closeActiveDialog = () => finish(null);
  dialog.hidden = false;
  return finish;
}

/**
 * 한 줄 입력 창
 * @param {object} opt
 *   title, desc, label, value(처음 값), placeholder, okText, hint(아래 안내),
 *   check(체크박스 문구 — 있으면 체크박스 표시), checked(처음 체크 여부, 기본 true),
 *   readonly, mono(고정폭 글꼴), noCancel, validate(값 → 오류 문구, 문제 없으면 '')
 * @returns {Promise<{value: string, checked: boolean} | null>} 취소하면 null
 */
function askText(opt) {
  return new Promise(resolve => {
    const input = $('#dlgInput'), error = $('#dlgErr'), checkbox = $('#dlgCheck');
    const finish = prepareDialog(opt, resolve);

    $('#dlgLabel').textContent = opt.label || '';
    $('#dlgLabel').hidden = input.hidden = false;
    $('#dlgHint').textContent = opt.hint || '';
    $('#dlgHint').hidden = !opt.hint;
    input.value = opt.value || '';
    input.placeholder = opt.placeholder || '';
    input.readOnly = !!opt.readonly;
    input.classList.toggle('mono', !!opt.mono);
    error.textContent = '';
    error.hidden = true;
    $('#dlgCheckRow').hidden = !opt.check;
    $('#dlgCheckText').textContent = opt.check || '';
    checkbox.checked = opt.checked !== false;

    // 확인: 검사에 걸리면 창을 닫지 않고 오류 문구를 보여 줌
    const submit = () => {
      const value = input.value.trim();
      const message = opt.validate ? opt.validate(value) : '';
      if (message) {
        error.textContent = message;
        error.hidden = false;
        input.focus();
        return;
      }
      finish({value, checked: checkbox.checked});
    };
    $('#dlgOk').onclick = submit;
    $('#dlgCancel').onclick = () => finish(null);
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
    input.focus();
    input.select();
  });
}

/**
 * 확인 창
 * @param {object} opt title, desc(줄바꿈 가능), okText, cancelText, danger(되돌릴 수 없는 작업 → 빨간 버튼, 처음 선택은 '취소')
 * @returns {Promise<boolean>} 확인 true / 취소·Esc false
 */
function askConfirm(opt) {
  return new Promise(resolve => {
    const finish = prepareDialog(opt, result => resolve(result === true));
    ['#dlgLabel', '#dlgInput', '#dlgErr', '#dlgHint', '#dlgCheckRow'].forEach(selector => { $(selector).hidden = true; });
    $('#dlgOk').onclick = () => finish(true);
    $('#dlgCancel').onclick = () => finish(false);
    $('#dlg').onkeydown = e => {
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); finish(true); }
    };
    (opt.danger ? $('#dlgCancel') : $('#dlgOk')).focus();
  });
}

/* ---- 처리 중 표시 ---- */

/* 처리 중인 작업 수 (작업 안에서 또 작업을 부를 수 있어 숫자로 셈) */
let busyCount = 0;
let busyShowTimer = null;

/**
 * 작업이 끝날 때까지 화면 전체를 막고 "처리 중" 을 보여 줌
 * - 막기(클릭·키보드)는 즉시, 문구·회전 표시는 0.15초 넘게 걸릴 때만 (금방 끝나면 깜빡이지 않도록)
 * @param {string} message 예) '등록하는 중…'
 * @param {Function} task  async 함수. 이 함수의 결과를 그대로 돌려줌
 */
async function withBusy(message, task) {
  const overlay = $('#busy');
  if (busyCount++ === 0) {
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.blur) focused.blur();   // 입력 중이던 칸에 글자가 들어가지 않게
    overlay.hidden = false;
    overlay.classList.remove('show');
    busyShowTimer = setTimeout(() => overlay.classList.add('show'), 150);
  }
  $('#busyMsg').textContent = message;
  try {
    return await task();
  } finally {
    if (--busyCount === 0) {
      clearTimeout(busyShowTimer);
      overlay.hidden = true;
      overlay.classList.remove('show');
    }
  }
}

/** 지금 처리 중인지 */
const isBusy = () => busyCount > 0;

/* ---- 메뉴 ---- */

/**
 * 작은 메뉴 띄우기
 * @param {{x: number, y: number}} position 화면 좌표 (화면 밖으로 나가지 않게 조정)
 * @param {Array} items 항목 배열. '-' 하나만 넣으면 구분선.
 *   항목 = [문구, 실행할 함수, 'danger'(빨간 글자), 아이콘 HTML(MENU_ICON 의 값), 오른쪽 꼬리말]
 */
function showMenu(position, items) {
  const menu = $('#ctx');
  menu.innerHTML = '';
  for (const entry of items) {
    if (entry === '-') {
      menu.insertAdjacentHTML('beforeend', '<div class="mi-line" role="separator"></div>');
      continue;
    }
    const [label, action, kind, iconHtml, trailing] = entry;
    const item = createButton({label, className: kind === 'danger' ? 'danger' : ''});
    item.setAttribute('role', 'menuitem');
    // 아이콘·꼬리말이 있으면 다시 조립 (iconHtml 은 MENU_ICON 의 고정값이라 사용자 입력이 섞이지 않음)
    if (iconHtml || trailing) {
      item.innerHTML = (iconHtml || '') + `<span class="mi-label">${escapeHtml(label)}</span>`
        + (trailing ? `<span class="mi-trail">${escapeHtml(trailing)}</span>` : '');
    }
    item.onclick = e => { e.stopPropagation(); hideMenu(); action(); };
    menu.append(item);
  }
  menu.hidden = false;
  menu.style.left = Math.max(8, Math.min(position.x, innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(position.y, innerHeight - menu.offsetHeight - 8)) + 'px';
  const firstItem = menu.querySelector('button');
  if (firstItem) firstItem.focus();
}

/** 메뉴 닫기 */
const hideMenu = () => { $('#ctx').hidden = true; };

/** 버튼 바로 아래(오른쪽 끝 맞춤)에 메뉴 띄우기 — ⋯ 버튼용 */
function showMenuBelow(button, items, align = 'right') {
  const rect = button.getBoundingClientRect();
  // 'right' = 단추 오른쪽 끝에 맞춤(⋯ 버튼용), 'left' = 단추 왼쪽 끝에 맞춤(상단 왼쪽 단추용)
  showMenu({x: align === 'left' ? rect.left : rect.right - 200, y: rect.bottom + 4}, items);
}

/** ⋯ 모양 메뉴 버튼 만들기. getItems 는 누를 때마다 메뉴 항목을 만들어 돌려주는 함수 */
function createMenuButton(ariaLabel, getItems) {
  const button = createButton({label: '⋯', className: 'icon', ariaLabel, dataset: {menu: 'file'}});
  button.onclick = () => showMenuBelow(button, getItems());
  return button;
}

/* ---- 공통 ---- */

/** Esc: 메뉴·모달·입력 창 모두 닫기 */
function closeOverlays() {
  hideMenu();
  ['#modal', '#fontModal', '#moveModal', '#diffModal', '#srcDiffModal', '#screenLogModal'].forEach(selector => { $(selector).hidden = true; });
  if (closeActiveDialog) closeActiveDialog();
}

function initDialogs() {
  // 처리 중에는 키보드 입력을 모두 막음 (window 캡처 단계라 다른 단축키보다 먼저 실행됨)
  window.addEventListener('keydown', e => {
    if (isBusy()) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  // 처리 중에 창을 닫으려 하면 경고
  window.addEventListener('beforeunload', e => {
    if (isBusy()) { e.preventDefault(); e.returnValue = ''; }
  });
  // 메뉴 바깥을 누르면 닫기. 단, 메뉴를 여는 버튼([data-menu])을 누른 클릭으로는 닫히지 않게 제외
  document.addEventListener('click', e => {
    if (!e.target.closest('#ctx, [data-menu]')) hideMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeOverlays();
  });
}
