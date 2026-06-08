import { useState } from 'react';
import { UserSession } from '@/pages/Index';
import Icon from '@/components/ui/icon';

const AUTH_URL = 'https://functions.poehali.dev/a12aaa0b-63c2-4796-b1de-215c025513ca';

interface Props { onLogin: (s: UserSession) => void; }

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login form
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Register form
  const [regId, setRegId] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regPass2, setRegPass2] = useState('');
  const [regName, setRegName] = useState('');
  const [regInfo, setRegInfo] = useState('');
  const [regErr, setRegErr] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr(''); setLoginLoading(true);
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', client_id: loginId.trim(), password: loginPass }),
      });
      const d = await res.json();
      if (!res.ok) setLoginErr(d.error || 'Ошибка входа');
      else onLogin(d);
    } catch { setLoginErr('Ошибка соединения. Попробуйте позже.'); }
    setLoginLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegErr('');
    if (regPass !== regPass2) { setRegErr('Пароли не совпадают'); return; }
    if (regPass.length < 6) { setRegErr('Пароль минимум 6 символов'); return; }
    setRegLoading(true);
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', client_id: regId.trim(), password: regPass, full_name: regName.trim(), inn: regInfo.trim() }),
      });
      const d = await res.json();
      if (!res.ok) setRegErr(d.error || 'Ошибка регистрации');
      else onLogin(d);
    } catch { setRegErr('Ошибка соединения. Попробуйте позже.'); }
    setRegLoading(false);
  };

  const inputCls = 'w-full bg-card border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Лого */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 border border-[hsl(var(--primary))]/40 mb-5">
            <Icon name="LayoutDashboard" size={22} className="text-[hsl(var(--primary))]" />
          </div>
          <h1 className="font-display text-3xl font-medium text-foreground">Личный кабинет</h1>
          <p className="mt-1.5 text-muted-foreground text-xs uppercase tracking-widest">Управление · Финансы · Магазин</p>
        </div>

        {/* Переключатель */}
        <div className="flex border border-border mb-6">
          <button onClick={() => setMode('login')}
            className={`flex-1 py-2.5 text-xs uppercase tracking-widest font-medium transition-colors ${mode === 'login' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-muted-foreground hover:text-foreground'}`}>
            Войти
          </button>
          <button onClick={() => setMode('register')}
            className={`flex-1 py-2.5 text-xs uppercase tracking-widest font-medium transition-colors ${mode === 'register' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-muted-foreground hover:text-foreground'}`}>
            Регистрация
          </button>
        </div>

        {/* Форма входа */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">Логин</label>
              <input value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="Ваш логин" className={inputCls} required disabled={loginLoading} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">Пароль</label>
              <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="••••••••" className={inputCls} required disabled={loginLoading} />
            </div>
            {loginErr && (
              <div className="flex items-center gap-2 text-destructive text-xs py-2 border-l-2 border-destructive pl-3">
                <Icon name="AlertCircle" size={13} />{loginErr}
              </div>
            )}
            <button type="submit" disabled={loginLoading}
              className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-3 text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loginLoading ? 'Вход...' : 'Войти'}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Нет аккаунта?{' '}
              <button type="button" onClick={() => setMode('register')} className="text-[hsl(var(--primary))] hover:opacity-80">
                Зарегистрироваться
              </button>
            </p>
          </form>
        )}

        {/* Форма регистрации */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">Логин *</label>
              <input value={regId} onChange={e => setRegId(e.target.value)} placeholder="Только буквы и цифры" className={`${inputCls} font-mono`} required disabled={regLoading} />
              <p className="text-[10px] text-muted-foreground mt-1">Используется для входа в систему</p>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">Имя / Название *</label>
              <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="Иванов Иван Иванович" className={inputCls} required disabled={regLoading} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">Пароль *</label>
              <input type="password" value={regPass} onChange={e => setRegPass(e.target.value)} placeholder="Минимум 6 символов" className={inputCls} required disabled={regLoading} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">Повторить пароль *</label>
              <input type="password" value={regPass2} onChange={e => setRegPass2(e.target.value)} placeholder="••••••••" className={inputCls} required disabled={regLoading} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">ИНН / Доп. информация</label>
              <input value={regInfo} onChange={e => setRegInfo(e.target.value)} placeholder="Необязательно" className={inputCls} disabled={regLoading} />
            </div>
            {regErr && (
              <div className="flex items-center gap-2 text-destructive text-xs py-2 border-l-2 border-destructive pl-3">
                <Icon name="AlertCircle" size={13} />{regErr}
              </div>
            )}
            <button type="submit" disabled={regLoading}
              className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-3 text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
              {regLoading ? 'Создаём аккаунт...' : 'Создать аккаунт'}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Уже есть аккаунт?{' '}
              <button type="button" onClick={() => setMode('login')} className="text-[hsl(var(--primary))] hover:opacity-80">
                Войти
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
