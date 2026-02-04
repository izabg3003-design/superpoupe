
export type StoreId = 'lidl' | 'pingo-doce' | 'aldi' | 'makro' | 'continente';

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  lastUpdated: string;
  store: StoreId;
  unit: string;
  code?: string;
}

export interface ShoppingItem extends Product {
  quantity: number;
  checked: boolean;
}

export interface Store {
  id: StoreId;
  name: string;
  logo: string;
  color: string;
  description: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface PriceUpdateResult {
  products: Product[];
  sources: GroundingSource[];
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  url?: string;
}
