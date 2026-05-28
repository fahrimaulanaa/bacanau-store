"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase'; 
import { supabase } from '../../../lib/supabase'; 
import Link from 'next/link';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Tesseract from 'tesseract.js';
import { Toaster, toast } from 'react-hot-toast'; 
import emailjs from '@emailjs/browser'; 
import imageCompression from 'browser-image-compression';

interface OrderItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

function PayContent() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get('id') || '';
    
    const [loadingData, setLoadingData] = useState<boolean>(true);
    const [errorMsg, setErrorMsg] = useState<string>('');

    // State penyimpan detail data transaksi komplit
    const [totalPay, setTotalPay] = useState<number>(0);
    const [baseTotal, setBaseTotal] = useState<number>(0);
    const [uniqueCode, setUniqueCode] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState<string>('QRIS'); // State untuk metode pembayaran
    
    const [buyerName, setBuyerName] = useState<string>('');
    const [buyerEmail, setBuyerEmail] = useState<string>(''); 
    const [buyerContact, setBuyerContact] = useState<string>('');
    const [buyerDomicile, setBuyerDomicile] = useState<string>('');
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

    const [qrisImage, setQrisImage] = useState<string>('');
    const [isGeneratingQris, setIsGeneratingQris] = useState<boolean>(true);
    const [qrisError, setQrisError] = useState<boolean>(false);

    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState<boolean>(false);
    const [scanStatus, setScanStatus] = useState<string>('');
    const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
    const [isCopied, setIsCopied] = useState<boolean>(false);
    const [isAutoVerified, setIsAutoVerified] = useState<boolean>(false);

    // State Pop-up Notifikasi OCR
    const [ocrPopup, setOcrPopup] = useState<{ show: boolean, status: 'success' | 'error', title: string, message: string } | null>(null);

    const fetchDynamicQris = async (amount: number) => {
        setIsGeneratingQris(true);
        setQrisError(false);
        try {
            const staticQris = "00020101021126570011ID.DANA.WWW011893600915300024307302090002430730303UMI51440014ID.CO.QRIS.WWW0215ID10254666263850303UMI5204549953033605802ID5914Puding Hambali600412026105612566304027C";
            const response = await fetch("/api/qris", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: amount.toString(), qris_statis: staticQris })
            });

            const data = await response.json();
            
            if (data.status === "success" && data.qris_base64) {
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

    useEffect(() => {
        const fetchOrderData = async () => {
            if (!orderId) {
                setErrorMsg("ID Pesanan tidak valid.");
                setLoadingData(false);
                return;
            }
            try {
                const docRef = doc(db, "orders", orderId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const orderData = docSnap.data();
                    const paymentAmount = Number(orderData.totalPayment) || 0;
                    const itemsArr = (orderData.items || []) as OrderItem[];
                    
                    const calculatedBaseTotal = itemsArr.reduce((sum: number, item) => sum + (item.price * item.quantity), 0);
                    setTotalPay(paymentAmount);
                    setBaseTotal(calculatedBaseTotal);
                    setUniqueCode(paymentAmount - calculatedBaseTotal);
                    
                    setBuyerName(orderData.customerName || 'Pelanggan');
                    setBuyerEmail(orderData.customerEmail || ''); 
                    setBuyerContact(orderData.contactInfo || '-');
                    setBuyerDomicile(orderData.domicile || '-');
                    setPaymentMethod(orderData.paymentMethod || 'QRIS'); // Set metode pembayaran dari DB
                    setOrderItems(itemsArr);

                    // Hanya generate QRIS jika yang dipilih QRIS
                    if (orderData.paymentMethod === 'QRIS' || !orderData.paymentMethod) {
                        fetchDynamicQris(paymentAmount);
                    }
                } else {
                    setErrorMsg("Data transaksi tidak ditemukan.");
                }
            } catch {
                setErrorMsg("Gagal terhubung ke database server.");
            } finally {
                setLoadingData(false);
            }
        };

        if (orderId) fetchOrderData();
    }, [orderId]);

    // FUNGSI PENGIRIM EMAIL OTOMATIS
    const sendAutomatedEmail = () => {
        if (!buyerEmail) return;
        
        const templateParams = {
            to_name: buyerName,
            to_email: buyerEmail,
            order_id: orderId,
            total_amount: `Rp ${totalPay.toLocaleString('id-ID')}`,
            status: "LUNAS (Verified by AI)"
        };

        emailjs.send('service_5f5q7r9', 'template_ble6ki6', templateParams, 'D5jRZ-GnOQKPhIljJ')
            .then(() => toast.success(`Tanda terima terkirim ke Email: ${buyerEmail}`))
            .catch(() => toast.error("Gagal mengirim email notifikasi."));
    };

    const handleCopyNumber = () => {
        navigator.clipboard.writeText("085174237980");
        setIsCopied(true);
        toast.success("Nomor Admin berhasil disalin!");
        setTimeout(() => setIsCopied(false), 2000); 
    };

    // FUNGSI COPY REKENING/EWALLET
    const handleCopyRekening = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} berhasil disalin!`);
    };

    const handleDownloadInvoicePDF = () => {
        try {
            const docPdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            
            docPdf.setFont("Helvetica", "bold"); docPdf.setFontSize(22); docPdf.text("BACANAU STORE", 14, 20);
            docPdf.setFont("Helvetica", "normal"); docPdf.setFontSize(9); docPdf.setTextColor(100, 116, 139); docPdf.text("Platform Apparel & Digital Art Kampus", 14, 25);
            
            docPdf.setFont("Helvetica", "bold"); docPdf.setFontSize(16); docPdf.setTextColor(15, 23, 42); docPdf.text("OFFICIAL INVOICE", 196, 20, { align: 'right' });
            docPdf.setFont("Courier", "bold"); docPdf.setFontSize(10); docPdf.setTextColor(71, 85, 105); docPdf.text(`ID: ${orderId}`, 196, 25, { align: 'right' });

            docPdf.setDrawColor(226, 232, 240); docPdf.setLineWidth(0.5); docPdf.line(14, 32, 196, 32);

            docPdf.setFont("Helvetica", "bold"); docPdf.setFontSize(10); docPdf.setTextColor(100, 116, 139);
            docPdf.text("TUJUAN PEMBAYARAN:", 14, 40); docPdf.text("DETAIL TRANSAKSI:", 115, 40);

            docPdf.setFont("Helvetica", "normal"); docPdf.setFontSize(10); docPdf.setTextColor(15, 23, 42);
            docPdf.text(`Nama: ${buyerName}`, 14, 46); docPdf.text(`Kontak WA: ${buyerContact}`, 14, 52); docPdf.text(`Domisili: ${buyerDomicile}`, 14, 58);

            const tanggalSekarang = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const statusInvoice = isAutoVerified ? "LUNAS (AUTO-VERIFIED)" : "MENUNGGU VERIFIKASI MANUAL";
            
            docPdf.text(`Tanggal Cetak: ${tanggalSekarang}`, 115, 46);
            docPdf.text(`Metode: ${paymentMethod}`, 115, 52); // Masukkan metode di PDF
            docPdf.text(`Status: ${statusInvoice}`, 115, 58);

            const tableRows = orderItems.map((item, index) => [
                index + 1, item.name, `Rp ${Number(item.price).toLocaleString('id-ID')}`, item.quantity, `Rp ${(Number(item.price) * Number(item.quantity)).toLocaleString('id-ID')}`
            ]);

            if (uniqueCode > 0) {
                tableRows.push(['', 'Kode Unik Sistem', '-', '-', `Rp ${uniqueCode}`]);
            }

            let finalTableY = 120; 
            autoTable(docPdf, {
                startY: 66,
                head: [['No', 'Deskripsi Produk / Item Belanja', 'Harga Satuan', 'Qty', 'Total']],
                body: tableRows.length > 0 ? tableRows : [['1', 'Pesanan Produk Sandang', `Rp ${totalPay.toLocaleString('id-ID')}`, '1', `Rp ${totalPay.toLocaleString('id-ID')}`]],
                headStyles: { fillColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9 }, bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
                columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right' } }, theme: 'striped',
                didDrawPage: (data) => { if (data.cursor) finalTableY = data.cursor.y; }
            });

            const totalSectionY = finalTableY + 12;
            docPdf.setFont("Helvetica", "bold"); docPdf.setFontSize(11); docPdf.setTextColor(15, 23, 42); docPdf.text("TOTAL BAYAR:", 130, totalSectionY);
            docPdf.setFont("Helvetica", "black"); docPdf.setFontSize(13); docPdf.setTextColor(16, 185, 129); docPdf.text(`Rp ${totalPay.toLocaleString('id-ID')}`, 196, totalSectionY, { align: 'right' });
            docPdf.setFont("Helvetica", "italic"); docPdf.setFontSize(8); docPdf.setTextColor(148, 163, 184); docPdf.text("Invoice ini sah sebagai bukti pembelian komoditas Bacanau Store.", 105, 282, { align: 'center' });

            docPdf.save(`Bacanau_Invoice_${orderId}.pdf`);
            toast.success("Invoice PDF berhasil diunduh.");
        } catch {
            toast.error("Sistem gagal menyusun file PDF secara instan.");
        }
    };

    const handleDownloadQris = () => {
        if (!qrisImage) {
            toast.error("QRIS belum siap diunduh.");
            return;
        }

        const downloadLink = document.createElement('a');
        downloadLink.href = qrisImage;
        downloadLink.download = `QRIS_Bacanau_${orderId || 'pembayaran'}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        toast.success("QRIS berhasil diunduh.");
    };

    // FUNGSI UPLOAD & OCR VERIFICATION 
    const handleUploadBukti = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !orderId) return;

        setUploading(true);
        setIsAutoVerified(false);
        setScanStatus("Memindai struk dengan AI...");
        const loadingToast = toast.loading("Memindai struk...");

        try {
            const { data: { text } } = await Tesseract.recognize(file, 'ind');
            const targetNominal = totalPay.toString();
            const lowerText = text.toLowerCase();
            
            let autoMatch = false;

            if (lowerText.includes('rp')) {
                const matches = text.match(/\d+[\.,]?\d*/g);
                if (matches) {
                    for (const m of matches) {
                        const cleanDigits = m.replace(/[,\.]/g, '');
                        if (cleanDigits === targetNominal || cleanDigits === targetNominal + "00" || cleanDigits === targetNominal + "0") {
                            autoMatch = true;
                            break; 
                        }
                    }
                }
            }

            toast.dismiss(loadingToast);
            setOcrPopup({
                show: true,
                status: autoMatch ? 'success' : 'error',
                title: autoMatch ? 'Verifikasi Berhasil! 🎉' : 'Manual Review Diperlukan ⚠️',
                message: autoMatch ? 'Nominal sesuai.' : 'Nominal tidak terbaca otomatis oleh AI. Diteruskan ke Admin.'
            });

            setScanStatus("Mengompres bukti bayar...");
            const compressedFile = await imageCompression(file, {
                maxSizeMB: 0.35,
                maxWidthOrHeight: 1400,
                useWebWorker: true,
                fileType: 'image/jpeg',
                initialQuality: 0.75,
            });
            const uploadFile = new File([compressedFile], `${orderId}_bukti.jpg`, { type: 'image/jpeg' });
            const fileExt = 'jpg';
            const fileName = `${orderId}_bukti.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('bukti-pembayaran').upload(fileName, uploadFile, { cacheControl: '3600', upsert: true });
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('bukti-pembayaran').getPublicUrl(fileName);

            const newStatus = autoMatch ? "Selesai (Lunas)" : "Sudah Bayar (Mengecek Bukti)";
            await updateDoc(doc(db, "orders", orderId), {
                paymentProofUrl: publicUrl,
                status: newStatus,
                updatedAt: new Date()
            });

            setTimeout(() => {
                setOcrPopup(null);
                setIsAutoVerified(autoMatch);
                setUploadSuccess(true);
                
                if (autoMatch) {
                    sendAutomatedEmail();
                }
            }, 3000);

        } catch {
            toast.dismiss(loadingToast);
            toast.error("Terjadi kendala saat memproses bukti bayar.");
            setUploading(false);
        } 
    };

    if (loadingData) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500 font-medium animate-pulse">Menghubungkan jalur proteksi data...</p>
            </div>
        );
    }

    if (errorMsg) {
        return (
            <div className="bg-white p-8 rounded-2xl border border-red-100 shadow-xl text-center max-w-md w-full">
                <span className="text-5xl">❌</span><h2 className="text-xl font-bold text-red-600 mt-4 mb-2">Terjadi Kesalahan</h2>
                <p className="text-sm text-gray-600 mb-6">{errorMsg}</p>
                <Link href="/" className="block w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold text-center transition-colors">Kembali Ke Toko</Link>
            </div>
        );
    }

    return (
        <div className="relative">
            <Toaster position="top-center" />
            
            {ocrPopup && ocrPopup.show && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className={`bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-t-4 animate-in zoom-in-95 duration-300 ${ocrPopup.status === 'success' ? 'border-emerald-500' : 'border-amber-500'}`}>
                        <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 ${ocrPopup.status === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                            {ocrPopup.status === 'success' ? (
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                            ) : (
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            )}
                        </div>
                        <h3 className="text-lg font-black text-slate-900 mb-2">{ocrPopup.title}</h3>
                        <p className="text-sm text-slate-600 leading-relaxed mb-4">{ocrPopup.message}</p>
                        
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-slate-400 h-1.5 rounded-full transition-all duration-[4000ms] ease-linear w-full" style={{width: '0%'}}></div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-xl text-center max-w-md w-full animate-in fade-in zoom-in duration-300">
                {!uploadSuccess ? (
                    <>
                        <span className="text-5xl">📱</span>
                        <h2 className="text-2xl font-black text-slate-900 mt-4 mb-1">Halaman Pembayaran</h2>
                        <p className="text-xs text-slate-500 mb-6">ID Pesanan: <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{orderId}</span></p>

                        <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-xl text-left mb-6 relative overflow-hidden">
                            <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-200 rounded-full opacity-50 blur-xl"></div>
                            
                            <div className="flex justify-between items-center text-sm mb-1.5">
                                <span className="text-emerald-800 font-medium">Total Belanja:</span>
                                <span className="font-bold text-slate-700">Rp {baseTotal.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm mb-3">
                                <span className="text-emerald-800 font-medium">Kode Unik:</span>
                                <span className="font-bold text-emerald-600">+ Rp {uniqueCode}</span>
                            </div>

                            <div className="flex justify-between items-end border-t border-emerald-200 pt-3">
                                <span className="text-xs text-emerald-800 font-bold uppercase tracking-wider">Total Transfer:</span>
                                <span className="text-3xl font-black text-slate-900 tracking-tight leading-none">Rp {totalPay.toLocaleString('id-ID')}</span>
                            </div>
                        </div>

                        {/* RENDER INSTRUKSI PEMBAYARAN BERDASARKAN METODE YANG DIPILIH */}
                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-6 flex flex-col items-center justify-center rounded-xl mb-6">
                            
                            {paymentMethod === 'QRIS' && (
                                <>
                                    <p className="text-sm font-bold text-slate-700 mb-4">Scan QRIS Dinamis Toko</p>
                                    {isGeneratingQris ? (
                                        <div className="w-48 h-48 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400 shadow-inner animate-pulse">Membentuk QRIS Dinamis...</div>
                                    ) : qrisError ? (
                                        <div className="w-48 h-48 bg-red-50 rounded-lg flex flex-col items-center justify-center text-xs text-red-500 shadow-inner border border-red-200 p-4 text-center">
                                            <span className="text-2xl mb-1">⚠️</span><span>Gagal memuat API QRIS. Muat ulang halaman.</span>
                                        </div>
                                    ) : qrisImage ? (
                                        <>
                                            <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 animate-in fade-in duration-300">
                                                <img src={qrisImage} alt="QRIS Dinamis" className="w-40 h-40 object-contain" />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleDownloadQris}
                                                className="mt-4 w-full max-w-[220px] bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-2"
                                            >
                                                <span>Download</span>
                                                <span>QRIS</span>
                                            </button>
                                        </>
                                    ) : null}
                                    <p className="text-[11px] text-slate-500 mt-3 font-medium">Nominal otomatis terisi saat di-scan</p>
                                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] font-semibold text-red-700 leading-relaxed text-center">
                                        Setelah membayar, jangan lupa untuk unggah bukti bayar ya. Karena website kami belum berlangganan payment gateway buat automatisasi pembayaran kamu. Makasih atas pengertiannya
                                    </div>
                                </>
                            )}

                            {paymentMethod === 'BCA' && (
                                <div className="text-center w-full">
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/5/5c/Bank_Central_Asia.svg" alt="BCA" className="h-10 mx-auto mb-4 object-contain" />
                                    <p className="text-sm font-bold text-slate-700 mb-2">Transfer ke Rekening BCA:</p>
                                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm mb-3">
                                        <div className="flex items-center justify-center gap-2">
                                            <p className="text-2xl font-black text-blue-600 tracking-wider font-mono">7751549117</p>
                                            <button onClick={() => handleCopyRekening('7751549117', 'Rekening BCA')} className="text-slate-400 hover:text-blue-600 transition-colors">📋</button>
                                        </div>
                                        <p className="text-xs font-bold text-slate-500 mt-1 uppercase">A.N Fahri Maulana Al Ghazali</p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-medium">Pastikan transfer TEPAT sesuai nominal total hingga 2 digit terakhir.</p>
                                </div>
                            )}

                            {paymentMethod === 'E-WALLET' && (
                                <div className="text-center w-full">
                                    <div className="flex justify-center gap-3 mb-4">
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/8/86/Gopay_logo.svg" alt="GoPay" className="h-6 object-contain" />
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/7/72/Logo_dana_blue.svg" alt="DANA" className="h-6 object-contain" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-700 mb-2">Transfer ke Nomor E-Wallet:</p>
                                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm mb-3">
                                        <div className="flex items-center justify-center gap-2">
                                            <p className="text-2xl font-black text-sky-600 tracking-wider font-mono">085174237980</p>
                                            <button onClick={() => handleCopyRekening('085174237980', 'Nomor E-Wallet')} className="text-slate-400 hover:text-sky-600 transition-colors">📋</button>
                                        </div>
                                        <p className="text-xs font-bold text-slate-500 mt-1 uppercase">A.N Fahri Maulana</p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-medium">Mendukung GoPay, DANA, OVO, ShopeePay, dsb.</p>
                                </div>
                            )}

                        </div>

                        <form onSubmit={handleUploadBukti} className="border-t pt-4 text-left space-y-3">
                            <label className="block text-xs font-bold text-slate-700 uppercase">
                                Upload Bukti Transfer (Screenshot)
                            </label>
                            <input 
                                type="file" accept="image/*"
                                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                                onChange={(e) => { if (e.target.files && e.target.files[0]) setFile(e.target.files[0]); }} required 
                            />
                            <button
                                type="submit" disabled={uploading || !file || (paymentMethod === 'QRIS' && (isGeneratingQris || qrisError))}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white py-3 rounded-xl font-bold text-center transition-colors shadow-md text-sm"
                            >
                                {uploading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {scanStatus}
                                    </span>
                                ) : 'Kirim & Verifikasi Pembayaran'}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="py-2 animate-in slide-in-from-bottom-4 duration-500">
                        {isAutoVerified ? (
                            <>
                                <span className="text-6xl inline-block mb-2">🎉</span>
                                <h2 className="text-2xl font-black text-emerald-600 mb-2">Verifikasi Instan Berhasil!</h2>
                                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl mb-6 text-sm text-emerald-800 leading-relaxed text-left">
                                    Sistem AI kami telah memverifikasi struk Anda secara otomatis. Pesanan langsung dinyatakan <b>LUNAS</b>. Kami akan segera menghubungi Anda untuk info pengantaran/pengambilan barang.
                                </div>
                            </>
                        ) : (
                            <>
                                <span className="text-6xl inline-block mb-2">✅</span>
                                <h2 className="text-2xl font-black text-slate-900 mb-2">Bukti Diterima!</h2>
                                <div className="text-sm text-slate-600 mb-6 leading-relaxed text-left">
                                    Terima kasih, pesanan anda dalam proses verifikasi manual. Mohon tunggu pesan konfirmasi dari Admin via Contact Person yang sudah kamu cantumkan.<br/><br/> Apabila dalam 1 X 12 jam tidak ada konfirmasi, silakan download invoice berikut dan kirimkan ke nomor admin:
                                    
                                    <div className="mt-4 flex justify-center">
                                        <div className="inline-flex items-center gap-3 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
                                            <span className="font-mono font-bold text-slate-800 tracking-wider text-base">085174237980</span>
                                            <button onClick={handleCopyNumber} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1 ${ isCopied ? "bg-emerald-100 border-emerald-200 text-emerald-700" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
                                                {isCopied ? '✅ Disalin' : '📋 Salin'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                        
                        <div className="space-y-3 mb-2">
                            <button onClick={handleDownloadInvoicePDF} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-colors shadow-md text-sm flex items-center justify-center gap-2">
                                <span>📥</span> Unduh Invoice Resmi (PDF)
                            </button>
                            <Link href="/" className="block w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold transition-colors text-sm shadow-md">
                                Kembali Ke Toko Utama
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function PayPage() {
    return (
        <div className="min-h-screen bg-gray-50 text-gray-800 font-sans py-12 px-4 flex items-center justify-center">
            <Suspense fallback={<div className="text-center"><p className="text-gray-500 font-medium animate-pulse">Menyiapkan modul verifikasi AI...</p></div>}>
                <PayContent />
            </Suspense>
        </div>
    );
}
