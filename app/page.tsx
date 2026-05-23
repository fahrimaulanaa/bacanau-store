"use client";

import React, { useState, useEffect } from 'react';

// 1. Definisikan tipe data untuk Produk
interface Product {
  id: number;
  name: string;
  price: number;
  img: string;
}

// Data simulasi produk menggunakan tipe Product[]
const products: Product[] = [
  { id: 1, name: 'Vintage Streetwear Tee', price: 150000, img: 'https://placehold.co/300x300/e2e8f0/1e293b?text=Tee' },
  { id: 2, name: 'Chibi Illustration Hoodie', price: 250000, img: 'https://placehold.co/300x300/e2e8f0/1e293b?text=Hoodie' },
  { id: 3, name: 'Retro Denim Jacket', price: 350000, img: 'https://placehold.co/300x300/e2e8f0/1e293b?text=Jacket' },
  { id: 4, name: 'Classic Canvas Tote', price: 85000, img: 'https://placehold.co/300x300/e2e8f0/1e293b?text=Tote' },
];

export default function Home() {
  // 2. Terapkan tipe data pada setiap State
  const [cart, setCart] = useState<Product[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isCheckout, setIsCheckout] = useState<boolean>(false);
  const [uniqueCode, setUniqueCode] = useState<number>(0);

  // Generate kode unik saat komponen di-load
  useEffect(() => {
    setUniqueCode(Math.floor(100 + Math.random() * 900));
  }, []);

  // 3. Terapkan tipe Product pada parameter fungsi
  const addToCart = (product: Product) => {
    setCart([...cart, product]);
  };

  const subTotal = cart.reduce((sum, item) => sum + item.price, 0);
  const grandTotal = subTotal > 0 ? subTotal + uniqueCode : 0;

  // 4. Definisikan tipe event untuk form submission
  const handleCheckout = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Logika ke Firebase nanti ditaruh di sini
    alert("Proses ke Firebase...");
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-black tracking-tighter text-slate-900">MAUL STORE</h1>
          <button 
            onClick={() => setIsCartOpen(!isCartOpen)}
            className="relative p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition"
          >
            🛒 <span className="hidden sm:inline font-medium ml-1">Cart</span>
            {cart.length > 0 && (
              <span className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {products.map((item) => (
            <div key={item.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-300">
              <img src={item.img} alt={item.name} className="w-full h-48 sm:h-64 object-cover" />
              <div className="p-4 sm:p-5">
                <h3 className="font-semibold text-sm sm:text-base mb-1 truncate">{item.name}</h3>
                <p className="text-slate-600 text-sm mb-4">Rp {item.price.toLocaleString('id-ID')}</p>
                <button 
                  onClick={() => addToCart(item)}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2 rounded-xl text-sm font-medium transition-colors"
                >
                  Tambah
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {isCartOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
          <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col animate-slide-in-right">
            <div className="p-5 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Keranjang Belanja</h2>
              <button onClick={() => setIsCartOpen(false)} className="text-gray-500 hover:text-black text-2xl">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {cart.length === 0 ? (
                <p className="text-center text-gray-500 mt-10">Keranjang masih kosong.</p>
              ) : (
                <ul className="space-y-4">
                  {cart.map((item, index) => (
                    <li key={index} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                      <span className="font-medium text-sm truncate pr-4">{item.name}</span>
                      <span className="text-sm font-semibold whitespace-nowrap">Rp {item.price.toLocaleString('id-ID')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-5 border-t bg-gray-50">
                {!isCheckout ? (
                  <>
                    <div className="flex justify-between mb-4 font-bold text-lg">
                      <span>Subtotal:</span>
                      <span>Rp {subTotal.toLocaleString('id-ID')}</span>
                    </div>
                    <button 
                      onClick={() => setIsCheckout(true)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-colors"
                    >
                      Lanjut Bayar
                    </button>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl text-sm">
                      <p className="mb-2">Total + Kode Unik:</p>
                      <p className="text-2xl font-black text-slate-900 mb-2">Rp {grandTotal.toLocaleString('id-ID')}</p>
                      <p className="text-xs text-slate-600">Mohon transfer <strong>tepat hingga 3 digit terakhir</strong>.</p>
                    </div>
                    
                    <div className="bg-white border-2 border-dashed border-gray-300 p-6 flex flex-col items-center justify-center rounded-xl">
                      <span className="text-4xl mb-2">📱</span>
                      <p className="text-sm font-medium text-center">Scan QRIS Statis Disini</p>
                    </div>

                    <form className="space-y-3" onSubmit={handleCheckout}>
                      <input type="text" placeholder="Nama Lengkap" className="w-full border p-3 rounded-xl text-sm" required />
                      <input type="tel" placeholder="Nomor WhatsApp" className="w-full border p-3 rounded-xl text-sm" required />
                      <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold transition-colors">
                        Konfirmasi Pesanan
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}