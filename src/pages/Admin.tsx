import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';

const ADMIN_URL = 'https://functions.poehali.dev/8350a22d-3a83-499b-a43c-72d06295b607';

interface User {
  id: number;
  client_id: string;
  full_name: string;
  inn: string | null;
  created_at: string;
  records_count: number;
}

const formatDate = (s: string) =>
  new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

const Admin = () => {
  const [password, setPassword] = useState(() => sessionStorage.getItem('admin_pwd') || '');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ client_id: '', password: '', full_name: '', inn: '' });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  const fetchUsers = useCallback(async (pwd: string) => {
    setLoading(true);
    const res = await fetch(ADMIN_URL, { headers: { 'X-Admin-Password': pwd } });
    const data = await res.json();
    setLoading(false);
    return { ok: res.ok, data };
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const { ok, data } = await fetchUsers(password);
    setAuthLoading(false);
    if (!ok) {
      setAuthError('Неверный пароль');
    } else {
      sessionStorage.setItem('admin_pwd', password);
      setUsers(data.users || []);
      setAuthed(true);
    }
  };

  const refresh = useCallback(async () => {
    const { data } = await fetchUsers(password);
    setUsers(data.users || []);
  }, [password, fetchUsers]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    const res = await fetch(ADMIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setFormError(data.error || 'Ошибка');
    } else {
      setFormSuccess(`Клиент ${form.client_id} успешно добавлен`);
      setForm({ client_id: '', password: '', full_name: '', inn: '' });
      refresh();
    }
  };

  const handleDelete = async (user: User) => {
    setDeletingId(user.id);
    await fetch(ADMIN_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
      body: JSON.stringify({ user_id: user.id }),
    });
    setDeletingId(null);
    setConfirmDelete(null);
    refresh();
  };

  // Страница входа
  if (!authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-10 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 border border-[hsl(var(--primary))] mb-6">
              <Icon name="ShieldCheck" size={20} className="text-[hsl(var(--primary))]" />
            </div>
            <h1 className="font-display text-3xl font-medium text-foreground">Панель управления</h1>
            <p className="mt-2 text-muted-foreground text-xs uppercase tracking-widest">Только для администратора</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">Пароль администратора</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-card border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                required
                disabled={authLoading}
              />
            </div>
            {authError && (
              <div className="flex items-center gap-2 text-destructive text-xs py-2 border-l-2 border-destructive pl-3">
                <Icon name="AlertCircle" size={14} />
                {authError}
              </div>
            )}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-3 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {authLoading ? 'Проверка...' : 'Войти'}
            </button>
          </form>
          <div className="text-center mt-6">
            <a href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest">
              ← Вернуться на сайт
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Шапка */}
      <header className="border-b border-border px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="ShieldCheck" size={18} className="text-[hsl(var(--primary))]" />
          <div>
            <h1 className="font-display text-2xl text-foreground">Управление клиентами</h1>
            <p className="text-muted-foreground text-xs mt-0.5 uppercase tracking-widest">Панель администратора</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground font-mono">Клиентов: {users.length}</span>
          <a
            href="/"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
          >
            <Icon name="ExternalLink" size={13} />
            Кабинет
          </a>
          <button
            onClick={() => { sessionStorage.removeItem('admin_pwd'); setAuthed(false); }}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
          >
            <Icon name="LogOut" size={13} />
            Выйти
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-8 space-y-8">
        {/* Форма добавления */}
        <div className="border border-border bg-card p-6">
          <h2 className="font-sans text-xs uppercase tracking-widest text-muted-foreground mb-5 flex items-center gap-2">
            <Icon name="UserPlus" size={14} />
            Добавить нового клиента
          </h2>
          <form onSubmit={handleAddUser} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">ID клиента *</label>
              <input
                value={form.client_id}
                onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
                placeholder="Например: CLIENT002"
                className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors font-mono"
                required
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">Пароль для клиента *</label>
              <input
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="Придумайте пароль"
                className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                required
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">ФИО *</label>
              <input
                value={form.full_name}
                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="Фамилия Имя Отчество"
                className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                required
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">ИНН</label>
              <input
                value={form.inn}
                onChange={e => setForm(p => ({ ...p, inn: e.target.value }))}
                placeholder="Необязательно"
                className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors font-mono"
                disabled={submitting}
              />
            </div>

            <div className="col-span-2 flex items-center gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? 'Добавление...' : 'Добавить клиента'}
              </button>
              {formError && (
                <div className="flex items-center gap-2 text-destructive text-xs border-l-2 border-destructive pl-3">
                  <Icon name="AlertCircle" size={14} />
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="flex items-center gap-2 text-[hsl(var(--primary))] text-xs border-l-2 border-[hsl(var(--primary))] pl-3">
                  <Icon name="CheckCircle" size={14} />
                  {formSuccess}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Список клиентов */}
        <div>
          <h2 className="font-sans text-xs uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
            <Icon name="Users" size={14} />
            Все клиенты
          </h2>

          {loading ? (
            <div className="text-muted-foreground text-sm py-12 text-center border border-border">Загрузка...</div>
          ) : users.length === 0 ? (
            <div className="text-muted-foreground text-sm py-12 text-center border border-border">Клиентов пока нет</div>
          ) : (
            <div className="border border-border overflow-hidden">
              {/* Заголовок таблицы */}
              <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-[hsl(var(--muted))] border-b border-border">
                <div className="col-span-2 text-xs uppercase tracking-widest text-muted-foreground">ID</div>
                <div className="col-span-4 text-xs uppercase tracking-widest text-muted-foreground">ФИО</div>
                <div className="col-span-2 text-xs uppercase tracking-widest text-muted-foreground">ИНН</div>
                <div className="col-span-2 text-xs uppercase tracking-widest text-muted-foreground">Добавлен</div>
                <div className="col-span-1 text-xs uppercase tracking-widest text-muted-foreground text-center">Записей</div>
                <div className="col-span-1" />
              </div>

              {users.map((user, idx) => (
                <div
                  key={user.id}
                  className={`grid grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-accent transition-colors ${idx !== users.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <div className="col-span-2">
                    <span className="font-mono text-sm text-[hsl(var(--primary))]">{user.client_id}</span>
                  </div>
                  <div className="col-span-4">
                    <p className="text-sm text-foreground">{user.full_name}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="font-mono text-xs text-muted-foreground">{user.inn || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">{formatDate(user.created_at)}</span>
                  </div>
                  <div className="col-span-1 text-center">
                    <span className="font-mono text-sm text-foreground">{user.records_count}</span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={() => setConfirmDelete(user)}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                      title="Удалить клиента"
                    >
                      <Icon name="Trash2" size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Модалка подтверждения удаления */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="bg-card border border-border p-8 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="AlertTriangle" size={20} className="text-destructive shrink-0" />
              <h3 className="font-display text-xl text-foreground">Удалить клиента?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Клиент <span className="text-foreground font-medium">{confirmDelete.full_name}</span>
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              ID: <span className="font-mono text-foreground">{confirmDelete.client_id}</span>
            </p>
            <p className="text-xs text-destructive border-l-2 border-destructive pl-3 mb-6">
              Данное действие нельзя отменить. Все данные клиента будут сохранены в базе.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deletingId === confirmDelete.id}
                className="flex-1 py-3 bg-destructive text-destructive-foreground text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deletingId === confirmDelete.id ? 'Удаление...' : 'Удалить'}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 border border-border text-muted-foreground text-xs uppercase tracking-widest hover:text-foreground hover:border-foreground transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
