import React, { useState, useEffect } from 'react';
import {
    Activity, Search, Clock, Save, X, CheckCircle,
    Thermometer, Heart, Wind, Stethoscope, AlertTriangle, FileText,
    User, ArrowRight, ChevronRight, ChevronDown, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { socket } from '../socket';

// --- Premium Triage Modal ---
const TriageModal = ({ visit, onClose, onSave, doctors = [] }) => {
    const [formData, setFormData] = useState({
        vitals: { bp: '', temp: '', pulse: '', spo2: '', weight: '' },
        treatment_notes: '',
        transfer_path: 'REFER_DOCTOR', // Default action
        doctor: ''
    });
    const [error, setError] = useState(null);

    useEffect(() => {
        if (visit) {
            setFormData(prev => ({
                ...prev,
                vitals: { ...visit.vitals, weight: visit.vitals?.weight || '' } || { bp: '', temp: '', pulse: '', spo2: '', weight: '' },
                treatment_notes: visit.treatment_notes || '',
                doctor: visit.doctor || ''
            }));
        }
    }, [visit]);

    const handleSubmit = async () => {
        // Validate Vitals
        const { bp, temp, pulse, spo2 } = formData.vitals;
        if (!bp || !temp || !pulse || !spo2) {
            setError('MISSING VITALS: Please ensure BP, Temp, Pulse, and SpO2 are recorded.');
            return;
        }

        setError(null);
        const success = await onSave(visit.id || visit.v_id, formData);
        if (success) onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight font-outfit uppercase">Triage Assessment</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{visit.patient_name}</span>
                            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">ID: {(visit.v_id || visit.id)?.slice(0, 8)}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-red-50 hover:text-red-500 transition-colors shadow-sm border border-slate-100"><X size={20} /></button>
                </div>

                <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar bg-white">
                    {/* Vitals Section - Visual Cards */}
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
                                <div key={v.key} className={`p-3 bg-${v.color}-50 rounded-2xl border border-${v.color}-100 focus-within:ring-2 focus-within:ring-${v.color}-500/20 transition-all`}>
                                    <label className={`text-[10px] font-black text-${v.color}-600 uppercase block mb-1 flex items-center gap-1`}>
                                        <v.icon size={10} /> {v.label}
                                    </label>
                                    <input
                                        className="w-full bg-transparent font-black text-slate-900 outline-none text-sm placeholder:text-slate-300"
                                        placeholder={v.ph}
                                        value={formData.vitals[v.key]}
                                        onChange={e => setFormData({ ...formData, vitals: { ...formData.vitals, [v.key]: e.target.value } })}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Clinical Notes */}
                    <div>
                        <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                            <FileText size={14} className="text-slate-500" /> Clinical Observations
                        </h4>
                        <textarea
                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none resize-none h-32 transition-all placeholder:text-slate-400"
                            placeholder="Enter symptoms, primary complaint, and immediate treatment given..."
                            value={formData.treatment_notes}
                            onChange={e => setFormData({ ...formData, treatment_notes: e.target.value })}
                        />
                    </div>

                    {/* Action Plan */}
                    <div>
                        <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                            <CheckCircle size={14} className="text-emerald-500" /> Action Plan
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                { val: 'REFER_DOCTOR', label: 'Consult Doctor', desc: 'Patient stable, proceed to OP.', icon: Stethoscope },
                                { val: 'REFER_LAB', label: 'Investigation (Lab)', desc: 'Immediate tests required.', icon: Activity }
                            ].map(opt => (
                                <label key={opt.val} className={`p-4 rounded-2xl border-2 cursor-pointer flex items-center gap-4 transition-all group ${formData.transfer_path === opt.val ? 'bg-blue-50 border-blue-500 shadow-md ring-1 ring-blue-500/20' : 'bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50'}`}>
                                    <input
                                        type="radio"
                                        name="transfer_path"
                                        value={opt.val}
                                        checked={formData.transfer_path === opt.val}
                                        onChange={e => setFormData({ ...formData, transfer_path: e.target.value })}
                                        className="hidden"
                                    />
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${formData.transfer_path === opt.val ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-blue-500'}`}>
                                        <opt.icon size={20} />
                                    </div>
                                    <div>
                                        <div className={`font-black text-sm ${formData.transfer_path === opt.val ? 'text-blue-900' : 'text-slate-700'}`}>{opt.label}</div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{opt.desc}</div>
                                    </div>
                                    {formData.transfer_path === opt.val && <CheckCircle size={18} className="text-blue-600 ml-auto" />}
                                </label>
                            ))}
                        </div>

                        {/* Doctor Selection (Only if Referring to Doctor) */}
                        <AnimatePresence>
                            {formData.transfer_path === 'REFER_DOCTOR' && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden mt-4"
                                >
                                    <div className="relative">
                                        <select
                                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all appearance-none cursor-pointer"
                                            value={formData.doctor}
                                            onChange={e => setFormData({ ...formData, doctor: e.target.value })}
                                        >
                                            <option value="">-- Select Specialist --</option>
                                            {doctors.map(doc => (
                                                <option key={doc.id} value={doc.id}>Dr. {doc.username} ({doc.specialization || 'General'})</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                            {/* Fixed ChevronRight error by importing it or using ChevronDown */}
                                            <ChevronDown size={16} />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50/80 backdrop-blur-sm">
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-4 p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-600"
                        >
                            <AlertTriangle size={18} />
                            <span className="text-sm font-bold">{error}</span>
                        </motion.div>
                    )}
                    <div className="flex justify-end gap-3">
                        <button onClick={onClose} className="px-6 py-3 rounded-xl text-slate-500 font-bold hover:bg-white hover:text-slate-700 hover:shadow-sm transition-all text-xs uppercase tracking-widest">Cancel</button>
                        <button onClick={handleSubmit} className="px-8 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-blue-600 shadow-xl shadow-slate-900/20 transition-all active:scale-[0.98] text-xs uppercase tracking-widest flex items-center gap-2">
                            Confirm & Update <ArrowRight size={14} />
                        </button>
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
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedVisit, setSelectedVisit] = useState(null);

    // Dashboard Stats
    const [stats, setStats] = useState({
        activeCases: 0,
        criticalCases: 0,
        triagedToday: 0,
        avgWaitTime: 0
    });
    const [statsLoading, setStatsLoading] = useState(true);

    useEffect(() => {
        fetchQueue(true);
        fetchDoctors();
        fetchStats();

        const interval = setInterval(() => {
            fetchQueue(false);
            fetchStats();
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

    const fetchQueue = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const { data } = await api.get('/reception/visits/?assigned_role=CASUALTY&status=IN_PROGRESS&status=OPEN');
            setQueue(data.results || data);
        } catch (error) {
            console.error(error);
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

    const handleUpdate = async (visitId, data) => {
        try {
            await api.post('/casualty/logs/', {
                visit: visitId,
                treatment_notes: data.treatment_notes,
                vitals: data.vitals,
                transfer_path: data.transfer_path
            });

            let updatePayload = { vitals: data.vitals };
            if (data.transfer_path === 'REFER_DOCTOR') {
                updatePayload = { ...updatePayload, assigned_role: 'DOCTOR', status: 'OPEN', doctor: data.doctor || null };
            } else if (data.transfer_path === 'REFER_LAB') {
                updatePayload = { ...updatePayload, assigned_role: 'LAB', status: 'OPEN' };
            }

            await api.patch(`/reception/visits/${visitId}/`, updatePayload);
            showToast('success', 'Patient updated successfully');
            fetchQueue();
            fetchStats();
            return true;
        } catch (err) {
            console.error(err);
            showToast('error', 'Failed to update patient');
            return false;
        }
    };

    const filteredQueue = queue.filter(v =>
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
                    <p className="text-slate-500 font-medium mt-1 ml-1 text-sm">Manage emergency triage admissions.</p>
                </div>
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
                                {['Patient Details', 'Arrival Time', 'Vitals Preview', 'Actions'].map((h, i) => (
                                    <th key={i} className={`px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider ${i === 3 ? 'text-right' : ''}`}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan="4" className="text-center py-20 text-slate-400 font-bold">Loading Queue...</td></tr>
                            ) : filteredQueue.length === 0 ? (
                                <tr><td colSpan="4" className="text-center py-20"><div className="flex flex-col items-center opacity-50"><div className="p-4 bg-slate-50 rounded-full mb-3"><CheckCircle size={32} className="text-slate-400" /></div><p className="font-bold text-slate-900">No active emergency cases</p></div></td></tr>
                            ) : (
                                filteredQueue.map(visit => (
                                    <tr key={visit.id} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white font-bold shadow-md shadow-rose-500/20">{visit.patient_name?.[0]}</div>
                                                <div><p className="font-bold text-slate-900">{visit.patient_name}</p><p className="text-xs text-slate-500 font-mono">ID: {visit.v_id?.slice(0, 8)}</p></div>
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
                                            {visit.vitals ? (
                                                <div className="text-xs font-bold text-slate-600 space-y-1">
                                                    <span className="mr-3"><span className="text-rose-500 uppercase tracking-wide text-[10px]">BP:</span> {visit.vitals.bp || '--'}</span>
                                                    <span><span className="text-amber-500 uppercase tracking-wide text-[10px]">Temp:</span> {visit.vitals.temp || '--'}°F</span>
                                                </div>
                                            ) : <span className="text-xs text-slate-400 italic">No Data</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => setSelectedVisit(visit)} className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-blue-600 shadow-lg shadow-slate-900/10 active:scale-95 transition-all flex items-center gap-2 ml-auto uppercase tracking-wide">
                                                <Stethoscope size={14} /> Assess / Triage
                                            </button>
                                        </td>
                                    </tr>
                                ))
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
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default CasualtyPage;