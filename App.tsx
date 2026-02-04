
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StoreId, Product, ShoppingItem } from './types';
import { STORES, CONTINENTE_CATEGORIES, COMMON_CATEGORIES } from './constants';
import { fetchProductsFromCloud, getCloudTotalCount, upsertProducts, supabase } from './services/supabaseService';

const App: React.FC = () => {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('todos');
  const [activeStore, setActiveStore] = useState<StoreId | 'todos'>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'catalog' | 'list'>('catalog');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dbTotal, setDbTotal] = useState(0);
  const [isMasterMode, setIsMasterMode] = useState(false);
  const [rawTextImport, setRawTextImport] = useState('');
  const [importStatus, setImportStatus] = useState({ current: 0, total: 0, errors: 0 });

  // Função robusta para limpar nomes que repetem o texto integralmente (ex: "Produto X Produto X")
  const sanitizeName = useCallback((name: string): string => {
    let text = name.trim();
    if (!text || text.length < 4) return text;

    // Caso 1: Divisão exata por caractere (com offset para lidar com espaços fantasmas no meio)
    // "Água Serra Água Serra" -> Comprimento 22. Mid 11.
    for (let offset = -2; offset <= 2; offset++) {
      const mid = Math.floor(text.length / 2) + offset;
      if (mid <= 2 || mid >= text.length - 2) continue;
      
      const part1 = text.substring(0, mid).trim();
      const part2 = text.substring(mid).trim();
      
      if (part1.toLowerCase() === part2.toLowerCase()) {
        return part1;
      }
    }

    // Caso 2: Divisão por palavras (ex: "Vinho Tinto Douro Vinho Tinto Douro")
    const words = text.split(/\s+/);
    if (words.length >= 4 && words.length % 2 === 0) {
      const half = words.length / 2;
      const firstHalfWords = words.slice(0, half).join(" ");
      const secondHalfWords = words.slice(half).join(" ");
      if (firstHalfWords.toLowerCase() === secondHalfWords.toLowerCase()) {
        return firstHalfWords;
      }
    }

    // Caso 3: Verificação de "Sub-repetição" (Início igual ao Fim)
    // Útil para quando o site repete apenas parte do nome no fim.
    const wordsArray = text.split(" ");
    if (wordsArray.length > 3) {
      const firstWord = wordsArray[0].toLowerCase();
      // Se a primeira palavra reaparece exatamente no meio
      const midPoint = Math.floor(wordsArray.length / 2);
      if (wordsArray[midPoint].toLowerCase() === firstWord) {
         const p1 = wordsArray.slice(0, midPoint).join(" ");
         const p2 = wordsArray.slice(midPoint).join(" ");
         if (p1.toLowerCase() === p2.toLowerCase()) return p1;
      }
    }

    return text;
  }, []);

  const currentCategories = useMemo(() => 
    activeStore === 'continente' ? CONTINENTE_CATEGORIES : COMMON_CATEGORIES
  , [activeStore]);

  // Aplica a sanitização na exibição para garantir que o utilizador nunca veja nomes feios
  const uniqueCatalog = useMemo(() => {
    const seen = new Set<string>();
    return catalog
      .map(p => ({ ...p, name: sanitizeName(p.name) })) // Limpa o nome na hora de mostrar
      .filter(p => {
        const key = `${p.name.toLowerCase().trim()}-${p.store}-${p.unit.toLowerCase().trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [catalog, sanitizeName]);

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

  const autoCategorize = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes('vinho') || n.includes('porto') || n.includes('cerveja')) return 'Bebidas e Garrafeira';
    if (n.includes('pão') || n.includes('bola') || n.includes('bolo')) return 'Padaria e Pastelaria';
    if (n.includes('queijo') || n.includes('leite') || n.includes('iogurte')) return 'Laticínios e Ovos';
    if (n.includes('carne') || n.includes('frango') || n.includes('fiambre')) return 'Talho e Charcutaria';
    if (n.includes('peixe') || n.includes('bacalhau') || n.includes('pescada')) return 'Peixaria e Congelados';
    if (n.includes('fruta') || n.includes('banana')) return 'Frutas e Legumes';
    if (n.includes('limpeza') || n.includes('detergente')) return 'Limpeza';
    return 'Mercearia';
  };

  const isUnit = (s: string) => {
    const low = s.toLowerCase();
    return low.includes('emb.') || low.includes('gr') || low.includes('kg') || low.includes('un') || 
           low.includes('cl') || low.includes('ml') || low.includes('lt');
  };

  const generateStableId = (name: string, unit: string): string => {
    const cleanName = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const cleanUnit = unit.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const base = `${cleanName}${cleanUnit}`;
    let hash = 0;
    for (let i = 0; i < base.length; i++) {
      hash = ((hash << 5) - hash) + base.charCodeAt(i);
      hash |= 0;
    }
    return `u${Math.abs(hash).toString(36)}`;
  };

  const handleGlobalCleanup = async () => {
    if (!window.confirm("Isto irá percorrer todos os itens visíveis e corrigir os nomes duplicados na Base de Dados. Continuar?")) return;
    setIsSyncing(true);
    const productsToUpdate = catalog.map(p => ({
      ...p,
      name: sanitizeName(p.name)
    }));
    
    try {
      await upsertProducts(productsToUpdate);
      alert("Limpeza Global concluída com sucesso!");
      await refreshData();
    } catch (e) {
      alert("Erro ao limpar base de dados.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleMassiveImport = async () => {
    if (!rawTextImport.trim() || isSyncing) return;
    setIsSyncing(true);
    setImportStatus({ current: 0, total: 0, errors: 0 });

    const lines = rawTextImport.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const productsMap = new Map<string, Product>();
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let fullPrice = 0;
      let startIdx = -1;

      if (line.startsWith(',') && line.includes('€')) {
        const integerPart = lines[i-1];
        if (integerPart && /^\d+$/.test(integerPart)) {
          const centsPart = line.split('€')[0].replace(',', '');
          fullPrice = parseFloat(`${integerPart}.${centsPart}`);
          startIdx = i - 2;
        }
      } else if (/\d+,\d{2}€/.test(line)) {
        fullPrice = parseFloat(line.replace('€', '').replace(',', '.'));
        startIdx = i - 1;
      }

      if (fullPrice > 0 && startIdx >= 0) {
        let foundUnit = 'un';
        let nameLines: string[] = [];

        for (let j = startIdx; j >= Math.max(0, startIdx - 15); j--) {
          const candidate = lines[j];
          if (isUnit(candidate)) {
            foundUnit = candidate;
          } else if (candidate.length > 2 && !/^\d+$/.test(candidate) && !candidate.includes('€') && !candidate.includes('PVP')) {
            if (!nameLines.includes(candidate)) {
              nameLines.unshift(candidate);
            }
            if (nameLines.length >= 2) break; 
          }
        }

        let rawName = nameLines.join(' ').trim();
        let foundName = sanitizeName(rawName);

        if (foundName && foundName.length > 3) {
          const id = generateStableId(foundName, foundUnit);
          productsMap.set(id, {
            id,
            name: foundName,
            category: autoCategorize(foundName),
            price: fullPrice,
            unit: foundUnit,
            store: 'continente',
            lastUpdated: new Date().toISOString()
          });
        }
      }
    }

    const allProducts = Array.from(productsMap.values());
    setImportStatus(prev => ({ ...prev, total: allProducts.length }));

    if (allProducts.length === 0) {
      alert("Nenhum produto detetado.");
      setIsSyncing(false);
      return;
    }

    const batchSize = 100;
    for (let i = 0; i < allProducts.length; i += batchSize) {
      const batch = allProducts.slice(i, i + batchSize);
      try {
        await upsertProducts(batch);
        setImportStatus(prev => ({ ...prev, current: Math.min(allProducts.length, i + batchSize) }));
      } catch (e) {
        setImportStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
      }
    }

    alert(`Importação Concluída: ${allProducts.length} itens.`);
    setRawTextImport('');
    await refreshData();
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
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-lg font-black italic">SP</div>
            <div>
              <h1 className="text-lg font-black uppercase tracking-tighter leading-none">SuperPoupe <span className="text-red-600">AI</span></h1>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{dbTotal} ARTIGOS ÚNICOS</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <nav className="flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setView('catalog')} className={`px-4 py-2 rounded-lg font-black uppercase text-[10px] ${view === 'catalog' ? 'bg-white shadow-sm text-red-600' : 'text-slate-500'}`}>Mercado</button>
              <button onClick={() => setView('list')} className={`px-4 py-2 rounded-lg font-black uppercase text-[10px] ${view === 'list' ? 'bg-white shadow-sm text-green-600' : 'text-slate-500'}`}>Cesto ({shoppingList.length})</button>
            </nav>
            <button onClick={() => setIsMasterMode(!isMasterMode)} className={`p-2.5 rounded-xl transition-all ${isMasterMode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>⚙️</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        {isMasterMode && (
          <div className="mb-10 bg-slate-900 text-white p-8 rounded-[32px] shadow-2xl border-4 border-red-600/20">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-black uppercase italic tracking-tight mb-2">🚀 Sanitização Avançada</h3>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">O robô agora remove nomes repetidos automaticamente.</p>
              </div>
              <button 
                onClick={handleGlobalCleanup} 
                disabled={isSyncing}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] transition-all shadow-lg flex items-center gap-2"
              >
                ✨ LIMPEZA GLOBAL DA DB
              </button>
            </div>

            <textarea 
              className="w-full h-48 p-6 bg-slate-800 rounded-2xl mb-6 border-none text-[10px] font-mono text-green-400 focus:ring-2 focus:ring-red-500 outline-none resize-none"
              placeholder="Cole aqui o texto do site..."
              value={rawTextImport}
              onChange={(e) => setRawTextImport(e.target.value)}
              disabled={isSyncing}
            />
            <div className="flex gap-4 items-center">
              <button 
                onClick={handleMassiveImport} 
                disabled={isSyncing || !rawTextImport}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-30 text-white px-10 py-4 rounded-xl font-black uppercase text-xs transition-all shadow-xl"
              >
                {isSyncing ? `A SINCRONIZAR...` : 'EXECUTAR IMPORTAÇÃO LIMPA'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <aside className="space-y-6">
            <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Loja</p>
              <div className="space-y-1.5">
                <button onClick={() => setActiveStore('todos')} className={`w-full text-left px-4 py-3 rounded-xl font-black uppercase text-[10px] ${activeStore === 'todos' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>🌍 Todas as Lojas</button>
                {STORES.map(s => (
                  <button key={s.id} onClick={() => setActiveStore(s.id)} className={`w-full text-left px-4 py-3 rounded-xl font-black uppercase text-[10px] ${activeStore === s.id ? 'bg-red-600 text-white shadow-lg' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>🏪 {s.name}</button>
                ))}
              </div>
            </div>

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
                className="w-full bg-white px-16 py-6 rounded-[30px] shadow-sm border-none focus:ring-4 focus:ring-red-100 font-bold text-lg"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {isLoading && <div className="absolute right-8 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>}
            </div>

            {view === 'catalog' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {uniqueCatalog.map(p => (
                  <div key={p.id} className="bg-white p-6 rounded-[40px] shadow-sm border border-slate-100 hover:shadow-xl transition-all flex flex-col justify-between group">
                    <div>
                      <div className="flex justify-between items-center mb-5">
                        <span className="text-[8px] font-black uppercase bg-slate-900 text-white px-2 py-1 rounded-md">{p.store}</span>
                        <span className="text-[9px] font-bold text-slate-300 uppercase truncate max-w-[100px]">{p.unit}</span>
                      </div>
                      <h3 className="font-black text-slate-800 text-sm uppercase leading-tight group-hover:text-red-600 transition-colors h-10 overflow-hidden">{p.name}</h3>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">{p.category}</p>
                    </div>
                    <div className="flex justify-between items-end mt-8">
                      <div className="text-3xl font-black tracking-tighter text-slate-900">{p.price.toFixed(2)}€</div>
                      <button onClick={() => addToCart(p)} className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-2xl hover:bg-red-600 transition-all shadow-lg">+</button>
                    </div>
                  </div>
                ))}
                {uniqueCatalog.length === 0 && !isLoading && (
                  <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase italic text-xl">Nenhum artigo encontrado</div>
                )}
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
                
                <div className="space-y-3">
                  {shoppingList.map(item => (
                    <div key={item.id} className={`flex items-center gap-5 p-6 rounded-[28px] border transition-all ${item.checked ? 'bg-slate-50 opacity-40 grayscale' : 'bg-white shadow-md'}`}>
                      <button onClick={() => setShoppingList(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))} className={`w-10 h-10 rounded-xl border-4 flex items-center justify-center text-xl ${item.checked ? 'bg-green-500 border-green-200 text-white' : 'bg-slate-50 border-white text-transparent'}`}>✓</button>
                      <div className="flex-1">
                        <h4 className="font-black uppercase text-xs tracking-tight">{item.name}</h4>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{item.store} • {item.quantity} UN • {item.price.toFixed(2)}€/un</p>
                      </div>
                      <div className="text-xl font-black">{(item.price * item.quantity).toFixed(2)}€</div>
                      <button onClick={() => setShoppingList(prev => prev.filter(i => i.id !== item.id))} className="w-8 h-8 text-slate-200 hover:text-red-600 text-xl font-bold">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
