import apiClient from './api'

export interface AutoPilotConfig {
  enabled: boolean
  mode: 'semi-auto' | 'full-auto'
  schedule: string
  minScore: number
  autoApplyThreshold: number
  maxPerDay: number
  maxPerRun: number
  sources: string[]
  blacklistedCompanies: string[]
  preferredCompanies: string[]
  location: string
  generateCoverLetter: boolean
  notifyEmail: boolean
  notifyInApp: boolean
  pausedUntil: string | null
  maxDailyCost: number
}

export interface AutoPilotStatus {
  config: AutoPilotConfig
  isRunning: boolean
  lastRun: {
    id: string; status: string; startedAt: string; completedAt: string | null
    jobsDiscovered: number; jobsQualifying: number; cvsGenerated: number
    applicationsSubmitted: number; applicationsQueued: number; duration: number | null
  } | null
  pendingApprovals: number
  todayStats: {
    runs: number; discovered: number; qualifying: number
    cvs: number; submitted: number; queued: number
  }
}

export interface QueueItem {
  id: string; jobId: string; title: string; company: string; location: string
  source: string; score: number; skillMatch: number; experienceMatch: number
  matchedSkills: string[]; missingSkills: string[]; redFlags: string[]
  recommendation: string; cvFilePath: string | null; status: string; createdAt: string
}

export interface LogEntry {
  id: string; runId: string | null; userId: string; eventType: string
  message: string; data: any; severity: string; createdAt: string
}

export const autopilotApi = {
  async getStatus(): Promise<AutoPilotStatus> {
    const { data } = await apiClient.get('/autopilot/status')
    return data?.data || data
  },

  async updateConfig(updates: Partial<AutoPilotConfig>): Promise<AutoPilotConfig> {
    const { data } = await apiClient.patch('/autopilot/config', updates)
    return data?.data || data
  },

  async start(): Promise<any> {
    const { data } = await apiClient.post('/autopilot/start')
    return data?.data || data
  },

  async stop(): Promise<any> {
    const { data } = await apiClient.post('/autopilot/stop')
    return data?.data || data
  },

  async pause(until?: string): Promise<any> {
    const { data } = await apiClient.post('/autopilot/pause', { until })
    return data?.data || data
  },

  async getRuns(limit = 20, offset = 0): Promise<{ runs: any[]; total: number }> {
    const { data } = await apiClient.get(`/autopilot/runs?limit=${limit}&offset=${offset}`)
    return data?.data || data
  },

  async getLog(limit = 50, offset = 0, eventType?: string): Promise<{ logs: LogEntry[]; total: number }> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (eventType) params.set('eventType', eventType)
    const { data } = await apiClient.get(`/autopilot/log?${params}`)
    return data?.data || data
  },

  async getQueue(): Promise<QueueItem[]> {
    const { data } = await apiClient.get('/autopilot/queue')
    return data?.data || data
  },

  async approveItem(id: string): Promise<any> {
    const { data } = await apiClient.post(`/autopilot/queue/${id}/approve`)
    return data?.data || data
  },

  async rejectItem(id: string, reason?: string): Promise<any> {
    const { data } = await apiClient.post(`/autopilot/queue/${id}/reject`, { reason })
    return data?.data || data
  },

  async approveAll(minScore = 0): Promise<any> {
    const { data } = await apiClient.post('/autopilot/queue/approve-all', { minScore })
    return data?.data || data
  },
}
