import { clsx } from 'clsx'

interface BadgeProps {
  variant: 'primary' | 'success' | 'warning' | 'error' | 'gray'
  children: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
}

export const Badge = ({ variant, children, size = 'md', className }: BadgeProps) => {
  const variants = {
    primary: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
    success: 'bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200',
    warning: 'bg-warning-100 text-warning-800 dark:bg-warning-900 dark:text-warning-200',
    error: 'bg-error-100 text-error-800 dark:bg-error-900 dark:text-error-200',
    gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  }

  const sizes = {
    sm: 'px-2 py-1 text-xs font-medium rounded',
    md: 'px-3 py-1.5 text-sm font-medium rounded-lg',
  }

  return (
    <span className={clsx(variants[variant], sizes[size], className)}>
      {children}
    </span>
  )
}
