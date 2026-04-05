import { useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/app.store'
import { initSocket, closeSocket, onSocketEvent, getSocket } from '@/services/socket'

export const useSocket = (token: string | null) => {
  const { setSocketConnected } = useAppStore()

  useEffect(() => {
    if (!token) return

    const socket = initSocket(token)

    const unsubscribeConnect = onSocketEvent('connect', () => {
      setSocketConnected(true)
    })

    const unsubscribeDisconnect = onSocketEvent('disconnect', () => {
      setSocketConnected(false)
    })

    return () => {
      if (unsubscribeConnect) unsubscribeConnect()
      if (unsubscribeDisconnect) unsubscribeDisconnect()
    }
  }, [token, setSocketConnected])

  const on = useCallback(
    <K extends string>(event: K, callback: (data: any) => void) => {
      return onSocketEvent(event as any, callback)
    },
    []
  )

  const emit = useCallback((event: string, data?: any) => {
    const socket = getSocket()
    if (socket) {
      socket.emit(event, data)
    }
  }, [])

  const socket = getSocket()
  const connected = socket?.connected ?? false

  return { connected, on, emit, socket }
}
