
import { GoogleGenAI } from "@google/genai";
import { Product, StoreId, PriceUpdateResult } from "../types";

const safeGetEnv = (key: string): string | undefined => {
  const keysToTry = [key, `VITE_${key}`];
  try {
    for (const k of keysToTry) {
      if (typeof window !== 'undefined' && (window as any).process?.env?.[k]) return (window as any).process.env[k];
      if (typeof (globalThis as any).process?.env?.[k] !== 'undefined') return (globalThis as any).process.env[k];
      try {
        if ((import.meta as any).env?.[k]) return (import.meta as any).env[k];
      } catch(e) {}
    }
  } catch { }
  return undefined;
};

const getAI = () => {
  const apiKey = safeGetEnv('API_KEY');
  if (!apiKey) throw new Error("API_KEY_MISSING");
  return new GoogleGenAI({ apiKey });
};

export async function fetchCategoryProducts(
  storeName: string, 
  categoryName: string
): Promise<PriceUpdateResult> {
  try {
    const ai = getAI();
    const model = "gemini-3-flash-preview";
    const prompt = `Utilize o Google Search para listar artigos da categoria "${categoryName}" no site continente.pt. Responda APENAS com um JSON Array: [{"name": "string", "price": number, "unit": "string", "code": "string"}]`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" },
    });

    return processResponse(response, storeName, categoryName);
  } catch (error: any) {
    console.error("Erro Gemini:", error);
    throw error;
  }
}

export async function searchSpecificProduct(storeName: string, query: string): Promise<PriceUpdateResult> {
  try {
    const ai = getAI();
    const model = "gemini-3-flash-preview";
    const prompt = `Localize este artigo no site continente.pt: "${query}". Responda APENAS JSON: [{"name": "string", "price": number, "unit": "string", "code": "string"}]`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" },
    });
    
    return processResponse(response, storeName, "Pesquisa");
  } catch (e) {
    return { products: [], sources: [] };
  }
}

function processResponse(response: any, storeName: string, category: string): PriceUpdateResult {
  const text = response.text || "[]";
  let parsedProducts: any[] = [];
  try {
    parsedProducts = JSON.parse(text.replace(/```json|```/g, ""));
  } catch (e) {
    const match = text.match(/\[.*\]/s);
    if (match) parsedProducts = JSON.parse(match[0]);
  }

  const storeId = storeName.toLowerCase().replace(/\s+/g, "-") as StoreId;
  return {
    products: (Array.isArray(parsedProducts) ? parsedProducts : [parsedProducts])
      .filter(p => p && p.name)
      .map(p => ({
        id: p.code ? `${storeId}-${p.code}` : `${storeId}-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
        name: p.name.trim(),
        price: typeof p.price === 'number' ? p.price : parseFloat(String(p.price).replace(',', '.')) || 0,
        unit: p.unit || "un",
        category: category,
        lastUpdated: new Date().toISOString(),
        store: storeId,
        code: p.code
      })),
    sources: []
  };
}
