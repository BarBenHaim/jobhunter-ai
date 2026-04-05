import apiClient from './api'
import { Settings, SystemHealth } from '@/types'

export const settingsApi = {
  async get(): Promise<Settings> {
    const { data } = await apiClient.get('/settings')
    return data
  },

  async update(settings: Partial<Settings>): Promise<Settings> {
    const { data } = await apiClient.put('/settings', settings)
    return data
  },

  async getHealth(): Promise<SystemHealth> {
    const { data } = await apiClient.get('/health')
    return data
  },

  async exportData(): Promise<Blob> {
    const { data } = await apiClient.get('/settings/export', {
      responseType: 'blob',
    })
    return data
  },

  async importData(file: File): Promise<{ imported: number }> {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await apiClient.post('/settings/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return data
  },

  async testNotifications(): Promise<void> {
    await apiClient.post('/settings/test-notifications')
  },
}
