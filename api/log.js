// Receives a question from the frontend and appends it to data/questions.json
// in your GitHub repo, using a token that stays hidden in Vercel's env vars.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question } = req.body || {};
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Missing question' });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // format: "username/reponame"
  if (!token || !repo) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const filePath = 'data/questions.json';
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;

  try {
    // 1. Get current file + sha
    const getRes = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json'
      }
    });
    if (!getRes.ok) {
      const err = await getRes.text();
      return res.status(502).json({ error: 'Could not read questions file', detail: err });
    }
    const fileData = await getRes.json();
    const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
    let questions = [];
    try { questions = JSON.parse(currentContent); } catch { questions = []; }

    // 2. Skip if an unanswered duplicate already exists
    const norm = question.trim().toLowerCase();
    const alreadyLogged = questions.some(q => q.question.trim().toLowerCase() === norm);
    if (alreadyLogged) {
      return res.status(200).json({ status: 'already_logged' });
    }

    // 3. Append new entry
    questions.push({
      id: Date.now(),
      question: question.trim(),
      answer: null,
      timestamp: Date.now()
    });

    // 4. Write back
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Log new question: "${question.trim().slice(0, 60)}"`,
        content: Buffer.from(JSON.stringify(questions, null, 2)).toString('base64'),
        sha: fileData.sha
      })
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      return res.status(502).json({ error: 'Could not save question', detail: err });
    }

    return res.status(200).json({ status: 'logged' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to log question' });
  }
}

