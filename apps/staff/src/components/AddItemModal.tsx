import { formatBaht, type Category, type Product } from '@yanta/shared'
import { useEffect, useMemo, useState } from 'react'
import { addOrderItem, describeError, fetchCategories, fetchProducts } from '../services/staffService'

interface Props {
  /** ออเดอร์ที่จะเพิ่มรายการเข้าไป (ออเดอร์ล่าสุดของบิลนั้น) */
  orderId: string
  tableLabel: string | null
  onAdded: () => void
  onClose: () => void
}

const MAX_QTY = 99
const PLACEHOLDER = '/placeholder.svg'
const ALL = '__all'

/** รายการที่พนักงานเลือกไว้ รอกด "เพิ่มรายการ" ทีเดียว */
interface Draft {
  key: string
  product: Product
  optionIds: string[]
  optionLabels: string[]
  note: string
  quantity: number
  unit: number
}

const signed = (n: number) => (n > 0 ? '+' : '') + formatBaht(n)

/** เมนูแบบการ์ด: แตะที่การ์ด 1 ครั้ง = เพิ่ม 1 รายการลงรายการที่เลือก แล้วกดยืนยันครั้งเดียวด้านล่าง */
export default function AddItemModal({ orderId, tableLabel, onAdded, onClose }: Props) {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [category, setCategory] = useState(ALL)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [configuring, setConfiguring] = useState<Product | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
      .then((p) => setProducts(p.filter((x) => x.is_available)))
      .catch((e) => { setProducts([]); setError(describeError(e, 'โหลดเมนูไม่สำเร็จ')) })
    fetchCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  // ปิดด้วย Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) configuring ? setConfiguring(null) : onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, configuring, onClose])

  const shown = useMemo(
    () => (products ?? []).filter((p) => category === ALL || p.category === category),
    [products, category],
  )
  const usedCategories = useMemo(
    () => categories.filter((c) => (products ?? []).some((p) => p.category === c.id)),
    [categories, products],
  )

  const hasOptions = (p: Product) => p.option_groups.some((g) => g.options.some((o) => o.is_available))
  const countOf = (p: Product) => drafts.filter((d) => d.product.id === p.id).reduce((s, d) => s + d.quantity, 0)

  /** เพิ่ม 1 ชิ้น; รายการที่เมนู+ตัวเลือก+หมายเหตุเหมือนกันรวมเป็นบรรทัดเดียว */
  const addDraft = (product: Product, optionIds: string[], optionLabels: string[], note: string, unit: number) => {
    const key = JSON.stringify([product.id, [...optionIds].sort(), note])
    setError(null)
    setDrafts((ds) => {
      const found = ds.find((d) => d.key === key)
      if (found) return ds.map((d) => (d.key === key ? { ...d, quantity: Math.min(MAX_QTY, d.quantity + 1) } : d))
      return [...ds, { key, product, optionIds, optionLabels, note, quantity: 1, unit }]
    })
  }

  const tapCard = (p: Product) => {
    if (busy) return
    if (hasOptions(p)) setConfiguring(p)
    else addDraft(p, [], [], '', p.price)
  }

  const step = (key: string, by: number) =>
    setDrafts((ds) => ds
      .map((d) => (d.key === key ? { ...d, quantity: Math.min(MAX_QTY, d.quantity + by) } : d))
      .filter((d) => d.quantity > 0))

  const total = drafts.reduce((s, d) => s + d.unit * d.quantity, 0)
  const pieces = drafts.reduce((s, d) => s + d.quantity, 0)

  /** ส่งทีละรายการ; ที่สำเร็จแล้วเอาออกจากรายการ ถ้าพลาดกลางทางที่เหลือยังอยู่ให้ลองใหม่ได้ */
  const submit = async () => {
    if (drafts.length === 0) return
    setBusy(true)
    setError(null)
    let left = drafts
    try {
      for (const d of drafts) {
        await addOrderItem(orderId, { productId: d.product.id, quantity: d.quantity, optionIds: d.optionIds, note: d.note || null })
        left = left.filter((x) => x.key !== d.key)
      }
      onAdded()
    } catch (err) {
      setDrafts(left)
      const msg = describeError(err, 'เพิ่มรายการไม่สำเร็จ')
      setError(left.length < drafts.length ? `${msg} (เพิ่มไปแล้ว ${drafts.length - left.length} รายการ เหลือที่ยังไม่ได้เพิ่มในรายการด้านล่าง)` : msg)
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div className="modal add-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="add-head">
          <h2>เพิ่มรายการเข้าบิล{tableLabel ? ` · โต๊ะ ${tableLabel}` : ''}</h2>
          <button type="button" className="ghost" onClick={onClose} disabled={busy} aria-label="ปิด">✕</button>
        </div>

        {usedCategories.length > 1 && (
          <div className="add-tabs" role="tablist">
            {[{ id: ALL, name: 'ทั้งหมด' }, ...usedCategories].map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={category === c.id}
                className={category === c.id ? 'on' : ''} onClick={() => setCategory(c.id)}>{c.name}</button>
            ))}
          </div>
        )}

        <div className="add-grid">
          {products === null && <p className="muted">กำลังโหลดเมนู…</p>}
          {products?.length === 0 && !error && <p className="muted">ไม่มีเมนูที่พร้อมขาย</p>}
          {shown.map((p) => {
            const n = countOf(p)
            return (
              <button key={p.id} type="button" className="menu-card" onClick={() => tapCard(p)} disabled={busy}
                aria-label={`เพิ่ม ${p.name}`}>
                <span className="menu-img">
                  <img src={p.image_url || PLACEHOLDER} alt="" loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER }} />
                  {n > 0 && <span className="menu-badge">{n}</span>}
                </span>
                <span className="menu-name">{p.name}</span>
                <span className="menu-price">{formatBaht(p.price)}{hasOptions(p) && <small> · มีตัวเลือก</small>}</span>
              </button>
            )
          })}
        </div>

        <div className="add-foot">
          <div className="draft-title">รายการที่จะเพิ่ม {pieces > 0 && <span className="pill">{pieces}</span>}</div>
          {drafts.length === 0
            ? <p className="muted">แตะที่เมนูเพื่อเพิ่มลงรายการ</p>
            : (
              <ul className="draft-list">
                {drafts.map((d) => (
                  <li key={d.key}>
                    <div className="draft-info">
                      <strong>{d.product.name}</strong>
                      {(d.optionLabels.length > 0 || d.note) && (
                        <div className="item-opts">{[...d.optionLabels, d.note && `หมายเหตุ: ${d.note}`].filter(Boolean).join(' · ')}</div>
                      )}
                    </div>
                    <div className="draft-qty">
                      <button type="button" className="ghost" onClick={() => step(d.key, -1)} disabled={busy} aria-label="ลด">−</button>
                      <span>{d.quantity}</span>
                      <button type="button" className="ghost" onClick={() => step(d.key, 1)} disabled={busy || d.quantity >= MAX_QTY} aria-label="เพิ่ม">+</button>
                    </div>
                    <span className="draft-sum">{formatBaht(d.unit * d.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
          {error && <div className="notice error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="primary" onClick={submit} disabled={busy || drafts.length === 0}>
              {busy ? 'กำลังเพิ่ม…' : `เพิ่มรายการ${pieces > 0 ? ` (${formatBaht(total)})` : ''}`}
            </button>
            <button type="button" className="ghost" onClick={onClose} disabled={busy}>ยกเลิก</button>
          </div>
        </div>
      </div>

      {configuring && (
        <OptionSheet
          product={configuring}
          onCancel={() => setConfiguring(null)}
          onConfirm={(ids, labels, note, unit) => { addDraft(configuring, ids, labels, note, unit); setConfiguring(null) }}
        />
      )}
    </div>
  )
}

/** เลือกตัวเลือก/หมายเหตุของเมนูที่มีตัวเลือก (เหมือนฝั่งลูกค้า) แล้วเพิ่ม 1 ชิ้น */
function OptionSheet({ product, onCancel, onConfirm }: {
  product: Product
  onCancel: () => void
  onConfirm: (optionIds: string[], labels: string[], note: string, unit: number) => void
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const groups = useMemo(
    () => product.option_groups
      .map((g) => ({ ...g, options: g.options.filter((o) => o.is_available) }))
      .filter((g) => g.options.length > 0),
    [product],
  )
  const chosen = groups.flatMap((g) => g.options.filter((o) => (selected[g.id] ?? []).includes(o.id)).map((o) => ({ g, o })))
  const unit = product.price + chosen.reduce((s, c) => s + c.o.price_delta, 0)

  const setSingle = (gid: string, oid: string | null) => setSelected((s) => ({ ...s, [gid]: oid ? [oid] : [] }))
  const toggle = (gid: string, oid: string) =>
    setSelected((s) => {
      const cur = s[gid] ?? []
      return { ...s, [gid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] }
    })

  const confirm = () => {
    const missing = groups.find((g) => g.kind === 'single' && g.is_required && (selected[g.id] ?? []).length === 0)
    if (missing) return setError(`กรุณาเลือก "${missing.name}"`)
    onConfirm(
      chosen.map((c) => c.o.id),
      chosen.map((c) => (c.g.kind === 'remove' ? `ไม่ใส่ ${c.o.name}` : c.o.name)),
      note.trim(),
      unit,
    )
  }

  return (
    <div className="overlay sheet-overlay" onClick={(e) => { e.stopPropagation(); onCancel() }}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{product.name} · {formatBaht(unit)}</h2>
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
                    {o.name}{o.price_delta !== 0 && ` (${signed(o.price_delta)})`}
                  </label>
                ))}
              </>
            ) : g.options.map((o) => (
              <label key={o.id} className="switch">
                <input type="checkbox" checked={(selected[g.id] ?? []).includes(o.id)} onChange={() => toggle(g.id, o.id)} />
                {g.kind === 'remove' ? 'ไม่ใส่ ' : ''}{o.name}{o.price_delta !== 0 && ` (${signed(o.price_delta)})`}
              </label>
            ))}
          </fieldset>
        ))}
        <label>หมายเหตุ
          <textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <div className="notice error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="primary" onClick={confirm}>เพิ่ม 1 ชิ้นลงรายการ</button>
          <button type="button" className="ghost" onClick={onCancel}>ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}
