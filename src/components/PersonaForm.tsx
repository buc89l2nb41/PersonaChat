import { useState } from 'react';
import pb, { COLLECTIONS } from '../lib/pocketbase';

interface PersonaFormProps {
  onSuccess: () => void;
  personaId?: string;
  initialName?: string;
  initialDescription?: string;
  initialSystemMessage?: string;
}

export default function PersonaForm({ 
  onSuccess, 
  personaId, 
  initialName = '', 
  initialDescription = '', 
  initialSystemMessage = '' 
}: PersonaFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [systemMessage, setSystemMessage] = useState(initialSystemMessage);
  const [loading, setLoading] = useState(false);

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
      const data: any = {
        name: name.trim(),
        description: description.trim(),
        systemMessage: systemMessage.trim(),
      };

      // COLLECTIONS.PERSONAS 사용
      if (personaId) {
        // 수정 시에는 author를 변경하지 않음 (생성자만 수정 가능하도록)
        await pb.collection(COLLECTIONS.PERSONAS).update(personaId, data);
      } else {
        // 생성 시에만 author 설정
        data.author = pb.authStore.model?.id || '';
        await pb.collection(COLLECTIONS.PERSONAS).create(data);
      }

      setName('');
      setDescription('');
      setSystemMessage('');
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
