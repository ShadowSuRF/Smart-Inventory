import { clsx, type ClassValue } from 'clsx'

export const cn = (...inputs: ClassValue[]) => clsx(inputs)

// Format Rupiah — gunakan id-ID locale supaya pakai titik sebagai pemisah ribuan
// Contoh: formatCurrency(15000) → "Rp 15.000"
export const formatCurrency = (v: number) =>
  `Rp ${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`

export const formatNumber = (v: number) => new Intl.NumberFormat('id-ID').format(v)

export const fillColor = (f: number) =>
  f >= 60 ? 'bg-green-500' : f >= 30 ? 'bg-amber-500' : 'bg-red-500'

export const statusBadge = (s: string) =>
  s === 'optimal'
    ? 'bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400'
    : s === 'low_stock'
    ? 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400'

export const priorityBadge = (p: string) =>
  p === 'high'
    ? 'bg-red-100 text-red-700 border border-red-200'
    : p === 'medium'
    ? 'bg-amber-100 text-amber-700 border border-amber-200'
    : 'bg-blue-100 text-blue-700 border border-blue-200'

export const statusColor = (s: string) =>
  s==='optimal'   ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  : s==='low_stock' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
