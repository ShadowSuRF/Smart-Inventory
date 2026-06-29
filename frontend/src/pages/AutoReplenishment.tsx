import { useEffect, useState, useCallback } from 'react'
import { getReplenishmentSuggestions, createReplenishmentOrder, getSuppliers, createSupplier } from '../lib/api'
import Modal from '../components/ui/Modal'
import type { ReplenishmentOrder, Supplier } from '../types'
import { priorityBadge } from '../lib/utils'
import toast from 'react-hot-toast'

export default function AutoReplenishment() {
  const [orders, setOrders]       = useState<ReplenishmentOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading]     = useState(true)
  const [orderModal, setOrderModal] = useState(false)
  const [supModal, setSupModal]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [orderForm, setOrderForm] = useState({ itemName:'', supplier:'', quantity:'', priority:'medium' })
  const [supForm, setSupForm]     = useState({ name:'', contactEmail:'', contactPhone:'', responseTimeHours:'', reliabilityPercent:'', rating:'' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [ordRes, supRes] = await Promise.all([getReplenishmentSuggestions(), getSuppliers()])
      setOrders(ordRes.data.data || [])
      setSuppliers(supRes.data.data || [])
    } catch {
      toast.error('Gagal memuat data replenishment')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const createOrder = async (order: ReplenishmentOrder) => {
    try {
      await createReplenishmentOrder({
        itemId: order.itemId, itemName: order.itemName,
        supplierId: order.supplierId, supplierName: order.supplierName,
        quantity: order.suggestedQuantity, unitPrice: order.unitPrice || 5,
        totalCost: order.totalCost, priority: order.priority,
        currentStock: order.currentStock, reorderPoint: order.reorderPoint,
        suggestedQuantity: order.suggestedQuantity,
      })
      setOrders(prev => prev.filter(o => o._id !== order._id))
      toast.success(`Order dibuat untuk ${order.itemName}!`)
    } catch { toast.error('Gagal membuat order') }
  }

  const bulkOrder = async () => {
    const hi = orders.filter(o => o.priority === 'high')
    if (!hi.length) { toast('Tidak ada order prioritas tinggi'); return }
    for (const o of hi) await createOrder(o)
    toast.success(`${hi.length} order sekaligus dibuat!`)
  }

  const handleManualOrder = async () => {
    if (!orderForm.itemName) { toast.error('Nama item wajib diisi'); return }
    setSaving(true)
    try {
      await createReplenishmentOrder({
        itemName: orderForm.itemName, supplierName: orderForm.supplier,
        quantity: Number(orderForm.quantity)||50, priority: orderForm.priority,
        totalCost: (Number(orderForm.quantity)||50)*5, status:'pending',
      })
      toast.success('Manual order dibuat!')
      setOrderModal(false)
      fetchData()
    } catch { } finally { setSaving(false) }
  }

  const handleAddSupplier = async () => {
    if (!supForm.name) { toast.error('Nama supplier wajib diisi'); return }
    setSaving(true)
    try {
      await createSupplier({
        ...supForm,
        responseTimeHours: Number(supForm.responseTimeHours)||3,
        reliabilityPercent: Number(supForm.reliabilityPercent)||90,
        rating: Number(supForm.rating)||4,
      })
      toast.success('Supplier ditambahkan!')
      setSupModal(false)
      fetchData()
    } catch { } finally { setSaving(false) }
  }

  const stars = (r: number) => '★'.repeat(Math.floor(r))+'☆'.repeat(5-Math.floor(r))

  // KPI dari data nyata
  const pending     = orders.filter(o => o.status === 'pending').length
  const highPrio    = orders.filter(o => o.priority === 'high').length
  const totalCost   = orders.reduce((s,o) => s + (o.totalCost||0), 0)

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Auto Replenishment</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Saran replenishment berdasarkan stok inventori kamu</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setOrderModal(true)} className="btn btn-secondary text-xs">+ Manual Order</button>
          <button onClick={() => setSupModal(true)} className="btn btn-secondary text-xs">+ Supplier</button>
          <button onClick={fetchData} className="btn btn-secondary text-xs">🔄</button>
        </div>
      </div>

      {/* KPI dari data nyata */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Pending Orders</div>
          <div className="text-2xl font-semibold text-blue-600">{loading ? '…' : pending}</div>
          <div className="text-xs text-slate-400">Menunggu persetujuan</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">High Priority</div>
          <div className="text-2xl font-semibold text-red-500">{loading ? '…' : highPrio}</div>
          <div className="text-xs text-slate-400">Perlu segera diorder</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Est. Total Cost</div>
          <div className="text-2xl font-semibold text-amber-600">${loading ? '…' : totalCost.toLocaleString()}</div>
          <div className="text-xs text-slate-400">Biaya semua pending order</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Suppliers Aktif</div>
          <div className="text-2xl font-semibold text-green-600">{loading ? '…' : suppliers.filter(s=>s.status==='active').length}</div>
          <div className="text-xs text-slate-400">Total supplier terdaftar: {suppliers.length}</div>
        </div>
      </div>

      {/* Bulk action */}
      {!loading && highPrio > 0 && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
          <div className="text-sm text-red-700 dark:text-red-400">
            ⚠️ <strong>{highPrio} item prioritas tinggi</strong> perlu segera di-order
          </div>
          <button onClick={bulkOrder} className="btn btn-danger text-xs py-1.5">
            🚀 Bulk Order Semua High Priority
          </button>
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        {/* Orders */}
        <div className="col-span-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Replenishment Suggestions ({orders.length})
          </h3>
          {loading ? (
            [...Array(3)].map((_,i) => <div key={i} className="card animate-pulse h-28 mb-3" />)
          ) : orders.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Semua stok aman — tidak ada rekomendasi order</div>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map(order => (
                <div key={order._id} className="card">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{order.itemName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{order.supplierName || 'Belum ada supplier'}</div>
                    </div>
                    <span className={`badge text-xs ${priorityBadge(order.priority)}`}>{order.priority}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    <div className="bg-slate-50 dark:bg-slate-700 rounded p-2">
                      <div className="text-xs text-slate-400">Stok saat ini</div>
                      <div className="font-semibold text-sm text-red-500">{order.currentStock}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-700 rounded p-2">
                      <div className="text-xs text-slate-400">Reorder point</div>
                      <div className="font-semibold text-sm">{order.reorderPoint}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-700 rounded p-2">
                      <div className="text-xs text-slate-400">Suggested qty</div>
                      <div className="font-semibold text-sm text-green-600">{order.suggestedQuantity}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Habis dalam ~{order.stockoutDays} hari · Est. ${order.totalCost?.toLocaleString()}
                    </div>
                    <button onClick={() => createOrder(order)} className="btn btn-primary text-xs py-1">Order Sekarang</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Suppliers */}
        <div className="col-span-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Suppliers ({suppliers.length})
          </h3>
          {loading ? (
            [...Array(3)].map((_,i) => <div key={i} className="card animate-pulse h-20 mb-3" />)
          ) : suppliers.length === 0 ? (
            <div className="card text-center py-8">
              <div className="text-sm text-slate-400">Belum ada supplier — tambahkan supplier baru</div>
            </div>
          ) : (
            <div className="space-y-3">
              {suppliers.map(sup => (
                <div key={sup._id} className="card">
                  <div className="flex items-start justify-between mb-1">
                    <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">{sup.name}</div>
                    <span className={`badge text-xs ${sup.status==='active'?'bg-green-100 text-green-700':'bg-slate-100 text-slate-500'}`}>{sup.status}</span>
                  </div>
                  <div className="text-xs text-amber-500">{stars(sup.rating || 4)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    ⚡ {sup.responseTimeHours}h response · {sup.reliabilityPercent}% reliable
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Manual Order Modal */}
      <Modal open={orderModal} onClose={() => setOrderModal(false)} title="Buat Manual Order">
        <div className="space-y-3">
          <div><label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Item Name *</label>
            <input className="input w-full text-xs" placeholder="Nama item" value={orderForm.itemName} onChange={e => setOrderForm(p => ({...p, itemName: e.target.value}))} /></div>
          <div><label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Supplier</label>
            <select className="input w-full text-xs" value={orderForm.supplier} onChange={e => setOrderForm(p => ({...p, supplier: e.target.value}))}>
              <option value="">Pilih supplier...</option>
              {suppliers.map(s => <option key={s._id} value={s.name}>{s.name}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Quantity</label>
              <input type="number" className="input w-full text-xs" placeholder="50" value={orderForm.quantity} onChange={e => setOrderForm(p => ({...p, quantity: e.target.value}))} /></div>
            <div><label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Priority</label>
              <select className="input w-full text-xs" value={orderForm.priority} onChange={e => setOrderForm(p => ({...p, priority: e.target.value}))}>
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select></div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setOrderModal(false)} className="btn btn-secondary flex-1 text-xs">Batal</button>
            <button onClick={handleManualOrder} disabled={saving} className="btn btn-primary flex-1 text-xs disabled:opacity-60">{saving?'…':'Buat Order'}</button>
          </div>
        </div>
      </Modal>

      {/* Add Supplier Modal */}
      <Modal open={supModal} onClose={() => setSupModal(false)} title="Tambah Supplier">
        <div className="space-y-3">
          {[
            {k:'name',label:'Nama Supplier *',ph:'Nama perusahaan'},
            {k:'contactEmail',label:'Email',ph:'email@supplier.com'},
            {k:'contactPhone',label:'Telepon',ph:'+62...'},
            {k:'responseTimeHours',label:'Response Time (jam)',ph:'3',type:'number'},
            {k:'reliabilityPercent',label:'Reliability (%)',ph:'90',type:'number'},
            {k:'rating',label:'Rating (1-5)',ph:'4',type:'number'},
          ].map(f => (
            <div key={f.k}>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">{f.label}</label>
              <input type={f.type||'text'} className="input w-full text-xs" placeholder={f.ph}
                value={(supForm as any)[f.k]}
                onChange={e => setSupForm(p => ({...p, [f.k]: e.target.value}))} />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button onClick={() => setSupModal(false)} className="btn btn-secondary flex-1 text-xs">Batal</button>
            <button onClick={handleAddSupplier} disabled={saving} className="btn btn-primary flex-1 text-xs disabled:opacity-60">{saving?'…':'Tambah'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
