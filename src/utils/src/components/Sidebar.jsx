import React from 'react';

export default function Sidebar({ isOpen, onClose }) {
  return (
    <>
      <div className={`fixed top-0 right-0 h-full w-80 bg-white dark:bg-gray-800 shadow-2xl transform transition-transform duration-300 z-50 p-5 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
          <h2 className="text-xl font-bold dark:text-white">🛒 سلة المبيعات (POS)</h2>
          <button onClick={onClose} className="text-red-500 font-bold text-lg hover:scale-110 transition">X</button>
        </div>
        <div className="mt-5 dark:text-gray-300">
          <p>هنا ستظهر المنتجات المحسوبة وفاتورة العميل المحاسبية تلقائياً...</p>
        </div>
      </div>
      {isOpen && (
        <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 z-40"></div>
      )}
    </>
  );
}
