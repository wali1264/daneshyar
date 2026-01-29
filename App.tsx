import React, { useState, useEffect } from 'react';
import { UserRole, UserProfile, DisciplineType, AppNotification, Lesson } from './types';
import { DISCIPLINE_METADATA } from './constants/disciplines';
import { supabase } from './services/supabase';
import AuthModal from './components/auth/AuthModal';
import Button from './components/ui/Button';
import LessonEditor from './components/management/LessonEditor';
import ManagementDashboard from './components/management/ManagementDashboard';
import NotificationToast from './components/ui/NotificationToast';
import StudentWorkspace from './components/student/StudentWorkspace';

export const notify = {
  success: (title: string, message: string) => window.dispatchEvent(new CustomEvent('app-notify', { detail: { type: 'success', title, message } })),
  error: (title: string, message: string) => window.dispatchEvent(new CustomEvent('app-notify', { detail: { type: 'error', title, message } })),
  info: (title: string, message: string) => window.dispatchEvent(new CustomEvent('app-notify', { detail: { type: 'info', title, message } })),
  warning: (title: string, message: string) => window.dispatchEvent(new CustomEvent('app-notify', { detail: { type: 'warning', title, message } })),
};

const ModernAcademyLogo = () => (
  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L4 7L12 12L20 7L12 2Z" fill="white" />
      <path d="M4 17L12 22L20 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 12L12 17L20 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
    </svg>
  </div>
);

const getDisciplineTableName = (discipline: DisciplineType): string => `lessons_${discipline.toLowerCase()}`;

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'lessons' | 'profile' | 'management' | 'analysis'>('lessons');
  const [activeTrack, setActiveTrack] = useState<DisciplineType | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  
  // Management State
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [openDepartment, setOpenDepartment] = useState<DisciplineType | null>(null);
  const [departmentLessons, setDepartmentLessons] = useState<Lesson[]>([]);
  const [loadingDept, setLoadingDept] = useState(false);

  useEffect(() => {
    const handleNotification = (e: any) => {
      const { type, title, message } = e.detail;
      const newNotif: AppNotification = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        title,
        message,
        timestamp: new Date().toISOString(),
        isRead: false
      };
      setNotifications(prev => [newNotif, ...prev]);
    };

    window.addEventListener('app-notify', handleNotification);

    const initialize = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      if (currentSession) {
        await fetchUserProfile(currentSession.user.id);
      } else {
        setLoading(false);
      }
    };
    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        fetchUserProfile(newSession.user.id);
      } else {
        setCurrentUser(null);
        setLoading(false);
        setErrorStatus(null);
      }
    });

    return () => {
      window.removeEventListener('app-notify', handleNotification);
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId: string, silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) throw error;
      if (!data) return;

      const profile: UserProfile = {
        id: data.id,
        email: data.email,
        fullName: data.full_name,
        fatherName: data.father_name,
        role: data.role as UserRole,
        isActive: data.is_active,
        mainDiscipline: data.main_discipline,
        activeDisciplines: data.active_disciplines || [],
        phoneContact: data.phone_contact,
        phoneWhatsapp: data.phone_whatsapp,
        documentUrl: data.document_url,
        trackProgress: data.track_progress || {},
        lessonMastery: data.lesson_mastery || {},
        registrationDate: data.registration_date,
        lessonsCompletedToday: data.lessons_completed_today || 0,
        totalMasteredLessons: data.total_mastered_lessons || 0,
        masteryBadges: data.mastery_badges || []
      };
      setCurrentUser(profile);
      if (!activeTrack) setActiveTrack(profile.mainDiscipline || DisciplineType.PROGRAMMING);
    } catch (err: any) {
      setErrorStatus(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchDeptLessons = async (disc: DisciplineType) => {
    setLoadingDept(true);
    try {
      const { data, error } = await supabase
        .from(getDisciplineTableName(disc))
        .select('*')
        .order('order_index', { ascending: false });
      
      if (error) throw error;
      setDepartmentLessons((data || []).map(l => ({ ...l, discipline: disc })));
    } catch (e) {
      console.error(e);
      notify.error("خطا در فراخوانی", "امکان دریافت لیست دروس وجود ندارد.");
    } finally {
      setLoadingDept(false);
    }
  };

  const handleToggleDept = (disc: DisciplineType) => {
    if (openDepartment === disc) {
      setOpenDepartment(null);
    } else {
      setOpenDepartment(disc);
      fetchDeptLessons(disc);
    }
  };

  const handleDeleteLesson = async (lesson: Lesson) => {
    if (!confirm(`آیا از حذف درس شماره ${lesson.order_index} اطمینان دارید؟`)) return;
    try {
      const { error } = await supabase.from(getDisciplineTableName(lesson.discipline)).delete().eq('id', lesson.id);
      if (error) throw error;
      notify.success("حذف موفق", "درس از پایگاه داده حذف شد.");
      fetchDeptLessons(lesson.discipline);
    } catch (e: any) {
      notify.error("خطا در حذف", e.message);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setSession(null);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center font-['Vazirmatn']">
      <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
      <p className="text-white font-black text-xs animate-pulse">در حال پیکربندی امنیت...</p>
    </div>
  );

  if (!session || (!currentUser && !errorStatus)) return <AuthModal onSuccess={() => {}} />;

  const isManager = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.TEACHER;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-['Vazirmatn'] overflow-hidden">
      <div className="fixed top-8 left-8 z-[100] flex flex-col gap-4">
        {notifications.map(n => (
          <NotificationToast key={n.id} notification={n} onClose={(id) => setNotifications(prev => prev.filter(x => x.id !== id))} />
        ))}
      </div>

      <aside className="w-full md:w-72 bg-white border-l border-slate-200 flex flex-col p-6 space-y-6 z-20 h-screen sticky top-0 shadow-sm overflow-y-auto custom-scrollbar">
        <div className="flex items-center space-x-3 space-x-reverse mb-2 group cursor-pointer">
          <ModernAcademyLogo />
          <div className="text-right">
            <h1 className="text-base font-black text-slate-800">دانش‌یار</h1>
            <p className="text-[8px] text-blue-500 font-bold uppercase tracking-widest leading-none">AI Academy</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          {currentUser?.role === UserRole.STUDENT && (
            <>
              <NavItem active={activeTab === 'lessons'} onClick={() => setActiveTab('lessons')} icon="📖" label="میز مطالعه هوشمند" />
              
              <div className="pt-4 mt-4 border-t border-slate-100">
                <p className="text-[9px] font-black text-slate-400 mb-3 uppercase tracking-widest">تخصص‌های سه‌گانه شما</p>
                <div className="space-y-2">
                  {currentUser.mainDiscipline && (
                    <>
                      <DisciplineMiniCard 
                        discipline={currentUser.mainDiscipline} 
                        isMain={true}
                        active={activeTrack === currentUser.mainDiscipline}
                        onClick={() => { setActiveTrack(currentUser.mainDiscipline!); setActiveTab('lessons'); }}
                        progress={45} 
                      />
                      {DISCIPLINE_METADATA[currentUser.mainDiscipline].complementary.map(disc => (
                        <DisciplineMiniCard 
                          key={disc}
                          discipline={disc} 
                          active={activeTrack === disc}
                          onClick={() => { setActiveTrack(disc); setActiveTab('lessons'); }}
                          progress={15} 
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
          
          <NavItem active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon="👤" label="پرونده کاربری" />
          
          {isManager && (
            <>
              <NavItem active={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')} icon="📊" label="تحلیل پیشرفت دانشجویان" />
              <NavItem active={activeTab === 'management'} onClick={() => { setActiveTab('management'); setEditingLesson(null); }} icon="✍️" label="تدوین درس جدید" />
              
              <div className="pt-6 mt-4 border-t border-slate-100">
                <p className="text-[9px] font-black text-slate-400 mb-4 uppercase tracking-widest">بایگانی دپارتمان‌ها</p>
                <div className="space-y-2">
                  {Object.entries(DISCIPLINE_METADATA).map(([key, meta]) => (
                    <div key={key} className="space-y-1">
                      <button 
                        onClick={() => handleToggleDept(key as DisciplineType)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${openDepartment === key ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{meta.icon}</span>
                          <span className="text-[9px] font-black truncate max-w-[120px]">{meta.label}</span>
                        </div>
                        <span className={`text-[8px] transition-transform ${openDepartment === key ? 'rotate-180' : ''}`}>▼</span>
                      </button>
                      
                      {openDepartment === key && (
                        <div className="pr-2 space-y-1 mt-2 animate-slide-in-up">
                          {loadingDept ? (
                            <div className="py-4 text-center text-[8px] font-black text-slate-400 animate-pulse">در حال فراخوانی...</div>
                          ) : departmentLessons.length === 0 ? (
                            <div className="py-4 text-center text-[8px] font-black text-slate-300 italic">بدون محتوا</div>
                          ) : (
                            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1">
                              {departmentLessons.map((l, idx) => (
                                <div key={l.id} className="group p-2 bg-white border border-slate-100 rounded-lg flex items-center justify-between hover:border-blue-200 transition-all shadow-sm">
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="text-[8px] font-black text-blue-600 bg-blue-50 w-5 h-5 flex items-center justify-center rounded-md">{l.order_index}</span>
                                    <span className="text-[8px] font-bold text-slate-700 truncate max-w-[100px]">{l.title}</span>
                                  </div>
                                  <div className="flex gap-1">
                                    <button 
                                      onClick={() => { setEditingLesson(l); setActiveTab('management'); }}
                                      className="p-1.5 hover:bg-blue-50 text-blue-500 rounded-md transition-colors"
                                      title="ویرایش"
                                    >
                                      <span className="text-[10px]">✏️</span>
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteLesson(l)}
                                      disabled={idx !== 0} // Only last one (index 0 in reverse) is deletable
                                      className={`p-1.5 rounded-md transition-colors ${idx === 0 ? 'text-rose-500 hover:bg-rose-50' : 'text-slate-200 cursor-not-allowed'}`}
                                      title={idx === 0 ? "حذف آخرین درس" : "فقط آخرین درس قابل حذف است"}
                                    >
                                      <span className="text-[10px]">🗑️</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </nav>

        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl mb-3 border border-slate-100">
             <div className="w-8 h-8 bg-white shadow-sm rounded-lg flex items-center justify-center text-sm">👤</div>
             <div className="overflow-hidden">
               <p className="text-[10px] font-black text-slate-800 truncate">{currentUser?.fullName}</p>
               <p className="text-[7px] text-blue-600 font-black uppercase">{currentUser?.role}</p>
             </div>
          </div>
          <button onClick={logout} className="w-full text-rose-500 font-black text-[9px] py-2 rounded-lg hover:bg-rose-50 transition-colors">خروج از حساب</button>
        </div>
      </aside>

      <main className="flex-1 h-screen overflow-hidden bg-slate-50/50">
        {currentUser?.role === UserRole.STUDENT && activeTab === 'lessons' && activeTrack ? (
          <StudentWorkspace user={currentUser} activeTrack={activeTrack} onProgressUpdate={(silent) => fetchUserProfile(currentUser.id, silent)} />
        ) : (
          <div className="w-full h-full overflow-y-auto">
            {activeTab === 'profile' && currentUser && (
              <div className="max-w-4xl mx-auto p-10">
                <div className="bg-white p-12 rounded-[3rem] shadow-sm border border-slate-100 text-center space-y-8">
                  <div className="w-32 h-32 bg-slate-50 rounded-full mx-auto flex items-center justify-center text-5xl border-4 border-white shadow-xl">👤</div>
                  <div className="space-y-1">
                    <h2 className="text-3xl font-black text-slate-800 tracking-tight">{currentUser.fullName}</h2>
                    <p className="text-blue-600 font-black text-xs uppercase tracking-[0.2em]">{currentUser.role} OF ACADEMY</p>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'management' && isManager && (
              <div className="p-10">
                <LessonEditor 
                  user={currentUser!} 
                  editLesson={editingLesson} 
                  onSave={() => {
                    setEditingLesson(null);
                    if (openDepartment) fetchDeptLessons(openDepartment);
                  }} 
                />
              </div>
            )}
            {activeTab === 'analysis' && isManager && (
              <div className="p-10">
                <ManagementDashboard currentUser={currentUser!} initialTab="analysis" />
              </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.1); }
      `}</style>
    </div>
  );
};

const NavItem: React.FC<{ label: string; icon: string; active?: boolean; onClick: () => void }> = ({ label, icon, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center p-3 rounded-xl font-black transition-all ${active ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
    <span className="text-lg ml-3">{icon}</span>
    <span className="text-[10px]">{label}</span>
  </button>
);

const DisciplineMiniCard: React.FC<{ discipline: DisciplineType; isMain?: boolean; active: boolean; onClick: () => void; progress: number }> = ({ discipline, isMain, active, onClick, progress }) => {
  const meta = DISCIPLINE_METADATA[discipline];
  return (
    <button onClick={onClick} className={`w-full group p-3 rounded-xl border transition-all text-right ${active ? 'bg-blue-600 border-blue-600 shadow-md text-white' : 'bg-white border-slate-100 hover:bg-blue-50'}`}>
      <div className="flex items-center gap-3">
        <span className={`text-xl ${active ? 'grayscale-0' : 'grayscale group-hover:grayscale-0'} transition-all`}>{meta.icon}</span>
        <div className="flex-1 overflow-hidden">
          <p className={`text-[9px] font-black truncate ${active ? 'text-white' : isMain ? 'text-blue-700' : 'text-slate-700'}`}>{meta.label}</p>
          <div className={`w-full h-1 rounded-full mt-1 overflow-hidden ${active ? 'bg-white/20' : 'bg-slate-100'}`}>
            <div className={`h-full rounded-full transition-all duration-1000 ${active ? 'bg-white' : isMain ? 'bg-blue-600' : 'bg-slate-400'}`} style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      </div>
    </button>
  );
};

export default App;