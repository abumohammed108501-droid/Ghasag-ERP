import React, { useState, useEffect } from 'react';
import { db } from './config';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [products, setProducts] = useState([]); // لتخزين المنتجات القادمة من الفايربيز
  const [cart, setCart] = useState([]); // سلة المشتريات الحالية
  const [isCartOpen, setIsCartOpen] = useState(false); // التحكم في القائمة المنزلقة

  // متغيرات نموذج إضافة منتج جديد
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productBarcode, setProductBarcode] = useState('');

  // 1. التفاعل الصوتي برمجياً
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

  // 2. جلب المنتجات فورياً وتلقائياً من Firebase بمجرد فتح الشاشة
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const items = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      setProducts(items);
    });
    return () => unsubscribe();
  }, []);

  // 3. إضافة منتج جديد للمخزن
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!productName || !productPrice || !productBarcode) {
      playSound('error');
      alert('يرجى ملء كافة الحقول أولاً!');
      return;
    }
    try {
      await addDoc(collection(db, 'products'), {
        name: productName,
        price: Number(productPrice),
        barcode: productBarcode
      });
      playSound('success');
      setProductName(''); setProductPrice(''); setProductBarcode('');
    } catch (error) {
      playSound('error');
    }
  };

  // 4. إضافة منتج إلى سلة المبيعات (POS)
  const addToCart = (product) => {
    playSound('success');
    setCart((prevCart) => {
      const exists = prevCart.find(item => item.id === product.id);
      if (exists) {
        return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prevCart, { ...product, qty: 1 }];
    });
  };

  // 5. حساب الإجماليات والضرائب
  const subTotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const tax = subTotal * 0.15; // ضريبة القيمة المضافة 15%
  const total = subTotal + tax;

  // 6. إتمام البيع وحفظ الفاتورة
  const handleCheckout = async () => {
    if (cart.length === 0) {
      playSound('error');
      alert('السلة فارغة!');
      return;
    }
    try {
      await addDoc(collection(db, 'invoices'), {
        items: cart,
        subTotal,
        tax,
        total,
        createdAt: new Date()
      });
      playSound('success');
      alert('تم إصدار الفاتورة بنجاح وترحيلها محاسبياً! 🎉');
      setCart([]);
      setIsCartOpen(false);
    } catch (error) {
      playSound('error');
    }
  };

  return (
    <div className={`min-h-screen p-4 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      
      {/* شريط الأدوات العلوي */}
      <div className="flex justify-between items-center bg-blue-600 p-4 rounded-2xl text-white shadow-md max-w-5xl mx-auto mb-6">
        <h1 className="text-xl font-bold">🎯 شاشة البيع والمخزن الذكي</h1>
        <div className="flex gap-3">
          <button onClick={() => setIsCartOpen(true)} className="bg-orange-500 px-4 py-2 rounded-xl font-bold relative text-sm">
            🛒 السلة ({cart.reduce((sum, i) => sum + i.qty, 0)})
          </button>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="bg-blue-800 px-3 py-2 rounded-xl text-xs">
            {isDarkMode ? '☀️ نهار' : '🌙 ليل'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* القسم الأول: كرت إضافة المنتجات للمخزن */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow border dark:border-gray-700 h-fit">
          <h2 className="text-md font-bold mb-4 text-blue-500">📦 مدخلات المخزن</h2>
          <form onSubmit={handleSaveProduct} className="space-y-3 text-sm">
            <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="اسم المنتج" className="w-full p-2.5 rounded-xl border dark:bg-gray-700 text-right" />
            <input type="number" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} placeholder="السعر" className="w-full p-2.5 rounded-xl border dark:bg-gray-700 text-right" />
            <input type="text" value={productBarcode} onChange={(e) => setProductBarcode(e.target.value)} placeholder="الباركود" className="w-full p-2.5 rounded-xl border dark:bg-gray-700 text-right" />
            <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold">حفظ بالمخزن</button>
          </form>
        </div>

        {/* القسم الثاني: عرض المنتجات الجاهزة للبيع */}
        <div className="md:col-span-2">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">🛍️ المنتجات المتوفرة <span className="text-xs bg-gray-300 dark:bg-gray-700 px-2 py-0.5 rounded-full">{products.length}</span></h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {products.map((product) => (
              <div 
                key={product.id} 
                onClick={() => addToCart(product)}
                className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 text-center shadow-sm cursor-pointer active:scale-95 transition hover:border-blue-500"
              >
                <div className="text-2xl mb-1">📦</div>
                <div className="font-bold text-sm truncate">{product.name}</div>
                <div className="text-green-500 font-extrabold mt-1 text-sm">{product.price} ريال</div>
                <div className="text-[10px] text-gray-400 mt-1">🏷️ {productBarcode || product.barcode}</div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* الـ Slide-out الجانبي: سلة المبيعات والفاتورة التلقائية */}
      <div className={`fixed top-0 right-0 h-full w-85 bg-white dark:bg-gray-800 shadow-2xl transform transition-transform duration-300 z-50 p-5 flex flex-col ${isCartOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
          <h3 className="font-bold text-lg">🧾 قائمة الفاتورة الحالية</h3>
          <button onClick={() => setIsCartOpen(false)} className="text-red-500 font-bold text-lg">X</button>
        </div>

        {/* عرض عناصر السلة */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-3 text-sm">
          {cart.map(item => (
            <div key={item.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded-xl">
              <div>
                <span className="font-bold">{item.name}</span>
                <span className="text-xs text-gray-400 block">{item.price} ريال × {item.qty}</span>
              </div>
              <span className="font-extrabold text-blue-500">{item.price * item.qty} ريال</span>
            </div>
          ))}
        </div>

        {/* ملخص الحساب المحاسبي الذكي والضرائب */}
        <div className="border-t pt-3 space-y-1.5 text-sm dark:border-gray-700">
          <div className="flex justify-between text-gray-500"><span>المجموع الفرعي:</span> <span>{subTotal.toFixed(2)} ريال</span></div>
          <div className="flex justify-between text-gray-500"><span>الضريبة (15%):</span> <span>{tax.toFixed(2)} ريال</span></div>
          <div className="flex justify-between font-extrabold text-lg border-t pt-2 dark:border-gray-600"><span>الإجمالي النهائي:</span> <span className="text-green-500">{total.toFixed(2)} ريال</span></div>
          
          <button onClick={handleCheckout} className="w-full bg-green-500 text-white font-bold py-3 rounded-xl mt-3 shadow-lg active:scale-95 transition">
            💰 إتمام البيع وحفظ الفاتورة
          </button>
        </div>
      </div>

      {/* خلفية معتمة للـ Slide-out */}
      {isCartOpen && <div onClick={() => setIsCartOpen(false)} className="fixed inset-0 bg-black bg-opacity-50 z-40"></div>}

    </div>
  );
}
