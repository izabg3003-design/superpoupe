
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Product, StoreId } from '../types';

/**
 * Procura variáveis de ambiente de forma exaustiva.
 */
const safeGetEnv = (key: string): string | undefined => {
  const keysToTry = [key, `VITE_${key}`];
  
  // Lista de locais onde variáveis podem estar escondidas em diferentes browsers/hosts
  const searchIn = [
    (window as any),
    (globalThis as any),
    (window as any).process?.env,
    (globalThis as any).process?.env,
    (window as any).__env,
    (import.meta as any).env
  ];

  for (const target of searchIn) {
    if (!target) continue;
    for (const k of keysToTry) {
      if (typeof target[k] === 'string' && target[k].trim() !== '') {
        return target[k];
      }
    }
  }

  // Fallbacks manuais caso a injeção automática falhe (apenas para debug)
  if (key === 'SUPABASE_URL') return 'https://jrxdkjyatitvttcctmrv.supabase.co';
  if (key === 'SUPABASE_ANON_KEY') return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyeGRranlhdGl0dnR0Y2N0bXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNDE0MTIsImV4cCI6MjA4NTcxNzQxMn0.vFndOfgqa87SHXG4ku-F1lBhqAHSt9zHl7O09Bi-LtU';

  return undefined;
};

const SUPABASE_URL = safeGetEnv('SUPABASE_URL');
const SUPABASE_ANON_KEY = safeGetEnv('SUPABASE_ANON_KEY');

export let supabase: SupabaseClient | null = null;

try {
  if (SUPABASE_URL && SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true }
    });
    console.log("✅ Supabase pronto.");
  }
} catch (e) {
  console.error("❌ Falha crítica ao inicializar Supabase:", e);
}

export async function upsertProducts(products: Product[]) {
  if (!supabase) return null;
  try {
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
  } catch (e) {
    console.error("Erro no Upsert:", e);
    return null;
  }
}

export async function fetchProductsFromCloud(searchTerm?: string, category?: string, store?: StoreId) {
  if (!supabase) return [];
  try {
    let query = supabase.from('products').select('*');
    if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);
    if (category && category !== 'todos') query = query.eq('category', category);
    if (store) query = query.eq('store', store);

    const { data, error } = await query.order('name', { ascending: true });
    if (error) throw error;
    
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
  } catch (e) {
    console.error("Erro ao buscar da Cloud:", e);
    return [];
  }
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
