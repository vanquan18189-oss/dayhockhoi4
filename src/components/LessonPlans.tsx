import React, { useState } from 'react';
import { 
  BookOpenCheck, 
  Sparkles, 
  Plus, 
  Trash2, 
  Edit3, 
  Printer, 
  Clock, 
  ChevronRight, 
  CheckCircle2, 
  Loader2, 
  BookOpen,
  Search,
  School,
  X,
  FileText
} from 'lucide-react';
import { LessonPlan, SUBJECT_OPTIONS, GRADE_OPTIONS } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

interface LessonPlansProps {
  lessonPlans: LessonPlan[];
  setLessonPlans: React.Dispatch<React.SetStateAction<LessonPlan[]>>;
  onActivityAdded: (desc: string) => void;
}

export const LessonPlans: React.FC<LessonPlansProps> = ({
  lessonPlans,
  setLessonPlans,
  onActivityAdded
}) => {
  const [selectedPlan, setSelectedPlan] = useState<LessonPlan | null>(lessonPlans[0] || null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('Tất cả');
  const [deletingPlan, setDeletingPlan] = useState<{ id: string; title: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    subject: 'Toán',
    grade: 'Khối 4',
    durationMinutes: 40,
    warmup: '',
    exploration: '',
    practice: '',
    application: '',
  });

  // Handle Gemini AI Lesson Generator
  const handleGenerateAI = async () => {
    if (!formData.title.trim()) {
      window.dispatchEvent(new CustomEvent('eduplay_toast', {
        detail: { title: 'Thiếu tên bài học', message: 'Vui lòng nhập Tên bài học trước khi soạn bằng Gemini AI!', type: 'info' }
      }));
      return;
    }

    setIsAiLoading(true);
    try {
      const res = await fetch('/api/gemini/lesson-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          subject: formData.subject,
          grade: formData.grade,
          durationMinutes: formData.durationMinutes
        })
      });

      if (!res.ok) {
        throw new Error('Lỗi từ máy chủ tạo bài giảng');
      }

      const data = await res.json();
      setFormData(prev => ({
        ...prev,
        warmup: data.warmup || '',
        exploration: data.exploration || '',
        practice: data.practice || '',
        application: data.application || ''
      }));
      onActivityAdded(`Vừa soạn bài giảng "${formData.title}" với trợ lý Gemini AI`);
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('eduplay_toast', {
        detail: { title: 'Lỗi soạn bài giảng AI', message: 'Không thể tạo bài giảng với Gemini AI: ' + err.message, type: 'error' }
      }));
    } finally {
      setIsAiLoading(false);
    }
  };

  // Save Lesson Plan to State & Firestore
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const newPlan: LessonPlan = {
      id: selectedPlan && isModalOpen && selectedPlan.id ? selectedPlan.id : `lp_${Date.now()}`,
      ...formData,
      createdBy: 'u_teacher1',
      authorName: 'Thầy Nguyễn Văn Minh',
      createdAt: new Date().toISOString()
    };

    try {
      const colRef = collection(db, 'lessonPlans');
      await addDoc(colRef, newPlan);
    } catch (err) {
      console.warn('Firestore offline note:', err);
    }

    setLessonPlans(prev => [newPlan, ...prev.filter(p => p.id !== newPlan.id)]);
    setSelectedPlan(newPlan);
    setIsModalOpen(false);
    onActivityAdded(`Đã lưu bài giảng mới: "${formData.title}"`);

    // Reset Form
    setFormData({
      title: '',
      subject: 'Toán',
      grade: 'Khối 4',
      durationMinutes: 40,
      warmup: '',
      exploration: '',
      practice: '',
      application: '',
    });
  };

  // Delete Lesson Plan
  const handleDeletePlan = async (id: string, title: string) => {
    setDeletingPlan({ id, title });
  };

  const confirmDeletePlan = () => {
    if (!deletingPlan) return;
    const { id, title } = deletingPlan;
    setLessonPlans(prev => prev.filter(p => p.id !== id));
    if (selectedPlan?.id === id) {
      setSelectedPlan(lessonPlans.find(p => p.id !== id) || null);
    }
    onActivityAdded(`Đã xóa bài giảng: "${title}"`);
    setDeletingPlan(null);
  };

  // Print Lesson Plan
  const handlePrint = () => {
    window.print();
  };

  // Filtered List
  const filteredPlans = lessonPlans.filter(plan => {
    const matchesSearch = plan.title.toLowerCase().includes(searchTerm.toLowerCase()) || plan.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSubject = selectedSubject === 'Tất cả' || plan.subject === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  return (
    <div className="space-y-6 print:m-0 print:p-0">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80 print:hidden">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <BookOpenCheck className="w-6 h-6 text-[#3730A3]" />
            Soạn Bài Giảng Chuẩn 4 Bước Sư Phạm
          </h2>
          <p className="text-xs text-slate-500 mt-1">Cấu trúc bài giảng: Khởi động ➔ Khám phá ➔ Luyện tập ➔ Vận dụng (GDPT 2018)</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Accent Orange Button for primary action */}
          <button
            onClick={() => {
              setFormData({
                title: '',
                subject: 'Toán',
                grade: 'Khối 4',
                durationMinutes: 40,
                warmup: '',
                exploration: '',
                practice: '',
                application: '',
              });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#F97316] hover:bg-orange-600 transition-all shadow-md shadow-orange-600/30 active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>Soạn bài giảng mới</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Lesson Plans List */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-4 print:hidden">
          {/* Search and Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm bài giảng..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#3730A3]"
              />
            </div>
            
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full py-2 px-3 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:border-[#3730A3] bg-slate-50"
            >
              <option value="Tất cả">Tất cả môn học</option>
              {SUBJECT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* List Items */}
          <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
            {filteredPlans.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Chưa có bài giảng nào phù hợp.</p>
            ) : (
              filteredPlans.map(plan => {
                const isSelected = selectedPlan?.id === plan.id;
                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
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
                        {plan.subject}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">{plan.grade}</span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-xs leading-snug line-clamp-2 mt-1">
                      {plan.title}
                    </h4>

                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" /> {plan.durationMinutes} phút
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePlan(plan.id, plan.title);
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Xóa bài giảng"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detailed Lesson Plan Viewer & 4 Pedagogical Steps */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-6 shadow-xs border border-slate-200/80 min-h-[600px] print:shadow-none print:border-none print:p-0">
          {selectedPlan ? (
            <div className="space-y-6">
              {/* Document Actions Bar */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-indigo-100 text-[#3730A3] text-xs font-bold rounded-lg">
                    {selectedPlan.subject} • {selectedPlan.grade}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Thời lượng: {selectedPlan.durationMinutes} phút
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" /> In / Xuất Giáo Án
                  </button>
                  <button
                    onClick={() => {
                      setFormData({
                        title: selectedPlan.title,
                        subject: selectedPlan.subject,
                        grade: selectedPlan.grade,
                        durationMinutes: selectedPlan.durationMinutes,
                        warmup: selectedPlan.warmup,
                        exploration: selectedPlan.exploration,
                        practice: selectedPlan.practice,
                        application: selectedPlan.application
                      });
                      setIsModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#3730A3] hover:bg-indigo-900 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Chỉnh sửa
                  </button>
                </div>
              </div>

              {/* Printable Header */}
              <div className="text-center space-y-1 pb-4 border-b border-slate-200">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">KẾ HOẠCH BÀI DẠY tiểu học (GDPT 2018)</p>
                <h3 className="text-xl lg:text-2xl font-black text-slate-900">{selectedPlan.title}</h3>
                <p className="text-xs text-slate-600">
                  Môn: <strong>{selectedPlan.subject}</strong> | Khối: <strong>{selectedPlan.grade}</strong> | Thời lượng: <strong>{selectedPlan.durationMinutes} phút</strong>
                </p>
                {selectedPlan.authorName && (
                  <p className="text-xs text-slate-400 italic">Người soạn: {selectedPlan.authorName}</p>
                )}
              </div>

              {/* 4 Pedagogical Steps */}
              <div className="space-y-6">
                {/* Bước 1: Khởi động */}
                <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                    <span className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center text-xs font-black">1</span>
                    <h4>BƯỚC 1: KHỞI ĐỘNG (Tạo tâm thế & Kết nối kiến thức)</h4>
                  </div>
                  <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-line pl-8">
                    {selectedPlan.warmup || 'Chưa cập nhật nội dung khởi động.'}
                  </div>
                </div>

                {/* Bước 2: Khám phá */}
                <div className="p-5 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                    <span className="w-6 h-6 rounded-lg bg-[#3730A3] text-white flex items-center justify-center text-xs font-black">2</span>
                    <h4>BƯỚC 2: KHÁM PHÁ (Hình thành kiến thức mới)</h4>
                  </div>
                  <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-line pl-8">
                    {selectedPlan.exploration || 'Chưa cập nhật nội dung khám phá.'}
                  </div>
                </div>

                {/* Bước 3: Luyện tập */}
                <div className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                    <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-black">3</span>
                    <h4>BƯỚC 3: LUYỆN TẬP (Củng cố & Thực hành bài tập)</h4>
                  </div>
                  <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-line pl-8">
                    {selectedPlan.practice || 'Chưa cập nhật nội dung luyện tập.'}
                  </div>
                </div>

                {/* Bước 4: Vận dụng */}
                <div className="p-5 rounded-2xl bg-purple-50/60 border border-purple-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
                    <span className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center text-xs font-black">4</span>
                    <h4>BƯỚC 4: VẬN DỤNG (Liên hệ thực tế & Sáng tạo)</h4>
                  </div>
                  <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-line pl-8">
                    {selectedPlan.application || 'Chưa cập nhật nội dung vận dụng.'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center text-slate-400">
              <BookOpen className="w-12 h-12 stroke-1 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-600">Chọn một bài giảng ở cột bên trái để xem chi tiết</p>
              <p className="text-xs mt-1">Hoặc bấm "Soạn bài giảng mới" để bắt đầu thiết kế bài học 4 bước.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Soạn bài / Sửa bài với Gemini AI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-[#3730A3] flex items-center justify-center">
                  <BookOpenCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Soạn Bài Giảng Chuẩn 4 Bước Sư Phạm</h3>
                  <p className="text-xs text-slate-500">Tự động tạo nội dung 4 bước sư phạm bằng Gemini AI</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4">
              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tên bài học *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Phép nhân trong phạm vi 1000 - Bài 12"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Môn học</label>
                  <select
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                  >
                    {SUBJECT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Khối lớp</label>
                  <select
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                  >
                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Thời lượng (phút)</label>
                  <input
                    type="number"
                    value={formData.durationMinutes}
                    onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || 35 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                  />
                </div>
              </div>

              {/* Gemini AI Action Trigger */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-900 to-indigo-800 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
                <div className="space-y-0.5 text-center sm:text-left">
                  <p className="text-xs font-bold flex items-center justify-center sm:justify-start gap-1">
                    <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
                    Soạn nội dung 4 bước sư phạm bằng Gemini AI
                  </p>
                  <p className="text-[11px] text-indigo-200">AI tự động tạo gợi ý Khởi động, Khám phá, Luyện tập, Vận dụng chuẩn GDPT 2018</p>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAI}
                  disabled={isAiLoading}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#F97316] text-white hover:bg-orange-600 transition-all disabled:opacity-50"
                >
                  {isAiLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang tạo...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Tạo bằng Gemini AI</span>
                    </>
                  )}
                </button>
              </div>

              {/* 4 Steps Textareas */}
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-amber-900 mb-1">Bước 1: Khởi động (Warm-up)</label>
                  <textarea
                    rows={3}
                    placeholder="Nhập nội dung các hoạt động khởi động, trò chơi, hát..."
                    value={formData.warmup}
                    onChange={(e) => setFormData({ ...formData, warmup: e.target.value })}
                    className="w-full p-3 rounded-xl border border-amber-200 text-xs leading-relaxed focus:outline-none focus:border-amber-500 bg-amber-50/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-indigo-900 mb-1">Bước 2: Khám phá (Exploration)</label>
                  <textarea
                    rows={3}
                    placeholder="Nhập nội dung các hoạt động quan sát, thảo luận hình thành kiến thức mới..."
                    value={formData.exploration}
                    onChange={(e) => setFormData({ ...formData, exploration: e.target.value })}
                    className="w-full p-3 rounded-xl border border-indigo-200 text-xs leading-relaxed focus:outline-none focus:border-indigo-500 bg-indigo-50/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-emerald-900 mb-1">Bước 3: Luyện tập (Practice)</label>
                  <textarea
                    rows={3}
                    placeholder="Nhập nội dung các bài tập thực hành trong Sách giáo khoa / Vở bài tập..."
                    value={formData.practice}
                    onChange={(e) => setFormData({ ...formData, practice: e.target.value })}
                    className="w-full p-3 rounded-xl border border-emerald-200 text-xs leading-relaxed focus:outline-none focus:border-emerald-500 bg-emerald-50/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-purple-900 mb-1">Bước 4: Vận dụng (Application)</label>
                  <textarea
                    rows={3}
                    placeholder="Nhập nội dung vận dụng liên hệ thực tế cuộc sống..."
                    value={formData.application}
                    onChange={(e) => setFormData({ ...formData, application: e.target.value })}
                    className="w-full p-3 rounded-xl border border-purple-200 text-xs leading-relaxed focus:outline-none focus:border-purple-500 bg-purple-50/30"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#3730A3] hover:bg-indigo-900"
                >
                  Lưu bài giảng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h4 className="text-base font-bold text-slate-900">Xác nhận xóa bài giảng</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa bài giảng <span className="font-bold text-slate-900">"{deletingPlan.title}"</span>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPlan(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmDeletePlan}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700"
              >
                Xóa bài giảng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
