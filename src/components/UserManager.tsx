import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  GraduationCap, 
  UserCheck, 
  Search, 
  Filter, 
  Trash2, 
  Edit3, 
  X,
  Plus
} from 'lucide-react';
import { UserProfile, UserRole, GRADE_OPTIONS, CLASS_OPTIONS } from '../types';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

interface UserManagerProps {
  onActivityAdded: (desc: string) => void;
}

export const UserManager: React.FC<UserManagerProps> = ({ onActivityAdded }) => {
  const { usersList, setCurrentUser } = useAuth();
  const [localUsers, setLocalUsers] = useState<UserProfile[]>(usersList);
  const [selectedRole, setSelectedRole] = useState<string>('Tất cả');
  const [selectedGrade, setSelectedGrade] = useState<string>('Tất cả');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [deletingUser, setDeletingUser] = useState<{ uid: string; name: string } | null>(null);

  // Form State
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    role: 'student' as UserRole,
    grade: 'Khối 4',
    className: 'Lớp 4A'
  });

  // Handle Add User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.displayName.trim()) return;

    const newUser: UserProfile = {
      uid: `u_${Date.now()}`,
      displayName: form.displayName,
      email: form.email || `${form.displayName.toLowerCase().replace(/\s+/g, '')}@student.edu.vn`,
      role: form.role,
      grade: form.grade,
      className: form.className
    };

    try {
      const colRef = collection(db, 'users');
      await addDoc(colRef, newUser);
    } catch (err) {
      console.warn('Firestore note:', err);
    }

    setLocalUsers(prev => [newUser, ...prev]);
    setIsModalOpen(false);
    onActivityAdded(`Đã thêm tài khoản người dùng mới: ${form.displayName} (${form.role === 'teacher' ? 'Giáo viên' : 'Học sinh'})`);

    // Reset Form
    setForm({
      displayName: '',
      email: '',
      role: 'student',
      grade: 'Khối 4',
      className: 'Lớp 4A'
    });
  };

  // Delete User
  const handleDelete = (uid: string, name: string) => {
    setDeletingUser({ uid, name });
  };

  const confirmDeleteUser = () => {
    if (!deletingUser) return;
    setLocalUsers(prev => prev.filter(u => u.uid !== deletingUser.uid));
    onActivityAdded(`Đã xóa tài khoản người dùng: ${deletingUser.name}`);
    setDeletingUser(null);
  };

  // Filtered List
  const filteredUsers = localUsers.filter(u => {
    const matchesSearch = u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole === 'Tất cả' || u.role === selectedRole;
    const matchesGrade = selectedGrade === 'Tất cả' || u.grade === selectedGrade;
    return matchesSearch && matchesRole && matchesGrade;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-[#3730A3]" />
            Quản Lý Người Dùng & Danh Sách Học Sinh
          </h2>
          <p className="text-xs text-slate-500 mt-1">Phân quyền vai trò: Quản trị (Admin) • Giáo viên • Học sinh (Khối 4)</p>
        </div>

        {/* Accent Orange Primary Action */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#F97316] hover:bg-orange-600 transition-all shadow-md shadow-orange-600/30 active:scale-98"
        >
          <UserPlus className="w-4 h-4" />
          <span>Thêm học sinh / giáo viên</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo họ tên hoặc email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#3730A3]"
          />
        </div>

        <div>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="w-full py-2 px-3 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:border-[#3730A3] bg-slate-50"
          >
            <option value="Tất cả">Tất cả vai trò</option>
            <option value="teacher">Giáo viên</option>
            <option value="student">Học sinh</option>
            <option value="admin">Quản trị viên</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">Họ và tên</th>
                <th className="p-4">Email</th>
                <th className="p-4">Vai trò</th>
                <th className="p-4">Khối / Lớp</th>
                <th className="p-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {filteredUsers.map((user) => {
                const roleBadge = {
                  teacher: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                  student: 'bg-amber-100 text-amber-800 border-amber-200',
                  admin: 'bg-purple-100 text-purple-800 border-purple-200'
                }[user.role];

                return (
                  <tr key={user.uid} className="hover:bg-slate-50">
                    <td className="p-4 font-bold text-slate-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-[#3730A3] font-bold text-xs flex items-center justify-center">
                        {user.displayName.charAt(0)}
                      </div>
                      <span>{user.displayName}</span>
                    </td>
                    <td className="p-4 text-slate-600">{user.email}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${roleBadge}`}>
                        {user.role === 'teacher' ? 'Giáo viên' : user.role === 'student' ? 'Học sinh' : 'Quản trị'}
                      </span>
                    </td>
                    <td className="p-4 font-semibold text-slate-700">
                      {user.className || user.grade || '—'}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleDelete(user.uid, user.displayName)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Xóa người dùng"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-base">Thêm Người Dùng Mới</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  placeholder="Nhập họ và tên..."
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Địa chỉ Email</label>
                <input
                  type="email"
                  placeholder="Ví dụ: student@tieuhoc.edu.vn"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-[#3730A3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vai trò</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                  >
                    <option value="student">Học sinh</option>
                    <option value="teacher">Giáo viên</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Lớp học</label>
                  <select
                    value={form.className}
                    onChange={(e) => setForm({ ...form, className: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                  >
                    {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
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
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#3730A3] hover:bg-indigo-900"
                >
                  Tạo người dùng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h4 className="text-base font-bold text-slate-900">Xác nhận xóa người dùng</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc muốn xóa người dùng <span className="font-bold text-slate-900">"{deletingUser.name}"</span>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700"
              >
                Xóa người dùng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
