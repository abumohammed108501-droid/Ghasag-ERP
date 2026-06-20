import React, { useState, useEffect } from 'react';
import { db } from './config';
import { collection, addDoc, onSnapshot, doc, updateDoc } from 'firebase/firestore';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [products, setProducts] = useState([]); 
  const [cart, setCart] = useState([]); 
  const [isCartOpen, setIsCartOpen] = useState(false); 
  const [journalEntries, setJournalEntries] = useState([]); 

  // نظام إدارة المستخدمين والصلاحيات
  const [currentUserRole, setCurrentUserRole] = useState('admin'); 

  // البحث والتصفية والأقسام
  const [searchQuery, setSearchQuery] = useState(''); 
  const [searchEntryQuery, setSearchEntryQuery] = useState(''); 
  const [selectedCategory, setSelectedCategory] = useState('الكل'); 

  // نوع الدفع في السلة
  const [paymentType, setPaymentType] = useState('cash'); 
  const [customerName, setCustomerName] = useState(''); 

  // متغيرات نموذج إضافة منتج جديد
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productBarcode, setProductBarcode] = useState('');
  const [productQty, setProductQty] = useState('');
  const [productCategory, setProductCategory] = useState('أدوية');
  const [productExpiry, setProductExpiry] = useState('');
  const [productBatch, setProductBatch] = useState('');

  // نظام إغلاق الوردية المالية
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [actualCashInDrawer, setActualCashInDrawer] = useState('');
  const [shiftSales, setShiftSales] = useState(0); 

  // متغيرات الإحصائيات المالية الشاملة
  const [totalCash, setTotalCash] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [totalTax, setTotalTax] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalCOGS, setTotalCOGS] = useState(0);
  const [totalReceivables, setTotalReceivables] = useState(0); 
  const [lowStockCount, setLowStockCount] = useState(0); 
  const [expiredCount, setExpiredCount] = useState(0); 

  const [lastInvoice, setLastInvoice] = useState(null);

  // التفاعل الصوتي برمجياً
  const playSound = (type) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
    }
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  };

  // دالة تصدير البيانات التلقائية لملفات Excel/CSV
  const exportToCSV = (dataType) => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    if (dataType === 'products') {
      csvContent += "اسم المنتج,القسم,السعر,الكمية المتاحة,الباركود,تاريخ الصلاحية\n";
      products.forEach(p => {
        csvContent += `"${p.name}","${p.category}",${p.price},${p.stock || 0},"${p.barcode || ''}","${p.expiryDate || 'N/A'}"\n`;
      });
    } else if (dataType === 'journal') {
      csvContent += "التاريخ,البيان وشرح القيد,الحساب المالي,الحركة,المبلغ\n";
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
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    playSound('success');
  };

  // إضافة منتج إلى السلة
  const addToCart = (product) => {
    if (currentUserRole === 'accountant') return;
    const currentStock = product.stock || 0;
    if (currentStock <= 0) { playSound('error'); return; }
    playSound('success');
    setCart((prevCart) => {
      const exists = prevCart.find(item => item.id === product.id);
      if (exists) return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prevCart, { ...product, qty: 1 }];
    });
  };

  // جلب البيانات من Firebase وتحديث الإحصائيات الشاملة حياً
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const items = [];
      let lowStockCounter = 0;
      let expiredCounter = 0;
      snapshot.forEach((doc) => {
        const data = doc.data(); items.push({ id: doc.id, ...data });
        if ((data.stock || 0) <= 3) lowStockCounter++;
      });
      setProducts(items); setLowStockCount(lowStockCounter);
    });

    const unsubEntries = onSnapshot(collection(db, 'journal_entries'), (snapshot) => {
      const entries = [];
      let cashSum = 0; let salesSum = 0; let taxSum = 0; let expenseSum = 0; let cogsSum = 0; let receivablesSum = 0; let tempShiftSales = 0;

      snapshot.forEach((doc) => {
        const data = doc.data(); entries.push({ id: doc.id, ...data });
        data.entries?.forEach(sub => {
          if (sub.accountName === "حساب الصندوق / النقدية") {
            if (sub.type === "مدين") cashSum += sub.amount; if (sub.type === "دائن") cashSum -= sub.amount;
          }
          if (sub.accountName === "حساب إيرادات المبيعات" && sub.type === "دائن") {
            salesSum += sub.amount; if (!data.isShiftClosed) tempShiftSales += sub.amount;
          }
          if (sub.accountName === "حساب إيرادات المبيعات" && sub.type === "مدين") salesSum -= sub.amount;
          if (sub.accountName === "حساب ضريبة القيمة المضافة" && sub.type === "دائن") taxSum += sub.amount;
          if (sub.accountName.includes("حساب مصروفات") && sub.type === "مدين") expenseSum += sub.amount;
          if (sub.accountName.includes("حساب ذمم العملاء")) {
            if (sub.type === "مدين") receivablesSum += sub.amount; if (sub.type === "دائن") receivablesSum -= sub.amount;
          }
        });
      });

      setJournalEntries(entries); setTotalCash(cashSum); setTotalSales(salesSum); setTotalTax(taxSum); setTotalExpenses(expenseSum);
      setTotalCOGS(salesSum * 0.60); setTotalReceivables(receivablesSum < 0 ? 0 : receivablesSum); setShiftSales(tempShiftSales);
    });

    return () => { unsubProducts(); unsubEntries(); };
  }, []);

  // ترحيل وإغلاق الوردية
  const handleCloseShiftSubmit = async (e) => {
    e.preventDefault(); if (!actualCashInDrawer) return;
    try {
      await addDoc(collection(db, 'journal_entries'), {
        date: new Date().toLocaleDateString('ar-EG'), description: `إغلاق وتصفية الوردية النقدية دفترياً`,
        entries: [{ accountName: "حساب الصندوق / النقدية", type: "دائن", amount: totalCash }], isShiftClosed: true
      });
      setIsShiftModalOpen(false); setActualCashInDrawer(''); playSound('success');
    } catch (error) { playSound('error'); }
  };

  const subTotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const tax = subTotal * 0.15; const total = subTotal + tax;

  // إتمام البيع
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    const invoiceData = { items: cart, subTotal, tax, total, paymentType, customerName: paymentType === 'credit' ? customerName : 'عميل نقدي', date: new Date().toLocaleString('ar-EG') };
    try {
      for (const item of cart) {
        await updateDoc(doc(db, 'products', item.id), { stock: (item.stock || 0) - item.qty });
      }
      const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);
      await addDoc(collection(db, 'journal_entries'), {
        invoiceId: invoiceRef.id, date: new Date().toLocaleDateString('ar-EG'), description: `فاتورة مبيعات ERP فورية`,
        entries: [
          { accountName: paymentType === 'credit' ? `حساب ذمم العملاء / ${customerName}` : "حساب الصندوق / النقدية", type: "مدين", amount: total },
          { accountName: "حساب إيرادات المبيعات", type: "دائن", amount: subTotal }
        ]
      });
      setCart([]); playSound('success');
    } catch (error) { playSound('error'); }
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) && (selectedCategory === 'الكل' || p.category === selectedCategory));
  const netProfit = totalSales - totalCOGS - totalExpenses;

  // الحسابات البرمجية الدقيقة للمخططات البيانية الرسومية التفاعلية
  const profitPercentage = totalSales > 0 ? Math.min(Math.max((netProfit / totalSales) * 100, 0), 100) : 0;
  const cashVsReceivablesTotal = totalCash + totalReceivables;
  const cashBarWidth = cashVsReceivablesTotal > 0 ? (totalCash / cashVsReceivablesTotal) * 100 : 50;
  const debtBarWidth = cashVsReceivablesTotal > 0 ? (totalReceivables / cashVsReceivablesTotal) * 100 : 50;

  return (
    <div className={`min-h-screen p-4 transition-colors duration-300 text-right ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`} dir="rtl">
      
      {/* شريط التحكم بالمستخدمين والإشعارات */}
      <div className="max-w-5xl mx-auto mb-4 flex flex-wrap justify-between items-center bg-gray-200 dark:bg-gray-800 p-2 rounded-xl text-xs font-bold gap-2 shadow-inner">
        <div className="flex items-center gap-2">
          <span>👤 الصلاحيات:</span>
          <button onClick={() => setCurrentUserRole('admin')} className={`px-2.5 py-1 rounded-md ${currentUserRole === 'admin' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700'}`}>المدير العام</button>
          <button onClick={() => setCurrentUserRole('cashier')} className={`px-2.5 py-1 rounded-md ${currentUserRole === 'cashier' ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-700'}`}>الكاشير</button>
        </div>
        <div className="flex items-center gap-1.5">
          {currentUserRole !== 'cashier' && (
            <div className="flex gap-1">
              <button onClick={() => exportToCSV('products')} className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]">📊 إكسيل المنتجات</button>
              <button onClick={() => exportToCSV('journal')} className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[10px]">🏛️ إكسيل القيود</button>
            </div>
          )}
          <button onClick={() => setIsShiftModalOpen(true)} className="bg-red-600 text-white px-2 py-0.5 rounded text-[10px]">🔒 تصفية الوردية</button>
        </div>
        <div className="text-gray-400 font-mono text-[10px]">غسق ERP الذكي v9.0</div>
      </div>

      {/* شريط الأدوات العلوي */}
      <div className="flex justify-between items-center bg-blue-600 p-4 rounded-2xl text-white shadow-md max-w-5xl mx-auto mb-5">
        <h1 className="text-lg font-bold">🎯 نظام غسق ERP المالي والبيعي</h1>
        <button onClick={() => setIsDarkMode(!isDarkMode)} className="bg-blue-800 px-3 py-1.5 rounded-xl text-xs">☀️/🌙</button>
      </div>

      {/* 🔥 الجزء الجديد: لوحة البيانات والرسوم البيانية القيادية (Executive Chart Dashboard) */}
      {currentUserRole !== 'cashier' && (
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* كرت مخطط هامش ربح المنشأة الحقيقي */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow border text-xs font-bold">
            <p className="text-gray-400 mb-2">📈 معدل صافي الربح من إجمالي المبيعات (Net Profit Margin)</p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 h-5 rounded-full overflow-hidden relative shadow-inner">
              <div className="bg-gradient-to-l from-emerald-500 to-teal-400 h-full transition-all duration-1000 flex items-center justify-end pl-2 text-white font-mono text-[10px]" style={{ width: `${profitPercentage}%` }}>
                {profitPercentage.toFixed(1)}%
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1"><span>إيراد: {totalSales.toFixed(1)} ريال</span> <span>صافي أرباحك: {netProfit.toFixed(1)} ريال</span></div>
          </div>

          {/* كرت مخطط هيكل السيولة ومقارنة الأصول (النقدية مقابل الديون) */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow border text-xs font-bold">
            <p className="text-gray-400 mb-2">⚖️ مؤشر السيولة الفورية بالمنشأة (كاش الصندوق 🟩 مقابل ذمم الديون 🟧)</p>
            <div className="w-full h-5 rounded-full overflow-hidden flex shadow-inner">
              <div className="bg-emerald-500 transition-all duration-1000" style={{ width: `${cashBarWidth}%` }} title="كاش الصندوق فورا" />
              <div className="bg-orange-500 transition-all duration-1000" style={{ width: `${debtBarWidth}%` }} title="ديون مستحقة بالطريق" />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1"><span>💵 كاش: {totalCash.toFixed(1)} ريال</span> <span>🔍 ذمم: {totalReceivables.toFixed(1)} ريال</span></div>
          </div>
        </div>
      )}

      {/* كروت التقارير الرقمية الحية */}
      {currentUserRole !== 'cashier' && (
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border text-center shadow-sm">
            <span className="text-[10px] text-gray-400 block mb-0.5">💰 نقدية الصندوق الفعلي</span>
            <span className="text-xs font-black text-blue-600">{totalCash.toFixed(2)} ريال</span>
          </div>
          <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border text-center shadow-sm">
            <span className="text-[10px] text-gray-400 block mb-0.5">📈 المبيعات الشاملة</span>
            <span className="text-xs font-black text-green-500">{totalSales.toFixed(2)} ريال</span>
          </div>
          <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border text-center shadow-sm">
            <span className="text-[10px] text-gray-400 block mb-0.5">🔍 ديون معلقة بذمم السوق</span>
            <span className="text-xs font-black text-orange-600">{totalReceivables.toFixed(2)} ريال</span>
          </div>
          <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border text-center shadow-sm">
            <span className="text-[10px] text-gray-400 block mb-0.5">🎉 صافي الأرباح</span>
            <span className={`text-xs font-black ${netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{netProfit.toFixed(2)} ريال</span>
          </div>
        </div>
      )}

      {/* شاشة الـ POS وعناصر النظام الأساسية */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        
        {/* العمود الأيمن لتعريف الأصناف */}
        <div className="space-y-4">
          {currentUserRole === 'admin' && (
            <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border shadow-sm">
              <h2 className="text-xs font-bold mb-2 text-blue-500">➕ تعريف صنف جديد ورقابة الصلاحية</h2>
              <form onSubmit={(e) => e.preventDefault()} className="space-y-2 text-xs">
                <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="اسم المنتج" className="w-full p-2 border rounded-lg dark:bg-gray-700" />
                <input type="number" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} placeholder="سعر البيع" className="w-full p-2 border rounded-lg dark:bg-gray-700" />
                <input type="text" value={productBarcode} onChange={(e) => setProductBarcode(e.target.value)} placeholder="الباركود" className="w-full p-2 border rounded-lg dark:bg-gray-700" />
                <input type="number" value={productQty} onChange={(e) => setProductQty(e.target.value)} placeholder="الكمية" className="w-full p-2 border rounded-lg dark:bg-gray-700" />
              </form>
            </div>
          )}
        </div>

        {/* شاشة البيع المباشر الفورية */}
        <div className={currentUserRole === 'admin' ? "md:col-span-2" : "md:col-span-3"}>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xs font-bold">🛍️ شاشة المبيعات الفورية (POS)</h2>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="🔍 ابحث بالاسم أو الباركود تلقائياً..." className="p-1.5 text-xs rounded-xl border dark:bg-gray-800 text-right w-48 shadow-inner" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pl-1">
            {filteredProducts.map((product) => {
              const stockQty = product.stock || 0;
              return (
                <div key={product.id} onClick={() => stockQty > 0 && addToCart(product)} className="p-3 rounded-xl bg-white dark:bg-gray-800 border text-center shadow-sm cursor-pointer active:scale-95 transition">
                  <div className="font-bold text-xs truncate">{product.name}</div>
                  <div className="text-green-500 font-extrabold mt-1 text-xs">{product.price} ريال</div>
                  <div className="text-[10px] text-gray-400 mt-2 border-t pt-1">مخزن: {stockQty}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
