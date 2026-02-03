
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StoreId, Product, ShoppingItem } from './types';
import { STORES, CATEGORIES } from './constants';
import { fetchCategoryProducts } from './services/geminiService';
import { upsertProducts, fetchProductsFromCloud, getCloudTotalCount, supabase } from './services/supabaseService';

const CloudIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.5 19c3.037 0 5.5-2.463 5.5-5.5 0-2.731-1.995-5.004-4.607-5.418C17.915 4.381 14.685 2 11 2 7.828 2 5.093 3.82 3.793 6.554 1.63 7.284 0 9.358 0 11.5 0 14.537 2.463 17 5.5 17h12z"></path></svg>;

const App: React.FC = () => {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'catalog' | 'list'>('catalog');
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbTotal, setDbTotal] = useState(0);
  const [isMasterMode, setIsMasterMode] = useState(false);

  const refreshData = useCallback(async () => {
    if (!supabase) return;
    try {
      const data = await fetchProductsFromCloud(searchTerm, activeCategory);
      setCatalog(data);
      const total = await getCloudTotalCount();
      setDbTotal(total);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    }
  }, [searchTerm, activeCategory]);

  useEffect(() => { refreshData(); }, [refreshData]);

  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-8 text-center">
        <div className="max-w-md space-y-6">
          <div className="text-6xl">⚠️</div>
          <h1 className="text-2xl font-black uppercase">Configuração Pendente</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            As variáveis <code className="text-red-400 font-mono">SUPABASE_URL</code> e <code className="text-red-400 font-mono">SUPABASE_ANON_KEY</code> não foram detetadas no ambiente. 
            Configure-as no painel do <strong>Render</strong> para ativar a base de dados na nuvem.
          </p>
          <button onClick={() => window.location.reload()} className="bg-white text-slate-900 px-8 py-3 rounded-xl font-black uppercase text-xs">Tentar Novamente</button>
        </div>
      </div>
    );
  }

  const cartTotal = shoppingList.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col font-sans">
      <header className="bg-white border-b sticky top-0 z-50 p-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white font-black">S</div>
            <div>
              <h1 className="font-black text-xl uppercase italic">SuperPoupe <span className="text-red-600">Cloud</span></h1>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Base Live: {dbTotal}</span>
              </div>
            </div>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setView('catalog')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase ${view === 'catalog' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Loja</button>
            <button onClick={() => setView('list')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase ${view === 'list' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Cesto ({shoppingList.length})</button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full p-4 md:p-8">
        {view === 'catalog' ? (
          <div className="flex flex-col lg:flex-row gap-8">
            <aside className="w-full lg:w-64 space-y-4">
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                <p className="text-[9px] font-black uppercase text-slate-400 mb-4 tracking-widest">Categorias</p>
                <button onClick={() => setActiveCategory('todos')} className={`w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase mb-1 ${activeCategory === 'todos' ? 'bg-slate-900 text-white shadow-lg' : 'hover:bg-slate-50'}`}>Tudo na Nuvem</button>
                <div className="max-h-[300px] overflow-y-auto scrollbar-hide space-y-1">
                  {CATEGORIES.map(cat => (
                    <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeCategory === cat.id ? 'bg-red-600 text-white' : 'hover:bg-slate-50 text-slate-500'}`}>
                      {cat.icon} {cat.name}
                    </button>
                  ))}
                </div>
              </div>
              
              {isMasterMode && (
                <button onClick={() => setIsSyncing(true)} className="w-full bg-slate-900 text-white p-5 rounded-3xl font-black uppercase text-[10px] shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
                   🚀 Varredura Diária
                </button>
              )}
            </aside>

            <div className="flex-grow space-y-6">
               <div className="relative">
                  <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Pesquisar artigos..." className="w-full pl-12 pr-6 py-5 bg-white rounded-3xl border-none shadow-sm focus:ring-2 focus:ring-red-600 font-bold text-sm" />
                  <span className="absolute left-4 top-5 opacity-20">🔍</span>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {catalog.map(p => (
                    <div key={p.id} className="p-5 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between group">
                       <div>
                          <span className="text-[8px] font-black text-white bg-red-600 px-2 py-0.5 rounded uppercase">{p.category}</span>
                          <h4 className="font-black text-slate-900 text-sm uppercase mt-2 group-hover:text-red-600 transition-colors truncate">{p.name}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{p.unit}</p>
                       </div>
                       <div className="flex justify-between items-end mt-4">
                          <p className="text-2xl font-black text-slate-900">{p.price.toFixed(2)}€</p>
                          <button onClick={() => {
                            setShoppingList(prev => {
                              const exists = prev.find(i => i.id === p.id);
                              if (exists) return prev.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
                              return [...prev, { ...p, quantity: 1, checked: false }];
                            });
                          }} className="bg-slate-100 p-3 rounded-xl hover:bg-red-600 hover:text-white transition-all">+</button>
                       </div>
                    </div>
                  ))}
               </div>
               {catalog.length === 0 && (
                 <div className="text-center py-20 opacity-30 font-black uppercase text-xs tracking-widest">Nenhum artigo encontrado</div>
               )}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto bg-white p-8 md:p-12 rounded-[40px] shadow-xl border border-slate-100">
            <h2 className="text-4xl font-black uppercase italic mb-8">Meu <span className="text-red-600">Cesto</span></h2>
            <div className="space-y-3">
               {shoppingList.map(item => (
                 <div key={item.id} className={`flex items-center gap-4 p-5 rounded-2xl border transition-all ${item.checked ? 'bg-slate-50 opacity-40 grayscale' : 'bg-white border-slate-50 shadow-sm'}`}>
                   <button onClick={() => setShoppingList(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))} className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center font-bold ${item.checked ? 'bg-green-500 border-green-500 text-white' : 'border-slate-200 text-transparent'}`}>✓</button>
                   <div className="flex-grow">
                     <p className="font-black uppercase text-xs truncate">{item.name}</p>
                     <p className="text-[9px] font-bold text-slate-400 uppercase">{item.quantity}x • {item.price.toFixed(2)}€</p>
                   </div>
                   <p className="font-black text-lg">{(item.price * item.quantity).toFixed(2)}€</p>
                 </div>
               ))}
               {shoppingList.length === 0 && <p className="text-center py-20 opacity-30 font-black uppercase text-xs">Cesto vazio</p>}
            </div>
            {shoppingList.length > 0 && (
              <div className="mt-12 pt-8 border-t flex justify-between items-end">
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Estimado</p>
                   <p className="text-5xl font-black">{cartTotal.toFixed(2)}€</p>
                </div>
                <button className="bg-red-600 text-white px-10 py-5 rounded-3xl font-black uppercase text-xs shadow-xl shadow-red-200">Finalizar</button>
              </div>
            )}
          </div>
        )}
      </main>

      <button onClick={() => setIsMasterMode(!isMasterMode)} className={`fixed bottom-4 right-4 w-10 h-10 rounded-full border-2 flex items-center justify-center font-black text-[8px] shadow-lg transition-all z-50 ${isMasterMode ? 'bg-red-600 border-white text-white' : 'bg-white border-slate-200 text-slate-400'}`}>
        {isMasterMode ? 'MSTR' : 'USR'}
      </button>
    </div>
  );
};

export default App;
