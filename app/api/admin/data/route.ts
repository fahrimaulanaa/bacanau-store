import { NextResponse } from 'next/server';
import { adminDb, serializeFirestoreValue, verifyAdminRequest } from '../../../../lib/server/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const DEFAULT_FIRESTORE_DAILY_READ_LIMIT = 50_000;

function getJakartaDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function GET(request: Request) {
  try {
    const admin = await verifyAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ message: 'Tidak terotorisasi.' }, { status: 401 });
    }

    const db = adminDb();
    const [ordersSnapshot, productsSnapshot, vouchersSnapshot] = await Promise.all([
      db.collection('orders').get(),
      db.collection('products').get(),
      db.collection('vouchers').get(),
    ]);
    const estimatedReadCount = ordersSnapshot.size + productsSnapshot.size + vouchersSnapshot.size;
    const dailyReadLimit = Number(process.env.FIRESTORE_DAILY_READ_LIMIT || DEFAULT_FIRESTORE_DAILY_READ_LIMIT);
    const usageRef = db.collection('_systemMetrics').doc(`firestoreReads-${getJakartaDateKey()}`);
    const usageSnapshot = await usageRef.get();
    const currentTrackedReads = Number(usageSnapshot.data()?.trackedReads || 0);
    const trackedReadsToday = currentTrackedReads + estimatedReadCount + 1;

    await usageRef.set({
      trackedReads: FieldValue.increment(estimatedReadCount + 1),
      lastAdminReadEstimate: estimatedReadCount,
      dailyReadLimit,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const orders = ordersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...serializeFirestoreValue(doc.data()) as Record<string, unknown>,
    }));

    const products = productsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...serializeFirestoreValue(doc.data()) as Record<string, unknown>,
    }));

    const vouchers = vouchersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...serializeFirestoreValue(doc.data()) as Record<string, unknown>,
    }));

    return NextResponse.json({
      orders,
      products,
      vouchers,
      databaseStatus: {
        trackedReadsToday,
        dailyReadLimit,
        remainingReads: Math.max(dailyReadLimit - trackedReadsToday, 0),
        usagePercent: dailyReadLimit > 0 ? Math.min((trackedReadsToday / dailyReadLimit) * 100, 100) : 0,
        lastAdminReadEstimate: estimatedReadCount,
        scope: 'Estimasi read yang dilacak dari API admin, bukan angka resmi Google Cloud.',
      },
    });
  } catch {
    return NextResponse.json({ message: 'Gagal mengambil data admin.' }, { status: 500 });
  }
}
