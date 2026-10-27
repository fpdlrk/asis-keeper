/**
 * SQL 자동완성 (Ace ext-language_tools — js/vendor/ace-ext-language_tools.js)
 *   - SQL 키워드·함수·자료형: 친 글자가 대문자면 대문자로, 아니면 소문자로 제안
 *   - 이 화면의 SQL 편집기(기존·신규·롤백)에 이미 나온 이름: 테이블·컬럼 이름을 다시 칠 필요가 없게
 * 두 글자 이상 치면 목록이 저절로 뜨고, Ctrl+Space 로 언제든 띄울 수 있습니다. Esc 로 닫습니다.
 */

/** 목록이 저절로 뜨는 최소 글자 수 */
const SQL_AUTOCOMPLETE_MIN_PREFIX = 2;

/** 화면 SQL 에서 이름으로 모을 낱말 (영문·숫자·_·$·# — 한글 주석 낱말은 모으지 않음) */
const SQL_WORD_PATTERN = /[A-Za-z_][A-Za-z0-9_$#]*/g;

/** 이보다 짧은 낱말은 이름으로 모으지 않음 (별칭 a, b 같은 것) */
const SQL_WORD_MIN_LENGTH = 3;

/** 목록 순서: 점수가 높을수록 위. 화면에 나온 이름을 키워드보다 먼저 보여 줌 */
const SQL_COMPLETION_SCORE = {screenWord: 200, keyword: 100};

/**
 * 지금 편집기 모드(SQL)의 키워드 목록 — Ace 의 SQL 문법 색칠 규칙에 들어 있는 것과 같습니다
 * @returns {Set<string>} 소문자 키워드
 */
function sqlKeywordsOf(session) {
  const mode = session.getMode();
  const keywords = mode.$keywordList || mode.$createKeywordList();
  return new Set(keywords.filter(Boolean).map(word => word.toLowerCase()));
}

/** 이 화면의 SQL 편집기 전체에서 이름(테이블·컬럼 등)을 모음. 키워드는 뺌 */
function collectScreenSqlWords(keywords) {
  const words = new Set();
  if (!app.screen) return words;
  Object.entries(app.screen.editors).forEach(([id, editor]) => {
    if (id in TEXT_EDITOR_HEIGHTS) return;   // 비고 같은 글 입력란은 SQL 이 아니므로 제외
    const found = editor.getValue().match(SQL_WORD_PATTERN) || [];
    found.forEach(word => {
      if (word.length >= SQL_WORD_MIN_LENGTH && !keywords.has(word.toLowerCase())) words.add(word);
    });
  });
  return words;
}

/** 자동완성 제안 1: SQL 키워드 */
const sqlKeywordCompleter = {
  id: 'sqlKeyword',
  getCompletions(editor, session, position, prefix, callback) {
    const useUpperCase = prefix === prefix.toUpperCase();
    const suggestions = [...sqlKeywordsOf(session)].map(word => {
      const value = useUpperCase ? word.toUpperCase() : word;
      return {caption: value, value, meta: '키워드', score: SQL_COMPLETION_SCORE.keyword};
    });
    callback(null, suggestions);
  }
};

/** 자동완성 제안 2: 이 화면의 SQL 에 나온 이름 */
const sqlScreenWordCompleter = {
  id: 'sqlScreenWord',
  getCompletions(editor, session, position, prefix, callback) {
    const words = collectScreenSqlWords(sqlKeywordsOf(session));
    words.delete(prefix);   // 지금 치고 있는 낱말 자신은 제안하지 않음
    const suggestions = [...words].map(word => ({caption: word, value: word, meta: '이 화면', score: SQL_COMPLETION_SCORE.screenWord}));
    callback(null, suggestions);
  }
};

/**
 * SQL 편집기에 자동완성 켜기 (createEditor 에서 부름)
 * 읽기 전용인 동안에는 글자를 칠 수 없으므로 목록도 뜨지 않습니다. 잠금을 풀면 그대로 쓸 수 있습니다.
 * 스니펫(enableSnippets)은 켜지 않습니다 — 켜면 스니펫 파일을 따로 읽으려 하는데 file:// 에서는 읽을 수 없습니다.
 */
function enableSqlAutocomplete(editor) {
  ace.require('ace/ext/language_tools');   // 아래 옵션들을 Ace 에 등록하는 모듈
  const completers = [sqlScreenWordCompleter, sqlKeywordCompleter];
  editor.setOptions({
    enableBasicAutocompletion: completers,   // Ctrl+Space
    enableLiveAutocompletion: completers,    // 치는 동안 저절로
    liveAutocompletionThreshold: SQL_AUTOCOMPLETE_MIN_PREFIX
  });
}
