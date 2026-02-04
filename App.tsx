
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
  const [dbTotal, setDbTotal] = useState(0);
  const [isMasterMode, setIsMasterMode] = useState(false);
  const [rawTextImport, setRawTextImport] = useState('');
  const [importStatus, setImportStatus] = useState({ current: 0, total: 0, errors: 0 });
  
  const currentCategories = useMemo(() => 
    activeStore === 'continente' ? CONTINENTE_CATEGORIES : COMMON_CATEGORIES
  , [activeStore]);

  const refreshData = useCallback(async () => {
    if (!supabase) return;
    try {
      const storeFilter = activeStore === 'todos' ? undefined : activeStore as StoreId;
      const data = await fetchProductsFromCloud(searchTerm, activeCategory, storeFilter);
      setCatalog(data);
      const total = await getCloudTotalCount();
      setDbTotal(total);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    }
  }, [searchTerm, activeCategory, activeStore]);

  useEffect(() => { refreshData(); }, [refreshData]);

  const autoCategorize = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes('pão') || n.includes('bola') || n.includes('baguete') || n.includes('croissant') || n.includes('pastel') || n.includes('bolo')) return 'Padaria e Pastelaria';
    if (n.includes('queijo') || n.includes('leite') || n.includes('iogurte') || n.includes('ovos')) return 'Laticínios e Ovos';
    if (n.includes('carne') || n.includes('bife') || n.includes('frango') || n.includes('peru') || n.includes('porco') || n.includes('novilho') || n.includes('chouriç')) return 'Talho e Charcutaria';
    if (n.includes('peixe') || n.includes('salmão') || n.includes('bacalhau')) return 'Peixaria e Congelados';
    if (n.includes('vinho') || n.includes('cerveja') || n.includes('sumo') || n.includes('água')) return 'Bebidas e Garrafeira';
    if (n.includes('fruta') || n.includes('banana') || n.includes('laranja') || n.includes('maçã') || n.includes('tomate')) return 'Frutas e Legumes';
    if (n.includes('detergente') || n.includes('limpeza') || n.includes('papel higiénico')) return 'Limpeza';
    return 'Mercearia';
  };

  const generateStableId = (name: string, unit: string): string => {
    const base = `${name}-${unit}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    let hash = 0;
    for (let i = 0; i < base.length; i++) {
      hash = ((hash << 5) - hash) + base.charCodeAt(i);
      hash |= 0;
    }
    // Usamos um prefixo curto e o hash em base36 para encurtar o ID mantendo-o único
    return `c${Math.abs(hash).toString(36)}${base.substring(0, 8)}`;
  };

  const handleMassiveImport = async () => {
    if (!rawTextImport.trim() || isSyncing) return;
    
    setIsSyncing(true);
    setImportStatus({ current: 0, total: 0, errors: 0 });

    const lines = rawTextImport.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const productsMap = new Map<string, Product>();
    
    // Motor de Parsing Otimizado para Grandes Volumes
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Procura a âncora de preço (ex: ",99€")
      if (line.startsWith(',') && line.includes('€')) {
        const integerLine = lines[i-1];
        if (integerLine && /^\d+$/.test(integerLine)) {
          const centsPart = line.split('€')[0].replace(',', '');
          const fullPrice = parseFloat(`${integerLine}.${centsPart}`);
          
          let foundName = '';
          let foundUnit = 'un';
          
          // Retrocesso profundo para capturar Nome e Unidade ignorando ruído
          for (let j = i - 2; j >= Math.max(0, i - 15); j--) {
            const candidate = lines[j];
            if (candidate.toLowerCase().includes('emb.') || candidate.includes('gr') || candidate.includes('kg') || candidate.includes('un')) {
              foundUnit = candidate;
            } else if (candidate.length > 3 && !/^\d+$/.test(candidate) && !candidate.includes('€') && !candidate.includes('Crachá') && !candidate.includes('PVP')) {
              foundName = candidate;
              break; 
            }
          }

          if (foundName) {
            const id = generateStableId(foundName, foundUnit);
            // O Map garante a deduplicação automática ANTES de enviar ao Supabase
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
    }

    const allProducts = Array.from(productsMap.values());
    setImportStatus(prev => ({ ...prev, total: allProducts.length }));

    if (allProducts.length === 0) {
      alert("⚠️ Nenhum artigo detetado no texto. Certifique-se de copiar a lista completa.");
      setIsSyncing(false);
      return;
    }

    // Lotes de 100 para alta performance e segurança
    const batchSize = 100;
    for (let i = 0; i < allProducts.length; i += batchSize) {
      const batch = allProducts.slice(i, i + batchSize);
      try {
        await upsertProducts(batch);
        setImportStatus(prev => ({ ...prev, current: Math.min(allProducts.length, i + batchSize) }));
      } catch (e) {
        console.error("Erro no lote:", e);
        setImportStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
      }
    }

    alert(`✅ Importação concluída! ${allProducts.length} artigos processados com sucesso.`);
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
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-100 font-black italic">SP</div>
            <div>
              <h1 className="text-lg font-black uppercase tracking-tighter leading-none">SuperPoupe <span className="text-red-600">AI</span></h1>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{dbTotal} ITENS DISPONÍVEIS</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <nav className="flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setView('catalog')} className={`px-4 py-2 rounded-lg font-black uppercase text-[10px] transition-all ${view === 'catalog' ? 'bg-white shadow-sm text-red-600' : 'text-slate-500'}`}>Mercado</button>
              <button onClick={() => setView('list')} className={`px-4 py-2 rounded-lg font-black uppercase text-[10px] transition-all ${view === 'list' ? 'bg-white shadow-sm text-green-600' : 'text-slate-500'}`}>Cesto ({shoppingList.length})</button>
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
                  <h3 className="text-xl font-black uppercase italic tracking-tight">🚀 Super Importador Cloud (5.000+ Itens)</h3>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Cole aqui o texto completo do site para sincronização massiva.</p>
               </div>
               {isSyncing && (
                 <div className="text-right bg-slate-800 p-4 rounded-2xl border border-slate-700">
                   <span className="text-red-500 font-black text-xs block animate-pulse">A SINCRONIZAR...</span>
                   <div className="w-48 bg-slate-700 h-2 rounded-full mt-2 overflow-hidden">
                      <div className="bg-red-600 h-full transition-all duration-300" style={{ width: `${(importStatus.current / importStatus.total) * 100}%` }}></div>
                   </div>
                   <span className="text-[10px] text-slate-300 font-mono mt-2 block">{importStatus.current} de {importStatus.total}</span>
                 </div>
               )}
            </div>
            
            <textarea 
              className="w-full h-64 p-6 bg-slate-800 rounded-2xl mb-6 border-none text-[10px] font-mono text-green-400 focus:ring-2 focus:ring-red-500 outline-none resize-none shadow-inner"
              placeholder="Exemplo: Nome do Artigo... 2 ... ,49€ ..."
              value={rawTextImport}
              onChange={(e) => setRawTextImport(e.target.value)}
              disabled={isSyncing}
            />
            <div className="flex gap-4 items-center">
              <button 
                onClick={handleMassiveImport} 
                disabled={isSyncing || !rawTextImport}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-30 text-white px-12 py-5 rounded-2xl font-black uppercase text-sm transition-all shadow-xl shadow-red-900/40"
              >
                {isSyncing ? `PROCESSANDO LOTE...` : 'EXECUTAR IMPORTAÇÃO MASSIVA'}
              </button>
              {importStatus.errors > 0 && <span className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-[10px] font-bold uppercase">{importStatus.errors} Lotes com erro</span>}
              <button onClick={() => setRawTextImport('')} className="text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest ml-auto">Limpar Caixa</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <aside className="space-y-6">
            <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Loja</p>
              <div className="space-y-1.5">
                <button onClick={() => setActiveStore('todos')} className={`w-full text-left px-4 py-3 rounded-xl font-black uppercase text-[10px] transition-all ${activeStore === 'todos' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>🌍 Todas as Lojas</button>
                {STORES.map(s => (
                  <button key={s.id} onClick={() => setActiveStore(s.id)} className={`w-full text-left px-4 py-3 rounded-xl font-black uppercase text-[10px] transition-all ${activeStore === s.id ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>🏪 {s.name}</button>
                ))}
              </div>
            </div>

            <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Secções</p>
              <div className="space-y-1 max-h-[500px] overflow-y-auto scrollbar-hide pr-1">
                <button onClick={() => setActiveCategory('todos')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-[11px] transition-all ${activeCategory === 'todos' ? 'text-red-600 bg-red-50' : 'text-slate-400 hover:text-slate-600'}`}>Tudo</button>
                {currentCategories.map(cat => (
                  <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-[11px] transition-all ${activeCategory === cat.id ? 'text-red-600 bg-red-50' : 'text-slate-400 hover:text-slate-600'}`}>{cat.icon} {cat.name}</button>
                ))}
              </div>
            </div>
          </aside>

          <div className="lg:col-span-3 space-y-6">
            <div className="relative">
              <span className="absolute left-7 top-1/2 -translate-y-1/2 text-xl opacity-30">🔍</span>
              <input 
                type="text" 
                placeholder={`Pesquisar entre ${dbTotal} artigos na cloud...`} 
                className="w-full bg-white px-16 py-6 rounded-[30px] shadow-sm border-none focus:ring-4 focus:ring-red-100 font-bold text-lg"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {view === 'catalog' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {catalog.length === 0 && !isSyncing && <div className="col-span-full py-32 text-center opacity-20 font-black uppercase text-2xl italic tracking-tighter">Prateleiras Vazias</div>}
                {catalog.map(p => (
                  <div key={p.id} className="bg-white p-6 rounded-[40px] shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col justify-between group">
                    <div>
                      <div className="flex justify-between items-center mb-5">
                        <span className="text-[8px] font-black uppercase bg-slate-900 text-white px-2.5 py-1.5 rounded-lg">{p.store}</span>
                        <span className="text-[9px] font-bold text-slate-300 uppercase truncate max-w-[90px]">{p.unit}</span>
                      </div>
                      <h3 className="font-black text-slate-800 text-sm uppercase leading-tight group-hover:text-red-600 transition-colors h-10 overflow-hidden">{p.name}</h3>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">{p.category}</p>
                    </div>
                    <div className="flex justify-between items-end mt-8">
                      <div className="text-3xl font-black tracking-tighter text-slate-900">{p.price.toFixed(2)}€</div>
                      <button 
                        onClick={() => addToCart(p)}
                        className="w-12 h-12 bg-slate-900 text-white rounded-[18px] flex items-center justify-center font-black text-2xl hover:bg-red-600 transition-all shadow-lg"
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-[50px] shadow-2xl p-10 border border-slate-100">
                <div className="flex justify-between items-end mb-12">
                  <div>
                    <h2 className="text-4xl font-black uppercase italic tracking-tighter">Lista de <span className="text-red-600">Compras</span></h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest">{shoppingList.length} ITENS NO CESTO</p>
                  </div>
                  <div className="text-right">
                    <p className="text-7xl font-black tracking-tighter text-slate-900">{cartTotal.toFixed(2)}<span className="text-xl ml-1">€</span></p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {shoppingList.map(item => (
                    <div key={item.id} className={`flex items-center gap-5 p-6 rounded-[28px] border transition-all ${item.checked ? 'bg-slate-50 opacity-40 grayscale' : 'bg-white shadow-md border-slate-50'}`}>
                      <button onClick={() => setShoppingList(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))} className={`w-10 h-10 rounded-[14px] border-4 flex items-center justify-center text-xl transition-all ${item.checked ? 'bg-green-500 border-green-200 text-white' : 'bg-slate-50 border-white text-transparent'}`}>✓</button>
                      <div className="flex-1">
                        <h4 className="font-black uppercase text-xs tracking-tight">{item.name}</h4>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{item.store} • {item.quantity} UN • {item.price.toFixed(2)}€/un</p>
                      </div>
                      <div className="text-xl font-black">{(item.price * item.quantity).toFixed(2)}€</div>
                      <button onClick={() => setShoppingList(prev => prev.filter(i => i.id !== item.id))} className="w-8 h-8 flex items-center justify-center text-slate-200 hover:text-red-600 text-xl font-bold transition-colors">✕</button>
                    </div>
                  ))}
                  {shoppingList.length === 0 && <div className="py-32 text-center text-slate-200 font-black uppercase text-3xl italic tracking-tighter">Cesto Vazio</div>}
                </div>
                
                {shoppingList.length > 0 && (
                  <button onClick={() => window.print()} className="w-full mt-16 bg-slate-900 text-white py-8 rounded-[30px] font-black uppercase text-base shadow-2xl hover:bg-red-600 transition-all">Exportar e Imprimir Lista</button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
