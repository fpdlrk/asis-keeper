/* ==========================================================================
   settings.js — 브라우저 안에 작은 설정값을 저장 (IndexedDB)

   루트 폴더 핸들처럼 localStorage 에 넣을 수 없는 값도 저장할 수 있어 IndexedDB 를 씁니다.
   저장 위치: 데이터베이스 'asis-keeper' → 저장소 'kv' (키-값)
   ========================================================================== */

/* 설정 키. 키 이름을 바꾸면 예전에 저장한 값은 더 이상 읽히지 않습니다. */
const SETTING_KEYS = {
  root: 'root',                                  // 마지막으로 연 루트 폴더 핸들
  fonts: 'fonts.v2',                             // 글꼴 설정 (v2: 예전 'fonts' 값은 무시 → 처음엔 시안 기본 글꼴)
  tobeView: 'tobeView',                          // 신규 SQL 보기 방식 'side' | 'solo'
  ignoreFormat: 'diff.ignoreFormat',             // 비교할 때 공백·대소문자 무시 (true/false)
  closedFolders: rootName => 'closed:' + rootName, // 루트별로 접어 둔 폴더 목록
  rootPath: rootName => 'rootPath:' + rootName     // 루트별 실제 폴더 경로 (경로 복사용)
};

/** 데이터베이스 열기 (처음이면 저장소 생성) */
function openSettingsDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('asis-keeper', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 저장소에 요청 하나를 보내고 결과를 돌려받음 */
async function runSettingsRequest(mode, makeRequest) {
  const db = await openSettingsDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction('kv', mode).objectStore('kv');
    const request = makeRequest(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const settings = {
  /** 값 읽기 (없으면 undefined) */
  get: key => runSettingsRequest('readonly', store => store.get(key)),
  /** 값 저장 */
  set: (key, value) => runSettingsRequest('readwrite', store => store.put(value, key)),
  /** 저장하되 실패해도 앱 동작에는 영향 없음 (화면 상태처럼 잃어도 되는 값) */
  setQuietly: (key, value) => settings.set(key, value).catch(() => {})
};
