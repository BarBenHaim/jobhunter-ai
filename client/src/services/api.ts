import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const ACCESS_KEY = 'token'
const REFRESH_KEY = 'refreshToken'

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─────────────────────────────────────────────────────────────
// Token management
// ─────────────────────────────────────────────────────────────
let accessToken: string | null = localStorage.getItem(ACCESS_KEY)
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY)

export const setAuthToken = (newToken: string, newRefreshToken?: string) => {
  accessToken = newToken
  localStorage.setItem(ACCESS_KEY, newToken)
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${newToken}`

  if (newRefreshToken) {
    refreshToken = newRefreshToken
    localStorage.setItem(REFRESH_KEY, newRefreshToken)
  }
}

export const clearAuthToken = () => {
  accessToken = null
  refreshToken = null
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  delete apiClient.defaults.headers.common['Authorization']
}

export const getAccessToken = () => accessToken
export const getRefreshToken = () => refreshToken
export const isAuthenticated = () => !!accessToken

// ─────────────────────────────────────────────────────────────
// Request interceptor: attach access token
// ─────────────────────────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ─────────────────────────────────────────────────────────────
// Response interceptor: automatic refresh on 401
// ─────────────────────────────────────────────────────────────
let isRefreshing = false
let pendingRequests: Array<(token: string | null) => void> = []

const flushQueue = (token: string | null) => {
  pendingRequests.forEach((cb) => cb(token))
  pendingRequests = []
}

const redirectToLogin = () => {
  clearAuthToken()
  if (!window.location.pathname.startsWith('/auth')) {
    window.location.href = '/auth/login'
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Not an auth failure — pass through
    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error)
    }

    // Don't try to refresh on auth endpoints (avoids infinite loops).
    const url = originalRequest.url || ''
    if (url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')) {
      return Promise.reject(error)
    }

    if (!refreshToken) {
      redirectToLogin()
      return Promise.reject(error)
    }

    if (isRefreshing) {
      // Wait for the in-flight refresh to complete.
      return new Promise((resolve, reject) => {
        pendingRequests.push((token) => {
          if (!token) return reject(error)
          originalRequest.headers = originalRequest.headers || {}
          originalRequest.headers.Authorization = `Bearer ${token}`
          originalRequest._retry = true
          resolve(apiClient(originalRequest))
        })
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken })
      const newAccess = data.accessToken as string
      const newRefresh = data.refreshToken as string
      setAuthToken(newAccess, newRefresh)
      flushQueue(newAccess)

      originalRequest.headers = originalRequest.headers || {}
      originalRequest.headers.Authorization = `Bearer ${newAccess}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      flushQueue(null)
      redirectToLogin()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

// Initialize header if token exists in storage on page load.
if (accessToken) {
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
}

export default apiClient
