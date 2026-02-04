
import { Store, Category, StoreId } from './types';

export const STORE_DOMAINS: Record<StoreId, string> = {
  'continente': 'continente.pt',
  'pingo-doce': 'pingodoce.pt',
  'lidl': 'lidl.pt',
  'aldi': 'aldi.pt',
  'makro': 'makro.pt'
};

export const STORES: Store[] = [
  { id: 'continente', name: 'Continente', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Logotipo_Continente.svg', color: 'bg-red-600', description: 'https://www.continente.pt/' },
  { id: 'pingo-doce', name: 'Pingo Doce', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/af/Pingo_Doce_logo.svg', color: 'bg-green-600', description: 'https://www.pingodoce.pt/' },
  { id: 'lidl', name: 'Lidl', logo: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Lidl-Logo.svg', color: 'bg-blue-600', description: 'https://www.lidl.pt/' },
  { id: 'aldi', name: 'Aldi', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2c/ALDI_Nord_logo.svg', color: 'bg-blue-800', description: 'https://www.aldi.pt/' },
  { id: 'makro', name: 'Makro', logo: 'https://upload.wikimedia.org/wikipedia/commons/1/14/Makro_logo.svg', color: 'bg-red-600', description: 'https://www.makro.pt/' },
];

export const COMMON_CATEGORIES: Category[] = [
  { id: 'frescos', name: 'Frescos', icon: '🥦' },
  { id: 'laticinios-e-ovos', name: 'Laticínios e Ovos', icon: '🥚' },
  { id: 'mercearia', name: 'Mercearia', icon: '🥫' },
  { id: 'bebidas-e-garrafeira', name: 'Bebidas e Garrafeira', icon: '🍷' },
  { id: 'limpeza', name: 'Limpeza', icon: '🧹' },
  { id: 'beleza-e-higiene', name: 'Beleza e Higiene', icon: '🧴' },
  { id: 'congelados', name: 'Congelados', icon: '❄️' },
  { id: 'animais', name: 'Animais', icon: '🐾' },
];

export const CONTINENTE_CATEGORIES: Category[] = [
  { id: 'oportunidades', name: 'Oportunidades', icon: '🎯', url: 'https://www.continente.pt/oportunidades/' },
  { id: 'novidades', name: 'Novidades', icon: '✨', url: 'https://www.continente.pt/novidades/' },
  // URL Específica fornecida pelo usuário para 3.083 itens
  { id: 'frescos', name: 'Frescos', icon: '🥦', url: 'https://www.continente.pt/frescos/?start=0&srule=FRESH-Generico&pmin=0.01' },
  { id: 'laticinios-e-ovos', name: 'Laticínios e Ovos', icon: '🥚', url: 'https://www.continente.pt/laticinios-e-ovos/' },
  { id: 'congelados', name: 'Congelados', icon: '❄️', url: 'https://www.continente.pt/congelados/' },
  { id: 'mercearia', name: 'Mercearia', icon: '🥫', url: 'https://www.continente.pt/mercearia/' },
  { id: 'bebidas-e-garrafeira', name: 'Bebidas e Garrafeira', icon: '🍷', url: 'https://www.continente.pt/bebidas-e-garrafeira/' },
  { id: 'bio-e-saudavel', name: 'Bio e Saudável', icon: '🌱', url: 'https://www.continente.pt/bio-e-saudavel/' },
  { id: 'limpeza', name: 'Limpeza', icon: '🧹', url: 'https://www.continente.pt/limpeza/' },
  { id: 'beleza-e-higiene', name: 'Beleza e Higiene', icon: '🧴', url: 'https://www.continente.pt/beleza-e-higiene/' },
  { id: 'bebe', name: 'Bebé', icon: '👶', url: 'https://www.continente.pt/bebe/' },
  { id: 'animais', name: 'Animais', icon: '🐾', url: 'https://www.continente.pt/animais/' },
  { id: 'casa-bricolage-jardim', name: 'Casa, Bricolage e Jardim', icon: '🏠', url: 'https://www.continente.pt/casa-bricolage-e-jardim/' },
  { id: 'brinquedos-e-jogos', name: 'Brinquedos e Jogos', icon: '🧸', url: 'https://www.continente.pt/brinquedos-e-jogos/' },
  { id: 'livraria-e-papelaria', name: 'Livraria e Papelaria', icon: '📚', url: 'https://www.continente.pt/livraria-e-papelaria/' },
  { id: 'desporto-roupa-viagem', name: 'Desporto, Roupa e Viagem', icon: '🏃', url: 'https://www.continente.pt/desporto-roupa-e-viagem/' },
];

export const CATEGORIES = COMMON_CATEGORIES;
