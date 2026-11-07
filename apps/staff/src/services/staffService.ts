import {
  ApiError,
  mapCategory, mapOptionGroup, mapOrder, mapProduct, newId,
  type Category, type CategoryDto, type OptionGroup, type OptionGroupDto, type OptionKind, type Order, type OrderDto, type OrderStatus, type Product, type ProductDto,
} from '@yanta/shared'
import { api } from './apiClient'
import { supabase } from './supabaseClient'

export interface Me { userId: string; role: string; isAdmin: boolean; permissions: string[] }

export const fetchMe = () => api<Me>('/api/auth/me')

// ---------- ออเดอร์ ----------
export async function fetchOrders(): Promise<Order[]> {
  return (await api<OrderDto[]>('/api/orders')).map(mapOrder)
}
export const updateOrderStatus = (id: string, status: OrderStatus) =>
  api(`/api/orders/${id}/status`, { method: 'PATCH', body: { status } })
export interface AddItemInput { productId: string; quantity: number; optionIds: string[]; note: string | null }
/** พนักงานเพิ่มรายการเข้าออเดอร์ที่มีอยู่ (เช่น ลูกค้าลืมกดสั่งก่อนเช็คบิล) */
export const addOrderItem = (orderId: string, i: AddItemInput) =>
  api(`/api/orders/${orderId}/items`, { method: 'POST', body: i })
export const payOrder = (id: string) => api(`/api/orders/${id}/pay`, { method: 'POST' })

// ---------- โต๊ะ / session ----------
export interface StaffTable { id: string; label: string; token: string; isActive: boolean }
export interface StaffSession {
  id: string; tableId: string; status: 'active' | 'closing' | 'closed'
  billRequestedAt: string | null; totalAmount: number; unpaidAmount: number
}

export async function fetchTables(): Promise<StaffTable[]> {
  const rows = await api<{ id: string; tableNumber: string; qrCodeToken: string; isActive: boolean }[]>('/api/tables')
  return rows.map((t) => ({ id: t.id, label: t.tableNumber, token: t.qrCodeToken, isActive: t.isActive }))
}
export async function fetchOpenSessions(): Promise<StaffSession[]> {
  const rows = await api<StaffSession[]>('/api/sessions')
  return rows.map((s) => ({ ...s, totalAmount: Number(s.totalAmount), unpaidAmount: Number(s.unpaidAmount) }))
}
export const createTable = (tableNumber: string) =>
  api('/api/tables', { method: 'POST', body: { tableNumber, isActive: true } })
export const paySession = (id: string) => api(`/api/sessions/${id}/pay`, { method: 'POST' })
export const closeSession = (id: string) => api(`/api/sessions/${id}/close`, { method: 'POST' })

// ---------- เมนู ----------
export interface ProductInput {
  name: string
  description: string | null
  price: number
  category: string
  image_url: string | null
  is_available: boolean
  /** ถ้าตั้งค่า = สร้างประเภทใหม่ด้วยชื่อนี้ก่อน แล้วใช้ประเภทนั้นกับเมนู (ไม่สนใจ category) */
  new_category_name?: string
  /** ถ้าตั้งค่า = แทนที่ชุดตัวเลือกที่ผูกกับเมนูทั้งหมด; ไม่ส่ง = ไม่เปลี่ยน */
  option_group_ids?: string[]
}
const toBody = (i: ProductInput) => ({
  categoryId: i.category, name: i.name, description: i.description,
  price: i.price, imageUrl: i.image_url, isAvailable: i.is_available,
  optionGroupIds: i.option_group_ids,
})

export const createCategory = (name: string, sortOrder: number) =>
  api<CategoryDto>('/api/categories', { method: 'POST', body: { name, description: null, sortOrder } })
export const fetchCategories = async (): Promise<Category[]> =>
  (await api<CategoryDto[]>('/api/categories')).map(mapCategory)
export const fetchProducts = async (): Promise<Product[]> =>
  (await api<ProductDto[]>('/api/products/all')).map(mapProduct)
export const createProduct = (i: ProductInput) => api('/api/products', { method: 'POST', body: toBody(i) })
export const updateProduct = (id: string, i: ProductInput) => api(`/api/products/${id}`, { method: 'PUT', body: toBody(i) })
export const setAvailability = (id: string, isAvailable: boolean) =>
  api(`/api/products/${id}/availability`, { method: 'PATCH', body: { isAvailable } })
export const deleteProduct = (id: string) => api(`/api/products/${id}`, { method: 'DELETE' })

// ---------- ชุดตัวเลือก ----------
export type StaffOptionGroup = OptionGroup & { sort_order: number }
export interface OptionGroupInput {
  name: string
  kind: OptionKind
  is_required: boolean
  sort_order: number
  options: { id?: string; name: string; price_delta: number; is_available: boolean }[]
}
const toGroupBody = (i: OptionGroupInput) => ({
  name: i.name, kind: i.kind, isRequired: i.is_required, sortOrder: i.sort_order,
  options: i.options.map((o, idx) => ({
    id: o.id, name: o.name, priceDelta: o.price_delta, isAvailable: o.is_available, sortOrder: idx,
  })),
})
export async function fetchOptionGroups(): Promise<StaffOptionGroup[]> {
  return (await api<OptionGroupDto[]>('/api/option-groups'))
    .map((g) => ({ ...mapOptionGroup(g), sort_order: g.sortOrder }))
    .sort((a, b) => a.sort_order - b.sort_order)
}
export const createOptionGroup = (i: OptionGroupInput) => api('/api/option-groups', { method: 'POST', body: toGroupBody(i) })
export const updateOptionGroup = (id: string, i: OptionGroupInput) =>
  api(`/api/option-groups/${id}`, { method: 'PUT', body: toGroupBody(i) })
export const deleteOptionGroup = (id: string) => api(`/api/option-groups/${id}`, { method: 'DELETE' })

/** อัปโหลดรูปไป Supabase Storage แล้วคืน public URL */
export async function uploadProductImage(file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${newId()}.${ext}`
  const bucket = supabase.storage.from('menu-images')
  const { error } = await bucket.upload(path, file, { contentType: file.type, cacheControl: '31536000' })
  if (error) throw error
  return bucket.getPublicUrl(path).data.publicUrl
}

/** อธิบายสาเหตุที่เรียก Backend ไม่สำเร็จ ให้พนักงาน/ผู้ดูแลอ่านแล้วรู้ว่าต้องแก้ตรงไหน */
export function describeError(e: unknown, what: string): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return `${what}: ต่อ Backend ไม่ได้ (Backend ไม่ได้เปิด หรือ CORS ไม่อนุญาตพอร์ตนี้)`
    if (e.status === 401) return `${what}: Backend ไม่ยอมรับ token (401) — ลองออกจากระบบแล้วล็อกอินใหม่ หรือตรวจ Supabase:Url ของ Backend`
    if (e.status === 403) return `${what}: บัญชีนี้ไม่มีสิทธิ์ (403)`
    return `${what}: ${e.message} (${e.status})`
  }
  return what
}
