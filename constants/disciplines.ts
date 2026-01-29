
import { DisciplineType } from '../types';

export interface DisciplineInfo {
  label: string;
  icon: string;
  identity: string;
  complementary: DisciplineType[];
  why: string;
}

export const DISCIPLINE_METADATA: Record<DisciplineType, DisciplineInfo> = {
  [DisciplineType.PROGRAMMING]: {
    label: 'برنامه‌نویسی و توسعه نرم‌افزار',
    icon: '💻',
    identity: 'من برنامه‌نویسم',
    complementary: [DisciplineType.DATABASE, DisciplineType.WEB_DEV],
    why: 'بدون دیتابیس، برنامه‌نویس ناقص است. وب کاربرد واقعی کد شماست.'
  },
  [DisciplineType.CYBER_SECURITY]: {
    label: 'امنیت سایبری و هک اخلاقی',
    icon: '🛡️',
    identity: 'من امنیت کارم',
    complementary: [DisciplineType.NETWORKING, DisciplineType.PROGRAMMING],
    why: 'امنیت بدون شبکه بی‌معنی است و هکر بدون کدنویسی، فقط یک نیمی از مسیر را می‌شناسد.'
  },
  [DisciplineType.AI]: {
    label: 'هوش مصنوعی و علم داده',
    icon: '🤖',
    identity: 'من با داده و هوش کار می‌کنم',
    complementary: [DisciplineType.PROGRAMMING, DisciplineType.DATABASE],
    why: 'هوش مصنوعی بدون کدنویسی وجود ندارد و داده‌ها بدون دیتابیس بی‌فایده هستند.'
  },
  [DisciplineType.WEB_DEV]: {
    label: 'توسعه وب',
    icon: '🌐',
    identity: 'من وب‌دولوپرم',
    complementary: [DisciplineType.PROGRAMMING, DisciplineType.UI_UX],
    why: 'وب یعنی ترکیب کد و تجربه کاربر. طراحی ضعیف باعث شکست پروژه‌های فنی می‌شود.'
  },
  [DisciplineType.MOBILE_DEV]: {
    label: 'توسعه اپلیکیشن موبایل',
    icon: '📱',
    identity: 'من اپ موبایل می‌سازم',
    complementary: [DisciplineType.PROGRAMMING, DisciplineType.DATABASE],
    why: 'اپ موبایل بدون منطق برنامه‌نویسی و دیتابیس برای مدیریت اطلاعات، کامل نخواهد بود.'
  },
  [DisciplineType.DEVOPS]: {
    label: 'دواپس و رایانش ابری',
    icon: '🚀',
    identity: 'من زیرساخت و استقرار بلدم',
    complementary: [DisciplineType.NETWORKING, DisciplineType.PROGRAMMING],
    why: 'دواپس بدون شبکه یک فاجعه است و بدون اسکریپت‌نویسی، اتوماسیونی در کار نخواهد بود.'
  },
  [DisciplineType.NETWORKING]: {
    label: 'شبکه‌های کامپیوتری',
    icon: '🔌',
    identity: 'من شبکه‌کارم',
    complementary: [DisciplineType.CYBER_SECURITY, DisciplineType.DEVOPS],
    why: 'ترکیب شبکه و امنیت بازار کار بسیار قوی ایجاد می‌کند. شبکه بدون اتوماسیون در حال انقراض است.'
  },
  [DisciplineType.DATABASE]: {
    label: 'پایگاه داده و مدیریت داده',
    icon: '📊',
    identity: 'من دیتابیس کار می‌کنم',
    complementary: [DisciplineType.PROGRAMMING, DisciplineType.AI],
    why: 'دیتابیس بدون مصرف‌کننده (کد) بی‌معنی است و مسیر رشد طبیعی آن به سمت تحلیل داده است.'
  },
  [DisciplineType.UI_UX]: {
    label: 'طراحی رابط و تجربه کاربری (UI/UX)',
    icon: '🎨',
    identity: 'من طراح تجربه کاربرم',
    complementary: [DisciplineType.WEB_DEV, DisciplineType.PROGRAMMING],
    why: 'طراح بدون فهم کد محدود است. قدرت واقعی UI زمانی است که با وب گره بخورد.'
  },
  [DisciplineType.GAME_DEV]: {
    label: 'بازی‌سازی و رسانه‌های تعاملی',
    icon: '🎮',
    identity: 'من بازی‌سازم',
    complementary: [DisciplineType.PROGRAMMING, DisciplineType.UI_UX],
    why: 'بازی یعنی ترکیب کد و تعامل. بدون منطق برنامه‌نویسی، بازی فقط یک تصویر ثابت است.'
  }
};
