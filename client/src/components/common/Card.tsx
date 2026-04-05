import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
}

export const Card = ({ children, className, hover }: CardProps) => {
  return (
    <div
      className={clsx(
        'rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900',
        hover && 'transition-all hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700',
        className
      )}
    >
      {children}
    </div>
  )
}
