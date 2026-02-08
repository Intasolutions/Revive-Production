import React, { useState, useEffect } from 'react';
import {
    Activity, Search, Clock, Save, X, CheckCircle,
    Thermometer, Heart, Wind, Stethoscope, AlertTriangle, FileText,
    User, ArrowRight, ChevronRight, ChevronDown, Filter, Plus, Pencil, Trash2, Pill
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { socket } from '../socket';

// --- Premium Triage Modal ---
const TriageModal = ({ visit, onClose, onSave, doctors = [], pharmacyStock = [], serviceDefinitions = [], readOnly = false, initialTab = 'TRIAGE', draft, onDraftUpdate }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [formData, setFormData] = useState({
        vitals: { bp: '', temp: '', pulse: '', spo2: '', weight: '' },
        treatment_notes: '',
        transfer_path: '',
        doctor: '',
        medicines: [],
        services: [],
        observation: { planned_duration_minutes: 60, observation_notes: '', is_active: false }
    });

    const [stockSearch, setStockSearch] = useState("");
    const [serviceSearch, setServiceSearch] = useState("");
    const [error, setError] = useState(null);

    useEffect(() => {
        if (visit) {
            if (draft) {
                setFormData(draft);
            } else {
                setFormData(prev => ({
                    ...prev,
                    vitals: { ...visit.vitals, weight: visit.vitals?.weight || '' } || { bp: '', temp: '', pulse: '', spo2: '', weight: '' },
                    treatment_notes: visit.treatment_notes || '',
                    doctor: visit.doctor || ''
                }));
                fetchVisitCasualtyData(visit.id || visit.v_id);
            }
        }
    }, [visit]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync draft changes
    useEffect(() => {
        if (!readOnly && onDraftUpdate) {
            const timer = setTimeout(() => onDraftUpdate(formData), 500); // Debounce
            return () => clearTimeout(timer);
        }
    }, [formData, readOnly]);

    const fetchVisitCasualtyData = async (visitId) => {
        try {
            const [meds, svcs, obs] = await Promise.all([
                api.get(`/casualty/medicines/?visit=${visitId}`),
                api.get(`/casualty/services/?visit=${visitId}`),
                api.get(`/casualty/observations/?visit=${visitId}`)
            ]);
            const allObs = obs.data.results || obs.data || [];
            const activeOb = allObs.find(o => o.is_active) || allObs[0] || { planned_duration_minutes: 60, observation_notes: '', is_active: false };

            setFormData(prev => ({
                ...prev,
                medicines: meds.data.results || meds.data,
                services: svcs.data.results || svcs.data,
                observation: activeOb
            }));
        } catch (e) { console.error("Error fetching casualty data:", e); }
    };

    const addMedicine = (stock) => {
        if (readOnly) return;
        const tps = stock.tablets_per_strip || 1;
        const rawUnitPrice = (parseFloat(stock.mrp) || 0) / tps;
        const unitPrice = parseFloat(rawUnitPrice.toFixed(2));

        setFormData({
            ...formData,
            medicines: [...formData.medicines, {
                med_stock: stock.id,
                name: stock.name,
                batch: stock.batch_no,
                qty: 1,
                unit_price: unitPrice,
                total_price: unitPrice,
                dosage: ''
            }]
        });
        setStockSearch("");
    };

    const addService = (defId) => {
        if (readOnly) return;
        const def = serviceDefinitions.find(d => d.id === defId);
        if (!def) return;
        setFormData({
            ...formData,
            services: [...formData.services, {
                service_definition: def.id,
                name: def.name,
                qty: 1,
                unit_charge: def.base_charge,
                total_charge: def.base_charge
            }]
        });
    };

    const handleSubmit = async () => {
        if (readOnly) return;
        // Validation removed as per request
        // const { bp, temp, pulse, spo2 } = formData.vitals;
        // if (!bp || !temp || !pulse || !spo2) {
        //     setError('MISSING VITALS: BP, Temp, Pulse, and SpO2 are required.');
        //     return;
        // }

        if (formData.transfer_path === 'REFER_DOCTOR' && !formData.doctor) {
            setError('Please select a doctor to proceed with consultation.');
            return;
        }

        setError(null);
        const success = await onSave(visit.id || visit.v_id, formData);
        if (success) onClose();
    };

    const filteredStock = stockSearch.length >= 2
        ? pharmacyStock
            .filter(s => s.name.toLowerCase().includes(stockSearch.toLowerCase()))
            .sort((a, b) => {
                // Prioritize CASUALTY category
                if (a.category === 'CASUALTY' && b.category !== 'CASUALTY') return -1;
                if (a.category !== 'CASUALTY' && b.category === 'CASUALTY') return 1;
                return 0;
            })
            .slice(0, 10)
        : [];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-white w-full max-w-3xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="px-8 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight font-outfit uppercase">{readOnly ? 'Patient Record' : 'Emergency Care'}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{visit.patient_name}</span>
                            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                {visit.patient_age ? `${visit.patient_age} Y` : ''}
                                {visit.patient_gender ? ` / ${visit.patient_gender}` : ''}
                            </span>
                            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">ID: {visit.patient_registration_number || (visit.v_id || visit.id)?.slice(0, 8)}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-red-50 hover:text-red-500 transition-colors shadow-sm border border-slate-100"><X size={20} /></button>
                </div>

                {/* Tab Navigation */}
                <div className="flex px-8 bg-slate-50/50 border-b border-slate-100 shrink-0">
                    {['TRIAGE', 'MEDICINES', 'SERVICES', 'OBSERVATION'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-4 text-[10px] font-black tracking-widest uppercase transition-all relative ${activeTab === tab ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            {tab}
                            {activeTab === tab && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />}
                        </button>
                    ))}
                </div>

                <div className="p-8 overflow-y-auto flex-1 custom-scrollbar bg-white">
                    {activeTab === 'TRIAGE' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                            {/* Vitals Section */}
                            <div>
                                <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                                    <Activity size={14} className="text-blue-500" /> Vitals Check
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    {[
                                        { label: 'BP', icon: Heart, key: 'bp', ph: '120/80', color: 'blue' },
                                        { label: 'Temp', icon: Thermometer, key: 'temp', ph: '98.6', color: 'amber' },
                                        { label: 'Pulse', icon: Activity, key: 'pulse', ph: '72', color: 'rose' },
                                        { label: 'SpO2', icon: Wind, key: 'spo2', ph: '98%', color: 'cyan' },
                                        { label: 'Weight', icon: User, key: 'weight', ph: 'Kg', color: 'slate' },
                                    ].map((v) => (
                                        <div key={v.key} className={`p-3 bg-${v.color}-50 rounded-2xl border border-${v.color}-100 transition-all ${readOnly ? 'opacity-80' : ''}`}>
                                            <label className={`text-[10px] font-black text-${v.color}-600 uppercase block mb-1 flex items-center gap-1`}><v.icon size={10} /> {v.label}</label>
                                            <input disabled={readOnly} className="w-full bg-transparent font-black text-slate-900 outline-none text-xs disabled:cursor-not-allowed" placeholder={v.ph} value={formData.vitals[v.key]} onChange={e => setFormData({ ...formData, vitals: { ...formData.vitals, [v.key]: e.target.value } })} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Clinical Notes */}
                            <div>
                                <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4"><FileText size={14} className="text-slate-500" /> Treatment Record</h4>
                                <textarea disabled={readOnly} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-500 outline-none resize-none h-24 transition-all disabled:bg-slate-50 disabled:text-slate-500" placeholder={readOnly ? "No notes recorded." : "Enter treatment given..."} value={formData.treatment_notes} onChange={e => setFormData({ ...formData, treatment_notes: e.target.value })} />
                            </div>

                            {/* Action Plan */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    { val: 'REFER_DOCTOR', label: 'Consult Doctor', desc: 'Proceed to OP.', icon: Stethoscope },
                                    { val: 'REFER_LAB', label: 'Lab Investigation', desc: 'Tests required.', icon: Activity },
                                    { val: 'REFER_BILLING', label: 'Discharge & Bill', desc: 'Send to Billing.', icon: FileText }
                                ].map(opt => (
                                    <div key={opt.val}
                                        onClick={() => {
                                            if (!readOnly) {
                                                setFormData({ ...formData, transfer_path: formData.transfer_path === opt.val ? '' : opt.val });
                                            }
                                        }}
                                        className={`p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ${formData.transfer_path === opt.val ? 'bg-blue-50 border-blue-500' : 'bg-white border-slate-100'} ${readOnly ? 'opacity-70 pointer-events-none' : 'cursor-pointer hover:bg-slate-50'}`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${formData.transfer_path === opt.val ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}><opt.icon size={20} /></div>
                                        <div>
                                            <div className="font-black text-sm text-slate-700">{opt.label}</div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{opt.desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {formData.transfer_path === 'REFER_DOCTOR' && (
                                <select disabled={readOnly} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-xs disabled:opacity-70" value={formData.doctor} onChange={e => setFormData({ ...formData, doctor: e.target.value })}>
                                    <option value="">-- Select Specialist --</option>
                                    {doctors.map(doc => <option key={doc.id} value={doc.id}>Dr. {doc.username} ({doc.specialization || 'General'})</option>)}
                                </select>
                            )}
                        </div>
                    )}

                    {activeTab === 'MEDICINES' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                            {!readOnly && (
                                <div className="relative z-50">
                                    {/* ... Search Logic ... */}
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" placeholder={`Search ${pharmacyStock.length} medicines in stock...`} value={stockSearch} onChange={e => setStockSearch(e.target.value)} />
                                    {filteredStock.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-50 max-h-60 overflow-y-auto">
                                            {filteredStock.map(s => (
                                                <div key={s.id} onClick={() => addMedicine(s)} className="p-4 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition-colors">
                                                    <div>
                                                        <div className="font-bold text-slate-900 text-sm">{s.name}</div>
                                                        <div className="text-[10px] font-black text-slate-400 uppercase">
                                                            Batch: {s.batch_no} | Stock: {s.qty_available}
                                                            {s.category === 'CASUALTY' && <span className="ml-2 text-amber-600 bg-amber-50 px-1 rounded">CASUALTY</span>}
                                                        </div>
                                                    </div>
                                                    <Plus size={16} className="text-blue-600" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-3">
                                {formData.medicines.length === 0 && <div className="text-center py-8 text-slate-400 font-bold text-xs">No medicines prescribed.</div>}
                                {formData.medicines.map((med, idx) => (
                                    <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="font-bold text-slate-900 text-sm">{med.name}</div>
                                            <div className="text-[10px] font-black text-slate-400 uppercase">Batch: {med.batch}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="w-20">
                                                <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Qty</label>
                                                <input disabled={readOnly} type="number" className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold text-xs disabled:bg-slate-100" value={med.qty} onChange={e => {
                                                    const newMeds = [...formData.medicines];
                                                    newMeds[idx].qty = e.target.value;
                                                    setFormData({ ...formData, medicines: newMeds });
                                                }} />
                                            </div>
                                            {!readOnly && <button onClick={() => setFormData({ ...formData, medicines: formData.medicines.filter((_, i) => i !== idx) })} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><X size={16} /></button>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'SERVICES' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                            {/* Hide Add Service in ReadOnly */}
                            {!readOnly && (
                                <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100">
                                    <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                                        <Plus size={14} className="text-blue-500" /> Add to Patient
                                    </h4>
                                    <div className="flex gap-3 relative">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input
                                                className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:border-blue-500 transition-all shadow-sm"
                                                placeholder="Search & Select Service..."
                                                value={serviceSearch}
                                                onChange={(e) => setServiceSearch(e.target.value)}
                                            />

                                            {/* Search Results Dropdown */}
                                            {serviceSearch.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-50 max-h-60 overflow-y-auto">
                                                    {serviceDefinitions.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase())).length === 0 ? (
                                                        <div className="p-4 text-xs font-bold text-slate-400 text-center">No matching services found</div>
                                                    ) : (
                                                        serviceDefinitions
                                                            .filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()))
                                                            .map(def => (
                                                                <div
                                                                    key={def.id}
                                                                    onClick={() => {
                                                                        addService(def.id);
                                                                        setServiceSearch("");
                                                                    }}
                                                                    className="p-4 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition-colors group"
                                                                >
                                                                    <div className="font-bold text-slate-900 text-sm group-hover:text-blue-600">{def.name}</div>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="text-[10px] font-black text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded">₹{def.base_charge}</div>
                                                                        <Plus size={14} className="text-slate-300 group-hover:text-blue-500" />
                                                                    </div>
                                                                </div>
                                                            ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Selected Services List */}
                            <div>
                                <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                                    <FileText size={14} className="text-slate-500" /> Selected Services
                                </h4>
                                {formData.services.length === 0 ? (
                                    <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-[24px] text-slate-400 text-xs font-bold uppercase tracking-wider">
                                        No services added yet
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {formData.services.map((svc, idx) => (
                                            <div key={idx} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-all">
                                                <div className="font-bold text-slate-900 text-sm pl-2 border-l-4 border-blue-500">{svc.name}</div>
                                                <div className="flex items-center gap-4">
                                                    <span className="font-black text-slate-700 text-xs bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">₹{svc.unit_charge}</span>
                                                    {!readOnly && <button onClick={() => setFormData({ ...formData, services: formData.services.filter((_, i) => i !== idx) })} className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"><X size={16} /></button>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'OBSERVATION' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                            <label className={`p-6 rounded-[2rem] border-2 flex items-center gap-6 transition-all ${formData.observation.is_active ? 'bg-amber-50 border-amber-500 shadow-lg' : 'bg-slate-50 border-slate-100'} ${readOnly ? 'pointer-events-none opacity-80' : 'cursor-pointer hover:border-slate-200'}`}>
                                <input disabled={readOnly} type="checkbox" className="hidden" checked={formData.observation.is_active} onChange={e => setFormData({ ...formData, observation: { ...formData.observation, is_active: e.target.checked } })} />
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${formData.observation.is_active ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-200 text-slate-400'}`}><Clock size={28} /></div>
                                <div>
                                    <div className="font-black text-lg text-slate-900">Keep Under Observation</div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Start monitoring timer for this patient</div>
                                </div>
                                {formData.observation.is_active && <CheckCircle size={24} className="text-amber-500 ml-auto" />}
                            </label>

                            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className={`p-8 border-2 rounded-[2rem] space-y-6 transition-colors ${formData.observation.is_active ? 'bg-white border-slate-100' : 'bg-slate-50 border-slate-100 opacity-70 hover:opacity-100'}`}>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Duration (Minutes)</label>
                                            {formData.observation.start_time && (
                                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Started: {new Date(formData.observation.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            )}
                                        </div>
                                        <input disabled={readOnly || !formData.observation.is_active} type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-900 text-xl outline-none focus:border-amber-500 transition-all disabled:text-slate-500 disabled:bg-slate-100/50" value={formData.observation.planned_duration_minutes} onChange={e => setFormData({ ...formData, observation: { ...formData.observation, planned_duration_minutes: e.target.value } })} />
                                    </div>
                                    <div className="p-4 bg-amber-50 rounded-2xl text-amber-600 font-black text-sm">≈ {(formData.observation.planned_duration_minutes / 60).toFixed(1)} Hours</div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Observation Notes</label>
                                    <textarea disabled={readOnly} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-xs disabled:bg-slate-50" rows="3" placeholder="Condition monitoring notes..." value={formData.observation.observation_notes} onChange={e => setFormData({ ...formData, observation: { ...formData.observation, observation_notes: e.target.value } })} />
                                </div>
                            </motion.div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50/80 shrink-0">
                    {error && (
                        <div className="mb-4 p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-600 text-xs font-bold uppercase tracking-wide">
                            <AlertTriangle size={18} /> {error}
                        </div>
                    )}
                    <div className="flex justify-end gap-3">
                        <button onClick={onClose} className="px-6 py-3 rounded-xl text-slate-500 font-bold hover:text-slate-700 text-[10px] uppercase tracking-widest">Close</button>
                        {!readOnly && (
                            <button onClick={handleSubmit} className="px-8 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-blue-600 shadow-xl shadow-slate-900/10 transition-all text-[10px] uppercase tracking-widest flex items-center gap-2">
                                Update Treatment <ArrowRight size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </motion.div >
        </div >
    );
};

// --- Manage Services Modal ---
const ManageServicesModal = ({ onClose, serviceDefinitions = [], onCreate, onUpdate, onDelete }) => {
    const [search, setSearch] = useState("");
    const [newService, setNewService] = useState({ name: '', charge: '' });
    const [editingId, setEditingId] = useState(null);

    const filteredServices = serviceDefinitions.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase())
    );

    const handleSubmit = async () => {
        if (!newService.name || !newService.charge) return;

        if (editingId) {
            await onUpdate(editingId, newService.name, newService.charge);
        } else {
            await onCreate(newService.name, newService.charge);
        }

        // Reset
        setNewService({ name: '', charge: '' });
        setEditingId(null);
    };

    const startEdit = (def) => {
        setNewService({ name: def.name, charge: def.base_charge });
        setEditingId(def.id);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight font-outfit uppercase">Manage Services</h3>
                        <p className="text-slate-500 font-bold text-xs mt-1">Add or edit master service prices</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-rose-50 hover:text-rose-500 transition-colors shadow-sm border border-slate-100"><X size={20} /></button>
                </div>

                <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
                    {/* --- Special Section: Observation Charge --- */}
                    <div className="p-6 rounded-[24px] border bg-indigo-50 border-indigo-200">
                        <div className="flex items-center gap-2 mb-4">
                            <Clock size={16} className="text-indigo-600" />
                            <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest">Observation Fee Configuration</h4>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                                <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                                    Set the hourly rate for patient observation. This will be automatically calculated in the billing section based on duration.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {newService.name === 'Observation Charge' ? (
                                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                                        <div className="relative">
                                            <input
                                                type="number"
                                                autoFocus
                                                className="w-32 p-2 pl-8 bg-white border-2 border-indigo-400 rounded-xl font-black text-lg text-indigo-900 outline-none focus:ring-4 ring-indigo-500/20 transition-all"
                                                value={newService.charge}
                                                onChange={e => setNewService({ ...newService, charge: e.target.value })}
                                                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                                            />
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 font-bold">₹</span>
                                        </div>
                                        <button
                                            onClick={handleSubmit}
                                            className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-200 transition-all"
                                        >
                                            <CheckCircle size={20} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setNewService({ name: '', charge: '' });
                                                setEditingId(null);
                                            }}
                                            className="p-3 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 border border-indigo-100 rounded-xl transition-all"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <div className="bg-white px-4 py-2 rounded-xl border border-indigo-200 text-indigo-900 font-black text-lg">
                                            ₹{serviceDefinitions.find(s => s.name === 'Observation Charge')?.base_charge || '500'}
                                            <span className="text-[10px] text-indigo-400 font-bold ml-1">/hr</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const obs = serviceDefinitions.find(s => s.name === 'Observation Charge');
                                                if (obs) {
                                                    setNewService({ name: 'Observation Charge', charge: obs.base_charge });
                                                    setEditingId(obs.id);
                                                } else {
                                                    setNewService({ name: 'Observation Charge', charge: '500' });
                                                    setEditingId(null);
                                                }
                                            }}
                                            className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-200 transition-all font-bold text-xs"
                                        >
                                            {serviceDefinitions.find(s => s.name === 'Observation Charge') ? 'Edit Rate' : 'Set Rate'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Create/Edit Form (Generic) */}
                    <div className={`p-6 rounded-[24px] border transition-colors ${editingId && newService.name !== 'Observation Charge' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'} ${newService.name === 'Observation Charge' ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                        <h4 className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest mb-4 ${editingId ? 'text-amber-500' : 'text-slate-400'}`}>
                            {editingId ? <Pencil size={14} /> : <Plus size={14} className="text-emerald-500" />}
                            {editingId ? 'Edit Service Details' : 'Create New Service'}
                        </h4>
                        <div className="flex gap-3 items-end">
                            <div className="flex-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Service Name</label>
                                <input
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 transition-all"
                                    placeholder="e.g. Oxygen Charge"
                                    value={newService.name === 'Observation Charge' ? '' : newService.name}
                                    onChange={e => setNewService({ ...newService, name: e.target.value })}
                                />
                            </div>
                            <div className="w-32">
                                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Charge (₹)</label>
                                <input
                                    type="number"
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 transition-all"
                                    placeholder="0.00"
                                    value={newService.name === 'Observation Charge' ? '' : newService.charge}
                                    onChange={e => setNewService({ ...newService, charge: e.target.value })}
                                />
                            </div>
                            <button
                                onClick={handleSubmit}
                                className={`px-6 py-3 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all text-sm h-[46px] ${editingId ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'}`}
                            >
                                {editingId ? 'Update' : 'Add'}
                            </button>
                            {editingId && newService.name !== 'Observation Charge' && (
                                <button
                                    onClick={() => {
                                        setEditingId(null);
                                        setNewService({ name: '', charge: '' });
                                    }}
                                    className="px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl font-bold active:scale-95 transition-all text-sm h-[46px]"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>

                    {/* List */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <FileText size={14} className="text-slate-500" /> Master List ({filteredServices.length})
                            </h4>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input
                                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold w-48 outline-none focus:border-blue-500 transition-all"
                                    placeholder="Search services..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            {filteredServices.map(def => (
                                <div key={def.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex justify-between items-center group hover:border-blue-200 transition-all">
                                    <div>
                                        <div className="font-bold text-slate-900 text-sm">{def.name}</div>
                                        <div className="text-xs font-black text-slate-600 bg-slate-100 px-3 py-1 rounded-lg inline-block mt-1">₹{def.base_charge}</div>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => startEdit(def)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            onClick={() => onDelete(def.id)}
                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {filteredServices.length === 0 && (
                                <div className="text-center py-8 text-slate-400 text-xs font-bold">No services found.</div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

const CasualtyPage = () => {
    const { showToast } = useToast();
    const [queue, setQueue] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [pharmacyStock, setPharmacyStock] = useState([]);
    const [serviceDefinitions, setServiceDefinitions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedVisit, setSelectedVisit] = useState(null);
    const [initialModalTab, setInitialModalTab] = useState('TRIAGE');
    const [showManageServices, setShowManageServices] = useState(false);

    // Draft Persistence
    const [drafts, setDrafts] = useState({});

    // History View State
    const [viewMode, setViewMode] = useState('QUEUE'); // 'QUEUE' or 'HISTORY'
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Dashboard Stats
    const [stats, setStats] = useState({
        activeCases: 0,
        criticalCases: 0,
        triagedToday: 0,
        avgWaitTime: 0
    });
    const [statsLoading, setStatsLoading] = useState(true);

    useEffect(() => {
        if (viewMode === 'QUEUE') {
            fetchQueue(true);
            fetchStats();
        } else {
            fetchHistory();
        }
        fetchDoctors();
        fetchMetadata();

        const interval = setInterval(() => {
            if (viewMode === 'QUEUE') {
                fetchQueue(false);
                fetchStats();
            }
        }, 4000);

        const onVisitUpdate = () => {
            fetchQueue(false);
            fetchStats();
            showToast('info', 'Casualty queue updated');
        };

        socket.on('visit_update', onVisitUpdate);

        return () => {
            clearInterval(interval);
            socket.off('visit_update', onVisitUpdate);
        };
    }, []);

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const { data } = await api.get('/reception/visits/casualty_history/');
            setHistory(data.results || data);
        } catch (error) {
            console.error("Failed to fetch history:", error);
            showToast('error', 'Failed to load patient history');
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (viewMode === 'HISTORY') {
            fetchHistory();
        }
    }, [viewMode]);

    const fetchMetadata = async () => {
        try {
            const [stock, svcs] = await Promise.all([
                api.get('/pharmacy/stock/?page_size=2000'), // increased limit to get more stock for filtering
                api.get('/casualty/service-definitions/')
            ]);
            setPharmacyStock(stock.data.results || stock.data);
            setServiceDefinitions(svcs.data.results || svcs.data);
        } catch (e) { console.error("Error fetching metadata:", e); }
    };

    const fetchQueue = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            // Fetch both statuses in parallel to avoid potential 400 bad request with comma-separated filter
            const [openRes, progressRes] = await Promise.all([
                api.get('/reception/visits/?assigned_role=CASUALTY&status=OPEN'),
                api.get('/reception/visits/?assigned_role=CASUALTY&status=IN_PROGRESS')
            ]);

            const openData = openRes.data.results || openRes.data || [];
            const progressData = progressRes.data.results || progressRes.data || [];

            // Combine and deduplicate just in case
            const combined = [...progressData, ...openData];
            const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());

            setQueue(unique);
        } catch (error) {
            console.error(error);
            showToast('error', 'Failed to load casualty queue');
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const fetchStats = async () => {
        setStatsLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data } = await api.get('/reception/visits/?assigned_role=CASUALTY');
            const allCasualtyVisits = data.results || data;

            const activeCases = allCasualtyVisits.filter(v => v.status === 'IN_PROGRESS' || v.status === 'OPEN').length;
            const triagedToday = allCasualtyVisits.filter(v => v.created_at?.startsWith(today)).length;
            const currentQueue = allCasualtyVisits.filter(v => v.status === 'OPEN' || v.status === 'IN_PROGRESS');

            let avgWait = 0;
            if (currentQueue.length > 0) {
                const totalWaitTime = currentQueue.reduce((sum, v) => sum + (new Date() - new Date(v.created_at)), 0);
                avgWait = Math.floor(totalWaitTime / currentQueue.length / 60000);
            }

            setStats({ activeCases, criticalCases: 0, triagedToday, avgWaitTime: avgWait });
        } catch (error) {
            console.error('Error fetching casualty stats:', error);
        } finally {
            setStatsLoading(false);
        }
    };

    const fetchDoctors = async () => {
        try {
            const { data } = await api.get('/users/management/doctors/');
            setDoctors(data);
        } catch (error) { console.error("Failed to load doctors", error); }
    };

    const handleCreateServiceDefinition = async (name, charge) => {
        try {
            await api.post('/casualty/service-definitions/', {
                name,
                base_charge: charge,
                is_active: true
            });
            showToast('success', 'Service created successfully');
            fetchMetadata(); // Refresh the list
            socket.emit('visit_update'); // Sync others
        } catch (e) {
            console.error(e);
            showToast('error', 'Failed to create service');
        }
    };

    const handleUpdateServiceDefinition = async (id, name, charge) => {
        try {
            await api.patch(`/casualty/service-definitions/${id}/`, {
                name,
                base_charge: charge
            });
            showToast('success', 'Service updated successfully');
            fetchMetadata();
            socket.emit('visit_update');
        } catch (e) {
            console.error(e);
            showToast('error', 'Failed to update service');
        }
    };

    const handleDeleteServiceDefinition = async (id) => {
        if (!window.confirm("Are you sure you want to delete this service?")) return;
        try {
            await api.delete(`/casualty/service-definitions/${id}/`);
            showToast('success', 'Service deleted successfully');
            fetchMetadata();
            socket.emit('visit_update');
        } catch (e) {
            console.error(e);
            showToast('error', 'Failed to delete service');
        }
    };

    const handleUpdate = async (visitId, data) => {
        try {
            // 1. Log Triage Entry
            await api.post('/casualty/logs/', {
                visit: visitId,
                treatment_notes: data.treatment_notes,
                vitals: data.vitals,
                transfer_path: data.transfer_path
            });

            // 2. Persist Medicines
            if (data.medicines.length > 0) {
                for (const med of data.medicines) {
                    if (!med.id) { // Only save new ones
                        await api.post('/casualty/medicines/', {
                            visit: visitId,
                            med_stock: med.med_stock,
                            qty: med.qty,
                            unit_price: med.unit_price,
                            total_price: Number(med.qty) * Number(med.unit_price),
                            dosage: med.dosage || ''
                        });
                    }
                }
            }

            // 3. Persist Services
            if (data.services.length > 0) {
                for (const svc of data.services) {
                    if (!svc.id) {
                        await api.post('/casualty/services/', {
                            visit: visitId,
                            service_definition: svc.service_definition,
                            qty: svc.qty,
                            unit_charge: svc.unit_charge
                        });
                    }
                }
            }

            // 4. Observation Management
            // If user is transferring (Discharging/Referring), we MUST end the observation automatically
            if (data.transfer_path && data.observation.is_active) {
                data.observation.is_active = false;
                // We will update it in backend below as inactive
            }

            if (data.observation.id) {
                // If we are finishing observation (is_active=false), let's be safe and close ALL active ones for this visit
                // This handles edge cases where multiple active observations were created due to race conditions/bugs
                if (!data.observation.is_active) {
                    // 1. Explicitly close the CURRENT active observation ID we know about
                    await api.patch(`/casualty/observations/${data.observation.id}/`, {
                        is_active: false,
                        end_time: new Date().toISOString()
                    });

                    // 2. Safety check: close ANY other active ones (zombies)
                    try {
                        const activeObsRes = await api.get(`/casualty/observations/?visit=${visitId}&is_active=true`);
                        const activeObsList = activeObsRes.data.results || activeObsRes.data || [];
                        for (const obs of activeObsList) {
                            if (obs.id !== data.observation.id) { // Don't patch the same one twice
                                await api.patch(`/casualty/observations/${obs.id}/`, {
                                    is_active: false,
                                    end_time: new Date().toISOString()
                                });
                            }
                        }
                    } catch (e) { console.warn("Safety cleanup failed", e); }
                } else {
                    // Normal update
                    await api.patch(`/casualty/observations/${data.observation.id}/`, data.observation);
                }
            } else if (data.observation.is_active) {
                // Only create new if it is being set to active
                await api.post('/casualty/observations/', {
                    visit: visitId,
                    planned_duration_minutes: data.observation.planned_duration_minutes,
                    observation_notes: data.observation.observation_notes,
                    is_active: true
                });
            }

            let updatePayload = { vitals: data.vitals };

            // Prevent transfer if Observation is Active
            if (data.observation.is_active) {
                // Ensure patient stays in Casualty with IN_PROGRESS status
                updatePayload = { ...updatePayload, assigned_role: 'CASUALTY', status: 'IN_PROGRESS' };
            } else {
                // Only allowed to transfer if NOT under observation
                if (data.transfer_path === 'REFER_DOCTOR') {
                    updatePayload = { ...updatePayload, assigned_role: 'DOCTOR', status: 'OPEN', doctor: data.doctor || null };
                } else if (data.transfer_path === 'REFER_LAB') {
                    updatePayload = { ...updatePayload, assigned_role: 'LAB', status: 'OPEN' };
                } else if (data.transfer_path === 'REFER_BILLING') {
                    updatePayload = { ...updatePayload, assigned_role: 'BILLING', status: 'OPEN' };
                }
            }

            await api.patch(`/reception/visits/${visitId}/`, updatePayload);
            showToast('success', 'Patient updated successfully');
            fetchQueue();
            fetchStats();
            fetchQueue();
            fetchStats();

            // Clear draft on successful save
            setDrafts(prev => {
                const newDrafts = { ...prev };
                delete newDrafts[visitId];
                return newDrafts;
            });

            return true;
        } catch (err) {
            console.error(err);
            showToast('error', 'Failed to update patient');
            return false;
        }
    };

    const filteredQueue = (viewMode === 'QUEUE' ? queue : viewMode === 'OBSERVATION' ? queue.filter(v => v.casualty_observations?.some(o => o.is_active)) : history).filter(v =>
        v.patient_name?.toLowerCase().includes(search.toLowerCase()) ||
        v.v_id?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="p-8 h-screen bg-[#F8FAFC] font-sans text-slate-900 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-end mb-8 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3 font-outfit uppercase">
                        <div className="p-2 bg-rose-100 rounded-xl text-rose-600"><AlertTriangle size={24} /></div>
                        Casualty / Emergency
                    </h1>
                    <div className="flex items-center gap-2 mt-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
                        <button
                            onClick={() => setViewMode('QUEUE')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'QUEUE' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                            Active
                        </button>
                        <button
                            onClick={() => setViewMode('OBSERVATION')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'OBSERVATION' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                            <Clock size={14} /> Observation
                            {queue.filter(v => v.casualty_observations?.some(o => o.is_active)).length > 0 && (
                                <span className="bg-white text-amber-500 px-1.5 rounded text-[9px]">{queue.filter(v => v.casualty_observations?.some(o => o.is_active)).length}</span>
                            )}
                        </button>
                        <button
                            onClick={() => setViewMode('HISTORY')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'HISTORY' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                            History
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowManageServices(true)}
                        className="px-5 py-2.5 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wide transition-all shadow-sm flex items-center gap-2"
                    >
                        <FileText size={16} /> Manage Services
                    </button>

                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-rose-500" size={16} />
                        <input
                            className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 outline-none shadow-sm w-72 transition-all"
                            placeholder="Search patient..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* --- Stats Cards --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 shrink-0">
                {[
                    { label: 'Active', val: stats.activeCases, text: 'Active Cases', icon: AlertTriangle, color: 'red' },
                    { label: 'Priority', val: stats.criticalCases, text: 'Critical Cases', icon: Heart, color: 'orange' },
                    { label: 'Today', val: stats.triagedToday, text: 'Triaged Today', icon: Stethoscope, color: 'blue' },
                    { label: 'Average', val: stats.avgWaitTime, text: 'Avg Wait (min)', icon: Clock, color: 'purple' }
                ].map((stat, i) => (
                    <div key={i} className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 bg-${stat.color}-50 rounded-xl text-${stat.color}-600 group-hover:scale-110 transition-transform`}>
                                <stat.icon className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.label}</span>
                        </div>
                        <div>
                            <h3 className="text-3xl font-black text-slate-900 mb-1 font-outfit">{statsLoading ? '...' : stat.val}</h3>
                            <p className="text-sm font-semibold text-slate-500">{stat.text}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Table Card */}
            <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm flex-1 overflow-hidden flex flex-col">
                <div className="overflow-x-auto flex-1 custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
                            <tr>
                                {['Patient Details', 'Arrival Time', viewMode === 'HISTORY' ? 'Current Status' : viewMode === 'OBSERVATION' ? 'Monitoring Time' : 'Vitals Preview', 'Actions'].map((h, i) => (
                                    <th key={i} className={`px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider ${i === 3 ? 'text-right' : ''}`}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading || (viewMode === 'HISTORY' && historyLoading) ? (
                                <tr><td colSpan="4" className="text-center py-20 text-slate-400 font-bold">Loading...</td></tr>
                            ) : filteredQueue.length === 0 ? (
                                <tr><td colSpan="4" className="text-center py-20"><div className="flex flex-col items-center opacity-50"><div className="p-4 bg-slate-50 rounded-full mb-3"><CheckCircle size={32} className="text-slate-400" /></div><p className="font-bold text-slate-900">No records found</p></div></td></tr>
                            ) : (
                                filteredQueue.map(visit => {
                                    // Calculate active observation duration
                                    const activeObs = visit.casualty_observations?.find(o => o.is_active);
                                    let obsDuration = '--';
                                    let obsProgress = 0;

                                    if (activeObs) {
                                        const start = new Date(activeObs.start_time);
                                        const now = new Date();
                                        const elapsedMin = Math.floor((now - start) / 60000);
                                        const hours = Math.floor(elapsedMin / 60);
                                        const mins = elapsedMin % 60;
                                        obsDuration = `${hours}h ${mins}m`;
                                        obsProgress = Math.min((elapsedMin / activeObs.planned_duration_minutes) * 100, 100);
                                    }

                                    return (
                                        <tr key={visit.id} className="group hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-md ${viewMode === 'HISTORY' ? 'bg-slate-400 shadow-slate-400/20' : 'bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/20'}`}>{visit.patient_name?.[0]}</div>
                                                    <div>
                                                        <p className="font-bold text-slate-900">{visit.patient_name}</p>
                                                        <p className="text-xs text-slate-500 font-mono flex items-center gap-1">
                                                            ID: {visit.patient_registration_number || visit.v_id?.slice(0, 8)}
                                                            {(visit.patient_age || visit.patient_gender) && (
                                                                <>
                                                                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                                                    <span className="font-bold uppercase text-[10px] tracking-wide">
                                                                        {visit.patient_age ? `${visit.patient_age}Y` : ''}
                                                                        {visit.patient_gender ? ` / ${visit.patient_gender?.[0]}` : ''}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                                    <Clock size={14} className="text-slate-400" />
                                                    {new Date(visit.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 ml-1 font-mono">{Math.floor((new Date() - new Date(visit.created_at)) / 60000)}m ago</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {viewMode === 'HISTORY' ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${visit.status === 'CLOSED' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{visit.status} ({visit.assigned_role})</span>
                                                    </div>
                                                ) : viewMode === 'OBSERVATION' && activeObs ? (
                                                    <div className="w-full max-w-[140px]">
                                                        <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 mb-1">
                                                            <span>Time Elapsed</span>
                                                            <span className="text-amber-600">{obsDuration}</span>
                                                        </div>
                                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-amber-500 rounded-full transition-all duration-1000" style={{ width: `${obsProgress}%` }}></div>
                                                        </div>
                                                        <div className="text-[9px] font-bold text-slate-400 mt-1 text-right">Target: {Math.floor(activeObs.planned_duration_minutes / 60)}h</div>
                                                    </div>
                                                ) : (
                                                    visit.vitals ? (
                                                        <div className="text-xs font-bold text-slate-600 space-y-1">
                                                            <span className="mr-3"><span className="text-rose-500 uppercase tracking-wide text-[10px]">BP:</span> {visit.vitals.bp || '--'}</span>
                                                            <span><span className="text-amber-500 uppercase tracking-wide text-[10px]">Temp:</span> {visit.vitals.temp || '--'}°F</span>
                                                        </div>
                                                    ) : <span className="text-xs text-slate-400 italic">No Data</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {viewMode === 'OBSERVATION' && activeObs ? (
                                                        <>
                                                            <button
                                                                onClick={() => { setInitialModalTab('MEDICINES'); setSelectedVisit(visit); }}
                                                                className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                                                                title="Add Medicine"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <Pill size={14} /> <span className="text-[10px] font-black uppercase hidden lg:inline">Meds</span>
                                                                </div>
                                                            </button>
                                                            <button
                                                                onClick={() => { setInitialModalTab('SERVICES'); setSelectedVisit(visit); }}
                                                                className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-100"
                                                                title="Add Service"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <Plus size={14} /> <span className="text-[10px] font-black uppercase hidden lg:inline">Svc</span>
                                                                </div>
                                                            </button>
                                                            <button
                                                                onClick={() => { setInitialModalTab('OBSERVATION'); setSelectedVisit(visit); }}
                                                                className="p-2 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors border border-amber-100"
                                                                title="Manage Observation"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <Clock size={14} /> <span className="text-[10px] font-black uppercase hidden lg:inline">Update</span>
                                                                </div>
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            {viewMode === 'QUEUE' && visit.casualty_observations?.some(o => o.is_active) && (
                                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg text-amber-600 animate-pulse">
                                                                    <Clock size={12} />
                                                                    <span className="text-[10px] font-black uppercase tracking-widest hidden xl:inline">Observing</span>
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => { setInitialModalTab('TRIAGE'); setSelectedVisit(visit); }}
                                                                className={`px-4 py-2 text-xs font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-2 uppercase tracking-wide ${viewMode === 'HISTORY' ? 'bg-white border-2 border-slate-100 text-slate-600 hover:bg-slate-50' : 'bg-slate-900 text-white hover:bg-blue-600 shadow-slate-900/10'}`}
                                                            >
                                                                {viewMode === 'HISTORY' ? <FileText size={14} /> : <Stethoscope size={14} />} {viewMode === 'HISTORY' ? 'View Details' : 'Assess'}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <AnimatePresence>
                {selectedVisit && (
                    <TriageModal
                        visit={selectedVisit}
                        onClose={() => setSelectedVisit(null)}
                        onSave={handleUpdate}
                        doctors={doctors}
                        pharmacyStock={pharmacyStock}
                        serviceDefinitions={serviceDefinitions}
                        readOnly={viewMode === 'HISTORY'}
                        initialTab={initialModalTab}
                        draft={drafts[selectedVisit.id]}
                        onDraftUpdate={(data) => setDrafts(prev => ({ ...prev, [selectedVisit.id]: data }))}
                    />
                )}
                {showManageServices && (
                    <ManageServicesModal
                        onClose={() => setShowManageServices(false)}
                        serviceDefinitions={serviceDefinitions}
                        onCreate={handleCreateServiceDefinition}
                        onUpdate={handleUpdateServiceDefinition}
                        onDelete={handleDeleteServiceDefinition}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default CasualtyPage;