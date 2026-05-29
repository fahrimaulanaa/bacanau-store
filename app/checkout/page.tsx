"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Link from 'next/link';
import { Toaster, toast } from 'react-hot-toast'; // Import Toast

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
    const [customerEmail, setCustomerEmail] = useState('');
    const [contactInfo, setContactInfo] = useState('');
    const [domicile, setDomicile] = useState('');
    
    // State BARU: Metode Pembayaran (Default QRIS)
    const [paymentMethod, setPaymentMethod] = useState('QRIS');
    
    const [uniqueCode, setUniqueCode] = useState<number>(0);
    const [voucherCode, setVoucherCode] = useState<string>('');
    const [appliedVoucher, setAppliedVoucher] = useState<{ code: string; amount: number } | null>(null);
    const [isApplyingVoucher, setIsApplyingVoucher] = useState<boolean>(false);

    useEffect(() => {
        setMounted(true);
        const savedCart = localStorage.getItem('cart');
        if (savedCart) setCart(JSON.parse(savedCart));
        setUniqueCode(Math.floor(Math.random() * 10) + 1);
    }, []);

    const parsePrice = (price: any) => {
        if (typeof price === 'number') return price;
        if (typeof price === 'string') return Number(price.replace(/[^0-9]/g, ''));
        return 0;
    };

    const baseTotal = cart.reduce((sum, item) => sum + (parsePrice(item.price) * (Number(item.quantity) || 1)), 0);
    const voucherDiscount = Math.min(appliedVoucher?.amount ?? 0, baseTotal);
    const totalPay = Math.max(baseTotal - voucherDiscount, 0) + uniqueCode;

    const handleApplyVoucher = async () => {
        const normalizedCode = voucherCode.trim().toUpperCase();
        if (!normalizedCode) {
            toast.error("Masukkan kode voucher terlebih dahulu.");
            return;
        }

        setIsApplyingVoucher(true);
        const loadingToast = toast.loading("Memeriksa voucher...");

        try {
            const response = await fetch('/api/vouchers/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: normalizedCode }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.message || 'Voucher tidak valid.');
            }

            const data = await response.json();
            const amount = Number(data.amount) || 0;
            if (!Number.isFinite(amount) || amount <= 0) {
                throw new Error('Voucher tidak valid.');
            }

            setAppliedVoucher({ code: data.code || normalizedCode, amount });
            toast.success(`Voucher diterapkan: -Rp ${Math.min(amount, baseTotal).toLocaleString('id-ID')}`, { id: loadingToast });
        } catch (error) {
            setAppliedVoucher(null);
            toast.error(error instanceof Error ? error.message : "Voucher tidak valid.", { id: loadingToast });
        } finally {
            setIsApplyingVoucher(false);
        }
    };

    const handleRemoveVoucher = () => {
        setAppliedVoucher(null);
    };

    const handleSubmitOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (cart.length === 0) return toast.error("Keranjang belanja kosong!");
        if (!customerName || !contactInfo || !domicile) return toast.error("Lengkapi semua form!");

        setIsSubmitting(true);
        const loadingToast = toast.loading("Memproses pesanan...");

        try {
            const docRef = await addDoc(collection(db, "orders"), {
                customerName, 
                customerEmail, 
                contactInfo, 
                domicile, 
                paymentMethod, // Simpan metode pembayaran ke Database
                items: cart,
                basePayment: baseTotal, 
                uniqueCode, 
                voucherCode: appliedVoucher?.code || '',
                voucherAmount: voucherDiscount,
                totalPayment: totalPay,
                status: "Menunggu Pembayaran", 
                createdAt: serverTimestamp()
            });

            localStorage.removeItem('cart');
            toast.success("Pesanan berhasil dibuat!", { id: loadingToast });
            router.push(`/checkout/pay?id=${docRef.id}`);
        } catch (error) {
            toast.error("Gagal memproses pesanan.", { id: loadingToast });
            setIsSubmitting(false);
        }
    };

    if (!mounted) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="animate-pulse">Loading...</p></div>;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans py-12 px-4">
            <Toaster position="top-center" />
            <div className="max-w-4xl mx-auto">
                <Link href="/" className="text-sm font-bold text-slate-500 hover:text-slate-900 mb-6 inline-block">← Kembali Belanja</Link>
                <h1 className="text-3xl font-black tracking-tight mb-8">CHECKOUT PESANAN</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* KOLOM KIRI: Ringkasan Barang & Metode Pembayaran */}
                    <div className="space-y-6 md:sticky md:top-24 md:h-fit">
                        
                        {/* 1. Ringkasan Barang */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                            <h2 className="text-lg font-bold mb-4 border-b pb-4">Ringkasan Barang</h2>
                            {cart.length === 0 ? <p className="text-slate-500 text-sm py-4">Kosong.</p> : (
                                <ul className="space-y-4 mb-6">
                                    {cart.map((item, index) => (
                                        <li key={index} className="flex justify-between items-start pb-4 border-b border-slate-50">
                                            <div><p className="font-semibold text-sm">{item.name}</p><p className="text-xs text-slate-500">{item.quantity}x</p></div>
                                            <p className="font-bold text-sm text-slate-900">Rp {(parsePrice(item.price) * item.quantity).toLocaleString('id-ID')}</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="space-y-2 mb-4">
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal:</span><span className="font-bold text-slate-700">Rp {baseTotal.toLocaleString('id-ID')}</span></div>
                                {voucherDiscount > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Voucher {appliedVoucher?.code ? `(${appliedVoucher.code})` : ''}:</span>
                                        <span className="font-bold text-amber-600">- Rp {voucherDiscount.toLocaleString('id-ID')}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Kode Unik:</span><span className="font-bold text-emerald-600">+ Rp {uniqueCode}</span></div>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 mb-4">
                                <label className="block text-xs font-bold text-slate-700 mb-2">Kode Voucher <span className="text-slate-400 font-semibold">(Jika ada)</span></label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="flex-1 border border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 outline-none uppercase"
                                        placeholder="Contoh: BACANAU10"
                                        value={voucherCode}
                                        onChange={(e) => setVoucherCode(e.target.value)}
                                        disabled={isApplyingVoucher}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleApplyVoucher}
                                        disabled={isApplyingVoucher}
                                        className="bg-slate-900 text-white px-4 rounded-xl text-xs font-bold uppercase disabled:bg-slate-400"
                                    >
                                        {isApplyingVoucher ? 'Cek...' : 'Terapkan'}
                                    </button>
                                </div>
                                {appliedVoucher && (
                                    <div className="mt-3 flex items-center justify-between text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-xl px-3 py-2">
                                        <span>Voucher aktif: <strong>{appliedVoucher.code}</strong></span>
                                        <button type="button" onClick={handleRemoveVoucher} className="text-[10px] font-bold uppercase text-amber-700 hover:text-amber-900">
                                            Hapus
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between items-center pt-4 border-t"><span className="font-bold text-slate-800">Total Akhir</span><span className="text-2xl font-black text-slate-900">Rp {totalPay.toLocaleString('id-ID')}</span></div>
                        </div>

                        {/* 2. Metode Pembayaran (Tambahan Baru) */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                            <h2 className="text-lg font-bold mb-4 border-b pb-4">Metode Pembayaran</h2>
                            <div className="space-y-3">
                                
                                {/* Opsi 1: QRIS */}
                                <label className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === 'QRIS' ? 'border-red-500 bg-red-50/30 ring-1 ring-red-500' : 'border-slate-200 hover:border-slate-300'}`}>
                                    <div className="flex items-center gap-3">
                                        <input type="radio" name="payment" value="QRIS" checked={paymentMethod === 'QRIS'} onChange={(e) => setPaymentMethod(e.target.value)} className="w-4 h-4 text-red-500 focus:ring-red-500" />
                                        <span className="font-bold text-slate-800 text-sm">QRIS (Otomatis)</span>
                                    </div>
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/a/a2/Logo_QRIS.svg" alt="QRIS" className="h-5 object-contain" />
                                </label>

                                {/* Opsi 2: Transfer BCA */}
                                <label className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === 'BCA' ? 'border-blue-500 bg-blue-50/30 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'}`}>
                                    <div className="flex items-center gap-3">
                                        <input type="radio" name="payment" value="BCA" checked={paymentMethod === 'BCA'} onChange={(e) => setPaymentMethod(e.target.value)} className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                                        <span className="font-bold text-slate-800 text-sm">Transfer BCA</span>
                                    </div>
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/5/5c/Bank_Central_Asia.svg" alt="BCA" className="h-4 object-contain" />
                                </label>

                                {/* Opsi 3: E-Wallet */}
                                <label className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === 'E-WALLET' ? 'border-sky-500 bg-sky-50/30 ring-1 ring-sky-500' : 'border-slate-200 hover:border-slate-300'}`}>
                                    <div className="flex items-center gap-3">
                                        <input type="radio" name="payment" value="E-WALLET" checked={paymentMethod === 'E-WALLET'} onChange={(e) => setPaymentMethod(e.target.value)} className="w-4 h-4 text-sky-500 focus:ring-sky-500" />
                                        <div>
                                            <span className="font-bold text-slate-800 text-sm block">E-Wallet</span>
                                            <span className="text-[10px] text-slate-500 font-medium mt-0.5 block">GoPay, DANA, ShopeePay</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/8/86/Gopay_logo.svg" alt="GoPay" className="h-3 object-contain" />
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/7/72/Logo_dana_blue.svg" alt="DANA" className="h-3 object-contain" />
                                    </div>
                                </label>

                            </div>
                        </div>

                    </div>

                    {/* KOLOM KANAN: Formulir Pembeli */}
                    <div>
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                            <h2 className="text-lg font-bold mb-6 border-b pb-4">Formulir Pembeli</h2>
                            <form onSubmit={handleSubmitOrder} className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-2">Nama</label>
                                    <input 
                                        type="text" 
                                        className="w-full border border-slate-200 p-3.5 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 outline-none transition-shadow" 
                                        placeholder="Masukkan nama lengkap" 
                                        value={customerName} 
                                        onChange={(e) => setCustomerName(e.target.value)} 
                                        required 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-2">Email Aktif (Untuk Resi) <span className="text-slate-400 font-semibold">(Opsional)</span></label>
                                    <input 
                                        type="email" 
                                        className="w-full border border-slate-200 p-3.5 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 outline-none transition-shadow" 
                                        placeholder="Contoh: bacanau@gmail.com" 
                                        value={customerEmail} 
                                        onChange={(e) => setCustomerEmail(e.target.value)} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-2">No. WA</label>
                                    <input 
                                        type="text" 
                                        className="w-full border border-slate-200 p-3.5 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 outline-none transition-shadow" 
                                        placeholder="Contoh: 081234567890" 
                                        value={contactInfo} 
                                        onChange={(e) => setContactInfo(e.target.value)} 
                                        required 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-2">Domisili Kampus</label>
                                    <select className="w-full border border-slate-200 p-3.5 rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-900 outline-none cursor-pointer" value={domicile} onChange={(e) => setDomicile(e.target.value)} required>
                                        <option value="" disabled>Pilih Domisili</option>
                                        <option value="Jatinangor">ITB Jatinangor</option>
                                        <option value="Ganesha">ITB Ganesha</option>
                                    </select>
                                </div>
                                <button type="submit" disabled={isSubmitting || cart.length === 0} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold transition-colors hover:bg-slate-800 disabled:bg-slate-400 mt-2">
                                    {isSubmitting ? 'Memproses...' : 'Lanjut Pembayaran'}
                                </button>
                            </form>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}