import apiClient from './api'

export interface ATSInfo {
  atsProvider: string | null
  atsIdentifier: string | null
  canAutoApply: boolean
}

export interface SubmissionResult {
  success: boolean
  applicationUrl?: string
  externalApplicationId?: string
  error?: string
}

export interface AutoApplyTestResult {
  canAutoApply: boolean
  atsProvider: string | null
  candidatePreview: Record<string, any>
  warnings: string[]
}

export const autoApplyApi = {
  async submitOne(applicationId: string): Promise<{ success: boolean; data: SubmissionResult }> {
    const { data } = await apiClient.post(`/auto-apply/submit/${applicationId}`)
    return data
  },

  async processAll(): Promise<{ success: boolean; data: { submitted: number; failed: number; skipped: number } }> {
    const { data } = await apiClient.post('/auto-apply/process')
    return data
  },

  async getStatus(applicationId: string): Promise<{ success: boolean; data: any }> {
    const { data } = await apiClient.get(`/auto-apply/status/${applicationId}`)
    return data
  },

  async getATSInfo(jobId: string): Promise<{ success: boolean; data: ATSInfo }> {
    const { data } = await apiClient.get(`/auto-apply/ats-info/${jobId}`)
    return data
  },

  async testSubmission(jobId: string): Promise<{ success: boolean; data: AutoApplyTestResult }> {
    const { data } = await apiClient.post(`/auto-apply/test/${jobId}`)
    return data
  },
}
