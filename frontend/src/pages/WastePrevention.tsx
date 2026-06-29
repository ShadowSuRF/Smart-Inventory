import { useEffect, useState, useCallback } from 'react'
import { getWasteItems, applyWasteAction, getDashboardStats } from '../lib/api'
import Modal from '../components/ui/Modal'
import type { WasteItem } from '../types'
import toast from 'react-hot-toast'

const ACTION_MAP: Record<string, { label: string; cls: string }> = {
  flash_sale: { label:'Create Flash Sale', cls:'btn-danger' },
  bundle:     { label:'Set Bundle Offer', cls:'btn-danger' },
  donation:   { label:'Arrange Donation', cls:'btn-danger' },
  promotion:  { label:'Schedule Promotion', cls:'btn-success' },
  kit:        { label:'Build Product Kit', cls:'btn-success' },
  alert:      { label:'Set Monitoring Alert', cls:'btn-primary' },
}
const urgencyBorder = (d: number) => d<=2?'border-l-red-500':d<=5?'border-l-amber-500':'border-l-blue-400'
const urgencyBadge  = (d: number) => d<=2?'bg-red-100 text-red-700 border border-red-200':d<=5?'bg-amber-100 text-amber-700 border border-amber-200':'bg-blue-100 text-blue-700 border border-blue-200'

export default function WastePrevention() {
  const [items, setItems]     = useState<WasteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<{ item: WasteItem; label: string } | null>(null)
  const [detail, setDetail]   = useState('')
  const [applying, setApplying] = useState(false)
  // KPI dari API, bukan hardcode
  const [kpi, setKpi]         = useState({ prevented: 0, co2: 0, rescued: 0 })

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const [wasteRes, statsRes] = await Promise.all([
        getWasteItems(),
        getDashboardStats().catch(() => null),
      ])
      setItems(wasteRes.data.data || [])
      if (statsRes?.data?.data) {
        const s = statsRes.data.data
        setKpi({ prevented: s.wastePrevented || 0, co2: s.co2Saved || 0, rescued: s.totalItems || 0 })
      }
    } catch {
      toast.error('Gagal memuat waste items')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openAction = (item: WasteItem) => {
    const ac = ACTION_MAP[item.recommendedAction] || ACTION_MAP.alert
    setDetail(''); setModal({ item, label: ac.label })
  }

  const confirmAction = async () => {
    if (!modal) return
    setApplying(true)
    try {
      await applyWasteAction(modal.item._id, modal.item.recommendedAction, detail)
      setItems(prev => prev.filter(i => i._id !== modal.item._id))
      toast.success(`Action applied to ${modal.item.itemName}!`)
      // Refresh KPI setelah action
      const statsRes = await getDashboardStats().catch(() => null)
      if (statsRes?.data?.data) {
        const s = statsRes.data.data
        setKpi({ prevented: s.wastePrevented || 0, co2: s.co2Saved || 0, rescued: s.totalItems || 0 })
      }
      setModal(null)
    } catch {
      toast.error('Gagal menerapkan action')
    } finally {
      setApplying(false)
    }
  }

  const totalValue = items.reduce((s, i) => s + i.value, 0)
  const criticalCount = items.filter(i => i.daysUntilExpiry <= 2).length

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Waste Prevention</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Item inventori kamu yang mendekati kadaluarsa</p>
        </div>
        <button onClick={fetchItems} className="btn btn-secondary text-xs">🔄</button>
      </div>

      {/* KPI dari data nyata user */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Items At Risk</div>
          <div className="text-2xl font-semibold text-red-500">{loading ? '…' : items.length}</div>
          <div className="text-xs text-slate-400">≤7 hari kadaluarsa</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Critical (≤2 hari)</div>
          <div className="text-2xl font-semibold text-red-600">{loading ? '…' : criticalCount}</div>
          <div className="text-xs text-slate-400">Perlu tindakan segera</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Nilai At Risk</div>
          <div className="text-2xl font-semibold text-amber-600">${loading ? '…' : totalValue.toLocaleString()}</div>
          <div className="text-xs text-slate-400">Estimasi nilai terbuang</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Waste Prevented</div>
          <div className="text-2xl font-semibold text-green-600">${kpi.prevented.toLocaleString()}</div>
          <div className="text-xs text-slate-400">Total berhasil dicegah</div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_,i) => <div key={i} className="card animate-pulse h-36" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Tidak ada item yang mendekati kadaluarsa</div>
          <div className="text-xs text-slate-400 mt-1">Semua item inventori kamu masih aman</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {items.map(item => {
            const ac = ACTION_MAP[item.recommendedAction] || ACTION_MAP.alert
            return (
              <div key={item._id} className={`card border-l-4 ${urgencyBorder(item.daysUntilExpiry)}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{item.itemName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{item.category} · {item.quantity} units · ${item.value.toLocaleString()}</div>
                  </div>
                  <span className={`badge text-xs ${urgencyBadge(item.daysUntilExpiry)}`}>
                    {item.daysUntilExpiry} hari lagi
                  </span>
                </div>
                {item.aiRecommendation && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 bg-slate-50 dark:bg-slate-700/50 rounded p-2">
                    💡 {item.aiRecommendation}
                  </div>
                )}
                <button onClick={() => openAction(item)} className="btn btn-primary w-full text-xs py-1.5">
                  {ac.label}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.label || ''}>
        <div className="space-y-3">
          <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg text-sm">
            <div className="font-medium text-slate-900 dark:text-slate-100">{modal?.item.itemName}</div>
            <div className="text-slate-500 dark:text-slate-400 text-xs mt-1">
              {modal?.item.quantity} units · ${modal?.item.value} · {modal?.item.daysUntilExpiry} hari tersisa
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Detail / Catatan (opsional)</label>
            <textarea
              className="input w-full h-20 text-xs resize-none"
              placeholder="Tambahkan detail aksi..."
              value={detail}
              onChange={e => setDetail(e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setModal(null)} className="btn btn-secondary flex-1 text-xs">Batal</button>
            <button onClick={confirmAction} disabled={applying} className="btn btn-primary flex-1 text-xs disabled:opacity-60">
              {applying ? '⏳ Menerapkan…' : 'Terapkan'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
