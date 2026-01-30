
import { GoogleGenAI } from "@google/genai";

/**
 * Server-side Proxy for Google Gemini API
 * This function runs on Vercel's edge/serverless infrastructure (outside Iran).
 * It handles the API Key rotation and bypasses regional restrictions.
 */
export default async function handler(req: any, res: any) {
  // 1. Enable CORS
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

  // 2. Key Management (Server-side)
  // We prioritize the API_KEY from environment variables
  const apiKey = process.env.API_KEY || process.env.VITE_GOOGLE_GENAI_TOKEN;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: API Key missing.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    let result;
    switch (action) {
      case 'generateContent':
        result = await ai.models.generateContent({ model, contents, config });
        break;
      default:
        return res.status(400).json({ error: `Unsupported action: ${action}` });
    }

    // 3. Return the response to the client
    return res.status(200).json(result);

  } catch (error: any) {
    console.error('[Proxy Error]:', error);
    const status = error.status || 500;
    const message = error.message || 'An error occurred during API call';
    return res.status(status).json({ error: message });
  }
}
