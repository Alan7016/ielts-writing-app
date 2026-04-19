import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

const ADMIN_USER = 'teacher'
const ADMIN_PASS = 'ielts2024'
const AUDIO_URLS = [
  'https://dsitketafrgrcxpncsrb.supabase.co/storage/v1/object/public/audio/AudioTrack 01.mp3',
  'https://dsitketafrgrcxpncsrb.supabase.co/storage/v1/object/public/audio/AudioTrack 02.mp3',
  'https://dsitketafrgrcxpncsrb.supabase.co/storage/v1/object/public/audio/AudioTrack 03.mp3',
  'https://dsitketafrgrcxpncsrb.supabase.co/storage/v1/object/public/audio/AudioTrack 04.mp3',
]

function parseAnswerKey(text) {
  const key = {}
  if (!text) return key
  text.split('\n').forEach(line => {
    const m = line.trim().match(/^(\d+)[.\s:]+(.+)/)
    if (m) key[m[1]] = m[2].trim()
  })
  return key
}

function parseListeningQuestions(text) {
  if (!text || !text.trim()) return []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const questions = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const numMatch = line.match(/^(\d+)[.\s]+(.+)/)
    if (!numMatch) { i++; continue }
    const num = parseInt(numMatch[1])
    const rest = numMatch[2]
    if (rest.includes('___') || rest.includes('......') || rest.includes('…')) {
      const full = rest.replace(/_{3,}|\.{4,}|…+/g, '___')
      const parts = full.split('___')
      questions.push({ type: 'gap', number: num, before: parts[0]?.trim() || '', after: parts.slice(1).join('').trim() || '' })
      i++; continue
    }
    const opts = []
    let j = i + 1
    while (j < lines.length) {
      const optM = lines[j].match(/^([A-G])[.\s]+(.+)/)
      if (optM) { opts.push({ letter: optM[1], text: optM[2] }); j++ }
      else break
    }
    if (opts.length >= 2) {
      questions.push({ type: 'mcq', number: num, question: rest, options: opts })
      i = j; continue
    }
    questions.push({ type: 'gap', number: num, before: rest, after: '' })
    i++
  }
  return questions
}

function parseReadingQuestions(text) {
  if (!text || !text.trim()) return []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const questions = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const numMatch = line.match(/^(\d+)[.\s]+(.+)/)
    if (!numMatch) { i++; continue }
    const num = parseInt(numMatch[1])
    const rest = numMatch[2]
    if (rest.includes('___') || rest.includes('......') || rest.includes('…')) {
      const full = rest.replace(/_{3,}|\.{4,}|…+/g, '___')
      const parts = full.split('___')
      questions.push({ type: 'gap', number: num, before: parts[0]?.trim() || '', after: parts.slice(1).join('').trim() || '' })
      i++; continue
    }
    const opts = []
    let j = i + 1
    while (j < lines.length) {
      const optM = lines[j].match(/^([A-J])[.\s]+(.+)/)
      if (optM) { opts.push({ letter: optM[1], text: optM[2] }); j++ }
      else break
    }
    if (opts.length >= 2) {
      questions.push({ type: 'mcq', number: num, question: rest, options: opts })
      i = j; continue
    }
    questions.push({ type: 'tfng', number: num, statement: rest })
    i++
  }
  return questions
}

function downloadPDF(sub) {
  const wc = (t) => t ? t.trim().split(/\s+/).filter(Boolean).length : 0
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>IELTS - ${sub.full_name}</title>
  <style>body{font-family:Arial,sans-serif;max-width:800px;margin:2rem auto;padding:0 2rem;color:#111}h1{color:#c00}h2{background:#f5f5f5;padding:8px 12px;border-radius:4px;margin-top:2rem;font-size:16px}.meta{font-size:13px;color:#666;margin-bottom:2rem;border-bottom:1px solid #eee;padding-bottom:1rem}.wc{font-size:12px;color:#888;margin:4px 0 12px}.answer{font-size:14px;line-height:1.8;white-space:pre-wrap;border:1px solid #eee;padding:1rem;border-radius:4px}@media print{body{margin:1rem}}</style>
  </head><body>
  <h1>IELTS Writing Practice</h1>
  <div class="meta"><strong>${sub.full_name}</strong> (@${sub.username})<br>Submitted: ${new Date(sub.submitted_at).toLocaleString()}</div>
  <h2>Task 1</h2><div class="wc">Word count: ${wc(sub.task1_answer)}</div><div class="answer">${sub.task1_answer||'(No answer)'}</div>
  <h2>Task 2</h2><div class="wc">Word count: ${wc(sub.task2_answer)}</div><div class="answer">${sub.task2_answer||'(No answer)'}</div>
  </body></html>`
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  win.onload = () => { win.print(); URL.revokeObjectURL(url) }
}


function Set3AdminPanel() {
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [subs, setSubs] = useState([])
  const [selected, setSelected] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState({ listening: false, reading: false, writing: false })

  async function load() {
    const { data } = await supabase.from('set3_submissions').select('*').order('completed_at', { ascending: false })
    setSubs(data || [])
    const { data: htmlData } = await supabase.from('set3_html').select('id')
    if (htmlData) {
      const uploaded = {}
      htmlData.forEach(h => { uploaded[h.id] = true })
      setUploadedFiles(uploaded)
    }
    setLoaded(true)
  }

  async function uploadHtml(file, id) {
    if (!file) return
    setUploading(true); setMsg('Uploading ' + id + '...')
    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target.result
      await supabase.from('set3_html').upsert({ id, content, updated_at: new Date().toISOString() })
      setMsg(id.charAt(0).toUpperCase() + id.slice(1) + ' HTML uploaded! ✓')
      setUploadedFiles(prev => ({ ...prev, [id]: true }))
      setUploading(false)
      setTimeout(() => setMsg(''), 3000)
    }
    reader.readAsText(file)
  }

  const wc = (t) => t ? t.trim().split(/\s+/).filter(Boolean).length : 0

  function calcBand(s, type) {
    if (type === 'listening') {
      if(s>=39) return 9; if(s>=37) return 8.5; if(s>=35) return 8; if(s>=32) return 7.5;
      if(s>=30) return 7; if(s>=26) return 6.5; if(s>=23) return 6; if(s>=18) return 5.5;
      if(s>=16) return 5; if(s>=13) return 4.5; if(s>=10) return 4; if(s>=8) return 3.5;
      if(s>=6) return 3; if(s>=4) return 2.5; if(s>=2) return 2; if(s===1) return 1.5; return 0;
    } else {
      const m = {40:9,39:9,38:8.5,37:8.5,36:8,35:8,34:7.5,33:7.5,32:7,31:7,30:7,29:6.5,28:6.5,27:6.5,26:6,25:6,24:6,23:5.5,22:5.5,21:5.5,20:5.5,19:5,18:5,17:5,16:5,15:4.5,14:4.5,13:4.5,12:4,11:4,10:3.5,9:3.5,8:3,7:3,6:2.5,5:2.5}
      if(s<=0) return 0; if(s===1) return 1; if(s<=3) return 2; if(s<=5) return 2.5; return m[s]||0;
    }
  }

  if (!loaded) return (
    <div className="card" style={{ marginTop: 0 }}>
      <div style={{ fontWeight: 500, marginBottom: 12 }}>Set 3 Admin Panel</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>Load Set 3 data to upload HTML files and view student submissions.</div>
      <button className="btn btn-blue btn-sm" onClick={load}>Load Set 3 Data</button>
    </div>
  )

  if (selected) {
    const lBand = selected.listening_score != null ? calcBand(selected.listening_score, 'listening') : null
    const rBand = selected.reading_score != null ? calcBand(selected.reading_score, 'reading') : null
    return (
      <div className="card" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 500, fontSize: 15 }}>{selected.full_name} <span style={{ color: '#888', fontWeight: 400, fontSize: 13 }}>@{selected.username}</span></div>
          <button className="btn btn-sm" onClick={() => setSelected(null)}>← Back</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>Listening</div>
            {selected.listening_score != null
              ? <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#185FA5' }}>{selected.listening_score}<span style={{ fontSize: 14, color: '#888' }}>/40</span></div>
                  <div style={{ fontSize: 13, color: '#0F6E56', fontWeight: 500 }}>Band {lBand}</div>
                  {selected.listening_results && selected.listening_results.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Question breakdown:</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 }}>
                        {selected.listening_results.map((r, i) => (
                          <div key={i} title={r.isCorrect ? `Q${r.question}: ✓` : `Q${r.question}: wrote "${r.userAnswer}" — correct: "${r.correctAnswer}"`}
                            style={{ background: r.isCorrect ? '#E1F5EE' : '#FEF2F2', border: '1px solid ' + (r.isCorrect ? '#9FE1CB' : '#FCA5A5'), borderRadius: 4, padding: '4px 2px', textAlign: 'center', fontSize: 10, cursor: 'default' }}>
                            <div style={{ fontWeight: 600 }}>{r.question}</div>
                            <div style={{ color: r.isCorrect ? '#0F6E56' : '#A32D2D' }}>{r.isCorrect ? '✓' : '✗'}</div>
                            {!r.isCorrect && <div style={{ fontSize: 9, color: '#A32D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.userAnswer || '—'}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              : <div style={{ fontSize: 13, color: '#888' }}>Not submitted</div>}
          </div>
          <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>Reading</div>
            {selected.reading_score != null
              ? <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#185FA5' }}>{selected.reading_score}<span style={{ fontSize: 14, color: '#888' }}>/40</span></div>
                  <div style={{ fontSize: 13, color: '#0F6E56', fontWeight: 500 }}>Band {rBand}</div>
                  {selected.reading_results && selected.reading_results.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Question breakdown:</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 }}>
                        {selected.reading_results.map((r, i) => (
                          <div key={i} title={r.isCorrect ? `Q${r.question}: ✓` : `Q${r.question}: wrote "${r.userAnswer}" — correct: "${r.correctAnswer}"`}
                            style={{ background: r.isCorrect ? '#E1F5EE' : '#FEF2F2', border: '1px solid ' + (r.isCorrect ? '#9FE1CB' : '#FCA5A5'), borderRadius: 4, padding: '4px 2px', textAlign: 'center', fontSize: 10, cursor: 'default' }}>
                            <div style={{ fontWeight: 600 }}>{r.question}</div>
                            <div style={{ color: r.isCorrect ? '#0F6E56' : '#A32D2D' }}>{r.isCorrect ? '✓' : '✗'}</div>
                            {!r.isCorrect && <div style={{ fontSize: 9, color: '#A32D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.userAnswer || '—'}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              : <div style={{ fontSize: 13, color: '#888' }}>Not submitted</div>}
          </div>
        </div>
        <div className="card" style={{ marginTop: 0, marginBottom: 12 }}>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Writing — Task 1 <span style={{ color: '#888', fontWeight: 400 }}>({wc(selected.writing_task1)} words)</span></div>
          <div style={{ fontSize: 13, lineHeight: 1.8, background: '#f9f9f9', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', maxHeight: 250, overflowY: 'auto' }}>
            {selected.writing_task1 || <span style={{ color: '#aaa' }}>Not submitted</span>}
          </div>
        </div>
        <div className="card" style={{ marginTop: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Writing — Task 2 <span style={{ color: '#888', fontWeight: 400 }}>({wc(selected.writing_task2)} words)</span></div>
          <div style={{ fontSize: 13, lineHeight: 1.8, background: '#f9f9f9', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', maxHeight: 250, overflowY: 'auto' }}>
            {selected.writing_task2 || <span style={{ color: '#aaa' }}>Not submitted</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 0 }}>
      <div className="card" style={{ marginTop: 0 }}>
        <div style={{ fontWeight: 500, marginBottom: 4 }}>Set 3 — Upload HTML files</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 12, lineHeight: 1.6 }}>Upload your Listening, Reading and Writing HTML files for Set 3.</div>
        {msg && <div style={{ fontSize: 13, color: '#0F6E56', marginBottom: 10, background: '#E1F5EE', padding: '8px 12px', borderRadius: 8 }}>{msg}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['listening', 'reading', 'writing'].map(id => (
            <div key={id} style={{ background: '#f9f9f9', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6, textTransform: 'capitalize' }}>{id}</div>
              {uploadedFiles[id] && <div style={{ fontSize: 11, color: '#0F6E56', marginBottom: 8 }}>✓ HTML uploaded and ready</div>}
              <label style={{ display: 'inline-block', padding: '8px 14px', background: uploadedFiles[id] ? '#0F6E56' : '#185FA5', color: '#fff', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500, opacity: uploading ? 0.6 : 1 }}>
                {uploading ? 'Uploading...' : uploadedFiles[id] ? 'Replace HTML' : 'Upload HTML'}
                <input type="file" accept=".html" style={{ display: 'none' }} onChange={e => uploadHtml(e.target.files[0], id)} disabled={uploading} />
              </label>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 12 }}>Set 3 Submissions ({subs.length})</div>
        {subs.length === 0
          ? <div style={{ fontSize: 13, color: '#888' }}>No submissions yet.</div>
          : subs.map(s => (
            <div key={s.id} onClick={() => setSelected(s)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #eee', borderRadius: 8, marginBottom: 6, cursor: 'pointer', background: '#fafafa' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{s.full_name}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {s.listening_score != null ? `L: ${s.listening_score}/40 (Band ${calcBand(s.listening_score,'listening')})` : 'L: —'}
                  {' · '}
                  {s.reading_score != null ? `R: ${s.reading_score}/40 (Band ${calcBand(s.reading_score,'reading')})` : 'R: —'}
                  {' · '}
                  {s.writing_task1 ? 'W: ✓' : 'W: —'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#185FA5' }}>View →</div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

function Set2AdminPanel() {
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [subs, setSubs] = useState([])
  const [selected, setSelected] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState({ listening: false, reading: false, writing: false })

  async function load() {
    const { data } = await supabase.from('set2_submissions').select('*').order('completed_at', { ascending: false })
    setSubs(data || [])
    // Check which HTML files are already uploaded
    const { data: htmlData } = await supabase.from('set2_html').select('id')
    if (htmlData) {
      const uploaded = {}
      htmlData.forEach(h => { uploaded[h.id] = true })
      setUploadedFiles(uploaded)
    }
    setLoaded(true)
  }

  async function uploadHtml(file, id) {
    if (!file) return
    setUploading(true); setMsg('Uploading ' + id + '...')
    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target.result
      await supabase.from('set2_html').upsert({ id, content, updated_at: new Date().toISOString() })
      setMsg(id.charAt(0).toUpperCase() + id.slice(1) + ' HTML uploaded! ✓')
      setUploadedFiles(prev => ({ ...prev, [id]: true }))
      setUploading(false)
      setTimeout(() => setMsg(''), 3000)
    }
    reader.readAsText(file)
  }

  const wc = (t) => t ? t.trim().split(/\s+/).filter(Boolean).length : 0

  if (!loaded) return (
    <div className="card" style={{ marginTop: 0 }}>
      <div style={{ fontWeight: 500, marginBottom: 12 }}>Set 2 Admin Panel</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>Load Set 2 data to upload HTML files and view student submissions.</div>
      <button className="btn btn-blue btn-sm" onClick={load}>Load Set 2 Data</button>
    </div>
  )

  if (selected) return (
    <div className="card" style={{ marginTop: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 500, fontSize: 15 }}>{selected.full_name} (@{selected.username})</div>
        <button className="btn btn-sm" onClick={() => setSelected(null)}>← Back</button>
      </div>

      {(() => {
        function calcBand(s, type) {
          if (type === 'listening') {
            if(s>=39) return 9; if(s>=37) return 8.5; if(s>=35) return 8; if(s>=32) return 7.5;
            if(s>=30) return 7; if(s>=26) return 6.5; if(s>=23) return 6; if(s>=18) return 5.5;
            if(s>=16) return 5; if(s>=13) return 4.5; if(s>=10) return 4; if(s>=8) return 3.5;
            if(s>=6) return 3; if(s>=4) return 2.5; if(s>=2) return 2; if(s===1) return 1.5; return 0;
          } else {
            const m = {40:9,39:9,38:8.5,37:8.5,36:8,35:8,34:7.5,33:7.5,32:7,31:7,30:7,29:6.5,28:6.5,27:6.5,26:6,25:6,24:6,23:5.5,22:5.5,21:5.5,20:5.5,19:5,18:5,17:5,16:5,15:4.5,14:4.5,13:4.5,12:4,11:4,10:3.5,9:3.5,8:3,7:3,6:2.5,5:2.5}
            if(s<=0) return 0; if(s===1) return 1; if(s<=3) return 2; if(s<=5) return 2.5; return m[s]||0;
          }
        }
        const lBand = selected.listening_score != null ? calcBand(selected.listening_score, 'listening') : null
        const rBand = selected.reading_score != null ? calcBand(selected.reading_score, 'reading') : null
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>Listening</div>
              {selected.listening_score != null
                ? <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#185FA5' }}>{selected.listening_score}<span style={{ fontSize: 14, color: '#888' }}>/40</span></div>
                    <div style={{ fontSize: 13, color: '#0F6E56', fontWeight: 500 }}>Band {lBand}</div>
                    {selected.listening_results && selected.listening_results.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Question breakdown:</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 }}>
                          {selected.listening_results.map((r, i) => (
                            <div key={i} title={r.isCorrect ? `Q${r.question}: ✓` : `Q${r.question}: You wrote "${r.userAnswer}" — correct: "${r.correctAnswer}"`}
                              style={{ background: r.isCorrect ? '#E1F5EE' : '#FEF2F2', border: '1px solid ' + (r.isCorrect ? '#9FE1CB' : '#FCA5A5'), borderRadius: 4, padding: '4px 2px', textAlign: 'center', fontSize: 10, cursor: 'default' }}>
                              <div style={{ fontWeight: 600 }}>{r.question}</div>
                              <div style={{ color: r.isCorrect ? '#0F6E56' : '#A32D2D' }}>{r.isCorrect ? '✓' : '✗'}</div>
                              {!r.isCorrect && <div style={{ fontSize: 9, color: '#A32D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.userAnswer || '—'}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                : <div style={{ fontSize: 13, color: '#888' }}>Not submitted</div>
              }
            </div>
            <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>Reading</div>
              {selected.reading_score != null
                ? <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#185FA5' }}>{selected.reading_score}<span style={{ fontSize: 14, color: '#888' }}>/40</span></div>
                    <div style={{ fontSize: 13, color: '#0F6E56', fontWeight: 500 }}>Band {rBand}</div>
                    {selected.reading_results && selected.reading_results.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Question breakdown:</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 }}>
                          {selected.reading_results.map((r, i) => (
                            <div key={i} title={r.isCorrect ? `Q${r.question}: ✓` : `Q${r.question}: You wrote "${r.userAnswer}" — correct: "${r.correctAnswer}"`}
                              style={{ background: r.isCorrect ? '#E1F5EE' : '#FEF2F2', border: '1px solid ' + (r.isCorrect ? '#9FE1CB' : '#FCA5A5'), borderRadius: 4, padding: '4px 2px', textAlign: 'center', fontSize: 10, cursor: 'default' }}>
                              <div style={{ fontWeight: 600 }}>{r.question}</div>
                              <div style={{ color: r.isCorrect ? '#0F6E56' : '#A32D2D' }}>{r.isCorrect ? '✓' : '✗'}</div>
                              {!r.isCorrect && <div style={{ fontSize: 9, color: '#A32D2D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.userAnswer || '—'}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                : <div style={{ fontSize: 13, color: '#888' }}>Not submitted</div>
              }
            </div>
          </div>
        )
      })()}

      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Writing — Task 1</div>
      <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.7, marginBottom: 4, whiteSpace: 'pre-wrap', maxHeight: 250, overflowY: 'auto' }}>
        {selected.writing_task1 || '(Not submitted)'}
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>{wc(selected.writing_task1)} words</div>

      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Writing — Task 2</div>
      <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.7, marginBottom: 4, whiteSpace: 'pre-wrap', maxHeight: 250, overflowY: 'auto' }}>
        {selected.writing_task2 || '(Not submitted)'}
      </div>
      <div style={{ fontSize: 12, color: '#888' }}>{wc(selected.writing_task2)} words</div>
    </div>
  )

  return (
    <div style={{ marginTop: 0 }}>
      {/* HTML Upload */}
      <div className="card" style={{ marginTop: 0 }}>
        <div style={{ fontWeight: 500, marginBottom: 4 }}>Set 2 — Upload HTML files</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 12, lineHeight: 1.6 }}>
          Upload your Listening, Reading and Writing HTML files for Set 2. Students will see your exact HTML layout.
        </div>
        {msg && <div style={{ fontSize: 13, color: '#0F6E56', marginBottom: 10, background: '#E1F5EE', padding: '8px 12px', borderRadius: 8 }}>{msg}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['listening', 'reading', 'writing'].map(id => (
            <div key={id} style={{ background: '#f9f9f9', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6, textTransform: 'capitalize' }}>{id}</div>
              {uploadedFiles[id] && (
                <div style={{ fontSize: 11, color: '#0F6E56', marginBottom: 8 }}>✓ HTML uploaded and ready</div>
              )}
              <label style={{ display: 'inline-block', padding: '8px 14px', background: uploadedFiles[id] ? '#0F6E56' : '#185FA5', color: '#fff', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500, opacity: uploading ? 0.6 : 1 }}>
                {uploading ? 'Uploading...' : uploadedFiles[id] ? 'Replace HTML' : 'Upload HTML'}
                <input type="file" accept=".html" style={{ display: 'none' }} onChange={e => uploadHtml(e.target.files[0], id)} disabled={uploading} />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Student results */}
      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 12 }}>Set 2 Submissions ({subs.length})</div>
        {subs.length === 0
          ? <div style={{ fontSize: 13, color: '#888' }}>No submissions yet.</div>
          : subs.map(s => (
            <div key={s.id} onClick={() => setSelected(s)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #eee', borderRadius: 8, marginBottom: 6, cursor: 'pointer', background: '#fafafa' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{s.full_name}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {s.listening_score !== null ? 'L: ' + s.listening_score + '/40' : 'L: —'}
                  {' · '}
                  {s.reading_score !== null ? 'R: ' + s.reading_score + '/40' : 'R: —'}
                  {' · '}
                  {s.writing_task1 ? 'W: ✓' : 'W: —'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#185FA5' }}>View →</div>
            </div>
          ))
        }
      </div>
    </div>
  )
}


function bandFromListening(raw) {
  if(raw>=39) return 9; if(raw>=37) return 8.5; if(raw>=35) return 8;
  if(raw>=32) return 7.5; if(raw>=30) return 7; if(raw>=26) return 6.5;
  if(raw>=23) return 6; if(raw>=18) return 5.5; if(raw>=16) return 5;
  if(raw>=13) return 4.5; if(raw>=10) return 4; if(raw>=8) return 3.5;
  if(raw>=6) return 3; if(raw>=4) return 2.5; if(raw>=2) return 2;
  if(raw===1) return 1.5; return 0;
}
function bandFromReading(raw) {
  const m = {40:9,39:9,38:8.5,37:8.5,36:8,35:8,34:7.5,33:7.5,32:7,31:7,30:7,29:6.5,28:6.5,27:6.5,26:6,25:6,24:6,23:5.5,22:5.5,21:5.5,20:5.5,19:5,18:5,17:5,16:5,15:4.5,14:4.5,13:4.5,12:4,11:4,10:3.5,9:3.5,8:3,7:3,6:2.5,5:2.5}
  return m[raw] || 0;
}

function ScoreBreakdown({ results, module, onClose }) {
  if (!results || results.length === 0) return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 13, color: '#888' }}>No detailed breakdown available.</div>
      <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={onClose}>Close</button>
    </div>
  )
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{module} — Question Breakdown</div>
        <button className="btn btn-sm" onClick={onClose}>Close</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6 }}>
        {results.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: r.isCorrect ? '#E1F5EE' : '#FEF2F2', border: '1px solid ' + (r.isCorrect ? '#9FE1CB' : '#FCA5A5') }}>
            <div style={{ fontWeight: 700, fontSize: 12, minWidth: 24, color: r.isCorrect ? '#0F6E56' : '#A32D2D' }}>Q{r.question}</div>
            <div style={{ fontSize: 12, flex: 1 }}>
              <div style={{ color: '#555' }}>Student: <strong>{r.userAnswer}</strong></div>
              {!r.isCorrect && <div style={{ color: '#A32D2D' }}>Answer: <strong>{r.correctAnswer}</strong></div>}
            </div>
            <div style={{ fontSize: 14 }}>{r.isCorrect ? '✓' : '✗'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SubmissionsPanel({ writingSubs, listeningSubs, readingSubs, wc, downloadPDF, supabase }) {
  const [activeSet, setActiveSet] = useState('set1')
  const [set2subs, setSet2subs] = useState([])
  const [set2loaded, setSet2loaded] = useState(false)
  const [set3subs, setSet3subs] = useState([])
  const [set3loaded, setSet3loaded] = useState(false)
  const [selected, setSelected] = useState(null)
  const [breakdown, setBreakdown] = useState(null) // { results, module }

  async function loadSet2() {
    const { data } = await supabase.from('set2_submissions').select('*').order('completed_at', { ascending: false })
    setSet2subs(data || [])
    setSet2loaded(true)
  }

  async function loadSet3() {
    const { data } = await supabase.from('set3_submissions').select('*').order('completed_at', { ascending: false })
    setSet3subs(data || [])
    setSet3loaded(true)
  }

  // Merge Set 1 data by username
  const set1students = {}
  listeningSubs.forEach(s => {
    if (!set1students[s.username]) set1students[s.username] = { username: s.username, full_name: s.full_name }
    set1students[s.username].listening_score = s.score
    set1students[s.username].lResults = s.results || []
    set1students[s.username].listening_at = s.submitted_at
  })
  readingSubs.forEach(s => {
    if (!set1students[s.username]) set1students[s.username] = { username: s.username, full_name: s.full_name }
    set1students[s.username].reading_score = s.score
    set1students[s.username].rResults = s.results || []
  })
  writingSubs.forEach(s => {
    if (!set1students[s.username]) set1students[s.username] = { username: s.username, full_name: s.full_name }
    set1students[s.username].task1 = s.task1_answer
    set1students[s.username].task2 = s.task2_answer
    set1students[s.username].writing_at = s.submitted_at
    set1students[s.username]._raw = s
  })
  const set1list = Object.values(set1students)

  if (selected) {
    const isSet2 = activeSet === 'set2'
    const t1 = isSet2 ? selected.writing_task1 : selected.task1
    const t2 = isSet2 ? selected.writing_task2 : selected.task2
    const lScore = selected.listening_score != null ? selected.listening_score : null
    const rScore = selected.reading_score != null ? selected.reading_score : null
    return (
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontWeight:500, fontSize:15 }}>{selected.full_name} <span style={{ color:'#888', fontWeight:400, fontSize:13 }}>@{selected.username}</span></div>
          <button className="btn btn-sm" onClick={() => setSelected(null)}>← Back</button>
        </div>
        {breakdown && <div className="card" style={{ marginTop:0, marginBottom:12, background:'#f9f9f9' }}><ScoreBreakdown results={breakdown.results} module={breakdown.module} onClose={() => setBreakdown(null)} /></div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div className="card" style={{ marginTop:0, textAlign:'center', cursor: selected.lResults?.length ? 'pointer' : 'default' }} onClick={() => selected.lResults?.length && setBreakdown({ results: selected.lResults, module: 'Listening' })}>
            <div style={{ fontSize:12, color:'#888', marginBottom:4 }}>Listening {selected.lResults?.length ? <span style={{ fontSize:11, color:'#185FA5' }}>· tap for breakdown</span> : ''}</div>
            {lScore != null
              ? <div><div style={{ fontSize:24, fontWeight:700, color:'#185FA5' }}>{lScore}<span style={{ fontSize:14, color:'#888' }}>/40</span></div>
                <div style={{ fontSize:13, color:'#0F6E56', fontWeight:500 }}>Band {bandFromListening(lScore)}</div></div>
              : <div style={{ fontSize:13, color:'#aaa' }}>—</div>}
          </div>
          <div className="card" style={{ marginTop:0, textAlign:'center', cursor: selected.rResults?.length ? 'pointer' : 'default' }} onClick={() => selected.rResults?.length && setBreakdown({ results: selected.rResults, module: 'Reading' })}>
            <div style={{ fontSize:12, color:'#888', marginBottom:4 }}>Reading {selected.rResults?.length ? <span style={{ fontSize:11, color:'#185FA5' }}>· tap for breakdown</span> : ''}</div>
            {rScore != null
              ? <div><div style={{ fontSize:24, fontWeight:700, color:'#185FA5' }}>{rScore}<span style={{ fontSize:14, color:'#888' }}>/40</span></div>
                <div style={{ fontSize:13, color:'#0F6E56', fontWeight:500 }}>Band {bandFromReading(rScore)}</div></div>
              : <div style={{ fontSize:13, color:'#aaa' }}>—</div>}
          </div>
        </div>
        <div className="card" style={{ marginTop:0, marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontWeight:500, fontSize:13 }}>Task 1 <span style={{ color:'#888', fontWeight:400 }}>({wc(t1)} words)</span></div>
            {!isSet2 && selected._raw && <button className="btn btn-green btn-sm" onClick={() => downloadPDF(selected._raw)}>PDF</button>}
          </div>
          <div style={{ fontSize:13, lineHeight:1.8, background:'#f9f9f9', borderRadius:8, padding:12, whiteSpace:'pre-wrap', maxHeight:250, overflowY:'auto' }}>
            {t1 || <span style={{ color:'#aaa' }}>Not submitted</span>}
          </div>
        </div>
        <div className="card" style={{ marginTop:0 }}>
          <div style={{ fontWeight:500, fontSize:13, marginBottom:8 }}>Task 2 <span style={{ color:'#888', fontWeight:400 }}>({wc(t2)} words)</span></div>
          <div style={{ fontSize:13, lineHeight:1.8, background:'#f9f9f9', borderRadius:8, padding:12, whiteSpace:'pre-wrap', maxHeight:250, overflowY:'auto' }}>
            {t2 || <span style={{ color:'#aaa' }}>Not submitted</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Set toggle */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <button onClick={() => setActiveSet('set1')} style={{ padding:'8px 20px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:500, background: activeSet==='set1'?'#185FA5':'#f0f0f0', color: activeSet==='set1'?'#fff':'#555' }}>Set 1</button>
        <button onClick={() => { setActiveSet('set2'); if(!set2loaded) loadSet2() }} style={{ padding:'8px 20px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:500, background: activeSet==='set2'?'#0F6E56':'#f0f0f0', color: activeSet==='set2'?'#fff':'#555' }}>Set 2</button>
        <button onClick={() => { setActiveSet('set3'); if(!set3loaded) loadSet3() }} style={{ padding:'8px 20px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:500, background: activeSet==='set3'?'#0F6E56':'#f0f0f0', color: activeSet==='set3'?'#fff':'#555' }}>Set 3</button>
      </div>

      {/* SET 1 */}
      {activeSet === 'set1' && (
        <div className="card" style={{ marginTop:0 }}>
          <div style={{ fontWeight:500, marginBottom:12 }}>Set 1 — Students ({set1list.length})</div>
          {set1list.length === 0
            ? <div style={{ fontSize:13, color:'#888' }}>No submissions yet.</div>
            : set1list.map((s,i) => (
              <div key={i} onClick={() => setSelected(s)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', border:'1px solid #eee', borderRadius:8, marginBottom:6, cursor:'pointer', background:'#fafafa' }}>
                <div>
                  <div style={{ fontWeight:500, fontSize:14 }}>{s.full_name} <span style={{ color:'#888', fontWeight:400, fontSize:13 }}>@{s.username}</span></div>
                  <div style={{ fontSize:12, color:'#888', marginTop:3 }}>
                    {s.listening_score != null ? `L: ${s.listening_score}/40` : 'L: —'}
                    {' · '}
                    {s.reading_score != null ? `R: ${s.reading_score}/40` : 'R: —'}
                    {' · '}
                    {s.task1 ? `W: ${wc(s.task1)}+${wc(s.task2)} words` : 'W: —'}
                  </div>
                </div>
                <div style={{ fontSize:12, color:'#185FA5' }}>View →</div>
              </div>
            ))
          }
        </div>
      )}

      {/* SET 3 */}
      {activeSet === 'set3' && (
        <div className="card" style={{ marginTop:0 }}>
          <div style={{ fontWeight:500, marginBottom:12 }}>Set 3 — Students ({set3subs.length})</div>
          {!set3loaded
            ? <div style={{ fontSize:13, color:'#888' }}>Loading...</div>
            : set3subs.length === 0
              ? <div style={{ fontSize:13, color:'#888' }}>No submissions yet.</div>
              : set3subs.map((s,i) => (
                <div key={i} onClick={() => setSelected(s)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', border:'1px solid #eee', borderRadius:8, marginBottom:6, cursor:'pointer', background:'#fafafa' }}>
                  <div>
                    <div style={{ fontWeight:500, fontSize:14 }}>{s.full_name} <span style={{ color:'#888', fontWeight:400, fontSize:13 }}>@{s.username}</span></div>
                    <div style={{ fontSize:12, color:'#888', marginTop:3 }}>
                      {s.listening_score != null ? `L: ${s.listening_score}/40` : 'L: —'}
                      {' · '}
                      {s.reading_score != null ? `R: ${s.reading_score}/40` : 'R: —'}
                      {' · '}
                      {s.writing_task1 ? `W: ${wc(s.writing_task1)}+${wc(s.writing_task2)} words` : 'W: —'}
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:'#0F6E56' }}>View →</div>
                </div>
              ))
          }
        </div>
      )}

      {/* SET 2 */}
      {activeSet === 'set2' && (
        <div className="card" style={{ marginTop:0 }}>
          <div style={{ fontWeight:500, marginBottom:12 }}>Set 2 — Students ({set2subs.length})</div>
          {!set2loaded
            ? <div style={{ fontSize:13, color:'#888' }}>Loading...</div>
            : set2subs.length === 0
              ? <div style={{ fontSize:13, color:'#888' }}>No submissions yet.</div>
              : set2subs.map((s,i) => (
                <div key={i} onClick={() => setSelected(s)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', border:'1px solid #eee', borderRadius:8, marginBottom:6, cursor:'pointer', background:'#fafafa' }}>
                  <div>
                    <div style={{ fontWeight:500, fontSize:14 }}>{s.full_name} <span style={{ color:'#888', fontWeight:400, fontSize:13 }}>@{s.username}</span></div>
                    <div style={{ fontSize:12, color:'#888', marginTop:3 }}>
                      {s.listening_score != null ? `L: ${s.listening_score}/40` : 'L: —'}
                      {' · '}
                      {s.reading_score != null ? `R: ${s.reading_score}/40` : 'R: —'}
                      {' · '}
                      {s.writing_task1 ? `W: ${wc(s.writing_task1)}+${wc(s.writing_task2)} words` : 'W: —'}
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:'#0F6E56' }}>View →</div>
                </div>
              ))
          }
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState('auth')
  const [authTab, setAuthTab] = useState('login')
  const [adminTab, setAdminTab] = useState('writing')
  const [currentUser, setCurrentUser] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [pdfParsing, setPdfParsing] = useState(false)
  const [pdfMsg, setPdfMsg] = useState('')
  const [audioUploading, setAudioUploading] = useState([false,false,false,false])
  const [htmlUploading, setHtmlUploading] = useState(false)
  const [htmlMsg, setHtmlMsg] = useState('')
  const [listeningHtmlUrl, setListeningHtmlUrl] = useState('')
  const [readingHtmlUrl, setReadingHtmlUrl] = useState('')

  // Auth
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [regName, setRegName] = useState('')
  const [regUser, setRegUser] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regPass2, setRegPass2] = useState('')
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')

  // Student
  const [mySubs, setMySubs] = useState([])

  // Writing exam
  const [tasks, setTasks] = useState({ task1_instructions: '', task1_image: '', task2_prompt: '', set_name: '' })
  const [ans1, setAns1] = useState('')
  const [ans2, setAns2] = useState('')
  const ans1Ref = useRef('')
  const ans2Ref = useRef('')
  const submittedRef = useRef(false)
  const [savedIndicator, setSavedIndicator] = useState('')
  const [showExitWarning, setShowExitWarning] = useState(false)
  const examStartTimeRef = useRef(null)
  const elapsedRef = useRef(0)
  const [writingPart, setWritingPart] = useState(1)
  const [timeLeft, setTimeLeft] = useState(3600)
  const [timerRunning, setTimerRunning] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const timerRef = useRef(null)

  // Listening exam
  const [listeningData, setListeningData] = useState(null)
  const [listenSection, setListenSection] = useState(0)
  const [listenAnswers, setListenAnswers] = useState({})
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioEnded, setAudioEnded] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showListenSubmit, setShowListenSubmit] = useState(false)
  const audioRef = useRef(null)

  // Reading exam
  const [readingData, setReadingData] = useState(null)
  const [readPassage, setReadPassage] = useState(0)
  const [readAnswers, setReadAnswers] = useState({})
  const [readTimeLeft, setReadTimeLeft] = useState(3600)
  const [readTimerRunning, setReadTimerRunning] = useState(false)
  const [showReadSubmit, setShowReadSubmit] = useState(false)
  const readTimerRef = useRef(null)

  // Admin - Writing
  const [adminSetName, setAdminSetName] = useState('')
  const [adminTask1Img, setAdminTask1Img] = useState('')
  const [adminTask1Text, setAdminTask1Text] = useState('')
  const [adminTask2, setAdminTask2] = useState('')
  const [imgPreview, setImgPreview] = useState('')

  // Admin - Listening
  const [lS1, setLS1] = useState('')
  const [lS2, setLS2] = useState('')
  const [lS3, setLS3] = useState('')
  const [lS4, setLS4] = useState('')
  const [lKey, setLKey] = useState('')
  const [lA1, setLA1] = useState(AUDIO_URLS[0])
  const [lA2, setLA2] = useState(AUDIO_URLS[1])
  const [lA3, setLA3] = useState(AUDIO_URLS[2])
  const [lA4, setLA4] = useState(AUDIO_URLS[3])

  // Admin - Reading
  const [rP1T, setRP1T] = useState('')
  const [rP1Txt, setRP1Txt] = useState('')
  const [rP1Q, setRP1Q] = useState('')
  const [rP2T, setRP2T] = useState('')
  const [rP2Txt, setRP2Txt] = useState('')
  const [rP2Q, setRP2Q] = useState('')
  const [rP3T, setRP3T] = useState('')
  const [rP3Txt, setRP3Txt] = useState('')
  const [rP3Q, setRP3Q] = useState('')
  const [rKey, setRKey] = useState('')

  // Admin - Submissions
  const [students, setStudents] = useState([])
  const [writingSubs, setWritingSubs] = useState([])
  const [listeningSubs, setListeningSubs] = useState([])
  const [readingSubs, setReadingSubs] = useState([])

  useEffect(() => {
    const saved = localStorage.getItem('ielts_user')
    if (saved) {
      const user = JSON.parse(saved)
      setCurrentUser(user)
      if (user.isAdmin) { loadAdmin(); setScreen('admin') }
      else { loadMySubs(user.username); setScreen('home') }
    }
  }, [])

  // Writing timer — uses real wall clock so it never stops
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

  // Reading timer
  useEffect(() => {
    if (readTimerRunning) {
      readTimerRef.current = setInterval(() => {
        setReadTimeLeft(t => { if (t <= 1) { clearInterval(readTimerRef.current); setReadTimerRunning(false); submitReading(); return 0 } return t - 1 })
      }, 1000)
    }
    return () => clearInterval(readTimerRef.current)
  }, [readTimerRunning])

  // Fullscreen exit warning
  useEffect(() => {
    if (screen !== 'writing-exam') return
    function handleFullscreenChange() {
      const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement)
      if (!isFullscreen) {
        setShowExitWarning(true)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setShowExitWarning(true)
      }
    }
    function handleVisibilityChange() {
      if (document.hidden) {
        setShowExitWarning(true)
      }
    }
    function handleBeforeUnload(e) {
      if (screen === 'writing-exam' && timerRunning) {
        e.preventDefault()
        e.returnValue = 'Your exam is in progress. Leaving will submit your current work.'
        return e.returnValue
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [screen, timerRunning])

  // Listen for scores and writing from iframe
  useEffect(() => {
    function handleMessage(e) {
      if (!e.data) return

      // Set 1: Listening/Reading scores
      if (e.data.type === 'IELTS_SCORE') {
        const { module, score, results } = e.data
        if (!currentUser) return
        if (module === 'listening') {
          supabase.from('listening_submissions').insert({ username: currentUser.username, full_name: currentUser.full_name, answers: {}, score, results: results || [] })
          go('reading-warn')
        } else if (module === 'reading') {
          supabase.from('reading_submissions').insert({ username: currentUser.username, full_name: currentUser.full_name, answers: {}, score, results: results || [] })
          goWritingWarn()
        }
      }

      // Set 2: Writing submission from HTML iframe
      if (e.data.type === 'IELTS_WRITING') {
        const { task1, task2 } = e.data
        if (!currentUser) return
        supabase.from('set2_submissions').upsert({
          username: currentUser.username,
          full_name: currentUser.full_name,
          writing_task1: task1,
          writing_task2: task2,
          completed_at: new Date().toISOString()
        }, { onConflict: 'username' })
        go('done')
      }

      // Set 3: Writing submission
      if (e.data.type === 'IELTS_WRITING_S3') {
        const { task1, task2 } = e.data
        if (!currentUser) return
        supabase.from('set3_submissions').upsert({
          username: currentUser.username,
          full_name: currentUser.full_name,
          writing_task1: task1,
          writing_task2: task2,
          completed_at: new Date().toISOString()
        }, { onConflict: 'username' })
        go('done')
      }

      // Set 3: Listening/Reading scores
      if (e.data.type === 'IELTS_SCORE_S3') {
        const { module, score, results } = e.data
        if (!currentUser) return
        if (module === 'listening') {
          supabase.from('set3_submissions').upsert({
            username: currentUser.username,
            full_name: currentUser.full_name,
            listening_score: score,
            listening_results: results || [],
            completed_at: new Date().toISOString()
          }, { onConflict: 'username' })
          go('reading-warn')
        } else if (module === 'reading') {
          supabase.from('set3_submissions').upsert({
            username: currentUser.username,
            full_name: currentUser.full_name,
            reading_score: score,
            reading_results: results || [],
            completed_at: new Date().toISOString()
          }, { onConflict: 'username' })
          goWritingWarn()
        }
      }

      // Set 2: Listening/Reading scores with per-question breakdown
      if (e.data.type === 'IELTS_SCORE') {
        const { module, score, results } = e.data
        if (!currentUser) return
        if (module === 'listening') {
          supabase.from('set2_submissions').upsert({
            username: currentUser.username,
            full_name: currentUser.full_name,
            listening_score: score,
            listening_results: results || [],
            completed_at: new Date().toISOString()
          }, { onConflict: 'username' })
          go('reading-warn')
        } else if (module === 'reading') {
          supabase.from('set2_submissions').upsert({
            username: currentUser.username,
            full_name: currentUser.full_name,
            reading_score: score,
            reading_results: results || [],
            completed_at: new Date().toISOString()
          }, { onConflict: 'username' })
          goWritingWarn()
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [currentUser])

  // Auto-save every second during exam
  useEffect(() => {
    if (screen !== 'writing-exam' || !currentUser) return
    const interval = setInterval(() => {
      const t1 = ans1Ref.current || ans1
      const t2 = ans2Ref.current || ans2
      if (submittedRef.current) return
      localStorage.setItem('ielts_autosave_' + currentUser.username, JSON.stringify({ t1, t2, savedAt: new Date().toISOString() }))
      setSavedIndicator('saved')
    }, 1000)
    return () => clearInterval(interval)
  }, [screen, currentUser])

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const wc = (t) => t ? t.trim().split(/\s+/).filter(Boolean).length : 0
  const go = (s) => { setScreen(s); setError('') }

  // Auth
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
    if (err) return setError('Error creating account.')
    const u = { username: regUser.toLowerCase(), full_name: regName }
    setCurrentUser(u); localStorage.setItem('ielts_user', JSON.stringify(u))
    await loadMySubs(u.username); go('home')
  }

  async function doLogin() {
    setError(''); setLoading(true)
    const { data, error: err } = await supabase.from('users').select('*').eq('username', loginUser.toLowerCase()).eq('password', loginPass).single()
    setLoading(false)
    if (err || !data) return setError('Incorrect username or password.')
    const u = { username: data.username, full_name: data.full_name }
    setCurrentUser(u); localStorage.setItem('ielts_user', JSON.stringify(u))
    await loadMySubs(u.username); go('home')
  }

  function doAdminLogin() {
    setError('')
    if (adminUser === ADMIN_USER && adminPass === ADMIN_PASS) {
      const u = { username: ADMIN_USER, full_name: 'Teacher', isAdmin: true }
      setCurrentUser(u); localStorage.setItem('ielts_user', JSON.stringify(u))
      loadAdmin(); go('admin')
    } else setError('Incorrect admin credentials.')
  }

  function logout() {
    clearInterval(timerRef.current); clearInterval(readTimerRef.current)
    setTimerRunning(false); setReadTimerRunning(false)
    setCurrentUser(null); localStorage.removeItem('ielts_user')
    setAns1(''); setAns2(''); go('auth')
  }

  async function loadMySubs(username) {
    const { data } = await supabase.from('submissions').select('*').eq('username', username).order('submitted_at', { ascending: false })
    setMySubs(data || [])
  }

  // Writing exam
  async function goWritingWarn() {
    const { data } = await supabase.from('tasks').select('*').eq('id', 1).single()
    if (!data || (!data.task1_instructions && !data.task2_prompt)) return setError('No writing tasks uploaded yet.')

    if (data.updated_at) {
      const uploadDate = new Date(data.updated_at)
      const deadline = new Date(uploadDate.getFullYear(), uploadDate.getMonth(), uploadDate.getDate(), 23, 59, 59, 999)
      const now = new Date()
      if (now > deadline) return setError('The deadline for this writing task has passed (midnight on ' + deadline.toLocaleDateString() + ').')
    }

    try {
      const { data: subs } = await supabase.from('submissions')
        .select('id, task1_answer, task2_answer, submitted_at')
        .eq('username', currentUser.username)
        .order('submitted_at', { ascending: false })

      if (subs && subs.length > 0) {
        const validSub = subs.find(s => s.task1_answer && s.task1_answer.trim().length > 10)
        if (validSub) {
          const wc1 = validSub.task1_answer.trim().split(/\s+/).filter(Boolean).length
          const wc2 = validSub.task2_answer ? validSub.task2_answer.trim().split(/\s+/).filter(Boolean).length : 0
          return setError('Already submitted on ' + new Date(validSub.submitted_at).toLocaleString() + ' — Task 1: ' + wc1 + ' words · Task 2: ' + wc2 + ' words.')
        }
      }
    } catch(e) {}

    setTasks(data); setError(''); go('writing-warn')
  }

  function startWriting() {
    setAns1(''); setAns2(''); ans1Ref.current = ''; ans2Ref.current = ''; submittedRef.current = false
    examStartTimeRef.current = Date.now()
    elapsedRef.current = 0
    setTimeLeft(3600); setWritingPart(1); setTimerRunning(true); go('writing-exam')
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
        const backup = localStorage.getItem('ielts_autosave_' + currentUser.username)
        if (backup) {
          const parsed = JSON.parse(backup)
          t1 = parsed.t1 || ''
          t2 = parsed.t2 || ''
        }
      } catch(e) {}
    }

    const { error } = await supabase.from('submissions').insert({ 
      username: currentUser.username, 
      full_name: currentUser.full_name, 
      task1_answer: t1, 
      task2_answer: t2 
    })
    if (error) {
      submittedRef.current = false
      alert('Error saving: ' + error.message + '. Screenshot your work and send to teacher!')
      return
    }
    try { localStorage.removeItem('ielts_autosave_' + currentUser.username) } catch(e) {}
    go('done')
  }

  // Listening exam
  async function goListeningWarn() {
    const { data } = await supabase.from('html_tests').select('*').eq('id', 'listening').single()
    if (!data || (!data.content && !data.url)) return setError('No listening test uploaded yet. Ask your teacher.')
    setListeningData(data); setError(''); go('listening-warn')
  }

  function startListening() {
    go('listening-exam')
  }

  function playPause() {
    if (!audioRef.current) return
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false) }
    else { audioRef.current.play(); setIsPlaying(true) }
  }

  function nextListenSection() {
    if (listenSection < 3) {
      const next = listenSection + 1
      setListenSection(next); setAudioEnded(false); setIsPlaying(false)
      const urls = [listeningData?.audio1_url, listeningData?.audio2_url, listeningData?.audio3_url, listeningData?.audio4_url]
      if (audioRef.current) { audioRef.current.src = urls[next] || AUDIO_URLS[next]; audioRef.current.load() }
    } else setShowListenSubmit(true)
  }

  function setListenAnswer(qNum, val) { setListenAnswers(prev => ({ ...prev, [qNum]: val })) }

  async function submitListening() {
    setShowListenSubmit(false)
    const key = listeningData?.answer_key || {}
    let score = 0
    Object.entries(key).forEach(([q, correct]) => {
      const ua = listenAnswers[q]
      if (ua && ua.trim().toLowerCase() === String(correct).trim().toLowerCase()) score++
    })
    await supabase.from('listening_submissions').insert({ username: currentUser.username, full_name: currentUser.full_name, answers: listenAnswers, score })
    goReadingWarn()
  }

  // Reading exam
  async function goReadingWarn() {
    const { data } = await supabase.from('html_tests').select('*').eq('id', 'reading').single()
    if (!data || (!data.content && !data.url)) return setError('No reading test uploaded yet. Ask your teacher.')
    setReadingData(data); setError(''); go('reading-warn')
  }

  function startReading() {
    go('reading-exam')
  }

  function setReadAnswer(qNum, val) { setReadAnswers(prev => ({ ...prev, [qNum]: val })) }

  async function submitReading() {
    clearInterval(readTimerRef.current); setReadTimerRunning(false); setShowReadSubmit(false)
    const key = readingData?.answer_key || {}
    let score = 0
    Object.entries(key).forEach(([q, correct]) => {
      const ua = readAnswers[q]
      if (ua && ua.trim().toLowerCase() === String(correct).trim().toLowerCase()) score++
    })
    await supabase.from('reading_submissions').insert({ username: currentUser.username, full_name: currentUser.full_name, answers: readAnswers, score })
    goWritingWarn()
  }

  // PDF upload handlers
  async function callClaudeWithPDF(base64, type) {
    const prompt = type === 'listening'
      ? `This is an IELTS Listening test PDF. Extract ALL questions organized by section. Return ONLY a JSON object:
{"section1":"1. question ___\n2. another ___\n...","section2":"11. MCQ question\nA. option\nB. option\nC. option\n...","section3":"21. question\nA. option\n...","section4":"31. ___ word\n...","answerKey":{"1":"answer","11":"C"}}`
      : `This is an IELTS Reading test PDF. Extract ALL passages and questions. Return ONLY a JSON object:
{"passages":[{"title":"Passage 1 title","text":"Full passage text...","questions":"1. gap ___ fill\n8. True false statement\n14. MCQ\nA. option\nB. option"},{"title":"Passage 2","text":"...","questions":"..."},{"title":"Passage 3","text":"...","questions":"..."}],"answerKey":{"1":"white","8":"TRUE","14":"D"}}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.NEXT_PUBLIC_ANTHROPIC_KEY || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    })
    if (!response.ok) throw new Error('API error: ' + response.status)
    const data = await response.json()
    const text = data.content[0].text.trim()
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(clean)
  }

  async function uploadListeningPDF(file) {
    if (!file) return
    setPdfParsing(true); setPdfMsg('Reading PDF with AI... (15-30 seconds)')
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1]
      try {
        const data = await callClaudeWithPDF(base64, 'listening')
        if (data.section1) setLS1(data.section1)
        if (data.section2) setLS2(data.section2)
        if (data.section3) setLS3(data.section3)
        if (data.section4) setLS4(data.section4)
        if (data.answerKey && Object.keys(data.answerKey).length > 0) {
          setLKey(Object.entries(data.answerKey).map(([k,v]) => k + '. ' + v).join('\n'))
        }
        setPdfMsg('PDF extracted! Review the sections below and save.')
      } catch(err) { setPdfMsg('Failed: ' + err.message) }
      setPdfParsing(false)
    }
    reader.readAsDataURL(file)
  }

  async function uploadReadingPDF(file) {
    if (!file) return
    setPdfParsing(true); setPdfMsg('Reading PDF with AI... (15-30 seconds)')
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1]
      try {
        const data = await callClaudeWithPDF(base64, 'reading')
        if (data.passages) {
          setRP1T(data.passages[0]?.title || ''); setRP1Txt(data.passages[0]?.text || ''); setRP1Q(data.passages[0]?.questions || '')
          setRP2T(data.passages[1]?.title || ''); setRP2Txt(data.passages[1]?.text || ''); setRP2Q(data.passages[1]?.questions || '')
          setRP3T(data.passages[2]?.title || ''); setRP3Txt(data.passages[2]?.text || ''); setRP3Q(data.passages[2]?.questions || '')
        }
        if (data.answerKey && Object.keys(data.answerKey).length > 0) {
          setRKey(Object.entries(data.answerKey).map(([k,v]) => k + '. ' + v).join('\n'))
        }
        setPdfMsg('PDF extracted! Review passages and questions, then save.')
      } catch(err) { setPdfMsg('Failed: ' + err.message) }
      setPdfParsing(false)
    }
    reader.readAsDataURL(file)
  }

  async function uploadAudioFile(file, idx) {
    if (!file) return
    const upd = [...audioUploading]; upd[idx] = true; setAudioUploading(upd)
    const fileName = 'section' + (idx+1) + '_' + Date.now() + '.mp3'
    const { error } = await supabase.storage.from('audio').upload(fileName, file, { upsert: true, contentType: 'audio/mpeg' })
    const upd2 = [...audioUploading]; upd2[idx] = false; setAudioUploading(upd2)
    if (error) { setSaveMsg('Audio upload failed: ' + error.message); return }
    const url = 'https://dsitketafrgrcxpncsrb.supabase.co/storage/v1/object/public/audio/' + fileName;
    [setLA1,setLA2,setLA3,setLA4][idx](url)
    setSaveMsg('Section ' + (idx+1) + ' audio uploaded!'); setTimeout(() => setSaveMsg(''), 3000)
  }

  async function uploadHtmlFile(file, module) {
    if (!file) return
    setHtmlUploading(true)
    setHtmlMsg('Uploading ' + module + ' HTML...')
    const fileName = module + '_' + Date.now() + '.html'
    const { error } = await supabase.storage.from('html-tests').upload(fileName, file, { upsert: true, contentType: 'text/html' })
    if (error) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const htmlContent = e.target.result
        await supabase.from('html_tests').upsert({ id: module, content: htmlContent, updated_at: new Date().toISOString() })
        setHtmlMsg(module + ' HTML saved successfully!')
        if (module === 'listening') setListeningHtmlUrl('db')
        else setReadingHtmlUrl('db')
        setHtmlUploading(false)
        setTimeout(() => setHtmlMsg(''), 4000)
      }
      reader.readAsText(file)
      return
    }
    const url = 'https://dsitketafrgrcxpncsrb.supabase.co/storage/v1/object/public/html-tests/' + fileName
    await supabase.from('html_tests').upsert({ id: module, content: null, url: url, updated_at: new Date().toISOString() })
    if (module === 'listening') setListeningHtmlUrl(url)
    else setReadingHtmlUrl(url)
    setHtmlMsg(module + ' HTML uploaded!')
    setHtmlUploading(false)
    setTimeout(() => setHtmlMsg(''), 4000)
  }

  // Admin
  async function loadAdmin() {
    const { data: ht } = await supabase.from('html_tests').select('*')
    if (ht) {
      const lh = ht.find(h => h.id === 'listening')
      const rh = ht.find(h => h.id === 'reading')
      if (lh) setListeningHtmlUrl(lh.url || 'db')
      if (rh) setReadingHtmlUrl(rh.url || 'db')
    }
    const { data: wt } = await supabase.from('tasks').select('*').eq('id', 1).single()
    if (wt) { setAdminSetName(wt.set_name||''); setAdminTask1Text(wt.task1_instructions||''); setAdminTask2(wt.task2_prompt||''); if (wt.task1_image) setImgPreview(wt.task1_image) }
    const { data: lt } = await supabase.from('listening_tests').select('*').eq('id', 1).single()
    if (lt) { setLA1(lt.audio1_url||AUDIO_URLS[0]); setLA2(lt.audio2_url||AUDIO_URLS[1]); setLA3(lt.audio3_url||AUDIO_URLS[2]); setLA4(lt.audio4_url||AUDIO_URLS[3]) }
    const { data: rt } = await supabase.from('reading_tests').select('*').eq('id', 1).single()
    if (rt) { setRP1T(rt.passage1_title||''); setRP1Txt(rt.passage1_text||''); setRP2T(rt.passage2_title||''); setRP2Txt(rt.passage2_text||''); setRP3T(rt.passage3_title||''); setRP3Txt(rt.passage3_text||'') }
    const { data: u } = await supabase.from('users').select('*').order('created_at', { ascending: false })
    setStudents(u||[])
    const { data: ws } = await supabase.from('submissions').select('*').order('submitted_at', { ascending: false })
    setWritingSubs(ws||[])
    const { data: ls } = await supabase.from('listening_submissions').select('*').order('submitted_at', { ascending: false })
    setListeningSubs(ls||[])
    const { data: rs } = await supabase.from('reading_submissions').select('*').order('submitted_at', { ascending: false })
    setReadingSubs(rs||[])
  }

  function handleImgUpload(e) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setAdminTask1Img(ev.target.result); setImgPreview(ev.target.result) }
    reader.readAsDataURL(file)
  }

  async function saveWritingTasks() {
    await supabase.from('tasks').upsert({ id: 1, set_name: adminSetName, task1_instructions: adminTask1Text, task1_image: adminTask1Img||imgPreview, task2_prompt: adminTask2, updated_at: new Date().toISOString() })
    setSaveMsg('Writing saved!'); setTimeout(() => setSaveMsg(''), 3000)
  }

  async function saveListening() {
    const s1 = parseListeningQuestions(lS1), s2 = parseListeningQuestions(lS2)
    const s3 = parseListeningQuestions(lS3), s4 = parseListeningQuestions(lS4)
    const key = parseAnswerKey(lKey)
    await supabase.from('listening_tests').upsert({ id: 1, section1_questions: s1, section2_questions: s2, section3_questions: s3, section4_questions: s4, answer_key: key, audio1_url: lA1, audio2_url: lA2, audio3_url: lA3, audio4_url: lA4, updated_at: new Date().toISOString() })
    setSaveMsg(`Listening saved! S1:${s1.length} S2:${s2.length} S3:${s3.length} S4:${s4.length} Qs, ${Object.keys(key).length} answers`); setTimeout(() => setSaveMsg(''), 5000)
  }

  async function saveReading() {
    const p1q = parseReadingQuestions(rP1Q), p2q = parseReadingQuestions(rP2Q), p3q = parseReadingQuestions(rP3Q)
    const key = parseAnswerKey(rKey)
    await supabase.from('reading_tests').upsert({ id: 1, passage1_title: rP1T, passage1_text: rP1Txt, passage1_questions: p1q, passage2_title: rP2T, passage2_text: rP2Txt, passage2_questions: p2q, passage3_title: rP3T, passage3_text: rP3Txt, passage3_questions: p3q, answer_key: key, updated_at: new Date().toISOString() })
    setSaveMsg(`Reading saved! P1:${p1q.length} P2:${p2q.length} P3:${p3q.length} Qs, ${Object.keys(key).length} answers`); setTimeout(() => setSaveMsg(''), 5000)
  }

  // Question renderers
  function renderListenQs(questions) {
    if (!questions?.length) return <div style={{ color: '#888', fontSize: 14 }}>No questions loaded.</div>
    return questions.map((q, i) => {
      if (q.type === 'gap') return (
        <div key={i} style={{ marginBottom: 14, fontSize: 14, lineHeight: 1.8 }}>
          <strong>{q.number}.</strong> {q.before} <input type="text" value={listenAnswers[q.number]||''} onChange={e => setListenAnswer(q.number, e.target.value)} style={{ display:'inline-block', width:140, padding:'3px 8px', border:'1px solid #ddd', borderRadius:4, fontSize:14, margin:'0 6px' }} placeholder="..." /> {q.after}
        </div>
      )
      if (q.type === 'mcq') return (
        <div key={i} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}><strong>{q.number}.</strong> {q.question}</div>
          {q.options?.map((o, j) => (
            <label key={j} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:6, cursor:'pointer', fontSize:14 }}>
              <input type="radio" name={`lq${q.number}`} value={o.letter} checked={listenAnswers[q.number]===o.letter} onChange={() => setListenAnswer(q.number, o.letter)} style={{ marginTop:3 }} />
              <span><strong>{o.letter}</strong> {o.text}</span>
            </label>
          ))}
        </div>
      )
      return null
    })
  }

  function renderReadQs(questions) {
    if (!questions?.length) return <div style={{ color: '#888', fontSize: 14 }}>No questions loaded.</div>
    return questions.map((q, i) => {
      if (q.type === 'gap') return (
        <div key={i} style={{ marginBottom: 14, fontSize: 14, lineHeight: 1.8 }}>
          <strong>{q.number}.</strong> {q.before} <input type="text" value={readAnswers[q.number]||''} onChange={e => setReadAnswer(q.number, e.target.value)} style={{ display:'inline-block', width:140, padding:'3px 8px', border:'1px solid #ddd', borderRadius:4, fontSize:14, margin:'0 6px' }} placeholder="..." /> {q.after}
        </div>
      )
      if (q.type === 'tfng') return (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}><strong>{q.number}.</strong> {q.statement}</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {['TRUE','FALSE','NOT GIVEN'].map(opt => (
              <button key={opt} onClick={() => setReadAnswer(q.number, opt)} style={{ padding:'5px 12px', border:'1px solid', borderRadius:6, fontSize:13, cursor:'pointer', borderColor: readAnswers[q.number]===opt?'#185FA5':'#ddd', background: readAnswers[q.number]===opt?'#185FA5':'#fff', color: readAnswers[q.number]===opt?'#fff':'#111' }}>{opt}</button>
            ))}
          </div>
        </div>
      )
      if (q.type === 'mcq') return (
        <div key={i} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}><strong>{q.number}.</strong> {q.question}</div>
          {q.options?.map((o, j) => (
            <label key={j} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:6, cursor:'pointer', fontSize:14 }}>
              <input type="radio" name={`rq${q.number}`} value={o.letter} checked={readAnswers[q.number]===o.letter} onChange={() => setReadAnswer(q.number, o.letter)} style={{ marginTop:3 }} />
              <span><strong>{o.letter}</strong> {o.text}</span>
            </label>
          ))}
        </div>
      )
      if (q.type === 'para_match') return (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}><strong>{q.number}.</strong> {q.statement}</div>
          <select value={readAnswers[q.number]||''} onChange={e => setReadAnswer(q.number, e.target.value)} style={{ padding:'6px 10px', border:'1px solid #ddd', borderRadius:4, fontSize:14, maxWidth:200 }}>
            <option value="">Paragraph...</option>
            {['A','B','C','D','E','F','G','H'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      )
      return null
    })
  }

  const timerColor = timeLeft <= 300 ? '#c00' : '#185FA5'
  const readTimerColor = readTimeLeft <= 600 ? '#c00' : '#185FA5'
  const listenSectionData = listeningData ? [listeningData.section1_questions, listeningData.section2_questions, listeningData.section3_questions, listeningData.section4_questions] : []
  const readPassages = readingData ? [
    { title: readingData.passage1_title, text: readingData.passage1_text, questions: readingData.passage1_questions },
    { title: readingData.passage2_title, text: readingData.passage2_text, questions: readingData.passage2_questions },
    { title: readingData.passage3_title, text: readingData.passage3_text, questions: readingData.passage3_questions },
  ] : []

  return (
    <>
      <Head><title>IELTS Practice</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #111; font-size: 15px; }
        input, textarea, select { width: 100%; padding: 9px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; font-family: inherit; background: #fff; color: #111; resize: vertical; }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #185FA5; }
        .btn { padding: 10px 20px; border: 1px solid #ddd; border-radius: 8px; background: #fff; color: #111; font-size: 14px; cursor: pointer; font-family: inherit; display: block; width: 100%; margin-top: 10px; }
        .btn:hover { background: #f0f0f0; }
        .btn-blue { background: #185FA5; color: #fff; border-color: #185FA5; }
        .btn-blue:hover { background: #0C447C; }
        .btn-red { background: #A32D2D; color: #fff; border-color: #A32D2D; }
        .btn-green { background: #0F6E56; color: #fff; border-color: #0F6E56; }
        .btn-sm { width: auto; margin-top: 0; padding: 7px 14px; font-size: 13px; }
        .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 1.25rem; margin-top: 12px; }
        .lbl { font-size: 13px; color: #666; display: block; margin-top: 12px; margin-bottom: 5px; }
        .err { color: #A32D2D; font-size: 13px; margin-top: 8px; }
        .ok { color: #0F6E56; font-size: 13px; }
        .logo { color: #c00; font-weight: 700; font-size: 20px; }
        .atab { flex: 1; padding: 9px; border: none; background: #fff; color: #888; font-size: 13px; cursor: pointer; font-family: inherit; }
        .atab.on { background: #f5f5f5; color: #111; font-weight: 500; }
        .ptab { padding: 7px 14px; border: none; font-size: 13px; cursor: pointer; font-family: inherit; border-radius: 6px; background: transparent; color: #888; }
        .ptab.on { background: #fff; color: #111; font-weight: 500; }
        .upload-box { border: 2px dashed #ddd; border-radius: 8px; padding: 1rem; text-align: center; cursor: pointer; color: #888; font-size: 13px; margin-top: 6px; }
        .upload-box:hover { border-color: #185FA5; background: #fafafa; }
        .modal-bg { position: fixed; top:0;left:0;right:0;bottom:0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .sbox { background: #f9f9f9; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
        .passage-text p { margin-bottom: 1em; font-size: 14px; line-height: 1.8; }
      `}</style>

      <audio ref={audioRef} onEnded={() => { setIsPlaying(false); setAudioEnded(true) }} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />

      {/* ===== AUTH ===== */}
      {screen === 'auth' && (
        <div style={{ maxWidth: 400, margin: '3rem auto', padding: '0 1rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div className="logo">IELTS</div>
            <div style={{ fontSize: 22, fontWeight: 500, marginTop: 6 }}>Practice Platform</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Listening · Reading · Writing</div>
          </div>
          <div className="card" style={{ marginTop: 0 }}>
            <div style={{ display: 'flex', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: '1rem' }}>
              <button className={`atab ${authTab==='login'?'on':''}`} onClick={() => { setAuthTab('login'); setError('') }}>Sign in</button>
              <button className={`atab ${authTab==='reg'?'on':''}`} onClick={() => { setAuthTab('reg'); setError('') }}>Create account</button>
              <button className={`atab ${authTab==='admin'?'on':''}`} onClick={() => { setAuthTab('admin'); setError('') }}>Teacher</button>
            </div>
            {authTab === 'login' && (
              <div>
                <label className="lbl" style={{ marginTop: 0 }}>Username</label>
                <input value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="Your username" onKeyDown={e => e.key==='Enter'&&doLogin()} />
                <label className="lbl">Password</label>
                <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="Your password" onKeyDown={e => e.key==='Enter'&&doLogin()} />
                {error && <div className="err">{error}</div>}
                <button className="btn btn-blue" onClick={doLogin} disabled={loading}>{loading?'Signing in...':'Sign in'}</button>
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
                <button className="btn btn-blue" onClick={doRegister} disabled={loading}>{loading?'Creating...':'Create account'}</button>
              </div>
            )}
            {authTab === 'admin' && (
              <div>
                <label className="lbl" style={{ marginTop: 0 }}>Admin username</label>
                <input value={adminUser} onChange={e => setAdminUser(e.target.value)} placeholder="Username" />
                <label className="lbl">Admin password</label>
                <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="Password" onKeyDown={e => e.key==='Enter'&&doAdminLogin()} />
                {error && <div className="err">{error}</div>}
                <button className="btn btn-blue" onClick={doAdminLogin}>Enter admin panel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== HOME ===== */}
      {screen === 'home' && (
        <div style={{ maxWidth: 540, margin: '2rem auto', padding: '0 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div><div className="logo">IELTS</div><div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Welcome, {currentUser?.full_name}</div></div>
            <button className="btn btn-sm" onClick={logout}>Sign out</button>
          </div>
          <div className="card" style={{ border: '2px solid #185FA5', marginTop: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 16 }}>Writing Practice</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 6, lineHeight: 1.6 }}>60 minutes · Task 1 + Task 2</div>
            {error && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#A32D2D', marginTop: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-blue btn-sm" onClick={goWritingWarn}>Start Writing</button>
            </div>
          </div>

          <div className="card" style={{ border: '2px solid #0F6E56', marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 16 }}>Set 2 — Full Mock Test</div>
                <div style={{ display: 'flex', gap: 6, margin: '8px 0', flexWrap: 'wrap' }}>
                  <div style={{ background: '#E1F5EE', color: '#0F6E56', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>Listening</div>
                  <div style={{ color: '#888', fontSize: 12, display: 'flex', alignItems: 'center' }}>→</div>
                  <div style={{ background: '#E1F5EE', color: '#0F6E56', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>Reading</div>
                  <div style={{ color: '#888', fontSize: 12, display: 'flex', alignItems: 'center' }}>→</div>
                  <div style={{ background: '#E1F5EE', color: '#0F6E56', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>Writing</div>
                </div>
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>Complete all three modules in order. Real mock conditions.</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <a href="/set2" style={{ display: 'inline-block', padding: '8px 18px', background: '#0F6E56', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Go to Set 2 →</a>
              <a href="/set3" style={{ display: 'inline-block', padding: '8px 18px', background: '#185FA5', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none', marginLeft: 8 }}>Go to Set 3 →</a>
            </div>
          </div>
          <div className="card">
            <div style={{ fontWeight: 500, marginBottom: 10 }}>My submissions</div>
            {mySubs.length === 0
              ? <div style={{ fontSize: 13, color: '#888' }}>No submissions yet. Start your first practice!</div>
              : mySubs.map((s, i) => (
                <div key={i} style={{ borderTop: '1px solid #eee', padding: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{new Date(s.submitted_at).toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Task 1: {wc(s.task1_answer)} words · Task 2: {wc(s.task2_answer)} words</div>
                  </div>
                  <button className="btn btn-green btn-sm" onClick={() => downloadPDF(s)}>PDF</button>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ===== LISTENING WARN ===== */}
      {screen === 'listening-warn' && (
        <div style={{ maxWidth: 460, margin: '3rem auto', padding: '0 1rem' }}>
          <div className="card" style={{ marginTop: 0, border: '1px solid #E24B4A' }}>
            <div className="logo" style={{ marginBottom: 10 }}>IELTS</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Listening Test</div>
            <div style={{ fontSize: 14, lineHeight: 2.1, color: '#555' }}>
              • <strong>4 sections</strong>, <strong>40 questions</strong><br />
              • Each section audio plays <strong>once</strong><br />
              • Answer while listening<br />
              • After Listening → <strong>Reading</strong> starts
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.2rem' }}>
              <button className="btn btn-sm" onClick={() => go('home')}>Back</button>
              <button className="btn btn-blue btn-sm" onClick={startListening}>Start Listening</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== LISTENING EXAM ===== */}
      {screen === 'listening-exam' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#fff', zIndex: 1000 }}>
          <iframe
            id="listening-iframe"
            srcDoc={listeningData?.content || ''}
            src={listeningData?.url || undefined}
            style={{ width: '100%', height: '100%', border: 'none' }}
            onLoad={() => {
              const iframe = document.getElementById('listening-iframe')
              if (iframe && iframe.contentDocument) {
                const script = iframe.contentDocument.createElement('script')
                script.textContent = `window.addEventListener('message', function(){});`
                iframe.contentDocument.body.appendChild(script)
              }
            }}
          />
        </div>
      )}

      {/* ===== READING WARN ===== */}
      {screen === 'reading-warn' && (
        <div style={{ maxWidth: 460, margin: '3rem auto', padding: '0 1rem' }}>
          <div className="card" style={{ marginTop: 0, border: '1px solid #E24B4A' }}>
            <div className="logo" style={{ marginBottom: 10 }}>IELTS</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Reading Test</div>
            <div style={{ fontSize: 14, lineHeight: 2.1, color: '#555' }}>
              • <strong>3 passages</strong>, <strong>40 questions</strong><br />
              • You have <strong>60 minutes</strong><br />
              • ~20 minutes per passage<br />
              • After Reading → <strong>Writing</strong> starts
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.2rem' }}>
              <button className="btn btn-sm" onClick={() => go('home')}>Back</button>
              <button className="btn btn-blue btn-sm" onClick={startReading}>Start Reading</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== READING EXAM ===== */}
      {screen === 'reading-exam' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#fff', zIndex: 1000 }}>
          <iframe
            id="reading-iframe"
            srcDoc={readingData?.content || ''}
            src={readingData?.url || undefined}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      )}

      {/* ===== WRITING WARN ===== */}
      {screen === 'writing-warn' && (
        <div style={{ maxWidth: 460, margin: '3rem auto', padding: '0 1rem' }}>
          <div className="card" style={{ marginTop: 0, border: '1px solid #E24B4A' }}>
            <div className="logo" style={{ marginBottom: 10 }}>IELTS</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Writing Test</div>
            {tasks.set_name && <div style={{ fontSize: 13, color: '#185FA5', fontWeight: 500, marginBottom: 12, background: '#EFF6FF', padding: '5px 10px', borderRadius: 6, display: 'inline-block' }}>{tasks.set_name}</div>}
            <div style={{ fontSize: 14, lineHeight: 2.1, color: '#555', marginTop: 8 }}>
              • Timer starts when you click <strong>Start</strong><br />
              • <strong>60 minutes</strong> total<br />
              • Task 1: at least 150 words (20 min)<br />
              • Task 2: at least 250 words (40 min)<br />
              • Timer <strong>cannot be paused</strong>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.2rem' }}>
              <button className="btn btn-sm" onClick={() => go('home')}>Back</button>
              <button className="btn btn-blue btn-sm" onClick={startWriting}>Start — 60:00</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== WRITING EXAM ===== */}
      {screen === 'writing-exam' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '10px 1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="logo" style={{ fontSize: 16 }}>IELTS Writing</div>
              {savedIndicator === 'saved' && <div style={{ fontSize: 12, color: '#0F6E56', display: 'flex', alignItems: 'center', gap: 4 }}>✓ Saved</div>}
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
                  {tasks.task1_image && <img src={tasks.task1_image} alt="Task 1" style={{ width: '100%', borderRadius: 6, border: '1px solid #eee', marginBottom: 12 }} />}
                  <div style={{ fontSize: 14, lineHeight: 1.7 }}>{tasks.task1_instructions}</div>
                </div>
              )}
              {writingPart === 2 && (
                <div>
                  <div style={{ background: '#f5f5f5', padding: '9px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}><strong>Task 2</strong> — ~40 minutes. At least <strong>250 words</strong>.</div>
                  <div style={{ fontSize: 14, lineHeight: 1.7 }}>{tasks.task2_prompt}</div>
                </div>
              )}
            </div>
            <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
              <textarea value={ans1} onChange={e => { setAns1(e.target.value); ans1Ref.current = e.target.value }} placeholder="Write your Task 1 response here..." style={{ flex: 1, fontSize: 14, lineHeight: 1.8, minHeight: 400, display: writingPart === 1 ? 'block' : 'none' }} />
              <textarea value={ans2} onChange={e => { setAns2(e.target.value); ans2Ref.current = e.target.value }} placeholder="Write your Task 2 response here..." style={{ flex: 1, fontSize: 14, lineHeight: 1.8, minHeight: 400, display: writingPart === 2 ? 'block' : 'none' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8 }}>
                <span style={{ color: '#888' }}>Words: {wc(writingPart===1?ans1:ans2)}</span>
                {writingPart===1 && wc(ans1)<150 && <span style={{ color:'#A32D2D' }}>{150-wc(ans1)} more needed</span>}
                {writingPart===1 && wc(ans1)>=150 && <span style={{ color:'#0F6E56' }}>Minimum reached</span>}
                {writingPart===2 && wc(ans2)<250 && <span style={{ color:'#A32D2D' }}>{250-wc(ans2)} more needed</span>}
                {writingPart===2 && wc(ans2)>=250 && <span style={{ color:'#0F6E56' }}>Minimum reached</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== DONE ===== */}
      {screen === 'done' && (
        <div style={{ maxWidth: 400, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
          <div className="card" style={{ marginTop: 0 }}>
            <div style={{ fontSize: 40, color: '#0F6E56', marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>All done!</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 8, lineHeight: 1.6 }}>Your writing has been saved. Your teacher will review it shortly.</div>
            <button className="btn btn-blue" style={{ marginTop: '1rem' }} onClick={() => { loadMySubs(currentUser.username); go('home') }}>Back to home</button>
          </div>
        </div>
      )}

      {/* ===== ADMIN ===== */}
      {screen === 'admin' && (
        <div style={{ maxWidth: 1100, margin: '1.5rem auto', padding: '0 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div><div className="logo">IELTS</div><div style={{ fontSize: 13, color: '#888' }}>Admin panel</div></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#888' }}>Students: {students.length}</span>
              <button className="btn btn-sm" onClick={loadAdmin}>Refresh</button>
              <button className="btn btn-sm" onClick={logout}>Sign out</button>
            </div>
          </div>

          {/* ── Admin tabs ── */}
          <div style={{ display: 'flex', gap: 4, background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 4, marginBottom: 12, overflowX: 'auto' }}>
            {[
              { id: 'writing',     label: 'Writing'     },
              { id: 'listening',   label: 'Listening'   },
              { id: 'reading',     label: 'Reading'     },
              { id: 'set2',        label: '★ Set 2'     },
              { id: 'set3',        label: '★ Set 3'     },
              { id: 'submissions', label: 'Submissions' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setAdminTab(t.id)}
                style={{
                  flex: 1, padding: '8px', border: 'none', borderRadius: 7,
                  background: adminTab === t.id ? (t.id === 'set2' ? '#0F6E56' : '#185FA5') : 'transparent',
                  color: adminTab === t.id ? '#fff' : '#888',
                  fontWeight: adminTab === t.id ? 500 : 400,
                  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >{t.label}</button>
            ))}
          </div>

          {saveMsg && <div style={{ background: '#E1F5EE', color: '#0F6E56', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{saveMsg}</div>}

          {/* WRITING TAB */}
          {adminTab === 'writing' && (
            <div className="card" style={{ marginTop: 0 }}>
              <div style={{ fontWeight: 500, marginBottom: 12 }}>Writing tasks</div>
              <label className="lbl" style={{ marginTop: 0 }}>Set name / date</label>
              <input value={adminSetName} onChange={e => setAdminSetName(e.target.value)} placeholder="e.g. Set 1 · 06.04.2026" />
              <div className="sbox" style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Task 1</div>
                <label className="lbl" style={{ marginTop: 0 }}>Chart / graph image</label>
                <div className="upload-box" onClick={() => document.getElementById('img-input').click()}>
                  {imgPreview ? <img src={imgPreview} alt="preview" style={{ maxWidth: '100%', borderRadius: 6 }} /> : <div>Click to upload image (JPG, PNG)</div>}
                </div>
                <input id="img-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImgUpload} />
                <label className="lbl">Written instructions</label>
                <textarea value={adminTask1Text} onChange={e => setAdminTask1Text(e.target.value)} style={{ minHeight: 80, fontSize: 13 }} placeholder="The chart below shows..." />
              </div>
              <div className="sbox">
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Task 2</div>
                <textarea value={adminTask2} onChange={e => setAdminTask2(e.target.value)} style={{ minHeight: 100, fontSize: 13 }} placeholder="Some people believe that..." />
              </div>
              <button className="btn btn-blue" onClick={saveWritingTasks} style={{ marginTop: 8 }}>Save writing tasks</button>
            </div>
          )}

          {/* LISTENING TAB */}
          {adminTab === 'listening' && (
            <div className="card" style={{ marginTop: 0 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Listening — upload HTML file</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                Each week: update the 4 audio URLs in your HTML file, then upload it here. Students will see your exact HTML layout.
              </div>

              <div className="sbox">
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Step 1 — Upload MP3 audio files</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[{label:'Section 1', url:lA1},{label:'Section 2', url:lA2},{label:'Section 3', url:lA3},{label:'Section 4', url:lA4}].map((a, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{a.label}</div>
                      {a.url && a.url !== AUDIO_URLS[i] && <div style={{ fontSize: 11, color: '#0F6E56', marginBottom: 4 }}>✓ Custom audio uploaded</div>}
                      <label style={{ display: 'inline-block', padding: '6px 12px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                        {audioUploading[i] ? 'Uploading...' : 'Upload MP3'}
                        <input type="file" accept=".mp3,audio/*" style={{ display: 'none' }} onChange={e => uploadAudioFile(e.target.files[0], i)} disabled={audioUploading[i]} />
                      </label>
                      {a.url && <div style={{ fontSize: 10, color: '#888', marginTop: 4, wordBreak: 'break-all' }}>{a.url}</div>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="sbox">
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Step 2 — Upload Listening HTML file</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Open your HTML in Notepad, replace the 4 audio URLs with the ones above, then upload here.</div>
                {listeningHtmlUrl && <div style={{ fontSize: 12, color: '#0F6E56', marginBottom: 8 }}>✓ Listening HTML is uploaded and ready</div>}
                <label style={{ display: 'inline-block', padding: '10px 20px', background: '#185FA5', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  {htmlUploading ? 'Uploading...' : listeningHtmlUrl ? 'Replace Listening HTML' : 'Upload Listening HTML'}
                  <input type="file" accept=".html" style={{ display: 'none' }} onChange={e => uploadHtmlFile(e.target.files[0], 'listening')} disabled={htmlUploading} />
                </label>
                {htmlMsg && <div style={{ marginTop: 8, fontSize: 13, color: '#0F6E56' }}>{htmlMsg}</div>}
              </div>
            </div>
          )}

          {/* READING TAB */}
          {adminTab === 'reading' && (
            <div className="card" style={{ marginTop: 0 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Reading — upload HTML file</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                Upload your Reading HTML file each week. Students will see your exact HTML layout.
              </div>

              <div className="sbox">
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Upload Reading HTML file</div>
                {readingHtmlUrl && <div style={{ fontSize: 12, color: '#0F6E56', marginBottom: 8 }}>✓ Reading HTML is uploaded and ready</div>}
                <label style={{ display: 'inline-block', padding: '10px 20px', background: '#185FA5', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  {htmlUploading ? 'Uploading...' : readingHtmlUrl ? 'Replace Reading HTML' : 'Upload Reading HTML'}
                  <input type="file" accept=".html" style={{ display: 'none' }} onChange={e => uploadHtmlFile(e.target.files[0], 'reading')} disabled={htmlUploading} />
                </label>
                {htmlMsg && <div style={{ marginTop: 8, fontSize: 13, color: '#0F6E56' }}>{htmlMsg}</div>}
              </div>
            </div>
          )}

          {/* SET 2 TAB */}
          {adminTab === 'set2' && <Set2AdminPanel />}

          {/* SET 3 TAB */}
          {adminTab === 'set3' && <Set3AdminPanel />}

          {/* SUBMISSIONS TAB */}
          {adminTab === 'submissions' && <SubmissionsPanel writingSubs={writingSubs} listeningSubs={listeningSubs} readingSubs={readingSubs} wc={wc} downloadPDF={downloadPDF} supabase={supabase} />}
        </div>
      )}

      {/* Modals */}
      {showConfirm && (
        <div className="modal-bg">
          <div className="card" style={{ maxWidth: 320, textAlign: 'center', margin: '1rem' }}>
            <div style={{ fontWeight:500, fontSize:16, marginBottom:8 }}>Submit writing?</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:'1rem', lineHeight:1.6 }}>Make sure you have answered both tasks.</div>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <button className="btn btn-sm" onClick={() => setShowConfirm(false)}>Go back</button>
              <button className="btn btn-blue btn-sm" onClick={handleWritingSubmit}>Yes, submit</button>
            </div>
          </div>
        </div>
      )}
      {showListenSubmit && (
        <div className="modal-bg">
          <div className="card" style={{ maxWidth: 340, textAlign: 'center', margin: '1rem' }}>
            <div style={{ fontWeight:500, fontSize:16, marginBottom:8 }}>Submit Listening?</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:'1rem', lineHeight:1.6 }}>You will move to <strong>Reading</strong>. You cannot come back.</div>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <button className="btn btn-sm" onClick={() => setShowListenSubmit(false)}>Go back</button>
              <button className="btn btn-blue btn-sm" onClick={submitListening}>Submit & Start Reading</button>
            </div>
          </div>
        </div>
      )}
      {showReadSubmit && (
        <div className="modal-bg">
          <div className="card" style={{ maxWidth: 340, textAlign: 'center', margin: '1rem' }}>
            <div style={{ fontWeight:500, fontSize:16, marginBottom:8 }}>Submit Reading?</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:'1rem', lineHeight:1.6 }}>You will move to <strong>Writing</strong>. You cannot come back.</div>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <button className="btn btn-sm" onClick={() => setShowReadSubmit(false)}>Go back</button>
              <button className="btn btn-blue btn-sm" onClick={submitReading}>Submit & Start Writing</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
