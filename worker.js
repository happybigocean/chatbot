/* litmag‑proxy — answers with or without an uploaded file */
export default {
  async fetch(request, env) {
    /* ---------- 0.  Handle CORS pre‑flight ---------- */
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin' : '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age'      : '86400'
        }
      })
    }

    /* ---------- 1.  Reject non‑POST after pre‑flight ---------- */
    if (request.method !== 'POST')
      return new Response('Method Not Allowed', { status: 405 })

    const form      = await request.formData()
    const question  = form.get('question')
    const file      = form.get('file')
    if (!question)
      return new Response('"question" is required', { status: 400 })

    /* ---------- 2.  Optional file upload ---------- */
    const fileIds = []
    if (file && file.size > 0) {
      const up = new FormData()
      up.append('file', file, file.name)
      up.append('purpose', 'assistants')

      const upRes = await fetch('https://api.openai.com/v1/files', {
        method : 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body   : up
      })
      if (!upRes.ok)
        return new Response(`File upload failed (${upRes.status})`, { status: 502 })

      const { id } = await upRes.json()
      fileIds.push(id)

      const vectorBody = {
        vector_store_id: id,
      }
      const vectorRes = await fetch(`https://api.openai.com/v1/vector_stores/${env.VECTOR_STORE_ID}/files`, {
        method : 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body   : JSON.stringify(vectorBody)
      })
      if (!vectorRes.ok)
        return new Response(`File Vector upload failed (${vectorRes.status})`, { status: 502 })

      fileIds.push(id)
    }

    /* ---------- 3.  Ask GPT‑4o mini and stream ---------- */
    const body = {
      model   : 'gpt-4o-mini',
      stream  : true,
      input: [{ role: 'user', content: question }],
      tools   : [
        { type: 'file_search', vector_store_ids: [env.VECTOR_STORE_ID], max_num_results: 40 }
      ]
    }

    const oaRes = await fetch('https://api.openai.com/v1/responses', {
      method : 'POST',
      duplex : 'half',
      headers: {
        Authorization : `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    /* ---------- 4.  Pipe SSE back to Botpress ---------- */
    return new Response(oaRes.body, {
      headers: {
        'Content-Type'               : 'text/event-stream',
        'Cache-Control'              : 'no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}