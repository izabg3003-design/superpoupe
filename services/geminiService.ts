
import { GoogleGenAI } from "@google/genai";
import { Product, StoreId, PriceUpdateResult, GroundingSource } from "../types";
import { STORE_DOMAINS } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function fetchCategoryProducts(
  storeId: StoreId, 
  categoryName: string,
  targetUrl?: string,
  batchIndex: number = 0
): Promise<PriceUpdateResult> {
  const domain = STORE_DOMAINS[storeId] || 'continente.pt';
  try {
    const model = "gemini-3-flash-preview";
    
    const prompt = `Aja como um Extrator de E-commerce. 
    DESTINO: ${targetUrl || `https://www.${domain}`}
    CATEGORIA: ${categoryName}
    TAREFA: Extraia 25 produtos com: Nome, Preço e Unidade.
    RETORNO: APENAS JSON Array: [{"name": "string", "price": number, "unit": "string", "code": "string"}]`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { 
        tools: [{ googleSearch: {} }], 
        responseMimeType: "application/json" 
      },
    });

    return processResponse(response, storeId, categoryName);
  } catch (error: any) {
    console.error(`Erro no rastreio:`, error);
    throw error;
  }
}

export async function searchSpecificProduct(storeId: StoreId | 'todos', query: string): Promise<PriceUpdateResult> {
  const targetDomain = storeId === 'todos' ? 'supermercados em Portugal' : STORE_DOMAINS[storeId];
  
  try {
    const model = "gemini-3-flash-preview";
    const prompt = `Localize o artigo "${query}" no site ${targetDomain}.
    FORMATO JSON: [{"name": "string", "price": number, "unit": "string", "store": "string"}]`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { 
        tools: [{ googleSearch: {} }], 
        responseMimeType: "application/json" 
      },
    });
    
    return processResponse(response, storeId === 'todos' ? 'continente' : storeId, "Pesquisa Direta");
  } catch (e) {
    return { products: [], sources: [] };
  }
}

function processResponse(response: any, storeId: StoreId, category: string): PriceUpdateResult {
  const text = response.text || "[]";
  let parsedProducts: any[] = [];
  
  try {
    const cleanJson = text.replace(/```json|```/g, "").trim();
    parsedProducts = JSON.parse(cleanJson);
  } catch (e) {
    const match = text.match(/\[.*\]/s);
    if (match) { try { parsedProducts = JSON.parse(match[0]); } catch (e2) {} }
  }

  const sources: GroundingSource[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  chunks.forEach((chunk: any) => {
    if (chunk.web?.uri) {
      sources.push({ title: chunk.web.title || "Fonte Oficial", uri: chunk.web.uri });
    }
  });

  const products = (Array.isArray(parsedProducts) ? parsedProducts : [parsedProducts])
    .filter(p => p && p.name)
    .map(p => {
      const finalStoreId = (p.store && ['continente', 'pingo-doce', 'lidl', 'aldi', 'makro'].includes(p.store)) 
        ? p.store as StoreId : storeId;

      return {
        id: p.code ? `${finalStoreId}-${p.code}` : `u${Math.random().toString(36).substring(7)}`,
        name: p.name.trim(),
        price: typeof p.price === 'number' ? p.price : parseFloat(String(p.price).replace(',', '.')) || 0,
        unit: p.unit || "un",
        category: category,
        lastUpdated: new Date().toISOString(),
        store: finalStoreId,
        code: p.code
      };
    });

  return { products, sources };
}
