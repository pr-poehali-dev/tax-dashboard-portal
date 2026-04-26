import { HistoryItem } from '@/components/Dashboard';
import Icon from '@/components/ui/icon';

interface Props {
  history: HistoryItem[];
  loading: boolean;
}

const formatMoney = (n: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

const formatDateTime = (s: string) =>
  new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const operationIcon: Record<string, string> = {
  'Оплата': 'CheckCircle',
  'Начисление': 'PlusCircle',
  'Изменение статуса': 'RefreshCw',
  'Корректировка': 'Edit',
};

const operationColor: Record<string, string> = {
  'Оплата': 'text-[hsl(var(--primary))]',
  'Начисление': 'text-foreground',
  'Изменение статуса': 'text-muted-foreground',
  'Корректировка': 'text-destructive',
};

const TaxHistory = ({ history, loading }: Props) => {
  if (loading) return <div className="text-muted-foreground text-sm py-12 text-center">Загрузка истории...</div>;

  if (history.length === 0) return (
    <div className="text-center py-16 border border-border text-muted-foreground text-sm">
      История операций пуста
    </div>
  );

  return (
    <div className="space-y-1">
      {history.map((h, idx) => (
        <div
          key={h.id}
          className="flex items-start gap-5 p-5 border border-border bg-card hover:bg-accent transition-colors"
          style={{ animationDelay: `${idx * 40}ms` }}
        >
          {/* Иконка операции */}
          <div className={`mt-0.5 shrink-0 ${operationColor[h.operation_type] || 'text-muted-foreground'}`}>
            <Icon
              name={operationIcon[h.operation_type] || 'Circle'}
              size={16}
              fallback="Circle"
            />
          </div>

          {/* Основная информация */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-foreground text-sm">{h.description}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className={`text-xs uppercase tracking-widest font-sans ${operationColor[h.operation_type] || 'text-muted-foreground'}`}>
                    {h.operation_type}
                  </span>
                  {h.tax_type && (
                    <>
                      <span className="text-muted-foreground/40 text-xs">·</span>
                      <span className="text-xs text-muted-foreground">{h.tax_type}</span>
                    </>
                  )}
                  {h.period && (
                    <>
                      <span className="text-muted-foreground/40 text-xs">·</span>
                      <span className="text-xs text-muted-foreground font-mono">{h.period}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                {h.amount !== null && (
                  <p className="font-mono text-foreground text-sm">{formatMoney(h.amount)}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(h.occurred_at)}</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TaxHistory;
