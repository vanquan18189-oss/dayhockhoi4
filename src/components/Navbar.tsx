import React, { useState } from 'react';
import { 
  Menu, 
  Sparkles, 
  Key, 
  CheckCircle2, 
  UserCheck, 
  ShieldCheck, 
  GraduationCap,
  LogIn,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  onOpenMobileSidebar: () => void;
  activeModuleName: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenMobileSidebar,
  activeModuleName
}) => {
  const { 
    currentUser, 
    switchRole, 
    apiKey, 
    setApiKey,
    firebaseUser,
    handleGoogleSignIn,
    handleSignOut,
    connectionError
  } = useAuth();
  
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);

  return (
    <>
      {/* Firebase Status Connection Banner if error or notice */}
      {connectionError && (
        <div className="bg-amber-500 text-white text-xs px-4 py-2 font-medium flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{connectionError}</span>
          </div>
          <span className="text-[10px] font-mono opacity-80">Dự án: dayhockhoi4-fb50c</span>
        </div>
      )}

      <header className="h-20 bg-white border-b border-slate-200/80 px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        {/* Left: Mobile Menu Trigger + Active Section Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={onOpenMobileSidebar}
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Mở menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div>
            <span className="text-[11px] font-semibold tracking-wider text-indigo-600 uppercase">Phân hệ</span>
            <h2 className="text-base lg:text-lg font-bold text-slate-900 leading-none">{activeModuleName}</h2>
          </div>
        </div>

        {/* Right: Gemini AI Badge + Firebase Auth + Role Switcher */}
        <div className="flex items-center gap-2 lg:gap-3">
          {/* Gemini AI Status Badge */}
          <button
            onClick={() => setShowKeyModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            title="Trạng thái Gemini AI API Key"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span className="hidden md:inline">Gemini AI</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </button>

          {/* Google Authentication Button */}
          {firebaseUser ? (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
              title="Đăng xuất Firebase Google"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline truncate max-w-[120px]">{firebaseUser.displayName || firebaseUser.email}</span>
            </button>
          ) : (
            <button
              onClick={handleGoogleSignIn}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors"
              title="Đăng nhập bằng Google Firebase"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Đăng nhập Google</span>
            </button>
          )}

          {/* Role Quick Switcher */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80">
            <button
              onClick={() => switchRole('teacher')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                currentUser.role === 'teacher' 
                  ? 'bg-[#3730A3] text-white shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Chuyển sang góc nhìn Giáo viên"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Giáo viên</span>
            </button>
            <button
              onClick={() => switchRole('student')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                currentUser.role === 'student' 
                  ? 'bg-[#3730A3] text-white shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Chuyển sang góc nhìn Học sinh"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Học sinh</span>
            </button>
            <button
              onClick={() => switchRole('admin')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                currentUser.role === 'admin' 
                  ? 'bg-[#3730A3] text-white shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Góc nhìn Quản trị viên"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Quản trị</span>
            </button>
          </div>
        </div>
      </header>

      {/* Gemini API Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Cấu hình Gemini API</h3>
                <p className="text-xs text-slate-500">Kết nối Firebase project: dayhockhoi4-fb50c</p>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 mb-4 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Đã kích hoạt khóa Gemini API tự động!</p>
                <p className="mt-0.5">Khóa AI đã được tự động kết nối qua môi trường máy chủ bảo mật Google AI Studio.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4">
              Nếu bạn có khóa Gemini API riêng muốn dùng thử, có thể nhập bên dưới:
            </p>

            <input
              type="password"
              placeholder="Dán API Key (Ví dụ: AIzaSy...)"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:border-indigo-600 mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  setApiKey(tempKey);
                  setShowKeyModal(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#3730A3] hover:bg-indigo-900"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
