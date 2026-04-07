import apiClient from './api'

export const intelligenceApi = {
  async getOverview(): Promise<any> {
    const { data } = await apiClient.get('/intelligence/overview')
    return data
  },

  async getPatterns(): Promise<any> {
    const { data } = await apiClient.get('/intelligence/patterns')
    return data
  },

  async getFunnel(): Promise<any> {
    const { data } = await apiClient.get('/intelligence/funnel')
    return data
  },

  async getTimeline(limit: number = 50): Promise<any> {
    const { data } = await apiClient.get(`/intelligence/timeline?limit=${limit}`)
    return data
  },

  async getLearnedRules(personaId: string): Promise<any> {
    const { data } = await apiClient.get(`/intelligence/learned-rules/${personaId}`)
    return data
  },

  async recordResponse(applicationId: string, status: string, responseType?: string, notes?: string): Promise<any> {
    const { data } = await apiClient.post('/intelligence/record-response', {
      applicationId,
      status,
      responseType,
      notes,
    })
    return data
  },
}
