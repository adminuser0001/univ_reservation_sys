import { describe, expect, it } from 'vitest';
import { buildReservationCsvRows } from './exportCsv';
import { DEFAULT_CONFIG } from './rules';
import type { ExportData } from './types';

const data: ExportData = {
  version: 'test',
  exportedAt: '2026-11-03T00:00:00.000Z',
  config: DEFAULT_CONFIG,
  products: [{ id: 'p1', name: '体験A', color: '#000', sortOrder: 0, isActive: true }],
  slots: [
    { id: 's1', productId: 'p1', date: '2026-11-03', startTime: '13:00', endTime: '13:30', capacity: 6, reservedCount: 3, isOpen: true },
  ],
  reservations: [
    {
      id: 'r1',
      ticketNo: '12',
      productId: 'p1',
      slotId: 's1',
      date: '2026-11-03',
      status: 'reserved',
      representativeName: '山田',
      representativeJoins: true,
      participants: [
        { name: '山田', ageGroup: 'adult' },
        { name: '花子', ageGroup: 'elementary' },
        { name: '太郎', ageGroup: 'elementary' },
        { name: '次郎' },
      ],
      partySize: 4,
      isException: false,
      createdAt: 0,
      updatedAt: 0,
      createdBy: 'test',
    },
  ],
  logs: [],
};

describe('buildReservationCsvRows', () => {
  const [header, row] = buildReservationCsvRows(data);
  const cell = (name: string) => row[header.indexOf(name)];

  it('見出しと行の列数がそろう', () => {
    expect(row).toHaveLength(header.length);
  });

  it('名前と年齢区分を別の列に、同じ順番で出す', () => {
    expect(cell('体験する方')).toBe('山田、花子、太郎、次郎');
    expect(cell('年齢区分')).toBe('大人、小学生、小学生、未選択');
  });

  it('年齢区分ごとの人数を出す', () => {
    expect(cell('小学生（人）')).toBe(2);
    expect(cell('大人（人）')).toBe(1);
    expect(cell('未就学児（人）')).toBe(0);
    expect(cell('人数')).toBe(4);
  });

  it('体験名と時間枠を引いて出す', () => {
    expect(cell('体験')).toBe('体験A');
    expect(cell('開始')).toBe('13:00');
  });
});
