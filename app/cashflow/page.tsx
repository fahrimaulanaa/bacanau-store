"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type CashflowItem = {
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  source: string;
};

type CashflowData = {
  generatedAt: string;
  summary: {
    grossRevenue: number;
    completedRevenue: number;
    grossCost: number;
    grossProfit: number;
    completedCost: number;
    completedProfit: number;
    manualRevenue: number;
    manualCost: number;
    manualProfit: number;
    totalOrders: number;
    totalManualEntries: number;
    totalItemsSold: number;
  };
  items: CashflowItem[];
  manualEntries: Array<{
    id: string;
    productName?: string;
    quantity?: number;
    unitPrice?: number;
    unitCost?: number;
    soldAt?: string;
    note?: string;
  }>;
};

function formatCurrency(value: number) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

export default function CashflowPage() {
  const [token, setToken] = useState('');
  const [activeToken, setActiveToken] = useState('');
  const [data, setData] = useState<CashflowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const saldoSekarang = useMemo(() => {
    if (!data) return 0;
    return (Number(data.summary.completedRevenue) || 0) + (Number(data.summary.manualRevenue) || 0);
  }, [data]);

  const fetchCashflow = async (nextToken = activeToken) => {
    if (!nextToken) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/cashflow?token=${encodeURIComponent(nextToken)}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('TOKEN_INVALID');
      }
      setData(await response.json());
      setActiveToken(nextToken);
    } catch {
      setData(null);
      setError('Token tidak valid atau data cashflow gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      sessionStorage.removeItem('cashflowToken');
    };
  }, []);

  const handleSubmitToken = (event: React.FormEvent) => {
    event.preventDefault();
    void fetchCashflow(token.trim());
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight">BaCaNau Cashflow</h1>
            <p className="text-sm font-medium text-slate-500">Ringkasan pendapatan dan produk terjual.</p>
          </div>
          <Link href="/" className="w-fit rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
            Home
          </Link>
        </div>

        {!activeToken || !data ? (
          <form onSubmit={handleSubmitToken} className="max-w-md rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <label className="block text-xs font-bold uppercase text-slate-500">Token Cashflow</label>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900"
                required
              />
              <button type="submit" disabled={loading} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400">
                {loading ? 'Membuka...' : 'Masuk'}
              </button>
            </div>
            {error && <p className="mt-3 text-xs font-bold text-red-600">{error}</p>}
          </form>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-400">Pendapatan Kotor</p>
                <p className="mt-2 text-2xl font-black text-emerald-600">{formatCurrency(data.summary.grossRevenue)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-400">Total Modal</p>
                <p className="mt-2 text-2xl font-black text-amber-600">{formatCurrency(data.summary.grossCost)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-400">Keuntungan Kotor</p>
                <p className="mt-2 text-2xl font-black text-indigo-600">{formatCurrency(data.summary.grossProfit)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-400">Keuntungan Bersih</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{formatCurrency(data.summary.completedProfit)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-400">Item Terjual</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{data.summary.totalItemsSold.toLocaleString('id-ID')}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-400">Saldo Sekarang</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{formatCurrency(saldoSekarang)}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-black">Produk Terjual</h2>
                <button type="button" onClick={() => void fetchCashflow(activeToken)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                  Refresh
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Produk</th>
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3 text-right">Pendapatan</th>
                      <th className="px-3 py-3 text-right">Modal</th>
                      <th className="px-3 py-3 text-right">Profit</th>
                      <th className="px-3 py-3">Sumber</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.items.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Belum ada produk terjual.</td></tr>
                    ) : data.items.map((item) => (
                      <tr key={item.name}>
                        <td className="px-3 py-3 font-bold text-slate-900">{item.name}</td>
                        <td className="px-3 py-3 text-right font-semibold">{item.quantity.toLocaleString('id-ID')}</td>
                        <td className="px-3 py-3 text-right font-semibold">{formatCurrency(item.revenue)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-amber-600">{formatCurrency(item.cost)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-indigo-600">{formatCurrency(item.profit)}</td>
                        <td className="px-3 py-3 text-xs font-bold uppercase text-slate-400">{item.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
