# مخبز أولاد عثمان

POS صغير لبيع العيش البلدي والعيش الحر. الواجهة الرئيسية تعرض المنتجين فقط. اختَر المنتج، أدخل الكمية، راجع الإجمالي، وأكّد البيع. بعد التأكيد استخدم F12 لنسخة، F11 لنسختين، أو F10 لثلاث نسخ؛ ويمكن استخدام أزرار الطباعة الظاهرة بعد البيع.

## تشغيل نسخة الويب

يتطلب Node.js 20.9 أو أحدث.

```powershell
npm install
npm run dev
```

البناء الثابت للنشر على Vercel:

```powershell
npm run build
npm run test:validation
```

الملفات الناتجة في `out/`. تحفظ نسخة الويب إعداداتها محلياً في IndexedDB. الخط العربي Cairo مضمّن محلياً داخل ملفات الواجهة. المتصفح يفتح نافذة الطباعة كحل احتياطي ولا يدعم الطباعة الصامتة المضمونة.

## Windows Desktop وUSB

المنتج الأساسي هو Tauri 2 على Windows. متطلبات البناء: Node.js 20.9+، Rust stable مع MSVC toolchain، وVisual Studio C++ Build Tools مع workload **Desktop development with C++** وWindows SDK. هذا المشروع يضم مثبت WebView2 offline داخل حزمة Windows. راجع [متطلبات Tauri الرسمية](https://v2.tauri.app/start/prerequisites/) و[تعليمات Rust لويندوز](https://rust-lang.org/tools/install/).

```powershell
npm install
npm run tauri -- info
npm run tauri -- build
```

لتثبيت toolchain MSVC من rustup بعد تثبيت Rust:

```powershell
rustup default stable-msvc
rustc --version
cargo --version
```

ينتج MSI وNSIS EXE تحت `src-tauri/target/release/bundle/`. ملف EXE المستقل المبني حالياً هو `src-tauri/target/release/bundle/nsis/مخبز أولاد عثمان_1.0.0_x64-setup.exe`، ويضم WebView2 Offline Installer بحجم 214,927,568 بايت. يتيح ذلك تثبيت الـ runtime من ملف الحزمة دون تنزيله عبر الإنترنت.

في إعدادات البرنامج: ابحث عن طابعات Windows المثبتة، اختر Windows Printer Queue الخاصة بالطابعة، حدد 58 أو 80 مم، ثم احفظها. الطباعة الأصلية تستخدم GDI عبر الـ Queue وتُعيد فحص وجودها عند فتح الواجهة/الطباعة. قبول Windows Spooler للمهمة لا يؤكد خروج الورقة.

إعداد NSIS/MSI يضم WebView2 Offline Installer. ملفات HTML وCSS وJavaScript والأيقونات تُحزم محلياً. التطبيق لا يحمل خطوطاً أو موارد من CDN ولا يستدعي API خارجياً.

ثبّت تعريف الشركة المصنعة في Windows مرة واحدة إذا لزم. عند فصل USB، أعد توصيله وتحقق من أن الـ Queue تظهر في Windows، ثم أعد البحث من الإعدادات إذا لزم. لا يثبت التطبيق تعريف الطابعة.

## حدود الإصدار الحالي

- إعدادات الأسعار والطابعة وآخر عمليات البيع في Windows تُحفظ في `%APPDATA%/com.oladothman.bakerypos/pos-store.json`، واسم queue في `printer-queue.txt`. التخزين الأصلي يستخدم ملفاً محلياً وكتابة ذرية بدلاً من WebView Local Storage؛ أول تشغيل ينقل بيانات IndexedDB القديمة إلى الملف. نسخة الويب تبقى على IndexedDB.
- لا توجد APK ضمن النطاق الحالي.
- نجحت فحوص `npx tsc --noEmit --incremental false` و`npm run build` و`cargo check` وبناء `npm run tauri -- build --verbose --bundles nsis` في بيئة Windows الحالية.
- اختبارات `npm run test:validation` تتحقق من أسعار 0.2 و1.5 و2.25، والكميات 1 و10 و50 و100، ورفض الصفر والقيم السالبة والكسور في الكمية، ودقة الإجمالي بالسنتات. الأسعار تُحسب بدقة منزلتين عشريتين.
- الشاشة متجاوبة باستخدام شبكات مرنة ونقاط توقف للشاشات الصغيرة، وخط Cairo مضمّن من حزمة محلية ولا يحتاج إلى إنترنت.
- تم بناء مثبت NSIS EXE مستقل، ونجح تضمين WebView2 Offline Installer فيه. لم يكتمل بناء MSI؛ أوقفنا محاولته بعد نجاح EXE لتجنب إعادة تنزيل runtime الكبير.
- لا توجد طابعة حرارية مثبتة في بيئة التطوير؛ الطابعات الظاهرة Microsoft Print to PDF وOneNote. لذلك لم يُختبر USB أو خروج الورق أو تشكيل العربية فعلياً.
- التنفيذ الحالي يستخدم مسار Windows GDI عبر تعريف الطابعة؛ لم يُنفذ إرسال ESC/POS خام بشكل مستقل. استخدم تعريف الشركة المصنّعة الذي يقبل مهام Windows العادية، واختبر فعلياً قبل التشغيل اليومي.
- عند كل طباعة، يقرأ التطبيق عرض الورق المحفوظ من ملف الإعدادات المحلي، ويحصل على DEVMODE كامل من Windows `DocumentProperties`, ثم يطلب العرض 58/80 مم وارتفاع إيصال 90 مم (القيم بوحدة 0.1 مم) ويمرر DEVMODE المعتمد إلى GDI. إذا أعاد التعريف قيماً مختلفة أو رفض الإعداد، تتوقف المهمة برسالة تطلب إضافة المقاس المخصص في خصائص تعريف الطابعة. قبول المخصصات يعتمد على التعريف والطابعة؛ لا يمكن إثبات ذلك دون الجهاز الفعلي.
- النص العربي يُرسم بـ `DrawTextW` مع `DT_RTLREADING`, `DT_RIGHT` وArial. هذا يحدد مسار Unicode والاتجاه لـ GDI، لكن سلامة التشكيل وعدم انعكاس الحروف تحتاج مراجعة إيصال فعلي على التعريف والطابعة المستهدفين.
- نسخ F12/F11/F10 تُرسل كـ 1/2/3 مهام GDI منفصلة، و`e.repeat` وprint lock يمنعان إعادة الإرسال أثناء استمرار الضغط أو تنفيذ مهمة أخرى. آخر عملية البيع تبقى محفوظة قبل الطباعة، وتُستعاد إذا لم تُسجل كمهمة مقبولة.
