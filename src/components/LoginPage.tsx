import { useState } from 'react';
import { UserSession } from '@/pages/Index';
import Icon from '@/components/ui/icon';

const AUTH_URL = 'https://functions.poehali.dev/a12aaa0b-63c2-4796-b1de-215c025513ca';

interface Props {
  onLogin: (s: UserSession) => void;
}

const LoginPage = ({ onLogin }: Props) => {
  const [clientId, setClientId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка авторизации');
      } else {
        onLogin(data);
      }
    } catch {
      setError('Ошибка соединения. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Логотип */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 border border-[hsl(var(--primary))] mb-6">
            <Icon name="Landmark" size={20} className="text-[hsl(var(--primary))]" />
          </div>
          <h1 className="font-display text-3xl font-medium text-foreground tracking-wide">
            Налоговый кабинет
          </h1>
          <p className="mt-2 text-muted-foreground text-xs uppercase tracking-widest font-sans">
            Личный финансовый портал
          </p>
        </div>

        {/* Форма */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Идентификатор клиента
            </label>
            <input
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="Например: TEST001"
              className="w-full bg-card border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors font-mono"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-card border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-xs py-2 border-l-2 border-destructive pl-3">
              <Icon name="AlertCircle" size={14} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-3 text-xs uppercase tracking-widest font-semibold font-sans hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
          >
            {loading ? 'Проверка...' : 'Войти в кабинет'}
          </button>
        </form>

        <p className="text-center text-muted-foreground/40 text-xs mt-8 tracking-wider">
          Доступ только для авторизованных клиентов
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
