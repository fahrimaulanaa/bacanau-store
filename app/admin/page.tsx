"use client";

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../../lib/firebase'; 
import imageCompression from 'browser-image-compression';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface OrderItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

interface Order {
    id: string;
    customerName: string;
    contactInfo: string;
    domicile: string;
    totalPayment: number;
    basePayment?: number;
    uniqueCode?: number;
    voucherCode?: string;
    voucherAmount?: number;
    status: string;
    paymentMethod?: string;
    paymentProofUrl?: string;
    items: OrderItem[];
    createdAt: unknown;
}

interface Product {
    id: string;
    name: string;
    price: number;
    img: string;
    category?: string;
    isActive?: boolean; // Properti untuk status aktif/suspend produk
}

interface Voucher {
    id: string;
    code: string;
    amount: number;
    isActive?: boolean;
    createdAt?: unknown;
    allowedProductIds?: string[];
}

const DASHBOARD_COLORS = ['#0f172a', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'];
const DEFAULT_PRODUCT_CATEGORIES = ['Makanan', 'Merchandise'];
const ADMIN_REFRESH_COOLDOWN_MS = 60_000;

function formatCurrency(value: number) {
    return `Rp ${value.toLocaleString('id-ID')}`;
}

function getCreatedAtDate(createdAt: unknown) {
    if (!createdAt) return null;

    if (typeof createdAt === 'object' && createdAt !== null && 'toDate' in createdAt && typeof createdAt.toDate === 'function') {
        return createdAt.toDate();
    }

    if (typeof createdAt === 'object' && createdAt !== null && 'seconds' in createdAt && typeof createdAt.seconds === 'number') {
        return new Date(createdAt.seconds * 1000);
    }

    if (typeof createdAt === 'string' || typeof createdAt === 'number' || createdAt instanceof Date) {
        const parsed = new Date(createdAt);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
}

function getDayKey(date: Date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getDayLabel(date: Date) {
    return date.toLocaleDateString('id-ID', { weekday: 'short' });
}

function normalizeProductCategory(category: unknown) {
    const normalized = String(category || '').trim();
    return normalized || 'Lainnya';
}

export default function AdminPage() {
    // Auth States
    const [user, setUser] = useState<User | null>(null);
    const [email, setEmail] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [authLoading, setAuthLoading] = useState<boolean>(true);
    const [loginError, setLoginError] = useState<string>('');

    // Dashboard States
    const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'products' | 'vouchers'>('dashboard');
    const [isAdminMenuOpen, setIsAdminMenuOpen] = useState<boolean>(false);
    const [orders, setOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [hasOrdersSnapshot, setHasOrdersSnapshot] = useState<boolean>(false);
    const [hasProductsSnapshot, setHasProductsSnapshot] = useState<boolean>(false);
    const [hasVouchersSnapshot, setHasVouchersSnapshot] = useState<boolean>(false);
    const [liveError, setLiveError] = useState<boolean>(false);
    const [refreshingAdminData, setRefreshingAdminData] = useState<boolean>(false);
    const lastAdminRefreshAtRef = useRef<number>(0);

    // Form States Tambah/Edit Produk
    const [prodName, setProdName] = useState<string>('');
    const [prodPrice, setProdPrice] = useState<string>('');
    const [prodCategory, setProdCategory] = useState<string>('Makanan');
    const [newProductCategory, setNewProductCategory] = useState<string>('');
    const [prodImg, setProdImg] = useState<string>('');
    const [prodImageFile, setProdImageFile] = useState<File | null>(null);
    const [savingProduct, setSavingProduct] = useState<boolean>(false);
    const [editingProductId, setEditingProductId] = useState<string | null>(null);

    // Form States Voucher
    const [voucherCode, setVoucherCode] = useState<string>('');
    const [voucherAmount, setVoucherAmount] = useState<string>('');
    const [voucherProductIds, setVoucherProductIds] = useState<string[]>([]);
    const [savingVoucher, setSavingVoucher] = useState<boolean>(false);
    const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);

    // State Modal Bukti Pembayaran
    const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
    const prodImagePreview = useMemo(() => {
        if (prodImageFile) {
            return URL.createObjectURL(prodImageFile);
        }

        return prodImg;
    }, [prodImageFile, prodImg]);

    const productCategoryOptions = useMemo(() => {
        const categorySet = new Set(DEFAULT_PRODUCT_CATEGORIES);
        products.forEach((product) => {
            categorySet.add(normalizeProductCategory(product.category));
        });
        const selectedCategory = prodCategory.trim();
        if (selectedCategory) categorySet.add(selectedCategory);
        return Array.from(categorySet);
    }, [prodCategory, products]);

    const productsByCategory = useMemo(() => {
        return productCategoryOptions.map((category) => ({
            category,
            products: products.filter((product) => normalizeProductCategory(product.category) === category),
        }));
    }, [productCategoryOptions, products]);

    useEffect(() => {
        return () => {
            if (prodImagePreview.startsWith('blob:')) {
                URL.revokeObjectURL(prodImagePreview);
            }
        };
    }, [prodImagePreview]);

    const getAdminHeaders = useCallback(async () => {
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
            throw new Error('NO_ADMIN_TOKEN');
        }

        return {
            Authorization: `Bearer ${token}`,
        };
    }, []);

    const fetchAdminData = useCallback(async (options: { silent?: boolean } = {}) => {
        if (!auth.currentUser) return;

        setRefreshingAdminData(true);
        if (!options.silent) {
            setHasOrdersSnapshot(false);
            setHasProductsSnapshot(false);
            setHasVouchersSnapshot(false);
        }
        setLiveError(false);

        try {
            const response = await fetch('/api/admin/data', {
                headers: await getAdminHeaders(),
                cache: 'no-store',
            });

            if (!response.ok) {
                throw new Error('ADMIN_DATA_FAILED');
            }

            const data = await response.json();
            const orderList = (data.orders || []) as Order[];
            const productList = (data.products || []) as Product[];
            const voucherList = (data.vouchers || []) as Voucher[];

            setOrders(orderList.sort((a, b) => {
                const dateA = getCreatedAtDate(a.createdAt)?.getTime() || 0;
                const dateB = getCreatedAtDate(b.createdAt)?.getTime() || 0;
                return dateB - dateA;
            }));
            setProducts(productList.map((product) => ({
                ...product,
                price: Number(product.price) || 0,
                category: normalizeProductCategory(product.category),
                isActive: product.isActive !== undefined ? product.isActive : true,
            })));
            setVouchers(voucherList.map((voucher) => {
                const rawAllowedProductIds = (voucher as Voucher).allowedProductIds;
                return {
                    ...voucher,
                    code: (voucher.code || voucher.id || '').toString().toUpperCase(),
                    amount: Number(voucher.amount) || 0,
                    isActive: voucher.isActive !== undefined ? voucher.isActive : true,
                    allowedProductIds: Array.isArray(rawAllowedProductIds)
                        ? rawAllowedProductIds.map((id) => String(id)).filter(Boolean)
                        : [],
                };
            }));
            setHasOrdersSnapshot(true);
            setHasProductsSnapshot(true);
            setHasVouchersSnapshot(true);
            lastAdminRefreshAtRef.current = Date.now();
        } catch {
            setLiveError(true);
        } finally {
            setRefreshingAdminData(false);
        }
    }, [getAdminHeaders]);

    // Monitor Status Login
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (!currentUser) {
                setOrders([]);
                setProducts([]);
                setVouchers([]);
                setHasOrdersSnapshot(false);
                setHasProductsSnapshot(false);
                setHasVouchersSnapshot(false);
                setLiveError(false);
            } else {
                setHasOrdersSnapshot(false);
                setHasProductsSnapshot(false);
                setHasVouchersSnapshot(false);
                setLiveError(false);
                setTimeout(() => {
                    void fetchAdminData();
                }, 0);
            }
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, [fetchAdminData]);

    useEffect(() => {
        if (!user) return;

        const refreshAdminData = () => {
            const now = Date.now();
            if (now - lastAdminRefreshAtRef.current < ADMIN_REFRESH_COOLDOWN_MS) return;
            void fetchAdminData({ silent: true });
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshAdminData();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user, fetchAdminData]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch {
            setLoginError("Email atau Password Admin salah!");
        }
    };

    const handleLogout = () => {
        signOut(auth);
    };

    // FUNGSI PESANAN: Verifikasi / Ubah Status
    const handleUpdateStatus = async (orderId: string, newStatus: string) => {
        try {
            const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
                method: 'PATCH',
                headers: {
                    ...(await getAdminHeaders()),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: newStatus }),
            });

            if (!response.ok) throw new Error('ORDER_UPDATE_FAILED');
            await fetchAdminData();
        } catch {
            alert("Gagal merubah status pesanan.");
        }
    };

    // FUNGSI PESANAN: Hapus Pesanan
    const handleDeleteOrder = async (orderId: string) => {
        if (!confirm("Apakah Anda yakin ingin menghapus pesanan ini secara permanen?")) return;
        try {
            const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
                method: 'DELETE',
                headers: await getAdminHeaders(),
            });

            if (!response.ok) throw new Error('ORDER_DELETE_FAILED');
            await fetchAdminData();
        } catch {
            alert("Gagal menghapus pesanan.");
        }
    };

    // LOGIKA & TEMPLATE: Generator Teks Hubungi via WA Otomatis
    const getWhatsAppLink = (order: Order) => {
        const contact = order.contactInfo;
        const cleaned = contact.replace(/\D/g, ''); 
        
        let phone = '';
        if (cleaned.startsWith('08')) {
            phone = `62${cleaned.substring(1)}`;
        } else if (cleaned.startsWith('628')) {
            phone = cleaned;
        } else {
            return null; 
        }

        const itemsText = order.items?.map(item => `${item.name} - ${item.quantity}x`).join('\n') || '';

        const messageTemplate = `Halo ${order.customerName}

Terima kasih telah melakukan pemesanan di BaCaNau store, berikut adalah daftar pesanan anda:

${itemsText}
Status Pesanan: ${order.status}

Pesananan kamu sekarang sudah terkonfirmasi ya, ditunggu untuk info pengambilan atau pengantaran dari kami.

Terima Kasih`;

        return `https://wa.me/${phone}?text=${encodeURIComponent(messageTemplate)}`;
    };

    // FUNGSI PRODUK: Save, Edit, Delete
    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedCategory = prodCategory.trim();
        if (!prodName || !prodPrice || !normalizedCategory || (!prodImg && !prodImageFile)) return;

        setSavingProduct(true);
        try {
            const formData = new FormData();
            formData.append('name', prodName);
            formData.append('price', prodPrice);
            formData.append('category', normalizedCategory);
            formData.append('img', prodImg);
            
            if (prodImageFile) {
                const compressedImage = await imageCompression(prodImageFile, {
                    maxSizeMB: 0.5,
                    maxWidthOrHeight: 1600,
                    useWebWorker: true,
                    fileType: 'image/jpeg',
                    initialQuality: 0.8,
                });
                formData.append('image', new File([compressedImage], `${prodName || 'produk'}.jpg`, { type: 'image/jpeg' }));
            }

            const response = await fetch(editingProductId ? `/api/admin/products/${encodeURIComponent(editingProductId)}` : '/api/admin/products', {
                method: editingProductId ? 'PATCH' : 'POST',
                headers: await getAdminHeaders(),
                body: formData,
            });

            if (!response.ok) throw new Error('PRODUCT_SAVE_FAILED');
            alert(editingProductId ? "Produk berhasil diperbarui!" : "Produk baru berhasil ditambahkan!");
            setProdName(''); setProdPrice(''); setProdCategory('Makanan'); setNewProductCategory(''); setProdImg(''); setProdImageFile(null); setEditingProductId(null);
            await fetchAdminData();
        } catch {
            alert("Gagal menyimpan data produk. Pastikan bucket Supabase 'produk' sudah dibuat dan policy upload publik/admin sudah aktif.");
        } finally {
            setSavingProduct(false);
        }
    };

    // FUNGSI BARU: Toggle Suspend / Aktifkan Produk
    const handleToggleSuspend = async (productId: string, currentStatus: boolean) => {
        try {
            const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}`, {
                method: 'PATCH',
                headers: {
                    ...(await getAdminHeaders()),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ isActive: !currentStatus }),
            });

            if (!response.ok) throw new Error('PRODUCT_TOGGLE_FAILED');
            await fetchAdminData();
        } catch {
            alert("Gagal mengubah status suspend produk.");
        }
    };

    const handleAddProductCategory = () => {
        const normalizedCategory = newProductCategory.trim();
        if (!normalizedCategory) return;
        setProdCategory(normalizedCategory);
        setNewProductCategory('');
    };

    const handleStartEdit = (product: Product) => {
        setEditingProductId(product.id); setProdName(product.name); setProdPrice(product.price.toString()); setProdCategory(product.category || 'Makanan'); setNewProductCategory(''); setProdImg(product.img); setProdImageFile(null);
    };

    const handleCancelEdit = () => {
        setEditingProductId(null); setProdName(''); setProdPrice(''); setProdCategory('Makanan'); setNewProductCategory(''); setProdImg(''); setProdImageFile(null);
    };

    const handleDeleteProduct = async (productId: string) => {
        if (!confirm("Apakah Anda yakin ingin menghapus produk ini dari katalog?")) return;
        try {
            const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}`, {
                method: 'DELETE',
                headers: await getAdminHeaders(),
            });

            if (!response.ok) throw new Error('PRODUCT_DELETE_FAILED');
            await fetchAdminData();
        } catch {
            alert("Gagal menghapus produk.");
        }
    };

    // FUNGSI VOUCHER: Save, Edit, Delete
    const handleSaveVoucher = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedCode = voucherCode.trim().toUpperCase();
        const parsedAmount = Number(voucherAmount.replace(/[^0-9]/g, ''));
        const normalizedProductIds = voucherProductIds.map((id) => String(id)).filter(Boolean);

        if (!normalizedCode || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || normalizedProductIds.length === 0) {
            alert("Kode, nominal, dan produk voucher wajib diisi.");
            return;
        }

        setSavingVoucher(true);
        try {
            const response = await fetch(
                editingVoucherId
                    ? `/api/admin/vouchers/${encodeURIComponent(editingVoucherId)}`
                    : '/api/admin/vouchers',
                {
                    method: editingVoucherId ? 'PATCH' : 'POST',
                    headers: {
                        ...(await getAdminHeaders()),
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(
                        editingVoucherId
                            ? { amount: parsedAmount, allowedProductIds: normalizedProductIds }
                            : { code: normalizedCode, amount: parsedAmount, allowedProductIds: normalizedProductIds }
                    ),
                }
            );

            if (!response.ok) throw new Error('VOUCHER_SAVE_FAILED');
            alert(editingVoucherId ? "Voucher berhasil diperbarui!" : "Voucher baru berhasil ditambahkan!");
            setVoucherCode(''); setVoucherAmount(''); setVoucherProductIds([]); setEditingVoucherId(null);
            await fetchAdminData();
        } catch {
            alert("Gagal menyimpan voucher.");
        } finally {
            setSavingVoucher(false);
        }
    };

    const handleStartVoucherEdit = (voucher: Voucher) => {
        setEditingVoucherId(voucher.id);
        setVoucherCode(voucher.code);
        setVoucherAmount(voucher.amount.toString());
        setVoucherProductIds(Array.isArray(voucher.allowedProductIds) ? voucher.allowedProductIds : []);
    };

    const handleCancelVoucherEdit = () => {
        setEditingVoucherId(null);
        setVoucherCode('');
        setVoucherAmount('');
        setVoucherProductIds([]);
    };

    const handleToggleVoucherProduct = (productId: string) => {
        setVoucherProductIds((prev) => (
            prev.includes(productId)
                ? prev.filter((id) => id !== productId)
                : [...prev, productId]
        ));
    };

    const handleToggleVoucher = async (voucherId: string, currentStatus: boolean) => {
        try {
            const response = await fetch(`/api/admin/vouchers/${encodeURIComponent(voucherId)}`, {
                method: 'PATCH',
                headers: {
                    ...(await getAdminHeaders()),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ isActive: !currentStatus }),
            });

            if (!response.ok) throw new Error('VOUCHER_TOGGLE_FAILED');
            await fetchAdminData();
        } catch {
            alert("Gagal mengubah status voucher.");
        }
    };

    const handleDeleteVoucher = async (voucherId: string) => {
        if (!confirm("Apakah Anda yakin ingin menghapus voucher ini?")) return;
        try {
            const response = await fetch(`/api/admin/vouchers/${encodeURIComponent(voucherId)}`, {
                method: 'DELETE',
                headers: await getAdminHeaders(),
            });

            if (!response.ok) throw new Error('VOUCHER_DELETE_FAILED');
            await fetchAdminData();
        } catch {
            alert("Gagal menghapus voucher.");
        }
    };

    const handleSelectAdminTab = (tab: 'dashboard' | 'orders' | 'products' | 'vouchers') => {
        setActiveTab(tab);
        setIsAdminMenuOpen(false);
    };

    const handleExportExcel = () => {
        if (orders.length === 0 && products.length === 0) {
            alert("Tidak ada data untuk diexport.");
            return;
        }

        const exportDate = new Date();
        const exportStamp = exportDate.toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const exportLabel = exportDate.toLocaleString('id-ID');

        const ordersRows = orders.map((order) => {
            const createdAt = getCreatedAtDate(order.createdAt);
            const items = order.items ?? [];
            const itemCount = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

            return {
                'Order ID': order.id,
                'Nama Pelanggan': order.customerName,
                'Kontak': order.contactInfo,
                'Domisili': order.domicile,
                'Status': order.status,
                'Total Tagihan': Number(order.totalPayment) || 0,
                'Jumlah Item': itemCount,
                'Rincian Item': items.map((item) => `${item.name} (${item.quantity}x)`).join(', '),
                'Bukti Transfer URL': order.paymentProofUrl || '',
                'Tanggal Pesan': createdAt ? createdAt.toLocaleString('id-ID') : '',
            };
        });

        const orderItemsRows = orders.flatMap((order) => {
            const createdAt = getCreatedAtDate(order.createdAt);
            return (order.items ?? []).map((item) => {
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;

                return {
                    'Order ID': order.id,
                    'Nama Pelanggan': order.customerName,
                    'Status': order.status,
                    'Tanggal Pesan': createdAt ? createdAt.toLocaleString('id-ID') : '',
                    'Nama Item': item.name,
                    'Qty': quantity,
                    'Harga Satuan': price,
                    'Subtotal': quantity * price,
                };
            });
        });

        const productRows = products.map((product) => ({
            'Product ID': product.id,
            'Nama Produk': product.name,
            'Kategori': product.category || 'Makanan',
            'Harga': product.price,
            'Status Produk': (product.isActive ?? true) ? 'Aktif' : 'Suspend',
            'URL Gambar': product.img,
        }));

        const summaryRows = [
            { Label: 'Generated At', Value: exportLabel },
            { Label: 'Total Pesanan', Value: dashboardData.totalOrders },
            { Label: 'Total Produk', Value: dashboardData.totalProducts },
            { Label: 'Produk Aktif', Value: dashboardData.activeProducts },
            { Label: 'Produk Disuspend', Value: dashboardData.suspendedProducts },
            { Label: 'Pesanan Menunggu Pembayaran', Value: dashboardData.pendingOrders },
            { Label: 'Pesanan Mengecek Bukti', Value: dashboardData.reviewingOrders },
            { Label: 'Pesanan Selesai', Value: dashboardData.completedOrders },
            { Label: 'Pesanan Dibatalkan', Value: dashboardData.canceledOrders },
            { Label: 'Pendapatan Kotor', Value: dashboardData.grossRevenue },
            { Label: 'Pendapatan Selesai', Value: dashboardData.completedRevenue },
            { Label: 'Rata-rata Transaksi', Value: dashboardData.averageOrderValue },
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Ringkasan');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ordersRows), 'Pesanan');
        XLSX.utils.book_append_sheet(
            workbook,
            XLSX.utils.json_to_sheet(orderItemsRows.length ? orderItemsRows : [{ Catatan: 'Tidak ada item pesanan.' }]),
            'Detail Item'
        );
        XLSX.utils.book_append_sheet(
            workbook,
            XLSX.utils.json_to_sheet(productRows.length ? productRows : [{ Catatan: 'Tidak ada produk.' }]),
            'Produk'
        );

        XLSX.writeFile(workbook, `bacanau-admin-export-${exportStamp}.xlsx`);
    };

    const handleExportPdf = () => {
        if (orders.length === 0) {
            alert("Tidak ada data pesanan untuk diexport.");
            return;
        }

        const exportDate = new Date();
        const exportStamp = exportDate.toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const exportLabel = exportDate.toLocaleString('id-ID');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const marginX = 40;
        const getNextTableY = (fallback: number) => {
            const lastTable = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
            return (lastTable?.finalY ?? fallback) + 20;
        };
        const ensureSpace = (requiredHeight = 120) => {
            if (getNextTableY(90) + requiredHeight > pageHeight - 45) {
                pdf.addPage();
                return 54;
            }
            return getNextTableY(90);
        };
        const formatOrderDate = (createdAt: unknown) => {
            const date = getCreatedAtDate(createdAt);
            return date ? date.toLocaleString('id-ID') : '-';
        };

        pdf.setFillColor(15, 23, 42);
        pdf.rect(0, 0, pageWidth, 72, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(18);
        pdf.text('BACANAU 25 STORE', marginX, 32);
        pdf.setFontSize(12);
        pdf.text('Laporan Data Pesanan', marginX, 52);
        pdf.setFontSize(10);
        pdf.text(`Tanggal export: ${exportLabel}`, pageWidth - marginX, 32, { align: 'right' });
        pdf.setTextColor(0);

        const totalItemsSold = orders.reduce((sum, order) => (
            sum + (order.items || []).reduce((itemSum, item) => itemSum + (Number(item.quantity) || 0), 0)
        ), 0);
        const summaryRows = [
            ['Total Pesanan', String(dashboardData.totalOrders)],
            ['Total Item Terjual', String(totalItemsSold)],
            ['Pendapatan Kotor', formatCurrency(dashboardData.grossRevenue)],
            ['Pendapatan Selesai', formatCurrency(dashboardData.completedRevenue)],
            ['Rata-rata Transaksi', formatCurrency(dashboardData.averageOrderValue)],
            ['Menunggu Pembayaran', String(dashboardData.pendingOrders)],
            ['Mengecek Bukti', String(dashboardData.reviewingOrders)],
            ['Selesai', String(dashboardData.completedOrders)],
            ['Dibatalkan', String(dashboardData.canceledOrders)],
        ];

        autoTable(pdf, {
            startY: 92,
            head: [['Ringkasan', 'Nilai']],
            body: summaryRows,
            theme: 'striped',
            styles: { fontSize: 9 },
            headStyles: { fillColor: [15, 23, 42] },
            margin: { left: marginX, right: marginX },
        });

        const sortedOrders = [...orders].sort((a, b) => {
            const dateA = getCreatedAtDate(a.createdAt)?.getTime() || 0;
            const dateB = getCreatedAtDate(b.createdAt)?.getTime() || 0;
            return dateB - dateA;
        });

        sortedOrders.forEach((order, index) => {
            const items = order.items || [];
            const itemRows = items.length > 0
                ? items.map((item) => {
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                return [
                    item.name,
                    String(quantity),
                    formatCurrency(price),
                    formatCurrency(price * quantity),
                    formatCurrency(price * quantity),
                ];
            })
                : [['Tidak ada item tercatat', '-', '-', '-']];
            const basePayment = Number(order.basePayment) || items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
            const voucherAmount = Number(order.voucherAmount) || 0;
            const uniqueCode = Number(order.uniqueCode) || 0;
            const notes = String((order as Order & { notes?: unknown; note?: unknown }).notes || (order as Order & { notes?: unknown; note?: unknown }).note || '').trim();

            const sectionY = ensureSpace(160);
            pdf.setFontSize(12);
            pdf.setTextColor(15, 23, 42);
            pdf.text(`Pesanan ${index + 1}: ${order.id}`, marginX, sectionY);

            autoTable(pdf, {
                startY: sectionY + 8,
                body: [
                    ['Nama Pelanggan', order.customerName || '-', 'Tanggal', formatOrderDate(order.createdAt)],
                    ['Kontak', order.contactInfo || '-', 'Domisili', order.domicile || '-'],
                    ['Status Pesanan', order.status || '-', 'Status Bayar', order.paymentProofUrl ? 'Bukti diterima' : 'Belum ada bukti'],
                    ['Metode Pembayaran', order.paymentMethod || 'QRIS', 'Total', formatCurrency(Number(order.totalPayment) || 0)],
                    ...(notes ? [['Catatan', notes, '', '']] : []),
                ],
                theme: 'plain',
                styles: { fontSize: 8, cellPadding: 4 },
                columnStyles: {
                    0: { fontStyle: 'bold', textColor: [71, 85, 105], cellWidth: 82 },
                    1: { cellWidth: 160 },
                    2: { fontStyle: 'bold', textColor: [71, 85, 105], cellWidth: 72 },
                    3: { cellWidth: 176 },
                },
                margin: { left: marginX, right: marginX },
            });

            autoTable(pdf, {
                startY: getNextTableY(sectionY + 8),
                head: [['Item Pesanan', 'Qty', 'Harga Satuan', 'Subtotal']],
                body: [
                    ...itemRows,
                    ['Subtotal Pesanan', '', '', formatCurrency(basePayment)],
                    ...(voucherAmount > 0 ? [[`Voucher ${order.voucherCode ? `(${order.voucherCode})` : ''}`, '', '', `- ${formatCurrency(voucherAmount)}`]] : []),
                    ...(uniqueCode > 0 ? [['Kode Unik', '', '', formatCurrency(uniqueCode)]] : []),
                    ['Total Bayar', '', '', formatCurrency(Number(order.totalPayment) || 0)],
                ],
                styles: { fontSize: 8, cellPadding: 5 },
                headStyles: { fillColor: [15, 23, 42] },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: {
                    1: { halign: 'center', cellWidth: 45 },
                    2: { halign: 'right', cellWidth: 95 },
                    3: { halign: 'right', cellWidth: 95, fontStyle: 'bold' },
                },
                margin: { left: marginX, right: marginX },
            });
        });

        const pageCount = pdf.getNumberOfPages();
        for (let page = 1; page <= pageCount; page += 1) {
            pdf.setPage(page);
            pdf.setFontSize(8);
            pdf.setTextColor(148, 163, 184);
            pdf.text(`Halaman ${page} dari ${pageCount}`, pageWidth - marginX, pageHeight - 24, { align: 'right' });
        }

        pdf.save(`bacanau-laporan-pesanan-${exportStamp}.pdf`);
    };

    const dashboardData = (() => {
        const totalOrders = orders.length;
        const totalProducts = products.length;
        const activeProducts = products.filter((product) => product.isActive ?? true).length;
        const suspendedProducts = totalProducts - activeProducts;
        const pendingOrders = orders.filter((order) => order.status === 'Menunggu Pembayaran').length;
        const reviewingOrders = orders.filter((order) => order.status === 'Sudah Bayar (Mengecek Bukti)').length;
        const completedOrders = orders.filter((order) => order.status === 'Selesai (Lunas)').length;
        const canceledOrders = orders.filter((order) => order.status === 'Dibatalkan').length;

        const grossRevenue = orders.reduce((sum, order) => sum + (Number(order.totalPayment) || 0), 0);
        const completedRevenue = orders
            .filter((order) => order.status === 'Selesai (Lunas)')
            .reduce((sum, order) => sum + (Number(order.totalPayment) || 0), 0);
        const averageOrderValue = totalOrders > 0 ? grossRevenue / totalOrders : 0;

        const statusCounts = [
            { name: 'Menunggu Pembayaran', value: pendingOrders },
            { name: 'Mengecek Bukti', value: reviewingOrders },
            { name: 'Selesai', value: completedOrders },
            { name: 'Dibatalkan', value: canceledOrders },
        ].filter((item) => item.value > 0);

        const paymentMethodCounts = orders.reduce<Record<string, number>>((acc, order) => {
            const method = order.paymentProofUrl || 'Tidak diketahui';
            acc[method] = (acc[method] || 0) + 1;
            return acc;
        }, {});

        const paymentMethodData = Object.entries(paymentMethodCounts).map(([name, value]) => ({ name, value }));

        const recentDays = Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() - (6 - index));
            return date;
        });

        const dailyCounts = recentDays.map((date) => {
            const key = getDayKey(date);
            const count = orders.filter((order) => {
                const orderDate = getCreatedAtDate(order.createdAt);
                return orderDate ? getDayKey(orderDate) === key : false;
            }).length;

            return {
                name: getDayLabel(date),
                count,
            };
        });

        const topItemsMap = orders.flatMap((order) => order.items || []).reduce<Record<string, { name: string; quantity: number; revenue: number }>>((acc, item) => {
            const quantity = Number(item.quantity) || 0;
            const revenue = (Number(item.price) || 0) * quantity;
            const current = acc[item.name] || { name: item.name, quantity: 0, revenue: 0 };

            acc[item.name] = {
                name: item.name,
                quantity: current.quantity + quantity,
                revenue: current.revenue + revenue,
            };

            return acc;
        }, {});

        const topItems = Object.values(topItemsMap)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);

        const recentOrders = [...orders]
            .sort((a, b) => {
                const dateA = getCreatedAtDate(a.createdAt)?.getTime() || 0;
                const dateB = getCreatedAtDate(b.createdAt)?.getTime() || 0;
                return dateB - dateA;
            })
            .slice(0, 5);

        return {
            totalOrders,
            totalProducts,
            activeProducts,
            suspendedProducts,
            pendingOrders,
            reviewingOrders,
            completedOrders,
            canceledOrders,
            grossRevenue,
            completedRevenue,
            averageOrderValue,
            statusCounts,
            paymentMethodData,
            dailyCounts,
            topItems,
            recentOrders,
        };
    })();

    const liveStatus = liveError
        ? 'error'
        : (hasOrdersSnapshot && hasProductsSnapshot && hasVouchersSnapshot ? 'connected' : 'connecting');

    const productNameMap = new Map(products.map((product) => [product.id, product.name]));
    const formatVoucherProducts = (voucher: Voucher) => {
        const ids = Array.isArray(voucher.allowedProductIds) ? voucher.allowedProductIds : [];
        if (ids.length === 0) return 'Belum diatur';
        const names = ids.map((id) => productNameMap.get(id) || id).filter(Boolean);
        const displayLimit = 3;
        const visibleNames = names.slice(0, displayLimit);
        const remaining = names.length - displayLimit;
        return remaining > 0 ? `${visibleNames.join(', ')} +${remaining} lainnya` : visibleNames.join(', ');
    };
    const liveStatusLabel = liveStatus === 'connected'
        ? (refreshingAdminData ? 'Menyegarkan...' : 'Data Siap')
        : liveStatus === 'error'
            ? 'Koneksi Bermasalah'
            : 'Menghubungkan...';
    const liveStatusColor = liveStatus === 'connected'
        ? 'bg-emerald-500'
        : liveStatus === 'error'
            ? 'bg-red-500'
            : 'bg-amber-500';
    const canExport = orders.length > 0 || products.length > 0;
    const canExportOrders = orders.length > 0;

    if (authLoading) return <div className="min-h-screen bg-slate-900 flex justify-center items-center text-white"><p className="animate-pulse">Memverifikasi Admin...</p></div>;

    if (!user) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans px-4">
                <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl max-w-md w-full text-white">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-black tracking-tight">ADMIN CENTRAL</h1>
                        <p className="text-xs text-slate-400 mt-1">Gunakan kredensial admin Bacanau Store</p>
                    </div>
                    {loginError && <div className="bg-red-500/10 text-red-400 p-3 rounded-xl text-xs font-semibold mb-4 text-center">{loginError}</div>}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input type="email" placeholder="Email Admin" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 text-white" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        <input type="password" placeholder="Password" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 text-white" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold transition-colors">Masuk Dashboard</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative">
            <nav className="glasshour-navbar sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex justify-between items-center gap-3">
                    <div className="flex items-center gap-3">
                        <span className="bg-slate-900 text-white text-xs font-black px-2 py-1 rounded">PRO</span>
                        <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900">BACANAU ADMIN</h1>
                    </div>
                    
                    <div className="hidden sm:flex items-center gap-2 sm:gap-4">
                        <button
                            type="button"
                            onClick={handleExportExcel}
                            disabled={!canExport}
                            className={`text-xs font-bold px-3 py-2 rounded-xl border transition-colors inline-flex items-center gap-2 ${
                                canExport
                                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                    : 'text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed'
                            }`}
                        >
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
                                <path d="M4 3h11l5 5v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="currentColor" opacity="0.2" />
                                <path d="M15 3v5h5" fill="currentColor" />
                                <path
                                    d="M7.3 17.4L9.9 14 7.3 10.6h1.9l1.4 2 1.4-2h1.9l-2.6 3.4 2.6 3.4h-1.9l-1.4-2-1.4 2H7.3z"
                                    fill="currentColor"
                                />
                            </svg>
                            Export to Excel
                        </button>
                        <button
                            type="button"
                            onClick={handleExportPdf}
                            disabled={!canExportOrders}
                            className={`text-xs font-bold px-3 py-2 rounded-xl border transition-colors inline-flex items-center gap-2 ${
                                canExportOrders
                                    ? 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100'
                                    : 'text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed'
                            }`}
                        >
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
                                <path d="M4 3h11l5 5v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="currentColor" opacity="0.2" />
                                <path d="M15 3v5h5" fill="currentColor" />
                                <path
                                    d="M7.2 16.9v-6h2.2c1.3 0 2.1.8 2.1 2 0 1.3-.9 2-2.2 2H8.9v2h-1.7Zm1.7-3.3h.7c.6 0 .9-.3.9-.8 0-.5-.3-.8-.9-.8h-.7v1.6Zm4.3 3.3v-6h1.9c2 0 3.1 1.1 3.1 3s-1.1 3-3.1 3h-1.9Zm1.7-1.4h.3c1 0 1.6-.5 1.6-1.6 0-1-.6-1.6-1.6-1.6h-.3v3.2Z"
                                    fill="currentColor"
                                />
                            </svg>
                            Export to PDF
                        </button>
                        <span className="text-xs text-slate-500 font-medium hidden md:inline">Logged as: {user.email}</span>
                        
                        <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200 flex items-center gap-1.5 select-none">
                            <span className={`h-2 w-2 rounded-full ${liveStatusColor}`} />
                            <span>{liveStatusLabel}</span>
                        </div>

                        <button
                            type="button"
                            onClick={() => void fetchAdminData({ silent: true })}
                            disabled={refreshingAdminData}
                            className="text-xs font-bold text-slate-700 bg-white/70 hover:bg-white/90 px-3 py-2 rounded-xl border border-white/60 transition-colors disabled:text-slate-400 disabled:cursor-wait"
                        >
                            Refresh Data
                        </button>

                        <button 
                            onClick={handleLogout} 
                            className="text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl border border-red-200 transition-colors"
                        >
                            Keluar
                        </button>
                        <Link
                            href="/"
                            className="text-xs font-bold text-slate-700 bg-white/70 hover:bg-white/90 px-3 py-2 rounded-xl border border-white/60 transition-colors"
                        >
                            Home
                        </Link>
                    </div>

                    <div className="flex sm:hidden items-center gap-2">
                        <div className="text-[11px] font-bold text-slate-600 bg-white/80 px-2.5 py-2 rounded-xl border border-white/70 flex items-center gap-1.5 select-none shadow-sm">
                            <span className={`h-2 w-2 rounded-full ${liveStatusColor}`} />
                            <span>{liveStatusLabel}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsAdminMenuOpen((value) => !value)}
                            aria-label="Buka menu admin"
                            aria-expanded={isAdminMenuOpen}
                            className="h-10 w-10 rounded-xl bg-slate-900 text-white shadow-lg flex items-center justify-center"
                        >
                            <span className="flex flex-col gap-1">
                                <span className="block h-0.5 w-5 rounded-full bg-white" />
                                <span className="block h-0.5 w-5 rounded-full bg-white" />
                                <span className="block h-0.5 w-5 rounded-full bg-white" />
                            </span>
                        </button>
                    </div>
                </div>

                {isAdminMenuOpen && (
                    <div className="sm:hidden border-t border-white/60 bg-white/95 px-4 py-4 shadow-xl backdrop-blur-xl">
                        <div className="grid grid-cols-1 gap-2">
                            <button onClick={() => handleSelectAdminTab('dashboard')} className={`text-left rounded-xl px-4 py-3 text-sm font-bold ${activeTab === 'dashboard' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                Ringkasan ({orders.length} Pesanan)
                            </button>
                            <button onClick={() => handleSelectAdminTab('orders')} className={`text-left rounded-xl px-4 py-3 text-sm font-bold ${activeTab === 'orders' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                Verifikasi Pesanan ({orders.length})
                            </button>
                            <button onClick={() => handleSelectAdminTab('products')} className={`text-left rounded-xl px-4 py-3 text-sm font-bold ${activeTab === 'products' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                Kelola Katalog Produk ({products.length})
                            </button>
                            <button onClick={() => handleSelectAdminTab('vouchers')} className={`text-left rounded-xl px-4 py-3 text-sm font-bold ${activeTab === 'vouchers' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                Kelola Voucher ({vouchers.length})
                            </button>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => { void fetchAdminData({ silent: true }); setIsAdminMenuOpen(false); }} disabled={refreshingAdminData} className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-3 text-xs font-bold text-slate-700 disabled:text-slate-400">
                                Refresh Data
                            </button>
                            <button type="button" onClick={() => { handleExportExcel(); setIsAdminMenuOpen(false); }} disabled={!canExport} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-bold text-emerald-700 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">
                                Export Excel
                            </button>
                            <button type="button" onClick={() => { handleExportPdf(); setIsAdminMenuOpen(false); }} disabled={!canExportOrders} className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-bold text-red-600 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">
                                Export PDF
                            </button>
                            <Link href="/" onClick={() => setIsAdminMenuOpen(false)} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-xs font-bold text-slate-700">
                                Home
                            </Link>
                            <button onClick={handleLogout} className="rounded-xl border border-red-200 bg-white px-3 py-3 text-xs font-bold text-red-600">
                                Keluar
                            </button>
                        </div>
                    </div>
                )}
            </nav>

            <main className="max-w-7xl mx-auto px-4 py-8">
                <div className="hidden sm:flex border-b border-slate-200 mb-6 gap-2">
                    <button onClick={() => handleSelectAdminTab('dashboard')} className={`py-2.5 px-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'dashboard' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        📊 Ringkasan ({orders.length} Pesanan)
                    </button>
                    <button onClick={() => handleSelectAdminTab('orders')} className={`py-2.5 px-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'orders' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        📦 Verifikasi Pesanan ({orders.length})
                    </button>
                    <button onClick={() => handleSelectAdminTab('products')} className={`py-2.5 px-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'products' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        👕 Kelola Katalog Produk ({products.length})
                    </button>
                    <button onClick={() => handleSelectAdminTab('vouchers')} className={`py-2.5 px-4 font-bold text-sm border-b-2 transition-all ${activeTab === 'vouchers' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        🎟️ Kelola Voucher ({vouchers.length})
                    </button>
                </div>

                {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Total Pesanan</p>
                                <p className="text-3xl font-black text-slate-900 mt-3">{dashboardData.totalOrders}</p>
                                <p className="text-sm text-slate-500 mt-2">Semua pesanan yang tercatat di database.</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Pendapatan Kotor</p>
                                <p className="text-3xl font-black text-emerald-600 mt-3">{formatCurrency(dashboardData.grossRevenue)}</p>
                                <p className="text-sm text-slate-500 mt-2">Akumulasi total pembayaran dari semua pesanan.</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Pesanan Perlu Dicek</p>
                                <p className="text-3xl font-black text-amber-600 mt-3">{dashboardData.pendingOrders + dashboardData.reviewingOrders}</p>
                                <p className="text-sm text-slate-500 mt-2">Antrian yang belum selesai diproses.</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Produk Aktif</p>
                                <p className="text-3xl font-black text-slate-900 mt-3">{dashboardData.activeProducts}/{dashboardData.totalProducts}</p>
                                <p className="text-sm text-slate-500 mt-2">Katalog aktif dan yang sedang disuspend.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            <div className="xl:col-span-2 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <div className="flex items-start justify-between gap-4 mb-6">
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900">Pergerakan Pesanan 7 Hari</h2>
                                        <p className="text-sm text-slate-500">Frekuensi pesanan berdasarkan tanggal masuk.</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs uppercase font-bold text-slate-400">Rata-rata transaksi</p>
                                        <p className="text-lg font-black text-slate-900">{formatCurrency(dashboardData.averageOrderValue)}</p>
                                    </div>
                                </div>
                                <div className="h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={dashboardData.dailyCounts}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                                            <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                                            <Tooltip cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }} formatter={(value) => [String(value), 'Pesanan']} />
                                            <Bar dataKey="count" radius={[10, 10, 0, 0]} fill="#0f172a" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <h2 className="text-lg font-bold text-slate-900 mb-2">Distribusi Status</h2>
                                <p className="text-sm text-slate-500 mb-4">Ringkasan status pesanan saat ini.</p>
                                <div className="h-[220px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={dashboardData.statusCounts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={4}>
                                                {dashboardData.statusCounts.map((_, index) => (
                                                    <Cell key={`status-${index}`} fill={DASHBOARD_COLORS[index % DASHBOARD_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => [String(value), 'Pesanan']} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="space-y-3 mt-2">
                                    {dashboardData.statusCounts.map((item, index) => (
                                        <div key={item.name} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DASHBOARD_COLORS[index % DASHBOARD_COLORS.length] }} />
                                                <span className="text-slate-600 font-medium">{item.name}</span>
                                            </div>
                                            <span className="font-bold text-slate-900">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900">Produk Terlaris</h2>
                                        <p className="text-sm text-slate-500">Diurutkan berdasarkan jumlah item terjual.</p>
                                    </div>
                                    <div className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
                                        {dashboardData.completedRevenue > 0 ? formatCurrency(dashboardData.completedRevenue) : 'Belum ada penjualan selesai'}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {dashboardData.topItems.length === 0 ? (
                                        <div className="text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                                            Belum ada item yang bisa dirangkum dari pesanan.
                                        </div>
                                    ) : (
                                        dashboardData.topItems.map((item, index) => (
                                            <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                <div>
                                                    <p className="font-semibold text-slate-900">{item.name}</p>
                                                    <p className="text-xs text-slate-500">{item.quantity} item terjual</p>
                                                </div>
                                                <p className="text-sm font-bold text-slate-700">{formatCurrency(item.revenue)}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Pesanan Terbaru</h2>
                                <div className="space-y-3">
                                    {dashboardData.recentOrders.length === 0 ? (
                                        <div className="text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                                            Belum ada pesanan terbaru untuk ditampilkan.
                                        </div>
                                    ) : (
                                        dashboardData.recentOrders.map((order) => (
                                            <div key={order.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                <div>
                                                    <p className="font-semibold text-slate-900">{order.customerName}</p>
                                                    <p className="text-xs text-slate-500">{order.status}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-slate-900">{formatCurrency(Number(order.totalPayment) || 0)}</p>
                                                    <p className="text-xs text-slate-500">{getCreatedAtDate(order.createdAt)?.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) || 'Tanggal tidak tersedia'}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Selesai</p>
                                <p className="text-2xl font-black text-emerald-600 mt-2">{dashboardData.completedOrders}</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Menunggu</p>
                                <p className="text-2xl font-black text-slate-900 mt-2">{dashboardData.pendingOrders}</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Mengecek Bukti</p>
                                <p className="text-2xl font-black text-blue-600 mt-2">{dashboardData.reviewingOrders}</p>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                <p className="text-xs uppercase font-bold text-slate-400">Produk Disuspend</p>
                                <p className="text-2xl font-black text-red-600 mt-2">{dashboardData.suspendedProducts}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 1: VERIFIKASI PESANAN PEMBELI */}
                {activeTab === 'orders' && (
                    <div className="space-y-4">
                        {orders.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 font-medium shadow-sm">
                                Belum ada transaksi pesanan masuk.
                            </div>
                        ) : (
                            orders.map((order) => {
                                const waLink = getWhatsAppLink(order);

                                return (
                                    <div key={order.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row gap-5 justify-between hover:border-slate-300 transition-colors">
                                        
                                        <div className="space-y-4 flex-1">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-black text-lg text-slate-900 uppercase">{order.customerName}</h3>
                                                    <p className="text-[11px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-1">ID: {order.id}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Tagihan</p>
                                                    <span className="text-lg font-black text-emerald-600">Rp {(order.totalPayment || 0).toLocaleString('id-ID')}</span>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-4 items-center text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <div className="flex items-center gap-2">
                                                    <span>📱 <span className="font-semibold">{order.contactInfo}</span></span>
                                                    {waLink && (
                                                        <a 
                                                            href={waLink} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="bg-green-100 hover:bg-green-200 text-green-700 px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all shadow-sm flex items-center gap-1 border border-green-200"
                                                        >
                                                            💬 Hubungi via WA
                                                        </a>
                                                    )}
                                                </div>
                                                <p className="flex items-center">📍 Kampus <span className="font-semibold ml-1">{order.domicile}</span></p>
                                            </div>

                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Rincian Item:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {order.items?.map((item, idx) => (
                                                        <span key={idx} className="text-xs text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm">
                                                            {item.name} <strong className="text-slate-900">({item.quantity}x)</strong>
                                                        </span>
                                                    ))}
                                                </div>
                                                {Number(order.voucherAmount || 0) > 0 && (
                                                    <div className="mt-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                                        Voucher {order.voucherCode ? `(${order.voucherCode})` : ''}: - Rp {Number(order.voucherAmount || 0).toLocaleString('id-ID')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-3 md:min-w-[220px] border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-5">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Bukti Transfer</label>
                                                {order.paymentProofUrl ? (
                                                    <button 
                                                        onClick={() => setSelectedProofUrl(order.paymentProofUrl!)}
                                                        className="w-full text-center text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold px-3 py-2.5 rounded-xl block border border-indigo-200 transition-all shadow-sm"
                                                    >
                                                        👁️ Tampilkan Bukti
                                                    </button>
                                                ) : (
                                                    <div className="w-full text-center text-xs text-amber-600 font-bold bg-amber-50 px-3 py-2.5 rounded-xl border border-amber-100">
                                                        Belum Diunggah
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Status Transaksi</label>
                                                <select 
                                                    value={order.status}
                                                    onChange={(e) => handleUpdateStatus(order.id, e.target.value)}
                                                    className={`w-full text-xs font-bold p-2.5 rounded-xl border cursor-pointer focus:outline-none focus:ring-2 appearance-none text-center ${
                                                        order.status === "Sudah Bayar (Mengecek Bukti)" ? "bg-blue-50 border-blue-200 text-blue-700 focus:ring-blue-400" :
                                                        order.status === "Selesai (Lunas)" ? "bg-emerald-50 border-emerald-200 text-emerald-700 focus:ring-emerald-400" :
                                                        order.status === "Dibatalkan" ? "bg-red-50 border-red-200 text-red-700 focus:ring-red-400" :
                                                        "bg-slate-50 border-slate-200 text-slate-700 focus:ring-slate-400"
                                                    }`}
                                                >
                                                    <option value="Menunggu Pembayaran">Menunggu Pembayaran</option>
                                                    <option value="Sudah Bayar (Mengecek Bukti)">Mengecek Bukti</option>
                                                    <option value="Selesai (Lunas)">Selesai (Lunas)</option>
                                                    <option value="Dibatalkan">Dibatalkan</option>
                                                </select>
                                            </div>

                                            <div className="pt-2 border-t border-slate-100 mt-2">
                                                <button 
                                                    onClick={() => handleDeleteOrder(order.id)}
                                                    className="w-full text-center text-xs bg-red-50 hover:bg-red-100 text-red-600 font-bold px-3 py-2 rounded-lg border border-red-200 transition-colors"
                                                >
                                                    🗑️ Hapus Pesanan
                                                </button>
                                            </div>
                                        </div>

                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* TAB 2: KELOLA KATALOG PRODUK */}
                {activeTab === 'products' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-fit">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">{editingProductId ? "📝 Edit Data Produk" : "✨ Tambah Produk Baru"}</h2>
                            <form onSubmit={handleSaveProduct} className="space-y-4">
                                <input type="text" placeholder="Nama Produk" className="w-full border p-3 rounded-xl text-sm" value={prodName} onChange={(e) => setProdName(e.target.value)} required />
                                <input type="number" placeholder="Harga (Rupiah)" className="w-full border p-3 rounded-xl text-sm" value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} required />
                                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <label className="block text-xs font-bold uppercase text-slate-500">Kategori Produk</label>
                                    <select
                                        className="w-full border border-slate-200 bg-white p-3 rounded-xl text-sm"
                                        value={prodCategory}
                                        onChange={(e) => setProdCategory(e.target.value)}
                                        required
                                    >
                                        {productCategoryOptions.map((category) => (
                                            <option key={category} value={category}>{category}</option>
                                        ))}
                                    </select>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Tambah kategori baru"
                                            className="min-w-0 flex-1 border border-slate-200 bg-white p-3 rounded-xl text-sm"
                                            value={newProductCategory}
                                            onChange={(e) => setNewProductCategory(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddProductCategory}
                                            className="shrink-0 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white"
                                        >
                                            Tambah
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <label className="block text-xs font-bold uppercase text-slate-500">Gambar Produk</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="w-full text-sm text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
                                        onChange={(e) => setProdImageFile(e.target.files?.[0] || null)}
                                    />
                                    <div className="flex items-center gap-2">
                                        <div className="h-px flex-1 bg-slate-200" />
                                        <span className="text-[10px] font-bold uppercase text-slate-400">atau</span>
                                        <div className="h-px flex-1 bg-slate-200" />
                                    </div>
                                    <input
                                        type="url"
                                        placeholder="URL Link Gambar"
                                        className="w-full border border-slate-200 bg-white p-3 rounded-xl text-sm"
                                        value={prodImg}
                                        onChange={(e) => setProdImg(e.target.value)}
                                    />
                                    {prodImagePreview && (
                                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
                                            <img
                                                src={prodImagePreview}
                                                alt="Preview produk"
                                                className="h-14 w-14 rounded-lg border border-slate-100 object-cover"
                                            />
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-700 truncate">{prodImageFile ? prodImageFile.name : 'Preview dari URL'}</p>
                                                <p className="text-[11px] text-slate-400">Upload file akan dikompres otomatis.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2 pt-2">
                                    <button type="submit" disabled={savingProduct} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold disabled:bg-slate-400">
                                        {savingProduct ? "Menyimpan..." : editingProductId ? "Simpan Perubahan" : "Terbitkan Produk"}
                                    </button>
                                    {editingProductId && <button type="button" onClick={handleCancelEdit} className="w-full bg-slate-100 text-slate-700 py-2 rounded-xl font-medium text-xs">Batalkan Edit</button>}
                                </div>
                            </form>
                        </div>
                        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">Katalog Produk per Kategori</h2>
                            <div className="space-y-6">
                                {products.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-8">Belum ada item produk terdaftar di database.</p>
                                ) : (
                                    productsByCategory.map(({ category, products: categoryProducts }) => (
                                            <section key={category} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                                                <div className="mb-4">
                                                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">{category}</h3>
                                                    <p className="text-xs font-medium text-slate-400">{categoryProducts.length} produk</p>
                                                </div>

                                                {categoryProducts.length === 0 ? (
                                                    <p className="rounded-xl border border-dashed border-slate-200 bg-white py-6 text-center text-xs font-medium text-slate-400">Belum ada produk pada kategori ini.</p>
                                                ) : (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {categoryProducts.map((product) => (
                                                            <div key={product.id} className={`flex gap-4 p-3 border rounded-xl bg-white transition-all ${product.isActive ? 'border-slate-100 hover:shadow-md' : 'border-red-100 bg-red-50/20 opacity-75'}`}>
                                                                <div className="relative flex-shrink-0">
                                                                    <img src={product.img} alt={product.name} className={`w-16 h-16 object-cover rounded-lg bg-slate-100 border ${!product.isActive && 'grayscale'}`} />
                                                                    {!product.isActive && <div className="absolute inset-0 bg-black/40 text-[9px] text-white font-black flex items-center justify-center rounded-lg">SUSPENDED</div>}
                                                                </div>
                                                                <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                                    <div>
                                                                        <h4 className="font-bold text-sm text-slate-900 truncate">{product.name}</h4>
                                                                        <p className="text-xs text-slate-600 font-semibold mt-0.5">Rp {product.price.toLocaleString('id-ID')}</p>
                                                                        <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{product.isActive ? 'Aktif' : 'Suspend'}</p>
                                                                    </div>
                                                                    <div className="flex gap-1.5 mt-2 flex-wrap">
                                                                        {/* eslint-disable-next-line react-hooks/refs */}
                                                                        <button type="button" onClick={() => handleToggleSuspend(product.id, product.isActive ?? true)} className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${product.isActive ? 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100' : 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'}`}>
                                                                            {product.isActive ? 'Suspend' : 'Aktifkan'}
                                                                        </button>
                                                                        <button onClick={() => handleStartEdit(product)} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">Edit</button>
                                                                        <button onClick={() => handleDeleteProduct(product.id)} className="text-[10px] font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">Hapus</button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </section>
                                        ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 3: KELOLA VOUCHER */}
                {activeTab === 'vouchers' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-fit">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">{editingVoucherId ? "📝 Edit Voucher" : "🎟️ Tambah Voucher Baru"}</h2>
                            <form onSubmit={handleSaveVoucher} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-2">Kode Voucher</label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: BACANAU10"
                                        className="w-full border p-3 rounded-xl text-sm uppercase"
                                        value={voucherCode}
                                        onChange={(e) => setVoucherCode(e.target.value)}
                                        required
                                        disabled={Boolean(editingVoucherId)}
                                    />
                                    {editingVoucherId && (
                                        <p className="text-[11px] text-slate-400 mt-2">Kode voucher tidak dapat diubah. Hapus dan buat ulang jika perlu.</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-2">Nominal Potongan (Rupiah)</label>
                                    <input
                                        type="number"
                                        placeholder="5000"
                                        className="w-full border p-3 rounded-xl text-sm"
                                        value={voucherAmount}
                                        onChange={(e) => setVoucherAmount(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-2">Produk yang Mendapat Voucher</label>
                                    {products.length === 0 ? (
                                        <p className="text-xs text-slate-400">Belum ada produk aktif untuk dipilih.</p>
                                    ) : (
                                        <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                                            {products.map((product) => (
                                                <label key={product.id} className="flex items-center gap-2 text-xs text-slate-700">
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                                        checked={voucherProductIds.includes(product.id)}
                                                        onChange={() => handleToggleVoucherProduct(product.id)}
                                                    />
                                                    <span className="font-semibold">{product.name}</span>
                                                    <span className="text-[10px] text-slate-400">Rp {product.price.toLocaleString('id-ID')}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                    {products.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            <button
                                                type="button"
                                                onClick={() => setVoucherProductIds(products.map((product) => product.id))}
                                                className="text-[10px] font-bold uppercase text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg"
                                            >
                                                Pilih Semua
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setVoucherProductIds([])}
                                                className="text-[10px] font-bold uppercase text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg"
                                            >
                                                Kosongkan
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2 pt-2">
                                    <button type="submit" disabled={savingVoucher} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold disabled:bg-slate-400">
                                        {savingVoucher ? "Menyimpan..." : editingVoucherId ? "Simpan Perubahan" : "Terbitkan Voucher"}
                                    </button>
                                    {editingVoucherId && (
                                        <button type="button" onClick={handleCancelVoucherEdit} className="w-full bg-slate-100 text-slate-700 py-2 rounded-xl font-medium text-xs">
                                            Batalkan Edit
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">Voucher Aktif saat ini</h2>
                            <div className="space-y-3">
                                {vouchers.length === 0 ? (
                                    <div className="text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                                        Belum ada voucher terdaftar di database.
                                    </div>
                                ) : (
                                    vouchers.map((voucher) => (
                                        <div key={voucher.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border transition-all ${voucher.isActive ? 'border-slate-100 bg-white' : 'border-red-100 bg-red-50/20'}`}>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-black text-slate-900 tracking-wide">{voucher.code}</p>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${voucher.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                                        {voucher.isActive ? 'AKTIF' : 'NONAKTIF'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">Potongan: <span className="font-bold text-slate-700">Rp {voucher.amount.toLocaleString('id-ID')}</span></p>
                                                <p className="text-[11px] text-slate-500 mt-1">Berlaku untuk: <span className="font-semibold text-slate-700">{formatVoucherProducts(voucher)}</span></p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleVoucher(voucher.id, voucher.isActive ?? true)}
                                                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${voucher.isActive ? 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100' : 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'}`}
                                                >
                                                    {voucher.isActive ? '⏸️ Nonaktifkan' : '▶️ Aktifkan'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleStartVoucherEdit(voucher)}
                                                    className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteVoucher(voucher.id)}
                                                    className="text-[10px] font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100"
                                                >
                                                    Hapus
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* MODAL POPUP BUKTI PEMBAYARAN */}
            {selectedProofUrl && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200" 
                    onClick={() => setSelectedProofUrl(null)}
                >
                    <div 
                        className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" 
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-4 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900 text-lg">Bukti Pembayaran Pelanggan</h3>
                            <button 
                                onClick={() => setSelectedProofUrl(null)} 
                                className="text-slate-400 hover:text-red-500 hover:bg-red-50 w-8 h-8 rounded-full flex items-center justify-center transition-colors font-bold text-xl"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="p-4 bg-slate-50 flex justify-center items-center min-h-[300px] relative">
                            <img 
                                src={selectedProofUrl} 
                                alt="Bukti Transfer" 
                                className="max-h-[70vh] max-w-full object-contain rounded-lg border border-slate-200 shadow-sm" 
                            />
                        </div>
                        <div className="p-4 bg-white border-t border-slate-100 text-right">
                            <button 
                                onClick={() => setSelectedProofUrl(null)} 
                                className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-6 rounded-xl text-sm transition-colors"
                            >
                                Tutup Pratinjau
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
