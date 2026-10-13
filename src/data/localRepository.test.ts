import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IssueError } from '../domain/rules';
import type { Participant, ReservationInput } from '../domain/types';
import { LocalRepository } from './localRepository';

let repo: LocalRepository;
let slotA: string;
let slotB: string;

beforeEach(async () => {
  repo = new LocalRepository(`test-${crypto.randomUUID()}`);
  await repo.saveConfig({ capacityLimitEnabled: true, identifyMode: 'ticket', eventDates: ['2026-11-03'] });
  await repo.saveProduct({ id: 'p1', name: '体験A', color: '#000', sortOrder: 0, isActive: true });
  await repo.addSlots([
    { productId: 'p1', date: '2026-11-03', startTime: '13:00', endTime: '13:20', capacity: 4, isOpen: true },
    { productId: 'p1', date: '2026-11-03', startTime: '13:20', endTime: '13:40', capacity: 4, isOpen: true },
  ]);
  [slotA, slotB] = (await repo.exportAll()).slots.map((s) => s.id);
});

afterEach(() => repo.close());

function people(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({ name: i === 0 ? '' : `体験者${i}`, ageGroup: 'adult' }));
}

function input(ticketNo: string, partySize = 1, slotId = slotA): ReservationInput {
  return { slotId, ticketNo, representativeName: '山田', representativeJoins: true, participants: people(partySize) };
}

async function reasonOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    return e instanceof IssueError ? e.reason : String(e);
  }
}

async function counts(): Promise<number[]> {
  return (await repo.exportAll()).slots.map((s) => s.reservedCount);
}

describe('LocalRepository.createReservation', () => {
  it('登録すると人数の分だけ予約数が増える', async () => {
    const r = await repo.createReservation(input('０１２', 3));
    expect(r.ticketNo).toBe('12');
    expect(r.isException).toBe(false);
    expect(await counts()).toEqual([3, 0]);
  });

  it('同じ整理券番号は二重に登録できない', async () => {
    await repo.createReservation(input('12'));
    expect(await reasonOf(repo.createReservation(input('012', 1, slotB)))).toBe('duplicate');
  });

  it('番号なしの運用では、整理券番号なしで登録できる', async () => {
    await repo.saveConfig({ identifyMode: 'name' });
    const { ticketNo: _unused, ...noTicket } = input('');
    const a = await repo.createReservation(noTicket);
    const b = await repo.createReservation(noTicket);
    expect(a.ticketNo).toBeUndefined();
    expect(b.id).not.toBe(a.id);
  });

  it('同時に登録しても定員を超えない', async () => {
    const results = await Promise.allSettled(['1', '2', '3'].map((t) => repo.createReservation(input(t, 2))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(await counts()).toEqual([4, 0]);
  });

  it('定員を超える人数は拒否し、特例なら印を付けて登録する', async () => {
    await repo.createReservation(input('1', 3));
    expect(await reasonOf(repo.createReservation(input('2', 2)))).toBe('full');
    const r = await repo.createReservation(input('2', 2), { allowException: true });
    expect(r.isException).toBe(true);
    expect(await counts()).toEqual([5, 0]);
    const log = (await repo.exportAll()).logs.at(-1);
    expect(log).toMatchObject({ action: 'create', isException: true });
  });

  it('定員制御OFFなら定員を超えて登録でき、特例の印は付かない', async () => {
    await repo.saveConfig({ capacityLimitEnabled: false });
    const r = await repo.createReservation(input('1', 6));
    expect(r.isException).toBe(false);
  });

  it('受付停止中の枠には登録できない', async () => {
    await repo.updateSlot(slotA, { isOpen: false });
    expect(await reasonOf(repo.createReservation(input('1')))).toBe('closed');
  });

  it('代表者名がなければ登録できない', async () => {
    expect(await reasonOf(repo.createReservation({ ...input('1'), representativeName: '' }))).toBe('nameRequired');
    expect(await counts()).toEqual([0, 0]);
  });

  it('体験する方の名前や年齢が欠けていれば登録できない', async () => {
    const base = input('1', 2);
    const second = (p: Participant) => ({ ...base, participants: [base.participants[0], p] });
    expect(await reasonOf(repo.createReservation(second({ name: '', ageGroup: 'adult' })))).toBe('participantNameRequired');
    expect(await reasonOf(repo.createReservation(second({ name: '花子' })))).toBe('ageRequired');
    expect(await counts()).toEqual([0, 0]);
  });

  it('代表者も体験するときは、先頭の体験者が代表者になる', async () => {
    const r = await repo.createReservation(input('1', 2));
    expect(r.participants.map((p) => p.name)).toEqual(['山田', '体験者1']);
    expect(r.partySize).toBe(2);
  });
});

describe('LocalRepository.updateReservation', () => {
  it('時間枠を変えると、両方の枠の予約数が動く', async () => {
    const r = await repo.createReservation(input('1', 2));
    const moved = await repo.updateReservation(r.id, input('1', 3, slotB));
    expect(moved.slotId).toBe(slotB);
    expect(await counts()).toEqual([0, 3]);
  });

  it('同じ枠で人数を変えると、差の分だけ予約数が動く', async () => {
    const r = await repo.createReservation(input('1', 2));
    await repo.updateReservation(r.id, input('1', 4));
    expect(await counts()).toEqual([4, 0]);
    await repo.updateReservation(r.id, input('1', 1));
    expect(await counts()).toEqual([1, 0]);
  });

  it('定員を超える変更は拒否し、特例なら通す', async () => {
    const r = await repo.createReservation(input('1', 2));
    await repo.createReservation(input('2', 2));
    expect(await reasonOf(repo.updateReservation(r.id, input('1', 3)))).toBe('full');
    const updated = await repo.updateReservation(r.id, input('1', 3), { allowException: true });
    expect(updated.isException).toBe(true);
    expect(await counts()).toEqual([5, 0]);
  });

  it('満員の枠でも、人数を変えない変更は通る', async () => {
    const r = await repo.createReservation(input('1', 4));
    const updated = await repo.updateReservation(r.id, { ...input('1', 4), representativeName: '佐藤' });
    expect(updated.representativeName).toBe('佐藤');
  });

  it('ほかの予約の整理券番号には変えられない', async () => {
    const r = await repo.createReservation(input('1'));
    await repo.createReservation(input('2'));
    expect(await reasonOf(repo.updateReservation(r.id, input('2')))).toBe('duplicate');
  });

  it('キャンセル済みの予約は変更できない', async () => {
    const r = await repo.createReservation(input('1'));
    await repo.cancelReservation(r.id);
    expect(await reasonOf(repo.updateReservation(r.id, input('1', 2)))).toBe('cancelled');
  });
});

describe('キャンセルと削除', () => {
  it('キャンセルすると枠が空き、番号は再利用できない', async () => {
    const r = await repo.createReservation(input('1', 3));
    await repo.cancelReservation(r.id);
    expect(await counts()).toEqual([0, 0]);
    expect(await reasonOf(repo.createReservation(input('1')))).toBe('duplicate');
  });

  it('削除すると枠が空き、記録も番号も残らない', async () => {
    const r = await repo.createReservation(input('1', 3));
    await repo.deleteReservation(r.id);
    expect(await counts()).toEqual([0, 0]);
    expect((await repo.exportAll()).reservations).toHaveLength(0);
    await repo.createReservation(input('1'));
  });

  it('キャンセル済みを削除しても、予約数は二重に減らない', async () => {
    const a = await repo.createReservation(input('1', 2));
    await repo.createReservation(input('2', 1));
    await repo.cancelReservation(a.id);
    await repo.deleteReservation(a.id);
    expect(await counts()).toEqual([1, 0]);
  });
});

describe('操作ログ', () => {
  it('操作ごとに1件残り、名前・電話番号・備考は含まない', async () => {
    const r = await repo.createReservation({
      ...input('1', 2),
      phone: '090-1234-5678',
      memo: '車いすで来場',
    });
    await repo.updateReservation(r.id, { ...input('1', 3, slotB), phone: '080-9999-0000', memo: '車いすで来場' });
    await repo.cancelReservation(r.id);
    await repo.deleteReservation(r.id);

    const { logs } = await repo.exportAll();
    expect(logs.map((l) => l.action)).toEqual(['create', 'edit', 'cancel', 'delete']);
    expect(logs[1].summary).toContain('人数 2人 → 3人');
    expect(logs[1].summary).toContain('電話番号');
    const text = JSON.stringify(logs);
    for (const secret of ['山田', '体験者1', '090-1234-5678', '080-9999-0000', '車いす']) expect(text).not.toContain(secret);
  });

  it('内容が変わらない保存はログを残さない', async () => {
    const r = await repo.createReservation(input('1'));
    await repo.updateReservation(r.id, input('1'));
    expect((await repo.exportAll()).logs).toHaveLength(1);
  });
});

describe('LocalRepository の削除ガード', () => {
  it('予約がある時間枠は削除できない', async () => {
    await repo.createReservation(input('1'));
    await expect(repo.deleteSlot(slotA)).rejects.toThrow();
  });
  it('キャンセル済みだけの時間枠は、その予約ごと削除する', async () => {
    const r = await repo.createReservation(input('1'));
    await repo.cancelReservation(r.id);
    await repo.deleteSlot(slotA);
    expect((await repo.exportAll()).reservations).toHaveLength(0);
  });
  it('時間枠がある体験は削除できない', async () => {
    await expect(repo.deleteProduct('p1')).rejects.toThrow();
  });
});

describe('v0.1.0 からのデータ移行', () => {
  it('整理券番号だけの予約を、1人の予約として引き継ぐ', async () => {
    const name = `migrate-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      config: 'id',
      products: 'id, sortOrder',
      slots: 'id, date, productId',
      reservations: 'ticketNo, slotId, date, status',
    });
    await v1.table('config').put({ id: 'main', eventName: '旧企画', capacityLimitEnabled: true, eventDates: [] });
    await v1.table('reservations').bulkAdd([
      { ticketNo: '7', productId: 'p1', slotId: 's1', date: '2026-11-03', status: 'checkedIn', createdAt: 1, createdBy: 'd' },
      { ticketNo: '8', productId: 'p1', slotId: 's1', date: '2026-11-03', status: 'cancelled', createdAt: 2, createdBy: 'd' },
    ]);
    v1.close();

    const migrated = new LocalRepository(name);
    const data = await migrated.exportAll();
    migrated.close();

    expect(data.config).toMatchObject({ eventName: '旧企画', identifyMode: 'ticket' });
    expect(data.config.privacyNotice).not.toBe('');
    const byTicket = new Map(data.reservations.map((r) => [r.ticketNo, r]));
    expect(byTicket.get('7')).toMatchObject({
      status: 'reserved',
      partySize: 1,
      representativeName: '',
      representativeJoins: true,
      participants: [{ name: '' }],
      isException: false,
    });
    expect(byTicket.get('8')).toMatchObject({ status: 'cancelled' });
  });
});

describe('v0.2.0 からのデータ移行', () => {
  it('自由記述の体験者名を、人数の分の欄に分ける', async () => {
    const name = `migrate-${crypto.randomUUID()}`;
    const v2 = new Dexie(name);
    v2.version(2).stores({
      config: 'id',
      products: 'id, sortOrder',
      slots: 'id, date, productId',
      bookings: 'id, ticketNo, slotId, date, status',
      logs: '++id, at, reservationId',
    });
    const base = { productId: 'p1', slotId: 's1', date: '2026-11-03', status: 'reserved', isException: false, createdAt: 1, updatedAt: 1, createdBy: 'd' };
    await v2.table('bookings').bulkAdd([
      { ...base, id: 'a', representativeName: '山田', participantNames: 'ハナコ、タロウ ジロウ', partySize: 2 },
      { ...base, id: 'b', representativeName: '佐藤', partySize: 2 },
    ]);
    v2.close();

    const migrated = new LocalRepository(name);
    const byId = new Map((await migrated.exportAll()).reservations.map((r) => [r.id, r]));
    migrated.close();

    expect(byId.get('a')).toMatchObject({
      representativeJoins: false,
      participants: [{ name: 'ハナコ' }, { name: 'タロウ、ジロウ' }],
    });
    expect(byId.get('a')).not.toHaveProperty('participantNames');
    expect(byId.get('b')).toMatchObject({ representativeJoins: true, participants: [{ name: '佐藤' }, { name: '' }] });
  });
});
