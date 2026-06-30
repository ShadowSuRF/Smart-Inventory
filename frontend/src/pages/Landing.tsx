import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const FEATURES = [
  { icon:'📦', title:'Real-Time Inventory', desc:'Track stok dengan fill level visual, filter kategori, dan CRUD lengkap. Data terisolasi per akun.' },
  { icon:'🧠', title:'AI Demand Forecasting', desc:'Gradient Boosting 95.8% accuracy + NumPy LSTM 94.2%. Forecast 30/90/180 hari ke depan.' },
  { icon:'📡', title:'IoT Sensor Network', desc:'14 sensor virtual di 7 zona. Monitoring suhu, kelembaban, berat secara real-time per user.' },
  { icon:'🌱', title:'Waste Prevention', desc:'Alert produk kadaluarsa ≤7 hari. Rekomendasi AI: flash sale, bundle, donation, promotion.' },
  { icon:'🔄', title:'Auto Replenishment', desc:'Saran order otomatis dari stok kritis. Bulk order high-priority, manajemen supplier.' },
  { icon:'💰', title:'Profit & Loss', desc:'P&L bulanan interaktif. Revenue vs profit chart, waste breakdown, filter 3M/6M/12M/All.' },
]

const STACK = [
  'React 18','TypeScript','Node.js 20','MongoDB Atlas','Python / Flask',
  'scikit-learn','NumPy LSTM','HiveMQ MQTT','JWT Auth','Tailwind CSS',
]

const STATS = [
  { value:'95.8', suffix:'%', label:'Forecast Accuracy', sub:'Gradient Boosting model' },
  { value:'31850', suffix:'', label:'Training Rows', sub:'Jan 2024 – Jun 2026' },
  { value:'11', suffix:'', label:'Halaman Fungsional', sub:'Full-stack web app' },
  { value:'4280', prefix:'$', label:'Waste Prevented/bulan', sub:'Estimasi penghematan' },
]

function StatNumber({ target, prefix='', suffix='', started }: { target:number; prefix?:string; suffix?:string; started:boolean }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!started) return
    let start = Date.now()
    const dur = 1400
    const tick = () => {
      const p = Math.min((Date.now()-start)/dur,1)
      const eased = 1-Math.pow(1-p,3)
      setVal(Math.round(target*eased))
      if (p<1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [started, target])
  return <>{prefix}{val.toLocaleString()}{suffix}</>
}

export default function Landing() {
  const navigate  = useNavigate()
  const token     = localStorage.getItem('token')
  const [scrolled, setScrolled] = useState(false)
  const [statsVisible, setStatsVisible] = useState(false)
  const statsRef  = useRef<HTMLDivElement>(null)
  // section visibility states (no hooks in map)
  const [featsVis, setFeatsVis]   = useState<boolean[]>(Array(6).fill(false))
  const [stackVis, setStackVis]   = useState<boolean[]>(Array(10).fill(false))
  const [tierVis, setTierVis]     = useState<boolean[]>(Array(4).fill(false))
  const featsRef  = useRef<(HTMLDivElement|null)[]>([])
  const stackRef  = useRef<(HTMLDivElement|null)[]>([])
  const tierRef   = useRef<(HTMLDivElement|null)[]>([])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY>20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Stats observer
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsVisible(true) }, { threshold:0.2 })
    if (statsRef.current) obs.observe(statsRef.current)
    return () => obs.disconnect()
  }, [])

  // Feature cards observer
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        const idx = featsRef.current.indexOf(e.target as HTMLDivElement)
        if (e.isIntersecting && idx>=0) setFeatsVis(p => { const n=[...p]; n[idx]=true; return n })
      })
    }, { threshold:0.1 })
    featsRef.current.forEach(el => el && obs.observe(el))
    return () => obs.disconnect()
  }, [])

  // Stack chips observer
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        const idx = stackRef.current.indexOf(e.target as HTMLDivElement)
        if (e.isIntersecting && idx>=0) setStackVis(p => { const n=[...p]; n[idx]=true; return n })
      })
    }, { threshold:0.1 })
    stackRef.current.forEach(el => el && obs.observe(el))
    return () => obs.disconnect()
  }, [])

  // Tier cards observer
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        const idx = tierRef.current.indexOf(e.target as HTMLDivElement)
        if (e.isIntersecting && idx>=0) setTierVis(p => { const n=[...p]; n[idx]=true; return n })
      })
    }, { threshold:0.1 })
    tierRef.current.forEach(el => el && obs.observe(el))
    return () => obs.disconnect()
  }, [])

  const goApp = () => navigate(token ? '/dashboard' : '/login')
  const TIER_COLORS = ['#2563eb','#8b5cf6','#16a34a','#f59e0b']
  const TIER_DATA = [
    { tier:'Presentation', items:['React 18','TypeScript','Tailwind CSS','Vite 5'], icon:'🖥️' },
    { tier:'Application',  items:['Node.js 20','Express','TypeScript','JWT Auth'], icon:'⚙️' },
    { tier:'Data',         items:['MongoDB Atlas','Mongoose','userId isolation','TTL index'], icon:'🗄️' },
    { tier:'ML + IoT',     items:['Python Flask','GB 95.8%','NumPy LSTM','HiveMQ MQTT'], icon:'🧠' },
  ]

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-x-hidden">

      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-sm border-b border-slate-100 dark:border-slate-800' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏪</span>
            <span className="font-semibold text-sm">Smart Inventory</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-500 dark:text-slate-400">
            {[['#features','Fitur'],['#tech','Stack'],['#stats','Stats']].map(([href,label])=>(
              <a key={href} href={href} className="hover:text-slate-900 dark:hover:text-white transition-colors">{label}</a>
            ))}
          </div>
          <div className="flex gap-3 items-center">
            {token ? (
              <button onClick={()=>navigate('/dashboard')}
                className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-all hover:opacity-90 active:scale-95"
                style={{backgroundColor:'var(--ac)'}}>Dashboard →</button>
            ) : <>
              <button onClick={()=>navigate('/login')}
                className="text-sm px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                Login
              </button>
              <button onClick={()=>navigate('/register')}
                className="text-sm px-4 py-2 rounded-lg font-medium text-white transition-all hover:opacity-90 active:scale-95"
                style={{backgroundColor:'var(--ac)'}}>Mulai Gratis</button>
            </>}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 max-w-6xl mx-auto text-center">
        <div className="animate-fade-in-scale inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-8 border"
          style={{backgroundColor:'var(--acl)',borderColor:'var(--ac)',color:'var(--ac)'}}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{backgroundColor:'var(--ac)'}}/>
          BINUS University · Enrichment Program 2026/2027 · IT Developer
        </div>

        <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6 animate-fade-in-up delay-100">
          Smart Inventory<br/>
          <span style={{
            background:'linear-gradient(135deg, var(--ac) 0%, #8b5cf6 100%)',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
          }}>& Waste Reducer</span>
        </h1>

        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto mb-10 animate-fade-in-up delay-200">
          Sistem manajemen inventori full-stack dengan AI demand forecasting 95.8% accuracy,
          IoT real-time monitoring, dan multi-user data isolation berbasis MongoDB.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-in-up delay-300">
          <button onClick={goApp}
            className="px-8 py-3 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 hover:scale-105 active:scale-95"
            style={{backgroundColor:'var(--ac)',boxShadow:'0 8px 24px var(--acl)'}}>
            {token ? '→ Buka Dashboard' : '🚀 Coba Sekarang'}
          </button>
          <a href="#features"
            className="px-8 py-3 rounded-xl font-semibold text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all hover:scale-105">
            Lihat Fitur ↓
          </a>
        </div>

        {/* App mockup preview */}
        <div className="mt-16 animate-fade-in-up delay-500 relative">
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-2xl bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center gap-1.5 px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
              <span className="w-3 h-3 rounded-full bg-red-400"/>
              <span className="w-3 h-3 rounded-full bg-amber-400"/>
              <span className="w-3 h-3 rounded-full bg-green-400"/>
              <div className="ml-3 flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded-full max-w-xs flex items-center px-3 text-xs text-slate-400">
                localhost:3000/dashboard
              </div>
            </div>
            <div className="p-4 grid grid-cols-4 gap-3">
              {[
                {label:'Total Items',    value:'8.420', icon:'📦', color:'#2563eb'},
                {label:'Stock Value',   value:'$142K', icon:'📈', color:'#16a34a'},
                {label:'Waste Rate',   value:'2.4%',  icon:'🌱', color:'#8b5cf6'},
                {label:'Critical',     value:'3',     icon:'⚠️',  color:'#ef4444'},
              ].map((k,i)=>(
                <div key={k.label} className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700 animate-fade-in-scale"
                  style={{animationDelay:`${600+i*80}ms`}}>
                  <div className="text-xs text-slate-400 mb-1">{k.icon} {k.label}</div>
                  <div className="text-lg font-bold" style={{color:k.color}}>{k.value}</div>
                  <div className="mt-1.5 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{width:'70%',backgroundColor:k.color,
                      animation:`bar-grow 1s ease ${800+i*80}ms both`}}/>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">AI Demand Forecast</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">95.8% accuracy</span>
                </div>
                <div className="flex items-end gap-1 h-14">
                  {[45,60,52,78,65,88,72,95,84,76,90,85].map((h,i)=>(
                    <div key={i} className="flex-1 rounded-sm"
                      style={{height:`${h}%`,backgroundColor:i>=8?'#2563eb40':'var(--ac)',opacity:i>=8?0.5:0.8,
                        animation:`bar-grow 0.5s ease ${700+i*40}ms both`}}/>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-slate-300 dark:text-slate-600 mt-1">
                  <span>Jan</span><span>Apr</span><span>Jul</span><span>→ Forecast</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="stats" ref={statsRef}
        className="py-20 border-y border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-12">
          {STATS.map((s,i)=>(
            <div key={s.label} className="text-center"
              style={{transition:`opacity 0.7s ease ${i*120}ms, transform 0.7s ease ${i*120}ms`,
                opacity:statsVisible?1:0, transform:statsVisible?'none':'translateY(24px)'}}>
              <div className="text-4xl font-bold mb-1" style={{color:'var(--ac)'}}>
                <StatNumber target={parseFloat(s.value)} prefix={s.prefix||''} suffix={s.suffix} started={statsVisible}/>
              </div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'var(--ac)'}}>Fitur Lengkap</div>
          <h2 className="text-3xl font-bold">Semua yang kamu butuhkan</h2>
          <p className="text-slate-400 mt-3 text-sm">11 halaman fungsional · Data per-user terisolasi · Real-time</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f,i)=>(
            <div key={f.title}
              ref={el=>{featsRef.current[i]=el}}
              className="card card-hover"
              style={{transition:`opacity 0.6s ease ${i*80}ms, transform 0.6s ease ${i*80}ms`,
                opacity:featsVis[i]?1:0, transform:featsVis[i]?'none':'translateY(24px)'}}>
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="py-20 bg-slate-50 dark:bg-slate-900/50 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Arsitektur 4 Tier</h2>
            <p className="text-slate-400 mt-2 text-sm">Full-stack modern dengan ML & IoT integration</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {TIER_DATA.map((t,i)=>(
              <div key={t.tier}
                ref={el=>{tierRef.current[i]=el}}
                className="card card-hover text-center"
                style={{transition:`opacity 0.5s ease ${i*100}ms, transform 0.5s ease ${i*100}ms`,
                  opacity:tierVis[i]?1:0, transform:tierVis[i]?'none':'translateY(20px)'}}>
                <div className="text-2xl mb-2">{t.icon}</div>
                <div className="text-xs font-bold mb-3 uppercase tracking-wider" style={{color:TIER_COLORS[i]}}>{t.tier}</div>
                {t.items.map(item=>(
                  <div key={item} className="text-xs text-slate-400 py-0.5">{item}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section id="tech" className="py-24 px-6 max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">Tech Stack</h2>
          <p className="text-slate-400 mt-2 text-sm">Teknologi modern untuk production-grade app</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {STACK.map((s,i)=>(
            <div key={s}
              ref={el=>{stackRef.current[i]=el}}
              className="px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 card-hover text-sm font-medium text-slate-600 dark:text-slate-300"
              style={{transition:`opacity 0.5s ease ${i*50}ms, transform 0.5s ease ${i*50}ms`,
                opacity:stackVis[i]?1:0, transform:stackVis[i]?'none':'scale(0.85)'}}>
              {s}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 text-center">
        <div className="animate-float inline-block text-5xl mb-6">🚀</div>
        <h2 className="text-3xl font-bold mb-4">Siap mencoba?</h2>
        <p className="text-slate-400 mb-8 max-w-md mx-auto text-sm">
          Daftar gratis — data kamu terisolasi sepenuhnya dari user lain menggunakan userId MongoDB.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
          <button onClick={()=>navigate('/register')}
            className="px-8 py-3 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 hover:scale-105 active:scale-95"
            style={{backgroundColor:'var(--ac)',boxShadow:'0 8px 24px var(--acl)'}}>
            Daftar Sekarang — Gratis
          </button>
          <button onClick={()=>navigate('/login')}
            className="px-8 py-3 rounded-xl font-semibold text-sm border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
            Sudah punya akun? Login →
          </button>
        </div>
        <div className="inline-block p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-left">
          <div className="text-xs font-semibold text-slate-400 mb-2">Demo account:</div>
          <div className="text-xs space-y-1">
            <div className="flex gap-4"><span className="text-slate-400 w-16">Email</span><code className="text-slate-700 dark:text-slate-200">erick@binus.edu</code></div>
            <div className="flex gap-4"><span className="text-slate-400 w-16">Password</span><code className="text-slate-700 dark:text-slate-200">password123</code></div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400">
        <div className="flex items-center justify-center gap-2 mb-1.5">
          <span>🏪</span>
          <span className="font-medium text-slate-500 dark:text-slate-400">Smart Inventory and Waste Reducer</span>
        </div>
        <div>BINUS University · Enrichment Program 2026/2027 · Erick Susanto (2702277710)</div>
        <div className="mt-1">React 18 + TypeScript · Node.js + MongoDB · Python ML · MQTT IoT</div>
      </footer>
    </div>
  )
}
