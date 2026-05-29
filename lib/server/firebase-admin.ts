import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type ServiceAccountConfig = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function getServiceAccount() {
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  const serviceAccountPath = join(
    process.cwd(),
    'lib',
    'server',
    'bacanaustore-firebase-adminsdk-fbsvc-9aad4e5837.json'
  );

  if (!existsSync(serviceAccountPath)) {
    throw new Error('Firebase Admin credentials are not configured on this server.');
  }

  const localServiceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8')) as ServiceAccountConfig;

  return {
    projectId: localServiceAccount.project_id,
    clientEmail: localServiceAccount.client_email,
    privateKey: localServiceAccount.private_key,
  };
}

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  return initializeApp({
    credential: cert(getServiceAccount()),
  });
}

export function adminDb() {
  return getFirestore(getAdminApp());
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export async function verifyAdminRequest(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return null;
  }

  const decodedToken = await adminAuth().verifyIdToken(token, true);
  const adminAllowlist = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '';
  const allowedEmails = adminAllowlist
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (allowedEmails.length === 0) {
    return decodedToken;
  }

  const email = decodedToken.email?.toLowerCase();
  if (!email || !allowedEmails.includes(email)) {
    return null;
  }

  return decodedToken;
}

export function serializeFirestoreValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return {
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
      iso: value.toDate().toISOString(),
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeFirestoreValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeFirestoreValue(item)])
    );
  }

  return value;
}
