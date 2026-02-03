
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Product, StoreId } from '../types';

// The Supabase credentials should be provided via environment variables.
// Using fallbacks that won't cause the 'Invalid supabaseUrl' crash during initial boot.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'placeholder-key';

// Initialize the client only if the URL is likely valid.
let supabase: SupabaseClient | null = null;
try {
  if (SUPABASE_URL && SUPABASE_URL.startsWith('http') && !SUPABASE_URL.includes('SUA_URL')) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabase client failed to initialize. Check your SUPABASE_URL environment variable.", e);
}

/**
 * Salva ou atualiza produtos na nuvem (Upsert).
 */
export async function upsertProducts(products: Product[]) {
  if (!supabase) {
    console.error("Supabase is not configured.");
    return null;
  }

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

/**
 * Procura produtos na nuvem.
 */
export async function fetchProductsFromCloud(searchTerm?: string, category?: string, store?: StoreId) {
  if (!supabase) {
    console.warn("Supabase is not configured. Returning empty list.");
    return [];
  }

  let query = supabase
    .from('products')
    .select('*');

  if (searchTerm) {
    query = query.ilike('name', `%${searchTerm}%`);
  }
  
  if (category && category !== 'todos') {
    query = query.eq('category', category);
  }

  if (store) {
    query = query.eq('store', store);
  }

  const { data, error } = await query.order('name', { ascending: true });
  
  if (error) {
    console.error("Supabase fetch error:", error);
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

/**
 * Retorna o total de produtos na base global.
 */
export async function getCloudTotalCount() {
  if (!supabase) return 0;
  
  const { count, error } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });
  
  return error ? 0 : (count || 0);
}
