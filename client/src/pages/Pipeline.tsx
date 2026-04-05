import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Plus,
  MoreVertical,
  Calendar,
  Building2,
  TrendingUp,
  Clock,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { EmptyState } from '@/components/common/EmptyState'
import { AppStatus, Application } from '@/types'

interface PipelineCard {
  id: string
  jobTitle: string
  company: string
  personaUsed: string
  score: number
  daysSinceActivity: number
  status: AppStatus
  lastUpdate: Date
}

interface DragState {
  draggedCard: PipelineCard | null
  sourceColumn: AppStatus
}

const Pipeline = () => {
  const columns: { status: AppStatus; label: string; color: string }[] = [
    { status: AppStatus.DRAFT, label: 'Draft', color: 'bg-gray-100 dark:bg-gray-800' },
    { status: AppStatus.SUBMITTED, label: 'Applied', color: 'bg-blue-100 dark:bg-blue-900' },
    { status: AppStatus.IN_PROGRESS, label: 'Viewed', color: 'bg-yellow-100 dark:bg-yellow-900' },
    { status: AppStatus.INTERVIEW, label: 'Interview', color: 'bg-purple-100 dark:bg-purple-900' },
    { status: AppStatus.OFFER, label: 'Offer', color: 'bg-green-100 dark:bg-green-900' },
    { status: AppStatus.REJECTED, label: 'Rejected', color: 'bg-red-100 dark:bg-red-900' },
    { status: AppStatus.WITHDRAWN, label: 'Withdrawn', color: 'bg-gray-100 dark:bg-gray-800' },
  ]

  const [dragState, setDragState] = useState<DragState>({ draggedCard: null, sourceColumn: AppStatus.DRAFT })
  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null)

  // Fetch applications grouped by status
  const { data: cardsByStatus } = useQuery<Record<AppStatus, PipelineCard[]>>({
    queryKey: ['pipeline-cards'],
    queryFn: async () => ({
      [AppStatus.DRAFT]: [
        {
          id: '1',
          jobTitle: 'Senior Developer',
          company: 'TechCorp',
          personaUsed: 'Backend Specialist',
          score: 88,
          daysSinceActivity: 1,
          status: AppStatus.DRAFT,
          lastUpdate: new Date(Date.now() - 1 * 60 * 60 * 1000),
        },
      ],
      [AppStatus.SUBMITTED]: [
        {
          id: '2',
          jobTitle: 'React Engineer',
          company: 'StartupXYZ',
          personaUsed: 'Frontend Pro',
          score: 92,
          daysSinceActivity: 3,
          status: AppStatus.SUBMITTED,
          lastUpdate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
        {
          id: '3',
          jobTitle: 'Full Stack Developer',
          company: 'WebCo',
          personaUsed: 'Full Stack Master',
          score: 78,
          daysSinceActivity: 7,
          status: AppStatus.SUBMITTED,
          lastUpdate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      ],
      [AppStatus.IN_PROGRESS]: [
        {
          id: '4',
          jobTitle: 'Frontend Developer',
          company: 'Creative Studios',
          personaUsed: 'Frontend Pro',
          score: 85,
          daysSinceActivity: 2,
          status: AppStatus.IN_PROGRESS,
          lastUpdate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
        {
          id: '5',
          jobTitle: 'Senior Engineer',
          company: 'TechGiants',
          personaUsed: 'Backend Specialist',
          score: 81,
          daysSinceActivity: 5,
          status: AppStatus.IN_PROGRESS,
          lastUpdate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        },
      ],
      [AppStatus.INTERVIEW]: [
        {
          id: '6',
          jobTitle: 'DevOps Engineer',
          company: 'CloudSys',
          personaUsed: 'Infrastructure Expert',
          score: 87,
          daysSinceActivity: 1,
          status: AppStatus.INTERVIEW,
          lastUpdate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        },
      ],
      [AppStatus.OFFER]: [
        {
          id: '7',
          jobTitle: 'Product Manager',
          company: 'InnovateCo',
          personaUsed: 'Product Specialist',
          score: 86,
          daysSinceActivity: 0,
          status: AppStatus.OFFER,
          lastUpdate: new Date(),
        },
      ],
      [AppStatus.REJECTED]: [
        {
          id: '8',
          jobTitle: 'QA Engineer',
          company: 'TestPro',
          personaUsed: 'QA Specialist',
          score: 42,
          daysSinceActivity: 10,
          status: AppStatus.REJECTED,
          lastUpdate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        },
      ],
      [AppStatus.WITHDRAWN]: [],
    }),
  })

  const handleDragStart = (card: PipelineCard, status: AppStatus) => {
    setDragState({ draggedCard: card, sourceColumn: status })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (targetStatus: AppStatus) => {
    if (dragState.draggedCard && dragState.sourceColumn !== targetStatus) {
      // In a real app, this would update the application status via API
      console.log(`Move ${dragState.draggedCard.jobTitle} from ${dragState.sourceColumn} to ${targetStatus}`)
    }
    setDragState({ draggedCard: null, sourceColumn: AppStatus.DRAFT })
  }

  const getAgeColor = (days: number): 'success' | 'warning' | 'error' => {
    if (days <= 2) return 'success'
    if (days <= 7) return 'warning'
    return 'error'
  }

  const getAgeLabel = (days: number) => {
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    return `${days}d ago`
  }

  return (
    <div className="space-y-4">
      {/* Pipeline Controls */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Application Pipeline</h1>
        <button className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 font-medium">
          <Plus size={18} />
          Add Manual Entry
        </button>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: 'fit-content' }}>
          {columns.map((column) => (
            <div
              key={column.status}
              className="flex-shrink-0 w-80"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(column.status)}
            >
              {/* Column Header */}
              <div className={`${column.color} rounded-t-lg p-4 border-b border-gray-200 dark:border-gray-700`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900 dark:text-white">{column.label}</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {cardsByStatus?.[column.status]?.length || 0} items
                    </p>
                  </div>
                </div>
              </div>

              {/* Column Cards */}
              <div className="space-y-3 bg-gray-50 dark:bg-gray-900 p-4 rounded-b-lg min-h-96">
                {cardsByStatus?.[column.status]?.length ? (
                  cardsByStatus[column.status].map((card) => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => handleDragStart(card, column.status)}
                      onClick={() => setSelectedCard(card)}
                      className={`rounded-lg p-3 border-2 border-transparent cursor-move transition-all ${
                        selectedCard?.id === card.id
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'bg-white dark:bg-gray-800 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                            {card.jobTitle}
                          </h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{card.company}</p>
                        </div>
                        <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                          <MoreVertical size={14} className="text-gray-400" />
                        </button>
                      </div>

                      <div className="space-y-2">
                        {/* Score Badge */}
                        <Badge variant="primary" size="sm">
                          Score: {card.score}%
                        </Badge>

                        {/* Persona Badge */}
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          <span className="inline-block bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                            {card.personaUsed}
                          </span>
                        </div>

                        {/* Activity Age */}
                        <div className="flex items-center gap-2">
                          <Clock size={12} className={`text-${getAgeColor(card.daysSinceActivity)}-600`} />
                          <Badge variant={getAgeColor(card.daysSinceActivity)} size="sm">
                            {getAgeLabel(card.daysSinceActivity)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No items</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail View Modal */}
      {selectedCard && (
        <Card className="mt-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedCard.jobTitle}</h2>
              <p className="text-gray-600 dark:text-gray-400">{selectedCard.company}</p>
            </div>
            <button
              onClick={() => setSelectedCard(null)}
              className="rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 p-2"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b border-gray-200 dark:border-gray-800">
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Score</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{selectedCard.score}%</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Persona</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{selectedCard.personaUsed}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Status</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{selectedCard.status}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Last Activity</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{getAgeLabel(selectedCard.daysSinceActivity)}</p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium text-sm">
              Move to...
            </button>
            <button className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 font-medium text-sm">
              Edit Details
            </button>
            <button className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 font-medium text-sm">
              Follow-up
            </button>
            <button className="px-4 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 font-medium text-sm">
              Archive
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}

export default Pipeline
