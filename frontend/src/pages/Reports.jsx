import React, { useState, useEffect } from 'react';
import { 
    TrendingUp, Calendar, Download, Users, Pill, FlaskConical, 
    IndianRupee, Stethoscope, ClipboardList, Package, X, 
    AlertTriangle, Import, ArrowRight, PieChart, BarChart3
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Button, Input, Table } from '../components/UI';
import api from '../api/axios';

const Reports = () => {
    const [activeReport, setActiveReport] = useState('financial');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedNote, setSelectedNote] = useState(null);

    // --- LOGIC (Preserved 100%) ---
    const fetchReport = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/reports/${activeReport}/`, {
                params: { start_date: startDate, end_date: endDate }
            });
            setData(response.data);
        } catch (err) {
            console.error("Error fetching report:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [activeReport]);

    const handleExport = () => {
        const url = `${import.meta.env.VITE_API_URL}reports/${activeReport}/?export=csv&start_date=${startDate}&end_date=${endDate}`;
        window.open(url, '_blank');
    };

    const tabs = [
        { id: 'financial', name: 'Revenue', icon: <IndianRupee size={18} /> },
        { id: 'opd', name: 'OPD Patients', icon: <Users size={18} /> },
        { id: 'doctor', name: 'Doctor Report', icon: <Stethoscope size={18} /> },
        { id: 'pharmacy', name: 'Pharmacy Sales', icon: <Pill size={18} /> },
        { id: 'lab', name: 'Lab Tests', icon: <FlaskConical size={18} /> },
        { id: 'pharmacy-inventory', name: 'Stock Logs', icon: <Package size={18} /> },
        { id: 'expiry', name: 'Expiry', icon: <AlertTriangle size={18} /> },
        { id: 'supplier-purchase', name: 'Purchases', icon: <Import size={18} /> },
        { id: 'billing-summary', name: 'Billing', icon: <ClipboardList size={18} /> },
    ];

    const getChartData = () => {
        if (!data?.details) return [];
        const daily = {};
        data.details.forEach(item => {
            const day = new Date(item.date).toLocaleDateString(undefined, { weekday: 'short' });
            daily[day] = (daily[day] || 0) + (item.amount || item.total || 1);
        });
        return Object.keys(daily).map(day => ({ name: day, value: daily[day] }));
    };

    const chartData = getChartData();

    // --- Table Configuration ---
    const getTableConfig = () => {
        if (activeReport === 'financial') {
            return {
                headers: ['ID', 'Patient', 'Amount', 'Status', 'Date'],
                rows: (data?.details || []).map(row => [
                    row.id.substring(0, 8),
                    row.patient,
                    `₹${row.amount}`,
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black">{row.status}</span>,
                    new Date(row.date).toLocaleDateString()
                ])
            };
        }
        if (activeReport === 'opd') {
            return {
                headers: ['ID', 'Patient', 'Doctor', 'Status', 'Date'],
                rows: (data?.details || []).map(row => [
                    row.id.substring(0, 8),
                    row.patient,
                    row.doctor,
                    <span className="px-2 py-1 bg-sky-100 text-sky-700 rounded-full text-[10px] font-black">{row.status}</span>,
                    new Date(row.date).toLocaleDateString()
                ])
            };
        }
        if (activeReport === 'pharmacy') {
            return {
                headers: ['ID', 'Patient', 'Total Amount', 'Date'],
                rows: (data?.details || []).map(row => [
                    row.id.substring(0, 8),
                    row.patient,
                    `₹${row.total}`,
                    new Date(row.date).toLocaleDateString()
                ])
            };
        }
        if (activeReport === 'lab') {
            return {
                headers: ['ID', 'Patient', 'Test Name', 'Amount', 'Date'],
                rows: (data?.details || []).map(row => [
                    row.id.substring(0, 8),
                    row.patient,
                    row.test_name,
                    `₹${row.amount}`,
                    new Date(row.date).toLocaleDateString()
                ])
            };
        }
        if (activeReport === 'inventory') {
            return {
                headers: ['Log ID', 'Item', 'Transaction', 'Qty', 'Cost', 'User', 'Date'],
                rows: (data?.details || []).map(row => [
                    row.id.substring(0, 8),
                    row.item_name,
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black ${row.type === 'STOCK_IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{row.type}</span>,
                    row.qty,
                    `₹${row.cost || '0.00'}`,
                    row.performed_by || 'Unknown',
                    new Date(row.date).toLocaleDateString()
                ])
            };
        }
        if (activeReport === 'doctor') {
            return {
                headers: ['ID', 'Doctor', 'Patient', 'Diagnosis', 'Date', 'Action'],
                rows: (data?.details || []).map(row => [
                    row.id.substring(0, 8),
                    row.doctor,
                    row.patient,
                    row.diagnosis,
                    new Date(row.date).toLocaleDateString(),
                    <Button size="xs" onClick={() => setSelectedNote(row)} className="text-[10px] h-7 px-3 bg-slate-900 rounded-lg">View Case</Button>
                ])
            };
        }
        if (activeReport === 'pharmacy-inventory') {
            return {
                headers: ['ID', 'Item', 'Batch', 'Type', 'Qty', 'Rate', 'Date'],
                rows: (data?.details || []).map(row => [
                    row.id,
                    row.item_name,
                    row.batch_no,
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black ${row.type === 'STOCK_IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{row.type}</span>,
                    row.qty,
                    `₹${row.cost}`,
                    new Date(row.date).toLocaleDateString()
                ])
            };
        }
        if (activeReport === 'expiry') {
            return {
                headers: ['Item', 'Batch', 'Expiry', 'Qty Available', 'MRP'],
                rows: (data?.details || []).map(row => [
                    row.item_name,
                    row.batch_no,
                    <span className={`font-bold ${new Date(row.expiry_date) < new Date() ? 'text-red-500' : 'text-amber-500'}`}>{new Date(row.expiry_date).toLocaleDateString()}</span>,
                    row.qty,
                    `₹${row.cost}`
                ])
            };
        }
        if (activeReport === 'supplier-purchase') {
            return {
                headers: ['Invoice No', 'Supplier', 'Total', 'Type', 'Date'],
                rows: (data?.details || []).map(row => [
                    row.id,
                    row.supplier,
                    `₹${row.total}`,
                    row.type,
                    new Date(row.date).toLocaleDateString()
                ])
            };
        }
        if (activeReport === 'billing-summary') {
            return {
                headers: ['Inv ID', 'Patient', 'Dept', 'Description', 'Qty', 'Amount', 'Date'],
                rows: (data?.details || []).map(row => [
                    row.id,
                    row.patient,
                    <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-widest">{row.dept}</span>,
                    row.description,
                    row.qty,
                    `₹${row.amount}`,
                    new Date(row.date).toLocaleDateString()
                ])
            };
        }
        return { headers: ['ID', 'Details', 'Date'], rows: (data?.details || []).map(row => [row.id.substring(0, 8), row.patient || 'Internal', new Date(row.date).toLocaleDateString()]) };
    };

    const tableConfig = getTableConfig();

    return (
        <>
            {/* INJECT CUSTOM CSS TO HIDE SCROLLBARS GLOBALLY FOR THIS COMPONENT */}
            <style>
                {`
                    /* Hide scrollbar for Chrome, Safari and Opera */
                    .no-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                    /* Hide scrollbar for IE, Edge and Firefox */
                    .no-scrollbar {
                        -ms-overflow-style: none;  /* IE and Edge */
                        scrollbar-width: none;  /* Firefox */
                    }
                `}
            </style>

            <div className="p-8 h-screen bg-[#F8FAFC] font-sans text-slate-900 flex flex-col overflow-hidden">
                
                {/* --- HEADER & TABS --- */}
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8 shrink-0">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-outfit uppercase">Analytics</h1>
                        <p className="text-slate-500 mt-1 font-medium text-sm">Performance metrics and financial insights.</p>
                    </div>

                    {/* Premium Glass Tabs - Scrollable but Hidden Bar */}
                    <div className="w-full xl:w-auto overflow-x-auto no-scrollbar">
                        <div className="flex bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 shadow-sm min-w-max">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveReport(tab.id)}
                                    className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                                        activeReport === tab.id 
                                        ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20 scale-105' 
                                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                                >
                                    {tab.icon}
                                    {tab.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* --- MAIN CONTENT GRID --- */}
                <div className="flex-1 overflow-y-auto no-scrollbar space-y-8 pb-10">
                    
                    {/* Top Row: KPI + Chart */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        
                        {/* 1. KPI Card */}
                        <div className="lg:col-span-1 bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-slate-900/30 flex flex-col justify-between relative overflow-hidden group">
                            {/* Decor */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-white/10 transition-all duration-700"></div>
                            
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
                                        <TrendingUp size={24} className="text-emerald-400" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-black/20 px-3 py-1 rounded-full border border-white/5">
                                        {activeReport === 'financial' ? 'Financial' : 'Overview'}
                                    </span>
                                </div>

                                {activeReport === 'financial' ? (
                                    <div className="space-y-6">
                                        <div>
                                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Total Revenue</p>
                                            <h3 className="text-5xl font-black font-outfit tracking-tight">₹{data?.total_revenue || 0}</h3>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                                <p className="text-slate-400 text-[10px] font-bold uppercase">Expense</p>
                                                <p className="text-lg font-black text-rose-400">₹{data?.total_expense || 0}</p>
                                            </div>
                                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                                <p className="text-slate-400 text-[10px] font-bold uppercase">Profit</p>
                                                <p className={`text-lg font-black ${data?.net_profit >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>₹{data?.net_profit || 0}</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Total Records</p>
                                        <h3 className="text-6xl font-black font-outfit tracking-tighter">{data?.details?.length || 0}</h3>
                                        <p className="text-emerald-400 text-xs font-bold flex items-center gap-1 mt-2">
                                            <ArrowRight size={12} /> Data Updated Live
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. Chart Card */}
                        <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-black text-slate-900 text-lg flex items-center gap-3">
                                    <BarChart3 size={20} className="text-blue-500" /> Growth Trajectory
                                </h3>
                                <div className="flex gap-2">
                                    <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-3 py-1 rounded-lg uppercase tracking-wide">Daily Trend</span>
                                </div>
                            </div>
                            <div className="flex-1 w-full min-h-[200px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} dy={10} />
                                        <YAxis hide />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px', fontFamily: 'sans-serif' }}
                                            itemStyle={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}
                                            labelStyle={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}
                                        />
                                        <Area type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={4} fillOpacity={1} fill="url(#colorValue)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Row: Table + Filter */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        
                        {/* 3. Detailed Table */}
                        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                                <h3 className="font-black text-slate-900 uppercase tracking-wide text-sm flex items-center gap-2">
                                     <ClipboardList size={16} className="text-slate-400"/> Detailed Breakdown
                                </h3>
                                <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm">
                                    <Download size={14} /> Export CSV
                                </button>
                            </div>
                            <div className="flex-1 overflow-x-auto no-scrollbar p-0">
                                <Table
                                    headers={tableConfig.headers}
                                    rows={tableConfig.rows}
                                />
                                {tableConfig.rows.length === 0 && !loading && (
                                    <div className="p-16 text-center text-slate-300 flex flex-col items-center">
                                        <div className="p-4 bg-slate-50 rounded-full mb-3"><X size={24} /></div>
                                        <p className="text-xs font-bold uppercase tracking-widest">No records found</p>
                                    </div>
                                )}
                                {loading && (
                                    <div className="p-16 flex flex-col items-center justify-center gap-4">
                                        <div className="w-8 h-8 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">Syncing data...</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 4. Sticky Filter Sidebar */}
                        <div className="space-y-6">
                            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 sticky top-8">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-black text-slate-900 text-sm uppercase tracking-widest">Filter Data</h3>
                                    <div className="p-2 bg-slate-50 rounded-xl text-slate-400"><Calendar size={18} /></div>
                                </div>
                                <div className="space-y-5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">From Date</label>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">To Date</label>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all"
                                        />
                                    </div>
                                </div>
                                <button onClick={fetchReport} className="w-full mt-8 h-14 text-xs uppercase tracking-widest font-black bg-slate-900 text-white shadow-xl shadow-slate-900/20 hover:bg-blue-600 hover:shadow-blue-600/30 transition-all rounded-2xl flex items-center justify-center gap-2 active:scale-95">
                                    Apply Filters <ArrowRight size={14} />
                                </button>
                                
                                <div className="mt-6 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                                    <p className="text-[10px] text-blue-700 font-bold leading-relaxed">
                                        💡 Analytics help you track growth. Select a range and hit Apply.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Case Sheet Modal */}
                <AnimatePresence>
                    {selectedNote && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm no-scrollbar">
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                            >
                                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
                                            <ClipboardList size={22} />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-black text-slate-900 font-outfit uppercase tracking-tighter leading-none">Clinical Case Sheet</h2>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Ref ID: {selectedNote.id.substring(0,8)}</p>
                                        </div>
                                    </div>
                                    <button className="p-3 hover:bg-white rounded-full text-slate-400 hover:text-red-500 transition-all shadow-sm" onClick={() => setSelectedNote(null)}>
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="p-10 overflow-y-auto space-y-8 no-scrollbar">
                                    <div className="grid grid-cols-2 gap-12 border-b border-dashed border-slate-200 pb-8">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Patient Name</label>
                                            <p className="font-black text-slate-900 text-lg">{selectedNote.patient}</p>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Consulting Doctor</label>
                                            <p className="font-bold text-slate-700 text-lg">{selectedNote.doctor}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-1.5 h-4 bg-blue-500 rounded-full"></div>
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Diagnosis</span>
                                            </div>
                                            <p className="text-slate-800 font-medium leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                                {selectedNote.diagnosis || "No diagnosis recorded."}
                                            </p>
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-1.5 h-4 bg-slate-900 rounded-full"></div>
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Prescription</span>
                                            </div>
                                            <div className="space-y-2">
                                                {selectedNote.prescription ? Object.entries(selectedNote.prescription).map(([med, dosage]) => (
                                                    <div key={med} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                                                        <span className="font-bold text-slate-800 text-sm">{med}</span>
                                                        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">{dosage}</span>
                                                    </div>
                                                )) : <p className="text-slate-400 text-xs italic pl-4">No medicines prescribed.</p>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};

export default Reports;