import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import OrderAlertBell from './OrderAlertBell'

export default function Layout() {
  const { signOut, me, can } = useAuth()
  return (
    <div className="shell">
      <header className="nav">
        <strong>หลังร้าน</strong>
        {can('order.view') && <NavLink to="/">ออเดอร์</NavLink>}
        {can('table.view') && <NavLink to="/tables">โต๊ะ / QR</NavLink>}
        {/* แถบเมนูสำหรับผู้จัดการเมนูเท่านั้น (admin ผ่านทุกสิทธิ์) — staff ทั่วไปไม่ต้องเห็น */}
        {can('menu.manage') && <NavLink to="/menu">เมนู</NavLink>}
        {me?.isAdmin && <NavLink to="/dashboard">แดชบอร์ด</NavLink>}
        {can('order.view') && <OrderAlertBell />}
        {me && <span className="muted">{me.role}</span>}
        <button className="link" onClick={signOut}>ออกจากระบบ</button>
      </header>
      <main className="content"><Outlet /></main>
    </div>
  )
}
