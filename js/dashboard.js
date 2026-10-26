/* ==========================================================================
   dashboard.js — 본문 첫 화면
     - 루트 선택 전: 안내 + [루트 폴더 선택]
     - 루트 선택 후: 현황 대시보드 (상태별 건수 · 운영 반영률 · 점검 필요 · 최근 변경)
   ========================================================================== */

/* 그리기 순번: 그리는 도중 화면이 바뀌면 이전 결과는 버림 */
let homeRenderSeq = 0;

/* 점검 필요 목록에 보여 줄 최대 개수 */
const MAX_ISSUES_SHOWN = 12;
/* 최근 변경에 보여 줄 개수 */
const MAX_RECENT_SHOWN = 8;
/* "진행으로 변경" 처럼 조사를 붙인 상태 이름 */
const STATUS_WITH_PARTICLE = {'요청': '요청으로', '진행': '진행으로', '개발': '개발로', '운영': '운영으로'};

/** 현황 화면 보여 주기 (열린 화면은 닫음) */
function showHome() {
  app.screen = null;
  renderBreadcrumb();
  // 오른쪽 이력·메모 영역은 화면을 열었을 때만
  $('#rside').hidden = true;
  $('#rside').innerHTML = '';
  $('#app').classList.remove('has-screen');

  const main = $('#main');
  const seq = ++homeRenderSeq;
  if (!app.root) {
    renderWelcome(main);
    return;
  }
  main.innerHTML = `<div class="home">
    ${app.notice ? `<div class="banner info">${ICON.check}<span>${escapeHtml(app.notice)}</span></div>` : ''}
    <h1 class="h1">현황</h1><p class="muted" id="homeSub">불러오는 중…</p>
    <div class="kpis" id="kpis"></div>
    <section class="card prog" id="prog"></section>
    <div class="two">
      <section class="card"><h2 class="card-h">점검 필요 <span class="pill" id="issueCnt">확인 중</span></h2><div id="issues" class="rows"><p class="muted pad">원본 무결성과 등록 상태를 확인하고 있습니다…</p></div></section>
      <section class="card"><h2 class="card-h">최근 변경</h2><div id="recent" class="rows"></div></section>
    </div>
  </div>`;
  renderDashboard(seq);
}

/** 루트를 고르기 전 안내 화면 */
function renderWelcome(main) {
  const resumeButton = $('#btnResume');
  const canResume = !resumeButton.hidden;
  main.innerHTML = `<div class="home-empty">
    <div class="hero-ic">${ICON.logo}</div>
    <h1>ASIS 원본 보관함</h1>
    <p>변경 전(ASIS) 원본을 화면별로 잠가 보관하고, 변경 후(TOBE)와 비교해 고객 전달용 보고서를 만듭니다.</p>
    <div class="actions">
      ${canResume ? `<button type="button" class="btn btn-primary btn-s" data-home="resume">${escapeHtml(resumeButton.textContent)}</button>` : ''}
      <button type="button" class="btn ${canResume ? '' : 'btn-primary'} btn-s" data-home="pick">루트 폴더 선택</button>
    </div>
  </div>`;
  main.querySelectorAll('[data-home]').forEach(button => {
    button.onclick = () => (button.dataset.home === 'pick' ? pickRootFolder() : resumeRootFolder());
  });
}

/** 그리는 도중 다른 화면으로 바뀌었는지 */
const isHomeOutdated = seq => seq !== homeRenderSeq || app.screen;

/** 대시보드 내용 채우기 (점검은 파일 해시를 계산하므로 마지막에 천천히) */
async function renderDashboard(seq) {
  const screens = await findAllScreens(app.root);
  if (isHomeOutdated(seq)) return;

  const counts = [0, 0, 0, 0];
  screens.forEach(screenInfo => counts[statusIndexOf(screenInfo.meta)]++);
  const changes = collectStatusChanges(screens);

  $('#homeSub').textContent = `화면 ${screens.length}개` + (changes.length ? ' · 마지막 변경 ' + formatDateTime(changes[0].at) : '');
  renderKpis(counts, screens.length);
  renderProgress(counts, screens.length);
  renderRecentChanges(changes);

  const issues = await findIssues(screens, seq);
  if (isHomeOutdated(seq)) return;
  renderIssues(issues);
}

/** 모든 화면의 상태 이력을 최신순으로 */
function collectStatusChanges(screens) {
  return screens
    .flatMap(screenInfo => (screenInfo.meta.statusLog || []).map((entry, i) => ({
      screenInfo,
      status: normalizeStatus(entry.status),
      at: entry.at,
      isCreation: i === 0     // 첫 기록 = 메뉴 생성
    })))
    .filter(change => !isNaN(new Date(change.at)))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

/** 상태별 건수 카드 */
function renderKpis(counts, total) {
  const cards = [['전체 화면', total, 'acc'], ...STATUS_LIST.map((name, i) => [name, counts[i], 's' + i])];
  $('#kpis').innerHTML = cards.map(([label, count, dotClass]) =>
    `<div class="kpi"><div class="kpi-l"><i class="dot ${dotClass}"></i>${label}</div><div class="kpi-n">${count}</div></div>`).join('');
}

/** 운영 반영률 막대 (운영 → 개발 → 진행 → 요청 순으로 쌓음) */
function renderProgress(counts, total) {
  const percent = total ? Math.round(counts[STATUS_PROD] / total * 100) : 0;
  const order = [3, 2, 1, 0];
  const segments = order.filter(i => counts[i]).map(i => `<i class="s${i}" style="flex:${counts[i]}"></i>`).join('');
  $('#prog').innerHTML = `<div class="prog-h"><b>운영 반영률</b><span class="muted"><b class="big">${percent}%</b> · ${counts[STATUS_PROD]} / ${total}</span></div>
    <div class="stack" role="img" aria-label="상태별 화면 수: ${STATUS_LIST.map((name, i) => name + ' ' + counts[i]).join(', ')}">${segments || '<i class="empty"></i>'}</div>
    <div class="legend">${order.map(i => `<span><i class="dot s${i}"></i>${STATUS_LIST[i]} ${counts[i]}</span>`).join('')}</div>`;
}

/** 최근 변경 목록 */
function renderRecentChanges(changes) {
  const box = $('#recent');
  box.innerHTML = changes.length ? '' : '<p class="muted pad">아직 변경 기록이 없습니다.</p>';
  for (const change of changes.slice(0, MAX_RECENT_SHOWN)) {
    const what = change.isCreation ? '메뉴 생성' : STATUS_WITH_PARTICLE[change.status] + ' 변경';
    box.append(createScreenRow(change.screenInfo.path,
      `<i class="dot s${STATUS_LIST.indexOf(change.status)}"></i>`,
      `<b>${escapeHtml(lastOf(change.screenInfo.path))}</b> <span class="muted">${what}</span>`,
      formatDateTime(change.at)));
  }
}

/**
 * 점검 필요 항목 찾기
 *   - 원본 변경: 잠긴 ASIS 가 등록 시점과 다름
 *   - ASIS 없음: 개발 이상인데 기존 내용을 등록하지 않음
 *   - TOBE 없음: 개발 이상인데 신규 SQL·파일이 비어 있음
 * @returns {Promise<{screenInfo, kind: 'bad'|'warn', tag: string, desc: string}[] | null>} 도중에 화면이 바뀌면 null
 */
async function findIssues(screens, seq) {
  const issues = [];
  for (const screenInfo of screens) {
    if (isHomeOutdated(seq)) return null;
    const {dir, meta} = screenInfo;
    const statusIndex = statusIndexOf(meta);
    const statusName = STATUS_LIST[statusIndex];
    const add = (kind, tag, desc) => issues.push({screenInfo, kind, tag, desc});

    if (meta.asisLocked) {
      if ((await findChangedFiles(dir, meta.hashes, {stopAtFirst: true})).length) add('bad', '원본 변경', 'ASIS 원본이 등록 시점과 다릅니다');
    } else if (statusIndex >= STATUS_DEV) {
      add('warn', 'ASIS 없음', statusName + ' 상태인데 기존 내용이 등록되지 않았습니다');
    }
    if (statusIndex >= STATUS_DEV) {
      const tobeBlocks = await loadSqlBlocks(dir, meta, 'tobe');
      const hasTobe = tobeBlocks.some(block => block.sql.trim()) || (await listFilesDeep(dir, FILE_DIRS.tobe)).length;
      if (!hasTobe) add('warn', 'TOBE 없음', statusName + ' 상태인데 신규 내용이 비어 있습니다');
    }
  }
  // '원본 변경'(bad)을 맨 위로
  return issues.sort((a, b) => (a.kind === 'bad' ? 0 : 1) - (b.kind === 'bad' ? 0 : 1));
}

/** 점검 필요 목록 */
function renderIssues(issues) {
  const counter = $('#issueCnt');
  counter.textContent = issues.length;
  counter.classList.toggle('ok', !issues.length);
  const box = $('#issues');
  box.innerHTML = issues.length ? '' : `<p class="muted pad">${ICON.check} 점검할 항목이 없습니다.</p>`;
  for (const issue of issues.slice(0, MAX_ISSUES_SHOWN)) {
    box.append(createScreenRow(issue.screenInfo.path,
      `<span class="tag ${issue.kind}">${issue.tag}</span>`,
      `<b>${escapeHtml(lastOf(issue.screenInfo.path))}</b> <span class="muted">${escapeHtml(issue.desc)}</span>`,
      '›'));
  }
  if (issues.length > MAX_ISSUES_SHOWN) {
    box.insertAdjacentHTML('beforeend', `<p class="muted pad">외 ${issues.length - MAX_ISSUES_SHOWN}건 더 있습니다. 왼쪽 상태 필터로 좁혀 보세요.</p>`);
  }
}

/**
 * 누르면 그 화면을 여는 목록 한 줄
 * @param {string[]} path 화면 경로
 * @param {string} leadHtml 앞쪽(상태 점·태그) HTML
 * @param {string} bodyHtml 가운데 내용 HTML
 * @param {string} trailingText 오른쪽 글자
 */
function createScreenRow(path, leadHtml, bodyHtml, trailingText) {
  const row = createButton({label: '', className: 'row'});
  row.title = path.join(' / ');
  row.innerHTML = `${leadHtml}<span class="row-b">${bodyHtml}</span><span class="row-t">${escapeHtml(trailingText)}</span>`;
  row.onclick = () => openScreen(path);
  return row;
}
