import PocketBase from 'pocketbase';

// 환경 변수로 PocketBase URL 설정
// 기본값: 배포된 PocketBase
// - VITE_POCKETBASE_URL이 없으면 roaring-snake.lv255.com:19415 사용
// - 스킴(http/https)이 빠진 값이 들어와도 자동으로 https를 붙여줌
const pbUrlRaw =
  import.meta.env.VITE_POCKETBASE_URL || 'https://roaring-snake.lv255.com:19415';
const pbUrl = /^https?:\/\//i.test(pbUrlRaw) ? pbUrlRaw : `https://${pbUrlRaw}`;

// 컬렉션 이름 접두사 (커스텀 컬렉션용)
export const COLLECTION_PREFIX = import.meta.env.VITE_COLLECTION_PREFIX || 'personachat_';

// 컬렉션 이름 헬퍼 함수
export const getCollectionName = (name: string) => {
  return `${COLLECTION_PREFIX}${name}`;
};

const pb = new PocketBase(pbUrl);

// React(특히 StrictMode) 개발 환경에서 동일 요청이 연달아 발생하면
// PocketBase SDK의 auto-cancellation 기능이 이전 요청을 취소하며
// "The request was autocancelled" 에러가 콘솔/알림에 찍힐 수 있음.
// 이 프로젝트는 화면 전환/더블 렌더로 인한 취소를 오류로 취급하지 않기 위해 비활성화.
pb.autoCancellation(false);

export default pb;

/** Persona 아바타 이미지 URL 반환 (avatar 필드가 있을 때만) */
export function getPersonaAvatarUrl(persona: { id: string; avatar?: string }): string | null {
  if (!persona.avatar) return null;
  return pb.files.getUrl(
    { id: persona.id, collectionId: COLLECTIONS.PERSONAS },
    persona.avatar
  );
}

// 컬렉션 이름 상수 (타입 안정성을 위해)
export const COLLECTIONS = {
  // 커스텀 users 컬렉션 (PocketBaseBoard와 분리)
  USERS: getCollectionName('users'),
  // 커스텀 personas 컬렉션
  PERSONAS: getCollectionName('personas'),
  // 로그인 사용자별 페르소나 대화: 1개 레코드 = 1개 대화(채널), 메시지는 MESSAGES 컬렉션에 별도 저장
  // 필드: user(relation→users), persona(relation→personas)
  CONVERSATIONS: getCollectionName('conversations'),
  // 대화별 메시지 (conversation relation, role, content) — 최신순 페이지네이션용
  // 필드: conversation(relation→conversations), role(text), content(text)
  MESSAGES: getCollectionName('messages'),
} as const;
