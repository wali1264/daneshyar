
import { GoogleGenAI } from "@google/genai";

/**
 * Bulletproof AI Proxy Engine v2.0
 * Handles Quota Management for 500 Keys + Live API Key Bridge
 */

const blacklistedKeys = new Map<string, number>();
const BLACKLIST_DURATION_MS = 1000 * 60 * 5; // 5 Minutes

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { action, model, contents, config } = req.body;

  // 1. Collect all 500+ Keys
  const keyPool: { name: string; value: string }[] = [];
  if (process.env.VITE_GOOGLE_GENAI_TOKEN) {
    keyPool.push({ name: 'VITE_GOOGLE_GENAI_TOKEN', value: process.env.VITE_GOOGLE_GENAI_TOKEN });
  }
  for (let i = 1; i <= 500; i++) {
    const keyVal = process.env[`VITE_GOOGLE_GENAI_TOKEN_${i}`];
    if (keyVal) keyPool.push({ name: `VITE_GOOGLE_GENAI_TOKEN_${i}`, value: keyVal });
  }

  if (keyPool.length === 0) return res.status(500).json({ error: 'No API keys found in Environment Variables.' });

  // 2. Action: getLiveKey (For WebSocket sessions)
  if (action === 'getLiveKey') {
    const now = Date.now();
    const healthyKeys = keyPool.filter(k => !(blacklistedKeys.get(k.name) && now < blacklistedKeys.get(k.name)!));
    const pool = healthyKeys.length > 0 ? healthyKeys : keyPool;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    return res.status(200).json({ apiKey: selected.value, keyName: selected.name });
  }

  // 3. Action: generateContent (Standard REST with Auto-Retry)
  const maxRetries = Math.min(keyPool.length, 12); 
  let attempts = 0;
  let lastError: any = null;

  while (attempts < maxRetries) {
    attempts++;
    const now = Date.now();
    const healthyKeys = keyPool.filter(k => {
      const blockedUntil = blacklistedKeys.get(k.name);
      if (blockedUntil && now < blockedUntil) return false;
      if (blockedUntil && now >= blockedUntil) blacklistedKeys.delete(k.name);
      return true;
    });

    const currentPool = healthyKeys.length > 0 ? healthyKeys : keyPool;
    const selectedKey = currentPool[Math.floor(Math.random() * currentPool.length)];

    try {
      const ai = new GoogleGenAI({ apiKey: selectedKey.value });
      const result = await ai.models.generateContent({
        model: model || 'gemini-3-flash-preview',
        contents,
        config
      });

      // Send metadata back so client knows which key worked
      return res.status(200).json({
        ...result,
        _proxyMetadata: {
          keyName: selectedKey.name,
          attempts: attempts,
          poolSize: healthyKeys.length
        }
      });

    } catch (error: any) {
      lastError = error;
      if (error.status === 429) {
        console.warn(`[429] Blacklisting ${selectedKey.name} due to quota limits.`);
        blacklistedKeys.set(selectedKey.name, Date.now() + BLACKLIST_DURATION_MS);
        continue; // Retry
      }
      break; // Permanent error
    }
  }

  return res.status(lastError?.status || 500).json({ 
    error: lastError?.message || 'Exhausted retry pool.',
    attempts
  });
}
