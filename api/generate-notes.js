// This function runs on Vercel's server, never in the visitor's browser.
// The ANTHROPIC_API_KEY environment variable is read here only.

const SYSTEM_PROMPT = `You are a careful academic note-taker. You'll receive a raw, imperfect speech-to-text transcript of a lecture — expect run-on sentences, missed punctuation, occasional mis-heard words, and filler speech. Your job is to turn it into clean, organized study notes.

Respond in this exact HTML structure (no markdown, no code fences, just the HTML fragment):
<h3>Summary</h3>
<p>[2-3 sentence overview of what the lecture covered]</p>
<h3>Key points</h3>
<ul><li>[point]</li>...</ul>
<h3>Important terms</h3>
<ul><li><strong>[term]</strong> — [brief definition based on how it was used in the lecture]</li>...</ul>
<h3>Follow-up questions</h3>
<ul><li>[a question worth asking the professor or researching further, based on gaps or unclear moments in the transcript]</li>...</ul>

Use plain, clear language. Correct obvious transcription errors silently when the intended meaning is clear from context, but don't invent content that wasn't discussed. If the transcript is very short or fragmentary, note that in the Summary rather than padding with invented content.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { title, transcript } = req.body || {};
  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    res.status(400).json({ error: 'Missing transcript' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY. Add it in your hosting provider\u2019s environment variable settings.' });
    return;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Lecture title: ${title || 'Untitled lecture'}\n\nTranscript:\n${transcript.slice(0, 20000)}` }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: 'Claude API error', detail: errText });
      return;
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: 'No text in Claude response' });
      return;
    }

    const cleaned = textBlock.text.replace(/```html|```/g, '').trim();
    res.status(200).json({ notes: cleaned });
  } catch (err) {
    res.status(500).json({ error: 'Note generation failed', detail: String(err) });
  }
}
