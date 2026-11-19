export interface TeacherRecord {
  id: string;
  name: string;            // Họ và tên giáo viên (Ví dụ: Cô Hà Thị Trâm)
  email: string;           // Thư điện tử liên hệ
  role: string;            // Vai trò (Tổ trưởng, Giáo viên, Hiệu trưởng...)
  subject: string;         // Môn học phụ trách
  status: 'active' | 'locked'; // Trạng thái hoạt động
  dob?: string;            // Ngày sinh (dd/mm/yyyy)
  phone?: string;          // Số điện thoại liên hệ (SĐT)
  sddcn?: string;          // Số định danh cá nhân (CCCD/CMND)
  toChuyenMon: string;     // Tổ chuyên môn (Tổ 1, Tổ 2+3, Tổ 4+5, Tổ Chuyên biệt)
  nhomGvCn?: string;       // Nhóm Giáo viên chủ nhiệm / Phụ trách khối (Ví dụ: GV Chủ nhiệm Lớp 4A, GV Khối 4)
  homeroomClasses?: string[]; // Danh sách lớp chủ nhiệm
  teachingClasses?: string[]; // Danh sách lớp giảng dạy bộ môn
  avatar?: string;         // Đường dẫn ảnh hoặc icon linh vật
  teachingAssignments?: Array<{ subject: string; classes: string[] }>; // Danh sách cặp môn học - các lớp giảng dạy
  lopDay?: string[]; // Mảng tên các lớp được phân công dạy bộ môn
  lopChuNhiem?: string; // Tên lớp chủ nhiệm
}

// Danh sách dữ liệu giáo viên chi tiết toàn trường TH Quang Hưng PK1:
export const initialTeachersList: TeacherRecord[] = [
  {
    id: 'gv-01',
    name: 'Hà Thị Trâm',
    email: 'hathiram@gmail.com',
    role: 'Tổ trưởng chuyên môn',
    subject: 'Toán & Tiếng Việt (Khối 1)',
    status: 'active',
    dob: '15/08/1985',
    phone: '0982957979',
    sddcn: '036175020668',
    toChuyenMon: 'Tổ 1',
    nhomGvCn: 'GVCN Lớp 1A - Trưởng nhóm Khối 1',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-02',
    name: 'Lưu Thị Minh',
    email: 'luuminh@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Tiếng Việt & Đạo đức',
    status: 'active',
    dob: '22/11/1990',
    phone: '0912345678',
    sddcn: '038316001234',
    toChuyenMon: 'Tổ 1',
    nhomGvCn: 'Thành viên Khối 1',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-03',
    name: 'Bùi Thị Yến',
    email: 'buiyen@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Toán & Tự nhiên Xã hội',
    status: 'active',
    dob: '10/05/1988',
    phone: '0978123456',
    sddcn: '034189004567',
    toChuyenMon: 'Tổ 2',
    nhomGvCn: 'GVCN Lớp 2A - Nhóm Khối 2',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-04',
    name: 'Phạm Thị Thanh Thảo',
    email: 'thanhthao@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Công nghệ & Tin học',
    status: 'active',
    dob: '05/09/1992',
    phone: '0935678912',
    sddcn: '031192008910',
    toChuyenMon: 'Tổ 3',
    nhomGvCn: 'GVCN Lớp 3A - Nhóm Khối 3',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-05',
    name: 'Trần Hữu Ích',
    email: 'tranhuuich@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Khoa học & Lịch sử Địa lý',
    status: 'active',
    dob: '12/12/1984',
    phone: '0905123789',
    sddcn: '030184003456',
    toChuyenMon: 'Tổ 4',
    nhomGvCn: 'GVCN Lớp 4C - Nhóm Khối 4',
    avatar: '👨‍🏫'
  },
  {
    id: 'gv-06',
    name: 'Trần Thị Diễm Hương',
    email: 'diemhuong@gmail.com',
    role: 'Tổ trưởng chuyên môn',
    subject: 'Toán & Tiếng Việt (Khối 5)',
    status: 'active',
    dob: '28/03/1983',
    phone: '0979888777',
    sddcn: '032183009988',
    toChuyenMon: 'Tổ 5',
    nhomGvCn: 'GVCN Lớp 5D - Trưởng nhóm Khối 5',
    avatar: '👩‍🏫',
    homeroomClasses: ['Lớp 5D', 'Lớp 5C'],
    teachingClasses: ['Lớp 5D', 'Lớp 5C']
  },
  {
    id: 'gv-07',
    name: 'Nguyễn Thị Lê',
    email: 'nguyenle@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Tiếng Anh',
    status: 'active',
    dob: '19/07/1995',
    phone: '0963111222',
    sddcn: '037195001122',
    toChuyenMon: 'Tổ 5',
    nhomGvCn: 'Thành viên Khối 5',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-08',
    name: 'Đặng Văn Hùng',
    email: 'dangtanhung@gmail.com',
    role: 'Hiệu trưởng (BGH)',
    subject: 'Quản lý & Giảng dạy',
    status: 'active',
    dob: '02/01/1978',
    phone: '0913000999',
    sddcn: '030178001100',
    toChuyenMon: 'Tổ Ban Giám Hiệu',
    nhomGvCn: 'Ban Giám Hiệu Nhà Trường',
    avatar: '👨‍💼'
  },
  {
    id: 'gv-09',
    name: 'Đồng Thị Tâm',
    email: 'dongtam@gmail.com',
    role: 'Giáo viên bộ môn',
    subject: 'Âm nhạc & Mỹ thuật',
    status: 'active',
    dob: '25/10/1991',
    phone: '0988555444',
    sddcn: '035191007788',
    toChuyenMon: 'Tổ 4',
    nhomGvCn: 'Nhóm GV Chuyên (Nghệ thuật)',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-10',
    name: 'Nguyễn Thị Thủ',
    email: 'thuthuthtk@gmail.com',
    role: 'Quản trị viên (ADMIN)',
    subject: 'Tin học & CNTT',
    status: 'active',
    dob: '01/01/1989',
    phone: '0982957979',
    sddcn: '036189005566',
    toChuyenMon: 'Tổ Ban Giám Hiệu',
    nhomGvCn: 'Quản trị hệ thống Dạy và Học Số PK Trực Khang',
    avatar: '👩‍🏫'
  },
  {
    id: 'gv-11',
    name: 'Thầy Nguyễn Văn Quân',
    email: 'vanquan18189@gmail.com',
    role: 'Tổ trưởng chuyên môn & Quản trị',
    subject: 'Tin học & Khoa học',
    status: 'active',
    dob: '18/01/1989',
    phone: '0985608063',
    sddcn: '038189001889',
    toChuyenMon: 'Tổ Ban Giám Hiệu',
    nhomGvCn: 'Phụ trách Khối 4 & Tin học Nhà Trường',
    avatar: '👨‍🏫'
  },
  {
    id: 'gv-12',
    name: 'Bùi Thị Tuyến',
    email: 'buituyentk@gmail.com',
    role: 'Tổ trưởng chuyên môn',
    subject: 'Toán & Tiếng Việt (Khối 2+3)',
    status: 'active',
    dob: '14/06/1987',
    phone: '0983112233',
    sddcn: '034187002233',
    toChuyenMon: 'Tổ 3',
    nhomGvCn: 'GVCN Lớp 2B - Tổ trưởng 2+3',
    avatar: '👩‍🏫'
  }
];
