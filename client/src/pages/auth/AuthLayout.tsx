import { ReactNode } from 'react'

export const AuthLayout = ({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) => {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--canvas)' }}
      dir="rtl"
    >
      {/* Top bar — mirrors LinkedIn's public nav */}
      <header className="px-6 py-4 border-b" style={{ borderColor: 'var(--divider)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-500 text-white font-bold text-lg">
              J
            </div>
            <span className="text-[20px] font-bold" style={{ color: 'var(--brand)' }}>
              JobHunter
            </span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-[14px]">
            <a href="/auth/register" className="font-semibold">
              הצטרפות
            </a>
            <a href="/auth/login" className="font-semibold">
              כניסה
            </a>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-start justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-[400px] animate-fade-in">
          {/* Heading outside the card — LinkedIn style */}
          <div className="mb-6 text-center sm:text-right">
            <h1 className="text-[28px] sm:text-[32px] leading-[36px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-secondary)' }}>
                {subtitle}
              </p>
            )}
          </div>

          {/* White card with form */}
          <div
            className="bg-white rounded-[8px] p-6 sm:p-8"
            style={{
              border: '1px solid var(--border)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.06)',
            }}
          >
            {children}
          </div>

          {footer && <div className="mt-6 text-center">{footer}</div>}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 border-t" style={{ borderColor: 'var(--divider)' }}>
        <div className="max-w-6xl mx-auto text-center text-[12px]" style={{ color: 'var(--ink-tertiary)' }}>
          JobHunter AI © {new Date().getFullYear()} · חיפוש עבודה חכם להייטק הישראלי
        </div>
      </footer>
    </div>
  )
}

// Input — LinkedIn-style rectangular input with label
export const authInputCls =
  'w-full px-3 py-[10px] text-[14px] bg-white text-[rgba(0,0,0,0.9)] placeholder-[rgba(0,0,0,0.45)] rounded transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 min-h-[48px]'

export const authInputStyle: React.CSSProperties = {
  border: '1px solid rgba(0,0,0,0.6)',
  borderRadius: '4px',
}

// Primary button — full width, pill, bold, LinkedIn blue
export const authButtonCls =
  'w-full h-[52px] rounded-pill bg-primary-500 text-white text-[16px] font-semibold transition-colors duration-150 hover:bg-primary-600 active:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2'

// Error banner — red background with border
export const authErrorCls =
  'p-3 rounded text-[13px] bg-error-50 text-error-700 border border-error-100'

// Success banner — green background with border
export const authSuccessCls =
  'p-3 rounded text-[13px] bg-success-50 text-success-700 border border-success-100'

// Label above input — LinkedIn style
export const authLabelCls =
  'block text-[14px] font-semibold mb-1 text-[rgba(0,0,0,0.9)]'

export const extractErrorMessage = (err: any, fallback = 'משהו השתבש. נסה שוב.'): string => {
  const data = err?.response?.data
  if (typeof data === 'string') return data
  if (typeof data?.error === 'string') return data.error
  if (typeof data?.message === 'string') return data.message
  if (typeof err?.message === 'string') return err.message
  return fallback
}
