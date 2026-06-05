import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { geminiSchema, pdfToMarkdownPrompt } from "./services/geminiService";

const app = express();
const PORT = 3000;

// Increase payload limit for large base64 PDFs or texts
app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ limit: "150mb", extended: true }));

// Dynamic initialization of GoogleGenAI using client or server key
function getGenAIClient(clientApiKey?: string): GoogleGenAI {
  const apiKey = clientApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API 키가 설정되지 않았습니다. 'Gemini API 키 확인 및 설정' 버튼을 누르고 API 키를 등록해 주세요.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// REST route for testing connection validity of an API Key
app.post("/api/test-key", async (req, res) => {
  try {
    const clientApiKey = (req.headers["x-api-key"] as string) || req.body.apiKey;
    if (!clientApiKey) {
      return res.status(400).json({ error: "테스트할 API 키가 누락되었습니다." });
    }

    const ai = getGenAIClient(clientApiKey);
    
    // Call standard 3.5-flash with a minimal dummy prompt to verify API connectivity
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "Hi",
      config: {
        maxOutputTokens: 2,
      },
    });

    if (response) {
      res.json({ success: true, message: "연결 성공! API 키가 아주 잘 연동되고 있습니다." });
    } else {
      res.status(400).json({ success: false, error: "구글 서비스에 연결했으나 올바른 응답을 받지 못했습니다." });
    }
  } catch (error: any) {
    console.error("API Key testing error on server:", error);
    let errorMessage = error.message || "서버와 통신하는 도중 오류가 발생했습니다.";
    const errStr = typeof error === "object" ? JSON.stringify(error) : String(error);

    if (
      errorMessage.includes("API key not valid") ||
      errorMessage.includes("API_KEY_INVALID") ||
      errStr.includes("API_KEY_INVALID") ||
      errStr.includes("API key not valid")
    ) {
      errorMessage = "유효하지 않은 API 키입니다. Google AI Studio에서 올바른 키를 새로 생성하여 복사해왔는지 다시 한번 확인해 주시기 바랍니다.";
    }
    res.status(400).json({ success: false, error: errorMessage });
  }
});

// REST route for converting exam and solution PDFs to Markdown
app.post("/api/convert-pdf-to-md", async (req, res) => {
  try {
    const { examFileBase64, examFileMime, solutionFileBase64, solutionFileMime, model, apiKey } = req.body;
    if (!examFileBase64) {
      return res.status(400).json({ error: "Exam PDF base64 data is required." });
    }

    const clientApiKey = (req.headers["x-api-key"] as string) || apiKey;
    const ai = getGenAIClient(clientApiKey);
    const selectedModel = model || "gemini-3.5-flash";

    console.log(`Converting PDF to MD using model: ${selectedModel}`);

    const contents: any[] = [
      {
        parts: [
          { text: pdfToMarkdownPrompt },
          {
            inlineData: {
              mimeType: examFileMime || "application/pdf",
              data: examFileBase64,
            },
          },
        ],
      },
    ];

    if (solutionFileBase64) {
      contents[0].parts.push({ text: "\nHere is the official solution/answer key PDF:" });
      contents[0].parts.push({
        inlineData: {
          mimeType: solutionFileMime || "application/pdf",
          data: solutionFileBase64,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
    });

    let markdown = response.text || "";
    
    // Clean up markdown block wraps if any
    let cleaned = markdown.trim();
    if (cleaned.startsWith("```markdown")) {
        cleaned = cleaned.substring("```markdown".length).trim();
    } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.substring(3).trim();
    }
    if (cleaned.endsWith("```")) {
        cleaned = cleaned.substring(0, cleaned.length - 3).trim();
    }

    res.json({ markdown: cleaned });
  } catch (error: any) {
    console.error("PDF to Markdown server error:", error);
    let errorMessage = error.message || "An unexpected error occurred during PDF-to-MD conversion.";
    res.status(500).json({ error: errorMessage });
  }
});

// REST route for commentary generation proxy
app.post("/api/generate", async (req, res) => {
  try {
    const { contents, model, apiKey } = req.body;
    if (!contents) {
      return res.status(400).json({ error: "No contents provided in request body." });
    }

    const clientApiKey = (req.headers["x-api-key"] as string) || apiKey;
    const ai = getGenAIClient(clientApiKey);
    // Default to 'gemini-3.5-flash', or use the model specified
    const selectedModel = model || "gemini-3.5-flash";

    console.log(`Calling server-side Gemini using model: ${selectedModel}`);

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: geminiSchema,
      },
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini server-side error:", error);
    
    let errorMessage = error.message || "An unexpected error occurred during analysis.";
    const errStr = typeof error === "object" ? JSON.stringify(error) : String(error);
    
    if (
      errorMessage.includes("API key expired") || 
      errorMessage.includes("API_KEY_INVALID") || 
      errorMessage.includes("expired") ||
      errStr.includes("API key expired") || 
      errStr.includes("API_KEY_INVALID")
    ) {
      errorMessage = "Google Gemini API 키가 만료되었거나 올바르지 않습니다. AI Studio 플랫폼 화면 좌측/우측 상단의 [Settings > Secrets] 메뉴에서 'GEMINI_API_KEY' 항목을 Google AI Studio(https://aistudio.google.com/app/apikey)에서 발급받은 최신 무료 API 키로 업데이트(갱신)해주시기 바랍니다.";
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev middleware mounted successfully.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get(/^\/(?!api).*/, (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log(`Serving production files from: ${distPath}`);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
