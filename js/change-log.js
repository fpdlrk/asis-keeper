/* ==========================================================================
   change-log.js — 시스템이 자동으로 남기는 이력 (무엇이 만들어지고 바뀌었는지)

   이력 한 줄 = {at, by, text, source}
     source 'user'   : 사용자가 [이력 저장]으로 직접 남긴 것 (source 가 없는 예전 이력도 사용자)
     source 'system' : 프로그램이 남긴 것 — 아래 경우에 자동으로
       항목 이력(SQL 블록 · 정의서 항목의 log)
         처음 등록 → '신규 생성' (원본 단계면 '원본 등록', 되살린 항목은 '원본에서 되살림')
         다시 등록하며 바뀐 것이 있으면 → '수정 · 이름: A → B · 정의: 버전 1 → 2 · 메세지정의: 1줄 추가, 1줄 변경(속성타입 A → B)'
         원본을 잠가 신규로 복사될 때 → '원본에서 복사'
       화면 이력(meta.activityLog) — 항목이 사라져 항목 이력에 남길 수 없는 일 · 화면 전체의 일
         항목 삭제(등록할 때) · 원본 잠그기 · 잠금 풀기
   기록 시점은 저장 바 [등록] (입력할 때마다가 아니라) — 등록 전 입력은 아직 확정이 아니기 때문입니다.
   바뀐 내용은 이전 값 → 이후 값까지 적고, 많으면 처음 MAX_LOG_DETAILS 개만 적고 '외 n건'.
   ========================================================================== */

/* 한 부분(정의 칸 · 표 하나)에서 이전 → 이후 값을 몇 개까지 적을지 */
const MAX_LOG_DETAILS = 3;
/* 이력에 적을 값의 최대 글자 수 (긴 값은 … 으로 줄임) */
const MAX_LOG_VALUE_LENGTH = 40;
/* 이력의 출처 이름 */
const LOG_SOURCE_LABELS = {user: '사용자', system: '시스템'};

/** 이력 한 줄의 출처 (source 가 없는 예전 이력은 사용자) */
const logSourceOf = entry => (entry.source === 'system' ? 'system' : 'user');

/** 시스템 이력 한 줄 */
const systemLogEntry = text => ({at: new Date().toISOString(), by: currentWorkerName(), text, source: 'system'});

/** 추가 창에서 사용자가 쓴 첫 이력 (비었으면 빈 목록) */
const userLogOf = text => (text ? [{at: new Date().toISOString(), by: currentWorkerName(), text, source: 'user'}] : []);

/** 항목에 시스템 이력 한 줄 더하기 (text 가 비면 아무것도 안 함) */
function appendSystemLog(item, text) {
  if (text) item.log = [...(item.log || []), systemLogEntry(text)];
}

/** 화면 이력(meta.activityLog)에 한 줄 더하기 — 저장은 부르는 쪽에서 (saveMeta) */
function addActivityLog(meta, text) {
  meta.activityLog = [...(meta.activityLog || []), systemLogEntry(text)];
}

/** 처음 등록할 때의 이력 글: 따로 정해 둔 글(되살림 등) → 없으면 원본 단계 '원본 등록' / 신규 단계 '신규 생성' */
function creationLogText(item, layer) {
  const text = item.createdNote || (layer === 'asis' ? '원본 등록' : '신규 생성');
  delete item.createdNote;   // 한 번만 씀 (파일에는 저장하지 않는 값)
  return text;
}

/** 이력에 적을 값 (빈 값은 '(빈 칸)', 긴 값은 줄임) */
function logValue(value) {
  const text = comparableValue(value).replace(/\s+/g, ' ');
  if (!text) return '(빈 칸)';
  return text.length > MAX_LOG_VALUE_LENGTH ? text.slice(0, MAX_LOG_VALUE_LENGTH) + '…' : text;
}

/** 목록을 처음 MAX_LOG_DETAILS 개만 쉼표로 잇고 나머지는 '외 n건' */
const limitDetails = details => details.slice(0, MAX_LOG_DETAILS).join(', ')
  + (details.length > MAX_LOG_DETAILS ? ` 외 ${details.length - MAX_LOG_DETAILS}건` : '');

/**
 * 정의 칸 변경 글: '정의: 버전 1 → 2, 상태 개발 → 운영'
 * @param {string[]} keys 바뀐 칸 key (changedInfoKeys)
 */
function infoChangeText(fields, keys, before, after) {
  if (!keys.length) return '';
  const labelOf = key => (fields.find(field => field.key === key) || {label: key}).label;
  return '정의: ' + limitDetails(keys.map(key => `${labelOf(key)} ${logValue((before || {})[key])} → ${logValue((after || {})[key])}`));
}

/**
 * 표 변경 글: '메세지정의: 1줄 추가, 1줄 삭제, 2줄 변경(속성타입 A → B, 기본값 (빈 칸) → 0 외 1건)'
 * @param {object} diff diffGridRows 결과
 * @param {{rows, ids}} before · after 이전 · 이후 표
 */
function gridChangeText(label, columns, diff, before, after) {
  if (!hasGridDiff(diff)) return '';
  const beforeById = new Map(before.ids.map((id, i) => [id, before.rows[i] || []]));
  const afterById = new Map(after.ids.map((id, i) => [id, after.rows[i] || []]));
  const parts = [];
  if (diff.added.size) parts.push(`${diff.added.size}줄 추가`);
  if (diff.deleted.length) parts.push(`${diff.deleted.length}줄 삭제`);
  if (diff.changed.size) {
    const details = [...diff.changed].flatMap(([id, cols]) =>
      cols.map(col => `${columns[col]} ${logValue(beforeById.get(id)[col])} → ${logValue(afterById.get(id)[col])}`));
    parts.push(`${diff.changed.size}줄 변경(${limitDetails(details)})`);
  }
  return `${label}: ${parts.join(', ')}`;
}

/** 여러 부분을 '수정 · …' 한 줄로 (바뀐 게 없으면 '') */
const modifiedLogText = parts => (parts.filter(Boolean).length ? '수정 · ' + parts.filter(Boolean).join(' · ') : '');

/**
 * 정의서 항목 수정 이력 글 (마지막 등록 상태 → 지금)
 * @returns {string} 바뀐 게 없으면 ''
 */
function defChangeLogText(tab, before, after) {
  const diff = diffDefItem(tab, before, after);
  if (diff.state === 'same') return '';
  const config = defConfigOf(tab);
  const linkParts = [...diff.linksAdded.map(id => '+' + entityTitleOf(id)), ...diff.linksRemoved.map(id => '-' + entityTitleOf(id))];
  return modifiedLogText([
    diff.titleChanged ? `이름: ${logValue(before.title)} → ${logValue(after.title)}` : '',
    infoChangeText(config.info || [], diff.info, before.info, after.info),
    ...config.grids.map(([key, label]) => gridChangeText(label, GRID_COLUMNS[`${tab}.${key}`].cols, diff.grids[key], gridValueOf(before, key), gridValueOf(after, key))),
    linkParts.length ? 'ENTITY 연결: ' + limitDetails(linkParts) : ''
  ]);
}

/**
 * SQL 블록 수정 이력 글 (마지막 등록 상태 → 지금)
 * SQL 본문은 바뀐 줄 수만 적습니다 (이전 버전 전문은 신규 SQL 변경 이력 tobe/history 에 남음)
 * @param {{title, asisId?, definition: {info, params, paramIds}, sql}} before 마지막 등록 상태
 * @param {{title, asisId?, definition: {info, params, paramIds}, sql}} after  지금
 * @returns {string} 바뀐 게 없으면 ''
 */
function sqlChangeLogText(before, after) {
  const definitionDiff = diffSqlDefinition(before.definition, after.definition);
  let sqlText = '';
  if (normalizeLineBreaks(before.sql) !== normalizeLineBreaks(after.sql)) {
    const changed = findChangedLineNumbers(before.sql, after.sql);
    sqlText = changed ? `SQL ${Math.max(changed.deleted.length, changed.added.length)}줄 변경` : 'SQL 변경';
  }
  const pairChanged = before.asisId !== undefined && before.asisId !== null && (before.asisId || '') !== (after.asisId || '');
  return modifiedLogText([
    before.title !== after.title ? `이름: ${logValue(before.title)} → ${logValue(after.title)}` : '',
    pairChanged ? '비교할 원본 바꿈' : '',
    sqlText,
    infoChangeText(SQL_INFO_FIELDS, definitionDiff.info, before.definition.info, after.definition.info),
    gridChangeText('파라미터', GRID_COLUMNS['sql.params'].cols, definitionDiff.params,
      {rows: before.definition.params || [], ids: rowIdsOf(before.definition.params, before.definition.paramIds)},
      {rows: after.definition.params || [], ids: rowIdsOf(after.definition.params, after.definition.paramIds)})
  ]);
}
