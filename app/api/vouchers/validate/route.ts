import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/server/firebase-admin';

const VOUCHER_CODE_PATTERN = /^[A-Z0-9-]{3,30}$/;

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    const normalizedCode = String(code || '').trim().toUpperCase();

    if (!VOUCHER_CODE_PATTERN.test(normalizedCode)) {
      return NextResponse.json({ message: 'Kode voucher tidak valid.' }, { status: 400 });
    }

    const voucherSnapshot = await adminDb().collection('vouchers').doc(normalizedCode).get();
    if (!voucherSnapshot.exists) {
      return NextResponse.json({ message: 'Voucher tidak ditemukan.' }, { status: 404 });
    }

    const voucherData = voucherSnapshot.data() || {};
    if (voucherData.isActive === false) {
      return NextResponse.json({ message: 'Voucher tidak aktif.' }, { status: 400 });
    }

    const amount = Number(voucherData.amount) || 0;
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ message: 'Voucher tidak valid.' }, { status: 400 });
    }

    return NextResponse.json({ code: normalizedCode, amount });
  } catch {
    return NextResponse.json({ message: 'Gagal memvalidasi voucher.' }, { status: 500 });
  }
}
