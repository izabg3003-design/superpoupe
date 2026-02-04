
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

  // Estados de Admin e Login
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [rawTextImport, setRawTextImport] = useState('');

  // Fix: Defined currentCategories based on activeStore to resolve missing variable error
  const currentCategories = useMemo(() => {
    return activeStore === 'continente' ? CONTINENTE_CATEGORIES : COMMON_CATEGORIES;
  }, [activeStore]);

  // Sanitizador de Nomes (Gaguez)
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
    const words = text.split(/\s+/);
    if (words.length >= 4 && words.length % 2 === 0) {
      const half = words.length / 2;
      const firstHalfWords = words.slice(0, half).join(" ");
      const secondHalfWords = words.slice(half).join(" ");
      if (firstHalfWords.toLowerCase() === secondHalfWords.toLowerCase()) return firstHalfWords;
    }
    return text;
  }, []);

  const refreshData = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    try {
      const storeFilter = activeStore === 'todos' ? undefined : activeStore as StoreId;
      const data = await fetchProductsFromCloud(searchTerm, activeCategory, storeFilter);
      setCatalog(data);
      const total = await getCloudTotalCount();
      setDbTotal(total);
    } catch (e) {
      console.error("Erro ao carregar:", e);
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
    if (loginEmail === ADMIN_EMAIL && loginPass === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setShowLogin(false);
      setView('admin');
    } else {
      alert("Credenciais incorretas.");
    }
  };

  const getCategoryIcon = (category: string) => {
    const cat = CONTINENTE_CATEGORIES.find(c => c.name === category) || COMMON_CATEGORIES.find(c => c.name === category);
    return cat?.icon || '📦';
  };

  const handleFileUpload = (productId: string, file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      // Atualizar no catálogo local imediatamente para feedback visual
      setCatalog(prev => prev.map(p => p.id === productId ? { ...p, imageUrl: base64 } : p));
      
      // Enviar para o Supabase
      const product = catalog.find(p => p.id === productId);
      if (product) {
        try {
          await upsertProducts([{ ...product, imageUrl: base64 }]);
        } catch (err) {
          console.error("Erro ao salvar imagem:", err);
        }
      }
    };
    reader.readAsDataURL(file);
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

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans text-slate-900">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setView('catalog')}>
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-lg font-black italic">SP</div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-black uppercase tracking-tighter leading-none">SuperPoupe <span className="text-red-600">AI</span></h1>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{dbTotal} ARTIGOS</p>
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
              <button onClick={() => setIsLoggedIn(false)} className="p-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-xs uppercase">Sair</button>
            )}
          </div>
        </div>
      </header>

      {/* LOGIN MODAL */}
      {showLogin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md p-10 relative">
            <button onClick={() => setShowLogin(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900 text-2xl">✕</button>
            <h3 className="text-2xl font-black uppercase tracking-tighter italic mb-8">Acesso <span className="text-red-600">Admin</span></h3>
            <form onSubmit={handleLogin} className="space-y-4">
              <input 
                type="email" 
                placeholder="Email" 
                className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
              <input 
                type="password" 
                placeholder="Senha" 
                className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                required
              />
              <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest mt-4">Entrar</button>
            </form>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        {view === 'admin' ? (
          <div className="bg-white rounded-[50px] shadow-2xl p-10 border border-slate-100">
             <div className="flex justify-between items-center mb-10">
               <h2 className="text-4xl font-black uppercase italic tracking-tighter">Gestão de <span className="text-blue-600">Imagens</span></h2>
               <div className="w-64">
                  <input 
                    type="text" 
                    placeholder="Filtrar por nome..." 
                    className="w-full bg-slate-100 px-6 py-3 rounded-xl font-bold text-sm border-none focus:ring-2 focus:ring-blue-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
               </div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
               {uniqueCatalog.map(p => (
                 <div key={p.id} className="flex items-center gap-4 p-4 border rounded-3xl hover:border-blue-200 transition-colors">
                   <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 relative group">
                     {p.imageUrl ? (
                       <img src={p.imageUrl} className="w-full h-full object-contain" />
                     ) : (
                       <span className="text-3xl opacity-20">{getCategoryIcon(p.category)}</span>
                     )}
                     <label className="absolute inset-0 bg-blue-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-[10px] font-black uppercase">
                       Mudar
                       <input 
                         type="file" 
                         className="hidden" 
                         accept="image/*" 
                         onChange={(e) => e.target.files && handleFileUpload(p.id, e.target.files[0])} 
                       />
                     </label>
                   </div>
                   <div className="flex-1 min-w-0">
                     <p className="font-black text-[10px] uppercase truncate text-slate-800">{p.name}</p>
                     <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">{p.store} • {p.price.toFixed(2)}€</p>
                   </div>
                 </div>
               ))}
             </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <aside className="space-y-6">
              <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Filtros</p>
                <div className="space-y-1 max-h-[500px] overflow-y-auto scrollbar-hide">
                  <button onClick={() => setActiveCategory('todos')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-[11px] ${activeCategory === 'todos' ? 'text-red-600 bg-red-50' : 'text-slate-400'}`}>Tudo</button>
                  {currentCategories.map(cat => (
                    <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-[11px] ${activeCategory === cat.id ? 'text-red-600 bg-red-50' : 'text-slate-400'}`}>{cat.icon} {cat.name}</button>
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
                  className="w-full bg-white px-16 py-6 rounded-[30px] shadow-sm border-none focus:ring-4 focus:ring-red-100 font-bold text-lg"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {view === 'catalog' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {uniqueCatalog.map(p => (
                    <div key={p.id} className="bg-white rounded-[40px] shadow-sm border border-slate-100 hover:shadow-2xl hover:-translate-y-1 transition-all flex flex-col overflow-hidden group">
                      <div className="h-44 bg-slate-50 relative flex items-center justify-center overflow-hidden">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform" />
                        ) : (
                          <div className="flex flex-col items-center gap-2 opacity-10 group-hover:opacity-30 transition-opacity">
                            <span className="text-6xl">{getCategoryIcon(p.category)}</span>
                            <span className="text-[10px] font-black uppercase tracking-widest">Sem Foto</span>
                          </div>
                        )}
                        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[8px] font-black uppercase shadow-sm">{p.store}</div>
                      </div>
                      
                      <div className="p-6 flex flex-col flex-1">
                        <h3 className="font-black text-slate-800 text-sm uppercase leading-tight h-10 overflow-hidden mb-2">{p.name}</h3>
                        <div className="flex justify-between items-center mt-auto pt-4">
                          <div>
                            <p className="text-[24px] font-black tracking-tighter text-slate-900 leading-none">{p.price.toFixed(2)}€</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{p.unit}</p>
                          </div>
                          <button onClick={() => addToCart(p)} className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-2xl hover:bg-red-600 transition-all shadow-lg">+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-[50px] shadow-2xl p-10 border border-slate-100">
                  <div className="flex justify-between items-end mb-12">
                    <div>
                      <h2 className="text-4xl font-black uppercase italic tracking-tighter">Minha <span className="text-red-600">Lista</span></h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest">{shoppingList.length} ARTIGOS</p>
                    </div>
                    <p className="text-7xl font-black tracking-tighter text-slate-900">{cartTotal.toFixed(2)}€</p>
                  </div>
                  <div className="space-y-4">
                    {shoppingList.map(item => (
                      <div key={item.id} className={`flex items-center gap-5 p-4 rounded-[28px] border transition-all ${item.checked ? 'bg-slate-50 opacity-40 grayscale' : 'bg-white shadow-md'}`}>
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center overflow-hidden shrink-0">
                          {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-contain p-1" /> : <span className="text-2xl">{getCategoryIcon(item.category)}</span>}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-black uppercase text-xs tracking-tight">{item.name}</h4>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{item.quantity} UN • {item.price.toFixed(2)}€</p>
                        </div>
                        <div className="text-xl font-black">{(item.price * item.quantity).toFixed(2)}€</div>
                        <button onClick={() => setShoppingList(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))} className={`w-10 h-10 rounded-xl border-4 flex items-center justify-center text-xl ${item.checked ? 'bg-green-500 border-green-200 text-white' : 'bg-slate-50 border-white text-transparent'}`}>✓</button>
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
