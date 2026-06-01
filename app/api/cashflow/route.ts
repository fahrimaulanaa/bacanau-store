import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, serializeFirestoreValue } from '../../../lib/server/firebase-admin';
import { getDefaultCostPrice, resolveCostPrice } from '../../../lib/product-cost';

const DEFAULT_CASHFLOW_TOKEN = 'bacanau';
const DEFAULT_ADMIN_CASHFLOW_TOKEN = 'fundrekaya';

type CashflowItem = {
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  source: 'orders' | 'manual';
};

type OrderDoc = {
  id: string;
  status?: string;
  totalPayment?: number;
  items?: Array<{ id?: unknown; name?: unknown; quantity?: unknown; price?: unknown; costPrice?: unknown }>;
};

type ProductDoc = {
  id: string;
  name?: unknown;
  costPrice?: unknown;
};

type ManualEntryDoc = {
  id: string;
  productName?: string;
  quantity?: number;
  unitPrice?: number;
  unitCost?: number;
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

function mergeItem(acc: Record<string, CashflowItem>, name: string, quantity: number, revenue: number, cost: number, source: CashflowItem['source']) {
  const cleanName = name.trim() || 'Produk tanpa nama';
  const key = cleanName.toLowerCase();
  const existing = acc[key] || { name: cleanName, quantity: 0, revenue: 0, cost: 0, profit: 0, source };

  acc[key] = {
    ...existing,
    quantity: existing.quantity + quantity,
    revenue: existing.revenue + revenue,
    cost: existing.cost + cost,
    profit: existing.profit + (revenue - cost),
    source: existing.source === source ? source : 'manual',
  };
}

function buildProductCostMaps(products: ProductDoc[]) {
  return {
    byId: new Map(products.map((product) => [product.id, resolveCostPrice(product)])),
    byName: new Map(products.map((product) => [String(product.name || '').toLowerCase(), resolveCostPrice(product)])),
  };
}

function resolveItemUnitCost(
  item: { id?: unknown; name?: unknown; costPrice?: unknown },
  productCosts: ReturnType<typeof buildProductCostMaps>,
) {
  const explicitCost = Number(item.costPrice);
  if (Number.isFinite(explicitCost) && explicitCost >= 0) return explicitCost;
  const productId = String(item.id || '');
  const productName = String(item.name || '').toLowerCase();
  return productCosts.byId.get(productId) ?? productCosts.byName.get(productName) ?? getDefaultCostPrice(item.name);
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: 'Token cashflow tidak valid.' }, { status: 401 });
    }

    const db = adminDb();
    const [ordersSnapshot, manualSnapshot, productsSnapshot] = await Promise.all([
      db.collection('orders').get(),
      db.collection('cashflowEntries').get(),
      db.collection('products').get(),
    ]);
    const itemMap: Record<string, CashflowItem> = {};

    const orders = ordersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as OrderDoc[];
    const products = productsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as ProductDoc[];
    const productCosts = buildProductCostMaps(products);
    const activeOrders = orders.filter((order) => order.status !== 'Dibatalkan');
    activeOrders.forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item) => {
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const cost = resolveItemUnitCost(item, productCosts);
        if (quantity <= 0 || price < 0) return;
        mergeItem(itemMap, String(item.name || ''), quantity, price * quantity, cost * quantity, 'orders');
      });
    });

    const manualEntries = manualSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as ManualEntryDoc[];
    manualEntries.forEach((entry) => {
      const quantity = Number(entry.quantity) || 0;
      const unitPrice = Number(entry.unitPrice) || 0;
      const unitCost = Number.isFinite(Number(entry.unitCost)) ? Number(entry.unitCost) : getDefaultCostPrice(entry.productName);
      if (quantity <= 0 || unitPrice < 0) return;
      mergeItem(itemMap, String(entry.productName || ''), quantity, quantity * unitPrice, quantity * unitCost, 'manual');
    });

    const manualRevenue = manualEntries.reduce((sum, entry) => sum + ((Number(entry.quantity) || 0) * (Number(entry.unitPrice) || 0)), 0);
    const manualCost = manualEntries.reduce((sum, entry) => {
      const quantity = Number(entry.quantity) || 0;
      const unitCost = Number.isFinite(Number(entry.unitCost)) ? Number(entry.unitCost) : getDefaultCostPrice(entry.productName);
      return sum + (quantity * unitCost);
    }, 0);
    const activeOrderCost = activeOrders.reduce((sum, order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      return sum + items.reduce((itemSum, item) => {
        const quantity = Number(item.quantity) || 0;
        return itemSum + (resolveItemUnitCost(item, productCosts) * quantity);
      }, 0);
    }, 0);
    const completedOrders = activeOrders.filter((order) => order.status === 'Selesai (Lunas)');
    const completedCost = completedOrders.reduce((sum, order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      return sum + items.reduce((itemSum, item) => {
        const quantity = Number(item.quantity) || 0;
        return itemSum + (resolveItemUnitCost(item, productCosts) * quantity);
      }, 0);
    }, 0);
    const grossRevenue = activeOrders.reduce((sum, order) => sum + (Number(order.totalPayment) || 0), 0)
      + manualRevenue;
    const completedRevenue = completedOrders
      .reduce((sum, order) => sum + (Number(order.totalPayment) || 0), 0);
    const grossCost = activeOrderCost + manualCost;
    const completedProfit = (completedRevenue - completedCost) + (manualRevenue - manualCost);
    const totalItemsSold = Object.values(itemMap).reduce((sum, item) => sum + item.quantity, 0);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        grossRevenue,
        completedRevenue,
        grossCost,
        grossProfit: grossRevenue - grossCost,
        completedCost,
        completedProfit,
        manualRevenue,
        manualCost,
        manualProfit: manualRevenue - manualCost,
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
    const unitCost = body.unitCost === undefined || body.unitCost === ''
      ? getDefaultCostPrice(productName)
      : Number(body.unitCost);
    const soldAt = body.soldAt ? new Date(body.soldAt) : new Date();

    if (!productName || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(unitCost) || unitCost < 0 || Number.isNaN(soldAt.getTime())) {
      return NextResponse.json({ message: 'Data cashflow tidak valid.' }, { status: 400 });
    }

    await adminDb().collection('cashflowEntries').add({
      productName,
      quantity,
      unitPrice,
      unitCost,
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
