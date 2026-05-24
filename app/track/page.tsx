"use client";

import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Link from 'next/link';

export default function TrackPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [allOrders, setAllOrders] = useState<any[]>([]);
    const [filteredOrders, setFilteredOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const snap = await getDocs(collection(db, "orders"));
                const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAllOrders(data);
            } catch (error) {
                console.error("Gagal memuat data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchOrders();
    }, []);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const query = searchQuery.toLowerCase().trim();
        
        if (!query) {
            setFilteredOrders([]);
            return;
        }

        const results = allOrders.filter(order => 
            order.id.toLowerCase().includes(query) ||
            (order.customerName && order.customerName.toLowerCase().includes(query)) ||
            (order.contactInfo && order.contactInfo.toLowerCase().includes(query))
        );
        setFilteredOrders(results);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans py-12 px-4">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-black text-center mb-2">Lacak Pesanan</h1>
                <p className="text-center text-slate-500 text-sm mb-8">Cari berdasarkan ID Pesanan, Nama, atau No. Kontak</p>

                <form onSubmit={handleSearch} className="flex gap-2 mb-8">
                    <input 
                        type="text" 
                        placeholder="Masukkan kata kunci pencarian..." 
                        className="flex-1 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 outline-none"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button type="submit" className="bg-slate-900 text-white px-6 py-4 rounded-xl font-bold hover:bg-slate-800 transition-colors">
                        Cari
                    </button>
                </form>

                {loading ? (
                    <p className="text-center text-slate-500 animate-pulse">Memuat database...</p>
                ) : filteredOrders.length > 0 ? (
                    <div className="space-y-4">
                        {filteredOrders.map(order => (
                            <div key={order.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row justify-between gap-4">
                                <div>
                                    <p className="font-bold text-lg">{order.customerName}</p>
                                    <p className="text-xs text-slate-500 font-mono mb-2">ID: {order.id}</p>
                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                                        order.status === "Selesai (Lunas)" ? "bg-emerald-100 text-emerald-700" :
                                        "bg-amber-100 text-amber-700"
                                    }`}>
                                        {order.status}
                                    </span>
                                </div>
                                <div className="text-left sm:text-right">
                                    <p className="text-xs text-slate-500 uppercase font-bold mb-1">Total Tagihan</p>
                                    <p className="font-black text-xl text-slate-900">Rp {(order.totalPayment || 0).toLocaleString('id-ID')}</p>
                                    {order.status !== "Selesai (Lunas)" && (
                                        <Link href={`/checkout/pay?id=${order.id}`} className="text-xs text-indigo-600 font-bold hover:underline mt-2 inline-block">
                                            Lanjutkan Pembayaran ➔
                                        </Link>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : searchQuery && (
                    <div className="text-center p-8 bg-white rounded-2xl border border-slate-100">
                        <span className="text-4xl mb-2 block">📭</span>
                        <p className="font-bold text-slate-700">Pesanan tidak ditemukan</p>
                        <p className="text-sm text-slate-500 mt-1">Pastikan ID, nama, atau kontak sudah diketik dengan benar.</p>
                    </div>
                )}
            </div>
        </div>
    );
}