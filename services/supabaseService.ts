
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Product, StoreId } from '../types';

const safeGetEnv = (key: string): string | undefined => {
  if (key === 'SUPABASE_URL') return 'https://jrxdkjyatitvttcctmrv.supabase.co';
  if (key === 'SUPABASE_ANON_KEY') return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyeGRranlhdGl0dnR0Y2N0bXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNDE0MTIsImV4cCI6MjA4NTcxNzQxMn0.vFndOfgqa87SHXG4ku-F1lBhqAHSt9zHl7O09Bi-LtU';
  return undefined;
};

const SUPABASE_URL = safeGetEnv('SUPABASE_URL');
const SUPABASE_ANON_KEY = safeGetEnv('SUPABASE_ANON_KEY');

export let supabase: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error("Erro na inicialização do Supabase:", e);
  }
}

export async function upsertProducts(products: Product[]) {
  if (!supabase || products.length === 0) return null;
  
  // Mapeamento EXATO para colunas snake_case do Postgres
  const payload = products.map(p => ({
    id: p.id,
    name: p.name.trim(),
    category: p.category,
    price: p.price,
    unit: p.unit.trim(),
    store: p.store,
    image_url: p.imageUrl || null, // Coluna confirmada ou necessária no DB
    code: p.code || p.id,
    last_updated: new Date().toISOString() // Coluna confirmada pelo usuário
  }));

  try {
    const { data, error } = await supabase
      .from('products')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error("Supabase Upsert Error:", error);
      throw error;
    }
    return data;
  } catch (err: any) {
    throw err;
  }
}

export async function fetchProductsFromCloud(searchTerm?: string, category?: string, store?: StoreId) {
  if (!supabase) return [];
  try {
    let query = supabase.from('products').select('*');
    if (store && store !== 'todos' as any) query = query.eq('store', store);
    if (searchTerm) query = query.ilike('name', `%${searchTerm}%`);
    if (category && category !== 'todos') query = query.eq('category', category);

    const { data, error } = await query.order('name', { ascending: true }).limit(5000);
    if (error) throw error;
    
    return (data || []).map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: Number(p.price),
      unit: p.unit,
      imageUrl: p.image_url || null,
      store: p.store as StoreId,
      code: p.code,
      lastUpdated: p.last_updated
    }));
  } catch (e: any) {
    console.error("Erro ao buscar da Cloud:", e);
    throw e;
  }
}

export async function getCloudTotalCount() {
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  } catch (e) {
    return 0;
  }
}
