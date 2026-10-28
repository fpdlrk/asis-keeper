/* ==========================================================================
   state.js — 앱 전체 상태를 한곳에 모아 둡니다.

   app        : 앱 전체에서 공유하는 상태 (루트 폴더, 열린 화면, 필터 …)
   app.screen : 지금 열려 있는 화면 하나의 상태. 화면이 없으면(현황) null.
                구조는 screen.js 의 createScreenState() 를 보세요.
   ========================================================================== */

const app = {
  /** 열려 있는 프로젝트 {id, name, handle, lastOpenedAt} (js/project.js). 고르기 전에는 null
   *  project 는 있는데 root 가 null 이면: 폴더 권한이 끊겨 아직 열지 못한 상태 */
  project: null,
  /** 지금 쓰고 있는 루트 폴더 (FileSystemDirectoryHandle) = app.project.handle. 열기 전에는 null */
  root: null,
  /** 열려 있는 화면 상태. 현황(대시보드)일 때는 null */
  screen: null,
  /** 화면에서 보고 있는 탭 id ('sql' | 'service' | 'object' | 'code' | 'attach') */
  tab: 'sql',
  /** 왼쪽 상태 필터. null = 전체, 0~3 = 상태 번호 */
  statusFilter: null,
  /** 상태별 화면 수 [요청, 진행, 개발, 운영] — 트리를 그릴 때 함께 셉니다 */
  statusCounts: [0, 0, 0, 0],
  /** 현황 화면 맨 위에 띄울 안내 문구 (파일 구조 변환 결과 등) */
  notice: '',
  /** 비교할 때 공백·줄바꿈·대소문자 차이를 무시할지 (신규 SQL·비교 탭·비교 창 공통. 보고서는 항상 그대로 비교) */
  ignoreFormat: false
};
