
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StoreId, Product, ShoppingItem, Category } from './types';
import { STORES, CATEGORIES } from './constants';
import { fetchCategoryProducts, searchSpecificProduct } from './services/geminiService';
import { upsertProducts, fetchProductsFromCloud, getCloudTotalCount } from './services/supabaseService';

const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>;
const MagicIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" /></svg>;
const CloudIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19c3.037 0 5.5-2.463 5.5-5.5 0-2.731-1.995-5.004-4.607-5.418C17.915 4.381 14.685 2 11 2 7.828 2 5.093 3.82 3.793 6.554 1.63 7.284 0 9.358 0 11.5 0 14.537 2.463 17 5.5 17h12z"></path></svg>;

const ProductListItem: React.FC<{ product: Product; onAdd: (p: Product) => void }> = ({ product, onAdd }) => {
  const formattedDate = new Date(product.lastUpdated).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
  const isRecent = (new Date().getTime() - new Date(product.lastUpdated).getTime()) < 86400000;

  return (
    <div className="p-5 bg-white hover:bg-slate-50 transition-all group flex gap-4 border-b border-slate-100 last:border-0 rounded-2xl mb-2 shadow-sm">
      <div className="flex-grow flex flex-col justify-between py-1">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-black text-white uppercase bg-red-600 px-2.5 py-1 rounded-lg tracking-tighter">{product.category}</span>
            <div className={`flex items-center gap-1 ${isRecent ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-400'} px-2 py-1 rounded-lg`}>
               <span className="text-[8px] font-black uppercase tracking-widest italic">
                 {isRecent ? 'Preço Atualizado' : `Visto em ${formattedDate}`}
               </span>
            </div>
          </div>
          <h4 className="font-black text-slate-900 text-base leading-tight uppercase tracking-tight group-hover:text-red-700 transition-colors">
            {product.name}
          </h4>
          <p className="text-[11px] text-slate-400 font-bold mt-1.5 uppercase tracking-widest">{product.unit || 'un'}</p>
        </div>
        <div className="flex justify-between items-end mt-4">
          <div className="flex items-baseline gap-1">
             <span className="text-3xl font-black text-slate-900 tracking-tighter">{product.price.toFixed(2)}</span>
             <span className="text-sm font-black text-slate-900 uppercase">€</span>
          </div>
          <button onClick={() => onAdd(product)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-xl hover:bg-red-600 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 font-black text-xs uppercase tracking-widest">
            <PlusIcon /> <span>Adicionar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [selectedStore, setSelectedStore] = useState<StoreId | null>('continente');
  const [activeCategory, setActiveCategory] = useState<string>('todos');
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'catalog' | 'list'>('catalog');
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [dbTotal, setDbTotal] = useState(0);
  const [isMasterMode, setIsMasterMode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const stopSyncRef = useRef(false);

  // Fix: Define the missing displayedProducts by aliasing the catalog state
  const displayedProducts = catalog;

  const refreshData = useCallback(async () => {
    const data = await fetchProductsFromCloud(searchTerm, activeCategory, selectedStore || undefined);
    setCatalog(data);
    const total = await getCloudTotalCount();
    setDbTotal(total);
  }, [searchTerm, activeCategory, selectedStore]);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleDailySync = async () => {
    if (!isMasterMode || isSyncing) return;
    setIsSyncing(true);
    stopSyncRef.current = false;
    setSyncLogs(["🚀 Iniciando Atualização Diária Cloud..."]);

    const categoriesToScan = CATEGORIES.slice(0, 10).map(c => c.id);

    for (const catId of categoriesToScan) {
      if (stopSyncRef.current) break;
      setSyncLogs(prev => [`Varrrendo ${catId.toUpperCase()}...`, ...prev.slice(0, 10)]);
      
      try {
        const store = STORES.find(s => s.id === selectedStore);
        const result = await fetchCategoryProducts(store!.name, catId);
        
        if (result.products.length > 0) {
          await upsertProducts(result.products);
          setSyncLogs(prev => [`✅ Sincronizados ${result.products.length} itens.`, ...prev]);
          await refreshData();
        }
        
        await new Promise(r => setTimeout(r, 5000)); // Delay amigável para o Google
      } catch (err: any) {
        if (err.message === "QUOTA_EXHAUSTED") {
          for (let i = 30; i > 0; i--) {
            if (stopSyncRef.current) break;
            setCountdown(i);
            await new Promise(r => setTimeout(r, 1000));
          }
          setCountdown(0);
        }
      }
    }
    setIsSyncing(false);
    setSyncLogs(prev => ["🏁 Sincronização Diária Concluída.", ...prev]);
  };

  const cartTotal = shoppingList.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b sticky top-0 z-50 p-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white font-black shadow-lg shadow-red-200 text-2xl">S</div>
            <div>
              <h1 className="font-black text-2xl uppercase tracking-tighter italic">SuperPoupe <span className="text-red-600">Cloud</span></h1>
              <div className="flex items-center gap-1.5 opacity-60">
                 <CloudIcon />
                 <span className="text-[10px] font-black uppercase tracking-widest">Base de Dados Global: <span className="text-red-600">{dbTotal}</span></span>
              </div>
            </div>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button onClick={() => setView('catalog')} className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${view === 'catalog' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500'}`}>Produtos</button>
            <button onClick={() => setView('list')} className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${view === 'list' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500'}`}>Cesto ({shoppingList.length})</button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full p-4 md:p-8">
        {view === 'catalog' ? (
          <div className="flex flex-col lg:flex-row gap-8">
            <aside className="w-full lg:w-72 space-y-6">
               <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-widest flex items-center justify-between">
                    Secções
                    <span className="bg-slate-100 px-2 py-1 rounded-md text-slate-500">Live</span>
                  </h3>
                  <div className="space-y-1 h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                     <button onClick={() => setActiveCategory('todos')} className={`w-full text-left px-5 py-4 rounded-2xl text-[11px] font-black uppercase transition-all mb-2 ${activeCategory === 'todos' ? 'bg-slate-900 text-white shadow-xl' : 'hover:bg-slate-50'}`}>Tudo na Nuvem</button>
                     {CATEGORIES.map(cat => (
                       <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`w-full text-left px-5 py-4 rounded-2xl text-[11px] font-black uppercase transition-all ${activeCategory === cat.id ? 'bg-red-600 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-600'}`}>
                         <span className="mr-3">{cat.icon}</span> {cat.name}
                       </button>
                     ))}
                  </div>
               </div>
               
               {isMasterMode && (
                 <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl space-y-6 border-4 border-red-600/20">
                    <div>
                      <h4 className="font-black uppercase text-sm tracking-widest text-red-500 mb-2">Painel de Controlo Master</h4>
                      <p className="text-[10px] text-slate-400 leading-relaxed uppercase font-bold">Inicie a varredura diária para atualizar os preços de toda a comunidade.</p>
                    </div>
                    <button 
                      onClick={handleDailySync} 
                      disabled={isSyncing} 
                      className={`w-full ${isSyncing ? 'bg-red-600' : 'bg-white text-slate-900'} p-5 rounded-2xl font-black uppercase text-xs tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3`}
                    >
                      <MagicIcon />
                      {isSyncing ? 'Sincronizando...' : 'Varredura Diária'}
                    </button>
                    {isSyncing && (
                      <div className="p-4 bg-black/30 rounded-2xl space-y-1 max-h-32 overflow-y-auto scrollbar-hide">
                         {syncLogs.map((log, i) => <p key={i} className="text-[8px] font-mono opacity-60">>> {log}</p>)}
                      </div>
                    )}
                 </div>
               )}
            </aside>

            <div className="flex-grow space-y-6">
               <div className="bg-white p-8 md:p-10 rounded-[48px] shadow-sm border border-slate-200/50">
                  <div className="relative mb-10">
                    <input 
                      type="text" 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                      placeholder="Pesquise na base de dados global..." 
                      className="w-full pl-16 pr-6 py-6 bg-slate-50 rounded-[28px] border-none outline-none focus:ring-8 focus:ring-red-600/5 font-black text-slate-800 shadow-inner" 
                    />
                    <span className="absolute left-7 top-6 text-2xl opacity-20">🔍</span>
                  </div>

                  <div className="flex items-center justify-between mb-8 px-4">
                    <h2 className="text-3xl font-black uppercase tracking-tighter italic">Resultados <span className="text-red-600">Reais</span></h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Encontrados: {displayedProducts.length}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                    {displayedProducts.map(p => (
                      <ProductListItem 
                        key={p.id} 
                        product={p} 
                        onAdd={(prod) => {
                          setShoppingList(prev => {
                            const exists = prev.find(i => i.id === prod.id);
                            if (exists) return prev.map(i => i.id === prod.id ? { ...i, quantity: i.quantity + 1 } : i);
                            return [...prev, { ...prod, quantity: 1, checked: false }];
                          });
                        }} 
                      />
                    ))}
                  </div>

                  {displayedProducts.length === 0 && !isSyncing && (
                    <div className="py-32 text-center flex flex-col items-center">
                       <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-inner">🛰️</div>
                       <p className="font-black text-slate-300 uppercase tracking-[0.3em] text-sm">Base de dados sem correspondência</p>
                       {isMasterMode && (
                         <button onClick={handleDailySync} className="mt-8 text-red-600 font-black text-xs uppercase underline tracking-widest">Forçar Varredura Agora</button>
                       )}
                    </div>
                  )}
               </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto pb-64">
             <div className="bg-white p-12 rounded-[60px] shadow-xl border border-slate-100">
                <div className="flex justify-between items-center mb-12">
                   <h2 className="text-5xl font-black uppercase tracking-tighter italic">Meu <span className="text-red-600">Cesto</span></h2>
                   <button onClick={() => setShoppingList([])} className="text-[10px] font-black text-red-600 bg-red-50 px-6 py-3 rounded-2xl uppercase">Esvaziar</button>
                </div>
                
                <div className="space-y-4">
                   {shoppingList.map(item => (
                     <div key={item.id} className={`flex items-center gap-6 p-6 rounded-[32px] border-2 transition-all ${item.checked ? 'bg-slate-50 border-transparent opacity-40 grayscale' : 'bg-white border-slate-50 shadow-sm'}`}>
                        <button onClick={() => setShoppingList(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))} className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-xl font-bold transition-all ${item.checked ? 'bg-green-500 border-green-500 text-white' : 'border-slate-200'}`}>
                           {item.checked && '✓'}
                        </button>
                        <div className="flex-grow min-w-0">
                           <p className="font-black uppercase text-sm truncate">{item.name}</p>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.store} • {item.price.toFixed(2)}€</p>
                        </div>
                        <div className="text-right">
                           <p className="font-black text-2xl">{ (item.price * item.quantity).toFixed(2) }€</p>
                        </div>
                     </div>
                   ))}
                </div>

                {shoppingList.length === 0 && (
                  <div className="py-32 text-center text-slate-300 font-black uppercase tracking-widest">A sua lista está vazia</div>
                )}
             </div>
          </div>
        )}
      </main>

      {shoppingList.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t p-10 z-[60] shadow-2xl rounded-t-[60px]">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
            <div>
              <p className="text-[12px] font-black text-slate-400 uppercase tracking-[0.5em] mb-2">Estimativa do Cesto</p>
              <p className="text-7xl font-black text-slate-900 tracking-tighter">{cartTotal.toFixed(2)}<span className="text-2xl ml-2 text-red-600">€</span></p>
            </div>
            <button className="bg-slate-900 text-white px-20 py-8 rounded-[35px] font-black text-sm uppercase shadow-2xl hover:bg-red-600 transition-all duration-500">Imprimir Lista</button>
          </div>
        </div>
      )}

      {/* Switch Secreto MasterMode */}
      <button 
        onClick={() => setIsMasterMode(!isMasterMode)} 
        className={`fixed bottom-4 right-4 w-12 h-12 rounded-full border-4 flex items-center justify-center font-black text-[9px] transition-all z-[100] shadow-2xl ${isMasterMode ? 'bg-red-600 border-white text-white rotate-12 scale-110' : 'bg-white border-slate-200 text-slate-300'}`}
      >
        {isMasterMode ? 'MSTR' : 'USR'}
      </button>
    </div>
  );
};

export default App;
