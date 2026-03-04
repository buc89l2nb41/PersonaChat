import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import pb, { COLLECTIONS } from '../lib/pocketbase';
import type { Persona } from '../types';
import PersonaForm from './PersonaForm';

const PAGE_SIZE = 12;

function mapRecordToPersona(item: any): Persona {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    systemMessage: item.systemMessage,
    author: item.author,
    authorName: item.expand?.author?.name || item.expand?.author?.email || '알 수 없음',
    created: item.created,
    updated: item.updated,
  };
}

export default function PersonaList() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const isAuthenticated = pb.authStore.isValid;

  const loadPersonas = useCallback(async (pageNum: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const records = await pb.collection(COLLECTIONS.PERSONAS).getList(pageNum, PAGE_SIZE, {
        sort: '-created',
        expand: 'author',
      });

      const personasWithAuthor = records.items.map(mapRecordToPersona);

      if (append) {
        setPersonas((prev) => [...prev, ...personasWithAuthor]);
      } else {
        setPersonas(personasWithAuthor);
      }
      setPage(pageNum);
      setHasMore(pageNum < records.totalPages);
    } catch (error: any) {
      console.error('Persona 로드 실패:', error);
      const errorMessage =
        error?.message || error?.data?.message || '알 수 없는 오류';

      if (typeof errorMessage === 'string' && errorMessage.includes('autocancelled')) {
        return;
      }

      if (error?.status === 401 || error?.status === 403) {
        console.warn('Persona 목록을 불러오려면 백엔드 권한 설정이 필요할 수 있습니다.');
        if (!append) setPersonas([]);
        return;
      }

      if (!append) {
        alert(`Persona 목록을 불러올 수 없습니다: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPersonas(1, false);
  }, [loadPersonas]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loadPersonas(page + 1, true);
      },
      { root: null, rootMargin: '200px', threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, loadPersonas]);

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
            setPersonas([]);
            setPage(1);
            setHasMore(true);
            loadPersonas(1, false);
          }} 
        />
      )}

      {!isAuthenticated && (
        <div className="login-prompt">
          <p>Persona를 만들려면 로그인이 필요합니다.</p>
        </div>
      )}

      {personas.length === 0 && !loading ? (
        <div className="empty-list">
          <p>아직 생성된 Persona가 없습니다.</p>
        </div>
      ) : (
        <>
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
          <div ref={sentinelRef} className="persona-list-sentinel" aria-hidden="true" />
          {loadingMore && (
            <div className="persona-list-loading-more" role="status" aria-label="더 불러오는 중">
              <span className="persona-list-spinner" />
              <span>더 불러오는 중...</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
