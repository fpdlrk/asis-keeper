/* ==========================================================================
   session-location.js — 새로고침해도 보던 자리로

   새로고침(F5)하면 앱이 처음부터 다시 켜져 현황(메인)으로 갔음 → 무엇을 고치던 중인지 놓치기 쉬움
   페이지를 떠나기 직전(pagehide)에 지금 자리를 이 탭의 sessionStorage 에 적고,
   프로젝트가 다시 열리면(setRootFolder 끝) 한 번만 그 자리로 돌아갑니다.
     기억하는 것: 프로젝트 · 화면 경로 · 탭(SQL · 서비스 …) · 고른 SQL 탭 · 정의서 항목 · ENTITY · ENTITY 보기 · 스크롤 위치
   sessionStorage 는 그 브라우저 탭에만 있어, 새 탭 · 새 창으로 열면 예전처럼 현황에서 시작합니다.
   현황을 보다가 새로고침하면 기억을 지워 현황 그대로.
   ========================================================================== */

/* sessionStorage 키 */
const LOCATION_STORAGE_KEY = 'asis-keeper.location';

/* 이번 페이지에서 돌아가기를 이미 했는지 (프로젝트를 바꿔 열 때는 돌아가지 않음) */
const sessionLocation = {tried: false};

/** 지금 자리 적기 (화면을 보고 있지 않으면 지움) — 쓸 수 없는 브라우저 설정이면 조용히 넘어감 */
function saveCurrentLocation() {
  try {
    const screen = app.screen;
    if (!screen || !app.project) return sessionStorage.removeItem(LOCATION_STORAGE_KEY);
    sessionStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({
      projectId: app.project.id,
      path: screen.path,
      tab: app.tab,
      activeBlock: screen.activeBlock,
      activeDef: screen.activeDef,
      entityFilter: screen.entityFilter,
      scrollTop: $('#main').scrollTop
    }));
  } catch { /* 저장소를 쓸 수 없으면 기억하지 않음 */ }
}

/** 적어 둔 자리 읽기 (없거나 읽을 수 없으면 null) */
function readSavedLocation() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(LOCATION_STORAGE_KEY) || 'null');
    return saved && Array.isArray(saved.path) && saved.path.length ? saved : null;
  } catch {
    return null;
  }
}

/**
 * 프로젝트를 연 뒤 한 번: 적어 둔 자리가 이 프로젝트면 그 화면 → 탭 → 항목 → 스크롤로
 * 그 사이 화면이 지워졌으면 openScreen 이 알리고 현황에 남음
 */
async function restoreSavedLocation() {
  if (sessionLocation.tried) return;
  sessionLocation.tried = true;
  const saved = readSavedLocation();
  if (!saved || !app.root || !app.project || saved.projectId !== app.project.id) return;
  await openScreen(saved.path);
  const screen = app.screen;
  if (!screen || !isSamePath(screen.path, saved.path)) return;

  // 고른 SQL 탭 (지금 보이는 쪽만 — 원본 단계 = 원본, 신규 단계 = 신규)
  const sqlKind = layerOf('sql');
  const blockId = (saved.activeBlock || {})[sqlKind];
  if (blockId && screen.blocks[sqlKind].some(block => block.id === blockId)) activateSqlTab(sqlKind, blockId);
  // 정의서 항목
  for (const tab of Object.keys(DEF_TABS)) {
    const itemId = (saved.activeDef || {})[tab];
    if (itemId && (screen.defItems[tab] || []).some(item => item.id === itemId)) activateDefTab(tab, itemId);
  }
  // ENTITY: 보기를 먼저 맞춰야 고른 ENTITY 가 목록에 있음
  if (saved.entityFilter && saved.entityFilter !== screen.entityFilter) setEntityFilter(saved.entityFilter);
  const entityId = (saved.activeDef || {}).entity;
  if (entityId && screen.entities.some(record => record.id === entityId)) activateEntityTab(entityId);

  if (saved.tab && $(`.tab[data-t="${saved.tab}"]`)) showTab(saved.tab);
  // 편집기 크기가 잡힌 뒤에 스크롤
  requestAnimationFrame(() => { $('#main').scrollTop = saved.scrollTop || 0; });
}

function initSessionLocation() {
  window.addEventListener('pagehide', saveCurrentLocation);
}
