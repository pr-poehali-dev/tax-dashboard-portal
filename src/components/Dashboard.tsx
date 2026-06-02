import { useState, useEffect, useRef } from 'react';
import { UserSession } from '@/pages/Index';
import Icon from '@/components/ui/icon';

const CABINET_URL = 'https://functions.poehali.dev/55da48e4-e0f4-4cea-ad0c-d80ea71302b9';
const HISTORY_URL = 'https://functions.poehali.dev/3ee6767d-9849-400d-b663-bcdb21b41844';
const SUPPORT_URL = 'https://functions.poehali.dev/c44f54ad-be34-4ae2-8daf-d5256223c92e';
const ADMIN_URL = 'https://functions.poehali.dev/8350a22d-3a83-499b-a43c-72d06295b607';

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

interface Fine {
  id: number;
  reason: string;
  amount: number;
  status: string;
  due_date: string | null;
  created_at: string;
}

// Minecraft: tax_type = предмет/ресурс, period = инвентарный слот, amount = кол-во/стоимость, description = описание
// tax_history используем как лог событий сервера

type Tab = 'profile' | 'inventory' | 'bank' | 'lands' | 'achievements' | 'punishments' | 'support';

const RARITY_COLORS: Record<string, string> = {
  common: 'text-gray-500 border-gray-200 bg-gray-50',
  uncommon: 'text-green-600 border-green-200 bg-green-50',
  rare: 'text-blue-600 border-blue-200 bg-blue-50',
  epic: 'text-purple-600 border-purple-200 bg-purple-50',
  legendary: 'text-yellow-600 border-yellow-200 bg-yellow-50',
};

const ITEM_ICONS: Record<string, string> = {
  weapon: 'Sword',
  tool: 'Wrench',
  armor: 'Shield',
  food: 'Salad',
  block: 'Box',
  misc: 'Package',
  currency: 'Coins',
  land: 'Map',
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Активен', color: 'text-green-600 bg-green-50 border-green-200' },
  paid: { label: 'Завершён', color: 'text-gray-500 bg-gray-50 border-gray-200' },
  overdue: { label: 'Заблокирован', color: 'text-red-600 bg-red-50 border-red-200' },
  cancelled: { label: 'Удалён', color: 'text-muted-foreground bg-muted border-border' },
};

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
const fmtDate = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (s: string) => new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const fmtShort = (s: string) => new Date(s).toLocaleDateString('ru-RU');

const Dashboard = ({ session, onLogout }: Props) => {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [records, setRecords] = useState<TaxRecord[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState('');

  const [supportMsgs, setSupportMsgs] = useState<SupportMsg[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportText, setSupportText] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [unreadFromAdmin, setUnreadFromAdmin] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [commentText, setCommentText] = useState<Record<number, string>>({});
  const [commentSending, setCommentSending] = useState<number | null>(null);

  const headers = { 'X-User-Id': String(session.user_id) };

  const fetchRecords = async () => {
    setLoadingRecords(true);
    setError('');
    try {
      const res = await fetch(CABINET_URL, { headers });
      const data = await res.json();
      setRecords(data.records || []);
    } catch {
      setError('Не удалось загрузить данные. Попробуйте обновить страницу.');
    } finally {
      setLoadingRecords(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(HISTORY_URL, { headers });
      const data = await res.json();
      setHistory(data.history || []);
    } catch {
      // тихо
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchFines = async () => {
    try {
      const res = await fetch(`${ADMIN_URL}?action=fines&user_id=${session.user_id}`, { headers: { 'X-User-Id': String(session.user_id) } });
      // fines через cabinet не доступны анонимно, делаем через кабинет
    } catch { /* ignore */ }
  };

  const fetchSupport = async () => {
    setSupportLoading(true);
    try {
      const res = await fetch(SUPPORT_URL, { headers });
      const data = await res.json();
      const msgs: SupportMsg[] = data.messages || [];
      setSupportMsgs(msgs);
      setUnreadFromAdmin(0);
    } catch { /* ignore */ } finally {
      setSupportLoading(false);
    }
  };

  const handleSendSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportText.trim()) return;
    setSupportSending(true);
    try {
      await fetch(SUPPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ message: supportText.trim() }),
      });
      setSupportText('');
      await fetchSupport();
    } catch { /* ignore */ } finally {
      setSupportSending(false);
    }
  };

  const handleAddComment = async (recordId: number) => {
    const text = commentText[recordId]?.trim();
    if (!text) return;
    setCommentSending(recordId);
    try {
      await fetch(CABINET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers, 'X-Action': 'add_comment' },
        body: JSON.stringify({ record_id: recordId, comment: text }),
      });
      setCommentText(p => ({ ...p, [recordId]: '' }));
      await fetchRecords();
    } catch { /* ignore */ } finally {
      setCommentSending(null);
    }
  };

  useEffect(() => { fetchRecords(); }, []);

  useEffect(() => {
    if (activeTab === 'achievements' && history.length === 0) fetchHistory();
    if (activeTab === 'support') fetchSupport();
  }, [activeTab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [supportMsgs]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(SUPPORT_URL, { headers });
        const data = await res.json();
        const msgs: SupportMsg[] = data.messages || [];
        const unread = msgs.filter(m => m.author === 'admin' && !m.is_read).length;
        setUnreadFromAdmin(unread);
        setSupportMsgs(msgs);
      } catch { /* ignore */ }
    })();
  }, []);

  // Minecraft-контекст: tax_records = инвентарь/активы/счета
  // status: pending=активен, paid=завершён/использован, overdue=заблокирован
  const inventory = records.filter(r => r.tax_type !== '__bank__' && r.tax_type !== '__land__');
  const bankAccounts = records.filter(r => r.tax_type === '__bank__');
  const lands = records.filter(r => r.tax_type === '__land__');

  const totalBalance = bankAccounts.reduce((s, r) => s + r.amount, 0);
  const activeItems = inventory.filter(r => r.status === 'pending').length;

  const punishments = records.filter(r => r.description?.startsWith('[ШТРАФ]') || r.description?.startsWith('[БАН]') || r.description?.startsWith('[МУТ]'));
  const regularInventory = inventory.filter(r => !r.description?.startsWith('[ШТРАФ]') && !r.description?.startsWith('[БАН]') && !r.description?.startsWith('[МУТ]'));

  const nav: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: 'profile', label: 'Профиль', icon: 'User' },
    { id: 'inventory', label: 'Инвентарь', icon: 'Package', badge: activeItems > 0 ? activeItems : undefined },
    { id: 'bank', label: 'Банк', icon: 'Landmark' },
    { id: 'lands', label: 'Земли', icon: 'Map' },
    { id: 'achievements', label: 'История', icon: 'History' },
    { id: 'punishments', label: 'Нарушения', icon: 'AlertOctagon', badge: punishments.filter(r => r.status === 'pending').length || undefined },
    { id: 'support', label: 'Поддержка', icon: 'MessageSquare', badge: unreadFromAdmin > 0 ? unreadFromAdmin : undefined },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[hsl(var(--sidebar-background))] border-r border-border flex flex-col shrink-0">
        {/* Player header */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-[hsl(var(--primary))]/10 border-2 border-[hsl(var(--primary))]/30 flex items-center justify-center text-xl">
              ⛏️
            </div>
            <div className="min-w-0">
              <p className="text-foreground font-display text-lg truncate">{session.full_name}</p>
              <p className="text-muted-foreground text-xs font-mono">ID: {session.client_id}</p>
            </div>
          </div>
          {session.inn && <p className="text-muted-foreground text-xs font-mono bg-muted px-2 py-1">ИНН: {session.inn}</p>}
        </div>

        <nav className="flex-1 py-3">
          {nav.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-5 py-2.5 text-xs uppercase tracking-widest transition-colors relative ${activeTab === item.id ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border-r-2 border-[hsl(var(--primary))]' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
              <Icon name={item.icon} size={14} />
              {item.label}
              {item.badge != null && item.badge > 0 && (
                <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <button onClick={onLogout} className="w-full flex items-center gap-2 text-muted-foreground hover:text-foreground text-xs uppercase tracking-widest transition-colors py-2">
            <Icon name="LogOut" size={13} />Выйти
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <header className="border-b border-border px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl text-foreground">{nav.find(n => n.id === activeTab)?.label}</h2>
            <p className="text-muted-foreground text-xs mt-0.5">{new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Игрок</p>
            <p className="text-sm text-foreground font-medium mt-0.5">{session.full_name}</p>
          </div>
        </header>

        {error && (
          <div className="mx-8 mt-4 border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center gap-3 text-destructive text-sm">
            <Icon name="AlertTriangle" size={16} />{error}
            <button onClick={fetchRecords} className="ml-auto text-xs underline">Повторить</button>
          </div>
        )}

        <div className="p-8">

          {/* ===== ПРОФИЛЬ ===== */}
          {activeTab === 'profile' && (
            <div className="max-w-2xl space-y-6">
              {/* Карточка игрока */}
              <div className="border border-border p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(var(--primary))]/5 rounded-full -translate-y-8 translate-x-8" />
                <div className="flex items-start gap-5">
                  <div className="w-20 h-20 bg-[hsl(var(--primary))]/10 border-2 border-[hsl(var(--primary))]/30 flex items-center justify-center text-4xl shrink-0">⛏️</div>
                  <div className="flex-1">
                    <h2 className="font-display text-3xl text-foreground">{session.full_name}</h2>
                    <p className="text-muted-foreground text-sm font-mono mt-1">ID: {session.client_id}</p>
                    {session.inn && <p className="text-muted-foreground text-sm font-mono">ИНН: {session.inn}</p>}
                  </div>
                </div>
              </div>

              {/* Статистика */}
              <div className="grid grid-cols-3 gap-4">
                <div className="border border-border p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Предметов</p>
                  <p className="font-display text-3xl text-foreground">{regularInventory.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">{activeItems} активных</p>
                </div>
                <div className="border border-border p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Баланс</p>
                  <p className="font-display text-3xl text-[hsl(var(--primary))]">{fmt(totalBalance)} <span className="text-base">монет</span></p>
                </div>
                <div className="border border-border p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Земли</p>
                  <p className="font-display text-3xl text-foreground">{lands.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">участков</p>
                </div>
              </div>

              {/* Последние предметы */}
              {loadingRecords ? (
                <div className="text-muted-foreground text-sm text-center py-8 border border-border">Загрузка...</div>
              ) : regularInventory.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Последние предметы</h3>
                  <div className="space-y-2">
                    {regularInventory.slice(0, 5).map(r => (
                      <div key={r.id} className="border border-border p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-accent flex items-center justify-center text-base">
                            {r.period === 'weapon' ? '⚔️' : r.period === 'tool' ? '⛏️' : r.period === 'armor' ? '🛡️' : r.period === 'food' ? '🍎' : r.period === 'block' ? '🧱' : '📦'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{r.tax_type}</p>
                            <p className="text-xs text-muted-foreground">{r.description || r.period}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-mono">{fmt(r.amount)}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 border ${STATUS_MAP[r.status]?.color}`}>{STATUS_MAP[r.status]?.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {punishments.filter(r => r.status === 'pending').length > 0 && (
                <div className="border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex items-center gap-2 text-destructive mb-2">
                    <Icon name="AlertOctagon" size={16} />
                    <p className="text-sm font-medium">Активные нарушения</p>
                  </div>
                  {punishments.filter(r => r.status === 'pending').map(r => (
                    <p key={r.id} className="text-sm text-destructive">• {r.tax_type}: {r.description?.replace('[ШТРАФ]', '').replace('[БАН]', '').replace('[МУТ]', '').trim()}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== ИНВЕНТАРЬ ===== */}
          {activeTab === 'inventory' && (
            <div className="max-w-4xl space-y-4">
              {loadingRecords ? (
                <div className="text-muted-foreground text-center py-12 border border-border">Загрузка инвентаря...</div>
              ) : regularInventory.length === 0 ? (
                <div className="text-center py-16 border border-border">
                  <p className="text-4xl mb-3">📦</p>
                  <p className="text-muted-foreground text-sm">Инвентарь пуст</p>
                  <p className="text-muted-foreground text-xs mt-1">Предметы добавит администратор</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Всего предметов: <span className="font-mono text-foreground">{regularInventory.length}</span></p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {regularInventory.map(r => (
                      <div key={r.id} className="border border-border p-4 hover:bg-accent transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-accent flex items-center justify-center text-xl shrink-0">
                            {r.period === 'weapon' ? '⚔️' : r.period === 'tool' ? '⛏️' : r.period === 'armor' ? '🛡️' : r.period === 'food' ? '🍎' : r.period === 'block' ? '🧱' : r.period === 'currency' ? '💰' : '📦'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-foreground">{r.tax_type}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 border shrink-0 ${STATUS_MAP[r.status]?.color}`}>{STATUS_MAP[r.status]?.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 capitalize">{r.period}</p>
                            {r.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-xs text-muted-foreground">Кол-во: <span className="font-mono text-foreground">{fmt(r.amount)}</span></p>
                              {r.due_date && <p className="text-xs text-muted-foreground">до {fmtShort(r.due_date)}</p>}
                            </div>
                          </div>
                        </div>
                        {/* Комментарии */}
                        {r.comments?.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border space-y-1">
                            {r.comments.map(c => (
                              <div key={c.id} className="text-xs text-muted-foreground flex gap-2">
                                <span className={c.author === 'Администратор' ? 'text-[hsl(var(--primary))]' : 'text-foreground'}>[{c.author}]</span>
                                <span>{c.comment}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 mt-3">
                          <input value={commentText[r.id] || ''} onChange={e => setCommentText(p => ({ ...p, [r.id]: e.target.value }))}
                            placeholder="Написать заметку..."
                            className="flex-1 bg-background border border-border px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))]"
                            onKeyDown={e => e.key === 'Enter' && handleAddComment(r.id)}
                          />
                          <button onClick={() => handleAddComment(r.id)} disabled={commentSending === r.id} className="px-2 py-1 border border-border text-muted-foreground hover:text-foreground text-xs disabled:opacity-40">
                            <Icon name="Send" size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== БАНК ===== */}
          {activeTab === 'bank' && (
            <div className="max-w-2xl space-y-4">
              <div className="border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 p-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Общий баланс</p>
                <p className="font-display text-4xl text-[hsl(var(--primary))]">{fmt(totalBalance)} <span className="text-xl">монет</span></p>
              </div>

              {bankAccounts.length === 0 ? (
                <div className="text-center py-12 border border-border">
                  <p className="text-4xl mb-3">🏦</p>
                  <p className="text-muted-foreground text-sm">Банковских счетов нет</p>
                  <p className="text-muted-foreground text-xs mt-1">Счёт откроет администратор</p>
                </div>
              ) : (
                bankAccounts.map(acc => (
                  <div key={acc.id} className="border border-border p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Icon name="CreditCard" size={16} className="text-[hsl(var(--primary))]" />
                        <div>
                          <p className="text-sm font-medium">{acc.tax_type}</p>
                          <p className="text-xs text-muted-foreground font-mono">{acc.period}</p>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 border ${STATUS_MAP[acc.status]?.color}`}>{STATUS_MAP[acc.status]?.label}</span>
                    </div>
                    <p className="font-display text-2xl text-foreground">{fmt(acc.amount)} <span className="text-sm">монет</span></p>
                    {acc.description && <p className="text-xs text-muted-foreground mt-2">{acc.description}</p>}
                    {acc.due_date && <p className="text-xs text-muted-foreground mt-1">Открыт: {fmtShort(acc.due_date)}</p>}
                  </div>
                ))
              )}

              {/* История транзакций из history */}
              <div>
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2"><Icon name="ArrowLeftRight" size={12} />Последние транзакции</h3>
                {loadingHistory ? (
                  <div className="text-muted-foreground text-sm text-center py-6 border border-border">Загрузка...</div>
                ) : history.length === 0 ? (
                  <div className="text-muted-foreground text-sm text-center py-6 border border-border">Нет транзакций</div>
                ) : (
                  <div className="border border-border overflow-hidden">
                    {history.slice(0, 10).map((h, idx) => (
                      <div key={h.id} className={`px-4 py-3 flex items-center justify-between hover:bg-accent ${idx < history.length - 1 ? 'border-b border-border' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${h.amount && h.amount > 0 ? 'bg-green-500' : 'bg-destructive'}`} />
                          <div>
                            <p className="text-sm text-foreground">{h.description}</p>
                            <p className="text-xs text-muted-foreground">{fmtDate(h.occurred_at)}</p>
                          </div>
                        </div>
                        {h.amount != null && (
                          <p className={`text-sm font-mono font-medium ${h.amount > 0 ? 'text-green-600' : 'text-destructive'}`}>
                            {h.amount > 0 ? '+' : ''}{fmt(h.amount)} монет
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {history.length === 0 && <button onClick={() => { setActiveTab('bank'); fetchHistory(); }} className="text-xs text-[hsl(var(--primary))] hover:opacity-80">Загрузить историю</button>}
              </div>
            </div>
          )}

          {/* ===== ЗЕМЛИ ===== */}
          {activeTab === 'lands' && (
            <div className="max-w-3xl space-y-4">
              {loadingRecords ? (
                <div className="text-muted-foreground text-center py-12 border border-border">Загрузка...</div>
              ) : lands.length === 0 ? (
                <div className="text-center py-16 border border-border">
                  <p className="text-4xl mb-3">🗺️</p>
                  <p className="text-muted-foreground text-sm">Земельных участков нет</p>
                  <p className="text-muted-foreground text-xs mt-1">Участки добавит администратор</p>
                </div>
              ) : (
                lands.map(land => (
                  <div key={land.id} className="border border-border p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-green-50 border border-green-200 flex items-center justify-center text-xl shrink-0">🌍</div>
                        <div>
                          <p className="text-base font-medium text-foreground">{land.tax_type}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">Мир: {land.period}</p>
                          {land.description && <p className="text-xs text-muted-foreground mt-1">{land.description}</p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-display font-medium">{fmt(land.amount)} <span className="text-xs">блоков</span></p>
                        <span className={`text-[10px] px-1.5 py-0.5 border ${STATUS_MAP[land.status]?.color}`}>{STATUS_MAP[land.status]?.label}</span>
                        {land.due_date && <p className="text-xs text-muted-foreground mt-1">до {fmtShort(land.due_date)}</p>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ===== ИСТОРИЯ СОБЫТИЙ ===== */}
          {activeTab === 'achievements' && (
            <div className="max-w-2xl">
              {loadingHistory ? (
                <div className="text-muted-foreground text-center py-12 border border-border">Загрузка...</div>
              ) : history.length === 0 ? (
                <div className="text-center py-16 border border-border">
                  <p className="text-4xl mb-3">📜</p>
                  <p className="text-muted-foreground text-sm">История событий пуста</p>
                </div>
              ) : (
                <div className="border border-border overflow-hidden">
                  {history.map((h, idx) => (
                    <div key={h.id} className={`px-5 py-4 flex items-start gap-4 hover:bg-accent ${idx < history.length - 1 ? 'border-b border-border' : ''}`}>
                      <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{h.description}</p>
                        <div className="flex gap-3 mt-0.5">
                          {h.tax_type && <p className="text-xs text-muted-foreground">{h.tax_type}</p>}
                          {h.period && <p className="text-xs text-muted-foreground">{h.period}</p>}
                          <p className="text-xs text-muted-foreground">{fmtDate(h.occurred_at)}</p>
                        </div>
                      </div>
                      {h.amount != null && <p className={`text-sm font-mono shrink-0 ${h.amount > 0 ? 'text-green-600' : 'text-destructive'}`}>{h.amount > 0 ? '+' : ''}{fmt(h.amount)}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== НАРУШЕНИЯ ===== */}
          {activeTab === 'punishments' && (
            <div className="max-w-2xl space-y-4">
              {punishments.length === 0 ? (
                <div className="text-center py-16 border border-border">
                  <p className="text-4xl mb-3">✅</p>
                  <p className="text-muted-foreground text-sm">Нарушений нет</p>
                  <p className="text-muted-foreground text-xs mt-1">Продолжайте играть честно!</p>
                </div>
              ) : (
                punishments.map(p => (
                  <div key={p.id} className={`border p-5 ${p.status === 'pending' ? 'border-destructive/30 bg-destructive/5' : 'border-border'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 flex items-center justify-center text-xl shrink-0">
                          {p.description?.startsWith('[БАН]') ? '🔨' : p.description?.startsWith('[МУТ]') ? '🔇' : '⚠️'}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{p.tax_type}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{p.description?.replace('[ШТРАФ]', '').replace('[БАН]', '').replace('[МУТ]', '').trim()}</p>
                          <p className="text-xs text-muted-foreground mt-1">Выдан: {fmtDate(p.created_at)}</p>
                          {p.due_date && <p className="text-xs text-muted-foreground">До: {fmtShort(p.due_date)}</p>}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 border shrink-0 ${p.status === 'pending' ? 'text-destructive bg-destructive/10 border-destructive/30' : 'text-muted-foreground bg-muted border-border'}`}>
                        {p.status === 'pending' ? 'Активен' : 'Снят'}
                      </span>
                    </div>
                    {p.amount > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-sm text-destructive font-mono">Штраф: {fmt(p.amount)} монет</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ===== ПОДДЕРЖКА ===== */}
          {activeTab === 'support' && (
            <div className="max-w-2xl flex flex-col" style={{ height: 'calc(100vh - 170px)' }}>
              <div className="mb-4">
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground">Чат с администрацией</h3>
                <p className="text-xs text-muted-foreground mt-1">Задайте вопрос — ответим как можно скорее</p>
              </div>

              <div className="flex-1 border border-border overflow-y-auto p-4 space-y-3 bg-card">
                {supportLoading ? (
                  <div className="text-muted-foreground text-sm text-center py-10">Загрузка...</div>
                ) : supportMsgs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-4xl mb-3">💬</p>
                    <p className="text-muted-foreground text-sm">Нет сообщений</p>
                    <p className="text-muted-foreground text-xs mt-1">Напишите нам — мы поможем!</p>
                  </div>
                ) : (
                  supportMsgs.map(msg => (
                    <div key={msg.id} className={`flex ${msg.author === 'client' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs lg:max-w-md px-4 py-2.5 ${msg.author === 'client' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-accent text-foreground border border-border'}`}>
                        <p className="text-sm leading-relaxed">{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${msg.author === 'client' ? 'text-[hsl(var(--primary-foreground))]/70' : 'text-muted-foreground'}`}>
                          {msg.author === 'client' ? 'Вы' : '👑 Администрация'} · {fmtTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendSupport} className="flex gap-3 mt-3">
                <input value={supportText} onChange={e => setSupportText(e.target.value)} placeholder="Ваш вопрос..."
                  className="flex-1 bg-background border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors" disabled={supportSending} />
                <button type="submit" disabled={supportSending || !supportText.trim()}
                  className="px-6 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                  <Icon name="Send" size={14} />
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
