import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

type Role = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: Role;
  content: string;
}

interface ChatProps {
  systemMessage: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://test-chat.atomic-dns.com:3001';

export default function Chat({ systemMessage }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

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

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-oss-120b',
          messages: [systemMsg, ...currentHistory],
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`요청 실패: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;

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
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (!delta) continue;

            setMessages(prev => {
              if (prev.length === 0) return prev;
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              if (updated[lastIndex].role === 'assistant') {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  content: updated[lastIndex].content + delta,
                };
              }
              return updated;
            });
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
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
      <div className="chat-messages">
        {visibleMessages.length === 0 && (
          <div className="chat-empty">
            아래 입력창에 질문을 적고 엔터를 눌러보세요.
          </div>
        )}

        {visibleMessages.map((msg, idx) => (
          <div
            key={idx}
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
