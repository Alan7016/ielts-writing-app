import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

export default function Reading() {
  const router = useRouter()
  const [screen, setScreen] = useState('warn')
  const [currentPassage, setCurrentPassage] = useState(0)
  const [answers, setAnswers] = useState({})
  const [testData, setTestData] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [timeLeft, setTimeLeft] = useState(3600)
  const [timerRunning, setTimerRunning] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const timerRef = useRef(null)
  const router2 = useRouter()

  useEffect(() => {
    const saved = localStorage.getItem('ielts_user')
    if (!saved) { router.push('/'); return }
    setCurrentUser(JSON.parse(saved))
    loadTest()
  }, [])

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) { clearInterval(timerRef.current); submitExam(); return 0 }
          return t - 1
        })
      }, 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [timerRunning])

  async function loadTest() {
    const { data } = await supabase.from('reading_tests').select('*').eq('id', 1).single()
    if (data) setTestData(data)
  }

  function startExam() {
    setScreen('exam')
    setTimerRunning(true)
  }

  function fmt(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  function setAnswer(qNum, val) {
    setAnswers(prev => ({ ...prev, [qNum]: val }))
  }

  function toggleMultiAnswer(qNum, val, limit) {
    setAnswers(prev => {
      const current = prev[qNum] || []
      if (current.includes(val)) return { ...prev, [qNum]: current.filter(v => v !== val) }
      if (current.length >= limit) return prev
      return { ...prev, [qNum]: [...current, val] }
    })
  }

  async function submitExam() {
    clearInterval(timerRef.current)
    setTimerRunning(false)
    setShowSubmitConfirm(false)
    const answerKey = testData?.answer_key || {}
    let score = 0
    Object.entries(answerKey).forEach(([qNum, correct]) => {
      const userAns = answers[qNum]
      if (Array.isArray(correct)) {
        if (Array.isArray(userAns)) {
          const su = [...userAns].map(v => v.trim().toLowerCase()).sort()
          const sc = [...correct].map(v => v.trim().toLowerCase()).sort()
          if (JSON.stringify(su) === JSON.stringify(sc)) score++
        }
      } else {
        if (userAns && userAns.trim().toLowerCase() === String(correct).trim().toLowerCase()) score++
      }
    })
    await supabase.from('reading_submissions').insert({
      username: currentUser.username,
      full_name: currentUser.full_name,
      answers,
      score
    })
    router.push('/')
  }

  function renderQuestions(questions) {
    if (!questions || !questions.length) return <div style={{ color: '#888', fontSize: 14 }}>No questions loaded.</div>
    return questions.map((q, i) => {
      if (q.type === 'gap') {
        return (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, lineHeight: 1.8 }}>
              <strong>{q.number}.</strong> {q.before}
              <input type="text" value={answers[q.number] || ''} onChange={e => setAnswer(q.number, e.target.value)}
                style={{ display: 'inline-block', width: 140, padding: '3px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, margin: '0 6px' }} placeholder="..." />
              {q.after || ''}
            </div>
          </div>
        )
      }
      if (q.type === 'tfng' || q.type === 'ynng') {
        const opts = q.type === 'tfng' ? ['TRUE', 'FALSE', 'NOT GIVEN'] : ['YES', 'NO', 'NOT GIVEN']
        return (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}><strong>{q.number}.</strong> {q.statement}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {opts.map(opt => (
                <button key={opt} onClick={() => setAnswer(q.number, opt)}
                  style={{ padding: '5px 14px', border: '1px solid', borderRadius: 6, fontSize: 13, cursor: 'pointer', borderColor: answers[q.number] === opt ? '#185FA5' : '#ddd', background: answers[q.number] === opt ? '#185FA5' : '#fff', color: answers[q.number] === opt ? '#fff' : '#111' }}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )
      }
      if (q.type === 'mcq') {
        return (
          <div key={i} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 14, marginBottom: 8, fontWeight: 500 }}><strong>{q.number}.</strong> {q.question}</div>
            {q.options.map((opt, j) => (
              <label key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, cursor: 'pointer', fontSize: 14 }}>
                <input type="radio" name={`q${q.number}`} value={opt.letter} checked={answers[q.number] === opt.letter} onChange={() => setAnswer(q.number, opt.letter)} style={{ marginTop: 3 }} />
                <span><strong>{opt.letter}</strong> {opt.text}</span>
              </label>
            ))}
          </div>
        )
      }
      if (q.type === 'matching') {
        return (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}><strong>{q.number}.</strong> {q.statement}</div>
            <select value={answers[q.number] || ''} onChange={e => setAnswer(q.number, e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, width: '100%', maxWidth: 320 }}>
              <option value="">Select...</option>
              {q.options.map((opt, j) => <option key={j} value={opt.letter}>{opt.letter} — {opt.text}</option>)}
            </select>
          </div>
        )
      }
      if (q.type === 'para_match') {
        return (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}><strong>{q.number}.</strong> {q.statement}</div>
            <select value={answers[q.number] || ''} onChange={e => setAnswer(q.number, e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, width: '100%', maxWidth: 200 }}>
              <option value="">Paragraph...</option>
              {['A','B','C','D','E','F','G','H'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )
      }
      if (q.type === 'summary') {
        return (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}><strong>{q.number}.</strong> {q.before}
              <select value={answers[q.number] || ''} onChange={e => setAnswer(q.number, e.target.value)}
                style={{ display: 'inline-block', padding: '3px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, margin: '0 6px' }}>
                <option value="">...</option>
                {q.options && q.options.map((opt, j) => <option key={j} value={opt.letter}>{opt.letter} — {opt.text}</option>)}
              </select>
              {q.after || ''}
            </div>
          </div>
        )
      }
      return null
    })
  }

  const passages = testData ? [
    { title: testData.passage1_title, text: testData.passage1_text, questions: testData.passage1_questions },
    { title: testData.passage2_title, text: testData.passage2_text, questions: testData.passage2_questions },
    { title: testData.passage3_title, text: testData.passage3_text, questions: testData.passage3_questions },
  ] : []

  const passageTitles = ['Passage 1', 'Passage 2', 'Passage 3']
  const answeredCount = Object.keys(answers).length
  const timerColor = timeLeft <= 600 ? '#A32D2D' : '#185FA5'

  return (
    <>
      <Head><title>IELTS Reading</title></Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #111; }
        .btn { padding: 10px 20px; border: 1px solid #ddd; border-radius: 8px; background: #fff; color: #111; font-size: 14px; cursor: pointer; font-family: inherit; }
        .btn:hover { background: #f0f0f0; }
        .btn-blue { background: #185FA5; color: #fff; border-color: #185FA5; }
        .btn-blue:hover { background: #0C447C; }
        .btn-red { background: #A32D2D; color: #fff; border-color: #A32D2D; }
        .btn-sm { padding: 7px 14px; font-size: 13px; }
        .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 1.25rem; margin-top: 12px; }
        .logo { color: #c00; font-weight: 700; font-size: 18px; }
        .passage-text p { margin-bottom: 1em; font-size: 14px; line-height: 1.8; }
        .passage-text h4 { font-size: 18px; font-weight: bold; margin-bottom: 12px; text-align: center; }
      `}</style>

      {screen === 'warn' && (
        <div style={{ maxWidth: 460, margin: '3rem auto', padding: '0 1rem' }}>
          <div className="card" style={{ marginTop: 0, border: '1px solid #E24B4A' }}>
            <div className="logo" style={{ marginBottom: 12 }}>IELTS</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Reading Test</div>
            <div style={{ fontSize: 14, lineHeight: 2.1, color: '#555' }}>
              • <strong>3 passages</strong>, <strong>40 questions</strong> total<br />
              • You have <strong>60 minutes</strong><br />
              • Spend about 20 minutes per passage<br />
              • You can switch between passages at any time<br />
              • Timer cannot be paused<br />
              • After Reading you will go to <strong>Writing</strong>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.2rem' }}>
              <button className="btn btn-sm" onClick={() => router.push('/')}>Back</button>
              <button className="btn btn-blue btn-sm" onClick={startExam}>Start Reading</button>
            </div>
          </div>
        </div>
      )}

      {screen === 'exam' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          {/* Header */}
          <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '10px 1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div className="logo" style={{ fontSize: 15 }}>IELTS Reading</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 4, background: '#f5f5f5', borderRadius: 8, padding: 3 }}>
                {passageTitles.map((t, i) => (
                  <button key={i} onClick={() => setCurrentPassage(i)}
                    style={{ padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', background: currentPassage === i ? '#fff' : 'transparent', fontWeight: currentPassage === i ? 500 : 400, color: currentPassage === i ? '#111' : '#888' }}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'monospace', color: timerColor, minWidth: 65 }}>{fmt(timeLeft)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: '#888' }}>{answeredCount}/40</span>
              <button className="btn btn-red btn-sm" onClick={() => setShowSubmitConfirm(true)}>Submit</button>
            </div>
          </div>

          {/* Split panel */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Left - passage */}
            <div style={{ flex: 1, padding: '1.2rem', overflowY: 'auto', borderRight: '1px solid #eee' }}>
              {passages[currentPassage] && (
                <div>
                  <div style={{ background: '#f5f5f5', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
                    <strong>{passageTitles[currentPassage]}</strong> — Spend about 20 minutes on this passage.
                  </div>
                  <div className="passage-text" dangerouslySetInnerHTML={{ __html: passages[currentPassage].text || '<p>No passage loaded.</p>' }} />
                </div>
              )}
            </div>
            {/* Right - questions */}
            <div style={{ flex: 1, padding: '1.2rem', overflowY: 'auto' }}>
              {passages[currentPassage] && renderQuestions(passages[currentPassage].questions)}
            </div>
          </div>
        </div>
      )}

      {showSubmitConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ maxWidth: 340, textAlign: 'center', margin: '1rem' }}>
            <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 8 }}>Submit Reading?</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: '1rem', lineHeight: 1.6 }}>You will move to <strong>Writing</strong>. You cannot come back to Reading.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-sm" onClick={() => setShowSubmitConfirm(false)}>Go back</button>
              <button className="btn btn-blue btn-sm" onClick={submitExam}>Submit & Start Writing</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
