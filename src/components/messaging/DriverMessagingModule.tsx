import React, { useState } from 'react';
import { Message, Vehicle, MessageChannel } from '../../types';
import { sendDriverMessage } from '../../services/logisticsService';
import { useAuth } from '../../context/AuthContext';
import {
  MessageSquare,
  Send,
  Phone,
  CheckCheck,
  AlertCircle,
  Truck,
  X,
  Users,
} from 'lucide-react';

interface MessagingModuleProps {
  messages: Message[];
  vehicles: Vehicle[];
  activeVehicleForModal?: Vehicle | null;
  onCloseModal?: () => void;
}

export const PRESET_MESSAGES = [
  'Aracınızın tahmini varış saati nedir?',
  'Lütfen belirtilen saatte tesiste hazır bulununuz.',
  'Aracınızda herhangi bir arıza veya gecikme var mı?',
  'Tesise giriş yaptığınızda bilgi verir misiniz?',
  'Lütfen mevcut konumunuzu paylaşır mısınız?',
];

export const DriverMessagingModule: React.FC<MessagingModuleProps> = ({
  messages,
  vehicles,
  activeVehicleForModal,
  onCloseModal,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(activeVehicleForModal || vehicles[0] || null);
  const [channel, setChannel] = useState<MessageChannel>('WHATSAPP');
  const [customText, setCustomText] = useState('');
  const [sending, setSending] = useState(false);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  // Bulk Messaging state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [bulkConfirmModal, setBulkConfirmModal] = useState(false);

  const currentVehicleMessages = messages.filter(
    (m) =>
      (selectedVehicle && m.vehicleId === selectedVehicle.id) ||
      (selectedVehicle && m.driverPhone === selectedVehicle.driverPhone)
  );

  const handleSendSingle = async (textToSend?: string) => {
    if (!currentUser || !selectedVehicle) return;
    const body = textToSend || customText;
    if (!body.trim()) return;

    setSending(true);
    setSuccessInfo(null);
    try {
      await sendDriverMessage({
        vehicleId: selectedVehicle.id,
        driverPhone: selectedVehicle.driverPhone,
        driverName: selectedVehicle.driverName,
        plate: selectedVehicle.plate,
        channel,
        content: body,
        userUid: currentUser.uid,
        userRole: userProfile?.role || 'OPERATOR',
      });

      setCustomText('');
      setSuccessInfo(`${channel} mesajı başarıyla şoföre iletildi.`);
      setTimeout(() => setSuccessInfo(null), 3500);
    } catch (err: any) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleBulkSend = async () => {
    if (!currentUser || selectedVehicleIds.length === 0 || !customText.trim()) return;
    setSending(true);
    try {
      for (const vId of selectedVehicleIds) {
        const v = vehicles.find((x) => x.id === vId);
        if (v) {
          await sendDriverMessage({
            vehicleId: v.id,
            driverPhone: v.driverPhone,
            driverName: v.driverName,
            plate: v.plate,
            channel,
            content: customText,
            userUid: currentUser.uid,
            userRole: userProfile?.role || 'OPERATOR',
          });
        }
      }
      setCustomText('');
      setBulkConfirmModal(false);
      setSelectedVehicleIds([]);
      setSuccessInfo(`Toplu ${channel} mesajı seçili ${selectedVehicleIds.length} şoföre iletildi.`);
      setTimeout(() => setSuccessInfo(null), 4000);
    } catch (err: any) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col md:flex-row min-h-[620px] text-xs font-sans">
      {/* Left Column: Vehicle & Driver Selection List */}
      <div className="w-full md:w-80 border-r border-slate-200/80 flex flex-col bg-slate-50/50">
        <div className="p-4 bg-[#092B60] text-white flex items-center justify-between border-b border-[#0D3978]">
          <div>
            <h3 className="font-black text-[#FFD000] flex items-center gap-2 font-sans">
              <Truck className="w-4 h-4 text-[#FFD000]" />
              Şoför & Araç Listesi
            </h3>
            <span className="text-[11px] text-blue-200">{vehicles.length} Aktif Araç</span>
          </div>

          <button
            onClick={() => setBulkMode(!bulkMode)}
            className={`px-3 py-1 rounded-xl text-[11px] font-black border transition-all active:scale-98 ${
              bulkMode ? 'bg-[#FFD000] text-[#092B60] border-[#FFD000] shadow-2xs' : 'bg-[#0D3978] text-white border-blue-400'
            }`}
          >
            {bulkMode ? 'Tekil Mod' : 'Toplu Gönderim'}
          </button>
        </div>

        {bulkMode && (
          <div className="p-3 bg-[#EAF3FF] border-b border-blue-200 text-[#092B60] text-[11px] font-bold flex items-center justify-between">
            <span>{selectedVehicleIds.length} şoför seçildi</span>
            <button
              onClick={() => {
                if (selectedVehicleIds.length === vehicles.length) {
                  setSelectedVehicleIds([]);
                } else {
                  setSelectedVehicleIds(vehicles.map((v) => v.id));
                }
              }}
              className="text-[#092B60] font-black hover:underline"
            >
              {selectedVehicleIds.length === vehicles.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {vehicles.map((v) => {
            const isSelected = selectedVehicle?.id === v.id;
            const isChecked = selectedVehicleIds.includes(v.id);

            return (
              <div
                key={v.id}
                onClick={() => {
                  if (bulkMode) {
                    if (isChecked) {
                      setSelectedVehicleIds(selectedVehicleIds.filter((id) => id !== v.id));
                    } else {
                      setSelectedVehicleIds([...selectedVehicleIds, v.id]);
                    }
                  } else {
                    setSelectedVehicle(v);
                  }
                }}
                className={`p-3.5 cursor-pointer transition-all flex items-center justify-between ${
                  !bulkMode && isSelected
                    ? 'bg-[#EAF3FF] border-l-4 border-l-[#092B60]'
                    : 'hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {bulkMode && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="rounded text-[#092B60] focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                  )}
                  <div>
                    <div className="font-mono font-black text-[#092B60] text-xs">{v.plate}</div>
                    <div className="text-slate-900 font-bold">{v.driverName}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{v.driverPhone}</div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block truncate max-w-[90px]">{v.originFacility}</span>
                  <span className="inline-block mt-1 text-[10px] font-bold text-[#092B60] bg-[#EAF3FF] px-2 py-0.5 rounded-full border border-blue-200">
                    {v.status}
                  </span>
                </div>
              </div>
            );
          })}

          {vehicles.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-xs font-medium">
              Sistemde şoför veya araç kaydı bulunmuyor.
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Chat Feed & Composer */}
      <div className="flex-1 flex flex-col justify-between bg-white">
        {/* Chat Header */}
        <div className="p-4 border-b border-slate-200/80 flex items-center justify-between bg-[#092B60] text-white">
          {bulkMode ? (
            <div>
              <h2 className="font-black text-[#FFD000] text-sm font-sans">Toplu Şoför İletişim Paneli</h2>
              <p className="text-[11px] text-blue-200 mt-0.5">
                Seçili {selectedVehicleIds.length} araç şoförüne tek tıkla mesaj iletin
              </p>
            </div>
          ) : selectedVehicle ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFD000] text-[#092B60] flex items-center justify-center font-black text-sm shadow-2xs">
                {selectedVehicle.driverName.charAt(0)}
              </div>
              <div>
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <span>{selectedVehicle.driverName}</span>
                  <span className="font-mono text-xs px-2 py-0.5 bg-[#0D3978] rounded-md text-[#FFD000] font-black">
                    {selectedVehicle.plate}
                  </span>
                </div>
                <div className="text-[11px] text-blue-200 flex items-center gap-2 mt-0.5">
                  <span className="font-mono">{selectedVehicle.driverPhone}</span>
                  <span>•</span>
                  <span>{selectedVehicle.originFacility} → {selectedVehicle.destination}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-blue-200">Lütfen mesaj göndermek için bir şoför seçin.</div>
          )}

          {/* Channel selector */}
          <div className="flex items-center gap-1 bg-[#0D3978] p-1 rounded-xl border border-blue-800">
            <button
              onClick={() => setChannel('WHATSAPP')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                channel === 'WHATSAPP' ? 'bg-[#FFD000] text-[#092B60] shadow-2xs' : 'text-blue-200 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              WhatsApp
            </button>
            <button
              onClick={() => setChannel('SMS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                channel === 'SMS' ? 'bg-[#EAF3FF] text-[#092B60] shadow-2xs' : 'text-blue-200 hover:text-white'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              SMS
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {successInfo && (
          <div className="m-4 p-3 bg-[#A7F36B]/20 text-emerald-950 border border-emerald-400 rounded-xl text-xs font-bold flex items-center gap-2">
            <CheckCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{successInfo}</span>
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 p-5 overflow-y-auto space-y-3 bg-slate-50/40 max-h-[380px]">
          {bulkMode ? (
            <div className="p-12 text-center text-slate-500">
              <div className="max-w-md mx-auto">
                <Send className="w-10 h-10 text-[#092B60] mx-auto mb-3 opacity-80" />
                <h4 className="font-black text-[#092B60] text-sm">Toplu Mesaj Gönderim Paneli</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Sol taraftan şoförleri işaretleyin, aşağıdan hazır mesaj seçin veya özel duyurunuzu yazın.
                </p>
              </div>
            </div>
          ) : currentVehicleMessages.length > 0 ? (
            currentVehicleMessages.map((msg) => {
              const isOut = msg.direction === 'OUTBOUND';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[75%] p-3.5 rounded-2xl shadow-2xs ${
                      isOut
                        ? 'bg-[#092B60] text-white rounded-br-xs'
                        : 'bg-white border border-slate-200 text-slate-900 rounded-bl-xs'
                    }`}
                  >
                    <div className="text-xs font-medium leading-relaxed">{msg.content}</div>
                    <div className="flex items-center justify-end gap-1.5 mt-1.5 text-[10px] opacity-75 font-mono">
                      <span>{msg.channel}</span>
                      <span>•</span>
                      <span>{msg.deliveryStatus}</span>
                      {isOut && <CheckCheck className="w-3 h-3 text-[#FFD000]" />}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs font-medium">
              Bu şoförle henüz mesajlaşma kaydı bulunmuyor. Aşağıdaki hazır mesajlardan birini seçebilirsiniz.
            </div>
          )}
        </div>

        {/* Preset Quick Messages */}
        <div className="p-3.5 bg-[#EAF3FF] border-t border-blue-200/80">
          <div className="text-[10px] font-black text-[#092B60] uppercase tracking-wider mb-2">
            Hazır Mesaj Şablonları (Tek Tıkla Seç):
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_MESSAGES.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCustomText(preset)}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-[#092B60] font-bold border border-blue-200 text-[11px] transition-all text-left shadow-2xs hover:scale-101"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Text Input Composer */}
        <div className="p-4 border-t border-slate-200/80 bg-white">
          <div className="flex items-end gap-2.5">
            <textarea
              rows={2}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={`${channel} üzerinden şoföre iletilecek mesajı yazın...`}
              className="flex-1 p-3 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#092B60]"
            />

            {bulkMode ? (
              <button
                type="button"
                onClick={() => setBulkConfirmModal(true)}
                disabled={selectedVehicleIds.length === 0 || !customText.trim() || sending}
                className="px-5 py-3 bg-[#092B60] hover:bg-[#0D3978] text-[#FFD000] font-black rounded-xl transition-all flex items-center gap-2 disabled:opacity-40 shadow-md active:scale-98 shrink-0"
              >
                <Send className="w-4 h-4 text-[#FFD000]" />
                <span>Onaya Gönder ({selectedVehicleIds.length})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSendSingle()}
                disabled={!selectedVehicle || !customText.trim() || sending}
                className="px-5 py-3 bg-[#092B60] hover:bg-[#0D3978] text-[#FFD000] font-black rounded-xl transition-all flex items-center gap-2 disabled:opacity-40 shadow-md active:scale-98 shrink-0"
              >
                <Send className="w-4 h-4 text-[#FFD000]" />
                <span>{sending ? 'İletiliyor...' : 'Gönder'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BULK MESSAGE CONFIRMATION MODAL */}
      {bulkConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 text-xs border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-sm text-[#092B60] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#092B60]" />
                Toplu Mesaj Gönderim Öncesi Onay
              </h3>
              <button
                onClick={() => setBulkConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div className="p-3 bg-[#EAF3FF] border border-blue-200 rounded-xl text-[#092B60]">
                <span className="font-black block mb-1">Kanal: {channel}</span>
                <p className="italic font-medium">"{customText}"</p>
              </div>

              <div>
                <span className="font-black text-[#092B60] block mb-1">
                  Mesajın İletileceği Şoförler ({selectedVehicleIds.length} Alıcı):
                </span>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {selectedVehicleIds.map((vId) => {
                    const v = vehicles.find((x) => x.id === vId);
                    return (
                      <div key={vId} className="p-2.5 flex items-center justify-between">
                        <div>
                          <strong className="text-[#092B60] font-mono font-black">{v?.plate}</strong> - {v?.driverName}
                        </div>
                        <span className="text-slate-600 font-mono text-[11px] font-bold">{v?.driverPhone}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setBulkConfirmModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold"
              >
                Vazgeç
              </button>
              <button
                onClick={handleBulkSend}
                disabled={sending}
                className="px-5 py-2 bg-[#092B60] hover:bg-[#0D3978] text-[#FFD000] font-black rounded-xl shadow-md transition-all active:scale-98"
              >
                {sending ? 'Toplu Gönderiliyor...' : 'Evet, Gönderimi Onayla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

