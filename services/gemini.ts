
import { GoogleGenAI, Type, Modality } from "@google/genai";

/**
 * Smart Key Management System (KeyPool Engine)
 * Handles API key rotation and health checks without intercepting global fetch.
 */
class KeyManager {
  private keys: string[] = [];
  private currentIndex: number = 0;
  private cooldowns: Map<string, number> = new Map();
  private readonly COOLDOWN_TIME = 65000;

  constructor() {
    this.initPool();
  }

  private initPool() {
    const processEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};
    const viteEnv = (import.meta as any).env || {};
    const env = { ...viteEnv, ...processEnv };
    
    const pool: string[] = [];

    if (env.API_KEY) pool.push(env.API_KEY);
    if (env.VITE_GOOGLE_GENAI_TOKEN) pool.push(env.VITE_GOOGLE_GENAI_TOKEN);

    for (let i = 1; i <= 500; i++) {
      const keyName = `VITE_GOOGLE_GENAI_TOKEN_${i}`;
      if (env[keyName]) pool.push(env[keyName]);
    }

    this.keys = pool;
    if (this.keys.length > 0) {
      console.log(`[KeyManager] 🛡️ Smart Guard Active! Found ${this.keys.length} keys.`);
    } else {
      console.warn(`[KeyManager] 🚨 NO API KEYS FOUND in environment!`);
    }
  }

  public getNextHealthyKey(): string {
    if (this.keys.length === 0) return (window as any).process?.env?.API_KEY || '';
    const now = Date.now();
    let attempts = 0;
    while (attempts < this.keys.length) {
      const key = this.keys[this.currentIndex];
      const cooldownUntil = this.cooldowns.get(key) || 0;
      if (now > cooldownUntil) {
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        return key;
      }
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      attempts++;
    }
    return this.keys[0];
  }

  public markAsLimited(key: string) {
    this.cooldowns.set(key, Date.now() + this.COOLDOWN_TIME);
  }

  public getKeyCount() {
    return this.keys.length;
  }
}

const keyManager = new KeyManager();

async function executeWithRotation<T>(operation: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  let lastError: any;
  const maxRetries = Math.max(3, keyManager.getKeyCount());

  for (let i = 0; i < maxRetries; i++) {
    const key = keyManager.getNextHealthyKey();
    if (!key) throw new Error("API key is missing.");
    const ai = new GoogleGenAI({ apiKey: key });

    try {
      return await operation(ai);
    } catch (err: any) {
      lastError = err;
      const errorMsg = err.message?.toLowerCase() || '';
      console.error(`[KeyRotation] Attempt ${i+1} failed: ${errorMsg}`);
      
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit')) {
        keyManager.markAsLimited(key);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
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
  return executeWithRotation(async (ai) => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `خوانش آموزشی متن: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  });
};

export const getAITeacherResponse = async (prompt: string, context: string, userName: string) => {
  return executeWithRotation(async (ai) => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Context: ${context}\n\nUser: ${prompt}`,
      config: {
        systemInstruction: `تو مربی برنامه‌نویسی "${userName}" هستی. پاسخ‌ها کوتاه و به فارسی باشد. کدهای مهم را در <hl>...</hl> قرار بده.`,
      },
    });
    return response.text || '';
  });
};

export const connectLiveTeacher = async (callbacks: any, userName: string, context: string) => {
  const key = keyManager.getNextHealthyKey();
  const ai = new GoogleGenAI({ apiKey: key });
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

export const getTeacherAiAdvice = async (teacherPrompt: string, currentLesson: any, relatedLessons: string[]) => {
  return executeWithRotation(async (ai) => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Teacher Question: ${teacherPrompt}\nTarget Lesson: ${JSON.stringify(currentLesson)}`,
      config: {
        systemInstruction: "You are a Senior Academic Peer AI for Teachers. Speak Persian.",
      }
    });
    return response.text || '';
  });
};

export const getAdminAuditReport = async (lesson: any, relatedLessonTitles: string[]) => {
  return executeWithRotation(async (ai) => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Lesson to Audit: ${JSON.stringify(lesson)}`,
      config: {
        systemInstruction: "You are a Senior Academic Auditor. Speak Persian.",
      },
    });
    return response.text || '';
  });
};

export const generateLessonSuggestion = async (discipline: string, topic: string, previousLessons: string[]) => {
  return executeWithRotation(async (ai) => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Discipline: ${discipline}. Topic: ${topic}.`,
      config: {
        systemInstruction: "You are a curriculum designer. Output JSON with fields: title, content, explanation.",
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
    return JSON.parse(response.text || '{}');
  });
};
