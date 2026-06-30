import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login } from '../lib/api'
import AppLogo from '../components/ui/AppLogo'
import toast from 'react-hot-toast'

export default function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: 'erick@binus.edu', password: 'password123' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) { setError('Email and password are required'); return }
    setLoading(true)
    try {
      const res = await login(form.email, form.password)
      const { token, user } = res.data.data
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      toast.success(`Welcome back, ${user.name}!`)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3"><AppLogo size={52} /></div>
          <h1 className="text-2xl font-bold text-white">Smart Inventory</h1>
          <p className="text-blue-300 text-sm mt-1">Waste Reducer AI — BINUS University</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Sign in</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Enter your credentials to access the system</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
              <span>⚠️</span>{error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email Address</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                disabled={loading}
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? '⏳ Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-600 hover:underline font-medium">Register here</Link>
          </div>

          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-600 dark:text-blue-400">
            <strong>Demo credentials:</strong><br />
            Email: erick@binus.edu<br />
            Password: password123
          </div>
        </div>
      </div>
    </div>
  )
}
