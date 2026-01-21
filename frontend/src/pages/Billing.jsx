import React, { useState, useEffect } from "react";
import {
    Plus, Search, FileText, Download, Printer, CheckCircle2,
    Clock, TrendingUp, IndianRupee, AlertCircle, X, User,
    Calendar, Pill, ChevronDown, Import, ChevronRight, Sparkles,
    Eye, CreditCard, Wallet, MoreHorizontal
} from "lucide-react";
import api from "../api/axios";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "../context/ToastContext";
import { useDialog } from "../context/DialogContext";
import { socket } from "../socket";


const Billing = () => {
    const { showToast } = useToast();
    const { confirm } = useDialog();

    // --- State ---
    const [invoices, setInvoices] = useState([]);
    const [pendingVisits, setPendingVisits] = useState([]);
    const [stats, setStats] = useState({ revenue_today: 0, pending_amount: 0, invoices_today: 0 });
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [page, setPage] = useState(1);
    const globalSearch = searchTerm; // Map searchTerm to globalSearch for compatibility with the copied logic

    // --- Forms ---
    const [doctors, setDoctors] = useState([]);
    const [patients, setPatients] = useState([]);
    const [pharmacyStock, setPharmacyStock] = useState([]);
    const [selectedPatientId, setSelectedPatientId] = useState(null);

    const [formData, setFormData] = useState({
        patient_name: "",
        doctor_display_name: "",
        visit: null,
        doctor: "",
        payment_status: "PENDING",
        items: [{ dept: "PHARMACY", description: "", qty: 1, unit_price: 0, amount: 0, hsn: "", batch: "", gst_percent: 0, expiry: "", dosage: "", duration: "" }]
    });

    // --- Effects ---
    useEffect(() => {
        const fetchData = async () => {
            await Promise.all([
                fetchInvoices(true),
                fetchStats(false),
                fetchPendingVisits(false)
            ]);
        };
        fetchData();
        fetchMetadata(); // Call fetchMetadata once on mount

        // Polling - 4 seconds
        const interval = setInterval(() => {
            fetchInvoices(false);
            fetchStats(false);
            fetchPendingVisits(false);
        }, 4000);

        // Socket Listener
        const onPharmacySale = (data) => {
            console.log("Socket: Pharmacy Sale Update", data);
            fetchPendingVisits(false);
            fetchStats(false);
            showToast('info', 'New billing entry available');
        };

        socket.on('pharmacy_sale_update', onPharmacySale);

        return () => {
            clearInterval(interval);
            socket.off('pharmacy_sale_update', onPharmacySale);
        };
    }, [page, globalSearch]);

    // --- API Calls ---
    const fetchInvoices = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const { data } = await api.get(`/billing/invoices/?page=${page}${globalSearch ? `&search=${encodeURIComponent(globalSearch)}` : ''}`);
            setInvoices(data.results || (Array.isArray(data) ? data : []));
        } catch (err) {
            showToast('error', 'Failed to load invoices.');
        } finally {
            if (showLoading) {
                setTimeout(() => setLoading(false), 500);
            }
        }
    };

    const fetchPendingVisits = async (showLoading = false) => {
        if (showLoading) setLoading(true);
        try {
            // Visits where assigned_role is BILLING and status is OPEN/IN_PROGRESS
            const { data } = await api.get('/reception/visits/?assigned_role=BILLING&status=OPEN');
            setPendingVisits(data.results || data || []);
        } catch (err) {
            console.error('Failed to load pending bills', err);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const fetchStats = async (showLoading = false) => {
        if (showLoading) setLoading(true);
        try {
            const { data } = await api.get('/billing/stats/');
            setStats(data);
        } catch (err) {
            console.error('Failed to load billing stats', err);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const fetchMetadata = async () => {
        try {
            const [docRes, patRes, stockRes] = await Promise.all([
                api.get(`users/management/doctors/`),
                api.get(`reception/patients/`),
                api.get(`pharmacy/stock/`)
            ]);
            setDoctors(Array.isArray(docRes.data) ? docRes.data : docRes.data.results);
            setPatients(Array.isArray(patRes.data) ? patRes.data : patRes.data.results);
            setPharmacyStock(Array.isArray(stockRes.data) ? stockRes.data : stockRes.data.results);
        } catch (err) { console.error(err); }
    };

    // --- Logic ---
    const handleBillNow = async (visit) => {
        const patId = (visit.patient && typeof visit.patient === 'object') ? visit.patient.id : visit.patient;
        const patientObj = patients.find(p => p.id === patId);
        const patientName = visit.patient_name || (patientObj ? patientObj.full_name : "Unknown");

        let doctorToSet = visit.doctor || "";
        if (!doctorToSet && visit.doctor_name) {
            const foundDoctor = doctors.find(d => `Dr. ${d.first_name} ${d.last_name}`.toLowerCase().includes(visit.doctor_name.toLowerCase()));
            if (foundDoctor) doctorToSet = foundDoctor.id;
        }

        const existing = invoices.find(inv => (inv.visit === visit.id || inv.visit === visit.v_id) && inv.payment_status === 'PENDING');
        if (existing) {
            handleEditInvoice(existing);
            return;
        }

        const newFormData = {
            patient_name: patientName,
            doctor_display_name: visit.doctor_name || "Not Assigned",
            visit: visit.id || visit.v_id,
            doctor: doctorToSet,
            payment_status: "PENDING",
            items: []
        }

        const isPharmacyVisit = visit.vitals && visit.vitals.note === 'Auto-created from Pharmacy Manual Sale';
        if (visit.doctor_name && visit.doctor_name !== "Not Assigned" && !isPharmacyVisit) {
            const fee = visit.consultation_fee ? parseFloat(visit.consultation_fee) : 500;
            newFormData.items.push({ dept: "CONSULTATION", description: "General Consultation Fee", qty: 1, unit_price: fee, amount: fee, hsn: "", batch: "", gst_percent: 0, expiry: "", dosage: "", duration: "" });
        }

        if (visit.pharmacy_items && visit.pharmacy_items.length > 0) {
            console.log("=== PHARMACY ITEMS FROM BACKEND ===");
            visit.pharmacy_items.forEach((item, idx) => {
                console.log(`Item ${idx + 1}: ${item.name}`);
                console.log(`  - qty: ${item.qty}`);
                console.log(`  - unit_price: ${item.unit_price}`);
                console.log(`  - amount: ${item.amount}`);
                console.log(`  - gst: ${item.gst}%`);

                // Note: pharmacy_items from backend are already at tablet level prices if processed by PharmacySale
                newFormData.items.push({
                    dept: "PHARMACY", description: item.name, qty: item.qty, unit_price: parseFloat(item.unit_price), amount: parseFloat(item.amount),
                    hsn: item.hsn || "", batch: item.batch || "", gst_percent: item.gst || 0, expiry: "", dosage: item.dosage || "", duration: item.duration || ""
                });
            });
            console.log("=== END PHARMACY ITEMS ===");
        } else if (newFormData.items.length === 0) {
            newFormData.items.push({ dept: "PHARMACY", description: "", qty: 1, unit_price: 0, amount: 0, hsn: "", batch: "", gst_percent: 0, expiry: "", dosage: "", duration: "" });
        }

        setFormData(newFormData);
        setSelectedPatientId(patId);
        setShowModal(true);
    };

    const handleImportPrescription = async (overridePatientId = null) => {
        const patId = overridePatientId || selectedPatientId;
        if (!patId) return showToast('error', "No patient selected.");

        try {
            const vId = ((typeof formData.visit === 'object') ? formData.visit.id : formData.visit);

            // 1. Fetch Doctor Notes
            let notesData = [];
            try {
                const res = vId ? await api.get(`medical/doctor-notes/?visit=${vId}`) : await api.get(`medical/doctor-notes/?visit__patient=${patId}`);
                notesData = res.data.results || (Array.isArray(res.data) ? res.data : []);
            } catch (e) { console.warn("Failed to fetch notes:", e); }

            // 2. Fetch Fresh Visit Details (CRITICAL for getting latest Pharmacy prices)
            let freshPharmacySales = [];
            if (vId) {
                try {
                    console.log(`Fetching fresh visit data for ID: ${vId}`);
                    const visitRes = await api.get(`reception/visits/${vId}/`);
                    if (visitRes.data && visitRes.data.pharmacy_items) {
                        freshPharmacySales = visitRes.data.pharmacy_items;
                        console.log("Fresh pharmacy items loaded:", freshPharmacySales);
                    }
                } catch (e) {
                    console.warn("Failed to fetch fresh visit details, utilizing fallback:", e);
                    // Fallback to existing formData.visit data
                    if (formData.visit && formData.visit.pharmacy_items) {
                        freshPharmacySales = formData.visit.pharmacy_items;
                    }
                }
            } else if (formData.visit && formData.visit.pharmacy_items) {
                freshPharmacySales = formData.visit.pharmacy_items;
            }

            const newItems = [...formData.items];
            const addedMedNames = new Set(newItems.map(i => i.description.toLowerCase()));

            // A. Process Prescription Items (if any)
            if (notesData.length > 0) {
                const lastNote = notesData[0];
                if (lastNote.prescription) {
                    const presItems = Array.isArray(lastNote.prescription)
                        ? lastNote.prescription
                        : Object.entries(lastNote.prescription).map(([name, details]) => ({ name, details }));

                    presItems.forEach(p => {
                        const medName = (p.name || "").trim();
                        if (!medName || addedMedNames.has(medName.toLowerCase())) return;

                        let qty = 1;
                        if (p.details) {
                            const qtyMatch = p.details.match(/Qty:\s*(\d+)/i);
                            if (qtyMatch && qtyMatch[1]) qty = parseInt(qtyMatch[1], 10);
                        }

                        // Match with Pharmacy Sale
                        const pharmacyRecord = freshPharmacySales.find(i => i.name.toLowerCase() === medName.toLowerCase());
                        const stockItem = pharmacyStock.find(s => s.name.toLowerCase() === medName.toLowerCase());

                        let unitPrice = 0, amount = 0, gstPercent = 0;
                        let hsn = "", batch = "", expiry = "";

                        if (pharmacyRecord) {
                            unitPrice = parseFloat(pharmacyRecord.unit_price) || 0;
                            qty = pharmacyRecord.qty || qty; // Use actual billed qty if available
                            gstPercent = pharmacyRecord.gst || 0;
                            hsn = pharmacyRecord.hsn || "";
                            batch = pharmacyRecord.batch || "";
                            expiry = pharmacyRecord.expiry || ""; // Assuming serializer sends this?
                        } else if (stockItem) {
                            const tps = stockItem.tablets_per_strip || 1;
                            unitPrice = (parseFloat(stockItem.mrp) || 0) / tps;
                            gstPercent = stockItem.gst_percent || 0;
                            hsn = stockItem.hsn || "";
                            batch = stockItem.batch_no || "";
                            expiry = stockItem.expiry_date || "";
                        }

                        amount = (unitPrice * qty).toFixed(2);

                        newItems.push({
                            dept: "PHARMACY",
                            description: medName,
                            qty: qty,
                            unit_price: unitPrice,
                            amount: amount,
                            hsn: hsn,
                            batch: batch,
                            gst_percent: gstPercent,
                            expiry: expiry,
                            dosage: p.details || "",
                            duration: ""
                        });
                        addedMedNames.add(medName.toLowerCase());
                    });
                }
            }

            // B. Process Remaining Pharmacy Items (Manual Sales or Non-Prescribed)
            if (freshPharmacySales.length > 0) {
                freshPharmacySales.forEach(item => {
                    const medName = item.name;
                    if (addedMedNames.has(medName.toLowerCase())) return; // Already added via prescription match

                    newItems.push({
                        dept: "PHARMACY",
                        description: medName,
                        qty: item.qty,
                        unit_price: parseFloat(item.unit_price) || 0,
                        amount: parseFloat(item.amount) || 0,
                        hsn: item.hsn || "",
                        batch: item.batch || "",
                        gst_percent: item.gst || 0,
                        expiry: "", // Serializer doesn't pass expiry yet?
                        dosage: item.dosage || "",
                        duration: item.duration || ""
                    });
                    addedMedNames.add(medName.toLowerCase());
                });
            }

            setFormData(prev => ({ ...prev, items: newItems }));
            showToast('success', "Imported prescription and pharmacy data.");
        } catch (err) {
            console.error("Import prescription error:", err);
            showToast('error', "Failed to import.");
        }
    };

    const calculateSubtotal = (items) => items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    const handleCreateInvoice = async () => {
        const subtotal = calculateSubtotal(formData.items);
        const invoiceData = {
            patient_name: formData.patient_name,
            payment_status: formData.payment_status,
            total_amount: subtotal.toFixed(2),
            items: formData.items.map(({ id, created_at, updated_at, ...rest }) => rest),
            visit: formData.visit
        };

        try {
            if (formData.id) await api.patch(`billing/invoices/${formData.id}/`, invoiceData);
            else await api.post(`billing/invoices/`, invoiceData);
            setShowModal(false);
            setFormData({ patient_name: "", visit: null, doctor: "", payment_status: "PENDING", items: [] });
            fetchInvoices(); fetchStats(); fetchPendingVisits();
            showToast('success', "Invoice saved successfully!");
        } catch (err) { showToast('error', "Failed to save invoice."); }
    };

    const handleEditInvoice = (invoice) => {
        setFormData({
            id: invoice.id,
            patient_name: invoice.patient_name,
            visit: invoice.visit,
            doctor: formData.doctor,
            doctor_display_name: invoice.doctor_display_name || "",
            payment_status: invoice.payment_status,
            items: invoice.items.map(i => ({ ...i }))
        });
        if (invoice.patient_id) setSelectedPatientId(invoice.patient_id);
        setShowModal(true);
    };

    const handleMarkAsPaid = async (invoice) => {
        const isConfirmed = await confirm({
            title: 'Confirm Payment',
            message: `Mark invoice #${invoice.id?.toString().slice(0, 8)} as PAID?`,
            type: 'success',
            confirmText: 'Mark Paid'
        });
        if (!isConfirmed) return;
        try {
            await api.patch(`billing/invoices/${invoice.id}/`, { payment_status: 'PAID' });
            fetchInvoices(); fetchStats();
            showToast('success', "Marked as PAID.");
        } catch (error) { showToast('error', "Failed to update status."); }
    };

    // --- Global Print Handler ---
    const handlePrint = () => {
        window.print();
    };

    // --- Status Badge ---
    const StatusBadge = ({ status }) => {
        const isPaid = status === "PAID";
        return (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border shadow-sm ${isPaid ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"}`}>
                {isPaid ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                {status}
            </span>
        );
    };

    return (
        <div className="p-6 md:p-8 max-w-[1600px] mx-auto min-h-screen bg-[#F8FAFC] font-sans text-slate-900 relative print:p-0 print:m-0 print:min-h-0 print:bg-white print:overflow-visible">

            <div className="no-print space-y-8">
                {/* --- Header --- */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-outfit uppercase">Billing & Finance</h1>
                        <div className="flex items-center gap-2 text-slate-500 font-medium mt-1 text-sm">
                            <span>Financial Overview</span>
                            <div className="w-1 h-1 rounded-full bg-slate-300" />
                            <span>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-bold text-xs uppercase tracking-wider transition-colors shadow-sm">
                            <Download size={16} /> Reports
                        </button>
                        <button
                            onClick={() => {
                                setFormData({
                                    patient_name: "", visit: null, doctor: "", payment_status: "PENDING",
                                    items: [{ dept: "PHARMACY", description: "", qty: 1, unit_price: 0, amount: 0 }]
                                });
                                setSelectedPatientId(null);
                                setShowModal(true);
                            }}
                            className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-blue-600 font-bold text-xs uppercase tracking-wider shadow-xl shadow-slate-900/20 transition-all active:scale-[0.98]"
                        >
                            <Plus size={16} /> New Invoice
                        </button>
                    </div>
                </div>

                {/* --- Stats Cards --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    {[
                        { label: "Today's Revenue", value: `₹${(stats?.revenue_today || 0).toLocaleString()}`, icon: IndianRupee, color: "blue" },
                        { label: "Pending Collection", value: `₹${(stats?.pending_amount || 0).toLocaleString()}`, icon: Wallet, color: "amber" },
                        { label: "Invoices Generated", value: stats?.invoices_today || 0, icon: FileText, color: "emerald" },
                    ].map((stat, i) => (
                        <div key={i} className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                                <h3 className="text-3xl font-black text-slate-900 font-outfit">{stat.value}</h3>
                            </div>
                            <div className={`p-4 rounded-2xl bg-${stat.color}-50 text-${stat.color}-600`}>
                                <stat.icon size={24} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* --- Pending Queue (Kanban Style) --- */}
                {pendingVisits.length > 0 && (
                    <div className="mb-10">
                        <div className="flex items-center gap-2 mb-4 px-1">
                            <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg"><Sparkles size={16} /></div>
                            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Ready for Billing</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {pendingVisits.map(visit => (
                                <div key={visit.id} onClick={() => handleBillNow(visit)} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md cursor-pointer transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-[3rem] -mr-8 -mt-8 z-0"></div>
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-sm">
                                                    {visit.patient_name?.[0] || "?"}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-900 text-sm line-clamp-1">{visit.patient_name}</h4>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">ID: {(visit.id || "").toString().slice(0, 6)}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-1 mt-3">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-slate-500 font-medium">Consultation</span>
                                                <span className="font-bold text-slate-700">₹{visit.consultation_fee || 500}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-slate-500 font-medium">Pharmacy</span>
                                                <span className="font-bold text-slate-700">
                                                    ₹{(visit.pharmacy_items || []).reduce((sum, i) => sum + parseFloat(i.amount), 0).toFixed(0)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded">PENDING</span>
                                            <div className="flex items-center gap-1 text-slate-400 group-hover:text-blue-500 text-xs font-bold">
                                                <span>Bill Now</span>
                                                <ChevronRight size={14} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- Invoice List --- */}
                <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                            <FileText size={16} className="text-slate-400" /> Recent Invoices
                        </h3>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search invoices..."
                                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-64 transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Invoice ID</th>
                                    <th className="px-6 py-4">Patient</th>
                                    <th className="px-6 py-4">Amount</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {invoices.filter(inv => (inv.patient_name || "").toLowerCase().includes(searchTerm.toLowerCase()) || (inv.id || "").toString().includes(searchTerm)).map((invoice) => (
                                    <tr key={invoice.id} className="hover:bg-slate-50/80 transition-colors group">
                                        <td className="px-6 py-4 font-mono text-xs font-bold text-slate-500">#{invoice.id?.toString().slice(0, 8).toUpperCase()}</td>
                                        <td className="px-6 py-4 font-bold text-slate-900">{invoice.patient_name || "Guest"}</td>
                                        <td className="px-6 py-4 font-bold text-slate-700">₹{invoice.total_amount}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide border ${invoice.payment_status === 'PAID' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
                                                }`}>
                                                {invoice.payment_status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-medium text-slate-500">{new Date(invoice.created_at).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                                            {/* IMPORTANT: Buttons are always visible now, no group-hover opacity */}
                                            {invoice.payment_status === 'PENDING' && (
                                                <button onClick={() => handleMarkAsPaid(invoice)} className="text-emerald-500 hover:text-emerald-700 p-2 rounded-lg hover:bg-emerald-50 border border-emerald-100">
                                                    <CreditCard size={16} />
                                                </button>
                                            )}
                                            <button className="text-slate-400 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50" onClick={() => handleEditInvoice(invoice)}>
                                                <Printer size={16} />
                                            </button>
                                            <button onClick={() => handleEditInvoice(invoice)} className="text-slate-400 hover:text-indigo-600 p-2 rounded-lg hover:bg-indigo-50">
                                                <Eye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* --- Premium Modal (Invoice Preview & Edit) --- */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print-modal">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-5xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                            {/* Modal Header (Hide on Print) */}
                            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center no-print">
                                <div>
                                    <h2 className="text-xl font-black text-slate-900 font-outfit uppercase tracking-tight">{formData.id ? 'Edit Invoice' : 'New Invoice'}</h2>
                                    <p className="text-xs text-slate-500 font-bold mt-1">Ref: {formData.id ? `#${formData.id.slice(0, 8)}` : 'Draft'}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={handlePrint} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors">
                                        <Printer size={20} />
                                    </button>
                                    <button onClick={() => setShowModal(false)} className="p-2 bg-white rounded-full hover:bg-red-50 hover:text-red-500 transition-colors shadow-sm">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body (Printable Area) */}
                            <div className="flex-1 overflow-y-auto p-12 bg-white print-content" id="invoice-print-area">

                                {/* Invoice Header */}
                                <div className="flex justify-between items-start mb-12">
                                    <div>
                                        <h1 className="text-3xl font-black text-slate-900 tracking-widest uppercase">REVIVE CLINIC</h1>
                                        <p className="text-xs font-bold text-slate-500 tracking-widest mt-1">HEALTH & RESEARCH CENTRE</p>
                                        <div className="mt-4 text-xs text-slate-400 space-y-1">
                                            <p>Pallikkunnu Road, Anjukunnu</p>
                                            <p>Ph: 9496851538</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-4xl font-black text-slate-200">INVOICE</div>
                                        <p className="text-sm font-bold text-slate-900 mt-2">#{formData.id ? formData.id.slice(0, 8).toUpperCase() : 'DRAFT'}</p>
                                        <p className="text-xs text-slate-500">{new Date().toLocaleDateString()}</p>
                                    </div>
                                </div>

                                {/* Patient Info Grid */}
                                <div className="grid grid-cols-2 gap-12 mb-12">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Billed To</label>
                                        <div className="text-lg font-bold text-slate-900">{formData.patient_name || "Unknown Patient"}</div>
                                        <div className="text-xs text-slate-500 mt-1">Patient ID: {selectedPatientId || 'N/A'}</div>
                                    </div>
                                    <div className="text-right">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Doctor</label>
                                        <div className="text-lg font-bold text-slate-900">{formData.doctor_display_name || "General"}</div>
                                    </div>
                                </div>

                                {/* Items Table */}
                                <div className="mb-12">
                                    <table className="w-full text-left text-sm">
                                        <thead className="border-b-2 border-slate-900">
                                            <tr>
                                                <th className="py-3 text-[10px] font-black text-slate-900 uppercase tracking-widest w-16">#</th>
                                                <th className="py-3 text-[10px] font-black text-slate-900 uppercase tracking-widest">Description</th>
                                                <th className="py-3 text-[10px] font-black text-slate-900 uppercase tracking-widest w-24 text-center">Qty</th>
                                                <th className="py-3 text-[10px] font-black text-slate-900 uppercase tracking-widest w-24 text-center">GST %</th>
                                                <th className="py-3 text-[10px] font-black text-slate-900 uppercase tracking-widest w-32 text-right">Price</th>
                                                <th className="py-3 text-[10px] font-black text-slate-900 uppercase tracking-widest w-32 text-right">Amount</th>
                                                <th className="py-3 w-10 no-print"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {formData.items.map((item, idx) => (
                                                <tr key={idx} className="group">
                                                    <td className="py-4 text-slate-400 font-mono">{idx + 1}</td>
                                                    <td className="py-4">
                                                        <input
                                                            className="w-full bg-transparent outline-none font-bold text-slate-700 placeholder:text-slate-300 print:placeholder-transparent"
                                                            placeholder="Item Name / Service"
                                                            value={item.description}
                                                            onChange={(e) => {
                                                                const newItems = [...formData.items];
                                                                newItems[idx].description = e.target.value;
                                                                setFormData({ ...formData, items: newItems });
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="py-4 text-center">
                                                        <input
                                                            type="number" className="w-full bg-transparent text-center font-bold outline-none"
                                                            value={item.qty}
                                                            onChange={(e) => {
                                                                const qty = parseInt(e.target.value) || 0;
                                                                const newItems = [...formData.items];
                                                                newItems[idx] = { ...item, qty, amount: (qty * item.unit_price).toFixed(2) };
                                                                setFormData({ ...formData, items: newItems });
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="py-4 text-center">
                                                        <input
                                                            type="number" className="w-full bg-transparent text-center font-medium outline-none text-slate-500"
                                                            value={item.gst_percent}
                                                            placeholder="0"
                                                            onChange={(e) => {
                                                                const gst = parseFloat(e.target.value) || 0;
                                                                const newItems = [...formData.items];
                                                                newItems[idx] = { ...item, gst_percent: gst };
                                                                setFormData({ ...formData, items: newItems });
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="py-4 text-right">
                                                        <input
                                                            type="number" className="w-full bg-transparent text-right font-medium outline-none"
                                                            value={item.unit_price}
                                                            onChange={(e) => {
                                                                const price = parseFloat(e.target.value) || 0;
                                                                const newItems = [...formData.items];
                                                                newItems[idx] = { ...item, unit_price: price, amount: (item.qty * price).toFixed(2) };
                                                                setFormData({ ...formData, items: newItems });
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="py-4 text-right font-bold text-slate-900">₹{item.amount}</td>
                                                    <td className="py-4 text-center no-print">
                                                        <button onClick={() => {
                                                            const newItems = formData.items.filter((_, i) => i !== idx);
                                                            setFormData({ ...formData, items: newItems });
                                                        }} className="text-slate-300 hover:text-red-500 transition-colors"><X size={16} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <button
                                        onClick={() => setFormData(prev => ({ ...prev, items: [...prev.items, { dept: "PHARMACY", description: "", qty: 1, unit_price: 0, amount: 0 }] }))}
                                        className="mt-4 text-xs font-bold text-blue-600 hover:underline uppercase tracking-wide no-print flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Add Item Line
                                    </button>
                                </div>

                                {/* Footer Totals */}
                                <div className="flex justify-end">
                                    <div className="w-64 space-y-3">
                                        <div className="flex justify-between text-sm font-medium text-slate-500">
                                            <span>Subtotal</span>
                                            <span>₹{calculateSubtotal(formData.items).toFixed(2)}</span>
                                        </div>
                                        <div className="border-t-2 border-slate-900 pt-3 flex justify-between items-end">
                                            <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Total</span>
                                            <span className="text-3xl font-black text-slate-900 leading-none">₹{Math.ceil(calculateSubtotal(formData.items)).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer (Actions) */}
                            <div className="p-6 border-t border-slate-100 bg-slate-50/80 flex justify-between items-center no-print">
                                <div>
                                    <button onClick={() => handleImportPrescription()} disabled={!selectedPatientId} className={`text-xs font-bold flex items-center gap-2 ${selectedPatientId ? 'text-blue-600 hover:text-blue-800' : 'text-slate-300 cursor-not-allowed'}`}>
                                        <Import size={16} /> Import from Prescription
                                    </button>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setShowModal(false)} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 transition-all">Cancel</button>
                                    <button onClick={handleCreateInvoice} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold shadow-xl shadow-slate-900/20 hover:bg-blue-600 transition-all flex items-center gap-2">
                                        <CheckCircle2 size={18} /> {formData.id ? 'Update Invoice' : 'Generate Invoice'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default Billing;