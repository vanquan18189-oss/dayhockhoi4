import React, { useState } from 'react';
import { 
  ClipboardList, 
  Sparkles, 
  Plus, 
  Clock, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  BrainCircuit, 
  Loader2, 
  Send,
  X,
  FileCheck,
  ChevronRight
} from 'lucide-react';
import { HomeworkAssignment, HomeworkSubmission, Question, SUBJECT_OPTIONS, CLASS_OPTIONS, GRADE_OPTIONS } from '../types';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { DateTimePicker } from './common/DateTimePicker';
import { formatDateTimeVN, parseFirestoreDate, toIsoDateTimeString } from '../utils/dateTimeUtils';

interface HomeworkManagerProps {
  homeworkAssignments: HomeworkAssignment[];
  setHomeworkAssignments: React.Dispatch<React.SetStateAction<HomeworkAssignment[]>>;
  questionBank: Question[];
  onActivityAdded: (desc: string) => void;
}

export const HomeworkManager: React.FC<HomeworkManagerProps> = ({
  homeworkAssignments,
  setHomeworkAssignments,
  questionBank,
  onActivityAdded
}) => {
  const { currentUser } = useAuth();
  const [selectedHomework, setSelectedHomework] = useState<HomeworkAssignment | null>(homeworkAssignments[0] || null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Student Mock Submissions State
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([
    {
      id: 'sub_1',
      homeworkId: 'hw_1',
      studentId: 'u_student1',
      studentName: 'Lê Hoàng Nam',
      className: 'Lớp 4A',
      answers: { 0: 'B. 42', 1: 'B. 40 chiếc', 2: 'B. 40 cm' },
      score: 10,
      maxScore: 10,
      aiFeedback: 'Xuất sắc! Con làm đúng tất cả câu trắc nghiệm tính nhẩm và chu vi hình chữ nhật.',
      status: 'graded',
      submittedAt: '2026-11-10T14:30:00Z'
    },
    {
      id: 'sub_2',
      homeworkId: 'hw_1',
      studentId: 'u_student2',
      studentName: 'Phạm Minh Anh',
      className: 'Lớp 4A',
      answers: { 0: 'B. 42', 1: 'A. 35 chiếc', 2: 'B. 40 cm' },
      score: 6.6,
      maxScore: 10,
      aiFeedback: 'Con làm đúng 2/3 câu. Nhắc con kiểm tra lại phép nhân 8 x 5 = 40 bánh nhé!',
      status: 'graded',
      submittedAt: '2026-11-10T16:00:00Z'
    }
  ]);

  // AI Essay Grading State
  const [gradingSubmission, setGradingSubmission] = useState<HomeworkSubmission | null>(null);
  const [isAiGrading, setIsAiGrading] = useState(false);

  // Student Interactive Homework Solver State (For Student Role)
  const [studentAnswers, setStudentAnswers] = useState<Record<number, string>>({});
  const [studentSubmitted, setStudentSubmitted] = useState(false);

  // New Homework Form State
  const [hwForm, setHwForm] = useState({
    title: 'Bài tập ôn tập Bảng nhân và chia',
    subject: 'Toán',
    grade: 'Khối 4',
    className: 'Lớp 4A',
    deadline: '',
    isUnlimited: true,
    selectedQuestionIds: [] as string[]
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Assign New Homework
  const handleAssignHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const selectedQuestions = questionBank.filter(q => hwForm.selectedQuestionIds.includes(q.id));
    
    if (selectedQuestions.length === 0) {
      setFormError('Vui lòng chọn ít nhất 1 câu hỏi cho bài tập!');
      return;
    }

    if (!hwForm.isUnlimited) {
      const parsedDue = parseFirestoreDate(hwForm.deadline);
      if (!parsedDue) {
        setFormError('Vui lòng chọn hạn nộp bài hợp lệ hoặc bật "Không giới hạn thời gian".');
        return;
      }
      if (parsedDue.getTime() <= Date.now()) {
        setFormError('Hạn nộp bài phải ở tương lai (sau thời điểm hiện tại).');
        return;
      }
    }

    const nowIso = toIsoDateTimeString(new Date());
    const newHw: HomeworkAssignment = {
      id: `hw_${Date.now()}`,
      title: hwForm.title,
      subject: hwForm.subject,
      grade: hwForm.grade,
      className: hwForm.className,
      startDate: nowIso,
      assignedDate: nowIso,
      deadline: hwForm.isUnlimited ? '' : toIsoDateTimeString(hwForm.deadline),
      dueDate: hwForm.isUnlimited ? '' : toIsoDateTimeString(hwForm.deadline),
      isUnlimited: hwForm.isUnlimited,
      questions: selectedQuestions,
      status: 'active',
      createdBy: 'u_teacher1',
      createdAt: new Date().toISOString()
    };

    try {
      const colRef = collection(db, 'homeworkAssignments');
      await addDoc(colRef, newHw);
    } catch (err) {
      console.warn('Firestore note:', err);
    }

    setHomeworkAssignments(prev => [newHw, ...prev]);
    setSelectedHomework(newHw);
    setIsModalOpen(false);
    setFormError(null);
    onActivityAdded(`Vừa giao bài tập mới "${hwForm.title}" cho ${hwForm.className}`);
  };

  // Student Submits Homework & AI Auto Grades
  const handleStudentSubmit = async () => {
    if (!selectedHomework) return;

    let correctCount = 0;
    const total = selectedHomework.questions.length;

    selectedHomework.questions.forEach((q, idx) => {
      const ans = studentAnswers[idx] || '';
      if (q.type === 'choice' && ans && q.correctAnswer.includes(ans.charAt(0))) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / total) * 10 * 10) / 10;
    const aiFeedback = `AI tự động chấm: Đúng ${correctCount}/${total} câu. Điểm số: ${score}/10. ${score >= 8 ? 'Làm bài rất tốt!' : 'Cần rèn luyện thêm.'}`;

    const newSub: HomeworkSubmission = {
      id: `sub_${Date.now()}`,
      homeworkId: selectedHomework.id,
      studentId: currentUser.uid,
      studentName: currentUser.displayName,
      className: currentUser.className || 'Lớp 4A',
      answers: studentAnswers,
      score,
      maxScore: 10,
      aiFeedback,
      status: 'graded',
      submittedAt: new Date().toISOString()
    };

    setSubmissions(prev => [newSub, ...prev]);
    setStudentSubmitted(true);
    onActivityAdded(`Học sinh ${currentUser.displayName} vừa hoàn thành bài tập "${selectedHomework.title}" đạt ${score}/10`);
  };

  // AI Essay Feedback Helper
  const handleAiGradeEssay = async (sub: HomeworkSubmission) => {
    setGradingSubmission(sub);
    setIsAiGrading(true);

    try {
      const firstQ = selectedHomework?.questions[0];
      const studentAns = sub.answers[0] || 'Bài làm của học sinh';

      const res = await fetch('/api/gemini/grade-essay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeworkTitle: selectedHomework?.title,
          questionText: firstQ?.questionText || 'Bài tập tự luận',
          studentAnswer: studentAns,
          maxScore: 10
        })
      });

      if (!res.ok) throw new Error('Lỗi từ AI Chấm bài');
      const data = await res.json();

      setSubmissions(prev => prev.map(s => s.id === sub.id ? {
        ...s,
        score: data.score,
        aiFeedback: `${data.feedback} (${data.encouragement || ''})`,
        status: 'graded'
      } : s));

      onActivityAdded(`AI vừa đề xuất chấm bài cho học sinh ${sub.studentName}: ${data.score} điểm`);
      setAiError(null);
    } catch (err: any) {
      setAiError('Không thể chấm bằng AI: ' + (err?.message || 'Vui lòng thử lại sau.'));
    } finally {
      setIsAiGrading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-[#3730A3]" />
            Quản Lý & Chấm Bài Tập Tự Động Với AI
          </h2>
          <p className="text-xs text-slate-500 mt-1">Giao bài theo lớp, theo dõi tỷ lệ nộp bài & tự động chấm trắc nghiệm / gợi ý tự luận</p>
        </div>

        {/* Accent Orange Primary Button */}
        {currentUser.role !== 'student' && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#F97316] hover:bg-orange-600 transition-all shadow-md shadow-orange-600/30 active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>Giao bài tập mới</span>
          </button>
        )}
      </div>

      {/* Main Grid Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Homework List */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3">
          <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider px-1">Danh sách Bài Tập Đã Giao</h3>

          <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
            {homeworkAssignments.map(hw => {
              const isSelected = selectedHomework?.id === hw.id;
              const subCount = submissions.filter(s => s.homeworkId === hw.id).length;
              return (
                <div
                  key={hw.id}
                  onClick={() => {
                    setSelectedHomework(hw);
                    setStudentSubmitted(false);
                    setStudentAnswers({});
                  }}
                  className={`
                    p-3.5 rounded-xl cursor-pointer transition-all border text-left relative group
                    ${isSelected 
                      ? 'bg-indigo-50/90 border-[#3730A3] shadow-xs' 
                      : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/80'
                    }
                  `}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#3730A3] text-white">
                      {hw.className}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">{hw.subject}</span>
                  </div>

                  <h4 className="font-bold text-slate-900 text-xs leading-snug line-clamp-2 mt-1">
                    {hw.title}
                  </h4>

                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" /> Hạn: {hw.isUnlimited ? 'Không giới hạn thời gian' : formatDateTimeVN(hw.dueDate || hw.deadline, 'Không giới hạn thời gian')}
                    </span>
                    <span className="font-bold text-emerald-600">Đã nộp: {subCount}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Homework Workspace (Teacher View or Student View) */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-6 shadow-xs border border-slate-200/80 min-h-[600px]">
          {aiError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> {aiError}</span>
              <button type="button" onClick={() => setAiError(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
          )}
          {selectedHomework ? (
            <div className="space-y-6">
              {/* Top Banner */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-900 to-[#3730A3] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-orange-500 text-white font-bold text-[10px] rounded-md uppercase">
                      {selectedHomework.className}
                    </span>
                    <span className="text-xs text-indigo-200">{selectedHomework.subject}</span>
                  </div>
                  <h3 className="font-bold text-base text-white">{selectedHomework.title}</h3>
                </div>

                <div className="text-right text-xs text-indigo-100">
                  <p>Hạn nộp bài:</p>
                  <p className="font-bold text-amber-300">
                    {selectedHomework.isUnlimited
                      ? 'Không giới hạn thời gian'
                      : formatDateTimeVN(selectedHomework.dueDate || selectedHomework.deadline, 'Không giới hạn thời gian')}
                  </p>
                </div>
              </div>

              {/* STUDENT ROLE: Interactive Homework Solver */}
              {currentUser.role === 'student' ? (
                <div className="space-y-6">
                  {studentSubmitted ? (
                    <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
                      <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                      <h4 className="text-lg font-black text-emerald-900">Em đã nộp bài tập thành công!</h4>
                      <p className="text-xs text-emerald-800">Hệ thống AI đã tự động chấm điểm và phản hồi bài làm của em.</p>
                      <button
                        onClick={() => setStudentSubmitted(false)}
                        className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl"
                      >
                        Làm lại bài tập
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <h4 className="font-bold text-slate-900 text-sm border-b border-slate-200 pb-2">
                        Câu hỏi bài tập ({selectedHomework.questions.length} câu)
                      </h4>

                      {selectedHomework.questions.map((q, idx) => (
                        <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                          <p className="font-bold text-xs text-slate-900">
                            Câu {idx + 1}: {q.questionText}
                          </p>

                          {q.type === 'choice' && q.options && (
                            <div className="space-y-1.5 pl-2">
                              {q.options.map((opt, oIdx) => (
                                <label key={oIdx} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200">
                                  <input
                                    type="radio"
                                    name={`q_${idx}`}
                                    value={opt}
                                    onChange={() => setStudentAnswers({ ...studentAnswers, [idx]: opt })}
                                    className="accent-[#3730A3]"
                                  />
                                  <span>{opt}</span>
                                </label>
                              ))}
                            </div>
                          )}

                          {q.type === 'essay' && (
                            <textarea
                              rows={3}
                              placeholder="Em hãy viết câu trả lời tự luận vào đây..."
                              value={studentAnswers[idx] || ''}
                              onChange={(e) => setStudentAnswers({ ...studentAnswers, [idx]: e.target.value })}
                              className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-[#3730A3]"
                            />
                          )}
                        </div>
                      ))}

                      <button
                        onClick={handleStudentSubmit}
                        className="w-full py-3 bg-[#F97316] hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-2"
                      >
                        <Send className="w-4 h-4" /> Nộp bài tập cho giáo viên
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* TEACHER ROLE: Submissions & AI Auto-Grading Monitor */
                <div className="space-y-6">
                  {/* Submission Metrics */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                      <span className="text-[11px] text-slate-500 font-bold block">Tổng sỉ số</span>
                      <span className="text-xl font-black text-slate-900">32</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                      <span className="text-[11px] text-emerald-700 font-bold block">Đã nộp bài</span>
                      <span className="text-xl font-black text-emerald-900">{submissions.length}</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-center">
                      <span className="text-[11px] text-indigo-700 font-bold block">Tỷ lệ nộp bài</span>
                      <span className="text-xl font-black text-[#3730A3]">
                        {Math.round((submissions.length / 32) * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* Submissions Table */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Danh Sách Bài Làm Của Học Sinh</h4>

                    <div className="space-y-3">
                      {submissions.map((sub) => (
                        <div key={sub.id} className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 text-[#3730A3] font-bold text-xs flex items-center justify-center">
                                {sub.studentName.charAt(0)}
                              </div>
                              <div>
                                <h5 className="font-bold text-xs text-slate-900">{sub.studentName}</h5>
                                <p className="text-[10px] text-slate-400">Nộp lúc: {formatDateTimeVN(sub.submittedAt, sub.submittedAt || '-')}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                                {sub.score} / {sub.maxScore} điểm
                              </span>

                              <button
                                onClick={() => handleAiGradeEssay(sub)}
                                disabled={isAiGrading && gradingSubmission?.id === sub.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50"
                              >
                                {isAiGrading && gradingSubmission?.id === sub.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <BrainCircuit className="w-3.5 h-3.5" />
                                )}
                                <span>Chấm AI</span>
                              </button>
                            </div>
                          </div>

                          {sub.aiFeedback && (
                            <div className="p-3 rounded-lg bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 leading-relaxed">
                              <strong>Phản hồi & Nhận xét AI:</strong> {sub.aiFeedback}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center text-slate-400">
              <ClipboardList className="w-12 h-12 stroke-1 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-600">Chọn một Bài tập ở cột trái để quản lý chấm điểm</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Assign New Homework */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-base">Giao Bài Tập Mới Cho Lớp</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignHomework} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tiêu đề bài tập *</label>
                <input
                  type="text"
                  required
                  value={hwForm.title}
                  onChange={(e) => setHwForm({ ...hwForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Lớp được giao</label>
                  <select
                    value={hwForm.className}
                    onChange={(e) => setHwForm({ ...hwForm, className: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-medium"
                  >
                    {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Hạn nộp bài</label>
                    <label className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hwForm.isUnlimited}
                        onChange={(e) => {
                          setHwForm({ ...hwForm, isUnlimited: e.target.checked });
                          setFormError(null);
                        }}
                        className="accent-emerald-600 rounded"
                      />
                      <span>Không giới hạn</span>
                    </label>
                  </div>
                  <DateTimePicker
                    disabled={hwForm.isUnlimited}
                    value={hwForm.isUnlimited ? '' : hwForm.deadline}
                    onChange={(val) => {
                      setHwForm({ ...hwForm, deadline: val });
                      setFormError(null);
                    }}
                    placeholder={hwForm.isUnlimited ? 'Không giới hạn thời gian' : 'DD/MM/YYYY HH:mm'}
                  />
                </div>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Question Selection from Bank */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Chọn câu hỏi từ Ngân hàng ({questionBank.length} câu hiện có)</label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1.5">
                  {questionBank.map((q) => {
                    const isChecked = hwForm.selectedQuestionIds.includes(q.id);
                    return (
                      <label key={q.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 text-xs">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setHwForm({ ...hwForm, selectedQuestionIds: [...hwForm.selectedQuestionIds, q.id] });
                            } else {
                              setHwForm({ ...hwForm, selectedQuestionIds: hwForm.selectedQuestionIds.filter(id => id !== q.id) });
                            }
                          }}
                          className="mt-0.5 accent-[#3730A3]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 truncate">{q.questionText}</p>
                          <p className="text-[10px] text-slate-500">{q.subject} • {q.level}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#F97316] hover:bg-orange-600 shadow-md"
                >
                  Giao Bài Tập
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
