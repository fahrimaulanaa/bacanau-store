import { NextRequest, NextResponse } from 'next/server';
import { adminDb, serializeFirestoreValue } from '../../../../lib/server/firebase-admin';

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!ORDER_ID_PATTERN.test(id)) {
      return NextResponse.json({ message: 'ID pesanan tidak valid.' }, { status: 400 });
    }

    const snapshot = await adminDb().collection('orders').doc(id).get();

    if (!snapshot.exists) {
      return NextResponse.json({ message: 'Data transaksi tidak ditemukan.' }, { status: 404 });
    }

    const data = snapshot.data() || {};

    return NextResponse.json({
      id: snapshot.id,
      customerName: data.customerName || 'Pelanggan',
      customerEmail: data.customerEmail || '',
      contactInfo: data.contactInfo || '-',
      domicile: data.domicile || '-',
      paymentMethod: data.paymentMethod || 'QRIS',
      basePayment: Number(data.basePayment) || 0,
      uniqueCode: Number(data.uniqueCode) || 0,
      voucherCode: data.voucherCode || '',
      voucherAmount: Number(data.voucherAmount) || 0,
      totalPayment: Number(data.totalPayment) || 0,
      items: Array.isArray(data.items) ? data.items : [],
      status: data.status || 'Menunggu Pembayaran',
      createdAt: serializeFirestoreValue(data.createdAt),
    });
  } catch {
    return NextResponse.json({ message: 'Gagal mengambil data transaksi.' }, { status: 500 });
  }
}
