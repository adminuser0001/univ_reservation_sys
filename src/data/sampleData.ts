import { DEFAULT_CONFIG, generateSlots, todayISO, type NewSlot } from '../domain/rules';
import type { Config, Product } from '../domain/types';

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + days));
}

/** 動作確認用のサンプル。今日と翌日の2日開催、体験A・Bの2種類。 */
export function buildSampleData(): { config: Config; products: Product[]; slots: NewSlot[] } {
  const day1 = todayISO();
  const day2 = addDays(day1, 1);
  const products: Product[] = [
    { id: 'sample-a', name: '体験A 謎解き教室', color: '#2F4BC7', sortOrder: 0, isActive: true },
    { id: 'sample-b', name: '体験B VR迷路', color: '#0F7C80', sortOrder: 1, isActive: true },
  ];
  const slots = [day1, day2].flatMap((date) => [
    ...generateSlots({ productId: 'sample-a', date, startTime: '10:00', intervalMinutes: 30, count: 12, capacity: 6 }),
    ...generateSlots({ productId: 'sample-b', date, startTime: '10:00', intervalMinutes: 20, count: 18, capacity: 4 }),
  ]);
  return {
    config: { ...DEFAULT_CONFIG, eventName: '情報研究会 教室企画', eventDates: [day1, day2] },
    products,
    slots,
  };
}
