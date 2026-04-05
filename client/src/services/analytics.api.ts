import apiClient from './api'
import {
  FunnelData,
  ScoreDistribution,
  ResponseTimeData,
  KeywordAnalysis,
  TrendData,
  PersonaROIData,
  SourcePerformance,
} from '@/types'

export const analyticsApi = {
  async getFunnel(personaId?: string): Promise<FunnelData[]> {
    const { data } = await apiClient.get('/analytics/funnel', {
      params: { personaId },
    })
    return data
  },

  async getScoreDistribution(personaId?: string): Promise<ScoreDistribution[]> {
    const { data } = await apiClient.get('/analytics/score-distribution', {
      params: { personaId },
    })
    return data
  },

  async getResponseTimes(personaId?: string): Promise<ResponseTimeData[]> {
    const { data } = await apiClient.get('/analytics/response-times', {
      params: { personaId },
    })
    return data
  },

  async getKeywordAnalysis(): Promise<KeywordAnalysis[]> {
    const { data } = await apiClient.get('/analytics/keywords')
    return data
  },

  async getTrends(days: number = 30): Promise<TrendData[]> {
    const { data } = await apiClient.get('/analytics/trends', {
      params: { days },
    })
    return data
  },

  async getPersonaROI(): Promise<PersonaROIData[]> {
    const { data } = await apiClient.get('/analytics/persona-roi')
    return data
  },

  async getSourcePerformance(): Promise<SourcePerformance[]> {
    const { data } = await apiClient.get('/analytics/source-performance')
    return data
  },

  async getOverview(): Promise<{
    totalApplications: number
    interviews: number
    offers: number
    responseRate: number
    avgTimeToResponse: number
  }> {
    const { data } = await apiClient.get('/analytics/overview')
    return data
  },
}
