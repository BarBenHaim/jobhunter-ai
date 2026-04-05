import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  Plus,
  Trash2,
  Save,
  X,
  AlertCircle,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { Modal } from '@/components/common/Modal'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface PersonaDetailData {
  id: string
  name: string
  title: string
  summary: string
  targetKeywords: string[]
  excludeKeywords: string[]
  skillPriority: string[]
  experienceRules: string
  sources: string[]
  scheduleConfig: {
    daysOfWeek: boolean[]
    maxApplicationsPerDay: number
  }
  scoringRules: Array<{
    id: string
    type: 'boost' | 'penalize'
    condition: string
    impact: number
  }>
  stats: {
    applications: number
    responses: number
    interviews: number
    offers: number
  }
  performanceData: Array<{
    company: string
    responseRate: number
    applications: number
  }>
}

const PersonaDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [activeTab, setActiveTab] = useState<'config' | 'schedule' | 'rules' | 'performance'>('config')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [draggedSkill, setDraggedSkill] = useState<string | null>(null)
  const [newRule, setNewRule] = useState({ type: 'boost', condition: '', impact: 0 })

  // Fetch persona details
  const { data: persona } = useQuery<PersonaDetailData>({
    queryKey: ['persona-detail', id],
    queryFn: async () => ({
      id: '1',
      name: 'Frontend Pro',
      title: 'Senior React Developer',
      summary: 'Targeting senior-level frontend engineering positions with strong React focus',
      targetKeywords: ['React', 'TypeScript', 'Web Performance', 'UI/UX', 'Component Architecture'],
      excludeKeywords: ['C++', 'Java Backend', 'DevOps'],
      skillPriority: ['React', 'TypeScript', 'CSS/Design', 'Node.js', 'Testing'],
      experienceRules: 'Prefer 5+ years total, 3+ React specifically',
      sources: ['LinkedIn', 'Indeed', 'Built In'],
      scheduleConfig: {
        daysOfWeek: [true, true, true, true, true, false, false],
        maxApplicationsPerDay: 5,
      },
      scoringRules: [
        {
          id: '1',
          type: 'boost',
          condition: 'Contains "Next.js"',
          impact: 5,
        },
        {
          id: '2',
          type: 'boost',
          condition: 'Salary > $150k',
          impact: 3,
        },
        {
          id: '3',
          type: 'penalize',
          condition: 'Requires relocation',
          impact: -10,
        },
      ],
      stats: {
        applications: 34,
        responses: 11,
        interviews: 6,
        offers: 1,
      },
      performanceData: [
        { company: 'TechCorp', responseRate: 50, applications: 2 },
        { company: 'StartupXYZ', responseRate: 67, applications: 3 },
        { company: 'WebCo', responseRate: 33, applications: 3 },
        { company: 'Creative Studios', responseRate: 100, applications: 1 },
        { company: 'TechGiants', responseRate: 50, applications: 2 },
      ],
    }),
  })

  if (!persona) return <div>Loading...</div>

  const handleDragStart = (skill: string) => {
    setDraggedSkill(skill)
  }

  const handleDrop = (sourceIndex: number, targetIndex: number) => {
    // In a real app, this would reorder skills
    console.log(`Move skill from ${sourceIndex} to ${targetIndex}`)
  }

  const tabs = [
    { id: 'config', label: 'Configuration' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'rules', label: 'Scoring Rules' },
    { id: 'performance', label: 'Performance' },
  ]

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <button className="flex items-center gap-2 text-primary-600 hover:text-primary-700 dark:text-primary-400">
          <ChevronLeft size={20} />
          Back
        </button>
        <div className="flex gap-2">
          <button className="rounded-lg bg-gray-100 px-4 py-2 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium">
            Test Score Job
          </button>
          <button className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 font-medium flex items-center gap-2">
            <Save size={18} />
            Save Changes
          </button>
        </div>
      </div>

      {/* Title Section */}
      <Card>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{persona.name}</h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 mt-1">{persona.title}</p>
          </div>
          <Badge variant="success">Active</Badge>
        </div>
        <p className="text-gray-600 dark:text-gray-400">{persona.summary}</p>
      </Card>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {/* Configuration Tab */}
        {activeTab === 'config' && (
          <div className="space-y-4">
            {/* Target Keywords */}
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Target Keywords</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {persona.targetKeywords.map((keyword) => (
                  <Badge key={keyword} variant="success" size="md">
                    {keyword}
                  </Badge>
                ))}
              </div>
              <input
                type="text"
                placeholder="Add new keyword..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
              />
            </Card>

            {/* Exclude Keywords */}
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Exclude Keywords</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {persona.excludeKeywords.map((keyword) => (
                  <Badge key={keyword} variant="error" size="md">
                    {keyword}
                  </Badge>
                ))}
              </div>
              <input
                type="text"
                placeholder="Add keyword to exclude..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
              />
            </Card>

            {/* Skill Priority */}
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Skill Priority (Drag to Reorder)</h2>
              <div className="space-y-2 mb-4">
                {persona.skillPriority.map((skill, index) => (
                  <div
                    key={skill}
                    draggable
                    onDragStart={() => handleDragStart(skill)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-300 cursor-move hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 bg-white dark:bg-gray-900"
                  >
                    <div className="text-gray-400 cursor-grab">⋮⋮</div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{skill}</p>
                      <p className="text-xs text-gray-500">Priority {index + 1}</p>
                    </div>
                  </div>
                ))}
              </div>
              <input
                type="text"
                placeholder="Add new skill..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
              />
            </Card>

            {/* Experience Rules */}
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Experience Rules</h2>
              <textarea
                value={persona.experienceRules}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                rows={3}
              />
            </Card>
          </div>
        )}

        {/* Schedule Tab */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            {/* Days of Week */}
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Active Days</h2>
              <div className="grid grid-cols-7 gap-2">
                {daysOfWeek.map((day, index) => (
                  <button
                    key={day}
                    className={`p-3 rounded-lg font-medium transition-all ${
                      persona.scheduleConfig.daysOfWeek[index]
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </Card>

            {/* Sources */}
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Active Sources</h2>
              <div className="space-y-2">
                {['LinkedIn', 'Indeed', 'Built In', 'Glassdoor', 'AngelList', 'TechCrunch'].map((source) => (
                  <label key={source} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={persona.sources.includes(source)}
                      className="rounded"
                    />
                    <span className="text-gray-900 dark:text-white">{source}</span>
                  </label>
                ))}
              </div>
            </Card>

            {/* Max Applications */}
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Application Limits</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max Applications Per Day
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={persona.scheduleConfig.maxApplicationsPerDay}
                    className="flex-1"
                  />
                  <span className="text-2xl font-bold text-gray-900 dark:text-white w-12 text-right">
                    {persona.scheduleConfig.maxApplicationsPerDay}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Scoring Rules Tab */}
        {activeTab === 'rules' && (
          <div className="space-y-4">
            {/* Existing Rules */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Scoring Rules</h2>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-1 text-sm text-white hover:bg-primary-700"
                >
                  <Plus size={16} />
                  Add Rule
                </button>
              </div>

              <div className="space-y-2">
                {persona.scoringRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={rule.type === 'boost' ? 'success' : 'error'}
                          size="sm"
                        >
                          {rule.type === 'boost' ? '+' : '-'}{Math.abs(rule.impact)}
                        </Badge>
                        <span className="font-medium text-gray-900 dark:text-white">{rule.condition}</span>
                      </div>
                    </div>
                    <button className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                      <Trash2 size={16} className="text-red-600 dark:text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <div className="space-y-4">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <p className="text-sm text-gray-600 dark:text-gray-400">Applications</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                  {persona.stats.applications}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-gray-600 dark:text-gray-400">Responses</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                  {persona.stats.responses}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {Math.round((persona.stats.responses / persona.stats.applications) * 100)}%
                </p>
              </Card>
              <Card>
                <p className="text-sm text-gray-600 dark:text-gray-400">Interviews</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                  {persona.stats.interviews}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {Math.round((persona.stats.interviews / persona.stats.applications) * 100)}%
                </p>
              </Card>
              <Card>
                <p className="text-sm text-gray-600 dark:text-gray-400">Offers</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                  {persona.stats.offers}
                </p>
              </Card>
            </div>

            {/* Top Responding Companies */}
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Responding Companies</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={persona.performanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(229, 231, 235)" />
                  <XAxis dataKey="company" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgb(31, 41, 55)', border: 'none', borderRadius: '8px', color: 'white' }} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="applications" fill="rgb(59, 130, 246)" name="Applications" />
                  <Bar yAxisId="right" dataKey="responseRate" fill="rgb(34, 197, 94)" name="Response Rate %" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}
      </div>

      {/* Add Scoring Rule Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Scoring Rule"
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                console.log('Add rule:', newRule)
                setIsModalOpen(false)
              }}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium"
            >
              Add Rule
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Rule Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={newRule.type === 'boost'}
                  onChange={() => setNewRule({ ...newRule, type: 'boost' })}
                />
                <span className="text-gray-900 dark:text-white">Boost</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={newRule.type === 'penalize'}
                  onChange={() => setNewRule({ ...newRule, type: 'penalize' })}
                />
                <span className="text-gray-900 dark:text-white">Penalize</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Condition
            </label>
            <input
              type="text"
              placeholder="e.g., Contains 'React', Salary > $150k"
              value={newRule.condition}
              onChange={(e) => setNewRule({ ...newRule, condition: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Impact Points: {newRule.impact}
            </label>
            <input
              type="range"
              min="0"
              max="20"
              value={Math.abs(newRule.impact)}
              onChange={(e) => setNewRule({
                ...newRule,
                impact: newRule.type === 'boost' ? parseInt(e.target.value) : -parseInt(e.target.value)
              })}
              className="w-full"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default PersonaDetail
