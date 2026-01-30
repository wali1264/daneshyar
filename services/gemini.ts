
import { Type, Modality } from "@google/genai";

/**
 * Standard Proxy Caller
 * Instead of direct SDK calls, we route everything through our serverless bridge.
 * This avoids regional blocks and hides the API Key from the browser.
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

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Request failed');
    }

    return await response.json();
  } catch (error: any) {
    console.error('[GeminiService] Proxy Call Failed:', error.message);
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
 * Optimized API Methods using the Proxy Bridge
 */

export const generateLessonSpeech = async (text: string) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: `خوانش آموزشی متن با لحن حرفه‌ای: ${text}` }] }],
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
      systemInstruction: `تو مربی برنامه‌نویسی "${userName}" هستی. پاسخ‌ها به زبان فارسی، کوتاه، دوستانه و علمی باشد. کدهای مهم را در تگ <hl> قرار بده.`,
    },
  });
  return result.text || '';
};

export const getTeacherAiAdvice = async (teacherPrompt: string, currentLesson: any, relatedTitles: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Teacher Prompt: ${teacherPrompt}\nLesson Data: ${JSON.stringify(currentLesson)}\nRelated Lessons: ${relatedTitles.join(', ')}` }] }],
    config: {
      systemInstruction: "You are a Senior Academic Peer for Teachers. Help refine the curriculum and offer pedagogical advice in Persian.",
    }
  });
  return result.text || '';
};

export const getAdminAuditReport = async (lesson: any, relatedLessonTitles: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Lesson to Audit: ${JSON.stringify(lesson)}\nContext Titles: ${relatedLessonTitles.join(', ')}` }] }],
    config: {
      systemInstruction: "You are a Senior Academic Auditor. Analyze the lesson for accuracy, clarity, and relevance. Provide the report in Persian.",
    }
  });
  return result.text || '';
};

export const generateLessonSuggestion = async (discipline: string, topic: string, previousLessons: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Discipline: ${discipline}. Topic: ${topic}. Existing lessons: ${previousLessons.join(', ')}` }] }],
    config: {
      systemInstruction: "You are an expert curriculum designer. Generate a new lesson structure. Output in JSON format.",
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
 * Note: connectLiveTeacher (WSS) still uses direct connection. 
 * Proxying WSS requires a stateful WebSocket proxy which standard serverless functions don't support.
 * We rely on the client's direct connection for WSS if available.
 */
export const connectLiveTeacher = async (callbacks: any, userName: string, context: string) => {
  // Use a temporary key for the handshake (will be replaced by env key on client if available)
  const key = (window as any).process?.env?.API_KEY || '';
  const { GoogleGenAI: GenAI } = await import("@google/genai");
  const ai = new GenAI({ apiKey: key });
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
