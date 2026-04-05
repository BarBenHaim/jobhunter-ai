import { useCallback } from 'react'
import { useAppStore } from '@/stores/app.store'

export const useToast = () => {
  const { addToast, removeToast } = useAppStore()

  const toast = useCallback(
    (
      message: string,
      type: 'success' | 'error' | 'info' | 'warning' = 'info',
      duration: number = 3000
    ) => {
      addToast({
        message,
        type,
        duration,
      })
    },
    [addToast]
  )

  const success = useCallback((message: string) => toast(message, 'success'), [toast])
  const error = useCallback((message: string) => toast(message, 'error', 5000), [toast])
  const info = useCallback((message: string) => toast(message, 'info'), [toast])
  const warning = useCallback((message: string) => toast(message, 'warning', 4000), [toast])

  return { toast, success, error, info, warning, remove: removeToast }
}
