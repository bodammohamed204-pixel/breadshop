import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Sale } from './models';
import { getReceiptPreview } from './receipt-preview.ts';
export type QueueInfo={name:string,status:string,driver:string};
export async function listPrinters():Promise<QueueInfo[]> { if(!isTauri()) return []; return invoke('list_printers'); }
export async function saveNativePrinter(name:string) { if(isTauri()) await invoke('save_queue',{name}); }
export async function testNativePrinter() { if(isTauri()) return invoke<string>('test_print'); throw Error('اختبار الطابعة متاح في تطبيق Windows فقط.'); }
export async function printCopies(sale:Sale,copies:1|2|3,width:58|80) { if(isTauri()) return invoke('print_receipt',{sale,copies}); const w=window.open('','_blank','width=420,height=680'); if(!w) throw Error('اسمح بفتح نافذة الطباعة للمتابعة.'); w.document.write(receiptHtml(sale,width,copies)); w.document.close(); w.focus(); w.print(); }
export function receiptHtml(s:Sale,width:58|80,copies:1|2|3=1) {
 const r=getReceiptPreview(s);
 const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
 const one=`<article class="receipt"><h2>${esc(r.bakery)}</h2><div class="line"></div><p>${esc(r.date)}</p><p>${esc(r.weekday)}</p><p>${esc(r.time)}</p><div class="line"></div><p>${esc(r.transaction)}</p><p>${esc(r.product)}</p><p>${esc(r.quantity)}</p><p>${esc(r.unitPrice)}</p><p class="total">${esc(r.total)}</p><div class="line"></div><p class="thanks">${esc(r.thanks)}</p></article>`;
 return `<!doctype html><html dir="rtl"><meta charset="utf-8"><style>@page{size:${width}mm auto;margin:3mm}*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;width:${width-6}mm;margin:auto;color:#111;font-size:14.67px;font-weight:700;line-height:21.33px}.receipt{break-after:page}.receipt:last-child{break-after:auto}h2{margin:0 0 3mm;font-size:17px;text-align:center}.line{height:0;border-top:1px dashed #222;margin:3.2mm 0}p{margin:2.2mm 0;text-align:right}.total{margin-top:3mm;font-size:15px}.thanks{text-align:center;margin:3mm 0 0}</style><body>${one.repeat(copies)}</body></html>`;
}
