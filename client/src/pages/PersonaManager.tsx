import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  BarChart3,
  Users,
  TrendingUp,
  MessageSquare,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { Modal } from '@/components/common/Modal'
import { EmptyState } from '@/components/common/EmptyState'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface PersonaData {
  id: string
  name: string
  title: string
  isActive: boolean
  applicationCount: number
  responseRate: number
  interviewRate: number
  offerRate: number
  description?: string
}

const PersonaManager = () => {
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({ name: '', title: '' })

  // Fetch personas
  const { data: personas } = useQuery<PersonaData[]>({
    queryKey: ['personas'],
    queryFn: async () => [
      {
        id: '1',
        name: 'Frontend Pro',
        title: 'Senior React Developer',
        isActive: true,
        applicationCount: 34,
        responseRate: 32,
        interviewRate: 18,
        offerRate: 5,
        description: 'Optimized for React and frontend-focused roles',
      },
      {
        id: '2',
        name: 'Full Stack Master',
        title: 'Full Stack Engineer',
        isActive: true,
        applicationCount: 28,
        responseRate: 25,
        interviewRate: 14,
        offerRate: 3,
        description: 'Balanced approach for full stack positions',
      },
      {
        id: '3',
        name: 'Backend Specialist',
        title: 'Senior Backend Engineer',
        isActive: true,
        applicationCount: 22,
        responseRate: 36,
        interviewRate: 16,
        offerRate: 4,
        description: 'Focused on backend and system design roles',
      },
      {
        id: '4',
        name: 'DevOps Engineer',
        title: 'Infrastructure Specialist',
        isActive: false,
        applicationCount: 12,
        responseRate: 25,
        interviewRate: 8,
        offerRate: 1,
        description: 'Kubernetes and cloud infrastructure focus',
      },
      {
        id: '5',
        name: 'Product Specialist',
        title: 'Senior Product Manager',
        isActive: false,
        applicationCount: 8,
        responseRate: 20,
        interviewRate: 4,
        offerRate: 0,
        description: 'Targeting product management positions',
      },
    ],
  })

  // Fetch performance comparison data
  const { data: comparisonData } = useQuery({
    queryKey: ['personas-comparison'],
    queryFn: async () => [
      { name: 'Frontend Pro', responseRate: 32, interviewRate: 18, offerRate: 5 },
      { name: 'Full Stack Master', responseRate: 25, interviewRate: 14, offerRate: 3 },
      { name: 'Backend Specialist', responseRate: 36, interviewRate: 16, offerRate: 4 },
      { name: 'DevOps Engineer', responseRate: 25, interviewRate: 8, offerRate: 1 },
      { name: 'Product Specialist', responseRate: 20, interviewRate: 4, offerRate: 0 },
    ],
  })

  const handleCreatePersona = () => {
    if (formData.name && formData.title) {
      console.log('Create persona:', formData)
      setFormData({ name: '', title: '' })
      setIsModalOpen(false)
    }
  }

  const totalApplications = personas?.reduce((sum, p) => sum + p.applicationCount, 0) || 0
  const avgResponseRate = personas ? Math.round(personas.reduce((sum, p) => sum + p.responseRate, 0) / personas.length) : 0

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Personas</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {personas?.filter(p => p.isActive).length || 0}
              </p>
            </div>
            <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900">
              <Users className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Applications</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{totalApplications}</p>
            </div>
            <div className="rounded-lg bg-purple-100 p-3 dark:bg-purple-900">
              <TrendingUp className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Response Rate</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{avgResponseRate}%</p>
            </div>
            <div className="rounded-lg bg-green-100 p-3 dark:bg-green-900">
              <MessageSquare className="text-green-600 dark:text-green-400" size={24} />
            </div>
          </div>
        </Card>
      </div>

      {/* Persona Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Your Personas</h2>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 font-medium"
          >
            <Plus size={18} />
            New Persona
          </button>
        </div>

        {personas && personas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {personas.map((persona) => (
              <Card
                key={persona.id}
                hover
                className="cursor-pointer"
                onClick={() => navigate(`/personas/${persona.id}`)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{persona.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{persona.title}</p>
                  </div>
                  {persona.isActive ? (
                    <Badge variant="success" size="sm">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="gray" size="sm">
                      Inactive
                    </Badge>
                  )}
                </div>

                {persona.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{persona.description}</p>
                )}

                {/* Stats Grid */}
                <div className="space-y-2 border-t border-gray-200 dark:border-gray-800 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Applications</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{persona.applicationCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Response Rate</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{persona.responseRate}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Interview Rate</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{persona.interviewRate}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Offer Rate</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{persona.offerRate}%</span>
                  </div>
                </div>

                {/* Edit Button */}
                <button className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium transition-colors">
                  Edit Configuration
                </button>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No personas yet"
            description="Create your first persona to get started"
            action={{
              label: 'Create Persona',
              onClick: () => setIsModalOpen(true),
            }}
          />
        )}
      </div>

      {/* Performance Comparison */}
      {comparisonData && comparisonData.length > 0 && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Performance Comparison</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(229, 231, 235)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: 'rgb(31, 41, 55)', border: 'none', borderRadius: '8px', color: 'white' }} />
              <Legend />
              <Bar dataKey="responseRate" fill="rgb(59, 130, 246)" name="Response Rate %" />
              <Bar dataKey="interviewRate" fill="rgb(34, 197, 94)" name="Interview Rate %" />
              <Bar dataKey="offerRate" fill="rgb(168, 85, 247)" name="Offer Rate %" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Create Persona Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setFormData({ name: '', title: '' })
        }}
        title="Create New Persona"
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                setIsModalOpen(false)
                setFormData({ name: '', title: '' })
              }}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePersona}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium"
            >
              Create
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Persona Name
            </label>
            <input
              type="text"
              placeholder="e.g., Senior Frontend Developer"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Job Title
            </label>
            <input
              type="text"
              placeholder="e.g., Senior React Developer"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400">
            You can customize the persona's configuration, scoring rules, and schedule after creation.
          </p>
        </div>
      </Modal>
    </div>
  )
}

export default PersonaManager
