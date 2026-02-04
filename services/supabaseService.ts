
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
    console.error("Erro Supabase:", e);
  }
}

export async function upsertProducts(products: Product[]) {
  if (!supabase || products.length === 0) return null;
  
  const payload = products.map(p => ({
    id: p.id,
    name: p.name.trim(),
    category: p.category,
    price: p.price,
    unit: p.unit.trim(),
    store: p.store,
    image_url: p.imageUrl || null,
    code: p.code || p.id,
    last_updated: new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from('products')
    .upsert(payload, { onConflict: 'id' });

  if (error) throw error;
  return data;
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
      price: p.price,
      unit: p.unit,
      imageUrl: p.image_url,
      store: p.store as StoreId,
      code: p.code,
      lastUpdated: p.last_updated
    }));
  } catch (e) {
    return [];
  }
}

export async function getCloudTotalCount() {
  if (!supabase) return 0;
  const { count } = await supabase.from('products').select('*', { count: 'exact', head: true });
  return count || 0;
}
