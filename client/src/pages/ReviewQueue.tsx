import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Edit2,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { EmptyState } from '@/components/common/EmptyState'

interface ReviewItem {
  id: string
  jobTitle: string
  company: string
  score: number
  personaUsed: string
  recommendation: string
  aiReasoning: string
  description: string
  generatedCV: string
  requiresChanges?: boolean
}

const ReviewQueue = () => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showCVPreview, setShowCVPreview] = useState(false)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A') {
        handleApprove()
      } else if (e.key === 'r' || e.key === 'R') {
        handleReject()
      } else if (e.key === 'n' || e.key === 'N') {
        handleNext()
      } else if (e.key === 'p' || e.key === 'P') {
        handlePrevious()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentIndex])

  // Fetch review queue
  const { data: reviewQueue } = useQuery<ReviewItem[]>({
    queryKey: ['review-queue'],
    queryFn: async () => [],
  })

  if (!reviewQueue || reviewQueue.length === 0) {
    return <EmptyState
      icon={FileText}
      title="Review Queue Empty"
      description="No pending applications to review"
    />
  }

  const currentItem = reviewQueue[currentIndex]

  const handleApprove = () => {
    console.log(`Approved: ${currentItem.jobTitle}`)
    if (currentIndex < reviewQueue.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handleReject = () => {
    console.log(`Rejected: ${currentItem.jobTitle}`)
    if (currentIndex < reviewQueue.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handleNext = () => {
    if (currentIndex < reviewQueue.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setShowCVPreview(false)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setShowCVPreview(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header with counters */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Review Queue</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            <Badge variant="warning" size="sm">
              {reviewQueue.length} pending
            </Badge>
          </p>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {currentIndex + 1} of {reviewQueue.length}
        </div>
      </div>

      {/* Main Review Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Queue List */}
        <div className="lg:col-span-1">
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Pending Reviews</h2>
            <div className="space-y-2">
              {reviewQueue.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentIndex(index)
                    setShowCVPreview(false)
                  }}
                  className={`w-full text-left rounded-lg p-3 border-2 transition-all ${
                    currentIndex === index
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                  }`}
                >
                  <p className="font-medium text-gray-900 dark:text-white">{item.jobTitle}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{item.company}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="primary" size="sm">
                      {item.score}%
                    </Badge>
                    {item.requiresChanges && (
                      <AlertCircle size={14} className="text-yellow-600 dark:text-yellow-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Panel - Detail View */}
        <div className="lg:col-span-2 space-y-4">
          {/* Job Info Card */}
          <Card>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{currentItem.jobTitle}</h2>
                <p className="text-lg text-gray-600 dark:text-gray-400">{currentItem.company}</p>
              </div>
              <Badge variant="primary" size="md">
                {currentItem.score}%
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-200 dark:border-gray-800 mb-4">
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Persona</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{currentItem.personaUsed}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Status</p>
                {currentItem.requiresChanges ? (
                  <Badge variant="warning" size="sm" className="mt-1">
                    Needs Changes
                  </Badge>
                ) : (
                  <Badge variant="success" size="sm" className="mt-1">
                    Ready
                  </Badge>
                )}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AI Recommendation</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{currentItem.aiReasoning}</p>
            </div>
          </Card>

          {/* Job Description */}
          <Card>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Job Description</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{currentItem.description}</p>
          </Card>

          {/* CV Preview */}
          <Card>
            <button
              onClick={() => setShowCVPreview(!showCVPreview)}
              className="w-full flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded transition-colors mb-3"
            >
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-primary-600 dark:text-primary-400" />
                <span className="font-medium text-gray-900 dark:text-white">Generated CV</span>
              </div>
              <span className="text-xs text-gray-500">{showCVPreview ? 'Hide' : 'Show'}</span>
            </button>

            {showCVPreview && (
              <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-800 p-3 rounded">
                  {currentItem.generatedCV}
                </p>
              </div>
            )}
          </Card>

          {/* Action Buttons */}
          <Card>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={handleApprove}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-white hover:bg-green-700 font-medium transition-colors"
                >
                  <Check size={18} />
                  Approve
                  <span className="text-xs opacity-75">(A)</span>
                </button>
                <button
                  onClick={handleReject}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-white hover:bg-red-700 font-medium transition-colors"
                >
                  <X size={18} />
                  Reject
                  <span className="text-xs opacity-75">(R)</span>
                </button>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium transition-colors">
                  <Edit2 size={18} />
                  Edit CV
                </button>
                <button className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium transition-colors">
                  Request Changes
                </button>
              </div>
            </div>

            {/* Keyboard Shortcuts Help */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Keyboard Shortcuts:</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                <div>
                  <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">A</span> - Approve
                </div>
                <div>
                  <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">R</span> - Reject
                </div>
                <div>
                  <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">N</span> - Next
                </div>
                <div>
                  <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">P</span> - Previous
                </div>
              </div>
            </div>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 rounded-lg px-4 py-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800 font-medium transition-colors"
            >
              <ChevronLeft size={18} />
              Previous
            </button>

            <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {currentIndex + 1} / {reviewQueue.length}
            </div>

            <button
              onClick={handleNext}
              disabled={currentIndex === reviewQueue.length - 1}
              className="flex items-center gap-2 rounded-lg px-4 py-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800 font-medium transition-colors"
            >
              Next
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReviewQueue
