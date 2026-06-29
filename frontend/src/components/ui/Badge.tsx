import { cn } from '../../lib/utils'
interface BadgeProps { children: React.ReactNode; className?: string }
export default function Badge({ children, className }: BadgeProps) {
  return <span className={cn('badge', className)}>{children}</span>
}
