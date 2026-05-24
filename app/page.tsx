"use client";

import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Link from 'next/link';

interface Product {
  id: string;
  name: string;
  price: number;
  img: string;
}

interface CartItem extends Product {
  quantity: number;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  // 1. Ambil produk dari Firestore & Load cart dari localStorage saat pertama kali dimuat
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "products"));
        const dataItems = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            // Menyesuaikan nama field di Firestore kamu (misal: nama_produk, harga_produk)
            name: data.name || data.nama_produk || data.nama,
            // Wajib dibungkus Number() untuk mengubah string menjadi angka bersih
            price: Number(data.price || data.harga_produk || data.harga || 0),
            img: data.img || data.url_gambar || data.gambar,
          };
        }) as Product[];

        setProducts(dataItems);
      } catch (error) {
        console.error("Error fetching products: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();

    // Load cart dari localStorage jika ada
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-black tracking-tighter text-slate-900">MAUL STORE</h1>
          <button onClick={() => setIsCartOpen(!isCartOpen)} className="relative p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition">
            🛒 <span className="hidden sm:inline font-medium ml-1">Cart</span>
            {totalItemsInCart > 0 && (
              <span className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {totalItemsInCart}
              </span>
            )}
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <p className="text-gray-500 font-medium animate-pulse">Memuat produk dari database...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex justify-center items-center h-64">
            <p className="text-gray-500 font-medium">Belum ada produk di database.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {products.map((item) => (
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
        )}
      </main>

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