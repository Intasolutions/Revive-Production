import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FlaskConical, Beaker, Plus, Search, AlertTriangle,
    User, Calendar, ClipboardCheck, X, CheckCircle2,
    Clock, Activity, Printer, FileText, ChevronRight,
    MapPin, Phone, Filter, TestTube2, Microscope, Pencil
} from 'lucide-react';
import { Card, Button, Input, Table } from '../components/UI';
import Pagination from '../components/Pagination';
import api from '../api/axios';
import { useSearch } from '../context/SearchContext';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import { socket } from '../socket';

// --- Configuration ---
const TEST_TEMPLATES = {
    'LIPID PROFILE': [
        { name: 'CHOLESTEROL', unit: 'mg/dl', normal: 'Up to 200 mg/dl' },
        { name: 'TRIGLYCERIDES', unit: 'mg/dl', normal: 'UP TO 150 mg/dl' },
        { name: 'HDL CHOLESTEROL', unit: 'mg/dl', normal: '35-80 mg/dl' },
        { name: 'LDL CHOLESTEROL', unit: 'mg/dl', normal: 'Up to130 mg/dl' },
        { name: 'VLDL CHOLESTEROL', unit: 'mg/dl', normal: '10-25 mg/dl' },
    ],
    'CBC': [
        { name: 'Hemoglobin', unit: 'g/dL', normal: '13.0 - 17.0' },
        { name: 'WBC Count', unit: 'cells/cu.mm', normal: '4000 - 11000' },
        { name: 'Platelet Count', unit: 'lakhs/cu.mm', normal: '1.5 - 4.5' },
    ]
};

const Laboratory = () => {
    const { globalSearch } = useSearch();
    const { showToast } = useToast();
    const { confirm } = useDialog();

    // --- State ---
    const [chargesData, setChargesData] = useState({ results: [], count: 0 });
    const [pendingVisits, setPendingVisits] = useState([]);
    const [inventoryData, setInventoryData] = useState({ results: [], count: 0 });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('queue'); // queue | inventory
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const [labTests, setLabTests] = useState([]);

    // Test Catalog Form
    const [showTestModal, setShowTestModal] = useState(false);
    const [editingTestId, setEditingTestId] = useState(null);
    const [testCatalogForm, setTestCatalogForm] = useState({ name: '', category: 'HAEMATOLOGY', price: '', normal_range: '', parameters: [], required_items: [] });

    // Modals
    const [showModal, setShowModal] = useState(false); // Add Test Modal
    const [showInventoryModal, setShowInventoryModal] = useState(false); // Add Inventory Modal
    const [showResultModal, setShowResultModal] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [stockModal, setStockModal] = useState({ show: false, type: 'IN', item: null });

    // Selected Items
    const [selectedCharge, setSelectedCharge] = useState(null);
    const [printCharge, setPrintCharge] = useState(null);
    const [selectedVisit, setSelectedVisit] = useState(null);

    // Forms
    const [resultData, setResultData] = useState({ results: {}, technician_name: 'MUHAMMED NIYAS', specimen: 'BLOOD', consumed_items: [] });
    const [testForm, setTestForm] = useState({ test_name: '', amount: '' });
    const [selectedTests, setSelectedTests] = useState([]); // Array of { name, price, isCustom }
    const [stockForm, setStockForm] = useState({ qty: '', cost: '', notes: '' });
    const [inventoryForm, setInventoryForm] = useState({ item_name: '', category: 'REAGENT', qty: 0, cost_per_unit: '', reorder_level: 10 });
    const [visitSearch, setVisitSearch] = useState([]);
    const [visitQuery, setVisitQuery] = useState('');

    // --- Effects ---
    useEffect(() => {
        if (activeTab === 'queue') {
            fetchCharges(true);
            fetchPendingVisits(false);
            fetchLabTests();

            // Polling - 4 seconds
            const interval = setInterval(() => {
                fetchCharges(false);
                fetchPendingVisits(false);
            }, 4000);

            // Socket Listeners
            const onDoctorUpdate = (data) => {
                console.log("Socket: Doctor Update", data);
                if (data.has_lab) {
                    fetchPendingVisits(false);
                    showToast('info', 'New lab request received');
                }
            };

            const onLabUpdate = () => {
                fetchCharges(false);
            }

            socket.on('doctor_notes_update', onDoctorUpdate);
            socket.on('lab_update', onLabUpdate);

            return () => {
                clearInterval(interval);
                socket.off('doctor_notes_update', onDoctorUpdate);
                socket.off('lab_update', onLabUpdate);
            };
        } else if (activeTab === 'test_catalog') {
            fetchLabTests();
            fetchInventory(); // Needed for Recipe Dropdown
        } else {
            fetchInventory();
        }
    }, [activeTab, page, globalSearch, statusFilter]);

    useEffect(() => {
        if (selectedVisit) {
            setTestForm({ test_name: '', amount: '' });

            // Auto-select tests from referral details
            if (selectedVisit.lab_referral_details) {
                const autoSelected = [];
                const rawTests = selectedVisit.lab_referral_details.split(', ');

                rawTests.forEach(testName => {
                    const cleanName = testName.split('/')[0].trim().replace(/\s+/g, ' ');
                    if (!cleanName) return;

                    // Try to match with catalog
                    // 1. Exact Name Match (insensitive)
                    let catalogTest = labTests.find(t =>
                        t.name.toLowerCase().replace(/[^a-z0-9]/g, '') ===
                        cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')
                    );

                    // 2. Fuzzy/Partial Match (First 3 words)
                    if (!catalogTest) {
                        const refTokens = cleanName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).slice(0, 3).join('');
                        if (refTokens.length > 4) {
                            catalogTest = labTests.find(t => {
                                const catTokens = t.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).slice(0, 3).join('');
                                return catTokens === refTokens || catTokens.startsWith(refTokens) || refTokens.startsWith(catTokens);
                            });
                        }
                    }

                    if (catalogTest) {
                        autoSelected.push({
                            name: catalogTest.name, // Use catalog name for consistency
                            price: catalogTest.price,
                            isCustom: false
                        });
                    } else {
                        // Add as custom test if no match found
                        autoSelected.push({
                            name: cleanName,
                            price: '',
                            isCustom: true
                        });
                    }
                });

                // Deduplicate by name
                const uniqueSelected = autoSelected.filter((v, i, a) => a.findIndex(t => (t.name === v.name)) === i);
                setSelectedTests(uniqueSelected);
            } else {
                setSelectedTests([]);
            }
        }
    }, [selectedVisit, labTests]);

    // --- API Calls ---
    const fetchCharges = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const statusQuery = statusFilter !== 'ALL' ? `&status=${statusFilter}` : '';
            const { data } = await api.get(`lab/charges/?page=${page}&search=${globalSearch || ''}${statusQuery}`);
            setChargesData(data || { results: [], count: 0 });
        } catch (err) { showToast('error', 'Failed to fetch lab queue'); }
        finally { if (showLoading) setLoading(false); }
    };

    const fetchPendingVisits = async (showLoading = false) => {
        if (showLoading) setLoading(true); // Usually not needed for secondary fetches but keeping for flexibility
        try {
            const { data } = await api.get(`reception/visits/?assigned_role=LAB&status=OPEN`);
            setPendingVisits(data.results || data || []);
        } catch (err) { console.error(err); }
        finally { if (showLoading) setLoading(false); }
    };

    const fetchInventory = async () => {
        setLoading(true);
        try {
            // Fetch all inventory for dropdown (pagination might be an issue later, but okay for now)
            const { data } = await api.get(`lab/inventory/?page_size=1000&search=${globalSearch || ''}`);
            setInventoryData(data || { results: [], count: 0 });
        } catch (err) { showToast('error', 'Failed to fetch inventory'); }
        finally { setLoading(false); }
    };

    const searchVisits = async (q) => {
        setVisitQuery(q);
        if (q.length < 2) { setVisitSearch([]); return; }
        try {
            const { data } = await api.get(`reception/visits/?search=${q}`);
            setVisitSearch(data.results || data || []);
        } catch (err) { console.error(err); }
    };

    const fetchLabTests = async () => {
        try {
            const { data } = await api.get('lab/tests/');
            setLabTests(data.results || data || []);
        } catch (err) { console.error("Failed to load tests", err); }
    };

    const handleSaveTest = async (e) => {
        e.preventDefault();
        try {
            if (editingTestId) {
                await api.patch(`lab/tests/${editingTestId}/`, testCatalogForm);
                showToast('success', 'Test Updated Successfully');
            } else {
                await api.post('lab/tests/', testCatalogForm);
                showToast('success', 'Test Added Successfully');
            }
            setShowTestModal(false);
            setEditingTestId(null);
            setTestCatalogForm({ name: '', category: 'HAEMATOLOGY', price: '', normal_range: '', parameters: [], required_items: [] });
            fetchLabTests();
        } catch (err) { showToast('error', 'Failed to save test'); }
    };

    const handleEditTest = (test) => {
        setTestCatalogForm({
            name: test.name,
            category: test.category,
            price: test.price,
            normal_range: test.normal_range || '',
            parameters: test.parameters || [],
            required_items: test.required_items || []
        });
        setEditingTestId(test.id);
        setShowTestModal(true);
    };

    // Group tests by category
    const groupedTests = labTests.reduce((acc, test) => {
        const cat = test.category_display || test.category;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(test);
        return acc;
    }, {});

    // --- Actions ---
    const handleAddTest = async (e) => {
        e.preventDefault();
        if (!selectedVisit) return showToast('error', "Select a patient first");
        if (selectedTests.length === 0) return showToast('error', "Select at least one test");

        try {
            // Sequential or Parallel? Parallel is faster.
            await Promise.all(selectedTests.map(test =>
                api.post('lab/charges/', {
                    visit: selectedVisit.v_id || selectedVisit.id,
                    test_name: test.name,
                    amount: test.price || 0, // Ensure amount is set
                    status: 'PENDING'
                })
            ));

            await api.patch(`reception/visits/${selectedVisit.v_id || selectedVisit.id}/`, { status: 'IN_PROGRESS' });

            setShowModal(false);
            fetchCharges();
            fetchPendingVisits();
            setSelectedTests([]); // Clear cart
            setTestForm({ test_name: '', amount: '' });
            setSelectedVisit(null);
            showToast('success', `${selectedTests.length} test request(s) created`);
        } catch (err) { showToast('error', "Failed to create test request"); }
    };

    const handleOpenResultEntry = (charge) => {
        setSelectedCharge(charge);

        // 1. Check if results already exist (Edit Mode)
        if (charge.results && (Array.isArray(charge.results) ? charge.results.length > 0 : Object.keys(charge.results).length > 0)) {
            let initialResults = [];
            if (Array.isArray(charge.results)) {
                initialResults = charge.results;
            } else {
                initialResults = Object.entries(charge.results).map(([key, val]) => ({
                    name: key,
                    ...val
                }));
            }
            setResultData({
                results: initialResults,
                technician_name: charge.technician_name || 'MUHAMMED NIYAS',
                specimen: charge.specimen || 'BLOOD'
            });
            setShowResultModal(true);
            return;
        }

        // 2. New Entry: Check Catalog for Parameters
        const normalize = str => str?.toLowerCase().replace(/[^a-z0-9]/g, '');
        const catalogTest = labTests.find(t => normalize(t.name) === normalize(charge.test_name));

        let initialResults = [];

        if (catalogTest && catalogTest.parameters && catalogTest.parameters.length > 0) {
            // Use DB Parameters
            initialResults = catalogTest.parameters.map(p => ({
                name: p.name,
                unit: p.unit || '',
                normal: p.normal_range || '',
                value: ''
            }));
        } else {
            // Fallback to Templates or Default
            const template = TEST_TEMPLATES[charge.test_name?.toUpperCase()];
            if (template) {
                initialResults = template.map(t => ({ ...t, value: '' }));
            } else {
                // Single Test Fallback
                initialResults = [{
                    name: 'Result',
                    unit: '',
                    normal: catalogTest?.normal_range || '',
                    value: ''
                }];
            }
        }

        const defaultConsumption = catalogTest?.required_items?.map(r => ({
            inventory_item: r.inventory_item,
            item_name: r.item_name,
            qty: r.qty_per_test
        })) || [];

        setResultData({
            results: initialResults,
            technician_name: charge.technician_name || 'MUHAMMED NIYAS',
            specimen: charge.specimen || 'BLOOD',
            consumed_items: defaultConsumption
        });
        setShowResultModal(true);
    };

    const handleSubmitResults = async (e) => {
        e.preventDefault();
        try {
            await api.patch(`lab/charges/${selectedCharge.lc_id}/`, {
                status: 'COMPLETED',
                results: resultData.results,
                technician_name: resultData.technician_name,
                specimen: resultData.specimen,
                consumed_items: resultData.consumed_items,
                report_date: new Date().toISOString()
            });
            setShowResultModal(false);
            fetchCharges();
            showToast('success', 'Results published successfully');
        } catch (err) { showToast('error', "Failed to save results"); }
    };

    const handleStockTransaction = async (e) => {
        e.preventDefault();
        try {
            const endpoint = stockModal.type === 'IN' ? 'stock-in' : 'stock-out';
            await api.post(`lab/inventory/${stockModal.item.item_id}/${endpoint}/`, {
                qty: parseInt(stockForm.qty),
                cost: stockModal.type === 'IN' ? parseFloat(stockForm.cost) : 0,
                notes: stockForm.notes
            });

            setStockModal({ show: false, type: 'IN', item: null });
            setStockForm({ qty: '', cost: '', notes: '' });
            fetchInventory();
            showToast('success', `Stock ${stockModal.type === 'IN' ? 'Updated' : 'Deducted'} Successfully`);
        } catch (err) {
            showToast('error', err.response?.data?.error || "Transaction Failed");
        }
    };

    const handleUpdateStatus = async (id, status) => {
        const isConfirmed = await confirm({
            title: `Mark as ${status}?`,
            message: `Are you sure you want to mark this test as ${status}?`,
            type: status === 'CANCELLED' ? 'danger' : 'info',
            confirmText: 'Yes, Proceed',
            cancelText: 'No, Cancel'
        });

        if (!isConfirmed) return;

        try {
            await api.patch(`lab/charges/${id}/`, { status });
            fetchCharges();
            showToast('success', `Test marked as ${status}`);
        } catch (err) { showToast('error', "Failed to update status"); }
    };

    const handleSaveItem = async (e) => {
        e.preventDefault();
        try {
            if (inventoryForm.id) {
                // Edit Mode
                await api.patch(`lab/inventory/${inventoryForm.id}/`, inventoryForm);
                showToast('success', 'Item Updated Successfully');
            } else {
                // Create Mode
                await api.post('lab/inventory/', inventoryForm);
                showToast('success', 'New Item Added Successfully');
            }
            setShowInventoryModal(false);
            setInventoryForm({ item_name: '', category: 'REAGENT', qty: 0, cost_per_unit: '', reorder_level: 10 });
            fetchInventory();
        } catch (err) { showToast('error', "Failed to save item"); }
    };

    const handleEditItem = (item) => {
        setInventoryForm({
            id: item.item_id,
            item_name: item.item_name,
            category: item.category,
            qty: item.qty,
            cost_per_unit: item.cost_per_unit || '',
            reorder_level: item.reorder_level
        });
        setShowInventoryModal(true);
    };

    return (
        <div className="p-6 h-screen bg-[#F8FAFC] font-sans text-slate-900 flex flex-col overflow-hidden print:h-auto print:overflow-visible print:bg-white print:p-0 print:block">

            {/* --- Main Dashboard Content (Hidden on Print) --- */}
            <div className="flex flex-col h-full print:hidden">
                {/* --- Header & Navigation --- */}
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Laboratory</h1>
                        <div className="flex items-center gap-6 mt-2">
                            {['queue', 'inventory', 'test_catalog'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`pb-1 text-sm font-bold transition-all border-b-2 ${activeTab === tab ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                                >
                                    {tab === 'queue' ? 'Diagnostic Queue' : tab === 'inventory' ? 'Lab Inventory' : 'Test Catalog'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {activeTab === 'queue' ? (
                            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95">
                                <Plus size={18} /> New Request
                            </button>
                        ) : activeTab === 'inventory' ? (
                            <button onClick={() => setShowInventoryModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition-all active:scale-95">
                                <Plus size={18} /> Add Item
                            </button>
                        ) : (
                            <button onClick={() => { setEditingTestId(null); setTestCatalogForm({ name: '', category: 'HAEMATOLOGY', price: '', normal_range: '', parameters: [] }); setShowTestModal(true); }} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95">
                                <Plus size={18} /> Add Test
                            </button>
                        )}
                    </div>
                </div>

                {/* --- Main Content --- */}
                <div className="flex-1 min-h-0 bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden relative flex flex-col">

                    {/* 1. QUEUE TAB */}
                    {activeTab === 'queue' && (
                        <>
                            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex gap-2 overflow-x-auto shrink-0">
                                {['ALL', 'PENDING', 'COMPLETED', 'CANCELLED'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => { setStatusFilter(s); setPage(1); }}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${statusFilter === s ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-white sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            {['Patient Details', 'Test Requested', 'Age/Sex', 'Reference', 'Status', 'Cost', 'Actions'].map(h => (
                                                <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/80 backdrop-blur-sm">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {/* Pending Visits (Assigned to Lab) */}
                                        {pendingVisits.length > 0 && statusFilter === 'ALL' && page === 1 && (
                                            pendingVisits.map(v => (
                                                <tr key={v.id} className="bg-blue-50/30 hover:bg-blue-50 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                                                <User size={18} />
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-slate-900">{v.patient_name}</p>
                                                                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-blue-100 px-1.5 py-0.5 rounded">New Assign</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {v.lab_referral_details ? (
                                                            <div className="p-2 bg-purple-50 rounded-lg border border-purple-100">
                                                                <p className="text-xs font-bold text-slate-800 line-clamp-2" title={v.lab_referral_details}>{v.lab_referral_details}</p>
                                                            </div>
                                                        ) : (
                                                            <span className="italic text-slate-400 text-sm">-- No Details --</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm font-medium text-slate-600">{v.patient_age}Y / {v.patient_gender}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-slate-700">Dr. {v.doctor_name || 'Ref'}</span>
                                                            <span className="text-[10px] text-slate-400">{new Date(v.created_at).toLocaleDateString()}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-700 uppercase tracking-wide">Waiting</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-400">--</td>
                                                    <td className="px-6 py-4">
                                                        <button onClick={() => { setSelectedVisit(v); setShowModal(true); }} className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors">
                                                            <Plus size={14} /> Add Test
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}

                                        {/* Actual Lab Charges */}
                                        {chargesData.results.map(c => (
                                            <tr key={c.lc_id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-slate-900">{c.patient_name || 'Anonymous'}</p>
                                                    <p className="text-[10px] font-mono text-slate-400">ID: {(c.visit_id || '').slice(0, 6)}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <Microscope size={16} className="text-slate-400" />
                                                        <span className="font-bold text-slate-700 text-sm">{c.test_name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm font-medium text-slate-600">{c.patient_age}Y / {c.patient_sex}</td>
                                                <td className="px-6 py-4 text-xs text-slate-500 font-medium">#{c.lc_id.toString().slice(0, 6)}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide border ${c.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                        c.status === 'CANCELLED' ? 'bg-red-50 text-red-600 border-red-100' :
                                                            'bg-amber-50 text-amber-600 border-amber-100'
                                                        }`}>
                                                        {c.status === 'COMPLETED' && <CheckCircle2 size={12} />}
                                                        {c.status === 'PENDING' && <Clock size={12} />}
                                                        {c.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-bold text-slate-900">₹{c.amount}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {c.status === 'PENDING' ? (
                                                            <>
                                                                <button onClick={() => handleOpenResultEntry(c)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 hover:shadow-sm transition-all" title="Enter Result">
                                                                    <FlaskConical size={16} />
                                                                </button>
                                                                <button onClick={() => handleUpdateStatus(c.lc_id, 'CANCELLED')} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                                                    <X size={16} />
                                                                </button>
                                                            </>
                                                        ) : c.status === 'COMPLETED' ? (
                                                            <button onClick={() => { setPrintCharge(c); setShowPrintModal(true); }} className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-700 shadow-md transition-all">
                                                                <Printer size={14} /> Report
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                                <Pagination current={page} total={Math.ceil(chargesData.count / 10)} onPageChange={setPage} loading={loading} compact />
                            </div>
                        </>
                    )}

                    {/* 2. INVENTORY TAB */}
                    {activeTab === 'inventory' && (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 sticky top-0 shadow-sm">
                                        <tr>
                                            {['Item Name', 'Category', 'Stock Level', 'Reorder Level', 'Status', 'Actions'].map(h => (
                                                <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {inventoryData.results.map(item => (
                                            <tr key={item.item_id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-4 font-bold text-slate-900 text-sm">{item.item_name}</td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold uppercase">{item.category}</span>
                                                </td>
                                                <td className="px-6 py-4 font-mono font-bold text-slate-700">{item.qty} Units</td>
                                                <td className="px-6 py-4 font-bold text-slate-700">₹{item.cost_per_unit || '0.00'}</td>
                                                <td className="px-6 py-4 text-sm text-slate-500 font-medium">{item.reorder_level} Units</td>
                                                <td className="px-6 py-4">
                                                    {item.is_low_stock ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-wide">
                                                            <AlertTriangle size={10} /> Low Stock
                                                        </span>
                                                    ) : <span className="text-emerald-600 text-xs font-bold">In Stock</span>}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => setStockModal({ show: true, type: 'IN', item: item })}
                                                            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 font-bold text-xs hover:bg-emerald-100 transition-colors"
                                                        >
                                                            + Stock In
                                                        </button>
                                                        <button
                                                            onClick={() => setStockModal({ show: true, type: 'OUT', item: item })}
                                                            className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 font-bold text-xs hover:bg-amber-100 transition-colors"
                                                        >
                                                            - Stock Out
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                                <Pagination current={page} total={Math.ceil(inventoryData.count / 10)} onPageChange={setPage} loading={loading} compact />
                            </div>
                        </div>
                    )}
                    {/* 3. TEST CATALOG TAB */}
                    {activeTab === 'test_catalog' && (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 sticky top-0 shadow-sm">
                                        <tr>
                                            {['Test Name', 'Category', 'Price', 'Normal Range', 'Actions'].map(h => (
                                                <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {labTests.map(test => (
                                            <tr key={test.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-4 font-bold text-slate-900 text-sm">{test.name}</td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold uppercase">{test.category_display || test.category}</span>
                                                </td>
                                                <td className="px-6 py-4 font-mono font-bold text-slate-700">₹{test.price}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-500 whitespace-pre-wrap">{test.normal_range || '--'}</td>
                                                <td className="px-6 py-4">
                                                    <button onClick={() => handleEditTest(test)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit Test">
                                                        <Pencil size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- Modals (Outside the hidden div) --- */}
            {/* New Test Catalog Modal */}
            <AnimatePresence>
                {showTestModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm no-print">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-lg font-black text-emerald-900 uppercase tracking-tight">{editingTestId ? 'Edit Test' : 'Add New Test'}</h3>
                                <button onClick={() => setShowTestModal(false)} className="p-2 rounded-full hover:bg-slate-200 transition-colors"><X size={20} className="text-slate-500" /></button>
                            </div>
                            <form onSubmit={handleSaveTest} className="p-8 space-y-6">
                                {/* ... existing form fields ... */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Test Name</label>
                                        <Input value={testCatalogForm.name} onChange={e => setTestCatalogForm({ ...testCatalogForm, name: e.target.value })} required className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Category</label>
                                        <div className="relative">
                                            <select
                                                value={testCatalogForm.category}
                                                onChange={e => setTestCatalogForm({ ...testCatalogForm, category: e.target.value })}
                                                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-800 focus:border-blue-500 outline-none transition-all appearance-none"
                                            >
                                                {['HAEMATOLOGY', 'BIOCHEMISTRY', 'URINE', 'STOOL', 'OTHERS'].map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" size={16} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Price (₹)</label>
                                        <Input type="number" value={testCatalogForm.price} onChange={e => setTestCatalogForm({ ...testCatalogForm, price: e.target.value })} required className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Normal Range (Optional)</label>
                                        <textarea
                                            value={testCatalogForm.normal_range}
                                            onChange={e => setTestCatalogForm({ ...testCatalogForm, normal_range: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-800 focus:border-blue-500 outline-none transition-all min-h-[80px]"
                                            placeholder="e.g. 13.0 - 17.0 g/dL"
                                        />
                                    </div>

                                    {/* Parameters Section */}
                                    <div className="space-y-3 pt-2 border-t border-slate-100">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Test Parameters</label>
                                            <button
                                                type="button"
                                                onClick={() => setTestCatalogForm(prev => ({ ...prev, parameters: [...prev.parameters, { name: '', unit: '', normal_range: '' }] }))}
                                                className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                                            >
                                                + Add Parameter
                                            </button>
                                        </div>

                                        {testCatalogForm.parameters.length > 0 && (
                                            <div className="grid grid-cols-[1fr,60px,100px,30px] gap-2 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                <span>Parameter Name</span>
                                                <span>Unit</span>
                                                <span>Normal Range</span>
                                                <span></span>
                                            </div>
                                        )}

                                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                            {testCatalogForm.parameters.length === 0 && (
                                                <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center">
                                                    <p className="text-xs text-slate-400 font-medium">No parameters defined. This will be treated as a single test.</p>
                                                </div>
                                            )}
                                            {testCatalogForm.parameters.map((param, idx) => (
                                                <div key={idx} className="flex gap-2 items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                    <Input
                                                        placeholder="e.g. Hemoglobin"
                                                        value={param.name}
                                                        onChange={e => {
                                                            const newParams = [...testCatalogForm.parameters];
                                                            newParams[idx].name = e.target.value;
                                                            setTestCatalogForm({ ...testCatalogForm, parameters: newParams });
                                                        }}
                                                        className="flex-1 bg-slate-50 border-slate-200 text-xs h-9"
                                                    />
                                                    <Input
                                                        placeholder="mg/dL"
                                                        value={param.unit}
                                                        onChange={e => {
                                                            const newParams = [...testCatalogForm.parameters];
                                                            newParams[idx].unit = e.target.value;
                                                            setTestCatalogForm({ ...testCatalogForm, parameters: newParams });
                                                        }}
                                                        className="w-16 bg-slate-50 border-slate-200 text-xs h-9"
                                                    />
                                                    <Input
                                                        placeholder="e.g. 12-16"
                                                        value={param.normal_range}
                                                        onChange={e => {
                                                            const newParams = [...testCatalogForm.parameters];
                                                            newParams[idx].normal_range = e.target.value;
                                                            setTestCatalogForm({ ...testCatalogForm, parameters: newParams });
                                                        }}
                                                        className="w-24 bg-slate-50 border-slate-200 text-xs h-9"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const newParams = testCatalogForm.parameters.filter((_, i) => i !== idx);
                                                            setTestCatalogForm({ ...testCatalogForm, parameters: newParams });
                                                        }}
                                                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* SECTION: Required Inventory (Recipe) */}
                                    <div className="space-y-3 pt-4 border-t border-slate-100">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Inventory Consumption (Recipe)</label>
                                            <button
                                                type="button"
                                                onClick={() => setTestCatalogForm(prev => ({ ...prev, required_items: [...(prev.required_items || []), { inventory_item: '', qty_per_test: 1 }] }))}
                                                className="text-xs font-bold text-amber-600 hover:bg-amber-50 px-2 py-1 rounded transition-colors"
                                            >
                                                + Add Required Item
                                            </button>
                                        </div>

                                        {testCatalogForm.required_items && testCatalogForm.required_items.length > 0 && (
                                            <div className="grid grid-cols-[1fr,60px,30px] gap-2 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                <span>Item Name</span>
                                                <span>Qty</span>
                                                <span></span>
                                            </div>
                                        )}

                                        <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                                            {(!testCatalogForm.required_items || testCatalogForm.required_items.length === 0) && (
                                                <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center">
                                                    <p className="text-xs text-slate-400 font-medium">No inventory items linked. No auto-deduction will occur.</p>
                                                </div>
                                            )}
                                            {testCatalogForm.required_items && testCatalogForm.required_items.map((item, idx) => (
                                                <div key={idx} className="flex gap-2 items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                    <div className="flex-1 relative">
                                                        <select
                                                            value={item.inventory_item}
                                                            onChange={e => {
                                                                const newItems = [...testCatalogForm.required_items];
                                                                newItems[idx].inventory_item = e.target.value;
                                                                setTestCatalogForm({ ...testCatalogForm, required_items: newItems });
                                                            }}
                                                            className="w-full h-9 px-2 bg-slate-50 border-2 border-slate-200 rounded-lg font-bold text-xs text-slate-700 outline-none focus:border-amber-500 transition-all appearance-none"
                                                        >
                                                            <option value="">Select Item...</option>
                                                            {inventoryData.results.map(inv => (
                                                                <option key={inv.item_id} value={inv.item_id}>{inv.item_name} ({inv.qty})</option>
                                                            ))}
                                                        </select>
                                                        <ChevronRight size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" />
                                                    </div>
                                                    <Input
                                                        type="number"
                                                        placeholder="Qty"
                                                        value={item.qty_per_test}
                                                        onChange={e => {
                                                            const newItems = [...testCatalogForm.required_items];
                                                            newItems[idx].qty_per_test = parseInt(e.target.value) || 1;
                                                            setTestCatalogForm({ ...testCatalogForm, required_items: newItems });
                                                        }}
                                                        className="w-16 bg-slate-50 border-slate-200 text-xs h-9"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const newItems = testCatalogForm.required_items.filter((_, i) => i !== idx);
                                                            setTestCatalogForm({ ...testCatalogForm, required_items: newItems });
                                                        }}
                                                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <Button type="submit" className="w-full h-12 rounded-xl bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-600/20">{editingTestId ? 'Update Test' : 'Add Test to Catalog'}</Button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* New Lab Request Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm no-print">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">New Lab Request</h3>
                                <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-slate-200 transition-colors"><X size={20} className="text-slate-500" /></button>
                            </div>
                            <form onSubmit={handleAddTest} className="p-8 space-y-6">
                                {/* Patient Search Block */}
                                {!selectedVisit ? (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Select Patient</label>
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input
                                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm focus:border-blue-500 outline-none transition-all"
                                                placeholder="Search patient..."
                                                value={visitQuery}
                                                onChange={e => searchVisits(e.target.value)}
                                            />
                                            {visitSearch.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-xl z-20 max-h-40 overflow-y-auto">
                                                    {visitSearch.map(v => (
                                                        <div key={v.id} onClick={() => { setSelectedVisit(v); setVisitSearch([]); }} className="p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0">
                                                            <p className="text-sm font-bold text-slate-800">{v.patient_name}</p>
                                                            <p className="text-xs text-slate-500">Dr. {v.doctor_name}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-blue-900 text-sm">{selectedVisit.patient_name}</p>
                                            <p className="text-xs text-blue-600 font-mono">ID: {selectedVisit.id.slice(0, 8)}</p>
                                        </div>
                                        <button type="button" onClick={() => setSelectedVisit(null)} className="text-xs font-bold text-blue-500 hover:underline">Change</button>
                                    </div>
                                )}

                                {selectedVisit && selectedVisit.lab_referral_details && (
                                    <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 mb-6">
                                        <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3">Recommended Tests</p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedVisit.lab_referral_details.split(', ').map(testName => {
                                                const cleanName = testName.split('/')[0].trim().replace(/\s+/g, ' ');
                                                let catalogTest = labTests.find(t => t.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName.toLowerCase().replace(/[^a-z0-9]/g, ''));

                                                // Ultra-Simple Fallback: Match first 3 words
                                                if (!catalogTest) {
                                                    const refTokens = cleanName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).slice(0, 3).join('');
                                                    if (refTokens.length > 5) {
                                                        catalogTest = labTests.find(t => {
                                                            const catTokens = t.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).slice(0, 3).join('');
                                                            return catTokens === refTokens || catTokens.startsWith(refTokens) || refTokens.startsWith(catTokens);
                                                        });
                                                    }
                                                }
                                                // Multi-select check
                                                const currentName = catalogTest ? catalogTest.name : cleanName;
                                                const isSelected = selectedTests.some(t => t.name === currentName);

                                                return (
                                                    <button
                                                        key={cleanName}
                                                        type="button"
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                setSelectedTests(prev => prev.filter(t => t.name !== currentName));
                                                            } else {
                                                                setSelectedTests(prev => [...prev, {
                                                                    name: currentName,
                                                                    price: catalogTest ? catalogTest.price : '',
                                                                    isCustom: !catalogTest
                                                                }]);
                                                            }
                                                        }}
                                                        className={`flex items-center gap-2 px-3 py-1.5 border shadow-sm rounded-lg transition-all group ${isSelected
                                                            ? 'bg-purple-600 border-purple-600 text-white shadow-purple-200'
                                                            : 'bg-white border-purple-200 text-slate-700 hover:border-purple-400'
                                                            }`}
                                                    >
                                                        <div className={`w-2 h-2 rounded-full ${catalogTest ? 'bg-emerald-400' : 'bg-amber-400'} ${isSelected ? 'bg-white' : ''}`} />
                                                        <span className="text-xs font-bold">{cleanName}</span>
                                                        {isSelected && <CheckCircle2 size={12} />}
                                                    </button>
                                                );
                                            })}

                                            {/* Add Additional Test Toggle */}
                                            <button
                                                type="button"
                                                onClick={() => setTestForm({ test_name: '', amount: '' })}
                                                className={`flex items-center gap-2 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-xs font-bold text-slate-500 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all ${!testForm.test_name ? 'bg-blue-50 border-blue-400 text-blue-600' : ''}`}
                                            >
                                                <Plus size={12} />
                                                Add Other Test
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Selected Tests List (Cart) */}
                                {selectedTests.length > 0 && (
                                    <div className="mb-6 space-y-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Tests</p>
                                        <div className="bg-slate-50 rounded-xl border border-slate-100 divide-y divide-slate-100">
                                            {selectedTests.map((test, index) => (
                                                <div key={index} className="flex justify-between items-center px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedTests(prev => prev.filter((_, i) => i !== index))}
                                                            className="text-slate-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                        <span className="text-sm font-bold text-slate-700">{test.name}</span>
                                                    </div>
                                                    <span className="font-mono text-xs font-bold text-slate-900">₹{test.price || '0.00'}</span>
                                                </div>
                                            ))}
                                            <div className="px-4 py-2 bg-slate-100 flex justify-between items-center rounded-b-xl">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total</span>
                                                <span className="font-mono font-black text-emerald-600 text-lg">
                                                    ₹{selectedTests.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4 relative">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Search & Select Test</label>
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input
                                                type="text"
                                                value={testForm.test_name}
                                                onChange={e => setTestForm({ ...testForm, test_name: e.target.value })}
                                                placeholder="Type to search..."
                                                className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all placeholder:font-medium placeholder:text-slate-400"
                                            />
                                        </div>
                                    </div>

                                    {/* Dropdown Results */}
                                    {testForm.test_name && (
                                        <div className="absolute z-50 left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 max-h-60 overflow-y-auto mt-2 p-1">
                                            {labTests.filter(t => t.name.toLowerCase().includes(testForm.test_name.toLowerCase())).map(test => (
                                                <button
                                                    key={test.id}
                                                    type="button"
                                                    onClick={() => {
                                                        if (!selectedTests.some(t => t.name === test.name)) {
                                                            setSelectedTests(prev => [...prev, {
                                                                name: test.name,
                                                                price: test.price,
                                                                isCustom: false
                                                            }]);
                                                        }
                                                        setTestForm({ test_name: '', amount: '' }); // Clear search
                                                    }}
                                                    className="w-full text-left px-4 py-3 hover:bg-purple-50 rounded-lg transition-colors flex justify-between items-center group"
                                                >
                                                    <span className="text-sm font-bold text-slate-700 group-hover:text-purple-700">{test.name}</span>
                                                    <span className="text-xs font-medium text-slate-400 group-hover:text-purple-500">₹{test.price}</span>
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!selectedTests.some(t => t.name === testForm.test_name)) {
                                                        setSelectedTests(prev => [...prev, {
                                                            name: testForm.test_name,
                                                            price: '',
                                                            isCustom: true
                                                        }]);
                                                    }
                                                    setTestForm({ test_name: '', amount: '' });
                                                }}
                                                className="w-full text-left px-4 py-3 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-2 text-emerald-600"
                                            >
                                                <Plus size={14} />
                                                <span className="text-sm font-bold">Add "{testForm.test_name}" as custom test</span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 pt-4">
                                    <Button type="submit" disabled={selectedTests.length === 0} className="w-full h-12 rounded-xl bg-slate-900 text-white font-bold shadow-lg shadow-slate-900/20 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {selectedTests.length > 0 ? `Confirm & Create Request (${selectedTests.length})` : 'Select a Test from Search'}
                                    </Button>
                                </div>
                            </form>
                        </motion.div>
                    </div >
                )
                }
            </AnimatePresence >

            {/* Result Entry Modal - Premium */}
            < AnimatePresence >
                {showResultModal && selectedCharge && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm no-print">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-3xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Enter Results</h3>
                                    <p className="text-sm font-bold text-slate-400 mt-1">{selectedCharge.test_name} • {selectedCharge.patient_name}</p>
                                </div>
                                <button onClick={() => setShowResultModal(false)} className="p-2 rounded-full hover:bg-white shadow-sm"><X size={20} className="text-slate-400" /></button>
                            </div>

                            <form onSubmit={handleSubmitResults} className="flex-1 overflow-y-auto p-8 space-y-8">
                                <div className="grid grid-cols-12 gap-4 text-xs font-black text-slate-400 uppercase tracking-widest px-2 border-b border-slate-100 pb-2">
                                    <span className="col-span-4">Parameter Name</span>
                                    <span className="col-span-4">Result Value</span>
                                    <span className="col-span-2">Unit</span>
                                    <span className="col-span-2 text-right">Normal Range</span>
                                </div>

                                <div className="space-y-3">
                                    {resultData.results.map((field, index) => (
                                        <div key={index} className="grid grid-cols-12 gap-4 items-center bg-slate-50 p-4 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors group">
                                            <div className="col-span-4">
                                                <input
                                                    className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 font-bold text-slate-700 text-sm outline-none transition-all placeholder:text-slate-300"
                                                    placeholder="Parameter Name"
                                                    value={field.name}
                                                    onChange={e => {
                                                        const newResults = [...resultData.results];
                                                        newResults[index].name = e.target.value;
                                                        setResultData({ ...resultData, results: newResults });
                                                    }}
                                                />
                                            </div>
                                            <div className="col-span-4">
                                                <input
                                                    className="w-full bg-white border-2 border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                                    placeholder="Value"
                                                    value={field.value}
                                                    onChange={e => {
                                                        const newResults = [...resultData.results];
                                                        newResults[index].value = e.target.value;
                                                        setResultData({ ...resultData, results: newResults });
                                                    }}
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <input
                                                    className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 text-xs font-bold text-slate-500 outline-none transition-all"
                                                    placeholder="Unit"
                                                    value={field.unit}
                                                    onChange={e => {
                                                        const newResults = [...resultData.results];
                                                        newResults[index].unit = e.target.value;
                                                        setResultData({ ...resultData, results: newResults });
                                                    }}
                                                />
                                            </div>
                                            <div className="col-span-2 relative">
                                                <input
                                                    className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 text-xs font-bold text-slate-400 text-right outline-none transition-all"
                                                    placeholder="Ref Range"
                                                    value={field.normal}
                                                    onChange={e => {
                                                        const newResults = [...resultData.results];
                                                        newResults[index].normal = e.target.value;
                                                        setResultData({ ...resultData, results: newResults });
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newResults = resultData.results.filter((_, i) => i !== index);
                                                        setResultData({ ...resultData, results: newResults });
                                                    }}
                                                    className="absolute -right-8 top-1/2 -translate-y-1/2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={() => setResultData({
                                            ...resultData,
                                            results: [...resultData.results, { name: '', value: '', unit: '', normal: '' }]
                                        })}
                                        className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold text-xs hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Plus size={16} /> Add Parameter
                                    </button>
                                </div>

                                {/* Actual Inventory Consumption (Wastage Handling) */}
                                {resultData.consumed_items && resultData.consumed_items.length > 0 && (
                                    <div className="space-y-3 pt-4 border-t border-slate-100">
                                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Inventory Used (Adjust if Wastage/Retry)</h4>
                                        <div className="space-y-2">
                                            {resultData.consumed_items.map((item, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                                                    <span className="text-sm font-bold text-slate-700">{item.item_name}</span>
                                                    <div className="flex items-center gap-2">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Qty Used:</label>
                                                        <input
                                                            type="number"
                                                            value={item.qty}
                                                            onChange={e => {
                                                                const newItems = [...resultData.consumed_items];
                                                                newItems[idx].qty = parseInt(e.target.value) || 0;
                                                                setResultData({ ...resultData, consumed_items: newItems });
                                                            }}
                                                            className="w-16 h-8 text-center bg-white border border-amber-200 rounded-lg font-bold text-slate-700 outline-none focus:border-amber-500"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Technician</label>
                                        <Input value={resultData.technician_name} onChange={(e) => setResultData({ ...resultData, technician_name: e.target.value })} className="bg-white border-2 border-slate-100 rounded-xl font-bold" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Specimen Type</label>
                                        <Input value={resultData.specimen} onChange={(e) => setResultData({ ...resultData, specimen: e.target.value })} className="bg-white border-2 border-slate-100 rounded-xl font-bold" />
                                    </div>
                                </div>
                            </form>

                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                                <Button variant="secondary" className="rounded-xl px-6 font-bold" onClick={() => setShowResultModal(false)}>Cancel</Button>
                                <Button onClick={handleSubmitResults} className="rounded-xl px-8 font-bold bg-blue-600 shadow-lg shadow-blue-500/30">Publish Results</Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >

            {/* Print Modal - ON SCREEN ONLY */}
            < AnimatePresence >
                {showPrintModal && printCharge && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm print:hidden">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white w-full max-w-3xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Lab Report</h3>
                                <button onClick={() => setShowPrintModal(false)} className="p-2 rounded-full hover:bg-white shadow-sm"><X size={20} className="text-slate-400" /></button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-12">
                                {/* Preview Content (Duplicate of Print View) */}
                                <div className="flex justify-between items-start mb-12 border-b-2 border-slate-900 pb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white">
                                            <TestTube2 size={32} />
                                        </div>
                                        <div>
                                            <h1 className="text-3xl font-black text-slate-900 tracking-tighter">REVIVE HOSPITALS</h1>
                                            <p className="text-sm font-bold text-slate-500 tracking-widest uppercase mt-1">Laboratory Services</p>
                                        </div>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Report ID</p>
                                        <p className="text-xl font-black text-slate-900">#{printCharge.lc_id.toString().slice(0, 8)}</p>
                                        <p className="text-sm font-medium text-slate-500">{new Date().toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded-2xl p-6 mb-8 border border-slate-100">
                                    <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Patient Name</p>
                                            <p className="text-lg font-bold text-slate-900">{printCharge.patient_name}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Age / Sex</p>
                                            <p className="text-lg font-bold text-slate-900">{printCharge.patient_age} Years / {printCharge.patient_sex}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Referred By</p>
                                            <p className="text-lg font-bold text-slate-900">Dr. {printCharge.doctor_name || 'Consultant'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Specimen</p>
                                            <p className="text-lg font-bold text-slate-900">{printCharge.specimen || 'Blood'}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="mb-12">
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">
                                        {printCharge.test_name} Analysis
                                    </h3>
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-slate-200">
                                                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4">Parameter Name</th>
                                                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4">Result Value</th>
                                                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4">Unit</th>
                                                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4 text-right">Normal Range</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(Array.isArray(printCharge.results)
                                                ? printCharge.results
                                                : Object.entries(printCharge.results || {}).map(([key, val]) => ({ name: key, ...val }))
                                            ).map((val, idx) => (
                                                <tr key={idx}>
                                                    <td className="py-4 font-bold text-slate-700 text-sm">{val.name}</td>
                                                    <td className="py-4 font-black text-slate-900 text-sm">{val.value}</td>
                                                    <td className="py-4 font-bold text-slate-500 text-xs">{val.unit}</td>
                                                    <td className="py-4 font-bold text-slate-500 text-xs text-right whitespace-pre-wrap">{val.normal}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex justify-between items-end mt-20 pt-8 border-t border-slate-200">
                                    <div className="text-xs font-medium text-slate-400">
                                        <p>Generated by REVIVE Hospital Management System</p>
                                        <p>{new Date().toLocaleString()}</p>
                                    </div>
                                    <div className="text-center">
                                        <div className="h-12 w-32 mb-2 mx-auto"></div>
                                        <p className="text-sm font-bold text-slate-900">{printCharge.technician_name}</p>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lab Technician</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                                <Button variant="secondary" className="rounded-xl px-6 font-bold" onClick={() => setShowPrintModal(false)}>Close</Button>
                                <Button onClick={() => window.print()} className="rounded-xl px-8 font-bold bg-slate-900 text-white shadow-lg shadow-slate-900/20">
                                    <Printer size={18} className="mr-2" /> Print Report
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >

            {/* Print View - PORTAL STRATEGY */}
            {printCharge && createPortal(
                <>
                    <style type="text/css">
                        {`
                        @media screen {
                            .print-portal-content {
                                display: none;
                            }
                        }
                        @media print {
                            html, body {
                                height: 100% !important;
                                width: 100% !important;
                                overflow: visible !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                background-color: white !important;
                            }
                            #root {
                                display: none !important;
                            }
                            .print-portal-content {
                                display: block !important;
                                position: relative !important;
                                top: 0 !important;
                                left: 0 !important;
                                width: 100% !important;
                                height: auto !important;
                                z-index: 9999 !important;
                                background-color: white !important;
                                color: black !important;
                                font-size: 12pt;
                                padding: 40px !important;
                                margin: 0 !important;
                                visibility: visible !important;
                            }
                            .print-portal-content * {
                                visibility: visible !important;
                            }
                            * {
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }
                        }
                        `}
                    </style>
                    <div className="print-portal-content">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-12 border-b-2 border-slate-900 pb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white">
                                    <TestTube2 size={32} />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-black text-slate-900 tracking-tighter">REVIVE HOSPITALS</h1>
                                    <p className="text-sm font-bold text-slate-500 tracking-widest uppercase mt-1">Laboratory Services</p>
                                </div>
                            </div>
                            <div className="text-right space-y-1">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Report ID</p>
                                <p className="text-xl font-black text-slate-900">#{printCharge.lc_id.toString().slice(0, 8)}</p>
                                <p className="text-sm font-medium text-slate-500">{new Date().toLocaleDateString()}</p>
                            </div>
                        </div>

                        {/* Patient Info */}
                        <div className="bg-slate-50 rounded-2xl p-6 mb-8 border border-slate-100">
                            <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Patient Name</p>
                                    <p className="text-lg font-bold text-slate-900">{printCharge.patient_name}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Age / Sex</p>
                                    <p className="text-lg font-bold text-slate-900">{printCharge.patient_age} Years / {printCharge.patient_sex}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Referred By</p>
                                    <p className="text-lg font-bold text-slate-900">Dr. {printCharge.doctor_name || 'Consultant'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Specimen</p>
                                    <p className="text-lg font-bold text-slate-900">{printCharge.specimen || 'Blood'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Results Table */}
                        <div className="mb-12">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">
                                {printCharge.test_name} Analysis
                            </h3>
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4">Parameter Name</th>
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4">Result Value</th>
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4">Unit</th>
                                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4 text-right">Normal Range</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(Array.isArray(printCharge.results)
                                        ? printCharge.results
                                        : Object.entries(printCharge.results || {}).map(([key, val]) => ({ name: key, ...val }))
                                    ).map((val, idx) => (
                                        <tr key={idx}>
                                            <td className="py-4 font-bold text-slate-700 text-sm">{val.name}</td>
                                            <td className="py-4 font-black text-slate-900 text-sm">{val.value}</td>
                                            <td className="py-4 font-bold text-slate-500 text-xs">{val.unit}</td>
                                            <td className="py-4 font-bold text-slate-500 text-xs text-right whitespace-pre-wrap">{val.normal}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-between items-end mt-auto pt-8 border-t border-slate-200">
                            <div className="text-xs font-medium text-slate-400">
                                <p>Generated by REVIVE Hospital Management System</p>
                                <p>{new Date().toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                                <div className="h-12 w-32 mb-2 mx-auto"></div>
                                <p className="text-sm font-bold text-slate-900">{printCharge.technician_name}</p>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lab Technician</p>
                            </div>
                        </div>
                    </div>
                </>,
                document.body
            )}

            < AnimatePresence >
                {
                    stockModal.show && stockModal.item && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm no-print">
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
                                <div className={`p-6 border-b flex justify-between items-center ${stockModal.type === 'IN' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                                    <div>
                                        <h3 className={`text-lg font-black uppercase tracking-tight ${stockModal.type === 'IN' ? 'text-emerald-900' : 'text-amber-900'}`}>
                                            {stockModal.type === 'IN' ? 'Stock In' : 'Stock Out'}
                                        </h3>
                                        <p className="text-sm font-bold opacity-60">{stockModal.item.item_name}</p>
                                    </div>
                                    <button onClick={() => setStockModal({ ...stockModal, show: false })} className="p-2 rounded-full hover:bg-white/50 transition-colors"><X size={20} className="opacity-60" /></button>
                                </div>
                                <form onSubmit={handleStockTransaction} className="p-6 space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Quantity</label>
                                        <Input
                                            type="number"
                                            autoFocus
                                            placeholder="0"
                                            value={stockForm.qty}
                                            onChange={e => setStockForm({ ...stockForm, qty: e.target.value })}
                                            required
                                            className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-lg"
                                        />
                                    </div>

                                    {stockModal.type === 'IN' && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Total Cost (₹)</label>
                                            <Input
                                                type="number"
                                                placeholder="0.00"
                                                value={stockForm.cost}
                                                onChange={e => setStockForm({ ...stockForm, cost: e.target.value })}
                                                className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold"
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Notes / Reason</label>
                                        <Input
                                            placeholder="Optional..."
                                            value={stockForm.notes}
                                            onChange={e => setStockForm({ ...stockForm, notes: e.target.value })}
                                            className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold"
                                        />
                                    </div>

                                    <div className="pt-2">
                                        <Button
                                            type="submit"
                                            className={`w-full h-12 rounded-xl text-white font-bold shadow-lg ${stockModal.type === 'IN' ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-amber-600 shadow-amber-600/20'}`}
                                        >
                                            Update Stock
                                        </Button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >
            {/* Inventory Creation Modal */}
            < AnimatePresence >
                {showInventoryModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm no-print">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{inventoryForm.id ? 'Edit Item' : 'Add New Item'}</h3>
                                <button onClick={() => setShowInventoryModal(false)} className="p-2 rounded-full hover:bg-slate-200 transition-colors"><X size={20} className="text-slate-500" /></button>
                            </div>
                            <form onSubmit={handleSaveItem} className="p-8 space-y-6">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Item Name</label>
                                        <Input
                                            value={inventoryForm.item_name}
                                            onChange={e => setInventoryForm({ ...inventoryForm, item_name: e.target.value })}
                                            placeholder="e.g., Glucose Kit, Syringe..."
                                            className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-800"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Category</label>
                                        <div className="relative">
                                            <Input
                                                value={inventoryForm.category}
                                                onChange={e => setInventoryForm({ ...inventoryForm, category: e.target.value })}
                                                placeholder="e.g. Reagent, Kit, Consumable..."
                                                className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-slate-800 focus:border-blue-500 outline-none transition-all"
                                                list="category-suggestions"
                                                required
                                            />
                                            <datalist id="category-suggestions">
                                                <option value="REAGENT" />
                                                <option value="KIT" />
                                                <option value="CONSUMABLE" />
                                                <option value="EQUIPMENT" />
                                            </datalist>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Initial Qty</label>
                                            <Input type="number" placeholder="0" value={inventoryForm.qty} onChange={e => setInventoryForm({ ...inventoryForm, qty: e.target.value })} required className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Cost / Unit (₹)</label>
                                            <Input type="number" placeholder="0.00" value={inventoryForm.cost_per_unit} onChange={e => setInventoryForm({ ...inventoryForm, cost_per_unit: e.target.value })} className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Reorder Level</label>
                                        <Input type="number" placeholder="10" value={inventoryForm.reorder_level} onChange={e => setInventoryForm({ ...inventoryForm, reorder_level: e.target.value })} required className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <Button type="submit" className="w-full h-12 rounded-xl bg-slate-900 text-white font-bold shadow-lg shadow-slate-900/20">{inventoryForm.id ? 'Save Changes' : 'Add Item'}</Button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >
        </div >
    );
};

export default Laboratory;