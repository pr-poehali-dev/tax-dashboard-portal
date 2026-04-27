import { useState, useCallback, useEffect, useRef } from 'react';
import Icon from '@/components/ui/icon';

const ADMIN_URL = 'https://functions.poehali.dev/8350a22d-3a83-499b-a43c-72d06295b607';
const SUPPORT_URL = 'https://functions.poehali.dev/c44f54ad-be34-4ae2-8daf-d5256223c92e';

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

interface Stats {
  paid_month: number;
  paid_year: number;
  paid_total: number;
  pending_total: number;
  overdue_total: number;
  clients_count: number;
  status_counts: Record<string, number>;
  unread_support: number;
  monthly: { month: string; total: number }[];
}

interface SupportMsg {
  id: number;
  author: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface Dialog {
  user_id: number;
  client_id: string;
  full_name: string;
  last_msg: string | null;
  last_at: string | null;
  unread: number;
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

const formatTime = (s: string) =>
  new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

const EMPTY_FORM = { tax_type: '', period: '', amount: '', status: 'pending', due_date: '', description: '' };

type AdminTab = 'dashboard' | 'clients' | 'support';

const Admin = () => {
  const [password, setPassword] = useState(() => sessionStorage.getItem('admin_pwd') || '');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [userForm, setUserForm] = useState({ client_id: '', password: '', full_name: '', inn: '' });
  const [userFormError, setUserFormError] = useState('');
  const [userFormSuccess, setUserFormSuccess] = useState('');
  const [userSubmitting, setUserSubmitting] = useState(false);

  // Selected user & records
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

  // Stats
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Support
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [dialogsLoading, setDialogsLoading] = useState(false);
  const [selectedDialog, setSelectedDialog] = useState<Dialog | null>(null);
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    const res = await fetch(`${ADMIN_URL}?action=stats`, { headers: authHeaders() });
    const data = await res.json();
    setStats(data);
    setStatsLoading(false);
  }, [authHeaders]);

  const fetchDialogs = useCallback(async () => {
    setDialogsLoading(true);
    const res = await fetch(SUPPORT_URL, { headers: authHeaders() });
    const data = await res.json();
    setDialogs(data.dialogs || []);
    setDialogsLoading(false);
  }, [authHeaders]);

  const fetchMessages = useCallback(async (userId: number) => {
    setMessagesLoading(true);
    const res = await fetch(`${SUPPORT_URL}?user_id=${userId}`, { headers: authHeaders() });
    const data = await res.json();
    setMessages(data.messages || []);
    setMessagesLoading(false);
    // После прочтения обновить счётчик
    setDialogs(prev => prev.map(d => d.user_id === userId ? { ...d, unread: 0 } : d));
    if (stats) setStats(prev => prev ? { ...prev, unread_support: Math.max(0, prev.unread_support - (dialogs.find(d => d.user_id === userId)?.unread || 0)) } : prev);
  }, [authHeaders, dialogs, stats]);

  const fetchRecords = useCallback(async (userId: number) => {
    setRecordsLoading(true);
    const res = await fetch(`${ADMIN_URL}?user_id=${userId}`, { headers: authHeaders() });
    const data = await res.json();
    setRecordsLoading(false);
    setRecords(data.records || []);
  }, [authHeaders]);

  useEffect(() => {
    if (authed && activeTab === 'dashboard') fetchStats();
    if (authed && activeTab === 'support') fetchDialogs();
  }, [authed, activeTab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openUser = (user: User) => {
    setSelectedUser(user);
    setTaxForm(EMPTY_FORM);
    setTaxFormError('');
    setTaxFormSuccess('');
    fetchRecords(user.id);
  };

  const openDialog = (dialog: Dialog) => {
    setSelectedDialog(dialog);
    fetchMessages(dialog.user_id);
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

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDialog || !replyText.trim()) return;
    setReplySending(true);
    await fetch(SUPPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ user_id: selectedDialog.user_id, message: replyText.trim() }),
    });
    setReplyText('');
    setReplySending(false);
    fetchMessages(selectedDialog.user_id);
  };

  const totalUnread = stats?.unread_support ?? dialogs.reduce((s, d) => s + d.unread, 0);

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
      {/* Header */}
      <header className="border-b border-border px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Icon name="ShieldCheck" size={18} className="text-[hsl(var(--primary))]" />
          <div>
            <h1 className="font-display text-2xl text-foreground">Панель управления</h1>
            <p className="text-muted-foreground text-xs mt-0.5 uppercase tracking-widest">Администратор</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Navigation tabs */}
          {([
            { id: 'dashboard', label: 'Дашборд', icon: 'LayoutDashboard' },
            { id: 'clients', label: 'Клиенты', icon: 'Users' },
            { id: 'support', label: 'Поддержка', icon: 'MessageSquare', badge: totalUnread },
          ] as { id: AdminTab; label: string; icon: string; badge?: number }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-widest font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <Icon name={tab.icon} size={13} />
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="ml-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
          <div className="w-px h-6 bg-border mx-2" />
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

      {/* ===================== DASHBOARD TAB ===================== */}
      {activeTab === 'dashboard' && (
        <div className="flex-1 overflow-auto p-8">
          {statsLoading ? (
            <div className="text-muted-foreground text-center py-20">Загрузка статистики...</div>
          ) : stats ? (
            <div className="max-w-5xl mx-auto space-y-8">
              {/* Главные метрики */}
              <div>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Оплачено налогов</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="border border-border p-6">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">За этот месяц</p>
                    <p className="font-display text-3xl text-[hsl(var(--primary))]">{formatMoney(stats.paid_month)}</p>
                  </div>
                  <div className="border border-border p-6">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">За этот год</p>
                    <p className="font-display text-3xl text-foreground">{formatMoney(stats.paid_year)}</p>
                  </div>
                  <div className="border border-border p-6">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">За всё время</p>
                    <p className="font-display text-3xl text-foreground">{formatMoney(stats.paid_total)}</p>
                  </div>
                </div>
              </div>

              {/* Дополнительные метрики */}
              <div className="grid grid-cols-4 gap-4">
                <div className="border border-border p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Клиентов</p>
                  <p className="font-display text-2xl text-foreground">{stats.clients_count}</p>
                </div>
                <div className="border border-border p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">К оплате</p>
                  <p className="font-display text-2xl text-yellow-600">{formatMoney(stats.pending_total)}</p>
                </div>
                <div className="border border-border p-5 border-l-2 border-l-destructive">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Просрочено</p>
                  <p className="font-display text-2xl text-destructive">{formatMoney(stats.overdue_total)}</p>
                </div>
                <div className="border border-border p-5 cursor-pointer hover:bg-accent transition-colors" onClick={() => setActiveTab('support')}>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Сообщений в поддержке</p>
                  <p className="font-display text-2xl text-foreground flex items-center gap-2">
                    {stats.unread_support}
                    {stats.unread_support > 0 && <span className="text-xs text-destructive font-sans">(новых)</span>}
                  </p>
                </div>
              </div>

              {/* Статусы записей */}
              <div>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Записи по статусам</h2>
                <div className="grid grid-cols-4 gap-3">
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <div key={key} className="border border-border p-4 flex items-center justify-between">
                      <span className={`text-xs px-2 py-1 border ${STATUS_COLORS[key]}`}>{label}</span>
                      <span className="font-mono text-foreground font-medium">{stats.status_counts[key] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* График по месяцам */}
              {stats.monthly.length > 0 && (
                <div>
                  <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Оплаты по месяцам</h2>
                  <div className="border border-border p-6">
                    <div className="flex items-end gap-2 h-32">
                      {(() => {
                        const maxVal = Math.max(...stats.monthly.map(m => m.total), 1);
                        return stats.monthly.map(m => (
                          <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group">
                            <div
                              className="w-full bg-[hsl(var(--primary))] opacity-80 group-hover:opacity-100 transition-opacity"
                              style={{ height: `${Math.max(4, (m.total / maxVal) * 100)}%` }}
                              title={formatMoney(m.total)}
                            />
                            <p className="text-[10px] text-muted-foreground">{m.month.slice(5)}</p>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={fetchStats}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
              >
                <Icon name="RefreshCw" size={12} />
                Обновить
              </button>
            </div>
          ) : (
            <div className="text-center py-20">
              <button onClick={fetchStats} className="text-xs uppercase tracking-widest text-[hsl(var(--primary))] hover:opacity-80">
                Загрузить статистику
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===================== CLIENTS TAB ===================== */}
      {activeTab === 'clients' && (
        <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 65px)' }}>
          {/* Левая колонка */}
          <div className="w-80 border-r border-border flex flex-col shrink-0 overflow-hidden">
            <div className="p-5 border-b border-border shrink-0">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                <Icon name="UserPlus" size={13} />
                Новый клиент
              </p>
              <form onSubmit={handleAddUser} className="space-y-3">
                {[
                  { key: 'client_id', label: 'ID клиента', placeholder: 'Логин', required: true },
                  { key: 'password', label: 'Пароль', placeholder: '••••••••', required: true, type: 'password' },
                  { key: 'full_name', label: 'ФИО', placeholder: 'Иванов Иван Иванович', required: true },
                  { key: 'inn', label: 'ИНН', placeholder: '000000000000', required: false },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-[10px] text-muted-foreground mb-1">{f.label}{f.required && ' *'}</label>
                    <input
                      type={f.type || 'text'}
                      value={(userForm as Record<string, string>)[f.key]}
                      onChange={e => setUserForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                      required={f.required}
                      disabled={userSubmitting}
                    />
                  </div>
                ))}
                {userFormError && <p className="text-destructive text-xs border-l-2 border-destructive pl-2">{userFormError}</p>}
                {userFormSuccess && <p className="text-[hsl(var(--primary))] text-xs border-l-2 border-[hsl(var(--primary))] pl-2">{userFormSuccess}</p>}
                <button
                  type="submit" disabled={userSubmitting}
                  className="w-full py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {userSubmitting ? 'Добавление...' : 'Добавить'}
                </button>
              </form>
            </div>

            {/* Список клиентов */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 border-b border-border sticky top-0 bg-background z-10">
                <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Icon name="Users" size={13} />
                  Клиенты
                  <span className="font-mono ml-auto">{users.length}</span>
                </p>
              </div>
              {loading ? (
                <div className="text-muted-foreground text-xs text-center py-8">Загрузка...</div>
              ) : users.length === 0 ? (
                <div className="text-muted-foreground text-xs text-center py-8">Нет клиентов</div>
              ) : (
                users.map(user => (
                  <div
                    key={user.id}
                    onClick={() => openUser(user)}
                    className={`px-4 py-3 border-b border-border cursor-pointer hover:bg-accent transition-colors flex items-center justify-between group ${selectedUser?.id === user.id ? 'bg-accent' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground font-medium truncate">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{user.client_id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{user.records_count} записей</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDeleteUser(user); }}
                      className="p-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <Icon name="Trash2" size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Правая колонка */}
          <div className="flex-1 overflow-y-auto p-8">
            {!selectedUser ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Icon name="MousePointerClick" size={32} className="mb-4 opacity-30" />
                <p className="text-sm">Выберите клиента слева</p>
              </div>
            ) : (
              <div className="max-w-3xl space-y-8">
                {/* Заголовок клиента */}
                <div className="border-b border-border pb-6">
                  <h2 className="font-display text-2xl text-foreground">{selectedUser.full_name}</h2>
                  <div className="flex gap-6 mt-2">
                    <p className="text-xs text-muted-foreground">ID: <span className="font-mono text-foreground">{selectedUser.client_id}</span></p>
                    {selectedUser.inn && <p className="text-xs text-muted-foreground">ИНН: <span className="font-mono text-foreground">{selectedUser.inn}</span></p>}
                    <p className="text-xs text-muted-foreground">Добавлен: <span className="text-foreground">{formatDate(selectedUser.created_at)}</span></p>
                  </div>
                </div>

                {/* Форма добавления записи */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                    <Icon name="Plus" size={13} />
                    Добавить налоговую запись
                  </p>
                  <form onSubmit={handleAddTax} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { key: 'tax_type', label: 'Тип налога *', placeholder: 'НДС, НДФЛ, УСН...', required: true },
                        { key: 'period', label: 'Период *', placeholder: 'Q1 2024, Март 2024...', required: true },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="block text-xs text-muted-foreground mb-1.5">{f.label}</label>
                          <input
                            value={(taxForm as Record<string, string>)[f.key]}
                            onChange={e => setTaxForm(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                            required={f.required} disabled={taxSubmitting}
                          />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1.5">Сумма (₽) *</label>
                        <input
                          type="number" value={taxForm.amount}
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
                          type="date" value={taxForm.due_date}
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
      )}

      {/* ===================== SUPPORT TAB ===================== */}
      {activeTab === 'support' && (
        <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 65px)' }}>
          {/* Список диалогов */}
          <div className="w-80 border-r border-border flex flex-col shrink-0 overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Icon name="MessageSquare" size={13} />
                Диалоги
              </p>
              <button onClick={fetchDialogs} className="text-muted-foreground hover:text-foreground transition-colors">
                <Icon name="RefreshCw" size={13} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {dialogsLoading ? (
                <div className="text-muted-foreground text-xs text-center py-8">Загрузка...</div>
              ) : dialogs.length === 0 ? (
                <div className="text-muted-foreground text-xs text-center py-12 px-4">
                  <Icon name="MessageSquare" size={24} className="mx-auto mb-3 opacity-30" />
                  Пока нет сообщений от клиентов
                </div>
              ) : (
                dialogs.map(dialog => (
                  <div
                    key={dialog.user_id}
                    onClick={() => openDialog(dialog)}
                    className={`px-4 py-3 border-b border-border cursor-pointer hover:bg-accent transition-colors ${selectedDialog?.user_id === dialog.user_id ? 'bg-accent' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground font-medium truncate">{dialog.full_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{dialog.client_id}</p>
                        {dialog.last_msg && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{dialog.last_msg}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {dialog.last_at && (
                          <p className="text-[10px] text-muted-foreground">{formatTime(dialog.last_at)}</p>
                        )}
                        {dialog.unread > 0 && (
                          <span className="inline-flex items-center justify-center w-5 h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full mt-1">
                            {dialog.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Чат */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedDialog ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <Icon name="MessageSquare" size={40} className="mb-4 opacity-20" />
                <p className="text-sm">Выберите диалог слева</p>
              </div>
            ) : (
              <>
                <div className="px-6 py-4 border-b border-border shrink-0">
                  <p className="text-foreground font-medium">{selectedDialog.full_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedDialog.client_id}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                  {messagesLoading ? (
                    <div className="text-muted-foreground text-sm text-center py-10">Загрузка сообщений...</div>
                  ) : messages.length === 0 ? (
                    <div className="text-muted-foreground text-sm text-center py-10">Нет сообщений</div>
                  ) : (
                    messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.author === 'admin' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-md px-4 py-2.5 ${
                          msg.author === 'admin'
                            ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                            : 'bg-accent text-foreground border border-border'
                        }`}>
                          <p className="text-sm leading-relaxed">{msg.message}</p>
                          <p className={`text-[10px] mt-1 ${msg.author === 'admin' ? 'text-[hsl(var(--primary-foreground))]/70' : 'text-muted-foreground'}`}>
                            {msg.author === 'admin' ? 'Вы' : selectedDialog.full_name} · {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendReply} className="p-4 border-t border-border flex gap-3 shrink-0">
                  <input
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Написать ответ..."
                    className="flex-1 bg-background border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                    disabled={replySending}
                  />
                  <button
                    type="submit"
                    disabled={replySending || !replyText.trim()}
                    className="px-6 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <Icon name="Send" size={14} />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

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
