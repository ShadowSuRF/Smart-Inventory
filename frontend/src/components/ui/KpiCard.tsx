interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  subColor?: string
  icon?: string
  iconColor?: string
}

export default function KpiCard({ label, value, sub, subColor = 'text-slate-400', icon, iconColor }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
        {icon && <span className={`text-base ${iconColor || ''}`}>{icon}</span>}
      </div>
      <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      {sub && <div className={`text-xs ${subColor}`}>{sub}</div>}
    </div>
  )
}
