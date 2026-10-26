/* ==========================================================================
   sql.js — SQL 글자를 다루는 도우미
     - splitSqlStatements()   : 여러 쿼리를 ; 기준으로 나누기 (붙여넣기 → 블록 자동 분리)
     - 비교용 정리 함수          : "공백·대소문자 무시" 비교에서 씀 (diff.js)
   ========================================================================== */

/* 블록 제목으로 쓸 주석의 최대 길이 */
const MAX_SQL_TITLE_LENGTH = 40;

/**
 * SQL 글을 쿼리 단위로 나누기
 * ; 에서 나누되, 문자열('…', "…") 과 주석(-- …, /* … *\/) 안의 ; 는 무시합니다.
 * 쿼리 앞의 주석은 그 쿼리에 붙고, 맨 끝에 주석만 남으면 마지막 쿼리에 붙입니다.
 * ※ PL/SQL 블록(BEGIN … END;)처럼 안에 ; 가 있는 문장은 잘게 나뉘므로, 그때는 사용자가 "그대로 붙여넣기"를 고릅니다.
 *
 * @param {string} text
 * @returns {{sql: string, title: string}[]} sql = 끝의 ; 포함 원문, title = 쿼리 앞 첫 주석(없으면 '')
 */
function splitSqlStatements(text) {
  const chunks = [];
  let current = '';
  let state = 'code';   // 'code' | 'single'(작은따옴표 문자열) | 'double'(큰따옴표) | 'line'(-- 주석) | 'block'(/* */ 주석)

  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    current += ch;
    if (state === 'code') {
      if (ch === "'") state = 'single';
      else if (ch === '"') state = 'double';
      else if (ch === '-' && next === '-') { state = 'line'; current += next; i++; }
      else if (ch === '/' && next === '*') { state = 'block'; current += next; i++; }
      else if (ch === ';') { chunks.push(current); current = ''; }
    } else if (state === 'single' && ch === "'") {
      if (next === "'") { current += next; i++; }   // '' 는 문자열 안의 작은따옴표
      else state = 'code';
    } else if (state === 'double' && ch === '"') {
      state = 'code';
    } else if (state === 'line' && ch === '\n') {
      state = 'code';
    } else if (state === 'block' && ch === '*' && next === '/') {
      current += next; i++;
      state = 'code';
    }
  }
  if (current.trim()) chunks.push(current);

  // 주석만 있는 조각(맨 끝의 꼬리 주석 등)은 앞 쿼리에 붙임
  const statements = [];
  for (const chunk of chunks) {
    if (!stripSqlComments(chunk).trim() && statements.length) statements[statements.length - 1].sql += chunk;
    else statements.push({sql: chunk});
  }
  return statements
    .map(statement => ({sql: statement.sql.trim(), title: leadingCommentTitle(statement.sql)}))
    .filter(statement => stripSqlComments(statement.sql).trim());
}

/** SQL 에서 주석 지우기 (쿼리가 비었는지 볼 때만 씀 — 문자열 안의 -- 까지 정확히 가리지는 않음) */
const stripSqlComments = sql => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

/** 쿼리 앞 첫 줄 주석을 블록 제목으로 ("-- 사원 조회" → "사원 조회"). 없으면 '' */
function leadingCommentTitle(sql) {
  const match = sql.trim().match(/^--\s*(.+)/) || sql.trim().match(/^\/\*\s*([^*\n]+?)\s*\*\//);
  return match ? match[1].trim().slice(0, MAX_SQL_TITLE_LENGTH) : '';
}

/* ---- "공백·대소문자 무시" 비교용 ---- */

/** 줄 비교용 값: 공백을 하나로 줄이고 앞뒤 공백 제거, 소문자로 */
const formatInsensitiveLine = line => line.replace(/\s+/g, ' ').trim().toLowerCase();

/** 전체 글 비교용 값: 줄바꿈·공백·대소문자 차이를 모두 없앰 (줄을 다르게 나눈 것도 같게 봄) */
const formatInsensitiveText = text => String(text).replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * 두 글이 같은지
 * @param {boolean} ignoreFormat true = 공백·줄바꿈·대소문자 차이는 무시
 */
function isSameText(before, after, ignoreFormat) {
  if (ignoreFormat) return formatInsensitiveText(before) === formatInsensitiveText(after);
  return normalizeLineBreaks(before) === normalizeLineBreaks(after);
}
