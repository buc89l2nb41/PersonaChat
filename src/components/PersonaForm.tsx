import { useState, useRef, useEffect } from 'react';
import pb, { COLLECTIONS, getPersonaAvatarUrl } from '../lib/pocketbase';

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

  const objectUrl = selectedFile ? URL.createObjectURL(selectedFile) : null;
  const existingUrl = personaId && initialAvatar ? getPersonaAvatarUrl({ id: personaId, avatar: initialAvatar }) : null;
  const previewUrl = objectUrl || existingUrl || null;

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

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
        </div>
      </div>

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
