import { GoogleGenAI, ThinkingLevel, Chat } from "@google/genai";
import { SYSTEM_INSTRUCTIONS } from "../constants";

// Initialize the Gemini client
// The API key is injected by AI Studio at runtime
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeMedicalImage(
  base64Image: string,
  mimeType: string,
  clinicalContext: string,
  type: 'xray' | 'ecg'
): Promise<string> {
  try {
    const prompt = type === 'xray'
      ? "Realize uma análise exaustiva e detalhada desta radiografia de tórax. 'Dê zoom' mentalmente em cada quadrante, avalie cada estrutura com calma e precisão seguindo o protocolo ABCDE+S. Não ignore nenhum detalhe sutil."
      : "Realize uma análise exaustiva e detalhada deste eletrocardiograma (ECG) seguindo RIGOROSAMENTE o protocolo de 4 etapas: ETAPA ZERO (Validação da Imagem) → ETAPA 1 (Zoom e inspeção derivação a derivação — analise CADA uma das 12 derivações individualmente) → ETAPA 2 (Análise sistemática completa — seções 2.1 a 2.11) → ETAPA 3 (Geração do laudo estruturado completo). 'Dê zoom' mentalmente em cada derivação, conte quadrados pequenos para todas as medidas de intervalo, meça amplitudes em milímetros reais usando a calibração do ECG. Identifique e descreva os achados com base estritamente no que é visível. Busque ativamente padrões especiais (Brugada, WPW, Wellens, De Winter, S1Q3T3, hipercalemia). Aplique critérios de Sgarbossa se houver BRE. Calcule SEMPRE o QTc. Gere o laudo na estrutura obrigatória definida na Etapa 3.";
      
    const contextText = clinicalContext.trim() 
      ? `\nContexto clínico fornecido pelo médico: ${clinicalContext}` 
      : "";

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: prompt + contextText,
          },
        ],
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS,
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 16384,
      },
    });

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("A IA não retornou nenhuma resposta. A imagem pode ter sido bloqueada pelos filtros de segurança.");
    }

    const candidate = response.candidates[0];
    if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'BLOCKLIST') {
      throw new Error("A análise foi bloqueada pelos filtros de segurança. Tente enviar uma imagem focada apenas no traçado do exame, sem dados de identificação do paciente.");
    }

    return response.text || "Não foi possível gerar o laudo. O retorno da IA estava vazio.";
  } catch (error: any) {
    console.error("Error analyzing image:", error);
    
    // Check if it's a known safety error from the SDK
    if (error.message && error.message.includes('SAFETY')) {
      throw new Error("A análise foi bloqueada por políticas de segurança. Certifique-se de que a imagem contém apenas o traçado do exame e nenhum dado pessoal.");
    }
    
    throw new Error(`Erro na API: ${error.message || "Verifique a conexão e tente novamente."}`);
  }
}

export function createMedicalChat(): Chat {
  return ai.chats.create({
    model: "gemini-3.1-pro-preview",
    config: {
      systemInstruction: SYSTEM_INSTRUCTIONS,
      temperature: 0.2,
      topP: 0.8,
    },
  });
}
