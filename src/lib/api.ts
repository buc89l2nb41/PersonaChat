// 로컬(DEV): VITE_API_URL 없으면 테스트 서버 주소 사용. 있으면 그대로 사용.
// 프로덕션: VITE_API_URL 없으면 '' → 상대 경로 사용, Vercel rewrites로 백엔드 프록시.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://test-chat.atomic-dns.com:36000' : '');
