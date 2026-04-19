import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

export default function Set3() {
  const [screen, setScreen] = useState('loading')
  const [currentUser, setCurrentUser] = useState(null)
  const [error, setError] = useState('')
  const [listeningData, setListeningData] = useState(null)
  const [readingData, setReadingData] = useState(null)
  const [writingData, setWritingData] = useState(null)

  const go = (s) => { setScreen(s); setError('') }

  useEffect(() => {
    const saved = localStorage.getItem('ielts_user')
    if (!saved) { window.location.href = '/'; return }
    const user = JSON.parse(saved)
    if (user.isAdmin) { window.location.href = '/'; return }
    setCurrentUser(user)
    setScreen('home')
  }, [])

  // Listen for postMessage from iframes
  useEffect(() => {
    async function handleMessage(e) {
      if (!e.data || !currentUser) return

      if (e.data.type === 'IELTS_SCORE_S3') {
        const { module, score, results } = e.data
        if (module === 'listening') {
          await supabase.from('set3_submissions').upsert({
            username: currentUser.username,
            full_name: currentUser.full_name,
            listening_score: score,
            listening_results: results || [],
            completed_at: new Date().toISOString()
          }, { onConflict: 'username' })
          go('reading-warn')
        } else if (module === 'reading') {
          await supabase.from('set3_submissions').upsert({
            username: currentUser.username,
            full_name: currentUser.full_name,
            reading_score: score,
            reading_results: results || [],
            completed_at: new Date().toISOString()
          }, { onConflict: 'username' })
          go('writing-warn')
        }
      }

      if (e.data.type === 'IELTS_WRITING_S3') {
        const { task1, task2 } = e.data
        await supabase.from('set3_submissions').upsert({
          username: currentUser.username,
          full_name: currentUser.full_name,
          writing_task1: task1,
          writing_task2: task2,
          completed_at: new Date().toISOString()
        }, { onConflict: 'username' })
        go('done')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [currentUser])

  async function goListeningWarn() {
    setError('')
    const { data } = await supabase.from('set3_html').select('*').eq('id', 'listening').single()
    if (!data || !data.content) return setError('Listening test not uploaded yet. Ask your teacher.')
    setListeningData(data); go('listening-warn')
  }

  async function goReadingWarn() {
    setError('')
    const { data } = await supabase.from('set3_html').select('*').eq('id', 'reading').single()
    if (!data || !data.content) return setError('Reading test not uploaded yet. Ask your teacher.')
    setReadingData(data); go('reading-warn')
  }

  async function goWritingWarn() {
    setError('')
    const { data } = await supabase.from('set3_html').select('*').eq('id', 'writing').single()
    if (!data || !data.content) return setError('Writing test not uploaded yet. Ask your teacher.')
    setWritingData(data); go('writing-warn')
  }

  return (
    <>
      <Head><title>IELTS Set 3</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #111; font-size: 15px; }
        .btn { padding: 10px 20px; border: 1px solid #ddd; border-radius: 8px; background: #fff; color: #111; font-size: 14px; cursor: pointer; font-family: inherit; display: block; width: 100%; margin-top: 10px; }
        .btn-blue { background: #185FA5; color: #fff; border-color: #185FA5; }
        .btn-green { background: #0F6E56; color: #fff; border-color: #0F6E56; }
        .btn-sm { width: auto; margin-top: 0; padding: 7px 14px; font-size: 13px; }
        .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 1.25rem; margin-top: 12px; }
        .logo { color: #c00; font-weight: 700; font-size: 20px; }
        .err { color: #A32D2D; font-size: 13px; margin-top: 8px; background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 10px 14px; }
        .tag { padding: 3px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; }
      `}</style>

      {screen === 'loading' && <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>Loading...</div>}

      {/* HOME */}
      {screen === 'home' && currentUser && (
        <div style={{ maxWidth: 500, margin: '2rem auto', padding: '0 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <div className="logo">IELTS</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Set 3 — Full Mock Test</div>
            </div>
            <a href="/" style={{ padding: '7px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, color: '#111', textDecoration: 'none', background: '#fff' }}>← Home</a>
          </div>

          {error && <div className="err">{error}</div>}

          <div className="card" style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 4 }}>Welcome, {currentUser.full_name}</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 1.6 }}>Complete all three modules in order. Each module must be started and cannot be revisited.</div>

            {[
              { id: 'listening', label: 'Listening', desc: '40 questions · ~30 min', color: '#185FA5', action: goListeningWarn },
              { id: 'reading',   label: 'Reading',   desc: '40 questions · 60 min', color: '#185FA5', action: goReadingWarn },
              { id: 'writing',   label: 'Writing',   desc: 'Task 1 + Task 2 · 60 min', color: '#185FA5', action: goWritingWarn },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid #eee' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{m.desc}</div>
                </div>
                <button onClick={m.action} className="btn btn-sm" style={{ background: m.color, color: '#fff', border: 'none' }}>Start →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LISTENING WARN */}
      {screen === 'listening-warn' && (
        <div style={{ maxWidth: 460, margin: '3rem auto', padding: '0 1rem' }}>
          <div className="card" style={{ marginTop: 0, border: '1px solid #E24B4A' }}>
            <div className="logo" style={{ marginBottom: 10 }}>IELTS Set 3</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Listening Test</div>
            <div style={{ fontSize: 14, lineHeight: 2.1, color: '#555' }}>
              • <strong>4 sections</strong>, <strong>40 questions</strong><br />
              • Audio plays <strong>once</strong> per section<br />
              • Answer while listening<br />
              • After Listening → <strong>Reading</strong> starts
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.2rem' }}>
              <button className="btn btn-sm" onClick={() => go('home')}>Back</button>
              <button className="btn btn-blue btn-sm" onClick={() => go('listening-exam')}>Start Listening</button>
            </div>
          </div>
        </div>
      )}

      {/* LISTENING EXAM */}
      {screen === 'listening-exam' && listeningData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#fff', zIndex: 1000 }}>
          <iframe srcDoc={listeningData.content} style={{ width: '100%', height: '100%', border: 'none' }} />
        </div>
      )}

      {/* READING WARN */}
      {screen === 'reading-warn' && (
        <div style={{ maxWidth: 460, margin: '3rem auto', padding: '0 1rem' }}>
          <div className="card" style={{ marginTop: 0, border: '1px solid #E24B4A' }}>
            <div className="logo" style={{ marginBottom: 10 }}>IELTS Set 3</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Reading Test</div>
            <div style={{ fontSize: 14, lineHeight: 2.1, color: '#555' }}>
              • <strong>3 passages</strong>, <strong>40 questions</strong><br />
              • You have <strong>60 minutes</strong><br />
              • After Reading → <strong>Writing</strong> starts
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.2rem' }}>
              <button className="btn btn-sm" onClick={() => go('home')}>Back</button>
              <button className="btn btn-blue btn-sm" onClick={() => go('reading-exam')}>Start Reading</button>
            </div>
          </div>
        </div>
      )}

      {/* READING EXAM */}
      {screen === 'reading-exam' && readingData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#fff', zIndex: 1000 }}>
          <iframe srcDoc={readingData.content} style={{ width: '100%', height: '100%', border: 'none' }} />
        </div>
      )}

      {/* WRITING WARN */}
      {screen === 'writing-warn' && (
        <div style={{ maxWidth: 460, margin: '3rem auto', padding: '0 1rem' }}>
          <div className="card" style={{ marginTop: 0, border: '1px solid #E24B4A' }}>
            <div className="logo" style={{ marginBottom: 10 }}>IELTS Set 3</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Writing Test</div>
            <div style={{ fontSize: 14, lineHeight: 2.1, color: '#555' }}>
              • <strong>60 minutes</strong> total<br />
              • Task 1: at least <strong>150 words</strong><br />
              • Task 2: at least <strong>250 words</strong><br />
              • Timer cannot be paused
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.2rem' }}>
              <button className="btn btn-sm" onClick={() => go('home')}>Back</button>
              <button className="btn btn-blue btn-sm" onClick={() => go('writing-exam')}>Start Writing</button>
            </div>
          </div>
        </div>
      )}

      {/* WRITING EXAM */}
      {screen === 'writing-exam' && writingData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#fff', zIndex: 1000 }}>
          <iframe srcDoc={writingData.content} style={{ width: '100%', height: '100%', border: 'none' }} />
        </div>
      )}

      {/* DONE */}
      {screen === 'done' && (
        <div style={{ maxWidth: 400, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
          <div className="card" style={{ marginTop: 0 }}>
            <div style={{ fontSize: 40, color: '#0F6E56', marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>Set 3 complete!</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 8, lineHeight: 1.6 }}>Your work has been saved. Your teacher will review it shortly.</div>
            <a href="/" className="btn btn-blue" style={{ marginTop: '1rem', display: 'block', textDecoration: 'none', textAlign: 'center' }}>Back to home</a>
          </div>
        </div>
      )}
    </>
  )
}
