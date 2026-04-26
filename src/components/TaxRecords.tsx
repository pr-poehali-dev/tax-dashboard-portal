import { useState } from 'react';
import { TaxRecord } from '@/components/Dashboard';
import Icon from '@/components/ui/icon';

const CABINET_URL = 'https://functions.poehali.dev/55da48e4-e0f4-4cea-ad0c-d80ea71302b9';

interface Props {
  records: TaxRecord[];
  loading: boolean;
  userId: number;
  onRefresh: () => void;
}

const formatMoney = (n: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

const formatDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('ru-RU') : '—';

const TaxRecords = ({ records, loading, userId, onRefresh }: Props) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState<number | null>(null);

  const handleAddComment = async (recordId: number) => {
    const text = commentTexts[recordId]?.trim();
    if (!text) return;
    setSubmitting(recordId);
    await fetch(CABINET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': String(userId) },
      body: JSON.stringify({ record_id: recordId, comment: text }),
    });
    setCommentTexts(prev => ({ ...prev, [recordId]: '' }));
    setSubmitting(null);
    onRefresh();
  };

  if (loading) return <div className="text-muted-foreground text-sm py-12 text-center">Загрузка...</div>;
  if (records.length === 0) return (
    <div className="text-center py-16 border border-border text-muted-foreground text-sm">
      Налоговые данные пока не добавлены
    </div>
  );

  return (
    <div className="space-y-3">
      {records.map(r => (
        <div key={r.id} className="border border-border bg-card">
          {/* Заголовок карточки */}
          <button
            className="w-full flex items-center justify-between p-5 hover:bg-accent transition-colors text-left"
            onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
          >
            <div className="flex items-center gap-4">
              <div className={`w-1.5 h-10 shrink-0 ${r.status === 'paid' ? 'bg-[hsl(var(--primary))]' : 'bg-destructive'}`} />
              <div>
                <p className="text-foreground font-medium text-sm">{r.tax_type}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{r.period} · {r.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-6 shrink-0">
              <div className="text-right">
                <p className="font-mono text-foreground text-sm">{formatMoney(r.amount)}</p>
                <p className="text-xs mt-0.5">
                  <span className={`uppercase tracking-widest ${r.status === 'paid' ? 'text-[hsl(var(--primary))]' : 'text-destructive'}`}>
                    {r.status === 'paid' ? 'Оплачен' : 'Ожидает оплаты'}
                  </span>
                </p>
              </div>
              {r.due_date && (
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">Срок</p>
                  <p className="text-xs text-foreground font-mono mt-0.5">{formatDate(r.due_date)}</p>
                </div>
              )}
              <Icon
                name={expandedId === r.id ? 'ChevronUp' : 'ChevronDown'}
                size={16}
                className="text-muted-foreground"
              />
            </div>
          </button>

          {/* Раскрытая часть */}
          {expandedId === r.id && (
            <div className="border-t border-border p-5 space-y-4">
              {/* Детали */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Добавлена</p>
                  <p className="font-mono text-foreground">{formatDate(r.created_at)}</p>
                </div>
                {r.due_date && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Срок оплаты</p>
                    <p className="font-mono text-foreground">{formatDate(r.due_date)}</p>
                  </div>
                )}
              </div>

              {/* Комментарии */}
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  Пояснения ({r.comments.length})
                </p>
                {r.comments.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {r.comments.map(c => (
                      <div key={c.id} className="bg-[hsl(var(--muted))] px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs uppercase tracking-widest text-[hsl(var(--primary))]">{c.author}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(c.created_at)}</span>
                        </div>
                        <p className="text-sm text-foreground">{c.comment}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Форма добавления комментария */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentTexts[r.id] || ''}
                    onChange={e => setCommentTexts(prev => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="Добавить пояснение..."
                    className="flex-1 bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                    onKeyDown={e => e.key === 'Enter' && handleAddComment(r.id)}
                    disabled={submitting === r.id}
                  />
                  <button
                    onClick={() => handleAddComment(r.id)}
                    disabled={submitting === r.id || !commentTexts[r.id]?.trim()}
                    className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {submitting === r.id ? '...' : 'Добавить'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default TaxRecords;
