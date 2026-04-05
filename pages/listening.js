import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

const AUDIO_URLS = [
  'https://dsitketafrgrcxpncsrb.supabase.co/storage/v1/object/public/audio/AudioTrack 01.mp3',
  'https://dsitketafrgrcxpncsrb.supabase.co/storage/v1/object/public/audio/AudioTrack 02.mp3',
  'https://dsitketafrgrcxpncsrb.supabase.co/storage/v1/object/public/audio/AudioTrack 03.mp3',
  'https://dsitketafrgrcxpncsrb.supabase.co/storage/v1/object/public/audio/AudioTrack 04.mp3',
]

export default function Listening() {
  const router = useRouter()
  const [screen, setScreen] = useState('warn')
  const [currentSection, setCurrentSection] = useState(0)
  const [answers, setAnswers] = useState({})
  const [testData, setTestData] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioEnded, setAudioEnded] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    const saved = localStorage.getItem('ielts_user')
    if (!saved) { router.push('/'); return }
    const user = JSON.parse(saved)
    setCurrentUser(user)
    loadTest()
  }, [])

  async function loadTest() {
    const { data } = await supabase.from('listening_tests').select('*').eq('id', 1).single()
    if (data) setTestData(data)
  }

  function startExam() {
    setScreen('exam')
    setCurrentSection(0)
    setAudioEnded(false)
    setIsPlaying(false)
    if (audioRef.current) {
      audioRef.current.src = AUDIO_URLS[0]
      audioRef.current.load()
    }
  }

  function playPause() {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  function handleAudioEnded() {
    setIsPlaying(false)
    setAudioEnded(true)
  }

  function nextSection() {
    if (currentSection < 3) {
      const next = currentSection + 1
      setCurrentSection(next)
      setAudioEnded(false)
      setIsPlaying(false)
      if (audioRef.current) {
        audioRef.current.src = AUDIO_URLS[next]
        audioRef.current.load()
      }
    } else {
      setShowSubmitConfirm(true)
    }
  }

  function setAnswer(qNum, val) {
    setAnswers(prev => ({ ...prev, [qNum]: val }))
  }

  function toggleMultiAnswer(qNum, val, limit) {
    setAnswers(prev => {
      const current = prev[qNum] || []
      if (current.includes(val)) {
        return { ...prev, [qNum]: current.filter(v => v !== val) }
      }
      if (current.length >= limit) return prev
      return { ...prev, [qNum]: [...current, val] }
    })
  }

  async function submitExam() {
    setShowSubmitConfirm(false)
    const answerKey = testData?.answer_key || {}
    let score = 0
    Object.entries(answerKey).forEach(([qNum, correct]) => {
      const userAns = answers[qNum]
      if (Array.isArray(correct)) {
        if (Array.isArray(userAns)) {
          const sortedUser = [...userAns].map(v => v.trim().toLowerCase()).sort()
          const sortedCorrect = [...correct].map(v => v.trim().toLowerCase()).sort()
          if (JSON.stringify(sortedUser) === JSON.stringify(sortedCorrect)) score++
        }
      } else {
        if (userAns && userAns.trim().toLowerCase() === String(correct).trim().toLowerCase()) score++
      }
    })
    await supabase.from('listening_submissions').insert({
      username: currentUser.username,
      full_name: currentUser.full_name,
      answers,
      score
    })
    router.push('/reading')
  }

  function renderQuestions(questions) {
    if (!questions || !questions.length) return <div style={{ color: '#888', fontSize: 14 }}>No questions loaded.</div>
    return questions.map((q, i) => {
      if (q.type === 'gap') {
        return (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, marginBottom: 6, lineHeight: 1.7 }}>
              <strong>{q.number}.</strong> {q.before} <input
                type="text"
                value={answers[q.number] || ''}
                onChange={e => setAnswer(q.number, e.target.value)}
                style={{ display: 'inline-block', width: 140, padding: '3px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, margin: '0 6px' }}
                placeholder="..."
              /> {q.after || ''}
            </div>
          </div>
        )
      }
      if (q.type === 'mcq') {
        return (
          <div key={i} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, marginBottom: 8, fontWeight: 500 }}><strong>{q.number}.</strong> {q.question}</div>
            {q.options.map((opt, j) => (
              <label key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name={`q${q.number}`}
                  value={opt.letter}
                  checked={answers[q.number] === opt.letter}
                  onChange={() => setAnswer(q.number, opt.letter)}
                  style={{ marginTop: 3 }}
                />
                <span><strong>{opt.letter}</strong> {opt.text}</span>
              </label>
            ))}
          </div>
        )
      }
      if (q.type === 'multi') {
        return (
          <div key={i} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, marginBottom: 4, fontWeight: 500 }}><strong>{q.number}.</strong> {q.question}</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>Choose {q.limit} letters</div>
            {q.options.map((opt, j) => {
              const selected = (answers[q.number] || []).includes(opt.letter)
              return (
                <label key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, cursor: 'pointer', fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleMultiAnswer(q.number, opt.letter, q.limit)}
                    style={{ marginTop: 3 }}
                  />
                  <span><strong>{opt.letter}</strong> {opt.text}</span>
                </label>
              )
            })}
          </div>
        )
      }
      if (q.type === 'matching') {
        return (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}><strong>{q.number}.</strong> {q.statement}</div>
            <select
              value={answers[q.number] || ''}
              onChange={e => setAnswer(q.number, e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, width: '100%', maxWidth: 300 }}
            >
              <option value="">Select...</option>
              {q.options.map((opt, j) => (
                <option key={j} value={opt.letter}>{opt.letter} — {opt.text}</option>
              ))}
            </select>
          </div>
        )
      }
      return null
    })
  }

  const sectionData = testData ? [
    testData.section1_questions,
    testData.section2_questions,
    testData.section3_questions,
    testData.section4_questions,
  ] : []

  const sectionTitles = ['Section 1', 'Section 2', 'Section 3', 'Section 4']
  const answeredCount = Object.keys(answers).length

  return (
    <>
      <Head><title>IELTS Listening</title></Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #111; }
        .btn { padding: 10px 20px; border: 1px solid #ddd; border-radius: 8px; background: #fff; color: #111; font-size: 14px; cursor: pointer; font-family: inherit; }
        .btn:hover { background: #f0f0f0; }
        .btn-blue { background: #185FA5; color: #fff; border-color: #185FA5; }
        .btn-blue:hover { background: #0C447C; }
        .btn-sm { padding: 7px 14px; font-size: 13px; }
        .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 1.25rem; margin-top: 12px; }
        .logo { color: #c00; font-weight: 700; font-size: 18px; }
      `}</style>

      <audio ref={audioRef} onEnded={handleAudioEnded} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />

      {screen === 'warn' && (
        <div style={{ maxWidth: 460, margin: '3rem auto', padding: '0 1rem' }}>
          <div className="card" style={{ marginTop: 0, border: '1px solid #E24B4A' }}>
            <div className="logo" style={{ marginBottom: 12 }}>IELTS</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Listening Test</div>
            <div style={{ fontSize: 14, lineHeight: 2.1, color: '#555' }}>
              • There are <strong>4 sections</strong> and <strong>40 questions</strong><br />
              • Each section plays <strong>once</strong> — listen carefully<br />
              • You can answer questions while audio plays<br />
              • Move to next section only after audio ends<br />
              • After Section 4 you will go directly to <strong>Reading</strong>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.2rem' }}>
              <button className="btn btn-sm" onClick={() => router.push('/')}>Back</button>
              <button className="btn btn-blue btn-sm" onClick={startExam}>Start Listening</button>
            </div>
          </div>
        </div>
      )}

      {screen === 'exam' && (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          {/* Header */}
          <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '10px 1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
            <div className="logo" style={{ fontSize: 15 }}>IELTS Listening</div>
            {/* Audio controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f5f5f5', padding: '6px 14px', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: '#888' }}>{sectionTitles[currentSection]}</span>
              <button onClick={playPause} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#185FA5' }}>
                {isPlaying ? '⏸' : '▶️'}
              </button>
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => { setVolume(e.target.value); if (audioRef.current) audioRef.current.volume = e.target.value }} style={{ width: 70 }} />
              {audioEnded && <span style={{ fontSize: 12, color: '#0F6E56', fontWeight: 500 }}>✓ Audio done</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: '#888' }}>Answered: {answeredCount}/40</span>
              <button className="btn btn-blue btn-sm" onClick={() => audioEnded ? nextSection() : null} style={{ opacity: audioEnded ? 1 : 0.4, cursor: audioEnded ? 'pointer' : 'not-allowed' }}>
                {currentSection < 3 ? `Next: ${sectionTitles[currentSection + 1]}` : 'Submit'}
              </button>
            </div>
          </div>

          {/* Section tabs */}
          <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '8px 1.2rem', display: 'flex', gap: 4 }}>
            {sectionTitles.map((t, i) => (
              <div key={i} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 13, background: i === currentSection ? '#185FA5' : '#f5f5f5', color: i === currentSection ? '#fff' : '#888', fontWeight: i === currentSection ? 500 : 400 }}>{t}</div>
            ))}
          </div>

          {/* Questions */}
          <div style={{ maxWidth: 760, margin: '1.5rem auto', padding: '0 1rem', width: '100%', paddingBottom: '3rem' }}>
            {!audioEnded && !isPlaying && (
              <div style={{ background: '#EFF6FF', border: '1px solid #B5D4F4', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#185FA5' }}>
                Press <strong>▶️ Play</strong> to start the audio for {sectionTitles[currentSection]}. Answer questions while listening.
              </div>
            )}
            {sectionData[currentSection] && renderQuestions(sectionData[currentSection])}
          </div>
        </div>
      )}

      {showSubmitConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ maxWidth: 340, textAlign: 'center', margin: '1rem' }}>
            <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 8 }}>Submit Listening?</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: '1rem', lineHeight: 1.6 }}>You will move directly to the <strong>Reading</strong> module. You cannot come back.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-sm" onClick={() => setShowSubmitConfirm(false)}>Go back</button>
              <button className="btn btn-blue btn-sm" onClick={submitExam}>Submit & Start Reading</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
