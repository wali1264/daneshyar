
import React, { useState, useRef, useEffect } from 'react';
import { getAITeacherResponse } from '../../services/gemini';
import Button from '../ui/Button';

interface ChatPanelProps {
  context: string;
  onHighlight: (text: string) => void;
  userName: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ context, onHighlight, userName }) => {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: 'سلام! من معلم هوشمند شما هستم. هر سوالی در مورد این درس داری بپرس.' }
  ]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const handleSend = async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim()) return;

    setMessages(prev => [...prev, { role: 'user', text: messageText }]);
    setInput('');
    setLoading(true);

    try {
      // Fix: Pass userName as the third argument to getAITeacherResponse to match its definition in services/gemini.ts
      const response = await getAITeacherResponse(messageText, context, userName);
      
      // Handle highlighting
      const highlightMatch = response.match(/<hl>(.*?)<\/hl>/);
      if (highlightMatch) {
        onHighlight(highlightMatch[1]);
      }

      setMessages(prev => [...prev, { role: 'ai', text: response.replace(/<hl>|<\/hl>/g, '') }]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      alert("مرورگر شما از قابلیت تشخیص صدا پشتیبانی نمی‌کند.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fa-IR';
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      handleSend(transcript);
    };
    recognition.start();
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-100 shadow-inner">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-xs font-bold leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-100 text-slate-800 rounded-bl-none'}`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-end">
            <div className="bg-slate-50 p-3 rounded-2xl animate-pulse text-[10px] font-black text-slate-400">در حال بررسی...</div>
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-2">
        <div className="relative">
          <textarea 
            className="w-full p-4 pr-12 rounded-2xl border-2 border-slate-200 focus:border-blue-500 outline-none text-xs font-bold resize-none h-20"
            placeholder="سوال خود را بپرسید..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <button 
            onClick={startSpeechRecognition}
            className={`absolute right-4 top-4 p-2 rounded-xl transition-all ${isRecording ? 'bg-rose-500 text-white animate-pulse' : 'bg-white text-slate-400 hover:text-blue-600'}`}
          >
            {isRecording ? '🛑' : '🎙️'}
          </button>
        </div>
        <Button onClick={() => handleSend()} className="w-full h-10 rounded-xl text-xs" loading={loading}>ارسال پیام</Button>
      </div>
    </div>
  );
};

export default ChatPanel;
