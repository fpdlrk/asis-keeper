/* ==========================================================================
   fonts.js — 글꼴 설정
   인터넷이 안 되는 환경(폐쇄망)을 고려해 이 PC에 설치된 시스템 글꼴만 씁니다.
   목록에는 실제로 설치된 글꼴만 나타납니다.
   ========================================================================== */

/* 화면 글꼴 후보. auto = 기본(시안과 같은 글꼴). check = 설치 여부를 확인할 글꼴 이름 */
const UI_FONT_OPTIONS = [
  {name: '기본 (Segoe UI + 맑은 고딕)', auto: true, stack: '"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif'},
  {name: '맑은 고딕', stack: '"Malgun Gothic"', check: ['Malgun Gothic']},
  {name: 'Pretendard', stack: '"Pretendard Variable","Pretendard"', check: ['Pretendard', 'Pretendard Variable']},
  {name: 'Noto Sans KR', stack: '"Noto Sans KR","Noto Sans CJK KR"', check: ['Noto Sans KR', 'Noto Sans CJK KR']},
  {name: '나눔고딕', stack: '"NanumGothic","나눔고딕"', check: ['NanumGothic', '나눔고딕']},
  {name: '나눔바른고딕', stack: '"NanumBarunGothic","나눔바른고딕"', check: ['NanumBarunGothic', '나눔바른고딕']},
  {name: '나눔스퀘어', stack: '"NanumSquare","나눔스퀘어"', check: ['NanumSquare', '나눔스퀘어']},
  {name: '함초롬돋움', stack: '"HCR Dotum","함초롬돋움"', check: ['HCR Dotum', '함초롬돋움']},
  {name: 'Apple SD Gothic Neo', stack: '"Apple SD Gothic Neo"', check: ['Apple SD Gothic Neo']},
  {name: '돋움', stack: '"Dotum","돋움"', check: ['Dotum', '돋움']}
];
/* SQL 편집기(고정폭) 글꼴 후보 */
const CODE_FONT_OPTIONS = [
  {name: '기본 (D2Coding → Consolas)', auto: true, stack: 'D2Coding,Consolas,monospace'},
  {name: 'D2Coding', stack: '"D2Coding"', check: ['D2Coding']},
  {name: '나눔고딕코딩', stack: '"NanumGothicCoding","나눔고딕코딩"', check: ['NanumGothicCoding', '나눔고딕코딩']},
  {name: 'Consolas', stack: '"Consolas"', check: ['Consolas']},
  {name: 'Cascadia Mono', stack: '"Cascadia Mono"', check: ['Cascadia Mono']},
  {name: 'JetBrains Mono', stack: '"JetBrains Mono"', check: ['JetBrains Mono']},
  {name: '굴림체', stack: '"GulimChe","굴림체"', check: ['GulimChe', '굴림체']},
  {name: 'Courier New', stack: '"Courier New"', check: ['Courier New']}
];
/* 고른 글꼴이 없을 때 대신 쓸 글꼴 */
const UI_FONT_FALLBACK = '"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
const CODE_FONT_FALLBACK = 'Consolas,"Courier New",monospace';

/* 지금 적용된 글꼴 (CSS font-family 값). 편집기·보고서에서 씀 */
let uiFontStack = UI_FONT_OPTIONS[0].stack;
let codeFontStack = CODE_FONT_OPTIONS[0].stack;

/**
 * 글꼴이 이 PC에 설치되어 있는지
 * 기본 글꼴로 그린 글자 폭과, 그 글꼴로 그린 글자 폭이 다르면 설치된 것으로 봅니다.
 */
function isFontInstalled(fontNames) {
  const context = document.createElement('canvas').getContext('2d');
  const sample = '가나다라 ABCabc123 mmmmlli';
  const baseFonts = ['monospace', 'serif', 'sans-serif'];
  const widthWith = font => { context.font = '64px ' + font; return context.measureText(sample).width; };
  const baseWidths = baseFonts.map(widthWith);
  return fontNames.some(name => baseFonts.some((base, i) => widthWith(`"${name}",${base}`) !== baseWidths[i]));
}

/** 글꼴 후보의 CSS 값 (기본이 아니면 대체 글꼴을 뒤에 붙임) */
const fontStackOf = (option, fallback) => option.auto ? option.stack : option.stack + ',' + fallback;

/** 저장된 이름으로 글꼴 후보 찾기 (없으면 기본) */
const findFontOption = (options, name) => options.find(option => option.name === name) || options[0];

/** 글꼴 적용: CSS 변수(--sans, --mono)와 열려 있는 SQL 편집기 */
function applyFonts(saved) {
  uiFontStack = fontStackOf(findFontOption(UI_FONT_OPTIONS, saved && saved.ui), UI_FONT_FALLBACK);
  codeFontStack = fontStackOf(findFontOption(CODE_FONT_OPTIONS, saved && saved.code), CODE_FONT_FALLBACK);
  document.documentElement.style.setProperty('--sans', uiFontStack);
  document.documentElement.style.setProperty('--mono', codeFontStack);
  if (!app.screen) return;
  for (const [id, editor] of Object.entries(app.screen.editors)) {
    if (!(id in TEXT_EDITOR_HEIGHTS)) editor.setOption('fontFamily', codeFontStack);   // SQL 편집기만
  }
}

/** 선택 상자에 설치된 글꼴만 채우기 */
function fillFontSelect(select, options, selectedName) {
  select.innerHTML = '';
  for (const option of options) {
    if (!option.auto && !isFontInstalled(option.check)) continue;
    const item = document.createElement('option');
    item.value = option.name;
    item.textContent = option.name;
    item.style.fontFamily = option.stack;
    item.selected = option.name === selectedName;
    select.append(item);
  }
}

/** 글꼴 창의 미리보기 갱신 */
function previewFonts() {
  $('#fPrevUi').style.fontFamily = fontStackOf(findFontOption(UI_FONT_OPTIONS, $('#fUi').value), '"Malgun Gothic",sans-serif');
  $('#fPrevCode').style.fontFamily = fontStackOf(findFontOption(CODE_FONT_OPTIONS, $('#fCode').value), 'Consolas,monospace');
}

function initFonts() {
  $('#btnFont').onclick = async () => {
    const saved = (await settings.get(SETTING_KEYS.fonts)) || {};
    fillFontSelect($('#fUi'), UI_FONT_OPTIONS, saved.ui);
    fillFontSelect($('#fCode'), CODE_FONT_OPTIONS, saved.code);
    previewFonts();
    $('#fontModal').hidden = false;
  };
  $('#fUi').onchange = $('#fCode').onchange = previewFonts;
  $('#fCancel').onclick = () => { $('#fontModal').hidden = true; };
  $('#fOk').onclick = async () => {
    const chosen = {ui: $('#fUi').value, code: $('#fCode').value};
    await settings.set(SETTING_KEYS.fonts, chosen);
    applyFonts(chosen);
    $('#fontModal').hidden = true;
    toast('글꼴을 적용했습니다.');
  };
  // 저장된 글꼴 적용 (읽지 못하면 기본)
  settings.get(SETTING_KEYS.fonts).then(applyFonts).catch(() => applyFonts({}));
}
