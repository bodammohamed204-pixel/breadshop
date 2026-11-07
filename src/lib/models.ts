import { invoke, isTauri } from '@tauri-apps/api/core';

export type ProductId = 'baladi' | 'free';
export type Product = { id: ProductId; name: string; price: number };
export type Sale = { id: number; product_id: ProductId; product_name: string; quantity: number; unit_price: number; total: number; created_at: string; print_status: 'not_printed' | 'queued' | 'error' };
export type PrinterSettings = { printer_name: string; connection_type: string; device_id: string; paper_width: 58 | 80; method: 'gdi'; is_default: boolean };
export type Store = { products: Product[]; sales: Sale[]; settings: Record<string,string>; printer: PrinterSettings | null; schema_version: 1 };
export const initialStore: Store = { schema_version: 1, products: [{id:'baladi',name:'عيش بلدي',price:0},{id:'free',name:'عيش حر',price:0}], sales:[], settings:{bakery_name:'مخبز أولاد عثمان',currency:'ج.م'}, printer:null };
const KEY = 'othman-pos-store-v1';
let cached: Store | null = null;
let loading: Promise<Store> | null = null;
let database: Promise<IDBDatabase> | null = null;
function openDb() { if (!database) database = new Promise((resolve,reject)=>{ const req=indexedDB.open('othman-pos',1); req.onupgradeneeded=()=>req.result.createObjectStore('kv'); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); return database; }
function normalize(raw: Partial<Store> | null | undefined): Store { return { ...structuredClone(initialStore), ...raw, products: raw?.products ?? initialStore.products, sales: raw?.sales ?? [], settings: raw?.settings ?? initialStore.settings, printer: raw?.printer ?? null }; }
async function loadBrowserStore(): Promise<Store> { if (typeof window==='undefined') return structuredClone(initialStore); let raw:Store|null=null; try { if ('indexedDB' in window) { const db=await openDb(); raw=await new Promise((resolve,reject)=>{const req=db.transaction('kv').objectStore('kv').get(KEY);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error);}); } else { const txt=localStorage.getItem(KEY);raw=txt?JSON.parse(txt):null; } } catch { const txt=localStorage.getItem(KEY);raw=txt?JSON.parse(txt):null; } return normalize(raw); }
async function loadOnce(): Promise<Store> {
 if (isTauri()) {
  const native = await invoke<Store | null>('load_local_store');
  if (native) return normalize(native);
  // One-time migration from older Tauri builds that kept data in WebView IndexedDB.
  const legacy = await loadBrowserStore();
  await invoke('save_local_store', { store: legacy });
  return legacy;
 }
 return loadBrowserStore();
}
export async function loadStore(): Promise<Store> { if(cached)return structuredClone(cached);if(!loading)loading=loadOnce().then(value=>(cached=value,value)).finally(()=>{loading=null});return structuredClone(await loading); }
export async function saveStore(value: Store) { const next=structuredClone(value);if(typeof window==='undefined')return;if(isTauri()){await invoke('save_local_store',{store:next});cached=next;return;}try{if('indexedDB'in window){const db=await openDb();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(next,KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});cached=next;return;}}catch{/* browsers without IndexedDB use local fallback */}localStorage.setItem(KEY,JSON.stringify(next));cached=next; }
export async function addSale(productId: ProductId, quantity: number) { if(!Number.isFinite(quantity)||quantity<=0||quantity>100000) throw Error('أدخل كمية أكبر من صفر.'); const store=await loadStore(),product=store.products.find(p=>p.id===productId);if(!product)throw Error('المنتج غير موجود.');const sale:Sale={id:Date.now()*1000+Math.floor(Math.random()*1000),product_id:productId,product_name:product.name,quantity,unit_price:product.price,total:Math.round(quantity*product.price*100)/100,created_at:new Date().toISOString(),print_status:'not_printed'};store.sales.unshift(sale);await saveStore(store);return sale; }
