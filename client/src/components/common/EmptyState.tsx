import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export const EmptyState = ({ icon: Icon, title, description, action }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
        <Icon size={40} className="text-gray-400 dark:text-gray-500" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
