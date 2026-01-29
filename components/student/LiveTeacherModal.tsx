
import React, { useEffect, useRef, useState } from 'react';
import { connectLiveTeacher, decodeBase64, encodeBase64, decodeAudioData } from '../../services/gemini';
import Button from '../ui/Button';

interface LiveTeacherModalProps {
  onClose: () => void;
  onTranscription: (text: string) => void;
  userName: string;
  context: string; // Added missing context property
}

const LiveTeacherModal: React.FC<LiveTeacherModalProps> = ({ onClose, onTranscription, userName, context }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [transcription, setTranscription] = useState('');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  useEffect(() => {
    const startSession = async () => {
      try {
        const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioContextRef.current = inputCtx;
        outputAudioContextRef.current = outputCtx;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Fix: Added missing context as the third argument to connectLiveTeacher (line 34)
        const sessionPromise = connectLiveTeacher({
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmData = encodeBase64(new Uint8Array(int16.buffer));
              
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: { data: pcmData, mimeType: 'audio/pcm;rate=16000' } });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: any) => {
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              setTranscription(prev => prev + text);
              onTranscription(text);
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

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e: any) => console.error('Live session error:', e),
          onclose: () => setIsActive(false),
        }, userName, context);

        sessionRef.current = await sessionPromise;
      } catch (err) {
        console.error('Failed to connect live teacher:', err);
        onClose();
      }
    };

    startSession();

    return () => {
      if (sessionRef.current) sessionRef.current.close();
      if (audioContextRef.current) audioContextRef.current.close();
      if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    };
  }, [userName, context, onClose, onTranscription]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md">
      <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-blue-600 animate-pulse"></div>
        
        <div className="mb-8">
          <div className="w-24 h-24 bg-blue-600 rounded-full mx-auto flex items-center justify-center shadow-2xl mb-4 relative">
            <span className="text-4xl animate-bounce">🎙️</span>
            {isActive && <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-75"></div>}
          </div>
          <h2 className="text-3xl font-black text-slate-800">{isConnecting ? 'در حال اتصال به معلم...' : 'مکالمه زنده فعال است'}</h2>
          <p className="text-slate-500 mt-2 font-medium">می‌توانید آزادانه با معلم هوشمند خود صحبت کنید.</p>
        </div>

        <div className="bg-slate-50 p-6 rounded-2xl min-h-[120px] mb-8 text-right overflow-y-auto max-h-40">
          <p className="text-slate-700 leading-relaxed">
            {transcription || 'در حال شنیدن صدای شما...'}
          </p>
        </div>

        <div className="flex justify-center space-x-4 space-x-reverse">
          <Button variant="danger" className="w-full h-14 rounded-2xl" onClick={onClose}>
            قطع مکالمه و بازگشت
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LiveTeacherModal;
