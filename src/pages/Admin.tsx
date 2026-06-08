import { useState, useCallback, useEffect, useRef } from 'react';
import Icon from '@/components/ui/icon';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ADMIN_URL = 'https://functions.poehali.dev/8350a22d-3a83-499b-a43c-72d06295b607';
const SUPPORT_URL = 'https://functions.poehali.dev/c44f54ad-be34-4ae2-8daf-d5256223c92e';

interface User { id: number; client_id: string; full_name: string; inn: string | null; created_at: string; records_count: number; }
interface TaxRecord { id: number; tax_type: string; period: string; amount: number; status: string; due_date: string | null; description: string | null; created_at: string; }
interface Stats { paid_month: number; paid_year: number; paid_total: number; pending_total: number; overdue_total: number; clients_count: number; status_counts: Record<string, number>; unread_support: number; monthly: { month: string; total: number }[]; }
interface SupportMsg { id: number; author: string; message: string; is_read: boolean; created_at: string; }
interface Dialog { user_id: number; client_id: string; full_name: string; last_msg: string | null; last_at: string | null; unread: number; }
interface Note { id: number; user_id: number | null; title: string; content: string; color: string; created_at: string; }
interface Fine { id: number; user_id: number; tax_record_id: number | null; reason: string; amount: number; status: string; due_date: string | null; created_at: string; tax_type: string | null; period: string | null; }
interface ReportRow { full_name: string; client_id: string; inn: string | null; tax_type: string; period: string; amount: number; status: string; due_date: string | null; description: string | null; fine_amount: number; }
interface SummaryRow { full_name: string; client_id: string; inn: string | null; records_count: number; paid: number; pending: number; overdue: number; fines: number; }

const STATUS_LABELS: Record<string, string> = { pending: 'Ожидает', paid: 'Оплачен', overdue: 'Просрочен', cancelled: 'Отменён' };
const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  paid: 'text-green-700 bg-green-50 border-green-200',
  overdue: 'text-red-600 bg-red-50 border-red-200',
  cancelled: 'text-muted-foreground bg-muted border-border',
};
const NOTE_COLORS: Record<string, string> = {
  yellow: 'bg-yellow-50 border-yellow-200',
  blue: 'bg-blue-50 border-blue-200',
  green: 'bg-green-50 border-green-200',
  red: 'bg-red-50 border-red-200',
  purple: 'bg-purple-50 border-purple-200',
};
const FINE_STATUS: Record<string, string> = { unpaid: 'Не оплачен', paid: 'Оплачен', cancelled: 'Отменён' };
const FINE_COLORS: Record<string, string> = { unpaid: 'text-red-600 bg-red-50 border-red-200', paid: 'text-green-700 bg-green-50 border-green-200', cancelled: 'text-muted-foreground bg-muted border-border' };

const fmt = (n: number) => n.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const fmtDate = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (s: string) => new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const fmtShort = (s: string) => new Date(s).toLocaleDateString('ru-RU');

type AdminTab = 'dashboard' | 'clients' | 'notes' | 'fines' | 'calc' | 'report' | 'support' | 'shop' | 'orders';

const TABS: { id: AdminTab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: 'LayoutDashboard' },
  { id: 'clients', label: 'Пользователи', icon: 'Users' },
  { id: 'fines', label: 'Штрафы', icon: 'AlertOctagon' },
  { id: 'shop', label: 'Магазин', icon: 'ShoppingBag' },
  { id: 'orders', label: 'Заказы', icon: 'PackageCheck' },
  { id: 'notes', label: 'Заметки', icon: 'StickyNote' },
  { id: 'calc', label: 'Калькулятор', icon: 'Calculator' },
  { id: 'report', label: 'Отчёт', icon: 'FileBarChart' },
  { id: 'support', label: 'Поддержка', icon: 'MessageSquare' },
];

const EMPTY_TAX = { tax_type: '', period: '', amount: '', status: 'pending', due_date: '', description: '' };

export default function Admin() {
  const [password, setPassword] = useState(() => sessionStorage.getItem('admin_pwd') || '');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Users & records
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userForm, setUserForm] = useState({ client_id: '', password: '', full_name: '', inn: '' });
  const [userErr, setUserErr] = useState(''); const [userOk, setUserOk] = useState(''); const [userSaving, setUserSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [records, setRecords] = useState<TaxRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [taxForm, setTaxForm] = useState(EMPTY_TAX);
  const [taxErr, setTaxErr] = useState(''); const [taxOk, setTaxOk] = useState(''); const [taxSaving, setTaxSaving] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<number | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<number | null>(null);

  // Stats
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: '', content: '', color: 'yellow', user_id: '' });
  const [noteSaving, setNoteSaving] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // Fines
  const [fines, setFines] = useState<Fine[]>([]);
  const [finesLoading, setFinesLoading] = useState(false);
  const [fineForm, setFineForm] = useState({ user_id: '', tax_record_id: '', reason: '', amount: '', due_date: '' });
  const [fineSaving, setFineSaving] = useState(false);
  const [fineErr, setFineErr] = useState(''); const [fineOk, setFineOk] = useState('');

  // Report
  const [reportMode, setReportMode] = useState<'summary' | 'client'>('summary');
  const [reportUserId, setReportUserId] = useState('');
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  // Support
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [dialogsLoading, setDialogsLoading] = useState(false);
  const [selectedDialog, setSelectedDialog] = useState<Dialog | null>(null);
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Shop / Orders
  interface AdminProduct { id: number; name: string; price: number; status: string; image_url: string | null; description: string; }
  interface AdminOrder { id: number; user_id: number; items: string; total: number; status: string; address: string; description: string; created_at: string; }
  const [shopProducts, setShopProducts] = useState<AdminProduct[]>([]);
  const [shopOrders, setShopOrders] = useState<AdminOrder[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [productForm, setProductForm] = useState({ name: '', price: '', description: '', image_url: '' });
  const [productSaving, setProductSaving] = useState(false);
  const [productMsg, setProductMsg] = useState('');
  const [productErr, setProductErr] = useState('');

  // Calculator
  const [calcBase, setCalcBase] = useState('');
  const [calcRate, setCalcRate] = useState('');
  const [calcDays, setCalcDays] = useState('');
  const [calcType, setCalcType] = useState('percent');

  const ah = useCallback(() => ({ 'X-Admin-Password': password }), [password]);

  const fetchUsers = useCallback(async (pwd: string) => {
    setLoadingUsers(true);
    const r = await fetch(ADMIN_URL, { headers: { 'X-Admin-Password': pwd } });
    const d = await r.json();
    setLoadingUsers(false);
    return { ok: r.ok, data: d };
  }, []);

  const refreshUsers = useCallback(async () => {
    const { data } = await fetchUsers(password);
    setUsers(data.users || []);
  }, [password, fetchUsers]);

  const fetchRecords = useCallback(async (uid: number) => {
    setRecordsLoading(true);
    const r = await fetch(`${ADMIN_URL}?user_id=${uid}`, { headers: ah() });
    const d = await r.json();
    setRecords(d.records || []);
    setRecordsLoading(false);
  }, [ah]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    const r = await fetch(`${ADMIN_URL}?action=stats`, { headers: ah() });
    setStats(await r.json());
    setStatsLoading(false);
  }, [ah]);

  const fetchNotes = useCallback(async () => {
    setNotesLoading(true);
    const r = await fetch(`${ADMIN_URL}?action=notes`, { headers: ah() });
    const d = await r.json();
    setNotes(d.notes || []);
    setNotesLoading(false);
  }, [ah]);

  const fetchFines = useCallback(async () => {
    setFinesLoading(true);
    const r = await fetch(`${ADMIN_URL}?action=fines`, { headers: ah() });
    const d = await r.json();
    setFines(d.fines || []);
    setFinesLoading(false);
  }, [ah]);

  const fetchDialogs = useCallback(async () => {
    setDialogsLoading(true);
    const r = await fetch(SUPPORT_URL, { headers: ah() });
    const d = await r.json();
    setDialogs(d.dialogs || []);
    setDialogsLoading(false);
  }, [ah]);

  const fetchMessages = useCallback(async (uid: number) => {
    setMessagesLoading(true);
    const r = await fetch(`${SUPPORT_URL}?user_id=${uid}`, { headers: ah() });
    const d = await r.json();
    setMessages(d.messages || []);
    setMessagesLoading(false);
    setDialogs(prev => prev.map(d => d.user_id === uid ? { ...d, unread: 0 } : d));
  }, [ah]);

  const CABINET_URL_ADMIN = 'https://functions.poehali.dev/55da48e4-e0f4-4cea-ad0c-d80ea71302b9';

  const fetchShopAdmin = useCallback(async () => {
    setShopLoading(true);
    try {
      const [prod, ord] = await Promise.all([
        fetch(`${CABINET_URL_ADMIN}?action=catalog`).then(r => r.json()),
        fetch(`${ADMIN_URL}?action=orders`, { headers: ah() }).then(r => r.json()).catch(() => ({ orders: [] })),
      ]);
      setShopProducts(prod.products || []);
      setShopOrders(ord.orders || []);
    } catch { /* ignore */ }
    setShopLoading(false);
  }, [ah]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault(); setProductMsg(''); setProductErr(''); setProductSaving(true);
    try {
      const r = await fetch(ADMIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ah(), 'X-Action': 'add_tax_record' },
        body: JSON.stringify({
          user_id: null,
          tax_type: '__product__',
          period: productForm.name,
          amount: parseFloat(productForm.price),
          status: 'pending',
          due_date: productForm.image_url || null,
          description: productForm.description,
        }),
      });
      const d = await r.json();
      if (d.success) { setProductMsg('Товар добавлен!'); setProductForm({ name: '', price: '', description: '', image_url: '' }); fetchShopAdmin(); }
      else setProductErr(d.error || 'Ошибка');
    } catch { setProductErr('Ошибка соединения'); }
    setProductSaving(false);
  };

  const handleDeleteProduct = async (id: number) => {
    await fetch(ADMIN_URL, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...ah(), 'X-Action': 'delete_tax_record' }, body: JSON.stringify({ record_id: id }) });
    fetchShopAdmin();
  };

  const handleUpdateOrderStatus = async (orderId: number, status: string) => {
    await fetch(ADMIN_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...ah() }, body: JSON.stringify({ record_id: orderId, status }) });
    fetchShopAdmin();
  };

  useEffect(() => {
    if (!authed) return;
    if (activeTab === 'dashboard') fetchStats();
    if (activeTab === 'notes') fetchNotes();
    if (activeTab === 'fines') fetchFines();
    if (activeTab === 'support') fetchDialogs();
    if (activeTab === 'report') loadSummary();
    if (activeTab === 'shop' || activeTab === 'orders') fetchShopAdmin();
  }, [authed, activeTab]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthError(''); setAuthLoading(true);
    const { ok, data } = await fetchUsers(password);
    setAuthLoading(false);
    if (!ok) { setAuthError('Неверный пароль'); return; }
    sessionStorage.setItem('admin_pwd', password);
    setUsers(data.users || []);
    setAuthed(true);
  };

  const openUser = (u: User) => { setSelectedUser(u); setTaxForm(EMPTY_TAX); setTaxErr(''); setTaxOk(''); fetchRecords(u.id); };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault(); setUserErr(''); setUserOk(''); setUserSaving(true);
    const r = await fetch(ADMIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ah() }, body: JSON.stringify(userForm) });
    const d = await r.json(); setUserSaving(false);
    if (!r.ok) { setUserErr(d.error || 'Ошибка'); } else { setUserOk(`Пользователь ${userForm.client_id} добавлен`); setUserForm({ client_id: '', password: '', full_name: '', inn: '' }); refreshUsers(); }
  };

  const handleAddTax = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selectedUser) return;
    setTaxErr(''); setTaxOk(''); setTaxSaving(true);
    const r = await fetch(ADMIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ah(), 'X-Action': 'add_tax_record' }, body: JSON.stringify({ ...taxForm, user_id: selectedUser.id, amount: parseFloat(taxForm.amount) }) });
    const d = await r.json(); setTaxSaving(false);
    if (!r.ok) { setTaxErr(d.error || 'Ошибка'); } else { setTaxOk('Запись добавлена'); setTaxForm(EMPTY_TAX); fetchRecords(selectedUser.id); refreshUsers(); }
  };

  const handleUpdateStatus = async (rid: number, s: string) => {
    setUpdatingStatus(rid);
    await fetch(ADMIN_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...ah() }, body: JSON.stringify({ record_id: rid, status: s }) });
    setUpdatingStatus(null);
    setRecords(prev => prev.map(r => r.id === rid ? { ...r, status: s } : r));
  };

  const handleDeleteRecord = async (rid: number) => {
    setDeletingRecord(rid);
    await fetch(ADMIN_URL, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...ah(), 'X-Action': 'delete_tax_record' }, body: JSON.stringify({ record_id: rid }) });
    setDeletingRecord(null);
    if (selectedUser) fetchRecords(selectedUser.id);
    refreshUsers();
  };

  const handleDeleteUser = async (u: User) => {
    setDeletingUser(u.id);
    await fetch(ADMIN_URL, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...ah() }, body: JSON.stringify({ user_id: u.id }) });
    setDeletingUser(null); setConfirmDeleteUser(null);
    if (selectedUser?.id === u.id) setSelectedUser(null);
    refreshUsers();
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault(); setNoteSaving(true);
    await fetch(ADMIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ah(), 'X-Action': 'add_note' }, body: JSON.stringify({ ...noteForm, user_id: noteForm.user_id || null }) });
    setNoteSaving(false); setNoteForm({ title: '', content: '', color: 'yellow', user_id: '' }); fetchNotes();
  };

  const handleDeleteNote = async (id: number) => {
    await fetch(ADMIN_URL, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...ah(), 'X-Action': 'delete_note' }, body: JSON.stringify({ note_id: id }) });
    fetchNotes();
  };

  const handleSaveNote = async () => {
    if (!editingNote) return;
    await fetch(ADMIN_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...ah(), 'X-Action': 'update_note' }, body: JSON.stringify({ note_id: editingNote.id, title: editingNote.title, content: editingNote.content, color: editingNote.color }) });
    setEditingNote(null); fetchNotes();
  };

  const handleAddFine = async (e: React.FormEvent) => {
    e.preventDefault(); setFineErr(''); setFineOk(''); setFineSaving(true);
    const r = await fetch(ADMIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ah(), 'X-Action': 'add_fine' }, body: JSON.stringify({ ...fineForm, tax_record_id: fineForm.tax_record_id || null, amount: parseFloat(fineForm.amount) }) });
    const d = await r.json(); setFineSaving(false);
    if (!r.ok) { setFineErr(d.error || 'Ошибка'); } else { setFineOk('Штраф назначен'); setFineForm({ user_id: '', tax_record_id: '', reason: '', amount: '', due_date: '' }); fetchFines(); }
  };

  const handleUpdateFine = async (id: number, status: string) => {
    await fetch(ADMIN_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...ah(), 'X-Action': 'update_fine' }, body: JSON.stringify({ fine_id: id, status }) });
    fetchFines();
  };

  const handleDeleteFine = async (id: number) => {
    await fetch(ADMIN_URL, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...ah(), 'X-Action': 'delete_fine' }, body: JSON.stringify({ fine_id: id }) });
    fetchFines();
  };

  const loadSummary = async () => {
    setReportLoading(true);
    const r = await fetch(`${ADMIN_URL}?action=report`, { headers: ah() });
    const d = await r.json();
    setSummaryData(d.summary || []);
    setReportLoading(false);
  };

  const loadClientReport = async () => {
    if (!reportUserId) return;
    setReportLoading(true);
    const r = await fetch(`${ADMIN_URL}?action=report&user_id=${reportUserId}`, { headers: ah() });
    const d = await r.json();
    setReportData(d.report || []);
    setReportLoading(false);
    setReportMode('client');
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selectedDialog || !replyText.trim()) return;
    setReplySending(true);
    await fetch(SUPPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ah() }, body: JSON.stringify({ user_id: selectedDialog.user_id, message: replyText.trim() }) });
    setReplyText(''); setReplySending(false);
    fetchMessages(selectedDialog.user_id);
  };

  // ============ PDF ============
  const fmtRub = (n: number) => `${n.toLocaleString('ru-RU')} руб.`;

  const downloadReport = () => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('ru-RU');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Налоговый отчёт', 14, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Дата формирования: ${dateStr}`, 14, 28);

    if (reportMode === 'summary') {
      // Итоговые строки перед таблицей
      const totalPaid = summaryData.reduce((s, r) => s + r.paid, 0);
      const totalPending = summaryData.reduce((s, r) => s + r.pending, 0);
      const totalOverdue = summaryData.reduce((s, r) => s + r.overdue, 0);
      const totalFines = summaryData.reduce((s, r) => s + r.fines, 0);
      doc.setFontSize(9);
      doc.text(`Всего пользователей: ${summaryData.length}`, 14, 36);
      doc.text(`Итого оплачено: ${fmtRub(totalPaid)}`, 14, 42);
      doc.text(`Итого к оплате: ${fmtRub(totalPending)}`, 14, 48);
      doc.text(`Итого просрочено: ${fmtRub(totalOverdue)}`, 14, 54);
      if (totalFines > 0) doc.text(`Итого штрафов: ${fmtRub(totalFines)}`, 14, 60);

      autoTable(doc, {
        startY: totalFines > 0 ? 66 : 62,
        head: [['Пользователь', 'ID', 'ИНН', 'Оплачено', 'К оплате', 'Просрочено', 'Штрафы']],
        body: summaryData.map(r => [
          r.full_name,
          r.client_id,
          r.inn || 'не указан',
          fmtRub(r.paid),
          fmtRub(r.pending),
          fmtRub(r.overdue),
          r.fines > 0 ? fmtRub(r.fines) : 'нет',
        ]),
        foot: [['ИТОГО', '', '', fmtRub(totalPaid), fmtRub(totalPending), fmtRub(totalOverdue), fmtRub(totalFines)]],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 30, 30] },
        footStyles: { fillColor: [60, 60, 60], fontStyle: 'bold' },
      });
    } else {
      const client = reportData[0];
      if (client) {
        doc.setFontSize(12); doc.setFont('helvetica', 'bold');
        doc.text(`Пользователь: ${client.full_name}`, 14, 36);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.text(`Идентификатор: ${client.client_id}`, 14, 43);
        doc.text(`ИНН: ${client.inn || 'не указан'}`, 14, 49);
        // Итоги по клиенту
        const clientPaid = reportData.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
        const clientPending = reportData.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
        const clientFines = reportData.reduce((s, r) => s + r.fine_amount, 0);
        doc.setFontSize(9);
        doc.text(`Всего записей: ${reportData.length} шт.`, 14, 57);
        doc.text(`Оплачено налогов: ${fmtRub(clientPaid)}`, 14, 63);
        doc.text(`Ожидает оплаты: ${fmtRub(clientPending)}`, 14, 69);
        if (clientFines > 0) doc.text(`Штрафы: ${fmtRub(clientFines)}`, 14, 75);
      }
      autoTable(doc, {
        startY: reportData[0]?.fine_amount > 0 ? 82 : 78,
        head: [['Вид налога', 'Период', 'Сумма', 'Статус', 'Срок оплаты', 'Штраф']],
        body: reportData.map(r => [
          r.tax_type,
          r.period,
          fmtRub(r.amount),
          STATUS_LABELS[r.status] || r.status,
          r.due_date ? new Date(r.due_date).toLocaleDateString('ru-RU') : 'не указан',
          r.fine_amount > 0 ? fmtRub(r.fine_amount) : 'нет',
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 30, 30] },
      });
    }
    doc.save(`report_${dateStr.replace(/\./g, '-')}.pdf`);
  };

  const downloadReceipt = (rec: TaxRecord, user: User) => {
    const doc = new jsPDF();
    const num = `${user.client_id}-${rec.id}`;
    const dateStr = new Date().toLocaleDateString('ru-RU');
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('КВИТАНЦИЯ', 105, 20, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Номер: ${num}`, 105, 28, { align: 'center' });
    doc.text(`Дата: ${dateStr}`, 105, 34, { align: 'center' });
    doc.line(14, 38, 196, 38);
    doc.setFontSize(11);
    doc.text('НАЛОГОПЛАТЕЛЬЩИК', 14, 46);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`ФИО: ${user.full_name}`, 14, 54);
    doc.text(`ID клиента: ${user.client_id}`, 14, 60);
    if (user.inn) doc.text(`ИНН: ${user.inn}`, 14, 66);
    doc.line(14, 72, 196, 72);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('НАЗНАЧЕНИЕ ПЛАТЕЖА', 14, 80);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Вид налога: ${rec.tax_type}`, 14, 88);
    doc.text(`Период: ${rec.period}`, 14, 94);
    if (rec.due_date) doc.text(`Срок оплаты: ${fmtShort(rec.due_date)}`, 14, 100);
    if (rec.description) doc.text(`Примечание: ${rec.description}`, 14, 106);
    doc.line(14, 112, 196, 112);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(`ИТОГО К ОПЛАТЕ: ${fmtRub(rec.amount)}`, 105, 124, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Сумма прописью: ${rec.amount.toLocaleString('ru-RU')} рублей 00 копеек`, 14, 132);
    doc.setFontSize(9);
    doc.text(`Статус платежа: ${STATUS_LABELS[rec.status] || rec.status}`, 14, 139);
    doc.line(14, 145, 196, 145);
    doc.setFontSize(8);
    doc.text('Данный документ сформирован автоматически налоговым порталом', 105, 152, { align: 'center' });
    doc.save(`receipt_${num}.pdf`);
  };

  // ============ Calculator ============
  const calcResult = (() => {
    const base = parseFloat(calcBase) || 0;
    const rate = parseFloat(calcRate) || 0;
    const days = parseInt(calcDays) || 0;
    if (calcType === 'percent') return base * rate / 100;
    if (calcType === 'penalty') return base * rate / 100 / 300 * days;
    if (calcType === 'vat') return base * 0.2;
    if (calcType === 'usn') return base * 0.06;
    if (calcType === 'usn15') return base * 0.15;
    return 0;
  })();

  const unread = stats?.unread_support ?? dialogs.reduce((s, d) => s + d.unread, 0);

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
              <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">Пароль</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full bg-card border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors" required disabled={authLoading} />
            </div>
            {authError && <div className="flex items-center gap-2 text-destructive text-xs py-2 border-l-2 border-destructive pl-3"><Icon name="AlertCircle" size={14} />{authError}</div>}
            <button type="submit" disabled={authLoading} className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] py-3 text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-50">
              {authLoading ? 'Проверка...' : 'Войти'}
            </button>
          </form>
          <div className="text-center mt-6">
            <a href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest">← Вернуться</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚙️</span>
          <span className="font-display text-xl text-foreground">Панель администратора</span>
        </div>
        <div className="flex items-center flex-wrap gap-1">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-widest font-medium transition-colors relative ${activeTab === tab.id ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
              <Icon name={tab.icon} size={12} />
              {tab.label}
              {tab.id === 'support' && unread > 0 && (
                <span className="bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">{unread}</span>
              )}
            </button>
          ))}
          <div className="w-px h-5 bg-border mx-1" />
          <a href="/" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground uppercase tracking-widest"><Icon name="ExternalLink" size={12} />Портал</a>
          <button onClick={() => { sessionStorage.removeItem('admin_pwd'); setAuthed(false); setSelectedUser(null); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground uppercase tracking-widest ml-2">
            <Icon name="LogOut" size={12} />Выйти
          </button>
        </div>
      </header>

      {/* ===== DASHBOARD ===== */}
      {activeTab === 'dashboard' && (
        <div className="flex-1 overflow-auto p-8">
          {statsLoading ? <div className="text-muted-foreground text-center py-20">Загрузка...</div> : stats ? (
            <div className="max-w-5xl mx-auto space-y-8">
              <div>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Активы игроков (выдано)</h2>
                <div className="grid grid-cols-3 gap-4">
                  {[['За этот месяц', stats.paid_month, 'primary'], ['За этот год', stats.paid_year, 'foreground'], ['За всё время', stats.paid_total, 'foreground']].map(([label, val, color]) => (
                    <div key={label as string} className="border border-border p-6">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{label as string}</p>
                      <p className={`font-display text-3xl ${color === 'primary' ? 'text-[hsl(var(--primary))]' : 'text-foreground'}`}>{fmt(val as number)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="border border-border p-5"><p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Игроков</p><p className="font-display text-2xl">{stats.clients_count}</p></div>
                <div className="border border-border p-5"><p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Активные записи</p><p className="font-display text-2xl text-yellow-600">{fmt(stats.pending_total)}</p></div>
                <div className="border border-border border-l-2 border-l-destructive p-5"><p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Заблокировано</p><p className="font-display text-2xl text-destructive">{fmt(stats.overdue_total)}</p></div>
                <div className="border border-border p-5 cursor-pointer hover:bg-accent" onClick={() => setActiveTab('support')}><p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Новых сообщений</p><p className="font-display text-2xl">{stats.unread_support}</p></div>
              </div>
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
              {stats.monthly.length > 0 && (
                <div>
                  <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Активность по месяцам</h2>
                  <div className="border border-border p-6">
                    <div className="flex items-end gap-2 h-32">
                      {(() => { const maxV = Math.max(...stats.monthly.map(m => m.total), 1); return stats.monthly.map(m => (
                        <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group" title={fmt(m.total)}>
                          <div className="w-full bg-[hsl(var(--primary))] opacity-70 group-hover:opacity-100 transition-opacity" style={{ height: `${Math.max(4, m.total / maxV * 100)}%` }} />
                          <p className="text-[9px] text-muted-foreground">{m.month.slice(5)}</p>
                        </div>
                      )); })()}
                    </div>
                  </div>
                </div>
              )}
              <button onClick={fetchStats} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground uppercase tracking-widest"><Icon name="RefreshCw" size={12} />Обновить</button>
            </div>
          ) : (
            <div className="text-center py-20"><button onClick={fetchStats} className="text-xs uppercase tracking-widest text-[hsl(var(--primary))] hover:opacity-80">Загрузить статистику</button></div>
          )}
        </div>
      )}

      {/* ===== CLIENTS ===== */}
      {activeTab === 'clients' && (
        <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>
          <div className="w-72 border-r border-border flex flex-col shrink-0 overflow-hidden">
            <div className="p-4 border-b border-border shrink-0">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2"><Icon name="UserPlus" size={12} />Новый пользователь</p>
              <form onSubmit={handleAddUser} className="space-y-2">
                {[{ k: 'client_id', l: 'Логин *', p: 'ivanov_ivan' }, { k: 'password', l: 'Пароль *', p: '••••••••', t: 'password' }, { k: 'full_name', l: 'Имя *', p: 'Иванов Иван' }, { k: 'inn', l: 'ИНН', p: '000000000000' }].map(f => (
                  <div key={f.k}>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">{f.l}</label>
                    <input type={f.t || 'text'} value={(userForm as Record<string, string>)[f.k]} onChange={e => setUserForm(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.p}
                      className="w-full bg-background border border-border px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))]" required={f.l.includes('*')} disabled={userSaving} />
                  </div>
                ))}
                {userErr && <p className="text-destructive text-[10px] border-l border-destructive pl-2">{userErr}</p>}
                {userOk && <p className="text-green-600 text-[10px] border-l border-green-600 pl-2">{userOk}</p>}
                <button type="submit" disabled={userSaving} className="w-full py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50">{userSaving ? '...' : 'Добавить'}</button>
              </form>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 py-2 border-b border-border sticky top-0 bg-background">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Icon name="Users" size={11} />Пользователи <span className="ml-auto font-mono">{users.length}</span></p>
              </div>
              {loadingUsers ? <div className="text-muted-foreground text-xs text-center py-6">...</div> : users.map(u => (
                <div key={u.id} onClick={() => openUser(u)} className={`px-4 py-2.5 border-b border-border cursor-pointer hover:bg-accent flex items-center justify-between group ${selectedUser?.id === u.id ? 'bg-accent' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground font-medium truncate">{u.full_name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{u.client_id} · {u.records_count} зап.</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setConfirmDeleteUser(u); }} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 shrink-0"><Icon name="Trash2" size={12} /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {!selectedUser ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Icon name="MousePointerClick" size={28} className="mb-3 opacity-20" /><p className="text-sm">Выберите пользователя</p>
              </div>
            ) : (
              <div className="max-w-3xl space-y-6">
                <div className="border-b border-border pb-4 flex items-start justify-between">
                  <div>
                    <h2 className="font-display text-2xl text-foreground">{selectedUser.full_name}</h2>
                    <div className="flex gap-4 mt-1">
                      <p className="text-xs text-muted-foreground">ID: <span className="font-mono text-foreground">{selectedUser.client_id}</span></p>
                      {selectedUser.inn && <p className="text-xs text-muted-foreground">ИНН: <span className="font-mono text-foreground">{selectedUser.inn}</span></p>}
                      <p className="text-xs text-muted-foreground">С {fmtDate(selectedUser.created_at)}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2"><Icon name="Plus" size={12} />Добавить запись</p>
                  <form onSubmit={handleAddTax} className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      {[{ k: 'tax_type', l: 'Название *', p: 'Налог, штраф, актив...' }, { k: 'period', l: 'Тип *', p: 'Период / категория' }].map(f => (
                        <div key={f.k}>
                          <label className="block text-xs text-muted-foreground mb-1">{f.l}</label>
                          <input value={(taxForm as Record<string, string>)[f.k]} onChange={e => setTaxForm(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.p}
                            className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))]" required disabled={taxSaving} />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Кол-во / Сумма *</label>
                        <input type="number" value={taxForm.amount} onChange={e => setTaxForm(p => ({ ...p, amount: e.target.value }))} placeholder="0"
                          className="w-full bg-background border border-border px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-[hsl(var(--primary))]" required disabled={taxSaving} />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Статус</label>
                        <select value={taxForm.status} onChange={e => setTaxForm(p => ({ ...p, status: e.target.value }))} className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[hsl(var(--primary))]" disabled={taxSaving}>
                          <option value="pending">Активен</option><option value="paid">Завершён</option><option value="overdue">Заблокирован</option><option value="cancelled">Удалён</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Срок оплаты</label>
                        <input type="date" value={taxForm.due_date} onChange={e => setTaxForm(p => ({ ...p, due_date: e.target.value }))} className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[hsl(var(--primary))]" disabled={taxSaving} />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Комментарий</label>
                        <input value={taxForm.description} onChange={e => setTaxForm(p => ({ ...p, description: e.target.value }))} placeholder="Необязательно"
                          className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))]" disabled={taxSaving} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="submit" disabled={taxSaving} className="px-6 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50">{taxSaving ? '...' : 'Добавить'}</button>
                      {taxErr && <p className="text-destructive text-xs border-l border-destructive pl-2">{taxErr}</p>}
                      {taxOk && <p className="text-green-600 text-xs border-l border-green-600 pl-2 flex items-center gap-1"><Icon name="Check" size={12} />{taxOk}</p>}
                    </div>
                  </form>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2"><Icon name="Package" size={12} />Предметы и записи <span className="font-mono ml-auto">{records.length}</span></p>
                  {recordsLoading ? <div className="text-muted-foreground text-sm text-center py-8 border border-border">Загрузка...</div> :
                    records.length === 0 ? <div className="text-muted-foreground text-sm text-center py-8 border border-border">Нет записей</div> : (
                      <div className="border border-border overflow-hidden">
                        {records.map((rec, idx) => (
                          <div key={rec.id} className={`px-4 py-3 flex items-center gap-3 hover:bg-accent ${idx < records.length - 1 ? 'border-b border-border' : ''}`}>
                            <div className="flex-1 min-w-0 grid grid-cols-4 gap-2 items-center">
                              <div><p className="text-sm font-medium">{rec.tax_type}</p><p className="text-xs text-muted-foreground">{rec.period}</p></div>
                              <div><p className="text-sm font-mono">{fmt(rec.amount)}</p>{rec.due_date && <p className="text-[10px] text-muted-foreground">до {fmtShort(rec.due_date)}</p>}</div>
                              <select value={rec.status} disabled={updatingStatus === rec.id} onChange={e => handleUpdateStatus(rec.id, e.target.value)}
                                className={`text-xs px-2 py-1 border cursor-pointer focus:outline-none disabled:opacity-50 ${STATUS_COLORS[rec.status]}`}>
                                <option value="pending">Активен</option><option value="paid">Завершён</option><option value="overdue">Заблокирован</option><option value="cancelled">Удалён</option>
                              </select>
                              <div>{rec.description && <p className="text-xs text-muted-foreground truncate">{rec.description}</p>}</div>
                            </div>
                            <button onClick={() => downloadReceipt(rec, selectedUser)} className="p-1.5 text-muted-foreground hover:text-[hsl(var(--primary))] shrink-0" title="Квитанция PDF"><Icon name="FileDown" size={14} /></button>
                            <button onClick={() => handleDeleteRecord(rec.id)} disabled={deletingRecord === rec.id} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-40"><Icon name="Trash2" size={14} /></button>
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

      {/* ===== FINES ===== */}
      {activeTab === 'fines' && (
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="border border-border p-6">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2"><Icon name="AlertOctagon" size={13} />Назначить штраф</p>
              <form onSubmit={handleAddFine} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Пользователь *</label>
                    <select value={fineForm.user_id} onChange={e => setFineForm(p => ({ ...p, user_id: e.target.value }))} className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[hsl(var(--primary))]" required disabled={fineSaving}>
                      <option value="">Выберите...</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.client_id})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Причина *</label>
                    <input value={fineForm.reason} onChange={e => setFineForm(p => ({ ...p, reason: e.target.value }))} placeholder="Нарушение сроков оплаты"
                      className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))]" required disabled={fineSaving} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Сумма ₽ *</label>
                    <input type="number" value={fineForm.amount} onChange={e => setFineForm(p => ({ ...p, amount: e.target.value }))} placeholder="0"
                      className="w-full bg-background border border-border px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-[hsl(var(--primary))]" required disabled={fineSaving} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Срок оплаты</label>
                    <input type="date" value={fineForm.due_date} onChange={e => setFineForm(p => ({ ...p, due_date: e.target.value }))} className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[hsl(var(--primary))]" disabled={fineSaving} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button type="submit" disabled={fineSaving} className="px-6 py-2.5 bg-destructive text-destructive-foreground text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50">{fineSaving ? '...' : 'Назначить штраф'}</button>
                  {fineErr && <p className="text-destructive text-xs border-l border-destructive pl-2">{fineErr}</p>}
                  {fineOk && <p className="text-green-600 text-xs border-l border-green-600 pl-2">{fineOk}</p>}
                </div>
              </form>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Icon name="List" size={12} />Все штрафы <span className="font-mono">{fines.length}</span></p>
                <button onClick={fetchFines} className="text-muted-foreground hover:text-foreground"><Icon name="RefreshCw" size={13} /></button>
              </div>
              {finesLoading ? <div className="text-muted-foreground text-sm text-center py-8 border border-border">Загрузка...</div> :
                fines.length === 0 ? <div className="text-muted-foreground text-sm text-center py-8 border border-border">Штрафов нет</div> : (
                  <div className="border border-border overflow-hidden">
                    {fines.map((f, idx) => (
                      <div key={f.id} className={`px-5 py-3 flex items-center gap-4 hover:bg-accent ${idx < fines.length - 1 ? 'border-b border-border' : ''}`}>
                        <div className="flex-1 min-w-0 grid grid-cols-5 gap-2 items-center">
                          <div><p className="text-sm font-medium">{users.find(u => u.id === f.user_id)?.full_name || `ID ${f.user_id}`}</p><p className="text-xs text-muted-foreground">{f.tax_type && `${f.tax_type} · ${f.period}`}</p></div>
                          <p className="text-sm text-muted-foreground truncate col-span-1">{f.reason}</p>
                          <p className="text-sm font-mono font-medium text-destructive">{fmt(f.amount)}</p>
                          <select value={f.status} onChange={e => handleUpdateFine(f.id, e.target.value)} className={`text-xs px-2 py-1 border cursor-pointer focus:outline-none ${FINE_COLORS[f.status] || ''}`}>
                            <option value="unpaid">Не оплачен</option><option value="paid">Оплачен</option><option value="cancelled">Отменён</option>
                          </select>
                          <p className="text-xs text-muted-foreground">{f.due_date ? `до ${fmtShort(f.due_date)}` : '—'}</p>
                        </div>
                        <button onClick={() => handleDeleteFine(f.id)} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0"><Icon name="Trash2" size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* ===== NOTES ===== */}
      {activeTab === 'notes' && (
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="border border-border p-6">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2"><Icon name="Plus" size={12} />Новая заметка</p>
              <form onSubmit={handleAddNote} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Заголовок *</label>
                    <input value={noteForm.title} onChange={e => setNoteForm(p => ({ ...p, title: e.target.value }))} placeholder="Название заметки"
                      className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))]" required disabled={noteSaving} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Цвет</label>
                    <select value={noteForm.color} onChange={e => setNoteForm(p => ({ ...p, color: e.target.value }))} className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[hsl(var(--primary))]">
                      <option value="yellow">Жёлтый</option><option value="blue">Синий</option><option value="green">Зелёный</option><option value="red">Красный</option><option value="purple">Фиолетовый</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Пользователь (опционально)</label>
                    <select value={noteForm.user_id} onChange={e => setNoteForm(p => ({ ...p, user_id: e.target.value }))} className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[hsl(var(--primary))]">
                      <option value="">Общая заметка</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Текст *</label>
                  <textarea value={noteForm.content} onChange={e => setNoteForm(p => ({ ...p, content: e.target.value }))} rows={3} placeholder="Текст заметки..."
                    className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] resize-none" required disabled={noteSaving} />
                </div>
                <button type="submit" disabled={noteSaving} className="px-6 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50">{noteSaving ? '...' : 'Сохранить'}</button>
              </form>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Icon name="StickyNote" size={12} />Заметки <span className="font-mono">{notes.length}</span></p>
                <button onClick={fetchNotes} className="text-muted-foreground hover:text-foreground"><Icon name="RefreshCw" size={13} /></button>
              </div>
              {notesLoading ? <div className="text-muted-foreground text-sm text-center py-8">Загрузка...</div> :
                notes.length === 0 ? <div className="text-muted-foreground text-sm text-center py-8">Заметок пока нет</div> : (
                  <div className="grid grid-cols-3 gap-4">
                    {notes.map(n => (
                      <div key={n.id} className={`border p-4 ${NOTE_COLORS[n.color] || NOTE_COLORS.yellow} relative group`}>
                        {editingNote?.id === n.id ? (
                          <div className="space-y-2">
                            <input value={editingNote.title} onChange={e => setEditingNote(p => p ? { ...p, title: e.target.value } : p)} className="w-full bg-white border border-border px-2 py-1 text-sm font-medium focus:outline-none" />
                            <textarea value={editingNote.content} onChange={e => setEditingNote(p => p ? { ...p, content: e.target.value } : p)} rows={4} className="w-full bg-white border border-border px-2 py-1 text-xs resize-none focus:outline-none" />
                            <div className="flex gap-2">
                              <button onClick={handleSaveNote} className="px-3 py-1 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs">Сохранить</button>
                              <button onClick={() => setEditingNote(null)} className="px-3 py-1 border border-border text-xs">Отмена</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <p className="text-sm font-medium text-foreground leading-tight">{n.title}</p>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                                <button onClick={() => setEditingNote(n)} className="p-1 text-muted-foreground hover:text-foreground"><Icon name="Pencil" size={12} /></button>
                                <button onClick={() => handleDeleteNote(n.id)} className="p-1 text-muted-foreground hover:text-destructive"><Icon name="X" size={12} /></button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{n.content}</p>
                            <p className="text-[10px] text-muted-foreground mt-3">{fmtDate(n.created_at)}</p>
                            {n.user_id && <p className="text-[10px] text-muted-foreground">Польз.: {users.find(u => u.id === n.user_id)?.full_name}</p>}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* ===== CALCULATOR ===== */}
      {activeTab === 'calc' && (
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-xl mx-auto">
            <h2 className="font-display text-2xl mb-6">Калькулятор налогов</h2>
            <div className="border border-border p-6 space-y-5">
              <div>
                <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">Тип расчёта</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 'percent', l: 'Процент от суммы' },
                    { v: 'penalty', l: 'Пени за просрочку' },
                    { v: 'vat', l: 'НДС 20%' },
                    { v: 'usn', l: 'УСН 6% (доходы)' },
                    { v: 'usn15', l: 'УСН 15% (доходы−расходы)' },
                  ].map(o => (
                    <button key={o.v} onClick={() => setCalcType(o.v)} className={`py-2.5 px-4 text-xs uppercase tracking-widest border transition-colors text-left ${calcType === o.v ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground'}`}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">База (сумма ₽)</label>
                <input type="number" value={calcBase} onChange={e => setCalcBase(e.target.value)} placeholder="0"
                  className="w-full bg-background border border-border px-4 py-3 text-lg font-mono text-foreground focus:outline-none focus:border-[hsl(var(--primary))]" />
              </div>
              {(calcType === 'percent' || calcType === 'penalty') && (
                <div>
                  <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">{calcType === 'penalty' ? 'Ставка ЦБ РФ (%)' : 'Ставка (%)'}</label>
                  <input type="number" step="0.01" value={calcRate} onChange={e => setCalcRate(e.target.value)} placeholder="16"
                    className="w-full bg-background border border-border px-4 py-3 text-lg font-mono text-foreground focus:outline-none focus:border-[hsl(var(--primary))]" />
                </div>
              )}
              {calcType === 'penalty' && (
                <div>
                  <label className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">Дней просрочки</label>
                  <input type="number" value={calcDays} onChange={e => setCalcDays(e.target.value)} placeholder="30"
                    className="w-full bg-background border border-border px-4 py-3 text-lg font-mono text-foreground focus:outline-none focus:border-[hsl(var(--primary))]" />
                </div>
              )}
              <div className="border-t border-border pt-5">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Результат</p>
                <p className="font-display text-4xl text-[hsl(var(--primary))]">{fmt(calcResult)}</p>
                {calcType === 'penalty' && calcBase && calcRate && calcDays && (
                  <p className="text-xs text-muted-foreground mt-2">{calcBase} × {calcRate}% / 300 × {calcDays} дней</p>
                )}
                {calcType === 'percent' && calcBase && calcRate && (
                  <p className="text-xs text-muted-foreground mt-2">{calcBase} × {calcRate}%</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== REPORT ===== */}
      {activeTab === 'report' && (
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">Отчёт</h2>
              <button onClick={downloadReport} className="flex items-center gap-2 px-5 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest hover:opacity-90">
                <Icon name="Download" size={13} />Скачать PDF
              </button>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setReportMode('summary'); loadSummary(); }} className={`px-4 py-2 text-xs uppercase tracking-widest border ${reportMode === 'summary' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]' : 'border-border text-muted-foreground hover:text-foreground'}`}>Сводный по всем</button>
              <div className="flex gap-2 flex-1">
                <select value={reportUserId} onChange={e => setReportUserId(e.target.value)} className="flex-1 bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[hsl(var(--primary))]">
                  <option value="">По пользователю...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.client_id})</option>)}
                </select>
                <button onClick={loadClientReport} disabled={!reportUserId} className="px-4 py-2 text-xs uppercase tracking-widest border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">Показать</button>
              </div>
            </div>

            {reportLoading ? <div className="text-muted-foreground text-center py-10">Загрузка...</div> : reportMode === 'summary' ? (
              summaryData.length === 0 ? <div className="text-muted-foreground text-center py-10 border border-border">Нет данных</div> : (
                <div className="border border-border overflow-hidden">
                  <div className="grid grid-cols-7 gap-0 border-b border-border bg-muted px-4 py-2">
                    {['Пользователь', 'ID', 'ИНН', 'Оплачено', 'К оплате', 'Просрочено', 'Штрафы'].map(h => <p key={h} className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{h}</p>)}
                  </div>
                  {summaryData.map((r, idx) => (
                    <div key={idx} className={`grid grid-cols-7 gap-0 px-4 py-3 items-center hover:bg-accent ${idx < summaryData.length - 1 ? 'border-b border-border' : ''}`}>
                      <p className="text-sm font-medium truncate">{r.full_name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{r.client_id}</p>
                      <p className="text-xs font-mono text-muted-foreground">{r.inn || '—'}</p>
                      <p className="text-sm font-mono text-green-700">{fmt(r.paid)}</p>
                      <p className="text-sm font-mono text-yellow-600">{fmt(r.pending)}</p>
                      <p className="text-sm font-mono text-destructive">{fmt(r.overdue)}</p>
                      <p className="text-sm font-mono text-destructive">{r.fines > 0 ? fmt(r.fines) : '—'}</p>
                    </div>
                  ))}
                  <div className="grid grid-cols-7 gap-0 px-4 py-3 border-t border-border bg-muted">
                    <p className="text-xs uppercase font-bold text-muted-foreground col-span-3">ИТОГО</p>
                    <p className="text-sm font-mono font-bold text-green-700">{fmt(summaryData.reduce((s, r) => s + r.paid, 0))}</p>
                    <p className="text-sm font-mono font-bold text-yellow-600">{fmt(summaryData.reduce((s, r) => s + r.pending, 0))}</p>
                    <p className="text-sm font-mono font-bold text-destructive">{fmt(summaryData.reduce((s, r) => s + r.overdue, 0))}</p>
                    <p className="text-sm font-mono font-bold text-destructive">{fmt(summaryData.reduce((s, r) => s + r.fines, 0))}</p>
                  </div>
                </div>
              )
            ) : (
              reportData.length === 0 ? <div className="text-muted-foreground text-center py-10 border border-border">Нет данных</div> : (
                <div className="border border-border overflow-hidden">
                  <div className="grid grid-cols-6 gap-0 border-b border-border bg-muted px-4 py-2">
                    {['Налог', 'Период', 'Сумма', 'Статус', 'Срок оплаты', 'Штраф'].map(h => <p key={h} className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{h}</p>)}
                  </div>
                  {reportData.map((r, idx) => (
                    <div key={idx} className={`grid grid-cols-6 gap-0 px-4 py-3 items-center hover:bg-accent ${idx < reportData.length - 1 ? 'border-b border-border' : ''}`}>
                      <p className="text-sm font-medium">{r.tax_type}</p>
                      <p className="text-xs text-muted-foreground">{r.period}</p>
                      <p className="text-sm font-mono">{fmt(r.amount)}</p>
                      <span className={`text-xs px-2 py-0.5 border w-fit ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                      <p className="text-xs text-muted-foreground">{r.due_date ? fmtShort(r.due_date) : '—'}</p>
                      <p className="text-xs font-mono text-destructive">{r.fine_amount > 0 ? fmt(r.fine_amount) : '—'}</p>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ===== SUPPORT ===== */}
      {activeTab === 'support' && (
        <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>
          <div className="w-72 border-r border-border flex flex-col shrink-0 overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Icon name="MessageSquare" size={11} />Диалоги</p>
              <button onClick={fetchDialogs} className="text-muted-foreground hover:text-foreground"><Icon name="RefreshCw" size={12} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {dialogsLoading ? <div className="text-muted-foreground text-xs text-center py-6">Загрузка...</div> :
                dialogs.length === 0 ? <div className="text-muted-foreground text-xs text-center py-10 px-4"><Icon name="MessageSquare" size={20} className="mx-auto mb-2 opacity-20" />Нет сообщений</div> :
                  dialogs.map(d => (
                    <div key={d.user_id} onClick={() => { setSelectedDialog(d); fetchMessages(d.user_id); }} className={`px-4 py-3 border-b border-border cursor-pointer hover:bg-accent ${selectedDialog?.user_id === d.user_id ? 'bg-accent' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{d.full_name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{d.client_id}</p>
                          {d.last_msg && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{d.last_msg}</p>}
                        </div>
                        {d.unread > 0 && <span className="w-4 h-4 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center shrink-0">{d.unread}</span>}
                      </div>
                    </div>
                  ))}
            </div>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedDialog ? <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground"><Icon name="MessageSquare" size={36} className="mb-3 opacity-20" /><p className="text-sm">Выберите диалог</p></div> : (
              <>
                <div className="px-6 py-3 border-b border-border shrink-0"><p className="text-foreground font-medium">{selectedDialog.full_name}</p><p className="text-xs font-mono text-muted-foreground">{selectedDialog.client_id}</p></div>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {messagesLoading ? <div className="text-muted-foreground text-sm text-center py-10">Загрузка...</div> :
                    messages.length === 0 ? <div className="text-muted-foreground text-sm text-center py-10">Нет сообщений</div> :
                      messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.author === 'admin' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-sm px-4 py-2.5 ${msg.author === 'admin' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-accent text-foreground border border-border'}`}>
                            <p className="text-sm leading-relaxed">{msg.message}</p>
                            <p className={`text-[10px] mt-1 ${msg.author === 'admin' ? 'text-[hsl(var(--primary-foreground))]/70' : 'text-muted-foreground'}`}>{msg.author === 'admin' ? 'Вы' : selectedDialog.full_name} · {fmtTime(msg.created_at)}</p>
                          </div>
                        </div>
                      ))}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSendReply} className="p-4 border-t border-border flex gap-3 shrink-0">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Написать ответ..."
                    className="flex-1 bg-background border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))]" disabled={replySending} />
                  <button type="submit" disabled={replySending || !replyText.trim()} className="px-5 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 flex items-center gap-2 text-xs uppercase tracking-widest">
                    <Icon name="Send" size={13} />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== SHOP ===== */}
      {activeTab === 'shop' && (
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Добавить товар */}
            <div className="border border-border p-6">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2"><Icon name="Plus" size={13} />Добавить товар</p>
              <form onSubmit={handleAddProduct} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Название *</label>
                    <input value={productForm.name} onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))} placeholder="Квартира, автомобиль, товар..." required
                      className="w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-[hsl(var(--primary))]" disabled={productSaving} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Цена ₽ *</label>
                    <input type="number" value={productForm.price} onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))} placeholder="999" required
                      className="w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-[hsl(var(--primary))]" disabled={productSaving} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Ссылка на фото</label>
                    <input value={productForm.image_url} onChange={e => setProductForm(p => ({ ...p, image_url: e.target.value }))} placeholder="https://..."
                      className="w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-[hsl(var(--primary))]" disabled={productSaving} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Описание</label>
                  <textarea value={productForm.description} onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Описание товара для покупателей"
                    className="w-full bg-background border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:border-[hsl(var(--primary))]" disabled={productSaving} />
                </div>
                <div className="flex items-center gap-4">
                  <button type="submit" disabled={productSaving} className="px-6 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50">
                    {productSaving ? '...' : 'Добавить товар'}
                  </button>
                  {productMsg && <p className="text-green-600 text-xs border-l border-green-600 pl-2 flex items-center gap-1"><Icon name="Check" size={12} />{productMsg}</p>}
                  {productErr && <p className="text-destructive text-xs border-l border-destructive pl-2">{productErr}</p>}
                </div>
              </form>
            </div>

            {/* Каталог */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Icon name="ShoppingBag" size={12} />Товары в каталоге <span className="font-mono">{shopProducts.length}</span></p>
                <button onClick={fetchShopAdmin} className="text-muted-foreground hover:text-foreground"><Icon name="RefreshCw" size={13} /></button>
              </div>
              {shopLoading ? <div className="text-muted-foreground text-sm text-center py-8 border border-border">Загрузка...</div>
                : shopProducts.length === 0 ? <div className="text-muted-foreground text-sm text-center py-8 border border-border">Товаров нет</div>
                  : (
                    <div className="grid grid-cols-3 gap-4">
                      {shopProducts.map(p => (
                        <div key={p.id} className="border border-border overflow-hidden group">
                          {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-32 object-cover" />
                            : <div className="w-full h-32 bg-accent flex items-center justify-center text-3xl">📦</div>}
                          <div className="p-3">
                            <p className="text-sm font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-sm font-mono text-[hsl(var(--primary))]">{p.price.toLocaleString('ru-RU')} ₽</p>
                              <button onClick={() => handleDeleteProduct(p.id)} className="p-1 text-muted-foreground hover:text-destructive"><Icon name="Trash2" size={13} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
            </div>
          </div>
        </div>
      )}

      {/* ===== ORDERS ===== */}
      {activeTab === 'orders' && (
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Icon name="PackageCheck" size={12} />Заказы пользователей <span className="font-mono">{shopOrders.length}</span></p>
              <button onClick={fetchShopAdmin} className="text-muted-foreground hover:text-foreground"><Icon name="RefreshCw" size={13} /></button>
            </div>
            {shopLoading ? <div className="text-muted-foreground text-sm text-center py-10 border border-border">Загрузка...</div>
              : shopOrders.length === 0 ? <div className="text-muted-foreground text-sm text-center py-10 border border-border">Заказов нет</div>
                : (
                  <div className="border border-border overflow-hidden">
                    <div className="grid grid-cols-6 gap-0 border-b border-border bg-muted px-4 py-2">
                      {['Заказ', 'Пользователь', 'Товары', 'Адрес доставки', 'Сумма', 'Статус'].map(h => <p key={h} className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{h}</p>)}
                    </div>
                    {shopOrders.map((o, idx) => (
                      <div key={o.id} className={`grid grid-cols-6 gap-0 px-4 py-3 items-center hover:bg-accent ${idx < shopOrders.length - 1 ? 'border-b border-border' : ''}`}>
                        <p className="text-sm font-mono">#{o.id}</p>
                        <p className="text-xs text-muted-foreground">{users.find(u => u.id === o.user_id)?.full_name || `ID ${o.user_id}`}</p>
                        <p className="text-xs truncate">{o.items}</p>
                        <p className="text-xs text-muted-foreground truncate">📍 {o.address}</p>
                        <p className="text-sm font-mono text-[hsl(var(--primary))]">{o.total.toLocaleString('ru-RU')} ₽</p>
                        <select value={o.status} onChange={e => handleUpdateOrderStatus(o.id, e.target.value)}
                          className={`text-[10px] px-2 py-1 border cursor-pointer focus:outline-none ${o.status === 'paid' || o.status === 'delivered' ? 'text-green-600 bg-green-50 border-green-200' : o.status === 'overdue' || o.status === 'cancelled' ? 'text-red-600 bg-red-50 border-red-200' : 'text-yellow-600 bg-yellow-50 border-yellow-200'}`}>
                          <option value="pending">Ожидает</option>
                          <option value="processing">В обработке</option>
                          <option value="paid">Оплачен</option>
                          <option value="delivered">Доставлен</option>
                          <option value="cancelled">Отменён</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
          </div>
        </div>
      )}

      {/* Delete user modal */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="bg-card border border-border p-8 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4"><Icon name="AlertTriangle" size={20} className="text-destructive" /><h3 className="font-display text-xl">Удалить пользователя?</h3></div>
            <p className="text-sm font-medium mb-1">{confirmDeleteUser.full_name}</p>
            <p className="text-sm text-muted-foreground mb-4">ID: <span className="font-mono">{confirmDeleteUser.client_id}</span></p>
            <p className="text-xs text-destructive border-l-2 border-destructive pl-3 mb-6">Все записи, штрафы и сообщения будут удалены.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteUser(confirmDeleteUser)} disabled={deletingUser === confirmDeleteUser.id}
                className="flex-1 py-3 bg-destructive text-destructive-foreground text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50">
                {deletingUser === confirmDeleteUser.id ? 'Удаление...' : 'Удалить'}
              </button>
              <button onClick={() => setConfirmDeleteUser(null)} className="flex-1 py-3 border border-border text-muted-foreground text-xs uppercase tracking-widest hover:text-foreground hover:border-foreground">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}