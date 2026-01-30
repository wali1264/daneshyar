
import { GoogleGenAI } from "@google/genai";

/**
 * Smart Server-Side Proxy Handler
 * This function acts as a bridge between the Iranian user and Google servers.
 * It manages a pool of up to 501 API keys.
 */
export default async function handler(req: any, res: any) {
  // 1. Setup CORS for secure browser communication
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, model, contents, config } = req.body;

  // 2. Build the Key Pool (VITE_GOOGLE_GENAI_TOKEN + 1...500)
  const keyPool: string[] = [];
  
  // First key (no number)
  if (process.env.VITE_GOOGLE_GENAI_TOKEN) {
    keyPool.push(process.env.VITE_GOOGLE_GENAI_TOKEN);
  } else if (process.env.API_KEY) {
    keyPool.push(process.env.API_KEY);
  }

  // Keys 1 to 500
  for (let i = 1; i <= 500; i++) {
    const key = process.env[`VITE_GOOGLE_GENAI_TOKEN_${i}`];
    if (key) {
      keyPool.push(key);
    }
  }

  if (keyPool.length === 0) {
    return res.status(500).json({ error: 'No API keys configured on server.' });
  }

  // 3. Execution with Automatic Key Rotation & Retries
  let lastError: any;
  // We try up to 3 different random keys if we hit limits
  const maxRetries = Math.min(3, keyPool.length);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Pick a random key from the pool to distribute load
    const randomIndex = Math.floor(Math.random() * keyPool.length);
    const selectedKey = keyPool[randomIndex];
    
    try {
      const ai = new GoogleGenAI({ apiKey: selectedKey });
      
      let result;
      switch (action) {
        case 'generateContent':
          result = await ai.models.generateContent({ model, contents, config });
          break;
        default:
          return res.status(400).json({ error: `Unsupported action: ${action}` });
      }

      // Success! Return the response
      return res.status(200).json(result);

    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message?.toLowerCase() || '';
      
      // If it's a quota or rate limit error, try another key
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit')) {
        console.warn(`[Proxy] Key ${randomIndex} hit limit, rotating...`);
        continue; 
      }
      
      // For other critical errors, stop and report
      break;
    }
  }

  // If all attempts failed
  console.error('[Proxy Critical Error]:', lastError);
  return res.status(lastError?.status || 500).json({ 
    error: lastError?.message || 'AI processing failed after multiple rotation attempts.' 
  });
}
