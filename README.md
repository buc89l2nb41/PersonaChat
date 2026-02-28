# PersonaChat Frontend

React + TypeScript + Vite로 구축된 채팅 프론트엔드입니다.

## 설정

1. `.env` 파일을 생성하고 백엔드 URL을 설정하세요 (선택사항):

```env
VITE_API_URL=http://test-chat.atomic-dns.com:3001
```

기본값은 `http://test-chat.atomic-dns.com:3001`입니다.

2. 의존성 설치:

```bash
npm install
```

## 실행

### 개발 모드
```bash
npm run dev
```

### 프로덕션 빌드
```bash
npm run build
npm run preview
```

## 기능

- 백엔드 서버를 통한 안전한 API 호출
- 실시간 스트리밍 응답
- 페르소나(시스템 메시지) 설정
- 반응형 디자인
