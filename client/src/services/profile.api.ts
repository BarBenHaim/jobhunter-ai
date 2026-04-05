import apiClient from './api'
import { UserProfile } from '@/types'

export const profileApi = {
  async getProfile(): Promise<UserProfile> {
    const { data } = await apiClient.get('/profile')
    return data
  },

  async updateProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    const { data } = await apiClient.put('/profile', profile)
    return data
  },

  async submitKnowledge(knowledge: Record<string, any>): Promise<void> {
    await apiClient.post('/profile/knowledge', knowledge)
  },

  async uploadCV(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await apiClient.post('/profile/cv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return data.cvId
  },

  async getGaps(personaId: string): Promise<{ gaps: string[] }> {
    const { data } = await apiClient.get(`/profile/gaps/${personaId}`)
    return data
  },
}
