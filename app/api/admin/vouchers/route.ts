import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyAdminRequest } from '../../../../lib/server/firebase-admin';

const VOUCHER_CODE_PATTERN = /^[A-Z0-9-]{3,30}$/;

export async function POST(request: Request) {
  try {
    const admin = await verifyAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ message: 'Tidak terotorisasi.' }, { status: 401 });
    }

    const { code, amount, allowedProductIds } = await request.json();
    const normalizedCode = String(code || '').trim().toUpperCase();
    const parsedAmount = Number(String(amount || '').replace(/[^0-9]/g, ''));
    const normalizedAllowedProductIds = Array.isArray(allowedProductIds)
      ? allowedProductIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    if (!VOUCHER_CODE_PATTERN.test(normalizedCode)
      || !Number.isFinite(parsedAmount)
      || parsedAmount <= 0
      || normalizedAllowedProductIds.length === 0
    ) {
      return NextResponse.json({ message: 'Data voucher tidak valid.' }, { status: 400 });
    }

    const voucherRef = adminDb().collection('vouchers').doc(normalizedCode);
    const existingVoucher = await voucherRef.get();
    if (existingVoucher.exists) {
      return NextResponse.json({ message: 'Kode voucher sudah terdaftar.' }, { status: 409 });
    }

    await voucherRef.set({
      code: normalizedCode,
      amount: parsedAmount,
      allowedProductIds: normalizedAllowedProductIds,
      isActive: true,
      createdBy: admin.email || admin.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Gagal menyimpan voucher.' }, { status: 500 });
  }
}
