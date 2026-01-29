import React, { useState, useRef } from 'react';
import { UserRole, DisciplineType } from '../../types';
import { DISCIPLINE_METADATA } from '../../constants/disciplines';
import { supabase } from '../../services/supabase';
import Button from '../ui/Button';

interface AuthModalProps {
  onSuccess: () => void;
}

const ModernAcademyLogo = () => (
  <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-2xl mx-auto mb-6 transform rotate-3">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L4 7L12 12L20 7L12 2Z" fill="white" />
      <path d="M4 17L12 22L20 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 12L12 17L20 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
    </svg>
  </div>
);

const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const [activeRole, setActiveRole] = useState<UserRole>(UserRole.STUDENT);
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    fatherName: '',
    phoneContact: '',
    phoneWhatsapp: '',
    mainDiscipline: DisciplineType.PROGRAMMING,
  });

  const [idFile, setIdFile] = useState<File | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAuth = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (isLogin) {
        // Step 1: Sign in with password
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;

        // Step 2: Immediate verification of role before proceeding
        setVerifying(true);
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profile) {
          await supabase.auth.signOut();
          throw new Error('پروفایل کاربری یافت نشد. لطفاً با مدیریت تماس بگیرید.');
        }

        // Role Mismatch Protection
        if (profile.role !== activeRole) {
          const roleLabels: Record<string, string> = {
            [UserRole.STUDENT]: 'دانشجو',
            [UserRole.TEACHER]: 'استاد',
            [UserRole.ADMIN]: 'مدیر'
          };
          await supabase.auth.signOut();
          throw new Error(`شما قبلاً با ایمیل "${formData.email}" به عنوان "${roleLabels[profile.role]}" ثبت‌نام کرده‌اید. لطفاً نقش صحیح را انتخاب کرده و دوباره تلاش کنید.`);
        }

        // Success - only now we call onSuccess
        onSuccess();
      } else {
        if (!formData.fullName || !formData.email || !formData.password) throw new Error('تکمیل فیلدهای ستاره‌دار الزامی است.');
        
        if (activeRole === UserRole.STUDENT && !formData.mainDiscipline) throw new Error('انتخاب رشته برای دانشجویان الزامی است.');
        
        if (activeRole !== UserRole.ADMIN && !idFile) throw new Error('ارسال مدرک شناسایی جهت تایید هویت الزامی است.');

        const { data: existing } = await supabase.from('profiles').select('id').eq('email', formData.email).maybeSingle();
        if (existing) throw new Error('این ایمیل قبلاً در سامانه ثبت شده است.');

        let documentUrl = '';
        if (idFile) {
          const filePath = `identities/${Date.now()}_${idFile.name}`;
          const { error: uploadError } = await supabase.storage.from('identity_documents').upload(filePath, idFile);
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from('identity_documents').getPublicUrl(filePath);
          documentUrl = publicUrl;
        }

        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password
        });
        if (signUpError) throw signUpError;
        if (!authData.user) throw new Error('خطا در ایجاد حساب کاربری.');

        const { error: profileError } = await supabase.from('profiles').insert([{
          id: authData.user.id,
          email: formData.email,
          full_name: formData.fullName,
          father_name: formData.fatherName,
          role: activeRole,
          main_discipline: activeRole === UserRole.STUDENT ? formData.mainDiscipline : null,
          phone_contact: formData.phoneContact,
          phone_whatsapp: formData.phoneWhatsapp,
          document_url: documentUrl,
          is_active: false 
        }]);

        if (profileError) {
          await supabase.auth.signOut();
          throw profileError;
        }

        setRegSuccess(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطایی در فرآیند احراز هویت رخ داد');
      setVerifying(false);
    } finally {
      setLoading(false);
    }
  };

  if (regSuccess) return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-4 z-50 font-['Vazirmatn'] text-right">
      <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl p-12 text-center border border-white/20 animate-scale-up">
        <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center text-5xl mx-auto mb-8 animate-bounce">✅</div>
        <h2 className="text-3xl font-black text-slate-800 mb-6">ثبت‌نام موفقیت‌آمیز!</h2>
        <div className="bg-emerald-50 p-6 rounded-3xl mb-10 border border-emerald-100">
          <p className="text-emerald-700 text-sm font-bold leading-loose">
            حساب کاربری شما با موفقیت ایجاد شد. لطفاً صندوق ورودی ایمیل خود را بررسی کرده و روی لینک تایید کلیک کنید.
          </p>
        </div>
        <Button onClick={() => { setRegSuccess(false); setIsLogin(true); }} variant="primary" className="w-full h-14 rounded-2xl shadow-xl">بازگشت به صفحه ورود</Button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-4 z-50 overflow-y-auto font-['Vazirmatn'] text-right">
      <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl p-10 md:p-14 border border-white/20 my-8 relative overflow-hidden">
        
        {/* Verifying Overlay */}
        {verifying && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-md z-[60] flex flex-col items-center justify-center animate-fade-in">
             <div className="w-20 h-20 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
             <p className="text-slate-800 font-black text-xl mb-2">در حال تایید هویت علمی...</p>
             <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Security Clearance Check</p>
          </div>
        )}

        <div className="text-center mb-12">
          <ModernAcademyLogo />
          <h2 className="text-4xl font-black text-slate-800">آکادمی دانش‌یار</h2>
          <p className="text-slate-500 mt-2 font-bold text-sm">سامانه هوشمند و یکپارچه مدیریت یادگیری</p>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 text-rose-600 p-5 rounded-2xl mb-8 text-sm font-bold border border-rose-200 animate-[shake_0.5s_ease-in-out]">
            <span className="ml-2">⚠️</span> {errorMsg}
          </div>
        )}

        <div className="flex p-1 bg-slate-100 rounded-[1.5rem] mb-10 shadow-inner">
          {[UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN].map(r => (
            <button key={r} onClick={() => { setActiveRole(r); setErrorMsg(''); }} className={`flex-1 py-4 rounded-[1.2rem] font-black text-xs transition-all duration-300 ${activeRole === r ? 'bg-white text-blue-600 shadow-xl scale-105' : 'text-slate-500 hover:bg-slate-50'}`}>
              {r === UserRole.STUDENT ? 'دانشجو' : r === UserRole.TEACHER ? 'استاد' : 'مدیر'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormInput label="ایمیل *" name="email" value={formData.email} onChange={handleInputChange} placeholder="example@mail.com" />
          <FormInput label="رمز عبور *" name="password" type="password" value={formData.password} onChange={handleInputChange} placeholder="••••••••" />
          
          {!isLogin && (
            <>
              <FormInput label="نام و نام خانوادگی *" name="fullName" value={formData.fullName} onChange={handleInputChange} />
              <FormInput label="نام پدر" name="fatherName" value={formData.fatherName} onChange={handleInputChange} />
              <FormInput label="شماره تماس *" name="phoneContact" value={formData.phoneContact} onChange={handleInputChange} />
              
              {activeRole === UserRole.STUDENT && (
                <div className="space-y-1 animate-fade-in">
                  <label className="block text-sm font-bold text-slate-700">انتخاب رشته تخصصی *</label>
                  <select name="mainDiscipline" value={formData.mainDiscipline} onChange={handleInputChange} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none font-bold focus:border-blue-500 transition-colors">
                    {Object.entries(DISCIPLINE_METADATA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              )}

              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  {activeRole === UserRole.TEACHER ? 'بارگذاری رزومه یا مدرک شناسایی *' : activeRole === UserRole.ADMIN ? 'مدرک شناسایی (اختیاری)' : 'تصویر کارت ملی یا شناسنامه *'}
                </label>
                <div onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-8 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 transition-all cursor-pointer text-center group">
                  <span className="text-slate-400 group-hover:text-blue-600 font-bold block transition-colors">
                    {idFile ? `✅ ${idFile.name}` : '📁 جهت انتخاب فایل کلیک کنید'}
                  </span>
                  <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && setIdFile(e.target.files[0])} className="hidden" accept="image/*,.pdf" />
                </div>
              </div>
            </>
          )}
        </div>

        <Button className="w-full mt-12 h-16 rounded-[2rem] text-lg shadow-2xl hover:scale-[1.02]" onClick={handleAuth} loading={loading}>
          {isLogin ? `ورود به پنل ${activeRole === UserRole.STUDENT ? 'دانشجویی' : activeRole === UserRole.TEACHER ? 'اساتید' : 'مدیریت'}` : 'ثبت درخواست عضویت در آکادمی'}
        </Button>

        <p className="text-center text-slate-500 mt-8 font-bold text-sm">
          {isLogin ? 'هنوز عضو آکادمی نشده‌اید؟ ' : 'قبلاً حساب کاربری داشته‌اید؟ '}
          <button onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); }} className="text-blue-600 font-black hover:underline underline-offset-4">{isLogin ? 'ثبت‌نام جدید' : 'ورود به حساب'}</button>
        </p>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
};

const FormInput: React.FC<any> = ({ label, type = 'text', ...props }) => (
  <div className="space-y-1">
    <label className="block text-sm font-bold text-slate-700">{label}</label>
    <input type={type} {...props} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-blue-500 outline-none font-medium transition-all" />
  </div>
);

export default AuthModal;