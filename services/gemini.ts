
import { GoogleGenAI, Type, Modality } from "@google/genai";

/**
 * Smart Key Management System (KeyPool Engine)
 * Handles rate limits by rotating through available API keys.
 * Pattern: VITE_GOOGLE_GENAI_TOKEN, VITE_GOOGLE_GENAI_TOKEN_1, ..., VITE_GOOGLE_GENAI_TOKEN_500
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
    // Collect all possible environment sources
    const processEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};
    const viteEnv = (import.meta as any).env || {};
    
    // Merge environments priority: process.env (Vercel/Node) > viteEnv (Local build)
    const env = { ...viteEnv, ...processEnv };
    
    const foundKeyNames: string[] = [];
    const pool: string[] = [];

    // 1. Check Standard API_KEY (System requirement)
    if (env.API_KEY) {
      pool.push(env.API_KEY);
      foundKeyNames.push('API_KEY');
    }

    // 2. Check the BASE key (The one without numbers)
    if (env.VITE_GOOGLE_GENAI_TOKEN) {
      pool.push(env.VITE_GOOGLE_GENAI_TOKEN);
      foundKeyNames.push('VITE_GOOGLE_GENAI_TOKEN');
    }

    // 3. Scan for numbered keys starting from 1 to 500
    // As per user: Key 2 is _1, Key 3 is _2, etc.
    for (let i = 1; i <= 500; i++) {
      const keyName = `VITE_GOOGLE_GENAI_TOKEN_${i}`;
      if (env[keyName]) {
        pool.push(env[keyName]);
        foundKeyNames.push(keyName);
      }
    }

    this.keys = pool;
    
    if (this.keys.length > 0) {
      console.log(`[KeyManager] 🛡️ Smart Guard Active!`);
      console.log(`[KeyManager] Found ${this.keys.length} keys:`, foundKeyNames.join(', '));
    } else {
      console.error(`[KeyManager] 🚨 CRITICAL ERROR: No API keys were detected in the environment!`);
      console.log(`[KeyManager] Checked sources: process.env and import.meta.env`);
      // Fallback to process.env.API_KEY if everything else fails (Internal instruction)
      if (process.env.API_KEY) {
          this.keys = [process.env.API_KEY];
      }
    }
  }

  public getNextHealthyKey(): string {
    if (this.keys.length === 0) {
        return process.env.API_KEY || '';
    }

    const now = Date.now();
    let attempts = 0;

    while (attempts < this.keys.length) {
      const key = this.keys[this.currentIndex];
      const cooldownUntil = this.cooldowns.get(key) || 0;

      if (now > cooldownUntil) {
        const selectedKey = key;
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        return selectedKey;
      }

      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      attempts++;
    }

    // If all are in cooldown, return the first one as last resort
    return this.keys[0];
  }

  public markAsLimited(key: string) {
    console.warn(`[KeyManager] ⚠️ Rate limit reached. Rotating to next key...`);
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
    if (!key) throw new Error("API key is missing or not configured correctly.");
    
    // Always create a new instance to ensure the latest key is used
    const ai = new GoogleGenAI({ apiKey: key });

    try {
      return await operation(ai);
    } catch (err: any) {
      lastError = err;
      const errorMsg = err.message?.toLowerCase() || '';
      
      // Handle Rate Limits (429)
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit')) {
        keyManager.markAsLimited(key);
        continue;
      }
      
      // Handle Invalid Key
      if (errorMsg.includes('entity was not found') || errorMsg.includes('invalid api key')) {
        console.error(`[KeyManager] ❌ Invalid Key Detected: ${key.substring(0, 6)}...`);
        continue;
      }
      
      throw err;
    }
  }
  throw lastError;
}

/**
 * Audio Utilities
 */
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
 * AI Services
 */

export const generateLessonSpeech = async (text: string) => {
  return executeWithRotation(async (ai) => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `خوانش شمرده و آموزشی متن زیر برای دانشجو: ${text}` }] }],
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
      contents: `Rich Learning Context: ${context}\n\nStudent's Current Query: ${prompt}`,
      config: {
        systemInstruction: `تو مربی فوق تخصص برنامه‌نویسی و همراه شخصی "${userName}" هستی. پاسخ‌ها به فارسی باشد. کدهای مهم را در <hl>...</hl> قرار بده.`,
      },
    });
    return response.text || '';
  });
};

export const getTeacherAiAdvice = async (teacherPrompt: string, currentLesson: any, relatedLessons: string[]) => {
  return executeWithRotation(async (ai) => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Teacher Question: ${teacherPrompt}\n\nTarget Lesson: ${JSON.stringify(currentLesson)}\n\nOther lessons: ${relatedLessons.join(', ')}`,
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
      contents: `Lesson to Audit: ${JSON.stringify(lesson)}\n\nRelated: ${relatedLessonTitles.join(', ')}`,
      config: {
        systemInstruction: "You are a Senior Academic Auditor for Danesh Yar Academy. Speak Persian.",
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
      systemInstruction: `تو مربی زنده و شخصی "${userName}" هستی. کانتکست: ${context}`,
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    }
  });
};

export const generateLessonSuggestion = async (discipline: string, topic: string, previousLessons: string[]) => {
  return executeWithRotation(async (ai) => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Discipline: ${discipline}. Topic: ${topic}. History: ${previousLessons.join(', ')}.`,
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
