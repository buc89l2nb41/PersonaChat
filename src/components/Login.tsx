import { useState } from 'react';
import pb, { COLLECTIONS } from '../lib/pocketbase';

interface LoginProps {
  onSuccess: () => void;
  onSwitchToSignup: () => void;
}

export default function Login({ onSuccess, onSwitchToSignup }: LoginProps) {
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      // 커스텀 users 컬렉션 사용 (PocketBaseBoard와 분리)
      await pb.collection(COLLECTIONS.USERS).authWithPassword(email, password);
      onSuccess();
    } catch (error: any) {
      alert('로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h2>로그인</h2>
      <form onSubmit={handleLogin}>
        <div className="form-group">
          <label htmlFor="email">이메일</label>
          <input
            type="email"
            id="email"
            name="email"
            required
            placeholder="이메일을 입력하세요"
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">비밀번호</label>
          <input
            type="password"
            id="password"
            name="password"
            required
            placeholder="비밀번호를 입력하세요"
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
      
      <div className="auth-switch">
        <p>계정이 없으신가요? <button type="button" onClick={onSwitchToSignup}>회원가입</button></p>
      </div>
    </div>
  );
}
