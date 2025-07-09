/*****************************************************************
 * Stream_answer – Botpress Execute‑code card
 * Sends the user’s question (and first attached file, if any)
 * to your Cloudflare Worker, then streams tokens back to chat.
 *****************************************************************/

console.log('Stream_answer entered – q =', workflow.question)

const workerUrl = env.WORKER_URL           // set in Bot Settings → Configuration Variables
console.log('WORKER_URL =', workerUrl)

try {
  /* -------- 1. Build multipart/form‑data -------- */
  const fd = new FormData()
  fd.append('question', workflow.question || '')

  // Botpress stores uploads in event.attachments[]
  if (event.attachments?.length) {
    const a     = event.attachments[0]                               // take first file only
    const resp  = await bp.axios.get(a.url, { responseType: 'blob' })
    fd.append('file', new File([resp.data], a.name || 'upload'))
    console.log('Attached:', a.name)
  }

  /* -------- 2. Call Cloudflare Worker -------- */
  const res = await fetch(workerUrl, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`Worker HTTP ${res.status}`)

  /* -------- 3. Stream Server‑Sent‑Events back to user -------- */
  const reader = res.body.getReader()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += new TextDecoder().decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()                                   // keep incomplete line

    for (const ln of lines) {
      if (ln.startsWith('data: ')) {
        const delta = ln.slice(6)
        bp.events.replyToEvent(event, [{ type: 'text', text: delta }])
        workflow.answer = (workflow.answer || '') + delta   // optional: store full answer
      }
    }
  }
} catch (err) {
  console.error('Stream_answer error:', err)
  bp.events.replyToEvent(event, [
    { type: 'text', text: '⚠️ ' + err.message }
  ])
}