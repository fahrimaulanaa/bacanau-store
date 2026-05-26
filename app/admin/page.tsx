"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { collection, doc, updateDoc, deleteDoc, addDoc, onSnapshot } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../../lib/firebase'; 
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

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
    isActive?: boolean; // Properti untuk status aktif/suspend produk
}

const DASHBOARD_COLORS = ['#0f172a', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

function formatCurrency(value: number) {
    return `Rp ${value.toLocaleString('id-ID')}`;
}

function getCreatedAtDate(createdAt: any) {
    if (!createdAt) return null;

    if (typeof createdAt.toDate === 'function') {
        return createdAt.toDate();
    }

    if (typeof createdAt.seconds === 'number') {
        return new Date(createdAt.seconds * 1000);
    }

    const parsed = new Date(createdAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDayKey(date: Date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getDayLabel(date: Date) {
    return date.toLocaleDateString('id-ID', { weekday: 'short' });
}

export default function AdminPage() {
    // Auth States
    const [user, setUser] = useState<User | null>(null);
    const [email, setEmail] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [authLoading, setAuthLoading] = useState<boolean>(true);
    const [loginError, setLoginError] = useState<string>('');

    // Dashboard States
    const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'products'>('dashboard');
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
        });
        return () => unsubscribe();
    }, []);

    // REAL-TIME LISTENER (LIVE DETECT) FIRESTORE
    useEffect(() => {
        if (!user) {
            setOrders([]);
            setProducts([]);
            return;
        }

        setDataLoading(true);

        // 1. Live Listener untuk Koleksi Orders
        const unsubscribeOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
            const orderList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Order[];
            setOrders(orderList.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
            setDataLoading(false);
        }, (err) => {
            console.error("Gagal memuat data orders:", err);
            setDataLoading(false);
        });

        // 2. Live Listener untuk Koleksi Products
        const unsubscribeProducts = onSnapshot(collection(db, "products"), (snapshot) => {
            const prodList = snapshot.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id,
                    name: d.name || d.nama_produk || "Produk Tanpa Nama",
                    price: Number(d.price || d.harga_produk) || 0,
                    img: d.img || d.url_gambar || "",
                    isActive: d.isActive !== undefined ? d.isActive : true // Default true jika field belum ada
                };
            }) as Product[];
            setProducts(prodList);
        }, (err) => {
            console.error("Gagal memuat data products:", err);
        });

        return () => {
            unsubscribeOrders();
            unsubscribeProducts();
        };
    }, [user]);

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
        } catch (err) {
            alert("Gagal merubah status pesanan.");
        }
    };

    // FUNGSI PESANAN: Hapus Pesanan
    const handleDeleteOrder = async (orderId: string) => {
        if (!confirm("Apakah Anda yakin ingin menghapus pesanan ini secara permanen?")) return;
        try {
            await deleteDoc(doc(db, "orders", orderId));
        } catch (err) {
            alert("Gagal menghapus pesanan.");
        }
    };

    // LOGIKA & TEMPLATE: Generator Teks Hubungi via WA Otomatis
    const getWhatsAppLink = (order: Order) => {
        const contact = order.contactInfo;
        const cleaned = contact.replace(/\D/g, ''); 
        
        let phone = '';
        if (cleaned.startsWith('08')) {
            phone = `62${cleaned.substring(1)}`;
        } else if (cleaned.startsWith('628')) {
            phone = cleaned;
        } else {
            return null; 
        }

        const itemsText = order.items?.map(item => `${item.name} - ${item.quantity}x`).join('\n') || '';

        const messageTemplate = `Halo ${order.customerName}

Terima kasih telah melakukan pemesanan di BaCaNau store, berikut adalah daftar pesanan anda:

${itemsText}
Status Pesanan: ${order.status}

Pesananan kamu sekarang sudah terkonfirmasi ya, ditunggu untuk info pengambilan atau pengantaran dari kami.

Terima Kasih`;

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
                // Produk baru otomatis memiliki properti isActive: true
                await addDoc(collection(db, "products"), { ...productData, isActive: true });
                alert("Produk baru berhasil ditambahkan!");
            }
            setProdName(''); setProdPrice(''); setProdImg(''); setEditingProductId(null);
        } catch (err) {
            alert("Gagal menyimpan data produk.");
        }
    };

    // FUNGSI BARU: Toggle Suspend / Aktifkan Produk
    const handleToggleSuspend = async (productId: string, currentStatus: boolean) => {
        try {
            const productRef = doc(db, "products", productId);
            await updateDoc(productRef, { isActive: !currentStatus });
        } catch (err) {
            alert("Gagal mengubah status suspend produk.");
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
        } catch (err) {
            alert("Gagal menghapus produk.");
        }
    };

    const dashboardData = useMemo(() => {
        const totalOrders = orders.length;
        const totalProducts = products.length;
        const activeProducts = products.filter((product) => product.isActive ?? true).length;
        const suspendedProducts = totalProducts - activeProducts;
        const pendingOrders = orders.filter((order) => order.status === 'Menunggu Pembayaran').length;
        const reviewingOrders = orders.filter((order) => order.status === 'Sudah Bayar (Mengecek Bukti)').length;
        const completedOrders = orders.filter((order) => order.status === 'Selesai (Lunas)').length;
        const canceledOrders = orders.filter((order) => order.status === 'Dibatalkan').length;

        const grossRevenue = orders.reduce((sum, order) => sum + (Number(order.totalPayment) || 0), 0);
        const completedRevenue = orders
            .filter((order) => order.status === 'Selesai (Lunas)')
            .reduce((sum, order) => sum + (Number(order.totalPayment) || 0), 0);
        const averageOrderValue = totalOrders > 0 ? grossRevenue / totalOrders : 0;

        const statusCounts = [
            { name: 'Menunggu Pembayaran', value: pendingOrders },
            { name: 'Mengecek Bukti', value: reviewingOrders },
            { name: 'Selesai', value: completedOrders },
            { name: 'Dibatalkan', value: canceledOrders },
        ].filter((item) => item.value > 0);

        const paymentMethodCounts = orders.reduce<Record<string, number>>((acc, order) => {
            const method = order.paymentProofUrl || 'Tidak diketahui';
            acc[method] = (acc[method] || 0) + 1;
            return acc;
        }, {});

        const paymentMethodData = Object.entries(paymentMethodCounts).map(([name, value]) => ({ name, value }));

        const recentDays = Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() - (6 - index));
            return date;
        });

        const dailyCounts = recentDays.map((date) => {
            const key = getDayKey(date);
            const count = orders.filter((order) => {
                const orderDate = getCreatedAtDate(order.createdAt);
                return orderDate ? getDayKey(orderDate) === key : false;
            }).length;

            return {
                name: getDayLabel(date),
                count,
            };
        });

        const topItemsMap = orders.flatMap((order) => order.items || []).reduce<Record<string, { name: string; quantity: number; revenue: number }>>((acc, item) => {
            const quantity = Number(item.quantity) || 0;
            const revenue = (Number(item.price) || 0) * quantity;
            const current = acc[item.name] || { name: item.name, quantity: 0, revenue: 0 };

            acc[item.name] = {
                name: item.name,
                quantity: current.quantity + quantity,
                revenue: current.revenue + revenue,
            };

            return acc;
        }, {});

        const topItems = Object.values(topItemsMap)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);

        const recentOrders = [...orders]
            .sort((a, b) => {
                const dateA = getCreatedAtDate(a.createdAt)?.getTime() || 0;
                const dateB = getCreatedAtDate(b.createdAt)?.getTime() || 0;
                return dateB - dateA;
            })
            .slice(0, 5);

        return {
            totalOrders,
            totalProducts,
            activeProducts,
            suspendedProducts,
            pendingOrders,
            reviewingOrders,
            completedOrders,
            canceledOrders,
            grossRevenue,
            completedRevenue,
            averageOrderValue,
            statusCounts,
            paymentMethodData,
            dailyCounts,
            topItems,
            recentOrders,
        };
    }, [orders, products]);

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
                    
                    <div className="flex items-center gap-2 sm:gap-4">
                        <span className="text-xs text-slate-500 font-medium hidden md:inline">Logged as: {user.email}</span>
                        
                        <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200 flex items-center gap-1.5 select-none">
                            {dataLoading ? (
                                <>
                                    <span className="animate-spin inline-block">🔄</span> 
                                    <span>Sinkronisasi...</span>
                                </>
                            ) : (
                                <>
                                    <span>⚡</span> 
                                    <span>Live Connected</span>
                                </>
                            )}
                        </div>

                        <button 
                            onClick={handleLogout} 
                            className="text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl border border-red-200 transition-colors"
                        >
                            Keluar
                        </button>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex border-b border-slate-200 mb-6 gap-2">
                    <button onClick={() => setActiveTab('dashboard')} className={`py-2.5 px-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'dashboard' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        📊 Ringkasan ({orders.length} Pesanan)
                    </button>
                    <button onClick={() => setActiveTab('orders')} className={`py-2.5 px-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'orders' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        📦 Verifikasi Pesanan ({orders.length})
                    </button>
                    <button onClick={() => setActiveTab('products')} className={`py-2.5 px-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'products' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        👕 Kelola Katalog Produk ({products.length})
                    </button>
                </div>

                {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Total Pesanan</p>
                                <p className="text-3xl font-black text-slate-900 mt-3">{dashboardData.totalOrders}</p>
                                <p className="text-sm text-slate-500 mt-2">Semua pesanan yang tercatat di database.</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Pendapatan Kotor</p>
                                <p className="text-3xl font-black text-emerald-600 mt-3">{formatCurrency(dashboardData.grossRevenue)}</p>
                                <p className="text-sm text-slate-500 mt-2">Akumulasi total pembayaran dari semua pesanan.</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Pesanan Perlu Dicek</p>
                                <p className="text-3xl font-black text-amber-600 mt-3">{dashboardData.pendingOrders + dashboardData.reviewingOrders}</p>
                                <p className="text-sm text-slate-500 mt-2">Antrian yang belum selesai diproses.</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Produk Aktif</p>
                                <p className="text-3xl font-black text-slate-900 mt-3">{dashboardData.activeProducts}/{dashboardData.totalProducts}</p>
                                <p className="text-sm text-slate-500 mt-2">Katalog aktif dan yang sedang disuspend.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            <div className="xl:col-span-2 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <div className="flex items-start justify-between gap-4 mb-6">
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900">Pergerakan Pesanan 7 Hari</h2>
                                        <p className="text-sm text-slate-500">Frekuensi pesanan berdasarkan tanggal masuk.</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs uppercase font-bold text-slate-400">Rata-rata transaksi</p>
                                        <p className="text-lg font-black text-slate-900">{formatCurrency(dashboardData.averageOrderValue)}</p>
                                    </div>
                                </div>
                                <div className="h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={dashboardData.dailyCounts}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                                            <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                                            <Tooltip cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }} formatter={(value) => [String(value), 'Pesanan']} />
                                            <Bar dataKey="count" radius={[10, 10, 0, 0]} fill="#0f172a" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <h2 className="text-lg font-bold text-slate-900 mb-2">Distribusi Status</h2>
                                <p className="text-sm text-slate-500 mb-4">Ringkasan status pesanan saat ini.</p>
                                <div className="h-[220px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={dashboardData.statusCounts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={4}>
                                                {dashboardData.statusCounts.map((_, index) => (
                                                    <Cell key={`status-${index}`} fill={DASHBOARD_COLORS[index % DASHBOARD_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => [String(value), 'Pesanan']} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="space-y-3 mt-2">
                                    {dashboardData.statusCounts.map((item, index) => (
                                        <div key={item.name} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DASHBOARD_COLORS[index % DASHBOARD_COLORS.length] }} />
                                                <span className="text-slate-600 font-medium">{item.name}</span>
                                            </div>
                                            <span className="font-bold text-slate-900">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900">Produk Terlaris</h2>
                                        <p className="text-sm text-slate-500">Diurutkan berdasarkan jumlah item terjual.</p>
                                    </div>
                                    <div className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
                                        {dashboardData.completedRevenue > 0 ? formatCurrency(dashboardData.completedRevenue) : 'Belum ada penjualan selesai'}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {dashboardData.topItems.length === 0 ? (
                                        <div className="text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                                            Belum ada item yang bisa dirangkum dari pesanan.
                                        </div>
                                    ) : (
                                        dashboardData.topItems.map((item, index) => (
                                            <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                <div>
                                                    <p className="font-semibold text-slate-900">{item.name}</p>
                                                    <p className="text-xs text-slate-500">{item.quantity} item terjual</p>
                                                </div>
                                                <p className="text-sm font-bold text-slate-700">{formatCurrency(item.revenue)}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Pesanan Terbaru</h2>
                                <div className="space-y-3">
                                    {dashboardData.recentOrders.length === 0 ? (
                                        <div className="text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                                            Belum ada pesanan terbaru untuk ditampilkan.
                                        </div>
                                    ) : (
                                        dashboardData.recentOrders.map((order) => (
                                            <div key={order.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                <div>
                                                    <p className="font-semibold text-slate-900">{order.customerName}</p>
                                                    <p className="text-xs text-slate-500">{order.status}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-slate-900">{formatCurrency(Number(order.totalPayment) || 0)}</p>
                                                    <p className="text-xs text-slate-500">{getCreatedAtDate(order.createdAt)?.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) || 'Tanggal tidak tersedia'}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Selesai</p>
                                <p className="text-2xl font-black text-emerald-600 mt-2">{dashboardData.completedOrders}</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Menunggu</p>
                                <p className="text-2xl font-black text-slate-900 mt-2">{dashboardData.pendingOrders}</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Mengecek Bukti</p>
                                <p className="text-2xl font-black text-blue-600 mt-2">{dashboardData.reviewingOrders}</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Produk Disuspend</p>
                                <p className="text-2xl font-black text-red-600 mt-2">{dashboardData.suspendedProducts}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 1: VERIFIKASI PESANAN PEMBELI */}
                {activeTab === 'orders' && (
                    <div className="space-y-4">
                        {orders.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 font-medium shadow-sm">
                                Belum ada transaksi pesanan masuk.
                            </div>
                        ) : (
                            orders.map((order) => {
                                const waLink = getWhatsAppLink(order);

                                return (
                                    <div key={order.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row gap-5 justify-between hover:border-slate-300 transition-colors">
                                        
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

                {/* TAB 2: KELOLA KATALOG PRODUK */}
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
                                        <div key={prod.id} className={`flex gap-4 p-3 border rounded-xl transition-all ${prod.isActive ? 'border-slate-100 hover:shadow-md' : 'border-red-100 bg-red-50/20 opacity-75'}`}>
                                            <div className="relative flex-shrink-0">
                                                <img src={prod.img} alt={prod.name} className={`w-16 h-16 object-cover rounded-lg bg-slate-100 border ${!prod.isActive && 'grayscale'}`} />
                                                {!prod.isActive && <div className="absolute inset-0 bg-black/40 text-[9px] text-white font-black flex items-center justify-center rounded-lg">SUSPENDED</div>}
                                            </div>
                                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                <div>
                                                    <h4 className="font-bold text-sm text-slate-900 truncate">{prod.name}</h4>
                                                    <p className="text-xs text-slate-600 font-semibold mt-0.5">Rp {prod.price.toLocaleString('id-ID')}</p>
                                                </div>
                                                <div className="flex gap-1.5 mt-2 flex-wrap">
                                                    {/* TOMBOL TOGGLE SUSPEND / AKTIFKAN */}
                                                    <button 
                                                        type="button" 
                                                        onClick={() => handleToggleSuspend(prod.id, prod.isActive ?? true)} 
                                                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${prod.isActive ? 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100' : 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'}`}
                                                    >
                                                        {prod.isActive ? '⏸️ Suspend' : '▶️ Aktifkan'}
                                                    </button>
                                                    <button onClick={() => handleStartEdit(prod)} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">Edit</button>
                                                    <button onClick={() => handleDeleteProduct(prod.id)} className="text-[10px] font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">Hapus</button>
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