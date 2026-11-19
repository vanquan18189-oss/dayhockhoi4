import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, RotateCcw, MessageCircle, Loader2, Bot } from 'lucide-react';
import { askStudentAssistant } from '../services/geminiService';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

const INITIAL_WELCOME: ChatMessage = {
  id: 'welcome-msg',
  sender: 'assistant',
  text: 'Chào bạn nhỏ! Mình là Trợ lý AI học tập 🤖✨. Bạn đang cần mình giải thích bài học, gợi ý cách làm bài tập hay hướng dẫn nộp bài thế? Cứ nhắn cho mình nhé!',
  timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
};

const QUICK_PROMPTS = [
  'Gợi ý mình cách làm bài tập nhé!',
  'Hướng dẫn mình cách nộp bài trên hệ thống',
  'Giải thích giúp mình bài học hôm nay',
  'Cổ vũ tinh thần học tập cho mình đi!',
];

export const StudentAssistantChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WELCOME]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isOpen]);

  const handleSend = async (customText?: string) => {
    const query = (customText ?? inputValue).trim();
    if (!query || isLoading) return;

    const nowTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: nowTime,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    if (!customText) {
      setInputValue('');
    }
    setIsLoading(true);

    try {
      const historyPayload = nextMessages
        .filter((m) => m.id !== 'welcome-msg')
        .slice(-10)
        .map((m) => ({ sender: m.sender, text: m.text }));

      const replyText = await askStudentAssistant(query, historyPayload);

      const botMessage: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: replyText,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch {
      const fallbackMessage: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        sender: 'assistant',
        text: 'Úi, mạng hơi chậm một chút! Bạn nhỏ thử nhắn lại câu hỏi nhé 🤖💛.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        ...INITIAL_WELCOME,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-3 w-[340px] sm:w-[390px] h-[500px] max-h-[78vh] bg-white rounded-2xl shadow-2xl border border-indigo-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner shrink-0 border border-white/30">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm leading-tight truncate flex items-center gap-1.5">
                  Trò chuyện cùng AI
                  <Sparkles className="w-3.5 h-3.5 text-yellow-200 shrink-0" />
                </h3>
                <p className="text-[11px] text-indigo-100 truncate">
                  Trợ lý học tập thông minh • Kết nối tri thức
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleResetChat}
                title="Bắt đầu cuộc trò chuyện mới"
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Thu gọn"
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-gradient-to-b from-indigo-50/40 to-white">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-xs ${
                    msg.sender === 'user'
                      ? 'bg-[#4F46E5] text-white rounded-br-sm'
                      : 'bg-white text-slate-800 border border-indigo-100 rounded-bl-sm'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-start">
                <div className="bg-white text-indigo-700 border border-indigo-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm flex items-center gap-2 shadow-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-[#4F46E5]" />
                  <span>AI đang suy nghĩ...</span>
                </div>
              </div>
            )}

            {messages.length === 1 && !isLoading && (
              <div className="pt-1">
                <p className="text-[11px] font-medium text-slate-500 mb-2 px-0.5">
                  Gợi ý câu hỏi nhanh:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleSend(q)}
                      className="text-left text-xs px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200/80 transition-colors cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-white border-t border-slate-100 shrink-0">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-[#4F46E5] focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Nhập câu hỏi để trò chuyện cùng AI..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none py-1"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isLoading}
                title="Gửi tin nhắn"
                className="p-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Trò chuyện cùng AI"
        className="group flex items-center gap-2.5 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] hover:from-[#4338CA] hover:to-[#6D28D9] text-white pl-3.5 pr-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer border-2 border-white"
      >
        <Bot className="w-5 h-5 shrink-0" />
        <span className="text-sm font-bold tracking-tight">
          {isOpen ? 'Đóng trò chuyện' : 'Trò chuyện cùng AI'}
        </span>
        {!isOpen && <MessageCircle className="w-4 h-4 opacity-90" />}
      </button>
    </div>
  );
};
