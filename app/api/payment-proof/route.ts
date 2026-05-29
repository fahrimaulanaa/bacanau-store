import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../../../lib/server/firebase-admin';
import { supabaseAdmin } from '../../../lib/server/supabase-admin';
import Tesseract from 'tesseract.js';

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_FILE_SIZE = 1_500_000;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function verifyNominalFromProof(fileBuffer: Buffer, totalPayment: number) {
  try {
    const { data: { text } } = await Tesseract.recognize(fileBuffer, 'ind');
    const targetNominal = totalPayment.toString();
    const lowerText = text.toLowerCase();

    if (!lowerText.includes('rp')) {
      return false;
    }

    const matches = text.match(/\d+[\.,]?\d*/g);
    if (!matches) {
      return false;
    }

    return matches.some((match) => {
      const cleanDigits = match.replace(/[,\.]/g, '');
      return cleanDigits === targetNominal || cleanDigits === `${targetNominal}00` || cleanDigits === `${targetNominal}0`;
    });
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const orderId = String(formData.get('orderId') || '');
    const proofFile = formData.get('file');

    if (!ORDER_ID_PATTERN.test(orderId)) {
      return NextResponse.json({ message: 'ID pesanan tidak valid.' }, { status: 400 });
    }

    if (!(proofFile instanceof File)) {
      return NextResponse.json({ message: 'Bukti bayar wajib berupa gambar.' }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(proofFile.type)) {
      return NextResponse.json({ message: 'Format bukti bayar tidak didukung.' }, { status: 415 });
    }

    if (proofFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ message: 'Ukuran bukti bayar terlalu besar.' }, { status: 413 });
    }

    const db = adminDb();
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnapshot = await orderRef.get();

    if (!orderSnapshot.exists) {
      return NextResponse.json({ message: 'Pesanan tidak ditemukan.' }, { status: 404 });
    }

    const orderData = orderSnapshot.data() || {};
    if (orderData.status === 'Selesai (Lunas)' || orderData.status === 'Dibatalkan') {
      return NextResponse.json({ message: 'Pesanan ini tidak menerima bukti bayar baru.' }, { status: 409 });
    }

    const extension = proofFile.type === 'image/png' ? 'png' : proofFile.type === 'image/webp' ? 'webp' : 'jpg';
    const filePath = `${orderId}/${Date.now()}-bukti.${extension}`;
    const fileBuffer = Buffer.from(await proofFile.arrayBuffer());
    const totalPayment = Number(orderData.totalPayment) || 0;
    const autoVerified = totalPayment > 0 && await verifyNominalFromProof(fileBuffer, totalPayment);
    const nextStatus = autoVerified ? 'Selesai (Lunas)' : 'Sudah Bayar (Mengecek Bukti)';

    const storage = supabaseAdmin().storage.from('bukti-pembayaran');
    const { error: uploadError } = await storage.upload(filePath, fileBuffer, {
      contentType: proofFile.type,
      cacheControl: '3600',
      upsert: false,
    });

    if (uploadError) {
      return NextResponse.json({ message: 'Gagal menyimpan bukti bayar.' }, { status: 500 });
    }

    const { data: { publicUrl } } = storage.getPublicUrl(filePath);

    await orderRef.update({
      paymentProofUrl: publicUrl,
      paymentProofPath: filePath,
      proofSubmittedAt: FieldValue.serverTimestamp(),
      status: nextStatus,
      autoVerified,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ status: autoVerified ? 'auto_verified' : 'queued_for_review', autoVerified });
  } catch {
    return NextResponse.json({ message: 'Gagal memproses bukti bayar.' }, { status: 500 });
  }
}
