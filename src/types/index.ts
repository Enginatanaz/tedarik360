import { Timestamp } from 'firebase/firestore';

export type UserRole = 'ADMIN' | 'OPERATOR' | 'SUPPLIER';

export interface UserProfile {
  uid: string;
  fullName: string;
  username?: string;
  email: string;
  phone?: string;
  role: UserRole;
  supplierId?: string; // Set when role === 'SUPPLIER'
  active: boolean;
  createdAt: any;
  updatedAt?: any;
}

export interface Supplier {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  active: boolean;
  createdAt: any;
}

export interface Facility {
  id: string;
  facilityName: string;
  city: string;
  active: boolean;
  createdAt?: any;
}

export interface RouteStop {
  facilityId: string;
  facilityName: string;
  sequence: number;
  note?: string;
  expectedArrival?: string;
  actualArrival?: string;
  status?: 'BEKLENIYOR' | 'VARDI' | 'TAMAMLANTI';
}

export type DistributionMode = 'MANUAL' | 'OPEN';

export type VehicleRequestStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'CANCELLED';

export interface VehicleRequest {
  id: string;
  requestNumber: string;
  originFacility: string;
  routeStops?: RouteStop[];
  destination: string;
  vehicleType: string;
  totalQuantity: number;
  distributionMode: DistributionMode;
  requiredDate: string;
  requiredTime?: string;
  description?: string;
  status: VehicleRequestStatus;
  createdBy: string;
  createdAt: any;
  updatedAt?: any;
}

export type AssignmentStatus =
  | 'PENDING'
  | 'OFFERED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'COMPLETED';

export interface RequestAssignment {
  id: string;
  requestId: string;
  supplierId: string;
  assignedQuantity: number;
  offeredQuantity: number;
  confirmedQuantity: number;
  status: AssignmentStatus;
  responseNote?: string;
  sentAt: any;
  respondedAt?: any;
}

export interface SupplierRequestView {
  id: string;
  requestId: string;
  supplierId: string;
  requestNumber: string;
  originFacility: string;
  routeStops?: RouteStop[];
  destination: string;
  vehicleType: string;
  assignedQuantity: number;
  offeredQuantity?: number;
  confirmedQuantity?: number;
  requiredDate: string;
  requiredTime?: string;
  distributionMode: DistributionMode;
  status: VehicleRequestStatus;
  assignmentStatus?: AssignmentStatus;
  assignmentId?: string;
  responseNote?: string;
  createdAt: any;
}

export type VehicleStatus =
  | 'SUPPLIER_REPORTED'
  | 'REVISION_PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'CANCELLED'
  | 'TALEP_GONDERILDI'
  | 'YANIT_BEKLENIYOR'
  | 'ARAC_BILDIRILDI'
  | 'YONETICI_ONAYI'
  | 'TEYIT_EDILDI'
  | 'YOLDA'
  | 'TESISE_GIRIS_YAPTI'
  | 'GECIKTI'
  | 'ARIZALI'
  | 'IPTAL';

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, { label: string; badgeClass: string }> = {
  SUPPLIER_REPORTED: { label: 'Tedarikçi Bildirdi (Kontrol Bekliyor)', badgeClass: 'bg-[#0D3978] text-white border-[#092B60] font-bold' },
  REVISION_PENDING: { label: 'Revize Edildi (Kontrol Bekliyor)', badgeClass: 'bg-amber-100 text-amber-950 border-amber-400 font-bold' },
  APPROVED: { label: 'Yönetici Onayladı', badgeClass: 'bg-[#A7F36B] text-[#092B60] border-emerald-500 font-black' },
  REJECTED: { label: 'Yönetici Reddetti', badgeClass: 'bg-rose-100 text-rose-950 border-rose-400 font-bold' },
  ON_THE_WAY: { label: 'Yolda', badgeClass: 'bg-sky-100 text-sky-950 border-sky-400 font-bold' },
  ARRIVED: { label: 'Tesise Giriş Yaptı', badgeClass: 'bg-emerald-600 text-white border-emerald-700 font-black' },
  CANCELLED: { label: 'İptal Edildi', badgeClass: 'bg-slate-200 text-slate-700 border-slate-300 font-medium' },

  // Backward compatibility
  TALEP_GONDERILDI: { label: 'Talep Gönderildi', badgeClass: 'bg-[#EAF3FF] text-[#092B60] border-blue-200 font-semibold' },
  YANIT_BEKLENIYOR: { label: 'Yanıt Bekleniyor', badgeClass: 'bg-amber-50 text-amber-900 border-amber-300 font-semibold' },
  ARAC_BILDIRILDI: { label: 'Tedarikçi Bildirdi (Kontrol Bekliyor)', badgeClass: 'bg-[#0D3978] text-white border-[#092B60] font-semibold' },
  YONETICI_ONAYI: { label: 'Yönetici Onayı Bekliyor', badgeClass: 'bg-indigo-50 text-indigo-900 border-indigo-200 font-semibold' },
  TEYIT_EDILDI: { label: 'Yönetici Onayladı', badgeClass: 'bg-[#A7F36B]/30 text-emerald-950 border-emerald-400 font-semibold' },
  YOLDA: { label: 'Yolda', badgeClass: 'bg-sky-50 text-sky-900 border-sky-300 font-semibold' },
  TESISE_GIRIS_YAPTI: { label: 'Tesise Giriş Yaptı', badgeClass: 'bg-[#A7F36B] text-[#092B60] border-emerald-500 font-bold' },
  GECIKTI: { label: 'Gecikti', badgeClass: 'bg-amber-200 text-amber-950 border-amber-400 font-bold' },
  ARIZALI: { label: 'Arızalı', badgeClass: 'bg-rose-100 text-rose-900 border-rose-300 font-bold' },
  IPTAL: { label: 'İptal Edildi', badgeClass: 'bg-slate-200 text-slate-700 border-slate-300 font-medium' },
};

export interface Vehicle {
  id: string;
  requestId: string;
  assignmentId?: string;
  supplierId: string;
  plate: string;
  driverName: string;
  driverPhone: string;
  vehicleType: string;
  originFacility: string;
  routeStops?: RouteStop[];
  destination: string;
  requiredDate: string;
  expectedArrival?: string;
  actualArrival?: string;
  status: VehicleStatus;
  description?: string;
  revisionCount?: number;
  lastRevisionAt?: any;
  lastRevisionBy?: string;
  createdBy: string;
  createdAt: any;
  updatedAt?: any;
}

export interface VehicleEvent {
  id: string;
  vehicleId: string;
  eventType: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  description: string;
  createdBy: string;
  createdAt: any;
}

export type MessageChannel = 'WHATSAPP' | 'SMS';
export type MessageDirection = 'OUTBOUND' | 'INBOUND';
export type MessageStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'RECEIVED';

export interface Message {
  id: string;
  vehicleId?: string;
  driverPhone: string;
  channel: MessageChannel;
  direction: MessageDirection;
  content: string;
  providerMessageId?: string;
  deliveryStatus: MessageStatus;
  sentBy: string;
  createdAt: any;
  driverName?: string;
  plate?: string;
}

export interface NotificationItem {
  id: string;
  recipientUid?: string;
  recipientRole?: string;
  type?: string;
  title: string;
  body: string;
  relatedVehicleId?: string;
  relatedRequestId?: string;
  read: boolean;
  createdAt: any;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorRole: string;
  action: string;
  collection: string;
  documentId: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  createdAt: any;
}
