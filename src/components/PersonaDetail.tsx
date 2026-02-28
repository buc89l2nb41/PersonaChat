import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import pb, { COLLECTIONS } from '../lib/pocketbase';
import type { Persona } from '../types';
import Chat from './Chat';
import PersonaForm from './PersonaForm';

export default function PersonaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const isAuthenticated = pb.authStore.isValid;
  const currentUserId = pb.authStore.model?.id;
  const isAuthor = persona && currentUserId && persona.author === currentUserId;

  useEffect(() => {
    loadPersona();
  }, [id]);

  const loadPersona = async () => {
    if (!id) return;

    try {
      // 인증 없이도 읽기 가능하도록 설정
      // COLLECTIONS.PERSONAS 사용
      const record = await pb.collection(COLLECTIONS.PERSONAS).getOne(id, {
        expand: 'author',
      });

      setPersona({
        id: record.id,
        name: record.name,
        description: record.description,
        systemMessage: record.systemMessage,
        author: record.author,
        authorName: record.expand?.author?.name || record.expand?.author?.email || '알 수 없음',
        created: record.created,
        updated: record.updated,
      });
    } catch (error: any) {
      console.error('Persona 로드 실패:', error);
      const errorMessage =
        error?.message || error?.data?.message || '알 수 없는 오류';

      // PocketBase SDK auto-cancellation은 실제 오류가 아니므로 무시
      if (typeof errorMessage === 'string' && errorMessage.includes('autocancelled')) {
        return;
      }

      // 인증 오류인 경우에도 사용자에게 알림
      if (error?.status === 401 || error?.status === 403) {
        alert('Persona를 불러올 수 없습니다. 백엔드 권한 설정을 확인해주세요.');
      } else {
        alert(`Persona를 불러올 수 없습니다: ${errorMessage}`);
      }
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">로딩 중...</div>;
  }

  if (!persona) {
    return <div className="empty">Persona를 찾을 수 없습니다.</div>;
  }

  const handleEditSuccess = async () => {
    setIsEditing(false);
    await loadPersona(); // 페르소나 정보 다시 로드
  };

  return (
    <div className="persona-detail">
      <button onClick={() => navigate('/')} className="back-button">
        ← 목록으로
      </button>
      
      {isEditing ? (
        <div className="persona-edit">
          <h2>Persona 수정</h2>
          <PersonaForm
            personaId={persona.id}
            initialName={persona.name}
            initialDescription={persona.description || ''}
            initialSystemMessage={persona.systemMessage}
            onSuccess={handleEditSuccess}
          />
          <button 
            onClick={() => setIsEditing(false)} 
            className="cancel-edit-button"
          >
            취소
          </button>
        </div>
      ) : (
        <>
          <div className="persona-header">
            <div className="persona-header-top">
              <h2>{persona.name}</h2>
              {isAuthenticated && isAuthor && (
                <button 
                  onClick={() => setIsEditing(true)} 
                  className="edit-button"
                >
                  수정
                </button>
              )}
            </div>
            {persona.description && (
              <p className="persona-description">{persona.description}</p>
            )}
            <div className="persona-meta">
              <span>작성자: {persona.authorName}</span>
            </div>
          </div>

          <Chat systemMessage={persona.systemMessage} />
        </>
      )}
    </div>
  );
}
