import type { NewSlot } from '../domain/rules';
import type { Config, ExportData, LogEntry, Product, Reservation, ReservationInput, Slot } from '../domain/types';

export type Unsubscribe = () => void;
export type Listener<T> = (value: T) => void;

export interface ReservationOptions {
  /** 定員を超える登録・変更を、特例として認める */
  allowException?: boolean;
}

/**
 * データの保存先を抽象化する。画面はこのインターフェースだけを使い、
 * 保存先が IndexedDB であることを意識しない。
 */
export interface Repository {
  watchConfig(listener: Listener<Config>): Unsubscribe;
  watchProducts(listener: Listener<Product[]>): Unsubscribe;
  watchSlots(date: string, listener: Listener<Slot[]>): Unsubscribe;
  watchReservationsByDate(date: string, listener: Listener<Reservation[]>): Unsubscribe;
  watchReservations(listener: Listener<Reservation[]>): Unsubscribe;
  /** 操作ログを新しい順に返す。 */
  watchLogs(listener: Listener<LogEntry[]>): Unsubscribe;

  /** 予約を登録する。失敗時は IssueError を投げる。 */
  createReservation(input: ReservationInput, options?: ReservationOptions): Promise<Reservation>;
  /** 予約の時間枠・人数・参加者情報を変更する。失敗時は IssueError を投げる。 */
  updateReservation(id: string, input: ReservationInput, options?: ReservationOptions): Promise<Reservation>;
  /** 記録を残したまま枠を空ける。 */
  cancelReservation(id: string): Promise<void>;
  /** 予約を記録ごと消す（個人情報も消える）。 */
  deleteReservation(id: string): Promise<void>;

  saveConfig(patch: Partial<Config>): Promise<void>;
  saveProduct(product: Product): Promise<void>;
  deleteProduct(id: string): Promise<void>;
  addSlots(slots: NewSlot[]): Promise<number>;
  updateSlot(id: string, patch: Partial<Pick<Slot, 'capacity' | 'isOpen'>>): Promise<void>;
  deleteSlot(id: string): Promise<void>;

  exportAll(): Promise<ExportData>;
  loadSampleData(): Promise<void>;
  clearAll(): Promise<void>;
}

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}
