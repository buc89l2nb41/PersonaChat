import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import pb from './lib/pocketbase';
import Login from './components/Login';
import Signup from './components/Signup';
import PersonaList from './components/PersonaList';
import PersonaDetail from './components/PersonaDetail';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    setIsAuthenticated(pb.authStore.isValid);
    setUser(pb.authStore.model);

    pb.authStore.onChange((token, model) => {
      setIsAuthenticated(!!token);
      setUser(model);
      if (token) {
        setShowAuth(false);
      }
    });
  }, []);

  const handleLogout = () => {
    pb.authStore.clear();
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Persona Chat</h1>
        {isAuthenticated && user ? (
          <div className="user-info">
            <span>안녕하세요, {user.email}님</span>
            <button onClick={handleLogout}>로그아웃</button>
          </div>
        ) : (
          <div className="user-info">
            <button onClick={() => { setShowAuth(true); setShowSignup(false); }}>
              로그인
            </button>
            <button onClick={() => { setShowAuth(true); setShowSignup(true); }}>
              회원가입
            </button>
          </div>
        )}
      </header>

      <main className="app-main">
        {showAuth && !isAuthenticated && (
          <div className="auth-overlay">
            {showSignup ? (
              <Signup 
                onSuccess={() => {
                  setIsAuthenticated(true);
                  setShowAuth(false);
                }} 
                onSwitchToLogin={() => setShowSignup(false)}
              />
            ) : (
              <Login 
                onSuccess={() => {
                  setIsAuthenticated(true);
                  setShowAuth(false);
                }} 
                onSwitchToSignup={() => setShowSignup(true)}
              />
            )}
            <button 
              className="close-auth" 
              onClick={() => setShowAuth(false)}
            >
              닫기
            </button>
          </div>
        )}
        
        <Routes>
          <Route path="/" element={<PersonaList />} />
          <Route path="/persona/:id" element={<PersonaDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
