"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Link from 'next/link';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State untuk Data Pembeli
  const [customerName, setCustomerName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [domicile, setDomicile] = useState('');

  // State untuk Kode Unik
  const [uniqueCode, setUniqueCode] = useState<number>(0);

  useEffect(() => {
    setMounted(true);
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
    
    // Hasilkan kode unik 1 - 10 HANYA SEKALI saat halaman dimuat
    setUniqueCode(Math.floor(Math.random() * 10) + 1);
  }, []);

  const parsePrice = (price: any) => {
    if (typeof price === 'number') return price;
    if (typeof price === 'string') return Number(price.replace(/[^0-9]/g, ''));
    return 0;
  };

  // Kalkulasi Harga (Terpisah antara Harga Asli dan Total + Kode Unik)
  const baseTotal = cart.reduce((sum, item) => sum + (parsePrice(item.price) * (Number(item.quantity) || 1)), 0);
  const totalPay = baseTotal + uniqueCode;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (cart.length === 0) {
      alert("Keranjang belanja kosong!");
      return;
    }
    if (!customerName || !contactInfo || !domicile) {
      alert("Mohon lengkapi semua data formulir pembeli.");
      return;
    }

    setIsSubmitting(true);

    try {
      const docRef = await addDoc(collection(db, "orders"), {
        customerName: customerName,
        contactInfo: contactInfo,
        domicile: domicile,
        items: cart,
        basePayment: baseTotal, // Menyimpan harga asli barang
        uniqueCode: uniqueCode, // Menyimpan 2 digit kode unik
        totalPayment: totalPay, // Menyimpan total harga akhir (Base + Kode Unik)
        status: "Menunggu Pembayaran",
        createdAt: serverTimestamp()
      });

      // Bersihkan keranjang lokal setelah sukses masuk database
      localStorage.removeItem('cart');
      
      // Arahkan pembeli ke halaman pembayaran menggunakan ID dari Firestore
      router.push(`/checkout/pay?id=${docRef.id}`);

    } catch (error) {
      console.error("Gagal membuat pesanan: ", error);
      alert("Terjadi kesalahan saat memproses pesanan Anda. Silakan coba lagi.");
      setIsSubmitting(false);
    }
  };

  if (!mounted) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="animate-pulse font-medium text-slate-500">Mempersiapkan rute aman...</p></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans py-12 px-4">
      <div className="max-w-4xl mx-auto">
        
        <Link href="/" className="text-sm font-bold text-slate-500 hover:text-slate-900 mb-6 inline-block transition-colors">
          ← Kembali Belanja
        </Link>
        <h1 className="text-3xl font-black tracking-tight mb-8">CHECKOUT PESANAN</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Kolom Kiri: Ringkasan Belanja & Tagihan */}
          <div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm sticky top-24">
              <h2 className="text-lg font-bold mb-4 border-b pb-4">Ringkasan Barang</h2>
              
              {cart.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">Keranjang Anda kosong.</p>
              ) : (
                <ul className="space-y-4 mb-6">
                  {cart.map((item, index) => (
                    <li key={index} className="flex justify-between items-start pb-4 border-b border-slate-50">
                      <div>
                        <p className="font-semibold text-sm">{item.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{item.quantity}x @ Rp {parsePrice(item.price).toLocaleString('id-ID')}</p>
                      </div>
                      <p className="font-bold text-sm text-slate-900">
                        Rp {(parsePrice(item.price) * item.quantity).toLocaleString('id-ID')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {/* Rincian Kalkulasi Harga dengan Kode Unik Terpisah */}
              <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-medium">Subtotal Harga Barang:</span>
                      <span className="font-bold text-slate-700">Rp {baseTotal.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-medium">Kode Unik Sistem:</span>
                      <span className="font-bold text-emerald-600">+ Rp {uniqueCode}</span>
                  </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                <span className="font-bold text-slate-800">Total Bayar Akhir</span>
                <span className="text-2xl font-black text-slate-900">Rp {totalPay.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>

          {/* Kolom Kanan: Formulir Data Diri */}
          <div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h2 className="text-lg font-bold mb-6 border-b pb-4">Formulir Pembeli</h2>
              
              <form onSubmit={handleSubmitOrder} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Nama Lengkap</label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-200 p-3.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 transition-shadow"
                    placeholder="Masukkan nama lengkap"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Nomor Handphone / WA</label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-200 p-3.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 transition-shadow"
                    placeholder="Contoh: 0812xxx"
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Domisili Kampus</label>
                  <select 
                    className="w-full border border-slate-200 p-3.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 transition-shadow bg-white cursor-pointer"
                    value={domicile}
                    onChange={(e) => setDomicile(e.target.value)}
                    required
                  >
                    <option value="" disabled>-- Pilih Domisili Kampus --</option>
                    <option value="Jatinangor">Jatinangor</option>
                    <option value="Ganesha">Ganesha</option>
                  </select>
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting || cart.length === 0}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-4 rounded-xl font-bold transition-colors shadow-md mt-4"
                >
                  {isSubmitting ? 'Memproses Pesanan...' : 'Konfirmasi & Lanjut Pembayaran'}
                </button>
              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}