import { ReactNode } from 'react'

export const AuthLayout = ({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) => {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-gray-950 via-primary-950 to-purple-950 px-4 py-10">
      {/* Background orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl animate-float" />
      <div
        className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float"
        style={{ animationDelay: '1.5s' }}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-600/10 rounded-full blur-3xl" />

      <div className="relative animate-scale-in rounded-3xl border border-white/10 bg-white/5 p-10 text-center backdrop-blur-xl shadow-2xl max-w-md w-full">
        {/* Logo */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-purple-500 shadow-lg shadow-primary-500/30">
          <svg
            className="h-8 w-8 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-white tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-gray-300/80">{subtitle}</p>}

        <div className="mt-8">{children}</div>
      </div>
    </div>
  )
}

export const authInputCls =
  'w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-primary-500/50 transition-colors'

export const authButtonCls =
  'w-full rounded-2xl bg-gradient-to-r from-primary-500 to-purple-500 px-8 py-3.5 text-white font-semibold text-lg shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:from-primary-400 hover:to-purple-400 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed'

export const authErrorCls =
  'p-3 rounded-xl bg-error-500/10 border border-error-500/30 text-error-300 text-sm'

export const authSuccessCls =
  'p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-sm'

export const extractErrorMessage = (err: any, fallback = 'Something went wrong'): string => {
  const data = err?.response?.data
  if (typeof data === 'string') return data
  if (typeof data?.error === 'string') return data.error
  if (typeof data?.message === 'string') return data.message
  if (typeof err?.message === 'string') return err.message
  return fallback
}
