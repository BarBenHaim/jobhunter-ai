import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  pages: number
  onPageChange: (page: number) => void
}

export const Pagination = ({ page, pages, onPageChange }: PaginationProps) => {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="rounded-lg border border-gray-200 bg-white p-2 disabled:opacity-50 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
      >
        <ChevronLeft size={18} />
      </button>

      {/* Page numbers */}
      {Array.from({ length: Math.min(5, pages) }, (_, i) => {
        let pageNum = i + 1
        if (pages > 5) {
          if (page <= 3) {
            pageNum = i + 1
          } else if (page >= pages - 2) {
            pageNum = pages - 4 + i
          } else {
            pageNum = page - 2 + i
          }
        }
        return pageNum
      }).map((pageNum) => (
        <button
          key={pageNum}
          onClick={() => onPageChange(pageNum)}
          className={`rounded-lg border px-3 py-1 transition-colors ${
            page === pageNum
              ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900 dark:text-primary-200'
              : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800'
          }`}
        >
          {pageNum}
        </button>
      ))}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === pages}
        className="rounded-lg border border-gray-200 bg-white p-2 disabled:opacity-50 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
