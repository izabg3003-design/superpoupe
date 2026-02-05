
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StoreId, Product, ShoppingItem } from './types';
import { STORES, CONTINENTE_CATEGORIES, COMMON_CATEGORIES } from './constants';
import { fetchProductsFromCloud, getCloudTotalCount, upsertProducts, supabase } from './services/supabaseService';

const ADMIN_EMAIL = 'poupe@poupe.com';
const ADMIN_PASSWORD = 'Izalivjeh?h';

const App: React.FC = () => {
  // Estados da App
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('todos');
  const [activeStore, setActiveStore] = useState<StoreId | 'todos'>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'catalog' | 'list' | 'admin'>('catalog');
  const [isLoading, setIsLoading] = useState(false);
  const [dbTotal, setDbTotal] = useState(0);
  const [dbError, setDbError] = useState<string | null>(null);

  // Estados de Admin e Login
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [rawTextImport, setRawTextImport] = useState('');
  const [savingProductId, setSavingProductId] = useState<string | null>(null);

  const currentCategories = useMemo(() => {
    return activeStore === 'continente' ? CONTINENTE_CATEGORIES : COMMON_CATEGORIES;
  }, [activeStore]);

  const sanitizeName = useCallback((name: string): string => {
    let text = name.trim();
    if (!text || text.length < 4) return text;
    for (let offset = -2; offset <= 2; offset++) {
      const mid = Math.floor(text.length / 2) + offset;
      if (mid <= 2 || mid >= text.length - 2) continue;
      const part1 = text.substring(0, mid).trim();
      const part2 = text.substring(mid).trim();
      if (part1.toLowerCase() === part2.toLowerCase()) return part1;
    }
    return text;
  }, []);

  const refreshData = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    setDbError(null);
    try {
      const storeFilter = activeStore === 'todos' ? undefined : activeStore as StoreId;
      const data = await fetchProductsFromCloud(searchTerm, activeCategory, storeFilter);
      setCatalog(data);
      const total = await getCloudTotalCount();
      setDbTotal(total);
    } catch (e: any) {
      console.error("Erro ao carregar:", e);
      if (e.code === 'PGRST116' || e.message?.includes('relation "products" does not exist')) {
        setDbError("A tabela 'products' não foi encontrada no seu Supabase.");
      } else {
        setDbError(`Erro na Cloud: ${e.message || 'Falha de ligação'}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, activeCategory, activeStore]);

  useEffect(() => { refreshData(); }, [refreshData]);

  const uniqueCatalog = useMemo(() => {
    const seen = new Set<string>();
    return catalog
      .map(p => ({ ...p, name: sanitizeName(p.name) }))
      .filter(p => {
        const key = `${p.name.toLowerCase().trim()}-${p.store}-${p.unit.toLowerCase().trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [catalog, sanitizeName]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginEmail.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() && loginPass.trim() === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setShowLogin(false);
      setView('admin');
      setLoginPass('');
    } else {
      alert("Credenciais incorretas.");
    }
  };

  const handleFilePreview = (productId: string, file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setCatalog(prev => prev.map(p => p.id === productId ? { ...p, imageUrl: base64 } : p));
    };
    reader.readAsDataURL(file);
  };

  const saveProductImage = async (product: Product) => {
    if (!product.imageUrl) {
        alert("Carregue uma foto primeiro.");
        return;
    }
    setSavingProductId(product.id);
    try {
      await upsertProducts([product]);
      alert(`Foto de "${product.name}" guardada na Cloud!`);
      refreshData();
    } catch (err: any) {
      console.error("Erro técnico:", err);
      alert(`ERRO AO GUARDAR:\n\nCódigo: ${err.code || '?'}\nMensagem: ${err.message}`);
    } finally {
      setSavingProductId(null);
    }
  };

  const handleMassiveImport = async () => {
    if (!rawTextImport.trim() || isSyncing) return;
    setIsSyncing(true);
    try {
      const lines = rawTextImport.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const foundProducts: Product[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const priceMatch = line.match(/(\d+),(\d{2})\s*€/);
        
        if (priceMatch && i > 0) {
          const price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
          const name = sanitizeName(lines[i-1]);
          
          if (name.length > 3) {
            const cleanIdName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const id = `c-${activeStore === 'todos' ? 'continente' : activeStore}-${cleanIdName}`;
            
            foundProducts.push({
              id,
              name,
              category: activeCategory === 'todos' ? 'Mercearia' : activeCategory,
              price,
              unit: 'un',
              store: activeStore === 'todos' ? 'continente' : activeStore as StoreId,
              lastUpdated: new Date().toISOString()
            });
          }
        }
      }

      if (foundProducts.length > 0) {
        setSyncProgress({ current: 0, total: foundProducts.length });
        const batchSize = 100;
        for (let i = 0; i < foundProducts.length; i += batchSize) {
          const batch = foundProducts.slice(i, i + batchSize);
          await upsertProducts(batch);
          setSyncProgress(prev => ({ ...prev, current: Math.min(i + batchSize, foundProducts.length) }));
        }
        alert(`Sucesso! Importados para a Cloud.`);
        setRawTextImport('');
        refreshData();
      }
    } catch (e: any) {
      alert("Erro na importação: " + e.message);
    }
    setIsSyncing(false);
  };

  const addToCart = (product: Product) => {
    setShoppingList(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1, checked: false }];
    });
  };

  const cartTotal = useMemo(() => 
    shoppingList.reduce((acc, item) => acc + (item.price * item.quantity), 0)
  , [shoppingList]);

  const getCategoryIcon = (category: string) => {
    const cat = CONTINENTE_CATEGORIES.find(c => c.id === category) || COMMON_CATEGORIES.find(c => c.id === category);
    return cat?.icon || '📦';
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setView('catalog')}>
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-lg font-black italic">SP</div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-black uppercase tracking-tighter leading-none">SuperPoupe <span className="text-red-600">AI</span></h1>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{dbTotal} ARTIGOS CLOUD</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <nav className="flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setView('catalog')} className={`px-4 py-2 rounded-lg font-black uppercase text-[10px] ${view === 'catalog' ? 'bg-white shadow-sm text-red-600' : 'text-slate-500'}`}>Mercado</button>
              <button onClick={() => setView('list')} className={`px-4 py-2 rounded-lg font-black uppercase text-[10px] ${view === 'list' ? 'bg-white shadow-sm text-green-600' : 'text-slate-500'}`}>Cesto ({shoppingList.length})</button>
              {isLoggedIn && (
                <button onClick={() => setView('admin')} className={`px-4 py-2 rounded-lg font-black uppercase text-[10px] ${view === 'admin' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>Admin</button>
              )}
            </nav>
            {!isLoggedIn ? (
              <button onClick={() => setShowLogin(true)} className="p-2.5 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 transition-all">🔒</button>
            ) : (
              <button onClick={() => { setIsLoggedIn(false); setView('catalog'); }} className="p-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-[10px] uppercase">Sair</button>
            )}
          </div>
        </div>
      </header>

      {showLogin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md p-10 relative">
            <button onClick={() => setShowLogin(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900 text-2xl">✕</button>
            <h3 className="text-2xl font-black uppercase tracking-tighter italic mb-8">Acesso <span className="text-red-600">Admin</span></h3>
            <form onSubmit={handleLogin} className="space-y-4">
              <input type="email" placeholder="Email" className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
              <input type="password" placeholder="Senha" className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} required />
              <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest mt-4">Entrar</button>
            </form>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        {dbError && (
          <div className="mb-8 bg-red-50 border-2 border-red-200 p-8 rounded-[30px] shadow-sm">
            <h2 className="text-red-800 font-black uppercase tracking-tight flex items-center gap-3 mb-2">
              <span className="text-2xl">🚨</span> Erro de Sincronização
            </h2>
            <p className="text-red-700 text-sm font-medium mb-4">{dbError}</p>
          </div>
        )}

        {view === 'admin' ? (
          <div className="space-y-8">
            {/* Terminal de Importação */}
            <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl">
              <h2 className="text-2xl font-black uppercase italic mb-6 tracking-tighter">1. Importar <span className="text-blue-500">Dados</span></h2>
              <textarea 
                className="w-full h-32 p-4 bg-slate-950 rounded-2xl border-none text-[11px] font-mono text-green-400 outline-none resize-none mb-4"
                placeholder="Cole o texto aqui..."
                value={rawTextImport}
                onChange={(e) => setRawTextImport(e.target.value)}
              />
              <button onClick={handleMassiveImport} disabled={isSyncing} className="w-full bg-white text-slate-900 py-4 rounded-xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all">
                {isSyncing ? 'A SINCRONIZAR...' : 'ENVIAR PARA CLOUD'}
              </button>
            </div>

            {/* Gestão de Imagens */}
            <div className="bg-white rounded-[50px] shadow-2xl p-10 border border-slate-100">
               <div className="flex justify-between items-center mb-10">
                 <h2 className="text-2xl font-black uppercase tracking-tighter">2. Gestão de <span className="text-blue-600">Fotos</span></h2>
                 <input type="text" placeholder="Filtrar por nome..." className="bg-slate-100 px-6 py-3 rounded-xl font-bold text-sm border-none w-64" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                 {uniqueCatalog.map(p => (
                   <div key={p.id} className="flex flex-col p-4 border rounded-3xl bg-slate-50/50 group hover:border-blue-200 transition-all">
                     <div className="aspect-square bg-white rounded-2xl flex items-center justify-center overflow-hidden mb-3 relative">
                       {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-contain p-2" /> : <span className="text-4xl opacity-10">{getCategoryIcon(p.category)}</span>}
                       <label className="absolute inset-0 bg-blue-600/90 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                         <span className="text-xl">📸</span>
                         <span className="text-[9px] font-black uppercase">Escolher Foto</span>
                         <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files && handleFilePreview(p.id, e.target.files[0])} />
                       </label>
                     </div>
                     
                     <div className="mb-3 px-1 space-y-1">
                        <p className="font-black text-[11px] uppercase leading-tight text-slate-800 h-8 overflow-hidden line-clamp-2" title={p.name}>{p.name}</p>
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase">
                          <span className="text-blue-600">{p.price.toFixed(2)}€</span>
                          <span className="bg-slate-200 px-1.5 py-0.5 rounded text-[8px]">{p.unit}</span>
                        </div>
                     </div>

                     <button 
                        onClick={() => saveProductImage(p)}
                        disabled={savingProductId === p.id}
                        className={`w-full py-3 rounded-xl font-black uppercase text-[9px] transition-all ${savingProductId === p.id ? 'bg-slate-200 text-slate-400' : 'bg-blue-600 text-white shadow-lg hover:bg-blue-700'}`}
                     >
                       {savingProductId === p.id ? 'A GUARDAR...' : '💾 GUARDAR NA CLOUD'}
                     </button>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <aside className="space-y-6">
              <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Secções</p>
                <div className="space-y-1 max-h-[500px] overflow-y-auto scrollbar-hide">
                  <button onClick={() => setActiveCategory('todos')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-[11px] ${activeCategory === 'todos' ? 'text-red-600 bg-red-50' : 'text-slate-400 hover:text-slate-600'}`}>Tudo</button>
                  {currentCategories.map(cat => (
                    <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-[11px] ${activeCategory === cat.id ? 'text-red-600 bg-red-50' : 'text-slate-400 hover:text-slate-600'}`}>{cat.icon} {cat.name}</button>
                  ))}
                </div>
              </div>
            </aside>

            <div className="lg:col-span-3 space-y-6">
              <div className="relative">
                <span className="absolute left-7 top-1/2 -translate-y-1/2 text-xl opacity-30">🔍</span>
                <input 
                  type="text" 
                  placeholder={`Pesquisar entre ${dbTotal} artigos...`} 
                  className="w-full bg-white px-16 py-6 rounded-[30px] shadow-sm border-none font-bold text-lg focus:ring-4 focus:ring-red-100"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {isLoading && <div className="absolute right-8 top-1/2 -translate-y-1/2 w-6 h-6 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>}
              </div>

              {view === 'catalog' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {uniqueCatalog.map(p => (
                    <div key={p.id} className="bg-white rounded-[40px] shadow-sm border border-slate-100 flex flex-col overflow-hidden hover:shadow-xl transition-all">
                      <div className="h-48 bg-slate-50 relative flex items-center justify-center">
                        {p.imageUrl ? <img src={p.imageUrl} className="w-full h-full object-contain p-4" /> : <span className="text-6xl opacity-10">{getCategoryIcon(p.category)}</span>}
                        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[8px] font-black uppercase shadow-sm">{p.store}</div>
                      </div>
                      <div className="p-6 flex flex-col flex-1">
                        <h3 className="font-black text-slate-800 text-sm uppercase leading-tight h-10 overflow-hidden mb-2">{p.name}</h3>
                        <div className="flex justify-between items-center mt-auto pt-4 border-t border-slate-50">
                          <p className="text-[24px] font-black tracking-tighter text-slate-900">{p.price.toFixed(2)}€</p>
                          <button onClick={() => addToCart(p)} className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-2xl hover:bg-red-600 shadow-lg transition-all">+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-[50px] shadow-2xl p-10 border border-slate-100">
                  <div className="flex justify-between items-end mb-10">
                    <h2 className="text-4xl font-black uppercase italic tracking-tighter">Meu <span className="text-red-600">Cesto</span></h2>
                    <p className="text-6xl font-black tracking-tighter">{cartTotal.toFixed(2)}€</p>
                  </div>
                  <div className="space-y-4">
                    {shoppingList.map(item => (
                      <div key={item.id} className={`flex items-center gap-5 p-4 rounded-[28px] border ${item.checked ? 'bg-slate-50 opacity-40 grayscale' : 'bg-white shadow-md'}`}>
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center overflow-hidden shrink-0">
                          {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-contain p-1" /> : <span className="text-2xl">{getCategoryIcon(item.category)}</span>}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-black uppercase text-xs tracking-tight">{item.name}</h4>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{item.quantity} UN • {item.price.toFixed(2)}€/un</p>
                        </div>
                        <button onClick={() => setShoppingList(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))} className={`w-10 h-10 rounded-xl border-4 ${item.checked ? 'bg-green-500 border-green-200 text-white' : 'bg-slate-50 border-white text-transparent'}`}>✓</button>
                        <button onClick={() => setShoppingList(prev => prev.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-600 p-2">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
