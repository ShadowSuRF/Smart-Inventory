import { useEffect, useState, useCallback } from 'react'
import { getInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem } from '../lib/api'
import Modal from '../components/ui/Modal'
import { Spinner } from '../components/ui/PageLoader'
import type { InventoryItem } from '../types'
import { statusColor, formatCurrency } from '../lib/utils'
import toast from 'react-hot-toast'

const CATS = ['Fresh Produce','Dairy','Beverages','Frozen','Bakery','Snacks','Prepared Foods']
const ZONES = ['A','B','C','D','E','F','G']
const EMPTY_FORM = {
  name:'', rfid:'', category:'Fresh Produce', zone:'A', shelf:'1',
  quantity:0, unitPrice:0, fillLevel:80, unit:'pcs', expiryDate:'', supplierId:'',
}

function ItemCard({ item, onEdit, onDelete, idx }:
  { item:InventoryItem; onEdit:(i:InventoryItem)=>void; onDelete:(id:string)=>void; idx:number }) {
  const fillColor = item.fillLevel >= 60 ? 'bg-green-500' : item.fillLevel >= 20 ? 'bg-amber-500' : 'bg-red-500'
  const daysLeft = item.expiryDate
    ? Math.max(0, Math.round((new Date(item.expiryDate).getTime()-Date.now())/86400000)) : null
  return (
    <div className="card card-hover animate-fade-in-scale" style={{ animationDelay:`${idx*40}ms` }}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{item.name}</div>
          <div className="text-xs text-slate-400 mt-0.5">{item.rfid} · Zone {item.zone}-{item.shelf}</div>
        </div>
        <span className={`badge text-xs ml-2 flex-shrink-0 ${statusColor(item.status)}`}>{item.status.replace('_',' ')}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center my-2">
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-1.5">
          <div className="text-xs text-slate-400">Qty</div>
          <div className="font-bold text-sm">{item.quantity}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-1.5">
          <div className="text-xs text-slate-400">Harga</div>
          <div className="font-bold text-sm">${item.unitPrice}</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-1.5">
          <div className="text-xs text-slate-400">Nilai</div>
          <div className="font-bold text-sm">{formatCurrency(item.quantity*item.unitPrice)}</div>
        </div>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-slate-400">Fill Level</span>
          <span className="font-medium">{item.fillLevel}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full ${fillColor} rounded-full transition-all duration-700`}
            style={{ width:`${item.fillLevel}%`, animationDelay:`${idx*40}ms` }}/>
        </div>
      </div>

      {daysLeft !== null && (
        <div className={`text-xs mb-2 ${daysLeft<=3?'text-red-500':daysLeft<=7?'text-amber-500':'text-slate-400'}`}>
          {daysLeft<=3?'🔴':daysLeft<=7?'🟡':'🟢'} {daysLeft} hari hingga expired
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={()=>onEdit(item)} className="btn btn-secondary flex-1 text-xs py-1">✏️ Edit</button>
        <button onClick={()=>onDelete(item._id)}
          className="btn text-xs py-1 px-2 bg-red-50 text-red-600 border-red-100 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          🗑️
        </button>
      </div>
    </div>
  )
}

export default function InventoryTracking() {
  const [items, setItems]     = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [modal, setModal]     = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem|null>(null)
  const [form, setForm]       = useState(EMPTY_FORM)
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCat, setFilterCat]       = useState('')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const p: any = {}
      if (search)       p.search   = search
      if (filterStatus) p.status   = filterStatus
      if (filterCat)    p.category = filterCat
      const res = await getInventory(p)
      setItems(res.data.data||[])
    } catch { toast.error('Gagal memuat inventory') }
    finally { setLoading(false) }
  }, [search, filterStatus, filterCat])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setModal(true) }
  const openEdit = (item: InventoryItem) => {
    setEditItem(item)
    setForm({
      name:item.name, rfid:item.rfid, category:item.category,
      zone:item.zone, shelf:item.shelf||'1', quantity:item.quantity,
      unitPrice:item.unitPrice, fillLevel:item.fillLevel, unit:item.unit||'pcs',
      expiryDate:item.expiryDate?new Date(item.expiryDate).toISOString().split('T')[0]:'',
      supplierId:item.supplierId||'',
    })
    setModal(true)
  }
  const handleDelete = async (id:string) => {
    if (!confirm('Hapus item ini?')) return
    try {
      await deleteInventoryItem(id)
      setItems(p=>p.filter(i=>i._id!==id))
      toast.success('Item dihapus!')
    } catch { toast.error('Gagal menghapus') }
  }
  const handleSave = async () => {
    if (!form.name||!form.rfid) { toast.error('Nama dan RFID wajib diisi'); return }
    setSaving(true)
    try {
      if (editItem) {
        const res = await updateInventoryItem(editItem._id, form)
        setItems(p=>p.map(i=>i._id===editItem._id?res.data.data:i))
        toast.success('Item diperbarui!')
      } else {
        const res = await createInventoryItem(form)
        setItems(p=>[res.data.data,...p])
        toast.success('Item ditambahkan!')
      }
      setModal(false)
    } catch(e:any) {
      toast.error(e.response?.data?.error||'Gagal menyimpan')
    } finally { setSaving(false) }
  }

  const field = (k:string,v:any) => setForm(p=>({...p,[k]:v}))

  return (
    <div>
      <div className="flex items-start justify-between mb-5 animate-fade-in">
        <div>
          <h2 className="text-lg font-semibold">Inventory Tracking</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {loading ? '…' : `${items.length} item`} · data milik kamu
          </p>
        </div>
        <button onClick={openAdd} className="btn btn-primary text-xs">+ Tambah Item</button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 animate-fade-in-up delay-100">
        <input className="input text-xs py-1.5 flex-1 max-w-xs"
          placeholder="🔍 Cari nama atau RFID…"
          value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="input text-xs py-1.5 w-32" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="">Semua Status</option>
          <option value="optimal">Optimal</option>
          <option value="low_stock">Low Stock</option>
          <option value="critical">Critical</option>
        </select>
        <select className="input text-xs py-1.5 w-36" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
          <option value="">Semua Kategori</option>
          {CATS.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={fetchItems} className="btn btn-secondary text-xs">
          {loading ? <Spinner size={12}/> : '🔄'}
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_,i)=>(
            <div key={i} className="card animate-fade-in" style={{animationDelay:`${i*50}ms`}}>
              <div className="skeleton h-4 w-3/4 mb-2"/>
              <div className="skeleton h-3 w-1/2 mb-3"/>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[...Array(3)].map((_,j)=><div key={j} className="skeleton h-10 rounded-lg"/>)}
              </div>
              <div className="skeleton h-1.5 w-full rounded-full mb-3"/>
              <div className="flex gap-2">
                <div className="skeleton h-7 flex-1 rounded-lg"/>
                <div className="skeleton h-7 w-10 rounded-lg"/>
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-16 animate-fade-in-scale">
          <div className="text-5xl mb-4">📦</div>
          <div className="font-medium text-slate-600 dark:text-slate-300">Belum ada item inventory</div>
          <div className="text-xs text-slate-400 mt-1 mb-4">Tambahkan item baru atau import dari Excel/CSV</div>
          <button onClick={openAdd} className="btn btn-primary text-xs mx-auto">+ Tambah Item Pertama</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {items.map((item,i)=>(
            <ItemCard key={item._id} item={item} onEdit={openEdit} onDelete={handleDelete} idx={i}/>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editItem?'Edit Item':'Tambah Item Baru'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nama Item *</label>
              <input className="input text-xs" placeholder="Fresh Tomatoes" value={form.name} onChange={e=>field('name',e.target.value)}/>
            </div>
            <div>
              <label className="label">RFID/SKU *</label>
              <input className="input text-xs" placeholder="RFID-A001" value={form.rfid} onChange={e=>field('rfid',e.target.value)}/>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Kategori</label>
              <select className="input text-xs" value={form.category} onChange={e=>field('category',e.target.value)}>
                {CATS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Zone</label>
              <select className="input text-xs" value={form.zone} onChange={e=>field('zone',e.target.value)}>
                {ZONES.map(z=><option key={z}>Zone {z}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Shelf</label>
              <input className="input text-xs" placeholder="1" value={form.shelf} onChange={e=>field('shelf',e.target.value)}/>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Quantity</label>
              <input type="number" className="input text-xs" value={form.quantity} onChange={e=>field('quantity',Number(e.target.value))}/>
            </div>
            <div>
              <label className="label">Unit Price ($)</label>
              <input type="number" step="0.01" className="input text-xs" value={form.unitPrice} onChange={e=>field('unitPrice',Number(e.target.value))}/>
            </div>
            <div>
              <label className="label">Unit</label>
              <input className="input text-xs" placeholder="pcs" value={form.unit} onChange={e=>field('unit',e.target.value)}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fill Level: {form.fillLevel}%</label>
              <input type="range" min={0} max={100} className="w-full accent-blue-500" value={form.fillLevel}
                onChange={e=>field('fillLevel',Number(e.target.value))}/>
            </div>
            <div>
              <label className="label">Expiry Date</label>
              <input type="date" className="input text-xs" value={form.expiryDate} onChange={e=>field('expiryDate',e.target.value)}/>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={()=>setModal(false)} className="btn btn-secondary flex-1 text-xs">Batal</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary flex-1 text-xs disabled:opacity-60">
              {saving ? <><Spinner size={12}/> Menyimpan…</> : editItem ? 'Simpan Perubahan' : 'Tambah Item'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
