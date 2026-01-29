import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, Lesson, UserRole, DisciplineType, LearningLog } from '../../types';
import { DISCIPLINE_METADATA } from '../../constants/disciplines';
import { supabase } from '../../services/supabase';
import { getAdminAuditReport } from '../../services/gemini';
import Button from '../ui/Button';
import LessonEditor from './LessonEditor';
import { notify } from '../../App';

interface ManagementDashboardProps {
  currentUser: UserProfile;
  initialTab?: 'overview' | 'approvals' | 'library' | 'analysis';
}

const LeaderboardMedal: React.FC<{ rank: number }> = ({ rank }) => {
  let gradient = 'from-orange-300 via-orange-500 to-orange-800';
  let shadow = 'shadow-orange-100';
  let textColor = 'text-white';

  if (rank === 1) {
    gradient = 'from-yellow-200 via-yellow-400 to-amber-600 shadow-[0_0_20px_rgba(245,158,11,0.5)]';
  } else if (rank === 2) {
    gradient = 'from-slate-100 via-slate-300 to-slate-500';
  }

  return (
    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center font-black text-xl text-white shadow-xl transform rotate-3 border-2 border-white/20 relative overflow-hidden`}>
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none"></div>
      <span className="relative z-10">{rank}</span>
    </div>
  );
};

const getDisciplineTableName = (discipline: DisciplineType): string => `lessons_${discipline.toLowerCase()}`;

const ManagementDashboard: React.FC<ManagementDashboardProps> = ({ currentUser, initialTab = 'overview' }) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'approvals' | 'library' | 'analysis'>(initialTab);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [pendingLessons, setPendingLessons] = useState<Lesson[]>([]);
  const [libraryLessons, setLibraryLessons] = useState<Lesson[]>([]);
  const [allLogs, setAllLogs] = useState<LearningLog[]>([]);
  const [libraryDiscipline, setLibraryDiscipline] = useState<DisciplineType>(DisciplineType.PROGRAMMING);
  const [loading, setLoading] = useState(true);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [selectedUserForApproval, setSelectedUserForApproval] = useState<UserProfile | null>(null);
  const [auditingLesson, setAuditingLesson] = useState<Lesson | null>(null);
  const [auditReport, setAuditReport] = useState('');
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Analysis state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'library') fetchLibrary();
    if (activeSubTab === 'analysis') fetchLogs();
  }, [activeSubTab, libraryDiscipline]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: profiles } = await supabase.from('profiles').select('*');
      const mappedUsers = (profiles || []).map(p => ({
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        fatherName: p.father_name,
        role: p.role as UserRole,
        isActive: p.is_active,
        mainDiscipline: p.main_discipline,
        activeDisciplines: p.active_disciplines || [],
        trackProgress: p.track_progress || {},
        lessonMastery: p.lesson_mastery || {},
        registrationDate: p.registration_date,
        lessonsCompletedToday: p.lessons_completed_today || 0,
        totalMasteredLessons: p.total_mastered_lessons || 0,
        masteryBadges: p.mastery_badges || [],
        documentUrl: p.document_url
      }));
      setAllUsers(mappedUsers);

      const pendingResults: Lesson[] = [];
      for (const disc of Object.values(DisciplineType)) {
        const { data } = await supabase.from(getDisciplineTableName(disc)).select('*').in('status', ['PENDING', 'PENDING_DELETION']);
        if (data) pendingResults.push(...data.map(l => ({ ...l, discipline: disc })));
      }
      setPendingLessons(pendingResults);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchLibrary = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from(getDisciplineTableName(libraryDiscipline)).select('*').order('order_index', { ascending: true });
      setLibraryLessons((data || []).map(l => ({ ...l, discipline: libraryDiscipline })));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchLogs = async () => {
    try {
      const { data } = await supabase.from('learning_logs').select('*');
      if (data) setAllLogs(data);
    } catch (e) { console.error(e); }
  };

  const handleApproveUser = async (user: UserProfile) => {
    await supabase.from('profiles').update({ is_active: true }).eq('id', user.id);
    notify.success("تایید هویت", `دسترسی ${user.fullName} به سامانه فعال شد.`);
    setSelectedUserForApproval(null);
    fetchData();
  };

  const handleApproveLesson = async (lesson: Lesson) => {
    try {
      const { error } = await supabase.from(getDisciplineTableName(lesson.discipline)).update({ status: 'PUBLISHED' }).eq('id', lesson.id);
      if (error) throw error;
      notify.success("انتشار موفق", `درس "${lesson.title}" اکنون برای دانشجویان قابل مشاهده است.`);
      fetchData();
      if (activeSubTab === 'library') fetchLibrary();
    } catch (e: any) {
      notify.error("خطا در تایید", e.message);
    }
  };

  const handleAuditRequest = async (lesson: Lesson) => {
    setAuditingLesson(lesson);
    setAuditReport('');
    setLoadingAudit(true);
    try {
      const relatedTitles = libraryLessons.filter(l => l.id !== lesson.id).map(l => l.title);
      setAuditReport(await getAdminAuditReport(lesson, relatedTitles));
    } catch (e) { setAuditReport("خطا در بازرسی."); } finally { setLoadingAudit(false); }
  };

  const handleConfirmDeletion = async (lesson: Lesson) => {
    await supabase.from(getDisciplineTableName(lesson.discipline)).delete().eq('id', lesson.id);
    notify.warning("حذف شد", "محتوا از دیتابیس حذف گردید.");
    fetchData();
    if (activeSubTab === 'library') fetchLibrary();
  };

  // ANALYSIS CALCULATIONS
  const students = useMemo(() => allUsers.filter(u => u.role === UserRole.STUDENT), [allUsers]);
  
  const filteredStudents = useMemo(() => {
    if (!searchQuery) return students;
    return students.filter(s => s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || s.email.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [students, searchQuery]);

  const studentAnalysis = useMemo(() => {
    if (!selectedStudentId) return null;
    const student = students.find(s => s.id === selectedStudentId);
    if (!student) return null;

    const studentLogs = allLogs.filter(l => l.user_id === selectedStudentId);
    const totalTime = studentLogs.reduce((acc, l) => acc + (l.duration_seconds || 0), 0);
    const totalMistakes = studentLogs.reduce((acc, l) => acc + (l.mistakes || 0), 0);
    const avgWpm = studentLogs.length > 0 ? studentLogs.reduce((acc, l) => acc + (l.wpm || 0), 0) / studentLogs.length : 0;
    
    // Retakes: how many times log entry for same lesson_id exists
    const lessonCounts: Record<string, number> = {};
    studentLogs.forEach(l => {
      lessonCounts[l.lesson_id] = (lessonCounts[l.lesson_id] || 0) + 1;
    });
    const totalRetakes = Object.values(lessonCounts).reduce((acc, count) => acc + (count > 1 ? count - 1 : 0), 0);

    return {
      student,
      logs: studentLogs,
      stats: {
        totalTime: Math.round(totalTime / 60), // minutes
        totalMistakes,
        avgWpm: Math.round(avgWpm),
        totalRetakes,
        attempts: studentLogs.length
      }
    };
  }, [selectedStudentId, allLogs, students]);

  const leaderboard = useMemo(() => {
    return students.map(s => {
      const sLogs = allLogs.filter(l => l.user_id === s.id);
      const totalTime = sLogs.reduce((acc, l) => acc + (l.duration_seconds || 0), 1); // avoid 0
      const totalMistakes = sLogs.reduce((acc, l) => acc + (l.mistakes || 0), 0);
      const avgScore = sLogs.length > 0 ? sLogs.reduce((acc, l) => acc + (l.score || 0), 0) / sLogs.length : 0;
      
      const rankScore = avgScore - (totalMistakes / (sLogs.length || 1));

      return {
        ...s,
        totalTime,
        totalMistakes,
        avgScore,
        rankScore
      };
    }).sort((a, b) => b.rankScore - a.rankScore).slice(0, 5);
  }, [students, allLogs]);

  const pendingUsers = allUsers.filter(u => !u.isActive);

  return (
    <div className="space-y-8 text-right font-['Vazirmatn']">
      <div className="flex bg-white p-2 rounded-[2rem] shadow-sm border border-slate-100 w-fit mx-auto md:mx-0">
        <TabButton active={activeSubTab === 'overview'} onClick={() => setActiveSubTab('overview')} label="📊 آمار پلتفرم" />
        <TabButton active={activeSubTab === 'analysis'} onClick={() => setActiveSubTab('analysis')} label="🧬 تحلیل پیشرفته" />
        <TabButton active={activeSubTab === 'approvals'} onClick={() => setActiveSubTab('approvals')} label="🔔 صف تایید" count={pendingUsers.length + pendingLessons.length} />
        <TabButton active={activeSubTab === 'library'} onClick={() => setActiveSubTab('library')} label="📚 کل دروس" />
      </div>

      {activeSubTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard label="دانشجویان فعال" value={allUsers.filter(u => u.role === UserRole.STUDENT && u.isActive).length} suffix="نفر" />
          <StatCard label="اساتید ثبت شده" value={allUsers.filter(u => u.role === UserRole.TEACHER).length} suffix="نفر" color="blue" />
          <StatCard label="در انتظار تایید هویت" value={pendingUsers.length} suffix="مورد" color="rose" />
          <StatCard label="دروس منتظر بازبینی" value={pendingLessons.length} suffix="درس" color="amber" />
        </div>
      )}

      {activeSubTab === 'analysis' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* SEARCH & LIST */}
          <div className="lg:col-span-1 bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col h-[700px]">
            <h3 className="text-lg font-black mb-6">جستجوی دانشجویان</h3>
            <div className="relative mb-6">
              <input 
                className="w-full px-6 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:border-blue-400 outline-none text-xs font-bold"
                placeholder="نام یا ایمیل..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
              {filteredStudents.map(s => (
                <button 
                  key={s.id}
                  onClick={() => setSelectedStudentId(s.id)}
                  className={`w-full text-right p-4 rounded-2xl border transition-all flex items-center justify-between ${selectedStudentId === s.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-50 hover:bg-slate-50'}`}
                >
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs font-black truncate">{s.fullName}</p>
                    <p className={`text-[9px] font-bold ${selectedStudentId === s.id ? 'text-white/60' : 'text-slate-400'}`}>{s.email}</p>
                  </div>
                  <span className="text-lg">👤</span>
                </button>
              ))}
            </div>
          </div>

          {/* STUDENT DETAILS OR LEADERBOARD */}
          <div className="lg:col-span-2 space-y-8">
            {studentAnalysis ? (
              <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm animate-fade-in space-y-10">
                <header className="flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-4xl shadow-inner">👨‍🎓</div>
                    <div>
                      <h2 className="text-2xl font-black text-slate-800">{studentAnalysis.student.fullName}</h2>
                      <p className="text-[10px] text-blue-600 font-black uppercase tracking-widest">{studentAnalysis.student.mainDiscipline || 'نامشخص'}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedStudentId(null)} className="rounded-xl border-slate-200">بازگشت به رتبه‌بندی</Button>
                </header>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <AnalysisMetric label="میانگین سرعت" value={studentAnalysis.stats.avgWpm} suffix="WPM" />
                  <AnalysisMetric label="تعداد خطاها" value={studentAnalysis.stats.totalMistakes} suffix="خطا" color="rose" />
                  <AnalysisMetric label="تعداد تکرار دروس" value={studentAnalysis.stats.totalRetakes} suffix="بار" color="amber" />
                  <AnalysisMetric label="کل زمان صرف شده" value={studentAnalysis.stats.totalTime} suffix="دقیقه" color="blue" />
                </div>

                <div className="space-y-6">
                  <h3 className="text-base font-black text-slate-800 border-b pb-4">میزان پیشرفت در دپارتمان‌ها</h3>
                  <div className="space-y-4">
                    {Object.entries(DISCIPLINE_METADATA).map(([key, meta]) => {
                      const mastery = studentAnalysis.student.lessonMastery[key] || {};
                      const masteredCount = Object.keys(mastery).length;
                      if (masteredCount === 0) return null;
                      return (
                        <div key={key} className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4">
                          <span className="text-2xl">{meta.icon}</span>
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <p className="text-[11px] font-black text-slate-700">{meta.label}</p>
                              <p className="text-[10px] font-black text-blue-600">{masteredCount} درس فتح شده</p>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, masteredCount * 10)}%` }}></div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-fade-in">
                {/* LEADERBOARD CARD */}
                <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                    <span className="text-2xl">🏆</span> لیست نخبگان آکادمی
                  </h3>
                  <div className="space-y-4">
                    {leaderboard.map((s, idx) => (
                      <div key={s.id} className="p-5 bg-slate-50 rounded-[2.5rem] flex items-center justify-between hover:bg-white hover:shadow-xl hover:scale-[1.02] transition-all group border border-transparent hover:border-blue-100">
                        <div className="flex items-center gap-6">
                          <LeaderboardMedal rank={idx + 1} />
                          <div>
                            <p className="text-sm font-black text-slate-800">{s.fullName}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase">{s.mainDiscipline || 'GENERALIST'}</p>
                          </div>
                        </div>
                        <div className="flex gap-10">
                          <div className="text-center">
                            <p className="text-[8px] font-black text-slate-300 uppercase mb-1">ACCURACY</p>
                            <p className="text-xs font-black text-emerald-600">{Math.round(s.avgScore)}%</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[8px] font-black text-slate-300 uppercase mb-1">EFFICIENCY</p>
                            <p className="text-xs font-black text-blue-600">{Math.round(s.rankScore)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-600 p-10 rounded-[3.5rem] text-white shadow-2xl shadow-blue-200 flex items-center justify-between">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black italic tracking-tighter">"تحول یعنی تبدیل داده به دانایی"</h3>
                    <p className="text-xs font-bold opacity-80">مدیریت هوشمند آکادمی دانش‌یار</p>
                  </div>
                  <div className="text-6xl opacity-20">📊</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'approvals' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ApprovalSection title="👤 احراز هویت جدید" count={pendingUsers.length}>
            {pendingUsers.map(user => (
              <div key={user.id} className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between border-r-4 border-blue-500 shadow-sm">
                <div className="text-right">
                  <p className="font-black text-slate-800 text-sm">{user.fullName}</p>
                  <p className="text-[10px] text-blue-600 font-bold">{user.role} • {user.mainDiscipline ? DISCIPLINE_METADATA[user.mainDiscipline].label : 'مدیریت کل'}</p>
                </div>
                <Button onClick={() => setSelectedUserForApproval(user)} size="sm" variant="outline" className="rounded-xl h-9 text-[10px]">بررسی مدارک</Button>
              </div>
            ))}
          </ApprovalSection>

          <ApprovalSection title="✍️ بازبینی و انتشار دروس" count={pendingLessons.length}>
            {pendingLessons.map(lesson => (
              <div key={lesson.id} className={`p-4 rounded-2xl flex flex-col gap-4 border-r-4 ${lesson.status === 'PENDING_DELETION' ? 'border-rose-500 bg-rose-50' : 'border-amber-400 bg-slate-50'} shadow-sm`}>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <p className="font-black text-slate-800 text-sm">{lesson.title}</p>
                    <p className="text-[10px] text-slate-500 font-bold">رشته: {DISCIPLINE_METADATA[lesson.discipline]?.label}</p>
                    <p className="text-[9px] text-blue-600 font-black mt-1">توسط استاد: {lesson.teacher_name || 'نامشخص'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleAuditRequest(lesson)} className="p-2 bg-blue-100 text-blue-600 rounded-xl text-[10px] font-black hover:bg-blue-200">🔍 بازرسی</button>
                    {lesson.status === 'PENDING_DELETION' ? <Button onClick={() => handleConfirmDeletion(lesson)} size="sm" variant="danger" className="rounded-xl h-9 text-[10px]">حذف</Button> : <Button onClick={() => handleApproveLesson(lesson)} size="sm" variant="secondary" className="rounded-xl h-9 text-[10px]">تایید و انتشار</Button>}
                  </div>
                </div>
              </div>
            ))}
          </ApprovalSection>
        </div>
      )}

      {activeSubTab === 'library' && (
        <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black">کتابخانه آموزشی آکادمی</h3>
            <div className="flex gap-4">
              <select value={libraryDiscipline} onChange={(e) => setLibraryDiscipline(e.target.value as DisciplineType)} className="px-6 py-3 rounded-2xl bg-slate-50 border-2 border-slate-100 font-black text-xs outline-none focus:border-blue-400">
                {Object.entries(DISCIPLINE_METADATA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <Button onClick={() => setEditingLesson({} as any)} variant="primary" size="sm" className="rounded-2xl">➕ درس جدید</Button>
            </div>
          </div>
          <table className="w-full text-right">
            <thead><tr className="border-b-2 border-slate-50 text-[10px] text-slate-400 uppercase font-black"><th className="py-4 px-4">#</th><th className="py-4 px-4">عنوان درس</th><th className="py-4">نویسنده</th><th className="py-4">وضعیت</th><th className="py-4 text-center">عملیات</th></tr></thead>
            <tbody>
              {libraryLessons.map(lesson => (
                <tr key={lesson.id} className="border-b border-slate-50 hover:bg-slate-50 transition-all">
                  <td className="py-4 px-4 font-black text-slate-400 text-xs">{lesson.order_index}</td>
                  <td className="py-4 px-4 font-black text-slate-700 text-xs">{lesson.title}</td>
                  <td className="py-4 text-[10px] font-bold text-blue-500">{lesson.teacher_name || 'مدیر کل'}</td>
                  <td className="py-4"><span className={`text-[9px] font-black px-3 py-1.5 rounded-xl ${lesson.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{lesson.status}</span></td>
                  <td className="py-4 flex gap-2 justify-center">
                    <button onClick={() => setEditingLesson(lesson)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">✏️</button>
                    <button onClick={() => {if(confirm("محتوا به طور کامل حذف شود؟")) handleConfirmDeletion(lesson);}} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {libraryLessons.length === 0 && <div className="py-20 text-center text-slate-300 font-black">هنوز درسی در این رشته ثبت نشده است.</div>}
        </div>
      )}

      {selectedUserForApproval && (
        <div className="fixed inset-0 z-[150] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6 text-right font-['Vazirmatn']">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl animate-scale-up">
            <h2 className="text-2xl font-black mb-8 border-b pb-4">پرونده تایید هویت</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              <div className="space-y-4">
                <DetailRow label="نام کامل" value={selectedUserForApproval.fullName} />
                <DetailRow label="نقش درخواستی" value={selectedUserForApproval.role} />
                <DetailRow label="رشته تخصصی" value={selectedUserForApproval.mainDiscipline ? DISCIPLINE_METADATA[selectedUserForApproval.mainDiscipline].label : 'ناظر کل'} />
                <DetailRow label="تاریخ ثبت‌نام" value={new Date(selectedUserForApproval.registrationDate).toLocaleDateString('fa-IR')} />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400">تصویر مدرک ارسالی</p>
                <div className="aspect-video bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden">
                  {selectedUserForApproval.documentUrl ? <img src={selectedUserForApproval.documentUrl} alt="Doc" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300">بدون مدرک</div>}
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <Button onClick={() => setSelectedUserForApproval(null)} variant="outline" className="flex-1 h-14 rounded-2xl">انصراف</Button>
              <Button onClick={() => handleApproveUser(selectedUserForApproval)} variant="secondary" className="flex-2 h-14 rounded-2xl bg-emerald-600">تایید نهایی و فعال‌سازی ✅</Button>
            </div>
          </div>
        </div>
      )}

      {auditingLesson && (
        <div className="fixed inset-0 z-[150] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6 text-right">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] p-10 md:p-14 relative shadow-2xl border-t-[12px] border-blue-600 animate-scale-up">
            <h2 className="text-2xl font-black mb-10 text-center">🧐 گزارش بازرسی علمی</h2>
            <div className="bg-slate-900 p-8 rounded-3xl min-h-[300px] mb-8 overflow-y-auto max-h-[400px]">
              {loadingAudit ? <div className="text-blue-400 text-center font-black animate-pulse">در حال تحلیل توسط هوش مصنوعی بازرس...</div> : <div className="text-white text-xs font-bold leading-relaxed whitespace-pre-wrap">{auditReport}</div>}
            </div>
            <div className="flex gap-4">
              <Button onClick={() => setAuditingLesson(null)} variant="outline" className="flex-1 h-14 rounded-2xl">بستن گزارش</Button>
              {!loadingAudit && <Button onClick={() => { handleApproveLesson(auditingLesson); setAuditingLesson(null); }} variant="secondary" className="flex-2 h-14 rounded-2xl bg-blue-600 text-white">تایید و انتشار درس</Button>}
            </div>
          </div>
        </div>
      )}

      {editingLesson && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 overflow-y-auto">
          <div className="w-full max-w-5xl animate-scale-up">
            <button onClick={() => setEditingLesson(null)} className="mb-4 bg-white px-6 py-3 rounded-2xl font-black text-rose-500 shadow-lg">✕ لغو ویرایش</button>
            <LessonEditor user={currentUser} editLesson={editingLesson.id ? editingLesson : null} onSave={() => { setEditingLesson(null); fetchData(); fetchLibrary(); }} />
          </div>
        </div>
      )}
    </div>
  );
};

const DetailRow: React.FC<any> = ({ label, value }) => (
  <div className="border-b border-slate-50 pb-2">
    <p className="text-[9px] text-slate-400 font-black mb-1 uppercase tracking-widest">{label}</p>
    <p className="text-xs font-black text-slate-800">{value}</p>
  </div>
);

const TabButton: React.FC<any> = ({ active, onClick, label, count }) => (
  <button onClick={onClick} className={`px-6 py-3 rounded-[1.5rem] font-black text-[11px] flex items-center transition-all ${active ? 'bg-blue-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:bg-slate-50'}`}>
    {label} {count !== undefined && count > 0 && <span className="mr-3 bg-rose-500 text-white w-5 h-5 flex items-center justify-center rounded-full text-[9px] shadow-sm">{count}</span>}
  </button>
);

const ApprovalSection: React.FC<any> = ({ title, count, children }) => (
  <section className="bg-white p-8 rounded-[3rem] border border-slate-100 min-h-[400px] shadow-sm">
    <h3 className="text-base font-black mb-8 text-slate-800 flex justify-between">
      {title}
      {count > 0 && <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-xl text-[10px]">{count} مورد جدید</span>}
    </h3>
    <div className="space-y-4">{count === 0 ? <p className="text-center py-20 text-slate-300 font-black">همه درخواست‌ها رسیدگی شده‌اند ✨</p> : children}</div>
  </section>
);

const StatCard: React.FC<any> = ({ label, value, suffix, color }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
    <p className="text-slate-400 text-[9px] font-black uppercase mb-1 tracking-widest">{label}</p>
    <h4 className={`text-3xl font-black ${color === 'blue' ? 'text-blue-600' : color === 'rose' ? 'text-rose-500' : color === 'amber' ? 'text-amber-500' : 'text-slate-800'}`}>{value} <span className="text-xs opacity-50">{suffix}</span></h4>
  </div>
);

const AnalysisMetric: React.FC<any> = ({ label, value, suffix, color = 'slate' }) => (
  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
    <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">{label}</p>
    <div className={`text-2xl font-black ${color === 'rose' ? 'text-rose-500' : color === 'amber' ? 'text-amber-500' : color === 'blue' ? 'text-blue-600' : 'text-slate-800'}`}>
      {value}<span className="text-[10px] opacity-40 ml-1 font-bold">{suffix}</span>
    </div>
  </div>
);

export default ManagementDashboard;