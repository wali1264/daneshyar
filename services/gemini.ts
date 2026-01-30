
import { Type, Modality } from "@google/genai";

/**
 * Standard Proxy Caller
 * Routes all AI requests through the Vercel Serverless Proxy.
 * This ensures 100% bypass of regional blocks and hides API keys.
 */
async function callProxy(payload: any) {
  try {
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'ارتباط با سرور هوش مصنوعی برقرار نشد.');
    }

    return data;
  } catch (error: any) {
    console.error('[GeminiService] Connection Failed:', error.message);
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

/**
 * Professional AI Teacher Methods
 */

export const generateLessonSpeech = async (text: string) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: `خوانش آموزشی متن: ${text}` }] }],
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
    contents: [{ parts: [{ text: `Context: ${context}\n\nUser Question: ${prompt}` }] }],
    config: {
      systemInstruction: `تو مربی برنامه‌نویسی "${userName}" هستی. پاسخ‌ها به زبان فارسی، علمی و کوتاه باشد. کدها را در <hl>...</hl> قرار بده.`,
    },
  });
  return result.text || '';
};

export const getTeacherAiAdvice = async (teacherPrompt: string, currentLesson: any, relatedTitles: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Teacher Prompt: ${teacherPrompt}\nLesson: ${JSON.stringify(currentLesson)}` }] }],
    config: {
      systemInstruction: "You are a Senior Academic Peer AI. Assist in curriculum development in Persian.",
    }
  });
  return result.text || '';
};

export const getAdminAuditReport = async (lesson: any, relatedLessonTitles: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Audit Lesson: ${JSON.stringify(lesson)}` }] }],
    config: {
      systemInstruction: "You are a Senior Auditor. Analyze for pedagogical accuracy in Persian.",
    }
  });
  return result.text || '';
};

export const generateLessonSuggestion = async (discipline: string, topic: string, previousLessons: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Topic: ${topic} for ${discipline}` }] }],
    config: {
      systemInstruction: "Design a new lesson. Output JSON with fields: title, content, explanation.",
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
  return JSON.parse(result.text || '{}');
};

/**
 * Note: WebSocket (Live) connection bypasses serverless proxy due to protocol limitations.
 * It will use the client's direct connection with fallback mechanisms.
 */
export const connectLiveTeacher = async (callbacks: any, userName: string, context: string) => {
  const { GoogleGenAI: GenAI } = await import("@google/genai");
  // Temporary empty key as placeholder (Live API requires client-side key or direct tunnel)
  const ai = new GenAI({ apiKey: "SERVER_MANAGED" });
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: `تو مربی زنده "${userName}" هستی. کانتکست: ${context}`,
    }
  });
};
