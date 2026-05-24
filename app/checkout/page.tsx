"use client";

import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; // Import router Next.js

interface CartItem {
    id: string;
    name: string;
    price: any;
    img: string;
    quantity: number;
}

export default function CheckoutPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState<boolean>(false);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [buyerName, setBuyerName] = useState<string>('');
    const [buyerContact, setBuyerContact] = useState<string>('');
    const [buyerDomicile, setBuyerDomicile] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    useEffect(() => {
        setMounted(true);
        const savedCart = localStorage.getItem('cart');
        if (savedCart) {
            try {
                setCart(JSON.parse(savedCart));
            } catch (e) {
                setCart([]);
            }
        }
    }, []);

    const parsePrice = (priceVal: any) => {
        if (!priceVal) return 0;
        const cleanString = String(priceVal).replace(/[^0-9]/g, '');
        return Number(cleanString) || 0;
    };

    const totalPay = cart.reduce((sum, item) => {
        return sum + (parsePrice(item.price) * (Number(item.quantity) || 1));
    }, 0);

    const handlePlaceOrder = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (cart.length === 0) return;
        if (!buyerDomicile) {
            alert("Mohon pilih domisili kampus Anda.");
            return;
        }
        setIsSubmitting(true);

        try {
            // 1. Simpan dokumen pesanan ke Firestore
            const docRef = await addDoc(collection(db, "orders"), {
                customerName: buyerName,
                contactInfo: buyerContact,
                domicile: buyerDomicile,
                items: cart.map(item => ({
                    id: item.id,
                    name: item.name,
                    price: parsePrice(item.price),
                    quantity: Number(item.quantity) || 1
                })),
                totalPayment: totalPay,
                status: "Menunggu Pembayaran",
                createdAt: serverTimestamp()
            });

            // 2. Hapus keranjang setelah sukses tersimpan
            localStorage.removeItem('cart');

            // 3. Alihkan user ke halaman /checkout/pay sambil membawa orderId dan total secara aman
// SESUDAHNYA: Hanya oper ID pesanan saja
router.push(`/checkout/pay?id=${docRef.id}`);
        } catch (error) {
            console.error("Error saving order: ", error);
            alert("Gagal memproses pesanan. Silakan coba lagi.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!mounted) {
        return (
            <div className="min-h-screen bg-gray-50 flex justify-center items-center">
                <p className="text-gray-500 font-medium animate-pulse">Menyiapkan form checkout...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 text-gray-800 font-sans py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="mb-6">
                    <Link href="/" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                        ← Kembali Belanja
                    </Link>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 mt-2">CHECKOUT PESANAN</h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Ringkasan Keranjang */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-fit">
                        <h2 className="text-lg font-bold mb-4 text-slate-900">Ringkasan Barang</h2>
                        {cart.length === 0 ? (
                            <p className="text-gray-500 text-sm">Tidak ada barang untuk di-checkout.</p>
                        ) : (
                            <div className="space-y-4">
                                <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                                    {cart.map((item) => {
                                        const safePrice = parsePrice(item.price);
                                        const safeQty = Number(item.quantity) || 1;
                                        return (
                                            <div key={item.id} className="flex justify-between text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <div>
                                                    <p className="font-semibold text-slate-800">{item.name}</p>
                                                    <p className="text-xs text-slate-500">{safeQty}x @ Rp {safePrice.toLocaleString('id-ID')}</p>
                                                </div>
                                                <span className="font-bold text-slate-950 my-auto">
                                                    Rp {(safePrice * safeQty).toLocaleString('id-ID')}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="border-t pt-3">
                                    <div className="flex justify-between font-black text-lg text-slate-900">
                                        <span>Total Bayar</span>
                                        <span>Rp {totalPay.toLocaleString('id-ID')}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Form Input Pengguna */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-fit">
                        <h2 className="text-lg font-bold mb-4 text-slate-900">Formulir Pembeli</h2>
                        <form className="space-y-4" onSubmit={handlePlaceOrder}>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nama</label>
                                <input
                                    type="text"
                                    placeholder="Masukkan nama lengkap"
                                    className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                                    value={buyerName}
                                    onChange={(e) => setBuyerName(e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nomor Handphone / ID Line</label>
                                <input
                                    type="text"
                                    placeholder="Contoh: 0812xxx / id_line"
                                    className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                                    value={buyerContact}
                                    onChange={(e) => setBuyerContact(e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Domisili Kampus</label>
                                <select
                                    className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                                    value={buyerDomicile}
                                    onChange={(e) => setBuyerDomicile(e.target.value)}
                                    required
                                >
                                    <option value="">-- Pilih Domisili Kampus --</option>
                                    <option value="Bandung">Bandung</option>
                                    <option value="Jatinangor">Jatinangor</option>
                                </select>
                            </div>
                            <button
                                type="submit"
                                disabled={isSubmitting || cart.length === 0}
                                className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white py-3 rounded-xl font-bold transition-colors mt-2"
                            >
                                {isSubmitting ? 'Memproses Pesanan...' : 'Konfirmasi & Buat Pesanan'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}