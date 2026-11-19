export type UserRole = 'admin' | 'teacher' | 'student';

export type ActiveModule = 
  | 'dashboard'
  | 'lesson_5e'
  | 'exam_management'
  | 'assignment'
  | 'hoc_ba_so'
  | 'question_bank'
  | 'digital_resource_portal'
  | 'interactive_games'
  | 'user_management';

export type ModuleType = ActiveModule;

export type SharePermissionLevel = 'view' | 'edit' | 'full' | string;

export type CognitiveLevelKey = 'nhan_biet' | 'thong_hieu' | 'van_dung' | 'van_dung_cao';
export type CognitiveLevel =
  | CognitiveLevelKey
  | '1. Nhận biết'
  | '2. Thông hiểu'
  | '3. Vận dụng'
  | '4. Vận dụng cao'
  | 'Nhận biết'
  | 'Thông hiểu'
  | 'Vận dụng'
  | 'Vận dụng cao'
  | string;

export type Subject = 'Công nghệ' | 'Tin học' | 'Toán học' | 'Toán' | 'Tiếng Việt' | 'Khoa học tự nhiên' | 'Khoa học' | 'Lịch sử & Địa lý' | 'Tiếng Anh' | string;
export type Grade = 'Khối 4' | string;

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  grade?: string;
  className?: string;
  avatarUrl?: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  classGroup?: string;
  gradeClass?: string;
  subject?: string;
  status: 'active' | 'inactive';
  joinedDate?: string;
}

export interface LessonPlan {
  id: string;
  title: string;
  subject: string;
  grade: string;
  durationMinutes: number;
  warmup: string;       // Bước 1: Khởi động
  exploration: string;  // Bước 2: Khám phá
  practice: string;     // Bước 3: Luyện tập
  application: string;  // Bước 4: Vận dụng
  createdBy: string;
  authorName?: string;
  createdAt: string;
}

export interface Lesson5EStep {
  title: string;
  subtitle: string;
  objectives: string;
  teacherActivities: string;
  studentActivities: string;
  materials: string;
}

export interface FeedbackBlockConfig {
  id: string;
  levelTitle: string;
  useLaurelWreath: boolean;
  laurelWreathUrl?: string;
  backgroundImageUrl?: string;
  sticker: string;
  praiseTitle: string;
  praiseContent: string;
  teacherName: string;
}

export interface Lesson5EPlan {
  id: string;
  title: string;
  subject: string;
  grade: string;
  duration: string;
  topic: string;
  authorName: string;
  teacherId?: string;
  teacherEmail?: string;
  createdBy?: string;
  isShared?: boolean;
  createdAt: string;
  objectivesContent?: string;
  isObjectivesEnabled?: boolean;
  introContent?: string;
  isIntroEnabled?: boolean;
  stepEngage: Lesson5EStep;
  stepExplore: Lesson5EStep;
  stepElaborate: Lesson5EStep;
  stepEvaluate: Lesson5EStep;
  feedbackConfig?: {
    blocks: FeedbackBlockConfig[];
  };
}

export type QuestionLevel = CognitiveLevel;
export type QuestionType = 'choice' | 'essay' | 'multiple_choice' | 'true_false' | string;

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect?: boolean;
}

export interface Question {
  id: string;
  subject: Subject;
  grade: Grade;
  topic?: string;
  level: QuestionLevel;
  type: QuestionType;
  questionText?: string;
  content?: string;
  options?: any[];
  correctAnswer: string;
  explanation?: string;
  createdBy?: string;
  createdAt?: string;
  code?: string;
  author?: string;
  tags?: string[];
}

export interface TrueFalseStatement {
  statement: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface ClassificationItem {
  name: string;
  group: string;
}

export interface QuestionItem {
  id: string;
  code?: string;
  subject: Subject;
  grade: Grade;
  level: QuestionLevel;
  type: QuestionType;
  content?: string;
  questionText?: string;
  topic?: string;
  lessonName?: string;
  options?: any[];
  order?: number[];
  indices?: number[];
  correctOrder?: string[];
  statements?: TrueFalseStatement[];
  classificationGroups?: string[];
  classificationItems?: ClassificationItem[];
  correctAnswer?: string;
  explanation?: string;
  imageUrl?: string;
  imagePrompt?: string;
  matchingPairs?: { left: string; right: string; match?: string }[];
  authorName?: string;
  authorType?: 'my' | 'colleague' | 'all';
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdBy?: string;
  isShared?: boolean;
  createdAt?: string | number;
}

export interface TestCode {
  code: string;
  questions: Question[];
}

export interface ExamMatrix {
  id: string;
  title: string;
  subject: string;
  grade: string;
  semester: string;
  durationMinutes: number;
  totalQuestions: number;
  breakdown: {
    knowledge: number;
    comprehension: number;
    application: number;
    highApplication: number;
  };
  testCodes: TestCode[];
  createdBy: string;
  createdAt: string;

  nhanBiet?: number;
  thongHieu?: number;
  vanDung?: number;
  vanDungCao?: number;
}

export interface ExamPaper {
  id: string;
  title: string;
  subject: string;
  grade: string;
  durationMinutes: number;
  duration?: number;
  matrix: any;
  questions: any[];
  createdBy: string;
  authorName?: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdAt: string;
  isShuffled?: boolean;
  status?: 'draft' | 'published' | 'completed';
  targetClass?: string;
  targetClasses?: string[];
  examType?: string;
  testType?: string;
  startTime?: string;
  endTime?: string;
  isUnlimited?: boolean;
  submissionsCount?: number;
  totalStudents?: number;
  authorType?: 'my' | 'colleague' | 'all';
  originalExamId?: string;
  assignmentDate?: string;
  submissions?: any[];
  enableRealtimeLeaderboard?: boolean;
  sharedWithTeachers?: string[];
  sharedWithGroups?: string[];
  sharePermission?: SharePermissionLevel;
  allowDeleteByShared?: boolean;
}

export interface HomeworkAssignment {
  id: string;
  title: string;
  subject: string;
  grade?: string;
  className?: string;
  deadline?: string;
  questions?: any[];
  status?: 'active' | 'completed' | string;
  createdBy?: string;
  createdAt?: string;

  targetClass?: string;
  targetClasses?: string[];
  classId?: string;
  teacherName?: string;
  teacherId?: string;
  teacherEmail?: string;
  dueDate?: string;
  isUnlimited?: boolean;
  assignedDate?: string;
  description?: string;
  totalStudents?: number;
  completedCount?: number;
  isApproved?: boolean;
  authorType?: 'my' | 'colleague' | 'all';
  type?: string;
  category?: string;
  contentType?: string;
  lessonId?: string;
  lessonData?: any;
  submissions?: any[];
  submittedCount?: number;
  submittedIds?: string[];
  originalAssignmentId?: string;
  enableRealtimeLeaderboard?: boolean;
  startDate?: string;
  maxAttempts?: string;
  allowRepeat?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  leaderboardScope?: 'all' | 'since_enabled';
  leaderboardEnabledAt?: string;
  groupId?: string;
  updatedAt?: string;
}

export interface HomeworkSubmission {
  id: string;
  homeworkId: string;
  studentId: string;
  studentName: string;
  className: string;
  answers: Record<number, string>;
  score?: number;
  maxScore?: number;
  aiFeedback?: string;
  status: 'submitted' | 'graded';
  submittedAt: string;
}

export interface AssignmentSubmission {
  id: string;
  studentId: string;
  sddcn?: string;
  studentPersistentId?: string;
  academicYear?: string;
  maHs?: string;
  studentCode?: string;
  studentName: string;
  className?: string;
  submittedAt: string;
  submittedTime?: string;
  attachmentUrl?: string;
  content?: string;
  score?: number | string;
  totalScore?: number | string;
  answers?: any;
  studentAnswers?: any;
  feedback?: string;
  status: 'pending' | 'graded' | 'submitted';
}

export interface SubjectScore {
  score: number;
  assessment: 'Hoàn thành tốt' | 'Hoàn thành' | 'Chưa hoàn thành';
}

export interface StudentReport {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  grade: string;
  semester: string;
  academicYear: string;
  subjectScores: Record<string, SubjectScore>;
  overallAssessment: 'Hoàn thành tốt' | 'Hoàn thành' | 'Chưa hoàn thành';
  capacityRating: string;
  qualityRating: string;
  aiCommentSuggestion?: string;
  teacherComment: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  userDisplayName?: string;
  userRole?: string;
  actionType?: string;
  description?: string;
  createdAt?: string;

  user?: string;
  role?: UserRole;
  action?: string;
  module?: string;
  timestamp?: string;
  time?: string;
  schoolYear?: string;
}

export interface LatencyTestResult {
  latencyMs: number;
  status: 'online' | 'error' | 'testing';
  modelName: string;
  message?: string;
  isCachedModel?: boolean;
  modelSource?: 'admin' | 'cached' | 'default';
  sourceLabel?: string;
  httpStatus?: number | string;
  rawErrorDetails?: string;
}

export interface TeacherRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  subject: string;
  status: 'active' | 'locked';
  dob?: string;
  phone?: string;
  sddcn?: string;
  toChuyenMon: string;
  nhomGvCn?: string;
  avatar?: string;
  teachingAssignments?: Array<{ subject: string; classes: string[] }>;
  lopDay?: string[];
  lopChuNhiem?: string;
  homeroomClasses?: string[];
  teachingClasses?: string[];
  userRole?: UserRole;
}

export interface StudentRecord {
  id: string;
  stt: number;
  code: string;
  sddcn: string;
  studentPersistentId?: string;
  academicYear?: string;
  name: string;
  gender: 'Nam' | 'Nữ';
  dob: string;
  className: string;
  parentName: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
  conduct: 'Tốt' | 'Khá';
  avgScore: number;
  notes?: string;
  coins?: number;
  avatar: string;
  avatarUrl?: string;
  pin?: string;
  address?: string;
  username?: string;
  password?: string;
  fullName?: string;
  idCard?: string;
  birthday?: string;
  commentDetail?: {
    correctCount: number;
    totalQuestions: number;
    strengths: string;
    reminders: string;
    overallDat: 'T' | 'H' | 'C' | 'CHT';
    score: number;
    hasCommented: boolean;
  };
}

export type GameType = 'golden_bell' | 'speed_quiz' | 'lucky_wheel' | 'flashcards';

export interface GameItem {
  id: string;
  title: string;
  type: GameType;
  subject: string;
  grade: string;
  description: string;
  questions: any[];
  playersCount?: number;
  maxPlayers?: number;
  classInfo?: string;
  status?: 'open' | 'closed';
  timePerQuestion?: string;
  isTimeLimited?: boolean;
  originalGameId?: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdBy?: string;
  authorName?: string;
  authorType?: 'my' | 'colleague' | 'all';
  khoi?: string;
  lop?: string;
}

export interface QuizziGameItem {
  id: number | string;
  originalGameId?: string;
  subject: string;
  subjectLabel: string;
  title: string;
  desc: string;
  grade: string;
  classInfo: string;
  icon?: string;
  color?: string;
  type?: string;
  embedUrl?: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdBy?: string;
  authorName?: string;
  authorType?: 'my' | 'colleague' | 'all';
  createdAt?: string;
  updatedAt?: string;
}

export interface StudentEnrollmentRecord {
  sddcn: string;
  academicYear: string;
  classId: string;
  className?: string;
  displayCode: string;
  homeroomTeacherId?: string;
}

export const SUBJECT_OPTIONS = [
  'Toán',
  'Tiếng Việt',
  'Tin học',
  'Khoa học',
  'Lịch sử & Địa lý',
  'Tiếng Anh',
  'Đạo đức',
  'Tự nhiên & Xã hội',
  'Âm nhạc',
  'Mĩ thuật'
];

export const GRADE_OPTIONS = [
  'Khối 4'
];

export const CLASS_OPTIONS = [
  'Lớp 4C', 'Lớp 4D'
];

export const LEVEL_OPTIONS: QuestionLevel[] = [
  'Nhận biết',
  'Thông hiểu',
  'Vận dụng',
  'Vận dụng cao'
];
