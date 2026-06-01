import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyAdminRequest } from '../../../../lib/server/firebase-admin';
import { supabaseAdmin } from '../../../../lib/server/supabase-admin';
import { getDefaultCostPrice } from '../../../../lib/product-cost';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 1_000_000;

function sanitizeProductName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'produk';
}

async function resolveProductImage(formData: FormData, productName: string, fallbackUrl = '') {
  const imageFile = formData.get('image');
  const imageUrl = String(formData.get('img') || fallbackUrl || '');

  if (!(imageFile instanceof File) || imageFile.size === 0) {
    return imageUrl;
  }

  if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
    throw new Error('INVALID_IMAGE_TYPE');
  }

  if (imageFile.size > MAX_FILE_SIZE) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  const extension = imageFile.type === 'image/png' ? 'png' : imageFile.type === 'image/webp' ? 'webp' : 'jpg';
  const filePath = `${Date.now()}-${sanitizeProductName(productName)}.${extension}`;
  const fileBuffer = Buffer.from(await imageFile.arrayBuffer());
  const storage = supabaseAdmin().storage.from('produk');
  const { error } = await storage.upload(filePath, fileBuffer, {
    contentType: imageFile.type,
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    throw new Error('UPLOAD_FAILED');
  }

  const { data: { publicUrl } } = storage.getPublicUrl(filePath);
  return publicUrl;
}

export async function POST(request: Request) {
  try {
    const admin = await verifyAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ message: 'Tidak terotorisasi.' }, { status: 401 });
    }

    const formData = await request.formData();
    const name = String(formData.get('name') || '').trim();
    const price = Number(String(formData.get('price') || '').replace(/[^0-9]/g, ''));
    const rawCostPrice = String(formData.get('costPrice') || '').replace(/[^0-9]/g, '');
    const costPrice = rawCostPrice ? Number(rawCostPrice) : getDefaultCostPrice(name);
    const category = String(formData.get('category') || 'Makanan').trim();

    if (!name || !category || !Number.isFinite(price) || price <= 0 || !Number.isFinite(costPrice) || costPrice < 0) {
      return NextResponse.json({ message: 'Data produk tidak valid.' }, { status: 400 });
    }

    const img = await resolveProductImage(formData, name);
    if (!img) {
      return NextResponse.json({ message: 'Gambar produk wajib diisi.' }, { status: 400 });
    }

    await adminDb().collection('products').add({
      name,
      price,
      costPrice,
      img,
      category,
      isActive: true,
      createdBy: admin.email || admin.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Gagal menyimpan produk.' }, { status: 500 });
  }
}
