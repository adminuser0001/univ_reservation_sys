import { AGE_GROUP_LABEL, AGE_GROUPS, STATUS_LABEL } from './rules';
import type { ExportData } from './types';

/**
 * 予約のCSVの行（1行目は見出し）を作る。1予約＝1行。
 * 体験する方は名前と年齢区分を別の列に分け、同じ順番で並べる。集計用に、年齢区分ごとの人数も出す。
 */
export function buildReservationCsvRows(data: ExportData): (string | number)[][] {
  const productName = new Map(data.products.map((p) => [p.id, p.name]));
  const slotOf = new Map(data.slots.map((s) => [s.id, s]));

  const header = [
    '整理券番号',
    '代表者名',
    '代表者も体験',
    '体験する方',
    '年齢区分',
    '人数',
    ...AGE_GROUPS.map((g) => `${g.label}（人）`),
    '電話番号',
    '備考',
    '体験',
    '日付',
    '開始',
    '終了',
    '状態',
    '特例',
    '登録日時',
    '更新日時',
  ];

  const rows = data.reservations.map((r) => {
    const s = slotOf.get(r.slotId);
    return [
      r.ticketNo ?? '',
      r.representativeName,
      r.representativeJoins ? 'する' : 'しない',
      r.participants.map((p) => p.name).join('、'),
      r.participants.map((p) => (p.ageGroup ? AGE_GROUP_LABEL[p.ageGroup] : '未選択')).join('、'),
      r.partySize,
      ...AGE_GROUPS.map((g) => r.participants.filter((p) => p.ageGroup === g.id).length),
      r.phone ?? '',
      r.memo ?? '',
      productName.get(r.productId) ?? '',
      r.date,
      s?.startTime ?? '',
      s?.endTime ?? '',
      STATUS_LABEL[r.status],
      r.isException ? '特例' : '',
      new Date(r.createdAt).toLocaleString('ja-JP'),
      new Date(r.updatedAt).toLocaleString('ja-JP'),
    ];
  });

  return [header, ...rows];
}
