
import React, { useState, useRef, useEffect } from 'react';
import { getAITeacherResponse, getAIVoiceResponse, decodeBase64, decodeAudioData, generateLessonSpeech, encodeBase64 } from '../../services/gemini';
import Button from '../ui/Button';

interface SenseiHubProps {
  isOpen: boolean;
  onClose: () => void;
  context: string;
  userName: string;
}

enum HubMode { CHAT = 'CHAT', VOICE = 'VOICE' }

const SenseiHub: React.FC<SenseiHubProps> = ({ isOpen, onClose, context, userName }) => {
  const [mode, setMode] = useState<HubMode>(HubMode.CHAT);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: `سلام ${userName} عزیز! چطور می‌تونم در یادگیری این درس کمکت کنم؟` }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscription, setVoiceTranscription] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [chatMessages, mode, isRecording]);

  const handleChatSend = async (text?: string) => {
    const msgText = text || chatInput;
    if (!msgText.trim()) return;
    setChatMessages(prev => [...prev, { role: 'user', text: msgText }]);
    setChatInput('');
    setLoading(true);
    try {
      const response = await getAITeacherResponse(msgText, context, userName);
      setChatMessages(prev => [...prev, { role: 'ai', text: response }]);
      // Auto-TTS for text chat
      speakText(response);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'ai', text: "متأسفانه مشکلی در ارتباط با سرور وجود دارد." }]);
    } finally { setLoading(false); }
  };

  const speakText = async (text: string) => {
    try {
      const audioData = await generateLessonSpeech(text);
      if (audioData) {
        if (!outputAudioContextRef.current) outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
        const buffer = await decodeAudioData(decodeBase64(audioData), outputAudioContextRef.current, 24000, 1);
        const source = outputAudioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(outputAudioContextRef.current.destination);
        source.start();
      }
    } catch (e) { console.error(e); }
  };

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        
        recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
        recorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            setLoading(true);
            try {
              const result = await getAIVoiceResponse(base64Audio, context, userName);
              const audioResponse = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
              if (audioResponse) {
                if (!outputAudioContextRef.current) outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
                const buffer = await decodeAudioData(decodeBase64(audioResponse), outputAudioContextRef.current, 24000, 1);
                const source = outputAudioContextRef.current.createBufferSource();
                source.buffer = buffer;
                source.connect(outputAudioContextRef.current.destination);
                source.start();
              }
            } catch (err) {
              console.error(err);
            } finally { setLoading(false); }
          };
        };
        
        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch (err) {
        alert("دسترسی به میکروفون امکان‌پذیر نیست.");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 left-0 w-full md:w-[450px] bg-white shadow-2xl z-[100] border-r border-slate-100 flex flex-col animate-slide-in-right font-['Vazirmatn'] text-right">
      <header className="bg-slate-900 p-8 text-white flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black">استاد همراه دانش‌یار</h2>
          <p className="text-[10px] text-blue-400 font-bold uppercase mt-1">AI Academic Peer</p>
        </div>
        <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
      </header>

      <div className="flex p-1 bg-slate-50 border-b">
        <button onClick={() => setMode(HubMode.CHAT)} className={`flex-1 py-3 rounded-xl text-xs font-black ${mode === HubMode.CHAT ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>گپ متنی</button>
        <button onClick={() => setMode(HubMode.VOICE)} className={`flex-1 py-3 rounded-xl text-xs font-black ${mode === HubMode.VOICE ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>گپ صوتی (REST)</button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
        {mode === HubMode.CHAT ? (
          chatMessages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl text-xs font-bold leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-slate-800 rounded-bl-none border border-slate-100'}`}>
                {m.text}
              </div>
            </div>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-8">
            <div className={`w-32 h-32 rounded-full flex items-center justify-center text-5xl transition-all ${isRecording ? 'bg-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.4)] animate-pulse' : 'bg-blue-600 shadow-xl text-white'}`}>
              {isRecording ? '🛑' : '🎙️'}
            </div>
            <h3 className="text-lg font-black text-slate-800">
              {isRecording ? 'در حال شنیدن...' : 'برای صحبت کردن کلیک کنید'}
            </h3>
            <p className="text-[10px] text-slate-400 font-bold">
              این بخش از سیستم ضد-فیلتر REST استفاده می‌کند و ۱۰۰٪ پایدار است.
            </p>
            <Button onClick={toggleVoiceRecording} className={`w-48 h-14 rounded-2xl ${isRecording ? 'bg-rose-600' : 'bg-blue-600'}`} loading={loading}>
              {isRecording ? 'پایان ضبط و ارسال' : 'شروع گفتگو'}
            </Button>
          </div>
        )}
      </div>

      {mode === HubMode.CHAT && (
        <footer className="p-6 bg-white border-t flex gap-2">
          <input 
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-blue-400"
            placeholder="سوال خود را اینجا بنویسید..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
          />
          <Button onClick={() => handleChatSend()} className="w-12 h-12 rounded-xl" loading={loading}>🚀</Button>
        </footer>
      )}
    </div>
  );
};

export default SenseiHub;
