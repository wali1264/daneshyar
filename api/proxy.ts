
import { GoogleGenAI } from "@google/genai";

/**
 * Advanced AI Proxy Engine & KeyPool Manager
 * Updated to strictly follow the user's naming convention for 500 keys.
 * Strategy:
 * 1. Base Key: VITE_GOOGLE_GENAI_TOKEN
 * 2. Sequential Keys: VITE_GOOGLE_GENAI_TOKEN_1 to VITE_GOOGLE_GENAI_TOKEN_500
 */
export default async function handler(req: any, res: any) {
  // 1. Precise CORS Configuration for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 2. Dynamic Key Discovery (The 500 Keys Strategy - Strict Naming)
  const keyPool: string[] = [];
  
  // First/Main Key (No number)
  if (process.env.VITE_GOOGLE_GENAI_TOKEN) {
    keyPool.push(process.env.VITE_GOOGLE_GENAI_TOKEN);
  }

  // Sequential Keys (1 to 500)
  for (let i = 1; i <= 500; i++) {
    const dynamicKey = process.env[`VITE_GOOGLE_GENAI_TOKEN_${i}`];
    if (dynamicKey) {
      keyPool.push(dynamicKey);
    }
  }

  // Safety check: ensure at least one key is available
  if (keyPool.length === 0) {
    console.error('[System Error] KeyPool is empty. Please check Vercel Environment Variables.');
    return res.status(500).json({ 
      error: 'System Error: No valid API keys found. Expected VITE_GOOGLE_GENAI_TOKEN or VITE_GOOGLE_GENAI_TOKEN_1-500.' 
    });
  }

  // 3. Selection Strategy: Random Rotation
  // Distributes load evenly across all 500+ potential keys
  const selectedIndex = Math.floor(Math.random() * keyPool.length);
  const selectedKey = keyPool[selectedIndex];
  
  const { action, model, contents, config } = req.body;

  try {
    // We create a fresh instance per request to ensure the latest key from the pool is used
    const ai = new GoogleGenAI({ apiKey: selectedKey });

    if (action === 'generateContent') {
      const result = await ai.models.generateContent({
        model: model || 'gemini-3-flash-preview',
        contents: contents,
        config: config
      });

      // Return the full result to the client
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: `Action '${action}' is not supported by the Secure Proxy Bridge.` });

  } catch (error: any) {
    console.error(`[AI Proxy Failure] KeyIndex: ${selectedIndex} | Error:`, error.message);
    
    const status = error.status || 500;
    const message = error.message || 'The AI Engine encountered an unexpected error.';
    
    return res.status(status).json({ 
      error: message,
      retrySuggested: status === 429,
      info: `Error occurred using key pool member ${selectedIndex}`
    });
  }
}
