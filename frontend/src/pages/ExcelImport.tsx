import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { importInventoryFile, getImportLogs } from '../lib/api'
import { Spinner } from '../components/ui/PageLoader'
import toast from 'react-hot-toast'

interface ImportLog { _id:string; filename:string; imported:number; skipped:number; total:number; status:string; createdAt:string }

export default function ExcelImport() {
  const navigate = useNavigate()
  const [logs, setLogs]       = useState<ImportLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [uploading, setUploading]     = useState(false)
  const [progress, setProgress]       = useState(0)
  const [drag, setDrag]               = useState(false)
  const [result, setResult]           = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res = await getImportLogs()
      setLogs(res.data.data || [])
    } catch {}
    finally { setLogsLoading(false) }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleFile = async (file: File) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['csv','xlsx','xls'].includes(ext||'')) {
      toast.error('Format tidak didukung — gunakan CSV, XLSX, atau XLS'); return
    }
    setUploading(true)
    setResult(null)
    setProgress(0)
    // Fake progress animation
    const interval = setInterval(() => setProgress(p => Math.min(p+8, 85)), 120)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await importInventoryFile(fd)
      clearInterval(interval)
      setProgress(100)
      setResult(res.data.data)
      toast.success(`✅ Import selesai! ${res.data.data.imported} item tersimpan.`)
      setTimeout(() => { setProgress(0); fetchLogs() }, 800)
    } catch(e:any) {
      clearInterval(interval)
      setProgress(0)
      toast.error(e.response?.data?.error || 'Upload gagal')
    } finally { setUploading(false) }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-5 animate-fade-in">
        <div>
          <h2 className="text-lg font-semibold">Excel / CSV Import</h2>
          <p className="text-xs text-slate-400 mt-0.5">Upload inventory kamu — deduplikasi otomatis per SKU</p>
        </div>
        <button onClick={fetchLogs} className="btn btn-secondary text-xs">🔄 Refresh Logs</button>
      </div>

      {/* Upload zone */}
      <div className="card animate-fade-in-up delay-100 mb-5"
        onDragOver={e=>{e.preventDefault();setDrag(true)}}
        onDragLeave={()=>setDrag(false)}
        onDrop={onDrop}>
        <div className={`border-2 border-dashed rounded-xl transition-all duration-200 p-10 text-center cursor-pointer
          ${drag?'border-blue-400 bg-blue-50 dark:bg-blue-900/20':'border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
          onClick={()=>fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e=>e.target.files?.[0]&&handleFile(e.target.files[0])}/>
          {uploading ? (
            <div className="animate-fade-in-scale">
              <Spinner size={32} className="mx-auto mb-4"/>
              <div className="text-sm font-medium mb-3">Mengupload & memproses file…</div>
              <div className="w-full max-w-xs mx-auto bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width:`${progress}%` }}/>
              </div>
              <div className="text-xs text-slate-400 mt-1">{progress}%</div>
            </div>
          ) : (
            <div className="animate-fade-in">
              <div className="text-4xl mb-3 animate-float">📤</div>
              <div className="font-semibold text-sm text-slate-700 dark:text-slate-300 mb-1">
                {drag ? 'Lepaskan file di sini!' : 'Drop file atau klik untuk upload'}
              </div>
              <div className="text-xs text-slate-400">Mendukung: CSV, XLSX, XLS · Max 20MB</div>
              <div className="text-xs text-slate-400 mt-1">Duplikat SKU otomatis digabung (last-write-wins)</div>
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 animate-fade-in-scale">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-500 text-lg">✅</span>
              <span className="font-semibold text-sm text-green-800 dark:text-green-300">Import Berhasil!</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              {[
                { label:'Total Baris', val:result.total, color:'text-slate-700 dark:text-slate-300' },
                { label:'Tersimpan', val:result.imported, color:'text-green-600' },
                { label:'Dilewati', val:result.skipped, color:'text-amber-600' },
              ].map(s=>(
                <div key={s.label} className="bg-white dark:bg-slate-800 rounded-lg p-2">
                  <div className={`text-xl font-bold ${s.color}`}>{s.val.toLocaleString()}</div>
                  <div className="text-xs text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>
            {result.errors?.length > 0 && (
              <div className="mb-3 text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
                {result.errors.slice(0,3).map((e:string,i:number)=><div key={i}>⚠ {e}</div>)}
              </div>
            )}
            {/* Quick navigation setelah import — langsung ke menu yang relevan */}
            <div className="border-t border-green-200 dark:border-green-800 pt-3 mt-1">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Lihat data yang baru diimport:</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => navigate('/inventory')}
                  className="btn btn-primary text-xs py-1">
                  📦 Lihat Inventory
                </button>
                <button onClick={() => navigate('/profit')}
                  className="btn btn-secondary text-xs py-1">
                  💰 Lihat Profit & Loss
                </button>
                <button onClick={() => navigate('/forecasting')}
                  className="btn btn-secondary text-xs py-1">
                  🧠 Lihat AI Forecasting
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Column mapping guide */}
      <div className="card animate-fade-in-up delay-200 mb-5">
        <h3 className="text-sm font-semibold mb-3">📋 Format Kolom yang Didukung</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { field:'SKU / RFID', cols:'SKU_Code · RFID_Tag · rfid · SKU', req:true },
            { field:'Nama Produk', cols:'Product_Name · name · Name', req:true },
            { field:'Kategori', cols:'Category · category', req:false },
            { field:'Quantity', cols:'Stock_Level · Quantity · Units_Sold', req:false },
            { field:'Harga', cols:'Unit_Price · price · Price', req:false },
            { field:'Expiry Date', cols:'Expiry_Date · expiry_date · ExpiryDate', req:false },
          ].map(c=>(
            <div key={c.field} className="flex gap-2 text-xs">
              <span className={`badge flex-shrink-0 ${c.req?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500'}`}>
                {c.field}
              </span>
              <span className="text-slate-400">{c.cols}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Import Logs */}
      <div className="card animate-fade-in-up delay-300">
        <h3 className="text-sm font-semibold mb-3">Riwayat Import</h3>
        {logsLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_,i)=>(
              <div key={i} className="skeleton h-10 w-full animate-fade-in" style={{animationDelay:`${i*60}ms`}}/>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">Belum ada riwayat import</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log,i)=>(
              <div key={log._id}
                className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-xs animate-fade-in"
                style={{animationDelay:`${i*40}ms`}}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${log.status==='success'?'bg-green-500':'bg-red-500'}`}/>
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[180px]">{log.filename}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                  <span className="text-green-600">✓ {log.imported}</span>
                  <span className="text-amber-500">⊘ {log.skipped}</span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span>{new Date(log.createdAt).toLocaleDateString('id-ID')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
