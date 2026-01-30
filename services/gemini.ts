
import { GoogleGenAI, Type, Modality } from "@google/genai";

// Initialize the GenAI client using the mandatory process.env.API_KEY
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

async function callProxy(payload: any) {
  try {
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Server bridge error');
    return data;
  } catch (error: any) {
    console.error('[Bridge Failure]:', error.message);
    throw error;
  }
}

export function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

/**
 * Connects to the Gemini Live API for real-time conversational interaction.
 * Uses gemini-2.5-flash-native-audio-preview-12-2025 as the model.
 */
export const connectLiveTeacher = (callbacks: any, userName: string, context: string) => {
  const ai = getAI();
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks: {
      onopen: callbacks.onopen,
      onmessage: callbacks.onmessage,
      onerror: callbacks.onerror,
      onclose: callbacks.onclose,
    },
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: `You are a supportive and professional human-like AI teacher for "${userName}". 
      Respond exclusively in Persian. Current context: ${context}. Keep your responses concise and academically helpful.`,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
      }
    }
  });
};

// REST-based Audio Chat (Anti-Filter Solution)
export const getAIVoiceResponse = async (audioBase64: string, context: string, userName: string) => {
  return await callProxy({
    action: 'generateContent',
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    contents: [
      { 
        parts: [
          { inlineData: { data: audioBase64, mimeType: 'audio/wav' } },
          { text: `User: ${userName}. Context: ${context}. Response in Persian. CONCISE.` }
        ] 
      }
    ],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
    }
  });
};

export const generateLessonSpeech = async (text: string) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: `Read slowly and clearly: ${text}` }] }],
    config: {
      responseModalalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
    }
  });
  return result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

export const getAITeacherResponse = async (prompt: string, context: string, userName: string) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Context: ${context}\n\nUser: ${prompt}` }] }],
    config: {
      systemInstruction: `You are the AI mentor for "${userName}". Respond in Persian, concise and academic.`,
    }
  });
  // Accessing text directly as ensured by the proxy response
  return result.text || '';
};

export const generateLessonSuggestion = async (discipline: string, topic: string, previousLessons: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Topic: ${topic}. Discipline: ${discipline}. Existing: ${previousLessons.join(',')}` }] }],
    config: {
      systemInstruction: "Curriculum designer mode. JSON output.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING },
          explanation: { type: Type.STRING }
        },
        required: ["title", "content", "explanation"]
      }
    }
  });
  // Accessing text directly as ensured by the proxy response
  const text = result.text || '{}';
  return JSON.parse(text);
};

export const getTeacherAiAdvice = async (teacherPrompt: string, content: any, related: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: teacherPrompt }] }],
    config: { systemInstruction: "Academic Peer AI Advisor. Persian." }
  });
  // Accessing text directly as ensured by the proxy response
  return result.text || '';
};

export const getAdminAuditReport = async (lesson: any, related: string[]) => {
  const result = await callProxy({
    action: 'generateContent',
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: `Audit lesson: ${JSON.stringify(lesson)}` }] }],
    config: { systemInstruction: "Course Auditor AI. Persian." }
  });
  // Accessing text directly as ensured by the proxy response
  return result.text || '';
};
