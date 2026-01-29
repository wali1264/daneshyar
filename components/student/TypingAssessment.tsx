import React, { useState, useEffect, useRef } from 'react';
import Button from '../ui/Button';

interface TypingAssessmentProps {
  originalText: string;
  onComplete: (typed: string, stats: { wpm: number, accuracy: number, mistakes: number, duration: number, score: number }) => void;
  onAIUpdate: (message: string) => void;
  onTyping?: (currentText: string) => void;
}

const CodeBlock: React.FC<{ 
  text: string, 
  typed?: string, 
  referenceText?: string,
  isInput?: boolean,
  fontSize: number,
  ghostText?: string,
  isFailed?: boolean
}> = ({ text, typed = "", referenceText = "", isInput = false, fontSize, ghostText, isFailed }) => {
  
  const COLOR_CORRECT = "text-[#39FF14] [text-shadow:0_0_18px_#39FF14]"; 
  const COLOR_WRONG = "text-[#FF3131] [text-shadow:0_0_18px_#FF3131]"; 
  const COLOR_UNTOUCHED = isFailed ? "text-white/20" : "text-white/70 [text-shadow:0_0_12px_rgba(255,255,255,0.6)]";
  const COLOR_GLOW_WHITE = "text-white [text-shadow:0_0_25px_rgba(255,255,255,1)]"; 

  const renderContent = () => {
    if (isInput) {
      const chars = text.split('');
      const ghostChars = ghostText ? ghostText.split('') : [];
      
      return (ghostText || text).split('').map((_, i) => {
        const char = chars[i];
        const expected = referenceText[i];
        
        if (char === undefined) {
          return <span key={i} className="text-transparent">{ghostChars[i] === '\n' ? <br /> : ghostChars[i]}</span>;
        }

        let colorClass = COLOR_GLOW_WHITE;
        if (expected !== undefined) {
          colorClass = char === expected ? COLOR_CORRECT : COLOR_WRONG;
        }
        
        return (
          <span key={i} className={`${colorClass} font-bold transition-all duration-150`}>
            {char === '\n' ? <br /> : char}
          </span>
        );
      });
    } else {
      return text.split('').map((char, i) => {
        let colorClass = COLOR_UNTOUCHED;
        
        if (typed[i] !== undefined) {
          if (typed[i] === char) {
            colorClass = COLOR_CORRECT + " font-black";
          } else {
            colorClass = COLOR_WRONG + " font-black underline decoration-2";
          }
        } else if (i === typed.length && !isFailed) {
          colorClass = COLOR_GLOW_WHITE + " animate-pulse bg-white/20 rounded-sm";
        }

        return (
          <span key={i} className={`${colorClass} transition-all duration-100`}>
            {char === '\n' ? <br /> : char}
          </span>
        );
      });
    }
  };

  return (
    <div 
      className="font-mono whitespace-pre-wrap break-words leading-relaxed tracking-normal text-left transition-all duration-300 w-full" 
      style={{ 
        fontSize: `${fontSize}px`,
        lineHeight: `${fontSize * 1.6}px` 
      }}
      dir="ltr"
    >
      {renderContent()}
    </div>
  );
};

const TypingAssessment: React.FC<TypingAssessmentProps> = ({ originalText, onComplete, onAIUpdate, onTyping }) => {
  const [typedText, setTypedText] = useState('');
  const [mistakeCount, setMistakeCount] = useState(0);
  const [wpm, setWpm] = useState(0);
  const [fontSize, setFontSize] = useState(24);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [score, setScore] = useState(100);

  const startTimeRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const calculatedTime = Math.max(10, originalText.length);
    setTimeLeft(calculatedTime);
  }, [originalText]);

  const calculateScore = (mistakes: number) => {
    if (mistakes === 0) return 100;
    if (mistakes <= 2) return 90;
    if (mistakes <= 5) return 80;
    return 0;
  };

  useEffect(() => {
    if (isStarted && !isFailed && timeLeft > 0) {
      timerIntervalRef.current = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsFailed(true);
            clearInterval(timerIntervalRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isStarted, isFailed, timeLeft]);

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isFailed) return;
    const value = e.target.value;
    if (value.length > originalText.length) return;

    if (!isStarted && value.length > 0) {
      setIsStarted(true);
      startTimeRef.current = Date.now();
    }
    
    let newMistakes = mistakeCount;
    if (value.length > typedText.length) {
      const lastChar = value[value.length - 1];
      const expectedChar = originalText[value.length - 1];
      if (lastChar !== expectedChar) {
        newMistakes = mistakeCount + 1;
        setMistakeCount(newMistakes);
      }
    }
    
    setTypedText(value);
    setScore(calculateScore(newMistakes));
    if (onTyping) onTyping(value);
    
    if (startTimeRef.current && value.length > 0) {
      const mins = (Date.now() - startTimeRef.current) / 60000;
      setWpm(Math.round((value.length / 5) / (mins || 0.01)));
    }

    if (value === originalText) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const isComplete = typedText === originalText;
  const canPass = isComplete && !isFailed && score >= 80;

  const handleFinish = () => {
    if (canPass && startTimeRef.current) {
      onComplete(typedText, { 
        wpm, 
        accuracy: 100, 
        mistakes: mistakeCount, 
        duration: (Date.now() - startTimeRef.current) / 1000,
        score
      });
    }
  };

  const handleRetry = () => {
    setTypedText('');
    setMistakeCount(0);
    setWpm(0);
    setIsStarted(false);
    setIsFailed(false);
    setScore(100);
    const calculatedTime = Math.max(10, originalText.length);
    setTimeLeft(calculatedTime);
    startTimeRef.current = null;
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (onTyping) onTyping('');
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  return (
    <div className="min-h-full w-full flex flex-col p-6 md:p-8 gap-8 bg-[#011b42] relative" dir="ltr">
      <div className={`h-auto bg-black/60 border border-white/15 rounded-[3rem] p-10 md:p-14 shadow-[inset_0_0_50px_rgba(0,0,0,0.7)] relative group transition-all duration-500 text-left ${isFailed ? 'opacity-50 grayscale' : ''}`}>
        <div className="flex items-center justify-end w-full mb-10">
          <div className="flex gap-3">
            <div className="w-3.5 h-3.5 rounded-full bg-[#FF3131] shadow-[0_0_15px_#FF3131]"></div>
            <div className="w-3.5 h-3.5 rounded-full bg-[#FFD700] shadow-[0_0_15px_#FFD700]"></div>
            <div className="w-3.5 h-3.5 rounded-full bg-[#39FF14] shadow-[0_0_15px_#39FF14]"></div>
          </div>
        </div>
        <CodeBlock text={originalText} typed={typedText} fontSize={fontSize} isFailed={isFailed} />
      </div>

      <div className="bg-[#011b42]/80 backdrop-blur-3xl border border-white/20 py-6 px-12 rounded-[2.5rem] flex items-center justify-between shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 sticky top-4 mx-4 md:mx-10" dir="rtl">
        <div className="flex gap-12 items-center">
           <StatItem label="سرعت" value={wpm} suffix="WPM" color="text-white" />
           <div className="flex flex-col items-center min-w-[120px]">
             <p className="text-[9px] text-white/40 font-black uppercase mb-1 tracking-widest">زمان باقی‌مانده</p>
             <div className={`text-4xl font-black transition-all ${timeLeft <= 5 ? 'text-[#FF3131] animate-pulse scale-110 [text-shadow:0_0_20px_#FF3131]' : 'text-cyan-400'}`}>
               {timeLeft}<span className="text-xs opacity-40 ml-1">ثانیه</span>
             </div>
           </div>
           <StatItem label="خطاها" value={mistakeCount} color={mistakeCount > 5 ? "text-[#FF3131]" : "text-amber-400"} />
           <div className="h-12 w-px bg-white/10 mx-2"></div>
           <div className="flex flex-col items-center">
             <p className="text-[9px] text-white/40 font-black uppercase mb-1 tracking-[0.2em]">امتیاز عملکرد</p>
             <div className={`text-4xl font-black ${score >= 80 ? 'text-[#39FF14] [text-shadow:0_0_20px_#39FF14]' : 'text-[#FF3131]'}`}>
               {score}
             </div>
           </div>
        </div>
        <div className="flex items-center bg-black/40 p-1.5 rounded-2xl border border-white/10 shadow-inner mx-4">
           <button onClick={() => setFontSize(prev => Math.min(prev + 2, 80))} className="w-12 h-12 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all font-black text-2xl">+</button>
           <div className="px-6 text-xs font-mono text-[#39FF14] font-black tracking-widest">{fontSize}px</div>
           <button onClick={() => setFontSize(prev => Math.max(prev - 2, 12))} className="w-12 h-12 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all font-black text-2xl">-</button>
        </div>
        <div className="flex-1 max-w-[200px] mx-6">
          <div className="h-2 bg-black/60 rounded-full overflow-hidden border border-white/5 relative">
             <div className="h-full bg-gradient-to-r from-[#39FF14] to-cyan-500 rounded-full transition-all duration-700 shadow-[0_0_20px_#39FF14]" style={{ width: `${(typedText.length / originalText.length) * 100}%` }}></div>
          </div>
        </div>
        <div className="flex gap-4">
          <Button onClick={handleRetry} variant="outline" className="h-16 px-8 rounded-[1.5rem] text-[12px] font-black border-white/10 text-white/60 hover:bg-white/5">تلاش مجدد 🔄</Button>
          <Button disabled={!canPass} onClick={handleFinish} className={`h-16 px-12 rounded-[1.5rem] text-[12px] font-black transition-all ${canPass ? 'bg-[#39FF14] text-black shadow-[0_0_40px_#39FF14] hover:scale-105 active:scale-95' : 'bg-white/5 border border-white/10 text-white/10 cursor-not-allowed'}`}>{isComplete ? (score >= 80 ? "پایان 🚀" : "امتیاز پایین") : isFailed ? "زمان تمام شد" : "در حال تدوین..."}</Button>
        </div>
      </div>

      <div className={`h-auto min-h-[400px] relative rounded-[3rem] border-2 transition-all duration-500 bg-black/80 group shadow-2xl mb-12 overflow-hidden ${isFailed ? 'border-[#FF3131]/50' : 'border-white/15 focus-within:border-[#39FF14]/50'}`}>
        {isFailed && (
          <div className="absolute inset-0 z-50 bg-[#FF3131]/10 backdrop-blur-[2px] flex flex-col items-center justify-center animate-fade-in">
             <div className="bg-black/80 p-10 rounded-[2.5rem] border border-[#FF3131]/30 shadow-[0_0_50px_rgba(255,49,49,0.3)] text-center scale-110">
                <div className="text-6xl mb-4">⌛</div>
                <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Mission Failed</h3>
                <p className="text-[#FF3131] text-xs font-bold mb-6">زمان یا دقت شما به حد نصاب نرسید.</p>
                <Button onClick={handleRetry} className="bg-[#FF3131] text-white px-10 h-14 rounded-2xl shadow-[0_0_20px_#FF3131] hover:scale-105">تلاش دوباره</Button>
             </div>
          </div>
        )}
        <div className="relative w-full h-full min-h-inherit">
          <textarea
            ref={textareaRef}
            className={`absolute inset-0 w-full h-full p-12 md:p-14 bg-transparent outline-none font-mono text-transparent text-lg leading-relaxed resize-none z-20 caret-[#39FF14] selection:bg-blue-500/30 overflow-hidden ${isFailed ? 'pointer-events-none' : ''}`}
            style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize * 1.6}px` }}
            placeholder={isStarted ? "" : "تایپ را برای شروع عملیات آغاز کنید..."}
            value={typedText}
            onChange={handleTyping}
            onPaste={e => { e.preventDefault(); onAIUpdate("تقلب در آکادمی مجاز نیست. لطفاً دستی تایپ کنید."); }}
            dir="ltr"
            spellCheck={false}
            autoFocus
          />
          <div className="p-12 md:p-14 pointer-events-none min-h-full bg-transparent text-left relative z-10 w-full">
             <CodeBlock text={typedText} referenceText={originalText} isInput={true} fontSize={fontSize} ghostText={originalText} isFailed={isFailed} />
          </div>
        </div>
      </div>
      
      <style>{`
        textarea, .font-mono {
          font-family: 'JetBrains Mono', 'Fira Code', 'Roboto Mono', monospace;
          letter-spacing: 0.01em;
          font-weight: 500;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
};

const StatItem: React.FC<{ label: string, value: string | number, suffix?: string, color: string }> = ({ label, value, suffix, color }) => (
  <div className="flex flex-col items-center">
    <p className="text-[9px] text-white/30 font-black uppercase mb-1 tracking-widest">{label}</p>
    <div className={`text-3xl font-black ${color} tracking-tighter`}>
      {value}<span className="text-[12px] opacity-40 ml-1 font-bold">{suffix}</span>
    </div>
  </div>
);

export default TypingAssessment;