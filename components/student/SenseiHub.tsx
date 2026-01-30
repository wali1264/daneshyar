
import React, { useState, useRef, useEffect } from 'react';
import { getAITeacherResponse, connectLiveTeacher, decodeBase64, encodeBase64, decodeAudioData, generateLessonSpeech } from '../../services/gemini';
import Button from '../ui/Button';

interface SenseiHubProps {
  isOpen: boolean;
  onClose: () => void;
  context: string;
  userName: string;
}

enum HubMode {
  CHAT = 'CHAT',
  VOICE = 'VOICE'
}

type STTStatus = 'idle' | 'recording' | 'processing' | 'error';

const TeacherIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
    <circle cx="12" cy="12" r="3" strokeDasharray="2 2" opacity="0.4"/>
  </svg>
);

const MicrophoneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const SenseiHub: React.FC<SenseiHubProps> = ({ isOpen, onClose, context, userName }) => {
  const [mode, setMode] = useState<HubMode>(HubMode.CHAT);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: `سلام ${userName} عزیز! من آماده‌ام تا مفاهیم این درس رو با هم بررسی کنیم. چه سوالی داری؟` }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  
  // STT State
  const [sttStatus, setSttStatus] = useState<STTStatus>('idle');
  
  // Voice State
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isVoiceConnecting, setIsVoiceConnecting] = useState(false);
  const [voiceTranscription, setVoiceTranscription] = useState('');
  const [volume, setVolume] = useState(0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [chatMessages, voiceTranscription, mode, sttStatus, liveError]);

  useEffect(() => {
    if (isOpen) {
      if (mode === HubMode.VOICE && !isVoiceActive) {
        startVoiceSession();
      }
    } else {
      stopVoiceSession();
    }
  }, [mode, isOpen]);

  const handleChatSend = async (text?: string) => {
    const msgText = text || chatInput;
    if (!msgText.trim()) return;

    setChatMessages(prev => [...prev, { role: 'user', text: msgText }]);
    setChatInput('');
    setLoadingChat(true);

    try {
      const response = await getAITeacherResponse(msgText, context, userName);
      const cleanResponse = response.replace(/<hl>|<\/hl>/g, '');
      setChatMessages(prev => [...prev, { role: 'ai', text: cleanResponse }]);
      
      // Auto-TTS for Chat in text mode for consistency
      if (mode === HubMode.CHAT) {
        speakText(cleanResponse);
      }
    } catch (e) {
      console.error(e);
      setChatMessages(prev => [...prev, { role: 'ai', text: "متأسفانه در حال حاضر مشکلی در ارتباط با سرور وجود دارد. لطفاً دوباره تلاش کنید." }]);
    } finally {
      setLoadingChat(false);
    }
  };

  const speakText = async (text: string) => {
    try {
      const audioData = await generateLessonSpeech(text);
      if (audioData) {
        if (!outputAudioContextRef.current) outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const buffer = await decodeAudioData(decodeBase64(audioData), outputAudioContextRef.current, 24000, 1);
        const source = outputAudioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(outputAudioContextRef.current.destination);
        source.start();
      }
    } catch (e) { console.error("Speech generation failed:", e); }
  };

  const startSTT = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) return;

    if (sttStatus === 'recording') {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fa-IR';
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onstart = () => setSttStatus('recording');
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setChatInput(transcript);
    };
    recognition.onerror = () => setSttStatus('error');
    recognition.onend = () => {
      setSttStatus('idle');
    };
    recognition.start();
  };

  const startVoiceSession = async () => {
    setIsVoiceConnecting(true);
    setVoiceTranscription('');
    setLiveError(null);
    try {
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = connectLiveTeacher({
        onopen: () => {
          setIsVoiceConnecting(false);
          setIsVoiceActive(true);
          const source = inputCtx.createMediaStreamSource(stream);
          const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const l = inputData.length;
            const int16 = new Int16Array(l);
            let sum = 0;
            for (let i = 0; i < l; i++) {
              int16[i] = inputData[i] * 32768;
              sum += Math.abs(inputData[i]);
            }
            const pcmBase64 = encodeBase64(new Uint8Array(int16.buffer));
            sessionPromise.then(session => {
              session.sendRealtimeInput({ media: { data: pcmBase64, mimeType: 'audio/pcm;rate=16000' } });
            }).catch(() => {});
            setVolume(Math.min(100, (sum / l) * 500));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputCtx.destination);
        },
        onmessage: async (message: any) => {
          if (message.serverContent?.outputTranscription) {
            setVoiceTranscription(prev => prev + message.serverContent.outputTranscription.text);
          }
          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData && outputAudioContextRef.current) {
            const ctx = outputAudioContextRef.current;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
            const buffer = await decodeAudioData(decodeBase64(audioData), ctx, 24000, 1);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
            sourcesRef.current.add(source);
            source.onended = () => sourcesRef.current.delete(source);
          }
        },
        onclose: (e: CloseEvent) => {
          console.warn("Live Session Closed:", e);
          if (isVoiceConnecting) {
             setLiveError("متأسفانه اتصال زنده به دلیل محدودیت‌های WebSocket در پروکسی ورسل در این منطقه امکان‌پذیر نیست. لطفاً از چت متنی و صوتی (REST) استفاده کنید.");
             setTimeout(() => handleEndVoiceAction(), 4000);
          } else {
             handleEndVoiceAction();
          }
        },
        onerror: (e: any) => {
          console.error("Live Session Error:", e);
          setLiveError("خطا در اتصال به موتور زنده. در حال سوییچ به وضعیت چت متنی-صوتی...");
          setTimeout(() => handleEndVoiceAction(), 3000);
        }
      }, userName, context);

      sessionRef.current = await sessionPromise;
      
      // Safety timeout
      setTimeout(() => {
        if (isVoiceConnecting && !isVoiceActive) {
          setLiveError("زمان انتظار برای اتصال زنده تمام شد. به دلیل تحریم‌های پروتکل WSS، استفاده از چت متنی پیشنهاد می‌شود.");
          setTimeout(() => handleEndVoiceAction(), 4000);
        }
      }, 12000);

    } catch (err: any) {
      console.error("Voice initialization failed:", err);
      setIsVoiceConnecting(false);
      setLiveError("امکان دسترسی به میکروفون یا سرور زنده وجود ندارد. لطفاً تنظیمات مرورگر را بررسی کنید.");
      setTimeout(() => setMode(HubMode.CHAT), 4000);
    }
  };

  const handleEndVoiceAction = () => {
    stopVoiceSession();
    setMode(HubMode.CHAT);
  };

  const stopVoiceSession = () => {
    if (sessionRef.current) { try { sessionRef.current.close(); } catch(e) {} sessionRef.current = null; }
    if (inputAudioContextRef.current) { try { inputAudioContextRef.current.close(); } catch(e) {} inputAudioContextRef.current = null; }
    if (outputAudioContextRef.current) { try { outputAudioContextRef.current.close(); } catch(e) {} outputAudioContextRef.current = null; }
    setIsVoiceActive(false);
    setIsVoiceConnecting(false);
    setVolume(0);
    nextStartTimeRef.current = 0;
    sourcesRef.current.clear();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 left-0 w-full md:w-[450px] bg-white shadow-[-20px_0_50px_rgba(0,0,0,0.1)] z-[100] border-r border-slate-100 flex flex-col animate-slide-in-right font-['Vazirmatn']">
      
      <header className="bg-slate-900 px-8 py-10 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-blue-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="w-14 h-14 bg-blue-600 rounded-[1.5rem] flex items-center justify-center shadow-xl border border-white/10 transform rotate-3">
               <TeacherIcon />
             </div>
             <div>
               <h2 className="text-2xl font-black tracking-tight leading-none">استاد همراه دانش‌یار</h2>
               <div className="flex items-center gap-1 mt-2">
                 <div className={`w-2 h-2 rounded-full ${isVoiceActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></div>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isVoiceActive ? 'LIVE ACTIVE' : 'TEXT MODE'}</span>
               </div>
             </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10 transition-all border border-white/5">✕</button>
        </div>
      </header>

      <div className="flex p-2 bg-slate-50/50 backdrop-blur-sm border-b border-slate-100">
        <button onClick={() => setMode(HubMode.CHAT)} className={`flex-1 py-4 rounded-2xl font-black text-[12px] transition-all flex items-center justify-center gap-2 ${mode === HubMode.CHAT ? 'bg-white text-blue-600 shadow-xl scale-[1.02] border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>
          <span>💬</span> چت متنی
        </button>
        <button onClick={() => setMode(HubMode.VOICE)} className={`flex-1 py-4 rounded-2xl font-black text-[12px] transition-all flex items-center justify-center gap-2 ${mode === HubMode.VOICE ? 'bg-white text-blue-600 shadow-xl scale-[1.02] border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>
          <span>🎙️</span> تعامل زنده (WSS)
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/20 custom-scrollbar relative">
        {mode === HubMode.CHAT ? (
          <>
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-start text-right' : 'justify-end text-right'}`}>
                <div className={`max-w-[85%] p-4 rounded-[1.8rem] text-xs font-bold leading-loose shadow-sm transition-all duration-300 ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-slate-800 rounded-bl-none border border-slate-100'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {loadingChat && <div className="flex justify-end"><div className="bg-white p-3 rounded-2xl animate-pulse text-[10px] font-black text-slate-400 border border-slate-100 shadow-sm">در حال بررسی کدهای شما...</div></div>}
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-12 animate-fade-in">
             <div className="relative group">
               <div className={`w-40 h-40 rounded-[3rem] flex items-center justify-center text-6xl transition-all duration-500 shadow-2xl rotate-3 group-hover:rotate-0 ${isVoiceActive ? 'bg-blue-600 shadow-[0_0_80px_rgba(37,99,235,0.4)]' : 'bg-slate-200 text-slate-400'}`}>
                 <TeacherIcon />
               </div>
               {isVoiceActive && <div className="absolute inset-0 rounded-[3.5rem] border-2 border-blue-400 animate-ping opacity-25" style={{ transform: `scale(${1 + volume/200})` }}></div>}
             </div>

             <div className="space-y-3 px-6">
               <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                 {isVoiceConnecting ? 'در حال عبور از محدودیت‌های شبکه...' : isVoiceActive ? `در حال گفتگو با ${userName}` : 'در انتظار اتصال...'}
               </h3>
               <p className={`text-[11px] font-black uppercase tracking-[0.3em] ${liveError ? 'text-rose-500' : 'text-blue-500 opacity-80'}`}>
                 {liveError ? 'SECURITY_PROTOCOL_BLOCKED' : (isVoiceActive ? 'BYPASSING_RESTRICTIONS_ACTIVE' : 'INITIALIZING_SECURE_TUNNEL')}
               </p>
             </div>

             {liveError && (
               <div className="bg-rose-50 text-rose-600 p-6 rounded-3xl border border-rose-100 text-[10px] font-black leading-loose animate-bounce mx-6">
                 {liveError}
               </div>
             )}

             {isVoiceActive && (
               <div className="w-full bg-white/80 backdrop-blur-md border border-slate-200/50 p-8 rounded-[3rem] text-right min-h-[160px] shadow-xl overflow-y-auto max-h-[250px] animate-slide-in-up">
                 <p className="text-xs font-bold text-slate-500 leading-loose italic opacity-90">
                   {voiceTranscription || 'مربی در حال گوش دادن است...'}
                 </p>
               </div>
             )}

             <Button onClick={handleEndVoiceAction} variant="danger" className="w-full h-18 rounded-[2.2rem] text-sm font-black shadow-2xl hover:scale-105 active:scale-95 transition-all">قطع اتصال و بازگشت 🛑</Button>
          </div>
        )}
      </div>

      {mode === HubMode.CHAT && (
        <footer className="p-6 bg-white border-t border-slate-100 flex flex-col gap-4">
          <div className="relative group">
            <div className={`flex items-center bg-slate-50 border-2 transition-all duration-300 rounded-[2.5rem] px-5 py-2 shadow-sm ${sttStatus === 'recording' ? 'border-blue-400 bg-blue-50/30' : 'border-slate-100 group-focus-within:border-blue-500 group-focus-within:bg-white'}`}>
              <button className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 transition-colors"><span className="text-2xl font-light">+</span></button>
              <input 
                className="flex-1 bg-transparent px-3 py-3 outline-none text-xs font-bold text-slate-800 placeholder-slate-400"
                placeholder={sttStatus === 'recording' ? "در حال شنیدن..." : "سوالی دارید؟ بپرسید..."}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
              />
              <div className="flex items-center gap-2">
                {sttStatus === 'recording' && <div className="flex gap-1 items-end h-4 px-2">{[1,2,3,4].map(i => <div key={i} className="w-0.5 bg-blue-500 rounded-full animate-wave" style={{ animationDelay: `${i*0.1}s` }}></div>)}</div>}
                {chatInput.trim() ? (
                   <button onClick={() => handleChatSend()} className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-all shadow-md animate-scale-up"><SendIcon /></button>
                ) : (
                   <button onClick={startSTT} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${sttStatus === 'recording' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-900'}`}><MicrophoneIcon /></button>
                )}
              </div>
            </div>
          </div>
        </footer>
      )}

      <style>{`
        @keyframes wave { 0%, 100% { height: 4px; } 50% { height: 16px; } }
        .animate-wave { animation: wave 1s ease-in-out infinite; }
        .h-18 { height: 4.5rem; }
      `}</style>
    </div>
  );
};

export default SenseiHub;
