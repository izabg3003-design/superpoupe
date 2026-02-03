
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Product, StoreId } from '../types';

/**
 * Procura variáveis de ambiente de forma segura no browser, 
 * verificando tanto nomes padrão como prefixos VITE_.
 */
const safeGetEnv = (key: string): string | undefined => {
  const keysToTry = [key, `VITE_${key}`];
  
  try {
    for (const k of keysToTry) {
      // 1. Tenta window.process.env
      if (typeof window !== 'undefined' && (window as any).process?.env?.[k]) {
        return (window as any).process.env[k];
      }
      // 2. Tenta globalThis.process
      if (typeof (globalThis as any).process?.env?.[k] !== 'undefined') {
        return (globalThis as any).process.env[k];
      }
      // 3. Tenta import.meta.env
      try {
        if ((import.meta as any).env?.[k]) {
          return (import.meta as any).env[k];
        }
      } catch (e) {}
    }
  } catch (e) {
    console.warn(`Erro ao tentar ler chave ${key}:`, e);
  }
  return undefined;
};

const SUPABASE_URL = safeGetEnv('SUPABASE_URL');
const SUPABASE_ANON_KEY = safeGetEnv('SUPABASE_ANON_KEY');

export let supabase: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("✅ Supabase inicializado com as chaves detetadas.");
  } catch (e) {
    console.error("❌ Falha crítica ao criar cliente Supabase:", e);
  }
} else {
  console.warn("⚠️ Configuração Supabase incompleta. URL ou Key em falta.");
}

export async function upsertProducts(products: Product[]) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('products')
    .upsert(products.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      unit: p.unit,
      store: p.store,
      code: p.code,
      last_updated: new Date().toISOString()
    })), { onConflict: 'id' });

  if (error) throw error;
  return data;
}

export async function fetchProductsFromCloud(searchTerm?: string, category?: string, store?: StoreId) {
  if (!supabase) return [];

  let query = supabase.from('products').select('*');

  if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);
  if (category && category !== 'todos') query = query.eq('category', category);
  if (store) query = query.eq('store', store);

  const { data, error } = await query.order('name', { ascending: true });
  if (error) {
    console.error("Erro na busca Cloud:", error);
    return [];
  }
  
  return (data || []).map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    unit: p.unit,
    store: p.store as StoreId,
    code: p.code,
    lastUpdated: p.last_updated
  }));
}

export async function getCloudTotalCount() {
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });
    return error ? 0 : (count || 0);
  } catch {
    return 0;
  }
}
