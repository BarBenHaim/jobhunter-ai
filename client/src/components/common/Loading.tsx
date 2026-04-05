import { Loader2 } from 'lucide-react'

interface LoadingProps {
  message?: string
}

export const Loading = ({ message = 'Loading...' }: LoadingProps) => {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Loader2 className="animate-spin text-primary-500" size={32} />
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  )
}

export const Skeleton = ({ className = '' }: { className?: string }) => {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-800 rounded ${className}`} />
}

export const SkeletonCard = () => {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-3 w-full mb-2" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  )
}
