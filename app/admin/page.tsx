"use client";

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../../lib/firebase'; // Sesuaikan path ke firebase.ts kamu

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
            // 1. Fetch Orders
            const orderSnap = await getDocs(collection(db, "orders"));
            const orderList = orderSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Order[];
            // Urutkan pesanan terbaru di atas
            setOrders(orderList.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));

            // 2. Fetch Products (Menggunakan nama collection "product-name" sesuai Firestore kamu)
            const prodSnap = await getDocs(collection(db, "products"));
            const prodList = prodSnap.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id,
                    name: d.name || d.nama_produk,
                    price: Number(d.price || d.harga_produk) || 0,
                    img: d.img || d.url_gambar
                };
            }) as Product[];
            setProducts(prodList);
        } catch (err) {
            console.error("Gagal memuat data admin:", err);
        } finally {
            setDataLoading(false);
        }
    };

    // Fungsi Login Admin
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err: any) {
            setLoginError("Email atau Password Admin salah!");
        }
    };

    // Fungsi Logout
    const handleLogout = () => {
        signOut(auth);
    };

    // FUNGSI 1: Verifikasi / Ubah Status Pesanan
    const handleUpdateStatus = async (orderId: string, newStatus: string) => {
        try {
            const orderRef = doc(db, "orders", orderId);
            await updateDoc(orderRef, { status: newStatus });
            alert(`Status pesanan berhasil diubah menjadi: ${newStatus}`);
            // Refresh tampilan data
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        } catch (err) {
            alert("Gagal merubah status pesanan.");
        }
    };

    // FUNGSI 2: Tambah atau Update Produk Baru di Firestore
    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prodName || !prodPrice || !prodImg) {
            alert("Mohon isi seluruh data produk.");
            return;
        }

        try {
            const productData = {
                name: prodName,
                price: Number(prodPrice.replace(/[^0-9]/g, '')),
                img: prodImg
            };

            if (editingProductId) {
                // Skenario Edit Produk Lama
                const prodRef = doc(db, "products", editingProductId);
                await updateDoc(prodRef, productData);
                alert("Produk berhasil diperbarui!");
            } else {
                // Skenario Tambah Produk Baru
                await addDoc(collection(db, "products"), productData);
                alert("Produk baru berhasil ditambahkan!");
            }

            // Reset Form & Reload
            setProdName('');
            setProdPrice('');
            setProdImg('');
            setEditingProductId(null);
            loadAdminData();
        } catch (err) {
            alert("Gagal menyimpan data produk.");
        }
    };

    // Ambil Data Produk ke Form untuk Proses Edit
    const handleStartEdit = (product: Product) => {
        setEditingProductId(product.id);
        setProdName(product.name);
        setProdPrice(product.price.toString());
        setProdImg(product.img);
    };

    // Batalkan Proses Edit Produk
    const handleCancelEdit = () => {
        setEditingProductId(null);
        setProdName('');
        setProdPrice('');
        setProdImg('');
    };

    // FUNGSI 3: Hapus Produk dari Firestore
    const handleDeleteProduct = async (productId: string) => {
        if (!confirm("Apakah Anda yakin ingin menghapus produk ini dari katalog?")) return;
        try {
            await deleteDoc(doc(db, "products", productId));
            alert("Produk berhasil dihapus!");
            setProducts(products.filter(p => p.id !== productId));
        } catch (err) {
            alert("Gagal menghapus produk.");
        }
    };

    if (authLoading) {
        return (
            <div className="min-h-screen bg-slate-900 flex justify-center items-center text-white font-sans">
                <p className="animate-pulse tracking-wide font-medium">Memverifikasi Otoritas Keamanan Admin...</p>
            </div>
        );
    }

    // TAMPILAN 1: JIKA BELUM LOGIN (FORM LOGIN ADMIN)
    if (!user) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans px-4">
                <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl max-w-md w-full text-white">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-black tracking-tight">ADMIN CENTRAL</h1>
                        <p className="text-xs text-slate-400 mt-1">Gunakan kredensial admin Bacanau Store untuk masuk</p>
                    </div>

                    {loginError && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs font-semibold mb-4 text-center">
                            {loginError}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 tracking-wider">Email Admin</label>
                            <input 
                                type="email" 
                                placeholder="admin@bacanau.com"
                                className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 tracking-wider">Password</label>
                            <input 
                                type="password" 
                                placeholder="••••••••"
                                className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <button 
                            type="submit" 
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold transition-colors text-sm shadow-md"
                        >
                            Masuk Ke Dashboard
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // TAMPILAN 2: JIKA SUDAH LOGIN (DASHBOARD KONTROL ADMIN)
    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
            {/* Top Navigation */}
            <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <span className="bg-slate-900 text-white text-xs font-black px-2 py-1 rounded">PRO</span>
                        <h1 className="text-xl font-black tracking-tight text-slate-900">BACANAU ADMIN</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500 font-medium hidden sm:inline">Logged as: {user.email}</span>
                        <button 
                            onClick={handleLogout}
                            className="text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl border border-red-200 transition-colors"
                        >
                            Keluar Panel
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main Area */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Menu Navigasi Tab */}
                <div className="flex border-b border-slate-200 mb-6 gap-2">
                    <button 
                        onClick={() => setActiveTab('orders')}
                        className={`py-2.5 px-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'orders' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        📦 Verifikasi Pesanan ({orders.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('products')}
                        className={`py-2.5 px-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'products' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        👕 Kelola Katalog Produk ({products.length})
                    </button>
                </div>

                {dataLoading && (
                    <p className="text-xs text-slate-500 animate-pulse font-medium mb-4">Menyinkronkan data cloud Firestore...</p>
                )}

                {/* TAB 1: VERIFIKASI PESANAN PEMBELI */}
                {activeTab === 'orders' && (
                    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="bg-slate-900 text-white font-bold text-xs uppercase tracking-wider">
                                        <th className="p-4">Detail Pembeli</th>
                                        <th className="p-4">Item Belanja</th>
                                        <th className="p-4 text-right">Total Bayar</th>
                                        <th className="p-4 text-center">Bukti Supabase</th>
                                        <th className="p-4 text-center">Status Transaksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {orders.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="text-center p-8 text-slate-400">Belum ada transaksi pesanan masuk.</td>
                                        </tr>
                                    ) : (
                                        orders.map((order) => (
                                            <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="p-4 space-y-1">
                                                    <p className="font-bold text-slate-900">{order.customerName}</p>
                                                    <p className="text-xs text-slate-500 font-medium">📍 Kampus {order.domicile}</p>
                                                    <p className="text-xs text-slate-500 font-mono">📱 {order.contactInfo}</p>
                                                    <p className="text-[10px] text-slate-400">ID: {order.id}</p>
                                                </td>
                                                <td className="p-4 max-w-xs">
                                                    <ul className="space-y-1 text-xs">
                                                        {order.items?.map((item, idx) => (
                                                            <li key={idx} className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded inline-block mr-1 mb-1">
                                                                {item.name} <span className="font-bold text-slate-900">({item.quantity}x)</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </td>
                                                <td className="p-4 text-right font-extrabold text-slate-950 whitespace-nowrap">
                                                    Rp {(order.totalPayment || 0).toLocaleString('id-ID')}
                                                </td>
                                                <td className="p-4 text-center">
                                                    {order.paymentProofUrl ? (
                                                        <a 
                                                            href={order.paymentProofUrl} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold px-3 py-1.5 rounded-xl inline-flex items-center gap-1 border border-indigo-200 shadow-sm transition-all"
                                                        >
                                                            👁️ Lihat Gambar
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">Belum Upload</span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <select 
                                                        value={order.status}
                                                        onChange={(e) => handleUpdateStatus(order.id, e.target.value)}
                                                        className={`text-xs font-bold p-2 rounded-xl border cursor-pointer focus:outline-none focus:ring-2 ${
                                                            order.status === "Sudah Bayar (Mengecek Bukti)" ? "bg-blue-50 border-blue-200 text-blue-600 focus:ring-blue-400" :
                                                            order.status === "Selesai (Lunas)" ? "bg-emerald-50 border-emerald-200 text-emerald-600 focus:ring-emerald-400" :
                                                            order.status === "Dibatalkan" ? "bg-red-50 border-red-200 text-red-600 focus:ring-red-400" :
                                                            "bg-amber-50 border-amber-200 text-amber-600 focus:ring-amber-400"
                                                        }`}
                                                    >
                                                        <option value="Menunggu Pembayaran">Menunggu Pembayaran</option>
                                                        <option value="Sudah Bayar (Mengecek Bukti)">Mengecek Bukti</option>
                                                        <option value="Selesai (Lunas)">Selesai (Lunas)</option>
                                                        <option value="Dibatalkan">Dibatalkan</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* TAB 2: KELOLA KATALOG PRODUK (CRUD) */}
                {activeTab === 'products' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Kolom Kiri: Form Tambah/Edit */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-fit">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">
                                {editingProductId ? "📝 Edit Data Produk" : "✨ Tambah Produk Baru"}
                            </h2>
                            <form onSubmit={handleSaveProduct} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nama Produk</label>
                                    <input 
                                        type="text" 
                                        placeholder="Contoh: Cookies Macadamia"
                                        className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                                        value={prodName}
                                        onChange={(e) => setProdName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Harga (Rupiah)</label>
                                    <input 
                                        type="number" 
                                        placeholder="Contoh: 27000"
                                        className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                                        value={prodPrice}
                                        onChange={(e) => setProdPrice(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">URL Link Gambar</label>
                                    <input 
                                        type="url" 
                                        placeholder="https://link-gambar.com/foto.jpg"
                                        className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                                        value={prodImg}
                                        onChange={(e) => setProdImg(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="space-y-2 pt-2">
                                    <button 
                                        type="submit" 
                                        className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold transition-colors text-sm shadow-sm"
                                    >
                                        {editingProductId ? "Simpan Perubahan" : "Terbitkan Produk"}
                                    </button>
                                    {editingProductId && (
                                        <button 
                                            type="button" 
                                            onClick={handleCancelEdit}
                                            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl font-medium text-xs transition-colors"
                                        >
                                            Batalkan Edit
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* Kolom Kanan: Daftar Katalog Produk Aktif */}
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
                                                    <button 
                                                        onClick={() => handleStartEdit(prod)}
                                                        className="text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-100 transition-colors"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteProduct(prod.id)}
                                                        className="text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg border border-red-100 transition-colors"
                                                    >
                                                        Hapus
                                                    </button>
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
        </div>
    );
}