import { GoogleGenAI } from '@google/genai';

const RECOMMENDED_MODELS = ['gemini-4-hydrogen', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];
const DEFAULT_MODEL = 'gemini-4-hydrogen';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const { customKey } = req.body || {};
  const startTime = Date.now();
  const apiKey = customKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({
      latencyMs: Date.now() - startTime,
      status: 'error',
      modelName: DEFAULT_MODEL,
      message: 'Chưa cấu hình API Key trên hệ thống máy chủ.',
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let lastError: any = null;
    for (const modelName of RECOMMENDED_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: 'Xin chào, trả lời "OK" để kiểm tra độ trễ.',
        });
        if (response?.text) {
          return res.status(200).json({
            latencyMs: Date.now() - startTime,
            status: 'online',
            modelName,
            message: 'Kết nối máy chủ Gemini thành công!',
          });
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    throw lastError || new Error('Không thể kết nối với các mô hình Gemini.');
  } catch (err: any) {
    return res.status(500).json({
      latencyMs: Date.now() - startTime,
      status: 'error',
      modelName: DEFAULT_MODEL,
      message: err?.message || 'Lỗi kết nối máy chủ Gemini',
    });
  }
}
