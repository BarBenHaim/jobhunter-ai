import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '@/services/auth.api'
import {
  AuthLayout,
  authButtonCls,
  authErrorCls,
  authInputCls,
  authSuccessCls,
  extractErrorMessage,
} from './AuthLayout'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [devToken, setDevToken] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.forgotPassword(email)
      setSent(true)
      if (res.devToken) setDevToken(res.devToken)
    } catch (err) {
      setError(extractErrorMessage(err, 'Request failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Reset password"
      subtitle="We'll send a reset link to your email"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className={authErrorCls}>{error}</div>}
        {sent && (
          <div className={authSuccessCls}>
            If an account exists for that email, a reset link has been sent.
            {devToken && (
              <div className="mt-2 text-xs break-all">
                <strong>Dev token:</strong> {devToken}
              </div>
            )}
          </div>
        )}

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={sent}
          className={authInputCls}
        />

        <button type="submit" disabled={loading || sent} className={authButtonCls}>
          {loading ? 'Sending…' : sent ? 'Link sent' : 'Send reset link'}
        </button>

        <div className="text-sm text-gray-300">
          <Link to="/auth/login" className="text-primary-300 hover:text-primary-200 font-medium">
            Back to sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
