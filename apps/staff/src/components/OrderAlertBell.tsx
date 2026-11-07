import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPendingOrders } from '../services/staffService'

const SOUND_URL = '/sounds/new-order.mp3'
const POLL_MS = 5000
const PREF_KEY = 'yanta.staff.orderSound'

const readPref = (): boolean => {
  try { return localStorage.getItem(PREF_KEY) !== 'off' } catch { return true }
}

/**
 * ปุ่มกระดิ่งในแถบนำทาง + ตรวจออเดอร์ใหม่ (pending) ทุก 5 วินาที แล้วเล่นเสียงแจ้งเตือน
 * - ไม่เล่นเสียงกับออเดอร์ที่ค้างอยู่ตอนเปิดหน้า มีเฉพาะออเดอร์ที่เข้ามาใหม่หลังจากนั้น
 * - เบราว์เซอร์บล็อกเสียงจนกว่าผู้ใช้จะกดบนหน้าเว็บ ถ้าเล่นไม่ได้จะขึ้นแถบให้แตะเพื่อเปิดเสียง
 */
export default function OrderAlertBell() {
  const [enabled, setEnabled] = useState(readPref)
  const [blocked, setBlocked] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const seen = useRef<Set<string> | null>(null) // null = ยังไม่โหลดรอบแรก
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const player = () => (audio.current ??= new Audio(SOUND_URL))

  const play = useCallback(async () => {
    const a = player()
    a.currentTime = 0
    a.volume = 1
    try { await a.play(); setBlocked(false) } catch { setBlocked(true) }
  }, [])

  // ปลดล็อกเสียงเงียบๆ ตอนผู้ใช้กดครั้งแรกบนหน้า (นโยบาย autoplay ของเบราว์เซอร์)
  useEffect(() => {
    const unlock = () => {
      const a = player()
      a.volume = 0
      a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = 1; setBlocked(false) }).catch(() => { a.volume = 1 })
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [])

  useEffect(() => {
    let stop = false
    const check = async () => {
      try {
        const ids = (await fetchPendingOrders()).map((o) => o.id)
        if (stop) return
        const known = seen.current
        const fresh = known ? ids.filter((id) => !known.has(id)) : []
        seen.current = new Set(ids) // ออเดอร์ที่ถูกจัดการแล้วหลุดจากชุดนี้เอง
        if (fresh.length > 0 && enabledRef.current) void play()
      } catch { /* ต่อไม่ได้ชั่วคราว: รอรอบถัดไป */ }
    }
    void check()
    const t = setInterval(check, POLL_MS)
    return () => { stop = true; clearInterval(t) }
  }, [play])

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    try { localStorage.setItem(PREF_KEY, next ? 'on' : 'off') } catch { /* ไม่เป็นไร */ }
    if (next) void play() // ฟังตัวอย่างเสียง และถือเป็นการปลดล็อกด้วย
    else setBlocked(false)
  }

  return (
    <>
      <button type="button" className={`bell${enabled ? ' on' : ''}`} onClick={toggle}
        aria-pressed={enabled} title={enabled ? 'ปิดเสียงแจ้งเตือนออเดอร์ใหม่' : 'เปิดเสียงแจ้งเตือนออเดอร์ใหม่'}>
        {enabled ? '🔔 เสียงเปิด' : '🔕 เสียงปิด'}
      </button>
      {enabled && blocked && (
        <button type="button" className="sound-toast" onClick={() => void play()}>
          🔔 แตะที่นี่เพื่อเปิดเสียงแจ้งเตือนออเดอร์ใหม่
        </button>
      )}
    </>
  )
}
