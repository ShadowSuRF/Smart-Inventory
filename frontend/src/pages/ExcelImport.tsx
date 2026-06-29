import { useRef, useState, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { importInventoryExcel } from '../lib/api'
import api from '../lib/api'
import toast from 'react-hot-toast'

const FIELD_MAP = [
  { from:'Product_Name', to:'Item Name' }, { from:'SKU_Code / RFID_Tag', to:'RFID / SKU' },
  { from:'Quantity',     to:'Stock Level' }, { from:'Zone / Location_ID', to:'Zone Location' },
  { from:'Expiry_Date',  to:'Expiration Date' }, { from:'Unit_Price', to:'Item Value' },
  { from:'Category',     to:'Category' }, { from:'Supplier_Code', to:'Supplier ID' },
  { from:'Fill_Level_Pct', to:'Fill Level %' }, { from:'Cost_Price', to:'Cost Price' },
]

interface ImportLog {
  _id?: string
  filename: string
  createdAt?: string
  imported: number
  skipped: number
  total: number
  status: 'success' | 'error'
}

export default function ExcelImport() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress]   = useState(0)
  const [importing, setImporting] = useState(false)
  const [result, setResult]       = useState<{ imported:number; skipped:number; errors?:string[] } | null>(null)
  const [logs, setLogs]           = useState<ImportLog[]>([])
  const [dragging, setDragging]   = useState(false)
  const [totalRecords, setTotalRecords] = useState(0)

  // Ambil import logs dari MongoDB saat mount
  const fetchLogs = useCallback(async () => {
    try {
      const res = await api.get('/inventory/import/logs')
      const data: ImportLog[] = res.data.data || []
      setLogs(data)
      setTotalRecords(data.filter(l => l.status==='success').reduce((s, l) => s + l.imported, 0))
    } catch {}
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('Upload file Excel (.xlsx, .xls) atau CSV')
      return
    }
    setImporting(true)
    setProgress(0)
    setResult(null)

    // Progress simulasi
    const interval = setInterval(() => {
      setProgress(prev => prev >= 85 ? prev : prev + 10)
    }, 180)

    try {
      // Parse lokal dulu untuk preview row count
      const reader = new FileReader()
      reader.onload = async (ev) => {
        try {
          const wb    = XLSX.read(ev.target?.result, { type: 'binary' })
          const ws    = wb.Sheets[wb.SheetNames[0]]
          const rows  = XLSX.utils.sheet_to_json(ws)
          const total = rows.length

          // Kirim ke backend → simpan ke MongoDB
          const fd = new FormData()
          fd.append('file', file)

          let imported = 0, skipped = 0, errors: string[] = []
          try {
            const res = await importInventoryExcel(fd)
            imported  = res.data.data?.imported || total
            skipped   = res.data.data?.skipped  || 0
            errors    = res.data.data?.errors   || []
          } catch (apiErr: any) {
            // API error — gunakan data lokal sebagai fallback info
            skipped  = total
            errors   = [apiErr.response?.data?.error || 'Upload ke server gagal']
          }

          clearInterval(interval)
          setProgress(100)
          setTimeout(() => {
            setImporting(false)
            setProgress(0)
            setResult({ imported, skipped, errors })
            // Refresh logs dari MongoDB
            fetchLogs()
            if (imported > 0) toast.success(`${imported.toLocaleString()} item berhasil disimpan ke MongoDB!`)
            else toast.error('Tidak ada data yang berhasil diimport')
          }, 400)
        } catch (parseErr) {
          clearInterval(interval)
          setImporting(false)
          toast.error('Gagal membaca file — pastikan format Excel/CSV benar')
        }
      }
      reader.readAsBinaryString(file)
    } catch {
      clearInterval(interval)
      setImporting(false)
      toast.error('Gagal memproses file')
    }
  }, [fetchLogs])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const exportLog = () => {
    const text = logs.map(l =>
      `${new Date(l.createdAt||'').toLocaleString('id-ID')} | ${l.status.toUpperCase()} | ${l.filename} | ${l.imported} imported, ${l.skipped} skipped`
    ).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type:'text/plain' }))
    a.download = 'import-log.txt'
    a.click()
    toast.success('Log diekspor!')
  }

  const successRate = logs.length
    ? Math.round(logs.filter(l=>l.status==='success').length / logs.length * 100)
    : 100

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Excel Data Import</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Upload Excel / CSV → data langsung tersimpan ke MongoDB akun kamu</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Imported</div>
          <div className="text-2xl font-semibold text-blue-600">{totalRecords.toLocaleString()}</div>
          <div className="text-xs text-slate-400">Item tersimpan di akunmu</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Import</div>
          <div className="text-2xl font-semibold text-green-600">{logs.length}</div>
          <div className="text-xs text-slate-400">Sesi import</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-slate-500 dark:text-slate-400">Success Rate</div>
          <div className="text-2xl font-semibold text-purple-600">{successRate}%</div>
          <div className="text-xs text-slate-400">Import berhasil</div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !importing && fileRef.current?.click()}
        className={`rounded-xl p-8 text-center cursor-pointer mb-5 transition-all border-2 border-dashed ${importing ? 'pointer-events-none opacity-80' : ''}`}
        style={{ backgroundColor: dragging ? 'var(--acd)' : 'var(--ac)', borderColor: 'var(--ac)' }}
      >
        <div className="text-4xl mb-3">{importing ? '⏳' : dragging ? '📂' : '📤'}</div>
        <div className="text-white font-semibold mb-1">{dragging ? 'Drop file di sini!' : 'Upload Excel / CSV'}</div>
        <div className="text-blue-200 text-xs mb-4">.xlsx · .xls · .csv — maks 10 MB</div>
        <div className="flex gap-3 justify-center" onClick={e => e.stopPropagation()}>
          <button disabled={importing} onClick={() => fileRef.current?.click()}
            className="bg-white text-blue-600 text-xs font-medium px-4 py-2 rounded-lg disabled:opacity-60 hover:bg-blue-50">
            Pilih File
          </button>
        </div>
        <div className="text-blue-200 text-xs mt-3">✅ Data langsung masuk MongoDB akun kamu</div>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />

      {/* Progress */}
      {importing && (
        <div className="card mb-4">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">📥 Mengimport ke MongoDB…</div>
          <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300" style={{ width:`${progress}%`, backgroundColor:'var(--ac)' }} />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{progress}% — memproses baris…</div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`card mb-4 ${result.imported > 0 ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'}`}>
          <h3 className={`text-sm font-semibold mb-2 ${result.imported > 0 ? 'text-green-800 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
            {result.imported > 0 ? '✅ Import Selesai' : '⚠️ Import Gagal'}
          </h3>
          <div className="text-xs space-y-1 text-green-700 dark:text-green-400">
            {result.imported > 0 && <div>✓ {result.imported.toLocaleString()} item berhasil disimpan ke MongoDB</div>}
            {result.skipped > 0  && <div className="text-amber-700 dark:text-amber-400">⚠ {result.skipped} baris dilewati (duplikat RFID atau field tidak valid)</div>}
            {result.imported > 0 && <div>✓ Data sudah muncul di halaman Inventory Tracking</div>}
            {result.errors?.map((e, i) => <div key={i} className="text-red-600 dark:text-red-400">✗ {e}</div>)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Field mapping */}
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Field Mapping</h3>
            <span className="text-xs text-slate-400">Auto-detect</span>
          </div>
          <div className="space-y-1.5">
            {FIELD_MAP.map(f => (
              <div key={f.from} className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-700 px-2 py-1.5 rounded-lg">
                <code className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 font-mono text-xs">{f.from}</code>
                <span className="text-slate-400">→</span>
                <span className="flex-1 font-medium text-slate-700 dark:text-slate-200">{f.to}</span>
                <span className="text-green-500 text-sm">✓</span>
              </div>
            ))}
          </div>
        </div>

        {/* Import logs (dari MongoDB) */}
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Riwayat Import</h3>
            <div className="flex gap-2">
              <button onClick={fetchLogs} className="btn btn-secondary text-xs py-1">🔄</button>
              {logs.length > 0 && <button onClick={exportLog} className="btn btn-secondary text-xs py-1">📥 Export</button>}
            </div>
          </div>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              <div className="text-2xl mb-2">📂</div>
              Belum ada riwayat import
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {logs.slice(0,8).map((l, i) => (
                <div key={l._id || i} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate max-w-36">{l.filename}</div>
                    <div className="text-xs text-slate-400">{l.createdAt ? new Date(l.createdAt).toLocaleString('id-ID') : ''}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`badge text-xs ${l.status==='success'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>
                      {l.imported.toLocaleString()}
                    </span>
                    {l.skipped > 0 && <span className="badge text-xs bg-amber-100 text-amber-700">{l.skipped} skip</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
