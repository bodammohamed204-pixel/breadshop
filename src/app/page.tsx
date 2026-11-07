'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { Check, Clock3, Printer, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { addSale, initialStore, loadStore, saveStore, type ProductId, type Sale, type Store } from '@/lib/models';
import { calculateTotal, parsePrice, parseQuantity } from '@/lib/input-validation';
import { listPrinters, printCopies, saveNativePrinter, testNativePrinter, type QueueInfo } from '@/lib/printer';

type Screen = 'sale' | 'settings';
type Notice = { text: string; kind: 'success' | 'error'; settings?: boolean };

const money = (value: number) => `${(Number.isFinite(value) ? value : 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const dateAr = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ar-EG', options).format(date);

export default function Home() {
  const [store, setStore] = useState<Store>(initialStore);
  const [screen, setScreen] = useState<Screen>('sale');
  const [now, setNow] = useState(new Date());
  const [product, setProduct] = useState<ProductId | null>(null);
  const [quantity, setQuantity] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [prices, setPrices] = useState({ baladi: '0', free: '0' });
  const [width, setWidth] = useState<58 | 80>(80);
  const [queues, setQueues] = useState<QueueInfo[]>([]);
  const [queueName, setQueueName] = useState('');
  const [queuePresent, setQueuePresent] = useState(false);
  const quantityInput = useRef<HTMLInputElement>(null);
  const printLock = useRef(false);
  const saleLock = useRef(false);

  const notify = (text: string, kind: Notice['kind'] = 'success', settings = false) => {
    setNotice({ text, kind, settings });
    window.setTimeout(() => setNotice(null), 4200);
  };

  const refresh = useCallback(async () => {
    const saved = await loadStore();
    setStore(saved);
    setSale((current) => current ?? saved.sales.find((row) => row.print_status !== 'queued') ?? null);
    setPrices({
      baladi: String(saved.products.find((item) => item.id === 'baladi')?.price ?? 0),
      free: String(saved.products.find((item) => item.id === 'free')?.price ?? 0),
    });
    setQueueName(saved.printer?.printer_name ?? '');
    setWidth(saved.printer?.paper_width ?? 80);
    if (saved.printer) {
      try {
        const found = await listPrinters();
        setQueues(found);
        setQueuePresent(found.some((printer) => printer.name === saved.printer?.printer_name));
      } catch {
        setQueuePresent(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => notify('تعذر تحميل الإعدادات المحفوظة. أعد فتح البرنامج أو تواصل مع الدعم.', 'error'));
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const choose = (id: ProductId) => {
    setProduct(id);
    setQuantity('');
  };

  const saveSaleAndPrint = async (copies: 1 | 2 | 3) => {
    if (!product || saleLock.current) return;
    const amount = parseQuantity(quantityInput.current?.value ?? quantity);
    if (amount === null) {
      notify('أدخل كمية صحيحة من 1 إلى 100000 رغيف.', 'error');
      return;
    }
    const unitPrice = store.products.find((item) => item.id === product)?.price ?? 0;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      notify('احفظ سعراً أكبر من صفر لهذا النوع أولاً.', 'error');
      setProduct(null);
      setScreen('settings');
      return;
    }
    saleLock.current = true;
    setSaving(true);
    try {
      const receipt = await addSale(product, amount);
      setSale(receipt);
      setProduct(null);
      setQuantity('');
      try { setStore(await loadStore()); } catch { /* The confirmed sale is already persisted by addSale. */ }
      await print(receipt, copies);
    } catch {
      notify('تعذر حفظ عملية البيع. لم تُحذف البيانات السابقة؛ حاول مرة أخرى.', 'error');
    } finally {
      saleLock.current = false;
      setSaving(false);
    }
  };

  const print = async (receipt: Sale, count: 1 | 2 | 3) => {
    if (printLock.current) return;
    if (isTauri() && !store.printer?.printer_name) {
      notify('تم حفظ البيع. اختر الطابعة من الإعدادات لإرسال الإيصال.', 'error', true);
      return;
    }
    if (isTauri() && !queuePresent) {
      notify('تم حفظ البيع، لكن الطابعة المحفوظة غير متاحة. افحصها من الإعدادات.', 'error', true);
      return;
    }
    printLock.current = true;
    setPrinting(true);
    try {
      await printCopies(receipt, count, width);
      const saved = await loadStore();
      const row = saved.sales.find((item) => item.id === receipt.id);
      if (row) {
        row.print_status = 'queued';
        await saveStore(saved);
      }
      notify(`تم إرسال الإيصال (${count} ${count === 1 ? 'نسخة' : 'نسخ'}) إلى الطابعة.`);
    } catch {
      try {
        const saved = await loadStore();
        const row = saved.sales.find((item) => item.id === receipt.id);
        if (row) {
          row.print_status = 'error';
          await saveStore(saved);
        }
      } catch {
        // Keep the confirmed sale even if recording the print error fails.
      }
      notify('تعذرت الطباعة. تحقق من الطابعة والورق ثم أعد المحاولة.', 'error');
    } finally {
      printLock.current = false;
      setPrinting(false);
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || screen !== 'sale' || printing || saving) return;
      if (event.key === 'F12' || event.key === 'F11' || event.key === 'F10') {
        event.preventDefault();
        const copies = event.key === 'F12' ? 1 : event.key === 'F11' ? 2 : 3;
        if (product) void saveSaleAndPrint(copies);
        else if (sale) void print(sale, copies);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sale, product, screen, printing, saving, width, store.printer, queuePresent]);

  const saveSettings = async () => {
    const baladi = parsePrice(prices.baladi);
    const free = parsePrice(prices.free);
    if (baladi === null || free === null) {
      notify('اكتب السعر بالأرقام، مع منزلتين عشريتين كحد أقصى.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (queueName) await saveNativePrinter(queueName);
      const saved = await loadStore();
      saved.products = saved.products.map((item) => ({
        ...item,
        price: item.id === 'baladi' ? baladi : free,
      }));
      if (queueName) {
        saved.printer = {
          printer_name: queueName,
          connection_type: 'USB عبر Windows Print Queue',
          device_id: '',
          paper_width: width,
          method: 'gdi',
          is_default: true,
        };
      } else if (saved.printer) {
        saved.printer = { ...saved.printer, paper_width: width };
      }
      await saveStore(saved);
      await refresh();
      notify('تم حفظ الأسعار وإعدادات الطباعة على هذا الجهاز.');
    } catch {
      notify(queueName ? 'تعذر حفظ الطابعة. اختر قائمة طباعة مثبتة في Windows.' : 'تعذر حفظ الإعدادات. حاول مرة أخرى.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const findQueues = async () => {
    try {
      const found = await listPrinters();
      setQueues(found);
      if (!queueName && found.length) setQueueName(found[0].name);
      notify(found.length ? `تم العثور على ${found.length} طابعة مثبتة.` : 'لم تظهر طابعات. ثبّت تعريف الطابعة في Windows ثم أعد البحث.', found.length ? 'success' : 'error');
    } catch {
      notify('اكتشاف طابعات Windows متاح في نسخة سطح المكتب فقط.', 'error');
    }
  };

  const saveQueue = async () => {
    if (!queueName) {
      notify('اختر طابعة من القائمة أولاً.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveNativePrinter(queueName);
      const saved = await loadStore();
      saved.printer = {
        printer_name: queueName,
        connection_type: 'USB عبر Windows Print Queue',
        device_id: '',
        paper_width: width,
        method: 'gdi',
        is_default: true,
      };
      await saveStore(saved);
      await refresh();
      notify('تم حفظ الطابعة ومقاس الورق.');
    } catch {
      notify('تعذر حفظ الطابعة. تأكد أنها مثبتة وتظهر في قائمة Windows.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const doTest = async () => {
    if (!store.printer?.printer_name) {
      notify('اختر الطابعة واحفظها قبل إجراء الاختبار.', 'error');
      return;
    }
    if (!queuePresent) {
      notify('الطابعة المحفوظة غير متاحة. أعد توصيلها ثم ابحث عنها.', 'error');
      return;
    }
    setPrinting(true);
    try {
      await testNativePrinter();
      notify('أُرسل إيصال الاختبار. افحص الطابعة للتأكد من خروج الورقة.');
    } catch {
      notify('تعذر إرسال مهمة الاختبار. تحقق من الطابعة والورق.', 'error');
    } finally {
      setPrinting(false);
    }
  };

  const current = product ? store.products.find((item) => item.id === product) : null;
  const validQuantity = parseQuantity(quantity);
  const total = current && validQuantity !== null ? calculateTotal(validQuantity, current.price) : 0;

  return (
    <main className="simple-app" dir="rtl">
      <header className="simple-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">م</div>
          <div className="brand-copy"><b>مخبز أولاد عثمان</b><span>نقطة البيع</span></div>
        </div>
        <div className="header-tools">
          <div className="clock"><Clock3 size={18} aria-hidden="true"/><div><b>{dateAr(now, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b><span>{dateAr(now, { hour: '2-digit', minute: '2-digit' })}</span></div></div>
          <span className={`status-pill ${queuePresent ? 'present' : ''}`}><i/>{store.printer ? (queuePresent ? 'الطابعة جاهزة' : 'الطابعة غير متاحة') : 'لم تُحفظ طابعة'}</span>
          <button className={`settings-tab ${screen === 'settings' ? 'selected' : ''}`} onClick={() => setScreen(screen === 'sale' ? 'settings' : 'sale')}>
            <SettingsIcon size={17} aria-hidden="true"/>{screen === 'sale' ? 'الإعدادات' : 'العودة للبيع'}
          </button>
        </div>
      </header>

      {screen === 'sale' ? (
        <section className="sale-screen" aria-labelledby="sale-title">
          <div className="sale-title"><span className="eyebrow">بيع سريع · يعمل دون إنترنت</span><h1 id="sale-title">اختر نوع العيش</h1><p>اختر النوع، اكتب الكمية، ثم اضغط عدد النسخ للطباعة مباشرة.</p></div>
          <div className="simple-products">
            {store.products.map((item) => (
              <button className={`simple-product ${item.id} ${product === item.id ? 'active' : ''}`} key={item.id} onClick={() => choose(item.id)}>
                <span className="product-label">{item.id === 'baladi' ? 'الأكثر طلباً' : 'طازج يومياً'}</span>
                <span className="simple-product-symbol" aria-hidden="true">{item.id === 'baladi' ? 'ب' : 'ح'}</span>
                <span className="simple-product-name">{item.name}</span>
                <span className="simple-product-price">{money(item.price)} <small>للوحدة</small></span>
                <span className="simple-product-action">اختيار هذا النوع <b aria-hidden="true">←</b></span>
              </button>
            ))}
          </div>
          {product && current && <section className="quick-sale-panel" aria-label={`بيع ${current.name}`}>
            <div className="quick-sale-heading"><div><span className="dialog-kicker">البيع السريع</span><h2>{current.name}</h2></div><button type="button" className="cancel-action quick-cancel" disabled={saving || printing} onClick={() => { setProduct(null); setQuantity(''); }}>إلغاء</button></div>
            <div className="quick-sale-fields">
              <label className="quantity-label">الكمية<input ref={quantityInput} autoFocus type="text" inputMode="numeric" autoComplete="off" placeholder="اكتب الكمية" value={quantity} onChange={(event) => setQuantity(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveSaleAndPrint(1); } }} aria-describedby="quantity-help"/></label>
              <div className="quick-unit-price"><span>سعر الوحدة</span><b>{money(current.price)}</b></div>
            </div>
            <span className="field-help" id="quantity-help">اكتب عدداً صحيحاً من 1 إلى 100000 ثم اختر عدد النسخ.</span>
            <div className="quick-total"><span>الإجمالي</span><b>{money(total)}</b></div>
            <div className="quick-print-actions" aria-label="عدد النسخ">
              <button type="button" className="primary-action" disabled={saving || printing || validQuantity === null} onClick={() => void saveSaleAndPrint(1)}>نسخة واحدة <kbd>F12</kbd></button>
              <button type="button" className="primary-action" disabled={saving || printing || validQuantity === null} onClick={() => void saveSaleAndPrint(2)}>نسختان <kbd>F11</kbd></button>
              <button type="button" className="primary-action" disabled={saving || printing || validQuantity === null} onClick={() => void saveSaleAndPrint(3)}>ثلاث نسخ <kbd>F10</kbd></button>
            </div>
            {(saving || printing) && <p className="quick-progress">{saving ? 'جارٍ حفظ عملية البيع…' : 'جارٍ إرسال الإيصال إلى الطابعة…'}</p>}
          </section>}
          <div className="shortcut-strip"><span>{sale ? `آخر عملية محفوظة: ${sale.product_name} · ${sale.quantity} رغيف` : 'اختر العيش، اكتب الكمية، ثم اطبع مباشرة.'}</span><div><kbd>F12</kbd> نسخة <kbd>F11</kbd> نسختان <kbd>F10</kbd> ثلاث نسخ</div></div>
          {sale && <div className="sale-confirmed"><Check size={19} aria-hidden="true"/><span>آخر عملية محفوظة: {sale.product_name} · {sale.quantity} رغيف. إعادة الطباعة لا تسجل عملية جديدة.</span><div className="confirmed-actions"><button disabled={printing || saving} onClick={() => void print(sale, 1)}>نسخة واحدة</button><button disabled={printing || saving} onClick={() => void print(sale, 2)}>نسختان</button><button disabled={printing || saving} onClick={() => void print(sale, 3)}>ثلاث نسخ</button></div></div>}
        </section>
      ) : (
        <section className="settings-screen" aria-labelledby="settings-title">
          <div className="sale-title settings-intro"><span className="eyebrow">إعدادات أساسية</span><h1 id="settings-title">الأسعار والطابعة</h1><p>تُحفظ التغييرات محلياً على هذا الجهاز.</p></div>
          <div className="settings-grid">
            <section className="settings-panel price-panel">
              <div className="panel-heading"><span className="panel-number">١</span><div><h2>أسعار العيش</h2><p>أدخل السعر بالجنيه. مثال: 0.2 أو 1.5 أو 2.25.</p></div></div>
              <div className="price-grid">
                <label className="form-field">سعر العيش البلدي<div className="price-input"><input type="number" min="0" step="0.01" inputMode="decimal" value={prices.baladi} onChange={(event) => setPrices((old) => ({ ...old, baladi: event.target.value }))}/><span>ج.م</span></div></label>
                <label className="form-field">سعر العيش الحر<div className="price-input"><input type="number" min="0" step="0.01" inputMode="decimal" value={prices.free} onChange={(event) => setPrices((old) => ({ ...old, free: event.target.value }))}/><span>ج.م</span></div></label>
              </div>
            </section>
            <section className="settings-panel printer-panel">
              <div className="panel-heading"><span className="panel-number blue">٢</span><div><h2>طابعة Windows</h2><p>اختر Windows Printer Queue المثبتة على الجهاز.</p></div></div>
              <button className="secondary-action search-printers" disabled={printing || saving} onClick={() => void findQueues()}><RefreshCw size={16} aria-hidden="true"/>البحث عن الطابعات</button>
              <label className="form-field">اسم الطابعة وقائمة Windows<select value={queueName} onChange={(event) => setQueueName(event.target.value)}><option value="">اختر الطابعة</option>{queues.map((queue) => <option value={queue.name} key={queue.name}>{queue.name} — {queue.driver}</option>)}</select></label>
              {store.printer && <p className={`saved-queue ${queuePresent ? 'online' : 'offline'}`}><i/>{queuePresent ? `المحفوظة: ${store.printer.printer_name}` : 'الطابعة المحفوظة غير موجودة. أعد توصيلها أو اختر طابعة أخرى.'}</p>}
            </section>
            <section className="settings-panel paper-panel">
              <div className="panel-heading"><span className="panel-number gold">٣</span><div><h2>مقاس الورق</h2><p>يُستخدم المقاس المحفوظ في الطباعة المباشرة.</p></div></div>
              <div className="paper-options" role="radiogroup" aria-label="مقاس الورق">
                <label className={`paper-option ${width === 58 ? 'active' : ''}`}><input type="radio" name="paper-width" checked={width === 58} onChange={() => setWidth(58)}/><b>58 مم</b><span>إيصال صغير</span></label>
                <label className={`paper-option ${width === 80 ? 'active' : ''}`}><input type="radio" name="paper-width" checked={width === 80} onChange={() => setWidth(80)}/><b>80 مم</b><span>إيصال عريض</span></label>
              </div>
            </section>
            <section className="settings-panel test-panel">
              <div className="panel-heading"><span className="panel-number sage">٤</span><div><h2>اختبار الطابعة</h2><p>يرسل إيصال اختبار عبر Windows دون نافذة طباعة.</p></div></div>
              <button className="secondary-action test-action" disabled={!store.printer || !queuePresent || printing || saving} onClick={() => void doTest()}><Printer size={17} aria-hidden="true"/>{printing ? 'جارٍ الإرسال…' : 'إرسال إيصال اختبار'}</button>
              <p className="helper">قبول المهمة في قائمة Windows لا يؤكد خروج الورقة.</p>
            </section>
          </div>
          <div className="settings-footer"><button className="primary-action" disabled={saving || printing} onClick={() => void saveSettings()}>{saving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}</button><span>تظل الأسعار والطابعة محفوظة بعد إغلاق البرنامج.</span></div>
        </section>
      )}

      {notice && <div className={`simple-toast ${notice.kind}`} role="status" aria-live="polite"><span className="toast-mark" aria-hidden="true">{notice.kind === 'success' ? '✓' : '!'}</span><span>{notice.text}</span>{notice.settings && <button type="button" className="toast-settings" onClick={() => { setScreen('settings'); setNotice(null); }}>إعدادات الطابعة</button>}</div>}
    </main>
  );
}
