import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Save,
  Eye,
  EyeOff,
  Download,
  Upload,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { Modal } from '@/components/common/Modal'

interface SettingsData {
  apiKey: string
  modelSelection: string
  scraperSources: Array<{
    name: string
    enabled: boolean
    rateLimit: number
    lastCheckedAt: Date
  }>
  scoreThresholds: {
    autoApply: number
    manualReview: number
    skip: number
  }
  notifications: {
    emailNotifications: boolean
    dailyDigest: boolean
    instantAlerts: boolean
  }
  applicationLimits: {
    maxPerDay: number
    maxPerDayPerSource: number
  }
  systemHealth: {
    database: 'healthy' | 'degraded' | 'down'
    redis: 'healthy' | 'degraded' | 'down'
    scraper: 'healthy' | 'degraded' | 'down'
    lastCheck: Date
  }
}

const Settings = () => {
  const [showApiKey, setShowApiKey] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [settings, setSettings] = useState<SettingsData>({
    apiKey: 'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxx',
    modelSelection: 'claude-3-sonnet',
    scraperSources: [
      { name: 'LinkedIn', enabled: true, rateLimit: 50, lastCheckedAt: new Date() },
      { name: 'Indeed', enabled: true, rateLimit: 50, lastCheckedAt: new Date() },
      { name: 'Built In', enabled: true, rateLimit: 30, lastCheckedAt: new Date(Date.now() - 30 * 60 * 1000) },
      { name: 'Glassdoor', enabled: true, rateLimit: 25, lastCheckedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      { name: 'AngelList', enabled: false, rateLimit: 20, lastCheckedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      { name: 'TechCrunch', enabled: false, rateLimit: 15, lastCheckedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    ],
    scoreThresholds: {
      autoApply: 85,
      manualReview: 60,
      skip: 40,
    },
    notifications: {
      emailNotifications: true,
      dailyDigest: true,
      instantAlerts: false,
    },
    applicationLimits: {
      maxPerDay: 10,
      maxPerDayPerSource: 3,
    },
    systemHealth: {
      database: 'healthy',
      redis: 'healthy',
      scraper: 'degraded',
      lastCheck: new Date(),
    },
  })

  const handleSaveSettings = async () => {
    setIsSaving(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsSaving(false)
  }

  const getHealthStatusIcon = (status: 'healthy' | 'degraded' | 'down') => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
      case 'degraded':
        return <AlertTriangle className="text-yellow-600 dark:text-yellow-400" size={20} />
      case 'down':
        return <AlertCircle className="text-red-600 dark:text-red-400" size={20} />
    }
  }

  const getHealthStatusLabel = (status: 'healthy' | 'degraded' | 'down') => {
    switch (status) {
      case 'healthy':
        return 'Healthy'
      case 'degraded':
        return 'Degraded'
      case 'down':
        return 'Down'
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50 font-medium"
        >
          <Save size={18} />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* API Configuration */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">API Configuration</h2>
        <div className="space-y-4">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Anthropic API Key
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 dark:border-gray-700 dark:bg-gray-800"
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
              Your API key is encrypted and never shared. Get it at console.anthropic.com
            </p>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Model Selection
            </label>
            <select
              value={settings.modelSelection}
              onChange={(e) => setSettings({ ...settings, modelSelection: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            >
              <option value="claude-3-haiku">Claude 3 Haiku (Fast, Low Cost)</option>
              <option value="claude-3-sonnet">Claude 3 Sonnet (Balanced)</option>
              <option value="claude-3-opus">Claude 3 Opus (Most Capable)</option>
            </select>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
              Choose based on your speed/cost/quality preferences
            </p>
          </div>
        </div>
      </Card>

      {/* Scraper Sources */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Scraper Sources</h2>
        <div className="space-y-3">
          {settings.scraperSources.map((source) => (
            <div key={source.name} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={(e) => {
                        const updated = settings.scraperSources.map((s) =>
                          s.name === source.name ? { ...s, enabled: e.target.checked } : s
                        )
                        setSettings({ ...settings, scraperSources: updated })
                      }}
                      className="rounded"
                    />
                    <span className="font-medium text-gray-900 dark:text-white">{source.name}</span>
                  </label>
                  {source.enabled && (
                    <Badge variant="success" size="sm">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Last checked: {source.lastCheckedAt.toLocaleTimeString()}
                </p>
              </div>
              <div className="text-right">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Rate Limit
                </label>
                <input
                  type="number"
                  value={source.rateLimit}
                  onChange={(e) => {
                    const updated = settings.scraperSources.map((s) =>
                      s.name === source.name ? { ...s, rateLimit: parseInt(e.target.value) } : s
                    )
                    setSettings({ ...settings, scraperSources: updated })
                  }}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Score Thresholds */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Score Thresholds</h2>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto-Apply Threshold
              </label>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{settings.scoreThresholds.autoApply}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.scoreThresholds.autoApply}
              onChange={(e) => setSettings({
                ...settings,
                scoreThresholds: { ...settings.scoreThresholds, autoApply: parseInt(e.target.value) }
              })}
              className="w-full"
            />
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Jobs above this score will be automatically applied to
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Manual Review Threshold
              </label>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{settings.scoreThresholds.manualReview}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.scoreThresholds.manualReview}
              onChange={(e) => setSettings({
                ...settings,
                scoreThresholds: { ...settings.scoreThresholds, manualReview: parseInt(e.target.value) }
              })}
              className="w-full"
            />
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Jobs between review and skip threshold will be added to review queue
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Skip Threshold
              </label>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{settings.scoreThresholds.skip}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.scoreThresholds.skip}
              onChange={(e) => setSettings({
                ...settings,
                scoreThresholds: { ...settings.scoreThresholds, skip: parseInt(e.target.value) }
              })}
              className="w-full"
            />
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Jobs below this score will be automatically skipped
            </p>
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Notifications</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
            <input
              type="checkbox"
              checked={settings.notifications.emailNotifications}
              onChange={(e) => setSettings({
                ...settings,
                notifications: { ...settings.notifications, emailNotifications: e.target.checked }
              })}
              className="rounded"
            />
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white">Email Notifications</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Get email updates on applications and responses</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
            <input
              type="checkbox"
              checked={settings.notifications.dailyDigest}
              onChange={(e) => setSettings({
                ...settings,
                notifications: { ...settings.notifications, dailyDigest: e.target.checked }
              })}
              className="rounded"
            />
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white">Daily Digest</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Receive a daily summary of activity</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
            <input
              type="checkbox"
              checked={settings.notifications.instantAlerts}
              onChange={(e) => setSettings({
                ...settings,
                notifications: { ...settings.notifications, instantAlerts: e.target.checked }
              })}
              className="rounded"
            />
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white">Instant Alerts</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Get notified immediately on new responses</p>
            </div>
          </label>
        </div>
      </Card>

      {/* Application Limits */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Application Limits</h2>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Max Applications Per Day
              </label>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{settings.applicationLimits.maxPerDay}</span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              value={settings.applicationLimits.maxPerDay}
              onChange={(e) => setSettings({
                ...settings,
                applicationLimits: { ...settings.applicationLimits, maxPerDay: parseInt(e.target.value) }
              })}
              className="w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Max Per Source Per Day
              </label>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{settings.applicationLimits.maxPerDayPerSource}</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              value={settings.applicationLimits.maxPerDayPerSource}
              onChange={(e) => setSettings({
                ...settings,
                applicationLimits: { ...settings.applicationLimits, maxPerDayPerSource: parseInt(e.target.value) }
              })}
              className="w-full"
            />
          </div>
        </div>
      </Card>

      {/* Data Management */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Data Management</h2>
        <div className="flex gap-3">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium transition-colors"
          >
            <Download size={18} />
            Export Data
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium transition-colors"
          >
            <Upload size={18} />
            Import Data
          </button>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
          Export all your data as JSON. Import to restore or migrate to another instance.
        </p>
      </Card>

      {/* System Health */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Health</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Database</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Last checked: {settings.systemHealth.lastCheck.toLocaleTimeString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {getHealthStatusIcon(settings.systemHealth.database)}
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {getHealthStatusLabel(settings.systemHealth.database)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Redis Cache</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Last checked: {settings.systemHealth.lastCheck.toLocaleTimeString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {getHealthStatusIcon(settings.systemHealth.redis)}
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {getHealthStatusLabel(settings.systemHealth.redis)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Job Scrapers</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Last checked: {settings.systemHealth.lastCheck.toLocaleTimeString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {getHealthStatusIcon(settings.systemHealth.scraper)}
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {getHealthStatusLabel(settings.systemHealth.scraper)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Export Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Export Data"
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setIsExportModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                console.log('Export data')
                setIsExportModalOpen(false)
              }}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium"
            >
              Download
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-gray-600 dark:text-gray-400">
            This will download all your data including jobs, applications, personas, and settings as a JSON file.
          </p>
          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              The export file will be encrypted with your password for security.
            </p>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Password (optional)</span>
            <input
              type="password"
              placeholder="Leave empty to skip encryption"
              className="w-full mt-1 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            />
          </label>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import Data"
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setIsImportModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                console.log('Import data')
                setIsImportModalOpen(false)
              }}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium"
            >
              Import
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-gray-600 dark:text-gray-400">
            Select a previously exported JSON file to restore your data.
          </p>
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
            <Upload className="mx-auto mb-2 text-gray-400" size={32} />
            <p className="text-sm font-medium text-gray-900 dark:text-white">Choose file to import</p>
            <button className="mt-2 rounded-lg bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
              Select File
            </button>
          </div>
          {/* Encrypted import */}
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</span>
            <input
              type="password"
              placeholder="Enter password if file is encrypted"
              className="w-full mt-1 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}

export default Settings
