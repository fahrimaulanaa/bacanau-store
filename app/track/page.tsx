"use client";

import React, { useState, Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase'; // Sesuaikan path jika letak folder berbeda
import Link from 'next/link';

function TrackContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const urlId = searchParams.get('id') || '';

    const [orderId, setOrderId] = useState<string>(urlId);
    const [orderData, setOrderData] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string>('');

    const fetchOrder = async (idToFetch: string) => {
        if (!idToFetch) return;
        setLoading(true);
        setErrorMsg('');
        try {
            const docRef = doc(db, "orders", idToFetch);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                setOrderData({ id: docSnap.id, ...docSnap.data() });
            } else {
                setOrderData(null);
                setErrorMsg("Pesanan tidak ditemukan. Pastikan ID Pesanan benar.");
            }
        } catch (error) {
            setErrorMsg("Gagal terhubung ke server.");
        } finally {
            setLoading(false);
        }
    };

    // Auto-fetch jika ada ID di URL
    useEffect(() => {
        if (urlId) {
            fetchOrder(urlId);
        }
    }, [urlId]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        router.push(`?id=${orderId}`);
    };

    const handleCopyId = () => {
        navigator.clipboard.writeText(orderData?.id || '');
        alert('ID Pesanan disalin!');
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '-';
        const date = new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans pb-24">
            {/* HEADER */}
            <div className="bg-white px-4 py-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
                <Link href="/" className="text-slate-600 hover:text-slate-900">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                </Link>
                <h1 className="text-lg font-bold text-slate-800">Rincian Pesananmu</h1>
            </div>

            <div className="max-w-md mx-auto pt-6 px-4">
                {/* JIKA DATA BELUM ADA / FORM PENCARIAN */}
                {!orderData ? (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h2 className="font-bold text-slate-800 mb-4 text-center">Lacak Pesanan Bacanau</h2>
                        <form onSubmit={handleSearch} className="space-y-4">
                            <input 
                                type="text" 
                                placeholder="Masukkan ID Pesanan (Contoh: XyZ123...)" 
                                className="w-full border border-slate-300 p-3.5 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 outline-none"
                                value={orderId}
                                onChange={(e) => setOrderId(e.target.value)}
                                required
                            />
                            <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold transition-colors hover:bg-slate-800">
                                {loading ? 'Mencari...' : 'Cari Pesanan'}
                            </button>
                        </form>
                        {errorMsg && <p className="text-red-500 text-xs font-bold text-center mt-4 bg-red-50 p-2 rounded-lg">{errorMsg}</p>}
                    </div>
                ) : (
                    /* TAMPILAN RINCIAN PESANAN (STYLE SHOPEE) */
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        
                        {/* KARTU 1: RINCIAN BARANG */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                            <h2 className="font-bold text-slate-800 mb-4">Rincian Pesanan</h2>
                            
                            {/* List Item */}
                            <div className="space-y-4 mb-4">
                                {orderData.items?.map((item: any, index: number) => (
                                    <div key={index} className="flex gap-3">
                                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-xl flex-shrink-0">
                                            📦
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-slate-800 leading-tight">{item.quantity} x {item.name}</p>
                                        </div>
                                        <div className="text-sm font-bold text-slate-800">
                                            Rp {(Number(item.price) * item.quantity).toLocaleString('id-ID')}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <hr className="border-dashed border-slate-300 my-4" />

                            {/* Kalkulasi */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Subtotal Pesanan</span>
                                    <span className="text-slate-800 font-medium">Rp {Number(orderData.basePayment || 0).toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Kode Unik Sistem</span>
                                    <span className="text-emerald-600 font-medium">+ Rp {orderData.uniqueCode || 0}</span>
                                </div>
                            </div>

                            <hr className="border-slate-100 my-4" />

                            {/* Total Transfer dengan Stamp */}
                            <div className="flex justify-between items-center relative">
                                {orderData.status === 'Selesai (Lunas)' && (
                                    <div className="absolute left-0 -top-2 border-2 border-emerald-500 text-emerald-500 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded opacity-60 rotate-[-10deg]">
                                        PAID / LUNAS
                                    </div>
                                )}
                                <div></div> {/* Spacer */}
                                <div className="text-right">
                                    <p className="text-xl font-black text-slate-900">Rp {Number(orderData.totalPayment).toLocaleString('id-ID')}</p>
                                    <p className="text-[10px] text-slate-400">Termasuk kode unik</p>
                                </div>
                            </div>
                        </div>

                        {/* KARTU 2: INFORMASI PESANAN */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                            <h2 className="font-bold text-slate-800 mb-4">Informasi Pesanan</h2>
                            
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500 w-1/3">Status Pesanan</span>
                                    <span className={`font-bold text-right ${orderData.status === 'Selesai (Lunas)' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {orderData.status}
                                    </span>
                                </div>
                                <div className="flex justify-between items-start">
                                    <span className="text-slate-500 w-1/3">No. Pesanan</span>
                                    <div className="flex items-center gap-2 text-right">
                                        <span className="text-slate-800 font-mono text-xs">{orderData.id}</span>
                                        <button onClick={handleCopyId} className="text-indigo-600 font-bold text-xs uppercase hover:underline">Salin</button>
                                    </div>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500 w-1/3">Nama Pembeli</span>
                                    <span className="text-slate-800 text-right">{orderData.customerName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500 w-1/3">Domisili</span>
                                    <span className="text-slate-800 text-right">{orderData.domicile}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500 w-1/3">Waktu Dibuat</span>
                                    <span className="text-slate-800 text-right">{formatDate(orderData.createdAt)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500 w-1/3">Pembayaran</span>
                                    <span className="text-slate-800 text-right">{orderData.paymentMethod || 'QRIS'}</span>
                                </div>
                            </div>
                        </div>

                    </div>
                )}
            </div>

            {/* STICKY BOTTOM BUTTONS (Muncul jika ada data) */}
            {orderData && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-20">
                    <div className="max-w-md mx-auto flex gap-3">
                        <button 
                            onClick={() => fetchOrder(orderData.id)}
                            className="flex-1 bg-white border border-slate-300 text-slate-700 font-bold py-3.5 rounded-xl text-sm transition-colors hover:bg-slate-50"
                        >
                            {loading ? 'Me-refresh...' : 'Refresh Status'}
                        </button>
                        <Link 
                            href="/" 
                            className="flex-1 bg-slate-900 text-white font-bold py-3.5 rounded-xl text-sm text-center transition-colors hover:bg-slate-800"
                        >
                            Menu Utama
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function TrackPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-100 flex items-center justify-center"><p className="animate-pulse font-medium text-slate-500">Memuat modul pelacakan...</p></div>}>
            <TrackContent />
        </Suspense>
    );
}