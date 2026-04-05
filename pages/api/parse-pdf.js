export const maxDuration = 60
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { base64, type } = req.body
    if (!base64) return res.status(400).json({ error: 'No PDF data provided' })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

    const prompt = type === 'listening'
      ? `This is an IELTS Listening test PDF. Extract ALL questions organized by section.

Return ONLY a JSON object in this exact format:
{
  "section1": "1. question text here ___\n2. another ___ question\n...",
  "section2": "11. MCQ question here\nA. option one\nB. option two\nC. option three\n12. ...",
  "section3": "21. question\nA. option\nB. option\nC. option\n...",
  "section4": "31. ___ word\n32. ___ word\n...",
  "answerKey": {
    "1": "answer",
    "2": "answer",
    "11": "C",
    "12": "B"
  }
}

Rules:
- For gap fill questions: include the full sentence with ___ where the blank is
- For MCQ: include the question then options on new lines as A. B. C.
- For matching: include the statement with ___ at the end
- Answer key must have all 40 answers
- Return ONLY the JSON, no other text`

      : `This is an IELTS Reading test PDF. Extract ALL passages and questions.

Return ONLY a JSON object in this exact format:
{
  "passages": [
    {
      "title": "Title of passage 1",
      "text": "Full passage text here...",
      "questions": "1. gap fill ___ sentence\n2. another question ___\n8. Statement for true false not given\n9. Another statement\n14. MCQ question\nA. option\nB. option\nC. option\n..."
    },
    {
      "title": "Title of passage 2", 
      "text": "Full passage text...",
      "questions": "14. question...\n..."
    },
    {
      "title": "Title of passage 3",
      "text": "Full passage text...", 
      "questions": "27. question...\n..."
    }
  ],
  "answerKey": {
    "1": "answer",
    "8": "TRUE",
    "9": "FALSE",
    "14": "D"
  }
}

Rules:
- Extract the FULL passage text including all paragraphs
- For gap fill: include full sentence with ___ for the blank
- For True/False/Not Given: just the statement, no options needed
- For Yes/No/Not Given: just the statement
- For MCQ: question then A. B. C. D. options on new lines
- For paragraph matching: just the statement
- For matching people/headings: include the statement
- Answer key must have all 40 answers
- Return ONLY the JSON, no other text`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(500).json({ error: 'Claude API error: ' + err })
    }

    const data = await response.json()
    const text = data.content[0].text.trim()

    // Parse the JSON response
    let parsed
    try {
      // Remove any markdown code blocks if present
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(clean)
    } catch (e) {
      return res.status(500).json({ error: 'Could not parse Claude response', raw: text })
    }

    return res.status(200).json(parsed)

  } catch (err) {
    console.error('PDF parse error:', err)
    return res.status(500).json({ error: 'Server error: ' + err.message })
  }
}
