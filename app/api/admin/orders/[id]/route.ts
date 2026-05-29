import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyAdminRequest } from '../../../../../lib/server/firebase-admin';

const ALLOWED_STATUSES = new Set([
  'Menunggu Pembayaran',
  'Sudah Bayar (Mengecek Bukti)',
  'Selesai (Lunas)',
  'Dibatalkan',
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ message: 'Tidak terotorisasi.' }, { status: 401 });
    }

    const { id } = await context.params;
    const { status } = await request.json();

    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ message: 'Status tidak valid.' }, { status: 400 });
    }

    await adminDb().collection('orders').doc(id).update({
      status,
      reviewedBy: admin.email || admin.uid,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Gagal mengubah status pesanan.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ message: 'Tidak terotorisasi.' }, { status: 401 });
    }

    const { id } = await context.params;
    await adminDb().collection('orders').doc(id).delete();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Gagal menghapus pesanan.' }, { status: 500 });
  }
}
