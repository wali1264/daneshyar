import React, { useState, useEffect, useRef } from 'react';
import { DisciplineType, UserRole, UserProfile, Lesson } from '../../types';
import { DISCIPLINE_METADATA } from '../../constants/disciplines';
import { supabase } from '../../services/supabase';
import Button from '../ui/Button';
import { notify } from '../../App';
import { generateLessonSuggestion, getTeacherAiAdvice } from '../../services/gemini';

interface LessonEditorProps {
  user: UserProfile;
  onSave: () => void;
  editLesson?: Lesson | null;
}

const getDisciplineTableName = (discipline: DisciplineType): string => {
  return `lessons_${discipline.toLowerCase()}`;
};

const LessonEditor: React.FC<LessonEditorProps> = ({ user, onSave, editLesson }) => {
  const [topic, setTopic] = useState('');
  const [discipline, setDiscipline] = useState<DisciplineType>(editLesson?.discipline || DisciplineType.PROGRAMMING);
  const [content, setContent] = useState({ 
    title: '', 
    body: '', 
    explanation: '',
    videoUrl: ''
  });
  const [orderIndex, setOrderIndex] = useState<number>(1);
  const [loadingAI, setLoadingAI] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [showAiPeer, setShowAiPeer] = useState(false);
  const [aiPeerMessages, setAiPeerMessages] = useState<{role: 'teacher' | 'ai', text: string}[]>([]);
  const [aiPeerInput, setAiPeerInput] = useState('');
  const [loadingPeer, setLoadingPeer] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync with editLesson prop
  useEffect(() => {
    if (editLesson) {
      setDiscipline(editLesson.discipline);
      setContent({
        title: editLesson.title,
        body: editLesson.content,
        explanation: editLesson.explanation,
        videoUrl: editLesson.video_url || ''
      });
      setOrderIndex(editLesson.order_index);
    } else {
      setContent({ title: '', body: '', explanation: '', videoUrl: '' });
      fetchNextOrderIndex();
    }
  }, [editLesson, discipline]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [aiPeerMessages]);

  const fetchNextOrderIndex = async () => {
    if (editLesson) return;
    try {
      const tableName = getDisciplineTableName(discipline);
      const { data } = await supabase
        .from(tableName)
        .select('order_index')
        .order('order_index', { ascending: false })
        .limit(1);
      
      const nextIndex = data && data[0] ? data[0].order_index + 1 : 1;
      setOrderIndex(nextIndex);
    } catch (e) {
      console.error("Error fetching order index:", e);
    }
  };

  const handleAiAssist = async () => {
    if (!topic) return;
    setLoadingAI(true);
    const tableName = getDisciplineTableName(discipline);
    try {
      const { data: others } = await supabase.from(tableName).select('title');
      const otherTitles = (others || []).map(o => o.title);
      const suggestion = await generateLessonSuggestion(discipline, topic, otherTitles);
      setContent({ ...content, title: suggestion.title, body: suggestion.content, explanation: suggestion.explanation });
      notify.success("هوش مصنوعی آماده است", "پیشنهاد درس جدید با موفقیت تولید شد.");
    } catch (e) { 
      notify.error("خطا در هوش مصنوعی", "امکان تولید محتوا در حال حاضر وجود ندارد.");
    } finally { setLoadingAI(false); }
  };

  const handleAiPeerChat = async () => {
    if (!aiPeerInput.trim()) return;
    const msg = aiPeerInput;
    setAiPeerMessages(prev => [...prev, { role: 'teacher', text: msg }]);
    setAiPeerInput('');
    setLoadingPeer(true);
    const tableName = getDisciplineTableName(discipline);
    try {
      const { data: others } = await supabase.from(tableName).select('title');
      const otherTitles = (others || []).map(o => o.title);
      const advice = await getTeacherAiAdvice(msg, content, otherTitles);
      setAiPeerMessages(prev => [...prev, { role: 'ai', text: advice }]);
    } catch (e) { 
      notify.error("خطای ارتباط", "پاسخی از همکار AI دریافت نشد.");
    } finally { setLoadingPeer(false); }
  };

  const handleAction = async (targetStatus?: 'PUBLISHED' | 'PENDING' | 'PENDING_DELETION') => {
    if (!content.title || !content.body) return notify.warning("اطلاعات ناقص", "تکمیل عنوان و متن درس الزامی است.");
    
    setSaving(true);
    const tableName = getDisciplineTableName(discipline);
    const finalStatus = targetStatus || (user.role === UserRole.ADMIN ? 'PUBLISHED' : 'PENDING');
    
    try {
      const payload = {
        title: content.title, 
        content: content.body, 
        explanation: content.explanation,
        video_url: content.videoUrl,
        status: finalStatus, 
        order_index: orderIndex,
        teacher_id: user.id,
        teacher_name: user.fullName
      };

      if (editLesson?.id) {
        const { error } = await supabase.from(tableName).update(payload).eq('id', editLesson.id);
        if (error) throw error;
        notify.success("ویرایش موفق", "تغییرات با موفقیت در دیتابیس ذخیره شد.");
      } else {
        const { error } = await supabase.from(tableName).insert([payload]);
        if (error) throw error;
        const successTitle = finalStatus === 'PENDING' ? "در انتظار تایید" : "انتشار موفق";
        const successMsg = finalStatus === 'PENDING' 
          ? "محتوا با موفقیت ثبت شد و پس از تایید مدیریت برای دانشجویان فعال می‌شود." 
          : "درس جدید بلافاصله در کتابخانه آموزشی منتشر شد.";
        notify.success(successTitle, successMsg);
      }
      
      onSave();
    } catch (err: any) { 
      notify.error("خطا در ثبت اطلاعات", err.message || "ارتباط با سرور برقرار نشد.");
    } finally { 
      setSaving(false); 
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto text-right pb-10 font-['Vazirmatn']">
      <div className={`flex-1 bg-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border-2 transition-all ${editLesson ? 'border-amber-400 bg-amber-50/10' : 'border-slate-100'} ${showAiPeer ? 'lg:w-2/3' : 'w-full'}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div className="flex items-center gap-5">
            <h2 className="text-3xl font-black text-slate-800">
              {editLesson ? '✏️ حالت ویرایش درس' : '✍️ تدوین درس جدید'}
            </h2>
            <Button variant="outline" size="sm" onClick={() => setShowAiPeer(!showAiPeer)} className="rounded-2xl border-blue-200 text-blue-600 bg-blue-50/50 h-10 text-[10px]">
              {showAiPeer ? 'بستن همکار AI ✕' : '🤖 مشورت با همکار AI'}
            </Button>
          </div>
          <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[10px] font-black text-slate-400 mr-2">دپارتمان:</span>
            <select 
              value={discipline} 
              onChange={(e) => setDiscipline(e.target.value as DisciplineType)} 
              className="bg-transparent font-black outline-none text-xs text-blue-600 cursor-pointer"
              disabled={!!editLesson}
            >
              {Object.entries(DISCIPLINE_METADATA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className="h-6 w-px bg-slate-200 mx-2"></div>
            <span className="text-[10px] font-black text-slate-400">شماره درس:</span>
            <span className="font-black text-slate-800 text-xs px-2">{orderIndex}</span>
          </div>
        </div>

        <div className="space-y-8">
          {!editLesson && (
            <div className="flex gap-4 p-2 bg-blue-50/30 rounded-[2rem] border border-blue-100">
              <input 
                className="flex-1 px-6 py-4 rounded-2xl bg-white border-2 border-transparent focus:border-blue-400 outline-none text-xs font-bold" 
                placeholder="موضوع درس را بنویسید (مثلاً: مفاهیم اولیه شی‌گرایی)" 
                value={topic} 
                onChange={(e) => setTopic(e.target.value)} 
              />
              <Button onClick={handleAiAssist} loading={loadingAI} variant="primary" className="rounded-2xl px-8 h-14 text-sm">🪄 تولید با هوش مصنوعی</Button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[11px] font-black text-slate-400 mr-2 uppercase">عنوان درس (فارسی)</label>
                <input className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-400 outline-none font-black text-slate-800 text-base" value={content.title} onChange={(e) => setContent({...content, title: e.target.value})} />
              </div>
              
              <div className="space-y-2">
                <label className="block text-[11px] font-black text-slate-400 mr-2 uppercase flex items-center gap-2">
                  لینک ویدیوی آموزشی (YouTube)
                  <span className="text-[14px]">🎥</span>
                </label>
                <input 
                  className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-red-400 outline-none font-bold text-slate-600 text-xs" 
                  placeholder="https://youtube.com/watch?v=..."
                  dir="ltr"
                  value={content.videoUrl} 
                  onChange={(e) => setContent({...content, videoUrl: e.target.value})} 
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-black text-slate-400 mr-2 uppercase">بخش آموزشی / مفاهیم (فارسی)</label>
                <textarea className="w-full h-44 px-6 py-4 rounded-2xl border-2 border-slate-100 resize-none outline-none focus:border-blue-400 font-medium leading-relaxed text-sm bg-slate-50/50" value={content.explanation} onChange={(e) => setContent({...content, explanation: e.target.value})} />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="block text-[11px] font-black text-slate-400 mr-2 uppercase">متن تمرین کدنویسی (فقط انگلیسی / کد)</label>
              <textarea 
                className="w-full h-[400px] px-6 py-4 rounded-2xl border-2 border-slate-100 font-mono resize-none outline-none focus:border-emerald-400 bg-slate-900 text-emerald-400 text-lg leading-loose shadow-inner p-8" 
                dir="ltr"
                spellCheck={false}
                value={content.body} 
                onChange={(e) => setContent({...content, body: e.target.value})} 
                placeholder="// Enter standard code here..."
              />
            </div>
          </div>

          <div className="pt-10 border-t border-slate-100 flex flex-wrap gap-4 justify-between items-center">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full animate-pulse ${editLesson ? 'bg-amber-500' : 'bg-blue-500'}`}></span>
              <p className="text-slate-400 text-[11px] font-black tracking-widest uppercase">وضعیت: <span className="text-blue-600">{editLesson ? `ویرایش درس ${orderIndex}` : 'پیش‌نویس جدید'}</span></p>
            </div>
            <div className="flex gap-4">
              {editLesson && (
                <Button variant="outline" onClick={onSave} className="rounded-2xl h-14 px-8 text-sm">انصراف از ویرایش</Button>
              )}
              <Button className={`min-w-[280px] h-14 rounded-2xl text-base shadow-2xl ${editLesson ? 'bg-amber-500 hover:bg-amber-600' : ''}`} onClick={() => handleAction()} loading={saving}>
                {editLesson ? 'ذخیره تغییرات در دیتابیس 💾' : user.role === UserRole.ADMIN ? 'تایید و انتشار نهایی ✅' : 'ارسال جهت تایید مدیر ⏳'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showAiPeer && (
        <aside className="w-full lg:w-96 bg-white border border-blue-100 rounded-[3.5rem] flex flex-col shadow-2xl animate-slide-in-right overflow-hidden h-[700px] sticky top-6">
          <header className="bg-blue-600 p-8 text-white text-center shadow-lg relative">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>
            <span className="text-3xl block mb-2">👨‍🏫</span>
            <h3 className="text-xl font-black tracking-tight">همکار علمی هوشمند</h3>
            <p className="text-[10px] font-bold opacity-80 mt-1 uppercase tracking-widest">Scientific Peer Collaboration</p>
          </header>
          
          <div ref={scrollRef} className="flex-1 p-8 space-y-6 overflow-y-auto bg-slate-50/30">
            {aiPeerMessages.length === 0 && (
              <div className="text-center py-20 px-4">
                <p className="text-slate-400 text-xs font-black leading-loose">
                  استاد عزیز، من آماده‌ام تا محتوای شما را از نظر دقت علمی و روانی متن بررسی کنم.
                </p>
              </div>
            )}
            {aiPeerMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'teacher' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[90%] p-3 rounded-2xl text-xs font-bold leading-relaxed shadow-sm ${m.role === 'teacher' ? 'bg-white text-slate-800 rounded-br-none border border-slate-100' : 'bg-blue-600 text-white rounded-bl-none shadow-blue-200 shadow-lg'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {loadingPeer && <div className="text-left text-[10px] font-black animate-pulse text-blue-600 ml-2">در حال تحلیل...</div>}
          </div>

          <div className="p-8 bg-white border-t border-slate-100 flex flex-col gap-4">
            <textarea 
              className="w-full h-32 p-5 rounded-3xl border-2 border-slate-100 focus:border-blue-400 outline-none text-xs font-bold resize-none bg-slate-50 transition-all"
              placeholder="مثلاً: آیا سناریوی این تمرین برای دانشجو قابل فهم است؟"
              value={aiPeerInput}
              onChange={(e) => setAiPeerInput(e.target.value)}
            />
            <Button onClick={handleAiPeerChat} loading={loadingPeer} className="h-12 rounded-2xl text-[11px] font-black shadow-lg">مشورت با AI</Button>
          </div>
        </aside>
      )}
    </div>
  );
};

export default LessonEditor;