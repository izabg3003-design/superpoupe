
import { Store, Category } from './types';

export const STORES: Store[] = [
  { id: 'continente', name: 'Continente', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Logotipo_Continente.svg', color: 'bg-red-600', description: 'O maior hipermercado de Portugal com a maior variedade.' },
  { id: 'pingo-doce', name: 'Pingo Doce', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/af/Pingo_Doce_logo.svg', color: 'bg-green-600', description: 'O melhor da comida e frescos em Portugal.' },
  { id: 'lidl', name: 'Lidl', logo: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Lidl-Logo.svg', color: 'bg-blue-600', description: 'Líder em frescura e promoções semanais.' },
  { id: 'aldi', name: 'Aldi', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2c/ALDI_Nord_logo.svg', color: 'bg-blue-800', description: 'Preços baixos com qualidade alemã.' },
  { id: 'makro', name: 'Makro', logo: 'https://upload.wikimedia.org/wikipedia/commons/1/14/Makro_logo.svg', color: 'bg-red-600', description: 'Para profissionais e grandes consumos.' },
];

export const CATEGORIES: Category[] = [
  { id: 'oportunidades', name: 'Oportunidades', icon: '🏷️' },
  { id: 'novidades', name: 'Novidades', icon: '✨' },
  { id: 'frescos', name: 'Frescos', icon: '🥦' },
  { id: 'laticinios-e-ovos', name: 'Laticínios e Ovos', icon: '🥚' },
  { id: 'congelados', name: 'Congelados', icon: '❄️' },
  { id: 'mercearia', name: 'Mercearia', icon: '🥫' },
  { id: 'bebidas-e-garrafeira', name: 'Bebidas e Garrafeira', icon: '🍷' },
  { id: 'bio-e-saudavel', name: 'Bio e Saudável', icon: '🌱' },
  { id: 'limpeza', name: 'Limpeza', icon: '🧹' },
  { id: 'beleza-e-higiene', name: 'Beleza e Higiene', icon: '🧴' },
  { id: 'bebe', name: 'Bebé', icon: '🍼' },
  { id: 'animais', name: 'Animais', icon: '🐾' },
  { id: 'casa-bricolage-jardim', name: 'Casa, Bricolage e Jardim', icon: '🏠' },
  { id: 'brinquedos-e-jogos', name: 'Brinquedos e Jogos', icon: '🎮' },
  { id: 'livraria-e-papelaria', name: 'Livraria e Papelaria', icon: '📚' },
  { id: 'desporto-roupa-viagem', name: 'Desporto, Roupa e Viagem', icon: '👕' },
  { id: 'entregazero', name: 'EntregaZero', icon: '🚀' },
  { id: 'marcas', name: 'Marcas', icon: '🏢' },
];
