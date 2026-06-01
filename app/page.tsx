"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Link from 'next/link';
import { resolveCostPrice } from '../lib/product-cost';

interface Product {
  id: string;
  name: string;
  price: number;
  costPrice?: number;
  img: string;
  category?: string;
  isActive?: boolean;
}

interface CartItem extends Product {
  quantity: number;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    const savedCart = localStorage.getItem('cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [cartBump, setCartBump] = useState<boolean>(false);
  const [showPreorderNotification, setShowPreorderNotification] = useState<boolean>(true);

  // 1. REAL-TIME LISTENER: Ambil produk dari Firestore secara Live
  useEffect(() => {
    // onSnapshot akan terus memantau perubahan data (seperti saat admin klik suspend)
    const unsubscribe = onSnapshot(collection(db, "products"), (querySnapshot) => {
      const dataItems = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || data.nama_produk || data.nama,
          price: Number(data.price || data.harga_produk || data.harga || 0),
          costPrice: resolveCostPrice({ name: data.name || data.nama_produk || data.nama, costPrice: data.costPrice }),
          img: data.img || data.url_gambar || data.gambar,
          category: data.category || data.kategori || 'Makanan',
          isActive: data.isActive !== undefined ? data.isActive : true, 
        };
      }) as Product[];

      // FILTER: Hanya tampilkan produk yang aktif (tidak di-suspend)
      const activeProducts = dataItems.filter(item => item.isActive !== false);

      setProducts(activeProducts);
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    // Bersihkan listener saat halaman ditutup
    return () => unsubscribe();
  }, []);

  // 2. Simpan cart ke localStorage setiap kali ada perubahan data cart
  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem('cart', JSON.stringify(cart));
    } else {
      localStorage.removeItem('cart');
    }
  }, [cart]);

  const addToCart = (product: Product) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
    
    // Animasi popping ketika user klik tambah produk:
    setCartBump(true);
    setTimeout(() => setCartBump(false), 300); // Animasi berhenti setelah 0.3 detik
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.id === id) {
          return { ...item, quantity: item.quantity + delta };
        }
        return item;
      }).filter((item) => item.quantity > 0);
    });
  };

  const subTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalItemsInCart = cart.reduce((total, item) => total + item.quantity, 0);
  const productsByCategory = useMemo(() => {
    const grouped = new Map<string, Product[]>();

    products.forEach((product) => {
      const category = product.category || 'Makanan';
      grouped.set(category, [...(grouped.get(category) || []), product]);
    });

    return Array.from(grouped.entries()).map(([category, items]) => ({ category, items }));
  }, [products]);
  
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      {showPreorderNotification && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl">
            <div className="p-6 sm:p-8">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <span className="text-2xl font-black">!</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreorderNotification(false)}
                  aria-label="Tutup notifikasi pre-order"
                  className="rounded-full px-2 py-1 text-3xl leading-none text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  &times;
                </button>
              </div>

              <p className="text-center text-sm font-black uppercase tracking-wide text-amber-600">Info Pre-order</p>
              <h2 className="mt-2 text-center text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Pre-order Bacanau Store
              </h2>
              <p className="mt-4 text-center text-base leading-7 text-slate-600">
                Pre-order dibuka mulai tanggal <strong>29 Mei</strong> hingga <strong>02 Juni 2026</strong>. Pengiriman pesanan
                ke vendor dimulai <strong>2 Juni 2026 pukul 13:00 WIB</strong>.
                Pengambilan atau pengiriman diperkirakan pada tanggal <strong>4 - 5 Juni 2026</strong>.
              </p>
            </div>
            <div className="border-t border-slate-100 p-6 sm:p-8">
              <button
                type="button"
                onClick={() => setShowPreorderNotification(false)}
                className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black uppercase tracking-wide text-white transition-colors hover:bg-amber-600"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="glasshour-navbar sticky top-0 z-50 backdrop-blur-xl backdrop-saturate-150">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-black tracking-tighter text-slate-950 drop-shadow-sm">BACANAU 25 STORE</h1>
          
          <div className="flex items-center gap-3">
            {/* Tombol Search Buka Tab Baru */}
            <Link 
                href="/track" 
                rel="noopener noreferrer"
                className="border border-white/60 bg-white/55 hover:bg-white/80 text-slate-700 px-3 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm backdrop-blur-md flex items-center gap-2"
            >
                <span>🔍</span> <span className="hidden sm:inline">Cari Pesanan</span>
            </Link>

            {/* Tombol Keranjang dengan Animasi */}
            <button 
                onClick={() => setIsCartOpen(!isCartOpen)} 
                className={`relative hidden sm:flex bg-slate-950/90 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-bold items-center gap-2 transition-all duration-300 shadow-lg shadow-slate-900/20 backdrop-blur-md ${cartBump ? 'scale-110 bg-indigo-600 shadow-lg' : ''}`}
            >
                <span>🛒</span> <span className="hidden sm:inline">Keranjang</span>
                {totalItemsInCart > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white">
                    {totalItemsInCart}
                  </span>
                )}
            </button>
          </div>

        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-28 sm:pb-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <p className="text-gray-500 font-medium animate-pulse">Memuat produk dari database...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex justify-center items-center h-64">
            <p className="text-gray-500 font-medium">Belum ada produk aktif di database.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {productsByCategory.map(({ category, items }) => (
              <section key={category}>
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="text-xl font-black tracking-tight text-slate-950">{category}</h2>
                  <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">{items.length} produk</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                  {items.map((item) => (
                    <div key={item.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-300">
                      <img src={item.img} alt={item.name} className="w-full h-48 sm:h-64 object-cover" />
                      <div className="p-4 sm:p-5">
                        <h3 className="font-semibold text-sm sm:text-base mb-1 truncate">{item.name}</h3>
                        <p className="text-slate-600 text-sm mb-4">Rp {item.price.toLocaleString('id-ID')}</p>
                        <button onClick={() => addToCart(item)} className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2 rounded-xl text-sm font-medium transition-colors">
                          Tambah
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {totalItemsInCart > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:hidden">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className={`w-full rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-2xl shadow-slate-950/30 transition-all duration-300 ${cartBump ? 'scale-[1.03] bg-indigo-600' : ''}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
                  <span>ðŸ›’</span>
                </div>
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm font-black">{totalItemsInCart} item di keranjang</p>
                  <p className="text-xs font-medium text-white/70">Cek pesanan sebelum checkout</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/60">Subtotal</p>
                <p className="text-sm font-black">Rp {subTotal.toLocaleString('id-ID')}</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Cart Sidebar */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
          <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col">
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
                    <li key={index} className="flex flex-col bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <span className="font-semibold text-sm pr-4 text-slate-800">{item.name}</span>
                        <span className="text-sm font-bold text-slate-900 whitespace-nowrap">
                          Rp {(item.price * item.quantity).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">Rp {item.price.toLocaleString('id-ID')} / item</span>
                        <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                          <button onClick={() => updateQuantity(item.id, -1)} className="px-3 py-1 bg-slate-50 hover:bg-slate-200 text-slate-700 font-bold">-</button>
                          <span className="px-3 py-1 text-sm font-bold text-center min-w-[32px] bg-white">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, 1)} className="px-3 py-1 bg-slate-50 hover:bg-slate-200 text-slate-700 font-bold">+</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-5 border-t bg-gray-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <div className="flex justify-between mb-4 font-bold text-lg">
                  <span>Subtotal:</span>
                  <span>Rp {subTotal.toLocaleString('id-ID')}</span>
                </div>
                {/* Link navigasi ke halaman terpisah /checkout */}
                <Link href="/checkout" className="block text-center w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold transition-colors">
                  Lanjut ke Checkout
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
