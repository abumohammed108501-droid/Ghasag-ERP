import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// كود الاتصال الخاص بمشروعك غسق ERP
const firebaseConfig = {
  apiKey: "AIzaSyAbTXXZD99nfhI-I-2xeKsf2961iyv-uBk",
  authDomain: "ghasag-erp.firebaseapp.com",
  projectId: "ghasag-erp",
  storageBucket: "ghasag-erp.firebasestorage.app",
  messagingSenderId: "971330465078",
  appId: "1:971330465078:web:90cccbd6d0e21dd155d797"
};

// 1. تشغيل اتصال Firebase
const app = initializeApp(firebaseConfig);

// 2. تفعيل قاعدة البيانات وتصديرها للنظام
export const db = getFirestore(app);
