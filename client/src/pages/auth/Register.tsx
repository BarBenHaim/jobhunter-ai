import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '@/services/auth.api'
import { setAuthToken } from '@/services/api'
import {
  AuthLayout,
  authButtonCls,
  authErrorCls,
  authInputCls,
  extractErrorMessage,
} from './AuthLayout'

export default function Register() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    setLoading(true)
    try {
      const res = await authApi.register(email, password, fullName)
      setAuthToken(res.accessToken, res.refreshToken)
      navigate('/', { replace: true })
    } catch (err) {
      setError(extractErrorMessage(err, 'Registration failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Start your AI-powered job search">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className={authErrorCls}>{error}</div>}

        <input
          type="text"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
          className={authInputCls}
        />

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className={authInputCls}
        />

        <input
          type="password"
          placeholder="Password (min 8 chars, letters + numbers)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={authInputCls}
        />

        <input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
          className={authInputCls}
        />

        <button type="submit" disabled={loading} className={authButtonCls}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <div className="text-sm text-gray-300">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-primary-300 hover:text-primary-200 font-medium">
            Sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
