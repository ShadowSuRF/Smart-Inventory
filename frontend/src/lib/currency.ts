/**
 * Rupiah formatter — format penuh Indonesia dengan titik sebagai pemisah ribuan
 * Contoh: fmtRp(15000)    → "Rp 15.000"
 *         fmtRp(150000)   → "Rp 150.000"
 *         fmtRp(1500000)  → "Rp 1.500.000"
 *         fmtRp(15000000) → "Rp 15.000.000"
 */
export function fmtRp(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '—'
  const sign = val < 0 ? '-' : ''
  return `${sign}Rp ${Math.abs(val).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
}

/** Sama dengan fmtRp — alias untuk backward compat */
export const fmtRpFull = fmtRp

/** Format harga per unit — identik dengan fmtRp */
export const fmtRpUnit = fmtRp
