import React, { useState } from 'react';
import { db } from './config'; // استدعاء قاعدة البيانات من الملف الذي أنشأته توك
import { collection, addDoc } from 'firebase/firestore';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // متغيرات لحفظ ما يكتبه المستخدم في الخانات
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productBarcode, setProductBarcode] = useState('');

  // 1. دالة صوت النجاح
  const playSuccessSound = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); 
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); 
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  };

  // 2. دالة صوت الخطأ
  const playErrorSound = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime); 
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  };

  // 3. دالة حفظ المنتج وإرساله إلى Firebase
  const handleSaveProduct = async (e) => {
    e.preventDefault();

    // التحقق من أن المستخدم لم يترك الخانات فارغة
    if (!productName || !productPrice || !productBarcode) {
      playErrorSound(); // تشغيل صوت الخطأ للتنبيه
      alert('يرجى ملء جميع الحقول أولاً!');
      return;
    }

    try {
      // إرسال البيانات إلى جدول اسمه products في Firebase
      await addDoc(collection(db, 'products'), {
        name: productName,
        price: Number(productPrice), // تحويل السعر لرقم لمحاسبة دقيقة
        barcode: productBarcode,
        createdAt: new Date()
      });

      playSuccessSound(); // تشغيل صوت النجاح
      alert('تم حفظ المنتج بنجاح في قاعدة البيانات! 🎉');

      // تفريغ الخانات بعد الحفظ بنجاح
      setProductName('');
      setProductPrice('');
      setProductBarcode('');

    } catch (error) {
      playErrorSound();
      console.error("خطأ في الحفظ:", error);
      alert('حدث خطأ أثناء الاتصال بقاعدة البيانات.');
    }
  };

  return (
    <div className={`min-h-screen p-5 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      
      {/* الشريط العلوي مع زر الليل والنهار */}
      <div className="flex justify-between items-center bg-blue-600 p-4 rounded-xl text-white shadow-lg max-w-md mx-auto">
        <h1 className="text-lg font-bold">نظام غسق ERP الذكي 🌟</h1>
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)} 
          className="bg-blue-800 px-3 py-1.5 rounded-lg text-xs font-semibold">
          {isDarkMode ? '☀️ نهار' : '🌙 ليل'}
        </button>
      </div>

      {/* كرت إضافة المنتجات */}
      <div className="mt-8 max-w-md mx-auto bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border dark:border-gray-700">
        <h2 className="text-xl font-bold text-center mb-6 text-blue-600 dark:text-blue-400">📦 إضافة منتج جديد للمخزن</h2>
        
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">اسم المنتج:</label>
            <input 
              type="text" 
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full p-3 rounded-xl border dark:bg-gray-700 dark:border-gray-600 text-right" 
              placeholder="مثال: شاحن سريع"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">السعر (ريال/جنيه):</label>
            <input 
              type="number" 
              value={productPrice}
              onChange={(e) => setProductPrice(e.target.value)}
              className="w-full p-3 rounded-xl border dark:bg-gray-700 dark:border-gray-600 text-right" 
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">الباركود أو الكود:</label>
            <input 
              type="text" 
              value={productBarcode}
              onChange={(e) => setProductBarcode(e.target.value)}
              className="w-full p-3 rounded-xl border dark:bg-gray-700 dark:border-gray-600 text-right" 
              placeholder="اكتب أو امسح الباركود"
            />
          </div>

          <button 
            type="submit" 
            className="w-full mt-4 bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl shadow-lg transition active:scale-95 text-lg">
            💾 حفظ المنتج في النظام
          </button>
        </form>
      </div>

    </div>
  );
}
