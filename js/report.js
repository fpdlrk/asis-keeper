/* ==========================================================================
   report.js — 고객 전달용 보고서 (HTML 파일 한 개)
   새 탭에 열고, 루트의 .reports/ 폴더에도 저장합니다. 인쇄(Ctrl+P) → PDF 로 저장해 제출할 수 있습니다.
   보고서는 앱과 따로 열리는 독립 파일이라 CSS 를 문자열로 넣어 둡니다 (REPORT_CSS).
   ========================================================================== */

/* 상태 이름표(.bd)는 앱 화면의 상태 칸(css/app.css .stpill.s0~s3)과 같은 바탕 · 테두리 · 글자 색, 4px 모서리 */
const REPORT_CSS = `
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;font:13px/1.65 "Malgun Gothic","Apple SD Gothic Neo",Pretendard,sans-serif;color:#2C2C2C;background:#e9edf1}
.doc{padding:24px}
.noprint{position:fixed;right:20px;top:16px}.noprint button{padding:8px 16px;border:0;border-radius:4px;background:#2f3b4c;color:#fff;font-size:13px;cursor:pointer}
.cover,.pg{background:#fff;border:1px solid #dcdfe4;border-radius:3px;padding:32px 34px;margin-bottom:20px}
.cover{border-top:4px solid #2f3b4c}
.cover h1{font-size:26px;margin:0 0 4px;color:#1f2023;letter-spacing:-.01em}.sub{color:#666b73;margin:0 0 22px;padding-bottom:14px;border-bottom:1px solid #dcdfe4}
.cards{display:flex;gap:0;margin:16px 0;border:1px solid #dcdfe4;border-radius:3px}.card{flex:1;padding:12px 16px;border-right:1px solid #dcdfe4}.card:last-child{border-right:0}.card b{display:block;font-size:24px;color:#1f2023}.card span{color:#666b73;font-size:12px}
.rate{display:flex;align-items:center;gap:18px;margin:16px 0 0}.rate svg{flex:none}.rate-t{font-size:13px}.rate-t>b{font-size:20px;color:#1f2023}.lg{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:4px;color:#666b73;font-size:12px}.lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
h2{font-size:19px;margin:0;color:#1f2023}h3{font-size:18px;margin:28px 0 8px;color:#1f2023}h4{font-size:15px;margin:14px 0 6px;color:#2f3b4c}
.ph{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px;padding-bottom:12px;border-bottom:2px solid #2f3b4c}.ph .sp{flex:1}.ph h2{display:inline-flex;align-items:center;gap:8px}.ph h2 svg{flex:none;color:#666b73}.pp{color:#666b73;font-size:12px}
.bd{display:inline-block;padding:2px 8px;border:1px solid #d5d9de;border-radius:4px;background:#f1f3f5;color:#3c4753;font-size:13px;line-height:1.4;white-space:nowrap}.bd.s1{background:#edf3fb;border-color:#c9daf0;color:#1d4f86}.bd.s2{background:#fbf3e3;border-color:#ecd6aa;color:#7a5413}.bd.s3{background:#e8f3ec;border-color:#c4e0cf;color:#1f6a40}
table{border-collapse:collapse;width:100%}.t th,.t td,.kv th,.kv td{border:1px solid #dcdfe4;padding:5px 8px;text-align:left;vertical-align:top}.t th,.kv th{background:#f1f3f6;font-weight:600}.kv{table-layout:fixed}.kv th{width:110px;white-space:nowrap}
pre{margin:0;white-space:pre-wrap;word-break:break-all;font:11.5px/1.5 D2Coding,Consolas,monospace}.txt{background:#fafbfc;border:1px solid #e8eaee;border-radius:3px;padding:10px;font-family:inherit;font-size:13px}
.sbs{table-layout:fixed}.sbs th{border:1px solid #dcdfe4;background:#f1f3f6;padding:4px 8px;text-align:left;font-size:12px}.sbs td{border:1px solid #e8eaee;padding:1px 8px;white-space:pre-wrap;word-break:break-all;font:11.5px/1.5 D2Coding,Consolas,monospace;vertical-align:top;width:50%}
.del{background:#fbe9e6}.add{background:#e4f3ea}td.blank{background:#f1f3f6}.gap{text-align:center;color:#8a9099;background:#fafbfc}
pre.add,pre.del,pre.same{padding:8px;border-radius:3px}pre.same{background:#fafbfc;border:1px solid #e8eaee}.orig{display:block;width:fit-content;max-width:100%;margin-top:4px;padding:2px 8px;border-radius:4px;background:#f1f3f6;color:#3d4248;font-size:12px;font-weight:400}.cap{font-weight:600;font-size:12px;margin:12px 0 4px}h4+.cap{margin-top:0}.note{color:#666b73;font-size:12px;margin:4px 0 0}.tag{display:inline-flex;align-items:center;margin-left:8px;padding:1px 8px;border:1px solid #d5d9de;border-radius:4px;background:#f1f3f6;color:#3d4248;font-size:11.5px;font-weight:600;white-space:nowrap;vertical-align:middle}.tag.new{background:#e8f5ec;border-color:#3c9a62;color:#1f6a40}.tag.changed{background:#fff3c4;border-color:#e3c461;color:#7a5413}.tag.gone{background:#fbe9e6;border-color:#d9877d;color:#8f2f26}
.ok{color:#2b7a4b}.bad{color:#a4372d}a{color:#2f3b4c}
@page{size:A4;margin:12mm}
@media print{body{background:#fff}.noprint{display:none}.doc{max-width:none;padding:0}.cover,.pg{border:0;padding:0;border-radius:0}.cover{border-top:0}.pg{page-break-before:always}tr{page-break-inside:avoid}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

/** 보고서 CSS: 글꼴 설정에서 고른 글꼴로 바꿔 넣음 */
const reportCss = () => REPORT_CSS
  .replace('"Malgun Gothic","Apple SD Gothic Neo",Pretendard,sans-serif', uiFontStack)
  .replace(/D2Coding,Consolas,monospace/g, codeFontStack);

/* 보고서에서 변경 전(원본)을 부르는 이름 — 앱 화면은 '원본', 고객 전달용 보고서는 'ASIS' */
const REPORT_ORIGINAL_NAME = 'ASIS';

/* 화면 페이지 머리 오른쪽의 상태 이름표(요청 · 개발 …) — 지금은 숨김. 다시 보이려면 true */
const REPORT_SHOW_PAGE_STATUS = false;

/* 화면(파일) 페이지 제목 앞 파일 아이콘 — 제목이 파일명임을 알아보게 (트리 [파일 추가]의 문서 모양과 같은 계열) */
const REPORT_FILE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M13.5 3.5H7a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z"/><path d="M13.5 3.5V8H18"/></svg>';

/* 보고서의 SQL 정의 표 열 너비 — 짧은 값 칸은 좁게 고정해 나머지(화면표시명 · 커맨트)가 넓게 나눠 씀. 없는 칸은 남은 폭을 나눔 */
const REPORT_SQL_INFO_WIDTHS = {dataSource: '120px', useYn: '100px', version: '100px', status: '100px'};
/* 표의 '구분' 열(추가 · 변경 · 삭제 / 변경 파일의 수정 · 신규 …) — 어느 표든 이 너비 */
const REPORT_KIND_COLUMN = '구분';
const REPORT_KIND_COLUMN_WIDTH = '60px';
/* '구분' 열에서 변경이 없는 줄의 표시 (빈칸 대신) */
const REPORT_KIND_SAME = '-';

/* 표(GRID_COLUMNS 키)별 열 너비 — 열 이름 → 너비. 없는 열은 자동 ('구분' 열은 REPORT_KIND_COLUMN_WIDTH) */
const REPORT_GRID_WIDTHS = {
  'service.overview': {'속성타입': '120px', '값타입': '180px', '트랜잭션 속성명': '180px', '기본값': '180px'}   // 메세지정의
};

/* 정의서 탭별 정의 표 열 너비 (없는 탭 · 칸은 자동) */
const REPORT_DEF_INFO_WIDTHS = {service: {serviceType: '60px', twoPcYn: '120px', logYn: '120px'}};

/* 보고서 만들기 창을 열 때의 '포함할 화면' — 지난번 고른 값이 남지 않고 언제나 이 값으로 시작 */
const REPORT_DEFAULT_SCOPE = 'prod';

/* 표지의 운영 반영률 파이 — 반영(초록) / 미반영(회색) */
const REPORT_PIE_SIZE = 96;
const REPORT_PIE_COLORS = {done: '#2f855a', rest: '#e1e4e8'};

/* 이보다 큰 파일은 보고서에 내용 비교를 싣지 않음 (해시로만 구분) */
const MAX_REPORT_TEXT_BYTES = 300000;

/* ======================= 데이터 모으기 ======================= */

/**
 * 폴더 아래 파일 정보 (경로 · 크기 · 해시 · 글자 내용)
 * @returns {Promise<{name: string, size: number, hash: string, text: string|null}[]>}
 */
async function collectFileInfos(dir, folderPath) {
  const infos = [];
  try {
    const folder = await getSubDir(dir, folderPath.split('/'), false);
    for (const {relPath, handle} of await walkFiles(folder)) {
      const file = await handle.getFile();
      const canShowText = TEXT_FILE_PATTERN.test(relPath) && file.size < MAX_REPORT_TEXT_BYTES;
      infos.push({name: relPath, size: file.size, hash: await sha256(file), text: canShowText ? await decodeText(file) : null});
    }
  } catch { /* 폴더가 없으면 빈 목록 */ }
  return infos.sort((a, b) => a.name.localeCompare(b.name));
}

/** 화면 하나의 보고서용 데이터 (등록된 내용만) */
async function collectScreenReportData(screenInfo) {
  const {dir, meta} = screenInfo;
  const data = {...screenInfo, statusName: statusOf(meta), texts: {}, defs: {}};
  for (const [fieldId, file] of Object.entries(TEXT_FIELD_FILES)) data.texts[fieldId] = await readText(dir, file) || '';
  for (const tab of Object.keys(DEF_TABS)) data.defs[tab] = await loadDefLayers(dir, tab, isTabLockedIn(meta, tab));   // {asis, tobe}
  data.files = {
    asis: await collectFileInfos(dir, FILE_DIRS.asis),
    tobe: await collectFileInfos(dir, FILE_DIRS.tobe),
    attach: await collectFileInfos(dir, FILE_DIRS.attach)
  };
  // 이 화면의 서비스가 쓰는 ENTITY (서비스 탭에서 지금 고치는 쪽 기준, 프로젝트 공통 목록은 buildReport 가 읽어 둠)
  const serviceItems = isTabLockedIn(meta, 'service') ? data.defs.service.tobe : data.defs.service.asis;
  const usedIds = [...new Set(serviceItems.flatMap(item => item.entityIds || []))];
  data.entities = usedIds.map(id => (app.entityCache || []).find(record => record.id === id)).filter(Boolean);
  data.asisBlocks = await loadSqlBlocks(dir, meta, 'asis');
  data.tobeBlocks = await loadSqlBlocks(dir, meta, 'tobe');
  return data;
}

/* ======================= HTML 조각 ======================= */

/** 표 HTML (칸 = 글자 — 여기서 escapeHtml) */
const reportTableHtml = (columns, rows, widths) => reportHtmlTableHtml(columns, rows.map(row => row.map(cell => escapeHtml(cell))), widths);

/** 표 HTML (칸 = 이미 만든 HTML — 원본 이름표처럼 꾸밈이 들어갈 때) */
const reportHtmlTableHtml = (columns, rows, widths = {}) => '<table class="t"><thead><tr>' + columns.map(col => {
  const width = col === REPORT_KIND_COLUMN ? REPORT_KIND_COLUMN_WIDTH : (widths || {})[col];
  return `<th${width ? ` style="width:${width}"` : ''}>${escapeHtml(col)}</th>`;
}).join('') + '</tr></thead><tbody>'
  + rows.map(row => '<tr>' + row.map(cell => `<td>${cell}</td>`).join('') + '</tr>').join('') + '</tbody></table>';

/** 바뀐 칸의 값 아래 회색 'ASIS: …' 이름표 (정의 칸 · 표 공통) — 모양은 앱 SQL 블록 이름칸 옆 '변경 없음' 이름표(css/app.css .chg)와 같음 */
const originalLabelHtml = value => `<span class="orig">${REPORT_ORIGINAL_NAME}: ${escapeHtml(value || '(빈 칸)')}</span>`;

/**
 * 정의 칸 표 — 일반 표 모양: 머리 줄 = 칸 이름, 아래 한 줄 = 값
 * 원본과 비교하면 바뀐 칸만 값 아래에 회색 '원본: …' 이름표. 바뀌지 않은 칸은 값(= 원본 값)만
 * @param {object|null} originalInfo 원본 값 (null = 비교하지 않음)
 * @param {object} [widths] 칸 key → 열 너비 (예: {version: '100px'}) — 주면 표 폭을 고정 배분(table-layout fixed)하고 나머지 칸이 남은 폭을 나눔
 * @returns {string} 값도 바뀐 칸도 없으면 ''
 */
function reportInfoTableHtml(fields, info, originalInfo, widths = null) {
  const valueOf = (source, key) => comparableValue((source || {})[key]);
  const changed = new Set(originalInfo ? changedInfoKeys(fields, originalInfo, info) : []);
  if (!fields.some(({key}) => valueOf(info, key) || changed.has(key))) return '';
  const cellHtml = ({key}) => escapeHtml(valueOf(info, key)) + (changed.has(key) ? originalLabelHtml(valueOf(originalInfo, key)) : '');
  const colgroup = widths ? '<colgroup>' + fields.map(({key}) => (widths[key] ? `<col style="width:${widths[key]}">` : '<col>')).join('') + '</colgroup>' : '';
  return `<table class="t"${widths ? ' style="table-layout:fixed"' : ''}>${colgroup}<thead><tr>` + fields.map(({label}) => `<th>${escapeHtml(label)}</th>`).join('') + '</tr></thead>'
    + '<tbody><tr>' + fields.map(field => `<td>${cellHtml(field)}</td>`).join('') + '</tr></tbody></table>';
}

/**
 * 표 (원본과 비교하면 맨 앞에 '구분' 열: 추가 · 변경 · 삭제, 바뀐 칸은 값 아래 회색 '원본: …' 이름표)
 * @param {{rows, ids}} grid 표 값
 * @param {{rows, ids}|null} original 원본 표 (null = 비교하지 않음)
 * @returns {string} 줄이 없으면 ''
 */
function reportGridTableHtml(columns, grid, original, widths) {
  const cellsOf = cells => columns.map((_, col) => comparableValue(cells[col]));
  if (!original) return grid.rows.length ? reportTableHtml(columns, grid.rows.map(cellsOf), widths) : '';
  const diff = diffGridRows(original, grid, columns.length);
  const originalById = new Map(original.ids.map((id, i) => [id, original.rows[i] || []]));
  const rows = grid.rows.map((cells, i) => {
    const id = grid.ids[i];
    const changedColumns = diff.changed.get(id) || [];
    const values = cellsOf(cells).map((value, col) => escapeHtml(value)
      + (changedColumns.includes(col) ? originalLabelHtml(comparableValue(originalById.get(id)[col])) : ''));
    return [diff.added.has(id) ? '추가' : changedColumns.length ? '변경' : REPORT_KIND_SAME, ...values];
  });
  diff.deleted.forEach(({cells}) => rows.push(['삭제', ...cellsOf(cells).map(escapeHtml)]));
  return rows.length ? reportHtmlTableHtml([REPORT_KIND_COLUMN, ...columns], rows, widths) : '';
}

/** 글 내용 상자 (비어 있으면 '') */
const reportTextHtml = text => text.trim() ? `<pre class="txt">${escapeHtml(text)}</pre>` : '';

/** 화면 한 개의 보고서 페이지 */
function screenReportHtml(data, index) {
  const {meta, texts} = data;
  // 영역 제목 — 이름만 (번호 없음). 'SQL' · '서비스' · 'ENTITY'처럼 짧게
  const section = title => `<h3>${title}</h3>`;
  // 머리: 화면 이름(파일명) 옆에 들어 있는 폴더 경로만 (파일명은 제목이 이미 보여 줌). 상태 이름표는 REPORT_SHOW_PAGE_STATUS
  const folderPath = data.path.slice(0, -1).join(' / ');
  let html = `<div class="pg" id="p${index}"><div class="ph"><h2>${REPORT_FILE_ICON}${escapeHtml(lastOf(data.path))}</h2>`
    + (folderPath ? `<span class="pp">${escapeHtml(folderPath)}</span>` : '') + '<span class="sp"></span>'
    + `<span class="bd s${STATUS_LIST.indexOf(data.statusName)}"${REPORT_SHOW_PAGE_STATUS ? '' : ' hidden'}>${data.statusName}</span></div>`
    // 기본정보: 개발 · 운영 반영일만 한 줄로 (티켓 · 작업자 등은 표지의 변경 대상 목록에 있음)
    + '<table class="kv" style="margin-top:12px"><tbody><tr>'
    + `<th>개발 반영일</th><td>${lastStatusDate(meta, '개발')}</td><th>운영 반영일</th><td>${lastStatusDate(meta, '운영')}</td>`
    + '</tr></tbody></table>';

  // 변경 내용 요약(메모)
  if (texts.memo.trim()) html += section('변경 내용 요약') + reportTextHtml(texts.memo);

  // 변경 SQL: 신규 블록에 연결한 기존 블록끼리 (연결이 없는 신규는 '신규 파일', 아무도 가리키지 않는 기존은 '삭제됨')
  //   영역 제목은 'SQL' 하나 (신규 · 변경 · 삭제는 항목 제목 옆 표시로 구분)
  const sqlPairs = data.tobeBlocks
    .map((after, order) => ({after, before: findPairedAsisBlock(after, order, data.asisBlocks)}))
    .filter(({after, before}) => after.sql.trim() || after.rbText.trim() || (before && before.sql.trim()));
  const pairedAsisIds = new Set(data.tobeBlocks.map((after, order) => findPairedAsisBlock(after, order, data.asisBlocks)).filter(Boolean).map(block => block.id));
  const removedBlocks = data.asisBlocks.filter(block => !pairedAsisIds.has(block.id) && block.sql.trim());
  if (sqlPairs.length || removedBlocks.length) {
    html += section('SQL');
    for (const {after, before} of sqlPairs) {
      const title = before && before.title !== after.title
        ? `${escapeHtml(before.title)} → ${escapeHtml(after.title)}`
        : escapeHtml(after.title);
      // 순서는 앱의 SQL 블록과 같게: 정의 → SQL 본문 → 파라미터 → 롤백 (보고서 본문은 어디서나 정의가 맨 먼저)
      const sqlState = !before ? 'new' : sqlChangeLogText(sqlLogShape('', before), sqlLogShape('', after)) ? 'changed' : 'same';
      html += `<h4>${title}${reportStateTagHtml(sqlState, sqlState === 'new' ? '신규 파일' : ITEM_STATE_LABELS[sqlState])}</h4>`
        + sqlInfoReportHtml(after, before)
        + (!before ? reportNewSqlHtml(after.sql)
          : sameSqlText(before.sql, after.sql) ? reportSameSqlHtml(after.sql)   // 본문이 원본과 같으면 비교 표 대신 내용 그대로
          : sideBySideHtml(before.sql, after.sql, false, REPORT_ORIGINAL_NAME))
        + sqlParamsReportHtml(after, before);
      if (after.rbText.trim()) html += '<div class="cap">롤백 SQL</div>' + reportTextHtml(after.rbText);
    }
    for (const before of removedBlocks) {
      html += `<h4>${escapeHtml(before.title)}${reportStateTagHtml('gone', `삭제됨 (${REPORT_ORIGINAL_NAME}에만 있음)`)}</h4>`
        + sideBySideHtml(before.sql, '', false, REPORT_ORIGINAL_NAME);
    }
  }

  // 변경 파일: 목록(해시) + 수정된 글자 파일은 내용 비교
  const asisByPath = new Map(data.files.asis.map(f => [f.name, f]));
  const tobeByPath = new Map(data.files.tobe.map(f => [f.name, f]));
  const paths = [...new Set([...asisByPath.keys(), ...tobeByPath.keys()])].sort();
  if (paths.length) {
    html += section('변경 파일') + reportTableHtml(['파일 경로', REPORT_KIND_COLUMN, `${REPORT_ORIGINAL_NAME} SHA-256`, '신규 SHA-256'], paths.map(path => {
      const before = asisByPath.get(path), after = tobeByPath.get(path);
      const kind = before && after ? (before.hash === after.hash ? '변경 없음' : '수정') : before ? `${REPORT_ORIGINAL_NAME} 파일(보관)` : '신규';
      return [path, kind, before ? before.hash.slice(0, 12) : '-', after ? after.hash.slice(0, 12) : '-'];
    }));
    for (const path of paths) {
      const before = asisByPath.get(path), after = tobeByPath.get(path);
      if (!before || !after || before.hash === after.hash) continue;
      html += `<h4>${escapeHtml(path)} — 변경 전 / 변경 후</h4>` + (before.text !== null && after.text !== null
        ? sideBySideHtml(before.text, after.text, false, REPORT_ORIGINAL_NAME)
        : '<p class="note">텍스트로 비교할 수 없는 파일(바이너리/대용량)입니다. 해시로 구분합니다.</p>');
    }
  }

  // 정의서
  for (const tab of Object.keys(DEF_TABS)) html += definitionSectionHtml(section, tab, data.defs[tab], isTabLockedIn(meta, tab));
  html += entitySectionHtml(section, data.entities);

  // 참고 파일
  if (data.files.attach.length) {
    html += section('참고 파일') + reportTableHtml(['파일명', '크기', 'SHA-256'], data.files.attach.map(f => [f.name, f.size.toLocaleString() + ' bytes', f.hash.slice(0, 16)]));
  }
  return html + '</div>';
}

/** 본문이 원본과 같은 SQL — 비교 표 대신 내용만 (색칠 없이) */
const reportSameSqlHtml = sql => (sql.trim() ? `<pre class="same">${escapeHtml(normalizeLineBreaks(sql))}</pre>` : '');

/* 항목 제목 옆 상태 이름표 — 모양은 앱 화면 위 기본정보의 이름표(css/app.css .tag)와 같음
   색은 앱의 변경 표시와 같은 뜻으로 서로 확실히 다르게: 신규 = 초록(--mark-add) · 변경 = 노랑(--mark-chg) · 삭제 = 빨강, 셋 다 같은 계열 테두리 */
const REPORT_STATE_TAG_CLASS = {new: 'new', changed: 'changed', gone: 'gone'};

/** 상태 이름표 HTML (같음 · 상태 없음이면 '') */
const reportStateTagHtml = (state, text) => (REPORT_STATE_TAG_CLASS[state] ? `<span class="tag ${REPORT_STATE_TAG_CLASS[state]}">${escapeHtml(text)}</span>` : '');

/** 표 위에 표 이름(.cap)을 붙임 — 표가 없으면('') 이름도 없음. 예: 'SQL 정의' · '서비스 정의' · 'ENTITY 정의' */
const captionedHtml = (caption, tableHtml) => (tableHtml ? `<div class="cap">${escapeHtml(caption)}</div>` + tableHtml : '');

/** 원본이 없는 신규 SQL — 변경 전 · 후 비교 없이 내용만 (머리의 '신규 파일'이 구분해 줌) */
const reportNewSqlHtml = sql => (sql.trim() ? `<pre class="add">${escapeHtml(normalizeLineBreaks(sql))}</pre>` : '');

/** SQL 블록의 정의 칸 (원본 블록이 있으면 원본과 비교) — SQL 본문보다 먼저. 내용이 없으면 '' */
function sqlInfoReportHtml(block, original) {
  const info = reportInfoTableHtml(SQL_INFO_FIELDS, block.info, original ? original.info || {} : null, REPORT_SQL_INFO_WIDTHS);
  return info ? '<div class="cap">SQL 정의</div>' + info + '<div style="margin-bottom:12px"></div>' : '';   // 아래 SQL 본문과 12px
}

/** SQL 블록의 파라미터 표 (원본 블록이 있으면 원본과 비교) — SQL 본문 아래. 내용이 없으면 '' */
function sqlParamsReportHtml(block, original) {
  const params = reportGridTableHtml(GRID_COLUMNS['sql.params'].cols, {rows: block.params || [], ids: block.paramIds || []},
    original ? {rows: original.params || [], ids: original.paramIds || []} : null);
  return params ? '<div class="cap">SQL 파라미터</div>' + params : '';
}

/**
 * 정의서 영역 (서비스 · 오브젝트 · 공통코드관리)
 *   잠근 뒤: 신규 항목을 원본과 비교해 보여 줌 (항목 상태 · 바뀐 칸 · 표의 구분 열) + 삭제된 원본 항목
 *   잠그기 전: 원본 항목만
 * 항목 이력은 내부 작업 기록이라 고객 전달용 보고서에는 넣지 않습니다.
 * @param {{asis: object[], tobe: object[]}} layers loadDefLayers 결과
 * @returns {string} 보일 항목이 없으면 ''
 */
function definitionSectionHtml(section, tab, layers, locked) {
  const {label, grids, info: infoFields = []} = DEF_TABS[tab];
  const entries = locked
    ? [
      ...layers.tobe.map(item => ({item, original: item.asisId ? layers.asis.find(asis => asis.id === item.asisId) || null : null})),
      ...goneAsisItems(layers.asis, layers.tobe).map(item => ({item, gone: true}))
    ]
    : layers.asis.map(item => ({item}));
  let body = '';
  for (const {item, original, gone} of entries) {
    const state = !locked ? '' : gone ? 'gone' : diffDefItem(tab, original, item).state;
    const compareWith = locked && !gone ? original : null;
    let content = captionedHtml(`${label} 정의`, reportInfoTableHtml(infoFields, item.info, compareWith ? compareWith.info || {} : null, REPORT_DEF_INFO_WIDTHS[tab]));
    for (const [key, gridLabel] of grids) {
      const table = reportGridTableHtml(GRID_COLUMNS[`${tab}.${key}`].cols, gridValueOf(item, key), compareWith ? gridValueOf(compareWith, key) : null, REPORT_GRID_WIDTHS[`${tab}.${key}`]);
      if (table) content += `<div class="cap">${escapeHtml(gridLabel)}</div>` + table;
    }
    // 저장 서비스가 쓰는 ENTITY — 다른 표와 같은 모양으로 (이름만 나열하지 않음)
    if (DEF_TABS[tab].entityLinks) content += captionedHtml('사용 ENTITY', reportEntityLinksTableHtml(item, compareWith));
    if (!content && !state) continue;
    const stateNote = reportStateTagHtml(state, ITEM_STATE_LABELS[state] + (gone ? ` (${REPORT_ORIGINAL_NAME}에만 있음)` : ''));
    body += `<h4>${escapeHtml(item.title || UNNAMED_DEF_TITLE)}${stateNote}</h4>` + content;
  }
  return body ? section(label) + body : '';   // 예: '서비스' (ASIS 대비 여부는 항목 안의 'ASIS:' 이름표로 보임)
}

/**
 * 서비스의 '사용 ENTITY' 표 — 연결한 ENTITY 마다 한 줄: ENTITY명 + 정의 칸(ENTITY_DEF.info, 지금 고치는 쪽 값)
 * 원본과 비교하면 맨 앞 '구분' 열: 새로 연결 = 추가, 원본에서 연결했다가 푼 것 = 삭제 (다른 표와 같은 규칙)
 * @param {object|null} original 비교할 원본 서비스 항목 (null = 비교하지 않음)
 * @returns {string} 연결이 없으면 ''
 */
function reportEntityLinksTableHtml(item, original) {
  const ids = item.entityIds || [];
  const originalIds = original ? original.entityIds || [] : null;
  const removedIds = originalIds ? originalIds.filter(id => !ids.includes(id)) : [];
  if (!ids.length && !removedIds.length) return '';
  const rowOf = (id, kind) => {
    const record = (app.entityCache || []).find(entity => entity.id === id);
    const data = (record && (record[entityLayerOf(record)] || record.asis || record.tobe)) || {};
    const cells = [entityTitleOf(id), ...ENTITY_DEF.info.map(({key}) => comparableValue((data.info || {})[key]))].map(escapeHtml);
    return originalIds ? [kind, ...cells] : cells;
  };
  const rows = [
    ...ids.map(id => rowOf(id, originalIds && !originalIds.includes(id) ? '추가' : REPORT_KIND_SAME)),
    ...removedIds.map(id => rowOf(id, '삭제'))
  ];
  const columns = ['ENTITY명', ...ENTITY_DEF.info.map(({label}) => label)];
  return reportHtmlTableHtml(originalIds ? [REPORT_KIND_COLUMN, ...columns] : columns, rows);
}

/**
 * 이 화면의 서비스가 쓰는 ENTITY (프로젝트 공통) — 잠긴 ENTITY 는 신규를 원본과 비교해 보여 줌
 * @returns {string} 없으면 ''
 */
function entitySectionHtml(section, records) {
  if (!records.length) return '';
  let body = '';
  for (const record of records) {
    const data = record[entityLayerOf(record)];
    const original = record.locked ? record.asis : null;
    const state = !record.asis ? 'new' : record.locked ? diffDefItem('entity', record.asis, record.tobe).state : '';
    let content = captionedHtml('ENTITY 정의', reportInfoTableHtml(ENTITY_DEF.info, data.info, original ? original.info || {} : null));
    for (const [key, gridLabel] of ENTITY_DEF.grids) {
      const table = reportGridTableHtml(GRID_COLUMNS[`entity.${key}`].cols, gridValueOf(data, key), original ? gridValueOf(original, key) : null);
      if (table) content += `<div class="cap">${escapeHtml(gridLabel)}</div>` + table;
    }
    const stateNote = reportStateTagHtml(state, ITEM_STATE_LABELS[state]);
    body += `<h4>${escapeHtml(data.title || UNNAMED_DEF_TITLE)}${stateNote}</h4>` + content;
  }
  return section('ENTITY') + body;
}

/**
 * 표지의 운영 반영률 파이 (운영 반영 / 미반영) + 수치 · 범례
 * 조각 사이는 흰 2px 틈. 조각에 마우스를 올리면 개수가 보임(<title>)
 */
function reportRatePieHtml(done, total) {
  const size = REPORT_PIE_SIZE, r = size / 2, percent = total ? Math.round(done / total * 100) : 0;
  const slice = (color, from, to, label) => {
    const point = ratio => [r + r * Math.sin(2 * Math.PI * ratio), r - r * Math.cos(2 * Math.PI * ratio)].map(n => n.toFixed(2)).join(' ');
    const title = `<title>${label}</title>`;
    if (to - from >= 1) return `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="${color}">${title}</circle>`;   // 한 조각뿐이면 원 전체
    return `<path d="M${r} ${r}L${point(from)}A${r} ${r} 0 ${to - from > .5 ? 1 : 0} 1 ${point(to)}Z" fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round">${title}</path>`;
  };
  const doneRatio = total ? done / total : 0;
  const slices = (doneRatio > 0 ? slice(REPORT_PIE_COLORS.done, 0, doneRatio, `운영 반영 ${done}`) : '')
    + (doneRatio < 1 ? slice(REPORT_PIE_COLORS.rest, doneRatio, 1, `미반영 ${total - done}`) : '');
  const legend = (color, label, count) => `<span><i style="background:${color}"></i>${label} ${count}</span>`;
  return `<div class="rate"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="운영 반영률 ${percent}%">${slices}</svg>`
    + `<div class="rate-t">운영 반영률 <b>${percent}%</b> <span class="note">(${done} / ${total})</span>`
    + `<div class="lg">${legend(REPORT_PIE_COLORS.done, '운영 반영', done)}${legend(REPORT_PIE_COLORS.rest, '미반영', total - done)}</div></div></div>`;
}

/**
 * 보고서 HTML 전체
 * @param {'prod'|'dev'|'all'} scope 운영만 / 개발 이상 / 전체
 * @returns {Promise<string|null>} 조건에 맞는 화면이 없으면 null
 */
async function buildReport(title, scope) {
  app.entityCache = await loadEntities(app.root);   // ENTITY 이름 · 내용 (entityTitleOf · entitySectionHtml)
  const screens = await findAllScreens(app.root);
  const counts = [0, 0, 0, 0];
  screens.forEach(screenInfo => counts[statusIndexOf(screenInfo.meta)]++);
  const minStatus = {prod: STATUS_PROD, dev: STATUS_DEV, all: 0}[scope];
  const included = [];
  for (const screenInfo of screens) {
    if (statusIndexOf(screenInfo.meta) >= minStatus) included.push(await collectScreenReportData(screenInfo));
  }
  if (!included.length) return null;

  const total = screens.length;
  const scopeName = {prod: '운영 완료 화면', dev: '개발 이상 화면', all: '전체 화면'}[scope];
  const indexRows = included.map((data, i) => {
    const fileCount = new Set([...data.files.asis, ...data.files.tobe].map(f => f.name)).size;
    const hasSql = data.asisBlocks.some(b => b.sql.trim()) || data.tobeBlocks.some(b => b.sql.trim());
    return `<tr><td><a href="#p${i}">${i + 1}</a></td><td>${escapeHtml(data.path.join(' / '))}</td><td>${escapeHtml(data.meta.ticket || '')}</td>`
      + `<td>${escapeHtml(data.meta.worker || '')}</td><td><span class="bd s${STATUS_LIST.indexOf(data.statusName)}">${data.statusName}</span></td>`
      + `<td>${lastStatusDate(data.meta, '개발')}</td><td>${lastStatusDate(data.meta, '운영')}</td><td>${hasSql ? '있음' : '-'}</td><td>${fileCount}</td></tr>`;
  }).join('');
  const card = (count, label) => `<div class="card"><b>${count}</b><span>${label}</span></div>`;

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${reportCss()}</style></head><body>
<div class="noprint"><button onclick="print()">인쇄 / PDF 저장</button></div><div class="doc">
<div class="cover"><h1>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(rootLabel())} · 작성일 ${new Date().toLocaleString('ko-KR')} · 대상: ${scopeName} ${included.length}건</p>
${reportRatePieHtml(counts[STATUS_PROD], total)}
<div class="cards">${card(total, '전체 화면')}${card(counts[3], '운영')}${card(counts[2], '개발')}${card(counts[1], '진행')}${card(counts[0], '요청')}</div>
<h3>변경 대상 목록</h3><table class="t"><thead><tr><th>번호</th><th>화면</th><th>티켓</th><th>작업자</th><th>상태</th><th>개발 반영일</th><th>운영 반영일</th><th>변경 SQL</th><th>파일 수</th></tr></thead><tbody>${indexRows}</tbody></table>
<p class="note">화면별 상세(등록 내용, 변경 전·후 소스)는 다음 페이지부터 화면마다 이어집니다.</p></div>
${included.map(screenReportHtml).join('')}</div></body></html>`;
}

/* ======================= 이벤트 연결 ======================= */

function initReport() {
  $('#btnReport').onclick = async () => {
    if (app.screen && hasUnsavedChanges()) {
      const ok = await askConfirm({title: '등록하지 않은 변경이 있습니다', desc: '보고서에는 등록된 내용만 반영됩니다. 계속할까요?', okText: '계속'});
      if (!ok) return;
    }
    $('#rpTitle').value = rootLabel() + ' 변경 결과 보고서';
    $('#rpScope').value = REPORT_DEFAULT_SCOPE;   // 열 때마다 처음 값으로 (제목과 같게)
    $('#modal').hidden = false;
    $('#rpTitle').focus();
  };
  $('#rpCancel').onclick = () => { $('#modal').hidden = true; };
  $('#rpGo').onclick = async () => {
    const title = $('#rpTitle').value.trim() || '변경 결과 보고서';
    const scope = $('#rpScope').value;
    // 새 탭은 클릭 직후(기다리기 전)에 열어야 브라우저의 팝업 차단을 피함
    const reportWindow = window.open('', '_blank');
    $('#modal').hidden = true;
    try {
      const fileName = 'report_' + timestamp() + '.html';
      const html = await withBusy('보고서를 만드는 중…', async () => {
        const built = await buildReport(title, scope);
        if (built !== null) await writeFile(app.root, '.reports/' + fileName, built);
        return built;
      });
      if (html === null) {
        if (reportWindow) reportWindow.close();
        return toast('조건에 맞는 화면이 없습니다.');
      }
      if (reportWindow) {
        reportWindow.document.open();
        reportWindow.document.write(html);
        reportWindow.document.close();
      }
      toast('보고서를 만들었습니다. (.reports/' + fileName + ')');
    } catch (error) {
      if (reportWindow) reportWindow.close();
      toastError('보고서 생성 실패', error);
    }
  };
}
