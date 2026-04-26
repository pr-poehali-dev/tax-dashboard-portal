import { useState, useCallback } from 'react';
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

interface TaxRecord {
  id: number;
  tax_type: string;
  period: string;
  amount: number;
  status: string;
  due_date: string | null;
  description: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  paid: 'Оплачен',
  overdue: 'Просрочен',
  cancelled: 'Отменён',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  paid: 'text-green-700 bg-green-50 border-green-200',
  overdue: 'text-red-600 bg-red-50 border-red-200',
  cancelled: 'text-muted-foreground bg-muted border-border',
};

const formatDate = (s: string) =>
  new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

const formatMoney = (n: number) =>
  n.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });

const EMPTY_FORM = { tax_type: '', period: '', amount: '', status: 'pending', due_date: '', description: '' };

const Admin = () => {
  const [password, setPassword] = useState(() => sessionStorage.getItem('admin_pwd') || '');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const [userForm, setUserForm] = useState({ client_id: '', password: '', full_name: '', inn: '' });
  const [userFormError, setUserFormError] = useState('');
  const [userFormSuccess, setUserFormSuccess] = useState('');
  const [userSubmitting, setUserSubmitting] = useState(false);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [records, setRecords] = useState<TaxRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [taxForm, setTaxForm] = useState(EMPTY_FORM);
  const [taxFormError, setTaxFormError] = useState('');
  const [taxFormSuccess, setTaxFormSuccess] = useState('');
  const [taxSubmitting, setTaxSubmitting] = useState(false);

  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  const authHeaders = useCallback(() => ({ 'X-Admin-Password': password }), [password]);

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

  const refreshUsers = useCallback(async () => {
    const { data } = await fetchUsers(password);
    setUsers(data.users || []);
  }, [password, fetchUsers]);

  const fetchRecords = useCallback(async (userId: number) => {
    setRecordsLoading(true);
    const res = await fetch(`${ADMIN_URL}?user_id=${userId}`, { headers: authHeaders() });
    const data = await res.json();
    setRecordsLoading(false);
    setRecords(data.records || []);
  }, [authHeaders]);

  const openUser = (user: User) => {
    setSelectedUser(user);
    setTaxForm(EMPTY_FORM);
    setTaxFormError('');
    setTaxFormSuccess('');
    fetchRecords(user.id);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError('');
    setUserFormSuccess('');
    setUserSubmitting(true);
    const res = await fetch(ADMIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(userForm),
    });
    const data = await res.json();
    setUserSubmitting(false);
    if (!res.ok) {
      setUserFormError(data.error || 'Ошибка');
    } else {
      setUserFormSuccess(`Клиент ${userForm.client_id} добавлен`);
      setUserForm({ client_id: '', password: '', full_name: '', inn: '' });
      refreshUsers();
    }
  };

  const handleAddTax = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setTaxFormError('');
    setTaxFormSuccess('');
    setTaxSubmitting(true);
    const res = await fetch(ADMIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Action': 'add_tax_record' },
      body: JSON.stringify({ ...taxForm, user_id: selectedUser.id, amount: parseFloat(taxForm.amount) }),
    });
    const data = await res.json();
    setTaxSubmitting(false);
    if (!res.ok) {
      setTaxFormError(data.error || 'Ошибка');
    } else {
      setTaxFormSuccess('Запись добавлена');
      setTaxForm(EMPTY_FORM);
      fetchRecords(selectedUser.id);
      refreshUsers();
    }
  };

  const handleUpdateStatus = async (recordId: number, newStatus: string) => {
    setUpdatingStatusId(recordId);
    await fetch(ADMIN_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ record_id: recordId, status: newStatus }),
    });
    setUpdatingStatusId(null);
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, status: newStatus } : r));
  };

  const handleDeleteRecord = async (recordId: number) => {
    setDeletingRecordId(recordId);
    await fetch(ADMIN_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Action': 'delete_tax_record' },
      body: JSON.stringify({ record_id: recordId }),
    });
    setDeletingRecordId(null);
    if (selectedUser) fetchRecords(selectedUser.id);
    refreshUsers();
  };

  const handleDeleteUser = async (user: User) => {
    setDeletingUserId(user.id);
    await fetch(ADMIN_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user_id: user.id }),
    });
    setDeletingUserId(null);
    setConfirmDeleteUser(null);
    if (selectedUser?.id === user.id) setSelectedUser(null);
    refreshUsers();
  };

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
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-8 py-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Icon name="ShieldCheck" size={18} className="text-[hsl(var(--primary))]" />
          <div>
            <h1 className="font-display text-2xl text-foreground">Панель управления</h1>
            <p className="text-muted-foreground text-xs mt-0.5 uppercase tracking-widest">Администратор</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest">
            <Icon name="ExternalLink" size={13} />
            Кабинет
          </a>
          <button
            onClick={() => { sessionStorage.removeItem('admin_pwd'); setAuthed(false); setSelectedUser(null); }}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
          >
            <Icon name="LogOut" size={13} />
            Выйти
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 73px)' }}>
        {/* Левая колонка */}
        <div className="w-80 border-r border-border flex flex-col shrink-0 overflow-hidden">
          <div className="p-5 border-b border-border shrink-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
              <Icon name="UserPlus" size={13} />
              Новый клиент
            </p>
            <form onSubmit={handleAddUser} className="space-y-3">
              <input
                value={userForm.client_id}
                onChange={e => setUserForm(p => ({ ...p, client_id: e.target.value }))}
                placeholder="ID клиента *"
                className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors font-mono"
                required disabled={userSubmitting}
              />
              <input
                value={userForm.password}
                onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                placeholder="Пароль *"
                className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                required disabled={userSubmitting}
              />
              <input
                value={userForm.full_name}
                onChange={e => setUserForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="ФИО *"
                className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                required disabled={userSubmitting}
              />
              <input
                value={userForm.inn}
                onChange={e => setUserForm(p => ({ ...p, inn: e.target.value }))}
                placeholder="ИНН"
                className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors font-mono"
                disabled={userSubmitting}
              />
              {userFormError && <p className="text-destructive text-xs border-l-2 border-destructive pl-2">{userFormError}</p>}
              {userFormSuccess && <p className="text-[hsl(var(--primary))] text-xs border-l-2 border-[hsl(var(--primary))] pl-2">{userFormSuccess}</p>}
              <button
                type="submit" disabled={userSubmitting}
                className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-2.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {userSubmitting ? 'Добавление...' : 'Добавить'}
              </button>
            </form>
          </div>

          <div className="flex-1 overflow-y-auto">
            <p className="text-xs uppercase tracking-widest text-muted-foreground px-5 py-3 border-b border-border flex items-center justify-between sticky top-0 bg-background z-10">
              <span className="flex items-center gap-2"><Icon name="Users" size={13} />Клиенты</span>
              <span className="font-mono">{users.length}</span>
            </p>
            {loading ? (
              <div className="text-muted-foreground text-xs text-center py-8">Загрузка...</div>
            ) : users.length === 0 ? (
              <div className="text-muted-foreground text-xs text-center py-8">Клиентов пока нет</div>
            ) : (
              users.map(user => (
                <div
                  key={user.id}
                  onClick={() => openUser(user)}
                  className={`px-5 py-4 border-b border-border cursor-pointer transition-colors hover:bg-accent ${selectedUser?.id === user.id ? 'bg-accent border-l-2 border-l-[hsl(var(--primary))]' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{user.client_id}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5">{user.records_count}</span>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDeleteUser(user); }}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Icon name="Trash2" size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Правая колонка */}
        <div className="flex-1 overflow-y-auto">
          {!selectedUser ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Icon name="MousePointerClick" size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Выберите клиента из списка слева</p>
              </div>
            </div>
          ) : (
            <div className="p-8 space-y-8 max-w-3xl">
              <div>
                <h2 className="font-display text-2xl text-foreground">{selectedUser.full_name}</h2>
                <div className="flex items-center gap-4 mt-1">
                  <span className="font-mono text-xs text-[hsl(var(--primary))]">{selectedUser.client_id}</span>
                  {selectedUser.inn && <span className="font-mono text-xs text-muted-foreground">ИНН: {selectedUser.inn}</span>}
                  <span className="text-xs text-muted-foreground">С {formatDate(selectedUser.created_at)}</span>
                </div>
              </div>

              {/* Форма налога */}
              <div className="border border-border bg-card p-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-5 flex items-center gap-2">
                  <Icon name="Plus" size={13} />
                  Добавить налоговую запись
                </p>
                <form onSubmit={handleAddTax} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">Тип налога *</label>
                      <input
                        value={taxForm.tax_type}
                        onChange={e => setTaxForm(p => ({ ...p, tax_type: e.target.value }))}
                        placeholder="НДС, НДФЛ, УСН..."
                        className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                        required disabled={taxSubmitting}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">Период *</label>
                      <input
                        value={taxForm.period}
                        onChange={e => setTaxForm(p => ({ ...p, period: e.target.value }))}
                        placeholder="Q1 2024, Март 2024..."
                        className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                        required disabled={taxSubmitting}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">Сумма (₽) *</label>
                      <input
                        type="number"
                        value={taxForm.amount}
                        onChange={e => setTaxForm(p => ({ ...p, amount: e.target.value }))}
                        placeholder="0"
                        className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors font-mono"
                        required disabled={taxSubmitting}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">Статус</label>
                      <select
                        value={taxForm.status}
                        onChange={e => setTaxForm(p => ({ ...p, status: e.target.value }))}
                        className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                        disabled={taxSubmitting}
                      >
                        <option value="pending">Ожидает оплаты</option>
                        <option value="paid">Оплачен</option>
                        <option value="overdue">Просрочен</option>
                        <option value="cancelled">Отменён</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">Срок оплаты</label>
                      <input
                        type="date"
                        value={taxForm.due_date}
                        onChange={e => setTaxForm(p => ({ ...p, due_date: e.target.value }))}
                        className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                        disabled={taxSubmitting}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">Комментарий</label>
                      <input
                        value={taxForm.description}
                        onChange={e => setTaxForm(p => ({ ...p, description: e.target.value }))}
                        placeholder="Необязательно"
                        className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                        disabled={taxSubmitting}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      type="submit" disabled={taxSubmitting}
                      className="px-8 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {taxSubmitting ? 'Сохранение...' : 'Добавить запись'}
                    </button>
                    {taxFormError && <p className="text-destructive text-xs border-l-2 border-destructive pl-2">{taxFormError}</p>}
                    {taxFormSuccess && (
                      <p className="text-[hsl(var(--primary))] text-xs border-l-2 border-[hsl(var(--primary))] pl-2 flex items-center gap-1">
                        <Icon name="CheckCircle" size={13} />{taxFormSuccess}
                      </p>
                    )}
                  </div>
                </form>
              </div>

              {/* Список записей */}
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                  <Icon name="FileText" size={13} />
                  Налоговые записи
                  <span className="font-mono ml-auto">{records.length}</span>
                </p>
                {recordsLoading ? (
                  <div className="text-muted-foreground text-sm text-center py-10 border border-border">Загрузка...</div>
                ) : records.length === 0 ? (
                  <div className="text-muted-foreground text-sm text-center py-10 border border-border">Записей пока нет — добавьте первую выше</div>
                ) : (
                  <div className="border border-border overflow-hidden">
                    {records.map((rec, idx) => (
                      <div key={rec.id} className={`px-5 py-4 flex items-center gap-4 hover:bg-accent transition-colors ${idx !== records.length - 1 ? 'border-b border-border' : ''}`}>
                        <div className="flex-1 min-w-0 grid grid-cols-4 gap-3 items-center">
                          <div>
                            <p className="text-sm text-foreground font-medium">{rec.tax_type}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{rec.period}</p>
                          </div>
                          <div>
                            <p className="text-sm font-mono text-foreground">{formatMoney(rec.amount)}</p>
                            {rec.due_date && <p className="text-xs text-muted-foreground mt-0.5">до {formatDate(rec.due_date)}</p>}
                          </div>
                          <div>
                            <select
                              value={rec.status}
                              disabled={updatingStatusId === rec.id}
                              onChange={e => handleUpdateStatus(rec.id, e.target.value)}
                              className={`text-xs px-2 py-1 border cursor-pointer focus:outline-none disabled:opacity-50 ${STATUS_COLORS[rec.status] || STATUS_COLORS.pending}`}
                            >
                              <option value="pending">Ожидает</option>
                              <option value="paid">Оплачен</option>
                              <option value="overdue">Просрочен</option>
                              <option value="cancelled">Отменён</option>
                            </select>
                          </div>
                          <div>
                            {rec.description && <p className="text-xs text-muted-foreground truncate">{rec.description}</p>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteRecord(rec.id)}
                          disabled={deletingRecordId === rec.id}
                          className="p-2 text-muted-foreground hover:text-destructive transition-colors shrink-0 disabled:opacity-40"
                        >
                          <Icon name="Trash2" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Модалка удаления клиента */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="bg-card border border-border p-8 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="AlertTriangle" size={20} className="text-destructive shrink-0" />
              <h3 className="font-display text-xl text-foreground">Удалить клиента?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              <span className="text-foreground font-medium">{confirmDeleteUser.full_name}</span>
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              ID: <span className="font-mono text-foreground">{confirmDeleteUser.client_id}</span>
            </p>
            <p className="text-xs text-destructive border-l-2 border-destructive pl-3 mb-6">
              Клиент и все его налоговые записи будут удалены. Действие нельзя отменить.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDeleteUser(confirmDeleteUser)}
                disabled={deletingUserId === confirmDeleteUser.id}
                className="flex-1 py-3 bg-destructive text-destructive-foreground text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deletingUserId === confirmDeleteUser.id ? 'Удаление...' : 'Удалить'}
              </button>
              <button
                onClick={() => setConfirmDeleteUser(null)}
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