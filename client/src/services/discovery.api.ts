import apiClient from './api'

export const discoveryApi = {
  async getCompanies(category?: string): Promise<any> {
    const params = category ? `?category=${category}` : ''
    const { data } = await apiClient.get(`/discovery/companies${params}`)
    return data
  },

  async scanCareers(keywords?: string[], categories?: string[]): Promise<any> {
    const { data } = await apiClient.post('/discovery/scan-careers', { keywords, categories })
    return data
  },

  async discoverFundedStartups(): Promise<any> {
    const { data } = await apiClient.post('/discovery/funded-startups')
    return data
  },

  async fullScan(keywords?: string[]): Promise<any> {
    const { data } = await apiClient.post('/discovery/full-scan', { keywords })
    return data
  },

  async scanCompany(slug: string): Promise<any> {
    const { data } = await apiClient.post(`/discovery/scan-company/${slug}`)
    return data
  },
}
