
import { GoogleGenAI } from "@google/genai";
import { Product, StoreId, PriceUpdateResult, GroundingSource } from "../types";
import { STORE_DOMAINS } from "../constants";

// Fixed: Use process.env.API_KEY directly as required by guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Realiza um "Deep Scrape" simulado via Google Search Grounding.
 * Para volumes grandes (3000+), deve ser chamado em loop/lotes no frontend.
 */
export async function fetchCategoryProducts(
  storeId: StoreId, 
  categoryName: string,
  targetUrl?: string,
  batchIndex: number = 0
): Promise<PriceUpdateResult> {
  const domain = STORE_DOMAINS[storeId] || 'continente.pt';
  try {
    const model = "gemini-3-flash-preview";
    
    // Prompt ultra-potencializado para extrair o máximo de itens por chamada
    const prompt = `Aja como um Robô de Extração de Dados em Tempo Real. 
    DESTINO: ${targetUrl || `https://www.${domain}`}
    CATEGORIA: ${categoryName}
    CONTEXTO: Esta categoria contém milhares de itens. Você deve extrair uma lista de pelo menos 25 a 30 produtos diferentes que ainda não foram listados (Lote #${batchIndex}).
    
    INSTRUÇÕES CRÍTICAS:
    1. Aceda EXCLUSIVAMENTE ao site do ${storeId} (${domain}).
    2. Extraia: Nome exato do produto, Preço atual em €, Unidade (kg, un, pack) e Código/EAN se disponível.
    3. Retorne APENAS um JSON Array no formato: [{"name": "string", "price": number, "unit": "string", "code": "string"}].
    4. Não adicione texto explicativo.`;

    // Fixed: Always use ai.models.generateContent to query GenAI with both model and prompt
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
    console.error(`Erro no rastreio profundo de ${domain}:`, error);
    throw error;
  }
}

/**
 * Busca um produto específico em tempo real
 */
export async function searchSpecificProduct(storeId: StoreId | 'todos', query: string): Promise<PriceUpdateResult> {
  const targetDomain = storeId === 'todos' ? 'sites de supermercados em Portugal (Continente, Pingo Doce, Lidl)' : STORE_DOMAINS[storeId];
  
  try {
    const model = "gemini-3-flash-preview";
    const prompt = `Localize este artigo específico no site ${targetDomain}: "${query}". 
    Retorne o preço exato e atual.
    FORMATO JSON: [{"name": "string", "price": number, "unit": "string", "code": "string", "store": "string"}].`;

    // Fixed: Always use ai.models.generateContent to query GenAI with both model and prompt
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
  // Fixed: The response object features a text property (not a method)
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
        id: p.code ? `${finalStoreId}-${p.code}` : `${finalStoreId}-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
        name: p.name.trim(),
        price: typeof p.price === 'number' ? p.price : parseFloat(String(p.price).replace(',', '.')) || 0,
        unit: p.unit || "un",
        category: category,
        lastUpdated: new Date().toISOString(),
        store: finalStoreId,
        code: p.code || Math.random().toString(36).substring(7)
      };
    });

  return { products, sources };
}
