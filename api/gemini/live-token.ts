import { GoogleGenAI } from '@google/genai';

const LIVE_MODEL = 'gemini-3.8-live';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const { customKey } = req.body || {};
  const apiKey = customKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'Chưa cấu hình Gemini API Key trên hệ thống.' });
  }

  try {
    new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    return res.status(200).json({
      model: LIVE_MODEL,
      status: 'ready',
      message: 'Live API session configuration initialized',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Lỗi cấu hình Live API' });
  }
}
