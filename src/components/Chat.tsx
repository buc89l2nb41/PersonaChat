import type { FormEvent } from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import pb, { COLLECTIONS } from '../lib/pocketbase';

type Role = 'system' | 'user' | 'assistant';

interface ChatMessage {
  id?: string;
  role: Role;
  content: string;
}

interface ChatProps {
  systemMessage: string;
  /** 로그인 시 이 페르소나와의 대화를 저장/불러오기할 때 사용 */
  personaId?: string;
}

// 로컬(DEV): VITE_API_URL 없으면 테스트 서버 주소 사용. 있으면 그대로 사용 (예: localhost:36000).
// 프로덕션: VITE_API_URL 없으면 '' → 상대 경로(/health, /api) 사용, Vercel rewrites로 백엔드 프록시.
const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://test-chat.atomic-dns.com:36000' : '');

const FIRST_GREETING_PROMPT =
  '대화를 시작해줘. 너의 캐릭터에 맞는 첫 인사나 첫 멘트를 한 마디 해줘.';

const MESSAGES_PAGE_SIZE = 20;
const HEALTH_CHECK_TIMEOUT_MS = 8000;

/** 백엔드 연결 확인. 실패 시 에러 메시지 throw */
async function checkApiConnection(): Promise<void> {
  const base = API_BASE_URL?.trim() || '';
  const healthUrl = base ? `${base}/health` : '/health';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`서버 응답 오류: ${res.status}`);
    const data = (await res.json()) as { status?: string };
    if (data?.status !== 'ok') throw new Error('서버 상태가 정상이 아닙니다.');
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error) {
      if (e.name === 'AbortError') throw new Error('채팅 서버에 연결할 수 없습니다. 서버가 켜져 있는지 확인해 주세요.');
      throw e;
    }
    throw new Error('채팅 서버 연결 확인에 실패했습니다.');
  }
}

/** 저장용: system 제외한 메시지만 */
function messagesToStore(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(m => m.role !== 'system');
}

function mapPbMessage(rec: { id: string; role: string; content: string }): ChatMessage {
  return { id: rec.id, role: rec.role as Role, content: rec.content ?? '' };
}

export default function Chat({ systemMessage, personaId }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messagesPage, setMessagesPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [messagesContainerReady, setMessagesContainerReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  /** 로그인된 상태에서 이 페르소나에 대해 "저장된 대화 로드"를 이미 시도했는지. 시도한 뒤에만 true로 두어, auth 복원 전 첫 실행에서는 로드를 건너뛰고 나중에 userId 생기면 다시 시도하게 함 */
  const hasAttemptedLoad = useRef(false);
  const loadingOlderRef = useRef(false);
  const pendingScrollAdjust = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

  const userId = pb.authStore.model?.id;
  const shouldPersist = Boolean(userId && personaId);

  // 스크롤 하단 유지 또는 이전 메시지 로드 후 스크롤 위치 보정
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (pendingScrollAdjust.current && container) {
      const { scrollHeight, scrollTop } = pendingScrollAdjust.current;
      pendingScrollAdjust.current = null;
      const nextTop = scrollTop + (container.scrollHeight - scrollHeight);
      requestAnimationFrame(() => {
        container.scrollTop = nextTop;
      });
      return;
    }
    if (messagesEndRef.current && !loadingOlder) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, loadingOlder]);

  const getOrCreateConversation = useCallback(async (): Promise<string | null> => {
    if (!userId || !personaId) return null;
    try {
      const list = await pb.collection(COLLECTIONS.CONVERSATIONS).getList(1, 1, {
        filter: `user="${userId}" && persona="${personaId}"`,
        sort: 'created',
      });
      const rec = list.items[0] as { id: string } | undefined;
      if (rec) return rec.id;
      const created = await pb.collection(COLLECTIONS.CONVERSATIONS).create({
        user: userId,
        persona: personaId,
      });
      return created.id;
    } catch {
      return null;
    }
  }, [userId, personaId]);

  const loadMessagesPage = useCallback(
    async (page: number, cId: string) => {
      const list = await pb.collection(COLLECTIONS.MESSAGES).getList(page, MESSAGES_PAGE_SIZE, {
        sort: '-created',
        filter: `conversation="${cId}"`,
        expand: 'conversation',
      });
      const items = (list.items as unknown as { id: string; role: string; content: string }[]).map(mapPbMessage);
      const chronological = [...items].reverse();
      return { chronological, totalPages: list.totalPages };
    },
    [],
  );

  // 저장된 대화 최신순 첫 페이지 로드 또는 첫 인사
  // - 로그인 + 페르소나 있으면: 먼저 PB에서 대화 조회(user+persona 매칭). 있으면 표시, 없으면 첫 인사.
  // - auth가 아직 복원되지 않았으면(userId 없음) 첫 인사 하지 않고 다음 effect 재실행까지 대기.
  useEffect(() => {
    if (!systemMessage?.trim()) return;
    // 이미 이 세션에서 "저장된 대화 로드 시도"를 했으면 재실행하지 않음 (첫 인사 중복 방지)
    if (hasAttemptedLoad.current) return;

    let cancelled = false;
    const systemMsg: ChatMessage = { role: 'system', content: systemMessage };
    const triggerMsg: ChatMessage = { role: 'user', content: FIRST_GREETING_PROMPT };

    (async () => {
      if (shouldPersist && userId && personaId) {
        try {
          const cId = await getOrCreateConversation();
          if (cancelled) return;
          if (cId) {
            const { chronological, totalPages } = await loadMessagesPage(1, cId);
            if (cancelled) return;
            if (chronological.length > 0) {
              hasAttemptedLoad.current = true;
              setConversationId(cId);
              setMessages(chronological);
              setMessagesPage(1);
              setHasMoreMessages(totalPages > 1);
              return;
            }
            setConversationId(cId);
            setHasMoreMessages(totalPages > 1);
          }
        } catch (e) {
          console.warn('저장된 대화 로드 실패:', e);
          hasAttemptedLoad.current = false;
          /* 저장된 대화 없음 또는 권한 오류 → 아래에서 첫 인사 */
        }
      }

      // 페르소나 채팅인데 토큰은 있는데 userId가 없으면 auth 복원 대기 → 다음 effect 재실행 시 로드 시도 (비로그인 시에는 그대로 첫 인사)
      if (personaId && !userId && pb.authStore.token) return;

      if (cancelled) return;
      setMessages([{ role: 'assistant', content: '연결 확인 중...' }]);
      setIsLoading(true);
      setError(null);

      try {
        await checkApiConnection();
        if (cancelled) return;
        setMessages([{ role: 'assistant', content: '' }]);
        hasAttemptedLoad.current = true;
      } catch (connErr) {
        if (!cancelled) {
          setError(connErr instanceof Error ? connErr.message : '채팅 서버에 연결할 수 없습니다.');
          setMessages([]);
          hasAttemptedLoad.current = false;
        }
        setIsLoading(false);
        return;
      }

      const abortController = new AbortController();
      const timeoutMs = 60000;
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

      try {
        const res = await fetch(`${API_BASE_URL}/api/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-oss-120b',
            messages: [systemMsg, triggerMsg],
          }),
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok || !res.body) {
          throw new Error(`요청 실패: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullContent = '';

        while (!cancelled) {
          const { value, done: isDone } = await reader.read();
          if (isDone) break;
          if (!value) continue;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('data:')) continue;
            const dataStr = trimmedLine.replace(/^data:\s*/, '');
            if (dataStr === '[DONE]') break;
            try {
              const json = JSON.parse(dataStr);
              if (json.error && !cancelled) {
                clearTimeout(timeoutId);
                setError(String(json.error));
                setMessages([]);
                setIsLoading(false);
                return;
              }
              const delta = json.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                fullContent += delta;
                if (!cancelled) setMessages([{ role: 'assistant', content: fullContent }]);
              }
            } catch {
              /* ignore */
            }
          }
        }

        if (shouldPersist && fullContent && !cancelled) {
          const cId = await getOrCreateConversation();
          if (cId) {
            setConversationId(cId);
            try {
              await pb.collection(COLLECTIONS.MESSAGES).create({
                conversation: cId,
                role: 'assistant',
                content: fullContent,
              });
            } catch (e) {
              console.warn('첫 인사 저장 실패:', e);
            }
          }
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (!cancelled) {
          const isAbort = err instanceof Error && err.name === 'AbortError';
          setError(
            isAbort
              ? '응답 시간이 초과되었습니다. 백엔드 서버와 OPENROUTER_API_KEY를 확인해 주세요.'
              : err instanceof Error
                ? err.message
                : '알 수 없는 오류가 발생했습니다.',
          );
          setMessages([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [systemMessage, personaId, shouldPersist, userId, getOrCreateConversation, loadMessagesPage]);

  // 스크롤 맨 위 감지 → 이전 메시지 더 로드
  useEffect(() => {
    loadingOlderRef.current = loadingOlder;
  }, [loadingOlder]);

  useEffect(() => {
    if (!conversationId || !hasMoreMessages || loadingOlder || !messagesContainerReady) return;
    const el = topSentinelRef.current;
    const root = messagesContainerRef.current;
    if (!el || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingOlderRef.current) return;
        loadingOlderRef.current = true;
        pendingScrollAdjust.current = {
          scrollHeight: root.scrollHeight,
          scrollTop: root.scrollTop,
        };
        setLoadingOlder(true);
        const nextPage = messagesPage + 1;
        loadMessagesPage(nextPage, conversationId)
          .then(({ chronological, totalPages }) => {
            setMessages(prev => [...chronological, ...prev]);
            setMessagesPage(nextPage);
            setHasMoreMessages(totalPages > nextPage);
          })
          .catch(() => {})
          .finally(() => {
            setLoadingOlder(false);
            loadingOlderRef.current = false;
          });
      },
      { root, rootMargin: '80px', threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [conversationId, hasMoreMessages, loadingOlder, messagesPage, loadMessagesPage, messagesContainerReady]);

  const persistNewMessages = useCallback(
    async (newMessages: ChatMessage[]): Promise<string | null> => {
      const toSave = messagesToStore(newMessages);
      if (toSave.length === 0) return null;
      const cId = await getOrCreateConversation();
      if (!cId) return null;
      for (const msg of toSave) {
        try {
          await pb.collection(COLLECTIONS.MESSAGES).create({
            conversation: cId,
            role: msg.role,
            content: msg.content,
          });
        } catch (e) {
          console.warn('메시지 저장 실패:', e);
        }
      }
      return cId;
    },
    [getOrCreateConversation],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const systemMsg: ChatMessage = { role: 'system', content: systemMessage };
    const currentHistory = [...messages, userMessage];

    setMessages([...currentHistory, { role: 'assistant', content: '' }]);
    setInput('');
    setIsLoading(true);
    setError(null);

    const abortController = new AbortController();
    const timeoutMs = 60000;
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-oss-120b',
          messages: [systemMsg, ...currentHistory],
        }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok || !res.body) {
        throw new Error(`요청 실패: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let fullContent = '';

      while (!done) {
        const { value, done: isDone } = await reader.read();
        done = isDone;
        if (!value) continue;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data:')) continue;

          const dataStr = trimmedLine.replace(/^data:\s*/, '');
          if (dataStr === '[DONE]') {
            done = true;
            break;
          }

          try {
            const json = JSON.parse(dataStr);
            if (json.error) {
              clearTimeout(timeoutId);
              setError(String(json.error));
              setMessages(prev => prev.slice(0, -1));
              return;
            }
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (!delta) continue;
            fullContent += delta;
            setMessages(prev => {
              if (prev.length === 0) return prev;
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              if (updated[lastIndex].role === 'assistant') {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  content: fullContent,
                };
              }
              return updated;
            });
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }

      if (fullContent.length === 0) {
        setError('AI 응답을 받지 못했습니다. 백엔드(API 키, 서버)를 확인해 주세요.');
        setMessages(prev => prev.slice(0, -1));
        clearTimeout(timeoutId);
        return;
      }

      const newPair: ChatMessage[] = [
        { role: 'user', content: trimmed },
        { role: 'assistant', content: fullContent },
      ];
      const cId = await persistNewMessages(newPair);
      if (cId) setConversationId(cId);
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setError(
        isAbort
          ? '응답 시간이 초과되었습니다. 백엔드 서버가 켜져 있는지, .env에 OPENROUTER_API_KEY가 설정되어 있는지 확인해 주세요.'
          : err instanceof Error
            ? err.message
            : '알 수 없는 오류가 발생했습니다.',
      );
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const visibleMessages = messages.filter(m => m.role !== 'system');

  return (
    <div className="chat-container">
      <div
        className="chat-messages"
        ref={el => {
          messagesContainerRef.current = el;
          if (el && !messagesContainerReady) setMessagesContainerReady(true);
        }}
      >
        <div ref={topSentinelRef} className="chat-top-sentinel" aria-hidden="true" />
        {loadingOlder && (
          <div className="chat-loading-older" role="status" aria-label="이전 메시지 불러오는 중">
            <span className="chat-loading-older-spinner" />
            <span>이전 메시지 불러오는 중...</span>
          </div>
        )}
        {visibleMessages.map((msg, idx) => (
          <div
            key={msg.id ?? `msg-${idx}`}
            className={`chat-message chat-message-${msg.role}`}
          >
            <div className="chat-message-meta">
              <span className="chat-message-role">
                {msg.role === 'user' ? '나' : 'AI'}
              </span>
            </div>
            <div className="chat-message-bubble">
              {msg.content.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="chat-error">{error}</div>}

      <form className="chat-input-bar" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          placeholder="메시지를 입력하고 Enter를 눌러보세요. (Shift+Enter 줄바꿈)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
          rows={2}
          disabled={isLoading}
        />
        <button
          type="submit"
          className="chat-send-button"
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? '생각 중...' : '전송'}
        </button>
      </form>
    </div>
  );
}
