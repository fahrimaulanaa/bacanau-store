import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, serializeFirestoreValue } from '../../../lib/server/firebase-admin';

const DEFAULT_CASHFLOW_TOKEN = 'bacanau';
const DEFAULT_ADMIN_CASHFLOW_TOKEN = 'fundrekaya';

type CashflowItem = {
  name: string;
  quantity: number;
  revenue: number;
  source: 'orders' | 'manual';
};

type OrderDoc = {
  id: string;
  status?: string;
  totalPayment?: number;
  items?: Array<{ name?: unknown; quantity?: unknown; price?: unknown }>;
};

type ManualEntryDoc = {
  id: string;
  productName?: string;
  quantity?: number;
  unitPrice?: number;
  soldAt?: string;
  note?: string;
  createdAt?: unknown;
};

function getCashflowToken(request: NextRequest) {
  return request.nextUrl.searchParams.get('token') || request.headers.get('x-cashflow-token') || '';
}

function isAuthorized(request: NextRequest) {
  const token = getCashflowToken(request);
  const userToken = process.env.CASHFLOW_TOKEN || DEFAULT_CASHFLOW_TOKEN;
  const adminToken = process.env.CASHFLOW_ADMIN_TOKEN || DEFAULT_ADMIN_CASHFLOW_TOKEN;
  return token === userToken || token === adminToken;
}

function isAdmin(request: NextRequest) {
  const token = getCashflowToken(request);
  return token === (process.env.CASHFLOW_ADMIN_TOKEN || DEFAULT_ADMIN_CASHFLOW_TOKEN);
}

function getCreatedAtMillis(createdAt: unknown) {
  if (!createdAt) return 0;
  if (typeof createdAt === 'object' && createdAt !== null && 'toDate' in createdAt && typeof createdAt.toDate === 'function') {
    return createdAt.toDate().getTime();
  }
  if (typeof createdAt === 'object' && createdAt !== null && 'seconds' in createdAt && typeof createdAt.seconds === 'number') {
    return createdAt.seconds * 1000;
  }
  const parsed = new Date(createdAt as string | number | Date).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mergeItem(acc: Record<string, CashflowItem>, name: string, quantity: number, revenue: number, source: CashflowItem['source']) {
  const cleanName = name.trim() || 'Produk tanpa nama';
  const key = cleanName.toLowerCase();
  const existing = acc[key] || { name: cleanName, quantity: 0, revenue: 0, source };

  acc[key] = {
    ...existing,
    quantity: existing.quantity + quantity,
    revenue: existing.revenue + revenue,
    source: existing.source === source ? source : 'manual',
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: 'Token cashflow tidak valid.' }, { status: 401 });
    }

    const db = adminDb();
    const [ordersSnapshot, manualSnapshot] = await Promise.all([
      db.collection('orders').get(),
      db.collection('cashflowEntries').get(),
    ]);
    const itemMap: Record<string, CashflowItem> = {};

    const orders = ordersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as OrderDoc[];
    const activeOrders = orders.filter((order) => order.status !== 'Dibatalkan');
    activeOrders.forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item: { name?: unknown; quantity?: unknown; price?: unknown }) => {
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        if (quantity <= 0 || price < 0) return;
        mergeItem(itemMap, String(item.name || ''), quantity, price * quantity, 'orders');
      });
    });

    const manualEntries = manualSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as ManualEntryDoc[];
    manualEntries.forEach((entry) => {
      const quantity = Number(entry.quantity) || 0;
      const unitPrice = Number(entry.unitPrice) || 0;
      if (quantity <= 0 || unitPrice < 0) return;
      mergeItem(itemMap, String(entry.productName || ''), quantity, quantity * unitPrice, 'manual');
    });

    const grossRevenue = activeOrders.reduce((sum, order) => sum + (Number(order.totalPayment) || 0), 0)
      + manualEntries.reduce((sum, entry) => sum + ((Number(entry.quantity) || 0) * (Number(entry.unitPrice) || 0)), 0);
    const completedRevenue = activeOrders
      .filter((order) => order.status === 'Selesai (Lunas)')
      .reduce((sum, order) => sum + (Number(order.totalPayment) || 0), 0);
    const totalItemsSold = Object.values(itemMap).reduce((sum, item) => sum + item.quantity, 0);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        grossRevenue,
        completedRevenue,
        totalOrders: activeOrders.length,
        totalManualEntries: manualEntries.length,
        totalItemsSold,
      },
      items: Object.values(itemMap).sort((a, b) => b.quantity - a.quantity),
      manualEntries: manualEntries
        .sort((a, b) => getCreatedAtMillis(b.createdAt) - getCreatedAtMillis(a.createdAt))
        .slice(0, 30)
        .map((entry) => serializeFirestoreValue(entry)),
    });
  } catch {
    return NextResponse.json({ message: 'Gagal mengambil data cashflow.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ message: 'Token admin tidak valid.' }, { status: 401 });
    }

    const body = await request.json();
    const productName = String(body.productName || '').trim();
    const quantity = Number(body.quantity);
    const unitPrice = Number(body.unitPrice);
    const soldAt = body.soldAt ? new Date(body.soldAt) : new Date();

    if (!productName || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || Number.isNaN(soldAt.getTime())) {
      return NextResponse.json({ message: 'Data cashflow tidak valid.' }, { status: 400 });
    }

    await adminDb().collection('cashflowEntries').add({
      productName,
      quantity,
      unitPrice,
      soldAt: soldAt.toISOString(),
      note: String(body.note || '').trim(),
      source: 'manual',
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Gagal menyimpan data cashflow.' }, { status: 500 });
  }
}
