import apiClient from './api'
import { Job, JobFilters, PaginatedResponse, JobSource } from '@/types'

export const jobsApi = {
  async list(filters: JobFilters = {}): Promise<PaginatedResponse<Job>> {
    const { data } = await apiClient.get('/jobs', { params: filters })
    return data
  },

  async get(id: string): Promise<Job> {
    const { data } = await apiClient.get(`/jobs/${id}`)
    return data
  },

  async triggerScrape(source: JobSource, options?: Record<string, any>): Promise<{ jobsAdded: number }> {
    const { data } = await apiClient.post(`/jobs/scrape/${source}`, options || {})
    return data
  },

  async getStats(): Promise<{
    totalJobs: number
    activeJobs: number
    bySource: Record<JobSource, number>
    avgApplications: number
  }> {
    const { data } = await apiClient.get('/jobs/stats')
    return data
  },

  async addSource(source: JobSource, config: Record<string, any>): Promise<void> {
    await apiClient.post('/jobs/sources', { source, config })
  },

  async searchJobs(query: string, filters?: Partial<JobFilters>): Promise<PaginatedResponse<Job>> {
    const { data } = await apiClient.get('/jobs/search', {
      params: { q: query, ...filters },
    })
    return data
  },
}
