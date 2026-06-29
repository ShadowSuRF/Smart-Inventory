interface FillBarProps {
  value: number   // 0–100
  showLabel?: boolean
}

const fillColor = (v: number) =>
  v >= 60 ? 'bg-green-500' : v >= 30 ? 'bg-amber-500' : 'bg-red-500'

export default function FillBar({ value, showLabel = true }: FillBarProps) {
  return (
    <div>
      {showLabel && (
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400">Fill Level</span>
          <span className={`font-medium ${value < 30 ? 'text-red-500' : value < 60 ? 'text-amber-500' : 'text-green-600'}`}>
            {value}%
          </span>
        </div>
      )}
      <div className="h-1.5 bg-slate-100 dark:bg-slate-600 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${fillColor(value)}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
}
