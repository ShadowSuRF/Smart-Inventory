import { useEffect, useState } from 'react'
import AppLogo from './AppLogo'

interface PageLoaderProps {
  text?: string
  fullscreen?: boolean
}

export default function PageLoader({ text = 'Memuat…', fullscreen = false }: PageLoaderProps) {
  const [dots, setDots] = useState('.')
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 400)
    return () => clearInterval(t)
  }, [])

  if (fullscreen) return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white dark:bg-slate-950">
      <div className="animate-fade-in-scale">
        <div className="relative mb-6 flex items-center justify-center">
          {/* Outer pulse ring */}
          <span className="absolute w-16 h-16 rounded-full opacity-30"
            style={{ backgroundColor:'var(--ac)', animation:'pulse-ring 1.5s ease-out infinite' }} />
          {/* Spinner */}
          <div className="w-12 h-12 rounded-full border-4 border-slate-100 dark:border-slate-800"
            style={{ borderTopColor:'var(--ac)', animation:'spin 0.9s linear infinite' }} />
          {/* Logo center */}
          <span className="absolute"><AppLogo size={22} /></span>
        </div>
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Smart Inventory</div>
          <div className="text-xs text-slate-400 mt-1">{text}{dots}</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
      <div className="relative mb-4">
        <div className="w-10 h-10 rounded-full border-4 border-slate-100 dark:border-slate-800"
          style={{ borderTopColor:'var(--ac)', animation:'spin 0.9s linear infinite' }} />
      </div>
      <div className="text-sm text-slate-400">{text}{dots}</div>
    </div>
  )
}

// Skeleton card — untuk loading state per-card
export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card animate-fade-in">
      <div className="skeleton h-4 w-32 mb-3" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton mb-2" style={{ height:'12px', width:`${65 + i*10}%`, animationDelay:`${i*80}ms` }} />
      ))}
    </div>
  )
}

// Skeleton KPI row
export function SkeletonKPI({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-${count} gap-4`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="kpi-card animate-fade-in" style={{ animationDelay:`${i*60}ms` }}>
          <div className="skeleton h-3 w-20 mb-2" />
          <div className="skeleton h-7 w-16 mb-1" />
          <div className="skeleton h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

// Spinner inline kecil
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-block rounded-full border-2 border-slate-200 dark:border-slate-600 ${className}`}
      style={{ width:size, height:size, borderTopColor:'var(--ac)', animation:'spin 0.8s linear infinite', flexShrink:0 }} />
  )
}
