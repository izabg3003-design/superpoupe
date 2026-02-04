
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
    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPass = loginPass.trim();

    console.log("Tentativa de Login:", cleanEmail);

    if (cleanEmail === ADMIN_EMAIL.toLowerCase() && cleanPass === ADMIN_PASSWORD) {
      console.log("Login de Admin bem-sucedido!");
      setIsLoggedIn(true);
      setShowLogin(false);
      setView('admin');
      setLoginPass('');
    } else {
      console.warn("Falha no login: Credenciais não coincidem.");
      alert("Credenciais incorretas.\nE-mail: " + ADMIN_EMAIL + "\nVerifique se a senha está correta.");
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
      setCatalog(prev => prev.map(p => p.id === productId ? { ...p, imageUrl: base64 } : p));
      
      const product = catalog.find(p => p.id === productId);
      if (product) {
        try {
          await upsertProducts([{ ...product, imageUrl: base64 }]);
        } catch (err) {
          console.error("Erro ao salvar imagem:", err);
          alert("Erro ao salvar imagem.");
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGlobalCleanup = async () => {
    if (!window.confirm("Deseja limpar todos os nomes duplicados na base de dados?")) return;
    setIsSyncing(true);
    try {
      const productsToUpdate = catalog.map(p => ({ ...p, name: sanitizeName(p.name) }));
      await upsertProducts(productsToUpdate);
      alert("Limpeza concluída!");
      await refreshData();
    } catch (e) {
      alert("Erro na limpeza.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleMassiveImport = async () => {
    if (!rawTextImport.trim() || isSyncing) return;
    setIsSyncing(true);
    
    const lines = rawTextImport.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const productsMap = new Map<string, Product>();
    
    // Lógica de Extração Robusta
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let price = 0;
      let nameIndex = -1;

      // Detecta padrão de preço "10,50€" ou similar
      const priceMatch = line.match(/(\d+),(\d{2})€/);
      if (priceMatch) {
        price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
        nameIndex = i - 1;
      }

      if (price > 0 && nameIndex >= 0) {
        const rawName = lines[nameIndex];
        const name = sanitizeName(rawName);
        if (name && name.length > 3) {
          const id = `c-${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
          productsMap.set(id, {
            id,
            name,
            category: 'Mercearia',
            price,
            unit: 'un',
            store: 'continente',
            lastUpdated: new Date().toISOString()
          });
        }
      }
    }

    const toImport = Array.from(productsMap.values());
    if (toImport.length > 0) {
      try {
        await upsertProducts(toImport);
        alert(`Sucesso! ${toImport.length} artigos importados.`);
        setRawTextImport('');
        await refreshData();
      } catch (e) {
        alert("Erro ao salvar no banco de dados.");
      }
    } else {
      alert("Não foram detetados produtos no texto colado.");
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

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans text-slate-900">
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
              <button onClick={() => { setIsLoggedIn(false); setView('catalog'); }} className="p-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-xs uppercase">Sair</button>
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
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2 mb-1 block">Email Autorizado</label>
                <input 
                  type="email" 
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-red-500"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="poupe@poupe.com"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2 mb-1 block">Senha do Painel</label>
                <input 
                  type="password" 
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-red-500"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest mt-4 shadow-xl active:scale-95 transition-all">
                Entrar no Painel
              </button>
            </form>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        {view === 'admin' ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl border-4 border-blue-600/20">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter">Painel de <span className="text-blue-500">Controlo</span></h2>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Bem-vindo, Administrador.</p>
                </div>
                <button 
                  onClick={handleGlobalCleanup} 
                  disabled={isSyncing}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs transition-all shadow-lg flex items-center gap-2"
                >
                  {isSyncing ? 'A Processar...' : '✨ Limpar Nomes Duplicados'}
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase text-slate-500 ml-1">Importação Massiva de Texto</p>
                <textarea 
                  className="w-full h-32 p-6 bg-slate-800 rounded-2xl border-none text-[10px] font-mono text-green-400 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Cole o texto do site do Continente ou Lidl aqui..."
                  value={rawTextImport}
                  onChange={(e) => setRawTextImport(e.target.value)}
                  disabled={isSyncing}
                />
                <button 
                  onClick={handleMassiveImport} 
                  disabled={isSyncing || !rawTextImport}
                  className="bg-white text-slate-900 px-10 py-4 rounded-xl font-black uppercase text-xs hover:bg-blue-50 transition-all disabled:opacity-30"
                >
                  {isSyncing ? 'A Importar...' : 'Processar e Salvar Artigos'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[50px] shadow-2xl p-10 border border-slate-100">
               <div className="flex justify-between items-center mb-10">
                 <h2 className="text-2xl font-black uppercase tracking-tighter">Galeria de <span className="text-blue-600">Fotos</span></h2>
                 <input 
                    type="text" 
                    placeholder="Procurar artigo para foto..." 
                    className="bg-slate-100 px-6 py-3 rounded-xl font-bold text-sm border-none w-64 focus:ring-2 focus:ring-blue-600"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                 {uniqueCatalog.map(p => (
                   <div key={p.id} className="flex flex-col p-4 border rounded-3xl hover:border-blue-200 transition-all bg-slate-50/50 group">
                     <div className="aspect-square bg-white rounded-2xl flex items-center justify-center overflow-hidden mb-3 relative border-2 border-transparent group-hover:border-blue-100">
                       {p.imageUrl ? (
                         <img src={p.imageUrl} className="w-full h-full object-contain p-2" />
                       ) : (
                         <span className="text-4xl opacity-10">{getCategoryIcon(p.category)}</span>
                       )}
                       <label className="absolute inset-0 bg-blue-600/90 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                         <span className="text-2xl">📸</span>
                         <span className="text-[9px] font-black uppercase mt-1">Mudar Foto</span>
                         <input 
                           type="file" 
                           className="hidden" 
                           accept="image/*" 
                           onChange={(e) => e.target.files && handleFileUpload(p.id, e.target.files[0])} 
                         />
                       </label>
                     </div>
                     <p className="font-black text-[10px] uppercase truncate text-slate-800 mb-1">{p.name}</p>
                     <div className="flex justify-between items-center">
                        <span className="text-[8px] font-bold text-slate-400 uppercase">{p.store}</span>
                        <span className="text-[10px] font-black text-blue-600">{p.price.toFixed(2)}€</span>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-in slide-in-from-bottom-4 duration-500">
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
              <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Lojas</p>
                <div className="space-y-1">
                  <button onClick={() => setActiveStore('todos')} className={`w-full text-left px-4 py-3 rounded-xl font-black text-[10px] ${activeStore === 'todos' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-500'}`}>Todas</button>
                  {STORES.map(s => (
                    <button key={s.id} onClick={() => setActiveStore(s.id)} className={`w-full text-left px-4 py-3 rounded-xl font-black text-[10px] ${activeStore === s.id ? 'bg-red-600 text-white' : 'hover:bg-slate-50 text-slate-500'}`}>{s.name}</button>
                  ))}
                </div>
              </div>
            </aside>

            <div className="lg:col-span-3 space-y-6">
              <div className="relative group">
                <span className="absolute left-7 top-1/2 -translate-y-1/2 text-xl opacity-30 group-focus-within:opacity-100 transition-opacity">🔍</span>
                <input 
                  type="text" 
                  placeholder={`Pesquisar entre ${dbTotal} artigos únicos...`} 
                  className="w-full bg-white px-16 py-6 rounded-[30px] shadow-sm border-none focus:ring-4 focus:ring-red-100 font-bold text-lg transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {isLoading && <div className="absolute right-8 top-1/2 -translate-y-1/2 w-6 h-6 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>}
              </div>

              {view === 'catalog' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {uniqueCatalog.map(p => (
                    <div key={p.id} className="bg-white rounded-[40px] shadow-sm border border-slate-100 hover:shadow-2xl hover:-translate-y-2 transition-all flex flex-col overflow-hidden group">
                      <div className="h-48 bg-slate-50 relative flex items-center justify-center overflow-hidden">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform duration-500" />
                        ) : (
                          <div className="flex flex-col items-center gap-2 opacity-10 group-hover:opacity-30 transition-opacity">
                            <span className="text-6xl">{getCategoryIcon(p.category)}</span>
                            <span className="text-[10px] font-black uppercase tracking-widest">Sem Foto</span>
                          </div>
                        )}
                        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[8px] font-black uppercase shadow-sm">{p.store}</div>
                      </div>
                      
                      <div className="p-6 flex flex-col flex-1">
                        <h3 className="font-black text-slate-800 text-sm uppercase leading-tight h-10 overflow-hidden mb-2 group-hover:text-red-600 transition-colors">{p.name}</h3>
                        <div className="flex justify-between items-center mt-auto pt-4 border-t border-slate-50">
                          <div>
                            <p className="text-[24px] font-black tracking-tighter text-slate-900 leading-none">{p.price.toFixed(2)}€</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{p.unit}</p>
                          </div>
                          <button onClick={() => addToCart(p)} className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-2xl hover:bg-red-600 transition-all shadow-lg active:scale-90">+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {uniqueCatalog.length === 0 && !isLoading && (
                    <div className="col-span-full py-20 text-center opacity-20 font-black uppercase italic text-2xl">Sem resultados</div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-[50px] shadow-2xl p-10 border border-slate-100 animate-in zoom-in-95 duration-300">
                  <div className="flex justify-between items-end mb-12">
                    <div>
                      <h2 className="text-4xl font-black uppercase italic tracking-tighter">Minha <span className="text-red-600">Lista</span></h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest">{shoppingList.length} ARTIGOS NO CESTO</p>
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
                          <p className="text-[9px] font-bold text-slate-400 uppercase">{item.quantity} UN • {item.price.toFixed(2)}€/un</p>
                        </div>
                        <div className="text-xl font-black">{(item.price * item.quantity).toFixed(2)}€</div>
                        <button onClick={() => setShoppingList(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))} className={`w-10 h-10 rounded-xl border-4 flex items-center justify-center text-xl ${item.checked ? 'bg-green-500 border-green-200 text-white' : 'bg-slate-50 border-white text-transparent'}`}>✓</button>
                        <button onClick={() => setShoppingList(prev => prev.filter(i => i.id !== item.id))} className="text-slate-200 hover:text-red-600 transition-colors">✕</button>
                      </div>
                    ))}
                    {shoppingList.length === 0 && (
                      <div className="py-20 text-center text-slate-300 font-black uppercase italic">Lista vazia. Vamos às compras?</div>
                    )}
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
