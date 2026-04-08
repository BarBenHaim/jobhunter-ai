import apiClient from './api'

export interface CostData {
  anthropic: {
    calls: number
    inputTokens: number
    outputTokens: number
    cost: number
  }
  serpapi: {
    calls: number
    cost: number
  }
  total: number
  date: string
}

export interface CostHistory {
  anthropic: Array<{
    inputTokens: number
    outputTokens: number
    cost: number
    timestamp: string
  }>
  serpapi: Array<{
    cost: number
    timestamp: string
  }>
}

export const costsApi = {
  async getToday(): Promise<CostData> {
    const { data } = await apiClient.get('/costs/today')
    return data.data
  },

  async getHistory(): Promise<CostHistory> {
    const { data } = await apiClient.get('/costs/history')
    return data.data
  },

  async reset(): Promise<void> {
    await apiClient.post('/costs/reset')
  },
}
