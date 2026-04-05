import apiClient from './api'
import { FollowUp, FollowUpFilters, FollowUpType, PaginatedResponse } from '@/types'

export const followupsApi = {
  async list(filters: FollowUpFilters = {}): Promise<PaginatedResponse<FollowUp>> {
    const { data } = await apiClient.get('/followups', { params: filters })
    return data
  },

  async get(id: string): Promise<FollowUp> {
    const { data } = await apiClient.get(`/followups/${id}`)
    return data
  },

  async schedule(
    applicationId: string,
    type: FollowUpType,
    scheduledFor: Date,
    message?: string
  ): Promise<FollowUp> {
    const { data } = await apiClient.post('/followups', {
      applicationId,
      type,
      scheduledFor,
      message,
    })
    return data
  },

  async getUpcoming(): Promise<FollowUp[]> {
    const { data } = await apiClient.get('/followups/upcoming')
    return data
  },

  async execute(id: string): Promise<FollowUp> {
    const { data } = await apiClient.post(`/followups/${id}/execute`)
    return data
  },

  async complete(id: string): Promise<FollowUp> {
    const { data } = await apiClient.post(`/followups/${id}/complete`)
    return data
  },

  async cancel(id: string, reason?: string): Promise<FollowUp> {
    const { data } = await apiClient.post(`/followups/${id}/cancel`, { reason })
    return data
  },
}
