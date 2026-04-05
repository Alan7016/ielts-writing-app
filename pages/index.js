import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

const ADMIN_USER = 'teacher'
const ADMIN_PASS = 'ielts2024'

export default function App() {
  const [screen, setScreen] = useState('auth')
  const [authTab, setAuthTab] = useState('login')
  const [currentUser, setCurrentUser] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Auth fields
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [regName, setRegName] = useState('')
  const [regUser, setRegUser] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regPass2, setRegPass2] = useState('')
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')

  // Home
  const [mySubs, setMySubs] = useState([])

  // Exam
  const [tasks, setTasks] = useState({ task1_instructions: '', task1_image: '', task2_prompt: '' })
  const [ans1, setAns1] = useState('')
  const [ans2, setAns2] = useState('')
  const [part, setPart] = useState(1)
  const [timeLeft, setTimeLeft] = useState(3600)
  const [timerRunning, setTimerRunning] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const timerRef = useRef(null)

  // Admin
  const [adminTask1Img, setAdminTask1Img] = useState('')
  const [adminTask1Text, setAdminTask1Text] = useState('')
  const [adminTask2, setAdminTask2] = useState('')
  const [imgPreview, setImgPreview] = useState('')
  const [students, setStudents] = useState([])
  const [allSubs, setAllSubs] = useState([])
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(timerRef.current)
            setTimerRunning(false)
            handleSubmit()
            return 0
          }
          return t - 1
        })
      }, 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [timerRunning])

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const wc = (t) => t ? t.trim().split(/\s+/).filter(Boolean).length : 0

  const go = (s) => { setScreen(s); setError('') }

  async function doRegister() {
    setError('')
    if (!regName || !regUser || !regPass) return setError('Please fill all fields.')
    if (regPass !== regPass2) return setError('Passwords do not match.')
    if (regUser.toLowerCase() === ADMIN_USER) return setError('That username is reserved.')
    setLoading(true)
    const { data: existing } = await supabase.from('users').select('id').eq('username', regUser.toLowerCase()).single()
    if (existing) { setLoading(false); return setError('Username already taken.') }
    const { error: err } = await supabase.from('users').insert({ username: regUser.toLowerCase(), full_name: regName, password: regPass })
    setLoading(false)
    if (err) return setError('Error creating account. Try again.')
    setCurrentUser({ username: regUser.toLowerCase(), full_name: regName })
    await loadMySubs(regUser.toLowerCase())
    go('home')
  }

  async function doLogin() {
    setError('')
    setLoading(true)
    const { data, error: err } = await supabase.from('users').select('*').eq('username', loginUser.toLowerCase()).eq('password', loginPass).single()
    setLoading(false)
    if (err || !data) return setError('Incorrect username or password.')
    setCurrentUser({ username: data.username, full_name: data.full_name })
    await loadMySubs(data.username)
    go('home')
  }

  function doAdminLogin() {
    setError('')
    if (adminUser === ADMIN_USER && adminPass === ADMIN_PASS) {
      setCurrentUser({ username: ADMIN_USER, full_name: 'Teacher', isAdmin: true })
      loadAdmin()
      go('admin')
    } else {
      setError('Incorrect admin credentials.')
    }
  }

  function logout() {
    clearInterval(timerRef.current)
    setTimerRunning(false)
    setCurrentUser(null)
    setAns1(''); setAns2('')
    go('auth')
  }

  async function loadMySubs(username) {
    const { data } = await supabase.from('submissions').select('*').eq('username', username).order('submitted_at', { ascending: false })
    setMySubs(data || [])
  }

  async function goWarn() {
    const { data } = await supabase.from('tasks').select('*').eq('id', 1).single()
    if (!data || (!data.task1_instructions && !data.task2_prompt)) {
      return setError('No tasks uploaded yet. Ask your teacher to add tasks first.')
    }
    setTasks(data)
    setError('')
    go('warn')
  }

  function startExam() {
    setAns1(''); setAns2('')
    setTimeLeft(3600)
    setPart(1)
    setTimerRunning(true)
    go('exam')
  }

  async function handleSubmit() {
    clearInterval(timerRef.current)
    setTimerRunning(false)
    setShowConfirm(false)
    await supabase.from('submissions').insert({
      username: currentUser.username,
      full_name: currentUser.full_name,
      task1_answer: ans1,
      task2_answer: ans2
    })
    go('done')
  }

  async function loadAdmin() {
    const { data: t } = await supabase.from('tasks').select('*').eq('id', 1).single()
    if (t) {
      setAdminTask1Text(t.task1_instructions || '')
      setAdminTask2(t.task2_prompt || '')
      if (t.task1_image) setImgPreview(t.task1_image)
    }
    const { data: u } = await supabase.from('users').select('*').order('created_at', { ascending: false })
    setStudents(u || [])
    const { data: s } = await supabase.from('submissions').select('*').order('submitted_at', { ascending: false })
    setAllSubs(s || [])
  }

  function handleImgUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setAdminTask1Img(ev.target.result)
      setImgPreview(ev.target.result)
    }
    reader.readAsDataURL(file)
  }

  async function saveTasks() {
    const imgToSave = adminTask1Img || imgPreview
    await supabase.from('tasks').upsert({
      id: 1,
      task1_instructions: adminTask1Text,
      task1_image: imgToSave,
      task2_prompt: adminTask2,
      updated_at: new Date().toISOString()
    })
    setSaveMsg('Tasks saved!')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const timerColor = timeLeft <= 300 ? '#c00' : '#185FA5'

  return (
    <>
      <Head>
        <title>IELTS Writing Practice</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #111; font-size: 15px; }
        input, textarea, select { width: 100%; padding: 9px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; font-family: inherit; background: #fff; color: #111; resize: vertical; }
        input:focus, textarea:focus { outline: none; border-color: #185FA5; }
        .btn { padding: 10px 20px; border: 1px solid #ddd; border-radius: 8px; background: #fff; color: #111; font-size: 14px; cursor: pointer; font-family: inherit; display: block; width: 100%; margin-top: 10px; }
        .btn:hover { background: #f0f0f0; }
        .btn-blue { background: #185FA5; color: #fff; border-color: #185FA5; }
        .btn-blue:hover { background: #0C447C; }
        .btn-red { background: #A32D2D; color: #fff; border-color: #A32D2D; width: auto; margin-top: 0; }
        .btn-sm { width: auto; margin-top: 0; padding: 7px 14px; font-size: 13px; }
        .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 1.25rem; margin-top: 12px; }
        .lbl { font-size: 13px; color: #666; display: block; margin-top: 12px; margin-bottom: 5px; }
        .err { color: #A32D2D; font-size: 13px; margin-top: 8px; }
        .ok { color: #0F6E56; font-size: 13px; margin-top: 8px; }
        .logo { color: #c00; font-weight: 700; font-size: 20px; letter-spacing: -0.5px; }
        .tabs { display: flex; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; margin-bottom: 1rem; }
        .tab { flex: 1; padding: 9px; border: none; background: #fff; color: #888; font-size: 13px; cursor: pointer; font-family: inherit; }
        .tab.on { background: #f5f5f5; color: #111; font-weight: 500; }
        .ptab { flex: 1; padding: 7px; border: none; font-size: 13px; cursor: pointer; font-family: inherit; border-radius: 6px; background: transparent; color: #888; }
        .ptab.on { background: #fff; color: #111; font-weight: 500; }
        .upload-box { border: 2px dashed #ddd; border-radius: 8px; padding: 1rem; text-align: center; cursor: pointer; color: #888; font-size: 13px; margin-top: 6px; }
        .upload-box:hover { background: #fafafa; border-color: #185FA5; }
        .modal-bg { position: fixed; top:0;left:0;right:0;bottom:0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
      `}</style>

      {/* AUTH */}
      {screen === 'auth' && (
        <div style={{ maxWidth: 400, margin: '3rem auto', padding: '0 1rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div className="logo">IELTS</div>
            <div style={{ fontSize: 22, fontWeight: 500, marginTop: 6 }}>Writing Practice</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Timed exam simulation</div>
          </div>
          <div className="card" style={{ marginTop: 0 }}>
            <div className="tabs">
              <button className={`tab ${authTab === 'login' ? 'on' : ''}`} onClick={() => { setAuthTab('login'); setError('') }}>Sign in</button>
              <button className={`tab ${authTab === 'reg' ? 'on' : ''}`} onClick={() => { setAuthTab('reg'); setError('') }}>Create account</button>
              <button className={`tab ${authTab === 'admin' ? 'on' : ''}`} onClick={() => { setAuthTab('admin'); setError('') }}>Teacher</button>
            </div>

            {authTab === 'login' && (
              <div>
                <label className="lbl" style={{ marginTop: 0 }}>Username</label>
                <input value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="Your username" onKeyDown={e => e.key === 'Enter' && doLogin()} />
                <label className="lbl">Password</label>
                <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="Your password" onKeyDown={e => e.key === 'Enter' && doLogin()} />
                {error && <div className="err">{error}</div>}
                <button className="btn btn-blue" onClick={doLogin} disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
              </div>
            )}

            {authTab === 'reg' && (
              <div>
                <label className="lbl" style={{ marginTop: 0 }}>Full name</label>
                <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="Your full name" />
                <label className="lbl">Username</label>
                <input value={regUser} onChange={e => setRegUser(e.target.value)} placeholder="Choose a username" />
                <label className="lbl">Password</label>
                <input type="password" value={regPass} onChange={e => setRegPass(e.target.value)} placeholder="Choose a password" />
                <label className="lbl">Confirm password</label>
                <input type="password" value={regPass2} onChange={e => setRegPass2(e.target.value)} placeholder="Repeat password" />
                {error && <div className="err">{error}</div>}
                <button className="btn btn-blue" onClick={doRegister} disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
              </div>
            )}

            {authTab === 'admin' && (
              <div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>Teacher / Admin access</div>
                <label className="lbl" style={{ marginTop: 0 }}>Admin username</label>
                <input value={adminUser} onChange={e => setAdminUser(e.target.value)} placeholder="teacher" />
                <label className="lbl">Admin password</label>
                <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="ielts2024" onKeyDown={e => e.key === 'Enter' && doAdminLogin()} />
                {error && <div className="err">{error}</div>}
                <button className="btn btn-blue" onClick={doAdminLogin}>Enter admin panel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HOME */}
      {screen === 'home' && (
        <div style={{ maxWidth: 540, margin: '2rem auto', padding: '0 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <div className="logo">IELTS</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Welcome, {currentUser?.full_name}</div>
            </div>
            <button className="btn btn-sm" onClick={logout}>Sign out</button>
          </div>
          <div className="card" style={{ border: '2px solid #185FA5', marginTop: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 16 }}>Timed writing practice</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 6, lineHeight: 1.6 }}>Full 60-minute IELTS Writing exam. Task 1 + Task 2. Timer cannot be paused once started.</div>
            {error && <div className="err">{error}</div>}
            <button className="btn btn-blue" style={{ marginTop: 12 }} onClick={goWarn}>Start timed practice</button>
          </div>
          <div className="card">
            <div style={{ fontWeight: 500, marginBottom: 10 }}>My submissions</div>
            {mySubs.length === 0
              ? <div style={{ fontSize: 13, color: '#888' }}>No submissions yet. Start your first practice!</div>
              : mySubs.map((s, i) => (
                <div key={i} style={{ borderTop: '1px solid #eee', padding: '8px 0' }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{new Date(s.submitted_at).toLocaleString()}</div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Task 1: {wc(s.task1_answer)} words · Task 2: {wc(s.task2_answer)} words</div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* WARN */}
      {screen === 'warn' && (
        <div style={{ maxWidth: 460, margin: '3rem auto', padding: '0 1rem' }}>
          <div className="card" style={{ marginTop: 0, border: '1px solid #E24B4A' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: '#A32D2D' }}>⏱</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Before you begin</div>
            <div style={{ fontSize: 14, lineHeight: 2.1, color: '#555' }}>
              • Timer starts the moment you click <strong>Start</strong><br />
              • You have <strong>60 minutes</strong> total<br />
              • Task 1: at least 150 words (suggested 20 min)<br />
              • Task 2: at least 250 words (suggested 40 min)<br />
              • The timer <strong>cannot be paused</strong><br />
              • Your work saves automatically on submit
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.2rem' }}>
              <button className="btn btn-sm" onClick={() => go('home')}>Cancel</button>
              <button className="btn btn-blue btn-sm" onClick={startExam}>Start — 60:00</button>
            </div>
          </div>
        </div>
      )}

      {/* EXAM */}
      {screen === 'exam' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '10px 1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div className="logo" style={{ fontSize: 16 }}>IELTS Writing</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', gap: 4, background: '#f5f5f5', borderRadius: 8, padding: 3 }}>
                <button className={`ptab ${part === 1 ? 'on' : ''}`} onClick={() => setPart(1)}>Task 1</button>
                <button className={`ptab ${part === 2 ? 'on' : ''}`} onClick={() => setPart(2)}>Task 2</button>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'monospace', color: timerColor, minWidth: 65 }}>{fmt(timeLeft)}</div>
            </div>
            <button className="btn btn-red btn-sm" onClick={() => setShowConfirm(true)}>Submit</button>
          </div>
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', borderRight: '1px solid #eee' }}>
              {part === 1 && (
                <div>
                  <div style={{ background: '#f5f5f5', padding: '9px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
                    <strong>Task 1</strong> — Spend about 20 minutes. Write at least <strong>150 words</strong>.
                  </div>
                  {tasks.task1_image && (
                    <img src={tasks.task1_image} alt="Task 1 chart" style={{ width: '100%', borderRadius: 6, border: '1px solid #eee', marginBottom: 12 }} />
                  )}
                  <div style={{ fontSize: 14, lineHeight: 1.7 }}>{tasks.task1_instructions}</div>
                </div>
              )}
              {part === 2 && (
                <div>
                  <div style={{ background: '#f5f5f5', padding: '9px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
                    <strong>Task 2</strong> — Spend about 40 minutes. Write at least <strong>250 words</strong>.
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.7 }}>{tasks.task2_prompt}</div>
                </div>
              )}
            </div>
            <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
              {part === 1 && (
                <textarea value={ans1} onChange={e => setAns1(e.target.value)} placeholder="Write your Task 1 response here..." style={{ flex: 1, fontSize: 14, lineHeight: 1.8, minHeight: 400 }} />
              )}
              {part === 2 && (
                <textarea value={ans2} onChange={e => setAns2(e.target.value)} placeholder="Write your Task 2 response here..." style={{ flex: 1, fontSize: 14, lineHeight: 1.8, minHeight: 400 }} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8 }}>
                <span style={{ color: '#888' }}>Words: {wc(part === 1 ? ans1 : ans2)}</span>
                {part === 1 && wc(ans1) < 150 && <span style={{ color: '#A32D2D' }}>{150 - wc(ans1)} more needed</span>}
                {part === 1 && wc(ans1) >= 150 && <span style={{ color: '#0F6E56' }}>Minimum reached</span>}
                {part === 2 && wc(ans2) < 250 && <span style={{ color: '#A32D2D' }}>{250 - wc(ans2)} more needed</span>}
                {part === 2 && wc(ans2) >= 250 && <span style={{ color: '#0F6E56' }}>Minimum reached</span>}
              </div>
            </div>
          </div>
          {showConfirm && (
            <div className="modal-bg">
              <div className="card" style={{ maxWidth: 320, textAlign: 'center', margin: '1rem' }}>
                <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 16 }}>Submit your answers?</div>
                <div style={{ fontSize: 13, color: '#666', marginBottom: '1rem', lineHeight: 1.6 }}>This will end your exam. Make sure you have answered both tasks.</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="btn btn-sm" onClick={() => setShowConfirm(false)}>Go back</button>
                  <button className="btn btn-blue btn-sm" onClick={handleSubmit}>Yes, submit</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DONE */}
      {screen === 'done' && (
        <div style={{ maxWidth: 400, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
          <div className="card" style={{ marginTop: 0 }}>
            <div style={{ fontSize: 40, color: '#0F6E56', marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>Submitted!</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 8, lineHeight: 1.6 }}>Your writing has been saved. Your teacher will review it shortly.</div>
            <button className="btn btn-blue" style={{ marginTop: '1rem' }} onClick={() => { loadMySubs(currentUser.username); go('home') }}>Back to home</button>
          </div>
        </div>
      )}

      {/* ADMIN */}
      {screen === 'admin' && (
        <div style={{ maxWidth: 960, margin: '1.5rem auto', padding: '0 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <div className="logo">IELTS</div>
              <div style={{ fontSize: 13, color: '#888' }}>Admin panel</div>
            </div>
            <button className="btn btn-sm" onClick={logout}>Sign out</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: 12 }}>
            <div>
              <div className="card" style={{ marginTop: 0 }}>
                <div style={{ fontWeight: 500, marginBottom: 12 }}>Upload tasks</div>
                <div style={{ background: '#f9f9f9', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Task 1</div>
                  <label className="lbl" style={{ marginTop: 0 }}>Chart / graph image</label>
                  <div className="upload-box" onClick={() => document.getElementById('img-input').click()}>
                    {imgPreview
                      ? <img src={imgPreview} alt="preview" style={{ maxWidth: '100%', borderRadius: 6 }} />
                      : <div>Click to upload image (JPG, PNG)</div>
                    }
                  </div>
                  <input id="img-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImgUpload} />
                  {imgPreview && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Click box to change image</div>}
                  <label className="lbl">Written instructions</label>
                  <textarea value={adminTask1Text} onChange={e => setAdminTask1Text(e.target.value)} style={{ minHeight: 80, fontSize: 13 }} placeholder="The chart below shows... Summarise the information..." />
                </div>
                <div style={{ background: '#f9f9f9', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Task 2</div>
                  <label className="lbl" style={{ marginTop: 0 }}>Essay question</label>
                  <textarea value={adminTask2} onChange={e => setAdminTask2(e.target.value)} style={{ minHeight: 100, fontSize: 13 }} placeholder="Some people believe that... Discuss both views..." />
                </div>
                <button className="btn btn-blue" onClick={saveTasks}>Save tasks</button>
                {saveMsg && <div className="ok">{saveMsg}</div>}
              </div>
              <div className="card">
                <div style={{ fontWeight: 500, marginBottom: 8 }}>Students ({students.length})</div>
                {students.length === 0
                  ? <div style={{ fontSize: 13, color: '#888' }}>No students registered yet.</div>
                  : students.map((s, i) => (
                    <div key={i} style={{ borderTop: '1px solid #eee', padding: '6px 0', fontSize: 13 }}>
                      <strong>{s.full_name}</strong> <span style={{ color: '#888' }}>@{s.username}</span>
                    </div>
                  ))
                }
              </div>
            </div>
            <div className="card" style={{ marginTop: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 500 }}>Submissions ({allSubs.length})</div>
                <button className="btn btn-sm" onClick={loadAdmin}>Refresh</button>
              </div>
              <div style={{ maxHeight: 700, overflowY: 'auto' }}>
                {allSubs.length === 0
                  ? <div style={{ fontSize: 13, color: '#888' }}>No submissions yet.</div>
                  : allSubs.map((s, i) => (
                    <div key={i} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ fontSize: 14 }}>{s.full_name} <span style={{ fontWeight: 400, color: '#888' }}>@{s.username}</span></strong>
                        <span style={{ fontSize: 11, color: '#888' }}>{new Date(s.submitted_at).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Task 1 — {wc(s.task1_answer)} words</div>
                          <div style={{ background: '#f9f9f9', padding: 8, borderRadius: 6, fontSize: 12, lineHeight: 1.6, maxHeight: 130, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{s.task1_answer || <em>No answer</em>}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Task 2 — {wc(s.task2_answer)} words</div>
                          <div style={{ background: '#f9f9f9', padding: 8, borderRadius: 6, fontSize: 12, lineHeight: 1.6, maxHeight: 130, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{s.task2_answer || <em>No answer</em>}</div>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
