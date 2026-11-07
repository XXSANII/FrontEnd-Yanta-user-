import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import MenuPage from './pages/MenuPage'
import OrdersPage from './pages/OrdersPage'
import TablesPage from './pages/TablesPage'

export default function App() {
  const { loading, signedIn, can } = useAuth()
  if (loading) return <p className="muted center">กำลังโหลด…</p>
  if (!signedIn) return <LoginPage />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<OrdersPage />} />
        <Route path="/tables" element={<TablesPage />} />
        <Route path="/menu" element={can('menu.manage') ? <MenuPage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<OrdersPage />} />
      </Route>
    </Routes>
  )
}
