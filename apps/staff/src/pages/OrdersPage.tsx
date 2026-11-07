import { formatBaht, type Order, type OrderItem } from '@yanta/shared'
import { useCallback, useEffect, useState } from 'react'
import AddItemModal from '../components/AddItemModal'
import { useAuth } from '../context/AuthContext'
import { describeError, fetchOrders, payOrder, paySession, updateOrderStatus } from '../services/staffService'
import { describeItemOptions, itemLineKey, itemNote } from '../utils/orderItems'

const time = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

/** บรรทัดย่อยใต้ชื่อเมนู: ตัวเลือก (คั่นด้วย ·) และหมายเหตุ (เน้นให้ครัวเห็น) */
function ItemDetails({ item }: { item: OrderItem }) {
  const tokens = describeItemOptions(item)
  if (tokens.length === 0) return null
  const hasNote = itemNote(item) !== ''
  const opts = hasNote ? tokens.slice(0, -1) : tokens
  return (
    <>
      {opts.length > 0 && <div className="item-opts">{opts.join(' · ')}</div>}
      {hasNote && <div className="item-note">{tokens[tokens.length - 1]}</div>}
    </>
  )
}

interface Bill {
  key: string
  sessionId: string | null
  table: string | null
  orders: Order[]
  lines: { key: string; item: OrderItem; name: string; unitPrice: number; quantity: number }[]
  total: number
  firstAt: string
}

/** รวมออเดอร์ที่ทำเสร็จแล้วของโต๊ะเดียวกัน (session เดียวกัน) เป็นบิลใบเดียว รวมรายการซ้ำเป็นแถวเดียว */
function groupBills(done: Order[]): Bill[] {
  const bills = new Map<string, Bill>()
  for (const o of done) {
    const key = o.session_id ?? `order:${o.id}`
    let b = bills.get(key)
    if (!b) {
      b = { key, sessionId: o.session_id, table: o.table_label, orders: [], lines: [], total: 0, firstAt: o.created_at }
      bills.set(key, b)
    }
    b.orders.push(o)
    b.total += o.total_amount
    for (const i of o.items.filter((x) => x.status === 'active')) {
      const k = itemLineKey(i)
      const line = b.lines.find((l) => l.key === k)
      if (line) line.quantity += i.quantity
      else b.lines.push({ key: k, item: i, name: i.product_name, unitPrice: i.unit_price, quantity: i.quantity })
    }
  }
  return [...bills.values()]
}

export default function OrdersPage() {
  const { can } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)
  const [addTo, setAddTo] = useState<{ orderId: string; table: string | null } | null>(null)

  const load = useCallback(() => {
    fetchOrders().then((o) => { setOrders(o); setError(null) }).catch((e) => setError(describeError(e, 'โหลดออเดอร์ไม่สำเร็จ')))
  }, [])

  useEffect(() => {
    load()
    const poll = setInterval(load, 5000) // Backend ยังไม่มี realtime จึง poll
    return () => clearInterval(poll)
  }, [load])

  const run = async (action: () => Promise<unknown>, failMessage: string) => {
    try { await action(); load() } catch (e) {
      setError(e instanceof Error && e.message ? e.message : failMessage)
    }
  }

  const pending = orders.filter((o) => o.status === 'pending')
  const bills = groupBills(orders.filter((o) => o.status === 'complete'))

  return (
    <>
      <h1>ออเดอร์</h1>
      {error && <div className="notice error">{error}</div>}
      <div className="board">
        <section className="col">
          <h2>ออเดอร์ใหม่ <span className="pill">{pending.length}</span></h2>
          {pending.length === 0 && <p className="muted">ไม่มีรายการ</p>}
          {pending.map((o) => (
            <article key={o.id} className="order ticket">
              <div className="order-head">
                <strong>#{o.order_number} · {o.table_label ? `โต๊ะ ${o.table_label}` : 'ไม่ระบุโต๊ะ'}</strong>
                <span className="muted">{time(o.created_at)}</span>
              </div>
              <ul>
                {o.items.filter((i) => i.status === 'active').map((i) => (
                  <li key={i.id}>{i.quantity} × {i.product_name}<ItemDetails item={i} /></li>
                ))}
              </ul>
              <div className="order-foot">
                <strong>{formatBaht(o.total_amount)}</strong>
                {can('order.update_status') && (
                  <span>
                    <button className="ghost" onClick={() => run(() => updateOrderStatus(o.id, 'cancelled'), 'ปฏิเสธไม่สำเร็จ')}>ปฏิเสธ</button>
                    <button className="primary" onClick={() => run(() => updateOrderStatus(o.id, 'complete'), 'อัปเดตสถานะไม่สำเร็จ')}>ทำเสร็จแล้ว</button>
                  </span>
                )}
              </div>
            </article>
          ))}
        </section>

        <section className="col">
          <h2>บิลรอชำระเงิน <span className="pill">{bills.length}</span></h2>
          {bills.length === 0 && <p className="muted">ไม่มีรายการ</p>}
          {bills.map((b) => {
            const blocked = b.sessionId !== null && pending.some((o) => o.session_id === b.sessionId)
            return (
              <article key={b.key} className="order ticket">
                <div className="order-head">
                  <strong>{b.table ? `โต๊ะ ${b.table}` : 'ไม่ระบุโต๊ะ'}</strong>
                  <span className="muted">{b.orders.map((o) => `#${o.order_number}`).join(', ')}</span>
                </div>
                <ul>
                  {b.lines.map((l) => (
                    <li key={l.key}>{l.quantity} × {l.name} <span className="muted">{formatBaht(l.unitPrice * l.quantity)}</span><ItemDetails item={l.item} /></li>
                  ))}
                </ul>
                <div className="order-foot">
                  <strong>รวม {formatBaht(b.total)}</strong>
                  <span>
                  {can('order.update_status') && (
                    <button className="ghost" onClick={() => setAddTo({ orderId: b.orders[b.orders.length - 1].id, table: b.table })}>
                      + เพิ่มรายการ
                    </button>
                  )}
                  {can('payment.confirm') && (
                    <button
                      className="primary"
                      disabled={blocked}
                      title={blocked ? 'ยังมีออเดอร์ใหม่ของโต๊ะนี้ที่ยังไม่ทำเสร็จ' : undefined}
                      onClick={() => run(
                        () => (b.sessionId ? paySession(b.sessionId) : payOrder(b.orders[0].id)),
                        'บันทึกการชำระเงินไม่สำเร็จ',
                      )}
                    >
                      รับชำระเงิน
                    </button>
                  )}
                  </span>
                </div>
                {blocked && <small className="muted">ยังมีออเดอร์ใหม่ของโต๊ะนี้ที่ยังไม่ทำเสร็จ</small>}
              </article>
            )
          })}
        </section>
      </div>
      {addTo && (
        <AddItemModal
          orderId={addTo.orderId}
          tableLabel={addTo.table}
          onClose={() => setAddTo(null)}
          onAdded={() => { setAddTo(null); load() }}
        />
      )}
    </>
  )
}
