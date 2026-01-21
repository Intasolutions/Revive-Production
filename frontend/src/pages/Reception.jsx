import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    UserPlus, Phone, User as UserIcon, ArrowRight, X,
    Activity, Thermometer, Heart, Scale, Stethoscope,
    MapPin, ChevronRight, Search, CheckCircle2, AlertCircle, FileText, IndianRupee
} from 'lucide-react';
import { useSearch } from '../context/SearchContext';
import Pagination from '../components/Pagination';
import api from '../api/axios';
import Billing from './Billing'; // Integrated Billing Module
import { socket } from '../socket';

// --- Sub-Component: Skeleton Loader (Premium Loading State) ---
const TableSkeleton = () => (
    <div className="animate-pulse space-y-4 p-6">
        {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center space-x-4">
                <div className="h-12 w-12 rounded-xl bg-slate-200" />
                <div className="space-y-2 flex-1">
                    <div className="h-4 w-1/4 rounded bg-slate-200" />
                    <div className="h-3 w-1/3 rounded bg-slate-100" />
                </div>
                <div className="h-8 w-24 rounded-lg bg-slate-100" />
            </div>
        ))}
    </div>
);

// --- Sub-Component: Toast Notification (Replaces Alert) ---
const Toast = ({ message, type, onClose }) => (
    <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
        className={`fixed bottom-6 right-6 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl z-[120] border ${type === 'success' ? 'bg-white border-green-100' : 'bg-white border-red-100'
            }`}
    >
        <div className={`p-2 rounded-full ${type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            {type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
        </div>
        <div>
            <h4 className={`text-sm font-bold ${type === 'success' ? 'text-green-900' : 'text-red-900'}`}>
                {type === 'success' ? 'Success' : 'Error'}
            </h4>
            <p className="text-xs text-slate-500 font-medium">{message}</p>
        </div>
        <button onClick={onClose} className="ml-4 text-slate-400 hover:text-slate-600">
            <X size={16} />
        </button>
    </motion.div>
);

const Reception = () => {
    // --- State Management ---
    const navigate = useNavigate();
    const [patientsData, setPatientsData] = useState({ results: [], count: 0 });
    const { globalSearch } = useSearch();
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [activeTab, setActiveTab] = useState('front-desk'); // 'front-desk' | 'billing'

    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [showVisitModal, setShowVisitModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Data Selection
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patientHistory, setPatientHistory] = useState([]);
    const [patientInvoices, setPatientInvoices] = useState([]); // New state for invoices
    const [historyTab, setHistoryTab] = useState('visits'); // 'visits' | 'billing'
    const [doctors, setDoctors] = useState([]);

    // Feedback State
    const [notification, setNotification] = useState(null); // { type: 'success'|'error', message: '' }

    // Registration Form
    const [form, setForm] = useState({ full_name: '', age: '', gender: 'M', phone: '', address: '' });
    const [errors, setErrors] = useState({});

    // Visit Form
    const [visitForm, setVisitForm] = useState({
        assigned_role: 'DOCTOR',
        doctor: '',
        vitals: { temp: '', bp: '', pulse: '', weight: '' }
    });

    // Dashboard Stats
    const [stats, setStats] = useState({
        newPatients: 0,
        activeVisits: 0,
        todayRevenue: 0,
        recentVisits: []
    });
    const [statsLoading, setStatsLoading] = useState(true);


    // --- Helper: Show Notification ---
    const showToast = (type, message) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 4000); // Auto hide after 4s
    };

    // --- Effects ---
    useEffect(() => {
        fetchPatients(true);
        fetchStats();
    }, [page, globalSearch]);

    // Add 4-second automatic refresh
    useEffect(() => {
        const interval = setInterval(() => {
            fetchPatients(false); // Background refresh without skeleton
            fetchStats();
        }, 4000);

        return () => clearInterval(interval);
    }, [page, globalSearch]);

    useEffect(() => {
        fetchStats();

        const onVisitUpdate = () => {
            fetchStats();
        };

        socket.on('visit_update', onVisitUpdate);

        return () => {
            socket.off('visit_update', onVisitUpdate);
        };
    }, []);

    // --- API Functions ---
    const fetchPatients = async (showSkeleton = true) => {
        if (showSkeleton) setLoading(true);
        try {
            const { data } = await api.get(`/reception/patients/?page=${page}${globalSearch ? `&search=${encodeURIComponent(globalSearch)}` : ''}`);
            setPatientsData(data);
        } catch (err) {
            console.error(err);
            showToast('error', 'Failed to load patients list.');
        } finally {
            if (showSkeleton) {
                // Artificial delay to show off the skeleton loader (Optional: remove in production)
                setTimeout(() => setLoading(false), 500);
            }
        }
    };

    const fetchStats = async () => {
        setStatsLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];

            // Fetch stats from various endpoints
            const [patientsRes, visitsRes, invoicesRes] = await Promise.all([
                api.get(`/reception/patients/?created_at__date=${today}`),
                api.get(`/reception/visits/?status__in=OPEN,IN_PROGRESS`),
                api.get(`/billing/invoices/?created_at__date=${today}`)
            ]);

            const newPatients = patientsRes.data.count || patientsRes.data.results?.length || 0;
            const activeVisits = visitsRes.data.count || visitsRes.data.results?.length || 0;
            const todayRevenue = invoicesRes.data.results?.filter(inv => inv.payment_status === 'PAID')
                .reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0) || 0;

            // Get recent visits
            const recentVisitsRes = await api.get(`/reception/visits/?ordering=-created_at&limit=5`);

            setStats({
                newPatients,
                activeVisits,
                todayRevenue,
                recentVisits: recentVisitsRes.data.results || recentVisitsRes.data || []
            });
        } catch (err) {
            console.error('Error fetching stats:', err);
        } finally {
            setStatsLoading(false);
        }
    };

    const fetchDoctors = async () => {
        try {
            const { data } = await api.get('/users/management/doctors/');
            setDoctors(data);
        } catch (err) {
            console.error(err);
            showToast('error', 'Could not fetch doctors list.');
        }
    };

    const fetchHistory = async (patientId) => {
        try {
            const [visitsRes, invoicesRes] = await Promise.all([
                api.get(`/reception/visits/?patient=${patientId}`),
                api.get(`/billing/invoices/?visit__patient=${patientId}`)
            ]);

            setPatientHistory(visitsRes.data.results || visitsRes.data);
            setPatientInvoices(invoicesRes.data.results || invoicesRes.data); // Store invoices

            setShowHistoryModal(true);
            setHistoryTab('visits'); // Reset to visits tab
        } catch (err) {
            console.error(err);
            showToast('error', 'Could not fetch patient history.');
        }
    };

    const validateForm = () => {
        let newErrors = {};
        if (!form.full_name.trim()) newErrors.full_name = "Full Name is mandatory.";
        if (!form.age || isNaN(form.age) || Number(form.age) <= 0) newErrors.age = "Please enter a valid age.";
        if (!form.phone.trim()) newErrors.phone = "Phone Number is mandatory.";
        else if (!/^\d{10}$/.test(form.phone)) newErrors.phone = "Phone number must be exactly 10 digits.";
        if (!form.address.trim()) newErrors.address = "Residential address is mandatory.";

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            showToast('error', 'Please fix the errors highlighted in the form.');
            return;
        }

        try {
            const response = await api.post('/reception/patients/register/', form);

            // Backend returns 200 OK if patient exists, 201 CREATED if new
            if (response.status === 200) {
                showToast('error', 'The patient is already there with this number');
                return;
            }

            setShowAddModal(false);
            setPage(1);
            fetchPatients();
            setForm({ full_name: '', age: '', gender: 'M', phone: '', address: '' });
            setErrors({});
            showToast('success', 'New patient registered successfully!');
        } catch (err) {
            console.error(err);
            showToast('error', 'Registration failed. Please check network connection.');
        }
    };

    const handleNewVisit = async (p) => {
        setSelectedPatient(p);
        await fetchDoctors();
        setShowVisitModal(true);
    };

    const handleApproveCasualty = async (e, p) => {
        e.stopPropagation(); // Prevent row click
        try {
            await api.post('/reception/visits/', {
                patient: p.p_id,
                assigned_role: 'CASUALTY',
                status: 'OPEN'
            });
            showToast('success', `Sent ${p.full_name} to Casualty`);
            navigate('/casualty');
        } catch (err) {
            showToast('error', 'Failed to assign to Casualty.');
        }
    };

    const submitVisit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/reception/visits/', {
                patient: selectedPatient.p_id,
                doctor: visitForm.assigned_role === 'DOCTOR' ? visitForm.doctor : null,
                assigned_role: visitForm.assigned_role,
                status: 'OPEN',
                vitals: visitForm.vitals
            });
            setShowVisitModal(false);
            setVisitForm({ assigned_role: 'DOCTOR', doctor: '', vitals: { temp: '', bp: '', pulse: '', weight: '' } });
            showToast('success', `Visit token generated for ${selectedPatient.full_name}`);
        } catch (err) {
            showToast('error', 'Failed to create visit record.');
        }
    };

    const totalPages = Math.ceil((patientsData.count || 0) / 10);

    return (
        <div className="bg-slate-50 h-full flex flex-col overflow-hidden relative">

            {/* --- Toast Notification --- */}
            <AnimatePresence>
                {notification && (
                    <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />
                )}
            </AnimatePresence>

            {/* --- Tab Navigation Header --- */}
            <div className="bg-white border-b border-slate-200 px-8 py-0 flex items-center justify-between flex-shrink-0 h-16 z-20 shadow-sm">
                <div className="flex items-center gap-8 h-full">
                    <button
                        onClick={() => setActiveTab('front-desk')}
                        className={`h-full flex items-center gap-2 border-b-2 text-sm font-bold tracking-wide transition-all ${activeTab === 'front-desk'
                            ? 'border-blue-600 text-blue-700'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                            }`}
                    >
                        <UserPlus size={18} />
                        FRONT DESK
                    </button>
                    <button
                        onClick={() => setActiveTab('billing')}
                        className={`h-full flex items-center gap-2 border-b-2 text-sm font-bold tracking-wide transition-all ${activeTab === 'billing'
                            ? 'border-indigo-600 text-indigo-700'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                            }`}
                    >
                        <Activity size={18} />
                        BILLING & INVOICES
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    <div className="h-4 w-px bg-slate-200"></div>
                    <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-200 shadow-sm">
                        R
                    </div>
                </div>
            </div>

            {/* --- Main Content Area --- */}
            <div className="flex-1 overflow-hidden relative bg-slate-50/50">

                {activeTab === 'billing' ? (
                    /* --- BILLING TAB --- */
                    <div className="h-full overflow-y-auto custom-scrollbar p-6">
                        <Billing />
                    </div>
                ) : (
                    /* --- FRONT DESK TAB (Original Reception Content) --- */
                    <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-8">

                        {/* --- Dashboard Stats Section --- */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            {/* New Patients */}
                            <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-blue-50 rounded-xl">
                                        <UserPlus className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today</span>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-bold text-slate-900 mb-1">
                                        {statsLoading ? '...' : stats.newPatients}
                                    </h3>
                                    <p className="text-sm font-semibold text-slate-500">New Patients</p>
                                </div>
                            </div>

                            {/* Active Visits */}
                            <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-orange-50 rounded-xl">
                                        <Activity className="w-6 h-6 text-orange-600" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active</span>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-bold text-slate-900 mb-1">
                                        {statsLoading ? '...' : stats.activeVisits}
                                    </h3>
                                    <p className="text-sm font-semibold text-slate-500">Active Visits</p>
                                </div>
                            </div>

                            {/* Today's Revenue */}
                            <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-green-50 rounded-xl">
                                        <IndianRupee className="w-6 h-6 text-green-600" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today</span>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-bold text-slate-900 mb-1">
                                        {statsLoading ? '...' : `₹${stats.todayRevenue.toLocaleString()}`}
                                    </h3>
                                    <p className="text-sm font-semibold text-slate-500">Today's Revenue</p>
                                </div>
                            </div>

                            {/* Recent Visits */}
                            <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-purple-50 rounded-xl">
                                        <FileText className="w-6 h-6 text-purple-600" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Latest</span>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-bold text-slate-900 mb-1">
                                        {statsLoading ? '...' : stats.recentVisits.length}
                                    </h3>
                                    <p className="text-sm font-semibold text-slate-500">Recent Visits</p>
                                </div>
                            </div>
                        </div>

                        {/* Header Section */}
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight text-slate-950">Patient Management</h1>
                                <p className="text-slate-500 font-medium mt-1">Register new patients and manage daily visits.</p>
                            </div>
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="group flex items-center gap-3 px-6 py-3.5 bg-slate-950 text-white rounded-2xl font-bold shadow-xl shadow-slate-900/20 hover:bg-blue-600 hover:shadow-blue-600/20 transition-all active:scale-[0.98]"
                            >
                                <div className="p-1 rounded-lg bg-white/20 group-hover:bg-white/30 transition-colors">
                                    <UserPlus size={18} />
                                </div>
                                <span>Register New Patient</span>
                            </button>
                        </div>

                        {/* Main Data Card */}
                        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in duration-700">
                            {loading ? (
                                <TableSkeleton />
                            ) : (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] uppercase tracking-widest font-bold text-slate-400">
                                                    <th className="px-8 py-6">Patient Identity</th>
                                                    <th className="px-6 py-6 text-center">History</th>
                                                    <th className="px-6 py-6">Contact Info</th>
                                                    <th className="px-6 py-6 text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {patientsData.results && patientsData.results.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="4" className="py-24 text-center">
                                                            <div className="flex flex-col items-center justify-center opacity-50">
                                                                <div className="p-4 bg-slate-50 rounded-full mb-3">
                                                                    <Search size={32} className="text-slate-400" />
                                                                </div>
                                                                <p className="font-bold text-slate-900">No patients found</p>
                                                                <p className="text-sm text-slate-500">Try adjusting your search filters</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    patientsData.results.map((p) => (
                                                        <tr key={p.p_id} onClick={() => { setSelectedPatient(p); fetchHistory(p.p_id); }} className="group hover:bg-blue-50/30 transition-colors cursor-pointer">
                                                            <td className="px-8 py-5">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="relative">
                                                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/20">
                                                                            {p.full_name.charAt(0)}
                                                                        </div>
                                                                        <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full">
                                                                            <div className="w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-bold text-slate-900 text-[15px]">{p.full_name}</p>
                                                                        <p className="text-xs font-bold text-slate-400 font-mono tracking-wide">ID: {p.p_id.slice(0, 8)}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5 text-center">
                                                                <div className="inline-flex flex-col items-center justify-center bg-slate-100 px-4 py-2 rounded-xl">
                                                                    <span className="text-xl font-bold text-slate-900">{p.total_visits || 0}</span>
                                                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Visits</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5">
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                                                        <Phone size={14} className="text-slate-400" />
                                                                        {p.phone}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-xs text-slate-400 truncate max-w-[200px]">
                                                                        <MapPin size={12} />
                                                                        {p.address}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5 text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <button
                                                                        onClick={(e) => handleApproveCasualty(e, p)}
                                                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100 text-xs font-bold hover:bg-red-600 hover:text-white transition-all shadow-sm active:scale-95"
                                                                    >
                                                                        Approve to Casualty
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                                        <Pagination
                                            current={page}
                                            total={totalPages}
                                            onPageChange={setPage}
                                            loading={loading}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* --- MODAL: Patient Registration --- */}
                        <AnimatePresence>
                            {showAddModal && (
                                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md transition-all"
                                        onClick={() => setShowAddModal(false)}
                                    />
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                        transition={{ type: "spring", duration: 0.5 }}
                                        className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden ring-1 ring-white/20"
                                    >
                                        <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-start bg-slate-50/30">
                                            <div>
                                                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">New Patient Registration</h3>
                                                <p className="text-slate-500 text-sm mt-1">Please enter the patient's details below.</p>
                                            </div>
                                            <button onClick={() => setShowAddModal(false)} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                                                <X size={24} />
                                            </button>
                                        </div>
                                        <div className="p-10 space-y-6">
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Full Name</label>
                                                    <div className={`flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border-2 transition-all ${errors.full_name ? 'border-rose-200 bg-rose-50' : 'border-slate-100 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10'}`}>
                                                        <UserIcon className={errors.full_name ? "text-rose-400" : "text-slate-400"} size={20} />
                                                        <input
                                                            type="text"
                                                            placeholder="e.g. John Doe"
                                                            className="flex-1 bg-transparent font-semibold text-slate-900 placeholder:text-slate-400 outline-none"
                                                            value={form.full_name}
                                                            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                                        />
                                                    </div>
                                                    {errors.full_name && <p className="text-xs font-bold text-rose-500 mt-2 ml-2 flex items-center gap-1"><AlertCircle size={12} /> {errors.full_name}</p>}
                                                </div>

                                                <div className="grid grid-cols-2 gap-6">
                                                    <div>
                                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Age</label>
                                                        <div className={`flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border-2 transition-all ${errors.age ? 'border-rose-200 bg-rose-50' : 'border-slate-100 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10'}`}>
                                                            <Activity className={errors.age ? "text-rose-400" : "text-slate-400"} size={20} />
                                                            <input
                                                                type="number"
                                                                placeholder="25"
                                                                className="flex-1 bg-transparent font-semibold text-slate-900 placeholder:text-slate-400 outline-none"
                                                                value={form.age}
                                                                onChange={(e) => setForm({ ...form, age: e.target.value })}
                                                            />
                                                        </div>
                                                        {errors.age && <p className="text-xs font-bold text-rose-500 mt-2 ml-2 flex items-center gap-1"><AlertCircle size={12} /> {errors.age}</p>}
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Gender</label>
                                                        <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                                                            {['M', 'F'].map((g) => (
                                                                <button
                                                                    key={g}
                                                                    onClick={() => setForm({ ...form, gender: g })}
                                                                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${form.gender === g ? 'bg-white text-slate-900 shadow-md transform scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}
                                                                >
                                                                    {g === 'M' ? 'Male' : 'Female'}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Contact Number</label>
                                                    <div className={`flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border-2 transition-all ${errors.phone ? 'border-rose-200 bg-rose-50' : 'border-slate-100 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10'}`}>
                                                        <Phone className={errors.phone ? "text-rose-400" : "text-slate-400"} size={20} />
                                                        <input
                                                            type="text"
                                                            placeholder="9876543210"
                                                            maxLength={10}
                                                            className="flex-1 bg-transparent font-semibold text-slate-900 placeholder:text-slate-400 outline-none"
                                                            value={form.phone}
                                                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                                        />
                                                    </div>
                                                    {errors.phone && <p className="text-xs font-bold text-rose-500 mt-2 ml-2 flex items-center gap-1"><AlertCircle size={12} /> {errors.phone}</p>}
                                                </div>

                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Address</label>
                                                    <div className={`flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border-2 transition-all ${errors.address ? 'border-rose-200 bg-rose-50' : 'border-slate-100 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10'}`}>
                                                        <MapPin className={`mt-1 ${errors.address ? "text-rose-400" : "text-slate-400"}`} size={20} />
                                                        <textarea
                                                            rows="3"
                                                            placeholder="Enter full residential address..."
                                                            className="flex-1 bg-transparent font-semibold text-slate-900 placeholder:text-slate-400 outline-none resize-none"
                                                            value={form.address}
                                                            onChange={(e) => setForm({ ...form, address: e.target.value })}
                                                        />
                                                    </div>
                                                    {errors.address && <p className="text-xs font-bold text-rose-500 mt-2 ml-2 flex items-center gap-1"><AlertCircle size={12} /> {errors.address}</p>}
                                                </div>
                                            </div>
                                            <button
                                                onClick={handleRegister}
                                                className="w-full py-5 bg-slate-950 text-white rounded-2xl font-bold text-lg shadow-xl shadow-slate-900/20 hover:bg-blue-600 hover:shadow-blue-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                                            >
                                                <span>Complete Registration</span>
                                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                                    <CheckCircle2 size={16} />
                                                </div>
                                            </button>
                                        </div>
                                    </motion.div>
                                </div>
                            )}
                        </AnimatePresence>

                        {/* --- MODAL: Create Visit --- */}
                        <AnimatePresence>
                            {showVisitModal && selectedPatient && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                                    <motion.div
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                                        onClick={() => setShowVisitModal(false)}
                                    />
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                        className="relative bg-white w-full max-w-4xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col md:flex-row"
                                    >
                                        {/* Left: Vitals */}
                                        <div className="md:w-1/2 p-8 border-r border-slate-100 bg-slate-50/50">
                                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-6">
                                                <Activity className="text-blue-600" size={20} />
                                                Initial Triage
                                            </h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                {/* Temp */}
                                                <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                                                    <div className="flex justify-between mb-2">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Temp</label>
                                                        <Thermometer size={16} className="text-rose-400" />
                                                    </div>
                                                    <div className="flex items-baseline gap-1">
                                                        <input
                                                            type="text" placeholder="98.6"
                                                            className="w-full text-2xl font-bold text-slate-900 outline-none placeholder:text-slate-200"
                                                            value={visitForm.vitals.temp}
                                                            onChange={e => setVisitForm({ ...visitForm, vitals: { ...visitForm.vitals, temp: e.target.value } })}
                                                        />
                                                        <span className="text-xs font-bold text-slate-400">°F</span>
                                                    </div>
                                                </div>
                                                {/* BP */}
                                                <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                                                    <div className="flex justify-between mb-2">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">BP</label>
                                                        <Heart size={16} className="text-red-500" />
                                                    </div>
                                                    <div className="flex items-baseline gap-1">
                                                        <input
                                                            type="text" placeholder="120/80"
                                                            className="w-full text-2xl font-bold text-slate-900 outline-none placeholder:text-slate-200"
                                                            value={visitForm.vitals.bp}
                                                            onChange={e => setVisitForm({ ...visitForm, vitals: { ...visitForm.vitals, bp: e.target.value } })}
                                                        />
                                                        <span className="text-xs font-bold text-slate-400">mm</span>
                                                    </div>
                                                </div>
                                                {/* Pulse */}
                                                <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                                                    <div className="flex justify-between mb-2">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Pulse</label>
                                                        <Activity size={16} className="text-emerald-500" />
                                                    </div>
                                                    <div className="flex items-baseline gap-1">
                                                        <input
                                                            type="text" placeholder="72"
                                                            className="w-full text-2xl font-bold text-slate-900 outline-none placeholder:text-slate-200"
                                                            value={visitForm.vitals.pulse}
                                                            onChange={e => setVisitForm({ ...visitForm, vitals: { ...visitForm.vitals, pulse: e.target.value } })}
                                                        />
                                                        <span className="text-xs font-bold text-slate-400">bpm</span>
                                                    </div>
                                                </div>
                                                {/* Weight */}
                                                <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                                                    <div className="flex justify-between mb-2">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Weight</label>
                                                        <Scale size={16} className="text-blue-500" />
                                                    </div>
                                                    <div className="flex items-baseline gap-1">
                                                        <input
                                                            type="text" placeholder="70"
                                                            className="w-full text-2xl font-bold text-slate-900 outline-none placeholder:text-slate-200"
                                                            value={visitForm.vitals.weight}
                                                            onChange={e => setVisitForm({ ...visitForm, vitals: { ...visitForm.vitals, weight: e.target.value } })}
                                                        />
                                                        <span className="text-xs font-bold text-slate-400">kg</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Department & Doctor Selection */}
                                        <div className="md:w-1/2 p-8 flex flex-col">
                                            <div className="flex justify-between items-center mb-6">
                                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                    <Stethoscope className="text-slate-900" size={20} />
                                                    Assign To
                                                </h3>
                                                <button onClick={() => setShowVisitModal(false)} className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-red-500 transition-colors">
                                                    <X size={24} />
                                                </button>
                                            </div>

                                            {/* Department Selection */}
                                            <div className="mb-4">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Department / Role</label>
                                                <select
                                                    value={visitForm.assigned_role}
                                                    onChange={(e) => setVisitForm({ ...visitForm, assigned_role: e.target.value })}
                                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 transition-all"
                                                >
                                                    <option value="DOCTOR">Doctor (Consultation)</option>
                                                    <option value="LAB">Laboratory</option>
                                                    <option value="CASUALTY">Casualty / Emergency</option>
                                                </select>
                                            </div>

                                            {visitForm.assigned_role === 'DOCTOR' ? (
                                                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Select Doctor</label>
                                                    {doctors.length === 0 ? (
                                                        <p className="text-sm text-slate-400 text-center py-4">No doctors available.</p>
                                                    ) : doctors.map(doc => (
                                                        <div
                                                            key={doc.u_id}
                                                            onClick={() => setVisitForm({ ...visitForm, doctor: doc.u_id })}
                                                            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 group ${visitForm.doctor === doc.u_id
                                                                ? 'border-blue-600 bg-blue-50 shadow-md'
                                                                : 'border-slate-100 hover:border-blue-200 hover:bg-slate-50'
                                                                }`}
                                                        >
                                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${visitForm.doctor === doc.u_id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:text-blue-500'
                                                                }`}>
                                                                <UserIcon size={20} />
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className={`font-bold text-sm ${visitForm.doctor === doc.u_id ? 'text-blue-900' : 'text-slate-900'}`}>
                                                                    Dr. {doc.username}
                                                                </p>
                                                                <p className="text-xs text-slate-400 font-medium">Available Now</p>
                                                            </div>
                                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${visitForm.doctor === doc.u_id ? 'border-blue-600' : 'border-slate-300'
                                                                }`}>
                                                                {visitForm.doctor === doc.u_id && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm">
                                                        {visitForm.assigned_role === 'LAB' && <Activity className="text-blue-500" size={32} />}
                                                        {visitForm.assigned_role === 'CASUALTY' && <AlertCircle className="text-red-500" size={32} />}
                                                    </div>
                                                    <h4 className="font-bold text-slate-900">
                                                        Assign to {visitForm.assigned_role === 'LAB' ? 'Laboratory' : 'Casualty'}
                                                    </h4>
                                                    <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
                                                        Patient will be added to the {visitForm.assigned_role.toLowerCase()} queue directly.
                                                    </p>
                                                </div>
                                            )}

                                            <button
                                                onClick={submitVisit}
                                                disabled={visitForm.assigned_role === 'DOCTOR' && !visitForm.doctor}
                                                className="mt-6 w-full py-4 bg-slate-950 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-xl shadow-slate-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                                            >
                                                <span>Generate Token</span>
                                                <ArrowRight size={18} />
                                            </button>
                                        </div>
                                    </motion.div>
                                </div>
                            )}
                        </AnimatePresence>

                        {/* --- MODAL: Patient History --- */}
                        <AnimatePresence>
                            {showHistoryModal && (
                                <div className="fixed inset-0 z-[110] flex items-center justify-end">
                                    <motion.div
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
                                        onClick={() => setShowHistoryModal(false)}
                                    />
                                    <motion.div
                                        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                                        transition={{ type: 'spring', damping: 30 }}
                                        className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col"
                                    >
                                        <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                            <div>
                                                <h3 className="font-bold text-lg text-slate-900">Patient History</h3>
                                                <p className="text-sm text-slate-500">{selectedPatient?.full_name}</p>
                                            </div>
                                            <button onClick={() => setShowHistoryModal(false)}><X className="text-slate-400" /></button>
                                        </div>

                                        {/* Tabs for History */}
                                        <div className="flex border-b border-slate-100">
                                            <button
                                                className={`flex-1 py-3 text-sm font-bold transition-all ${historyTab === 'visits'
                                                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                                                    : 'text-slate-500 hover:text-slate-700'}`}
                                                onClick={() => setHistoryTab('visits')}
                                            >
                                                Visits
                                            </button>
                                            <button
                                                className={`flex-1 py-3 text-sm font-bold transition-all ${historyTab === 'billing'
                                                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                                                    : 'text-slate-500 hover:text-slate-700'}`}
                                                onClick={() => setHistoryTab('billing')}
                                            >
                                                Billing
                                            </button>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                            {historyTab === 'visits' ? (
                                                patientHistory.length === 0 ? (
                                                    <p className="text-center text-slate-400 py-10">No previous visits found.</p>
                                                ) : (
                                                    patientHistory.map((visit) => (
                                                        <div key={visit.v_id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:border-blue-200 transition-all">
                                                            <div className="flex justify-between mb-2">
                                                                <span className="text-xs font-bold text-slate-400">{new Date(visit.created_at).toLocaleDateString()}</span>
                                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${visit.status === 'CLOSED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{visit.status}</span>
                                                            </div>
                                                            <p className="font-bold text-slate-900 text-sm mb-1">{visit.assigned_role === 'DOCTOR' ? `Dr. ${visit.doctor_name || 'Unassigned'}` : visit.assigned_role}</p>
                                                            {visit.prescription && <p className="text-xs text-slate-600 mt-2 bg-white p-2 rounded border border-slate-100">💊 Prescription Available</p>}
                                                        </div>
                                                    ))
                                                )
                                            ) : (
                                                patientInvoices.length === 0 ? (
                                                    <p className="text-center text-slate-400 py-10">No invoices found for this patient.</p>
                                                ) : (
                                                    patientInvoices.map((inv) => (
                                                        <div key={inv.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:border-indigo-200 transition-all group">
                                                            <div className="flex justify-between mb-2">
                                                                <span className="text-xs font-bold text-slate-400">{new Date(inv.created_at).toLocaleDateString()}</span>
                                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${inv.payment_status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                    {inv.payment_status}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <div>
                                                                    <p className="font-bold text-slate-900 text-sm">Invoice #{inv.id.toString().slice(0, 8)}</p>
                                                                    <p className="text-xs text-slate-500">{inv.items ? inv.items.length : 0} Items</p>
                                                                </div>
                                                                <div className="flex items-center gap-3">
                                                                    <p className="text-lg font-bold text-slate-700">₹{inv.total_amount}</p>
                                                                    {inv.payment_status === 'PENDING' && (
                                                                        <button
                                                                            onClick={async () => {
                                                                                if (!window.confirm(`Mark invoice #${inv.id} as PAID?`)) return;
                                                                                try {
                                                                                    await api.patch(`billing/invoices/${inv.id}/`, { payment_status: 'PAID' });
                                                                                    showToast('success', 'Payment collected successfully!');
                                                                                    fetchHistory(selectedPatient.p_id); // Refresh history
                                                                                } catch (error) {
                                                                                    console.error(error);
                                                                                    showToast('error', 'Failed to update payment status.');
                                                                                }
                                                                            }}
                                                                            className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center gap-1"
                                                                            title="Collect Payment"
                                                                        >
                                                                            <IndianRupee size={16} /> <span className="text-xs font-bold">Collect</span>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                )
                                            )}
                                        </div>
                                    </motion.div>
                                </div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
};
export default Reception;
