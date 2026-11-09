import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Truck,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Building2,
  CheckSquare,
  Plus,
  Power,
  MapPin,
  Route,
  ChevronDown,
  ChevronUp,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { VehicleRequest, RequestAssignment, Vehicle, Supplier, Facility } from '../../types';
import { confirmSupplierQuota, addFacility, toggleFacilityActive } from '../../services/logisticsService';
import { useAuth } from '../../context/AuthContext';

interface AdminOverviewProps {
  requests: VehicleRequest[];
  assignments: RequestAssignment[];
  vehicles: Vehicle[];
  suppliers: Supplier[];
  facilities: Facility[];
  onNavigateToTab: (tabId: string) => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  requests,
  assignments,
  vehicles,
  suppliers,
  facilities,
  onNavigateToTab,
}) => {
  const { currentUser } = useAuth();
  const [confirmingQty, setConfirmingQty] = useState<{ [assignmentId: string]: number }>({});
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState<string | null>(null);

  // Facility management state
  const [newFacName, setNewFacName] = useState('');
  const [newFacCity, setNewFacCity] = useState('');
  const [facLoading, setFacLoading] = useState(false);
  const [facError, setFacError] = useState<string | null>(null);
  const [facSuccess, setFacSuccess] = useState<string | null>(null);

  // Expandable Request Accordion State
  const [expandedRequests, setExpandedRequests] = useState<{ [reqId: string]: boolean }>({});

  const toggleRequestExpand = (id: string) => {
    setExpandedRequests((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Key KPI aggregations - 3 Distinct Counters Engine
  const totalRequests = requests.length;
  const totalWantedVehicles = requests.reduce((acc, r) => acc + (r.totalQuantity || 0), 0);

  const reportedVehiclesCount = vehicles.filter((v) =>
    ['SUPPLIER_REPORTED', 'REVISION_PENDING', 'APPROVED', 'ON_THE_WAY', 'ARRIVED', 'ARAC_BILDIRILDI', 'TEYIT_EDILDI', 'TESISE_GIRIS_YAPTI'].includes(v.status)
  ).length;

  const confirmedVehiclesCount = vehicles.filter((v) =>
    ['APPROVED', 'ON_THE_WAY', 'ARRIVED', 'TEYIT_EDILDI', 'TESISE_GIRIS_YAPTI'].includes(v.status)
  ).length;

  const arrivedCount = vehicles.filter((v) =>
    ['ARRIVED', 'TESISE_GIRIS_YAPTI'].includes(v.status)
  ).length;

  const missingVehicles = Math.max(0, totalWantedVehicles - confirmedVehiclesCount);
  const waitingResponseCount = vehicles.filter((v) => ['SUPPLIER_REPORTED', 'REVISION_PENDING', 'ARAC_BILDIRILDI', 'TALEP_GONDERILDI', 'YANIT_BEKLENIYOR'].includes(v.status)).length;
  const onRoadCount = vehicles.filter((v) => ['YOLDA', 'ON_THE_WAY'].includes(v.status)).length;
  const delayedCount = vehicles.filter((v) => v.status === 'GECIKTI').length;

  const getSupplierStats = (supplierId: string) => {
    const supVehicles = vehicles.filter((v) => v.supplierId === supplierId);
    const supAssignments = assignments.filter((a) => a.supplierId === supplierId);
    const totalAssigned = supAssignments.reduce((acc, a) => acc + (a.assignedQuantity || 0), 0);
    const totalOffered = supAssignments.reduce((acc, a) => acc + (a.offeredQuantity || 0), 0);
    const totalConfirmed = supAssignments.reduce((acc, a) => acc + (a.confirmedQuantity || 0), 0);
    const onTimeArrivals = supVehicles.filter((v) => v.status === 'TESISE_GIRIS_YAPTI').length;
    const delays = supVehicles.filter((v) => v.status === 'GECIKTI').length;

    return {
      totalAssigned,
      totalOffered,
      totalConfirmed,
      actualVehicles: supVehicles.length,
      onTimeArrivals,
      delays,
    };
  };

  const handleConfirmOffers = async (assignment: RequestAssignment, qty: number) => {
    if (!currentUser) return;
    setConfirmError(null);
    setConfirmSuccess(null);
    try {
      await confirmSupplierQuota(assignment.requestId, assignment.id, qty, currentUser.uid);
      setConfirmSuccess(`Tedarikçi için ${qty} araç başarıyla onaylandı.`);
      setTimeout(() => setConfirmSuccess(null), 3000);
    } catch (err: any) {
      setConfirmError(err.message || 'Onaylama başarısız.');
    }
  };

  const handleAddFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFacName.trim()) return;
    setFacError(null);
    setFacSuccess(null);
    setFacLoading(true);
    try {
      await addFacility(newFacName, newFacCity);
      setFacSuccess(`Tesis "${newFacName.trim().toUpperCase()}" master veritabanına eklendi.`);
      setNewFacName('');
      setNewFacCity('');
      setTimeout(() => setFacSuccess(null), 3500);
    } catch (err: any) {
      setFacError(err.message || 'Tesis eklenemedi.');
    } finally {
      setFacLoading(false);
    }
  };

  const handleToggleFacility = async (facId: string, currentActive: boolean) => {
    try {
      await toggleFacilityActive(facId, !currentActive);
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 text-xs font-sans">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-[#092B60] tracking-tight">Genel Bakış & Yönetici Kontrol Paneli</h1>
            <span className="bg-[#FFD000] text-[#092B60] px-2.5 py-0.5 rounded-full font-black text-[10px] uppercase">
              CANLI YÖNETİM
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Canlı lojistik talepleri, uğraklı rotalar, master tesis veritabanı ve 4 tedarikçi kotası
          </p>
        </div>
        <button
          onClick={() => onNavigateToTab('admin-new-request')}
          className="inline-flex items-center gap-2 bg-[#092B60] hover:bg-[#0D3978] text-[#FFD000] px-4 py-2.5 rounded-xl text-xs font-black shadow-md transition-all active:scale-98 shrink-0"
        >
          <Plus className="w-4 h-4 text-[#FFD000]" />
          <span>Yeni Uğraklı Araç Talebi Aç</span>
        </button>
      </div>

      {/* 8 Primary KPI Cards in Enterprise Corporate Palette */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all border-t-4 border-t-[#092B60]">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-[#092B60]">Toplam Talep</span>
            <div className="p-2 bg-[#EAF3FF] rounded-xl text-[#092B60]">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-[#092B60] tracking-tight">{totalRequests}</div>
          <div className="text-[11px] text-slate-400 mt-1">Aktif lojistik talepleri</div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all border-t-4 border-t-[#0D3978]">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-[#0D3978]">Toplam İstenen Araç</span>
            <div className="p-2 bg-[#EAF3FF] rounded-xl text-[#0D3978]">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-[#0D3978] tracking-tight">{totalWantedVehicles}</div>
          <div className="text-[11px] text-slate-400 mt-1">Planlanan toplam sefer</div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all border-t-4 border-t-[#239B70]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700">Onaylanan Araç</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-[#239B70]">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-[#239B70] tracking-tight">{confirmedVehiclesCount}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">
            Bildirilen: <strong className="font-mono text-[#092B60]">{reportedVehiclesCount}</strong> | Onaylı: %
            <span className="font-mono">{totalWantedVehicles > 0 ? Math.round((confirmedVehiclesCount / totalWantedVehicles) * 100) : 0}</span>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all border-t-4 border-t-rose-500">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-rose-700">Eksik Araç</span>
            <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-rose-700 tracking-tight">{missingVehicles}</div>
          <div className="text-[11px] text-slate-400 mt-1">Henüz kesinleşmeyen</div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all border-t-4 border-t-[#FFD000]">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-amber-900">Yanıt Bekleyen</span>
            <div className="p-2 bg-amber-50 rounded-xl text-amber-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-amber-900 tracking-tight">{waitingResponseCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Tedarikçi teklifi bekleniyor</div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all border-t-4 border-t-sky-500">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-sky-800">Yolda Olan</span>
            <div className="p-2 bg-sky-50 rounded-xl text-sky-600">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-sky-700 tracking-tight">{onRoadCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Seyir halindeki araçlar</div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all border-t-4 border-t-emerald-600">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-emerald-800">Tesise Giriş Yapan</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
              <CheckSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-emerald-800 tracking-tight">{arrivedCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Girişi tamamlananlar</div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all border-t-4 border-t-rose-600">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold text-rose-800">Geciken Araçlar</span>
            <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-rose-700 tracking-tight">{delayedCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Planlanan saati aşan</div>
        </div>
      </div>

      {/* 4 Temel Tedarikçi Performans Tablosu & Görsel Dağılım */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-5 bg-[#092B60] text-white flex items-center justify-between border-b border-[#0D3978]">
          <div>
            <h2 className="text-sm font-black flex items-center gap-2 text-white font-sans">
              <Building2 className="w-4 h-4 text-[#FFD000]" />
              4 Bağımsız Tedarikçi Performans & Karşılama Karnesi
            </h2>
            <p className="text-xs text-blue-200 mt-0.5">
              Deniz Lojistik, Alp Özler, Tekno Lojistik ve Ekol Lojistik kota durumları & anlık karşılama oranları
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D3978] text-white uppercase text-[10px] font-black border-b border-blue-900">
              <tr>
                <th className="px-5 py-3.5">Firma Adı</th>
                <th className="px-4 py-3.5">Yetkili / İletişim</th>
                <th className="px-4 py-3.5 text-center">Atanan Kota</th>
                <th className="px-4 py-3.5 text-center">Tedarikçi Teklifi</th>
                <th className="px-4 py-3.5 text-center">Yönetici Onayı</th>
                <th className="px-4 py-3.5 text-center">Sistemdeki Araç</th>
                <th className="px-4 py-3.5 text-center">Tesise Giriş</th>
                <th className="px-4 py-3.5 text-center">Gecikme</th>
                <th className="px-5 py-3.5 text-right">Performans Skoru</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((sup) => {
                const stats = getSupplierStats(sup.id);
                const score = stats.totalConfirmed > 0 ? Math.min(100, Math.round((stats.onTimeArrivals / stats.totalConfirmed) * 100)) : 100;
                const fulfillmentPercent = stats.totalAssigned > 0 ? Math.min(100, Math.round((stats.totalConfirmed / stats.totalAssigned) * 100)) : 0;

                return (
                  <tr key={sup.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 font-bold text-[#092B60]">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full bg-[#092B60] shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-[#092B60]">{sup.companyName}</div>
                          <div className="w-24 bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className="bg-[#092B60] h-full rounded-full transition-all"
                              style={{ width: `${fulfillmentPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      <div className="font-bold text-slate-900">{sup.contactPerson}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">{sup.phone}</div>
                    </td>
                    <td className="px-4 py-4 text-center font-mono font-black text-slate-800 text-sm">{stats.totalAssigned}</td>
                    <td className="px-4 py-4 text-center font-mono font-black text-amber-800 text-sm">{stats.totalOffered}</td>
                    <td className="px-4 py-4 text-center font-mono font-black text-[#239B70] text-sm">{stats.totalConfirmed}</td>
                    <td className="px-4 py-4 text-center font-mono font-black text-[#0D3978] text-sm">{stats.actualVehicles}</td>
                    <td className="px-4 py-4 text-center font-mono font-black text-emerald-800 text-sm">{stats.onTimeArrivals}</td>
                    <td className="px-4 py-4 text-center font-mono font-black text-rose-700 text-sm">{stats.delays}</td>
                    <td className="px-5 py-4 text-right">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-mono font-black bg-[#EAF3FF] text-[#092B60] border border-blue-200 shadow-2xs">
                        %{score}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TESİS MASTER VERİTABANI YÖNETİMİ PANELİ */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-5 bg-[#092B60] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-black flex items-center gap-2 text-white font-sans">
              <MapPin className="w-4 h-4 text-[#FFD000]" />
              Tesis Master Veritabanı Yönetimi ({facilities.length} Tesis)
            </h2>
            <p className="text-xs text-blue-200 mt-0.5">Tüm çıkış, uğrak ve varış noktalarının tek merkezden yönetimi</p>
          </div>

          <form onSubmit={handleAddFacility} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Yeni Tesis Adı (Örn: SAMSUN TM)..."
              value={newFacName}
              onChange={(e) => setNewFacName(e.target.value)}
              className="px-3.5 py-2 bg-white text-slate-900 font-bold rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD000]"
              required
            />
            <input
              type="text"
              placeholder="Şehir..."
              value={newFacCity}
              onChange={(e) => setNewFacCity(e.target.value)}
              className="w-24 px-3 py-2 bg-white text-slate-900 font-medium rounded-xl text-xs placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={facLoading}
              className="bg-[#FFD000] text-[#092B60] font-black px-4 py-2 rounded-xl hover:bg-yellow-400 transition-all shrink-0 active:scale-98 shadow-sm"
            >
              {facLoading ? 'Ekle...' : '+ Tesis Ekle'}
            </button>
          </form>
        </div>

        {facSuccess && (
          <div className="p-3 m-4 bg-[#A7F36B]/20 text-emerald-950 font-bold border border-emerald-400 rounded-xl text-xs">
            {facSuccess}
          </div>
        )}
        {facError && (
          <div className="p-3 m-4 bg-rose-50 text-rose-800 font-bold border border-rose-200 rounded-xl text-xs">
            {facError}
          </div>
        )}

        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-72 overflow-y-auto">
          {facilities.map((fac) => (
            <div
              key={fac.id}
              className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                fac.active !== false
                  ? 'bg-[#EAF3FF]/80 border-blue-200/90 text-[#092B60] font-bold shadow-2xs'
                  : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 line-through'
              }`}
            >
              <div className="truncate pr-1">
                <span className="block truncate font-bold">{fac.facilityName}</span>
                <span className="text-[10px] text-slate-500 font-medium">{fac.city}</span>
              </div>
              <button
                onClick={() => handleToggleFacility(fac.id, fac.active !== false)}
                title={fac.active !== false ? 'Pasifleştir' : 'Aktifleştir'}
                className={`p-1.5 rounded-lg hover:bg-black/10 shrink-0 transition-colors ${
                  fac.active !== false ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Güncel Araç Talepleri & Dağıtım Motoru Onayları (Expandable Accordion Cards) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-5 bg-[#092B60] text-white flex items-center justify-between border-b border-[#0D3978]">
          <div>
            <h2 className="text-sm font-black flex items-center gap-2 text-white font-sans">
              <Route className="w-4 h-4 text-[#FFD000]" />
              Güncel Uğraklı Araç Talepleri & Kontenjan Kesinleştirme Engine
            </h2>
            <p className="text-xs text-blue-200 mt-0.5">Tedarikçi tekliflerini inceleyin, kesinleştirin ve kotaları yayınlayın</p>
          </div>
          <span className="bg-[#FFD000] text-[#092B60] font-mono font-black px-2.5 py-1 rounded-full text-xs shadow-2xs">
            {requests.length} Talep
          </span>
        </div>

        {confirmSuccess && (
          <div className="m-4 p-3.5 bg-[#A7F36B]/20 text-emerald-950 border border-emerald-400 rounded-xl text-xs font-bold">
            {confirmSuccess}
          </div>
        )}
        {confirmError && (
          <div className="m-4 p-3.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold">
            {confirmError}
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {requests.slice(0, 10).map((req) => {
            const reqAssignments = assignments.filter((a) => a.requestId === req.id);
            const totalOffered = reqAssignments.reduce((acc, a) => acc + (a.offeredQuantity || 0), 0);
            const totalConfirmed = reqAssignments.reduce((acc, a) => acc + (a.confirmedQuantity || 0), 0);
            const stops = req.routeStops || [];
            const isExpanded = expandedRequests[req.id] ?? true;

            return (
              <div key={req.id} className="p-5 hover:bg-slate-50/50 transition-colors space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-black text-[#092B60] bg-[#EAF3FF] px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs">
                      {req.requestNumber}
                    </span>
                    <div>
                      <h3 className="text-xs font-black text-[#092B60]">
                        {req.originFacility} → {req.destination}
                      </h3>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {req.vehicleType} • Tarih:{' '}
                        <span className="font-mono font-bold text-slate-700">{req.requiredDate} {req.requiredTime}</span> • Mod:{' '}
                        <span className="font-bold text-slate-800">
                          {req.distributionMode === 'MANUAL' ? 'Manuel Dağıtım' : 'Açık Talep (Seçili Havuz)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-bold">
                    <div className="bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                      <span className="text-slate-500">İhtiyaç: </span>
                      <span className="text-slate-900 font-mono font-black">{req.totalQuantity} Araç</span>
                    </div>
                    <div className="bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                      <span className="text-amber-800">Teklif: </span>
                      <span className="text-amber-900 font-mono font-black">{totalOffered}</span>
                    </div>
                    <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                      <span className="text-emerald-800">Kesinleşen: </span>
                      <span className="text-emerald-900 font-mono font-black">
                        {totalConfirmed}/{req.totalQuantity}
                      </span>
                    </div>

                    <button
                      onClick={() => toggleRequestExpand(req.id)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                      title={isExpanded ? 'Detayları Daralt' : 'Detayları Genişlet'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Multi-Stop route flow banner if stops exist */}
                {stops.length > 0 && (
                  <div className="p-3 bg-[#EAF3FF] rounded-xl border border-[#0D3978]/20 flex items-center flex-wrap gap-2 text-[11px] font-bold text-[#092B60]">
                    <span>Güzergâh Uğrakları:</span>
                    <span className="bg-[#092B60] text-white px-2.5 py-0.5 rounded-full text-[10px] font-mono">
                      {req.originFacility}
                    </span>
                    {stops.map((st, i) => (
                      <React.Fragment key={i}>
                        <ArrowRight className="w-3.5 h-3.5 text-[#0D3978]" />
                        <span className="bg-[#FFD000] text-[#092B60] px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black">
                          {st.sequence}. Uğrak: {st.facilityName}
                        </span>
                      </React.Fragment>
                    ))}
                    <ArrowRight className="w-3.5 h-3.5 text-[#0D3978]" />
                    <span className="bg-[#0D3978] text-[#FFD000] px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black">
                      {req.destination}
                    </span>
                  </div>
                )}

                {/* Sub-table: Supplier proposals & Admin Confirmations */}
                {isExpanded && (
                  <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/90 text-xs animate-in fade-in">
                    <div className="text-[11px] font-bold text-[#092B60] mb-2.5">
                      Firma Bazlı Teklifler ve Kesinleştirme İşlemleri:
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                      {reqAssignments.map((asg) => {
                        const sup = suppliers.find((s) => s.id === asg.supplierId);
                        const currentVal = confirmingQty[asg.id] !== undefined ? confirmingQty[asg.id] : asg.confirmedQuantity || asg.offeredQuantity || 0;

                        return (
                          <div
                            key={asg.id}
                            className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between hover:border-blue-300 transition-colors"
                          >
                            <div>
                              <div className="font-bold text-slate-900 truncate">{sup?.companyName || asg.supplierId}</div>
                              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5 font-mono">
                                <span>Teklif: <strong className="text-amber-800">{asg.offeredQuantity || 0}</strong></span>
                                <span>Onaylı: <strong className="text-emerald-800">{asg.confirmedQuantity || 0}</strong></span>
                              </div>
                              {asg.responseNote && (
                                <div className="text-[10px] text-slate-500 italic mt-1 truncate">
                                  "{asg.responseNote}"
                                </div>
                              )}
                            </div>

                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max={req.totalQuantity}
                                value={currentVal}
                                onChange={(e) =>
                                  setConfirmingQty({
                                    ...confirmingQty,
                                    [asg.id]: parseInt(e.target.value) || 0,
                                  })
                                }
                                className="w-14 px-2 py-1 text-xs border border-slate-300 rounded-lg text-center font-mono font-black text-[#092B60]"
                              />
                              <button
                                onClick={() => handleConfirmOffers(asg, currentVal)}
                                className="flex-1 bg-[#092B60] hover:bg-[#0D3978] text-[#FFD000] text-[11px] font-bold py-1.5 px-2.5 rounded-lg transition-colors shadow-2xs active:scale-98"
                              >
                                Kesinleştir
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {requests.length === 0 && (
            <div className="p-12 text-center text-slate-400 text-xs font-medium">
              Henüz sistemde araç talebi bulunmuyor. "Yeni Uğraklı Araç Talebi Aç" butonuyla ilk talebi oluşturabilirsiniz.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

