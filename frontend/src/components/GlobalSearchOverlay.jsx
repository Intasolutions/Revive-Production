import React, { useState, useEffect, useRef } from 'react';
import { useSearch } from '../context/SearchContext';
import { Search, User, Receipt, Pill, X, Loader2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';
import { useNavigate } from 'react-router-dom';

const GlobalSearchOverlay = () => {
    const { globalSearch, setGlobalSearch } = useSearch();
    const [results, setResults] = useState({ patients: [], invoices: [], stock: [] });
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') setGlobalSearch('');
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [setGlobalSearch]);

    useEffect(() => {
        if (!globalSearch || globalSearch.length < 2) {
            setResults({ patients: [], invoices: [], stock: [] });
            return;
        }

        const timeoutId = setTimeout(async () => {
            setLoading(true);
            try {
                const [pRes, iRes, sRes] = await Promise.all([
                    api.get(`/reception/patients/?search=${encodeURIComponent(globalSearch)}`),
                    api.get(`/billing/invoices/?search=${encodeURIComponent(globalSearch)}`),
                    api.get(`/pharmacy/stock/?search=${encodeURIComponent(globalSearch)}`)
                ]);
                setResults({
                    patients: (pRes.data.results || pRes.data || []).slice(0, 5),
                    invoices: (iRes.data.results || iRes.data || []).slice(0, 5),
                    stock: (sRes.data.results || sRes.data || []).slice(0, 5)
                });
            } catch (err) {
                console.error("Search error");
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [globalSearch]);

    const handleNavigate = (path) => {
        setGlobalSearch('');
        navigate(path);
    };

    const isVisible = globalSearch && globalSearch.length >= 2;
    const hasResults = results.patients.length > 0 || results.invoices.length > 0 || results.stock.length > 0;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    ref={dropdownRef}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-[68px] left-6 z-50 w-[420px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
                >
                    {/* Header */}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500 flex items-center gap-2">
                            {loading ? (
                                <>
                                    <Loader2 size={14} className="animate-spin text-blue-600" />
                                    Searching...
                                </>
                            ) : (
                                <>
                                    <Search size={14} />
                                    Search Results
                                </>
                            )}
                        </span>
                        <button
                            onClick={() => setGlobalSearch('')}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                        >
                            <X size={14} className="text-gray-400" />
                        </button>
                    </div>

                    {/* Results */}
                    <div className="max-h-[400px] overflow-y-auto">
                        {/* Patients */}
                        {results.patients.length > 0 && (
                            <div className="p-2">
                                <p className="px-2 py-1 text-xs font-medium text-gray-500 uppercase">Patients</p>
                                {results.patients.map(p => (
                                    <button
                                        key={p.id || p.p_id}
                                        onClick={() => handleNavigate('/reception')}
                                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-md text-left transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                                            {p.full_name?.[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{p.full_name}</p>
                                            <p className="text-xs text-gray-500">{p.phone}</p>
                                        </div>
                                        <ExternalLink size={14} className="text-gray-400" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Invoices */}
                        {results.invoices.length > 0 && (
                            <div className="p-2 border-t border-gray-100">
                                <p className="px-2 py-1 text-xs font-medium text-gray-500 uppercase">Invoices</p>
                                {results.invoices.map(i => (
                                    <button
                                        key={i.id}
                                        onClick={() => handleNavigate('/billing')}
                                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-md text-left transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                                            <Receipt size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900">₹{i.total_amount} - {i.patient_name}</p>
                                            <p className="text-xs text-gray-500">{i.payment_status}</p>
                                        </div>
                                        <ExternalLink size={14} className="text-gray-400" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Stock */}
                        {results.stock.length > 0 && (
                            <div className="p-2 border-t border-gray-100">
                                <p className="px-2 py-1 text-xs font-medium text-gray-500 uppercase">Pharmacy</p>
                                {results.stock.map(s => (
                                    <button
                                        key={s.id || s.med_id}
                                        onClick={() => handleNavigate('/pharmacy')}
                                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-md text-left transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                                            <Pill size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                                            <p className="text-xs text-gray-500">{s.qty_available} in stock</p>
                                        </div>
                                        <ExternalLink size={14} className="text-gray-400" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* No Results */}
                        {!loading && !hasResults && (
                            <div className="p-8 text-center">
                                <Search size={24} className="mx-auto text-gray-300 mb-2" />
                                <p className="text-sm text-gray-500">No results found</p>
                                <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
                        <p className="text-[10px] text-gray-400 text-center">Press ESC to close</p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default GlobalSearchOverlay;
