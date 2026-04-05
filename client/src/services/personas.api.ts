import apiClient from './api'
import { Persona, PaginatedResponse, JobScore } from '@/types'

export const personasApi = {
  async list(page: number = 1, limit: number = 10): Promise<PaginatedResponse<Persona>> {
    const { data } = await apiClient.get('/personas', {
      params: { page, limit },
    })
    return data
  },

  async get(id: string): Promise<Persona> {
    const { data } = await apiClient.get(`/personas/${id}`)
    return data
  },

  async create(persona: Omit<Persona, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Persona> {
    const { data } = await apiClient.post('/personas', persona)
    return data
  },

  async update(id: string, persona: Partial<Persona>): Promise<Persona> {
    const { data } = await apiClient.put(`/personas/${id}`, persona)
    return data
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/personas/${id}`)
  },

  async testScore(personaId: string, jobId: string): Promise<JobScore> {
    const { data } = await apiClient.post(`/personas/${personaId}/test-score`, {
      jobId,
    })
    return data
  },
}
