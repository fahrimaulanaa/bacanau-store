import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { canManageCatalog } from '../../../../../lib/admin-access';
import { adminDb, verifyAdminRequest } from '../../../../../lib/server/firebase-admin';

const VOUCHER_CODE_PATTERN = /^[A-Z0-9-]{3,30}$/;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ message: 'Tidak terotorisasi.' }, { status: 401 });
    }
    if (!canManageCatalog(admin.email)) {
      return NextResponse.json({ message: 'Akses kelola voucher hanya untuk admin utama.' }, { status: 403 });
    }

    const { id } = await context.params;
    const normalizedCode = String(id || '').trim().toUpperCase();
    if (!VOUCHER_CODE_PATTERN.test(normalizedCode)) {
      return NextResponse.json({ message: 'Kode voucher tidak valid.' }, { status: 400 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {
      updatedBy: admin.email || admin.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (body.amount !== undefined) {
      const parsedAmount = Number(String(body.amount || '').replace(/[^0-9]/g, ''));
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return NextResponse.json({ message: 'Nominal voucher tidak valid.' }, { status: 400 });
      }
      updateData.amount = parsedAmount;
    }

    if (typeof body.isActive === 'boolean') {
      updateData.isActive = body.isActive;
    }

    if (body.allowedProductIds !== undefined) {
      const normalizedAllowedProductIds = Array.isArray(body.allowedProductIds)
        ? body.allowedProductIds.map((id: unknown) => String(id)).filter(Boolean)
        : [];
      if (normalizedAllowedProductIds.length === 0) {
        return NextResponse.json({ message: 'Produk voucher harus dipilih.' }, { status: 400 });
      }
      updateData.allowedProductIds = normalizedAllowedProductIds;
    }

    if (Object.keys(updateData).length === 2) {
      return NextResponse.json({ message: 'Tidak ada perubahan voucher.' }, { status: 400 });
    }

    const voucherRef = adminDb().collection('vouchers').doc(normalizedCode);
    const snapshot = await voucherRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ message: 'Voucher tidak ditemukan.' }, { status: 404 });
    }

    await voucherRef.update(updateData);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Gagal memperbarui voucher.' }, { status: 500 });
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
    if (!canManageCatalog(admin.email)) {
      return NextResponse.json({ message: 'Akses kelola voucher hanya untuk admin utama.' }, { status: 403 });
    }

    const { id } = await context.params;
    const normalizedCode = String(id || '').trim().toUpperCase();
    if (!VOUCHER_CODE_PATTERN.test(normalizedCode)) {
      return NextResponse.json({ message: 'Kode voucher tidak valid.' }, { status: 400 });
    }

    await adminDb().collection('vouchers').doc(normalizedCode).delete();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Gagal menghapus voucher.' }, { status: 500 });
  }
}
