
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Use process.env.API_KEY exclusively as mandated by the instructions
  const apiKey = process.env.API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API_KEY in server environment.' });
  
  const { action, model, contents, config } = req.body;

  try {
    const ai = new GoogleGenAI({ apiKey });

    if (action === 'generateContent') {
      const result = await ai.models.generateContent({
        model: model || 'gemini-3-flash-preview',
        contents: contents,
        config: config
      });

      // Explicitly return the text property value in the JSON object
      // This allows the client to access result.text directly
      return res.status(200).json({
        ...result,
        text: result.text
      });
    }

    return res.status(400).json({ error: `Action '${action}' not supported.` });

  } catch (error: any) {
    console.error(`[AI Proxy Error]`, error.message);
    return res.status(error.status || 500).json({ error: error.message });
  }
}
