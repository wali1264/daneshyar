export enum UserRole {
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
  ADMIN = 'ADMIN'
}

export enum DisciplineType {
  PROGRAMMING = 'PROGRAMMING',
  CYBER_SECURITY = 'CYBER_SECURITY',
  AI = 'AI',
  WEB_DEV = 'WEB_DEV',
  MOBILE_DEV = 'MOBILE_DEV',
  DEVOPS = 'DEVOPS',
  NETWORKING = 'NETWORKING',
  DATABASE = 'DATABASE',
  UI_UX = 'UI_UX',
  GAME_DEV = 'GAME_DEV'
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  fatherName?: string;
  role: UserRole;
  isActive: boolean;
  mainDiscipline?: DisciplineType;
  activeDisciplines: DisciplineType[];
  phoneContact?: string;
  phoneWhatsapp?: string;
  documentUrl?: string;
  trackProgress: Record<string, string>;
  lessonMastery: Record<string, Record<string, number>>; // Stores { discipline: { lesson_id: best_score } }
  registrationDate: string;
  lastAccessedDate?: string;
  lessonsCompletedToday: number;
  totalMasteredLessons: number;
  masteryBadges: any[];
}

export interface LearningLog {
  id: string;
  user_id: string;
  lesson_id: string;
  discipline: DisciplineType;
  wpm: number;
  accuracy: number;
  mistakes: number;
  score: number;
  duration_seconds: number;
  created_at: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  isRead: boolean;
}

export interface Lesson {
  id: string;
  discipline: DisciplineType;
  order_index: number;
  title: string;
  content: string;
  explanation: string;
  status: 'PUBLISHED' | 'PENDING' | 'PENDING_DELETION' | 'REJECTED';
  teacher_id?: string;
  teacher_name?: string;
  video_url?: string;
}