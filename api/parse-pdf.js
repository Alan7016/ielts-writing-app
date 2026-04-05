import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'

pdfjsLib.GlobalWorkerOptions.workerSrc = false

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { base64, type } = req.body
    if (!base64) return res.status(400).json({ error: 'No PDF data provided' })

    const binary = Buffer.from(base64, 'base64')
    const uint8 = new Uint8Array(binary)

    const pdf = await pdfjsLib.getDocument({ data: uint8, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise
    
    let fullText = ''
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items.map(item => item.str).join(' ')
      fullText += pageText + '\n'
    }

    if (type === 'listening') {
      const result = parseListeningPDF(fullText)
      return res.status(200).json(result)
    } else if (type === 'reading') {
      const result = parseReadingPDF(fullText)
      return res.status(200).json(result)
    }

    return res.status(200).json({ text: fullText })
  } catch (err) {
    console.error('PDF parse error:', err)
    return res.status(500).json({ error: 'Failed to parse PDF: ' + err.message })
  }
}

function parseListeningPDF(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const sections = { s1: [], s2: [], s3: [], s4: [], answerKey: {} }
  
  let currentSection = null
  let inAnswerKey = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Detect answer key section
    if (line.match(/key\s*listening|answer\s*key|answers/i)) {
      inAnswerKey = true; continue
    }
    
    // Detect sections
    if (line.match(/section\s*1/i)) { currentSection = 's1'; inAnswerKey = false; continue }
    if (line.match(/section\s*2/i)) { currentSection = 's2'; inAnswerKey = false; continue }
    if (line.match(/section\s*3/i)) { currentSection = 's3'; inAnswerKey = false; continue }
    if (line.match(/section\s*4/i)) { currentSection = 's4'; inAnswerKey = false; continue }

    if (inAnswerKey) {
      // Parse answer key lines like "1 theatre" or "1. theatre"
      const m = line.match(/^(\d+)[.\s]+(.+)/)
      if (m) sections.answerKey[m[1]] = m[2].trim()
      continue
    }

    if (currentSection) {
      sections[currentSection].push(line)
    }
  }

  return {
    section1: sections.s1.join('\n'),
    section2: sections.s2.join('\n'),
    section3: sections.s3.join('\n'),
    section4: sections.s4.join('\n'),
    answerKey: sections.answerKey,
    rawText: text
  }
}

function parseReadingPDF(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  
  const passages = [
    { title: '', text: '', questions: '' },
    { title: '', text: '', questions: '' },
    { title: '', text: '', questions: '' },
  ]
  const answerKey = {}
  
  let currentPassage = -1
  let phase = 'passage' // 'passage' or 'questions'
  let inAnswerKey = false
  let buffer = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.match(/key\s*reading|answer\s*key/i)) {
      // Save buffer
      if (currentPassage >= 0 && buffer.length) {
        if (phase === 'passage') passages[currentPassage].text = buffer.join('\n')
        else passages[currentPassage].questions = buffer.join('\n')
      }
      buffer = []; inAnswerKey = true; continue
    }

    if (inAnswerKey) {
      const m = line.match(/^(\d+)[.\s]+(.+)/)
      if (m) answerKey[m[1]] = m[2].trim()
      continue
    }

    if (line.match(/reading passage\s*1|passage\s*1/i)) {
      if (currentPassage >= 0 && buffer.length) {
        if (phase === 'passage') passages[currentPassage].text = buffer.join('\n')
        else passages[currentPassage].questions = buffer.join('\n')
      }
      buffer = []; currentPassage = 0; phase = 'passage'
      passages[0].title = lines[i+1] || 'Passage 1'
      continue
    }
    if (line.match(/reading passage\s*2|passage\s*2/i)) {
      if (currentPassage >= 0 && buffer.length) {
        if (phase === 'passage') passages[currentPassage].text = buffer.join('\n')
        else passages[currentPassage].questions = buffer.join('\n')
      }
      buffer = []; currentPassage = 1; phase = 'passage'
      passages[1].title = lines[i+1] || 'Passage 2'
      continue
    }
    if (line.match(/reading passage\s*3|passage\s*3/i)) {
      if (currentPassage >= 0 && buffer.length) {
        if (phase === 'passage') passages[currentPassage].text = buffer.join('\n')
        else passages[currentPassage].questions = buffer.join('\n')
      }
      buffer = []; currentPassage = 2; phase = 'passage'
      passages[2].title = lines[i+1] || 'Passage 3'
      continue
    }

    // Detect questions section
    if (currentPassage >= 0 && phase === 'passage' && line.match(/^questions?\s+\d+/i)) {
      passages[currentPassage].text = buffer.join('\n')
      buffer = []; phase = 'questions'
    }

    if (currentPassage >= 0) buffer.push(line)
  }

  // Save last buffer
  if (currentPassage >= 0 && buffer.length) {
    if (phase === 'passage') passages[currentPassage].text = buffer.join('\n')
    else passages[currentPassage].questions = buffer.join('\n')
  }

  return { passages, answerKey, rawText: text }
}
