import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../../lib/api'
import { isConnected } from '../../lib/mqtt'
import { useSettings } from '../../context/SettingsContext'
import toast from 'react-hot-toast'

const NAV = [
  { path: '/dashboard',        label: 'Dashboard',          icon: '⊞' },
  { path: '/inventory',        label: 'Inventory Tracking', icon: '📦' },
  { path: '/iot',              label: 'IoT Sensor Network', icon: '📡' },
  { path: '/excel-import',     label: 'Excel Import',       icon: '📤' },
  { path: '/forecasting',      label: 'AI Forecasting',     icon: '🧠' },
  { path: '/waste-prevention', label: 'Waste Prevention',   icon: '🌱' },
  { path: '/replenishment',    label: 'Auto Replenishment', icon: '🔄' },
  { path: '/analytics',        label: 'Analytics',          icon: '📊' },
  { path: '/profit',           label: 'Profit & Loss',      icon: '💰' },
  { path: '/notifications',    label: 'Notifications',      icon: '🔔' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const { settings, setTheme } = useSettings()

  const user = JSON.parse(localStorage.getItem('user') || '{}')

  const handleLogout = async () => {
    setLoggingOut(true)
    try { await logout() } catch {}
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    toast.success('Logged out successfully')
    navigate('/login')
  }

  const currentLabel = NAV.find(n => n.path === location.pathname)?.label || 'Settings'

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 dark:bg-slate-950">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-14'} flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-200`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <span className="text-xl flex-shrink-0">🏪</span>
          {sidebarOpen && (
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--ac)' }}>Smart Inventory</div>
              <div className="text-xs text-slate-400 truncate">Waste Reducer AI</div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0 text-xs"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`sidebar-link w-full text-left ${location.pathname === item.path ? 'active' : ''}`}
              title={!sidebarOpen ? item.label : undefined}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="truncate text-xs">{item.label}</span>}
            </button>
          ))}
          <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
          <button
            onClick={() => navigate('/settings')}
            className={`sidebar-link w-full text-left ${location.pathname === '/settings' ? 'active' : ''}`}
          >
            <span className="text-base flex-shrink-0">⚙️</span>
            {sidebarOpen && <span className="truncate text-xs">Settings</span>}
          </button>
        </nav>

        {sidebarOpen && (
          <div className="p-3 m-2 mb-3 rounded-lg" style={{ backgroundColor: 'var(--acl)' }}>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-semibold flex-shrink-0"
                style={{ backgroundColor: 'var(--ac)' }}
              >
                {user.initials || user.name?.slice(0, 2).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{user.name || 'User'}</div>
                <div className="text-xs text-slate-400 truncate">{user.role || 'Staff'}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="mt-2 w-full text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 text-left font-medium disabled:opacity-50"
            >
              {loggingOut ? '⏳ Logging out…' : '🚪 Logout'}
            </button>
          </div>
        )}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center px-4 gap-3">
          <div className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-400">{currentLabel}</div>
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${isConnected() ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected() ? 'bg-green-500' : 'bg-slate-400'}`} />
            {isConnected() ? 'IoT Live' : 'IoT Offline'}
          </div>
          <button
            onClick={() => setTheme(settings.theme === 'dark' ? 'light' : 'dark')}
            className="btn btn-secondary text-xs px-2 py-1"
          >
            {settings.theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-5">{children}</main>
      </div>
    </div>
  )
}
