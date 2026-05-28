// app/api/qris/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Server Next.js kamu yang akan menembak API qrisku (Bebas dari blokir CORS!)
        const response = await fetch("https://qrisku.my.id/api", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        
        // Kembalikan hasilnya ke frontend kita
        return NextResponse.json(data);
    } catch {
        return NextResponse.json(
            { status: "error", message: "Gagal menghubungi server QRIS dari backend" }, 
            { status: 500 }
        );
    }
}
