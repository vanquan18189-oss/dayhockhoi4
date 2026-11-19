import { GoogleGenAI } from '@google/genai';

const RECOMMENDED_MODELS = ['gemini-4-hydrogen', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];
const DEFAULT_MODEL = 'gemini-4-hydrogen';

function sanitizeModelName(model?: string): string {
  if (!model || typeof model !== 'string') return DEFAULT_MODEL;
  const m = model.trim().toLowerCase();
  if (m.includes('1.5') || m.includes('2.0') || m.includes('3.8-flash') || m.includes('flash-latest') || m.includes('pro-latest')) {
    return DEFAULT_MODEL;
  }
  return model.trim();
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const { prompt, systemInstruction, responseJson, fileData, customKey, model } = req.body || {};
  const apiKey = customKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'Chưa cấu hình Gemini API Key trên hệ thống.' });
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

    const config: any = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (responseJson) config.responseMimeType = 'application/json';

    let contents: any = prompt || '';
    if (fileData?.base64 && fileData?.mimeType) {
      contents = [
        {
          inlineData: {
            mimeType: fileData.mimeType,
            data: fileData.base64.replace(/^data:[^;]+;base64,/, ''),
          },
        },
        { text: prompt || '' },
      ];
    } else if (fileData?.text) {
      contents = `[NỘI DUNG TÀI LIỆU VĂN BẢN ĐÍNH KÈM]:\n"""\n${fileData.text}\n"""\n\n${prompt || ''}`;
    }

    const targetModel = sanitizeModelName(model);
    const candidateModels = [targetModel, ...RECOMMENDED_MODELS.filter((m) => m !== targetModel)];

    let response: any = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config,
        });
        if (response && response.text) break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!response || typeof response.text !== 'string') {
      throw lastError || new Error('Máy chủ phản hồi dữ liệu rỗng.');
    }

    return res.status(200).json({ text: response.text });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Lỗi xử lý Gemini AI' });
  }
}
