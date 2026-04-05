import { io, Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

let socket: Socket | null = null

export interface SocketEvents {
  'job:new': (job: any) => void
  'job:scraped': (count: number) => void
  'application:submitted': (application: any) => void
  'application:status': (data: { applicationId: string; status: string }) => void
  'review:pending': (data: { count: number }) => void
  'scraper:error': (data: { source: string; error: string }) => void
  'system:health': (health: any) => void
  'connect': () => void
  'disconnect': () => void
  'error': (error: any) => void
}

export const initSocket = (token: string): Socket => {
  if (socket?.connected) {
    return socket
  }

  socket = io(SOCKET_URL, {
    auth: {
      token,
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  })

  socket.on('connect', () => {
    console.log('Socket connected')
  })

  socket.on('disconnect', () => {
    console.log('Socket disconnected')
  })

  socket.on('error', (error) => {
    console.error('Socket error:', error)
  })

  return socket
}

export const getSocket = (): Socket | null => {
  return socket
}

export const closeSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export const onSocketEvent = <K extends keyof SocketEvents>(
  event: K,
  callback: SocketEvents[K]
) => {
  if (!socket) return

  socket.on(event as string, callback as any)

  return () => {
    socket?.off(event as string, callback as any)
  }
}

export const emitSocketEvent = <K extends keyof SocketEvents>(
  event: K,
  data?: any
) => {
  if (!socket) return

  socket.emit(event as string, data)
}
