import apiClient from './api'

export interface AuthUser {
  id: string
  email: string
  fullName: string
  phone: string | null
  location: string | null
  linkedinUrl: string | null
  githubUrl: string | null
  portfolioUrl: string | null
  emailVerified: boolean
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

export interface AuthResponse {
  success: boolean
  token: string // legacy alias for accessToken
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export const authApi = {
  register: async (email: string, password: string, fullName: string): Promise<AuthResponse> => {
    const { data } = await apiClient.post('/auth/register', { email, password, fullName })
    return data
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const { data } = await apiClient.post('/auth/login', { email, password })
    return data
  },

  me: async (): Promise<AuthUser> => {
    const { data } = await apiClient.get('/auth/me')
    return data.user
  },

  refresh: async (refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> => {
    const { data } = await apiClient.post('/auth/refresh', { refreshToken })
    return { accessToken: data.accessToken, refreshToken: data.refreshToken }
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // ignore - still clear local state
    }
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await apiClient.patch('/auth/password', { currentPassword, newPassword })
  },

  forgotPassword: async (email: string): Promise<{ success: boolean; message: string; devToken?: string }> => {
    const { data } = await apiClient.post('/auth/forgot-password', { email })
    return data
  },

  resetPassword: async (email: string, token: string, newPassword: string): Promise<void> => {
    await apiClient.post('/auth/reset-password', { email, token, newPassword })
  },

  verifyEmail: async (email: string, token: string): Promise<void> => {
    await apiClient.post('/auth/verify-email', { email, token })
  },

  resendVerification: async (): Promise<void> => {
    await apiClient.post('/auth/resend-verification')
  },

  deleteAccount: async (password: string): Promise<void> => {
    await apiClient.delete('/auth/account', { data: { password } })
  },
}
