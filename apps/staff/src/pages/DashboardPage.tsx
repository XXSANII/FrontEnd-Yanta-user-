import { formatBaht, type Order, type Product } from '@yanta/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { describeError, fetchProducts, fetchSalesSince } from '../services/staffService'
import { computeStats, RANGE_LABEL, rangeStart, type Range } from '../utils/dashboardStats'

const REFRESH_MS = 30000
const RANGES: Range[] = ['today', 'week', 'month']
/** สีกราฟโดนัท: ไล่จากสีธีมหลัก (เขียวเข้ม) ไปโทนอุ่นให้แยกชิ้นชัด */
const SLICE = ['#2f5d62', '#5b9aa0', '#e0a458', '#c0674f', '#a9b8ba']

const hhmm = (d: Date) => d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
const pad = (h: number) => `${String(h).padStart(2, '0')}:00`

export default function DashboardPage() {
  const { me } = useAuth()
  const [range, setRange] = useState<Range>('today')
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setOrders(await fetchSalesSince(rangeStart(range)))
      setUpdatedAt(new Date())
      setError(null)
    } catch (e) {
      setError(describeError(e, 'โหลดข้อมูลแดชบอร์ดไม่สำเร็จ'))
    }
    setLoading(false)
  }, [range])

  useEffect(() => { setOrders(null); void load() }, [load])
  useEffect(() => {
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])
  useEffect(() => { fetchProducts().then(setProducts).catch(() => setProducts([])) }, [])

  const stats = useMemo(() => computeStats(orders ?? []), [orders])
  const image = useMemo(() => new Map(products.map((p) => [p.id, p.image_url])), [products])
  const maxSales = Math.max(...stats.hours.map((h) => h.sales), 1)
  const empty = orders !== null && orders.length === 0

  if (!me?.isAdmin) return <p className="muted">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>แดชบอร์ด</h1>
          <p className="muted dash-sub">ภาพรวมยอดขายและสถิติอาหาร · นับเฉพาะออเดอร์ที่ทำเสร็จแล้วและชำระแล้ว</p>
        </div>
        <div className="head-tools">
          <div className="seg" role="group" aria-label="ช่วงเวลา">
            {RANGES.map((r) => (
              <button key={r} type="button" className={range === r ? 'on' : ''} aria-pressed={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>
            ))}
          </div>
          <button type="button" className="ghost" style={{ margin: 0 }} onClick={() => void load()} disabled={loading}>
            {loading ? 'กำลังโหลด…' : '↻ อัปเดตข้อมูล'}
          </button>
        </div>
      </div>
      {error && <div className="notice error">{error}</div>}
      {updatedAt && <p className="muted dash-updated">อัปเดตล่าสุด {hhmm(updatedAt)} · รีเฟรชอัตโนมัติทุก 30 วินาที</p>}

      {orders === null && !error && <p className="muted">กำลังโหลด…</p>}
      {orders !== null && (
        <>
          <section className="kpis">
            <div className="kpi main"><span className="kpi-label">ยอดขายรวม ({RANGE_LABEL[range]})</span><strong className="kpi-value">{formatBaht(stats.total)}</strong></div>
            <div className="kpi"><span className="kpi-label">จำนวนบิล</span><strong className="kpi-value">{stats.bills.toLocaleString('th-TH')} <small>บิล</small></strong></div>
            <div className="kpi"><span className="kpi-label">ยอดเฉลี่ยต่อบิล</span><strong className="kpi-value">{formatBaht(Math.round(stats.average))} <small>/ บิล</small></strong></div>
            <div className="kpi"><span className="kpi-label">ชั่วโมงขายดีที่สุด</span><strong className="kpi-value">{stats.peakHour === null ? '—' : pad(stats.peakHour)}</strong></div>
          </section>

          {empty && <p className="muted dash-empty">ยังไม่มียอดขายในช่วง “{RANGE_LABEL[range]}”</p>}

          <section className="dash-card">
            <h2>ยอดขายรายชั่วโมง{range !== 'today' && <span className="muted"> · รวมทุกวันในช่วงที่เลือก</span>}</h2>
            <div className="hours" role="img" aria-label="กราฟแท่งยอดขายรายชั่วโมง">
              {stats.hours.map((h) => (
                <div key={h.hour} className="hour" title={`${pad(h.hour)} · ${formatBaht(h.sales)} · ${h.orders} ออเดอร์`}>
                  <span className="hour-val">{h.sales > 0 ? formatBaht(Math.round(h.sales)) : ''}</span>
                  <span className={`hour-bar${h.hour === stats.peakHour ? ' peak' : ''}`} style={{ height: `${(h.sales / maxSales) * 100}%` }} />
                  <span className="hour-label">{h.hour}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="dash-two">
            <section className="dash-card">
              <h2>เมนูยอดนิยม 5 อันดับ</h2>
              {stats.top.length === 0 && <p className="muted">ยังไม่มีข้อมูล</p>}
              <ol className="top-list">
                {stats.top.map((t, i) => (
                  <li key={t.productId}>
                    <span className="rank">{i + 1}</span>
                    <img src={image.get(t.productId) || '/placeholder.svg'} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                    <span className="grow"><strong>{t.name}</strong></span>
                    <span className="top-num"><strong>{t.quantity.toLocaleString('th-TH')}</strong> <small>ชิ้น</small><small className="block">{formatBaht(t.revenue)}</small></span>
                  </li>
                ))}
              </ol>
              {stats.top.length > 0 && (
                <p className="top-sum">
                  รวมยอดขาย 5 เมนูนี้ <strong>{formatBaht(stats.topRevenue)}</strong>
                  {stats.total > 0 && <span className="muted"> (คิดเป็น {Math.round((stats.topRevenue / stats.total) * 100)}% ของยอดขายรวม)</span>}
                </p>
              )}
            </section>

            <section className="dash-card">
              <h2>สัดส่วนการสั่งแต่ละเมนู <span className="muted">(ใน 5 อันดับ)</span></h2>
              {stats.top.length === 0 ? <p className="muted">ยังไม่มีข้อมูล</p> : <Donut items={stats.top} total={stats.topQuantity} />}
            </section>
          </div>
        </>
      )}
    </>
  )
}

/** โดนัทสัดส่วนจำนวนที่สั่งของ 5 เมนูอันดับต้น (SVG ล้วน ไม่พึ่งไลบรารี) */
function Donut({ items, total }: { items: { productId: string; name: string; quantity: number }[]; total: number }) {
  const R = 52
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut" role="img" aria-label="กราฟโดนัทสัดส่วนเมนู">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#eef2f2" strokeWidth="20" />
        {items.map((t, i) => {
          const len = (t.quantity / total) * C
          const el = (
            <circle key={t.productId} cx="70" cy="70" r={R} fill="none" stroke={SLICE[i % SLICE.length]} strokeWidth="20"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
          )
          offset += len
          return el
        })}
        <text x="70" y="66" textAnchor="middle" className="donut-n">{items.length} เมนู</text>
        <text x="70" y="84" textAnchor="middle" className="donut-s">Top Volume</text>
      </svg>
      <ul className="legend">
        {items.map((t, i) => {
          const pct = (t.quantity / total) * 100
          return (
            <li key={t.productId}>
              <span className="legend-row"><i style={{ background: SLICE[i % SLICE.length] }} /><span className="grow">{t.name}</span><strong>{pct.toFixed(1)}%</strong></span>
              <span className="legend-bar"><b style={{ width: `${pct}%`, background: SLICE[i % SLICE.length] }} /></span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
