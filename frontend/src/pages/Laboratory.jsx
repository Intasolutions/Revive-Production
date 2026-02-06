import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity,
    Search,
    Filter,
    Plus,
    X,
    ChevronDown,
    ChevronRight,
    TestTube2,
    FlaskConical,
    ClipboardList,
    AlertCircle,
    CheckCircle2,
    Clock,
    FileText,
    Printer,
    Trash2,
    MapPin, Phone, Microscope, Pencil, AlertTriangle, User
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
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [labTests, setLabTests] = useState([]);

    // Group charges by visit AND distinct request times (Session-based grouping)
    const groupedCharges = React.useMemo(() => {
        const visitBuckets = {};
        chargesData.results.forEach(charge => {
            const visitId = charge.visit?.id || charge.visit || `unknown_${charge.patient_name}`;
            if (!visitBuckets[visitId]) visitBuckets[visitId] = [];
            visitBuckets[visitId].push(charge);
        });

        const finalGroups = [];

        Object.values(visitBuckets).forEach(visitCharges => {
            // Sort: Oldest to Newest to find gaps
            visitCharges.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            let currentSubGroup = [];

            visitCharges.forEach((charge, idx) => {
                if (idx === 0) {
                    currentSubGroup.push(charge);
                    return;
                }

                const prevCharge = visitCharges[idx - 1];
                const timeDiff = new Date(charge.created_at) - new Date(prevCharge.created_at);
                // 45 Minute threshold for "Same Request Batch"
                const isSameBatch = timeDiff < (45 * 60 * 1000);

                if (isSameBatch) {
                    currentSubGroup.push(charge);
                } else {
                    finalGroups.push(buildGroup(currentSubGroup));
                    currentSubGroup = [charge];
                }
            });
            if (currentSubGroup.length > 0) finalGroups.push(buildGroup(currentSubGroup));
        });

        function buildGroup(items) {
            const first = items[0];
            const allCompleted = items.every(i => i.status === 'COMPLETED' || i.status === 'CANCELLED');
            const anyPending = items.some(i => i.status === 'PENDING');

            let status = 'CANCELLED';
            if (allCompleted) status = 'COMPLETED';
            else if (anyPending) status = 'PENDING';

            // Unique Key: VisitID + Time of first item (ensures uniqueness for separate batches)
            const uniqueKey = `${first.visit?.id || first.visit}_${new Date(first.created_at).getTime()}`;

            return {
                uniqueKey,
                visitId: first.visit?.id || first.visit,
                visitObj: first.visit,
                patient_name: first.patient_name,
                registration_number: first.registration_number,
                patient_age: first.patient_age,
                patient_sex: first.patient_sex,
                doctor_name: first.doctor_name,
                created_at: first.created_at,
                status,
                items
            };
        }

        // Sort final groups by newest first (for display)
        return finalGroups.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }, [chargesData.results]);

    // Supplier State
    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [supplierForm, setSupplierForm] = useState({ supplier_name: '', phone: '', gst_no: '', address: '' });

    // Test Catalog Form
    const [showTestModal, setShowTestModal] = useState(false);
    const [editingTestId, setEditingTestId] = useState(null);
    const [testCatalogForm, setTestCatalogForm] = useState({ name: '', sub_name: '', category: 'HAEMATOLOGY', price: '', gender: 'B', normal_range: '', parameters: [], required_items: [] });

    // Modals
    const [showModal, setShowModal] = useState(false); // Add Test Modal
    const [showInventoryModal, setShowInventoryModal] = useState(false); // Add Inventory Modal
    const [showResultModal, setShowResultModal] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
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
    const [inventoryForm, setInventoryForm] = useState({ item_name: '', category: 'REAGENT', qty: 0, cost_per_unit: '', reorder_level: 10, items_per_pack: 1, num_packs: 0 });
    const [visitSearch, setVisitSearch] = useState([]);
    const [visitQuery, setVisitQuery] = useState('');
    const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
    const [categories, setCategories] = useState([]);

    // --- Manual Stock In State ---
    const [showManualStockModal, setShowManualStockModal] = useState(false);
    const [manualInvoice, setManualInvoice] = useState({
        supplier_name: '', supplier_invoice_no: '', invoice_date: new Date().toISOString().split('T')[0],
        purchase_type: 'CASH', items: [],
        cash_discount: 0, courier_charge: 0
    });
    const [labSuppliers, setLabSuppliers] = useState([]);
    const [manualProductSearch, setManualProductSearch] = useState({ rowIdx: null, results: [] });
    // Fetch Lab Suppliers on Mount
    useEffect(() => {
        api.get('lab/suppliers/').then(r => setLabSuppliers(r.data.results || [])).catch(console.error);
    }, []);

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
            fetchCategories();
        } else if (activeTab === 'inventory') {
            fetchInventory();
            fetchCategories();
        } else if (activeTab === 'categories') {
            fetchCategories();
        } else if (activeTab === 'suppliers') {
            fetchLabSuppliers();
        } else {
            fetchInventory();
        }
    }, [activeTab, page, globalSearch, statusFilter, pageSize]);

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
            let url = `lab/charges/?page=${page}&search=${globalSearch || ''}${statusQuery}`;

            if (pageSize === 'all') {
                url += `&page_size=10000`;
            } else {
                url += `&page_size=${pageSize}`;
            }

            const { data } = await api.get(url);
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

    const fetchCategories = async () => {
        try {
            const { data } = await api.get('lab/categories/');
            setCategories(data.results || data || []);
        } catch (err) { console.error("Failed to load categories", err); }
    };

    const fetchLabSuppliers = async () => {
        try {
            const { data } = await api.get('lab/suppliers/');
            setLabSuppliers(data.results || data || []);
        } catch (err) { console.error("Failed to load suppliers", err); }
    };

    const handleSaveSupplier = async (e) => {
        e.preventDefault();
        try {
            if (supplierForm.id) {
                await api.patch(`lab/suppliers/${supplierForm.id}/`, supplierForm);
                showToast('success', 'Supplier Updated');
            } else {
                await api.post('lab/suppliers/', supplierForm);
                showToast('success', 'Supplier Created');
            }
            setShowSupplierModal(false);
            setSupplierForm({ supplier_name: '', phone: '', gst_no: '', address: '' });
            fetchLabSuppliers();
        } catch (err) { showToast('error', 'Failed to save supplier'); }
    };

    const handleDeleteSupplier = async (id) => {
        const isConfirmed = await confirm({
            title: 'Delete Supplier?',
            message: 'Are you sure you want to delete this supplier?',
            type: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        });
        if (!isConfirmed) return;

        try {
            await api.delete(`lab/suppliers/${id}/`);
            showToast('success', 'Supplier Deleted');
            fetchLabSuppliers();
        } catch (err) { showToast('error', 'Failed to delete supplier'); }
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
            setTestCatalogForm({ name: '', sub_name: '', category: 'HAEMATOLOGY', price: '', gender: 'B', normal_range: '', parameters: [], required_items: [] });
            fetchLabTests();
        } catch (err) { showToast('error', 'Failed to save test'); }
    };

    const handleEditTest = (test) => {
        setTestCatalogForm({
            name: test.name,
            sub_name: test.sub_name || '',
            category: test.category,
            price: test.price,
            gender: test.gender || 'B',
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

    // --- Manual Stock In Actions ---
    const handleManualItemChange = (index, field, value) => {
        const updated = [...manualInvoice.items];
        updated[index][field] = value;

        // Auto-calculate Qty based on Packs & Items/Pack
        if (field === 'num_packs' || field === 'items_per_pack') {
            const packs = field === 'num_packs' ? value : (updated[index].num_packs || 0);
            const perPack = field === 'items_per_pack' ? value : (updated[index].items_per_pack || 1);
            updated[index].qty = parseInt(packs) * parseInt(perPack);
        }

        setManualInvoice({ ...manualInvoice, items: updated });
    };

    const addManualRow = () => {
        setManualInvoice(prev => ({
            ...prev,
            items: [...prev.items, {
                item_name: '', batch_no: '', expiry_date: '',
                qty: 1, unit_cost: 0, mrp: 0,
                gst_percent: 0, discount_percent: 0,
                unit: 'units', is_liquid: false, manufacturer: '',
                pack_size: '', items_per_pack: 1, num_packs: 1
            }]
        }));
    };

    const removeManualItem = (index) => {
        setManualInvoice(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
    };

    const searchProductsForManual = async (query, rowIdx) => {
        if (!query) { setManualProductSearch({ rowIdx: null, results: [] }); return; }
        try {
            const { data } = await api.get(`lab/inventory/?search=${query}`);
            setManualProductSearch({ rowIdx, results: data.results || [] });
        } catch (err) { console.error(err); }
    };

    const selectProductForManualRow = (rowIdx, product) => {
        const updated = [...manualInvoice.items];
        updated[rowIdx] = {
            ...updated[rowIdx],
            item_name: product.item_name,
            unit: product.unit || 'units',
            is_liquid: product.is_liquid || false,
            manufacturer: product.manufacturer || '',
            unit_cost: product.cost_per_unit || 0,
            mrp: product.mrp || 0,
            gst_percent: product.gst_percent || 0,
            discount_percent: product.discount_percent || 0,
            items_per_pack: product.items_per_pack || 1,
            num_packs: 1,
            qty: 1 * (product.items_per_pack || 1)
        };
        setManualInvoice({ ...manualInvoice, items: updated });
        setManualProductSearch({ rowIdx: null, results: [] });
    };

    const submitManualPurchase = async () => {
        if (!manualInvoice.supplier_name || manualInvoice.items.length === 0) return showToast('error', 'Supplier and Items are required');

        try {
            // Find Supplier ID
            const supplierObj = labSuppliers.find(s => s.supplier_name === manualInvoice.supplier_name);
            if (!supplierObj) return showToast('error', 'Invalid Supplier Selected');

            await api.post('lab/purchases/', {
                supplier: supplierObj.id,
                supplier_invoice_no: manualInvoice.supplier_invoice_no || 'INV-NA',
                invoice_date: manualInvoice.invoice_date,
                purchase_type: manualInvoice.purchase_type,
                items: manualInvoice.items.map(item => {
                    // Convert Pack Rate to Unit Cost for Backend
                    const packRate = parseFloat(item.unit_cost) || 0;
                    const itemsPerPack = parseInt(item.items_per_pack) || 1;
                    const totalQty = parseInt(item.qty) || (parseInt(item.num_packs || 0) * itemsPerPack);
                    const perUnitCost = packRate / itemsPerPack;

                    return {
                        ...item,
                        expiry_date: item.expiry_date || new Date().toISOString().split('T')[0],
                        qty: totalQty,
                        unit_cost: perUnitCost,
                        mrp: parseFloat(item.mrp) || 0,
                        gst_percent: parseFloat(item.gst_percent) || 0,
                        discount_percent: parseFloat(item.discount_percent) || 0
                    };
                }),
                cash_discount: manualInvoice.cash_discount,
                courier_charge: manualInvoice.courier_charge
            });

            showToast('success', 'Purchase Saved Successfully');
            setShowManualStockModal(false);
            setManualInvoice({
                supplier_name: '', supplier_invoice_no: '', invoice_date: new Date().toISOString().split('T')[0],
                purchase_type: 'CASH', items: [],
                cash_discount: 0, courier_charge: 0
            });
            fetchInventory();
        } catch (err) {
            showToast('error', err.response?.data?.error || 'Failed to save purchase');
        }
    };

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
                    sub_name: test.sub_name,
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
                cost: 0, // Per user request: Only update qty, ignore cost
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
            // Calculate final Qty if packs are used
            const finalQty = inventoryForm.num_packs > 0
                ? parseInt(inventoryForm.num_packs) * parseInt(inventoryForm.items_per_pack)
                : parseInt(inventoryForm.qty);

            const payload = {
                ...inventoryForm,
                qty: finalQty
            };

            if (inventoryForm.id) {
                // Edit Mode
                await api.patch(`lab/inventory/${inventoryForm.id}/`, payload);
                showToast('success', 'Item Updated Successfully');
            } else {
                // Create Mode
                await api.post('lab/inventory/', payload);
                showToast('success', 'New Item Added Successfully');
            }
            setShowInventoryModal(false);
            setInventoryForm({ item_name: '', category: 'REAGENT', qty: 0, cost_per_unit: '', reorder_level: 10, items_per_pack: 1, num_packs: 0 });
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
            reorder_level: item.reorder_level,
            items_per_pack: item.items_per_pack || 1,
            num_packs: item.items_per_pack > 1 ? Math.floor(item.qty / item.items_per_pack) : 0
        });
        setShowInventoryModal(true);
    };

    const handleAddCategory = async (e) => {
        e.preventDefault();
        try {
            await api.post('lab/categories/', categoryForm);
            showToast('success', 'Category Created Successfully');
            setShowCategoryModal(false);
            setCategoryForm({ name: '', description: '' });
            fetchCategories();
        } catch (err) { showToast('error', 'Failed to create category'); }
    };

    const handleDeleteCategory = async (id) => {
        if (!confirm("Delete this category?")) return;
        try {
            await api.delete(`lab/categories/${id}/`);
            showToast('success', 'Category Deleted');
            fetchCategories();
        } catch (err) { showToast('error', 'Failed to delete category'); }
    };



    const handleOpenPrintModal = async (groupOrCharge) => {
        // If it's a group, use it directly
        if (groupOrCharge.items) {
            setPrintCharge({
                ...groupOrCharge.items[0], // Use first item for patient details
                tests: groupOrCharge.items, // All tests in group
                isGroup: true,
                groupStatus: groupOrCharge.status
            });
        } else {
            // It's a single charge (fallback) or from a different context
            setPrintCharge({
                ...groupOrCharge,
                tests: [groupOrCharge],
                isGroup: false,
                groupStatus: groupOrCharge.status
            });
        }
        setShowPrintModal(true);
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
                            {['queue', 'inventory', 'test_catalog', 'categories', 'suppliers'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`pb-1 text-sm font-bold transition-all border-b-2 ${activeTab === tab ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                                >
                                    {tab === 'queue' ? 'Diagnostic Queue' : tab === 'inventory' ? 'Lab Inventory' : tab === 'test_catalog' ? 'Test Catalog' : tab === 'suppliers' ? 'Suppliers' : 'Categories'}
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
                            <div className="flex gap-3">
                                <button onClick={() => { setShowManualStockModal(true); if (manualInvoice.items.length === 0) addManualRow(); }} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95">
                                    <ClipboardList size={18} /> Manual Stock-In
                                </button>
                            </div>
                        ) : activeTab === 'test_catalog' ? (
                            <button onClick={() => { setEditingTestId(null); setTestCatalogForm({ name: '', sub_name: '', category: 'HAEMATOLOGY', price: '', normal_range: '', parameters: [] }); setShowTestModal(true); }} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95">
                                <Plus size={18} /> Add Test
                            </button>
                        ) : activeTab === 'suppliers' ? (
                            <button onClick={() => { setSupplierForm({ supplier_name: '', phone: '', gst_no: '', address: '' }); setShowSupplierModal(true); }} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95">
                                <Plus size={18} /> Add Supplier
                            </button>
                        ) : (
                            <button onClick={() => setShowCategoryModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-purple-600/20 hover:bg-purple-700 transition-all active:scale-95">
                                <Plus size={18} /> Add Category
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

                                        {/* Actual Lab Charges - GROUPED */}
                                        {groupedCharges.map(group => (
                                            <tr key={group.uniqueKey} className="hover:bg-slate-50 transition-colors group align-top border-b border-slate-50">
                                                {/* Patient Info */}
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center font-bold font-mono text-xs">
                                                            {group.registration_number ? group.registration_number.slice(-3) : '---'}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-900">{group.patient_name || 'Anonymous'}</p>
                                                            <p className="text-[10px] font-mono text-slate-400">Reg No: {group.registration_number || 'N/A'}</p>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Tests List */}
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        {group.items.map((test, idx) => (
                                                            <div key={test.lc_id} className="flex items-center gap-2">
                                                                <div className={`w-1.5 h-1.5 rounded-full ${test.status === 'COMPLETED' ? 'bg-emerald-500' : test.status === 'CANCELLED' ? 'bg-red-500' : 'bg-amber-500'}`} />
                                                                <span className={`font-bold text-xs ${test.status === 'COMPLETED' ? 'text-emerald-700' : test.status === 'CANCELLED' ? 'text-red-400 line-through' : 'text-slate-700'}`}>
                                                                    {test.test_name}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>

                                                {/* Age/Sex */}
                                                <td className="px-6 py-4 text-sm font-medium text-slate-600">{group.patient_age}Y / {group.patient_sex}</td>

                                                {/* Ref */}
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-slate-700">Dr. {group.doctor_name || 'Ref'}</span>
                                                        <span className="text-[10px] text-slate-400">{new Date(group.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                </td>

                                                {/* Group Status */}
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide border ${group.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                        group.status === 'CANCELLED' ? 'bg-red-50 text-red-600 border-red-100' :
                                                            'bg-amber-50 text-amber-600 border-amber-100'
                                                        }`}>
                                                        {group.status === 'COMPLETED' && <CheckCircle2 size={12} />}
                                                        {group.status === 'PENDING' && <Clock size={12} />}
                                                        {group.status}
                                                    </span>
                                                </td>

                                                {/* Total Cost */}
                                                <td className="px-6 py-4 font-bold text-slate-900">
                                                    ₹{group.items.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0).toFixed(2)}
                                                </td>

                                                {/* Actions */}
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-2">
                                                        {/* Individual Actions if Pending */}
                                                        {group.status === 'PENDING' && (
                                                            <div className="flex gap-1 flex-wrap">
                                                                {group.items.filter(i => i.status === 'PENDING').map(t => (
                                                                    <React.Fragment key={t.lc_id}>
                                                                        <button
                                                                            onClick={() => handleOpenResultEntry(t)}
                                                                            className="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded hover:bg-blue-100 transition-all border border-blue-100"
                                                                            title={`Enter Result for ${t.test_name}`}
                                                                        >
                                                                            Result: {t.test_name}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleUpdateStatus(t.lc_id, 'CANCELLED')}
                                                                            className="px-2 py-1 bg-red-50 text-red-600 text-[10px] font-bold rounded hover:bg-red-100 transition-all border border-red-100"
                                                                            title={`Cancel ${t.test_name}`}
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </React.Fragment>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Edit Action for Completed Items */}
                                                        {group.status === 'COMPLETED' && (
                                                            <div className="flex gap-1 flex-wrap mb-2">
                                                                {group.items.map(t => (
                                                                    <button
                                                                        key={t.lc_id}
                                                                        onClick={() => handleOpenResultEntry(t)}
                                                                        className="px-2 py-1 bg-purple-50 text-purple-600 text-[10px] font-bold rounded hover:bg-purple-100 transition-all border border-purple-100 flex items-center gap-1"
                                                                        title={`Edit Result for ${t.test_name}`}
                                                                    >
                                                                        <Pencil size={10} />
                                                                        Edit: {t.test_name}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Consolidated Print Action */}
                                                        <button onClick={() => handleOpenPrintModal(group)} className="flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-700 shadow-md transition-all">
                                                            <Printer size={14} />
                                                            {group.status === 'PENDING' ? 'Print Receipt' : 'Print Report'}

                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">

                                {/* Pagination Size Selector */}
                                <div className="flex items-center gap-2 text-sm text-slate-500 font-bold bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                                    <span>Rows per page:</span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => {
                                            setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value));
                                            setPage(1); // Reset to page 1
                                        }}
                                        className="bg-transparent outline-none text-slate-900 cursor-pointer"
                                    >
                                        <option value={10}>10</option>
                                        <option value={20}>20</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value="all">View All</option>
                                    </select>
                                </div>

                                <div className="flex-1 w-full md:w-auto">
                                    <Pagination
                                        current={page}
                                        total={Math.ceil((chargesData.count || 0) / (pageSize === 'all' ? (chargesData.count || 1) : pageSize))}
                                        onPageChange={setPage}
                                        loading={loading}
                                        compact
                                    />
                                </div>
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
                                            {['Item Name', 'Category', 'Stock Level', 'Total Value', 'Status', 'Actions'].map(h => (
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
                                                <td className="px-6 py-4 font-bold text-slate-700">₹{(item.qty * (parseFloat(item.cost_per_unit) || 0) * (1 + ((parseFloat(item.gst_percent) || 0) / 100))).toFixed(2)}</td>
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
                    {/* 4. CATEGORIES TAB */}
                    {activeTab === 'categories' && (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 sticky top-0 shadow-sm">
                                        <tr>
                                            {['Category Name', 'Actions'].map(h => (
                                                <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {categories.map(cat => (
                                            <tr key={cat.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-4 font-bold text-slate-900 text-sm w-full">{cat.name}</td>
                                                <td className="px-6 py-4">
                                                    <button onClick={() => handleDeleteCategory(cat.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Delete">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {/* 5. SUPPLIERS TAB */}
                    {activeTab === 'suppliers' && (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 sticky top-0 shadow-sm">
                                        <tr>
                                            {['Supplier Name', 'Phone', 'GST No', 'Address', 'Actions'].map(h => (
                                                <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {labSuppliers.map(s => (
                                            <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-4 font-bold text-slate-900 text-sm">{s.supplier_name}</td>
                                                <td className="px-6 py-4 font-mono text-sm text-slate-600">{s.phone || '--'}</td>
                                                <td className="px-6 py-4 font-mono text-sm text-slate-600">{s.gst_no || '--'}</td>
                                                <td className="px-6 py-4 text-xs text-slate-500 max-w-[200px] truncate">{s.address || '--'}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex gap-2">
                                                        <button onClick={() => { setSupplierForm(s); setShowSupplierModal(true); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                                                            <Pencil size={16} />
                                                        </button>
                                                        <button onClick={() => handleDeleteSupplier(s.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {labSuppliers.length === 0 && (
                                            <tr>
                                                <td colSpan="5" className="px-6 py-12 text-center text-slate-400 font-bold text-sm">No suppliers found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- Modals (Outside the hidden div) --- */}
            {/* New Category Modal */}
            <AnimatePresence>
                {showCategoryModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm no-print">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-lg font-black text-purple-900 uppercase tracking-tight">New Category</h3>
                                <button onClick={() => setShowCategoryModal(false)} className="p-2 rounded-full hover:bg-slate-200 transition-colors"><X size={20} className="text-slate-500" /></button>
                            </div>
                            <form onSubmit={handleAddCategory} className="p-8 space-y-6">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Name</label>
                                        <Input value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value.toUpperCase() })} required className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" placeholder="e.g. SEROLOGY" />
                                    </div>
                                </div>
                                <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 h-12 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-purple-500/20">Create Category</Button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* New Test Catalog Modal */}
            <AnimatePresence>
                {showTestModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm no-print">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-lg font-black text-emerald-900 uppercase tracking-tight">{editingTestId ? 'Edit Test' : 'Add New Test'}</h3>
                                <button onClick={() => setShowTestModal(false)} className="p-2 rounded-full hover:bg-slate-200 transition-colors"><X size={20} className="text-slate-500" /></button>
                            </div>
                            <form onSubmit={handleSaveTest} className="p-8 space-y-6 overflow-y-auto">
                                {/* ... existing form fields ... */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Test Name</label>
                                        <Input value={testCatalogForm.name} onChange={e => setTestCatalogForm({ ...testCatalogForm, name: e.target.value })} required className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Sub Name</label>
                                        <Input value={testCatalogForm.sub_name} onChange={e => setTestCatalogForm({ ...testCatalogForm, sub_name: e.target.value })} className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" placeholder="e.g. Method: ELISA" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Category</label>
                                        <div className="relative">
                                            <select
                                                value={testCatalogForm.category}
                                                onChange={e => setTestCatalogForm({ ...testCatalogForm, category: e.target.value })}
                                                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-800 focus:border-blue-500 outline-none transition-all appearance-none"
                                            >
                                                {categories.length > 0 ? categories.map(c => (
                                                    <option key={c.id} value={c.name}>{c.name}</option>
                                                )) : <option value="HAEMATOLOGY">HAEMATOLOGY</option>}
                                            </select>
                                            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" size={16} />
                                        </div>
                                    </div>

                                    {/* Gender Field */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Gender</label>
                                        <div className="relative">
                                            <select
                                                value={testCatalogForm.gender || 'B'}
                                                onChange={e => setTestCatalogForm({ ...testCatalogForm, gender: e.target.value })}
                                                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-800 focus:border-blue-500 outline-none transition-all appearance-none"
                                            >
                                                <option value="M">Male Only</option>
                                                <option value="F">Female Only</option>
                                                <option value="B">Both (Male & Female)</option>
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
                                            <div className="grid grid-cols-[1fr,100px,50px] gap-4 px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                <span>Item Name</span>
                                                <span className="text-center">Qty Required</span>
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
                                                <div key={idx} className="grid grid-cols-[1fr,100px,50px] gap-4 items-center animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                    <div className="relative">
                                                        <select
                                                            value={item.inventory_item}
                                                            onChange={e => {
                                                                const newItems = [...testCatalogForm.required_items];
                                                                newItems[idx].inventory_item = e.target.value;
                                                                setTestCatalogForm({ ...testCatalogForm, required_items: newItems });
                                                            }}
                                                            className="w-full h-11 px-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-slate-700 outline-none focus:border-amber-500 focus:bg-white transition-all appearance-none cursor-pointer"
                                                        >
                                                            <option value="">Select Item...</option>
                                                            {inventoryData.results.map(inv => (
                                                                <option key={inv.item_id} value={inv.item_id}>{inv.item_name} ({inv.qty} in stock)</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
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
                                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-center h-11 text-amber-600 focus:border-amber-500"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const newItems = testCatalogForm.required_items.filter((_, i) => i !== idx);
                                                            setTestCatalogForm({ ...testCatalogForm, required_items: newItems });
                                                        }}
                                                        className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                    >
                                                        <Trash2 size={18} />
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
                                                placeholder="Search by Name, Phone or Reg No..."
                                                value={visitQuery}
                                                onChange={e => {
                                                    setVisitQuery(e.target.value);
                                                    if (e.target.value.length >= 2) {
                                                        api.get(`reception/patients/?search=${e.target.value}`).then(res => {
                                                            setVisitSearch(res.data.results || res.data || []);
                                                        }).catch(console.error);
                                                    } else {
                                                        setVisitSearch([]);
                                                    }
                                                }}
                                            />
                                            {visitSearch.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-xl z-20 max-h-40 overflow-y-auto">
                                                    {visitSearch.map(p => (
                                                        <div
                                                            key={p.id || p.p_id}
                                                            onClick={async () => {
                                                                try {
                                                                    // Fetch latest visit or create new one
                                                                    const pId = p.p_id || p.id;
                                                                    const { data } = await api.get(`/reception/visits/?patient=${pId}&ordering=-created_at&limit=1`);
                                                                    const latest = (data.results || data || [])[0];

                                                                    if (latest && ['OPEN', 'IN_PROGRESS', 'WAITING'].includes(latest.status)) {
                                                                        setSelectedVisit(latest);
                                                                    } else {
                                                                        // Create new Lab Visit
                                                                        const res = await api.post('/reception/visits/', {
                                                                            patient: pId,
                                                                            assigned_role: 'LAB',
                                                                            status: 'OPEN'
                                                                        });
                                                                        setSelectedVisit(res.data);
                                                                    }
                                                                    setVisitSearch([]);
                                                                    setVisitQuery('');
                                                                } catch (err) {
                                                                    console.error(err);
                                                                    // Fallback: Just select patient info if possible, but we need a visit for backend
                                                                    alert("Failed to initialize visit for this patient.");
                                                                }
                                                            }}
                                                            className="p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0"
                                                        >
                                                            <p className="text-sm font-bold text-slate-800">{p.full_name} <span className="text-slate-400 font-medium text-xs">({p.registration_number || 'No Reg'})</span></p>
                                                            <p className="text-xs text-slate-500">{p.phone} • {p.age}Y/{p.gender}</p>
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
                                                                sub_name: test.sub_name,
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
                                                            className="w-full bg-slate-50 border-none rounded-lg p-2 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 text-center"
                                                            value={item.num_packs}
                                                            onChange={(e) => handleManualItemChange(idx, 'num_packs', e.target.value)}
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
                                            <h1 className="text-3xl font-black text-slate-900 tracking-tighter">REVIVE HOSPITAL</h1>
                                            <p className="text-sm font-bold text-slate-500 tracking-widest uppercase mt-1">
                                                {printCharge.groupStatus === 'PENDING' ? 'Lab Request / Receipt' : 'Laboratory Report'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Report ID</p>
                                        <p className="text-xl font-black text-slate-900">#{printCharge.lc_id.toString().slice(0, 8)}</p>
                                        <p className="text-sm font-medium text-slate-500">{(() => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; })()}</p>
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
                                {printCharge.groupStatus === 'PENDING' ? (
                                    // *** REQUEST / RECEIPT VIEW ***
                                    <div className="mb-12">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b-2 border-slate-900">
                                                    <th className="p-4 text-xs font-black text-slate-900 uppercase tracking-widest w-3/4">Test Description</th>
                                                    <th className="p-4 text-xs font-black text-slate-900 uppercase tracking-widest w-1/4 text-right">Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {(printCharge.tests || []).map((test, idx) => (
                                                    <tr key={idx}>
                                                        <td className="p-4 font-bold text-slate-800">
                                                            {test.test_name}
                                                            {test.sub_name && <span className="block text-xs font-normal text-slate-500">{test.sub_name}</span>}
                                                        </td>
                                                        <td className="p-4 font-mono font-bold text-slate-900 text-right">₹{parseFloat(test.amount).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-slate-50">
                                                    <td className="p-4 text-sm font-black text-slate-900 uppercase tracking-widest text-right">Total Amount</td>
                                                    <td className="p-4 font-mono font-black text-emerald-600 text-lg text-right">
                                                        ₹{printCharge.tests.reduce((acc, t) => acc + parseFloat(t.amount || 0), 0).toFixed(2)}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    // *** REPORT VIEW (Original) ***
                                    <div className="mb-12 space-y-12">
                                        {(printCharge.tests || [printCharge]).map((testItem, testIdx) => (
                                            <div key={testIdx} className={testIdx > 0 ? "pt-8 border-t-2 border-slate-100" : ""}>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">
                                                    {testItem.test_name} Analysis
                                                    {testItem.sub_name && <span className="block text-xs font-bold text-slate-500 mt-1">{testItem.sub_name}</span>}
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
                                                        {(Array.isArray(testItem.results)
                                                            ? testItem.results
                                                            : Object.entries(testItem.results || {}).map(([key, val]) => ({ name: key, ...val }))
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
                                        ))}

                                    </div>
                                )}
                                <div className="flex justify-between items-end mt-20 pt-8 border-t border-slate-200">
                                    <div className="text-xs font-medium text-slate-400">
                                        <p>Generated by REVIVE Hospital Management System</p>
                                        <p>{(() => {
                                            const d = new Date();
                                            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase()}`;
                                        })()}</p>
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
                        </motion.div >
                    </div >
                )}
            </AnimatePresence >

            {/* Print View - PORTAL STRATEGY */}
            {
                printCharge && createPortal(
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
                                position: absolute !important;
                                top: 0 !important;
                                left: 0 !important;
                                width: 100% !important;
                                height: 100% !important;
                                z-index: 9999 !important;
                                background-color: white !important;
                                color: black !important;
                                font-size: 10pt;
                                padding: 24px !important;
                                margin: 0 !important;
                                visibility: visible !important;
                            }
                            .print-portal-content * {
                                visibility: visible !important;
                            }
                            /* Hide everything else explicitly just in case */
                            body > *:not(.print-portal-content) {
                                display: none !important;
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
                            <div className="flex justify-between items-start mb-6 border-b-2 border-slate-900 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                                        <TestTube2 size={24} />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-black text-slate-900 tracking-tighter">REVIVE HOSPITAL</h1>
                                        <p className="text-xs font-bold text-slate-500 tracking-widest uppercase mt-0.5">
                                            {printCharge.groupStatus === 'PENDING' ? 'Lab Request / Receipt' : 'Laboratory Services'}
                                        </p>
                                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">Anjukunnu, Wayanad</p>
                                    </div>
                                </div>
                                <div className="text-right space-y-0.5">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reg No</p>
                                    <p className="text-lg font-black text-slate-900">#{printCharge.registration_number || 'N/A'}</p>
                                    <p className="text-xs font-medium text-slate-500">{(() => {
                                        const d = new Date();
                                        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                                    })()}</p>
                                </div>
                            </div>

                            {/* Patient Info */}
                            <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
                                <div className="grid grid-cols-2 gap-y-3 gap-x-8">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Patient Name</p>
                                        <p className="text-sm font-bold text-slate-900">{printCharge.patient_name}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Age / Sex</p>
                                        <p className="text-sm font-bold text-slate-900">{printCharge.patient_age} Years / {printCharge.patient_sex}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Referred By</p>
                                        <p className="text-sm font-bold text-slate-900">Dr. {printCharge.doctor_name || 'Consultant'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Specimen</p>
                                        <p className="text-sm font-bold text-slate-900">{printCharge.specimen || 'Blood'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Results Table OR Receipt Table */}
                            <div className="mb-6 space-y-6">
                                {printCharge.groupStatus === 'PENDING' ? (
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b-2 border-slate-900">
                                                <th className="px-2 py-2 text-[10px] font-black text-slate-900 uppercase tracking-widest w-3/4">Test Description</th>
                                                <th className="px-2 py-2 text-[10px] font-black text-slate-900 uppercase tracking-widest w-1/4 text-right">Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(printCharge.tests || []).map((test, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-2 py-2 font-bold text-slate-800 text-xs">
                                                        {test.test_name}
                                                        {test.sub_name && <span className="block text-[10px] font-normal text-slate-500">{test.sub_name}</span>}
                                                    </td>
                                                    <td className="px-2 py-2 font-mono font-bold text-slate-900 text-xs text-right">₹{parseFloat(test.amount).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                            <tr className="bg-slate-50">
                                                <td className="px-2 py-2 text-xs font-black text-slate-900 uppercase tracking-widest text-right">Total Amount</td>
                                                <td className="px-2 py-2 font-mono font-black text-emerald-600 text-sm text-right">
                                                    ₹{printCharge.tests.reduce((acc, t) => acc + parseFloat(t.amount || 0), 0).toFixed(2)}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                ) : (
                                    (printCharge.tests || [printCharge]).map((testItem, testIdx) => (
                                        <div key={testIdx} className="break-inside-avoid">
                                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2 mt-4">
                                                {testItem.test_name} Analysis
                                                {testItem.sub_name && <span className="block text-[10px] font-bold text-slate-500 mt-0.5">{testItem.sub_name}</span>}
                                            </h3>
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="border-b border-slate-200">
                                                        <th className="px-2 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4">Parameter Name</th>
                                                        <th className="px-2 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4">Result Value</th>
                                                        <th className="px-2 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4">Unit</th>
                                                        <th className="px-2 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4 text-right">Normal Range</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {(Array.isArray(testItem.results)
                                                        ? testItem.results
                                                        : Object.entries(testItem.results || {}).map(([key, val]) => ({ name: key, ...val }))
                                                    ).map((val, idx) => (
                                                        <tr key={idx}>
                                                            <td className="px-2 py-1.5 font-bold text-slate-700 text-xs">{val.name}</td>
                                                            <td className="px-2 py-1.5 font-black text-slate-900 text-xs">{val.value}</td>
                                                            <td className="px-2 py-1.5 font-bold text-slate-500 text-[10px]">{val.unit}</td>
                                                            <td className="px-2 py-1.5 font-bold text-slate-500 text-[10px] text-right whitespace-pre-wrap">{val.normal}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex justify-between items-end mt-auto pt-4 border-t border-slate-200">
                                <div className="text-[10px] font-medium text-slate-400">
                                    <p>Generated by REVIVE Hospital Management System</p>
                                    <p>{(() => {
                                        const d = new Date();
                                        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase()}`;
                                    })()}</p>
                                </div>
                                <div className="text-center">
                                    <div className="h-8 w-24 mb-1 mx-auto"></div>
                                    <p className="text-xs font-bold text-slate-900">{printCharge.technician_name}</p>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lab Technician</p>
                                </div>
                            </div>
                        </div>
                    </>,
                    document.body
                )
            }

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

                                    {/* Cost Field Removed per User Request */}

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
            {/* Manual Stock In Modal */}
            <AnimatePresence>
                {showManualStockModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm no-print">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-7xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[90vh]">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Manual Stock Entry</h3>
                                <button onClick={() => setShowManualStockModal(false)} className="p-2 rounded-full hover:bg-slate-200"><X size={20} className="text-slate-500" /></button>
                            </div>

                            {/* Invoice Details */}
                            <div className="p-6 grid grid-cols-4 gap-4 bg-white border-b border-slate-100">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Supplier</label>
                                    <select
                                        value={manualInvoice.supplier_name}
                                        onChange={e => setManualInvoice({ ...manualInvoice, supplier_name: e.target.value })}
                                        className="w-full h-10 px-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm outline-none focus:border-blue-500 transition-all cursor-pointer hover:bg-slate-100"
                                    >
                                        <option value="">-- Select Supplier --</option>
                                        {labSuppliers.map(s => (
                                            <option key={s.id} value={s.supplier_name}>{s.supplier_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice No</label>
                                    <Input value={manualInvoice.supplier_invoice_no} onChange={e => setManualInvoice({ ...manualInvoice, supplier_invoice_no: e.target.value })} className="font-bold" placeholder="INV-001" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</label>
                                    <Input type="date" value={manualInvoice.invoice_date} onChange={e => setManualInvoice({ ...manualInvoice, invoice_date: e.target.value })} className="font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</label>
                                    <select value={manualInvoice.purchase_type} onChange={e => setManualInvoice({ ...manualInvoice, purchase_type: e.target.value })} className="w-full h-10 px-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm outline-none">
                                        <option value="CASH">CASH</option>
                                        <option value="CREDIT">CREDIT</option>
                                    </select>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="flex-1 overflow-auto p-6">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[20%]">Item Name</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[8%]">Mfr</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[8%]">Batch</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[8%]">Expiry</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[5%]">Unit</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[4%]">Liq?</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[6%]">Packs</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[6%]">Itm/Pk</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-blue-500 uppercase tracking-widest w-[6%]">Total</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[8%]">Cost</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[8%]">Rate(GST)</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[8%]">MRP</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[5%]">Tax%</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[8%] text-right">Amt</th>
                                            <th className="px-4 py-3 w-[4%]"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {manualInvoice.items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-blue-50/30 group">
                                                <td className="px-4 py-2 relative">
                                                    <input
                                                        value={item.item_name}
                                                        onChange={e => handleManualItemChange(idx, 'item_name', e.target.value)}
                                                        onFocus={() => { if (item.item_name.length > 1) searchProductsForManual(item.item_name, idx) }}
                                                        className="w-full font-bold text-sm bg-transparent outline-none"
                                                        placeholder="Search Item..."
                                                    />
                                                    {manualProductSearch.rowIdx === idx && manualProductSearch.results.length > 0 && (
                                                        <div className="absolute top-full left-0 z-50 w-64 bg-white shadow-xl border rounded-xl max-h-40 overflow-y-auto">
                                                            {manualProductSearch.results.map(res => (
                                                                <div key={res.item_id} onClick={() => selectProductForManualRow(idx, res)} className="p-3 hover:bg-blue-50 cursor-pointer border-b">
                                                                    <p className="font-bold text-xs">{res.item_name}</p>
                                                                    <p className="text-[10px] text-slate-400">{res.unit} • {res.manufacturer}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2"><input value={item.manufacturer} onChange={e => handleManualItemChange(idx, 'manufacturer', e.target.value)} className="w-full font-bold text-xs bg-transparent outline-none" placeholder="Mfr" /></td>
                                                <td className="px-4 py-2"><input value={item.batch_no} onChange={e => handleManualItemChange(idx, 'batch_no', e.target.value)} className="w-full font-mono font-bold text-xs bg-transparent outline-none" placeholder="BATCH" /></td>
                                                <td className="px-4 py-2"><input type="date" value={item.expiry_date} onChange={e => handleManualItemChange(idx, 'expiry_date', e.target.value)} className="w-full font-bold text-xs bg-transparent outline-none" /></td>
                                                <td className="px-4 py-2"><input value={item.unit} onChange={e => handleManualItemChange(idx, 'unit', e.target.value)} className="w-16 font-bold text-xs bg-transparent outline-none" placeholder="units" /></td>
                                                <td className="px-4 py-2 text-center"><input type="checkbox" checked={item.is_liquid} onChange={e => handleManualItemChange(idx, 'is_liquid', e.target.checked)} className="w-4 h-4 accent-blue-600 rounded" /></td>

                                                {/* NEW COLUMNS */}
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="number"
                                                        value={item.num_packs}
                                                        onChange={e => handleManualItemChange(idx, 'num_packs', e.target.value)}
                                                        className="w-full font-bold text-sm bg-slate-50 border border-slate-200 rounded p-1 text-center outline-none focus:border-blue-500"
                                                        placeholder="Pks"
                                                    />
                                                </td>
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="number"
                                                        value={item.items_per_pack}
                                                        onChange={e => handleManualItemChange(idx, 'items_per_pack', e.target.value)}
                                                        className="w-full font-bold text-sm bg-slate-50 border border-slate-200 rounded p-1 text-center outline-none focus:border-blue-500"
                                                        placeholder="Itm"
                                                    />
                                                </td>
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="number"
                                                        value={item.qty}
                                                        readOnly
                                                        className="w-full font-black text-lg bg-emerald-50 text-emerald-900 rounded px-2 py-1 outline-none border border-emerald-200 text-center shadow-inner cursor-not-allowed"
                                                    />
                                                </td>

                                                <td className="px-4 py-2"><input type="number" value={item.unit_cost} onChange={e => handleManualItemChange(idx, 'unit_cost', e.target.value)} className="w-full font-bold text-sm bg-transparent outline-none text-right" /></td>
                                                <td className="px-4 py-2 font-black text-xs text-slate-500 text-right">
                                                    {(parseFloat(item.unit_cost || 0) * (1 + (parseFloat(item.gst_percent || 0) / 100))).toFixed(2)}
                                                </td>
                                                <td className="px-4 py-2"><input type="number" value={item.mrp} onChange={e => handleManualItemChange(idx, 'mrp', e.target.value)} className="w-full font-bold text-sm bg-transparent outline-none text-right" /></td>
                                                <td className="px-4 py-2"><input type="number" value={item.gst_percent} onChange={e => handleManualItemChange(idx, 'gst_percent', e.target.value)} className="w-full font-bold text-xs bg-transparent outline-none" /></td>
                                                <td className="px-4 py-2 font-black text-slate-900 text-right">
                                                    ₹{((item.unit_cost * item.num_packs) * (1 + (item.gst_percent / 100))).toFixed(2)}
                                                </td>
                                                <td className="px-4 py-2"><button onClick={() => removeManualItem(idx)} className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded"><Trash2 size={16} /></button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <button onClick={addManualRow} className="w-full py-3 mt-4 border-2 border-dashed border-slate-200 rounded-xl font-bold text-xs text-slate-400 hover:border-blue-500 hover:text-blue-600 uppercase tracking-widest">+ Add Line Item</button>
                            </div>

                            {/* Footer */}
                            <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end items-center gap-12">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cash Discount</label>
                                    <Input type="number" value={manualInvoice.cash_discount} onChange={e => setManualInvoice({ ...manualInvoice, cash_discount: parseFloat(e.target.value) || 0 })} className="w-32 bg-white font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Courier Charge</label>
                                    <Input type="number" value={manualInvoice.courier_charge} onChange={e => setManualInvoice({ ...manualInvoice, courier_charge: parseFloat(e.target.value) || 0 })} className="w-32 bg-white font-bold" />
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grand Total</p>
                                    <p className="text-3xl font-black text-slate-900">
                                        ₹{Math.round(manualInvoice.items.reduce((acc, item) => acc + (item.unit_cost * item.num_packs * (1 + item.gst_percent / 100)), 0) - manualInvoice.cash_discount + manualInvoice.courier_charge)}
                                    </p>
                                </div>
                                <Button onClick={submitManualPurchase} className="h-14 px-8 bg-blue-600 text-white font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 rounded-xl">Save Purchase</Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Supplier Modal */}
            <AnimatePresence>
                {showSupplierModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm no-print">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{supplierForm.id ? 'Edit Supplier' : 'New Supplier'}</h3>
                                <button onClick={() => setShowSupplierModal(false)} className="p-2 rounded-full hover:bg-slate-200 transition-colors"><X size={20} className="text-slate-500" /></button>
                            </div>
                            <form onSubmit={handleSaveSupplier} className="p-8 space-y-6">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Supplier Name</label>
                                        <Input value={supplierForm.supplier_name} onChange={e => setSupplierForm({ ...supplierForm, supplier_name: e.target.value })} required className="bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" />
                                    </div>
                                </div>
                                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-12 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-500/20">Save Supplier</Button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Inventory Creation Modal (Existing) */}
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
                                            <select
                                                value={inventoryForm.category}
                                                onChange={e => setInventoryForm({ ...inventoryForm, category: e.target.value })}
                                                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-800 focus:border-blue-500 outline-none transition-all appearance-none"
                                            >
                                                {categories.length > 0 ? categories.map(c => (
                                                    <option key={c.id} value={c.name}>{c.name}</option>
                                                )) : (
                                                    <>
                                                        <option value="REAGENT">REAGENT</option>
                                                        <option value="KIT">KIT</option>
                                                        <option value="CONSUMABLE">CONSUMABLE</option>
                                                        <option value="EQUIPMENT">EQUIPMENT</option>
                                                    </>
                                                )}
                                            </select>
                                            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" size={16} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Items Per Pack</label>
                                            <input
                                                type="number"
                                                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-blue-500 font-bold"
                                                placeholder="e.g. 1"
                                                value={inventoryForm.items_per_pack}
                                                onChange={(e) => setInventoryForm({ ...inventoryForm, items_per_pack: e.target.value })}
                                                min="1"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">No. of Packs</label>
                                            <input
                                                type="number"
                                                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-blue-500 font-bold"
                                                placeholder="e.g. 10"
                                                value={inventoryForm.num_packs}
                                                onChange={(e) => setInventoryForm({ ...inventoryForm, num_packs: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 flex justify-between items-center">
                                        <span className="text-sm font-bold text-slate-600">Calculated Total Stock</span>
                                        <span className="text-xl font-black text-blue-600">
                                            {(parseInt(inventoryForm.num_packs || 0) * parseInt(inventoryForm.items_per_pack || 1)) || inventoryForm.qty} Units
                                        </span>
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