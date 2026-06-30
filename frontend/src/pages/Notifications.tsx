import { useEffect, useState, useCallback } from 'react'
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from '../lib/api'
import { Spinner } from '../components/ui/PageLoader'
import type { Notification } from '../types'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const TYPE_STYLE: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-50 dark:bg-red-900/10',
  warning:  'border-l-amber-500 bg-amber-50 dark:bg-amber-900/10',
  success:  'border-l-green-500 bg-green-50 dark:bg-green-900/10',
  info:     'border-l-blue-500 bg-blue-50 dark:bg-blue-900/10',
}
const TYPE_ICON: Record<string, string> = {
  critical:'🔴', warning:'🟡', success:'🟢', info:'🔵',
}

export default function Notifications() {
  const [notifs, setNotifs]   = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<'all'|'unread'>('all')
  const [markingAll, setMarkingAll] = useState(false)
  const [removing, setRemoving]     = useState<string|null>(null)
  const navigate = useNavigate()

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getNotifications()
      setNotifs(res.data.data||[])
    } catch { toast.error('Gagal memuat notifikasi') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const markRead = async (id:string) => {
    try {
      await markNotificationRead(id)
      setNotifs(p=>p.map(n=>n._id===id?{...n,read:true}:n))
    } catch {}
  }

  const markAll = async () => {
    setMarkingAll(true)
    try {
      await markAllNotificationsRead()
      setNotifs(p=>p.map(n=>({...n,read:true})))
      toast.success('Semua notifikasi ditandai sudah dibaca')
    } catch {} finally { setMarkingAll(false) }
  }

  const remove = async (id:string) => {
    setRemoving(id)
    try {
      await deleteNotification(id)
      setNotifs(p=>p.filter(n=>n._id!==id))
    } catch {} finally { setRemoving(null) }
  }

  const displayed = filter==='unread' ? notifs.filter(n=>!n.read) : notifs
  const unreadCount = notifs.filter(n=>!n.read).length

  return (
    <div>
      <div className="flex items-start justify-between mb-5 animate-fade-in">
        <div>
          <h2 className="text-lg font-semibold">Notifikasi</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {loading ? '…' : `${notifs.length} total · ${unreadCount} belum dibaca`}
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button onClick={markAll} disabled={markingAll}
              className="btn btn-secondary text-xs disabled:opacity-60">
              {markingAll ? <Spinner size={12}/> : '✓'} Mark All Read
            </button>
          )}
          <button onClick={fetch} className="btn btn-secondary text-xs">🔄</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit animate-fade-in delay-100">
        {(['all','unread'] as const).map(f => (
          <button key={f} onClick={()=>setFilter(f)}
            className={`text-xs px-4 py-1.5 rounded-md font-medium transition-all ${filter===f?'text-white':'text-slate-500'}`}
            style={filter===f?{backgroundColor:'var(--ac)'}:{}}>
            {f==='all'?`Semua (${notifs.length})`:`Belum Dibaca (${unreadCount})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_,i)=>(
            <div key={i} className="card animate-fade-in" style={{animationDelay:`${i*50}ms`}}>
              <div className="flex gap-3">
                <div className="skeleton w-6 h-6 rounded-full flex-shrink-0"/>
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-3/4"/>
                  <div className="skeleton h-3 w-full"/>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="card text-center py-16 animate-fade-in-scale">
          <div className="text-4xl mb-3">🔔</div>
          <div className="font-medium text-slate-600 dark:text-slate-300">
            {filter==='unread' ? 'Semua notifikasi sudah dibaca' : 'Belum ada notifikasi'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Notifikasi muncul otomatis dari aktivitas IoT dan inventory
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((n,i) => (
            <div key={n._id}
              className={`card border-l-4 transition-all duration-300 animate-fade-in-left ${TYPE_STYLE[n.type]||TYPE_STYLE.info} ${!n.read?'ring-1 ring-blue-100 dark:ring-blue-900':''}`}
              style={{animationDelay:`${i*40}ms`}}
              onClick={()=>!n.read&&markRead(n._id)}>
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">{TYPE_ICON[n.type]||'🔵'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{n.title}</span>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 animate-pulse"/>}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{n.message}</p>
                  {n.actionRoute && (
                    <button onClick={e=>{e.stopPropagation();navigate(n.actionRoute!)}}
                      className="text-xs mt-1.5 font-medium hover:underline" style={{color:'var(--ac)'}}>
                      {n.actionLabel||'Lihat →'}
                    </button>
                  )}
                </div>
                <button onClick={e=>{e.stopPropagation();remove(n._id)}}
                  disabled={removing===n._id}
                  className="text-slate-300 hover:text-red-400 dark:text-slate-600 dark:hover:text-red-500 transition-colors flex-shrink-0 text-lg leading-none">
                  {removing===n._id ? <Spinner size={14}/> : '×'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
