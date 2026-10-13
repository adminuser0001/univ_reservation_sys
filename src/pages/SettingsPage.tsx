import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useConfirm } from '../components/Confirm';
import { DateChips } from '../components/DateChips';
import { Icon } from '../components/Icon';
import { ProductTabs } from '../components/ProductTabs';
import { useToast } from '../components/Toast';
import { useRepository } from '../data/RepositoryProvider';
import { buildReservationCsvRows } from '../domain/exportCsv';
import { formatDateShort, generateSlots, LOG_ACTION_LABEL } from '../domain/rules';
import type { Config, IdentifyMode, Product, Slot } from '../domain/types';
import { useWatch } from '../hooks/useWatch';
import { downloadFile, toCsv } from '../utils/download';

const PRODUCT_COLORS = ['#2F4BC7', '#0F7C80', '#9B3D8F', '#B86E00', '#3C7A2E', '#C2334D'];

interface Props {
  config: Config;
  products: Product[];
  date: string;
  onDateChange: (date: string) => void;
}

const IDENTIFY_MODES: { id: IdentifyMode; label: string; hint: string }[] = [
  { id: 'ticket', label: '整理券番号', hint: '印刷した整理券の番号を入力して登録します' },
  { id: 'name', label: '番号なし', hint: '整理券を使わず、名前だけで登録します' },
];

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : '保存できませんでした';
}

export function SettingsPage({ config, products, date, onDateChange }: Props) {
  const repo = useRepository();
  const toast = useToast();
  const confirm = useConfirm();

  return (
    <div className="page settings">
      <EventSection config={config} />
      <DatesSection config={config} />
      <ProductsSection products={products} />
      <SlotGenerator config={config} products={products} />
      <SlotEditor config={config} products={products} date={date} onDateChange={onDateChange} />

      <section className="panel">
        <h2 className="panel__title">
          <Icon name="database" /> データ
        </h2>
        <p className="panel__hint">
          データはこの端末のブラウザにだけ保存されます。受付のあとは書き出して保管してください。書き出したファイルには名前や電話番号が入ります。
        </p>
        <div className="button-grid">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={async () => {
              const data = await repo.exportAll();
              downloadFile(`reservations-${data.exportedAt.slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
            }}
          >
            <Icon name="data_object" /> すべてをJSONで書き出す
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={async () => {
              const data = await repo.exportAll();
              downloadFile(`reservations-${data.exportedAt.slice(0, 10)}.csv`, toCsv(buildReservationCsvRows(data)), 'text/csv');
            }}
          >
            <Icon name="table_view" /> 予約をCSVで書き出す
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={async () => {
              const data = await repo.exportAll();
              const rows = [
                ['日時', '操作', '整理券番号', '内容', '特例', '端末'],
                ...data.logs.map((l) => [
                  new Date(l.at).toLocaleString('ja-JP'),
                  LOG_ACTION_LABEL[l.action],
                  l.ticketNo ?? '',
                  l.summary,
                  l.isException ? '特例' : '',
                  l.deviceId,
                ]),
              ];
              downloadFile(`logs-${data.exportedAt.slice(0, 10)}.csv`, toCsv(rows), 'text/csv');
            }}
          >
            <Icon name="history" /> 履歴をCSVで書き出す
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={async () => {
              const ok = await confirm({
                title: 'サンプルデータを入れますか？',
                body: '今の体験・時間枠・予約・履歴はすべて消えて、今日と明日・体験2種類のサンプルに置き換わります。元に戻せません。',
                confirmLabel: '消して入れる',
                tone: 'danger',
              });
              if (!ok) return;
              await repo.loadSampleData();
              toast('サンプルデータを入れました');
            }}
          >
            <Icon name="science" /> サンプルデータを入れる
          </button>
          <button
            type="button"
            className="btn btn--danger-ghost"
            onClick={async () => {
              const ok = await confirm({
                title: 'すべてのデータを消しますか？',
                body: '体験・時間枠・予約・履歴がすべて消えます。元に戻せません。必要なら先に書き出してください。',
                confirmLabel: 'すべて消す',
                tone: 'danger',
              });
              if (!ok) return;
              await repo.clearAll();
              toast('すべてのデータを消しました');
            }}
          >
            <Icon name="delete_forever" /> すべてのデータを消す
          </button>
        </div>
      </section>
    </div>
  );
}

function EventSection({ config }: { config: Config }) {
  const repo = useRepository();
  const [name, setName] = useState(config.eventName);
  const [notice, setNotice] = useState(config.privacyNotice);
  useEffect(() => setName(config.eventName), [config.eventName]);
  useEffect(() => setNotice(config.privacyNotice), [config.privacyNotice]);

  return (
    <section className="panel">
      <h2 className="panel__title">
        <Icon name="storefront" /> 企画
      </h2>
      <label className="field">
        <span className="field__label">企画名</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== config.eventName && void repo.saveConfig({ eventName: name.trim() })}
        />
      </label>
      <div className="field">
        <span className="field__label" id="identify-mode-label">
          予約の見分け方
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="identify-mode-label">
          {IDENTIFY_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={config.identifyMode === m.id}
              className="segmented__item"
              onClick={() => void repo.saveConfig({ identifyMode: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="switch-row__hint">{IDENTIFY_MODES.find((m) => m.id === config.identifyMode)?.hint}</span>
      </div>
      {config.identifyMode === 'ticket' && (
        <label className="switch-row">
          <span>
            <span className="switch-row__label">整理券番号の自動入力</span>
            <span className="switch-row__hint">
              {config.autoTicketNo
                ? '登録済みの最大の番号 +1 を入れます。券と違うときはテンキーで打ち直せます'
                : '番号は毎回テンキーで入力します'}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={config.autoTicketNo}
            onChange={(e) => void repo.saveConfig({ autoTicketNo: e.target.checked })}
          />
        </label>
      )}
      <label className="switch-row">
        <span>
          <span className="switch-row__label">定員制御</span>
          <span className="switch-row__hint">
            {config.capacityLimitEnabled
              ? '定員を超える登録は、確認のうえ特例として受け付けます'
              : '定員を超えても、確認なしで登録できます'}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={config.capacityLimitEnabled}
          onChange={(e) => void repo.saveConfig({ capacityLimitEnabled: e.target.checked })}
        />
      </label>
      <label className="field">
        <span className="field__label">個人情報の案内文（予約フォームの上に出ます。空にすると出ません）</span>
        <textarea
          rows={3}
          maxLength={300}
          value={notice}
          onChange={(e) => setNotice(e.target.value)}
          onBlur={() => notice !== config.privacyNotice && void repo.saveConfig({ privacyNotice: notice.trim() })}
        />
      </label>
    </section>
  );
}

function DatesSection({ config }: { config: Config }) {
  const repo = useRepository();
  const toast = useToast();
  const confirm = useConfirm();
  const [newDate, setNewDate] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!newDate) return;
    if (config.eventDates.includes(newDate)) {
      toast('その日はすでに追加されています', 'error');
      return;
    }
    await repo.saveConfig({ eventDates: [...config.eventDates, newDate].sort() });
    setNewDate('');
  };

  return (
    <section className="panel">
      <h2 className="panel__title">
        <Icon name="calendar_month" /> 開催日
      </h2>
      {config.eventDates.length === 0 && <p className="panel__hint">開催日を追加してください。</p>}
      <ul className="date-list">
        {config.eventDates.map((d) => (
          <li key={d}>
            {formatDateShort(d)}
            <button
              type="button"
              className="icon-btn"
              aria-label={`${formatDateShort(d)} を外す`}
              onClick={async () => {
                const ok = await confirm({
                  title: `${formatDateShort(d)} を開催日から外しますか？`,
                  body: 'この日は予約画面や一覧で選べなくなります。この日の時間枠と予約は消えずに残り、開催日に戻すとまた表示されます。',
                  confirmLabel: '開催日から外す',
                  tone: 'danger',
                });
                if (!ok) return;
                await repo.saveConfig({ eventDates: config.eventDates.filter((x) => x !== d) });
              }}
            >
              <Icon name="close" />
            </button>
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label="追加する開催日" />
        <button type="submit" className="btn btn--ghost" disabled={!newDate}>
          <Icon name="add" /> 追加
        </button>
      </form>
    </section>
  );
}

function ProductsSection({ products }: { products: Product[] }) {
  const repo = useRepository();
  const toast = useToast();
  const confirm = useConfirm();
  const [newName, setNewName] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await repo.saveProduct({
      id: '',
      name: newName.trim(),
      color: PRODUCT_COLORS[products.length % PRODUCT_COLORS.length],
      sortOrder: products.length,
      isActive: true,
    });
    setNewName('');
  };

  return (
    <section className="panel">
      <h2 className="panel__title">
        <Icon name="category" /> 体験
      </h2>
      <ul className="product-list">
        {products.map((p) => (
          <li key={p.id} className="product-item" style={{ '--product': p.color } as CSSProperties}>
            <input
              className="product-item__name"
              defaultValue={p.name}
              aria-label="体験名"
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== p.name) void repo.saveProduct({ ...p, name });
              }}
            />
            <div className="color-picker" role="radiogroup" aria-label={`${p.name} の色`}>
              {PRODUCT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={p.color === c}
                  aria-label={c}
                  className="color-picker__swatch"
                  style={{ background: c }}
                  onClick={() => void repo.saveProduct({ ...p, color: c })}
                />
              ))}
            </div>
            <div className="product-item__actions">
              <label className="mini-switch">
                <input
                  type="checkbox"
                  checked={p.isActive}
                  onChange={async (e) => {
                    const isActive = e.target.checked;
                    if (!isActive) {
                      const ok = await confirm({
                        title: `${p.name} を予約画面から外しますか？`,
                        body: '新しい予約を受け付けられなくなります。登録済みの予約と時間枠は残ります。',
                        confirmLabel: '予約画面から外す',
                        tone: 'warn',
                      });
                      if (!ok) return;
                    }
                    await repo.saveProduct({ ...p, isActive });
                  }}
                />
                予約画面に出す
              </label>
              <button
                type="button"
                className="icon-btn"
                aria-label={`${p.name} を削除`}
                onClick={async () => {
                  const ok = await confirm({
                    title: `${p.name} を削除しますか？`,
                    body: '元に戻せません。時間枠が残っている体験は削除できません。',
                    confirmLabel: '削除する',
                    tone: 'danger',
                  });
                  if (!ok) return;
                  try {
                    await repo.deleteProduct(p.id);
                  } catch (err) {
                    toast(errorText(err), 'error');
                  }
                }}
              >
                <Icon name="delete" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例：体験C スタンプラリー" aria-label="追加する体験名" />
        <button type="submit" className="btn btn--ghost" disabled={!newName.trim()}>
          <Icon name="add" /> 追加
        </button>
      </form>
    </section>
  );
}

function SlotGenerator({ config, products }: { config: Config; products: Product[] }) {
  const ready = products.length > 0 && config.eventDates.length > 0;

  return (
    <section className="panel">
      <h2 className="panel__title">
        <Icon name="more_time" /> 時間枠を作る
      </h2>
      <p className="panel__hint">
        {ready
          ? '体験ごとに、開始時刻・長さ・回数を決めてまとめて作ります。体験を追加すると、ここにカードが増えます。'
          : '先に開催日と体験を追加してください。'}
      </p>
      {ready && (
        <div className="slot-cards">
          {products.map((p) => (
            <SlotGeneratorCard key={p.id} config={config} product={p} />
          ))}
        </div>
      )}
    </section>
  );
}

/** 体験1つ分の、時間枠の一括作成フォーム。 */
function SlotGeneratorCard({ config, product }: { config: Config; product: Product }) {
  const repo = useRepository();
  const toast = useToast();
  const [form, setForm] = useState({
    date: '',
    startTime: '10:00',
    intervalMinutes: 30,
    count: 10,
    capacity: 6,
  });

  const date = config.eventDates.includes(form.date) ? form.date : (config.eventDates[0] ?? '');
  const preview = useMemo(
    () => (date ? generateSlots({ ...form, productId: product.id, date }) : []),
    [form, product.id, date],
  );

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  // この体験・この日に、もう作ってある時間枠。同じ開始時刻の枠は二重に作らない
  const daySlots = useWatch<Slot[]>((l) => repo.watchSlots(date, l), [repo, date]);
  const created = (daySlots ?? []).filter((s) => s.productId === product.id);
  const taken = new Set(created.map((s) => s.startTime));
  const fresh = preview.filter((s) => !taken.has(s.startTime));
  const allCreated = preview.length > 0 && fresh.length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!daySlots || fresh.length === 0) return;
    const n = await repo.addSlots(fresh);
    toast(`${product.name} の時間枠を ${n} 件作りました`);
  };

  return (
    <form className="slot-card" style={{ '--product': product.color } as CSSProperties} onSubmit={submit}>
      <div className="slot-card__head">
        <h3 className="slot-card__title">{product.name}</h3>
        {daySlots &&
          (created.length > 0 ? (
            <span className="created-chip">
              <Icon name="check_circle" filled /> {formatDateShort(date)} は作成済み {created.length}回（
              {created[0].startTime}〜{created[created.length - 1].endTime}）
            </span>
          ) : (
            <span className="created-chip created-chip--none">{formatDateShort(date)} はまだ作っていません</span>
          ))}
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">日付</span>
          <select value={date} onChange={(e) => set('date', e.target.value)}>
            {config.eventDates.map((d) => (
              <option key={d} value={d}>
                {formatDateShort(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">最初の開始時刻</span>
          <input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} required />
        </label>
        <label className="field">
          <span className="field__label">1回の長さ（分）</span>
          <input
            type="number"
            min={5}
            max={240}
            step={5}
            value={form.intervalMinutes}
            onChange={(e) => set('intervalMinutes', Number(e.target.value))}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">回数</span>
          <input type="number" min={1} max={60} value={form.count} onChange={(e) => set('count', Number(e.target.value))} required />
        </label>
        <label className="field">
          <span className="field__label">1回の定員（人）</span>
          <input type="number" min={1} max={999} value={form.capacity} onChange={(e) => set('capacity', Number(e.target.value))} required />
        </label>
        <p className="form-grid__preview">
          {preview.length === 0
            ? '開始時刻と回数を確かめてください'
            : `${preview[0].startTime}〜${preview[preview.length - 1].endTime} に ${preview.length} 回、各 ${form.capacity} 人`}
          {preview.length > fresh.length && fresh.length > 0 && `。うち ${preview.length - fresh.length} 回は作成済みなので、残りの ${fresh.length} 回を作ります`}
        </p>
        {allCreated ? (
          <button type="submit" className="btn btn--done" disabled>
            <Icon name="check_circle" filled /> 作成済み
          </button>
        ) : (
          <button type="submit" className="btn btn--primary" disabled={!daySlots || fresh.length === 0}>
            <Icon name="add" /> {fresh.length < preview.length ? `残りの ${fresh.length} 回を作る` : 'この体験の時間枠を作る'}
          </button>
        )}
      </div>
    </form>
  );
}

function SlotEditor({
  config,
  products,
  date,
  onDateChange,
}: {
  config: Config;
  products: Product[];
  date: string;
  onDateChange: (date: string) => void;
}) {
  const repo = useRepository();
  const toast = useToast();
  const confirm = useConfirm();
  const slots = useWatch<Slot[]>((l) => repo.watchSlots(date, l), [repo, date]);
  const [productId, setProductId] = useState('');
  const current = products.some((p) => p.id === productId) ? productId : (products[0]?.id ?? '');
  const visible = (slots ?? []).filter((s) => s.productId === current);

  if (products.length === 0 || config.eventDates.length === 0) return null;

  return (
    <section className="panel">
      <h2 className="panel__title">
        <Icon name="view_agenda" /> 時間枠の一覧
      </h2>
      <DateChips dates={config.eventDates} value={date} onChange={onDateChange} />
      <ProductTabs products={products} value={current} onChange={setProductId} />
      {slots && visible.length === 0 && <p className="panel__hint">この日の時間枠はありません。</p>}
      <ul className="slot-editor">
        {visible.map((s) => (
          <li key={s.id} className={s.isOpen ? undefined : 'is-closed'}>
            <span className="slot-editor__time">
              {s.startTime}〜{s.endTime}
            </span>
            <label className="slot-editor__cap">
              <span>
                予約 {s.reservedCount} / 定員
              </span>
              <input
                type="number"
                min={1}
                max={999}
                defaultValue={s.capacity}
                aria-label={`${s.startTime} の定員`}
                onBlur={(e) => {
                  const capacity = Number(e.target.value);
                  if (capacity >= 1 && capacity !== s.capacity) void repo.updateSlot(s.id, { capacity });
                }}
              />
            </label>
            <label className="mini-switch">
              <input
                type="checkbox"
                checked={s.isOpen}
                onChange={async (e) => {
                  const isOpen = e.target.checked;
                  if (!isOpen) {
                    const ok = await confirm({
                      title: `${s.startTime}〜${s.endTime} の受付を止めますか？`,
                      body: 'この時間枠には新しい予約を登録できなくなります。登録済みの予約は残ります。',
                      confirmLabel: '受付を止める',
                      tone: 'warn',
                    });
                    if (!ok) return;
                  }
                  await repo.updateSlot(s.id, { isOpen });
                }}
              />
              受付中
            </label>
            <button
              type="button"
              className="icon-btn"
              aria-label={`${s.startTime} の時間枠を削除`}
              onClick={async () => {
                const ok = await confirm({
                  title: `${s.startTime}〜${s.endTime} の時間枠を削除しますか？`,
                  body: '元に戻せません。キャンセル済みの予約が残っていれば一緒に消えます。予約中の予約がある時間枠は削除できません。',
                  confirmLabel: '削除する',
                  tone: 'danger',
                });
                if (!ok) return;
                try {
                  await repo.deleteSlot(s.id);
                } catch (err) {
                  toast(errorText(err), 'error');
                }
              }}
            >
              <Icon name="delete" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
