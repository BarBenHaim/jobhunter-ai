import apiClient from './api'
import { UserProfile } from '@/types'

export const profileApi = {
  async getProfile(): Promise<UserProfile> {
    const { data } = await apiClient.get('/profile')
    // Backend wraps in { success: true, data: {...} } — unwrap it
    return data?.data || data
  },

  async updateProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    const { data } = await apiClient.patch('/profile', profile)
    return data?.data || data
  },

  async submitKnowledge(knowledge: Record<string, any>): Promise<any> {
    const { data } = await apiClient.post('/profile/knowledge', knowledge)
    return data?.data || data
  },

  async uploadCV(file: File): Promise<UserProfile> {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await apiClient.post('/profile/upload-cv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return data?.data || data
  },

  async getGaps(personaId: string): Promise<{ gaps: string[] }> {
    const { data } = await apiClient.get(`/profile/gaps/${personaId}`)
    return data?.data || data
  },
}
