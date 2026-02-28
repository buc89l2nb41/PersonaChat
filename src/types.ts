export interface Persona {
  id: string;
  name: string;
  description?: string;
  systemMessage: string;
  author: string;
  authorName?: string;
  created: string;
  updated: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
}
