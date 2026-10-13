import { describe, expect, it } from 'vitest';
import {
  checkIssuable,
  DEFAULT_CONFIG,
  exceedsCapacity,
  generateSlots,
  IssueError,
  nextTicketNo,
  normalizeTicketNo,
  validateReservationInput,
} from './rules';
import type { Participant, ReservationInput, Slot } from './types';

const slot: Slot = {
  id: 's1',
  productId: 'p1',
  date: '2026-11-03',
  startTime: '13:00',
  endTime: '13:20',
  capacity: 4,
  reservedCount: 0,
  isOpen: true,
};

const one = { partySize: 1, duplicate: false };

describe('normalizeTicketNo', () => {
  it('全角数字・空白・先頭の0を吸収する', () => {
    expect(normalizeTicketNo(' ００１２ ')).toBe('12');
    expect(normalizeTicketNo('0')).toBe('0');
  });
  it('数字以外や9桁以上は null', () => {
    expect(normalizeTicketNo('')).toBeNull();
    expect(normalizeTicketNo('A12')).toBeNull();
    expect(normalizeTicketNo('123456789')).toBeNull();
  });
});

describe('nextTicketNo', () => {
  it('登録済みの最大の番号の次を返す。番号のない予約は数えない', () => {
    expect(nextTicketNo([])).toBe('1');
    expect(nextTicketNo([{ ticketNo: '3' }, { ticketNo: '12' }, {}, { ticketNo: '7' }])).toBe('13');
  });
  it('8桁を超えるときは null', () => {
    expect(nextTicketNo([{ ticketNo: '99999999' }])).toBeNull();
  });
});

describe('checkIssuable', () => {
  it('空きがあれば登録できる', () => {
    expect(checkIssuable(slot, DEFAULT_CONFIG, one)).toBeNull();
  });
  it('登録済みの整理券は拒否する', () => {
    expect(checkIssuable(slot, DEFAULT_CONFIG, { ...one, duplicate: true })).toBe('duplicate');
  });
  it('受付停止中は、特例でも拒否する', () => {
    const closed = { ...slot, isOpen: false };
    expect(checkIssuable(closed, DEFAULT_CONFIG, one)).toBe('closed');
    expect(checkIssuable(closed, DEFAULT_CONFIG, { ...one, allowException: true })).toBe('closed');
  });
  it('人数が残りに収まらなければ拒否する', () => {
    const three = { ...slot, reservedCount: 3 };
    expect(checkIssuable(three, DEFAULT_CONFIG, one)).toBeNull();
    expect(checkIssuable(three, DEFAULT_CONFIG, { partySize: 2, duplicate: false })).toBe('full');
  });
  it('特例なら定員を超えて登録できる', () => {
    const full = { ...slot, reservedCount: 4 };
    expect(checkIssuable(full, DEFAULT_CONFIG, one)).toBe('full');
    expect(checkIssuable(full, DEFAULT_CONFIG, { ...one, allowException: true })).toBeNull();
  });
  it('定員制御OFFなら満員でも受け付ける', () => {
    const full = { ...slot, reservedCount: 4 };
    expect(checkIssuable(full, { ...DEFAULT_CONFIG, capacityLimitEnabled: false }, one)).toBeNull();
  });
  it('時間枠がなければ拒否する', () => {
    expect(checkIssuable(undefined, DEFAULT_CONFIG, one)).toBe('slotNotFound');
  });
});

describe('exceedsCapacity', () => {
  it('同じ枠の中の変更は、変更前の人数を空きに数える', () => {
    const full = { ...slot, reservedCount: 4 };
    expect(exceedsCapacity(full, DEFAULT_CONFIG, 2)).toBe(true);
    expect(exceedsCapacity(full, DEFAULT_CONFIG, 2, 2)).toBe(false);
    expect(exceedsCapacity(full, DEFAULT_CONFIG, 3, 2)).toBe(true);
  });
});

describe('validateReservationInput', () => {
  const input: ReservationInput = {
    slotId: 's1',
    ticketNo: '０１２',
    representativeName: ' 山田 ',
    representativeJoins: true,
    participants: [
      { name: '', ageGroup: 'adult' },
      { name: ' 花子 ', ageGroup: 'elementary' },
    ],
    phone: ' 090-0000-0000 ',
  };
  const reasonOf = (fn: () => unknown) => {
    try {
      fn();
      return undefined;
    } catch (e) {
      return e instanceof IssueError ? e.reason : String(e);
    }
  };

  it('空白を落とし、代表者も体験するときは先頭を代表者にする', () => {
    expect(validateReservationInput(input, 'required')).toEqual({
      ticketNo: '12',
      representativeName: '山田',
      representativeJoins: true,
      participants: [
        { name: '山田', ageGroup: 'adult' },
        { name: '花子', ageGroup: 'elementary' },
      ],
      partySize: 2,
      phone: '090-0000-0000',
      memo: undefined,
    });
  });
  it('番号なしの運用では整理券番号を使わない', () => {
    expect(validateReservationInput(input, 'ignored').ticketNo).toBeUndefined();
  });
  it('整理券番号が必須のときは、空や数字以外を拒否する', () => {
    expect(reasonOf(() => validateReservationInput({ ...input, ticketNo: '' }, 'required'))).toBe('invalidTicket');
    expect(reasonOf(() => validateReservationInput({ ...input, ticketNo: 'A1' }, 'optional'))).toBe('invalidTicket');
    expect(validateReservationInput({ ...input, ticketNo: '' }, 'optional').ticketNo).toBeUndefined();
  });
  it('代表者名と人数を確かめる', () => {
    expect(reasonOf(() => validateReservationInput({ ...input, representativeName: ' ' }, 'ignored'))).toBe('nameRequired');
    expect(reasonOf(() => validateReservationInput({ ...input, participants: [] }, 'ignored'))).toBe('invalidPartySize');
  });
  it('人数の分だけ、名前と年齢がそろっていなければ拒否する', () => {
    const [first, second] = input.participants;
    const withSecond = (p: Participant) => ({ ...input, participants: [first, p] });
    expect(reasonOf(() => validateReservationInput(withSecond({ ...second, name: ' ' }), 'ignored'))).toBe(
      'participantNameRequired',
    );
    expect(reasonOf(() => validateReservationInput(withSecond({ name: '花子' }), 'ignored'))).toBe('ageRequired');
    // 代表者が体験しないときは、先頭の欄にも名前が要る
    expect(reasonOf(() => validateReservationInput({ ...input, representativeJoins: false }, 'ignored'))).toBe(
      'participantNameRequired',
    );
  });
});

describe('generateSlots', () => {
  it('開始時刻から間隔ごとに枠を作る', () => {
    const slots = generateSlots({
      productId: 'p1',
      date: '2026-11-03',
      startTime: '10:00',
      intervalMinutes: 30,
      count: 3,
      capacity: 6,
    });
    expect(slots.map((s) => `${s.startTime}-${s.endTime}`)).toEqual([
      '10:00-10:30',
      '10:30-11:00',
      '11:00-11:30',
    ]);
  });
  it('日付をまたぐ枠は作らない', () => {
    const slots = generateSlots({
      productId: 'p1',
      date: '2026-11-03',
      startTime: '23:00',
      intervalMinutes: 40,
      count: 3,
      capacity: 1,
    });
    expect(slots).toHaveLength(1);
  });
});
