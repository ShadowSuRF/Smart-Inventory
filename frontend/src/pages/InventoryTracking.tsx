import { useEffect, useState, useCallback } from 'react'
import { getInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem } from '../lib/api'
import Modal from '../components/ui/Modal'
import FillBar from '../components/ui/FillBar'
import Badge from '../components/ui/Badge'
import { statusBadge } from '../lib/utils'
import type { InventoryItem } from '../types'
import toast from 'react-hot-toast'

const CATS = ['Fresh Produce','Dairy','Beverages','Frozen','Bakery','Snacks','Prepared Foods']

const EMPTY_FORM = { name:'', category:'Fresh Produce', zone:'', shelf:'', quantity:'', unitPrice:'', fillLevel:'80', rfid:'' }

export default function InventoryTracking() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modal, setModal] = useState<'add'|'edit'|null>(null)
  const [editing, setEditing] = useState<InventoryItem|null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string,string> = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (catFilter) params.category = catFilter
      if (search) params.search = search
      const res = await getInventory(params)
      setItems(res.data.data || [])
    } catch {
      toast.error('Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, catFilter, search])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openAdd = () => { setForm({ ...EMPTY_FORM }); setEditing(null); setModal('add') }
  const openEdit = (item: InventoryItem) => {
    setForm({ name:item.name, category:item.category, zone:item.zone, shelf:item.shelf, quantity:String(item.quantity), unitPrice:String(item.unitPrice), fillLevel:String(item.fillLevel), rfid:item.rfid })
    setEditing(item); setModal('edit')
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Item name is required'); return }
    if (!form.rfid.trim()) { toast.error('RFID tag is required'); return }
    setSaving(true)
    const fill = Number(form.fillLevel) || 80
    const payload = { ...form, quantity: Number(form.quantity)||0, unitPrice: Number(form.unitPrice)||0, fillLevel: fill, status: fill>=60?'optimal':fill>=20?'low_stock':'critical' }
    try {
      if (editing) {
        const res = await updateInventoryItem(editing._id, payload)
        setItems(prev => prev.map(i => i._id === editing._id ? res.data.data : i))
        toast.success('Item updated!')
      } else {
        const res = await createInventoryItem(payload)
        setItems(prev => [res.data.data, ...prev])
        toast.success(`${form.name} added!`)
      }
      setModal(null)
    } catch { } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!editing) return
    setDeleting(true)
    try {
      await deleteInventoryItem(editing._id)
      setItems(prev => prev.filter(i => i._id !== editing._id))
      toast.success(`${editing.name} deleted`)
      setModal(null)
    } catch { } finally { setDeleting(false) }
  }

  const filtered = items.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false
    if (catFilter && i.category !== catFilter) return false
    const q = search.toLowerCase()
    return !q || i.name.toLowerCase().includes(q) || i.rfid.toLowerCase().includes(q) || i.zone.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Real-time Inventory Tracking</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Smart shelves with IoT sensor monitoring</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">✓ All Sensors Online</span>
          <button onClick={openAdd} className="btn btn-success text-xs">+ Add Item</button>
          <button onClick={fetchItems} className="btn btn-secondary text-xs">🔄</button>
        </div>
      </div>

      <div className="flex gap-3 mb-3">
        <input className="input flex-1 text-xs" placeholder="Search items, RFID, zone…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input w-40 text-xs" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">All Categories</option>
          {CATS.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="flex gap-2 mb-4">
        {['all','optimal','low_stock','critical'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${statusFilter===s ? 'text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-slate-400'}`}
            style={statusFilter===s ? { backgroundColor: 'var(--ac)', borderColor: 'var(--ac)' } : {}}>
            {s==='all'?'All':s==='low_stock'?'Low Stock':s.charAt(0).toUpperCase()+s.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400 self-center">{filtered.length} items</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[...Array(6)].map((_,i) => <div key={i} className="card h-32 animate-pulse bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {filtered.map(item => (
            <div key={item._id} onClick={() => openEdit(item)} className="card cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-all hover:shadow-md">
              <div className="flex justify-between items-start mb-2">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate pr-2">{item.name}</div>
                <Badge className={statusBadge(item.status)} style={{ fontSize:'9px', whiteSpace:'nowrap' }}>
                  {item.status==='low_stock'?'Low':item.status==='optimal'?'OK':'Critical'}
                </Badge>
              </div>
              <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400 mb-2">
                <div>📍 Zone {item.zone}, Shelf {item.shelf}</div>
                <div>⚖️ {item.weight}kg · {item.quantity} {item.unit}</div>
                <div>🏷️ {item.rfid}</div>
              </div>
              <FillBar value={item.fillLevel} />
            </div>
          ))}
          {!filtered.length && (
            <div className="col-span-3 text-center py-16 text-slate-400">
              <div className="text-3xl mb-2">📦</div>
              <div className="text-sm">No items found</div>
              <button onClick={openAdd} className="btn btn-primary text-xs mt-3">+ Add First Item</button>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">IoT Sensor Network</h3>
        <div className="grid grid-cols-4 text-center gap-4">
          {[{v:'156',l:'Active Sensors',c:'text-blue-600'},{v:'98.5%',l:'Uptime',c:'text-green-600'},{v:'2.4s',l:'Avg Response',c:'text-purple-600'},{v:'12K',l:'Updates/min',c:'text-orange-500'}].map(s => (
            <div key={s.l}><div className={`text-2xl font-semibold ${s.c}`}>{s.v}</div><div className="text-xs text-slate-500 dark:text-slate-400">{s.l}</div></div>
          ))}
        </div>
      </div>

      <Modal open={modal!==null} onClose={() => setModal(null)} title={modal==='edit'?'Edit Item':'Add New Item'}>
        <div className="space-y-3">
          {[
            {k:'name',l:'Item Name *',p:'e.g. Fresh Tomatoes'},
            {k:'rfid',l:'RFID Tag *',p:'RFID-G001'},
            {k:'zone',l:'Zone',p:'A'},
            {k:'shelf',l:'Shelf',p:'1'},
            {k:'quantity',l:'Quantity',p:'100',t:'number'},
            {k:'unitPrice',l:'Unit Price ($)',p:'5',t:'number'},
            {k:'fillLevel',l:'Fill Level (%)',p:'80',t:'number'},
          ].map(f => (
            <div key={f.k}>
              <label className="label">{f.l}</label>
              <input className="input text-xs" type={f.t||'text'} placeholder={f.p}
                value={(form as any)[f.k]} onChange={e => setForm(p => ({...p,[f.k]:e.target.value}))} />
            </div>
          ))}
          <div>
            <label className="label">Category</label>
            <select className="input text-xs" value={form.category} onChange={e => setForm(p => ({...p,category:e.target.value}))}>
              {CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          {modal==='edit' && <button onClick={handleDelete} disabled={deleting} className="btn btn-danger text-xs flex-1 disabled:opacity-60">{deleting?'Deleting…':'Delete'}</button>}
          <button onClick={() => setModal(null)} className="btn btn-secondary text-xs flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary text-xs flex-1 disabled:opacity-60">{saving?'Saving…':'Save'}</button>
        </div>
      </Modal>
    </div>
  )
}
