
import { Type, Modality } from "@google/genai";

/**
 * Standard Proxy Bridge
 * Routes all AI requests through our secure Vercel-based server function.
 */
async function callProxy(payload: any) {
  try {
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Server bridge failed to respond.');
    }
    return data;
  } catch (error: any) {
    console.error('[Bridge Failure]:', error.message);
    throw error;
  }
}

export function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const generateLessonSpeech = async (text: string) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
    },
  });
  return result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

export const getAITeacherResponse = async (prompt: string, context: string, userName: string) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Context: ${context}\n\nUser: ${prompt}` }] }],
    config: {
      systemInstruction: `You are the AI mentor for "${userName}". Respond in Persian, concise and academic. Use <hl>...</hl> for code snippets.`,
    },
  });
  return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

export const generateLessonSuggestion = async (discipline: string, topic: string, previousLessons: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Topic: ${topic}. Discipline: ${discipline}.` }] }],
    config: {
      systemInstruction: "Curriculum designer mode. Output JSON only.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
        required: ["title", "content", "explanation"]
      }
    }
  });
  // The response from the proxy for generateContent returns GenerateContentResponse structure
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(text);
};

export const getTeacherAiAdvice = async (teacherPrompt: string, currentLesson: any, related: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Advice on: ${teacherPrompt}` }] }],
    config: {
      systemInstruction: "Senior Academic Peer AI. Persian language.",
    }
  });
  return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

export const getAdminAuditReport = async (lesson: any, related: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Audit: ${JSON.stringify(lesson)}` }] }],
    config: {
      systemInstruction: "Academic Auditor AI. Persian language.",
    }
  });
  return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

/**
 * Live API Note:
 * WSS (WebSockets) requires a direct client connection. 
 * For users without VPN, we recommend using the REST-based Mentorship (Chat) 
 * provided by the Proxy Bridge above.
 */
export const connectLiveTeacher = async (callbacks: any, userName: string, context: string) => {
  const { GoogleGenAI } = await import("@google/genai");
  // We provide a dummy key here because the real connection happens on client
  // In a production app, WSS would need a dedicated WebSocket Proxy server.
  const ai = new GoogleGenAI({ apiKey: 'PROXY_MANAGED' }); 
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: `Live Mentor Mode for ${userName}. Context: ${context}`,
    }
  });
};
