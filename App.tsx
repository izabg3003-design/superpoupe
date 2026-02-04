
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
  const [importProgress, setImportProgress] = useState(0);
  
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
    if (n.includes('pão') || n.includes('bola') || n.includes('baguete') || n.includes('croissant') || n.includes('pastel') || n.includes('bolo') || n.includes('donuts') || n.includes('dots')) return 'Padaria e Pastelaria';
    if (n.includes('queijo') || n.includes('leite') || n.includes('iogurte') || n.includes('ovos') || n.includes('requeijão') || n.includes('cremoso')) return 'Laticínios e Ovos';
    if (n.includes('carne') || n.includes('bife') || n.includes('frango') || n.includes('peru') || n.includes('porco') || n.includes('novilho') || n.includes('chouriç') || n.includes('fiambre') || n.includes('bacon') || n.includes('presunto') || n.includes('paio') || n.includes('salame') || n.includes('almôndegas')) return 'Talho e Charcutaria';
    if (n.includes('peixe') || n.includes('salmão') || n.includes('bacalhau') || n.includes('pescada') || n.includes('camarão') || n.includes('lula') || n.includes('pota') || n.includes('dourada') || n.includes('robalo') || n.includes('polvo')) return 'Peixaria e Congelados';
    if (n.includes('vinho') || n.includes('cerveja') || n.includes('sumo') || n.includes('água') || n.includes('gaspacho') || n.includes('limonada')) return 'Bebidas e Garrafeira';
    if (n.includes('fruta') || n.includes('banana') || n.includes('laranja') || n.includes('maçã') || n.includes('pera') || n.includes('uvas') || n.includes('tomate') || n.includes('batata') || n.includes('cebola') || n.includes('abóbora') || n.includes('cenoura') || n.includes('alface')) return 'Frutas e Legumes';
    return 'Mercearia';
  };

  const handleMassiveImport = async () => {
    if (!rawTextImport.trim()) return;
    setIsSyncing(true);
    setImportProgress(0);

    const lines = rawTextImport.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.includes('Crachá do produto'));

    // Usamos um Map para garantir que IDs duplicados não entrem no mesmo lote (causando erro no Supabase)
    const productsMap = new Map<string, Product>();
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith(',') && line.includes('€')) {
        const integerLine = lines[i-1];
        
        if (integerLine && /^\d+$/.test(integerLine)) {
          const centsPart = line.split('€')[0].replace(',', '');
          const fullPrice = parseFloat(`${integerLine}.${centsPart}`);
          
          let foundName = '';
          let foundUnit = 'un';
          
          for (let j = i - 2; j >= Math.max(0, i - 12); j--) {
            const candidate = lines[j];
            if (candidate.toLowerCase().includes('emb.') || 
                candidate.includes('gr') || 
                candidate.includes('kg') || 
                candidate.toLowerCase().includes('un') ||
                candidate.includes('Mínima')) {
              foundUnit = candidate;
            } 
            else if (candidate.length > 3 && !/^\d+$/.test(candidate) && !candidate.includes('€')) {
              foundName = candidate;
              break; 
            }
          }

          if (foundName) {
            // Gerar ID robusto. Usar a unidade ajuda a diferenciar pesos diferentes do mesmo produto
            const cleanKey = (foundName + foundUnit).toLowerCase().replace(/\s+/g, '');
            const uniqueId = `cont-${cleanKey.substring(0, 40)}`;
            
            productsMap.set(uniqueId, {
              id: uniqueId,
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

    const products = Array.from(productsMap.values());
    console.log(`🔍 Motor de busca desduplicou e encontrou ${products.length} artigos únicos.`);

    if (products.length === 0) {
      alert("ERRO: Nenhum produto detetado. Certifique-se de copiar o bloco completo de produtos do site.");
      setIsSyncing(false);
      return;
    }

    try {
      const batchSize = 50;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        await upsertProducts(batch);
        const progress = Math.min(100, Math.round(((i + batch.length) / products.length) * 100));
        setImportProgress(progress);
      }
      
      alert(`SUCESSO: ${products.length} itens sincronizados com a Cloud!`);
      setRawTextImport('');
      await refreshData();
    } catch (e: any) {
      console.error("Falha no Supabase:", e);
      alert("ERRO NO SUPABASE: " + (e.message || "Erro desconhecido"));
    } finally {
      setIsSyncing(false);
      setImportProgress(0);
    }
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
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-red-100">
              <span className="font-black text-2xl uppercase italic">SP</span>
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter leading-none">SuperPoupe <span className="text-red-600 italic">AI</span></h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{dbTotal} ITENS NA CLOUD</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <nav className="flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setView('catalog')} className={`px-5 py-2 rounded-lg font-black uppercase text-[10px] transition-all ${view === 'catalog' ? 'bg-white shadow-sm text-red-600' : 'text-slate-500'}`}>Mercado</button>
              <button onClick={() => setView('list')} className={`px-5 py-2 rounded-lg font-black uppercase text-[10px] transition-all ${view === 'list' ? 'bg-white shadow-sm text-green-600' : 'text-slate-500'}`}>Cesto ({shoppingList.length})</button>
            </nav>
            <button onClick={() => setIsMasterMode(!isMasterMode)} className={`p-3 rounded-xl transition-all ${isMasterMode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>⚙️</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-10">
        {isMasterMode && (
          <div className="mb-12 bg-slate-900 text-white p-10 rounded-[40px] shadow-2xl border-4 border-red-600/20">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-2xl font-black uppercase italic tracking-tight">🚀 Importador de Artigos (3.083+ Itens)</h3>
               {isSyncing && <div className="text-right"><span className="text-red-500 font-bold block animate-pulse">A ENVIAR PARA SUPABASE...</span><span className="text-xs text-slate-400">{importProgress}% Concluído</span></div>}
            </div>
            <p className="text-xs text-slate-400 mb-4 uppercase font-bold tracking-widest">Cole aqui o texto copiado (Ctrl+A no site, Ctrl+V aqui):</p>
            <textarea 
              className="w-full h-64 p-6 bg-slate-800 rounded-3xl mb-6 border-none text-[10px] font-mono text-green-400 focus:ring-2 focus:ring-red-500 outline-none resize-none"
              placeholder="Exemplo: Nome do Produto... 1 ... ,49€ ..."
              value={rawTextImport}
              onChange={(e) => setRawTextImport(e.target.value)}
            />
            <div className="flex gap-4">
              <button 
                onClick={handleMassiveImport} 
                disabled={isSyncing || !rawTextImport}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-30 text-white px-12 py-5 rounded-2xl font-black uppercase text-sm transition-all shadow-xl shadow-red-900/40"
              >
                {isSyncing ? `A PROCESSAR... (${importProgress}%)` : 'EXECUTAR IMPORTAÇÃO AGORA'}
              </button>
              <button onClick={() => setRawTextImport('')} className="px-6 text-slate-500 hover:text-white font-bold uppercase text-[10px]">Limpar Tudo</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
          <aside className="space-y-8">
            <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-5 tracking-widest">Loja</p>
              <div className="space-y-2">
                <button onClick={() => setActiveStore('todos')} className={`w-full text-left px-5 py-4 rounded-2xl font-black uppercase text-[11px] transition-all ${activeStore === 'todos' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500'}`}>🌍 Ver Tudo</button>
                {STORES.map(s => (
                  <button key={s.id} onClick={() => setActiveStore(s.id)} className={`w-full text-left px-5 py-4 rounded-2xl font-black uppercase text-[11px] transition-all ${activeStore === s.id ? 'bg-red-600 text-white shadow-lg' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>🏪 {s.name}</button>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-5 tracking-widest">Corredores</p>
              <div className="space-y-1 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
                <button onClick={() => setActiveCategory('todos')} className={`w-full text-left px-5 py-3 rounded-xl font-bold text-[12px] transition-all ${activeCategory === 'todos' ? 'text-red-600 bg-red-50 border-l-4 border-red-600' : 'text-slate-400 hover:text-slate-600'}`}>Tudo</button>
                {currentCategories.map(cat => (
                  <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`w-full text-left px-5 py-3 rounded-xl font-bold text-[12px] transition-all ${activeCategory === cat.id ? 'text-red-600 bg-red-50 border-l-4 border-red-600' : 'text-slate-400 hover:text-slate-600'}`}>{cat.icon} {cat.name}</button>
                ))}
              </div>
            </div>
          </aside>

          <div className="lg:col-span-3 space-y-8">
            <div className="relative">
              <span className="absolute left-7 top-1/2 -translate-y-1/2 text-xl opacity-40">🔍</span>
              <input 
                type="text" 
                placeholder={`Procurar em ${dbTotal} artigos...`} 
                className="w-full bg-white px-16 py-7 rounded-[35px] shadow-sm border-none focus:ring-4 focus:ring-red-100 text-lg font-bold"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {view === 'catalog' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {catalog.length === 0 && !isSyncing && <div className="col-span-full py-32 text-center opacity-20 font-black uppercase text-2xl italic tracking-tighter">Nenhum artigo encontrado</div>}
                {catalog.map(p => (
                  <div key={p.id} className="bg-white p-8 rounded-[45px] shadow-sm border border-slate-100 hover:shadow-2xl hover:-translate-y-1 transition-all group flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-6">
                        <span className="text-[9px] font-black uppercase bg-slate-900 text-white px-3 py-1.5 rounded-full">{p.store}</span>
                        <span className="text-[10px] font-bold text-slate-300 uppercase truncate max-w-[100px]">{p.unit}</span>
                      </div>
                      <h3 className="font-black text-slate-800 text-base uppercase leading-tight group-hover:text-red-600 transition-colors h-12 overflow-hidden">{p.name}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-3">{p.category}</p>
                    </div>
                    <div className="flex justify-between items-end mt-10">
                      <div className="text-4xl font-black tracking-tighter text-slate-900">{p.price.toFixed(2)}<span className="text-lg ml-0.5">€</span></div>
                      <button 
                        onClick={() => addToCart(p)}
                        className="w-14 h-14 bg-slate-900 text-white rounded-[20px] flex items-center justify-center font-black text-3xl hover:bg-red-600 transition-all shadow-lg"
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-[60px] shadow-2xl p-10 md:p-20 border border-slate-100">
                <div className="flex justify-between items-end mb-16">
                  <div>
                    <h2 className="text-6xl font-black uppercase italic tracking-tighter">Lista de <span className="text-red-600">Compras</span></h2>
                    <p className="text-sm font-bold text-slate-400 uppercase mt-4 tracking-[0.3em]">{shoppingList.length} ARTIGOS SELECIONADOS</p>
                  </div>
                  <div className="text-right">
                    <p className="text-8xl font-black tracking-tighter text-slate-900 leading-none">{cartTotal.toFixed(2)}<span className="text-3xl ml-1">€</span></p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {shoppingList.map(item => (
                    <div key={item.id} className={`flex items-center gap-6 p-7 rounded-[35px] border transition-all ${item.checked ? 'bg-slate-50 opacity-40 grayscale' : 'bg-white shadow-lg border-slate-50'}`}>
                      <button onClick={() => setShoppingList(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))} className={`w-12 h-12 rounded-[18px] border-4 flex items-center justify-center text-2xl transition-all ${item.checked ? 'bg-green-500 border-green-200 text-white' : 'bg-slate-100 border-white text-transparent'}`}>✓</button>
                      <div className="flex-1">
                        <h4 className="font-black uppercase text-sm tracking-tight">{item.name}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{item.store} • {item.quantity} UN • {item.price.toFixed(2)}€/un</p>
                      </div>
                      <div className="text-2xl font-black">{(item.price * item.quantity).toFixed(2)}€</div>
                      <button onClick={() => setShoppingList(prev => prev.filter(i => i.id !== item.id))} className="w-10 h-10 flex items-center justify-center text-slate-200 hover:text-red-600 text-2xl font-bold transition-colors">✕</button>
                    </div>
                  ))}
                  {shoppingList.length === 0 && <div className="py-40 text-center text-slate-200 font-black uppercase text-4xl italic tracking-tighter">Cesto Vazio</div>}
                </div>
                
                {shoppingList.length > 0 && (
                  <button onClick={() => window.print()} className="w-full mt-20 bg-slate-900 text-white py-10 rounded-[40px] font-black uppercase text-xl shadow-2xl hover:bg-red-600 hover:scale-[1.02] transition-all">FINALIZAR E IMPRIMIR</button>
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
