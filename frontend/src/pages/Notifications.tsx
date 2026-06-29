import { useEffect, useState, useCallback } from 'react'
import { getNotifications, deleteNotification, markAllNotificationsRead, markNotificationRead } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import type { Notification } from '../types'
import toast from 'react-hot-toast'

const TYPE_CFG = {
  critical: { icon:'🔴', bg:'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800', title:'text-red-800 dark:text-red-300' },
  warning:  { icon:'⚠️', bg:'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800', title:'text-amber-800 dark:text-amber-300' },
  success:  { icon:'✅', bg:'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800', title:'text-green-800 dark:text-green-300' },
  info:     { icon:'ℹ️', bg:'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800', title:'text-blue-800 dark:text-blue-300' },
}

export default function Notifications() {
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all'|'unread'>('all')

  const fetchNotifs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getNotifications()
      setNotifs(res.data.data || [])
    } catch {
      toast.error('Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNotifs() }, [fetchNotifs])

  const dismiss = async (id: string) => {
    try {
      await deleteNotification(id)
      setNotifs(prev => prev.filter(n => n._id !== id))
    } catch { toast.error('Failed to dismiss notification') }
  }

  const markRead = async (id: string) => {
    try {
      await markNotificationRead(id)
      setNotifs(prev => prev.map(n => n._id===id ? {...n, read:true} : n))
    } catch {}
  }

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead()
      setNotifs(prev => prev.map(n => ({...n, read:true})))
      toast.success('All notifications marked as read')
    } catch { toast.error('Failed to update notifications') }
  }

  const clearAll = async () => {
    try {
      await Promise.all(notifs.map(n => deleteNotification(n._id)))
      setNotifs([])
      toast.success('All notifications cleared')
    } catch { toast.error('Failed to clear notifications') }
  }

  const displayed = filter === 'unread' ? notifs.filter(n => !n.read) : notifs
  const unread = notifs.filter(n => !n.read).length
  const crits = notifs.filter(n => n.type === 'critical').length
  const warns = notifs.filter(n => n.type === 'warning').length

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Notifications &amp; Alerts</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Real-time system alerts and actionable insights</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          {crits > 0 && <span className="badge bg-red-100 text-red-700 border border-red-200">{crits} Critical</span>}
          {warns > 0 && <span className="badge bg-amber-100 text-amber-700 border border-amber-200">{warns} Warnings</span>}
          <button onClick={markAllRead} className="btn btn-secondary text-xs py-1">✓ Mark all read</button>
          <button onClick={clearAll} className="btn btn-secondary text-xs py-1">🗑 Clear all</button>
          <button onClick={fetchNotifs} className="btn btn-secondary text-xs py-1">🔄</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="kpi-card"><div className="text-xs text-slate-500 dark:text-slate-400">Total Alerts</div><div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{notifs.length}</div><div className="text-xs text-slate-400">Active</div></div>
        <div className="kpi-card"><div className="text-xs text-slate-500 dark:text-slate-400">Unread</div><div className="text-2xl font-semibold text-blue-600">{unread}</div><div className="text-xs text-slate-400">Require attention</div></div>
        <div className="kpi-card"><div className="text-xs text-slate-500 dark:text-slate-400">Action Rate</div><div className="text-2xl font-semibold text-green-600">87%</div><div className="text-xs text-slate-400">Alerts acted upon</div></div>
      </div>

      <div className="flex gap-2 mb-4">
        {(['all','unread'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${filter===f?'text-white':'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600'}`}
            style={filter===f ? { backgroundColor: 'var(--ac)', borderColor: 'var(--ac)' } : {}}>
            {f==='all'?`All (${notifs.length})`:`Unread (${unread})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2.5">{[...Array(4)].map((_,i) => <div key={i} className="card h-20 animate-pulse bg-slate-100 dark:bg-slate-800" />)}</div>
      ) : (
        <div className="space-y-2.5">
          {displayed.map(n => {
            const cfg = TYPE_CFG[n.type] || TYPE_CFG.info
            return (
              <div key={n._id}
                className={`flex gap-3 p-3 rounded-xl border ${cfg.bg} ${!n.read?'opacity-100':'opacity-70'} transition-opacity`}
                onClick={() => !n.read && markRead(n._id)}>
                <span className="text-lg flex-shrink-0 mt-0.5">{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div className={`text-sm font-semibold ${cfg.title} flex items-center gap-2`}>
                      {n.title}
                      {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />}
                    </div>
                    <button onClick={e => { e.stopPropagation(); dismiss(n._id) }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-2 flex-shrink-0 text-lg leading-none">×</button>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{n.message}</div>
                  {n.actionRoute && (
                    <button onClick={e => { e.stopPropagation(); navigate(n.actionRoute!) }}
                      className="text-xs font-medium text-blue-600 hover:underline mt-1.5 inline-block">
                      {n.actionLabel || 'View'} →
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {!displayed.length && (
            <div className="text-center py-16 text-slate-400">
              <div className="text-4xl mb-3">🔔</div>
              <div className="text-sm">{filter==='unread'?'No unread notifications':'No notifications'}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
