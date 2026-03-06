import { useState, useRef, useEffect } from 'react';
import pb, { COLLECTIONS, getPersonaAvatarUrl } from '../lib/pocketbase';
import { API_BASE_URL } from '../lib/api';

interface PersonaFormProps {
  onSuccess: () => void;
  personaId?: string;
  initialName?: string;
  initialDescription?: string;
  initialSystemMessage?: string;
  /** 수정 시 기존 아바타 파일명 (이미지 미리보기/교체용) */
  initialAvatar?: string;
}

export default function PersonaForm({ 
  onSuccess, 
  personaId, 
  initialName = '', 
  initialDescription = '', 
  initialSystemMessage = '',
  initialAvatar = '',
}: PersonaFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [systemMessage, setSystemMessage] = useState(initialSystemMessage);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI 이미지 생성 (나노바나나 / SSE)
  const [showAiImageModal, setShowAiImageModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [aiImageError, setAiImageError] = useState<string | null>(null);

  const objectUrl = selectedFile ? URL.createObjectURL(selectedFile) : null;
  const existingUrl = personaId && initialAvatar ? getPersonaAvatarUrl({ id: personaId, avatar: initialAvatar }) : null;
  const previewUrl = objectUrl || existingUrl || null;

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  /** base64 이미지를 File 객체로 변환 */
  function base64ToFile(base64: string, mimeType: string, filename = 'persona-avatar.png'): File {
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: mimeType });
    return new File([blob], filename, { type: mimeType });
  }

  const handleAiImageGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setAiImageError('이미지 설명을 입력해 주세요.');
      return;
    }
    setAiImageError(null);
    setAiImageLoading(true);

    const url = `${API_BASE_URL}/api/image/generate`;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 60000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio: '1:1', imageSize: '1K' }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      if (!res.ok || !res.body) {
        throw new Error(`요청 실패: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let done = false;
      let imageBase64: string | null = null;
      let mimeType = 'image/png';

      while (!done) {
        const { value, done: isDone } = await reader.read();
        done = isDone;
        if (value) buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.replace(/^data:\s*/, '').trim();
          if (dataStr === '[DONE]') {
            done = true;
            break;
          }
          try {
            const json = JSON.parse(dataStr) as { status?: string; error?: string; image?: string; mimeType?: string };
            if (json.status === 'error' && json.error) {
              setAiImageError(json.error);
              return;
            }
            if (json.status === 'done' && json.image) {
              imageBase64 = json.image;
              if (json.mimeType) mimeType = json.mimeType;
            }
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }

      if (imageBase64) {
        const file = base64ToFile(imageBase64, mimeType);
        setSelectedFile(file);
        setShowAiImageModal(false);
        setAiPrompt('');
      } else if (!aiImageError) {
        setAiImageError('이미지를 받지 못했습니다. API 키와 백엔드를 확인해 주세요.');
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setAiImageError(
        isAbort
          ? '응답 시간이 초과되었습니다. 백엔드와 이미지 생성 API 키를 확인해 주세요.'
          : err instanceof Error ? err.message : '이미지 생성에 실패했습니다.',
      );
    } finally {
      setAiImageLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pb.authStore.isValid) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!name.trim() || !systemMessage.trim()) {
      alert('이름과 시스템 메시지는 필수입니다.');
      return;
    }

    setLoading(true);

    try {
      const hasFile = selectedFile != null;

      if (hasFile) {
        const formData = new FormData();
        formData.append('name', name.trim());
        formData.append('description', description.trim());
        formData.append('systemMessage', systemMessage.trim());
        formData.append('avatar', selectedFile);

        if (personaId) {
          await pb.collection(COLLECTIONS.PERSONAS).update(personaId, formData);
        } else {
          formData.append('author', pb.authStore.model?.id || '');
          await pb.collection(COLLECTIONS.PERSONAS).create(formData);
        }
      } else {
        const data: Record<string, string> = {
          name: name.trim(),
          description: description.trim(),
          systemMessage: systemMessage.trim(),
        };

        if (personaId) {
          await pb.collection(COLLECTIONS.PERSONAS).update(personaId, data);
        } else {
          (data as any).author = pb.authStore.model?.id || '';
          await pb.collection(COLLECTIONS.PERSONAS).create(data);
        }
      }

      setName('');
      setDescription('');
      setSystemMessage('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onSuccess();
    } catch (error: any) {
      console.error('Persona 저장 실패:', error);
      alert('Persona 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="persona-form">
      <div className="form-group">
        <label htmlFor="name">Persona 이름 *</label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="예: 게임 개발 전문가"
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="description">설명</label>
        <input
          type="text"
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Persona에 대한 간단한 설명"
        />
      </div>

      <div className="form-group">
        <label>이미지 (선택)</label>
        <div className="persona-form-avatar">
          {previewUrl && (
            <div className="persona-form-avatar-preview">
              <img src={previewUrl} alt="미리보기" />
              <button
                type="button"
                className="persona-form-avatar-remove"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                aria-label="이미지 제거"
              >
                ×
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            id="avatar"
            accept="image/*"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            className="persona-form-avatar-input"
          />
          {!previewUrl && (
            <label htmlFor="avatar" className="persona-form-avatar-label">
              이미지 선택
            </label>
          )}
          <button
            type="button"
            className="persona-form-avatar-ai-btn"
            onClick={() => setShowAiImageModal(true)}
          >
            AI로 이미지 생성
          </button>
        </div>
      </div>

      {showAiImageModal && (
        <div className="persona-form-ai-modal-overlay" onClick={() => !aiImageLoading && setShowAiImageModal(false)}>
          <div className="persona-form-ai-modal" onClick={e => e.stopPropagation()}>
            <h3>AI로 페르소나 이미지 생성</h3>
            <p className="persona-form-ai-modal-hint">나노바나나(Gemini)로 생성한 이미지를 아바타로 사용합니다.</p>
            <div className="persona-form-ai-modal-body">
              <div className="form-group">
                <label htmlFor="ai-prompt">이미지 설명</label>
                <textarea
                  id="ai-prompt"
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="예: 미소 짓는 고양이 캐릭터, 파스텔 톤"
                  rows={3}
                  disabled={aiImageLoading}
                />
              </div>
              {aiImageError && <p className="persona-form-ai-error">{aiImageError}</p>}
              <div className="persona-form-ai-actions">
                <button type="button" onClick={() => !aiImageLoading && setShowAiImageModal(false)} disabled={aiImageLoading}>
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => handleAiImageGenerate()}
                  disabled={aiImageLoading}
                >
                  {aiImageLoading ? '생성 중…' : '생성하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="systemMessage">시스템 메시지 (페르소나) *</label>
        <textarea
          id="systemMessage"
          value={systemMessage}
          onChange={(e) => setSystemMessage(e.target.value)}
          required
          rows={6}
          placeholder="예:&#10;너는 게임 개발을 잘 아는 AI야.&#10;항상 한국어로 대답해.&#10;설명은 핵심 위주로."
        />
      </div>

      <div className="form-actions">
        <button type="submit" disabled={loading} className="submit-button">
          {loading ? '저장 중...' : personaId ? '수정하기' : '만들기'}
        </button>
      </div>
    </form>
  );
}
