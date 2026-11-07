import type { Order } from '@yanta/shared'

export type Range = 'today' | 'week' | 'month'

export const RANGE_LABEL: Record<Range, string> = { today: 'วันนี้', week: 'สัปดาห์นี้', month: 'เดือนนี้' }

/** เวลาเริ่มต้นของช่วง (เวลาท้องถิ่นของเครื่อง): วันนี้ 00:00 / จันทร์ของสัปดาห์นี้ / วันที่ 1 ของเดือน */
export function rangeStart(range: Range, now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (range === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (range === 'month') d.setDate(1)
  return d
}

export interface TopItem { productId: string; name: string; quantity: number; revenue: number }
export interface HourBucket { hour: number; sales: number; orders: number }

export interface DashboardStats {
  total: number
  bills: number
  average: number
  hours: HourBucket[]
  peakHour: number | null
  top: TopItem[]
  topQuantity: number
  topRevenue: number
}

const MIN_HOUR = 10
const MAX_HOUR = 21
const TOP_N = 5

/** สรุปยอดจากออเดอร์ที่ขายได้แล้ว (complete/paid): บิล = ออเดอร์ของ session เดียวกันรวมเป็นใบเดียว */
export function computeStats(orders: Order[]): DashboardStats {
  const sold = orders.filter((o) => o.status === 'complete' || o.status === 'paid')
  const total = sold.reduce((s, o) => s + o.total_amount, 0)
  const bills = new Set(sold.map((o) => o.session_id ?? `order:${o.id}`)).size

  // ยอดขายรายชั่วโมง (รวมทุกวันในช่วงที่เลือก) ขยายช่วงเวลาให้ครอบชั่วโมงที่มีข้อมูล
  const byHour = new Map<number, HourBucket>()
  for (const o of sold) {
    const hour = new Date(o.created_at).getHours()
    const b = byHour.get(hour) ?? { hour, sales: 0, orders: 0 }
    b.sales += o.total_amount
    b.orders += 1
    byHour.set(hour, b)
  }
  const used = [...byHour.keys()]
  const from = Math.min(MIN_HOUR, ...used)
  const to = Math.max(MAX_HOUR, ...used)
  const hours: HourBucket[] = []
  for (let h = from; h <= to; h++) hours.push(byHour.get(h) ?? { hour: h, sales: 0, orders: 0 })
  const peak = hours.reduce<HourBucket | null>((m, b) => (b.sales > 0 && (!m || b.sales > m.sales) ? b : m), null)

  // เมนูขายดี: เรียงตามจำนวนที่สั่ง เฉพาะรายการที่ไม่ถูกยกเลิก
  const items = new Map<string, TopItem>()
  for (const o of sold) {
    for (const i of o.items) {
      if (i.status !== 'active') continue
      const t = items.get(i.product_id) ?? { productId: i.product_id, name: i.product_name, quantity: 0, revenue: 0 }
      t.quantity += i.quantity
      t.revenue += i.subtotal
      items.set(i.product_id, t)
    }
  }
  const top = [...items.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, TOP_N)

  return {
    total,
    bills,
    average: bills > 0 ? total / bills : 0,
    hours,
    peakHour: peak?.hour ?? null,
    top,
    topQuantity: top.reduce((s, t) => s + t.quantity, 0),
    topRevenue: top.reduce((s, t) => s + t.revenue, 0),
  }
}
