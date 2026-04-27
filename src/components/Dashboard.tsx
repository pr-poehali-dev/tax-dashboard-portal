import { useState, useEffect, useRef } from 'react';
import { UserSession } from '@/pages/Index';
import Icon from '@/components/ui/icon';
import TaxRecords from '@/components/TaxRecords';
import TaxHistory from '@/components/TaxHistory';

const CABINET_URL = 'https://functions.poehali.dev/55da48e4-e0f4-4cea-ad0c-d80ea71302b9';
const HISTORY_URL = 'https://functions.poehali.dev/3ee6767d-9849-400d-b663-bcdb21b41844';
const SUPPORT_URL = 'https://functions.poehali.dev/c44f54ad-be34-4ae2-8daf-d5256223c92e';

interface Props {
  session: UserSession;
  onLogout: () => void;
}

export interface TaxRecord {
  id: number;
  tax_type: string;
  period: string;
  amount: number;
  status: string;
  due_date: string | null;
  description: string;
  created_at: string;
  comments: { id: number; author: string; comment: string; created_at: string }[];
}

export interface HistoryItem {
  id: number;
  operation_type: string;
  tax_type: string | null;
  amount: number | null;
  period: string | null;
  description: string;
  occurred_at: string;
}

interface SupportMsg {
  id: number;
  author: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

type Tab = 'overview' | 'taxes' | 'history' | 'support';

const Dashboard = ({ session, onLogout }: Props) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [records, setRecords] = useState<TaxRecord[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [supportMsgs, setSupportMsgs] = useState<SupportMsg[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportText, setSupportText] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [unreadFromAdmin, setUnreadFromAdmin] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const headers = { 'X-User-Id': String(session.user_id) };

  const fetchRecords = async () => {
    setLoadingRecords(true);
    const res = await fetch(CABINET_URL, { headers });
    const data = await res.json();
    setRecords(data.records || []);
    setLoadingRecords(false);
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    const res = await fetch(HISTORY_URL, { headers });
    const data = await res.json();
    setHistory(data.history || []);
    setLoadingHistory(false);
  };

  const fetchSupport = async () => {
    setSupportLoading(true);
    const res = await fetch(SUPPORT_URL, { headers });
    const data = await res.json();
    const msgs: SupportMsg[] = data.messages || [];
    setSupportMsgs(msgs);
    setUnreadFromAdmin(0);
    setSupportLoading(false);
  };

  const handleSendSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportText.trim()) return;
    setSupportSending(true);
    await fetch(SUPPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ message: supportText.trim() }),
    });
    setSupportText('');
    setSupportSending(false);
    fetchSupport();
  };

  useEffect(() => { fetchRecords(); }, []);
  useEffect(() => {
    if (activeTab === 'history' && history.length === 0) fetchHistory();
    if (activeTab === 'support') fetchSupport();
  }, [activeTab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [supportMsgs]);

  // Проверяем непрочитанные от администратора при загрузке
  useEffect(() => {
    (async () => {
      const res = await fetch(SUPPORT_URL, { headers });
      const data = await res.json();
      const msgs: SupportMsg[] = data.messages || [];
      const unread = msgs.filter(m => m.author === 'admin' && !m.is_read).length;
      setUnreadFromAdmin(unread);
      setSupportMsgs(msgs);
    })();
  }, []);

  const totalPaid = records.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
  const totalPending = records.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
  const formatMoney = (n: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
  const formatDate = (s: string) => new Date(s).toLocaleDateString('ru-RU');

  const formatTime = (s: string) =>
    new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const nav: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: 'overview', label: 'Обзор', icon: 'LayoutDashboard' },
    { id: 'taxes', label: 'Налоговые данные', icon: 'FileText' },
    { id: 'history', label: 'История операций', icon: 'History' },
    { id: 'support', label: 'Поддержка', icon: 'MessageSquare', badge: unreadFromAdmin },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[hsl(var(--sidebar-background))] border-r border-border flex flex-col shrink-0">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="Landmark" size={16} className="text-[hsl(var(--primary))]" />
            <span className="font-display text-lg text-foreground">Кабинет</span>
          </div>
          <p className="text-muted-foreground text-xs uppercase tracking-widest">Налоговый портал</p>
        </div>

        <nav className="flex-1 py-4">
          {nav.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`nav-item w-full text-left relative ${activeTab === item.id ? 'active' : ''}`}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
              {item.badge != null && item.badge > 0 && (
                <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="mb-3">
            <p className="text-foreground text-sm font-medium truncate">{session.full_name}</p>
            <p className="text-muted-foreground text-xs font-mono mt-0.5">ID: {session.client_id}</p>
            {session.inn && <p className="text-muted-foreground text-xs font-mono">ИНН: {session.inn}</p>}
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 text-muted-foreground hover:text-foreground text-xs uppercase tracking-widest transition-colors py-2"
          >
            <Icon name="LogOut" size={13} />
            Выйти
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="border-b border-border px-8 py-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl text-foreground">
              {nav.find(n => n.id === activeTab)?.label}
            </h2>
            <p className="text-muted-foreground text-xs mt-0.5">
              {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Налогоплательщик</p>
            <p className="text-sm text-foreground font-medium mt-0.5">{session.full_name}</p>
          </div>
        </header>

        <div className="p-8 section-enter">
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="stat-card">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Всего записей</p>
                  <p className="font-display text-4xl text-foreground">{records.length}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Оплачено</p>
                  <p className="font-display text-4xl text-[hsl(var(--primary))]">{formatMoney(totalPaid)}</p>
                </div>
                <div className="stat-card border-l-2 border-l-destructive">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">К оплате</p>
                  <p className="font-display text-4xl text-foreground">{formatMoney(totalPending)}</p>
                </div>
              </div>

              {/* Последние записи */}
              <div>
                <h3 className="font-sans text-xs uppercase tracking-widest text-muted-foreground mb-4">Последние налоговые записи</h3>
                {loadingRecords ? (
                  <div className="text-muted-foreground text-sm py-8 text-center">Загрузка...</div>
                ) : records.length === 0 ? (
                  <div className="text-muted-foreground text-sm py-8 text-center border border-border">Нет данных</div>
                ) : (
                  <div className="space-y-2">
                    {records.slice(0, 3).map(r => (
                      <div key={r.id} className="stat-card flex items-center justify-between">
                        <div>
                          <p className="text-foreground text-sm font-medium">{r.tax_type}</p>
                          <p className="text-muted-foreground text-xs mt-0.5">{r.period} · {r.due_date ? `до ${formatDate(r.due_date)}` : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-foreground text-sm">{formatMoney(r.amount)}</p>
                          <span className={`text-xs font-sans uppercase tracking-widest ${r.status === 'paid' ? 'text-[hsl(var(--primary))]' : 'text-destructive'}`}>
                            {r.status === 'paid' ? 'Оплачен' : 'Ожидает'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Последние события */}
              <div>
                <h3 className="font-sans text-xs uppercase tracking-widest text-muted-foreground mb-4">Последние события</h3>
                <div className="space-y-2">
                  {history.slice(0, 4).map(h => (
                    <div key={h.id} className="flex items-start gap-4 py-3 border-b border-border last:border-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{h.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(h.occurred_at)}</p>
                      </div>
                      {h.amount && <p className="font-mono text-sm text-foreground shrink-0">{formatMoney(h.amount)}</p>}
                    </div>
                  ))}
                  {history.length === 0 && (
                    <button onClick={() => { setActiveTab('history'); fetchHistory(); }} className="text-xs text-[hsl(var(--primary))] uppercase tracking-widest hover:opacity-80 transition-opacity">
                      Загрузить историю →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAXES */}
          {activeTab === 'taxes' && (
            <TaxRecords
              records={records}
              loading={loadingRecords}
              userId={session.user_id}
              onRefresh={fetchRecords}
            />
          )}

          {/* HISTORY */}
          {activeTab === 'history' && (
            <TaxHistory history={history} loading={loadingHistory} />
          )}

          {/* SUPPORT */}
          {activeTab === 'support' && (
            <div className="max-w-2xl flex flex-col" style={{ height: 'calc(100vh - 170px)' }}>
              <div className="mb-4">
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground">Чат с поддержкой</h3>
                <p className="text-xs text-muted-foreground mt-1">Задайте вопрос — администратор ответит в ближайшее время</p>
              </div>

              <div className="flex-1 border border-border overflow-y-auto p-4 space-y-3 bg-card">
                {supportLoading ? (
                  <div className="text-muted-foreground text-sm text-center py-10">Загрузка...</div>
                ) : supportMsgs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Icon name="MessageCircle" size={32} className="text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground text-sm">Нет сообщений</p>
                    <p className="text-muted-foreground text-xs mt-1">Напишите нам — мы поможем!</p>
                  </div>
                ) : (
                  supportMsgs.map(msg => (
                    <div key={msg.id} className={`flex ${msg.author === 'client' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs lg:max-w-md px-4 py-2.5 ${
                        msg.author === 'client'
                          ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                          : 'bg-accent text-foreground border border-border'
                      }`}>
                        <p className="text-sm leading-relaxed">{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${msg.author === 'client' ? 'text-[hsl(var(--primary-foreground))]/70' : 'text-muted-foreground'}`}>
                          {msg.author === 'client' ? 'Вы' : 'Поддержка'} · {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendSupport} className="flex gap-3 mt-3">
                <input
                  value={supportText}
                  onChange={e => setSupportText(e.target.value)}
                  placeholder="Напишите сообщение..."
                  className="flex-1 bg-background border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                  disabled={supportSending}
                />
                <button
                  type="submit"
                  disabled={supportSending || !supportText.trim()}
                  className="px-6 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                >
                  <Icon name="Send" size={14} />
                  Отправить
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;