import type {
  AgeGroup,
  Config,
  IssueFailure,
  LogAction,
  Participant,
  ReservationInput,
  ReservationStatus,
  Slot,
} from './types';

export const DEFAULT_CONFIG: Config = {
  eventName: '教室企画',
  capacityLimitEnabled: true,
  eventDates: [],
  identifyMode: 'ticket',
  autoTicketNo: true,
  privacyNotice:
    'お名前と電話番号は、予約の確認とご案内のためだけに使います。学園祭が終わったら消去します。',
};

export const MAX_PARTY_SIZE = 99;

export const AGE_GROUPS: { id: AgeGroup; label: string }[] = [
  { id: 'preschool', label: '未就学児' },
  { id: 'elementary', label: '小学生' },
  { id: 'juniorHigh', label: '中学生' },
  { id: 'highSchool', label: '高校生・高専生' },
  { id: 'university', label: '大学生・専門生' },
  { id: 'adult', label: '大人' },
];

export const AGE_GROUP_LABEL = Object.fromEntries(AGE_GROUPS.map((g) => [g.id, g.label])) as Record<AgeGroup, string>;

/** 一覧やCSVに出す、体験する人の並び（例：ハナコ（小学生）、タロウ（大人））。 */
export function formatParticipants(participants: Participant[]): string {
  return participants
    .map((p) => `${p.name || '（名前なし）'}${p.ageGroup ? `（${AGE_GROUP_LABEL[p.ageGroup]}）` : ''}`)
    .join('、');
}

export class IssueError extends Error {
  constructor(public readonly reason: IssueFailure) {
    super(issueFailureMessage(reason));
    this.name = 'IssueError';
  }
}

/** 全角数字や空白を吸収し、先頭の0を落とした整理券番号を返す。不正なら null。 */
export function normalizeTicketNo(input: string): string | null {
  const halfWidth = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s/g, '');
  if (!/^\d{1,8}$/.test(halfWidth)) return null;
  return String(Number(halfWidth));
}

/**
 * 次に使う整理券番号（登録済みの最大の番号 +1、まだなければ 1）を返す。
 * キャンセル済みの番号も使用済みとして数える。桁があふれるときは null。
 */
export function nextTicketNo(reservations: { ticketNo?: string }[]): string | null {
  const max = reservations.reduce((m, r) => Math.max(m, r.ticketNo ? Number(r.ticketNo) : 0), 0);
  const next = String(max + 1);
  return next.length > 8 ? null : next;
}

export function remainingSeats(slot: Slot): number {
  return slot.capacity - slot.reservedCount;
}

/**
 * 定員制御がONのとき、その人数が枠に収まらないかを返す。
 * freedSeats は、同じ枠の中で予約を変更するときに空く人数（変更前の人数）。
 */
export function exceedsCapacity(slot: Slot, config: Config, partySize: number, freedSeats = 0): boolean {
  return config.capacityLimitEnabled && remainingSeats(slot) + freedSeats < partySize;
}

export interface IssueCheck {
  partySize: number;
  /** 同じ整理券番号の予約がすでにある */
  duplicate: boolean;
  /** 定員を超える登録を特例として認める */
  allowException?: boolean;
}

/** 登録できるかを判定する。保存先に依存しない共通ルール。 */
export function checkIssuable(slot: Slot | undefined, config: Config, check: IssueCheck): IssueFailure | null {
  if (check.duplicate) return 'duplicate';
  if (!slot) return 'slotNotFound';
  if (!slot.isOpen) return 'closed';
  if (!check.allowException && exceedsCapacity(slot, config, check.partySize)) return 'full';
  return null;
}

export interface ReservationFields {
  ticketNo?: string;
  representativeName: string;
  representativeJoins: boolean;
  participants: Participant[];
  partySize: number;
  phone?: string;
  memo?: string;
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * フォームの入力を確かめ、前後の空白などを整えて返す。不正なら IssueError を投げる。
 * ticket は整理券番号の扱い（required：必須、optional：空でもよい、ignored：使わない）。
 */
export function validateReservationInput(
  input: ReservationInput,
  ticket: 'required' | 'optional' | 'ignored',
): ReservationFields {
  let ticketNo: string | undefined;
  if (ticket !== 'ignored' && (ticket === 'required' || input.ticketNo?.trim())) {
    const normalized = normalizeTicketNo(input.ticketNo ?? '');
    if (!normalized) throw new IssueError('invalidTicket');
    ticketNo = normalized;
  }
  const representativeName = input.representativeName.trim();
  if (!representativeName) throw new IssueError('nameRequired');
  if (input.participants.length < 1 || input.participants.length > MAX_PARTY_SIZE) {
    throw new IssueError('invalidPartySize');
  }
  // 人数の分だけ、名前と年齢区分がそろっていることを確かめる
  const participants = input.participants.map((p, i) => {
    const name = input.representativeJoins && i === 0 ? representativeName : p.name.trim();
    if (!name) throw new IssueError('participantNameRequired');
    if (!p.ageGroup || !(p.ageGroup in AGE_GROUP_LABEL)) throw new IssueError('ageRequired');
    return { name, ageGroup: p.ageGroup };
  });
  return {
    ticketNo,
    representativeName,
    representativeJoins: input.representativeJoins,
    participants,
    partySize: participants.length,
    phone: optionalText(input.phone),
    memo: optionalText(input.memo),
  };
}

export function issueFailureMessage(reason: IssueFailure): string {
  switch (reason) {
    case 'invalidTicket':
      return '整理券番号は数字で入力してください（8桁まで）';
    case 'duplicate':
      return 'この整理券はすでに登録されています。番号を確かめてください';
    case 'nameRequired':
      return '代表者の名前を入力してください';
    case 'invalidPartySize':
      return `人数は1〜${MAX_PARTY_SIZE}人で入力してください`;
    case 'participantNameRequired':
      return '体験する方のお名前を、人数の分だけ入力してください';
    case 'ageRequired':
      return '体験する方の年齢を、人数の分だけ選んでください';
    case 'slotNotFound':
      return 'この時間枠は削除されています。時間枠を選び直してください';
    case 'closed':
      return 'この時間枠は受付を停止しています';
    case 'full':
      return 'この時間枠は定員を超えます。特例で登録するか、別の時間枠を案内してください';
    case 'notFound':
      return 'この予約は削除されています';
    case 'cancelled':
      return 'キャンセル済みの予約は変更できません';
  }
}

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  reserved: '予約中',
  cancelled: 'キャンセル',
};

export const LOG_ACTION_LABEL: Record<LogAction, string> = {
  create: '登録',
  edit: '変更',
  cancel: 'キャンセル',
  delete: '削除',
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface SlotGenerationInput {
  productId: string;
  date: string;
  startTime: string;
  intervalMinutes: number;
  count: number;
  capacity: number;
}

export type NewSlot = Omit<Slot, 'id' | 'reservedCount'>;

/** 開始時刻から一定間隔で時間枠を作る。日付をまたぐ枠は作らない。 */
export function generateSlots(input: SlotGenerationInput): NewSlot[] {
  const start = toMinutes(input.startTime);
  const slots: NewSlot[] = [];
  for (let i = 0; i < input.count; i++) {
    const from = start + i * input.intervalMinutes;
    const to = from + input.intervalMinutes;
    if (to > 24 * 60) break;
    slots.push({
      productId: input.productId,
      date: input.date,
      startTime: toHHMM(from),
      endTime: toHHMM(to),
      capacity: input.capacity,
      isOpen: true,
    });
  }
  return slots;
}

export function compareSlots(a: Slot, b: Slot): number {
  return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
}

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}（${wd}）`;
}

/** ログや確認文に使う、時間枠の呼び名（例：体験A 11/3（火）13:00）。 */
export function formatSlotLabel(productName: string | undefined, slot: Slot | undefined): string {
  if (!slot) return '（削除された時間枠）';
  return `${productName ?? '（削除された体験）'} ${formatDateShort(slot.date)} ${slot.startTime}`;
}
