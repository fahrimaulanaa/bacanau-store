"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase'; 
import { supabase } from '../../../lib/supabase'; 
import Link from 'next/link';

// Import library pembuat PDF otomatis
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OrderItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

function PayContent() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get('id') || '';
    
    const [mounted, setMounted] = useState<boolean>(false);
    const [loadingData, setLoadingData] = useState<boolean>(true);
    const [errorMsg, setErrorMsg] = useState<string>('');

    // State penyimpan detail data transaksi komplit untuk isi Invoice
    const [totalPay, setTotalPay] = useState<number>(0);
    const [buyerName, setBuyerName] = useState<string>('');
    const [buyerContact, setBuyerContact] = useState<string>('');
    const [buyerDomicile, setBuyerDomicile] = useState<string>('');
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

    // State API QRIS Dinamis
    const [qrisImage, setQrisImage] = useState<string>('');
    const [isGeneratingQris, setIsGeneratingQris] = useState<boolean>(true);
    const [qrisError, setQrisError] = useState<boolean>(false);

    // State upload media bukti
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState<boolean>(false);
    const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);

    // FUNGSI API: Men-generate QRIS Dinamis via Proxy Backend Next.js (Anti-CORS)
    const fetchDynamicQris = async (amount: number) => {
        setIsGeneratingQris(true);
        setQrisError(false);
        try {
            // String QRIS Statis Orisinal
            const staticQris = "00020101021126570011ID.DANA.WWW011893600915300024307302090002430730303UMI51440014ID.CO.QRIS.WWW0215ID10254666263850303UMI5204549953033605802ID5914Puding Hambali600412026105612566304027C";
            
            // PERUBAHAN: Menembak ke /api/qris milik backend kita sendiri
            const response = await fetch("/api/qris", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    amount: amount.toString(),
                    qris_statis: staticQris
                })
            });

            const data = await response.json();
            
            if (data.status === "success" && data.qris_base64) {
                // Tambahkan prefix 'data:image/png;base64,' jika dari API belum ada
                const base64Str = data.qris_base64.startsWith('data:image') 
                    ? data.qris_base64 
                    : `data:image/png;base64,${data.qris_base64}`;
                setQrisImage(base64Str);
            } else {
                console.error("Error Response API:", data.message);
                setQrisError(true);
            }
        } catch (error) {
            console.error("Gagal memanggil API Proxy QRIS:", error);
            setQrisError(true);
        } finally {
            setIsGeneratingQris(false);
        }
    };

    useEffect(() => {
        setMounted(true);

        const fetchOrderData = async () => {
            if (!orderId) {
                setErrorMsg("ID Pesanan tidak valid atau kosong.");
                setLoadingData(false);
                return;
            }

            try {
                const docRef = doc(db, "orders", orderId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const orderData = docSnap.data();
                    const paymentAmount = Number(orderData.totalPayment) || 0;
                    
                    // Ambil seluruh data esensial untuk dicetak di PDF Invoice
                    setTotalPay(paymentAmount);
                    setBuyerName(orderData.customerName || orderData.buyerName || 'Pelanggan Setia');
                    setBuyerContact(orderData.contactInfo || orderData.buyerContact || '-');
                    setBuyerDomicile(orderData.domicile || orderData.buyerDomicile || '-');
                    setOrderItems(orderData.items || []);

                    // Panggil API Proxy QRIS Dinamis setelah nominal berhasil ditarik dari database
                    fetchDynamicQris(paymentAmount);
                } else {
                    setErrorMsg("Data transaksi tidak ditemukan di sistem database.");
                }
            } catch (error) {
                console.error("Gagal memuat detail transaksi:", error);
                setErrorMsg("Koneksi gagal saat menghubungi database server.");
            } finally {
                setLoadingData(false);
            }
        };

        if (orderId) {
            fetchOrderData();
        }
    }, [orderId]);

    // FUNGSI UTAMA GENERATE PDF INVOICE RESMI
    const handleDownloadInvoicePDF = () => {
        try {
            const docPdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // 1. Header Toko (Brand Identity)
            docPdf.setFont("Helvetica", "bold");
            docPdf.setFontSize(22);
            docPdf.text("BACANAU STORE", 14, 20);
            
            docPdf.setFont("Helvetica", "normal");
            docPdf.setFontSize(9);
            docPdf.setTextColor(100, 116, 139);
            docPdf.text("Platform Apparel & Digital Art Kampus", 14, 25);

            // 2. Judul Dokumen Invoice
            docPdf.setFont("Helvetica", "bold");
            docPdf.setFontSize(16);
            docPdf.setTextColor(15, 23, 42);
            docPdf.text("OFFICIAL INVOICE", 196, 20, { align: 'right' });

            docPdf.setFont("Courier", "bold");
            docPdf.setFontSize(10);
            docPdf.setTextColor(71, 85, 105);
            docPdf.text(`ID: ${orderId}`, 196, 25, { align: 'right' });

            // Garis pembatas atas dekoratif
            docPdf.setDrawColor(226, 232, 240);
            docPdf.setLineWidth(0.5);
            docPdf.line(14, 32, 196, 32);

            // 3. Metadata Transaksi & Profil Pembeli
            docPdf.setFont("Helvetica", "bold");
            docPdf.setFontSize(10);
            docPdf.setTextColor(100, 116, 139);
            docPdf.text("TUJUAN PEMBAYARAN:", 14, 40);
            docPdf.text("DETAIL TRANSAKSI:", 115, 40);

            docPdf.setFont("Helvetica", "normal");
            docPdf.setFontSize(10);
            docPdf.setTextColor(15, 23, 42);
            
            // Kolom Kiri - Data Pembeli
            docPdf.text(`Nama: ${buyerName}`, 14, 46);
            docPdf.text(`Kontak WA: ${buyerContact}`, 14, 52);
            docPdf.text(`Domisili: ${buyerDomicile}`, 14, 58);

            // Kolom Kanan - Meta Transaksi
            const tanggalSekarang = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            docPdf.text(`Tanggal Cetak: ${tanggalSekarang}`, 115, 46);
            docPdf.text(`Metode: QRIS Dinamis API`, 115, 52);
            docPdf.text(`Status Keamanan: LUNAS (TERVERIFIKASI)`, 115, 58);

            // 4. Pengisian Tabel Rincian Belanja Berbasis autoTable
            const tableRows = orderItems.map((item, index) => [
                index + 1,
                item.name,
                `Rp ${Number(item.price).toLocaleString('id-ID')}`,
                item.quantity,
                `Rp ${(Number(item.price) * Number(item.quantity)).toLocaleString('id-ID')}`
            ]);

            let finalTableY = 120; 

            autoTable(docPdf, {
                startY: 66,
                head: [['No', 'Deskripsi Produk / Item Belanja', 'Harga Satuan', 'Qty', 'Total']],
                body: tableRows.length > 0 ? tableRows : [['1', 'Pesanan Produk Sandang Bacanau', `Rp ${totalPay.toLocaleString('id-ID')}`, '1', `Rp ${totalPay.toLocaleString('id-ID')}`]],
                headStyles: { fillColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9 },
                bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
                columnStyles: {
                    0: { cellWidth: 10 },
                    2: { halign: 'right' },
                    3: { halign: 'center' },
                    4: { halign: 'right' }
                },
                theme: 'striped',
                didDrawPage: (data) => {
                    if (data.cursor) {
                        finalTableY = data.cursor.y;
                    }
                }
            });

            // 5. Total Akhir Pembayaran Rapi Rata Kanan Menggunakan Koordinat Dinamis yang Aman
            const totalSectionY = finalTableY + 12;
            
            docPdf.setFont("Helvetica", "bold");
            docPdf.setFontSize(11);
            docPdf.setTextColor(15, 23, 42);
            docPdf.text("TOTAL BAYAR (LUNAS):", 130, totalSectionY);
            
            docPdf.setFont("Helvetica", "black");
            docPdf.setFontSize(13);
            docPdf.setTextColor(16, 185, 129); 
            docPdf.text(`Rp ${totalPay.toLocaleString('id-ID')}`, 196, totalSectionY, { align: 'right' });

            // 6. Catatan Kaki Legalitas Digital
            docPdf.setFont("Helvetica", "italic");
            docPdf.setFontSize(8);
            docPdf.setTextColor(148, 163, 184);
            docPdf.text("Invoice ini dikeluarkan secara elektronik dan sah sebagai bukti pembelian komoditas Bacanau Store.", 105, 282, { align: 'center' });

            // Simpan file hasil olahan langsung terunduh otomatis
            docPdf.save(`Bacanau_Store_Invoice_${orderId}.pdf`);

        } catch (err) {
            console.error("Gagal memproses cetak PDF:", err);
            alert("Sistem gagal menyusun file PDF secara instan.");
        }
    };

    // Fungsi Upload ke Supabase
    const handleUploadBukti = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !orderId) {
            alert("Silakan tentukan berkas screenshot bukti transaksi.");
            return;
        }

        setUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${orderId}_bukti.${fileExt}`;

            const { data, error: uploadError } = await supabase.storage
                .from('bukti-pembayaran')
                .upload(fileName, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('bukti-pembayaran')
                .getPublicUrl(fileName);

            const orderDocRef = doc(db, "orders", orderId);
            await updateDoc(orderDocRef, {
                paymentProofUrl: publicUrl,
                status: "Sudah Bayar (Mengecek Bukti)",
                updatedAt: new Date()
            });

            setUploadSuccess(true);
            alert("Sukses! File berhasil diunggah ke cloud.");
        } catch (error: any) {
            console.error("Gagal:", error);
            alert(`Gagal: ${error.message}`);
        } finally {
            setUploading(false);
        }
    };

    if (!mounted || loadingData) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500 font-medium animate-pulse">Menghubungkan jalur proteksi data...</p>
            </div>
        );
    }

    if (errorMsg) {
        return (
            <div className="bg-white p-8 rounded-2xl border border-red-100 shadow-xl text-center max-w-md w-full">
                <span className="text-5xl">❌</span>
                <h2 className="text-xl font-bold text-red-600 mt-4 mb-2">Terjadi Kesalahan</h2>
                <p className="text-sm text-gray-600 mb-6">{errorMsg}</p>
                <Link href="/" className="block w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold text-center transition-colors">
                    Kembali Ke Toko
                </Link>
            </div>
        );
    }

    return (
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-xl text-center max-w-md w-full animate-in fade-in zoom-in duration-300">
            {!uploadSuccess ? (
                <>
                    <span className="text-5xl">📱</span>
                    <h2 className="text-2xl font-black text-slate-900 mt-4 mb-1">Halaman Pembayaran</h2>
                    <p className="text-xs text-slate-500 mb-6">
                        ID Pesanan: <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{orderId}</span>
                    </p>

                    <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-xl text-left mb-6">
                        <p className="text-xs text-emerald-800 font-medium mb-1">Total Nominal Belanja (Valid):</p>
                        <p className="text-3xl font-black text-slate-900">
                            Rp {totalPay.toLocaleString('id-ID')}
                        </p>
                    </div>

                    {/* BLOK TAMPILAN GRAFIK QRIS API */}
                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-6 flex flex-col items-center justify-center rounded-xl mb-6">
                        <p className="text-sm font-bold text-slate-700 mb-4">Scan QRIS Dinamis Toko</p>
                        
                        {isGeneratingQris ? (
                            <div className="w-48 h-48 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400 shadow-inner animate-pulse">
                                Membentuk QRIS Dinamis...
                            </div>
                        ) : qrisError ? (
                            <div className="w-48 h-48 bg-red-50 rounded-lg flex flex-col items-center justify-center text-xs text-red-500 shadow-inner border border-red-200 p-4 text-center">
                                <span className="text-2xl mb-1">⚠️</span>
                                <span>Gagal memuat gambar QRIS dari API. Silakan muat ulang halaman.</span>
                            </div>
                        ) : qrisImage ? (
                            <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 animate-in fade-in duration-300">
                                {/* Menampilkan Base64 Image */}
                                <img src={qrisImage} alt="QRIS Dinamis" className="w-40 h-40 object-contain" />
                            </div>
                        ) : null}

                        <p className="text-[11px] text-slate-500 mt-3 font-medium">Nominal otomatis terisi saat di-scan</p>
                    </div>

                    <form onSubmit={handleUploadBukti} className="border-t pt-4 text-left space-y-3">
                        <label className="block text-xs font-bold text-slate-700 uppercase">
                            Upload Bukti Transfer (Screenshot)
                        </label>
                        <input 
                            type="file" 
                            accept="image/*"
                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                            onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    setFile(e.target.files[0]);
                                }
                            }}
                            required
                        />
                        <button
                            type="submit"
                            disabled={uploading || !file || isGeneratingQris || qrisError}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-3 rounded-xl font-bold text-center transition-colors shadow-md text-sm"
                        >
                            {uploading ? 'Mengupload ke Supabase...' : 'Kirim Bukti Pembayaran'}
                        </button>
                    </form>
                </>
            ) : (
                /* TAMPILAN SUKSES & TOMBOL DOWNLOAD INVOICE PDF */
                <div className="py-2">
                    <span className="text-6xl animate-bounce inline-block">✅</span>
                    <h2 className="text-2xl font-black text-slate-900 mt-4 mb-2">Bukti Diterima!</h2>
                    <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                        Terima kasih! Bukti transfer telah tersimpan aman di cloud storage. Silakan unduh dokumen invoice resmi di bawah ini sebagai jaminan transaksi.
                    </p>
                    
                    <div className="space-y-3 mb-4">
                        <button
                            onClick={handleDownloadInvoicePDF}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-center transition-colors shadow-md text-sm flex items-center justify-center gap-2"
                        >
                            <span>📥</span> Unduh Invoice Resmi (PDF)
                        </button>

                        <Link 
                            href="/" 
                            className="block w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold text-center transition-colors text-sm"
                        >
                            Kembali Ke Toko Utama
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function PayPage() {
    return (
        <div className="min-h-screen bg-gray-50 text-gray-800 font-sans py-12 px-4 flex items-center justify-center">
            <Suspense fallback={
                <div className="text-center">
                    <p className="text-gray-500 font-medium animate-pulse">Menyiapkan modul transaksi...</p>
                </div>
            }>
                <PayContent />
            </Suspense>
        </div>
    );
}