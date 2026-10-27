/* ==========================================================================
   utils.js — 여러 파일에서 함께 쓰는 작은 도우미 함수 (DOM · 글자 · 날짜)
   ========================================================================== */

/* ---- DOM ---- */

/** CSS 선택자로 요소 하나 찾기 (없으면 null) */
const $ = selector => document.querySelector(selector);

/** CSS 선택자로 요소 여러 개를 배열로 찾기 */
const $$ = selector => [...document.querySelectorAll(selector)];

/**
 * 버튼 요소 만들기
 * @param {object} opt
 * @param {string} opt.label      버튼 글자
 * @param {string} [opt.className='btn btn-s']
 * @param {string} [opt.ariaLabel] 화면 낭독기용 설명 (아이콘 버튼일 때)
 * @param {object} [opt.dataset]  data-* 속성
 * @param {Function} [opt.onClick]
 * @returns {HTMLButtonElement}
 */
function createButton({label, className = 'btn btn-s', ariaLabel, dataset, onClick}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  if (dataset) Object.assign(button.dataset, dataset);
  if (onClick) button.onclick = onClick;
  return button;
}

/* ---- 글자 ---- */

/** HTML 에 넣을 글자를 안전하게 바꿈 (<, >, &, " 를 그대로 보이게) */
const escapeHtml = text => String(text).replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));

/** 줄바꿈을 \n 하나로 통일 (윈도우 \r\n 과 섞여도 같은 내용으로 비교되도록) */
const normalizeLineBreaks = text => String(text).replace(/\r\n/g, '\n');

/** 배열의 마지막 값 */
const lastOf = list => list[list.length - 1];

/** 두 경로(이름 배열)가 같은지 */
const isSamePath = (a, b) => a.join('/') === b.join('/');

/** path 가 basePath 와 같거나 그 아래에 있는지 (예: [인사, 사원조회] 는 [인사] 아래) */
const isPathUnder = (path, basePath) => isSamePath(path.slice(0, basePath.length), basePath);

/* ---- 날짜 ---- */

/** 두 자리 숫자로 (5 → "05") */
const twoDigits = n => String(n).padStart(2, '0');

/** 파일 이름용 시각 "20261023-153012" */
function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${twoDigits(d.getMonth() + 1)}${twoDigits(d.getDate())}-${twoDigits(d.getHours())}${twoDigits(d.getMinutes())}${twoDigits(d.getSeconds())}`;
}

/** 화면 표시용 날짜·시각 "2026. 10. 23. 오후 03:30" (잘못된 값이면 받은 그대로) */
function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso || '');
  return d.toLocaleString('ko-KR', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
}

/** 화면 표시용 날짜 "2026.10.23" */
function formatDay(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso || '');
  return `${d.getFullYear()}.${twoDigits(d.getMonth() + 1)}.${twoDigits(d.getDate())}`;
}

/* ---- 알림 ---- */

/** 화면 아래에 잠깐 떴다 사라지는 알림 */
function toast(message) {
  const box = $('#toast');
  box.textContent = message;
  box.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('on'), 2400);
}

/** 실패 알림: "저장 실패: 원인" 형태 */
const toastError = (what, error) => toast(`${what}: ${error.message}`);

/* ---- 글을 표 모양으로 나누기 (표 붙여넣기 · 예전 글을 표로 옮기기가 함께 씀) ---- */

/* 탭이 없을 때 칸을 나누는 기준: 공백 2칸 이상 (공백 하나는 값 안의 띄어쓰기로 봄 — 예: '테스트 입니다') */
const TABLE_TEXT_SPACE_SPLIT = /[ \u00a0\u3000]{2,}/;

/**
 * 글을 줄 × 칸으로 나누기
 *   칸: 탭으로 나눔. 어느 줄에도 탭이 없으면 공백 2칸 이상으로 나눔
 *   줄: 줄바꿈으로 나눔. 끝의 빈 줄은 버림 (엑셀에서 복사하면 끝에 줄바꿈이 붙음)
 * @returns {string[][]} 줄마다 칸 값 배열 (글이 비었으면 [])
 */
function splitTableText(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lastOf(lines).trim()) lines.pop();
  const useTab = lines.some(line => line.includes('\t'));
  return lines.map(line => (useTab ? line.split('\t') : line.trim().split(TABLE_TEXT_SPACE_SPLIT)).map(cell => cell.trim()));
}
