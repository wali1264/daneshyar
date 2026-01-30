
import { GoogleGenAI, Type, Modality } from "@google/genai";

/**
 * DaneshYar Advanced Edge Tunnel Interceptor
 * Intercepts all fetch/websocket calls to Google APIs to handle regional restrictions.
 */
const GOOGLE_API_HOST = "generativelanguage.googleapis.com";
const PROXY_PATH = "/api/google-proxy";

// 1. Fetch Interceptor for REST APIs (Text, Audio, Images)
const originalFetch = window.fetch;
window.fetch = async (...args: any[]) => {
  const [resource, config] = args;
  let url = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : (resource as any).url;

  if (url && url.includes(GOOGLE_API_HOST)) {
    const newUrl = url.replace(`https://${GOOGLE_API_HOST}`, PROXY_PATH);
    
    // Ensure the key is also caught if it's in the query params
    const updatedUrl = newUrl.includes('key=') ? newUrl : newUrl;

    console.debug(`[EdgeTunnel] Routing HTTP request: ${updatedUrl}`);
    
    // Create a new request object to avoid sealed/used request errors
    if (resource instanceof Request) {
      const headers = new Headers(resource.headers);
      const newRequest = new Request(updatedUrl, {
        method: resource.method,
        headers: headers,
        body: resource.body,
        referrer: resource.referrer,
        mode: 'cors', // Force CORS to handle rewrite properly
        credentials: resource.credentials,
      });
      return originalFetch(newRequest);
    }
    
    return originalFetch(updatedUrl, config);
  }

  return originalFetch(resource, config);
};

// 2. WebSocket Guard (Live API)
// Since Vercel rewrites don't support WSS, we flag failures for the app to handle fallback.
const OriginalWebSocket = window.WebSocket;
(window as any).WebSocket = function(url: string, protocols?: string | string[]) {
  if (url.includes(GOOGLE_API_HOST)) {
    console.warn(`[EdgeTunnel] WebSocket (WSS) call detected to restricted domain. 
      Vercel Rewrites do not support WSS. Fallback to REST mode is recommended.`);
    
    // We add a custom property to the instance for the app to check
    const ws = new OriginalWebSocket(url, protocols);
    (ws as any).isGoogleLive = true;
    return ws;
  }
  return new OriginalWebSocket(url, protocols);
};

/**
 * Smart Key Management System (KeyPool Engine)
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
      console.error(`[KeyManager] 🚨 NO API KEYS FOUND! Using default fallback.`);
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
      console.error(`[KeyRotation] Attempt ${i+1} failed with key ${key.slice(0, 6)}... : ${errorMsg}`);
      
      if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit')) {
        keyManager.markAsLimited(key);
        continue;
      }
      if (errorMsg.includes('403') || errorMsg.includes('forbidden') || errorMsg.includes('permission denied')) {
        // Most likely geoblocking despite proxy - mark this key and move on
        keyManager.markAsLimited(key);
        continue;
      }
      if (errorMsg.includes('entity was not found') || errorMsg.includes('invalid api key')) continue;
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
