import apiClient from './api'
import { Application, ApplicationFilters, PaginatedResponse, AppStatus } from '@/types'

export const applicationsApi = {
  async list(filters: ApplicationFilters = {}): Promise<PaginatedResponse<Application>> {
    const { data } = await apiClient.get('/applications', { params: filters })
    return data
  },

  async get(id: string): Promise<Application> {
    const { data } = await apiClient.get(`/applications/${id}`)
    return data
  },

  async submit(jobId: string, personaId: string, cvId: string, coverLetterId?: string): Promise<Application> {
    const { data } = await apiClient.post('/applications', {
      jobId,
      personaId,
      cvId,
      coverLetterId,
    })
    return data
  },

  async dryRun(jobId: string, personaId: string, cvId: string): Promise<{
    score: number
    recommendation: string
    willSubmit: boolean
  }> {
    const { data } = await apiClient.post('/applications/dry-run', {
      jobId,
      personaId,
      cvId,
    })
    return data
  },

  async getQueue(): Promise<Application[]> {
    const { data } = await apiClient.get('/applications/queue')
    return data
  },

  async approve(applicationId: string): Promise<Application> {
    const { data } = await apiClient.post(`/applications/${applicationId}/approve`)
    return data
  },

  async reject(applicationId: string, reason?: string): Promise<Application> {
    const { data } = await apiClient.post(`/applications/${applicationId}/reject`, { reason })
    return data
  },

  async updateStatus(id: string, status: AppStatus, notes?: string): Promise<Application> {
    const { data } = await apiClient.put(`/applications/${id}`, { status, notes })
    return data
  },

  async withdraw(id: string, reason?: string): Promise<Application> {
    const { data } = await apiClient.post(`/applications/${id}/withdraw`, { reason })
    return data
  },
}
