import { NextResponse } from 'next/server';
import { adminDb, serializeFirestoreValue, verifyAdminRequest } from '../../../../lib/server/firebase-admin';

export async function GET(request: Request) {
  try {
    const admin = await verifyAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ message: 'Tidak terotorisasi.' }, { status: 401 });
    }

    const db = adminDb();
    const [ordersSnapshot, productsSnapshot] = await Promise.all([
      db.collection('orders').get(),
      db.collection('products').get(),
    ]);

    const orders = ordersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...serializeFirestoreValue(doc.data()) as Record<string, unknown>,
    }));

    const products = productsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...serializeFirestoreValue(doc.data()) as Record<string, unknown>,
    }));

    return NextResponse.json({ orders, products });
  } catch {
    return NextResponse.json({ message: 'Gagal mengambil data admin.' }, { status: 500 });
  }
}
