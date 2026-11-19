import React, { useState } from 'react';
import { 
  Database, 
  Sparkles, 
  Plus, 
  FileSpreadsheet, 
  Download, 
  Upload, 
  Trash2, 
  Edit3, 
  Search, 
  Filter, 
  CheckCircle2, 
  HelpCircle,
  X,
  Loader2,
  BrainCircuit,
  Tag
} from 'lucide-react';
import { Question, QuestionLevel, SUBJECT_OPTIONS, GRADE_OPTIONS, LEVEL_OPTIONS } from '../types';
import * as XLSX from 'xlsx';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

interface QuestionBankProps {
  questions: Question[];
  setQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  onActivityAdded: (desc: string) => void;
  openAiGeneratorInitially?: boolean;
}

export const QuestionBank: React.FC<QuestionBankProps> = ({
  questions,
  setQuestions,
  onActivityAdded,
  openAiGeneratorInitially = false
}) => {
  const [selectedSubject, setSelectedSubject] = useState('Tất cả');
  const [selectedGrade, setSelectedGrade] = useState('Tất cả');
  const [selectedLevel, setSelectedLevel] = useState('Tất cả');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(openAiGeneratorInitially);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);

  // Manual Question Form
  const [manualForm, setManualForm] = useState({
    subject: 'Toán',
    grade: 'Khối 4',
    topic: 'Bảng nhân và chia',
    level: 'Nhận biết' as QuestionLevel,
    type: 'choice' as 'choice' | 'essay',
    questionText: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctAnswer: 'A',
    explanation: ''
  });

  // AI Generator Form
  const [aiForm, setAiForm] = useState({
    subject: 'Toán',
    grade: 'Khối 4',
    topic: 'Giải toán có lời văn trong phạm vi 1000',
    level: 'Tất cả',
    count: 5
  });

  // Handle Manual Save
  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.questionText.trim()) return;

    const options = manualForm.type === 'choice' 
      ? [`A. ${manualForm.optionA}`, `B. ${manualForm.optionB}`, `C. ${manualForm.optionC}`, `D. ${manualForm.optionD}`]
      : [];

    const correctText = manualForm.type === 'choice'
      ? `${manualForm.correctAnswer}. ${manualForm.correctAnswer === 'A' ? manualForm.optionA : manualForm.correctAnswer === 'B' ? manualForm.optionB : manualForm.correctAnswer === 'C' ? manualForm.optionC : manualForm.optionD}`
      : manualForm.explanation;

    const newQ: Question = {
      id: `q_${Date.now()}`,
      subject: manualForm.subject,
      grade: manualForm.grade,
      topic: manualForm.topic,
      level: manualForm.level,
      type: manualForm.type,
      questionText: manualForm.questionText,
      options,
      correctAnswer: correctText,
      explanation: manualForm.explanation,
      createdBy: 'u_teacher1',
      createdAt: new Date().toISOString()
    };

    try {
      const colRef = collection(db, 'questions');
      await addDoc(colRef, newQ);
    } catch (e) {
      console.warn('Firestore note:', e);
    }

    setQuestions(prev => [newQ, ...prev]);
    setIsAddModalOpen(false);
    onActivityAdded(`Thêm thủ công 1 câu hỏi môn ${manualForm.subject} (${manualForm.level})`);
  };

  // Handle AI Question Generation
  const handleGenerateAiQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiForm.topic.trim()) return;

    setIsAiLoading(true);
    try {
      const res = await fetch('/api/gemini/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiForm)
      });

      if (!res.ok) throw new Error('Lỗi máy chủ khi tạo câu hỏi');

      const generated: Question[] = await res.json();
      const formatted = generated.map((q, i) => ({
        ...q,
        id: `q_ai_${Date.now()}_${i}`,
        createdBy: 'u_teacher1',
        createdAt: new Date().toISOString()
      }));

      setQuestions(prev => [...formatted, ...prev]);
      setIsAiModalOpen(false);
      onActivityAdded(`Tạo ${formatted.length} câu hỏi AI môn ${aiForm.subject} cho chủ đề "${aiForm.topic}"`);
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('eduplay_toast', {
        detail: { title: 'Lỗi tạo câu hỏi AI', message: 'Không thể tạo câu hỏi: ' + err.message, type: 'error' }
      }));
    } finally {
      setIsAiLoading(false);
    }
  };

  // Delete Question
  const handleDelete = (id: string) => {
    setDeletingQuestionId(id);
  };

  const confirmDeleteQuestion = () => {
    if (!deletingQuestionId) return;
    setQuestions(prev => prev.filter(q => q.id !== deletingQuestionId));
    onActivityAdded('Đã xóa 1 câu hỏi khỏi ngân hàng');
    setDeletingQuestionId(null);
  };

  // Export to Excel XLSX
  const handleExportExcel = () => {
    const dataToExport = filteredQuestions.map((q, idx) => ({
      'STT': idx + 1,
      'Môn học': q.subject,
      'Khối lớp': q.grade,
      'Chủ đề': q.topic,
      'Mức độ': q.level,
      'Loại câu hỏi': q.type === 'choice' ? 'Trắc nghiệm' : 'Tự luận',
      'Nội dung câu hỏi': q.questionText,
      'Lựa chọn A': q.options?.[0] || '',
      'Lựa chọn B': q.options?.[1] || '',
      'Lựa chọn C': q.options?.[2] || '',
      'Lựa chọn D': q.options?.[3] || '',
      'Đáp án đúng': q.correctAnswer,
      'Lời giải thích': q.explanation || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'NganHangCauHoi');
    XLSX.writeFile(workbook, `NganHangCauHoi_TieuHoc_${Date.now()}.xlsx`);
    onActivityAdded('Đã xuất tập tin Excel ngân hàng câu hỏi');
  };

  // Import from Excel / CSV
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        const importedQuestions: Question[] = data.map((row, idx) => ({
          id: `q_imp_${Date.now()}_${idx}`,
          subject: row['Môn học'] || 'Toán',
          grade: row['Khối lớp'] || 'Khối 4',
          topic: row['Chủ đề'] || 'Nhập từ Excel',
          level: (LEVEL_OPTIONS.includes(row['Mức độ']) ? row['Mức độ'] : 'Nhận biết') as QuestionLevel,
          type: row['Loại câu hỏi'] === 'Tự luận' ? 'essay' : 'choice',
          questionText: row['Nội dung câu hỏi'] || 'Câu hỏi chưa có nội dung',
          options: [row['Lựa chọn A'], row['Lựa chọn B'], row['Lựa chọn C'], row['Lựa chọn D']].filter(Boolean),
          correctAnswer: row['Đáp án đúng'] || '',
          explanation: row['Lời giải thích'] || '',
          createdBy: 'u_teacher1',
          createdAt: new Date().toISOString()
        }));

        setQuestions(prev => [...importedQuestions, ...prev]);
        window.dispatchEvent(new CustomEvent('eduplay_toast', {
          detail: { title: 'Nhập Excel thành công', message: `Nhập thành công ${importedQuestions.length} câu hỏi từ file Excel!`, type: 'success' }
        }));
        onActivityAdded(`Đã nhập ${importedQuestions.length} câu hỏi từ Excel vào hệ thống`);
      } catch (err: any) {
        window.dispatchEvent(new CustomEvent('eduplay_toast', {
          detail: { title: 'Lỗi đọc tập tin Excel', message: 'Lỗi đọc tập tin Excel: ' + err.message, type: 'error' }
        }));
      }
    };
    reader.readAsBinaryString(file);
  };

  // Filtered List
  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.questionText.toLowerCase().includes(searchTerm.toLowerCase()) || q.topic.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSubject = selectedSubject === 'Tất cả' || q.subject === selectedSubject;
    const matchesGrade = selectedGrade === 'Tất cả' || q.grade === selectedGrade;
    const matchesLevel = selectedLevel === 'Tất cả' || q.level === selectedLevel;
    return matchesSearch && matchesSubject && matchesGrade && matchesLevel;
  });

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-[#3730A3]" />
            Ngân Hàng Câu Hỏi Theo 4 Mức Độ Nhận Thức
          </h2>
          <p className="text-xs text-slate-500 mt-1">Phân loại chuẩn: Nhận biết • Thông hiểu • Vận dụng • Vận dụng cao</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* AI Generator Button - Accent Orange #F97316 */}
          <button
            onClick={() => setIsAiModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#F97316] hover:bg-orange-600 transition-all shadow-md shadow-orange-600/30 active:scale-98"
          >
            <Sparkles className="w-4 h-4" />
            <span>Tạo câu hỏi với AI</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#3730A3] hover:bg-indigo-900 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm thủ công</span>
          </button>

          {/* Excel Import & Export */}
          <label className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer">
            <Upload className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Nhập Excel</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportExcel} className="hidden" />
          </label>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            title="Xuất file Excel"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo nội dung câu hỏi hoặc chủ đề..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#3730A3]"
          />
        </div>

        {/* Filter Subject */}
        <div>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full py-2 px-3 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:border-[#3730A3] bg-slate-50"
          >
            <option value="Tất cả">Tất cả môn học</option>
            {SUBJECT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Filter Level */}
        <div>
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="w-full py-2 px-3 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:border-[#3730A3] bg-slate-50"
          >
            <option value="Tất cả">Tất cả 4 mức độ</option>
            {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-semibold">
          <span>Hiển thị <strong>{filteredQuestions.length}</strong> câu hỏi trong ngân hàng</span>
          <span>Tất cả dữ liệu được đồng bộ trực tiếp với Firebase Firestore</span>
        </div>

        {filteredQuestions.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200 space-y-3">
            <HelpCircle className="w-12 h-12 stroke-1 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-600">Không tìm thấy câu hỏi nào phù hợp với bộ lọc.</p>
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="px-4 py-2 bg-[#F97316] text-white text-xs font-bold rounded-xl shadow-md"
            >
              Tạo câu hỏi mới bằng Gemini AI
            </button>
          </div>
        ) : (
          filteredQuestions.map((q, index) => {
            // Level Badge Styling
            const levelBadge = {
              'Nhận biết': 'bg-emerald-100 text-emerald-800 border-emerald-200',
              'Thông hiểu': 'bg-blue-100 text-blue-800 border-blue-200',
              'Vận dụng': 'bg-amber-100 text-amber-800 border-amber-200',
              'Vận dụng cao': 'bg-purple-100 text-purple-800 border-purple-200'
            }[q.level];

            return (
              <div 
                key={q.id}
                className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 hover:shadow-md transition-shadow space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-xs text-slate-400">#{index + 1}</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-[#3730A3] text-white">
                      {q.subject}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                      {q.grade}
                    </span>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-lg border ${levelBadge}`}>
                      {q.level}
                    </span>
                    <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                      <Tag className="w-3 h-3 text-slate-400" /> {q.topic}
                    </span>
                  </div>

                  <button
                    onClick={() => handleDelete(q.id)}
                    className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Xóa câu hỏi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Question Text */}
                <p className="font-bold text-slate-900 text-sm leading-relaxed">
                  {q.questionText}
                </p>

                {/* Choices Grid */}
                {q.type === 'choice' && q.options && q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {q.options.map((opt, optIdx) => {
                      const isCorrect = q.correctAnswer.includes(opt.charAt(0)) || q.correctAnswer === opt;
                      return (
                        <div 
                          key={optIdx}
                          className={`
                            p-2.5 rounded-xl text-xs font-medium border flex items-center justify-between
                            ${isCorrect 
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold' 
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                            }
                          `}
                        >
                          <span>{opt}</span>
                          {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Explanation */}
                {q.explanation && (
                  <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-900 leading-relaxed">
                    <strong>Lời giải / Hướng dẫn:</strong> {q.explanation}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Gemini AI Question Generator */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#F97316] flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Tạo Câu Hỏi Bằng Gemini AI</h3>
                  <p className="text-xs text-slate-500">Tự động sinh bộ câu hỏi phân loại 4 mức độ</p>
                </div>
              </div>
              <button onClick={() => setIsAiModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateAiQuestions} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chủ đề bài học *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Phép chia có dư, Giải toán bằng 2 phép tính..."
                  value={aiForm.topic}
                  onChange={(e) => setAiForm({ ...aiForm, topic: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Môn học</label>
                  <select
                    value={aiForm.subject}
                    onChange={(e) => setAiForm({ ...aiForm, subject: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                  >
                    {SUBJECT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Khối lớp</label>
                  <select
                    value={aiForm.grade}
                    onChange={(e) => setAiForm({ ...aiForm, grade: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                  >
                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mức độ nhận thức</label>
                  <select
                    value={aiForm.level}
                    onChange={(e) => setAiForm({ ...aiForm, level: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                  >
                    <option value="Tất cả">Phân bổ 4 mức độ</option>
                    {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số lượng câu hỏi</label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={aiForm.count}
                    onChange={(e) => setAiForm({ ...aiForm, count: parseInt(e.target.value) || 5 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isAiLoading}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#F97316] hover:bg-orange-600 disabled:opacity-50"
                >
                  {isAiLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang sinh câu hỏi AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Sinh bộ câu hỏi</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manual Question Form */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-base">Thêm Câu Hỏi Mới Thủ Công</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Môn học</label>
                  <select
                    value={manualForm.subject}
                    onChange={(e) => setManualForm({ ...manualForm, subject: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs"
                  >
                    {SUBJECT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Khối lớp</label>
                  <select
                    value={manualForm.grade}
                    onChange={(e) => setManualForm({ ...manualForm, grade: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs"
                  >
                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mức độ</label>
                  <select
                    value={manualForm.level}
                    onChange={(e) => setManualForm({ ...manualForm, level: e.target.value as QuestionLevel })}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs"
                  >
                    {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chủ đề bài học</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Phép nhân trong phạm vi 1000"
                  value={manualForm.topic}
                  onChange={(e) => setManualForm({ ...manualForm, topic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nội dung câu hỏi *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Nhập nội dung câu hỏi..."
                  value={manualForm.questionText}
                  onChange={(e) => setManualForm({ ...manualForm, questionText: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600">Lựa chọn A</label>
                  <input
                    type="text"
                    placeholder="Đáp án A"
                    value={manualForm.optionA}
                    onChange={(e) => setManualForm({ ...manualForm, optionA: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600">Lựa chọn B</label>
                  <input
                    type="text"
                    placeholder="Đáp án B"
                    value={manualForm.optionB}
                    onChange={(e) => setManualForm({ ...manualForm, optionB: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600">Lựa chọn C</label>
                  <input
                    type="text"
                    placeholder="Đáp án C"
                    value={manualForm.optionC}
                    onChange={(e) => setManualForm({ ...manualForm, optionC: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600">Lựa chọn D</label>
                  <input
                    type="text"
                    placeholder="Đáp án D"
                    value={manualForm.optionD}
                    onChange={(e) => setManualForm({ ...manualForm, optionD: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Đáp án đúng</label>
                  <select
                    value={manualForm.correctAnswer}
                    onChange={(e) => setManualForm({ ...manualForm, correctAnswer: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  >
                    <option value="A">Lựa chọn A</option>
                    <option value="B">Lựa chọn B</option>
                    <option value="C">Lựa chọn C</option>
                    <option value="D">Lựa chọn D</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hướng dẫn giải thích</label>
                  <input
                    type="text"
                    placeholder="Giải thích ngắn gọn..."
                    value={manualForm.explanation}
                    onChange={(e) => setManualForm({ ...manualForm, explanation: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#3730A3] hover:bg-indigo-900"
                >
                  Lưu vào Ngân hàng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingQuestionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h4 className="text-base font-bold text-slate-900">Xác nhận xóa câu hỏi</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc muốn xóa câu hỏi này khỏi ngân hàng?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingQuestionId(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmDeleteQuestion}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700"
              >
                Xóa câu hỏi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
