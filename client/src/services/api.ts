import axios, { AxiosInstance, AxiosError } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// JWT Token Management
let token: string | null = localStorage.getItem('token')

export const setAuthToken = (newToken: string) => {
  token = newToken
  localStorage.setItem('token', newToken)
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
  }
}

export const clearAuthToken = () => {
  token = null
  localStorage.removeItem('token')
  delete apiClient.defaults.headers.common['Authorization']
}

// Request interceptor to add JWT token
apiClient.interceptors.request.use(
  (config) => {
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearAuthToken()
      window.location.href = '/auth/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
