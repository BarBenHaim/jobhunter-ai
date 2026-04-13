import apiClient from './api'

export const hiddenJobsApi = {
  async hide(jobId: string, reason?: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.post(`/hidden-jobs/${jobId}`, { reason })
    return data
  },

  async unhide(jobId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete(`/hidden-jobs/${jobId}`)
    return data
  },

  async list(): Promise<{ success: boolean; data: Array<{ jobId: string; reason: string; createdAt: string }> }> {
    const { data } = await apiClient.get('/hidden-jobs')
    return data
  },

  async getIds(): Promise<{ success: boolean; data: string[] }> {
    const { data } = await apiClient.get('/hidden-jobs/ids')
    return data
  },
}
