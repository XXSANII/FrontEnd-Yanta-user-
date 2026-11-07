import { formatBaht, type Category, type CategoryId, type Product } from '@yanta/shared'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import OptionGroupsPanel from '../components/OptionGroupsPanel'
import ProductForm from '../components/ProductForm'
import {
  createCategory, createProduct, deleteProduct, describeError, fetchCategories, fetchOptionGroups, fetchProducts, setAvailability, updateProduct,
  type ProductInput, type StaffOptionGroup,
} from '../services/staffService'

type Editing = { product: Product | null; category: CategoryId } | null

/** รูปแบบการจัดหน้า: list = แถว (ขนาดใหญ่ขึ้น), grid = ตารางรูปเล็ก, card = การ์ดใหญ่พร้อมคำอธิบาย */
type View = 'list' | 'grid' | 'card'
const VIEWS: { id: View; label: string }[] = [
  { id: 'list', label: 'รายการ' },
  { id: 'grid', label: 'กริด' },
  { id: 'card', label: 'การ์ด' },
]
const VIEW_KEY = 'yanta.staff.menuView'

const readView = (): View => {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'grid' || v === 'card' ? v : 'list'
  } catch { return 'list' }
}

export default function MenuPage() {
  const canManage = useAuth().can('menu.manage') // staff ทั่วไปดูเมนูได้อย่างเดียว
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [optionGroups, setOptionGroups] = useState<StaffOptionGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [view, setViewState] = useState<View>(readView)

  const setView = (v: View) => {
    setViewState(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* จำค่าไม่ได้ก็ใช้ต่อได้ */ }
  }

  const load = useCallback(() => {
    // ชุดตัวเลือกโหลดแยก: ถ้าพลาด (เช่น ยังไม่ migrate DB) เมนู/หมวดต้องยังแสดงได้
    fetchOptionGroups()
      .then((g) => { setOptionGroups(g); setGroupsError(null) })
      .catch((e) => setGroupsError(describeError(e, 'โหลดชุดตัวเลือกไม่สำเร็จ')))
    Promise.all([fetchCategories(), fetchProducts()])
      .then(([c, p]) => { setCategories(c); setProducts(p) })
      .catch((e) => setError(describeError(e, 'โหลดเมนูไม่สำเร็จ')))
  }, [])
  useEffect(load, [load])

  const toggle = async (p: Product) => {
    if (!canManage) return
    const next = !p.is_available
    setProducts((l) => l.map((x) => (x.id === p.id ? { ...x, is_available: next } : x)))
    try { await setAvailability(p.id, next) } catch {
      setProducts((l) => l.map((x) => (x.id === p.id ? { ...x, is_available: p.is_available } : x)))
      setError('อัปเดตสถานะสินค้าไม่สำเร็จ')
    }
  }

  const save = async (raw: ProductInput) => {
    const { new_category_name, ...input } = raw
    if (new_category_name) input.category = (await createCategory(new_category_name, categories.length + 1)).id
    if (editing?.product) await updateProduct(editing.product.id, input)
    else await createProduct(input)
    setEditing(null)
    load()
  }

  return (
    <>
      <div className="page-head">
        <h1>เมนู</h1>
        <div className="head-tools">
          <div className="seg" role="group" aria-label="รูปแบบการแสดงผล">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className={view === v.id ? 'on' : ''} aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </div>
          {canManage && <button className="primary" onClick={() => setEditing({ product: null, category: categories[0]?.id ?? '' })}>+ เพิ่มเมนู</button>}
        </div>
      </div>
      {error && <div className="notice error">{error}</div>}

      {categories.map((c) => {
        const list = products.filter((p) => p.category === c.id)
        return (
          <section key={c.id}>
            <h2>
              {c.name} <span className="pill">{list.length}</span>
              {canManage && <button className="link-btn" onClick={() => setEditing({ product: null, category: c.id })}>+ เพิ่มในหมวดนี้</button>}
            </h2>
            <div className={`mp-items mp-${view}`}>
              {list.length === 0 && <p className="muted mp-empty">ยังไม่มีเมนูในหมวดนี้</p>}
              {list.map((p) => (
                <article key={p.id} className={`mp-item${p.is_available ? '' : ' off'}`}>
                  <img className="mp-img" src={p.image_url || '/placeholder.svg'} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                  <div className="mp-body">
                    <strong className="mp-name">{p.name}</strong>
                    <span className="mp-price">{formatBaht(p.price)}</span>
                    {p.description && <small className="mp-desc">{p.description}</small>}
                  </div>
                  <div className="mp-actions">
                    <label className="switch">
                      <input type="checkbox" checked={p.is_available} disabled={!canManage} onChange={() => toggle(p)} />
                      {p.is_available ? 'พร้อมขาย' : 'หมด'}
                    </label>
                    {canManage && <button className="ghost" onClick={() => setEditing({ product: p, category: p.category })}>แก้ไข</button>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )
      })}

      {groupsError && <div className="notice error">{groupsError}</div>}
      <OptionGroupsPanel groups={optionGroups} canManage={canManage} onChanged={load} />

      {canManage && editing && (
        <ProductForm
          categories={categories}
          optionGroups={optionGroups}
          product={editing.product}
          defaultCategory={editing.category}
          onSave={save}
          onDelete={editing.product ? async () => { await deleteProduct(editing.product!.id); setEditing(null); load() } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
