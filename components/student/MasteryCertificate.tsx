
import React from 'react';
import { UserProfile, DisciplineType } from '../../types';
import { DISCIPLINE_METADATA } from '../../constants/disciplines';
import Button from '../ui/Button';

interface MasteryCertificateProps {
  user: UserProfile;
  onClose: () => void;
}

const MasteryCertificate: React.FC<MasteryCertificateProps> = ({ user, onClose }) => {
  const disciplineLabel = DISCIPLINE_METADATA[user.mainDiscipline || DisciplineType.PROGRAMMING].label;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-xl">
      <div className="bg-white w-full max-w-4xl rounded-[3rem] p-12 shadow-[0_0_100px_rgba(37,99,235,0.3)] relative overflow-hidden text-center border-[12px] border-double border-blue-600/20">
        {/* Certificate Decorative Elements */}
        <div className="absolute top-0 left-0 w-32 h-32 bg-blue-600/5 rounded-br-full"></div>
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-600/5 rounded-tl-full"></div>
        <div className="absolute top-10 right-10 opacity-10 grayscale">
          <span className="text-9xl">💎</span>
        </div>

        <div className="relative z-10 space-y-8">
          <header className="space-y-2">
            <h1 className="text-5xl font-black text-blue-800 tracking-tighter">گواهینامه تسلط دیجیتال</h1>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Digital Mastery Certificate</p>
          </header>

          <div className="h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent w-full"></div>

          <div className="space-y-4">
            <p className="text-xl text-slate-500">بدین‌وسیله تایید می‌شود که دانشجو</p>
            <h2 className="text-6xl font-black text-slate-800">{user.fullName}</h2>
            <p className="text-xl text-slate-500">با پشتکار و تلاش مداوم، به سطح تسلط حرفه‌ای در رشته</p>
            <h3 className="text-3xl font-black text-blue-600 inline-block px-8 py-3 bg-blue-50 rounded-full">
              {disciplineLabel}
            </h3>
            <p className="text-xl text-slate-500">دست یافته است.</p>
          </div>

          <div className="flex justify-between items-end pt-12">
            <div className="text-right">
              <p className="text-xs text-slate-400">تاریخ صدور:</p>
              <p className="font-bold text-slate-700">{new Date().toLocaleDateString('fa-IR')}</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center text-white text-4xl shadow-2xl mb-2">
                🏆
              </div>
              <p className="text-[10px] font-black text-blue-600 uppercase">Mastery Level 1</p>
            </div>
            <div className="text-left">
              <p className="text-xs text-slate-400">شناسه گواهی:</p>
              <p className="font-mono text-xs text-slate-700 font-bold">DY-CERT-{user.id.toUpperCase()}</p>
            </div>
          </div>
        </div>

        <div className="mt-12">
          <Button variant="primary" size="lg" className="rounded-2xl px-12" onClick={onClose}>
            بسیار عالی، سپاسگزارم!
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MasteryCertificate;
