import apiClient from './api'

export interface SavedSearch {
  id: string
  userId: string
  name: string
  freeTextQuery?: string
  keywords: string[]
  sources: string[]
  location?: string
  minScore: number
  experienceLevel?: string
  notifyEmail: boolean
  notifyFrequency: string
  isActive: boolean
  lastRunAt?: string
  lastNotifiedAt?: string
  totalJobsFound: number
  newJobsSinceNotify: number
  createdAt: string
  updatedAt: string
}

export interface SavedSearchInput {
  name: string
  freeTextQuery?: string
  keywords?: string[]
  sources?: string[]
  location?: string
  minScore?: number
  experienceLevel?: string
  notifyEmail?: boolean
  notifyFrequency?: string
}

export const savedSearchesApi = {
  async list(): Promise<{ success: boolean; data: SavedSearch[] }> {
    const { data } = await apiClient.get('/saved-searches')
    return data
  },

  async get(id: string): Promise<{ success: boolean; data: SavedSearch }> {
    const { data } = await apiClient.get(`/saved-searches/${id}`)
    return data
  },

  async create(input: SavedSearchInput): Promise<{ success: boolean; data: SavedSearch }> {
    const { data } = await apiClient.post('/saved-searches', input)
    return data
  },

  async update(id: string, input: Partial<SavedSearchInput>): Promise<{ success: boolean; data: SavedSearch }> {
    const { data } = await apiClient.put(`/saved-searches/${id}`, input)
    return data
  },

  async remove(id: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete(`/saved-searches/${id}`)
    return data
  },

  async toggle(id: string): Promise<{ success: boolean; data: SavedSearch }> {
    const { data } = await apiClient.post(`/saved-searches/${id}/toggle`)
    return data
  },

  async run(id: string): Promise<{ success: boolean; data: { totalScraped: number; matchingJobs: number; newJobs: number } }> {
    const { data } = await apiClient.post(`/saved-searches/${id}/run`)
    return data
  },
}
