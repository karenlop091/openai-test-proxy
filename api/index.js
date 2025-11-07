import express from "express";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(express.json());

const MASTER_KEY = process.env.OPENAI_KEY;
const TOKEN_LIMIT = Number(process.env.TOKEN_LIMIT || 10000);
const TTL_HOURS = Number(process.env.TTL_HOURS || 24);

const candidates = new Map();

// crear una clave temporal desde la URL /create-key?name=...
app.get("/create-key", (req, res) => {
  const name = req.query.name || "anon";
  const key = uuidv4();
  candidates.set(key, {
    name,
    created: Date.now(),
    tokensLeft: TOKEN_LIMIT,
  });
  res.json({ key, expiresInHours: TTL_HOURS, tokensLeft: TOKEN_LIMIT });
});

// proxy real hacia OpenAI
app.post("/proxy", async (req, res) => {
  const key = req.headers["x-test-key"];
  const user = candidates.get(key);

  if (!user) return res.status(401).json({ error: "Invalid key" });
  const age = (Date.now() - user.created) / (1000 * 60 * 60);
  if (age > TTL_HOURS) return res.status(403).json({ error: "Key expired" });
  if (user.tokensLeft <= 0) return res.status(403).json({ error: "Quota exceeded" });

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MASTER_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    const data = await r.json();
    const used = data?.usage?.total_tokens ?? 0;
    user.tokensLeft -= used;

    res.status(r.status).json({ ...data, remaining: user.tokensLeft });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Proxy error" });
  }
});

export default app;
