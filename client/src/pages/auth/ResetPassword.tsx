import { useState, FormEvent, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '@/services/auth.api'
import {
  AuthLayout,
  authButtonCls,
  authErrorCls,
  authInputCls,
  authSuccessCls,
  extractErrorMessage,
} from './AuthLayout'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') || '')
  const [token, setToken] = useState(params.get('token') || '')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setEmail(params.get('email') || '')
    setToken(params.get('token') || '')
  }, [params])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    setLoading(true)
    try {
      await authApi.resetPassword(email, token, newPassword)
      setDone(true)
      setTimeout(() => navigate('/auth/login', { replace: true }), 2000)
    } catch (err) {
      setError(extractErrorMessage(err, 'Reset failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Set new password">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className={authErrorCls}>{error}</div>}
        {done && (
          <div className={authSuccessCls}>
            Password reset successfully. Redirecting to sign in…
          </div>
        )}

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={authInputCls}
        />

        <input
          type="text"
          placeholder="Reset token (from email)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          className={authInputCls}
        />

        <input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={authInputCls}
        />

        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          className={authInputCls}
        />

        <button type="submit" disabled={loading || done} className={authButtonCls}>
          {loading ? 'Resetting…' : 'Reset password'}
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
