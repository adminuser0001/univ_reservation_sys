import Dexie, { liveQuery, type Table } from 'dexie';
import {
  checkIssuable,
  compareSlots,
  DEFAULT_CONFIG,
  exceedsCapacity,
  formatSlotLabel,
  IssueError,
  validateReservationInput,
  type NewSlot,
} from '../domain/rules';
import type {
  Config,
  ExportData,
  LogAction,
  LogEntry,
  Product,
  Reservation,
  ReservationInput,
  Slot,
} from '../domain/types';
import {
  RepositoryError,
  type Listener,
  type Repository,
  type ReservationOptions,
  type Unsubscribe,
} from './repository';
import { newId } from '../utils/id';
import { buildSampleData } from './sampleData';

const CONFIG_KEY = 'main';

interface ConfigRow extends Config {
  id: string;
}

/** v0.1.0 の予約（整理券番号が主キー、1予約＝1人） */
interface ReservationV1 {
  ticketNo: string;
  productId: string;
  slotId: string;
  date: string;
  status: 'reserved' | 'checkedIn' | 'cancelled' | 'noShow';
  createdAt: number;
  createdBy: string;
}

class ReservationDb extends Dexie {
  config!: Table<ConfigRow, string>;
  products!: Table<Product, string>;
  slots!: Table<Slot, string>;
  bookings!: Table<Reservation, string>;
  logs!: Table<LogEntry, number>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      config: 'id',
      products: 'id, sortOrder',
      slots: 'id, date, productId',
      reservations: 'ticketNo, slotId, date, status',
    });
    // 主キーは後から変えられないため、新しいテーブルに移し替える
    this.version(2)
      .stores({
        reservations: null,
        bookings: 'id, ticketNo, slotId, date, status',
        logs: '++id, at, reservationId',
      })
      .upgrade(async (tx) => {
        const old = await tx.table<ReservationV1>('reservations').toArray();
        await tx.table<Reservation>('bookings').bulkAdd(
          old.map((r) => ({
            id: newId(),
            ticketNo: r.ticketNo,
            productId: r.productId,
            slotId: r.slotId,
            date: r.date,
            status: r.status === 'cancelled' ? 'cancelled' : 'reserved',
            representativeName: '',
            representativeJoins: true,
            participants: [{ name: '' }],
            partySize: 1,
            isException: false,
            createdAt: r.createdAt,
            updatedAt: r.createdAt,
            createdBy: r.createdBy,
          })),
        );
      });
    // v0.2.0 では体験者名が自由記述の1欄だった。人数の分の欄に分ける（年齢区分は空のまま）
    this.version(3).upgrade(async (tx) => {
      await tx
        .table<Reservation & { participantNames?: string }>('bookings')
        .toCollection()
        .modify((r) => {
          if (r.participants) return;
          const names = (r.participantNames ?? '').split(/[、,，\s]+/).filter(Boolean);
          r.representativeJoins = names.length === 0;
          const filled = r.representativeJoins ? [r.representativeName] : names;
          // 人数より多く書かれていた名前は、最後の欄にまとめて残す
          r.participants = Array.from({ length: r.partySize }, (_, i) => ({
            name: i === r.partySize - 1 ? filled.slice(i).join('、') : (filled[i] ?? ''),
          }));
          delete r.participantNames;
        });
    });
  }
}

function watch<T>(query: () => Promise<T>, listener: Listener<T>): Unsubscribe {
  const subscription = liveQuery(query).subscribe({
    next: listener,
    error: (e) => console.error(e),
  });
  return () => subscription.unsubscribe();
}

/** IndexedDB（この端末のみ）に保存する Repository。 */
export class LocalRepository implements Repository {
  private readonly db: ReservationDb;

  constructor(
    dbName = 'univfes-reservation',
    private readonly deviceId = 'local',
  ) {
    this.db = new ReservationDb(dbName);
  }

  private async readConfig(): Promise<Config> {
    const row = await this.db.config.get(CONFIG_KEY);
    if (!row) return DEFAULT_CONFIG;
    const { id: _id, ...config } = row;
    // 旧バージョンで保存した設定には新しい項目がないため、既定値で補う
    return { ...DEFAULT_CONFIG, ...config };
  }

  private async slotLabel(slot: Slot | undefined): Promise<string> {
    const product = slot ? await this.db.products.get(slot.productId) : undefined;
    return formatSlotLabel(product?.name, slot);
  }

  private async addLog(action: LogAction, r: Reservation, summary: string, isException = false): Promise<void> {
    await this.db.logs.add({
      at: Date.now(),
      action,
      reservationId: r.id,
      ticketNo: r.ticketNo,
      summary,
      isException,
      deviceId: this.deviceId,
    });
  }

  /** 予約の書き込みで触るテーブル。ログも同じトランザクションで書く。 */
  private get reservationTables() {
    return [this.db.slots, this.db.bookings, this.db.config, this.db.products, this.db.logs];
  }

  watchConfig(listener: Listener<Config>): Unsubscribe {
    return watch(() => this.readConfig(), listener);
  }

  watchProducts(listener: Listener<Product[]>): Unsubscribe {
    return watch(() => this.db.products.orderBy('sortOrder').toArray(), listener);
  }

  watchSlots(date: string, listener: Listener<Slot[]>): Unsubscribe {
    return watch(async () => (await this.db.slots.where('date').equals(date).toArray()).sort(compareSlots), listener);
  }

  watchReservationsByDate(date: string, listener: Listener<Reservation[]>): Unsubscribe {
    return watch(() => this.db.bookings.where('date').equals(date).toArray(), listener);
  }

  watchReservations(listener: Listener<Reservation[]>): Unsubscribe {
    return watch(() => this.db.bookings.toArray(), listener);
  }

  watchLogs(listener: Listener<LogEntry[]>): Unsubscribe {
    return watch(() => this.db.logs.orderBy('id').reverse().toArray(), listener);
  }

  async createReservation(input: ReservationInput, options: ReservationOptions = {}): Promise<Reservation> {
    return this.db.transaction('rw', this.reservationTables, async () => {
      const config = await this.readConfig();
      const fields = validateReservationInput(input, config.identifyMode === 'ticket' ? 'required' : 'ignored');
      const slot = await this.db.slots.get(input.slotId);
      const duplicate = fields.ticketNo
        ? (await this.db.bookings.where('ticketNo').equals(fields.ticketNo).count()) > 0
        : false;
      const failure = checkIssuable(slot, config, {
        partySize: fields.partySize,
        duplicate,
        allowException: options.allowException,
      });
      if (failure || !slot) throw new IssueError(failure ?? 'slotNotFound');

      const now = Date.now();
      const reservation: Reservation = {
        ...fields,
        id: newId(),
        productId: slot.productId,
        slotId: slot.id,
        date: slot.date,
        status: 'reserved',
        isException: exceedsCapacity(slot, config, fields.partySize),
        createdAt: now,
        updatedAt: now,
        createdBy: this.deviceId,
      };
      await this.db.bookings.add(reservation);
      await this.db.slots.update(slot.id, { reservedCount: slot.reservedCount + fields.partySize });
      await this.addLog(
        'create',
        reservation,
        `${await this.slotLabel(slot)} に${fields.partySize}人で登録${reservation.isException ? '（定員を超える特例）' : ''}`,
        reservation.isException,
      );
      return reservation;
    });
  }

  async updateReservation(id: string, input: ReservationInput, options: ReservationOptions = {}): Promise<Reservation> {
    return this.db.transaction('rw', this.reservationTables, async () => {
      const old = await this.db.bookings.get(id);
      if (!old) throw new IssueError('notFound');
      if (old.status === 'cancelled') throw new IssueError('cancelled');

      const config = await this.readConfig();
      const useTicket = config.identifyMode === 'ticket';
      const fields = validateReservationInput(input, !useTicket ? 'ignored' : old.ticketNo ? 'required' : 'optional');
      // 番号なしの運用に切り替えたあとも、登録済みの番号は消さない
      const ticketNo = useTicket ? fields.ticketNo : old.ticketNo;
      if (ticketNo && ticketNo !== old.ticketNo) {
        if ((await this.db.bookings.where('ticketNo').equals(ticketNo).count()) > 0) throw new IssueError('duplicate');
      }

      const moved = input.slotId !== old.slotId;
      const slot = await this.db.slots.get(input.slotId);
      if (!slot) throw new IssueError('slotNotFound');
      if (moved && !slot.isOpen) throw new IssueError('closed');

      // 同じ枠で人数を減らす・そのままにする変更は、定員を確かめずに通す
      const needsSeats = moved || fields.partySize > old.partySize;
      const over = exceedsCapacity(slot, config, fields.partySize, moved ? 0 : old.partySize);
      if (needsSeats && over && !options.allowException) throw new IssueError('full');

      const updated: Reservation = {
        ...old,
        ...fields,
        ticketNo,
        productId: slot.productId,
        slotId: slot.id,
        date: slot.date,
        isException: needsSeats ? over : old.isException,
        updatedAt: Date.now(),
      };

      const changes: string[] = [];
      if (moved) {
        const oldSlot = await this.db.slots.get(old.slotId);
        changes.push(`時間枠 ${await this.slotLabel(oldSlot)} → ${await this.slotLabel(slot)}`);
        if (oldSlot) {
          await this.db.slots.update(oldSlot.id, { reservedCount: Math.max(0, oldSlot.reservedCount - old.partySize) });
        }
        await this.db.slots.update(slot.id, { reservedCount: slot.reservedCount + fields.partySize });
      } else if (fields.partySize !== old.partySize) {
        await this.db.slots.update(slot.id, {
          reservedCount: Math.max(0, slot.reservedCount - old.partySize + fields.partySize),
        });
      }
      if (fields.partySize !== old.partySize) changes.push(`人数 ${old.partySize}人 → ${fields.partySize}人`);
      if (ticketNo !== old.ticketNo) changes.push(`整理券番号 ${old.ticketNo ?? 'なし'} → ${ticketNo ?? 'なし'}`);
      if (updated.representativeName !== old.representativeName) changes.push('代表者名');
      if (
        updated.representativeJoins !== old.representativeJoins ||
        JSON.stringify(updated.participants) !== JSON.stringify(old.participants)
      ) {
        changes.push('体験する方');
      }
      if (updated.phone !== old.phone) changes.push('電話番号');
      if (updated.memo !== old.memo) changes.push('備考');
      if (changes.length === 0) return old;

      const exception = needsSeats && over;
      await this.db.bookings.put(updated);
      await this.addLog('edit', updated, `${changes.join('、')} を変更${exception ? '（定員を超える特例）' : ''}`, exception);
      return updated;
    });
  }

  async cancelReservation(id: string): Promise<void> {
    await this.db.transaction('rw', this.reservationTables, async () => {
      const r = await this.db.bookings.get(id);
      if (!r || r.status === 'cancelled') return;
      const cancelled: Reservation = { ...r, status: 'cancelled', updatedAt: Date.now() };
      await this.db.bookings.put(cancelled);
      const slot = await this.db.slots.get(r.slotId);
      if (slot) await this.db.slots.update(slot.id, { reservedCount: Math.max(0, slot.reservedCount - r.partySize) });
      await this.addLog('cancel', cancelled, `${await this.slotLabel(slot)} の${r.partySize}人をキャンセル`);
    });
  }

  async deleteReservation(id: string): Promise<void> {
    await this.db.transaction('rw', this.reservationTables, async () => {
      const r = await this.db.bookings.get(id);
      if (!r) return;
      const slot = await this.db.slots.get(r.slotId);
      if (slot && r.status === 'reserved') {
        await this.db.slots.update(slot.id, { reservedCount: Math.max(0, slot.reservedCount - r.partySize) });
      }
      await this.db.bookings.delete(id);
      await this.addLog('delete', r, `${await this.slotLabel(slot)} の${r.partySize}人の予約を削除`);
    });
  }

  async saveConfig(patch: Partial<Config>): Promise<void> {
    await this.db.transaction('rw', this.db.config, async () => {
      const current = await this.readConfig();
      await this.db.config.put({ ...current, ...patch, id: CONFIG_KEY });
    });
  }

  async saveProduct(product: Product): Promise<void> {
    await this.db.products.put({ ...product, id: product.id || newId() });
  }

  async deleteProduct(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.products, this.db.slots, async () => {
      const slotCount = await this.db.slots.where('productId').equals(id).count();
      if (slotCount > 0) throw new RepositoryError('この体験には時間枠があります。先に時間枠を削除してください');
      await this.db.products.delete(id);
    });
  }

  async addSlots(slots: NewSlot[]): Promise<number> {
    await this.db.slots.bulkAdd(slots.map((s) => ({ ...s, id: newId(), reservedCount: 0 })));
    return slots.length;
  }

  async updateSlot(id: string, patch: Partial<Pick<Slot, 'capacity' | 'isOpen'>>): Promise<void> {
    await this.db.slots.update(id, patch);
  }

  async deleteSlot(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.slots, this.db.bookings, async () => {
      const inSlot = await this.db.bookings.where('slotId').equals(id).toArray();
      if (inSlot.some((r) => r.status !== 'cancelled')) {
        throw new RepositoryError('予約が入っている時間枠は削除できません。受付停止を使ってください');
      }
      // 残っているのはキャンセル済みだけ。一覧から見えなくなるので、個人情報ごと消す
      await this.db.bookings.bulkDelete(inSlot.map((r) => r.id));
      await this.db.slots.delete(id);
    });
  }

  async exportAll(): Promise<ExportData> {
    const [config, products, slots, reservations, logs] = await Promise.all([
      this.readConfig(),
      this.db.products.toArray(),
      this.db.slots.toArray(),
      this.db.bookings.toArray(),
      this.db.logs.toArray(),
    ]);
    return {
      version: typeof __APP_VERSION__ === 'undefined' ? 'test' : __APP_VERSION__,
      exportedAt: new Date().toISOString(),
      config,
      products,
      slots: slots.sort(compareSlots),
      reservations,
      logs,
    };
  }

  async loadSampleData(): Promise<void> {
    const sample = buildSampleData();
    await this.clearAll();
    await this.db.config.put({ ...sample.config, id: CONFIG_KEY });
    await this.db.products.bulkPut(sample.products);
    await this.addSlots(sample.slots);
  }

  async clearAll(): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.config, this.db.products, this.db.slots, this.db.bookings, this.db.logs],
      async () => {
        await Promise.all([
          this.db.config.clear(),
          this.db.products.clear(),
          this.db.slots.clear(),
          this.db.bookings.clear(),
          this.db.logs.clear(),
        ]);
      },
    );
  }

  close(): void {
    this.db.close();
  }
}
