import { useEffect, useState, useCallback } from 'react'
import {
  getReplenishmentSuggestions, getReplenishmentOrders,
  createReplenishmentOrder, updateReplenishmentOrder,
  deleteReplenishmentOrder, getSuppliers, createSupplier,
} from '../lib/api'
import Modal from '../components/ui/Modal'
import type { Supplier } from '../types'
import { priorityBadge } from '../lib/utils'
import toast from 'react-hot-toast'

type OrderStatus = 'pending' | 'ordered' | 'completed' | 'cancelled'

interface SuggOrOrder {
  _id: string; itemId?: string; itemName: string
  supplierName?: string; supplierId?: string
  currentStock?: number; reorderPoint?: number; suggestedQuantity?: number
  quantity?: number; unitPrice?: number; totalCost?: number
  priority?: string; status?: OrderStatus
  stockoutDays?: number; category?: string; zone?: string
}

const statusBadge = (s: OrderStatus) => {
  if (s === 'completed')  return 'bg-green-100 text-green-700'
  if (s === 'ordered')    return 'bg-blue-100 text-blue-700'
  if (s === 'cancelled')  return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-700'  // pending
}
const statusLabel = (s: OrderStatus) => ({
  pending: '⏳ Pending', ordered: '📦 Dipesan', completed: '✅ Diterima', cancelled: '❌ Dibatal'
}[s] || s)

export default function AutoReplenishment() {
  const [suggestions, setSuggestions] = useState<SuggOrOrder[]>([])
  const [history, setHistory]         = useState<SuggOrOrder[]>([])
  const [suppliers, setSuppliers]     = useState<Supplier[]>([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState<'suggestions' | 'history'>('suggestions')
  const [orderModal, setOrderModal]   = useState(false)
  const [supModal, setSupModal]       = useState(false)
  const [saving, setSaving]           = useState(false)
  const [orderForm, setOrderForm]     = useState({ itemName:'', supplier:'', quantity:'', priority:'medium' })
  const [supForm, setSupForm]         = useState({
    name:'', contactEmail:'', contactPhone:'',
    responseTimeHours:'', reliabilityPercent:'', rating:'',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [sugRes, histRes, supRes] = await Promise.all([
        getReplenishmentSuggestions(),
        getReplenishmentOrders().catch(() => null),
        getSuppliers(),
      ])
      setSuggestions(sugRes.data.data || [])
      setHistory(histRes?.data?.data || [])
      setSuppliers(supRes.data.data || [])
    } catch {
      toast.error('Gagal memuat data replenishment')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const orderNow = async (s: SuggOrOrder) => {
    try {
      await createReplenishmentOrder({
        itemId: s.itemId, itemName: s.itemName,
        supplierId: s.supplierId, supplierName: s.supplierName || 'FreshDirect Suppliers',
        quantity: s.suggestedQuantity, unitPrice: s.unitPrice || 0,
        totalCost: s.totalCost, priority: s.priority || 'medium',
        currentStock: s.currentStock, reorderPoint: s.reorderPoint,
        suggestedQuantity: s.suggestedQuantity, status: 'pending',
      })
      toast.success(`✅ Order dibuat untuk ${s.itemName}!`)
      fetchData()  // re-fetch supaya suggestions langsung hilang + history update
    } catch {
      toast.error('Gagal membuat order')
    }
  }

  const updateStatus = async (id: string, status: OrderStatus, itemName: string) => {
    try {
      await updateReplenishmentOrder(id, { status })
      const msgs: Record<OrderStatus, string> = {
        ordered:   `📦 ${itemName} ditandai dipesan`,
        completed: `✅ ${itemName} diterima — stok otomatis diperbarui`,
        cancelled: `❌ Order ${itemName} dibatalkan`,
        pending:   `⏳ ${itemName} kembali ke pending`,
      }
      toast.success(msgs[status] || 'Status diperbarui')
      fetchData()
    } catch {
      toast.error('Gagal update status')
    }
  }

  const deleteOrder = async (id: string, itemName: string) => {
    if (!confirm(`Hapus order untuk ${itemName}?`)) return
    try {
      await deleteReplenishmentOrder(id)
      toast.success('Order dihapus')
      fetchData()
    } catch { toast.error('Gagal hapus order') }
  }

  const bulkOrder = async () => {
    const highSugg = suggestions.filter(s => s.priority === 'high' && !s.status)
    if (!highSugg.length) { toast('Tidak ada saran prioritas tinggi yang belum diorder'); return }
    for (const s of highSugg) await orderNow(s)
    toast.success(`${highSugg.length} order sekaligus dibuat!`)
  }

  const handleManualOrder = async () => {
    if (!orderForm.itemName) { toast.error('Nama item wajib diisi'); return }
    setSaving(true)
    try {
      await createReplenishmentOrder({
        itemName: orderForm.itemName, supplierName: orderForm.supplier,
        quantity: Number(orderForm.quantity) || 50, priority: orderForm.priority,
        totalCost: (Number(orderForm.quantity) || 50) * 5, status: 'pending',
      })
      toast.success('Manual order dibuat!')
      setOrderModal(false)
      setOrderForm({ itemName:'', supplier:'', quantity:'', priority:'medium' })
      fetchData()
    } catch { } finally { setSaving(false) }
  }

  const handleAddSupplier = async () => {
    if (!supForm.name) { toast.error('Nama supplier wajib diisi'); return }
    setSaving(true)
    try {
      await createSupplier({
        ...supForm,
        responseTimeHours:  Number(supForm.responseTimeHours) || 3,
        reliabilityPercent: Number(supForm.reliabilityPercent) || 90,
        rating:             Number(supForm.rating) || 4,
      })
      toast.success('Supplier ditambahkan!')
      setSupModal(false)
      setSupForm({ name:'', contactEmail:'', contactPhone:'', responseTimeHours:'', reliabilityPercent:'', rating:'' })
      fetchData()
    } catch { } finally { setSaving(false) }
  }

  const stars = (r: number) => '★'.repeat(Math.floor(r)) + '☆'.repeat(5 - Math.floor(r))
  const pendingSugg  = suggestions.filter(s => !s.status || s.status === 'pending').length
  const highPrio     = suggestions.filter(s => s.priority === 'high' && !s.status).length
  const activeOrders = history.filter(o => o.status === 'ordered').length
  const totalCost    = suggestions.reduce((s, o) => s + (o.totalCost || 0), 0)

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Auto Replenishment</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Saran berdasarkan stok kritis · item yg sudah dipesan tidak muncul lagi di saran
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setOrderModal(true)} className="btn btn-secondary text-xs">+ Manual Order</button>
          <button onClick={() => setSupModal(true)} className="btn btn-secondary text-xs">+ Supplier</button>
          <button onClick={fetchData} className="btn btn-secondary text-xs">🔄</button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Perlu Diorder</div>
          <div className="text-2xl font-semibold text-amber-600">{loading ? '…' : pendingSugg}</div>
          <div className="text-xs text-slate-400">item belum ada ordernya</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">High Priority</div>
          <div className="text-2xl font-semibold text-red-500">{loading ? '…' : highPrio}</div>
          <div className="text-xs text-slate-400">perlu segera diorder</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Sedang Diproses</div>
          <div className="text-2xl font-semibold text-blue-600">{loading ? '…' : activeOrders}</div>
          <div className="text-xs text-slate-400">order dipesan/on-the-way</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Est. Total Cost</div>
          <div className="text-2xl font-semibold text-slate-700 dark:text-slate-200">${loading ? '…' : totalCost.toLocaleString()}</div>
          <div className="text-xs text-slate-400">dari saran pending</div>
        </div>
      </div>

      {/* Bulk action banner */}
      {!loading && highPrio > 0 && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
          <div className="text-sm text-red-700 dark:text-red-400">
            ⚠️ <strong>{highPrio} item prioritas tinggi</strong> belum diorder
          </div>
          <button onClick={bulkOrder} className="btn btn-danger text-xs py-1.5">
            🚀 Bulk Order Semua High Priority
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
        {[
          { k: 'suggestions', l: `💡 Saran Replenishment (${pendingSugg})` },
          { k: 'history',     l: `📋 Riwayat Order (${history.length})` },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`text-xs px-4 py-1.5 rounded-md font-medium transition-all ${tab===t.k?'text-white':'text-slate-500 dark:text-slate-400'}`}
            style={tab===t.k?{backgroundColor:'var(--ac)'}:{}}>
            {t.l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Main content */}
        <div className="col-span-3">
          {/* === TAB: Suggestions === */}
          {tab === 'suggestions' && (
            <>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Item Perlu Diorder ({pendingSugg})
              </h3>
              {loading ? (
                [...Array(3)].map((_,i) => <div key={i} className="card skeleton h-28 mb-3" />)
              ) : suggestions.filter(s => !s.status || s.status === 'pending').length === 0 ? (
                <div className="card text-center py-10">
                  <div className="text-3xl mb-2">✅</div>
                  <div className="font-medium text-slate-600 dark:text-slate-300">Semua stok aman</div>
                  <div className="text-sm text-slate-400 mt-1">Tidak ada item yang perlu di-reorder sekarang</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {suggestions.filter(s => !s.status || s.status === 'pending').map(s => (
                    <div key={s._id} className="card border-l-4 border-l-amber-400">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{s.itemName}</div>
                          <div className="text-xs text-slate-400 flex gap-2">
                            <span>{s.supplierName || 'Belum ada supplier'}</span>
                            {s.category && <span>· {s.category}</span>}
                            {s.zone && <span>· {s.zone}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          {s.priority && <span className={`badge text-xs ${priorityBadge(s.priority)}`}>{s.priority}</span>}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center mb-3">
                        <div className="bg-red-50 dark:bg-red-900/20 rounded p-2">
                          <div className="text-xs text-slate-400">Stok saat ini</div>
                          <div className="font-semibold text-sm text-red-500">{s.currentStock}</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-700 rounded p-2">
                          <div className="text-xs text-slate-400">Reorder point</div>
                          <div className="font-semibold text-sm">{s.reorderPoint}</div>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 rounded p-2">
                          <div className="text-xs text-slate-400">Suggested qty</div>
                          <div className="font-semibold text-sm text-green-600">{s.suggestedQuantity}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {s.stockoutDays && `Habis ~${s.stockoutDays} hari lagi`}
                          {s.totalCost ? ` · Est. $${s.totalCost?.toLocaleString()}` : ''}
                        </div>
                        <button onClick={() => orderNow(s)} className="btn btn-primary text-xs py-1">
                          Order Sekarang
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* === TAB: History === */}
          {tab === 'history' && (
            <>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Riwayat Order ({history.length})
              </h3>
              {loading ? (
                [...Array(4)].map((_,i) => <div key={i} className="card skeleton h-20 mb-3" />)
              ) : history.length === 0 ? (
                <div className="card text-center py-10">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="text-sm text-slate-400">Belum ada riwayat order</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map(o => (
                    <div key={o._id} className={`card border-l-4 ${
                      o.status === 'completed' ? 'border-l-green-500' :
                      o.status === 'ordered'   ? 'border-l-blue-500' :
                      o.status === 'cancelled' ? 'border-l-red-400'  : 'border-l-amber-400'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{o.itemName}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            qty: {o.quantity || o.suggestedQuantity}
                            {o.totalCost ? ` · $${o.totalCost.toLocaleString()}` : ''}
                            {o.supplierName ? ` · ${o.supplierName}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`badge text-xs ${statusBadge(o.status as OrderStatus)}`}>
                            {statusLabel(o.status as OrderStatus)}
                          </span>
                          {/* Status update actions */}
                          <div className="flex gap-1">
                            {o.status === 'pending' && (
                              <button onClick={() => updateStatus(o._id, 'ordered', o.itemName)}
                                className="btn btn-secondary text-xs py-0.5 px-2">📦 Dipesan</button>
                            )}
                            {o.status === 'ordered' && (
                              <button onClick={() => updateStatus(o._id, 'completed', o.itemName)}
                                className="btn btn-success text-xs py-0.5 px-2">✅ Terima</button>
                            )}
                            {(o.status === 'pending' || o.status === 'ordered') && (
                              <button onClick={() => updateStatus(o._id, 'cancelled', o.itemName)}
                                className="btn btn-danger text-xs py-0.5 px-2">✕</button>
                            )}
                            {(o.status === 'completed' || o.status === 'cancelled') && (
                              <button onClick={() => deleteOrder(o._id, o.itemName)}
                                className="text-xs text-slate-400 hover:text-red-500 px-1">🗑</button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Suppliers */}
        <div className="col-span-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Suppliers ({suppliers.length})
          </h3>
          {loading ? (
            [...Array(3)].map((_,i) => <div key={i} className="card skeleton h-20 mb-3" />)
          ) : suppliers.length === 0 ? (
            <div className="card text-center py-8">
              <div className="text-sm text-slate-400">Belum ada supplier</div>
            </div>
          ) : (
            <div className="space-y-3">
              {suppliers.map(sup => (
                <div key={sup._id} className="card">
                  <div className="flex items-start justify-between mb-1">
                    <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">{sup.name}</div>
                    <span className={`badge text-xs ${sup.status==='active'?'bg-green-100 text-green-700':'bg-slate-100 text-slate-500'}`}>
                      {sup.status}
                    </span>
                  </div>
                  <div className="text-xs text-amber-500 mb-1">{stars(sup.rating || 0)}</div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-slate-400">
                    <span>⏱ {sup.contactEmail || '—'}</span>
                    <span>✅ {sup.reliabilityPercent}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Manual Order Modal */}
      <Modal open={orderModal} onClose={() => setOrderModal(false)} title="Manual Order" size="sm">
        <div className="space-y-3">
          <div><label className="label">Nama Item *</label>
            <input className="input text-xs" placeholder="Nama produk" value={orderForm.itemName}
              onChange={e => setOrderForm(f => ({ ...f, itemName: e.target.value }))} />
          </div>
          <div><label className="label">Supplier</label>
            <input className="input text-xs" placeholder="Nama supplier" value={orderForm.supplier}
              onChange={e => setOrderForm(f => ({ ...f, supplier: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Qty</label>
              <input type="number" className="input text-xs" placeholder="50" value={orderForm.quantity}
                onChange={e => setOrderForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div><label className="label">Prioritas</label>
              <select className="input text-xs" value={orderForm.priority}
                onChange={e => setOrderForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setOrderModal(false)} className="btn btn-secondary flex-1 text-xs">Batal</button>
            <button onClick={handleManualOrder} disabled={saving} className="btn btn-primary flex-1 text-xs disabled:opacity-60">
              {saving ? 'Menyimpan…' : 'Buat Order'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Supplier Modal */}
      <Modal open={supModal} onClose={() => setSupModal(false)} title="Tambah Supplier">
        <div className="space-y-3">
          <div><label className="label">Nama Supplier *</label>
            <input className="input text-xs" value={supForm.name}
              onChange={e => setSupForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Email</label>
              <input type="email" className="input text-xs" value={supForm.contactEmail}
                onChange={e => setSupForm(f => ({ ...f, contactEmail: e.target.value }))} />
            </div>
            <div><label className="label">Phone</label>
              <input className="input text-xs" value={supForm.contactPhone}
                onChange={e => setSupForm(f => ({ ...f, contactPhone: e.target.value }))} />
            </div>
            <div><label className="label">Response Time (jam)</label>
              <input type="number" className="input text-xs" placeholder="3" value={supForm.responseTimeHours}
                onChange={e => setSupForm(f => ({ ...f, responseTimeHours: e.target.value }))} />
            </div>
            <div><label className="label">Reliability (%)</label>
              <input type="number" className="input text-xs" placeholder="90" value={supForm.reliabilityPercent}
                onChange={e => setSupForm(f => ({ ...f, reliabilityPercent: e.target.value }))} />
            </div>
          </div>
          <div><label className="label">Rating (1-5)</label>
            <input type="number" min="1" max="5" className="input text-xs" placeholder="4" value={supForm.rating}
              onChange={e => setSupForm(f => ({ ...f, rating: e.target.value }))} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setSupModal(false)} className="btn btn-secondary flex-1 text-xs">Batal</button>
            <button onClick={handleAddSupplier} disabled={saving} className="btn btn-primary flex-1 text-xs disabled:opacity-60">
              {saving ? 'Menyimpan…' : 'Tambah Supplier'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
