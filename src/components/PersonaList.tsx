import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import pb, { COLLECTIONS } from '../lib/pocketbase';
import type { Persona } from '../types';
import PersonaForm from './PersonaForm';

export default function PersonaList() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();
  const isAuthenticated = pb.authStore.isValid;

  useEffect(() => {
    loadPersonas();
  }, []);

  const loadPersonas = async () => {
    try {
      // 인증 없이도 읽기 가능하도록 설정
      // COLLECTIONS.PERSONAS 사용 (personachat_personas)
      const records = await pb.collection(COLLECTIONS.PERSONAS).getList(1, 50, {
        sort: '-created',
        expand: 'author',
      });

      const personasWithAuthor = records.items.map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        systemMessage: item.systemMessage,
        author: item.author,
        authorName: item.expand?.author?.name || item.expand?.author?.email || '알 수 없음',
        created: item.created,
        updated: item.updated,
      }));

      setPersonas(personasWithAuthor);
    } catch (error: any) {
      console.error('Persona 로드 실패:', error);
      const errorMessage =
        error?.message || error?.data?.message || '알 수 없는 오류';

      // PocketBase SDK auto-cancellation은 실제 오류가 아니므로 무시
      if (typeof errorMessage === 'string' && errorMessage.includes('autocancelled')) {
        return;
      }

      // 인증 오류인 경우에도 목록은 빈 배열로 표시 (에러 메시지 표시 안 함)
      // 백엔드 권한 설정 문제일 수 있으므로 콘솔에만 기록
      if (error?.status === 401 || error?.status === 403) {
        console.warn('Persona 목록을 불러오려면 백엔드 권한 설정이 필요할 수 있습니다.');
        setPersonas([]);
        return;
      }

      // 기타 오류는 사용자에게 알림
      alert(`Persona 목록을 불러올 수 없습니다: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">로딩 중...</div>;
  }

  return (
    <div className="persona-list-container">
      <div className="persona-list-header">
        <h2>Persona 목록</h2>
        {isAuthenticated && (
          <button 
            className="create-button" 
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? '취소' : 'Persona 만들기'}
          </button>
        )}
      </div>

      {showForm && isAuthenticated && (
        <PersonaForm 
          onSuccess={() => { 
            setShowForm(false);
            loadPersonas();
          }} 
        />
      )}

      {!isAuthenticated && (
        <div className="login-prompt">
          <p>Persona를 만들려면 로그인이 필요합니다.</p>
        </div>
      )}

      {personas.length === 0 ? (
        <div className="empty-list">
          <p>아직 생성된 Persona가 없습니다.</p>
        </div>
      ) : (
        <div className="personas-grid">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className="persona-card"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/persona/${persona.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/persona/${persona.id}`);
                }
              }}
            >
              <h3>{persona.name}</h3>
              {persona.description && (
                <p className="persona-description">{persona.description}</p>
              )}
              <div className="persona-meta">
                <span>{persona.authorName}</span>
                <span>{new Date(persona.created).toLocaleDateString('ko-KR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
