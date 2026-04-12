import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

export default function Set2() {
  const router = useRouter()
  const [screen, setScreen] = useState('loading')
  const [currentUser, setCurrentUser] = useState(null)
  const [module, setModule] = useState(null) // 'listening' | 'reading' | 'writing'
  const [listeningHtml, setListeningHtml] = useState('')
  const [readingHtml, setReadingHtml] = useState('')
  const [writingHtml, setWritingHtml] = useState('')
  const [progress, setProgress] = useState({ listening: false, reading: false, writing: false })
  const [error, setError] = useState('')

  // Writing state (same robust system as main platform)
  const [ans1, setAns1] = useState('')
  const [ans2, setAns2] = useState('')
  const ans1Ref = useRef('')
  const ans2Ref = useRef('')
  const submittedRef = useRef(false)
  const [timeLeft, setTimeLeft] = useState(3600)
  const [timerRunning, setTimerRunning] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showExitWarning, setShowExitWarning] = useState(false)
  const [writingPart, setWritingPart] = useState(1)
  const examStartTimeRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const saved = localStorage.getItem('ielts_user')
    if (!saved) { router.push('/'); return }
    const user = JSON.parse(saved)
    setCurrentUser(user)
    loadSet2(user.username)
  }, [])

  async function loadSet2(username) {
    // Load HTML files
    const { data: htmlData } = await supabase.from('set2_html').select('*')
    if (htmlData) {
      const l = htmlData.find(h => h.id === 'listening')
      const r = htmlData.find(h => h.id === 'reading')
      const w = htmlData.find(h => h.id === 'writing')
      if (l) setListeningHtml(l.content || '')
      if (r) setReadingHtml(r.content || '')
      if (w) setWritingHtml(w.content || '')
    }
    // Check existing progress
    const { data: sub } = await supabase.from('set2_submissions')
      .select('*').eq('username', username).single()
    if (sub) {
      setProgress({
        listening: sub.listening_score !== null,
        reading: sub.reading_score !== null,
        writing: sub.writing_task1 !== null
      })
    }
    setScreen('home')
  }

  // Score listener from iframes
  useEffect(() => {
    async function handleMessage(e) {
      if (!e.data || e.data.type !== 'IELTS_SCORE') return
      const { module: mod, score, band, results, resultsHtml, task1, task2 } = e.data
      if (!currentUser) return

      if (mod === 'listening') {
        await supabase.from('set2_submissions').upsert({
          username: currentUser.username,
          full_name: currentUser.full_name,
          listening_score: score,
          listening_band: String(band),
          listening_results: results || []
        }, { onConflict: 'username' })
        setProgress(p => ({ ...p, listening: true }))
        setScreen('home')
      } else if (mod === 'reading') {
        await supabase.from('set2_submissions').upsert({
          username: currentUser.username,
          full_name: currentUser.full_name,
          reading_score: score,
          reading_band: String(band),
          reading_results_html: resultsHtml || ''
        }, { onConflict: 'username' })
        setProgress(p => ({ ...p, reading: true }))
        setScreen('home')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [currentUser])

  // Writing timer (wall clock)
  useEffect(() => {
    if (timerRunning) {
      examStartTimeRef.current = examStartTimeRef.current || Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - examStartTimeRef.current) / 1000)
        const remaining = 3600 - elapsed
        if (remaining <= 0) {
          clearInterval(timerRef.current)
          setTimerRunning(false)
          setTimeLeft(0)
          handleWritingSubmit()
        } else {
          setTimeLeft(remaining)
        }
      }, 500)
    }
    return () => clearInterval(timerRef.current)
  }, [timerRunning])

  // Auto-save every second
  useEffect(() => {
    if (screen !== 'writing' || !currentUser) return
    const interval = setInterval(() => {
      const t1 = ans1Ref.current || ans1
      const t2 = ans2Ref.current || ans2
      if (submittedRef.current) return
      localStorage.setItem('set2_writing_' + currentUser.username, JSON.stringify({ t1, t2 }))
      setSavedIndicator(true)
    }, 1000)
    return () => clearInterval(interval)
  }, [screen, currentUser])

  // Fullscreen & exit protection
  useEffect(() => {
    if (screen !== 'writing') return
    function handleFSChange() {
      const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement)
      if (!isFS) setShowExitWarning(true)
    }
    function handleKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setShowExitWarning(true) }
    }
    function handleVisibility() {
      if (document.hidden) setShowExitWarning(true)
    }
    function handleUnload(e) {
      e.preventDefault(); e.returnValue = 'Exam in progress!'
      return e.returnValue
    }
    document.addEventListener('fullscreenchange', handleFSChange)
    document.addEventListener('webkitfullscreenchange', handleFSChange)
    document.addEventListener('keydown', handleKey, true)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      document.removeEventListener('fullscreenchange', handleFSChange)
      document.removeEventListener('webkitfullscreenchange', handleFSChange)
      document.removeEventListener('keydown', handleKey, true)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [screen])

  function startWriting() {
    setAns1(''); setAns2('')
    ans1Ref.current = ''; ans2Ref.current = ''
    submittedRef.current = false
    examStartTimeRef.current = Date.now()
    setTimeLeft(3600); setWritingPart(1); setTimerRunning(true)
    setScreen('writing')
    try {
      const el = document.documentElement
      if (el.requestFullscreen) el.requestFullscreen()
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
    } catch(e) {}
  }

  async function handleWritingSubmit() {
    if (submittedRef.current) return
    submittedRef.current = true
    clearInterval(timerRef.current); setTimerRunning(false); setShowConfirm(false)
    let t1 = ans1Ref.current || ans1
    let t2 = ans2Ref.current || ans2
    if (!t1 && !t2 && currentUser) {
      try {
        const backup = localStorage.getItem('set2_writing_' + currentUser.username)
        if (backup) { const p = JSON.parse(backup); t1 = p.t1 || ''; t2 = p.t2 || '' }
      } catch(e) {}
    }
    const { error } = await supabase.from('set2_submissions').upsert({
      username: currentUser.username,
      full_name: currentUser.full_name,
      writing_task1: t1,
      writing_task2: t2,
      completed_at: new Date().toISOString()
    }, { onConflict: 'username' })
    if (error) {
      submittedRef.current = false
      alert('Error saving! Screenshot your work: ' + error.message)
      return
    }
    try { localStorage.removeItem('set2_writing_' + currentUser.username) } catch(e) {}
    setProgress(p => ({ ...p, writing: true }))
    setScreen('done')
  }

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const timerColor = timeLeft <= 300 ? '#c00' : '#185FA5'
  const wc = (t) => t ? t.trim().split(/\s+/).filter(Boolean).length : 0

  return (
    <>
      <Head><title>IELTS Set 2 — Full Mock</title><meta name="viewport" content="width=device-width,initial-scale=1"/></Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #111; }
        .btn { padding: 10px 20px; border: 1px solid #ddd; border-radius: 8px; background: #fff; color: #111; font-size: 14px; cursor: pointer; font-family: inherit; }
        .btn:hover { background: #f0f0f0; }
        .btn-blue { background: #185FA5; color: #fff; border-color: #185FA5; }
        .btn-blue:hover { background: #0C447C; }
        .btn-red { background: #A32D2D; color: #fff; border-color: #A32D2D; }
        .btn-sm { padding: 7px 14px; font-size: 13px; }
        .btn-gray { background: #888; color: #fff; border-color: #888; cursor: not-allowed; }
        .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 1.25rem; margin-top: 12px; }
        .logo { color: #c00; font-weight: 700; font-size: 20px; }
        .ptab { padding: 7px 14px; border: none; font-size: 13px; cursor: pointer; font-family: inherit; border-radius: 6px; background: transparent; color: #888; }
        .ptab.on { background: #fff; color: #111; font-weight: 500; }
        .modal-bg { position: fixed; top:0;left:0;right:0;bottom:0; background: rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:100; }
      `}</style>

      {screen === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 16, color: '#888' }}>Loading Set 2...</div>
      )}

      {/* HOME — MODULE SELECTOR */}
      {screen === 'home' && (
        <div style={{ maxWidth: 560, margin: '2rem auto', padding: '0 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <div className="logo">IELTS</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Set 2 — Full Mock Test · {currentUser?.full_name}</div>
            </div>
            <button className="btn btn-sm" onClick={() => router.push('/')}>← Back</button>
          </div>

          {error && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#A32D2D', marginBottom: 12 }}>{error}</div>}

          {/* LISTENING */}
          <div className="card" style={{ marginTop: 0, border: progress.listening ? '1px solid #0F6E56' : '2px solid #185FA5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>
                  {progress.listening ? '✓ ' : '1. '}Listening Test
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>4 sections · 40 questions · ~30 minutes</div>
              </div>
              {progress.listening
                ? <div style={{ color: '#0F6E56', fontWeight: 500, fontSize: 14 }}>Completed</div>
                : <button className="btn btn-blue btn-sm" onClick={() => setScreen('listening')}>Start</button>
              }
            </div>
          </div>

          {/* READING */}
          <div className="card" style={{ border: progress.reading ? '1px solid #0F6E56' : progress.listening ? '2px solid #185FA5' : '1px solid #e5e5e5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>
                  {progress.reading ? '✓ ' : '2. '}Reading Test
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>3 passages · 40 questions · 60 minutes</div>
                {!progress.listening && <div style={{ fontSize: 12, color: '#A32D2D', marginTop: 4 }}>Complete Listening first</div>}
              </div>
              {progress.reading
                ? <div style={{ color: '#0F6E56', fontWeight: 500, fontSize: 14 }}>Completed</div>
                : <button
                    className={`btn btn-sm ${progress.listening ? 'btn-blue' : 'btn-gray'}`}
                    onClick={() => { if (progress.listening) setScreen('reading') else setError('You must complete Listening before Reading.') }}
                  >Start</button>
              }
            </div>
          </div>

          {/* WRITING */}
          <div className="card" style={{ border: progress.writing ? '1px solid #0F6E56' : progress.reading ? '2px solid #185FA5' : '1px solid #e5e5e5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>
                  {progress.writing ? '✓ ' : '3. '}Writing Test
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Task 1 + Task 2 · 60 minutes</div>
                {!progress.reading && <div style={{ fontSize: 12, color: '#A32D2D', marginTop: 4 }}>Complete Reading first</div>}
              </div>
              {progress.writing
                ? <div style={{ color: '#0F6E56', fontWeight: 500, fontSize: 14 }}>Completed</div>
                : <button
                    className={`btn btn-sm ${progress.reading ? 'btn-blue' : 'btn-gray'}`}
                    onClick={() => { if (progress.reading) setScreen('writing-warn') else setError('You must complete Reading before Writing.') }}
                  >Start</button>
              }
            </div>
          </div>

          {progress.listening && progress.reading && progress.writing && (
            <div className="card" style={{ textAlign: 'center', background: '#E1F5EE', border: '1px solid #9FE1CB' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🎉</div>
              <div style={{ fontWeight: 500 }}>All done! Great work.</div>
              <div style={{ fontSize: 13, color: '#0F6E56', marginTop: 4 }}>Your teacher will share your results soon.</div>
            </div>
          )}
        </div>
      )}

      {/* LISTENING — IFRAME */}
      {screen === 'listening' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#fff', zIndex: 1000 }}>
          {listeningHtml
            ? <iframe srcDoc={listeningHtml} style={{ width: '100%', height: '100%', border: 'none' }} />
            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 16, color: '#888' }}>Listening test not uploaded yet.</div>
                <button className="btn btn-sm" onClick={() => setScreen('home')}>Back</button>
              </div>
          }
        </div>
      )}

      {/* READING — IFRAME */}
      {screen === 'reading' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#fff', zIndex: 1000 }}>
          {readingHtml
            ? <iframe srcDoc={readingHtml} style={{ width: '100%', height: '100%', border: 'none' }} />
            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 16, color: '#888' }}>Reading test not uploaded yet.</div>
                <button className="btn btn-sm" onClick={() => setScreen('home')}>Back</button>
              </div>
          }
        </div>
      )}

      {/* WRITING WARN */}
      {screen === 'writing-warn' && (
        <div style={{ maxWidth: 460, margin: '3rem auto', padding: '0 1rem' }}>
          <div className="card" style={{ marginTop: 0, border: '1px solid #E24B4A' }}>
            <div className="logo" style={{ marginBottom: 10 }}>IELTS</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Writing Test</div>
            <div style={{ fontSize: 14, lineHeight: 2.1, color: '#555' }}>
              • Timer starts when you click <strong>Start</strong><br />
              • <strong>60 minutes</strong> total — Task 1 (20 min) + Task 2 (40 min)<br />
              • Minimum: Task 1 = 150 words · Task 2 = 250 words<br />
              • Timer <strong>cannot be paused</strong><br />
              • Work saves automatically every second ✓
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.2rem' }}>
              <button className="btn btn-sm" onClick={() => setScreen('home')}>Back</button>
              <button className="btn btn-blue btn-sm" onClick={startWriting}>Start Writing</button>
            </div>
          </div>
        </div>
      )}

      {/* WRITING EXAM */}
      {screen === 'writing' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '10px 1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="logo" style={{ fontSize: 16 }}>IELTS Writing</div>
              {savedIndicator && <div style={{ fontSize: 12, color: '#0F6E56' }}>✓ Saved</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', gap: 4, background: '#f5f5f5', borderRadius: 8, padding: 3 }}>
                <button className={`ptab ${writingPart===1?'on':''}`} onClick={() => setWritingPart(1)}>Task 1</button>
                <button className={`ptab ${writingPart===2?'on':''}`} onClick={() => setWritingPart(2)}>Task 2</button>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'monospace', color: timerColor }}>{fmt(timeLeft)}</div>
            </div>
            <button className="btn btn-red btn-sm" onClick={() => setShowConfirm(true)}>Submit</button>
          </div>
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', borderRight: '1px solid #eee' }}>
              {writingPart === 1 && (
                <div>
                  <div style={{ background: '#f5f5f5', padding: '9px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}><strong>Task 1</strong> — ~20 minutes. At least <strong>150 words</strong>.</div>
                  <div style={{ fontSize: 14, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: writingHtml ? extractTask(writingHtml, 1) : '<p>Writing task not loaded.</p>' }} />
                </div>
              )}
              {writingPart === 2 && (
                <div>
                  <div style={{ background: '#f5f5f5', padding: '9px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}><strong>Task 2</strong> — ~40 minutes. At least <strong>250 words</strong>.</div>
                  <div style={{ fontSize: 14, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: writingHtml ? extractTask(writingHtml, 2) : '<p>Writing task not loaded.</p>' }} />
                </div>
              )}
            </div>
            <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
              <textarea value={ans1} onChange={e => { setAns1(e.target.value); ans1Ref.current = e.target.value }} placeholder="Write your Task 1 response here..." style={{ flex: 1, fontSize: 14, lineHeight: 1.8, minHeight: 400, display: writingPart === 1 ? 'block' : 'none', resize: 'none', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'inherit' }} />
              <textarea value={ans2} onChange={e => { setAns2(e.target.value); ans2Ref.current = e.target.value }} placeholder="Write your Task 2 response here..." style={{ flex: 1, fontSize: 14, lineHeight: 1.8, minHeight: 400, display: writingPart === 2 ? 'block' : 'none', resize: 'none', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8 }}>
                <span style={{ color: '#888' }}>Words: {wc(writingPart===1?ans1:ans2)}</span>
                {writingPart===1 && <span style={{ color: wc(ans1)>=150?'#0F6E56':'#A32D2D' }}>{wc(ans1)>=150?'Minimum reached':(150-wc(ans1))+' more needed'}</span>}
                {writingPart===2 && <span style={{ color: wc(ans2)>=250?'#0F6E56':'#A32D2D' }}>{wc(ans2)>=250?'Minimum reached':(250-wc(ans2))+' more needed'}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DONE */}
      {screen === 'done' && (
        <div style={{ maxWidth: 400, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
          <div className="card" style={{ marginTop: 0 }}>
            <div style={{ fontSize: 40, color: '#0F6E56', marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>Set 2 Complete!</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 8, lineHeight: 1.6 }}>All three modules submitted. Your teacher will share your results soon.</div>
            <button className="btn btn-blue" style={{ marginTop: '1rem', width: '100%' }} onClick={() => router.push('/')}>Back to home</button>
          </div>
        </div>
      )}

      {/* SUBMIT CONFIRM */}
      {showConfirm && (
        <div className="modal-bg">
          <div className="card" style={{ maxWidth: 320, textAlign: 'center', margin: '1rem' }}>
            <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 8 }}>Submit writing?</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: '1rem', lineHeight: 1.6 }}>Make sure you have written both tasks.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-sm" onClick={() => setShowConfirm(false)}>Go back</button>
              <button className="btn btn-blue btn-sm" onClick={handleWritingSubmit}>Yes, submit</button>
            </div>
          </div>
        </div>
      )}

      {/* EXIT WARNING */}
      {showExitWarning && (
        <div className="modal-bg">
          <div className="card" style={{ maxWidth: 360, textAlign: 'center', margin: '1rem', border: '2px solid #A32D2D' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 16, color: '#A32D2D' }}>Do not leave the exam!</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: '1rem', lineHeight: 1.7 }}>
              The timer is still running. Your work is saved every second automatically.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-red btn-sm" onClick={() => { setShowExitWarning(false); handleWritingSubmit() }}>Submit now</button>
              <button className="btn btn-blue btn-sm" onClick={() => {
                setShowExitWarning(false)
                try { const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen() } catch(e) {}
              }}>Return to exam</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function extractTask(html, taskNum) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const part = doc.getElementById(`part-${taskNum}`)
    return part ? part.innerHTML : `<p>Task ${taskNum} content</p>`
  } catch(e) {
    return `<p>Task ${taskNum}</p>`
  }
}
