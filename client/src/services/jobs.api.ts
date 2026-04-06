import apiClient from './api'
import { Job, JobWithScore, JobFilters, PaginatedResponse, JobSource } from '@/types'

export const jobsApi = {
  async list(filters: JobFilters = {}): Promise<PaginatedResponse<Job>> {
    const { data } = await apiClient.get('/jobs', { params: filters })
    return data
  },

  async get(id: string): Promise<{ success: boolean; data: JobWithScore }> {
    const { data } = await apiClient.get(`/jobs/${id}`)
    return data
  },

  async getStats(): Promise<{ success: boolean; data: Record<string, any> }> {
    const { data } = await apiClient.get('/jobs/stats')
    return data
  },

  async triggerScrape(source: JobSource, options?: Record<string, any>): Promise<{ jobsAdded: number }> {
    const { data } = await apiClient.post(`/jobs/scrape/${source}`, options || {})
    return data
  },

  async addSource(source: JobSource, config: Record<string, any>): Promise<void> {
    await apiClient.post('/jobs/sources', { source, config })
  },

  async searchJobs(query: string, filters?: Partial<JobFilters>): Promise<PaginatedResponse<Job>> {
    const { data } = await apiClient.get('/jobs', {
      params: { search: query, ...filters },
    })
    return data
  },
}
