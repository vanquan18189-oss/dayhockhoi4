import React, { useState, useEffect } from 'react';
import { 
  Gamepad2, 
  Bell, 
  Layers, 
  Sparkles, 
  Trophy, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  Volume2, 
  ArrowRight,
  Flame,
  Award,
  Star,
  Play
} from 'lucide-react';
import { Question } from '../types';
import confetti from 'canvas-confetti';

interface LearningGamesProps {
  questionBank: Question[];
  onActivityAdded: (desc: string) => void;
}

// Web Audio API Synthesizer for instant game sound effects
const playSoundEffect = (type: 'correct' | 'wrong' | 'victory' | 'flip') => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'correct') {
      // Pleasant dual tone chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start(ctx.currentTime + 0.1);
      osc1.stop(ctx.currentTime + 0.4);
      osc2.stop(ctx.currentTime + 0.4);
    } else if (type === 'wrong') {
      // Low buzzer
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'victory') {
      // Fanfare sequence
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.12 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.12);
        osc.stop(ctx.currentTime + idx * 0.12 + 0.3);
      });
    }
  } catch (e) {
    console.warn('Audio note:', e);
  }
};

export const LearningGames: React.FC<LearningGamesProps> = ({
  questionBank,
  onActivityAdded
}) => {
  const [activeGameTab, setActiveGameTab] = useState<'golden_bell' | 'flashcards'>('golden_bell');

  // Rung Chuông Vàng State
  const [bellQuestions, setBellQuestions] = useState<Question[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isGameFinished, setIsGameFinished] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [isTimerActive, setIsTimerActive] = useState(false);

  // Flashcards State
  const [flashcardIdx, setFlashcardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Initialize Game Data from Question Bank
  useEffect(() => {
    if (questionBank.length > 0) {
      const choiceOnly = questionBank.filter(q => q.type === 'choice');
      setBellQuestions(choiceOnly.length > 0 ? choiceOnly : questionBank);
    }
  }, [questionBank]);

  // Timer Countdown for Rung Chuông Vàng
  useEffect(() => {
    let interval: any = null;
    if (isTimerActive && timerSeconds > 0 && !isAnswered) {
      interval = setInterval(() => {
        setTimerSeconds(prev => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0 && !isAnswered && isTimerActive) {
      handleSelectAnswer(''); // Time out
    }
    return () => clearInterval(interval);
  }, [isTimerActive, timerSeconds, isAnswered]);

  // Start Rung Chuông Vàng
  const handleStartGoldenBell = () => {
    const choiceOnly = questionBank.filter(q => q.type === 'choice');
    const shuffled = [...(choiceOnly.length > 0 ? choiceOnly : questionBank)].sort(() => Math.random() - 0.5);
    setBellQuestions(shuffled);
    setCurrentQuestionIdx(0);
    setScore(0);
    setStreak(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setIsGameFinished(false);
    setTimerSeconds(15);
    setIsTimerActive(true);
  };

  // Select Answer in Rung Chuông Vàng
  const handleSelectAnswer = (optionText: string) => {
    if (isAnswered) return;

    setIsTimerActive(false);
    setSelectedAnswer(optionText);
    setIsAnswered(true);

    const currentQ = bellQuestions[currentQuestionIdx];
    const isCorrect = optionText && currentQ.correctAnswer.includes(optionText.charAt(0));

    if (isCorrect) {
      playSoundEffect('correct');
      setScore(prev => prev + 100 + streak * 10);
      setStreak(prev => prev + 1);
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
    } else {
      playSoundEffect('wrong');
      setStreak(0);
    }
  };

  // Next Question in Rung Chuông Vàng
  const handleNextBellQuestion = () => {
    if (currentQuestionIdx + 1 < bellQuestions.length) {
      setCurrentQuestionIdx(prev => prev + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
      setTimerSeconds(15);
      setIsTimerActive(true);
    } else {
      setIsGameFinished(true);
      playSoundEffect('victory');
      confetti({ particleCount: 100, spread: 100, origin: { y: 0.5 } });
      onActivityAdded(`Đã hoàn thành Đấu trường Rung Chuông Vàng với tổng điểm ${score}!`);
    }
  };

  const currentQ = bellQuestions[currentQuestionIdx];

  return (
    <div className="space-y-6">
      {/* Game Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-6 rounded-3xl text-white shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold backdrop-blur-xs">
            <Gamepad2 className="w-4 h-4 text-amber-200" /> Trò Chơi Học Tập Sinh Động Cho Học Sinh
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">ĐẤU TRƯỜNG HỌC TẬP THÔNG MINH</h2>
          <p className="text-xs text-amber-100">Vừa học vừa chơi với kho câu hỏi rèn luyện trí tuệ sinh động</p>
        </div>

        {/* Game Mode Selector Tabs */}
        <div className="flex items-center p-1.5 bg-black/20 backdrop-blur-md rounded-2xl border border-white/20 shrink-0">
          <button
            onClick={() => setActiveGameTab('golden_bell')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeGameTab === 'golden_bell'
                ? 'bg-white text-amber-900 shadow-lg scale-102'
                : 'text-white hover:bg-white/10'
            }`}
          >
            <Bell className="w-4 h-4 text-amber-500" />
            <span>RUNG CHUÔNG VÀNG</span>
          </button>

          <button
            onClick={() => setActiveGameTab('flashcards')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
              activeGameTab === 'flashcards'
                ? 'bg-white text-amber-900 shadow-lg scale-102'
                : 'text-white hover:bg-white/10'
            }`}
          >
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>THẺ GHI NHỚ (FLASHCARDS)</span>
          </button>
        </div>
      </div>

      {/* GAME 1: RUNG CHUÔNG VÀNG */}
      {activeGameTab === 'golden_bell' && (
        <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-xs border border-slate-200/80 space-y-6">
          {!isGameFinished && bellQuestions.length > 0 ? (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Game Top Metrics Bar */}
              <div className="flex items-center justify-between bg-amber-50 p-4 rounded-2xl border border-amber-200">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white font-black flex items-center justify-center text-sm shadow-md">
                    {currentQuestionIdx + 1}/{bellQuestions.length}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase">Câu hỏi số</p>
                    <p className="text-xs font-black text-amber-900">{currentQ?.subject} • {currentQ?.level}</p>
                  </div>
                </div>

                {/* Score & Streak */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-200/60 text-amber-900 font-black text-sm">
                    <Trophy className="w-4 h-4 text-amber-600" />
                    <span>{score} điểm</span>
                  </div>

                  {streak > 1 && (
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-500 text-white font-black text-xs animate-bounce">
                      <Flame className="w-4 h-4 text-amber-200" />
                      <span>Chuỗi {streak}!</span>
                    </div>
                  )}

                  {/* Countdown Timer Circle */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-base shadow-inner ${
                    timerSeconds <= 5 ? 'bg-rose-500 text-white animate-ping' : 'bg-[#3730A3] text-white'
                  }`}>
                    {timerSeconds}s
                  </div>
                </div>
              </div>

              {/* Main Question Card with Large Kid-Friendly Text */}
              <div className="p-8 rounded-3xl bg-gradient-to-b from-indigo-50/80 to-white border-2 border-indigo-200 shadow-md text-center space-y-4">
                <span className="inline-block px-3 py-1 rounded-full bg-indigo-100 text-[#3730A3] font-bold text-xs">
                  Chủ đề: {currentQ?.topic}
                </span>
                <h3 className="text-xl lg:text-2xl font-black text-slate-900 leading-relaxed">
                  {currentQ?.questionText}
                </h3>
              </div>

              {/* Large Answer Option Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentQ?.options?.map((opt, idx) => {
                  const isSelected = selectedAnswer === opt;
                  const isCorrectAnswer = currentQ.correctAnswer.includes(opt.charAt(0));

                  let buttonStyle = 'bg-white border-2 border-slate-200 text-slate-900 hover:border-[#3730A3] hover:bg-indigo-50/50';
                  if (isAnswered) {
                    if (isCorrectAnswer) {
                      buttonStyle = 'bg-emerald-500 text-white border-emerald-600 shadow-lg scale-102 font-black';
                    } else if (isSelected && !isCorrectAnswer) {
                      buttonStyle = 'bg-rose-500 text-white border-rose-600 font-bold';
                    } else {
                      buttonStyle = 'bg-slate-100 text-slate-400 border-slate-200 opacity-60';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectAnswer(opt)}
                      disabled={isAnswered}
                      className={`
                        p-5 rounded-2xl text-base font-bold transition-all text-left flex items-center justify-between shadow-xs active:scale-98
                        ${buttonStyle}
                      `}
                    >
                      <span className="leading-snug">{opt}</span>
                      {isAnswered && isCorrectAnswer && <CheckCircle2 className="w-6 h-6 text-white shrink-0 ml-2" />}
                      {isAnswered && isSelected && !isCorrectAnswer && <XCircle className="w-6 h-6 text-white shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>

              {/* Explanation & Next Question Button */}
              {isAnswered && (
                <div className="space-y-4 pt-2">
                  <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 leading-relaxed">
                    <strong>Giải thích chi tiết:</strong> {currentQ?.explanation || 'Không có lời giải chi tiết.'}
                  </div>

                  <button
                    onClick={handleNextBellQuestion}
                    className="w-full py-4 bg-[#F97316] hover:bg-orange-600 text-white font-black text-base rounded-2xl shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 active:scale-98 transition-all"
                  >
                    <span>{currentQuestionIdx + 1 < bellQuestions.length ? 'CÂU HỎI TIẾP THEO' : 'XEM KẾT QUẢ ĐẤU TRƯỜNG'}</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          ) : isGameFinished ? (
            /* Victory Celebration Screen */
            <div className="max-w-md mx-auto text-center space-y-6 py-8">
              <div className="w-24 h-24 rounded-full bg-amber-100 border-4 border-amber-400 text-amber-600 flex items-center justify-center mx-auto shadow-2xl animate-bounce">
                <Trophy className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900">XUẤT SẮC! BẠN ĐÃ RUNG CHUÔNG VÀNG!</h3>
                <p className="text-xs text-slate-500">Chúc mừng em đã vượt qua toàn bộ thử thách kiến thức</p>
              </div>

              <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-widest">TỔNG ĐIỂM ĐẠT ĐƯỢC</span>
                <p className="text-4xl font-black text-amber-600">{score} ĐIỂM</p>
              </div>

              <button
                onClick={handleStartGoldenBell}
                className="w-full py-3.5 bg-[#3730A3] hover:bg-indigo-900 text-white font-black text-sm rounded-2xl shadow-lg flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> CHƠI LẠI TRÒ CHƠI
              </button>
            </div>
          ) : (
            /* Initial Start Game Screen */
            <div className="max-w-md mx-auto text-center space-y-6 py-12">
              <div className="w-20 h-20 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-lg">
                <Bell className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-900">Sẵn sàng bước vào Đấu trường Rung Chuông Vàng?</h3>
                <p className="text-xs text-slate-500">Trả lời các câu hỏi từ ngân hàng câu hỏi để tích lũy điểm thưởng và vinh danh!</p>
              </div>

              <button
                onClick={handleStartGoldenBell}
                className="w-full py-4 bg-[#F97316] hover:bg-orange-600 text-white font-black text-base rounded-2xl shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5 fill-white" /> BẮT ĐẦU CHƠI NGAY
              </button>
            </div>
          )}
        </div>
      )}

      {/* GAME 2: THẺ GHI NHỚ (FLASHCARDS) */}
      {activeGameTab === 'flashcards' && (
        <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-xs border border-slate-200/80 space-y-6">
          {questionBank.length > 0 ? (
            <div className="max-w-xl mx-auto space-y-6">
              {/* Flashcard Counter */}
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Thẻ {flashcardIdx + 1} / {questionBank.length}</span>
                <span>Bấm vào thẻ để lật xem đáp án</span>
              </div>

              {/* 3D Flip Card Container */}
              <div 
                onClick={() => {
                  setIsFlipped(!isFlipped);
                  playSoundEffect('flip');
                }}
                className="h-72 w-full cursor-pointer perspective-1000"
              >
                <div className={`
                  relative w-full h-full rounded-3xl p-8 shadow-xl transition-all duration-500 transform-style-3d border-2 text-center flex flex-col justify-between items-center select-none
                  ${isFlipped 
                    ? 'bg-gradient-to-br from-[#3730A3] to-indigo-900 text-white border-indigo-700 [transform:rotateY(180deg)]' 
                    : 'bg-gradient-to-br from-amber-50 to-white text-slate-900 border-amber-300'
                  }
                `}>
                  {/* Front Side */}
                  {!isFlipped ? (
                    <>
                      <span className="px-3 py-1 rounded-full bg-amber-200 text-amber-900 text-xs font-bold">
                        {questionBank[flashcardIdx]?.subject} • {questionBank[flashcardIdx]?.level}
                      </span>

                      <h4 className="text-xl font-black leading-relaxed">
                        {questionBank[flashcardIdx]?.questionText}
                      </h4>

                      <p className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                        <Sparkles className="w-4 h-4" /> Bấm để xem đáp án
                      </p>
                    </>
                  ) : (
                    /* Back Side */
                    <div className="[transform:rotateY(180deg)] flex flex-col justify-between h-full items-center">
                      <span className="px-3 py-1 rounded-full bg-emerald-400 text-emerald-950 text-xs font-black">
                        ĐÁP ÁN ĐÚNG
                      </span>

                      <div className="space-y-2">
                        <p className="text-xl font-black text-amber-300">
                          {questionBank[flashcardIdx]?.correctAnswer}
                        </p>
                        {questionBank[flashcardIdx]?.explanation && (
                          <p className="text-xs text-indigo-100 leading-relaxed italic">
                            {questionBank[flashcardIdx]?.explanation}
                          </p>
                        )}
                      </div>

                      <p className="text-xs text-indigo-200 font-semibold">Bấm để quay lại câu hỏi</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Flashcard Nav Controls */}
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    setIsFlipped(false);
                    setFlashcardIdx(prev => Math.max(0, prev - 1));
                  }}
                  disabled={flashcardIdx === 0}
                  className="px-5 py-3 rounded-2xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                >
                  Thẻ trước
                </button>

                <button
                  onClick={() => {
                    setIsFlipped(false);
                    setFlashcardIdx(prev => (prev + 1) % questionBank.length);
                  }}
                  className="px-6 py-3 rounded-2xl text-xs font-black bg-[#F97316] text-white hover:bg-orange-600 shadow-md"
                >
                  Thẻ tiếp theo
                </button>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 py-12">Chưa có câu hỏi nào trong ngân hàng để tạo Thẻ ghi nhớ.</p>
          )}
        </div>
      )}
    </div>
  );
};
