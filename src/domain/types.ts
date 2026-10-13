export type ReservationStatus = 'reserved' | 'cancelled';

/** 予約を何で見分けるか。ticket：印刷済みの整理券番号、name：番号なし（名前のみ） */
export type IdentifyMode = 'ticket' | 'name';

export interface Config {
  eventName: string;
  capacityLimitEnabled: boolean;
  /** "YYYY-MM-DD" の配列（開催日） */
  eventDates: string[];
  identifyMode: IdentifyMode;
  /** 整理券番号の運用で、次の番号（登録済みの最大 +1）を自動で入力する */
  autoTicketNo: boolean;
  /** 予約フォームの上に出す、個人情報の取り扱いの案内文 */
  privacyNotice: string;
}

export type AgeGroup = 'preschool' | 'elementary' | 'juniorHigh' | 'highSchool' | 'university' | 'adult';

/** 体験する人。v0.2.0 以前のデータには年齢区分がない。 */
export interface Participant {
  name: string;
  ageGroup?: AgeGroup;
}

export interface Product {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Slot {
  id: string;
  productId: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  /** キャンセル以外の予約の人数の合計 */
  reservedCount: number;
  isOpen: boolean;
}

export interface Reservation {
  id: string;
  ticketNo?: string;
  productId: string;
  slotId: string;
  date: string;
  status: ReservationStatus;
  representativeName: string;
  /** 代表者も体験するか。true のとき participants の先頭が代表者 */
  representativeJoins: boolean;
  /** 体験する人。人数は partySize と一致する */
  participants: Participant[];
  /** 体験する人数 */
  partySize: number;
  phone?: string;
  memo?: string;
  /** 定員を超えて特例で登録した予約 */
  isException: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

/** 予約フォームの入力。新規登録と変更で共通。 */
export interface ReservationInput {
  slotId: string;
  ticketNo?: string;
  representativeName: string;
  representativeJoins: boolean;
  /** 体験する人。この数が人数になる。代表者も体験するときは先頭を代表者の枠にする */
  participants: Participant[];
  phone?: string;
  memo?: string;
}

export type IssueFailure =
  | 'invalidTicket'
  | 'duplicate'
  | 'nameRequired'
  | 'invalidPartySize'
  | 'participantNameRequired'
  | 'ageRequired'
  | 'slotNotFound'
  | 'closed'
  | 'full'
  | 'notFound'
  | 'cancelled';

export type LogAction = 'create' | 'edit' | 'cancel' | 'delete';

/** 操作の記録。名前・電話番号・備考の中身は書かない。 */
export interface LogEntry {
  id?: number;
  at: number;
  action: LogAction;
  reservationId: string;
  ticketNo?: string;
  summary: string;
  isException: boolean;
  deviceId: string;
}

export interface ExportData {
  version: string;
  exportedAt: string;
  config: Config;
  products: Product[];
  slots: Slot[];
  reservations: Reservation[];
  logs: LogEntry[];
}
