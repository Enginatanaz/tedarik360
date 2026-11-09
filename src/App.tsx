import React, { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { LoginScreen } from './components/auth/LoginScreen';
import { AdminOverview } from './components/admin/AdminOverview';
import { CreateRequestForm } from './components/admin/CreateRequestForm';
import { VehicleManagement } from './components/admin/VehicleManagement';
import { DriverMessagingModule } from './components/messaging/DriverMessagingModule';
import { SupplierPortal } from './components/supplier/SupplierPortal';
import { OperatorDashboard } from './components/operator/OperatorDashboard';
import { AuditLogViewer } from './components/admin/AuditLogViewer';
import { UserManagement } from './components/admin/UserManagement';

import {
  collection,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, testFirestoreConnection } from './firebase';
import {
  VehicleRequest,
  RequestAssignment,
  Vehicle,
  Supplier,
  Facility,
  Message,
  AuditLog,
  UserProfile,
  SupplierRequestView,
} from './types';
import { INITIAL_SUPPLIERS, INITIAL_FACILITIES } from './services/seedService';

export default function App() {
  const { currentUser, userProfile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('admin-overview');

  // Live Firestore collections
  const [requests, setRequests] = useState<VehicleRequest[]>([]);
  const [assignments, setAssignments] = useState<RequestAssignment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [facilities, setFacilities] = useState<Facility[]>(INITIAL_FACILITIES);
  const [messages, setMessages] = useState<Message[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [supplierViews, setSupplierViews] = useState<SupplierRequestView[]>([]);

  // Modal for messaging a specific vehicle
  const [messageTargetVehicle, setMessageTargetVehicle] = useState<Vehicle | null>(null);

  // Sync default tab when user signs in or role updates
  useEffect(() => {
    if (userProfile?.role === 'ADMIN') {
      setActiveTab('admin-overview');
    } else if (userProfile?.role === 'OPERATOR') {
      setActiveTab('op-daily');
    } else if (userProfile?.role === 'SUPPLIER') {
      setActiveTab('sup-overview');
    }
  }, [userProfile?.role]);

  // Firestore Realtime Listeners
  useEffect(() => {
    if (!currentUser) return;

    testFirestoreConnection();

    // 1. Vehicle Requests
    const unsubReqs = onSnapshot(
      collection(db, 'vehicleRequests'),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as VehicleRequest[];
        data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRequests(data);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'vehicleRequests')
    );

    // 2. Request Assignments
    const unsubAsgs = onSnapshot(
      collection(db, 'requestAssignments'),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as RequestAssignment[];
        setAssignments(data);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'requestAssignments')
    );

    // 3. Vehicles
    const unsubVehicles = onSnapshot(
      collection(db, 'vehicles'),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Vehicle[];
        data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setVehicles(data);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'vehicles')
    );

    // 4. Suppliers
    const unsubSuppliers = onSnapshot(
      collection(db, 'suppliers'),
      (snapshot) => {
        if (!snapshot.empty) {
          const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Supplier[];
          setSuppliers(data);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers')
    );

    // 5. Facilities (Master Database)
    const unsubFacilities = onSnapshot(
      collection(db, 'facilities'),
      (snapshot) => {
        if (!snapshot.empty) {
          const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Facility[];
          data.sort((a, b) => (a.facilityName || '').localeCompare(b.facilityName || ''));
          setFacilities(data);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'facilities')
    );

    // 6. Messages
    const unsubMessages = onSnapshot(
      collection(db, 'messages'),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Message[];
        data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setMessages(data);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'messages')
    );

    // 7. Audit Logs
    const unsubAudit = onSnapshot(
      collection(db, 'auditLogs'),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as AuditLog[];
        data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setAuditLogs(data);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
    );

    // 8. Users Collection
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as unknown as UserProfile[];
        setAllUsers(data);
      },
      (err) => console.warn('Users fetch notice:', err.message)
    );

    // 9. Supplier Request Views (Privacy Isolation)
    const unsubViews = onSnapshot(
      collection(db, 'supplierRequestViews'),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as SupplierRequestView[];
        setSupplierViews(data);
      },
      (err) => console.warn('Supplier views fetch notice:', err.message)
    );

    return () => {
      unsubReqs();
      unsubAsgs();
      unsubVehicles();
      unsubSuppliers();
      unsubFacilities();
      unsubMessages();
      unsubAudit();
      unsubUsers();
      unsubViews();
    };
  }, [currentUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#092B60] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-[#FFD000] border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-white font-black text-sm tracking-wider">TEDARİK360</div>
        <div className="text-blue-200 text-xs mt-1">Güvenlik ve yetki kontrolü yapılıyor...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  const role = userProfile?.role || 'ADMIN';

  const renderContent = () => {
    // SUPPLIER PORTAL
    if (role === 'SUPPLIER') {
      return (
        <SupplierPortal
          requests={requests}
          assignments={assignments}
          vehicles={vehicles}
          suppliers={suppliers}
          facilities={facilities}
          supplierViews={supplierViews}
          currentTab={activeTab}
        />
      );
    }

    // OPERATOR DASHBOARD
    if (role === 'OPERATOR') {
      if (activeTab === 'op-messages' || activeTab === 'op-bulk-message') {
        return (
          <DriverMessagingModule
            messages={messages}
            vehicles={vehicles}
            activeVehicleForModal={messageTargetVehicle}
          />
        );
      }
      if (activeTab === 'op-history') {
        return <AuditLogViewer logs={auditLogs} />;
      }
      return (
        <OperatorDashboard
          vehicles={vehicles}
          suppliers={suppliers}
          currentTab={activeTab}
          onOpenMessageModal={(v) => {
            setMessageTargetVehicle(v);
            setActiveTab('op-messages');
          }}
        />
      );
    }

    // ADMIN VIEWS
    switch (activeTab) {
      case 'admin-overview':
        return (
          <AdminOverview
            requests={requests}
            assignments={assignments}
            vehicles={vehicles}
            suppliers={suppliers}
            facilities={facilities}
            onNavigateToTab={(tab) => setActiveTab(tab)}
          />
        );
      case 'admin-new-request':
        return (
          <CreateRequestForm
            facilities={facilities}
            suppliers={suppliers}
            onSuccess={() => setActiveTab('admin-overview')}
          />
        );
      case 'admin-requests':
        return (
          <AdminOverview
            requests={requests}
            assignments={assignments}
            vehicles={vehicles}
            suppliers={suppliers}
            facilities={facilities}
            onNavigateToTab={(tab) => setActiveTab(tab)}
          />
        );
      case 'admin-vehicles':
        return (
          <VehicleManagement
            vehicles={vehicles}
            suppliers={suppliers}
            onOpenMessageModal={(v) => {
              setMessageTargetVehicle(v);
              setActiveTab('admin-messages');
            }}
          />
        );
      case 'admin-suppliers':
        return (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-md text-xs space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-black text-[#092B60]">4 Temel Tedarikçi Firma Detayı</h2>
                <p className="text-slate-500 text-[11px]">Sistemde tanımlı 4 bağımsız lojistik çözüm ortağı</p>
              </div>
              <button
                onClick={() => setActiveTab('admin-operators')}
                className="bg-[#092B60] hover:bg-[#0D3978] text-[#FFD000] px-3.5 py-1.5 rounded-lg font-bold shadow-xs"
              >
                Tedarikçi Hesaplarını Yönet
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suppliers.map((s) => (
                <div key={s.id} className="p-4 rounded-xl border border-slate-200 bg-[#EAF3FF]">
                  <div className="font-black text-[#092B60] text-sm">{s.companyName}</div>
                  <div className="text-slate-700 mt-1 font-bold">Yetkili: {s.contactPerson}</div>
                  <div className="text-slate-600 font-mono">Tel: {s.phone}</div>
                  <div className="text-slate-600">E-posta: {s.email}</div>
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-blue-200 text-[11px]">
                    <span className="text-emerald-800 font-black">● Aktif Çözüm Ortağı</span>
                    <span className="font-mono text-[#092B60] font-bold">ID: {s.id}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'admin-operators':
        return <UserManagement users={allUsers} suppliers={suppliers} />;
      case 'admin-messages':
        return (
          <DriverMessagingModule
            messages={messages}
            vehicles={vehicles}
            activeVehicleForModal={messageTargetVehicle}
          />
        );
      case 'admin-audit':
        return <AuditLogViewer logs={auditLogs} />;
      case 'admin-settings':
        return <UserManagement users={allUsers} suppliers={suppliers} />;
      default:
        return (
          <AdminOverview
            requests={requests}
            assignments={assignments}
            vehicles={vehicles}
            suppliers={suppliers}
            facilities={facilities}
            onNavigateToTab={(tab) => setActiveTab(tab)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col antialiased">
      <Navbar activeTab={activeTab} vehicles={vehicles} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentTab={activeTab} onSelectTab={(tabId) => setActiveTab(tabId)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-100">
          <div className="max-w-7xl mx-auto">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
}
