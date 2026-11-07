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
```

الملفات الناتجة في `out/`. تحفظ نسخة الويب إعداداتها محلياً في IndexedDB. المتصفح يفتح نافذة الطباعة كحل احتياطي ولا يدعم الطباعة الصامتة المضمونة.

## Windows Desktop وUSB

المنتج الأساسي المقصود هو Tauri 2 على Windows. متطلبات البناء: Node.js 20.9+، Rust stable باستخدام MSVC toolchain، وVisual Studio 2022 Build Tools مع workload **Desktop development with C++** ومكوّن MSVC/Windows SDK. بناء MSI يتطلب تفعيل Windows optional feature **VBScript**. WebView2 runtime مطلوب؛ إعداد هذا المشروع يضم مثبت WebView2 offline داخل حزمة Windows. راجع [متطلبات Tauri الرسمية](https://v2.tauri.app/start/prerequisites/) و[تعليمات Rust لويندوز](https://rust-lang.org/tools/install/).

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

ينتج MSI وNSIS EXE تحت `src-tauri/target/release/bundle/`. البناء الحالي تعذر في بيئة هذا المشروع لأن `cargo` غير موجود؛ الأوامر أعلاه موضحة للتشغيل بعد تثبيت المتطلبات وليست نتيجة build ناجح.

في إعدادات البرنامج: ابحث عن طابعات Windows المثبتة، اختر Windows Printer Queue الخاصة بالطابعة، حدد 58 أو 80 مم، ثم احفظها. الطباعة الأصلية تستخدم GDI عبر الـ Queue وتُعيد فحص وجودها عند فتح الواجهة/الطباعة. قبول Windows Spooler للمهمة لا يؤكد خروج الورقة.

إعداد NSIS/MSI يضم WebView2 Offline Installer لتثبيته من دون إنترنت؛ هذا يزيد حجم الحزمة بنحو 127MB وفق [توثيق Tauri لخيار WebView2 offlineInstaller](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options). ملفات HTML وCSS وJavaScript والأيقونات المضمنة تُحزم محلياً. التطبيق لا يحمل خطوطاً أو موارد من CDN ولا يستدعي API خارجياً.

ثبّت تعريف الشركة المصنعة في Windows مرة واحدة إذا لزم. عند فصل USB، أعد توصيله وتحقق من أن الـ Queue تظهر في Windows، ثم أعد البحث من الإعدادات إذا لزم. لا يثبت التطبيق تعريف الطابعة.

## حدود الإصدار الحالي

- إعدادات الأسعار والطابعة وآخر عمليات البيع في Windows تُحفظ في `%APPDATA%/com.oladothman.bakerypos/pos-store.json`، واسم queue في `printer-queue.txt`. التخزين الأصلي يستخدم ملفاً محلياً وكتابة ذرية بدلاً من WebView Local Storage؛ أول تشغيل ينقل بيانات IndexedDB القديمة إلى الملف. نسخة الويب تبقى على IndexedDB.
- لا توجد APK ضمن النطاق الحالي.
- نجح `npx tsc --noEmit` و`npm run build` لنسخة الويب.
- لم تتوفر Rust/Cargo أو طابعة حرارية في بيئة التطوير؛ لذلك لم يُبنَ Tauri ولم يُختبر USB أو الإيصال العربي فعلياً. الطباعة تحتاج قبولاً على queue فعلية ومراجعة الورق/Arabic shaping على الطابعة المستهدفة قبل اعتمادها.
- التنفيذ الحالي يستخدم مسار Windows GDI عبر تعريف الطابعة؛ لم يُنفذ إرسال ESC/POS خام بشكل مستقل. استخدم تعريف الشركة المصنّعة الذي يقبل مهام Windows العادية، واختبر فعلياً قبل التشغيل اليومي.
- خيار الورق 58/80 محفوظ، لكن ضبط paper size داخل DEVMODE/تعريف الطابعة غير مربوط بعد؛ يلزم إصلاحه أو مطابقة مقاس الورق في خصائص queue قبل اعتماد الطباعة.
