// api/chat.js — Vercel Pro, streaming with abort controller

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch(e) {
    return res.status(400).json({ error: "Invalid JSON: " + e.message });
  }

  // Hard cap at 3500 tokens
  body.max_tokens = Math.min(body.max_tokens || 3500, 3500);

  // Abort if Anthropic takes longer than 50s (leaves 10s buffer for Vercel)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({ ...body, stream: true }),
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.status(200);

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "content_block_delta" && evt.delta?.text) {
            fullText += evt.delta.text;
          }
        } catch {}
      }
    }

    clearTimeout(timer);
    res.write(`data: ${JSON.stringify({ fullText })}\n\n`);
    res.end();

  } catch(error) {
    clearTimeout(timer);
    const msg = error.name === "AbortError"
      ? "Analysis took too long — please try again"
      : "Proxy error: " + error.message;
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    } else {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    }
  }
};
