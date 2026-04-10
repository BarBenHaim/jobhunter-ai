import { useState, FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { authApi } from '@/services/auth.api'
import { setAuthToken } from '@/services/api'
import {
  AuthLayout,
  authButtonCls,
  authErrorCls,
  authInputCls,
  extractErrorMessage,
} from './AuthLayout'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const redirectTo = (location.state as any)?.from || '/'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(email, password)
      setAuthToken(res.accessToken, res.refreshToken)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(extractErrorMessage(err, 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back to JobHunter AI">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className={authErrorCls}>{error}</div>}

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
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className={authInputCls}
        />

        <div className="text-right">
          <Link
            to="/auth/forgot-password"
            className="text-sm text-primary-300 hover:text-primary-200 transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={loading} className={authButtonCls}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="text-sm text-gray-300">
          Don't have an account?{' '}
          <Link to="/auth/register" className="text-primary-300 hover:text-primary-200 font-medium">
            Create one
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
