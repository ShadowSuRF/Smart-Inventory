/**
 * AppLogo — ikon "kotak inventori + daun hijau" yang merepresentasikan
 * Smart Inventory & Waste Reducer. Kotak ikut warna aksen user (CSS var --ac),
 * daun hijau selalu #0EA572 (brand sustainability) supaya tetap khas di semua tema.
 */

interface AppLogoProps {
  size?: number
  className?: string
}

export default function AppLogo({ size = 24, className = '' }: AppLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Smart Inventory & Waste Reducer"
    >
      {/* Kotak/peti — warna ikut --ac (brand accent user) */}
      <rect x="3" y="6" width="26" height="22" rx="5" fill="var(--ac)" />

      {/* Garis tengah horizontal (tutup atas peti) */}
      <path
        d="M3 13 L16 17.5 L29 13"
        stroke="white"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* Garis tengah vertikal (sekat dalam) */}
      <path
        d="M16 17.5 L16 28"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* Daun hijau badge — sudut kanan atas, identitas "waste reducer" */}
      <circle cx="25.5" cy="7.5" r="7" fill="#0EA572" stroke="var(--ac)" strokeWidth="1.8" />
      {/* Helai daun */}
      <path
        d="M22 11C21.4 7.8 23.3 5 27.3 4.8C27.6 8.3 25.4 10.8 22 11Z"
        fill="white"
      />
      {/* Tulang daun */}
      <path
        d="M22.4 10.5C23.7 8.3 25.2 6.8 27.1 5.6"
        stroke="#0EA572"
        strokeWidth="0.55"
        strokeLinecap="round"
      />
    </svg>
  )
}
