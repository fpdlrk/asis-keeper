/* ==========================================================================
   report.js — 고객 전달용 보고서 (HTML 파일 한 개)
   새 탭에 열고, 루트의 .reports/ 폴더에도 저장합니다. 인쇄(Ctrl+P) → PDF 로 저장해 제출할 수 있습니다.
   보고서는 앱과 따로 열리는 독립 파일이라 CSS 를 문자열로 넣어 둡니다 (REPORT_CSS).
   ========================================================================== */

const REPORT_CSS = `
*{box-sizing:border-box}body{margin:0;font:13px/1.65 "Malgun Gothic","Apple SD Gothic Neo",Pretendard,sans-serif;color:#2C2C2C;background:#e9edf1}
.doc{max-width:1000px;margin:0 auto;padding:24px}
.noprint{position:fixed;right:20px;top:16px}.noprint button{padding:8px 16px;border:0;border-radius:4px;background:#2f3b4c;color:#fff;font-size:13px;cursor:pointer}
.cover,.pg{background:#fff;border:1px solid #dcdfe4;border-radius:3px;padding:32px 34px;margin-bottom:20px}
.cover{border-top:4px solid #2f3b4c}
.cover h1{font-size:26px;margin:0 0 4px;color:#1f2023;letter-spacing:-.01em}.sub{color:#666b73;margin:0 0 22px;padding-bottom:14px;border-bottom:1px solid #dcdfe4}
.cards{display:flex;gap:0;margin:16px 0;border:1px solid #dcdfe4;border-radius:3px}.card{flex:1;padding:12px 16px;border-right:1px solid #dcdfe4}.card:last-child{border-right:0}.card b{display:block;font-size:24px;color:#1f2023}.card span{color:#666b73;font-size:12px}
.gauge{height:8px;border-radius:2px;background:#e1e4e8;overflow:hidden;margin:6px 0 4px}.gauge i{display:block;height:100%;background:#2f855a}
h2{font-size:19px;margin:0;color:#1f2023}h3{font-size:14px;margin:24px 0 8px;padding:5px 10px;background:#f1f3f6;border-left:3px solid #2f3b4c;color:#2C2C2C}h4{font-size:13px;margin:14px 0 6px;color:#2f3b4c}
.ph{display:flex;align-items:center;gap:14px;padding-bottom:12px;border-bottom:2px solid #2f3b4c}.no{background:#2f3b4c;color:#fff;border-radius:3px;min-width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-weight:700}.ph>div{flex:1}.pp{margin:0;color:#666b73;font-size:12px}
.bd{display:inline-block;border-radius:2px;padding:1px 9px;font-size:12px;font-weight:600;color:#fff;background:#7b8794}.bd.s1{background:#2b6cb0}.bd.s2{background:#b7791f}.bd.s3{background:#2f855a}
table{border-collapse:collapse;width:100%}.t th,.t td,.kv th,.kv td{border:1px solid #dcdfe4;padding:5px 8px;text-align:left;vertical-align:top}.t th,.kv th{background:#f1f3f6;font-weight:600}.kv th{width:110px}
pre{margin:0;white-space:pre-wrap;word-break:break-all;font:11.5px/1.5 D2Coding,Consolas,monospace}.txt{background:#fafbfc;border:1px solid #e8eaee;border-radius:3px;padding:10px;font-family:inherit;font-size:13px}
.sbs{table-layout:fixed}.sbs th{border:1px solid #dcdfe4;background:#f1f3f6;padding:4px 8px;text-align:left;font-size:12px}.sbs td{border:1px solid #e8eaee;padding:1px 8px;white-space:pre-wrap;word-break:break-all;font:11.5px/1.5 D2Coding,Consolas,monospace;vertical-align:top;width:50%}
.del{background:#fbe9e6}.add{background:#e4f3ea}td.blank{background:#f1f3f6}.gap{text-align:center;color:#8a9099;background:#fafbfc}
pre.add,pre.del{padding:8px;border-radius:3px}.cap{font-weight:600;font-size:12px;margin-bottom:4px}.note{color:#666b73;font-size:12px;margin:4px 0 0}
.ok{color:#2b7a4b}.bad{color:#a4372d}a{color:#2f3b4c}
@page{size:A4;margin:12mm}
@media print{body{background:#fff}.noprint{display:none}.doc{max-width:none;padding:0}.cover,.pg{border:0;padding:0;border-radius:0}.cover{border-top:0}.pg{page-break-before:always}tr{page-break-inside:avoid}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

/** 보고서 CSS: 글꼴 설정에서 고른 글꼴로 바꿔 넣음 */
const reportCss = () => REPORT_CSS
  .replace('"Malgun Gothic","Apple SD Gothic Neo",Pretendard,sans-serif', uiFontStack)
  .replace(/D2Coding,Consolas,monospace/g, codeFontStack);

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
  for (const tab of Object.keys(DEF_TABS)) data.defs[tab] = await loadDefItems(dir, tab);   // 예전 파일만 있으면 '기본' 항목으로
  data.files = {
    asis: await collectFileInfos(dir, FILE_DIRS.asis),
    tobe: await collectFileInfos(dir, FILE_DIRS.tobe),
    attach: await collectFileInfos(dir, FILE_DIRS.attach)
  };
  data.asisBlocks = await loadSqlBlocks(dir, meta, 'asis');
  data.tobeBlocks = await loadSqlBlocks(dir, meta, 'tobe');
  data.changedFiles = (await findChangedFiles(dir, meta.hashes)).map(item => item.path);
  return data;
}

/* ======================= HTML 조각 ======================= */

/** 표 HTML */
const reportTableHtml = (columns, rows) => '<table class="t"><thead><tr>' + columns.map(col => `<th>${escapeHtml(col)}</th>`).join('') + '</tr></thead><tbody>'
  + rows.map(row => '<tr>' + row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';

/** 글 내용 상자 (비어 있으면 '') */
const reportTextHtml = text => text.trim() ? `<pre class="txt">${escapeHtml(text)}</pre>` : '';

/** 화면 한 개의 보고서 페이지 */
function screenReportHtml(data, index) {
  const {meta, texts} = data;
  let sectionNo = 0;
  const section = title => `<h3>${++sectionNo}. ${title}</h3>`;
  const infoRow = (label, valueHtml) => `<tr><th>${label}</th><td>${valueHtml}</td></tr>`;
  // 잠금을 푼 적이 있으면 횟수를 함께 적습니다 (사유 전문은 앱의 '잠금 해제 이력'에만 남김)
  const unlockCount = (meta.asisUnlockLog || []).length;
  const integrityState = !meta.asisLocked
    ? (unlockCount ? '<span class="bad">잠금 해제 상태 (다시 등록되지 않음)</span>' : '<span class="note">기존 내용 미등록</span>')
    : data.changedFiles.length
      ? '<span class="bad">변경 감지: ' + escapeHtml(data.changedFiles.join(', ')) + '</span>'
      : '<span class="ok">등록 시점과 일치 (SHA-256)</span>';
  const integrity = integrityState + (unlockCount ? ` <span class="note">· 잠금 해제 ${unlockCount}회</span>` : '');

  let html = `<div class="pg" id="p${index}"><div class="ph"><span class="no">${index + 1}</span>`
    + `<div><h2>${escapeHtml(lastOf(data.path))}</h2><p class="pp">${escapeHtml(data.path.join(' / '))}</p></div>`
    + `<span class="bd s${STATUS_LIST.indexOf(data.statusName)}">${data.statusName}</span></div>`
    + '<table class="kv" style="margin-top:12px"><tbody>'
    + infoRow('티켓번호', escapeHtml(meta.ticket || '-')) + infoRow('작업자', escapeHtml(meta.worker || '-'))
    + infoRow('원본 위치', escapeHtml(meta.origin || '-')) + infoRow('개발 반영일', lastStatusDate(meta, '개발'))
    + infoRow('운영 반영일', lastStatusDate(meta, '운영')) + infoRow('원본 무결성', integrity)
    + '</tbody></table>';

  // 변경 내용 요약(메모)
  if (texts.memo.trim()) html += section('변경 내용 요약') + reportTextHtml(texts.memo);

  // 변경 SQL: 신규 블록에 연결한 기존 블록끼리 (연결이 없는 신규는 '신규 쿼리', 아무도 가리키지 않는 기존은 '신규에 없음')
  const hasSql = data.asisBlocks.some(b => b.sql.trim()) || data.tobeBlocks.some(b => b.sql.trim() || b.rbText.trim());
  if (hasSql) {
    html += section('변경 SQL (변경 전 → 변경 후)');
    const pairedAsisIds = new Set();
    let sqlNo = 0;
    data.tobeBlocks.forEach((after, order) => {
      const before = findPairedAsisBlock(after, order, data.asisBlocks);
      if (before) pairedAsisIds.add(before.id);
      if (!after.sql.trim() && !after.rbText.trim() && !(before && before.sql.trim())) return;
      const title = before && before.title !== after.title
        ? `${escapeHtml(before.title)} → ${escapeHtml(after.title)}`
        : escapeHtml(after.title);
      html += `<h4>${++sqlNo}. ${title}${before ? '' : ' <span class="note">신규 쿼리</span>'}</h4>`
        + sideBySideHtml(before ? before.sql : '', after.sql, false);
      if (after.rbText.trim()) html += '<div class="cap" style="margin-top:8px">롤백 SQL</div>' + reportTextHtml(after.rbText);
    });
    for (const before of data.asisBlocks) {
      if (pairedAsisIds.has(before.id) || !before.sql.trim()) continue;
      html += `<h4>${++sqlNo}. ${escapeHtml(before.title)} <span class="note">신규에 없음</span></h4>`
        + sideBySideHtml(before.sql, '', false);
    }
  }

  // 변경 파일: 목록(해시) + 수정된 글자 파일은 내용 비교
  const asisByPath = new Map(data.files.asis.map(f => [f.name, f]));
  const tobeByPath = new Map(data.files.tobe.map(f => [f.name, f]));
  const paths = [...new Set([...asisByPath.keys(), ...tobeByPath.keys()])].sort();
  if (paths.length) {
    html += section('변경 파일') + reportTableHtml(['파일 경로', '구분', '기존 SHA-256', '신규 SHA-256'], paths.map(path => {
      const before = asisByPath.get(path), after = tobeByPath.get(path);
      const kind = before && after ? (before.hash === after.hash ? '변경 없음' : '수정') : before ? '기존 파일(보관)' : '신규';
      return [path, kind, before ? before.hash.slice(0, 12) : '-', after ? after.hash.slice(0, 12) : '-'];
    }));
    for (const path of paths) {
      const before = asisByPath.get(path), after = tobeByPath.get(path);
      if (!before || !after || before.hash === after.hash) continue;
      html += `<h4>${escapeHtml(path)} — 변경 전 / 변경 후</h4>` + (before.text !== null && after.text !== null
        ? sideBySideHtml(before.text, after.text, false)
        : '<p class="note">텍스트로 비교할 수 없는 파일(바이너리/대용량)입니다. 해시로 구분합니다.</p>');
    }
  }

  // 정의서
  for (const tab of Object.keys(DEF_TABS)) html += definitionSectionHtml(section, tab, data.defs[tab]);

  // 참고 파일
  if (data.files.attach.length) {
    html += section('참고 파일') + reportTableHtml(['파일명', '크기', 'SHA-256'], data.files.attach.map(f => [f.name, f.size.toLocaleString() + ' bytes', f.hash.slice(0, 16)]));
  }
  return html + '</div>';
}

/**
 * 정의서 영역 (서비스 · 오브젝트 · 공통코드관리): 항목마다 이름 + 정의 칸(값이 있는 것) + 내용이 있는 표. 모두 비었으면 ''
 * 항목 이력은 내부 작업 기록이라 고객 전달용 보고서에는 넣지 않습니다.
 */
function definitionSectionHtml(section, tab, items) {
  const {label, grids, info: infoFields = []} = DEF_TABS[tab];
  const infoRows = item => infoFields.filter(({key}) => (item.info || {})[key]).map(field => [field.label, item.info[field.key]]);
  const hasContent = item => infoRows(item).length || grids.some(([key]) => (item.grids[key] || []).length);
  const filledItems = (items || []).filter(hasContent);
  if (!filledItems.length) return '';
  let html = section(label + ' 정의');
  for (const item of filledItems) {
    html += `<h4>${escapeHtml(item.title || UNNAMED_DEF_TITLE)}</h4>`;
    if (infoRows(item).length) html += `<div class="cap">정의</div>` + reportTableHtml(['항목', '값'], infoRows(item));
    for (const [key, gridLabel] of grids) {
      const rows = item.grids[key] || [];
      if (!rows.length) continue;
      const columns = GRID_COLUMNS[`${tab}.${key}`].cols;
      html += `<div class="cap">${escapeHtml(gridLabel)}</div>` + reportTableHtml(columns, rows.map(row => columns.map((_, i) => row[i] || '')));
    }
  }
  return html;
}

/**
 * 보고서 HTML 전체
 * @param {'prod'|'dev'|'all'} scope 운영만 / 개발 이상 / 전체
 * @returns {Promise<string|null>} 조건에 맞는 화면이 없으면 null
 */
async function buildReport(title, scope) {
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
  const prodPercent = total ? Math.round(counts[STATUS_PROD] / total * 100) : 0;
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
<div class="cards">${card(total, '전체 화면')}${card(counts[3], '운영')}${card(counts[2], '개발')}${card(counts[1], '진행')}${card(counts[0], '요청')}</div>
<div>운영 반영률 <b>${prodPercent}%</b> (${counts[STATUS_PROD]} / ${total})</div><div class="gauge"><i style="width:${prodPercent}%"></i></div>
<h3>변경 대상 목록</h3><table class="t"><thead><tr><th>번호</th><th>화면</th><th>티켓</th><th>작업자</th><th>상태</th><th>개발 반영일</th><th>운영 반영일</th><th>변경 SQL</th><th>파일 수</th></tr></thead><tbody>${indexRows}</tbody></table>
<p class="note">화면별 상세(등록 내용, 변경 전·후 소스)는 다음 페이지부터 화면마다 이어집니다. 기존(ASIS) 원본은 등록 시점의 SHA-256 해시로 무결성을 검증했습니다.</p></div>
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
