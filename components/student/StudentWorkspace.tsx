import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DisciplineType, Lesson, UserProfile } from '../../types';
import { DISCIPLINE_METADATA } from '../../constants/disciplines';
import { supabase } from '../../services/supabase';
import { generateLessonSpeech, decodeBase64, decodeAudioData } from '../../services/gemini';
import Button from '../ui/Button';
import TypingAssessment from './TypingAssessment';
import SenseiHub from './SenseiHub';
import { notify } from '../../App';

interface StudentWorkspaceProps {
  user: UserProfile;
  activeTrack: DisciplineType;
  onProgressUpdate: (silent?: boolean) => void;
}

enum WorkspaceStep {
  CONCEPT = 'CONCEPT',
  PRACTICE = 'PRACTICE',
  RESULT = 'RESULT'
}

// Modern Medal Component
const GraphicMedal: React.FC<{ score: number; size?: 'sm' | 'md' | 'lg' }> = ({ score, size = 'md' }) => {
  if (score < 80) return null;

  let config = {
    gradient: 'from-orange-300 via-orange-500 to-orange-800',
    shadow: 'shadow-[0_0_15px_rgba(194,65,12,0.4)]',
    text: '3',
    label: 'برنز'
  };

  if (score === 100) {
    config = {
      gradient: 'from-yellow-200 via-yellow-400 to-amber-600',
      shadow: 'shadow-[0_0_20px_rgba(245,158,11,0.6)] animate-pulse',
      text: '1',
      label: 'طلا'
    };
  } else if (score >= 90) {
    config = {
      gradient: 'from-slate-100 via-slate-300 to-slate-500',
      shadow: 'shadow-[0_0_15px_rgba(148,163,184,0.4)]',
      text: '2',
      label: 'نقره'
    };
  }

  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-[12px]',
    lg: 'w-24 h-24 text-4xl'
  };

  return (
    <div 
      title={`${config.label} (${score})`}
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${config.gradient} ${config.shadow} flex items-center justify-center text-white font-black border-2 border-white/30 relative overflow-hidden group transition-transform hover:scale-110`}
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none"></div>
      <span className="relative z-10 drop-shadow-md">{config.text}</span>
    </div>
  );
};

const TeacherIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
    <circle cx="12" cy="12" r="3" strokeDasharray="2 2" opacity="0.4"/>
  </svg>
);

const VideoIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`${active ? 'animate-pulse group-hover:scale-110 transition-transform' : ''}`}>
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
    <polyline points="17 2 12 7 7 2"/>
    <path d="M10 12l5 3-5 3v-6z" fill={active ? 'currentColor' : 'none'} />
  </svg>
);

const getDisciplineTableName = (discipline: DisciplineType): string => `lessons_${discipline.toLowerCase()}`;

const StudentWorkspace: React.FC<StudentWorkspaceProps> = ({ user, activeTrack, onProgressUpdate }) => {
  const [activeStep, setActiveStep] = useState<WorkspaceStep>(WorkspaceStep.CONCEPT);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [fontSize, setFontSize] = useState(24);
  const [lastStats, setLastStats] = useState<any>(null);
  const [lastTypedCode, setLastTypedCode] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  
  const [isSenseiHubOpen, setIsSenseiHubOpen] = useState(false);
  const [currentStudentCode, setCurrentStudentCode] = useState<string>('');

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const dailyLimitReached = (user.lessonsCompletedToday || 0) >= 10;
  const studentFirstName = user.fullName.split(' ')[0] || 'دوست من';

  const getMasteredCount = (discipline: DisciplineType) => {
    const trackMastery = user.lessonMastery?.[discipline] || {};
    return Object.values(trackMastery).filter(score => (score as number) >= 80).length;
  };

  const mainTrackCompletedCount = useMemo(() => {
    if (!user.mainDiscipline) return 0;
    return getMasteredCount(user.mainDiscipline);
  }, [user.lessonMastery, user.mainDiscipline]);

  const isLessonMastered = (track: DisciplineType, lessonId: string): boolean => {
    const score = user.lessonMastery?.[track]?.[lessonId] || 0;
    return score >= 80;
  };

  useEffect(() => {
    fetchLessons();
  }, [activeTrack]);

  const fetchLessons = async () => {
    setLoading(true);
    setLessons([]);
    setSelectedLesson(null);
    try {
      const tableName = getDisciplineTableName(activeTrack);
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('status', 'PUBLISHED')
        .order('order_index', { ascending: true });
      
      if (error) throw error;
      
      const sortedLessons = data || [];
      setLessons(sortedLessons);
      
      if (sortedLessons.length > 0) {
        let targetLesson = sortedLessons[0];
        for (let i = 0; i < sortedLessons.length; i++) {
          if (!isLessonLocked(sortedLessons[i]).locked) {
            targetLesson = sortedLessons[i];
          } else {
            break;
          }
        }
        setSelectedLesson(targetLesson);
      }
    } catch (err) { 
      console.error(err); 
      notify.error("خطا در واکشی دروس", "ارتباط با دیتابیس برقرار نشد.");
    } finally { 
      setLoading(false); 
    }
  };

  const isLessonLocked = (lesson: Lesson): { locked: boolean; reason?: 'RATIO' | 'PROGRESS'; message?: string } => {
    if (isLessonMastered(activeTrack, lesson.id)) {
      return { locked: false };
    }
    const isMain = activeTrack === user.mainDiscipline;
    if (!isMain) {
      const allowedElectiveIndex = Math.floor(mainTrackCompletedCount / 2);
      if (lesson.order_index > allowedElectiveIndex) {
        const requiredMain = lesson.order_index * 2;
        return { 
          locked: true, 
          reason: 'RATIO', 
          message: `برای باز شدن درس ${lesson.order_index} در این تخصص انتخابی، باید حداقل ${requiredMain} درس در تخصص اصلی خود (${DISCIPLINE_METADATA[user.mainDiscipline!].label}) را پاس کنید.` 
        };
      }
    }
    if (lesson.order_index > 1) {
      const prevLesson = lessons.find(l => l.order_index === lesson.order_index - 1);
      if (prevLesson && !isLessonMastered(activeTrack, prevLesson.id)) {
        return { 
          locked: true, 
          reason: 'PROGRESS', 
          message: "ابتدا باید درس قبلی را با حداقل نمره ۸۰ به پایان برسانید." 
        };
      }
    }
    return { locked: false };
  };

  const playLessonNarration = async () => {
    if (!selectedLesson || isReading) return;
    setLoadingAudio(true);
    try {
      const audioData = await generateLessonSpeech(selectedLesson.explanation);
      if (audioData) {
        if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const buffer = await decodeAudioData(decodeBase64(audioData), audioContextRef.current, 24000, 1);
        sourceRef.current = audioContextRef.current.createBufferSource();
        sourceRef.current.buffer = buffer;
        sourceRef.current.connect(audioContextRef.current.destination);
        sourceRef.current.onended = () => setIsReading(false);
        sourceRef.current.start();
        setIsReading(true);
      }
    } catch (e) { console.error(e); } finally { setLoadingAudio(false); }
  };

  const stopNarration = () => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      setIsReading(false);
    }
  };

  const openVideoLink = () => {
    if (selectedLesson?.video_url) {
      window.open(selectedLesson.video_url, '_blank');
    } else {
      notify.info("ویدیو در دسترس نیست", "برای این درس هنوز ویدیوی آموزشی ثبت نشده است.");
    }
  };

  const handleLessonMastered = async (typed: string, stats: any) => {
    if (!selectedLesson) return;
    setIsSaving(true);
    try {
      setLastStats(stats);
      setLastTypedCode(typed);
      
      await supabase.from('learning_logs').insert([{ 
        user_id: user.id, 
        lesson_id: selectedLesson.id, 
        discipline: activeTrack, 
        wpm: stats.wpm, 
        accuracy: 100,
        mistakes: stats.mistakes, 
        score: stats.score,
        duration_seconds: stats.duration 
      }]);

      const currentMastery = user.lessonMastery || {};
      const trackMastery = currentMastery[activeTrack] || {};
      const prevBest = trackMastery[selectedLesson.id] || 0;
      
      if (stats.score > prevBest) {
        const updatedMastery = {
          ...currentMastery,
          [activeTrack]: { ...trackMastery, [selectedLesson.id]: stats.score }
        };
        const isNewMastery = prevBest < 80 && stats.score >= 80;
        await supabase.from('profiles').update({ 
          lesson_mastery: updatedMastery,
          total_mastered_lessons: (user.totalMasteredLessons || 0) + (isNewMastery ? 1 : 0),
          last_accessed_date: new Date().toISOString() 
        }).eq('id', user.id);
        onProgressUpdate(true);
      }
      setActiveStep(WorkspaceStep.RESULT);
    } catch (err) { 
      console.error(err); 
      notify.error("خطا در ثبت نمره", "نمره شما ثبت نشد اما پیشرفت شما محفوظ است.");
    } finally {
      setIsSaving(false);
    }
  };

  const moveToNextLessonAction = () => {
    if (!selectedLesson) return;
    const currentIndex = lessons.findIndex(l => l.id === selectedLesson.id);
    const nextLesson = lessons[currentIndex + 1];
    if (nextLesson) {
      const justPassed = lastStats && lastStats.score >= 80;
      const lockStatus = isLessonLocked(nextLesson);
      if (justPassed || !lockStatus.locked) {
        setSelectedLesson(nextLesson);
        setActiveStep(WorkspaceStep.CONCEPT);
      } else {
        notify.warning("محدودیت پیشرفت", lockStatus.message || "این درس هنوز قفل است.");
        setActiveStep(WorkspaceStep.CONCEPT);
        setShowMap(true);
      }
    } else {
      notify.success("تبریک!", "شما تمام دروس این بخش را با موفقیت فتح کردید.");
      setShowMap(true);
      setActiveStep(WorkspaceStep.CONCEPT);
    }
  };

  const getMotivationalMessage = () => {
    if (!lastStats) return "";
    const score = lastStats.score;
    const name = studentFirstName;
    if (score === 100) return `عالی بود ${name}! تو به مدال طلا و تسلط ۱۰۰٪ رسیدی. هیچ نقصی در کار تو نیست. پادشاه این مرحله تویی! 🏆`;
    if (score >= 90) return `آفرین ${name}! مدال نقره سهم تو شد. با کمی دقت بیشتر در زمان، مدال طلا هم مال تو میشه. آماده‌ای برای تکرار؟ ✨`;
    if (score >= 80) return `تبریک ${name}! مدال برنز رو گرفتی و درس بعدی برات باز شد. تو حالا ۸۰٪ مسیر حرفه‌ای رو رفتی. برای نقره و طلا بجنگ! 🎯`;
    return `تلاش خوبی بود ${name}، اما برای عبور از این مرحله و باز شدن درس‌های بعدی، باید حداقل ۸۰ امتیاز (مدال برنز) کسب کنی. دوباره امتحان کن! 🧐`;
  };

  const richAiContext = useMemo(() => {
    if (!selectedLesson) return "";
    return `
      Explanation: ${selectedLesson.explanation}
      Target Code to type: ${selectedLesson.content}
      Student's Current Code Progress: ${currentStudentCode || "Nothing typed yet"}
      Status: ${activeStep === WorkspaceStep.PRACTICE ? "In practice mode" : "Reviewing concepts"}
    `.trim();
  }, [selectedLesson, currentStudentCode, activeStep]);

  const lineHeight = fontSize * 1.8;

  if (dailyLimitReached) return (
    <div className="max-w-xl mx-auto mt-20 bg-white rounded-[3rem] p-16 shadow-2xl text-center border-t-8 border-emerald-400 font-['Vazirmatn']">
      <div className="text-8xl mb-8">🌙</div>
      <h2 className="text-3xl font-black text-slate-800">وقت استراحت مغز</h2>
      <p className="text-slate-500 mt-6 text-sm font-bold leading-loose">امروز ۱۰ درس جدید را با موفقیت فتح کردی. فردا با انرژی برگرد!</p>
      <Button onClick={() => onProgressUpdate()} variant="outline" className="mt-10 px-12 h-14 rounded-2xl shadow-lg">بروزرسانی وضعیت 🔄</Button>
    </div>
  );

  const hasVideo = !!selectedLesson?.video_url;

  return (
    <div className="flex flex-col h-screen bg-white relative font-['Vazirmatn'] overflow-hidden">
      
      <SenseiHub 
        isOpen={isSenseiHubOpen} 
        onClose={() => setIsSenseiHubOpen(false)} 
        context={richAiContext} 
        userName={studentFirstName}
      />

      <header className="bg-white/95 backdrop-blur-sm border-b border-slate-100 h-14 flex items-center justify-between px-6 sticky top-0 z-40 shadow-sm">
        <div className="relative flex items-center gap-3">
          <button 
            onClick={() => setShowMap(!showMap)}
            className="flex items-center gap-2 hover:bg-slate-50 p-1.5 rounded-xl transition-all"
          >
            <div className="bg-blue-600 text-white w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shadow-md">
              {selectedLesson?.order_index || 0}
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black text-slate-800 flex items-center gap-1.5 leading-none">
                {selectedLesson?.title || 'در حال بارگذاری...'}
                <span className="text-[7px] opacity-30 transform transition-transform" style={{ transform: showMap ? 'rotate(180deg)' : 'none' }}>▼</span>
              </p>
              <p className="text-[6px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                {DISCIPLINE_METADATA[activeTrack].label}
              </p>
            </div>
          </button>

          {showMap && (
            <div className="absolute top-full mt-2 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-scale-up z-50">
              <div className="p-4 bg-slate-50 border-b border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">نقشه پیشرفت (کلیک برای پرش به درس)</p>
              </div>
              <div className="max-h-[400px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {lessons.map(l => {
                  const status = isLessonLocked(l);
                  const score = user.lessonMastery?.[activeTrack]?.[l.id] || 0;
                  const mastered = score >= 80;
                  const isCurrent = selectedLesson?.id === l.id;
                  return (
                    <button 
                      key={l.id} 
                      disabled={status.locked}
                      onClick={() => { setSelectedLesson(l); setShowMap(false); setActiveStep(WorkspaceStep.CONCEPT); }}
                      className={`w-full text-right p-3 rounded-xl flex items-center gap-3 transition-all ${isCurrent ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-50'} ${status.locked ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                    >
                      <span className={`text-[10px] font-black ${isCurrent ? 'text-white/60' : 'text-slate-400'}`}>{l.order_index}</span>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-[10px] font-bold truncate">{l.title}</p>
                        {status.locked && status.reason === 'RATIO' && (
                          <p className="text-[7px] font-black text-rose-500 mt-0.5">⚠️ نیاز به پیش‌نیاز تخصصی</p>
                        )}
                        {!status.locked && mastered && (
                          <p className="text-[7px] font-black text-emerald-500 mt-0.5">✓ فتح شده</p>
                        )}
                      </div>
                      <div className="flex items-center justify-end min-w-[32px]">
                        <GraphicMedal score={score} size="sm" />
                        {status.locked && !mastered && <span className="text-[10px] opacity-40">🔒</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Phase Buttons */}
        <div className="flex items-center gap-1 bg-slate-100/70 p-0.5 rounded-xl border border-slate-100">
          <PhaseButton active={activeStep === WorkspaceStep.CONCEPT} label="مفاهیم" icon="📚" onClick={() => setActiveStep(WorkspaceStep.CONCEPT)} />
          <PhaseButton active={activeStep === WorkspaceStep.PRACTICE} label="تمرین" icon="⌨️" onClick={() => selectedLesson && setActiveStep(WorkspaceStep.PRACTICE)} />
        </div>

        <div className="flex items-center gap-3">
          {/* YouTube Video Button */}
          <button 
            onClick={openVideoLink}
            title={hasVideo ? "مشاهده ویدیوی آموزشی" : "ویدیو برای این درس ثبت نشده"}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all group ${hasVideo ? 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white shadow-red-200 shadow-lg border border-red-100' : 'bg-slate-50 text-slate-300 cursor-not-allowed border border-slate-100'}`}
          >
            <VideoIcon active={hasVideo} />
          </button>

          <button 
            onClick={() => setIsSenseiHubOpen(true)}
            title="Sensei Hub"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isSenseiHubOpen ? 'bg-blue-600 text-white shadow-blue-200 shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600'} border border-slate-200/50 group`}
          >
            <TeacherIcon />
          </button>
          <div className="h-6 w-px bg-slate-200 mx-1"></div>
          <div className="flex items-center bg-slate-50 border border-slate-100 rounded-lg p-0.5">
            <button onClick={() => setFontSize(prev => Math.min(prev + 2, 48))} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:bg-white rounded-md text-sm font-black">+</button>
            <button onClick={() => setFontSize(prev => Math.max(prev - 2, 12))} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:bg-white rounded-md text-sm font-black">-</button>
          </div>
          <button 
            onClick={isReading ? stopNarration : playLessonNarration} 
            disabled={loadingAudio || !selectedLesson}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${isReading ? 'bg-rose-500 text-white shadow-rose-200 shadow-md' : 'bg-blue-600 text-white shadow-blue-200 shadow-lg'} hover:scale-105`}
          >
            {loadingAudio ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : isReading ? '🛑' : '🔊'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-white flex flex-col items-center custom-scrollbar">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">در حال واکشی اطلاعات...</p>
          </div>
        ) : !selectedLesson ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-10 grayscale opacity-20 py-20">
             <div className="text-6xl mb-6">📚</div>
             <h3 className="text-xl font-black text-slate-400">دروسی یافت نشد</h3>
          </div>
        ) : (
          <div className="w-full h-auto min-h-full">
            {activeStep === WorkspaceStep.CONCEPT && (
              <div 
                className="animate-fade-in w-full min-h-full flex flex-col relative"
                style={{
                  backgroundImage: `linear-gradient(#f1f5f9 1px, transparent 1px)`,
                  backgroundSize: `100% ${lineHeight}px`,
                  backgroundAttachment: 'local',
                  backgroundPosition: `0 0`
                }}
              >
                <div className="absolute top-0 right-16 w-0.5 h-full bg-blue-100 pointer-events-none z-0"></div>
                <div className="w-full relative z-10 flex flex-col">
                  <div 
                    className="text-slate-700 font-medium text-justify w-full mb-16 pr-20 pl-12 pt-4"
                    style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
                  >
                    {selectedLesson.explanation.split('\n').map((line, idx) => (
                      <div key={idx} className="relative w-full">
                        <span className="absolute -right-20 w-16 text-center text-slate-300 font-mono text-[10px] select-none">{idx + 1}</span>
                        <p className="w-full">{line || ' '}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center pb-20">
                    <Button onClick={() => setActiveStep(WorkspaceStep.PRACTICE)} size="lg" className="h-14 px-12 rounded-2xl text-base shadow-2xl bg-gradient-to-r from-blue-600 to-indigo-700">
                      ورود به کارگاه پیاده‌سازی ⌨️
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeStep === WorkspaceStep.PRACTICE && (
              <div className="animate-fade-in min-h-full w-full bg-[#011b42]">
                <TypingAssessment 
                  originalText={selectedLesson.content} 
                  onComplete={handleLessonMastered} 
                  onAIUpdate={() => {}} 
                  onTyping={(text) => setCurrentStudentCode(text)}
                />
              </div>
            )}

            {activeStep === WorkspaceStep.RESULT && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/70 backdrop-blur-xl animate-fade-in">
                <div className="bg-white w-full max-w-xl rounded-[3.5rem] p-10 md:p-12 shadow-[0_0_80px_rgba(0,0,0,0.4)] text-center relative overflow-hidden flex flex-col items-center border border-white/20">
                  <div className={`absolute top-0 left-0 w-full h-2 ${lastStats?.score >= 80 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                  
                  <div className="mb-8">
                    <GraphicMedal score={lastStats?.score || 0} size="lg" />
                    {lastStats?.score < 80 && (
                      <div className="w-24 h-24 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center text-5xl shadow-lg">🧐</div>
                    )}
                  </div>

                  <div className="space-y-4 w-full mb-8">
                    <h2 className="text-3xl font-black text-slate-800">امتیاز نهایی: {lastStats?.score} / ۱۰۰</h2>
                    <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 text-slate-700 font-bold text-base leading-relaxed shadow-inner">
                      {getMotivationalMessage()}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 w-full">
                    <Button onClick={() => { setActiveStep(WorkspaceStep.PRACTICE); setCurrentStudentCode(''); }} variant="outline" className="flex-1 h-14 rounded-2xl text-[11px] border-slate-200 text-slate-600 font-black transition-all hover:bg-slate-50">
                      {lastStats?.score >= 80 ? "تکرار مجدد 🔄" : "تلاش دوباره 🎯"}
                    </Button>
                    
                    {lastStats?.score >= 80 && (
                      <Button onClick={() => { moveToNextLessonAction(); setCurrentStudentCode(''); }} className="flex-1 h-14 rounded-2xl text-[11px] shadow-lg bg-emerald-600 font-black transition-all hover:scale-[1.02] active:scale-95">
                        صعود به مرحله بعد 🚀
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

const PhaseButton: React.FC<{ active: boolean, label: string, icon: string, onClick: () => void }> = ({ active, label, icon, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${active ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
  >
    <span className="text-sm">{icon}</span>
    <span className="text-[9px] font-black">{label}</span>
  </button>
);

export default StudentWorkspace;