import express from "express";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import serverless from "serverless-http";

const app = express();
app.use(express.json());

const OPENAI_KEY = process.env.OPENAI_KEY;
const TOKEN_LIMIT = parseInt(process.env.TOKEN_LIMIT || "10000");
const TTL_HOURS = parseInt(process.env.TTL_HOURS || "24");

const keys = new Map();

// Crear clave temporal
app.get("/create-key", (req, res) => {
  const { name } = req.query;
  const key = uuidv4();
  const expiresAt = Date.now() + TTL_HOURS * 60 * 60 * 1000;
  keys.set(key, { name: name || "anon", used: 0, expiresAt });
  res.json({ key, expiresInHours: TTL_HOURS, tokensLeft: TOKEN_LIMIT });
});

// Endpoint proxy para reenviar a OpenAI
app.post("/chat", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "").trim();
  const entry = keys.get(token);

  if (!entry) return res.status(401).json({ error: "Clave inválida o expirada" });
  if (Date.now() > entry.expiresAt) return res.status(403).json({ error: "Clave expirada" });
  if (entry.used >= TOKEN_LIMIT) return res.status(403).json({ error: "Límite de tokens alcanzado" });

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      req.body,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const tokensUsed = response.data.usage?.total_tokens || 0;
    entry.used += tokensUsed;
    res.json({ ...response.data, remaining: Math.max(0, TOKEN_LIMIT - entry.used) });
  } catch (error) {
    const message = error?.response?.data || error.message || "Proxy error";
    res.status(500).json({ error: message });
  }
});

export const handler = serverless(app);
export default app;
