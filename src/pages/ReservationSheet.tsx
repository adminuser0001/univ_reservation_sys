import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useConfirm } from '../components/Confirm';
import { Icon } from '../components/Icon';
import { Keypad } from '../components/Keypad';
import { Sheet } from '../components/Sheet';
import { Stepper } from '../components/Stepper';
import { useToast } from '../components/Toast';
import { useRepository } from '../data/RepositoryProvider';
import {
  AGE_GROUPS,
  exceedsCapacity,
  formatDateShort,
  formatSlotLabel,
  IssueError,
  MAX_PARTY_SIZE,
  nextTicketNo,
  remainingSeats,
} from '../domain/rules';
import type { Config, Participant, Product, Reservation, Slot } from '../domain/types';
import { useWatch } from '../hooks/useWatch';

const MAX_DIGITS = 8;

interface Props {
  config: Config;
  products: Product[];
  /** 新しく登録する時間枠。変更のときは reservation を渡す。 */
  slot?: Slot;
  reservation?: Reservation;
  onClose: () => void;
}

interface FormState {
  ticketNo: string;
  representativeName: string;
  /** true のとき、participants の先頭は代表者の枠（名前は代表者名を使う） */
  representativeJoins: boolean;
  participants: Participant[];
  phone: string;
  memo: string;
}

function initialForm(r?: Reservation): FormState {
  return {
    ticketNo: r?.ticketNo ?? '',
    representativeName: r?.representativeName ?? '',
    representativeJoins: r?.representativeJoins ?? true,
    participants: r?.participants.map((p) => ({ ...p })) ?? [{ name: '' }],
    phone: r?.phone ?? '',
    memo: r?.memo ?? '',
  };
}

/** 予約の登録と変更で共用するフォーム。お客様に端末を渡して入力してもらうこともある。 */
export function ReservationSheet({ config, products, slot: initialSlot, reservation, onClose }: Props) {
  const repo = useRepository();
  const toast = useToast();
  const confirm = useConfirm();
  const editing = Boolean(reservation);
  const useTicket = config.identifyMode === 'ticket';

  const [date, setDate] = useState(reservation?.date ?? initialSlot?.date ?? '');
  const [productId, setProductId] = useState(reservation?.productId ?? initialSlot?.productId ?? '');
  const [slotId, setSlotId] = useState(reservation?.slotId ?? initialSlot?.id ?? '');
  const [form, setForm] = useState(() => initialForm(reservation));
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  // 足りない入力の案内を出すか。新規は何か入力してから、変更は開いたときから出す
  const [showMissing, setShowMissing] = useState(editing);
  const [busy, setBusy] = useState(false);

  const slots = useWatch<Slot[]>((l) => repo.watchSlots(date, l), [repo, date]);
  const sameDay = useWatch<Reservation[]>((l) => repo.watchReservationsByDate(date, l), [repo, date]);
  const slot = slots?.find((s) => s.id === slotId);
  const product = products.find((p) => p.id === productId);

  const cancelled = reservation?.status === 'cancelled';
  const locked = cancelled || registered;
  // 番号はテンキーで入れる。変更のときは打ち直すことが少ないので、ふつうの入力欄にする
  const keypadEntry = useTicket && !editing;

  // 整理券番号の自動入力：登録済みの最大 +1 を入れておく。テンキーで触ったら、その入力を優先する
  const autoTicket = keypadEntry && config.autoTicketNo;
  const [ticketTouched, setTicketTouched] = useState(false);
  const allReservations = useWatch<Reservation[]>(autoTicket ? (l) => repo.watchReservations(l) : null, [repo, autoTicket]);
  const suggestedTicketNo = allReservations ? nextTicketNo(allReservations) : null;
  const ticketIsAuto = autoTicket && !ticketTouched && form.ticketNo !== '' && form.ticketNo === suggestedTicketNo;

  useEffect(() => {
    if (!suggestedTicketNo || ticketTouched || registered) return;
    setForm((f) => (f.ticketNo === suggestedTicketNo ? f : { ...f, ticketNo: suggestedTicketNo }));
  }, [suggestedTicketNo, ticketTouched, registered]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setError(null);
    setShowMissing(true);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const partySize = form.participants.length;

  const setPartySize = (n: number) =>
    set(
      'participants',
      Array.from({ length: n }, (_, i) => form.participants[i] ?? { name: '' }),
    );

  const setParticipant = (index: number, patch: Partial<Participant>) =>
    set(
      'participants',
      form.participants.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );

  // 代表者の枠は先頭に足す・外す。空の1人目しかないときは、その枠を代表者に使う
  const toggleRepresentative = () => {
    setError(null);
    setShowMissing(true);
    setForm((f) => {
      const [first, ...rest] = f.participants;
      if (f.representativeJoins) {
        return { ...f, representativeJoins: false, participants: rest.length > 0 ? rest : [{ ...first, name: '' }] };
      }
      const reuseFirst = first.name.trim() === '' || f.participants.length >= MAX_PARTY_SIZE;
      return {
        ...f,
        representativeJoins: true,
        participants: reuseFirst ? [{ ...first, name: '' }, ...rest] : [{ name: '' }, ...f.participants],
      };
    });
  };

  const missingOf = (p: Participant, i: number): 'name' | 'age' | null => {
    if (!(form.representativeJoins && i === 0) && p.name.trim() === '') return 'name';
    return p.ageGroup ? null : 'age';
  };

  // 同じ枠のまま変更するときは、この予約が今使っている人数も空きに数える
  const freed = reservation && reservation.status === 'reserved' && reservation.slotId === slotId ? reservation.partySize : 0;
  const left = slot ? remainingSeats(slot) + freed : 0;
  const needsSeats = !reservation || reservation.slotId !== slotId || partySize > reservation.partySize;
  const over = Boolean(slot) && needsSeats && exceedsCapacity(slot!, config, partySize, freed);

  const name = form.representativeName.trim();
  const sameName =
    name !== '' &&
    (sameDay ?? []).some(
      (r) => r.id !== reservation?.id && r.slotId === slotId && r.status === 'reserved' && r.representativeName === name,
    );

  // 足りない入力を上から順に1つ返す。そろうまで登録・保存のボタンは押せない
  const incompleteMessage = ((): string | null => {
    if (!slot) return '時間枠を選んでください';
    const ticketRequired = useTicket && (!reservation || Boolean(reservation.ticketNo));
    if (ticketRequired && form.ticketNo.trim() === '') return '整理券番号を入力してください';
    if (name === '') return '代表者のお名前を入力してください';
    const index = form.participants.findIndex((p, i) => missingOf(p, i) !== null);
    if (index < 0) return null;
    return missingOf(form.participants[index], index) === 'name'
      ? `${index + 1}人目のお名前を入力してください（体験する人数は${partySize}人です）`
      : `${index + 1}人目の年齢を選んでください`;
  })();

  const inputDigit = useCallback(
    (key: string) => {
      if (locked) return;
      setError(null);
      setShowMissing(true);
      setTicketTouched(true);
      setForm((f) => {
        const d = f.ticketNo;
        const next = key === 'clear' ? '' : key === 'back' ? d.slice(0, -1) : d.length >= MAX_DIGITS ? d : d + key;
        return { ...f, ticketNo: next };
      });
    },
    [locked],
  );

  // PC・タブレットの物理キーボードでも番号を入力できるようにする（入力欄にいる間は除く）
  useEffect(() => {
    if (!keypadEntry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^[0-9]$/.test(e.key)) inputDigit(e.key);
      else if (e.key === 'Backspace') inputDigit('back');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inputDigit, keypadEntry]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || locked || !slot) return;

    if (incompleteMessage) return;

    const label = formatSlotLabel(product?.name, slot);
    if (over) {
      const ok = await confirm({
        title: '定員を超えます。特例として登録しますか？',
        body: `${label} は残り${Math.max(0, left)}人です。${partySize}人で登録すると定員を超えます。\n特例の登録は履歴に残ります。`,
        confirmLabel: reservation ? '特例で変更を保存' : '特例で登録する',
        tone: 'warn',
      });
      if (!ok) return;
    } else if (reservation) {
      const ok = await confirm({
        title: '予約の変更を保存しますか？',
        body: `${label}・${partySize}人の予約として保存します。`,
        confirmLabel: '変更を保存',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const input = { ...form, slotId };
      if (reservation) {
        await repo.updateReservation(reservation.id, input, { allowException: over });
        toast('予約を変更しました');
        onClose();
      } else {
        await repo.createReservation(input, { allowException: over });
        // 登録の合図は券面の「登録済」印で示す
        setRegistered(true);
      }
    } catch (err) {
      setError(err instanceof IssueError ? err.message : '保存できませんでした。もう一度試してください');
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setRegistered(false);
    setShowMissing(false);
    setTicketTouched(false);
    setForm(initialForm());
    setError(null);
  };

  const who = reservation?.representativeName || (reservation?.ticketNo ? `整理券 ${reservation.ticketNo}` : 'この予約');

  const cancel = async () => {
    if (!reservation) return;
    const ok = await confirm({
      title: `${who} の予約をキャンセルしますか？`,
      body: `${reservation.partySize}人分の枠が空きます。記録は一覧に残ります。`,
      confirmLabel: 'キャンセルする',
      tone: 'danger',
    });
    if (!ok) return;
    await repo.cancelReservation(reservation.id);
    toast('予約をキャンセルしました');
    onClose();
  };

  const remove = async () => {
    if (!reservation) return;
    const ok = await confirm({
      title: `${who} の予約を削除しますか？`,
      body: '名前や電話番号ごと消えて、元に戻せません。',
      confirmLabel: '削除する',
      tone: 'danger',
    });
    if (!ok) return;
    await repo.deleteReservation(reservation.id);
    toast('予約を削除しました');
    onClose();
  };

  const face = useTicket ? form.ticketNo : name;
  const canSubmit = incompleteMessage === null;
  const notice = error ?? (showMissing && !locked ? incompleteMessage : null);

  return (
    <Sheet
      onClose={onClose}
      wide={keypadEntry}
      title={
        <>
          <span className="sheet__product" style={{ '--product': product?.color } as CSSProperties}>
            {product?.name ?? '時間枠を選んでください'}
          </span>
          <span className="sheet__slot">
            {slot ? `${formatDateShort(slot.date)} ${slot.startTime}〜${slot.endTime}` : formatDateShort(date)}
            {slot && !cancelled && (
              <span className={left <= 0 ? 'is-warn' : undefined}>
                {left > 0 ? `残り ${left}人` : `定員 ${slot.capacity}人に到達`}
              </span>
            )}
          </span>
        </>
      }
    >
      <form className={`res-form${keypadEntry ? ' res-form--split' : ''}`} onSubmit={submit} noValidate>
        <div className="res-form__face">
          <div
            className={`ticket${registered ? ' ticket--done' : ''}${cancelled ? ' ticket--void' : ''}`}
            style={{ '--product': product?.color } as CSSProperties}
          >
            <span className="ticket__label">{!useTicket ? '代表者' : ticketIsAuto ? '整理券番号（自動入力）' : '整理券番号'}</span>
            <span
              className={`ticket__number${useTicket ? '' : ' ticket__number--name'}${face ? '' : ' is-empty'}`}
              aria-live="polite"
            >
              {face || (useTicket ? '券の番号を入力' : 'お名前を入力')}
            </span>
            <span className="ticket__party">{partySize}人</span>
            {registered && (
              <span className="ticket__stamp" aria-label="登録済み">
                登録済
              </span>
            )}
          </div>
          {keypadEntry && !registered && <Keypad onInput={inputDigit} disabled={busy} />}
        </div>

        <div className="res-form__body">
          {config.privacyNotice.trim() !== '' && !cancelled && (
            <p className="privacy-note">
              <Icon name="shield_person" /> {config.privacyNotice}
            </p>
          )}

          {cancelled && (
            <p className="inline-note">
              <Icon name="cancel" /> キャンセル済みの予約です。内容は変更できません。
            </p>
          )}

          <fieldset className="fields" disabled={locked || busy}>
            {editing && !cancelled && (
              <div className="fields__row fields__row--slot">
                <label className="field">
                  <span className="field__label">日付</span>
                  <select
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setSlotId('');
                      setError(null);
                    }}
                  >
                    {[...new Set([...config.eventDates, date])].sort().map((d) => (
                      <option key={d} value={d}>
                        {formatDateShort(d)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">体験</span>
                  <select
                    value={productId}
                    onChange={(e) => {
                      setProductId(e.target.value);
                      setSlotId('');
                      setError(null);
                    }}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">時間枠</span>
                  <select
                    value={slotId}
                    onChange={(e) => {
                      setSlotId(e.target.value);
                      setError(null);
                    }}
                  >
                    <option value="" disabled>
                      選んでください
                    </option>
                    {(slots ?? [])
                      .filter((s) => s.productId === productId)
                      .map((s) => {
                        const own = s.id === reservation?.slotId;
                        const seats = remainingSeats(s) + (own ? freed : 0);
                        return (
                          <option key={s.id} value={s.id} disabled={!s.isOpen && !own}>
                            {s.startTime}〜{s.endTime}（{s.isOpen || own ? `残り${seats}人` : '停止中'}）
                          </option>
                        );
                      })}
                  </select>
                </label>
              </div>
            )}

            {useTicket && editing && (
              <label className="field">
                <span className="field__label">整理券番号</span>
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={MAX_DIGITS}
                  value={form.ticketNo}
                  onChange={(e) => set('ticketNo', e.target.value)}
                />
              </label>
            )}

            <label className="field">
              <span className="field__label">代表者のお名前</span>
              <input
                autoComplete="off"
                maxLength={40}
                placeholder="例：ヤマダ"
                value={form.representativeName}
                onChange={(e) => set('representativeName', e.target.value)}
              />
            </label>

            <button
              type="button"
              className="check-button"
              aria-pressed={form.representativeJoins}
              onClick={toggleRepresentative}
            >
              <Icon name={form.representativeJoins ? 'check_box' : 'check_box_outline_blank'} filled={form.representativeJoins} />
              代表者も体験する
            </button>

            <div className="fields__row">
              <div className="field">
                <span className="field__label">体験する人数</span>
                <Stepper label="体験する人数" unit="人" min={1} max={MAX_PARTY_SIZE} value={partySize} onChange={setPartySize} />
              </div>
              <label className="field">
                <span className="field__label">電話番号（任意）</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={20}
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </label>
            </div>

            <div className="field">
              <span className="field__label">体験する方のお名前と年齢（{partySize}人分）</span>
              <ol className="people">
                {form.participants.map((p, i) => {
                  const isRepresentative = form.representativeJoins && i === 0;
                  const missing = showMissing ? missingOf(p, i) : null;
                  return (
                    <li key={i} className={`person${missing ? ' person--missing' : ''}`}>
                      <span className="person__no">{i + 1}</span>
                      {isRepresentative ? (
                        <span className="person__rep">
                          <span>{name || '代表者'}</span>
                          <span className="tag">代表者</span>
                        </span>
                      ) : (
                        <input
                          className="person__name"
                          autoComplete="off"
                          maxLength={40}
                          aria-label={`${i + 1}人目のお名前`}
                          aria-invalid={missing === 'name'}
                          placeholder={`${i + 1}人目のお名前`}
                          value={p.name}
                          onChange={(e) => setParticipant(i, { name: e.target.value })}
                        />
                      )}
                      <div className="age-chips" role="radiogroup" aria-label={`${i + 1}人目の年齢`}>
                        {AGE_GROUPS.map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            role="radio"
                            aria-checked={p.ageGroup === g.id}
                            className="age-chip"
                            onClick={() => setParticipant(i, { ageGroup: g.id })}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <label className="field">
              <span className="field__label">備考（任意）</span>
              <textarea rows={2} maxLength={200} value={form.memo} onChange={(e) => set('memo', e.target.value)} />
            </label>
          </fieldset>

          {sameName && !locked && (
            <p className="inline-note">
              <Icon name="info" /> この回には同じ名前の予約がもうあります。重複でないか確かめてください。
            </p>
          )}

          {over && !locked && (
            <p className="inline-note inline-note--warn">
              <Icon name="warning" filled /> {formatSlotLabel(product?.name, slot)} は残り{Math.max(0, left)}人です。
              {partySize}人は定員を超えるため、特例の登録になります。
            </p>
          )}

          {notice && (
            <p className="sheet__error" role="alert">
              <Icon name="error" filled /> {notice}
            </p>
          )}

          {registered ? (
            <div className="sheet__actions">
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                閉じる
              </button>
              <button type="button" className="btn btn--primary" onClick={next} autoFocus>
                <Icon name="add" /> 続けて登録
              </button>
            </div>
          ) : editing ? (
            <div className="res-form__actions">
              <button type="button" className="btn btn--danger-ghost" onClick={() => void remove()}>
                <Icon name="delete" /> 削除
              </button>
              {!cancelled && (
                <>
                  <button type="button" className="btn btn--danger-ghost" onClick={() => void cancel()}>
                    <Icon name="event_busy" /> キャンセル
                  </button>
                  <button
                    type="submit"
                    className={`btn btn--grow ${over ? 'btn--warn' : 'btn--primary'}`}
                    disabled={!canSubmit || busy}
                  >
                    <Icon name="save" /> {over ? '特例で変更を保存' : '変更を保存'}
                  </button>
                </>
              )}
            </div>
          ) : (
            <button
              type="submit"
              className={`btn btn--block ${over ? 'btn--warn' : 'btn--primary'}`}
              disabled={!canSubmit || busy}
            >
              <Icon name="confirmation_number" /> {over ? '特例でこの回に登録する' : 'この回に登録する'}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
