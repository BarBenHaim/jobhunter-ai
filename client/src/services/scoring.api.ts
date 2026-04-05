import apiClient from './api'
import { JobScore, ScoringRule } from '@/types'

export const scoringApi = {
  async scoreJob(personaId: string, jobId: string): Promise<JobScore> {
    const { data } = await apiClient.post('/scoring/score-job', {
      personaId,
      jobId,
    })
    return data
  },

  async scoreBatch(personaId: string, jobIds: string[]): Promise<JobScore[]> {
    const { data } = await apiClient.post('/scoring/score-batch', {
      personaId,
      jobIds,
    })
    return data
  },

  async getRules(personaId: string): Promise<ScoringRule[]> {
    const { data } = await apiClient.get(`/scoring/rules/${personaId}`)
    return data
  },

  async addRule(personaId: string, rule: Omit<ScoringRule, 'id' | 'createdAt'>): Promise<ScoringRule> {
    const { data } = await apiClient.post(`/scoring/rules/${personaId}`, rule)
    return data
  },

  async updateRule(ruleId: string, rule: Partial<ScoringRule>): Promise<ScoringRule> {
    const { data } = await apiClient.put(`/scoring/rules/${ruleId}`, rule)
    return data
  },

  async deleteRule(ruleId: string): Promise<void> {
    await apiClient.delete(`/scoring/rules/${ruleId}`)
  },
}
