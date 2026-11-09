import express from 'express';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import crypto from 'crypto';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const app = express();
const port = 3000;

app.use(express.json());

// Firebase Client app on server for Firestore operations
const serverApp = initializeApp(firebaseConfig, 'Tedarik360Server');
const serverDb = getFirestore(serverApp, (firebaseConfig as any).firestoreDatabaseId);

// Cryptographic Security Configurations
const SESSION_SECRET = process.env.SESSION_SECRET || 'tedarik360-jwt-session-secret-key-prod-2026';

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  try {
    const check = hashPassword(password, salt);
    return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

export function createSessionToken(user: { uid: string; username: string; role: string; supplierId?: string | null }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      uid: user.uid,
      username: user.username,
      role: user.role,
      supplierId: user.supplierId || null,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7 days
    })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifySessionToken(token: string): { uid: string; username: string; role: string; supplierId?: string | null } | null {
  try {
    const [header, payload, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(`${header}.${payload}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

// In-memory rate limiting for login attempts (Requirement 11)
const loginAttemptMap = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 3 * 60 * 1000; // 3 minutes lockout

function checkRateLimit(key: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const entry = loginAttemptMap.get(key);
  if (!entry) return { allowed: true };

  if (entry.lockedUntil > now) {
    const waitSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  if (entry.lockedUntil <= now && entry.count >= MAX_ATTEMPTS) {
    loginAttemptMap.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const entry = loginAttemptMap.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
  loginAttemptMap.set(key, entry);
}

function clearFailedAttempts(key: string) {
  loginAttemptMap.delete(key);
}

// Server-side User Setup for 6 Required Accounts
async function bootstrapInitialAccounts() {
  const defaultAccounts = [
    {
      username: 'admin',
      initialPassword: process.env.INITIAL_ADMIN_PASSWORD || 'TedarikAdmin2026!',
      fullName: 'Sistem Yöneticisi',
      role: 'ADMIN',
      supplierId: null,
    },
    {
      username: 'operator',
      initialPassword: process.env.INITIAL_OPERATOR_PASSWORD || 'TedarikOperator2026!',
      fullName: 'Operasyon Sorumlusu',
      role: 'OPERATOR',
      supplierId: null,
    },
    {
      username: 'deniz_lojistik',
      initialPassword: process.env.INITIAL_DENIZ_PASSWORD || 'DenizLojistik2026!',
      fullName: 'Deniz Lojistik Temsilcisi',
      role: 'SUPPLIER',
      supplierId: 'deniz-lojistik',
    },
    {
      username: 'alp_ozler',
      initialPassword: process.env.INITIAL_ALPOZLER_PASSWORD || 'AlpOzler2026!',
      fullName: 'Alp Özler Lojistik Temsilcisi',
      role: 'SUPPLIER',
      supplierId: 'alp-ozler-lojistik',
    },
    {
      username: 'tekno_lojistik',
      initialPassword: process.env.INITIAL_TEKNO_PASSWORD || 'TeknoLojistik2026!',
      fullName: 'Tekno Lojistik Temsilcisi',
      role: 'SUPPLIER',
      supplierId: 'tekno-lojistik',
    },
    {
      username: 'ekol_lojistik',
      initialPassword: process.env.INITIAL_EKOL_PASSWORD || 'EkolLojistik2026!',
      fullName: 'Ekol Lojistik Temsilcisi',
      role: 'SUPPLIER',
      supplierId: 'ekol-lojistik',
    },
  ];

  try {
    for (const acc of defaultAccounts) {
      const q = query(collection(serverDb, 'users'), where('username', '==', acc.username));
      const snap = await getDocs(q);

      if (snap.empty) {
        const uid = `usr-${acc.username}`;
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(acc.initialPassword, salt);

        await setDoc(doc(serverDb, 'users', uid), {
          uid,
          username: acc.username,
          fullName: acc.fullName,
          role: acc.role,
          supplierId: acc.supplierId,
          salt,
          passwordHash,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log(`[BOOTSTRAP] Initialized account: ${acc.username} (${acc.role})`);
      }
    }
  } catch (err: any) {
    console.error('[BOOTSTRAP ERROR]:', err.message);
  }
}

// API: Login with Username and Password
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const clientIp = req.ip || 'anonymous';
  const cleanUsername = (username || '').trim().toLowerCase();

  const rateCheck = checkRateLimit(`${clientIp}_${cleanUsername}`);
  if (!rateCheck.allowed) {
    console.warn(`[AUTH FAILED] Rate limited: ${cleanUsername} from ${clientIp}`);
    return res.status(429).json({
      error: `Çok fazla başarısız giriş denemesi. Lütfen ${rateCheck.waitSeconds} saniye bekleyiniz.`,
      code: 'auth/too-many-requests',
    });
  }

  if (!cleanUsername || !password) {
    return res.status(400).json({
      error: 'Kullanıcı adı ve şifre zorunludur.',
      code: 'auth/missing-credentials',
    });
  }

  try {
    const q = query(collection(serverDb, 'users'), where('username', '==', cleanUsername));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      recordFailedAttempt(`${clientIp}_${cleanUsername}`);
      console.warn(`[AUTH FAILED] User not found: ${cleanUsername}`);
      return res.status(401).json({
        error: 'Kullanıcı adı veya şifre hatalı.',
        code: 'auth/user-not-found',
      });
    }

    let userDocToUse = snapshot.docs.find((d) => d.data().passwordHash && d.data().salt);
    if (!userDocToUse) {
      userDocToUse = snapshot.docs[0];
    }

    const userData = userDocToUse.data();

    if (userData.active === false) {
      console.warn(`[AUTH FAILED] Inactive account attempted login: ${cleanUsername}`);
      return res.status(403).json({
        error: 'Bu kullanıcı hesabı askıya alınmıştır. Lütfen yöneticiniz ile iletişime geçiniz.',
        code: 'auth/user-disabled',
      });
    }

    const isValid = verifyPassword(password, userData.salt, userData.passwordHash);
    if (!isValid) {
      recordFailedAttempt(`${clientIp}_${cleanUsername}`);
      console.warn(`[AUTH FAILED] Invalid password for user: ${cleanUsername}`);
      return res.status(401).json({
        error: 'Kullanıcı adı veya şifre hatalı.',
        code: 'auth/wrong-password',
      });
    }

    clearFailedAttempts(`${clientIp}_${cleanUsername}`);

    const token = createSessionToken({
      uid: userData.uid,
      username: userData.username,
      role: userData.role,
      supplierId: userData.supplierId || null,
    });

    console.log(`[AUTH SUCCESS] User logged in: ${cleanUsername} (${userData.role})`);

    return res.json({
      success: true,
      token,
      user: {
        uid: userData.uid,
        username: userData.username,
        fullName: userData.fullName,
        role: userData.role,
        supplierId: userData.supplierId || null,
        active: userData.active,
      },
    });
  } catch (error: any) {
    console.error('[AUTH ERROR]:', error);
    return res.status(500).json({
      error: 'Kimlik doğrulama sırasında bir hata oluştu.',
      code: 'auth/internal-error',
    });
  }
});

// API: Verify Session Token
app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Yetkisiz erişim.' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum.' });
  }

  try {
    const userDoc = await getDoc(doc(serverDb, 'users', payload.uid));
    if (!userDoc.exists() || userDoc.data().active === false) {
      return res.status(401).json({ error: 'Kullanıcı hesabı aktif değil.' });
    }

    const userData = userDoc.data();
    return res.json({
      user: {
        uid: userData.uid,
        username: userData.username,
        fullName: userData.fullName,
        role: userData.role,
        supplierId: userData.supplierId || null,
        active: userData.active,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Oturum doğrulanamadı.' });
  }
});

// Helper to sync supplier request view
async function syncSupplierRequestView(params: {
  supplierId: string;
  requestId: string;
  requestNumber: string;
  originFacility: string;
  routeStops: any[];
  destination: string;
  vehicleType: string;
  assignedQuantity: number;
  offeredQuantity?: number;
  confirmedQuantity?: number;
  requiredDate: string;
  requiredTime?: string;
  distributionMode: string;
  status: string;
  assignmentStatus?: string;
  assignmentId?: string;
  responseNote?: string;
}) {
  const viewId = `${params.supplierId}_${params.requestId}`;
  const viewRef = doc(serverDb, 'supplierRequestViews', viewId);
  await setDoc(
    viewRef,
    {
      id: viewId,
      requestId: params.requestId,
      supplierId: params.supplierId,
      requestNumber: params.requestNumber,
      originFacility: params.originFacility,
      routeStops: params.routeStops || [],
      destination: params.destination,
      vehicleType: params.vehicleType,
      assignedQuantity: Number(params.assignedQuantity || 0),
      offeredQuantity: Number(params.offeredQuantity || 0),
      confirmedQuantity: Number(params.confirmedQuantity || 0),
      requiredDate: params.requiredDate,
      requiredTime: params.requiredTime || '09:00',
      distributionMode: params.distributionMode,
      status: params.status,
      assignmentStatus: params.assignmentStatus || 'PENDING',
      assignmentId: params.assignmentId || '',
      responseNote: params.responseNote || '',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// API: Create Vehicle Request (Requirement 1, 3, 4, 5, 6 - ADMIN ONLY)
app.post('/api/requests/create', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.sessionToken;

  const payload = verifySessionToken(token);
  if (!payload) {
    console.error('[FIRESTORE OPERATION FAILED] Unauthorized attempt to create vehicle request');
    return res.status(401).json({
      error: 'Oturum süreniz dolmuş veya oturum açılmamış.',
      code: 'auth/unauthenticated',
    });
  }

  // Section 1: Check user role. If not ADMIN, deny
  if (payload.role !== 'ADMIN') {
    console.error(`[FIRESTORE OPERATION DENIED] Non-admin user attempted creation. UID: ${payload.uid}, Role: ${payload.role}`);
    return res.status(403).json({
      error: 'Araç talebi oluşturmak için Yönetici (Admin) yetkisine sahip olmalısınız.',
      code: 'auth/permission-denied',
    });
  }

  const input = req.body;
  const requestNumber = `REQ-${Date.now().toString().slice(-6)}`;
  const requestDocRef = doc(collection(serverDb, 'vehicleRequests'));
  const requestId = requestDocRef.id;
  const routeStops = Array.isArray(input.routeStops) ? input.routeStops : [];

  try {
    const batch = writeBatch(serverDb);

    const requestData = {
      requestNumber,
      originFacility: input.originFacility,
      routeStops,
      destination: input.destination,
      vehicleType: input.vehicleType,
      totalQuantity: Number(input.totalQuantity),
      distributionMode: input.distributionMode,
      requiredDate: input.requiredDate,
      requiredTime: input.requiredTime || '09:00',
      description: input.description || '',
      status: 'PENDING',
      createdBy: payload.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(requestDocRef, requestData);

    const suppliersList = ['deniz-lojistik', 'alp-ozler-lojistik', 'tekno-lojistik', 'ekol-lojistik'];
    const assignedSuppliers: { supplierId: string; assignedQty: number; assignmentId: string }[] = [];

    if (input.distributionMode === 'MANUAL' && input.manualDistribution) {
      for (const [supplierId, assignedQty] of Object.entries(input.manualDistribution)) {
        if (Number(assignedQty) > 0) {
          const assignmentRef = doc(collection(serverDb, 'requestAssignments'));
          batch.set(assignmentRef, {
            requestId,
            supplierId,
            assignedQuantity: Number(assignedQty),
            offeredQuantity: 0,
            confirmedQuantity: 0,
            status: 'PENDING',
            sentAt: serverTimestamp(),
          });
          assignedSuppliers.push({
            supplierId,
            assignedQty: Number(assignedQty),
            assignmentId: assignmentRef.id,
          });
        }
      }
    } else {
      const targets = input.selectedSuppliers && input.selectedSuppliers.length > 0
        ? input.selectedSuppliers
        : suppliersList;

      for (const supplierId of targets) {
        const assignmentRef = doc(collection(serverDb, 'requestAssignments'));
        batch.set(assignmentRef, {
          requestId,
          supplierId,
          assignedQuantity: Number(input.totalQuantity),
          offeredQuantity: 0,
          confirmedQuantity: 0,
          status: 'PENDING',
          sentAt: serverTimestamp(),
        });
        assignedSuppliers.push({
          supplierId,
          assignedQty: Number(input.totalQuantity),
          assignmentId: assignmentRef.id,
        });
      }
    }

    // Audit log
    const auditRef = doc(collection(serverDb, 'auditLogs'));
    batch.set(auditRef, {
      actorUid: payload.uid,
      actorRole: payload.role,
      action: `Yeni Uğraklı Talep Oluşturuldu: ${requestNumber} (${input.distributionMode})`,
      collection: 'vehicleRequests',
      documentId: requestId,
      newValues: { totalQuantity: input.totalQuantity, distributionMode: input.distributionMode, stopsCount: routeStops.length },
      createdAt: serverTimestamp(),
    });

    await batch.commit();

    // Create supplier request views only for assigned suppliers (Privacy isolation)
    for (const item of assignedSuppliers) {
      await syncSupplierRequestView({
        supplierId: item.supplierId,
        requestId,
        requestNumber,
        originFacility: input.originFacility,
        routeStops,
        destination: input.destination,
        vehicleType: input.vehicleType,
        assignedQuantity: item.assignedQty,
        offeredQuantity: 0,
        confirmedQuantity: 0,
        requiredDate: input.requiredDate,
        requiredTime: input.requiredTime || '09:00',
        distributionMode: input.distributionMode,
        status: 'PENDING',
        assignmentStatus: 'PENDING',
        assignmentId: item.assignmentId,
      });
    }

    // Section 5 Debug Console Log
    console.log('[DEBUG FIRESTORE OPERATION]', {
      projectId: (firebaseConfig as any).projectId,
      uid: payload.uid,
      role: payload.role,
      claims: { role: payload.role, supplierId: payload.supplierId },
      collection: 'vehicleRequests',
      operationType: 'create',
      result: 'SUCCESS',
      requestId,
    });

    return res.json({ success: true, requestId, requestNumber });
  } catch (err: any) {
    console.error('[DEBUG FIRESTORE OPERATION FAILED]', {
      projectId: (firebaseConfig as any).projectId,
      uid: payload.uid,
      role: payload.role,
      collection: 'vehicleRequests',
      operationType: 'create',
      result: 'FAILED',
      errorCode: err.code || 'firestore/internal-error',
      errorMessage: err.message,
    });
    return res.status(500).json({ error: err.message || 'Talep oluşturulamadı.', code: err.code || 'firestore/error' });
  }
});

// API: Supplier Offers Vehicles
app.post('/api/assignments/offer', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.sessionToken;

  const payload = verifySessionToken(token);
  if (!payload || payload.role !== 'SUPPLIER') {
    return res.status(403).json({ error: 'Yalnızca yetkili tedarikçi teklif bildirebilir.', code: 'auth/permission-denied' });
  }

  const { assignmentId, offeredQuantity, responseNote } = req.body;
  try {
    const assignmentRef = doc(serverDb, 'requestAssignments', assignmentId);
    await setDoc(
      assignmentRef,
      {
        offeredQuantity: Number(offeredQuantity),
        responseNote: responseNote || '',
        status: 'OFFERED',
        respondedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const auditRef = doc(collection(serverDb, 'auditLogs'));
    await setDoc(auditRef, {
      actorUid: payload.uid,
      actorRole: payload.role,
      action: `Tedarikçi Teklif Bildirdi: ${offeredQuantity} Araç`,
      collection: 'requestAssignments',
      documentId: assignmentId,
      newValues: { offeredQuantity, responseNote },
      createdAt: serverTimestamp(),
    });

    console.log('[DEBUG FIRESTORE OPERATION]', {
      projectId: (firebaseConfig as any).projectId,
      uid: payload.uid,
      role: payload.role,
      collection: 'requestAssignments',
      operationType: 'update',
      result: 'SUCCESS',
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Teklif güncellenemedi.', code: err.code });
  }
});

// API: Admin Confirms Quota
app.post('/api/assignments/confirm', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.sessionToken;

  const payload = verifySessionToken(token);
  if (!payload || payload.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Yalnızca yöneticiler kontenjan kesinleştirebilir.', code: 'auth/permission-denied' });
  }

  const { requestId, assignmentId, confirmedQuantity } = req.body;

  try {
    const requestRef = doc(serverDb, 'vehicleRequests', requestId);
    const reqSnap = await getDoc(requestRef);
    if (!reqSnap.exists()) {
      return res.status(404).json({ error: 'Talep bulunamadı.' });
    }
    const requestData = reqSnap.data();

    const q = query(collection(serverDb, 'requestAssignments'), where('requestId', '==', requestId));
    const assignmentsSnap = await getDocs(q);

    let currentConfirmedTotal = 0;
    assignmentsSnap.forEach((d) => {
      if (d.id !== assignmentId) {
        currentConfirmedTotal += (d.data().confirmedQuantity || 0);
      }
    });

    if (currentConfirmedTotal + Number(confirmedQuantity) > requestData.totalQuantity) {
      return res.status(400).json({
        error: `Onaylanan toplam araç miktarı (${currentConfirmedTotal + Number(confirmedQuantity)}), talep edilen toplam miktarı (${requestData.totalQuantity}) aşamaz!`,
        code: 'business/limit-exceeded',
      });
    }

    const targetAssignmentRef = doc(serverDb, 'requestAssignments', assignmentId);
    await setDoc(
      targetAssignmentRef,
      {
        confirmedQuantity: Number(confirmedQuantity),
        status: Number(confirmedQuantity) > 0 ? 'CONFIRMED' : 'REJECTED',
      },
      { merge: true }
    );

    const newTotalConfirmed = currentConfirmedTotal + Number(confirmedQuantity);
    const newStatus =
      newTotalConfirmed >= requestData.totalQuantity
        ? 'FULFILLED'
        : newTotalConfirmed > 0
        ? 'PARTIALLY_FULFILLED'
        : 'PENDING';

    await setDoc(requestRef, { status: newStatus, updatedAt: serverTimestamp() }, { merge: true });

    const auditRef = doc(collection(serverDb, 'auditLogs'));
    await setDoc(auditRef, {
      actorUid: payload.uid,
      actorRole: payload.role,
      action: `Tedarikçi Kontenjanı Kesinleştirildi: ${confirmedQuantity} Araç`,
      collection: 'requestAssignments',
      documentId: assignmentId,
      newValues: { confirmedQuantity },
      createdAt: serverTimestamp(),
    });

    console.log('[DEBUG FIRESTORE OPERATION]', {
      projectId: (firebaseConfig as any).projectId,
      uid: payload.uid,
      role: payload.role,
      collection: 'requestAssignments',
      operationType: 'confirm',
      result: 'SUCCESS',
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Kontenjan kesinleştirilemedi.', code: err.code });
  }
});

// Helper to send system notifications
async function createSystemNotification(params: {
  recipientRole?: 'ADMIN' | 'OPERATOR' | 'ALL';
  recipientUid?: string;
  type: string;
  title: string;
  body: string;
  relatedVehicleId?: string;
  relatedRequestId?: string;
}) {
  try {
    const notifRef = doc(collection(serverDb, 'notifications'));
    await setDoc(notifRef, {
      recipientRole: params.recipientRole || 'ALL',
      recipientUid: params.recipientUid || null,
      type: params.type,
      title: params.title,
      body: params.body,
      relatedVehicleId: params.relatedVehicleId || null,
      relatedRequestId: params.relatedRequestId || null,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err: any) {
    console.error('[NOTIFICATION ERROR]:', err.message);
  }
}

// API: Add Vehicle (with Plate Uniqueness Check & Automatic Notifications)
app.post('/api/vehicles/add', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.sessionToken;

  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Yetkisiz işlem.', code: 'auth/unauthenticated' });
  }

  const input = req.body;
  const cleanPlate = input.plate.toUpperCase().trim();
  const requestId = input.requestId || 'REQ-GENEL';
  const supplierId = payload.role === 'SUPPLIER' ? (payload.supplierId || input.supplierId) : input.supplierId;

  // 1. Plate Uniqueness Check for this specific request
  if (requestId && requestId !== 'REQ-GENEL') {
    const qPlate = query(
      collection(serverDb, 'vehicles'),
      where('requestId', '==', requestId),
      where('plate', '==', cleanPlate)
    );
    const existingPlateSnap = await getDocs(qPlate);
    if (!existingPlateSnap.empty) {
      return res.status(400).json({
        error: `Bu plaka (${cleanPlate}) ilgili talep için zaten sisteme eklenmiştir. Lütfen farklı bir araç plakası giriniz.`,
        code: 'business/duplicate-plate',
      });
    }
  }

  const vehicleRef = doc(collection(serverDb, 'vehicles'));
  const vehicleId = vehicleRef.id;

  try {
    const newVehicle = {
      requestId,
      assignmentId: input.assignmentId || '',
      supplierId,
      plate: cleanPlate,
      driverName: input.driverName.trim(),
      driverPhone: input.driverPhone.trim(),
      vehicleType: input.vehicleType,
      originFacility: input.originFacility,
      routeStops: Array.isArray(input.routeStops) ? input.routeStops : [],
      destination: input.destination,
      requiredDate: input.requiredDate,
      expectedArrival: input.expectedArrival || '',
      actualArrival: '',
      status: 'SUPPLIER_REPORTED', // Auto-set to SUPPLIER_REPORTED
      description: input.description || '',
      revisionCount: 0,
      createdBy: payload.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(vehicleRef, newVehicle);

    const eventRef = doc(collection(serverDb, 'vehicleEvents'));
    await setDoc(eventRef, {
      vehicleId,
      eventType: 'SUPPLIER_REPORTED',
      description: `Araç bildirildi: ${newVehicle.plate} - Şoför: ${newVehicle.driverName} (${newVehicle.driverPhone})`,
      createdBy: payload.uid,
      createdAt: serverTimestamp(),
    });

    const auditRef = doc(collection(serverDb, 'auditLogs'));
    await setDoc(auditRef, {
      actorUid: payload.uid,
      actorRole: payload.role,
      action: `Yeni Araç Bildirildi: ${newVehicle.plate}`,
      collection: 'vehicles',
      documentId: vehicleId,
      newValues: newVehicle,
      createdAt: serverTimestamp(),
    });

    // Send notifications to Admin and Operators
    const supplierNameMap: Record<string, string> = {
      'deniz-lojistik': 'Deniz Lojistik',
      'alp-ozler-lojistik': 'Alp Özler Lojistik',
      'tekno-lojistik': 'Tekno Lojistik',
      'ekol-lojistik': 'Ekol Lojistik',
    };
    const sName = supplierNameMap[supplierId] || supplierId;

    await createSystemNotification({
      recipientRole: 'ALL',
      type: 'VEHICLE_REPORTED',
      title: 'YENİ ARAÇ BİLDİRİMİ',
      body: `Tedarikçi: ${sName}\nPlaka: ${cleanPlate}\nŞoför: ${newVehicle.driverName} (${newVehicle.driverPhone})\nRota: ${newVehicle.originFacility} → ${newVehicle.destination}`,
      relatedVehicleId: vehicleId,
      relatedRequestId: requestId,
    });

    console.log('[DEBUG FIRESTORE OPERATION]', {
      projectId: (firebaseConfig as any).projectId,
      uid: payload.uid,
      role: payload.role,
      collection: 'vehicles',
      operationType: 'create',
      result: 'SUCCESS',
      vehicleId,
    });

    return res.json({ success: true, vehicleId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Araç eklenemedi.', code: err.code });
  }
});

// API: Revise Vehicle Details (Requirement 5)
app.post('/api/vehicles/revise', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.sessionToken;

  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Yetkisiz işlem.', code: 'auth/unauthenticated' });
  }

  const { vehicleId, plate, driverName, driverPhone, expectedArrival, requiredDate, description } = req.body;

  try {
    const vRef = doc(serverDb, 'vehicles', vehicleId);
    const vSnap = await getDoc(vRef);
    if (!vSnap.exists()) {
      return res.status(404).json({ error: 'Araç bulunamadı.' });
    }

    const oldData = vSnap.data();

    if (payload.role === 'SUPPLIER' && payload.supplierId !== oldData.supplierId) {
      return res.status(403).json({ error: 'Başka tedarikçinin aracını revize edemezsiniz.', code: 'auth/permission-denied' });
    }

    const changes: string[] = [];
    const newValues: Record<string, any> = {};
    const oldValues: Record<string, any> = {};

    const newPlate = plate ? plate.toUpperCase().trim() : oldData.plate;
    if (newPlate && newPlate !== oldData.plate) {
      changes.push(`Plaka: ${oldData.plate} -> ${newPlate}`);
      oldValues.plate = oldData.plate;
      newValues.plate = newPlate;
    }

    const newDriverName = driverName ? driverName.trim() : oldData.driverName;
    if (newDriverName && newDriverName !== oldData.driverName) {
      changes.push(`Şoför: ${oldData.driverName} -> ${newDriverName}`);
      oldValues.driverName = oldData.driverName;
      newValues.driverName = newDriverName;
    }

    const newDriverPhone = driverPhone ? driverPhone.trim() : oldData.driverPhone;
    if (newDriverPhone && newDriverPhone !== oldData.driverPhone) {
      changes.push(`Telefon: ${oldData.driverPhone} -> ${newDriverPhone}`);
      oldValues.driverPhone = oldData.driverPhone;
      newValues.driverPhone = newDriverPhone;
    }

    const newArrival = expectedArrival ? expectedArrival.trim() : oldData.expectedArrival;
    if (newArrival && newArrival !== oldData.expectedArrival) {
      changes.push(`Tahmini Saat: ${oldData.expectedArrival || 'Belirtilmedi'} -> ${newArrival}`);
      oldValues.expectedArrival = oldData.expectedArrival || '';
      newValues.expectedArrival = newArrival;
    }

    const newReqDate = requiredDate ? requiredDate.trim() : oldData.requiredDate;
    if (newReqDate && newReqDate !== oldData.requiredDate) {
      changes.push(`Tarih: ${oldData.requiredDate} -> ${newReqDate}`);
      oldValues.requiredDate = oldData.requiredDate;
      newValues.requiredDate = newReqDate;
    }

    if (description && description !== oldData.description) {
      changes.push(`Açıklama güncellendi`);
      oldValues.description = oldData.description || '';
      newValues.description = description;
    }

    const newRevisionCount = (oldData.revisionCount || 0) + 1;
    const newStatus = oldData.status === 'APPROVED' ? 'REVISION_PENDING' : oldData.status;

    await setDoc(
      vRef,
      {
        plate: newPlate,
        driverName: newDriverName,
        driverPhone: newDriverPhone,
        expectedArrival: newArrival,
        requiredDate: newReqDate,
        description: description !== undefined ? description : (oldData.description || ''),
        status: newStatus,
        revisionCount: newRevisionCount,
        lastRevisionAt: serverTimestamp(),
        lastRevisionBy: payload.uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // Record Event
    const eventRef = doc(collection(serverDb, 'vehicleEvents'));
    await setDoc(eventRef, {
      vehicleId,
      eventType: 'REVISION',
      oldValues,
      newValues,
      description: `Araç Revizyonu (${changes.length > 0 ? changes.join(', ') : 'Genel Güncelleme'})`,
      createdBy: payload.uid,
      createdAt: serverTimestamp(),
    });

    // Record Audit Log
    const auditRef = doc(collection(serverDb, 'auditLogs'));
    await setDoc(auditRef, {
      actorUid: payload.uid,
      actorRole: payload.role,
      action: `Araç Revize Edildi: ${newPlate}`,
      collection: 'vehicles',
      documentId: vehicleId,
      oldValues,
      newValues,
      createdAt: serverTimestamp(),
    });

    // Send Notification to Admin & Operators
    const supplierNameMap: Record<string, string> = {
      'deniz-lojistik': 'Deniz Lojistik',
      'alp-ozler-lojistik': 'Alp Özler Lojistik',
      'tekno-lojistik': 'Tekno Lojistik',
      'ekol-lojistik': 'Ekol Lojistik',
    };
    const sName = supplierNameMap[oldData.supplierId] || oldData.supplierId;
    const timeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    await createSystemNotification({
      recipientRole: 'ALL',
      type: 'VEHICLE_REVISED',
      title: 'ARAÇ REVİZYONU',
      body: `Tedarikçi: ${sName}\nPlaka: ${newPlate}\nDeğişiklik: ${changes.length > 0 ? changes.join(', ') : 'Bilgiler güncellendi'}\nRevizyon yapan: ${payload.username}\nSaat: ${timeStr}`,
      relatedVehicleId: vehicleId,
      relatedRequestId: oldData.requestId,
    });

    console.log('[DEBUG FIRESTORE OPERATION]', {
      projectId: (firebaseConfig as any).projectId,
      uid: payload.uid,
      role: payload.role,
      collection: 'vehicles',
      operationType: 'revise',
      result: 'SUCCESS',
      vehicleId,
    });

    return res.json({ success: true, vehicleId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Revizyon başarısız.', code: err.code });
  }
});

// API: Mark Notification as Read
app.post('/api/notifications/mark-read', async (req, res) => {
  const { notificationId } = req.body;
  try {
    const notifRef = doc(serverDb, 'notifications', notificationId);
    await setDoc(notifRef, { read: true }, { merge: true });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// API: Update Vehicle Status
app.post('/api/vehicles/update-status', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.sessionToken;

  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Yetkisiz işlem.', code: 'auth/unauthenticated' });
  }

  const { vehicleId, newStatus, eventDescription, actualArrival } = req.body;

  try {
    const vehicleRef = doc(serverDb, 'vehicles', vehicleId);
    const updates: any = {
      status: newStatus,
      updatedAt: serverTimestamp(),
    };
    if (actualArrival) {
      updates.actualArrival = actualArrival;
    }

    await setDoc(vehicleRef, updates, { merge: true });

    const eventRef = doc(collection(serverDb, 'vehicleEvents'));
    await setDoc(eventRef, {
      vehicleId,
      eventType: newStatus,
      description: eventDescription || `Araç durumu güncellendi: ${newStatus}`,
      createdBy: payload.uid,
      createdAt: serverTimestamp(),
    });

    const auditRef = doc(collection(serverDb, 'auditLogs'));
    await setDoc(auditRef, {
      actorUid: payload.uid,
      actorRole: payload.role,
      action: `Araç Durumu Değiştirildi -> ${newStatus}`,
      collection: 'vehicles',
      documentId: vehicleId,
      newValues: { status: newStatus, actualArrival },
      createdAt: serverTimestamp(),
    });

    // Notify when vehicle is APPROVED, REJECTED, CANCELLED, or ARRIVED
    try {
      const vSnap = await getDoc(vehicleRef);
      if (vSnap.exists()) {
        const vData = vSnap.data();
        let notifTitle = '';
        let notifBody = '';

        if (newStatus === 'APPROVED') {
          notifTitle = 'ARAÇ ONAYLANDI';
          notifBody = `Plaka: ${vData.plate} (${vData.driverName})\nYönetici tarafından onaylandı.`;
        } else if (newStatus === 'REJECTED') {
          notifTitle = 'ARAÇ REDDEDİLDİ';
          notifBody = `Plaka: ${vData.plate} (${vData.driverName})\nYönetici tarafından reddedildi.`;
        } else if (newStatus === 'CANCELLED') {
          notifTitle = 'ARAÇ İPTAL EDİLDİ';
          notifBody = `Plaka: ${vData.plate} iptal edildi.\nİşlemi yapan: ${payload.username}`;
        } else if (newStatus === 'ARRIVED') {
          notifTitle = 'ARAÇ TESİSE ULAŞTI';
          notifBody = `Plaka: ${vData.plate} tesise giriş yaptı: ${actualArrival || 'Saat belirtildi'}`;
        }

        if (notifTitle) {
          await createSystemNotification({
            recipientRole: 'ALL',
            type: `VEHICLE_${newStatus}`,
            title: notifTitle,
            body: notifBody,
            relatedVehicleId: vehicleId,
            relatedRequestId: vData.requestId,
          });
        }
      }
    } catch (e: any) {
      console.warn('Notification send failed in update-status:', e.message);
    }

    console.log('[DEBUG FIRESTORE OPERATION]', {
      projectId: (firebaseConfig as any).projectId,
      uid: payload.uid,
      role: payload.role,
      collection: 'vehicles',
      operationType: 'update',
      result: 'SUCCESS',
      vehicleId,
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Durum güncellenemedi.', code: err.code });
  }
});

// API: Admin Transfers Vehicle to another Supplier
app.post('/api/vehicles/transfer', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.sessionToken;

  const payload = verifySessionToken(token);
  if (!payload || payload.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Yalnızca yöneticiler araç aktarabilir.', code: 'auth/permission-denied' });
  }

  const { vehicleId, oldSupplierId, newSupplierId } = req.body;

  try {
    const vehicleRef = doc(serverDb, 'vehicles', vehicleId);
    await setDoc(vehicleRef, { supplierId: newSupplierId, updatedAt: serverTimestamp() }, { merge: true });

    const eventRef = doc(collection(serverDb, 'vehicleEvents'));
    await setDoc(eventRef, {
      vehicleId,
      eventType: 'TEDARIKCI_AKTARIMI',
      description: `Araç ${oldSupplierId} tedarikçisinden ${newSupplierId} tedarikçisine aktarıldı.`,
      createdBy: payload.uid,
      createdAt: serverTimestamp(),
    });

    const auditRef = doc(collection(serverDb, 'auditLogs'));
    await setDoc(auditRef, {
      actorUid: payload.uid,
      actorRole: payload.role,
      action: `Araç Tedarikçi Aktarımı: ${oldSupplierId} -> ${newSupplierId}`,
      collection: 'vehicles',
      documentId: vehicleId,
      oldValues: { supplierId: oldSupplierId },
      newValues: { supplierId: newSupplierId },
      createdAt: serverTimestamp(),
    });

    console.log('[DEBUG FIRESTORE OPERATION]', {
      projectId: (firebaseConfig as any).projectId,
      uid: payload.uid,
      role: payload.role,
      collection: 'vehicles',
      operationType: 'transfer',
      result: 'SUCCESS',
      vehicleId,
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Aktarım yapılamadı.', code: err.code });
  }
});

// API: Send Driver Message
app.post('/api/messages/send', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.sessionToken;

  const payload = verifySessionToken(token);
  if (!payload || (payload.role !== 'OPERATOR' && payload.role !== 'ADMIN')) {
    return res.status(403).json({ error: 'Yalnızca yetkili operatör ve yöneticiler mesaj gönderebilir.', code: 'auth/permission-denied' });
  }

  const input = req.body;
  const messageRef = doc(collection(serverDb, 'messages'));
  const messageId = messageRef.id;

  try {
    const newMsg = {
      vehicleId: input.vehicleId || '',
      driverPhone: input.driverPhone,
      driverName: input.driverName || '',
      plate: input.plate || '',
      channel: input.channel,
      direction: 'OUTBOUND',
      content: input.content,
      providerMessageId: `prov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      deliveryStatus: 'DELIVERED',
      sentBy: payload.uid,
      createdAt: serverTimestamp(),
    };

    await setDoc(messageRef, newMsg);

    if (input.vehicleId) {
      const eventRef = doc(collection(serverDb, 'vehicleEvents'));
      await setDoc(eventRef, {
        vehicleId: input.vehicleId,
        eventType: `${input.channel}_GONDERILDI`,
        description: `Şoföre ${input.channel} iletildi: "${input.content.slice(0, 60)}..."`,
        createdBy: payload.uid,
        createdAt: serverTimestamp(),
      });
    }

    const auditRef = doc(collection(serverDb, 'auditLogs'));
    await setDoc(auditRef, {
      actorUid: payload.uid,
      actorRole: payload.role,
      action: `${input.channel} Mesajı Gönderildi (${input.driverPhone})`,
      collection: 'messages',
      documentId: messageId,
      newValues: { channel: input.channel, content: input.content, phone: input.driverPhone },
      createdAt: serverTimestamp(),
    });

    console.log('[DEBUG FIRESTORE OPERATION]', {
      projectId: (firebaseConfig as any).projectId,
      uid: payload.uid,
      role: payload.role,
      collection: 'messages',
      operationType: 'create',
      result: 'SUCCESS',
      messageId,
    });

    return res.json({ success: true, messageId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Mesaj gönderilemedi.', code: err.code });
  }
});

// API: Admin Creates New User
app.post('/api/admin/create-user', async (req, res) => {
  const { adminToken, username, password, fullName, role, supplierId, phone } = req.body;

  const adminPayload = verifySessionToken(adminToken);
  if (!adminPayload || adminPayload.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Yalnızca yöneticiler yeni kullanıcı oluşturabilir.' });
  }

  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ error: 'Tüm zorunlu alanlar doldurulmalıdır.' });
  }

  const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

  try {
    const q = query(collection(serverDb, 'users'), where('username', '==', cleanUsername));
    const existing = await getDocs(q);
    if (!existing.empty) {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten kullanılmaktadır.' });
    }

    const uid = `usr-${cleanUsername}-${Date.now().toString().slice(-4)}`;
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    await setDoc(doc(serverDb, 'users', uid), {
      uid,
      username: cleanUsername,
      fullName: fullName.trim(),
      role,
      supplierId: role === 'SUPPLIER' ? supplierId : null,
      phone: phone || '',
      salt,
      passwordHash,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return res.json({
      success: true,
      user: { uid, username: cleanUsername, fullName, role, supplierId },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Kullanıcı oluşturulamadı.' });
  }
});

// API: Admin Toggles Active/Inactive
app.post('/api/admin/toggle-user-active', async (req, res) => {
  const { adminToken, targetUid, active } = req.body;

  const adminPayload = verifySessionToken(adminToken);
  if (!adminPayload || adminPayload.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Yetkisiz işlem.' });
  }

  try {
    await setDoc(
      doc(serverDb, 'users', targetUid),
      { active: Boolean(active), updatedAt: serverTimestamp() },
      { merge: true }
    );
    return res.json({ success: true, active });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Durum güncellenemedi.' });
  }
});

// API: Admin Resets Password
app.post('/api/admin/reset-password', async (req, res) => {
  const { adminToken, targetUid, newPassword } = req.body;

  const adminPayload = verifySessionToken(adminToken);
  if (!adminPayload || adminPayload.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Yetkisiz işlem.' });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır.' });
  }

  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(newPassword, salt);

    await setDoc(
      doc(serverDb, 'users', targetUid),
      {
        salt,
        passwordHash,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ success: true, message: 'Şifre başarıyla güncellendi.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Şifre güncellenemedi.' });
  }
});

// API: Admin Adds Facility
app.post('/api/facilities/add', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.sessionToken;

  const payload = verifySessionToken(token);
  if (!payload || payload.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Yalnızca yöneticiler yeni tesis ekleyebilir.' });
  }

  const { facilityName, city } = req.body;
  if (!facilityName || !facilityName.trim()) {
    return res.status(400).json({ error: 'Tesis adı zorunludur.' });
  }

  const cleanName = facilityName.trim().toUpperCase();

  try {
    const q = query(collection(serverDb, 'facilities'), where('facilityName', '==', cleanName));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return res.status(400).json({ error: 'Bu tesis adı veritabanında zaten mevcut.' });
    }

    const facilityId = cleanName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 30) + '-' + Date.now().toString().slice(-4);
    const facilityDoc = doc(serverDb, 'facilities', facilityId);

    await setDoc(facilityDoc, {
      id: facilityId,
      facilityName: cleanName,
      city: city || 'Türkiye',
      active: true,
      createdAt: serverTimestamp(),
    });

    return res.json({ success: true, facility: { id: facilityId, facilityName: cleanName, city: city || 'Türkiye', active: true } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Tesis eklenemedi.' });
  }
});

// API: Admin Toggles Facility Active State
app.post('/api/facilities/toggle-active', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.body.sessionToken;

  const payload = verifySessionToken(token);
  if (!payload || payload.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Yetkisiz işlem.' });
  }

  const { facilityId, active } = req.body;

  try {
    const facilityRef = doc(serverDb, 'facilities', facilityId);
    await setDoc(facilityRef, { active: Boolean(active) }, { merge: true });
    return res.json({ success: true, active: Boolean(active) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Tesis durumu güncellenemedi.' });
  }
});

// Vite middleware for dev
async function startServer() {
  await bootstrapInitialAccounts();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`TEDARİK360 server running on port ${port}`);
  });
}

startServer();
