import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  glass?: boolean
  gradient?: boolean
}

export const Card = ({ children, className, hover, glass, gradient }: CardProps) => {
  return (
    <div
      className={clsx(
        'rounded-2xl p-5 transition-all duration-300',
        glass
          ? 'glass shadow-glass dark:shadow-glass-dark'
          : 'border border-gray-200/50 bg-white shadow-card dark:border-gray-800/50 dark:bg-gray-900/80 dark:shadow-glass-dark',
        hover && 'hover:shadow-card-hover hover:-translate-y-0.5 hover:border-gray-300/50 dark:hover:border-gray-700/50 cursor-pointer',
        gradient && 'gradient-border',
        className
      )}
    >
      {children}
    </div>
  )
}
