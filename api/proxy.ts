
import { GoogleGenAI } from "@google/genai";

/**
 * Advanced AI Proxy Engine with Intelligent KeyPool & Blacklist Management
 * 
 * Features:
 * 1. Blacklist System: Temporarily skips keys that hit 429 (Quota Exceeded).
 * 2. Auto-Retry Logic: Automatically tries next available keys without user interruption.
 * 3. Detailed Logging: Tracks specific key failures in the Vercel/Server console.
 * 4. VPN Independent: Operates entirely server-side.
 */

// In-memory blacklist for the lifecycle of the serverless instance
const blacklistedKeys = new Map<string, number>();
const BLACKLIST_DURATION_MS = 1000 * 60 * 5; // 5 minutes blacklist

export default async function handler(req: any, res: any) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 2. Build the Key Pool
  const keyPool: { name: string; value: string }[] = [];
  
  if (process.env.VITE_GOOGLE_GENAI_TOKEN) {
    keyPool.push({ name: 'VITE_GOOGLE_GENAI_TOKEN', value: process.env.VITE_GOOGLE_GENAI_TOKEN });
  }

  for (let i = 1; i <= 500; i++) {
    const keyVal = process.env[`VITE_GOOGLE_GENAI_TOKEN_${i}`];
    if (keyVal) {
      keyPool.push({ name: `VITE_GOOGLE_GENAI_TOKEN_${i}`, value: keyVal });
    }
  }

  if (keyPool.length === 0) {
    return res.status(500).json({ error: 'System Error: No keys found in Environment Variables.' });
  }

  const { action, model, contents, config } = req.body;
  const maxRetries = Math.min(keyPool.length, 10); // Try up to 10 different keys if needed
  let attempts = 0;
  let lastError: any = null;

  // 3. Execution Loop with Auto-Retry
  while (attempts < maxRetries) {
    attempts++;

    // Filter out blacklisted keys
    const now = Date.now();
    const availableKeys = keyPool.filter(k => {
      const blacklistedUntil = blacklistedKeys.get(k.name);
      if (blacklistedUntil && now < blacklistedUntil) return false;
      if (blacklistedUntil && now >= blacklistedUntil) {
        blacklistedKeys.delete(k.name); // Clear expired blacklist
        console.log(`[RECOVERY] Key ${k.name} has been restored to the active pool.`);
      }
      return true;
    });

    // If all keys are blacklisted, reset the list to avoid total outage
    let currentPool = availableKeys.length > 0 ? availableKeys : keyPool;
    if (availableKeys.length === 0) {
      console.warn(`[WARNING] All keys were blacklisted. Resetting pool to prevent total failure.`);
      blacklistedKeys.clear();
    }

    const selectedKeyObj = currentPool[Math.floor(Math.random() * currentPool.length)];
    
    try {
      const ai = new GoogleGenAI({ apiKey: selectedKeyObj.value });

      if (action === 'generateContent') {
        const result = await ai.models.generateContent({
          model: model || 'gemini-3-flash-preview',
          contents: contents,
          config: config
        });

        // SUCCESS
        if (attempts > 1) {
          console.log(`[SUCCESS] Request completed on attempt #${attempts} using key: ${selectedKeyObj.name}`);
        }
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: `Action '${action}' not supported.` });

    } catch (error: any) {
      lastError = error;
      const statusCode = error.status || 500;

      // Handle Quota Exhaustion (429)
      if (statusCode === 429) {
        console.error(`[QUOTA EXCEEDED] Key ${selectedKeyObj.name} (Pool Index: ${keyPool.indexOf(selectedKeyObj)}) reached daily limit. Blacklisting for 5 mins...`);
        blacklistedKeys.set(selectedKeyObj.name, Date.now() + BLACKLIST_DURATION_MS);
        
        // Continue loop to try next key
        continue;
      }

      // Handle other permanent errors
      console.error(`[API ERROR] Key ${selectedKeyObj.name} failed with status ${statusCode}:`, error.message);
      break; 
    }
  }

  // If we reach here, it means all attempts failed or a permanent error occurred
  return res.status(lastError?.status || 500).json({ 
    error: lastError?.message || 'Exhausted all retry attempts or encountered a fatal error.',
    attempts: attempts,
    retrySuggested: false
  });
}
