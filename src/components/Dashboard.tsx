import { useState, useEffect, useRef } from 'react';
import { UserSession } from '@/pages/Index';
import Icon from '@/components/ui/icon';

const CABINET_URL = 'https://functions.poehali.dev/55da48e4-e0f4-4cea-ad0c-d80ea71302b9';
const SUPPORT_URL = 'https://functions.poehali.dev/c44f54ad-be34-4ae2-8daf-d5256223c92e';

interface Props { session: UserSession; onLogout: () => void; }

interface TaxRecord {
  id: number; tax_type: string; period: string; amount: number; status: string;
  due_date: string | null; description: string; created_at: string;
  comments: { id: number; author: string; comment: string; created_at: string }[];
}
interface HistoryItem { id: number; operation_type: string; tax_type: string | null; amount: number | null; period: string | null; description: string; occurred_at: string; }
interface SupportMsg { id: number; author: string; message: string; is_read: boolean; created_at: string; }
interface Credit { id: number; title: string; amount: number; status: string; due_date: string | null; description: string; created_at: string; }
interface Deposit { id: number; title: string; amount: number; status: string; due_date: string | null; description: string; created_at: string; }
interface Card { id: number; card_number: string; balance: number; status: string; expiry: string | null; description: string; created_at: string; }
interface Order { id: number; items: string; total: number; status: string; address: string; description: string; created_at: string; }
interface Payment { id: number; purpose: string; amount: number; status: string; paid_at: string | null; description: string; created_at: string; }
interface Product { id: number; name: string; price: number; status: string; image_url: string | null; description: string; created_at: string; }

type Tab = 'home' | 'inventory' | 'bank' | 'credits' | 'cards' | 'shop' | 'support';

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n));
const fmtMoney = (n: number) => `${fmt(n)} ₽`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = (s: string) => new Date(s).toLocaleDateString('ru-RU');
const fmtTime = (s: string) => new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  paid: 'text-green-400 bg-green-400/10 border-green-400/30',
  overdue: 'text-red-400 bg-red-400/10 border-red-400/30',
  cancelled: 'text-muted-foreground bg-muted/30 border-border',
  approved: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  rejected: 'text-red-400 bg-red-400/10 border-red-400/30',
  active: 'text-green-400 bg-green-400/10 border-green-400/30',
  processing: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  delivered: 'text-green-400 bg-green-400/10 border-green-400/30',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает', paid: 'Оплачено', overdue: 'Просрочено', cancelled: 'Отменён',
  approved: 'Одобрен', rejected: 'Отклонён', active: 'Активен',
  processing: 'В обработке', delivered: 'Доставлен',
};

const ITEM_EMOJI: Record<string, string> = {
  weapon: '🔧', tool: '🛠️', armor: '🏠', food: '🍎', block: '📦', currency: '💰', land: '🌍', misc: '📁',
  realestate: '🏠', vehicle: '🚗', electronics: '💻', clothing: '👗', other: '📦',
};

const TABS: { id: Tab; label: string; icon: string; mobileLabel: string }[] = [
  { id: 'home', label: 'Кабинет', icon: 'LayoutDashboard', mobileLabel: 'Кабинет' },
  { id: 'inventory', label: 'Мои активы', icon: 'Package', mobileLabel: 'Активы' },
  { id: 'bank', label: 'Счета', icon: 'Landmark', mobileLabel: 'Счета' },
  { id: 'credits', label: 'Кредиты', icon: 'TrendingUp', mobileLabel: 'Кредиты' },
  { id: 'cards', label: 'Карты', icon: 'Wallet', mobileLabel: 'Карты' },
  { id: 'shop', label: 'Маркетплейс', icon: 'ShoppingBag', mobileLabel: 'Рынок' },
  { id: 'support', label: 'Поддержка', icon: 'MessageSquare', mobileLabel: 'Чат' },
];

function PaymentModal({ amount, purpose, recordId, userId, onClose, onSuccess }: {
  amount: number; purpose: string; recordId?: number; userId: number; onClose: () => void; onSuccess: () => void;
}) {
  const [cardNum, setCardNum] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [payAmount, setPayAmount] = useState(amount > 0 ? String(amount) : '');

  const formatCard = (v: string) => v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  const formatExpiry = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { setErr('Укажите сумму'); return; }
    if (cardNum.replace(/\s/g, '').length < 16) { setErr('Введите номер карты'); return; }
    if (!cardName.trim()) { setErr('Введите имя владельца'); return; }
    if (expiry.length < 5) { setErr('Введите срок'); return; }
    if (cvv.length < 3) { setErr('Введите CVV'); return; }
    setErr(''); setLoading(true);
    try {
      const res = await fetch(CABINET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': String(userId), 'X-Action': 'pay_online' },
        body: JSON.stringify({ purpose, amount: amt, record_id: recordId, card_holder: cardName }),
      });
      const d = await res.json();
      if (d.success) { setDone(true); setTimeout(() => { onSuccess(); onClose(); }, 2000); }
      else setErr(d.error || 'Ошибка');
    } catch { setErr('Ошибка соединения'); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-none p-6 max-h-[92vh] overflow-y-auto">
        {done ? (
          <div className="text-center py-10">
            <div className="w-16 h-16 bg-green-500/20 border border-green-500/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="Check" size={28} className="text-green-400" />
            </div>
            <p className="text-xl font-display text-foreground">Оплата прошла!</p>
            <p className="text-sm text-muted-foreground mt-1">{fmtMoney(parseFloat(payAmount))} · {purpose}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-display text-xl">Оплата онлайн</h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">{purpose}</p>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 shrink-0"><Icon name="X" size={20} /></button>
            </div>
            <div className="bg-gradient-to-br from-[hsl(var(--primary))]/20 to-[hsl(var(--primary))]/5 border border-[hsl(var(--primary))]/30 p-4 mb-5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">К оплате</p>
              {amount > 0 ? (
                <p className="font-display text-3xl text-[hsl(var(--primary))]">{fmtMoney(amount)}</p>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0"
                    className="w-32 bg-transparent border-b border-[hsl(var(--primary))]/50 text-2xl font-display text-[hsl(var(--primary))] focus:outline-none pb-1" />
                  <span className="text-xl text-[hsl(var(--primary))]">₽</span>
                </div>
              )}
            </div>
            <form onSubmit={handlePay} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Номер карты</label>
                <input value={cardNum} onChange={e => setCardNum(formatCard(e.target.value))} placeholder="0000 0000 0000 0000"
                  className="w-full bg-background border border-border px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))]" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Имя владельца</label>
                <input value={cardName} onChange={e => setCardName(e.target.value.toUpperCase())} placeholder="IVAN IVANOV"
                  className="w-full bg-background border border-border px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Срок</label>
                  <input value={expiry} onChange={e => setExpiry(formatExpiry(e.target.value))} placeholder="MM/YY"
                    className="w-full bg-background border border-border px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))]" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">CVV</label>
                  <input value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="•••" type="password"
                    className="w-full bg-background border border-border px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))]" />
                </div>
              </div>
              {err && <p className="text-destructive text-xs border-l-2 border-destructive pl-2">{err}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold uppercase tracking-widest hover:opacity-90 disabled:opacity-50">
                {loading ? 'Обработка...' : `Оплатить ${amount > 0 ? fmtMoney(amount) : ''}`}
              </button>
              <p className="text-[10px] text-muted-foreground text-center">🔒 Защищённое соединение · SSL</p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function ProductCard({ product, onOrder }: { product: Product; onOrder: (p: Product) => void }) {
  return (
    <div className="border border-border bg-card flex flex-col overflow-hidden">
      {product.image_url ? (
        <img src={product.image_url} alt={product.name} className="w-full h-36 object-cover" />
      ) : (
        <div className="w-full h-36 bg-accent flex items-center justify-center text-4xl">📦</div>
      )}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-sm font-medium text-foreground leading-tight">{product.name}</p>
        {product.description && <p className="text-xs text-muted-foreground mt-1 flex-1 line-clamp-2">{product.description}</p>}
        <div className="flex items-center justify-between mt-3">
          <p className="text-base font-display text-[hsl(var(--primary))]">{fmtMoney(product.price)}</p>
          <button onClick={() => onOrder(product)} className="px-3 py-1.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[10px] font-semibold uppercase tracking-widest hover:opacity-90">
            Заказать
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderModal({ product, userId, onClose, onSuccess }: { product: Product; userId: number; onClose: () => void; onSuccess: () => void }) {
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [qty, setQty] = useState(1);
  const [step, setStep] = useState<'form' | 'pay' | 'done'>('form');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [orderId, setOrderId] = useState<number | null>(null);
  const total = product.price * qty;

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) { setErr('Укажите адрес доставки'); return; }
    setErr(''); setLoading(true);
    try {
      const res = await fetch(CABINET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': String(userId), 'X-Action': 'place_order' },
        body: JSON.stringify({ items: `${product.name} × ${qty}`, total, address, phone, comment }),
      });
      const d = await res.json();
      if (d.success) { setOrderId(d.order_id); setStep('pay'); }
      else setErr(d.error || 'Ошибка');
    } catch { setErr('Ошибка соединения'); }
    setLoading(false);
  };

  if (step === 'done') return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-none p-8 text-center">
        <div className="w-16 h-16 bg-green-500/20 border border-green-500/40 rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon name="Check" size={28} className="text-green-400" />
        </div>
        <p className="text-xl font-display">Заказ #{orderId} оформлен!</p>
        <p className="text-sm text-muted-foreground mt-2">Доставим по адресу:<br />{address}</p>
        <button onClick={onClose} className="mt-6 w-full py-3 border border-border text-xs uppercase tracking-widest hover:bg-accent">Закрыть</button>
      </div>
    </div>
  );

  if (step === 'pay') return (
    <PaymentModal amount={total} purpose={`Заказ: ${product.name} × ${qty}`} recordId={orderId || undefined}
      userId={userId} onClose={onClose} onSuccess={() => setStep('done')} />
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-none p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl">Оформить заказ</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Icon name="X" size={20} /></button>
        </div>
        <div className="flex items-center gap-3 p-3 bg-accent/50 border border-border mb-4">
          <div className="w-12 h-12 bg-accent flex items-center justify-center text-2xl shrink-0">
            {product.image_url ? <img src={product.image_url} className="w-full h-full object-cover" alt="" /> : '📦'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{product.name}</p>
            <p className="text-xs text-[hsl(var(--primary))]">{fmtMoney(product.price)} за шт.</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-7 h-7 border border-border flex items-center justify-center text-sm hover:bg-accent">−</button>
            <span className="text-sm font-mono w-5 text-center">{qty}</span>
            <button onClick={() => setQty(qty + 1)} className="w-7 h-7 border border-border flex items-center justify-center text-sm hover:bg-accent">+</button>
          </div>
        </div>
        <form onSubmit={handleOrder} className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Адрес доставки *</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2}
              placeholder="Город, улица, дом, квартира"
              className="w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-[hsl(var(--primary))] resize-none" required />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Телефон</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (900) 000-00-00"
              className="w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-[hsl(var(--primary))]" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Комментарий</label>
            <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Пожелания к заказу..."
              className="w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-[hsl(var(--primary))]" />
          </div>
          {err && <p className="text-destructive text-xs border-l-2 border-destructive pl-2">{err}</p>}
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Итого: <span className="font-display text-lg text-foreground">{fmtMoney(total)}</span></span>
            <button type="submit" disabled={loading}
              className="px-5 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[10px] font-semibold uppercase tracking-widest hover:opacity-90 disabled:opacity-50">
              {loading ? '...' : 'Далее → Оплата'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Dashboard({ session, onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [records, setRecords] = useState<TaxRecord[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [supportMsgs, setSupportMsgs] = useState<SupportMsg[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loadingFinance, setLoadingFinance] = useState(false);
  const [loadingShop, setLoadingShop] = useState(false);
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [unread, setUnread] = useState(0);
  const [supportText, setSupportText] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [payModal, setPayModal] = useState<{ amount: number; purpose: string; recordId?: number } | null>(null);
  const [orderModal, setOrderModal] = useState<Product | null>(null);
  const [creditModal, setCreditModal] = useState(false);
  const [depositModal, setDepositModal] = useState(false);
  const [cardModal, setCardModal] = useState(false);
  const [commentText, setCommentText] = useState<Record<number, string>>({});
  const [creditForm, setCreditForm] = useState({ title: 'Кредит наличными', amount: '', description: '' });
  const [depositForm, setDepositForm] = useState({ title: 'Вклад «Стабильный»', amount: '', duration: '12 мес.', rate: '7' });
  const [cardType, setCardType] = useState('Стандартная');
  const [formLoading, setFormLoading] = useState(false);
  const [formMsg, setFormMsg] = useState('');
  const [formErr, setFormErr] = useState('');
  const [error, setError] = useState('');

  // Продажа своего товара
  const [sellModal, setSellModal] = useState(false);
  const [sellForm, setSellForm] = useState({ name: '', price: '', category: 'other', description: '', image_url: '' });
  const [sellLoading, setSellLoading] = useState(false);
  const [sellMsg, setSellMsg] = useState('');
  const [sellErr, setSellErr] = useState('');

  // Оплата через банк
  const [bankPayModal, setBankPayModal] = useState<{ amount: number; purpose: string; recordId?: number } | null>(null);

  const H = { 'X-User-Id': String(session.user_id) };

  const api = async (url: string, opts?: RequestInit) => {
    try { const r = await fetch(url, opts); return await r.json(); } catch { return null; }
  };

  const fetchRecords = async () => {
    setLoadingRecords(true); setError('');
    const d = await api(CABINET_URL, { headers: H });
    if (d) setRecords(d.records || []); else setError('Ошибка загрузки данных');
    setLoadingRecords(false);
  };

  const fetchFinance = async () => {
    setLoadingFinance(true);
    const [c, dep, car, pay, his] = await Promise.all([
      api(`${CABINET_URL}?action=credits`, { headers: H }),
      api(`${CABINET_URL}?action=deposits`, { headers: H }),
      api(`${CABINET_URL}?action=cards`, { headers: H }),
      api(`${CABINET_URL}?action=payments`, { headers: H }),
      api(`${CABINET_URL}?action=history`, { headers: H }),
    ]);
    if (c) setCredits(c.credits || []);
    if (dep) setDeposits(dep.deposits || []);
    if (car) setCards(car.cards || []);
    if (pay) setPayments(pay.payments || []);
    if (his) setHistory(his.history || []);
    setLoadingFinance(false);
  };

  const fetchShop = async () => {
    setLoadingShop(true);
    const [prod, ord] = await Promise.all([
      api(`${CABINET_URL}?action=catalog`),
      api(`${CABINET_URL}?action=orders`, { headers: H }),
    ]);
    if (prod) setProducts(prod.products || []);
    if (ord) setOrders(ord.orders || []);
    setLoadingShop(false);
  };

  const fetchSupport = async () => {
    setLoadingSupport(true);
    const d = await api(SUPPORT_URL, { headers: H });
    if (d) { setSupportMsgs(d.messages || []); setUnread(0); }
    setLoadingSupport(false);
  };

  useEffect(() => { fetchRecords(); }, []);
  useEffect(() => {
    (async () => {
      const d = await api(SUPPORT_URL, { headers: H });
      if (d) {
        setSupportMsgs(d.messages || []);
        setUnread((d.messages || []).filter((m: SupportMsg) => m.author === 'admin' && !m.is_read).length);
      }
    })();
  }, []);

  useEffect(() => {
    if (activeTab === 'credits' || activeTab === 'bank') fetchFinance();
    if (activeTab === 'cards') fetchFinance();
    if (activeTab === 'shop') fetchShop();
    if (activeTab === 'support') fetchSupport();
  }, [activeTab]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [supportMsgs]);

  const handleSendSupport = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supportText.trim()) return;
    setSupportSending(true);
    await api(SUPPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...H }, body: JSON.stringify({ message: supportText.trim() }) });
    setSupportText(''); setSupportSending(false); fetchSupport();
  };

  const handleAddComment = async (rid: number) => {
    const text = commentText[rid]?.trim(); if (!text) return;
    await api(CABINET_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...H, 'X-Action': 'add_comment' }, body: JSON.stringify({ record_id: rid, comment: text }) });
    setCommentText(p => ({ ...p, [rid]: '' })); fetchRecords();
  };

  const handleCreditApply = async (e: React.FormEvent) => {
    e.preventDefault(); setFormMsg(''); setFormErr(''); setFormLoading(true);
    const d = await api(CABINET_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...H, 'X-Action': 'apply_credit' }, body: JSON.stringify({ ...creditForm, amount: parseFloat(creditForm.amount) }) });
    setFormLoading(false);
    if (d?.success) { setFormMsg('Заявка на кредит отправлена!'); setCreditForm({ title: 'Кредит наличными', amount: '', description: '' }); fetchFinance(); }
    else setFormErr(d?.error || 'Ошибка');
  };

  const handleDepositOpen = async (e: React.FormEvent) => {
    e.preventDefault(); setFormMsg(''); setFormErr(''); setFormLoading(true);
    const d = await api(CABINET_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...H, 'X-Action': 'open_deposit' }, body: JSON.stringify({ ...depositForm, amount: parseFloat(depositForm.amount) }) });
    setFormLoading(false);
    if (d?.success) { setFormMsg('Вклад открыт!'); setDepositForm({ title: 'Вклад «Стабильный»', amount: '', duration: '12 мес.', rate: '7' }); fetchFinance(); }
    else setFormErr(d?.error || 'Ошибка');
  };

  const handleCardApply = async () => {
    setFormMsg(''); setFormErr(''); setFormLoading(true);
    const d = await api(CABINET_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...H, 'X-Action': 'apply_card' }, body: JSON.stringify({ card_type: cardType }) });
    setFormLoading(false);
    if (d?.success) { setFormMsg(`Карта ${d.card_number} оформлена!`); setCardModal(false); setFormMsg(''); fetchFinance(); }
    else setFormErr(d?.error || 'Ошибка');
  };

  // Разместить объявление о продаже
  const handleSellProduct = async (e: React.FormEvent) => {
    e.preventDefault(); setSellMsg(''); setSellErr(''); setSellLoading(true);
    if (!sellForm.name.trim() || !sellForm.price) { setSellErr('Укажите название и цену'); setSellLoading(false); return; }
    const d = await api(CABINET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...H, 'X-Action': 'sell_product' },
      body: JSON.stringify({
        name: sellForm.name.trim(),
        price: parseFloat(sellForm.price),
        category: sellForm.category,
        description: sellForm.description.trim(),
        image_url: sellForm.image_url.trim() || null,
      }),
    });
    setSellLoading(false);
    if (d?.success) { setSellMsg('Объявление размещено!'); setSellForm({ name: '', price: '', category: 'other', description: '', image_url: '' }); fetchShop(); }
    else setSellErr(d?.error || 'Ошибка');
  };

  // Оплата через банковский счёт
  const handleBankPay = async (amount: number, purpose: string, recordId?: number) => {
    if (!bankRecords.length) { setError('Нет банковских счетов. Обратитесь к администратору.'); return; }
    setBankPayModal({ amount, purpose, recordId });
  };

  const confirmBankPay = async () => {
    if (!bankPayModal) return;
    const d = await api(CABINET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...H, 'X-Action': 'pay_online' },
      body: JSON.stringify({ purpose: bankPayModal.purpose, amount: bankPayModal.amount, record_id: bankPayModal.recordId, card_holder: `Банковский счёт #${bankRecords[0]?.id}` }),
    });
    setBankPayModal(null);
    if (d?.success) { fetchRecords(); fetchFinance(); }
    else setError(d?.error || 'Ошибка списания');
  };

  const bankRecords = records.filter(r => r.tax_type === '__bank__');
  const inventoryRecords = records.filter(r => !['__bank__', '__land__'].includes(r.tax_type) && !r.description?.match(/^\[(ШТРАФ|БАН|МУТ)\]/));
  const punishments = records.filter(r => r.description?.match(/^\[(ШТРАФ|БАН|МУТ)\]/));
  const totalBalance = bankRecords.reduce((s, r) => s + r.amount, 0);
  const totalDeposits = deposits.reduce((s, d) => s + d.amount, 0);
  const totalCredits = credits.filter(c => c.status !== 'rejected' && c.status !== 'cancelled').reduce((s, c) => s + c.amount, 0);
  const pendingTaxes = inventoryRecords.filter(r => r.status === 'pending');
  const navBadge = (tab: Tab) => tab === 'support' && unread > 0 ? unread : undefined;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex flex-1 overflow-hidden">

        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-56 bg-[hsl(var(--sidebar-background))] border-r border-border flex-col shrink-0">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/30 flex items-center justify-center">
                <Icon name="User" size={18} className="text-[hsl(var(--primary))]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{session.full_name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{session.client_id}</p>
              </div>
            </div>
            <div className="text-xs font-mono bg-[hsl(var(--primary))]/5 border border-[hsl(var(--primary))]/20 px-2 py-1 text-center text-[hsl(var(--primary))]">
              {fmtMoney(totalBalance)}
            </div>
          </div>
          <nav className="flex-1 py-2">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[10px] uppercase tracking-widest transition-colors relative ${activeTab === t.id ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border-r-2 border-[hsl(var(--primary))]' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
                <Icon name={t.icon} size={14} />
                {t.label}
                {navBadge(t.id) && <span className="ml-auto bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{navBadge(t.id)}</span>}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-border">
            <button onClick={onLogout} className="w-full flex items-center gap-2 text-muted-foreground hover:text-foreground text-[10px] uppercase tracking-widest py-2">
              <Icon name="LogOut" size={13} />Выйти
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile top bar */}
          <header className="md:hidden border-b border-border px-4 py-3 flex items-center justify-between shrink-0 bg-[hsl(var(--sidebar-background))]">
            <div className="flex items-center gap-2">
              <Icon name="LayoutDashboard" size={18} className="text-[hsl(var(--primary))]" />
              <div>
                <p className="text-sm font-medium text-foreground">{session.full_name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{session.client_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono text-[hsl(var(--primary))]">{fmtMoney(totalBalance)}</span>
              <button onClick={onLogout} className="p-1.5 text-muted-foreground hover:text-foreground"><Icon name="LogOut" size={17} /></button>
            </div>
          </header>

          {/* Desktop header */}
          <header className="hidden md:flex border-b border-border px-6 py-4 items-center justify-between shrink-0">
            <h2 className="font-display text-2xl">{TABS.find(t => t.id === activeTab)?.label}</h2>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </header>

          <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
            {error && (
              <div className="mx-4 mt-4 border border-destructive/30 bg-destructive/5 px-4 py-2 flex items-center gap-2 text-destructive text-sm">
                <Icon name="AlertTriangle" size={14} />{error}
                <button onClick={fetchRecords} className="ml-auto text-xs underline">Повторить</button>
              </div>
            )}

            <div className="p-4 md:p-6">

              {/* ===== ПРОФИЛЬ ===== */}
              {activeTab === 'home' && (
                <div className="max-w-lg mx-auto space-y-4">
                  <div className="border border-[hsl(var(--primary))]/30 bg-gradient-to-br from-[hsl(var(--primary))]/10 to-transparent p-5">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-[hsl(var(--primary))]/20 border-2 border-[hsl(var(--primary))]/40 flex items-center justify-center shrink-0">
                        <Icon name="User" size={26} className="text-[hsl(var(--primary))]" />
                      </div>
                      <div>
                        <h2 className="font-display text-2xl">{session.full_name}</h2>
                        <p className="text-xs text-muted-foreground font-mono">Логин: {session.client_id}</p>
                        {session.inn && <p className="text-xs text-muted-foreground">ИНН: {session.inn}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Баланс', val: fmtMoney(totalBalance), color: 'text-[hsl(var(--primary))]', tab: 'bank' as Tab },
                      { label: 'Предметов', val: String(inventoryRecords.length), color: 'text-foreground', tab: 'inventory' as Tab },
                      { label: 'Вклады', val: fmtMoney(totalDeposits), color: 'text-green-400', tab: 'credits' as Tab },
                      { label: 'Кредиты', val: fmtMoney(totalCredits), color: 'text-yellow-400', tab: 'credits' as Tab },
                    ].map(s => (
                      <button key={s.label} onClick={() => setActiveTab(s.tab)} className="border border-border p-4 text-left hover:border-[hsl(var(--primary))]/50 transition-colors">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
                        <p className={`font-display text-2xl ${s.color}`}>{s.val}</p>
                      </button>
                    ))}
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Быстрые действия</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { icon: 'Banknote', label: 'Оплатить', action: () => pendingTaxes.length > 0 && setPayModal({ amount: pendingTaxes[0].amount, purpose: pendingTaxes[0].tax_type, recordId: pendingTaxes[0].id }) },
                        { icon: 'Tag', label: 'Продать', action: () => { setActiveTab('shop'); setSellModal(true); setSellMsg(''); setSellErr(''); } },
                        { icon: 'ShoppingBag', label: 'Маркетплейс', action: () => setActiveTab('shop') },
                        { icon: 'CreditCard', label: 'Карта', action: () => { setActiveTab('cards'); setCardModal(true); } },
                        { icon: 'TrendingUp', label: 'Вклад', action: () => { setActiveTab('credits'); setDepositModal(true); setFormMsg(''); setFormErr(''); } },
                        { icon: 'MessageSquare', label: 'Поддержка', action: () => setActiveTab('support') },
                      ].map(a => (
                        <button key={a.label} onClick={a.action} className="border border-border p-3 flex flex-col items-center gap-1.5 hover:bg-accent hover:border-[hsl(var(--primary))]/50 transition-colors">
                          <Icon name={a.icon} size={18} className="text-[hsl(var(--primary))]" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{a.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {punishments.filter(r => r.status === 'pending').length > 0 && (
                    <div className="border border-destructive/30 bg-destructive/5 p-4">
                      <div className="flex items-center gap-2 text-destructive mb-2"><Icon name="AlertOctagon" size={15} /><p className="text-sm font-medium">Активные нарушения</p></div>
                      {punishments.filter(r => r.status === 'pending').map(r => (
                        <p key={r.id} className="text-xs text-destructive">• {r.description?.replace(/^\[(ШТРАФ|БАН|МУТ)\]\s*/, '')}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ===== МОИ АКТИВЫ ===== */}
              {activeTab === 'inventory' && (
                <div className="max-w-2xl mx-auto">
                  {loadingRecords ? <div className="text-center py-16 text-muted-foreground">Загрузка...</div>
                    : inventoryRecords.length === 0 ? (
                      <div className="text-center py-16 border border-border">
                        <p className="text-3xl mb-3">📄</p><p className="text-sm text-muted-foreground">Активов нет</p>
                        <p className="text-xs text-muted-foreground mt-1">Записи добавит администратор</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {inventoryRecords.map(r => (
                          <div key={r.id} className="border border-border p-4 hover:bg-accent/30 transition-colors">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-accent flex items-center justify-center text-xl shrink-0">{ITEM_EMOJI[r.period] || '📦'}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium truncate">{r.tax_type}</p>
                                  <span className={`text-[10px] px-1.5 py-0.5 border shrink-0 ${STATUS_COLORS[r.status] || ''}`}>{STATUS_LABELS[r.status] || r.status}</span>
                                </div>
                                <p className="text-xs text-muted-foreground capitalize mt-0.5">{r.period}</p>
                                {r.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                                <div className="flex items-center justify-between mt-2">
                                  <p className="text-xs font-mono">{fmt(r.amount)}</p>
                                  {r.status === 'pending' && (
                                    <div className="flex gap-1.5">
                                      <button onClick={() => setPayModal({ amount: r.amount, purpose: r.tax_type, recordId: r.id })}
                                        className="text-[10px] px-2 py-0.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] uppercase tracking-widest hover:opacity-90">
                                        Картой
                                      </button>
                                      <button onClick={() => handleBankPay(r.amount, r.tax_type, r.id)}
                                        className="text-[10px] px-2 py-0.5 border border-[hsl(var(--primary))]/50 text-[hsl(var(--primary))] uppercase tracking-widest hover:bg-[hsl(var(--primary))]/10">
                                        Банком
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            {r.comments?.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                                {r.comments.map(c => <p key={c.id} className="text-xs text-muted-foreground"><span className={c.author === 'Администратор' ? 'text-[hsl(var(--primary))]' : 'text-foreground'}>[{c.author}]</span> {c.comment}</p>)}
                              </div>
                            )}
                            <div className="flex gap-2 mt-2">
                              <input value={commentText[r.id] || ''} onChange={e => setCommentText(p => ({ ...p, [r.id]: e.target.value }))}
                                placeholder="Заметка..." onKeyDown={e => e.key === 'Enter' && handleAddComment(r.id)}
                                className="flex-1 bg-background border border-border px-2 py-1 text-xs focus:outline-none focus:border-[hsl(var(--primary))]" />
                              <button onClick={() => handleAddComment(r.id)} className="px-2 py-1 border border-border text-muted-foreground hover:text-foreground text-xs"><Icon name="Send" size={12} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              )}

              {/* ===== БАНК ===== */}
              {activeTab === 'bank' && (
                <div className="max-w-lg mx-auto space-y-4">
                  <div className="border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 p-5">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Общий баланс</p>
                    <p className="font-display text-4xl text-[hsl(var(--primary))]">{fmtMoney(totalBalance)}</p>
                  </div>
                  {bankRecords.length === 0 ? (
                    <div className="text-center py-10 border border-border">
                      <p className="text-3xl mb-2">🏦</p><p className="text-sm text-muted-foreground">Счётов нет. Обратитесь к администратору.</p>
                    </div>
                  ) : bankRecords.map(acc => (
                    <div key={acc.id} className="border border-border p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2"><Icon name="Landmark" size={16} className="text-[hsl(var(--primary))]" /><p className="text-sm font-medium">{acc.tax_type}</p></div>
                        <span className={`text-[10px] px-1.5 py-0.5 border ${STATUS_COLORS[acc.status] || ''}`}>{STATUS_LABELS[acc.status] || acc.status}</span>
                      </div>
                      <p className="font-display text-2xl">{fmtMoney(acc.amount)}</p>
                      {acc.description && <p className="text-xs text-muted-foreground mt-1">{acc.description}</p>}
                      <button onClick={() => setPayModal({ amount: 0, purpose: 'Пополнение счёта' })}
                        className="mt-3 px-3 py-1.5 border border-[hsl(var(--primary))]/50 text-[hsl(var(--primary))] text-[10px] uppercase tracking-widest hover:bg-[hsl(var(--primary))]/10 flex items-center gap-1">
                        <Icon name="Plus" size={11} />Пополнить
                      </button>
                    </div>
                  ))}
                  {!loadingFinance && history.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Операции</p>
                      <div className="border border-border overflow-hidden">
                        {history.slice(0, 8).map((h, idx) => (
                          <div key={h.id} className={`px-4 py-3 flex items-center justify-between hover:bg-accent ${idx < history.length - 1 ? 'border-b border-border' : ''}`}>
                            <div><p className="text-sm">{h.description}</p><p className="text-[10px] text-muted-foreground">{fmtDate(h.occurred_at)}</p></div>
                            {h.amount != null && <p className={`text-sm font-mono ${h.amount > 0 ? 'text-green-400' : 'text-destructive'}`}>{h.amount > 0 ? '+' : ''}{fmt(h.amount)}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ===== ФИНАНСЫ ===== */}
              {activeTab === 'credits' && (
                <div className="max-w-lg mx-auto space-y-5">
                  {/* Вклады */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Icon name="TrendingUp" size={12} />Вклады</p>
                      <button onClick={() => { setDepositModal(true); setFormMsg(''); setFormErr(''); }} className="text-[10px] text-[hsl(var(--primary))] uppercase tracking-widest flex items-center gap-1 hover:opacity-80"><Icon name="Plus" size={11} />Открыть</button>
                    </div>
                    {loadingFinance ? <div className="text-center py-4 text-muted-foreground text-sm border border-border">Загрузка...</div>
                      : deposits.length === 0 ? <div className="text-center py-6 border border-border"><p className="text-sm text-muted-foreground">Вкладов нет</p><button onClick={() => { setDepositModal(true); setFormMsg(''); setFormErr(''); }} className="text-xs text-[hsl(var(--primary))] mt-1">+ Открыть вклад</button></div>
                        : deposits.map(d => (
                          <div key={d.id} className="border border-border p-4 mb-2">
                            <div className="flex items-center justify-between"><p className="text-sm font-medium">{d.title}</p><span className={`text-[10px] px-1.5 py-0.5 border ${STATUS_COLORS[d.status] || ''}`}>{STATUS_LABELS[d.status] || d.status}</span></div>
                            <p className="font-display text-2xl text-green-400 mt-1">{fmtMoney(d.amount)}</p>
                            <p className="text-xs text-muted-foreground mt-1">{d.description}</p>
                          </div>
                        ))}
                  </div>
                  {/* Кредиты */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Icon name="Wallet" size={12} />Кредиты</p>
                      <button onClick={() => { setCreditModal(true); setFormMsg(''); setFormErr(''); }} className="text-[10px] text-[hsl(var(--primary))] uppercase tracking-widest flex items-center gap-1 hover:opacity-80"><Icon name="Plus" size={11} />Заявка</button>
                    </div>
                    {loadingFinance ? <div className="text-center py-4 text-muted-foreground text-sm border border-border">Загрузка...</div>
                      : credits.length === 0 ? <div className="text-center py-6 border border-border"><p className="text-sm text-muted-foreground">Кредитов нет</p><button onClick={() => { setCreditModal(true); setFormMsg(''); setFormErr(''); }} className="text-xs text-[hsl(var(--primary))] mt-1">+ Подать заявку</button></div>
                        : credits.map(c => (
                          <div key={c.id} className="border border-border p-4 mb-2">
                            <div className="flex items-center justify-between"><p className="text-sm font-medium">{c.title}</p><span className={`text-[10px] px-1.5 py-0.5 border ${STATUS_COLORS[c.status] || ''}`}>{STATUS_LABELS[c.status] || c.status}</span></div>
                            <p className="font-display text-2xl text-yellow-400 mt-1">{fmtMoney(c.amount)}</p>
                            <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                            {(c.status === 'approved' || c.status === 'pending') && (
                              <button onClick={() => setPayModal({ amount: c.amount, purpose: `Погашение: ${c.title}`, recordId: c.id })}
                                className="mt-2 px-3 py-1 text-[10px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] uppercase tracking-widest hover:opacity-90">Погасить</button>
                            )}
                          </div>
                        ))}
                  </div>
                  {/* История платежей */}
                  {payments.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">История платежей</p>
                      <div className="border border-border overflow-hidden">
                        {payments.map((p, idx) => (
                          <div key={p.id} className={`px-4 py-3 flex items-center justify-between hover:bg-accent ${idx < payments.length - 1 ? 'border-b border-border' : ''}`}>
                            <div><p className="text-sm">{p.purpose}</p><p className="text-[10px] text-muted-foreground">{fmtDate(p.created_at)}</p></div>
                            <p className="text-sm font-mono text-destructive shrink-0">−{fmtMoney(p.amount)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ===== КАРТЫ ===== */}
              {activeTab === 'cards' && (
                <div className="max-w-lg mx-auto space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Мои карты</p>
                    <button onClick={() => { setCardModal(true); setFormMsg(''); setFormErr(''); }} className="text-[10px] text-[hsl(var(--primary))] uppercase tracking-widest flex items-center gap-1 hover:opacity-80"><Icon name="Plus" size={11} />Оформить</button>
                  </div>
                  {loadingFinance ? <div className="text-center py-10 text-muted-foreground text-sm border border-border">Загрузка...</div>
                    : cards.length === 0 ? (
                      <div className="text-center py-12 border border-border">
                        <p className="text-4xl mb-3">💳</p><p className="text-sm text-muted-foreground">Карт нет</p>
                        <button onClick={() => { setCardModal(true); setFormMsg(''); setFormErr(''); }} className="mt-3 text-xs text-[hsl(var(--primary))] uppercase tracking-widest">+ Оформить карту</button>
                      </div>
                    ) : cards.map(card => (
                      <div key={card.id} className="relative overflow-hidden border border-[hsl(var(--primary))]/30 bg-gradient-to-br from-[hsl(var(--primary))]/15 to-[hsl(var(--primary))]/5 p-5">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-[hsl(var(--primary))]/10 rounded-full -translate-y-4 translate-x-4" />
                        <div className="flex items-start justify-between mb-4">
                          <Icon name="Wallet" size={24} className="text-[hsl(var(--primary))]" />
                          <span className={`text-[10px] px-1.5 py-0.5 border ${STATUS_COLORS[card.status] || ''}`}>{STATUS_LABELS[card.status] || card.status}</span>
                        </div>
                        <p className="font-mono text-lg tracking-widest mb-3">{card.card_number}</p>
                        <div className="flex items-end justify-between">
                          <div><p className="text-[10px] text-muted-foreground uppercase">Баланс</p><p className="font-display text-xl text-[hsl(var(--primary))]">{fmtMoney(card.balance)}</p></div>
                          <p className="text-xs text-muted-foreground">{card.description}</p>
                        </div>
                        <button onClick={() => setPayModal({ amount: 0, purpose: 'Пополнение карты' })}
                          className="mt-3 w-full py-2 border border-[hsl(var(--primary))]/40 text-[hsl(var(--primary))] text-[10px] uppercase tracking-widest hover:bg-[hsl(var(--primary))]/10 flex items-center justify-center gap-1">
                          <Icon name="Plus" size={11} />Пополнить
                        </button>
                      </div>
                    ))}
                  {formMsg && <p className="text-green-400 text-sm border-l-2 border-green-400 pl-3">{formMsg}</p>}
                  {formErr && <p className="text-destructive text-sm border-l-2 border-destructive pl-3">{formErr}</p>}
                </div>
              )}

              {/* ===== МАРКЕТПЛЕЙС ===== */}
              {activeTab === 'shop' && (
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Маркетплейс</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => { setSellModal(true); setSellMsg(''); setSellErr(''); }}
                        className="flex items-center gap-1.5 text-[10px] text-[hsl(var(--primary))] uppercase tracking-widest hover:opacity-80 border border-[hsl(var(--primary))]/40 px-3 py-1.5">
                        <Icon name="Plus" size={12} />Разместить объявление
                      </button>
                      <button onClick={fetchShop} className="text-muted-foreground hover:text-foreground"><Icon name="RefreshCw" size={14} /></button>
                    </div>
                  </div>
                  {loadingShop ? <div className="text-center py-16 text-muted-foreground">Загрузка каталога...</div>
                    : products.length === 0 ? (
                      <div className="text-center py-16 border border-border">
                        <p className="text-4xl mb-3">🛒</p><p className="text-sm text-muted-foreground">Товаров пока нет</p>
                        <p className="text-xs text-muted-foreground mt-1">Администратор скоро добавит товары</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {products.map(p => <ProductCard key={p.id} product={p} onOrder={p => setOrderModal(p)} />)}
                      </div>
                    )}
                  {orders.length > 0 && (
                    <div className="mt-6">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Мои заказы</p>
                      <div className="border border-border overflow-hidden">
                        {orders.map((o, idx) => (
                          <div key={o.id} className={`px-4 py-3 hover:bg-accent ${idx < orders.length - 1 ? 'border-b border-border' : ''}`}>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-medium">Заказ #{o.id}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 border ${STATUS_COLORS[o.status] || ''}`}>{STATUS_LABELS[o.status] || o.status}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{o.items}</p>
                            <p className="text-xs text-muted-foreground truncate">📍 {o.address}</p>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-xs font-mono text-[hsl(var(--primary))]">{fmtMoney(o.total)}</p>
                              <p className="text-[10px] text-muted-foreground">{fmtDate(o.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ===== ПОДДЕРЖКА ===== */}
              {activeTab === 'support' && (
                <div className="max-w-lg mx-auto flex flex-col" style={{ minHeight: '60vh' }}>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Чат с администрацией</p>
                  <div className="flex-1 border border-border overflow-y-auto p-4 space-y-3 bg-card" style={{ maxHeight: '60vh' }}>
                    {loadingSupport ? <div className="text-center py-10 text-sm text-muted-foreground">Загрузка...</div>
                      : supportMsgs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <p className="text-3xl mb-2">💬</p><p className="text-sm text-muted-foreground">Напишите нам!</p>
                        </div>
                      ) : supportMsgs.map(msg => (
                        <div key={msg.id} className={`flex ${msg.author === 'client' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-xs px-3 py-2 ${msg.author === 'client' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-accent text-foreground border border-border'}`}>
                            <p className="text-sm">{msg.message}</p>
                            <p className={`text-[10px] mt-0.5 ${msg.author === 'client' ? 'text-[hsl(var(--primary-foreground))]/70' : 'text-muted-foreground'}`}>
                              {msg.author === 'client' ? 'Вы' : '👑 Админ'} · {fmtTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={handleSendSupport} className="flex gap-2 mt-3">
                    <input value={supportText} onChange={e => setSupportText(e.target.value)} placeholder="Ваш вопрос..."
                      className="flex-1 bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-[hsl(var(--primary))]" disabled={supportSending} />
                    <button type="submit" disabled={supportSending || !supportText.trim()} className="px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50">
                      <Icon name="Send" size={16} />
                    </button>
                  </form>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[hsl(var(--sidebar-background))] border-t border-border flex items-stretch">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2 px-1 relative transition-colors ${activeTab === t.id ? 'text-[hsl(var(--primary))]' : 'text-muted-foreground'}`}>
            {navBadge(t.id) && (
              <span className="absolute top-1 right-1/2 translate-x-3 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">{navBadge(t.id)}</span>
            )}
            <Icon name={t.icon} size={18} />
            <span className="text-[9px] mt-0.5 uppercase tracking-widest leading-none">{t.mobileLabel}</span>
          </button>
        ))}
      </nav>

      {/* Modals */}
      {payModal && (
        <PaymentModal amount={payModal.amount} purpose={payModal.purpose} recordId={payModal.recordId}
          userId={session.user_id} onClose={() => setPayModal(null)} onSuccess={() => { fetchRecords(); fetchFinance(); }} />
      )}
      {orderModal && (
        <OrderModal product={orderModal} userId={session.user_id} onClose={() => setOrderModal(null)} onSuccess={() => { setOrderModal(null); fetchShop(); }} />
      )}

      {/* Кредит */}
      {creditModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-none p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-xl">Заявка на кредит</h3>
              <button onClick={() => setCreditModal(false)} className="text-muted-foreground hover:text-foreground"><Icon name="X" size={20} /></button>
            </div>
            <form onSubmit={handleCreditApply} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Тип кредита</label>
                <select value={creditForm.title} onChange={e => setCreditForm(p => ({ ...p, title: e.target.value }))} className="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-[hsl(var(--primary))]">
                  <option>Кредит наличными</option><option>Потребительский кредит</option><option>Кредит на технику</option><option>Микрозайм</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Сумма ₽</label>
                <input type="number" value={creditForm.amount} onChange={e => setCreditForm(p => ({ ...p, amount: e.target.value }))} placeholder="50 000" required className="w-full bg-background border border-border px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))]" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Цель</label>
                <input value={creditForm.description} onChange={e => setCreditForm(p => ({ ...p, description: e.target.value }))} placeholder="Ремонт, покупка..." className="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-[hsl(var(--primary))]" />
              </div>
              {formErr && <p className="text-destructive text-xs border-l-2 border-destructive pl-2">{formErr}</p>}
              {formMsg && <p className="text-green-400 text-xs border-l-2 border-green-400 pl-2">{formMsg}</p>}
              <button type="submit" disabled={formLoading} className="w-full py-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold uppercase tracking-widest hover:opacity-90 disabled:opacity-50">
                {formLoading ? 'Отправка...' : 'Отправить заявку'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Вклад */}
      {depositModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-none p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-xl">Открыть вклад</h3>
              <button onClick={() => setDepositModal(false)} className="text-muted-foreground hover:text-foreground"><Icon name="X" size={20} /></button>
            </div>
            <form onSubmit={handleDepositOpen} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Тип вклада</label>
                <select value={depositForm.title} onChange={e => setDepositForm(p => ({ ...p, title: e.target.value }))} className="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-[hsl(var(--primary))]">
                  <option>Вклад «Стабильный»</option><option>Вклад «Доходный»</option><option>Вклад «До востребования»</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Сумма ₽</label>
                <input type="number" value={depositForm.amount} onChange={e => setDepositForm(p => ({ ...p, amount: e.target.value }))} placeholder="100 000" required className="w-full bg-background border border-border px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Срок</label>
                  <select value={depositForm.duration} onChange={e => setDepositForm(p => ({ ...p, duration: e.target.value }))} className="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-[hsl(var(--primary))]">
                    <option>3 мес.</option><option>6 мес.</option><option>12 мес.</option><option>24 мес.</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Ставка %</label>
                  <input value={depositForm.rate} onChange={e => setDepositForm(p => ({ ...p, rate: e.target.value }))} placeholder="7" className="w-full bg-background border border-border px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))]" />
                </div>
              </div>
              {depositForm.amount && Number(depositForm.amount) > 0 && (
                <div className="p-3 bg-green-400/10 border border-green-400/30 text-xs text-green-400">
                  Доход за {depositForm.duration}: +{fmtMoney(parseFloat(depositForm.amount) * parseFloat(depositForm.rate || '0') / 100 / 12 * parseInt(depositForm.duration))}
                </div>
              )}
              {formErr && <p className="text-destructive text-xs border-l-2 border-destructive pl-2">{formErr}</p>}
              {formMsg && <p className="text-green-400 text-xs border-l-2 border-green-400 pl-2">{formMsg}</p>}
              <button type="submit" disabled={formLoading} className="w-full py-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold uppercase tracking-widest hover:opacity-90 disabled:opacity-50">
                {formLoading ? 'Открываем...' : 'Открыть вклад'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Карта */}
      {cardModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-none p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-xl">Оформить карту</h3>
              <button onClick={() => setCardModal(false)} className="text-muted-foreground hover:text-foreground"><Icon name="X" size={20} /></button>
            </div>
            <div className="space-y-3">
              {[
                { v: 'Стандартная', d: 'Бесплатно · 0 ₽/мес.' },
                { v: 'Премиум', d: 'Кешбэк 3% · 299 ₽/мес.' },
                { v: 'Золотая', d: 'Кешбэк 5% · 599 ₽/мес.' },
                { v: 'Виртуальная', d: 'Только онлайн · Бесплатно' },
              ].map(o => (
                <button key={o.v} onClick={() => setCardType(o.v)}
                  className={`w-full p-3 text-left border transition-colors ${cardType === o.v ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'border-border hover:bg-accent'}`}>
                  <p className="text-sm font-medium">{o.v}</p>
                  <p className="text-xs text-muted-foreground">{o.d}</p>
                </button>
              ))}
              {formErr && <p className="text-destructive text-xs border-l-2 border-destructive pl-2">{formErr}</p>}
              <button onClick={handleCardApply} disabled={formLoading} className="w-full py-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold uppercase tracking-widest hover:opacity-90 disabled:opacity-50">
                {formLoading ? 'Оформляем...' : 'Оформить карту'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка: разместить объявление о продаже */}
      {sellModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-none p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-xl">Разместить объявление</h3>
              <button onClick={() => setSellModal(false)} className="text-muted-foreground hover:text-foreground"><Icon name="X" size={20} /></button>
            </div>
            <form onSubmit={handleSellProduct} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Название *</label>
                <input value={sellForm.name} onChange={e => setSellForm(p => ({ ...p, name: e.target.value }))} placeholder="Квартира, автомобиль, ноутбук..." required
                  className="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-[hsl(var(--primary))]" disabled={sellLoading} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Цена ₽ *</label>
                  <input type="number" value={sellForm.price} onChange={e => setSellForm(p => ({ ...p, price: e.target.value }))} placeholder="0" required
                    className="w-full bg-background border border-border px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))]" disabled={sellLoading} />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Категория</label>
                  <select value={sellForm.category} onChange={e => setSellForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-[hsl(var(--primary))]" disabled={sellLoading}>
                    <option value="realestate">Недвижимость</option>
                    <option value="vehicle">Транспорт</option>
                    <option value="electronics">Электроника</option>
                    <option value="clothing">Одежда</option>
                    <option value="other">Другое</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Описание</label>
                <textarea value={sellForm.description} onChange={e => setSellForm(p => ({ ...p, description: e.target.value }))} rows={3}
                  placeholder="Подробное описание товара, состояние, характеристики..."
                  className="w-full bg-background border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:border-[hsl(var(--primary))]" disabled={sellLoading} />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Ссылка на фото</label>
                <input value={sellForm.image_url} onChange={e => setSellForm(p => ({ ...p, image_url: e.target.value }))} placeholder="https://..."
                  className="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-[hsl(var(--primary))]" disabled={sellLoading} />
              </div>
              {sellErr && <p className="text-destructive text-xs border-l-2 border-destructive pl-2">{sellErr}</p>}
              {sellMsg && (
                <div className="flex items-center gap-2 text-green-400 text-sm border border-green-400/30 bg-green-400/10 px-3 py-2">
                  <Icon name="Check" size={15} />{sellMsg}
                  <button type="button" onClick={() => { setSellModal(false); setSellMsg(''); }} className="ml-auto text-xs underline">Закрыть</button>
                </div>
              )}
              {!sellMsg && (
                <button type="submit" disabled={sellLoading}
                  className="w-full py-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold uppercase tracking-widest hover:opacity-90 disabled:opacity-50">
                  {sellLoading ? 'Публикуем...' : 'Опубликовать объявление'}
                </button>
              )}
              <p className="text-[10px] text-muted-foreground text-center">Объявление проходит модерацию администратора</p>
            </form>
          </div>
        </div>
      )}

      {/* Модалка: оплата через банковский счёт */}
      {bankPayModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-none p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-xl">Оплата через банк</h3>
              <button onClick={() => setBankPayModal(null)} className="text-muted-foreground hover:text-foreground"><Icon name="X" size={20} /></button>
            </div>
            <div className="border border-border p-4 mb-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Назначение</p>
              <p className="text-sm font-medium">{bankPayModal.purpose}</p>
              <p className="font-display text-2xl text-[hsl(var(--primary))] mt-2">{fmtMoney(bankPayModal.amount)}</p>
            </div>
            {bankRecords.length > 0 ? (
              <>
                <div className="border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 p-3 mb-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Счёт списания</p>
                  <p className="text-sm font-medium">{bankRecords[0].tax_type}</p>
                  <p className="text-xs text-muted-foreground">Баланс: {fmtMoney(bankRecords[0].amount)}</p>
                  {bankRecords[0].amount < bankPayModal.amount && (
                    <p className="text-xs text-destructive mt-1">⚠ Недостаточно средств на счёте</p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={confirmBankPay} disabled={bankRecords[0].amount < bankPayModal.amount}
                    className="flex-1 py-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold uppercase tracking-widest hover:opacity-90 disabled:opacity-50">
                    Подтвердить
                  </button>
                  <button onClick={() => setBankPayModal(null)} className="px-4 py-3 border border-border text-muted-foreground text-xs uppercase tracking-widest hover:bg-accent">
                    Отмена
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">Нет банковских счетов</p>
                <button onClick={() => { setBankPayModal(null); setActiveTab('bank'); }} className="text-xs text-[hsl(var(--primary))] mt-2 hover:opacity-80">Перейти в Счета</button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}