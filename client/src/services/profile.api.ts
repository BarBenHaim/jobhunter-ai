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

  async updateSkills(skills: string[]): Promise<UserProfile> {
    const { data } = await apiClient.patch('/profile/skills', { skills })
    return data?.data || data
  },

  async getGaps(personaId: string): Promise<{ gaps: string[] }> {
    const { data } = await apiClient.get(`/profile/gaps/${personaId}`)
    return data?.data || data
  },

  // ─── CV Library ──────────────────────────────────
  async getCVLibrary(): Promise<UploadedCV[]> {
    const { data } = await apiClient.get('/profile/cv-library')
    return data?.data || data
  },

  async uploadCVToLibrary(file: File, label?: string): Promise<UploadedCV> {
    const formData = new FormData()
    formData.append('file', file)
    if (label) formData.append('label', label)
    const { data } = await apiClient.post('/profile/cv-library', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data?.data || data
  },

  async updateCVInLibrary(id: string, updates: Partial<{ label: string; roleType: string; isDefault: boolean }>): Promise<UploadedCV> {
    const { data } = await apiClient.patch(`/profile/cv-library/${id}`, updates)
    return data?.data || data
  },

  async deleteCVFromLibrary(id: string): Promise<void> {
    await apiClient.delete(`/profile/cv-library/${id}`)
  },
}

export interface UploadedCV {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  roleType: string
  roleTypeAutoDetected: boolean
  label: string | null
  extractedSkills: string[]
  isDefault: boolean
  parsedAt: string | null
  createdAt: string
}
