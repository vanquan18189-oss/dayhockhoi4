import { LessonPlan, Question, ExamMatrix, HomeworkAssignment, StudentReport, ActivityLog, UserProfile } from '../types';

export const INITIAL_USERS: UserProfile[] = [
  { uid: 'u_teacher1', displayName: 'Thầy Nguyễn Văn Minh', email: 'nguyenvanminh@tieuhoc.edu.vn', role: 'teacher', grade: 'Khối 4', className: 'Lớp 4A' },
  { uid: 'u_teacher2', displayName: 'Cô Trần Thị Hương', email: 'tranthihuong@tieuhoc.edu.vn', role: 'teacher', grade: 'Khối 4', className: 'Lớp 4B' },
  { uid: 'u_admin', displayName: 'Ban Giám Hiệu (Admin)', email: 'admin@tieuhoc.edu.vn', role: 'admin' },
  { uid: 'u_student1', displayName: 'Lê Hoàng Nam', email: 'hoangnam@student.edu.vn', role: 'student', grade: 'Khối 4', className: 'Lớp 4A' },
  { uid: 'u_student2', displayName: 'Phạm Minh Anh', email: 'minhanh@student.edu.vn', role: 'student', grade: 'Khối 4', className: 'Lớp 4A' },
  { uid: 'u_student3', displayName: 'Vũ Đức Trí', email: 'ductri@student.edu.vn', role: 'student', grade: 'Khối 4', className: 'Lớp 4B' },
  { uid: 'u_student4', displayName: 'Nguyễn Bích Ngọc', email: 'bichngoc@student.edu.vn', role: 'student', grade: 'Khối 4', className: 'Lớp 4B' },
  { uid: 'u_student5', displayName: 'Đặng Tuấn Kiệt', email: 'tuankiet@student.edu.vn', role: 'student', grade: 'Khối 4', className: 'Lớp 4A' },
];

export const INITIAL_LESSON_PLANS: LessonPlan[] = [
  {
    id: 'lp_1',
    title: 'Phép nhân trong phạm vi 1000 - Bài 12',
    subject: 'Toán',
    grade: 'Khối 4',
    durationMinutes: 40,
    warmup: 'Cho cả lớp hát bài "Tập đếm nhảy dỗ". Giáo viên tổ chức trò chơi "Đố bạn": Đố nhanh các phép nhân trong bảng 2, 3, 4, 5. Học sinh trả lời giơ bảng con.',
    exploration: 'Giáo viên chiếu tranh minh họa 3 hàng cây, mỗi hàng có 4 cây. Đặt câu hỏi gợi mở cho học sinh tìm tổng số cây theo cách cộng và cách nhân (4 + 4 + 4 = 4 x 3 = 12). Hướng dẫn học sinh thao tác trên bộ đồ dùng học tập.',
    practice: 'Học sinh làm bài tập 1 và 2 trong Sách giáo khoa vào vở bài tập. Làm việc theo cặp đôi để kiểm tra kết quả. Giáo viên đi từng bàn hỗ trợ các em học sinh còn lúng túng.',
    application: 'Liên hệ thực tế: Đố em tính tổng số bánh trong 5 hộp bánh, biết mỗi hộp có 6 chiếc bánh. Giáo viên dặn dò học sinh về nhà thực hành đố bố mẹ.',
    createdBy: 'u_teacher1',
    authorName: 'Thầy Nguyễn Văn Minh',
    createdAt: '2026-11-05T08:00:00Z',
  },
  {
    id: 'lp_2',
    title: 'Mở rộng vốn từ: Cảnh đẹp quê hương',
    subject: 'Tiếng Việt',
    grade: 'Khối 4',
    durationMinutes: 40,
    warmup: 'Cho học sinh quan sát slide hình ảnh về Vịnh Hạ Long, Hồ Hoàn Kiếm, Cánh đồng lúa chín. Yêu cầu học sinh nêu 1 từ miêu tả vẻ đẹp em thấy.',
    exploration: 'Giáo viên giới thiệu các nhóm từ chỉ cảnh đẹp (hùng vĩ, thơ mộng, bạt ngàn, trù phú...). Học sinh thảo luận nhóm 4 để phân loại từ ngữ theo chủ đề.',
    practice: 'Học sinh đặt câu có sử dụng từ vừa học vào vở. 3 học sinh lên bảng lớp viết câu. Cả lớp cùng nhận xét, sửa lỗi dùng từ và chính tả.',
    application: 'Viết 2-3 câu ngắn miêu tả cảnh đẹp nơi em đang sống hoặc một nơi em từng được đi tham quan.',
    createdBy: 'u_teacher1',
    authorName: 'Thầy Nguyễn Văn Minh',
    createdAt: '2026-11-08T09:30:00Z',
  },
  {
    id: 'lp_3',
    title: 'Sử dụng Internet an toàn và hiệu quả',
    subject: 'Tin học',
    grade: 'Khối 4',
    durationMinutes: 35,
    warmup: 'Xem video hoạt hình ngắn về cậu bé Miu gặp người lạ trên mạng Internet.',
    exploration: 'Giáo viên nêu các quy tắc vàng: Không chia sẻ mật khẩu, không đăng ảnh cá nhân khi chưa hỏi bố mẹ, không bấm vào liên kết lạ.',
    practice: 'Thực hành xử lý tình huống sắm vai trên máy tính theo nhóm.',
    application: 'Thiết kế một tấm thiệp nhắc nhở quy tắc an toàn mạng cho gia đình.',
    createdBy: 'u_teacher2',
    authorName: 'Cô Trần Thị Hương',
    createdAt: '2026-11-10T14:15:00Z',
  }
];

export const INITIAL_QUESTIONS: Question[] = [
  // Toán
  {
    id: 'q_1',
    subject: 'Toán',
    grade: 'Khối 4',
    topic: 'Bảng nhân và bảng chia',
    level: 'Nhận biết',
    type: 'choice',
    questionText: 'Kết quả của phép tính 6 x 7 là bao nhiêu?',
    options: ['A. 36', 'B. 42', 'C. 48', 'D. 54'],
    correctAnswer: 'B. 42',
    explanation: 'Dựa vào Bảng nhân 6: 6 x 7 = 42.',
    createdBy: 'u_teacher1',
    createdAt: '2026-11-01T10:00:00Z'
  },
  {
    id: 'q_2',
    subject: 'Toán',
    grade: 'Khối 4',
    topic: 'Giải toán có lời văn',
    level: 'Thông hiểu',
    type: 'choice',
    questionText: 'Mỗi hộp bánh có 8 chiếc bánh. Hỏi 5 hộp bánh như thế có tất cả bao nhiêu chiếc bánh?',
    options: ['A. 35 chiếc', 'B. 40 chiếc', 'C. 45 chiếc', 'D. 13 chiếc'],
    correctAnswer: 'B. 40 chiếc',
    explanation: 'Số chiếc bánh trong 5 hộp là: 8 x 5 = 40 (chiếc).',
    createdBy: 'u_teacher1',
    createdAt: '2026-11-02T11:20:00Z'
  },
  {
    id: 'q_3',
    subject: 'Toán',
    grade: 'Khối 4',
    topic: 'Hình học tiểu học',
    level: 'Vận dụng',
    type: 'choice',
    questionText: 'Một hình chữ nhật có chiều dài 12 cm, chiều rộng 8 cm. Chu vi của hình chữ nhật đó là:',
    options: ['A. 20 cm', 'B. 40 cm', 'C. 96 cm', 'D. 48 cm'],
    correctAnswer: 'B. 40 cm',
    explanation: 'Chu vi hình chữ nhật = (Chiều dài + Chiều rộng) x 2 = (12 + 8) x 2 = 40 (cm).',
    createdBy: 'u_teacher1',
    createdAt: '2026-11-03T14:00:00Z'
  },
  {
    id: 'q_4',
    subject: 'Toán',
    grade: 'Khối 4',
    topic: 'Tìm số chưa biết',
    level: 'Vận dụng cao',
    type: 'essay',
    questionText: 'Tìm một số biết rằng lấy số đó nhân với 4 rồi cộng với 15 thì được kết quả bằng 55.',
    options: [],
    correctAnswer: 'Số cần tìm là 10. Cách làm: Lấy (55 - 15) : 4 = 40 : 4 = 10.',
    explanation: 'Gọi số cần tìm là X. Ta có: X x 4 + 15 = 55 => X x 4 = 40 => X = 10.',
    createdBy: 'u_teacher1',
    createdAt: '2026-11-04T09:00:00Z'
  },

  // Tiếng Việt
  {
    id: 'q_5',
    subject: 'Tiếng Việt',
    grade: 'Khối 4',
    topic: 'Từ chỉ sự vật, hoạt động',
    level: 'Nhận biết',
    type: 'choice',
    questionText: 'Từ nào sau đây là từ chỉ hoạt động của học sinh?',
    options: ['A. Bàn học', 'B. Đọc sách', 'C. Thước kẻ', 'D. Trường học'],
    correctAnswer: 'B. Đọc sách',
    explanation: '"Đọc sách" là từ chỉ hành động/hoạt động.',
    createdBy: 'u_teacher1',
    createdAt: '2026-11-05T10:15:00Z'
  },
  {
    id: 'q_6',
    subject: 'Tiếng Việt',
    grade: 'Khối 4',
    topic: 'Biện pháp so sánh',
    level: 'Thông hiểu',
    type: 'choice',
    questionText: 'Trong câu "Mặt trời đỏ rực như một quả bóng khổng lồ", từ so sánh là từ nào?',
    options: ['A. Đỏ rực', 'B. Như', 'C. Quả bóng', 'D. Mặt trời'],
    correctAnswer: 'B. Như',
    explanation: 'Từ "như" dùng để nối 2 hình ảnh so sánh.',
    createdBy: 'u_teacher1',
    createdAt: '2026-11-06T11:00:00Z'
  },

  // Tin học
  {
    id: 'q_7',
    subject: 'Tin học',
    grade: 'Khối 4',
    topic: 'Thiết bị máy tính',
    level: 'Nhận biết',
    type: 'choice',
    questionText: 'Thiết bị nào sau đây dùng để nhập dữ liệu chữ và số vào máy tính?',
    options: ['A. Màn hình', 'B. Bàn phím', 'C. Loa', 'D. Máy in'],
    correctAnswer: 'B. Bàn phím',
    explanation: 'Bàn phím là thiết bị vào cơ bản dùng để nhập ký tự.',
    createdBy: 'u_teacher2',
    createdAt: '2026-11-07T15:30:00Z'
  },
  {
    id: 'q_8',
    subject: 'Tin học',
    grade: 'Khối 4',
    topic: 'An toàn thông tin',
    level: 'Vận dụng',
    type: 'choice',
    questionText: 'Khi gặp tin nhắn từ người lạ yêu cầu gửi thông tin cá nhân và số điện thoại của bố mẹ, em nên làm gì?',
    options: [
      'A. Gửi ngay lập tức',
      'B. Không trả lời và báo ngay cho bố mẹ hoặc giáo viên',
      'C. Trò chuyện tiếp xem là ai',
      'D. Chia sẻ cho bạn bè cùng biết'
    ],
    correctAnswer: 'B. Không trả lời và báo ngay cho bố mẹ hoặc giáo viên',
    explanation: 'Không bao giờ chia sẻ thông tin cá nhân cho người lạ trên mạng.',
    createdBy: 'u_teacher2',
    createdAt: '2026-11-08T16:00:00Z'
  }
];

export const INITIAL_EXAM_MATRICES: ExamMatrix[] = [
  {
    id: 'em_1',
    title: 'Đề kiểm tra Giữa Học kỳ I - Môn Toán Lớp 4',
    subject: 'Toán',
    grade: 'Khối 4',
    semester: 'Học kỳ I • 2026-2027',
    durationMinutes: 40,
    totalQuestions: 10,
    breakdown: {
      knowledge: 4,      // 40% Nhận biết
      comprehension: 3,  // 30% Thông hiểu
      application: 2,    // 20% Vận dụng
      highApplication: 1 // 10% Vận dụng cao
    },
    testCodes: [
      {
        code: '101',
        questions: INITIAL_QUESTIONS.slice(0, 4)
      },
      {
        code: '102',
        questions: [...INITIAL_QUESTIONS.slice(0, 4)].reverse()
      }
    ],
    createdBy: 'u_teacher1',
    createdAt: '2026-11-09T09:00:00Z'
  }
];

export const INITIAL_HOMEWORK: HomeworkAssignment[] = [
  {
    id: 'hw_1',
    title: 'Bài tập ôn tập Bảng nhân 6 và Bảng chia 6',
    subject: 'Toán',
    grade: 'Khối 4',
    className: 'Lớp 4A',
    deadline: '2026-11-15T23:59',
    questions: INITIAL_QUESTIONS.filter(q => q.subject === 'Toán').slice(0, 3),
    status: 'active',
    createdBy: 'u_teacher1',
    createdAt: '2026-11-10T08:00:00Z'
  },
  {
    id: 'hw_2',
    title: 'Luyện từ và câu: Tìm từ chỉ hoạt động và hình ảnh so sánh',
    subject: 'Tiếng Việt',
    grade: 'Khối 4',
    className: 'Lớp 4A',
    deadline: '2026-11-18T23:59',
    questions: INITIAL_QUESTIONS.filter(q => q.subject === 'Tiếng Việt'),
    status: 'active',
    createdBy: 'u_teacher1',
    createdAt: '2026-11-11T07:00:00Z'
  }
];

export const INITIAL_STUDENT_REPORTS: StudentReport[] = [
  {
    id: 'sr_1',
    studentId: 'u_student1',
    studentName: 'Lê Hoàng Nam',
    className: 'Lớp 4A',
    grade: 'Khối 4',
    semester: 'Học kỳ I',
    academicYear: '2026-2027',
    subjectScores: {
      'Toán': { score: 9.0, assessment: 'Hoàn thành tốt' },
      'Tiếng Việt': { score: 8.5, assessment: 'Hoàn thành tốt' },
      'Tin học': { score: 9.5, assessment: 'Hoàn thành tốt' },
      'Tiếng Anh': { score: 8.0, assessment: 'Hoàn thành tốt' },
      'Tự nhiên & Xã hội': { score: 9.0, assessment: 'Hoàn thành tốt' }
    },
    overallAssessment: 'Hoàn thành tốt',
    capacityRating: 'Tự chủ, tự học tốt; có khả năng tính toán nhanh nhẹn và hợp tác nhóm tích cực.',
    qualityRating: 'Chăm chỉ học tập, lễ phép với thầy cô, hòa đồng giúp đỡ bạn bè trong lớp.',
    aiCommentSuggestion: 'Học sinh Lê Hoàng Nam có tư duy Toán học rất tốt, tiếp thu bài nhanh. Cần phát huy thêm sự cẩn thận khi làm bài tự luận dài.',
    teacherComment: 'Con ngoan, học giỏi, năng nổ phát biểu bài. Gia đình tiếp tục động viên con duy trì phong độ.',
    updatedAt: '2026-11-10T10:00:00Z'
  },
  {
    id: 'sr_2',
    studentId: 'u_student2',
    studentName: 'Phạm Minh Anh',
    className: 'Lớp 4A',
    grade: 'Khối 4',
    semester: 'Học kỳ I',
    academicYear: '2026-2027',
    subjectScores: {
      'Toán': { score: 7.5, assessment: 'Hoàn thành' },
      'Tiếng Việt': { score: 9.0, assessment: 'Hoàn thành tốt' },
      'Tin học': { score: 8.0, assessment: 'Hoàn thành tốt' },
      'Tiếng Anh': { score: 8.5, assessment: 'Hoàn thành tốt' },
      'Tự nhiên & Xã hội': { score: 8.5, assessment: 'Hoàn thành tốt' }
    },
    overallAssessment: 'Hoàn thành tốt',
    capacityRating: 'Giao tiếp tự tin, khả năng diễn đạt Tiếng Việt mạch lạc phong phú.',
    qualityRating: 'Trung thực, có trách nhiệm với nhiệm vụ lớp giao.',
    aiCommentSuggestion: 'Em Phạm Minh Anh viết văn hay, giàu cảm xúc. Cần rèn luyện thêm kỹ năng giải toán có lời văn 2 phép tính.',
    teacherComment: 'Con có nhiều tiến bộ trong môn Tiếng Việt. Cần cẩn thận hơn trong môn Toán.',
    updatedAt: '2026-11-10T11:30:00Z'
  },
  {
    id: 'sr_3',
    studentId: 'u_student3',
    studentName: 'Vũ Đức Trí',
    className: 'Lớp 4A',
    grade: 'Khối 4',
    semester: 'Học kỳ I',
    academicYear: '2026-2027',
    subjectScores: {
      'Toán': { score: 6.5, assessment: 'Hoàn thành' },
      'Tiếng Việt': { score: 6.0, assessment: 'Hoàn thành' },
      'Tin học': { score: 8.0, assessment: 'Hoàn thành tốt' },
      'Tiếng Anh': { score: 7.0, assessment: 'Hoàn thành' },
      'Tự nhiên & Xã hội': { score: 7.0, assessment: 'Hoàn thành' }
    },
    overallAssessment: 'Hoàn thành',
    capacityRating: 'Có ý thức tập trung trong giờ học, tích cực trong các môn trải nghiệm.',
    qualityRating: 'Thật thà, yêu thương bạn bè, chấp hành tốt nội quy trường lớp.',
    aiCommentSuggestion: 'Em Vũ Đức Trí có khả năng tiếp thu khá. Cần dành thêm thời gian ôn tập đọc hiểu và bảng nhân chia tại nhà.',
    teacherComment: 'Cần chú ý tập trung hơn trong giờ Tiếng Việt để cải thiện tốc độ viết.',
    updatedAt: '2026-11-10T12:00:00Z'
  }
];

export const INITIAL_ACTIVITIES: ActivityLog[] = [
  {
    id: 'act_1',
    userDisplayName: 'Thầy Nguyễn Văn Minh',
    userRole: 'Giáo viên',
    actionType: 'Soạn bài giảng',
    description: 'Vừa soạn bài giảng "Phép nhân trong phạm vi 1000" với gợi ý Gemini AI',
    createdAt: 'Vừa xong'
  },
  {
    id: 'act_2',
    userDisplayName: 'Cô Trần Thị Hương',
    userRole: 'Giáo viên',
    actionType: 'Tạo đề kiểm tra',
    description: 'Vừa tạo Ma trận đề kiểm tra Giữa Kỳ I môn Tin học Khối 4',
    createdAt: '15 phút trước'
  },
  {
    id: 'act_3',
    userDisplayName: 'Lê Hoàng Nam',
    userRole: 'Học sinh',
    actionType: 'Nộp bài tập',
    description: 'Đã hoàn thành bài tập "Ôn tập Bảng nhân 6" đạt điểm 10/10',
    createdAt: '1 giờ trước'
  },
  {
    id: 'act_4',
    userDisplayName: 'Ban Giám Hiệu',
    userRole: 'Quản trị',
    actionType: 'Duyệt sổ tổng kết',
    description: 'Đã phê duyệt Học bạ số và Sổ tổng kết Học kỳ I Lớp 4A',
    createdAt: '3 giờ trước'
  }
];
