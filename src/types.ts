export interface Persona {
  id: string;
  name: string;
  description?: string;
  systemMessage: string;
  author: string;
  authorName?: string;
  /** 아바타 이미지 파일명 (PocketBase file 필드) */
  avatar?: string;
  created: string;
  updated: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
}
