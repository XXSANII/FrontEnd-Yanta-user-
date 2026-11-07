import { formatBaht, type Product } from '@yanta/shared'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { addOrderItem, describeError, fetchProducts } from '../services/staffService'

interface Props {
  /** ออเดอร์ที่จะเพิ่มรายการเข้าไป (ออเดอร์ล่าสุดของบิลนั้น) */
  orderId: string
  tableLabel: string | null
  onAdded: () => void
  onClose: () => void
}

const MAX_QTY = 99

/** ให้พนักงานเพิ่มรายการเข้าบิลของโต๊ะ เมื่อลูกค้าลืมสั่ง */
export default function AddItemModal({ orderId, tableLabel, onAdded, onClose }: Props) {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [productId, setProductId] = useState('')
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
      .then((p) => setProducts(p.filter((x) => x.is_available)))
      .catch((e) => { setProducts([]); setError(describeError(e, 'โหลดเมนูไม่สำเร็จ')) })
  }, [])

  const product = products?.find((p) => p.id === productId) ?? null

  // เฉพาะกลุ่มที่มีตัวเลือกพร้อมขาย
  const groups = useMemo(
    () => (product?.option_groups ?? [])
      .map((g) => ({ ...g, options: g.options.filter((o) => o.is_available) }))
      .filter((g) => g.options.length > 0),
    [product],
  )

  const chosenIds = groups.flatMap((g) => g.options.filter((o) => (selected[g.id] ?? []).includes(o.id)).map((o) => o.id))
  const delta = groups.flatMap((g) => g.options.filter((o) => (selected[g.id] ?? []).includes(o.id))).reduce((s, o) => s + o.price_delta, 0)
  const unit = product ? product.price + delta : 0

  const pick = (id: string) => { setProductId(id); setSelected({}) }
  const setSingle = (gid: string, oid: string | null) => setSelected((s) => ({ ...s, [gid]: oid ? [oid] : [] }))
  const toggle = (gid: string, oid: string) =>
    setSelected((s) => {
      const cur = s[gid] ?? []
      return { ...s, [gid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] }
    })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!product) return setError('กรุณาเลือกเมนู')
    const missing = groups.find((g) => g.kind === 'single' && g.is_required && (selected[g.id] ?? []).length === 0)
    if (missing) return setError(`กรุณาเลือก "${missing.name}"`)
    setBusy(true)
    setError(null)
    try {
      await addOrderItem(orderId, { productId: product.id, quantity, optionIds: chosenIds, note: note.trim() || null })
      onAdded()
    } catch (err) {
      setError(describeError(err, 'เพิ่มรายการไม่สำเร็จ'))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>เพิ่มรายการเข้าบิล{tableLabel ? ` · โต๊ะ ${tableLabel}` : ''}</h2>

        {products === null ? <p className="muted">กำลังโหลดเมนู…</p> : (
          <label>เมนู *
            <select value={productId} onChange={(e) => pick(e.target.value)} autoFocus>
              <option value="">— เลือกเมนู —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatBaht(p.price)}</option>)}
            </select>
          </label>
        )}

        {groups.map((g) => (
          <fieldset key={g.id} className="og-check">
            <legend>{g.name}{g.kind === 'single' && g.is_required ? ' *' : ''}</legend>
            {g.kind === 'single' ? (
              <>
                {!g.is_required && (
                  <label className="switch">
                    <input type="radio" name={g.id} checked={(selected[g.id] ?? []).length === 0} onChange={() => setSingle(g.id, null)} /> ไม่เลือก
                  </label>
                )}
                {g.options.map((o) => (
                  <label key={o.id} className="switch">
                    <input type="radio" name={g.id} checked={(selected[g.id] ?? []).includes(o.id)} onChange={() => setSingle(g.id, o.id)} />
                    {o.name}{o.price_delta !== 0 && ` (${o.price_delta > 0 ? '+' : ''}${formatBaht(o.price_delta)})`}
                  </label>
                ))}
              </>
            ) : g.options.map((o) => (
              <label key={o.id} className="switch">
                <input type="checkbox" checked={(selected[g.id] ?? []).includes(o.id)} onChange={() => toggle(g.id, o.id)} />
                {g.kind === 'remove' ? 'ไม่ใส่ ' : ''}{o.name}{o.price_delta !== 0 && ` (${o.price_delta > 0 ? '+' : ''}${formatBaht(o.price_delta)})`}
              </label>
            ))}
          </fieldset>
        ))}

        {product && (
          <>
            <label>จำนวน
              <input type="number" min={1} max={MAX_QTY} value={quantity}
                onChange={(e) => setQuantity(Math.min(MAX_QTY, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
            </label>
            <label>หมายเหตุ
              <textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <strong>รวม {formatBaht(unit * quantity)}</strong>
          </>
        )}

        {error && <div className="notice error">{error}</div>}
        <div className="modal-actions">
          <button type="submit" className="primary" disabled={busy || !product}>{busy ? 'กำลังเพิ่ม…' : 'เพิ่มเข้าบิล'}</button>
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>ยกเลิก</button>
        </div>
      </form>
    </div>
  )
}
