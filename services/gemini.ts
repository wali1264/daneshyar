
import { GoogleGenAI, Type, Modality } from "@google/genai";

/**
 * Smart Key Management System (KeyPool Engine)
 * Handles rate limits by rotating through available API keys.
 */
class KeyManager {
  private keys: string[] = [];
  private currentIndex: number = 0;
  private cooldowns: Map<string, number> = new Map();
  private readonly COOLDOWN_TIME = 65000; // ~1 minute cool-down for 429 errors

  constructor() {
    this.initPool();
  }

  private initPool() {
    // Safely access process.env in browser using the shim or direct access
    const safeEnv = (typeof process !== 'undefined' && process.env) ? process.env : (window as any).process?.env || {};
    const foundKeys: { name: string; val: string }[] = [];

    // Prioritize the standard API_KEY if available
    if (safeEnv.API_KEY) foundKeys.push({ name: 'API_KEY', val: safeEnv.API_KEY });

    // Automatically discover all VITE_GOOGLE_GENAI_TOKEN variants
    Object.keys(safeEnv).forEach(key => {
      if (key.startsWith('VITE_GOOGLE_GENAI_TOKEN') && safeEnv[key]) {
        foundKeys.push({ name: key, val: safeEnv[key]! });
      }
    });

    // Professional sorting: Base first, then _1, _2, _3...
    foundKeys.sort((a, b) => {
      if (a.name === 'API_KEY') return -1;
      if (b.name === 'API_KEY') return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    this.keys = foundKeys.map(k => k.val);
    console.log(`[KeyManager] Pool initialized with ${this.keys.length} keys.`);
  }

  public getNextHealthyKey(): string {
    const safeEnv = (typeof process !== 'undefined' && process.env) ? process.env : (window as any).process?.env || {};
    if (this.keys.length === 0) return safeEnv.API_KEY || '';

    const now = Date.now();
    let attempts = 0;

    while (attempts < this.keys.length) {
      const key = this.keys[this.currentIndex];
      const cooldownUntil = this.cooldowns.get(key) || 0;

      if (now > cooldownUntil) {
        const selectedKey = key;
        // Advance pointer for next call
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        return selectedKey;
      }

      // Skip this key and try next
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      attempts++;
    }

    // Fallback: If all keys are in cooldown, return the first one
    return this.keys[0];
  }

  public markAsLimited(key: string) {
    console.warn(`[KeyManager] Key rate-limited. Cooling down for 60s.`);
    this.cooldowns.set(key, Date.now() + this.COOLDOWN_TIME);
  }

  public getKeyCount() {
    return this.keys.length;
  }
}

const keyManager = new KeyManager();

/**
 * Resilience Wrapper: Executes an AI operation with automatic retry on key rotation.
 */
async function executeWithRotation<T>(operation: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  let lastError: any;
  const maxRetries = Math.min(5, keyManager.getKeyCount() || 1);

  for (let i = 0; i < maxRetries; i++) {
    const key = keyManager.getNextHealthyKey();
    const ai = new GoogleGenAI({ apiKey: key });

    try {
      return await operation(ai);
    } catch (err: any) {
      lastError = err;
      const errorMsg = err.message?.toLowerCase() || '';
      
      // Check for Rate Limit (429) or Quota Exceeded
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit')) {
        keyManager.markAsLimited(key);
        continue; // Try next key in pool
      }
      
      throw err; // For other errors, fail immediately
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
 * AI Services with Pool Support
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
        systemInstruction: `تو مربی فوق تخصص برنامه‌نویسی و همراه شخصی "${userName}" هستی. 
        تو به سه منبع اطلاعاتی دسترسی داری: ۱. متن آموزشی درس، ۲. کد مرجع و ۳. کدی که دانشجو تایپ کرده.
        وظیفه تو: توضیح منطق کد، مقایسه با مرجع و تشویق دانشجوست. پاسخ‌ها به فارسی باشد. کدهای مهم را در <hl>...</hl> قرار بده.`,
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
  const ai = new GoogleGenAI({ apiKey: keyManager.getNextHealthyKey() });
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: `تو مربی زنده و شخصی "${userName}" هستی. صمیمی و حرفه‌ای باش. کانتکست: ${context}`,
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
