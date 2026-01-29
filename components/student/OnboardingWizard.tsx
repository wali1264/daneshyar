
import React, { useState } from 'react';
import { UserProfile, DisciplineType } from '../../types';
import { DISCIPLINE_METADATA } from '../../constants/disciplines';
import { supabase } from '../../services/supabase';
import Button from '../ui/Button';

interface OnboardingWizardProps {
  user: UserProfile;
  onComplete: () => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ user, onComplete }) => {
  const [loading, setLoading] = useState(false);
  
  const mainDiscipline = user.mainDiscipline || DisciplineType.PROGRAMMING;
  const meta = DISCIPLINE_METADATA[mainDiscipline];
  const complements = meta.complementary;

  const handleConfirmPath = async () => {
    setLoading(true);
    try {
      const finalDisciplines = [mainDiscipline, ...complements];
      const { error } = await supabase.from('profiles_students').update({
        active_disciplines: finalDisciplines,
        is_onboarded: true
      }).eq('id', user.id);
      
      if (error) throw error;
      onComplete();
    } catch (e) {
      console.error(e);
      alert("خطا در ثبت مسیر تحصیلی. لطفاً مجدداً تلاش کنید.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 text-right font-['Vazirmatn']">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 animate-slide-in-up">
        <header className="text-center mb-6">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-2xl mx-auto mb-3">🎯</div>
          <h2 className="text-xl font-black text-slate-800">تایید نقشه راه تحصیلی</h2>
        </header>

        <div className="space-y-4">
          <div className="p-4 bg-blue-600 rounded-2xl text-white flex items-center gap-4 shadow-md">
            <span className="text-3xl">{meta.icon}</span>
            <div>
              <p className="text-[10px] font-bold opacity-80">تخصص اصلی</p>
              <h3 className="font-black text-base">{meta.label}</h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {complements.map((compKey) => {
              const compMeta = DISCIPLINE_METADATA[compKey];
              return (
                <div key={compKey} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-2">
                  <span className="text-lg">{compMeta.icon}</span>
                  <span className="text-[9px] font-black text-slate-600 truncate">{compMeta.label}</span>
                </div>
              );
            })}
          </div>

          <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
            <p className="text-[10px] text-amber-800 font-bold leading-relaxed">
              <span className="font-black">استراتژی:</span> {meta.why}
            </p>
          </div>

          <Button 
            onClick={handleConfirmPath} 
            loading={loading} 
            className="w-full h-12 rounded-xl text-sm font-black shadow-lg mt-2"
          >
            شروع یادگیری حرفه‌ای
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
