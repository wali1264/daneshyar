
import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Audio Utilities for Live API and TTS
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
 * Text-to-Speech for Lesson Content
 */
export const generateLessonSpeech = async (text: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `خوانش شمرده و آموزشی متن زیر برای دانشجو: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

/**
 * Normal text generation for lesson context and chat.
 * Context now includes target code and student's current code.
 */
export const getAITeacherResponse = async (prompt: string, context: string, userName: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Rich Learning Context: ${context}\n\nStudent's Current Query: ${prompt}`,
    config: {
      systemInstruction: `تو مربی فوق تخصص برنامه‌نویسی و همراه شخصی "${userName}" هستی. 
      تو به سه منبع اطلاعاتی دسترسی داری: ۱. متن آموزشی درس، ۲. کد مرجع (Target Code) و ۳. کدی که دانشجو تا این لحظه تایپ کرده است (Student Code).
      وظیفه تو:
      - اگر دانشجو سوالی در مورد منطق کد یا معنای خطوط پرسید، مثل یک توسعه‌دهنده ارشد با لحنی صمیمی و برادرانه توضیح بده.
      - کدهای دانشجو را با کد مرجع مقایسه کن. اگر اشتباهی دارد (غلط املایی یا منطقی)، به او گوشزد کن.
      - از عبارات تشویقی استفاده کن. بخش‌های مهم کد را در پاسخ با <hl>...</hl> مشخص کن.
      - او را همیشه با نام کوچکش (${userName}) صدا بزن.`,
    },
  });
  return response.text || '';
};

/**
 * Teacher-AI Collaboration Chat
 */
export const getTeacherAiAdvice = async (teacherPrompt: string, currentLesson: any, relatedLessons: string[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Teacher Question: ${teacherPrompt}\n\nTarget Lesson: ${JSON.stringify(currentLesson)}\n\nOther lessons in track: ${relatedLessons.join(', ')}`,
    config: {
      systemInstruction: "You are a Senior Academic Peer AI for Teachers. Analyze if the proposed changes are scientifically accurate and consistent with the curriculum flow. Be honest, professional, and blunt if something is wrong. Speak Persian.",
    }
  });
  return response.text || '';
};

/**
 * Admin Audit Report for lesson content verification.
 */
// Added missing getAdminAuditReport export to fix ManagementDashboard import error
export const getAdminAuditReport = async (lesson: any, relatedLessonTitles: string[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Lesson to Audit: ${JSON.stringify(lesson)}\n\nRelated Lessons: ${relatedLessonTitles.join(', ')}`,
    config: {
      systemInstruction: "You are a Senior Academic Auditor for Danesh Yar Academy. Examine the provided lesson for technical accuracy and clarity. Provide a detailed report in Persian (Farsi).",
    },
  });
  return response.text || '';
};

/**
 * Live Audio Session Setup
 */
export const connectLiveTeacher = async (callbacks: any, userName: string, context: string) => {
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: `تو مربی زنده و شخصی "${userName}" هستی. لحن تو باید صمیمی، حرفه‌ای و مثل یک مربی همراه باشد. 
      تو به محتوای زیر دسترسی داری: ${context}.
      اگر دانشجو در حال تمرین است، به او در مورد کدهایش بازخورد بده. اشتباهاتش را با مهربانی بگو. 
      مکالمه را بسیار انسانی و گرم پیش ببر. او را با نام (${userName}) صدا بزن.`,
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    }
  });
};

export const generateLessonSuggestion = async (discipline: string, topic: string, previousLessons: string[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Discipline: ${discipline}. Topic: ${topic}. Context of existing lessons: ${previousLessons.join(', ')}. Create a new lesson structure.`,
    config: {
      systemInstruction: `You are a curriculum designer for Danesh Yar Academy. 
      Rules:
      1. 'title' and 'explanation' MUST be in fluent, professional Persian.
      2. 'content' MUST be standard, high-quality, and clean English code relevant to the topic.
      Output in JSON.`,
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
};
