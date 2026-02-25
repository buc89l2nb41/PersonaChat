import { FormEvent, useEffect, useRef, useState } from 'react'
import './App.css'

type Role = 'system' | 'user' | 'assistant'

interface ChatMessage {
  role: Role
  content: string
}

const DEFAULT_PERSONA = [
  '너는 한국어로만 대답하는 친절한 AI 비서야.',
  '답변은 너무 길지 않게, 핵심 위주로 정리해서 말해줘.',
].join('\n')

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [tempApiKey, setTempApiKey] = useState('')
  const [persona, setPersona] = useState(DEFAULT_PERSONA)
  const [tempPersona, setTempPersona] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // 로컬스토리지 → .env 순으로 초기값 로드
    try {
      const storedKey = localStorage.getItem('openrouter_api_key')
      if (storedKey) {
        setApiKey(storedKey)
      }

      const storedPersona = localStorage.getItem('persona_text')
      if (storedPersona) {
        setPersona(storedPersona)
      }
    } catch {
      // private 모드 등에서 실패할 수 있음
    }

    const envKey = import.meta.env.VITE_OPENROUTER_API_KEY as
      | string
      | undefined
    if (envKey) {
      setApiKey(prev => prev || envKey)
    }
  }, [])

  useEffect(() => {
    // 메시지가 바뀔 때마다 맨 아래로 스무스 스크롤
    if (!messagesEndRef.current) return
    messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    if (!apiKey) {
      setError('API 키가 설정되어 있지 않습니다. 오른쪽 상단 설정에서 키를 입력해주세요.')
      setIsSettingsOpen(true)
      return
    }

    const userMessage: ChatMessage = { role: 'user', content: trimmed }
    const systemMessage: ChatMessage = {
      role: 'system',
      content: persona || DEFAULT_PERSONA,
    }
    const currentHistory = [...messages, userMessage]

    // UI에 먼저 유저 + 비어 있는 assistant 메시지를 추가
    setMessages([...currentHistory, { role: 'assistant', content: '' }])
    setInput('')
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-oss-120b',
          stream: true,
          messages: [systemMessage, ...currentHistory],
        }),
      })

      if (!res.ok || !res.body) {
        const text = await res.text()
        throw new Error(`요청 실패: ${res.status} ${text}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let assistantText = ''
      let done = false

      while (!done) {
        const { value, done: isDone } = await reader.read()
        done = isDone
        if (!value) continue

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine.startsWith('data:')) continue

          const dataStr = trimmedLine.replace(/^data:\s*/, '')
          if (dataStr === '[DONE]') {
            done = true
            break
          }

          try {
            const json = JSON.parse(dataStr)
            const delta = json.choices?.[0]?.delta?.content ?? ''
            if (!delta) continue

            assistantText += delta

            // 마지막 assistant 메시지에 토큰을 계속 붙임
            setMessages(prev => {
              if (prev.length === 0) return prev
              const updated = [...prev]
              const lastIndex = updated.length - 1
              if (updated[lastIndex].role === 'assistant') {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  content: updated[lastIndex].content + delta,
                }
              }
              return updated
            })
          } catch {
            // JSON 파싱 실패는 무시
          }
        }
      }
    } catch (err) {
      console.error(err)
      setError(
        err instanceof Error
          ? err.message
          : '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      )
      // 에러 시 마지막 비어 있는 assistant 메시지를 제거
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setIsLoading(false)
    }
  }

  const visibleMessages = messages.filter(m => m.role !== 'system')

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="chat-title">Persona Chat</div>
        <button
          type="button"
          className="chat-settings-button"
          onClick={() => {
            setTempApiKey(apiKey)
            setTempPersona(persona)
            setIsSettingsOpen(true)
          }}
        >
          설정
        </button>
      </header>

      <main className="chat-main">
        <div className="chat-messages">
          {visibleMessages.length === 0 && (
            <div className="chat-empty">
              아래 입력창에 질문을 적고 엔터를 눌러보세요.
              <br />
              예: &quot;타입스크립트로 OpenRouter 스트리밍 예제 보여줘&quot;
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
                e.preventDefault()
                handleSubmit(e as unknown as FormEvent)
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
      </main>

      {isSettingsOpen && (
        <div
          className="settings-backdrop"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="settings-modal"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="settings-title">설정</h2>
            <label className="settings-label">
              OpenRouter API 키
              <input
                type="password"
                className="settings-input"
                placeholder="sk-or-로 시작하는 키를 입력하세요"
                value={tempApiKey}
                onChange={e => setTempApiKey(e.target.value)}
              />
            </label>
            <label className="settings-label settings-label-persona">
              페르소나 (system 메시지)
              <textarea
                className="settings-textarea"
                rows={4}
                placeholder={`예:\n- 너는 게임 개발을 잘 아는 AI야.\n- 항상 한국어로 대답해.\n- 설명은 핵심 위주로.`}
                value={tempPersona}
                onChange={e => setTempPersona(e.target.value)}
              />
            </label>
            <p className="settings-help">
              API 키와 페르소나는 이 브라우저의 로컬스토리지에만 저장되며, 서버로 전송되지
              않습니다.
            </p>
            <div className="settings-actions">
              <button
                type="button"
                className="settings-button-secondary"
                onClick={() => setIsSettingsOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="settings-button-primary"
                onClick={() => {
                  const trimmedKey = tempApiKey.trim()
                  const trimmedPersona = tempPersona.trim()

                  setApiKey(trimmedKey)
                  setPersona(trimmedPersona || DEFAULT_PERSONA)
                  try {
                    if (trimmedKey) {
                      localStorage.setItem('openrouter_api_key', trimmedKey)
                    } else {
                      localStorage.removeItem('openrouter_api_key')
                    }
                    if (trimmedPersona) {
                      localStorage.setItem('persona_text', trimmedPersona)
                    } else {
                      localStorage.removeItem('persona_text')
                    }
                  } catch {
                    // 로컬스토리지 실패는 조용히 무시
                  }
                  setIsSettingsOpen(false)
                  setError(null)
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
