import { clsx } from 'clsx'

interface BadgeProps {
  variant: 'primary' | 'success' | 'warning' | 'error' | 'gray'
  children: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
}

export const Badge = ({ variant, children, size = 'md', className }: BadgeProps) => {
  const variants = {
    primary: 'bg-primary-100/80 text-primary-700 ring-1 ring-primary-200/50 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-700/30',
    success: 'bg-success-100/80 text-success-700 ring-1 ring-success-200/50 dark:bg-success-900/30 dark:text-success-300 dark:ring-success-700/30',
    warning: 'bg-warning-100/80 text-warning-700 ring-1 ring-warning-200/50 dark:bg-warning-900/30 dark:text-warning-300 dark:ring-warning-700/30',
    error: 'bg-error-100/80 text-error-700 ring-1 ring-error-200/50 dark:bg-error-900/30 dark:text-error-300 dark:ring-error-700/30',
    gray: 'bg-gray-100/80 text-gray-700 ring-1 ring-gray-200/50 dark:bg-gray-800/50 dark:text-gray-300 dark:ring-gray-700/30',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs font-semibold rounded-lg',
    md: 'px-2.5 py-1 text-sm font-semibold rounded-xl',
  }

  return (
    <span className={clsx(variants[variant], sizes[size], 'inline-flex items-center', className)}>
      {children}
    </span>
  )
}
