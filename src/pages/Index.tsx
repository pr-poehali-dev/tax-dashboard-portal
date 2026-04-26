import { useState } from 'react';
import LoginPage from '@/components/LoginPage';
import Dashboard from '@/components/Dashboard';

export interface UserSession {
  token: string;
  user_id: number;
  client_id: string;
  full_name: string;
  inn: string;
}

const Index = () => {
  const [session, setSession] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem('tax_session');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (s: UserSession) => {
    localStorage.setItem('tax_session', JSON.stringify(s));
    setSession(s);
  };

  const handleLogout = () => {
    localStorage.removeItem('tax_session');
    setSession(null);
  };

  if (!session) return <LoginPage onLogin={handleLogin} />;
  return <Dashboard session={session} onLogout={handleLogout} />;
};

export default Index;
