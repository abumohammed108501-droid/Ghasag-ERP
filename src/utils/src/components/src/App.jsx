import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import { playSuccessSound, playErrorSound } from './utils/audio';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div className={`min-h-screen p-5 transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <div className="flex justify-between items-center bg-blue-600 p-4 rounded-xl text-white shadow-lg">
        <h1 className="text-xl font-bold">نظام غسق الذكي 🌟</h1>
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)} 
          className="bg-blue-800 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
          {isDarkMode ? '☀️ وضع النهار' : '🌙 وضع الليل'}
        </button>
      </div>

      <div className="mt-10 text-center">
        <p className="text-lg mb-5">ملفات النظام أصبحت مرتبة ومنظمة الآن داخل مجلداتك!</p>
        <div className="flex justify-center gap-4 mb-8">
          <button onClick={playSuccessSound} className="bg-green-500 text-white px-6 py-3 rounded-xl font-bold shadow-md active:scale-95 transition">
            🔔 تجربة صوت النجاح
          </button>
          <button onClick={playErrorSound} className="bg-red-500 text-white px-6 py-3 rounded-xl font-bold shadow-md active:scale-95 transition">
            ⚠️ تجربة صوت الخطأ
          </button>
        </div>
        <button 
          onClick={() => {
            setIsDrawerOpen(true);
            playSuccessSound();
          }} 
          className="bg-purple-600 text-white px-8 py-4 rounded-xl text-lg font-bold shadow-lg hover:bg-purple-700 transition">
          🛒 فتح سلة المبيعات (Slide-out)
        </button>
      </div>

      <Sidebar isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
}
