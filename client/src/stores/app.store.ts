import { create } from 'zustand'
import { UserProfile } from '@/types'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  duration?: number
}

export interface AppStore {
  // User state
  user: UserProfile | null
  setUser: (user: UserProfile | null) => void

  // Notifications
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void

  // Socket state
  socketConnected: boolean
  setSocketConnected: (connected: boolean) => void

  // UI state
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void

  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void

  // Theme
  theme: 'light' | 'dark' | 'auto'
  setTheme: (theme: 'light' | 'dark' | 'auto') => void

  // System health
  systemHealthy: boolean
  setSystemHealthy: (healthy: boolean) => void
}

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          ...toast,
          id: Math.random().toString(36).slice(2),
        },
      ],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  socketConnected: false,
  setSocketConnected: (connected) => set({ socketConnected: connected }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  theme: 'auto',
  setTheme: (theme) => {
    set({ theme })
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark')
    }
  },

  systemHealthy: true,
  setSystemHealthy: (healthy) => set({ systemHealthy: healthy }),
}))
