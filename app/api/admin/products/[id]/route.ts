import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { canManageCatalog } from '../../../../../lib/admin-access';
import { adminDb, verifyAdminRequest } from '../../../../../lib/server/firebase-admin';
import { supabaseAdmin } from '../../../../../lib/server/supabase-admin';
import { getDefaultCostPrice } from '../../../../../lib/product-cost';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 1_000_000;

function sanitizeProductName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'produk';
}

async function uploadProductImage(formData: FormData, productName: string, productId: string) {
  const imageFile = formData.get('image');
  if (!(imageFile instanceof File) || imageFile.size === 0) {
    return null;
  }

  if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
    throw new Error('INVALID_IMAGE_TYPE');
  }

  if (imageFile.size > MAX_FILE_SIZE) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  const extension = imageFile.type === 'image/png' ? 'png' : imageFile.type === 'image/webp' ? 'webp' : 'jpg';
  const filePath = `${productId}-${sanitizeProductName(productName)}-${Date.now()}.${extension}`;
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
      return NextResponse.json({ message: 'Akses kelola katalog hanya untuk admin utama.' }, { status: 403 });
    }

    const { id } = await context.params;
    const contentType = request.headers.get('content-type') || '';
    const updateData: Record<string, unknown> = {
      updatedBy: admin.email || admin.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const name = String(formData.get('name') || '').trim();
      const price = Number(String(formData.get('price') || '').replace(/[^0-9]/g, ''));
      const rawCostPrice = String(formData.get('costPrice') || '').replace(/[^0-9]/g, '');
      const costPrice = rawCostPrice ? Number(rawCostPrice) : getDefaultCostPrice(name);
      const category = String(formData.get('category') || 'Makanan').trim();
      const img = String(formData.get('img') || '');
      const uploadedUrl = name ? await uploadProductImage(formData, name, id) : null;

      if (!name || !category || !Number.isFinite(price) || price <= 0 || !Number.isFinite(costPrice) || costPrice < 0 || (!img && !uploadedUrl)) {
        return NextResponse.json({ message: 'Data produk tidak valid.' }, { status: 400 });
      }

      updateData.name = name;
      updateData.price = price;
      updateData.costPrice = costPrice;
      updateData.category = category;
      updateData.img = uploadedUrl || img;
    } else {
      const body = await request.json();
      if (typeof body.isActive === 'boolean') {
        updateData.isActive = body.isActive;
      }
    }

    await adminDb().collection('products').doc(id).update(updateData);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Gagal mengubah produk.' }, { status: 500 });
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
      return NextResponse.json({ message: 'Akses kelola katalog hanya untuk admin utama.' }, { status: 403 });
    }

    const { id } = await context.params;
    await adminDb().collection('products').doc(id).delete();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Gagal menghapus produk.' }, { status: 500 });
  }
}
