import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../lib/api'
import toast from 'react-hot-toast'

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', role: '', institution: '' })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Full name is required'
    if (!form.email.trim()) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email format'
    if (!form.password) e.password = 'Password is required'
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match'
    return e
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    try {
      const res = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        institution: form.institution,
      })
      const { token, user } = res.data.data
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      toast.success(`Account created! Welcome, ${user.name}!`)
      navigate('/dashboard')
    } catch (err: any) {
      setErrors({ general: err.response?.data?.error || 'Registration failed. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const field = (key: keyof typeof form, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="label">{label}</label>
      <input
        className={`input ${errors[key] ? 'border-red-400 focus:ring-red-400' : ''}`}
        type={type}
        placeholder={placeholder}
        value={form[key]}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        disabled={loading}
      />
      {errors[key] && <p className="text-xs text-red-500 mt-1">{errors[key]}</p>}
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏪</div>
          <h1 className="text-2xl font-bold text-white">Smart Inventory</h1>
          <p className="text-blue-300 text-sm mt-1">Waste Reducer AI — BINUS University</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Create Account</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Register to access the inventory system</p>

          {errors.general && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
              <span>⚠️</span>{errors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {field('name', 'Full Name', 'text', 'Erick Santoso')}
            {field('email', 'Email Address', 'email', 'you@example.com')}
            {field('role', 'Role (optional)', 'text', 'IT Developer')}
            {field('institution', 'Institution (optional)', 'text', 'BINUS University')}
            {field('password', 'Password', 'password', 'Min. 8 characters')}
            {field('confirm', 'Confirm Password', 'password', 'Repeat password')}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? '⏳ Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
