import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    // Kunci scroll body selama modal kebuka biar gak "double scroll"
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', fn)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

  // createPortal → render langsung ke document.body, lepas dari hierarki halaman.
  // Sebelumnya Modal ini nested di dalam <div className="page-enter"> (App.tsx),
  // yang punya CSS animation transform (fill-mode "both" bikin transform-nya
  // nempel terus walau animasi udah selesai). Itu bikin `.page-enter` jadi
  // containing block baru, jadi `position:fixed` di sini ke-trap di dalam box
  // halaman, bukan ke viewport — makanya lokasinya suka geser/kepotong/gak center.
  // Portal ke document.body menghindari masalah ini sepenuhnya.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`card w-full ${widths[size]} mx-4 max-h-[88vh] overflow-y-auto shadow-2xl`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none">×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
