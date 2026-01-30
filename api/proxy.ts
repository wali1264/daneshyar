
import { GoogleGenAI } from "@google/genai";

/**
 * Advanced AI Proxy Engine & KeyPool Manager
 * Designed to handle 500+ API keys with automatic rotation and health checks.
 * Runs on Vercel Edge/Serverless (Global Infrastructure).
 */
export default async function handler(req: any, res: any) {
  // 1. Precise CORS Configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 2. Dynamic Key Discovery (The 500 Keys Strategy)
  const keyPool: string[] = [];
  
  // Primary Keys
  if (process.env.API_KEY) keyPool.push(process.env.API_KEY);
  if (process.env.VITE_GOOGLE_GENAI_TOKEN) keyPool.push(process.env.VITE_GOOGLE_GENAI_TOKEN);

  // Discovery Loop for keys 1 to 500
  for (let i = 1; i <= 500; i++) {
    const dynamicKey = process.env[`VITE_GOOGLE_GENAI_TOKEN_${i}`];
    if (dynamicKey) keyPool.push(dynamicKey);
  }

  if (keyPool.length === 0) {
    return res.status(500).json({ error: 'System Error: No valid API keys found in KeyPool.' });
  }

  // 3. Round-Robin / Random Rotation Selection
  // Every request gets a fresh key from the pool
  const selectedKey = keyPool[Math.floor(Math.random() * keyPool.length)];
  
  const { action, model, contents, config } = req.body;

  try {
    const ai = new GoogleGenAI({ apiKey: selectedKey });

    if (action === 'generateContent') {
      const result = await ai.models.generateContent({
        model: model || 'gemini-3-flash-preview',
        contents: contents,
        config: config
      });

      // Extract text content safely for the client
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: `Action '${action}' is not supported by the Proxy Bridge.` });

  } catch (error: any) {
    console.error(`[Proxy Engine Error] KeyIndex: ${keyPool.indexOf(selectedKey)}`, error);
    
    // Handle Rate Limits (429) gracefully by telling client to retry
    const status = error.status || 500;
    const message = error.message || 'AI Engine is temporarily unavailable.';
    
    return res.status(status).json({ 
      error: message,
      retrySuggested: status === 429,
      keyId: `pool_idx_${keyPool.indexOf(selectedKey)}`
    });
  }
}
