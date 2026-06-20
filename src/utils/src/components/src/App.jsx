import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from './config';
import { collection, addDoc, onSnapshot, doc, runTransaction, query, where, getDocs } from 'firebase/firestore';
import emailjs from 'emailjs-com';

// ============================================================
//  إعدادات EmailJS – استبدل هذه القيم بقيمك الخاصة
// ============================================================
const EMAILJS_USER_ID = 'YOUR_USER_ID';
const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';

// ============================================================
//  المكون الرئيسي
// ============================================================
export default function App() {
  // ---- الحالة العامة ----
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [journalEntries, setJournalEntries] = useState([]);
  const [currentUserRole, setCurrentUserRole] = useState('admin'); // admin / cashier
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [paymentType, setPaymentType] = useState('cash');
  const [customerName, setCustomerName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // ---- نموذج إضافة منتج ----
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productCost, setProductCost] = useState('');
  const [productBarcode, setProductBarcode] = useState('');
  const [productQty, setProductQty] = useState('');
  const [productCategory, setProductCategory] = useState('أدوية');
  const [productExpiry, setProductExpiry] = useState('');
  const [productBatch, setProductBatch] = useState('');
  const [productReorderLevel, setProductReorderLevel] = useState('');
  const [productSupplierEmail, setProductSupplierEmail] = useState('');

  // ---- إغلاق الوردية ----
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [actualCashInDrawer, setActualCashInDrawer] = useState('');
  const [shiftSales, setShiftSales] = useState(0);

  // ---- الإحصائيات المالية ----
  const [totalCash, setTotalCash] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [totalTax, setTotalTax] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalCOGS, setTotalCOGS] = useState(0);
  const [totalReceivables, setTotalReceivables] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);

  // ---- مرجع الصوت ----
  const audioCtxRef = useRef(null);

  // ============================================================
  //  دوال مساعدة (الصوت، التنبيهات، التصدير)
  // ============================================================

  // تهيئة AudioContext مرة واحدة
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  const playSound = useCallback((type) => {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
      }
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) { /* تجاهل الأخطاء الصوتية */ }
  }, [getAudioContext]);

  // تصدير CSV
  const exportToCSV = useCallback((dataType) => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    if (dataType === 'products') {
      csvContent += "اسم المنتج,القسم,السعر,التكلفة,الكمية,الباركود,تاريخ الصلاحية,حد الطلب,بريد المورد\n";
      products.forEach(p => {
        csvContent += `"${p.name}","${p.category}",${p.price},${p.cost || 0},${p.stock || 0},"${p.barcode || ''}","${p.expiryDate || 'N/A'}",${p.reorderLevel || 0},"${p.supplierEmail || ''}"\n`;
      });
    } else if (dataType === 'journal') {
      csvContent += "التاريخ,البيان,الحساب,الحركة,المبلغ\n";
      journalEntries.forEach(entry => {
        entry.entries?.forEach(sub => {
          csvContent += `"${entry.date}","${entry.description}","${sub.accountName}","${sub.type}",${sub.amount}\n`;
        });
      });
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `تقرير_غسق_${dataType}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    playSound('success');
  }, [products, journalEntries, playSound]);

  // ============================================================
  //  دوال إرسال التنبيهات للموردين (Low Stock Alerts)
  // ============================================================
  const sendLowStockAlerts = useCallback(async (productsList) => {
    // تصفية المنتجات التي وصلت لحد الطلب
    const lowStockProducts = productsList.filter(p =>
      (p.stock || 0) <= (p.reorderLevel || 0) && p.supplierEmail
    );

    if (lowStockProducts.length === 0) return;

    // إرسال بريد لكل منتج (أو يمكن تجميعها في بريد واحد)
    for (const product of lowStockProducts) {
      try {
        await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          {
            to_email: product.supplierEmail,
            product_name: product.name,
            current_stock: product.stock || 0,
            reorder_level: product.reorderLevel || 0,
            supplier_name: product.supplierName || 'المورد',
            product_link: `https://your-app.com/product/${product.id}` // اختياري
          },
          EMAILJS_USER_ID
        );
        console.log(`✅ تم إرسال تنبيه للمورد ${product.supplierEmail} عن المنتج ${product.name}`);
      } catch (error) {
        console.error('❌ فشل إرسال البريد:', error);
      }
    }
    // يمكن إضافة إشعار للمستخدم بأن التنبيهات قد أُرسلت
  }, []);

  // ============================================================
  //  جلب البيانات من Firebase مع التحديث الحي
  // ============================================================
  useEffect(() => {
    // الاستماع للمنتجات
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const items = [];
      let lowStockCounter = 0;
      let expiredCounter = 0;
      const now = new Date();
      snapshot.forEach((doc) => {
        const data = doc.data();
        const product = { id: doc.id, ...data };
        items.push(product);
        if ((data.stock || 0) <= 3) lowStockCounter++;
        // فحص الصلاحية (إذا كان تاريخ الصلاحية موجوداً ومنتهياً)
        if (data.expiryDate) {
          const expiry = new Date(data.expiryDate);
          if (expiry < now) expiredCounter++;
        }
      });
      setProducts(items);
      setLowStockCount(lowStockCounter);
      setExpiredCount(expiredCounter);

      // إرسال تنبيهات للموردين عند كل تغيير في المخزون
      sendLowStockAlerts(items);
    });

    // الاستماع للقيود اليومية
    const unsubEntries = onSnapshot(collection(db, 'journal_entries'), (snapshot) => {
      let cashSum = 0, salesSum = 0, taxSum = 0, expenseSum = 0, cogsSum = 0, receivablesSum = 0, tempShiftSales = 0;
      const entries = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        entries.push({ id: doc.id, ...data });
        data.entries?.forEach(sub => {
          const amount = sub.amount || 0;
          if (sub.accountName === "حساب الصندوق / النقدية") {
            if (sub.type === "مدين") cashSum += amount;
            else if (sub.type === "دائن") cashSum -= amount;
          }
          if (sub.accountName === "حساب إيرادات المبيعات") {
            if (sub.type === "دائن") salesSum += amount;
            else if (sub.type === "مدين") salesSum -= amount;
          }
          if (sub.accountName === "حساب ضريبة القيمة المضافة") {
            if (sub.type === "دائن") taxSum += amount;
          }
          if (sub.accountName.includes("حساب مصروفات") && sub.type === "مدين") {
            expenseSum += amount;
          }
          if (sub.accountName.includes("حساب ذمم العملاء")) {
            if (sub.type === "مدين") receivablesSum += amount;
            else if (sub.type === "دائن") receivablesSum -= amount;
          }
          // حساب تكلفة البضاعة المباعة من القيد (يمكن إضافة حساب مستقل)
          if (sub.accountName === "حساب تكلفة البضاعة المباعة" && sub.type === "مدين") {
            cogsSum += amount;
          }
          // مبيعات الوردية المفتوحة
          if (!data.isShiftClosed && sub.accountName === "حساب إيرادات المبيعات" && sub.type === "دائن") {
            tempShiftSales += amount;
          }
        });
      });

      setJournalEntries(entries);
      setTotalCash(cashSum);
      setTotalSales(salesSum);
      setTotalTax(taxSum);
      setTotalExpenses(expenseSum);
      setTotalCOGS(cogsSum);
      setTotalReceivables(receivablesSum < 0 ? 0 : receivablesSum);
      setShiftSales(tempShiftSales);
    });

    return () => {
      unsubProducts();
      unsubEntries();
    };
  }, [sendLowStockAlerts]);

  // ============================================================
  //  دوال إدارة السلة
  // ============================================================
  const addToCart = useCallback((product) => {
    if (currentUserRole === 'accountant') {
      setErrorMessage('ليس لديك صلاحية لإضافة منتجات للسلة.');
      return;
    }
    const currentStock = product.stock || 0;
    if (currentStock <= 0) {
      setErrorMessage('المنتج غير متوفر في المخزون.');
      playSound('error');
      return;
    }
    playSound('success');
    setCart((prevCart) => {
      const exists = prevCart.find(item => item.id === product.id);
      if (exists) {
        // التأكد من أن الكمية لا تتجاوز المخزون
        if (exists.qty >= currentStock) {
          setErrorMessage('لا يمكن إضافة كمية أكبر من المخزون المتاح.');
          return prevCart;
        }
        return prevCart.map(item =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prevCart, { ...product, qty: 1 }];
    });
    setErrorMessage('');
  }, [currentUserRole, playSound]);

  const removeFromCart = useCallback((productId) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  }, []);

  const updateCartQty = useCallback((productId, newQty) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => prev.map(item =>
      item.id === productId ? { ...item, qty: newQty } : item
    ));
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  // حساب الإجماليات
  const subTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.qty), 0), [cart]);
  const tax = subTotal * 0.15;
  const total = subTotal + tax;

  // ============================================================
  //  إتمام عملية البيع (مع Transaction)
  // ============================================================
  const handleCheckout = useCallback(async () => {
    if (cart.length === 0) {
      setErrorMessage('السلة فارغة!');
      return;
    }
    if (paymentType === 'credit' && !customerName.trim()) {
      setErrorMessage('يرجى إدخال اسم العميل للدفع الآجل.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      // استخدام Transaction لتحديث المخزون بشكل آمن
      await runTransaction(db, async (transaction) => {
        // 1. قراءة المنتجات الحالية للتحقق من الكميات
        const productRefs = cart.map(item => doc(db, 'products', item.id));
        const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        // التحقق من أن الكميات المطلوبة متوفرة
        for (let i = 0; i < cart.length; i++) {
          const docSnap = productDocs[i];
          if (!docSnap.exists()) {
            throw new Error(`المنتج ${cart[i].name} غير موجود في قاعدة البيانات.`);
          }
          const currentStock = docSnap.data().stock || 0;
          if (currentStock < cart[i].qty) {
            throw new Error(`الكمية المطلوبة من ${cart[i].name} (${cart[i].qty}) أكبر من المخزون المتاح (${currentStock}).`);
          }
        }

        // 2. تحديث المخزون
        for (let i = 0; i < cart.length; i++) {
          const ref = productRefs[i];
          const newStock = (productDocs[i].data().stock || 0) - cart[i].qty;
          transaction.update(ref, { stock: newStock });
        }

        // 3. إنشاء الفاتورة
        const invoiceData = {
          items: cart.map(item => ({ id: item.id, name: item.name, price: item.price, qty: item.qty, cost: item.cost || 0 })),
          subTotal,
          tax,
          total,
          paymentType,
          customerName: paymentType === 'credit' ? customerName : 'عميل نقدي',
          date: new Date().toLocaleString('ar-EG'),
          timestamp: new Date()
        };
        const invoiceRef = doc(collection(db, 'invoices'));
        transaction.set(invoiceRef, invoiceData);

        // 4. إنشاء القيد المحاسبي
        const entries = [
          // المدين: الصندوق أو ذمم العملاء
          {
            accountName: paymentType === 'credit' ? `حساب ذمم العملاء / ${customerName}` : "حساب الصندوق / النقدية",
            type: "مدين",
            amount: total
          },
          // دائن: إيرادات المبيعات (المبلغ قبل الضريبة)
          {
            accountName: "حساب إيرادات المبيعات",
            type: "دائن",
            amount: subTotal
          },
          // دائن: ضريبة القيمة المضافة
          {
            accountName: "حساب ضريبة القيمة المضافة",
            type: "دائن",
            amount: tax
          }
        ];

        // إضافة قيد تكلفة البضاعة المباعة (COGS) إذا كانت التكلفة متوفرة
        const totalCost = cart.reduce((acc, item) => acc + (item.cost || 0) * item.qty, 0);
        if (totalCost > 0) {
          entries.push({
            accountName: "حساب تكلفة البضاعة المباعة",
            type: "مدين",
            amount: totalCost
          });
          // دائن المخزون (حساب الأصول) – يمكن إضافته إذا أردت تتبع حركة المخزون محاسبياً
          entries.push({
            accountName: "حساب المخزون",
            type: "دائن",
            amount: totalCost
          });
        }

        const journalRef = doc(collection(db, 'journal_entries'));
        transaction.set(journalRef, {
          invoiceId: invoiceRef.id,
          date: new Date().toLocaleDateString('ar-EG'),
          description: `فاتورة مبيعات #${invoiceRef.id}`,
          entries,
          isShiftClosed: false
        });
      });

      // نجاح العملية
      setCart([]);
      setCustomerName('');
      setPaymentType('cash');
      playSound('success');
      setErrorMessage('');
    } catch (error) {
      console.error('❌ فشل البيع:', error);
      setErrorMessage(error.message || 'حدث خطأ أثناء إتمام البيع.');
      playSound('error');
    } finally {
      setIsProcessing(false);
    }
  }, [cart, paymentType, customerName, subTotal, tax, total, playSound]);

  // ============================================================
  //  إضافة منتج جديد (تم إكمالها)
  // ============================================================
  const handleAddProduct = useCallback(async (e) => {
    e.preventDefault();
    if (!productName.trim() || !productPrice || !productQty) {
      setErrorMessage('الاسم، السعر، والكمية حقول إلزامية.');
      return;
    }
    const priceNum = parseFloat(productPrice);
    const costNum = parseFloat(productCost) || 0;
    const qtyNum = parseInt(productQty, 10);
    const reorderNum = parseInt(productReorderLevel, 10) || 0;

    if (isNaN(priceNum) || priceNum <= 0) {
      setErrorMessage('يجب أن يكون السعر رقماً موجباً.');
      return;
    }
    if (isNaN(qtyNum) || qtyNum < 0) {
      setErrorMessage('الكمية يجب أن تكون رقماً غير سالب.');
      return;
    }

    try {
      await addDoc(collection(db, 'products'), {
        name: productName,
        price: priceNum,
        cost: costNum,
        barcode: productBarcode || '',
        stock: qtyNum,
        category: productCategory,
        expiryDate: productExpiry || null,
        batch: productBatch || '',
        reorderLevel: reorderNum,
        supplierEmail: productSupplierEmail || '',
        supplierName: '',
        createdAt: new Date()
      });
      // تفريغ النموذج
      setProductName('');
      setProductPrice('');
      setProductCost('');
      setProductBarcode('');
      setProductQty('');
      setProductCategory('أدوية');
      setProductExpiry('');
      setProductBatch('');
      setProductReorderLevel('');
      setProductSupplierEmail('');
      setErrorMessage('');
      playSound('success');
    } catch (error) {
      console.error('❌ فشل إضافة المنتج:', error);
      setErrorMessage('حدث خطأ أثناء إضافة المنتج.');
      playSound('error');
    }
  }, [productName, productPrice, productCost, productQty, productBarcode, productCategory, productExpiry, productBatch, productReorderLevel, productSupplierEmail, playSound]);

  // ============================================================
  //  إغلاق الوردية
  // ============================================================
  const handleCloseShiftSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!actualCashInDrawer) {
      setErrorMessage('يرجى إدخال المبلغ الفعلي في الدرج.');
      return;
    }
    const actual = parseFloat(actualCashInDrawer);
    if (isNaN(actual) || actual < 0) {
      setErrorMessage('المبلغ يجب أن يكون رقماً موجباً.');
      return;
    }

    try {
      // إضافة قيد إغلاق الوردية (تسوية الصندوق)
      await addDoc(collection(db, 'journal_entries'), {
        date: new Date().toLocaleDateString('ar-EG'),
        description: `إغلاق الوردية النقدية - المبلغ الفعلي: ${actual} ريال`,
        entries: [
          {
            accountName: "حساب الصندوق / النقدية",
            type: "دائن",
            amount: actual // إخراج المبلغ الفعلي من الصندوق (تسوية)
          },
          {
            accountName: "حساب أستاذ الوردية",
            type: "مدين",
            amount: actual // إيداع في حساب الوردية (يمكن تعديله حسب النظام)
          }
        ],
        isShiftClosed: true,
        shiftActualCash: actual
      });
      // إعادة تعيين مبيعات الوردية (سيتم احتسابها من جديد بناءً على القيود)
      setIsShiftModalOpen(false);
      setActualCashInDrawer('');
      setErrorMessage('');
      playSound('success');
    } catch (error) {
      console.error('❌ فشل إغلاق الوردية:', error);
      setErrorMessage('حدث خطأ أثناء إغلاق الوردية.');
      playSound('error');
    }
  }, [actualCashInDrawer, playSound]);

  // ============================================================
  //  حساب المؤشرات المالية
  // ============================================================
  const netProfit = totalSales - totalCOGS - totalExpenses;
  const profitPercentage = totalSales > 0 ? Math.min(Math.max((netProfit / totalSales) * 100, 0), 100) : 0;
  const cashVsReceivablesTotal = totalCash + totalReceivables;
  const cashBarWidth = cashVsReceivablesTotal > 0 ? (totalCash / cashVsReceivablesTotal) * 100 : 50;
  const debtBarWidth = cashVsReceivablesTotal > 0 ? (totalReceivables / cashVsReceivablesTotal) * 100 : 50;

  // تصفية المنتجات للبحث
  const filteredProducts = useMemo(() => {
    return products.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (selectedCategory === 'الكل' || p.category === selectedCategory)
    );
  }, [products, searchQuery, selectedCategory]);

  // ============================================================
  //  واجهة المستخدم (UI)
  // ============================================================
  return (
    <div className={`min-h-screen p-4 transition-colors duration-300 text-right ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`} dir="rtl">

      {/* شريط التحكم العلوي */}
      <div className="max-w-6xl mx-auto mb-4 flex flex-wrap justify-between items-center bg-gray-200 dark:bg-gray-800 p-2 rounded-xl text-xs font-bold gap-2 shadow-inner">
        <div className="flex items-center gap-2">
          <span>👤 الصلاحيات:</span>
          <button onClick={() => setCurrentUserRole('admin')} className={`px-2.5 py-1 rounded-md ${currentUserRole === 'admin' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700'}`}>المدير العام</button>
          <button onClick={() => setCurrentUserRole('cashier')} className={`px-2.5 py-1 rounded-md ${currentUserRole === 'cashier' ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-700'}`}>الكاشير</button>
        </div>
        <div className="flex items-center gap-1.5">
          {currentUserRole !== 'cashier' && (
            <>
              <button onClick={() => exportToCSV('products')} className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]">📊 إكسيل المنتجات</button>
              <button onClick={() => exportToCSV('journal')} className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[10px]">🏛️ إكسيل القيود</button>
            </>
          )}
          <button onClick={() => setIsShiftModalOpen(true)} className="bg-red-600 text-white px-2 py-0.5 rounded text-[10px]">🔒 تصفية الوردية</button>
        </div>
        <div className="text-gray-400 font-mono text-[10px]">غسق ERP الذكي v10.0</div>
      </div>

      {/* شريط العنوان */}
      <div className="flex justify-between items-center bg-blue-600 p-4 rounded-2xl text-white shadow-md max-w-6xl mx-auto mb-5">
        <h1 className="text-lg font-bold">🎯 نظام غسق ERP المالي والبيعي</h1>
        <button onClick={() => setIsDarkMode(!isDarkMode)} className="bg-blue-800 px-3 py-1.5 rounded-xl text-xs">☀️/🌙</button>
      </div>

      {/* عرض رسائل الخطأ */}
      {errorMessage && (
        <div className="max-w-6xl mx-auto mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-xl border border-red-400 text-sm">
          ⚠️ {errorMessage}
          <button onClick={() => setErrorMessage('')} className="float-left text-red-500 font-bold">✕</button>
        </div>
      )}

      {/* لوحة القيادة (للادمن فقط) */}
      {currentUserRole !== 'cashier' && (
        <>
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* هامش الربح */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow border text-xs font-bold">
              <p className="text-gray-400 mb-2">📈 معدل صافي الربح من إجمالي المبيعات</p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 h-5 rounded-full overflow-hidden relative shadow-inner">
                <div className="bg-gradient-to-l from-emerald-500 to-teal-400 h-full transition-all duration-1000 flex items-center justify-end pl-2 text-white font-mono text-[10px]" style={{ width: `${profitPercentage}%` }}>
                  {profitPercentage.toFixed(1)}%
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>إيراد: {totalSales.toFixed(2)} ريال</span>
                <span>صافي أرباحك: {netProfit.toFixed(2)} ريال</span>
              </div>
            </div>
            {/* السيولة */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow border text-xs font-bold">
              <p className="text-gray-400 mb-2">⚖️ مؤشر السيولة الفورية (كاش 🟩 مقابل ذمم 🟧)</p>
              <div className="w-full h-5 rounded-full overflow-hidden flex shadow-inner">
                <div className="bg-emerald-500 transition-all duration-1000" style={{ width: `${cashBarWidth}%` }} />
                <div className="bg-orange-500 transition-all duration-1000" style={{ width: `${debtBarWidth}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>💵 كاش: {totalCash.toFixed(2)} ريال</span>
                <span>🔍 ذمم: {totalReceivables.toFixed(2)} ريال</span>
              </div>
            </div>
          </div>

          {/* كروت الإحصائيات السريعة */}
          <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border text-center shadow-sm">
              <span className="text-[10px] text-gray-400 block mb-0.5">💰 نقدية الصندوق</span>
              <span className="text-xs font-black text-blue-600">{totalCash.toFixed(2)} ريال</span>
            </div>
            <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border text-center shadow-sm">
              <span className="text-[10px] text-gray-400 block mb-0.5">📈 المبيعات</span>
              <span className="text-xs font-black text-green-500">{totalSales.toFixed(2)} ريال</span>
            </div>
            <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border text-center shadow-sm">
              <span className="text-[10px] text-gray-400 block mb-0.5">🔍 ذمم العملاء</span>
              <span className="text-xs font-black text-orange-600">{totalReceivables.toFixed(2)} ريال</span>
            </div>
            <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border text-center shadow-sm">
              <span className="text-[10px] text-gray-400 block mb-0.5">🎉 صافي الأرباح</span>
              <span className={`text-xs font-black ${netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{netProfit.toFixed(2)} ريال</span>
            </div>
          </div>
        </>
      )}

      {/* القسم الرئيسي: إضافة منتج + شاشة البيع */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {/* العمود الأيمن: إضافة منتج (للادمن فقط) */}
        {currentUserRole === 'admin' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border shadow-sm">
              <h2 className="text-xs font-bold mb-3 text-blue-500">➕ تعريف صنف جديد</h2>
              <form onSubmit={handleAddProduct} className="space-y-2 text-xs">
                <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="اسم المنتج *" className="w-full p-2 border rounded-lg dark:bg-gray-700" required />
                <input type="number" step="0.01" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} placeholder="سعر البيع *" className="w-full p-2 border rounded-lg dark:bg-gray-700" required />
                <input type="number" step="0.01" value={productCost} onChange={(e) => setProductCost(e.target.value)} placeholder="سعر التكلفة" className="w-full p-2 border rounded-lg dark:bg-gray-700" />
                <input type="text" value={productBarcode} onChange={(e) => setProductBarcode(e.target.value)} placeholder="الباركود" className="w-full p-2 border rounded-lg dark:bg-gray-700" />
                <input type="number" value={productQty} onChange={(e) => setProductQty(e.target.value)} placeholder="الكمية *" className="w-full p-2 border rounded-lg dark:bg-gray-700" required />
                <select value={productCategory} onChange={(e) => setProductCategory(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700">
                  <option>أدوية</option>
                  <option>مستلزمات طبية</option>
                  <option>مكملات غذائية</option>
                  <option>أخرى</option>
                </select>
                <input type="date" value={productExpiry} onChange={(e) => setProductExpiry(e.target.value)} placeholder="تاريخ الصلاحية" className="w-full p-2 border rounded-lg dark:bg-gray-700" />
                <input type="text" value={productBatch} onChange={(e) => setProductBatch(e.target.value)} placeholder="رقم الدفعة" className="w-full p-2 border rounded-lg dark:bg-gray-700" />
                <input type="number" value={productReorderLevel} onChange={(e) => setProductReorderLevel(e.target.value)} placeholder="حد الطلب (Reorder Level)" className="w-full p-2 border rounded-lg dark:bg-gray-700" />
                <input type="email" value={productSupplierEmail} onChange={(e) => setProductSupplierEmail(e.target.value)} placeholder="بريد المورد (للتنبيه)" className="w-full p-2 border rounded-lg dark:bg-gray-700" />
                <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition text-xs font-bold">➕ إضافة المنتج</button>
              </form>
            </div>
          </div>
        )}

        {/* العمود الأوسط والأيمن: شاشة البيع والسلة */}
        <div className={currentUserRole === 'admin' ? "md:col-span-2" : "md:col-span-3"}>
          <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
            <h2 className="text-xs font-bold">🛍️ شاشة المبيعات الفورية (POS)</h2>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="🔍 ابحث بالاسم أو الباركود..." className="p-1.5 text-xs rounded-xl border dark:bg-gray-800 text-right w-48 shadow-inner" />
          </div>

          {/* قائمة المنتجات */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pl-1">
            {filteredProducts.map((product) => {
              const stockQty = product.stock || 0;
              return (
                <div key={product.id} onClick={() => stockQty > 0 && addToCart(product)} className={`p-3 rounded-xl border text-center shadow-sm cursor-pointer active:scale-95 transition ${stockQty <= 0 ? 'opacity-50 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}>
                  <div className="font-bold text-xs truncate">{product.name}</div>
                  <div className="text-green-500 font-extrabold mt-1 text-xs">{product.price} ريال</div>
                  <div className="text-[10px] text-gray-400 mt-2 border-t pt-1">مخزن: {stockQty}</div>
                  {product.reorderLevel && stockQty <= product.reorderLevel && (
                    <div className="text-[9px] text-red-500 font-bold mt-1">⚠️ بحاجة طلب</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* السلة */}
          <div className="mt-4 bg-white dark:bg-gray-800 p-3 rounded-xl border shadow-sm">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold">🧺 السلة ({cart.length} أصناف)</h3>
              <button onClick={clearCart} className="text-xs text-red-500 hover:underline">🗑️ مسح الكل</button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 my-2">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between items-center text-xs p-1 border-b">
                  <span className="truncate w-1/3">{item.name}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateCartQty(item.id, item.qty - 1)} className="px-1.5 bg-gray-200 rounded">-</button>
                    <span className="w-6 text-center">{item.qty}</span>
                    <button onClick={() => updateCartQty(item.id, item.qty + 1)} className="px-1.5 bg-gray-200 rounded">+</button>
                  </div>
                  <span>{(item.price * item.qty).toFixed(2)}</span>
                  <button onClick={() => removeFromCart(item.id)} className="text-red-500 text-[10px]">✕</button>
                </div>
              ))}
              {cart.length === 0 && <div className="text-gray-400 text-xs text-center py-2">السلة فارغة</div>}
            </div>
            <div className="border-t pt-2 text-xs space-y-1">
              <div className="flex justify-between"><span>الإجمالي:</span><span>{subTotal.toFixed(2)} ريال</span></div>
              <div className="flex justify-between"><span>الضريبة (15%):</span><span>{tax.toFixed(2)} ريال</span></div>
              <div className="flex justify-between font-bold"><span>الإجمالي النهائي:</span><span>{total.toFixed(2)} ريال</span></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className="p-1.5 text-xs border rounded-lg dark:bg-gray-700">
                <option value="cash">نقدي</option>
                <option value="credit">آجل</option>
              </select>
              {paymentType === 'credit' && (
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="اسم العميل" className="p-1.5 text-xs border rounded-lg dark:bg-gray-700 w-32" />
              )}
              <button
                onClick={handleCheckout}
                disabled={isProcessing || cart.length === 0}
                className={`bg-green-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition ${(isProcessing || cart.length === 0) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700'}`}
              >
                {isProcessing ? 'جاري الإتمام...' : '💳 إتمام البيع'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* مودال إغلاق الوردية */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4">🔒 إغلاق الوردية</h3>
            <form onSubmit={handleCloseShiftSubmit}>
              <label className="block text-sm mb-2">المبلغ الفعلي في الدرج (ريال):</label>
              <input type="number" step="0.01" value={actualCashInDrawer} onChange={(e) => setActualCashInDrawer(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700 mb-4" required />
              <div className="flex justify-between">
                <button type="button" onClick={() => setIsShiftModalOpen(false)} className="bg-gray-300 px-4 py-2 rounded-lg">إلغاء</button>
                <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded-lg">تأكيد الإغلاق</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* تذييل بسيط */}
      <div className="max-w-6xl mx-auto text-center text-[10px] text-gray-400 border-t pt-4 mt-8">
        نظام غسق ERP v10.0 – جميع الحقوق محفوظة © 2025
      </div>
    </div>
  );
}
