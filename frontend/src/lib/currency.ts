/**
 * Rupiah formatter — semua tampilan harga di app pakai ini
 * Contoh: fmtRp(15000) → "Rp 15.000"
 *         fmtRp(1500000) → "Rp 1,5M"
 *         fmtRp(150000) → "Rp 150K"
 */
export function fmtRp(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '—'
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)}M`   // miliar
  if (abs >= 1_000_000)     return `${sign}Rp ${(abs / 1_000_000).toFixed(1)}Jt`       // juta
  if (abs >= 100_000)       return `${sign}Rp ${(abs / 1_000).toFixed(0)}K`            // ratus ribu
  if (abs >= 1_000)         return `${sign}Rp ${abs.toLocaleString('id-ID')}`           // ribuan dengan titik
  return `${sign}Rp ${abs.toFixed(0)}`
}

/** Format full tanpa singkatan — untuk tabel detail */
export function fmtRpFull(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '—'
  return `Rp ${Math.abs(val).toLocaleString('id-ID')}`
}

/** Format harga per unit (unitPrice) */
export function fmtRpUnit(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '—'
  return `Rp ${val.toLocaleString('id-ID')}`
}
