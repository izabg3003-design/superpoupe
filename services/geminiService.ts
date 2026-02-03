
import { GoogleGenAI } from "@google/genai";
import { Product, StoreId, PriceUpdateResult, GroundingSource } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Função Mestra para Varredura de Catálogo.
 * Usa pesquisa avançada para encontrar listas de produtos.
 */
export async function fetchCategoryProducts(
  storeName: string, 
  categoryName: string, 
  offset: number = 0
): Promise<PriceUpdateResult> {
  const ai = getAI();
  const model = "gemini-3-flash-preview";
  
  // Estratégia de pesquisa mais robusta: site search
  const searchQuery = `site:continente.pt produtos ${categoryName} preço "adicionar"`;

  const prompt = `Utilize o Google Search para listar artigos da categoria "${categoryName}" no site continente.pt.
  
  INSTRUÇÕES:
  1. Procure nomes de produtos, preços (ex: 2.99€), unidades (kg, un, pack) e se possível o SKU/Referência.
  2. Extraia o nome LITERAL (ex: "Cebola Castanha Continente pack 2kg").
  
  Responda APENAS com um JSON Array seguindo este modelo exato:
  [{"name": "string", "price": number, "unit": "string", "code": "string"}]
  
  Se não encontrar nada, responda [].`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
      },
    });

    return processResponse(response, storeName, categoryName);
  } catch (error: any) {
    console.error("Erro na busca de catálogo:", error);
    const errStr = JSON.stringify(error);
    if (errStr.includes("429") || error?.status === 429 || error?.status === "RESOURCE_EXHAUSTED") {
      throw new Error("QUOTA_EXHAUSTED");
    }
    throw error;
  }
}

/**
 * Pesquisa individual de alta precisão.
 */
export async function searchSpecificProduct(storeName: string, query: string): Promise<PriceUpdateResult> {
  const ai = getAI();
  const model = "gemini-3-flash-preview";
  
  const prompt = `Localize este artigo específico no site do Continente (continente.pt): "${query}".
  Preciso do NOME COMPLETO, PREÇO e UNIDADE.
  
  Responda APENAS com um JSON Array:
  [{"name": "NOME LITERAL", "price": 0.00, "unit": "kg/un", "code": "REF"}]`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
      },
    });
    
    return processResponse(response, storeName, "Pesquisa Online");
  } catch (e: any) {
    console.error("Erro na pesquisa específica:", e);
    const errStr = JSON.stringify(e);
    if (errStr.includes("429") || e?.status === 429) {
      throw new Error("QUOTA_EXHAUSTED");
    }
    return { products: [], sources: [] };
  }
}

function processResponse(response: any, storeName: string, category: string): PriceUpdateResult {
  const text = response.text || "[]";
  let parsedProducts: any[] = [];
  
  try {
    const cleanJson = text.replace(/```json|```/g, "").trim();
    parsedProducts = JSON.parse(cleanJson);
  } catch (e) {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsedProducts = JSON.parse(match[0]); } catch { parsedProducts = []; }
    }
  }

  if (!Array.isArray(parsedProducts)) parsedProducts = [parsedProducts];

  const storeId = storeName.toLowerCase().replace(/\s+/g, "-") as StoreId;
  const products: Product[] = parsedProducts
    .filter(p => p && p.name)
    .map((p) => {
      const productId = p.code ? `${storeId}-${p.code}` : `${storeId}-${p.name.trim().replace(/\s+/g, '-').toLowerCase()}`;
      return {
        id: productId,
        name: p.name.trim(),
        price: typeof p.price === 'number' ? p.price : parseFloat(String(p.price || "0").replace(',', '.')) || 0,
        unit: p.unit || "un",
        category: p.category || category,
        lastUpdated: new Date().toISOString(),
        store: storeId,
        code: p.code || undefined
      };
    });

  const sources: GroundingSource[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks) {
    chunks.forEach((chunk: any) => {
      if (chunk.web) sources.push({ title: chunk.web.title, uri: chunk.web.uri });
    });
  }

  return { products, sources };
}
