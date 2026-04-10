import { create } from 'zustand'
import { UserProfile } from '@/types'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  duration?: number
}

const ACTIVE_PERSONA_KEY = 'activePersonaId'
const TARGET_ROLES_KEY_PREFIX = 'targetRoles:'

const readActivePersona = (): string | null => {
  try { return localStorage.getItem(ACTIVE_PERSONA_KEY) } catch { return null }
}

export interface AppStore {
  // User state
  user: UserProfile | null
  setUser: (user: UserProfile | null) => void

  // Active persona (profile scope) — used by backend job queries so
  // jobs are isolated per-persona. A brand-new persona has zero jobs.
  activePersonaId: string | null
  setActivePersonaId: (id: string | null) => void

  // Per-persona target roles (user's chosen CV role list)
  getTargetRoles: (personaId: string) => string[] | null
  setTargetRoles: (personaId: string, roles: string[]) => void

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

  activePersonaId: readActivePersona(),
  setActivePersonaId: (id) => {
    try {
      if (id) localStorage.setItem(ACTIVE_PERSONA_KEY, id)
      else localStorage.removeItem(ACTIVE_PERSONA_KEY)
    } catch {}
    set({ activePersonaId: id })
  },

  getTargetRoles: (personaId) => {
    try {
      const raw = localStorage.getItem(TARGET_ROLES_KEY_PREFIX + personaId)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : null
    } catch { return null }
  },
  setTargetRoles: (personaId, roles) => {
    try {
      localStorage.setItem(TARGET_ROLES_KEY_PREFIX + personaId, JSON.stringify(roles))
    } catch {}
  },

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
