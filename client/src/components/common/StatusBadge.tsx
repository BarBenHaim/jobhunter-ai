import { AppStatus } from '@/types'
import { Badge } from './Badge'

interface StatusBadgeProps {
  status: AppStatus
}

const statusConfig: Record<AppStatus, { label: string; variant: 'primary' | 'success' | 'warning' | 'error' | 'gray' }> = {
  [AppStatus.DRAFT]: { label: 'Draft', variant: 'gray' },
  [AppStatus.SUBMITTED]: { label: 'Submitted', variant: 'primary' },
  [AppStatus.ACCEPTED]: { label: 'Accepted', variant: 'success' },
  [AppStatus.REJECTED]: { label: 'Rejected', variant: 'error' },
  [AppStatus.IN_PROGRESS]: { label: 'In Progress', variant: 'warning' },
  [AppStatus.INTERVIEW]: { label: 'Interview', variant: 'primary' },
  [AppStatus.OFFER]: { label: 'Offer', variant: 'success' },
  [AppStatus.WITHDRAWN]: { label: 'Withdrawn', variant: 'gray' },
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
