"use client";

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../../lib/firebase'; 

interface OrderItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

interface Order {
    id: string;
    customerName: string;
    contactInfo: string;
    domicile: string;
    totalPayment: number;
    status: string;
    paymentProofUrl?: string;
    items: OrderItem[];
    createdAt: any;
}

interface Product {
    id: string;
    name: string;
    price: number;
    img: string;
}

export default function AdminPage() {
    // Auth States
    const [user, setUser] = useState<User | null>(null);
    const [email, setEmail] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [authLoading, setAuthLoading] = useState<boolean>(true);
    const [loginError, setLoginError] = useState<string>('');

    // Dashboard States
    const [activeTab, setActiveTab] = useState<'orders' | 'products'>('orders');
    const [orders, setOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [dataLoading, setDataLoading] = useState<boolean>(false);

    // Form States Tambah/Edit Produk
    const [prodName, setProdName] = useState<string>('');
    const [prodPrice, setProdPrice] = useState<string>('');
    const [prodImg, setProdImg] = useState<string>('');
    const [editingProductId, setEditingProductId] = useState<string | null>(null);

    // State Modal Bukti Pembayaran
    const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

    // Monitor Status Login
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setAuthLoading(false);
            if (currentUser) {
                loadAdminData();
            }
        });
        return () => unsubscribe();
    }, []);

    // Load Data dari Firestore
    const loadAdminData = async () => {
        setDataLoading(true);
        try {
            const orderSnap = await getDocs(collection(db, "orders"));
            const orderList = orderSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Order[];
            setOrders(orderList.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));

            const prodSnap = await getDocs(collection(db, "products"));
            const prodList = prodSnap.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id,
                    name: d.name || d.nama_produk || "Produk Tanpa Nama",
                    price: Number(d.price || d.harga_produk) || 0,
                    img: d.img || d.url_gambar || ""
                };
            }) as Product[];
            setProducts(prodList);
        } catch (err) {
            console.error("Gagal memuat data admin:", err);
        } finally {
            setDataLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err: any) {
            setLoginError("Email atau Password Admin salah!");
        }
    };

    const handleLogout = () => {
        signOut(auth);
    };

    // FUNGSI PESANAN: Verifikasi / Ubah Status
    const handleUpdateStatus = async (orderId: string, newStatus: string) => {
        try {
            const orderRef = doc(db, "orders", orderId);
            await updateDoc(orderRef, { status: newStatus });
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        } catch (err) {
            alert("Gagal merubah status pesanan.");
        }
    };

    // FUNGSI PESANAN: Hapus Pesanan
    const handleDeleteOrder = async (orderId: string) => {
        if (!confirm("Apakah Anda yakin ingin menghapus pesanan ini secara permanen?")) return;
        try {
            await deleteDoc(doc(db, "orders", orderId));
            setOrders(orders.filter(o => o.id !== orderId));
        } catch (err) {
            alert("Gagal menghapus pesanan.");
        }
    };

    // LOGIKA & TEMPLATE: Generator Teks Hubungi via WA Otomatis
    const getWhatsAppLink = (order: Order) => {
        const contact = order.contactInfo;
        const cleaned = contact.replace(/\D/g, ''); // Bersihkan karakter non-angka
        
        let phone = '';
        if (cleaned.startsWith('08')) {
            phone = `62${cleaned.substring(1)}`;
        } else if (cleaned.startsWith('628')) {
            phone = cleaned;
        } else {
            return null; // Jika input berupa ID Line atau teks biasa, tombol WA tidak dirender
        }

        // Susun teks daftar produk belanjaan pelanggan
        const itemsText = order.items?.map(item => `${item.name} - ${item.quantity}x`).join('\n') || '';

        // Formulasi template pesan resmi BaCaNau store
        const messageTemplate = `Halo ${order.customerName}

Terima kasih telah melakukan pemesanan di BaCaNau store, berikut adalah daftar pesanan anda:

${itemsText}
Status Pesanan: ${order.status}

Pesananan kamu sekarang sudah terkonfirmasi ya, ditunggu untuk info pengambilan atau pengantaran dari kami.

Terima Kasih`;

        // URL Encode agar baris baru (\n) dan spasi terbaca sempurna oleh API WhatsApp
        return `https://wa.me/${phone}?text=${encodeURIComponent(messageTemplate)}`;
    };

    // FUNGSI PRODUK: Save, Edit, Delete
    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prodName || !prodPrice || !prodImg) return;

        try {
            const productData = { name: prodName, price: Number(prodPrice.replace(/[^0-9]/g, '')), img: prodImg };

            if (editingProductId) {
                await updateDoc(doc(db, "products", editingProductId), productData);
                alert("Produk berhasil diperbarui!");
            } else {
                await addDoc(collection(db, "products"), productData);
                alert("Produk baru berhasil ditambahkan!");
            }
            setProdName(''); setProdPrice(''); setProdImg(''); setEditingProductId(null);
            loadAdminData();
        } catch (err) {
            alert("Gagal menyimpan data produk.");
        }
    };

    const handleStartEdit = (product: Product) => {
        setEditingProductId(product.id); setProdName(product.name); setProdPrice(product.price.toString()); setProdImg(product.img);
    };

    const handleCancelEdit = () => {
        setEditingProductId(null); setProdName(''); setProdPrice(''); setProdImg('');
    };

    const handleDeleteProduct = async (productId: string) => {
        if (!confirm("Apakah Anda yakin ingin menghapus produk ini dari katalog?")) return;
        try {
            await deleteDoc(doc(db, "products", productId));
            setProducts(products.filter(p => p.id !== productId));
        } catch (err) {
            alert("Gagal menghapus produk.");
        }
    };

    if (authLoading) return <div className="min-h-screen bg-slate-900 flex justify-center items-center text-white"><p className="animate-pulse">Memverifikasi Admin...</p></div>;

    if (!user) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans px-4">
                <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl max-w-md w-full text-white">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-black tracking-tight">ADMIN CENTRAL</h1>
                        <p className="text-xs text-slate-400 mt-1">Gunakan kredensial admin Bacanau Store</p>
                    </div>
                    {loginError && <div className="bg-red-500/10 text-red-400 p-3 rounded-xl text-xs font-semibold mb-4 text-center">{loginError}</div>}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input type="email" placeholder="Email Admin" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 text-white" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        <input type="password" placeholder="Password" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 text-white" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold transition-colors">Masuk Dashboard</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative">
            <nav className="bg-white border-b border-slate-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <span className="bg-slate-900 text-white text-xs font-black px-2 py-1 rounded">PRO</span>
                        <h1 className="text-xl font-black tracking-tight text-slate-900">BACANAU ADMIN</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500 font-medium hidden sm:inline">Logged as: {user.email}</span>
                        <button onClick={handleLogout} className="text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl border border-red-200 transition-colors">Keluar Panel</button>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex border-b border-slate-200 mb-6 gap-2">
                    <button onClick={() => setActiveTab('orders')} className={`py-2.5 px-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'orders' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        📦 Verifikasi Pesanan ({orders.length})
                    </button>
                    <button onClick={() => setActiveTab('products')} className={`py-2.5 px-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'products' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        👕 Kelola Katalog Produk ({products.length})
                    </button>
                </div>

                {dataLoading && <p className="text-xs text-slate-500 animate-pulse mb-4">Menyinkronkan data cloud Firestore...</p>}

                {/* TAB 1: VERIFIKASI PESANAN PEMBELI */}
                {activeTab === 'orders' && (
                    <div className="space-y-4">
                        {orders.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 font-medium shadow-sm">
                                Belum ada transaksi pesanan masuk.
                            </div>
                        ) : (
                            orders.map((order) => {
                                // Panggil generator link teks dengan melemparkan seluruh objek order
                                const waLink = getWhatsAppLink(order);

                                return (
                                    <div key={order.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row gap-5 justify-between hover:border-slate-300 transition-colors">
                                        
                                        {/* Bagian Kiri: Info Pembeli & Item */}
                                        <div className="space-y-4 flex-1">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-black text-lg text-slate-900 uppercase">{order.customerName}</h3>
                                                    <p className="text-[11px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-1">ID: {order.id}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Tagihan</p>
                                                    <span className="text-lg font-black text-emerald-600">Rp {(order.totalPayment || 0).toLocaleString('id-ID')}</span>
                                                </div>
                                            </div>

                                            {/* Info Kontak & Domisili */}
                                            <div className="flex flex-wrap gap-4 items-center text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <div className="flex items-center gap-2">
                                                    <span>📱 <span className="font-semibold">{order.contactInfo}</span></span>
                                                    {waLink && (
                                                        <a 
                                                            href={waLink} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="bg-green-100 hover:bg-green-200 text-green-700 px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all shadow-sm flex items-center gap-1 border border-green-200"
                                                        >
                                                            💬 Hubungi via WA
                                                        </a>
                                                    )}
                                                </div>
                                                <p className="flex items-center">📍 Kampus <span className="font-semibold ml-1">{order.domicile}</span></p>
                                            </div>

                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Rincian Item:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {order.items?.map((item, idx) => (
                                                        <span key={idx} className="text-xs text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm">
                                                            {item.name} <strong className="text-slate-900">({item.quantity}x)</strong>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bagian Kanan: Aksi, Status, & Hapus */}
                                        <div className="flex flex-col gap-3 md:min-w-[220px] border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-5">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Bukti Transfer</label>
                                                {order.paymentProofUrl ? (
                                                    <button 
                                                        onClick={() => setSelectedProofUrl(order.paymentProofUrl!)}
                                                        className="w-full text-center text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold px-3 py-2.5 rounded-xl block border border-indigo-200 transition-all shadow-sm"
                                                    >
                                                        👁️ Tampilkan Bukti
                                                    </button>
                                                ) : (
                                                    <div className="w-full text-center text-xs text-amber-600 font-bold bg-amber-50 px-3 py-2.5 rounded-xl border border-amber-100">
                                                        Belum Diunggah
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Status Transaksi</label>
                                                <select 
                                                    value={order.status}
                                                    onChange={(e) => handleUpdateStatus(order.id, e.target.value)}
                                                    className={`w-full text-xs font-bold p-2.5 rounded-xl border cursor-pointer focus:outline-none focus:ring-2 appearance-none text-center ${
                                                        order.status === "Sudah Bayar (Mengecek Bukti)" ? "bg-blue-50 border-blue-200 text-blue-700 focus:ring-blue-400" :
                                                        order.status === "Selesai (Lunas)" ? "bg-emerald-50 border-emerald-200 text-emerald-700 focus:ring-emerald-400" :
                                                        order.status === "Dibatalkan" ? "bg-red-50 border-red-200 text-red-700 focus:ring-red-400" :
                                                        "bg-slate-50 border-slate-200 text-slate-700 focus:ring-slate-400"
                                                    }`}
                                                >
                                                    <option value="Menunggu Pembayaran">Menunggu Pembayaran</option>
                                                    <option value="Sudah Bayar (Mengecek Bukti)">Mengecek Bukti</option>
                                                    <option value="Selesai (Lunas)">Selesai (Lunas)</option>
                                                    <option value="Dibatalkan">Dibatalkan</option>
                                                </select>
                                            </div>

                                            <div className="pt-2 border-t border-slate-100 mt-2">
                                                <button 
                                                    onClick={() => handleDeleteOrder(order.id)}
                                                    className="w-full text-center text-xs bg-red-50 hover:bg-red-100 text-red-600 font-bold px-3 py-2 rounded-lg border border-red-200 transition-colors"
                                                >
                                                    🗑️ Hapus Pesanan
                                                </button>
                                            </div>
                                        </div>

                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* TAB 2: KELOLA KATALOG PRODUK (CRUD) */}
                {activeTab === 'products' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-fit">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">{editingProductId ? "📝 Edit Data Produk" : "✨ Tambah Produk Baru"}</h2>
                            <form onSubmit={handleSaveProduct} className="space-y-4">
                                <input type="text" placeholder="Nama Produk" className="w-full border p-3 rounded-xl text-sm" value={prodName} onChange={(e) => setProdName(e.target.value)} required />
                                <input type="number" placeholder="Harga (Rupiah)" className="w-full border p-3 rounded-xl text-sm" value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} required />
                                <input type="url" placeholder="URL Link Gambar" className="w-full border p-3 rounded-xl text-sm" value={prodImg} onChange={(e) => setProdImg(e.target.value)} required />
                                <div className="space-y-2 pt-2">
                                    <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold">{editingProductId ? "Simpan Perubahan" : "Terbitkan Produk"}</button>
                                    {editingProductId && <button type="button" onClick={handleCancelEdit} className="w-full bg-slate-100 text-slate-700 py-2 rounded-xl font-medium text-xs">Batalkan Edit</button>}
                                </div>
                            </form>
                        </div>
                        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">Katalog Aktif saat ini</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {products.length === 0 ? (
                                    <p className="text-sm text-slate-400 col-span-2 text-center py-8">Belum ada item produk terdaftar di database.</p>
                                ) : (
                                    products.map((prod) => (
                                        <div key={prod.id} className="flex gap-4 p-3 border border-slate-100 rounded-xl hover:shadow-md transition-shadow">
                                            <img src={prod.img} alt={prod.name} className="w-16 h-16 object-cover rounded-lg bg-slate-100 border flex-shrink-0" />
                                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                <div>
                                                    <h4 className="font-bold text-sm text-slate-900 truncate">{prod.name}</h4>
                                                    <p className="text-xs text-slate-600 font-semibold mt-0.5">Rp {prod.price.toLocaleString('id-ID')}</p>
                                                </div>
                                                <div className="flex gap-2 mt-2">
                                                    <button onClick={() => handleStartEdit(prod)} className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">Edit</button>
                                                    <button onClick={() => handleDeleteProduct(prod.id)} className="text-[11px] font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">Hapus</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* MODAL POPUP BUKTI PEMBAYARAN */}
            {selectedProofUrl && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200" 
                    onClick={() => setSelectedProofUrl(null)}
                >
                    <div 
                        className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" 
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-4 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900 text-lg">Bukti Pembayaran Pelanggan</h3>
                            <button 
                                onClick={() => setSelectedProofUrl(null)} 
                                className="text-slate-400 hover:text-red-500 hover:bg-red-50 w-8 h-8 rounded-full flex items-center justify-center transition-colors font-bold text-xl"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="p-4 bg-slate-50 flex justify-center items-center min-h-[300px] relative">
                            <img 
                                src={selectedProofUrl} 
                                alt="Bukti Transfer" 
                                className="max-h-[70vh] max-w-full object-contain rounded-lg border border-slate-200 shadow-sm" 
                            />
                        </div>
                        <div className="p-4 bg-white border-t border-slate-100 text-right">
                            <button 
                                onClick={() => setSelectedProofUrl(null)} 
                                className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-6 rounded-xl text-sm transition-colors"
                            >
                                Tutup Pratinjau
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}