/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, Suspense, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase'; // Sesuaikan path jika letak folder berbeda
import Link from 'next/link';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Toaster, toast } from 'react-hot-toast';
import Image from 'next/image';

function TrackContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const urlId = searchParams.get('id') || '';

    const [orderId, setOrderId] = useState<string>(urlId);
    const [orderData, setOrderData] = useState<any>(null);
    const [searchResults, setSearchResults] = useState<any[] | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [qrisImage, setQrisImage] = useState<string>('');
    const [isGeneratingQris, setIsGeneratingQris] = useState<boolean>(false);
    const [qrisError, setQrisError] = useState<boolean>(false);

    const normalizePhone = (raw: string) => {
        if (!raw) return raw;
        const digits = raw.replace(/\D/g, '');
        if (digits.startsWith('0')) return '62' + digits.substring(1);
        if (digits.startsWith('62')) return digits;
        return digits;
    };

    const fetchOrder = useCallback(async (idToFetch: string) => {
        if (!idToFetch) return;
        setLoading(true);
        setErrorMsg('');
        setSearchResults(null);
        try {
            // 1) Coba treat input sebagai ID dokumen
            const docRef = doc(db, "orders", idToFetch);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                setOrderData({ id: docSnap.id, ...docSnap.data() });
                return;
            }

            // 2) Jika bukan ID, coba query berdasarkan email atau nomor HP
            // Deteksi email
            if (idToFetch.includes('@')) {
                const q = query(collection(db, 'orders'), where('customerEmail', '==', idToFetch));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    if (snap.size === 1) {
                        const d = snap.docs[0];
                        setOrderData({ id: d.id, ...d.data() });
                        return;
                    }
                    setSearchResults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    return;
                }
            }

            // 3) Coba nomor telepon (sederhana: cari exact match di contactInfo)
            const phoneCandidates = [idToFetch];
            // juga coba konversi 08xxx -> 628xx
            const cleaned = idToFetch.replace(/\D/g, '');
            if (cleaned.startsWith('08')) phoneCandidates.push('62' + cleaned.substring(1));
            if (cleaned.startsWith('628')) phoneCandidates.push('0' + cleaned.substring(2));

            for (const candidate of phoneCandidates) {
                const normalized = normalizePhone(candidate);
                // try both raw and normalized forms
                const q2 = query(collection(db, 'orders'), where('contactInfo', 'in', [candidate, normalized]));
                const snap2 = await getDocs(q2);
                if (!snap2.empty) {
                    if (snap2.size === 1) {
                        const d = snap2.docs[0];
                        setOrderData({ id: d.id, ...d.data() });
                        return;
                    }
                    setSearchResults(snap2.docs.map(d => ({ id: d.id, ...d.data() })));
                    return;
                }
            }
            setOrderData(null);
            setErrorMsg("Pesanan tidak ditemukan. Pastikan ID / Email / Nomor WA benar.");
        } catch {
            setErrorMsg("Gagal terhubung ke server.");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchDynamicQris = async (amount: number) => {
        setIsGeneratingQris(true);
        setQrisError(false);
        try {
            const staticQris = "00020101021126570011ID.DANA.WWW011893600915300024307302090002430730303UMI51440014ID.CO.QRIS.WWW0215ID10254666263850303UMI5204549953033605802ID5914Puding Hambali600412026105612566304027C";
            const res = await fetch('/api/qris', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: amount.toString(), qris_statis: staticQris })
            });
            const data = await res.json();
            if (data.status === 'success' && data.qris_base64) {
                const base64Str = data.qris_base64.startsWith('data:image') ? data.qris_base64 : `data:image/png;base64,${data.qris_base64}`;
                setQrisImage(base64Str);
            } else {
                setQrisError(true);
            }
        } catch {
            setQrisError(true);
        } finally {
            setIsGeneratingQris(false);
        }
    };

    const handleDownloadQris = () => {
        if (!qrisImage) return toast.error('QRIS belum siap diunduh');
        const a = document.createElement('a'); a.href = qrisImage; a.download = `QRIS_${orderData?.id || 'pembayaran'}.png`; document.body.appendChild(a); a.click(); a.remove();
        toast.success('QRIS diunduh');
    };

    const handleDownloadInvoicePDF = () => {
        try {
            const docPdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const orderIdLocal = orderData?.id || 'unknown';
            const buyerName = orderData?.customerName || '-';
            const buyerContact = orderData?.contactInfo || '-';
            const buyerDomicile = orderData?.domicile || '-';
            const items = orderData?.items || [];
            const totalPay = Number(orderData?.totalPayment) || 0;
            const calculatedBaseTotal = items.reduce((s: number, it: any) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
            const storedBasePayment = Number(orderData?.basePayment);
            const baseTotal = Number.isFinite(storedBasePayment) && storedBasePayment > 0 ? storedBasePayment : calculatedBaseTotal;
            const voucherAmount = Number(orderData?.voucherAmount) || 0;
            const voucherCode = orderData?.voucherCode || '';
            const storedUniqueCode = Number(orderData?.uniqueCode);
            const uniqueCode = Number.isFinite(storedUniqueCode) && storedUniqueCode > 0
                ? storedUniqueCode
                : totalPay - baseTotal + voucherAmount;

            docPdf.setFontSize(18); docPdf.text('BACANAU STORE', 14, 20);
            docPdf.setFontSize(12); docPdf.text(`Invoice ID: ${orderIdLocal}`, 14, 28);
            docPdf.setFontSize(10); docPdf.text(`Nama: ${buyerName}`, 14, 36);
            docPdf.text(`Kontak: ${buyerContact}`, 14, 42);
            docPdf.text(`Domisili: ${buyerDomicile}`, 14, 48);

            const tableRows = items.map((it: any, idx: number) => [idx + 1, it.name, `Rp ${Number(it.price).toLocaleString('id-ID')}`, it.quantity, `Rp ${(Number(it.price) * Number(it.quantity)).toLocaleString('id-ID')}`]);
            if (voucherAmount > 0) {
                tableRows.push(['', `Voucher ${voucherCode ? `(${voucherCode})` : ''}`, '-', '-', `- Rp ${voucherAmount.toLocaleString('id-ID')}`]);
            }
            if (uniqueCode > 0) tableRows.push(['', 'Kode Unik Sistem', '-', '-', `Rp ${uniqueCode}`]);

            autoTable(docPdf, {
                startY: 60,
                head: [['No', 'Item', 'Harga Satuan', 'Qty', 'Total']],
                body: tableRows,
                theme: 'striped',
            });

            const finalY = (docPdf as any).lastAutoTable ? (docPdf as any).lastAutoTable.finalY + 10 : 120;
            docPdf.setFontSize(12); docPdf.text(`Total Bayar: Rp ${totalPay.toLocaleString('id-ID')}`, 14, finalY + 6);
            docPdf.save(`Bacanau_Invoice_${orderIdLocal}.pdf`);
            toast.success('Invoice berhasil diunduh');
        } catch {
            toast.error('Gagal membuat file PDF');
        }
    };

    // Auto-fetch jika ada ID di URL
    useEffect(() => {
        if (urlId) {
            // schedule to avoid synchronous setState in effect
            const t = setTimeout(() => fetchOrder(urlId), 0);
            return () => clearTimeout(t);
        }
    }, [urlId, fetchOrder]);

    // generate QRIS jika order ditemukan dan status menunggu
    useEffect(() => {
        if (orderData && orderData.status === 'Menunggu Pembayaran') {
            const amount = Number(orderData.totalPayment) || 0;
            if (amount > 0) {
                const t = setTimeout(() => fetchDynamicQris(amount), 0);
                return () => clearTimeout(t);
            }
        } else {
            const t = setTimeout(() => setQrisImage(''), 0);
            return () => clearTimeout(t);
        }
    }, [orderData]);

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

    const resolvedBasePayment = orderData
        ? (() => {
            const storedBase = Number(orderData.basePayment);
            if (Number.isFinite(storedBase) && storedBase > 0) {
                return storedBase;
            }
            return (orderData.items || []).reduce((sum: number, item: any) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
        })()
        : 0;

    return (
        <div className="min-h-screen bg-slate-100 font-sans pb-24">
            <Toaster position="top-center" />
            {/* HEADER */}
            <div className="bg-white px-4 py-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
                <Link href="/" className="text-slate-600 hover:text-slate-900">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                </Link>
                <h1 className="text-lg font-bold text-slate-800">Rincian Pesananmu</h1>
            </div>

            <div className={`max-w-md mx-auto px-4 ${orderData ? 'pt-6' : 'min-h-[calc(100vh-7rem)] flex items-center justify-center'}`}>
                {/* JIKA DATA BELUM ADA / FORM PENCARIAN */}
                {!orderData ? (
                    <div className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h2 className="font-bold text-slate-800 mb-4 text-center">Lacak Pesanan Bacanau</h2>
                        <form onSubmit={handleSearch} className="space-y-4">
                            <input 
                                type="text" 
                                placeholder="Masukkan ID pesanan atau nomor handphone yang digunakan" 
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
                        {searchResults && (
                            <div className="mt-4 bg-white border border-slate-100 rounded-xl p-4">
                                <h3 className="font-bold mb-2">Hasil Pencarian ({searchResults.length})</h3>
                                <div className="space-y-2">
                                    {searchResults.map((r) => (
                                        <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg">
                                            <div>
                                                <p className="font-semibold text-sm">ID: {r.id}</p>
                                                <p className="text-xs text-slate-500">{r.customerName || '-'} • Rp {Number(r.totalPayment || 0).toLocaleString('id-ID')}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => { setOrderData(r); setSearchResults(null); }} className="text-sm bg-slate-900 text-white px-3 py-2 rounded-lg">Pilih</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
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
                                    <span className="text-slate-800 font-medium">Rp {resolvedBasePayment.toLocaleString('id-ID')}</span>
                                </div>
                                {Number(orderData.voucherAmount || 0) > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Voucher {orderData.voucherCode ? `(${orderData.voucherCode})` : ''}</span>
                                        <span className="text-amber-600 font-medium">- Rp {Number(orderData.voucherAmount || 0).toLocaleString('id-ID')}</span>
                                    </div>
                                )}
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

                        {/* QRIS SECTION (jika menunggu pembayaran) */}
                        {orderData.status === 'Menunggu Pembayaran' && (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                                <h2 className="font-bold text-slate-800 mb-4">Pembayaran QRIS</h2>
                                <div className="flex flex-col items-center gap-4">
                                    {isGeneratingQris ? (
                                        <div className="w-40 h-40 bg-slate-100 rounded-lg animate-pulse flex items-center justify-center">Membuat QRIS...</div>
                                    ) : qrisError ? (
                                        <div className="text-sm text-red-500">Gagal memuat QRIS. Silakan coba lagi nanti.</div>
                                    ) : qrisImage ? (
                                        <>
                                            <div className="bg-white p-2 rounded-lg border">
                                                <Image src={qrisImage} alt="QRIS" width={160} height={160} unoptimized />
                                            </div>
                                            <div className="flex gap-2 w-full">
                                                <button onClick={handleDownloadQris} className="flex-1 bg-white border border-slate-300 py-2 rounded-xl font-bold">Download QRIS</button>
                                                <button onClick={handleDownloadInvoicePDF} className="flex-1 bg-slate-900 text-white py-2 rounded-xl font-bold">Download Invoice</button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-sm text-slate-500">QRIS belum tersedia.</div>
                                    )}
                                </div>
                            </div>
                        )}

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