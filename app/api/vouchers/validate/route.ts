import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/server/firebase-admin';

const VOUCHER_CODE_PATTERN = /^[A-Z0-9-]{3,30}$/;

export async function POST(request: Request) {
  try {
    const { code, items } = await request.json();
    const normalizedCode = String(code || '').trim().toUpperCase();

    if (!VOUCHER_CODE_PATTERN.test(normalizedCode)) {
      return NextResponse.json({ message: 'Kode voucher tidak valid.' }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ message: 'Data keranjang tidak valid.' }, { status: 400 });
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

    const allowedProductIds = Array.isArray(voucherData.allowedProductIds)
      ? voucherData.allowedProductIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    if (allowedProductIds.length === 0) {
      return NextResponse.json({ message: 'Voucher belum diatur untuk produk tertentu.' }, { status: 400 });
    }

    const eligibleProducts = new Set(allowedProductIds);
    const eligibleSubtotal = items.reduce((sum: number, item: unknown) => {
      if (!item || typeof item !== 'object') {
        return sum;
      }

      const rawId = (item as { id?: unknown }).id;
      if (!eligibleProducts.has(String(rawId))) {
        return sum;
      }

      const rawPrice = (item as { price?: unknown }).price;
      const rawQuantity = (item as { quantity?: unknown }).quantity;
      const price = typeof rawPrice === 'number'
        ? rawPrice
        : Number(String(rawPrice || '').replace(/[^0-9]/g, ''));
      const quantity = Number(rawQuantity) || 0;

      if (!Number.isFinite(price) || price <= 0 || quantity <= 0) {
        return sum;
      }

      return sum + price * quantity;
    }, 0);

    if (!Number.isFinite(eligibleSubtotal) || eligibleSubtotal <= 0) {
      return NextResponse.json({ message: 'Voucher tidak berlaku untuk produk di keranjang.' }, { status: 400 });
    }

    const appliedAmount = Math.min(amount, eligibleSubtotal);

    return NextResponse.json({
      code: normalizedCode,
      amount,
      appliedAmount,
      eligibleSubtotal,
      allowedProductIds,
    });
  } catch {
    return NextResponse.json({ message: 'Gagal memvalidasi voucher.' }, { status: 500 });
  }
}
