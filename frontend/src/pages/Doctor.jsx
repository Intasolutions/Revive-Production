import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Stethoscope, ClipboardList, Send, User, Activity, X, Search,
    Plus, FileText, Trash2, ChevronRight, Clock, Pill,
    CalendarDays, History, CheckCircle2, AlertCircle, Sparkles, FlaskConical
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSearch } from '../context/SearchContext';
import { useToast } from '../context/ToastContext'; // Using the global toast we made
import api from '../api/axios';
import Pagination from '../components/Pagination';
import { socket } from '../socket';

// --- Components: Skeletons & UI Bits ---
const QueueSkeleton = () => (
    <div className="space-y-3 p-4">
        {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-10 h-10 bg-slate-100 rounded-full" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 bg-slate-100 rounded" />
                    <div className="h-3 w-1/3 bg-slate-50 rounded" />
                </div>
            </div>
        ))}
    </div>
);

const HistoryModal = ({ history, onClose }) => {
    if (!history) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
                <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Consultation Details</h3>
                        <p className="text-sm text-slate-500 font-medium">{new Date(history.created_at).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
                    {/* Diagnosis & Notes */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <div className="p-1.5 bg-blue-100 rounded-lg text-blue-600"><Stethoscope size={16} /></div>
                            Clinical Diagnosis
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-slate-800 font-medium leading-relaxed">
                            {history.diagnosis || 'No specific diagnosis recorded.'}
                        </div>
                        {history.notes && (
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-slate-600 text-sm">
                                <span className="font-bold block mb-1 text-slate-400 uppercase text-[10px]">Additional Notes</span>
                                {history.notes}
                            </div>
                        )}
                    </div>

                    {/* Prescription */}
                    {history.prescription && Object.keys(history.prescription).length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-600"><Pill size={16} /></div>
                                Prescribed Medication
                            </div>
                            <div className="grid gap-3">
                                {Object.entries(history.prescription).map(([med, details]) => (
                                    <div key={med} className="flex justify-between items-center p-3 border border-slate-100 rounded-xl bg-white shadow-sm">
                                        <span className="font-bold text-slate-900">{med}</span>
                                        <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded">{details}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Lab Details */}
                    {history.lab_referral_details && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                <div className="p-1.5 bg-purple-100 rounded-lg text-purple-600"><ClipboardList size={16} /></div>
                                Lab Requirements
                            </div>
                            <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 text-purple-900 text-sm font-medium">
                                {history.lab_referral_details}
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

const Doctor = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const { globalSearch } = useSearch();

    // Data States
    const [visitsData, setVisitsData] = useState({ results: [], count: 0 });
    const [selectedVisit, setSelectedVisit] = useState(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [patientHistory, setPatientHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [viewingHistory, setViewingHistory] = useState(null);

    // Form States
    const [notes, setNotes] = useState({ diagnosis: '', prescription: {}, notes: '' });

    // Medicine States
    const [medSearch, setMedSearch] = useState('');
    const [medResults, setMedResults] = useState([]);
    const [selectedMeds, setSelectedMeds] = useState([]);
    const [referral, setReferral] = useState('NONE'); // NONE, LAB, PHARMACY, CASUALTY

    // Lab Search States
    const [labSearch, setLabSearch] = useState('');
    const [labResults, setLabResults] = useState([]);
    const [selectedTests, setSelectedTests] = useState([]);
    const [existingNoteId, setExistingNoteId] = useState(null);


    // --- Effects ---
    useEffect(() => {
        if (user) fetchQueue();
    }, [user, page, globalSearch]);

    useEffect(() => {
        if (selectedVisit) {
            // Reset forms
            setNotes({ diagnosis: '', prescription: {}, notes: '' });
            setSelectedMeds([]);
            setReferral('NONE');
            setSelectedTests([]);
            setExistingNoteId(null);

            // Fetch potential existing note for this visit (Draft/Recovery)
            const fetchExistingNote = async () => {
                try {
                    const vId = selectedVisit.v_id || selectedVisit.id;
                    const { data } = await api.get(`/medical/doctor-notes/?visit=${vId}`);
                    // data should be a list due to filtering, take first
                    const existing = (data.results || data)[0];

                    if (existing) {
                        setExistingNoteId(existing.note_id || existing.id);
                        setNotes({
                            diagnosis: existing.diagnosis,
                            prescription: {}, // Will process below
                            notes: existing.notes
                        });

                        // Parse Prescription
                        if (existing.prescription) {
                            const meds = [];

                            // Fetch stocks for restored meds
                            const medPromises = Object.entries(existing.prescription).map(async ([name, details]) => {
                                let stock = 0;
                                try {
                                    const { data } = await api.get(`/pharmacy/stock/doctor-search/?search=${encodeURIComponent(name)}`);
                                    const match = (data.results || data).find(m => m.name === name);
                                    if (match) stock = match.qty_available;
                                } catch (e) {
                                    console.error("Stock fetch error", name, e);
                                }

                                try {
                                    const parts = details.split(' | ');
                                    const dosage = parts[0];
                                    const duration = parts[1];
                                    const count = parts[2].replace('Qty: ', '');
                                    return { name, dosage, duration, count, stock };
                                } catch (e) {
                                    console.error("Error parsing med", name, e);
                                    return null;
                                }
                            });

                            const resolvedMeds = await Promise.all(medPromises);
                            setSelectedMeds(resolvedMeds.filter(m => m !== null));
                        }

                        // Parse Tests (Comma separated string)
                        if (existing.lab_referral_details) {
                            // If tests are in the string, we try to reconstruct tags
                            // Note: We might miss categories/IDs but names will work for display
                            const testNames = existing.lab_referral_details.split(', ');
                            setSelectedTests(testNames.map((name, i) => ({ id: `restored-${i}`, name })));
                        }
                    }
                } catch (err) { console.error("Error checking existing notes", err); }
            };
            fetchExistingNote();

            fetchPatientHistory(selectedVisit.patient_id || selectedVisit.patient);

        } else {
            setPatientHistory([]);
        }
    }, [selectedVisit]);

    // --- API Interactions ---
    const fetchQueue = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const doctorFilter = user?.role === 'DOCTOR' ? `&doctor=${user.u_id}` : '';
            const { data } = await api.get(`/reception/visits/?status__in=OPEN,IN_PROGRESS${doctorFilter}&page=${page}${globalSearch ? `&search=${encodeURIComponent(globalSearch)}` : ''}`);
            // Safety filter: Ensure no Pharmacy referrals appear even if backend update lags
            const cleanResults = (data.results || data).filter(v => v.assigned_role !== 'PHARMACY');
            setVisitsData({ ...data, results: cleanResults });
        } catch (err) {
            showToast('error', 'Could not refresh patient queue');
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    // Auto-refresh Queue
    useEffect(() => {
        if (user) {
            // Polling fallback - 4 seconds for consistency
            const interval = setInterval(() => {
                fetchQueue(false);
            }, 4000);

            // Socket Listeners
            const onVisitUpdate = (data) => {
                console.log("Socket: Visit Update", data);
                fetchQueue(false); // Background refresh
                if (data.status === 'OPEN') showToast('info', 'Patient queue updated');
            };

            const onLabUpdate = (data) => {
                console.log("Socket: Lab Update", data);
                if (data.status === 'COMPLETED') {
                    showToast('success', `Lab results ready (ID: ${data.visit_id.slice(0, 8)})`);
                    fetchQueue(false);
                }
            };

            socket.on('visit_update', onVisitUpdate);
            socket.on('lab_update', onLabUpdate);

            return () => {
                clearInterval(interval);
                socket.off('visit_update', onVisitUpdate);
                socket.off('lab_update', onLabUpdate);
            };
        }
    }, [user, page, globalSearch]);

    const fetchPatientHistory = async (pId) => {
        if (!pId) return;
        setHistoryLoading(true);
        try {
            // In a real app, you'd likely have a specific endpoint for history
            const { data: notesData } = await api.get('/medical/doctor-notes/');
            const { data: visitsData } = await api.get(`/reception/visits/?patient=${pId}`);
            const vIds = (visitsData.results || visitsData).map(v => v.v_id || v.id);
            const filteredNotes = (notesData.results || notesData).filter(n => vIds.includes(n.visit));
            setPatientHistory(filteredNotes);
        } catch (err) {
            console.error("History fetch error", err);
        } finally {
            setHistoryLoading(false);
        }
    };

    const searchMedicines = async (query) => {
        setMedSearch(query);
        if (query.length < 2) {
            setMedResults([]);
            return;
        }
        try {
            const { data } = await api.get(`/pharmacy/stock/doctor-search/?search=${query}&_t=${Date.now()}`);
            setMedResults(data.results || data);
        } catch (err) {
            console.error(err);
        }
    };

    const addMedicine = (med) => {
        if (!selectedMeds.find(m => m.name === med.name)) {
            setSelectedMeds([...selectedMeds, {
                name: med.name,
                dosage: '1-0-1',
                duration: '5 Days',
                count: '15',
                stock: med.qty_available,
                mrp: med.mrp,
                tps: med.tablets_per_strip || 1
            }]);
            showToast('success', `${med.name} added to prescription`);
        }
        setMedSearch('');
        setMedResults([]);
    };

    const removeMedicine = (name) => {
        setSelectedMeds(selectedMeds.filter(m => m.name !== name));
    };

    const updateMedField = (name, field, value) => {
        setSelectedMeds(selectedMeds.map(m => m.name === name ? { ...m, [field]: value } : m));
    };

    // --- Lab Search Functions ---
    const searchLabTests = async (query) => {
        setLabSearch(query);
        if (query.length < 2) {
            setLabResults([]);
            return;
        }
        try {
            const { data } = await api.get(`/lab/tests/?search=${query}`);
            setLabResults(data.results || data);
        } catch (err) { console.error(err); }
    };

    const addTest = (test) => {
        if (!selectedTests.find(t => t.name === test.name)) {
            setSelectedTests([...selectedTests, test]);
            showToast('success', `${test.name} added`);
        }
        setLabSearch('');
        setLabResults([]);
    };

    const removeTest = (id) => {
        setSelectedTests(selectedTests.filter(t => t.id !== id));
    };

    const handleSaveConsultation = async () => {
        if (!selectedVisit) return;
        try {
            const prescriptionObj = {};
            selectedMeds.forEach(m => {
                prescriptionObj[m.name] = `${m.dosage} | ${m.duration} | Qty: ${m.count}`;
            });

            const payload = {
                visit: selectedVisit.v_id || selectedVisit.id,
                ...notes,
                prescription: prescriptionObj,
                lab_referral_details: selectedTests.map(t => t.name).join(', ') // Concatenate tests
            };

            if (existingNoteId) {
                // Update existing note
                await api.patch(`/medical/doctor-notes/${existingNoteId}/`, payload);
            } else {
                // Create new note
                await api.post('/medical/doctor-notes/', payload);
            }

            let updatePayload;
            if (referral === 'LAB') {
                // Keep patient in doctor's queue (don't clear doctor)
                updatePayload = { status: 'OPEN', assigned_role: referral };
            } else if (referral !== 'NONE') {
                // Release to other department (keep doctor field intact)
                updatePayload = { status: 'OPEN', assigned_role: referral };
            } else {
                // Discharge
                updatePayload = { status: 'CLOSED' };
            }

            await api.patch(`/reception/visits/${selectedVisit.v_id || selectedVisit.id}/`, updatePayload);

            showToast('success', referral !== 'NONE' ? `Referred to ${referral}` : 'Consultation saved & patient discharged');
            setSelectedVisit(null);
            fetchQueue();

        } catch (err) {
            console.error(err);
            showToast('error', 'Failed to save consultation details');
        }
    };

    const totalPages = Math.ceil((visitsData.count || 0) / 10);

    return (
        <div className="p-6 h-screen bg-[#F8FAFC] font-sans text-slate-900 overflow-hidden flex flex-col">

            {/* --- Top Bar --- */}
            <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950">Consultation Room</h1>
                    <div className="flex items-center gap-2 text-sm text-slate-500 font-medium mt-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span>Dr. {user?.username} is Online</span>
                    </div>
                </div>
            </div>

            {/* --- Main Workspace (Grid) --- */}
            <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">

                {/* --- LEFT: Patient Queue (4 Cols) --- */}
                <div className="col-span-3 bg-white rounded-[24px] border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Waiting Room</h3>
                        <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs font-bold">{visitsData.count || 0}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {loading ? (
                            <QueueSkeleton />
                        ) : visitsData.results.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-center p-6">
                                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                                    <Clock className="text-slate-300" />
                                </div>
                                <p className="text-sm font-medium text-slate-500">Queue is empty</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {visitsData.results.map(v => {
                                    const isActive = selectedVisit?.v_id === (v.v_id || v.id);
                                    return (
                                        <div
                                            key={v.v_id || v.id}
                                            onClick={() => setSelectedVisit(v)}
                                            className={`p-4 cursor-pointer transition-all hover:bg-slate-50 relative group ${isActive ? 'bg-blue-50/50' : ''
                                                }`}
                                        >
                                            {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full" />}
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm transition-colors ${isActive ? 'bg-blue-600 text-white shadow-blue-200' : 'bg-white border border-slate-100 text-slate-500'
                                                    }`}>
                                                    {v.patient_name ? v.patient_name[0] : 'U'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-bold truncate ${isActive ? 'text-blue-900' : 'text-slate-900'}`}>
                                                        {v.patient_name}
                                                    </p>
                                                    <p className="text-xs text-slate-400 font-medium truncate">
                                                        Wait: 12 mins
                                                    </p>
                                                </div>
                                                <ChevronRight size={16} className={`transition-opacity ${isActive ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover:opacity-50 text-slate-300'}`} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div className="p-3 border-t border-slate-100">
                        <Pagination current={page} total={totalPages} onPageChange={setPage} loading={loading} compact={true} />
                    </div>
                </div>

                {/* --- RIGHT: Consultation Pad (9 Cols) --- */}
                <div className="col-span-9 bg-white rounded-[24px] border border-slate-100 shadow-sm flex flex-col overflow-hidden relative">
                    {selectedVisit ? (
                        <>
                            {/* Patient Header */}
                            <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                                        <User size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900 leading-tight">{selectedVisit.patient_name}</h2>
                                        <div className="flex items-center gap-3 text-xs font-bold text-slate-500 mt-1 uppercase tracking-wide">
                                            <span>ID: {(selectedVisit.v_id || selectedVisit.id).slice(0, 8)}</span>
                                            <span className="w-1 h-1 bg-slate-300 rounded-full" />
                                            <span className="text-blue-600">
                                                {selectedVisit.patient_gender === 'M' ? 'Male' : selectedVisit.patient_gender === 'F' ? 'Female' : 'Other'} • {selectedVisit.patient_age} Yrs
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3 items-center">
                                    <select
                                        value={referral}
                                        onChange={(e) => setReferral(e.target.value)}
                                        className="h-10 pl-3 pr-8 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 hover:border-blue-300 transition-all cursor-pointer"
                                    >
                                        <option value="NONE">No Referral</option>
                                        <option value="LAB">Refer to Lab</option>
                                        <option value="PHARMACY">Refer to Pharmacy</option>
                                        <option value="CASUALTY">Refer to Casualty</option>
                                    </select>

                                    <button
                                        onClick={() => setSelectedVisit(null)}
                                        className="px-4 py-2 rounded-xl text-slate-500 font-bold text-xs hover:bg-slate-100 transition-colors"
                                    >
                                        Hold Patient
                                    </button>
                                    <button
                                        onClick={handleSaveConsultation}
                                        className={`px-6 py-2 text-white rounded-xl font-bold text-xs shadow-lg transition-all flex items-center gap-2 active:scale-95 ${referral !== 'NONE' ? 'bg-indigo-600 shadow-indigo-600/20 hover:bg-indigo-700' : 'bg-slate-950 shadow-slate-900/20 hover:bg-blue-600'}`}
                                    >
                                        <Send size={14} />
                                        {referral !== 'NONE' ? 'Refer & Release' : 'Finalize & Discharge'}
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Workspace */}
                            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                <div className="grid grid-cols-3 gap-8">

                                    {/* Main Clinical Column (2/3) */}
                                    <div className="col-span-2 space-y-8">

                                        {/* Diagnosis Section */}
                                        <div className="group">
                                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
                                                <div className="p-1.5 bg-blue-100 rounded-lg text-blue-600"><Stethoscope size={16} /></div>
                                                Clinical Diagnosis & Notes
                                            </label>
                                            <textarea
                                                className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium text-slate-800 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all resize-none placeholder:text-slate-400"
                                                rows="4"
                                                placeholder="Type your clinical findings here..."
                                                value={notes.diagnosis}
                                                onChange={(e) => setNotes({ ...notes, diagnosis: e.target.value })}
                                            />
                                        </div>

                                        {/* Lab Referral Details Input (Conditional) */}
                                        <AnimatePresence>
                                            {referral === 'LAB' && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="bg-purple-50/50 rounded-[24px] border border-purple-100 p-6 relative group focus-within:ring-4 focus-within:ring-purple-500/5 transition-all mt-6">
                                                        <div className="flex justify-between items-center mb-4">
                                                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                                                <div className="p-1.5 bg-purple-100 rounded-lg text-purple-600"><ClipboardList size={16} /></div>
                                                                Lab Requisition
                                                            </label>

                                                            {/* Lab Search */}
                                                            <div className="relative w-64 z-20">
                                                                <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                                                                <input
                                                                    className="w-full pl-9 pr-4 py-2 bg-white border border-purple-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 transition-all shadow-sm placeholder:text-purple-300"
                                                                    placeholder="Search lab tests..."
                                                                    value={labSearch}
                                                                    onChange={(e) => searchLabTests(e.target.value)}
                                                                />
                                                                <AnimatePresence>
                                                                    {labResults.length > 0 && (
                                                                        <motion.div
                                                                            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                                                            className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-50 z-30"
                                                                        >
                                                                            {labResults.map(test => (
                                                                                <div
                                                                                    key={test.id}
                                                                                    onClick={() => addTest(test)}
                                                                                    className="px-4 py-3 hover:bg-purple-50 cursor-pointer flex justify-between items-center group"
                                                                                >
                                                                                    <span className="text-sm font-bold text-slate-700 group-hover:text-purple-700">{test.name}</span>
                                                                                    {test.category && <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-md">{test.category}</span>}
                                                                                </div>
                                                                            ))}
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                        </div>

                                                        {/* Selected Tests List */}
                                                        <div className="flex flex-wrap gap-2 min-h-[50px]">
                                                            {selectedTests.length === 0 && (
                                                                <p className="text-xs text-slate-400 italic w-full text-center py-2">Search and add tests from the catalog</p>
                                                            )}
                                                            <AnimatePresence>
                                                                {selectedTests.map((test) => (
                                                                    <motion.div
                                                                        key={test.id}
                                                                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                                                        className="flex items-center gap-2 pl-3 pr-2 py-1.5 bg-white border border-purple-200 rounded-lg shadow-sm"
                                                                    >
                                                                        <span className="text-xs font-bold text-slate-700">{test.name}</span>
                                                                        <button onClick={() => removeTest(test.id)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                                                                            <X size={12} />
                                                                        </button>
                                                                    </motion.div>
                                                                ))}
                                                            </AnimatePresence>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {/* --- Lab Reports Section --- */}
                                        {selectedVisit.lab_results && selectedVisit.lab_results.length > 0 && (
                                            <div className="mb-6">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                                                        <FlaskConical size={20} />
                                                    </div>
                                                    <h3 className="text-lg font-bold text-slate-800">Lab Reports</h3>
                                                </div>
                                                <div className="grid grid-cols-1 gap-4">
                                                    {selectedVisit.lab_results.map((report, idx) => (
                                                        <div key={idx} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                                                                <div>
                                                                    <p className="font-bold text-slate-900 text-sm">{report.test_name}</p>
                                                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Technician: {report.technician}</p>
                                                                </div>
                                                                <span className="text-xs font-mono text-slate-400">{new Date(report.date).toLocaleDateString()}</span>
                                                            </div>
                                                            <div className="p-4">
                                                                {Array.isArray(report.results) ? (
                                                                    <table className="w-full text-sm text-left">
                                                                        <thead className="text-[10px] text-slate-400 uppercase font-bold bg-slate-50/50">
                                                                            <tr>
                                                                                <th className="px-3 py-2">Parameter</th>
                                                                                <th className="px-3 py-2">Result</th>
                                                                                <th className="px-3 py-2">Unit</th>
                                                                                <th className="px-3 py-2">Ref. Range</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-100">
                                                                            {report.results.map((res, rIdx) => (
                                                                                <tr key={rIdx}>
                                                                                    <td className="px-3 py-2 font-medium text-slate-700">{res.name}</td>
                                                                                    <td className="px-3 py-2 font-bold text-slate-900">{res.value}</td>
                                                                                    <td className="px-3 py-2 text-slate-500">{res.unit}</td>
                                                                                    <td className="px-3 py-2 text-slate-400 text-xs">{res.normal}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                ) : (
                                                                    <pre className="text-xs font-mono text-slate-700 bg-slate-50 p-3 rounded-lg overflow-auto">
                                                                        {JSON.stringify(report.results, null, 2)}
                                                                    </pre>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Prescription Pad */}
                                        <div className="bg-slate-50/50 rounded-[24px] border border-slate-100 p-6 relative group focus-within:ring-4 focus-within:ring-blue-500/5 transition-all">
                                            <div className="flex justify-between items-center mb-4">
                                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                                    <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-600"><Pill size={16} /></div>
                                                    Prescription Pad
                                                </label>

                                                {/* Medicine Search */}
                                                <div className="relative w-64 z-20">
                                                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                                                    <input
                                                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all shadow-sm"
                                                        placeholder="Search medicine..."
                                                        value={medSearch}
                                                        onChange={(e) => searchMedicines(e.target.value)}
                                                    />
                                                    <AnimatePresence>
                                                        {medResults.length > 0 && (
                                                            <motion.div
                                                                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                                                className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-50"
                                                            >
                                                                {medResults.map(med => (
                                                                    <div
                                                                        key={med.id}
                                                                        onClick={() => addMedicine(med)}
                                                                        className="px-4 py-3 hover:bg-emerald-50 cursor-pointer flex justify-between items-center group"
                                                                    >
                                                                        <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-700">{med.name}</span>
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md mb-1">Stock: {med.qty_available} Tabs</span>
                                                                            <span className="text-[10px] font-black text-emerald-600">₹{(med.mrp / (med.tablets_per_strip || 1)).toFixed(2)}/Tab</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>

                                            {/* Medicine List */}
                                            <div className="space-y-3 min-h-[100px]">
                                                {selectedMeds.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-8 text-slate-300 border-2 border-dashed border-slate-200 rounded-xl">
                                                        <Plus size={24} />
                                                        <span className="text-xs font-bold mt-2">Add medicines from search</span>
                                                    </div>
                                                ) : (
                                                    <AnimatePresence>
                                                        {selectedMeds.map((med, idx) => {
                                                            const prescribedQty = parseInt(med.count) || 0;
                                                            const availableStock = med.stock || 0;
                                                            const isInsufficient = prescribedQty > availableStock;
                                                            const isLowStock = availableStock > 0 && availableStock < 10;

                                                            return (
                                                                <motion.div
                                                                    key={med.name}
                                                                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                                                                    className={`bg-white p-4 rounded-xl border-2 shadow-sm flex flex-col gap-3 ${isInsufficient ? 'border-red-300 bg-red-50/30' : 'border-slate-200'
                                                                        }`}
                                                                >
                                                                    <div className="flex items-center justify-between w-full">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isInsufficient ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-600'
                                                                                }`}>
                                                                                {idx + 1}
                                                                            </div>
                                                                            <div>
                                                                                <span className="font-bold text-slate-800 text-sm">{med.name}</span>
                                                                                <div className="flex items-center gap-2 mt-1">
                                                                                    {isInsufficient ? (
                                                                                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded-md flex items-center gap-1">
                                                                                            <AlertCircle size={12} />
                                                                                            Only {availableStock} tablets in stock
                                                                                        </span>
                                                                                    ) : isLowStock ? (
                                                                                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-md">
                                                                                            Low Stock: {availableStock} Tabs
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md">
                                                                                            Stock: {availableStock} Tabs
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        {med.mrp && (
                                                                            <div className="flex flex-col items-end mr-4">
                                                                                <span className="text-[10px] font-bold text-slate-400">Rate: ₹{(med.mrp / (med.tps || 1)).toFixed(2)}/Tab</span>
                                                                                <span className="text-xs font-black text-slate-900">Est: ₹{(((med.mrp / (med.tps || 1)) * prescribedQty) || 0).toFixed(2)}</span>
                                                                            </div>
                                                                        )}
                                                                        <button
                                                                            onClick={() => removeMedicine(med.name)}
                                                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    </div>

                                                                    {/* Smart Inputs */}
                                                                    <div className="flex items-center gap-2 w-full">
                                                                        <div className="relative group flex-1">
                                                                            <label className="absolute -top-2 left-2 px-1 bg-white text-[9px] font-bold text-slate-400 uppercase">Dosage</label>
                                                                            <input
                                                                                value={med.dosage}
                                                                                onChange={(e) => updateMedField(med.name, 'dosage', e.target.value)}
                                                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center focus:border-blue-500 outline-none"
                                                                            />
                                                                        </div>
                                                                        <div className="relative group flex-1">
                                                                            <label className="absolute -top-2 left-2 px-1 bg-white text-[9px] font-bold text-slate-400 uppercase">Duration</label>
                                                                            <input
                                                                                value={med.duration}
                                                                                onChange={(e) => updateMedField(med.name, 'duration', e.target.value)}
                                                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center focus:border-blue-500 outline-none"
                                                                            />
                                                                        </div>
                                                                        <div className="relative group flex-1">
                                                                            <label className="absolute -top-2 left-2 px-1 bg-white text-[9px] font-bold text-slate-400 uppercase">Qty</label>
                                                                            <input
                                                                                value={med.count}
                                                                                onChange={(e) => updateMedField(med.name, 'count', e.target.value)}
                                                                                className={`w-full px-3 py-2 bg-slate-50 border-2 rounded-lg text-xs font-bold text-center outline-none transition-all ${isInsufficient
                                                                                    ? 'border-red-400 focus:border-red-500 text-red-700'
                                                                                    : 'border-slate-200 focus:border-blue-500'
                                                                                    }`}
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    {/* Insufficient Stock Warning */}
                                                                    {isInsufficient && (
                                                                        <div className="flex items-start gap-2 p-3 bg-red-100 border border-red-200 rounded-lg">
                                                                            <AlertCircle size={14} className="text-red-600 mt-0.5 flex-shrink-0" />
                                                                            <p className="text-[11px] font-bold text-red-800 leading-relaxed">
                                                                                Insufficient stock! Only <span className="font-extrabold">{availableStock}</span> tablets available.
                                                                                Please reduce quantity or choose an alternative medicine.
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                </motion.div>
                                                            );
                                                        })}
                                                    </AnimatePresence>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Sidebar: History & Info (1/3) */}
                                    <div className="col-span-1 border-l border-slate-100 pl-8">
                                        <div className="sticky top-0 space-y-8">

                                            {/* Vital Stats (Mockup/Placeholder) */}
                                            <div className="space-y-4">
                                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                                    <Activity size={16} className="text-rose-500" /> Vitals Today
                                                </label>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase">BP</p>
                                                        <p className="text-lg font-bold text-slate-900">{selectedVisit.vitals?.bp || '--/--'}</p>
                                                    </div>
                                                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Temp</p>
                                                        <p className="text-lg font-bold text-slate-900">{selectedVisit.vitals?.temp ? `${selectedVisit.vitals.temp}°F` : '--°F'}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Patient History Timeline */}
                                            <div>
                                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-4">
                                                    <History size={16} className="text-purple-500" /> History Timeline
                                                </label>
                                                <div className="space-y-0 relative">
                                                    {/* Vertical Line */}
                                                    <div className="absolute left-2.5 top-2 bottom-0 w-0.5 bg-slate-100" />

                                                    {historyLoading ? (
                                                        <div className="pl-8 text-xs text-slate-400">Loading history...</div>
                                                    ) : patientHistory.length === 0 ? (
                                                        <div className="pl-8 text-xs text-slate-400 italic">No previous records.</div>
                                                    ) : (
                                                        patientHistory.map((h, i) => (
                                                            <div key={i} className="relative pl-8 pb-6 group cursor-pointer" onClick={() => setViewingHistory(h)}>
                                                                <div className="absolute left-0 top-1 w-5 h-5 bg-white border-2 border-slate-200 rounded-full group-hover:border-blue-500 transition-colors z-10" />
                                                                <p className="text-xs font-bold text-slate-400 mb-1">{new Date(h.created_at).toLocaleDateString()}</p>
                                                                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm group-hover:shadow-md transition-all group-hover:border-blue-200">
                                                                    <p className="text-xs font-bold text-slate-800 line-clamp-2">{h.diagnosis}</p>
                                                                    {h.prescription && (
                                                                        <div className="mt-2 flex gap-1 flex-wrap">
                                                                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">
                                                                                {Object.keys(h.prescription).length} Meds
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        // Empty State
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <div className="p-4 bg-white rounded-full shadow-sm">
                                    <Stethoscope size={48} className="text-blue-200" />
                                </div>
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 mb-2">Ready for Consultation</h2>
                            <p className="text-slate-500 max-w-md mx-auto">
                                Select a patient from the waiting list to view their details, check vitals, and prescribe medication.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* History Modal */}
            <AnimatePresence>
                {viewingHistory && (
                    <HistoryModal history={viewingHistory} onClose={() => setViewingHistory(null)} />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Doctor;