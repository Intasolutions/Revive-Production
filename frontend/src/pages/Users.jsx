import React, { useState, useEffect } from 'react';
import { Settings, UserPlus, Shield, User as UserIcon, Mail, ShieldCheck, X, Check, Lock, Search, Activity, ChevronRight, AlertTriangle } from 'lucide-react';
import { Card, Button, Input } from '../components/UI';
import Pagination from '../components/Pagination';
import api from '../api/axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearch } from '../context/SearchContext';

const Users = () => {
    const [staffData, setStaffData] = useState({ results: [], count: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const { globalSearch, setGlobalSearch } = useSearch();
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState(null);

    const [addForm, setAddForm] = useState({ username: '', password: '', role: 'RECEPTION', email: '' });
    const [editForm, setEditForm] = useState({ role: '', is_active: true });

    useEffect(() => {
        fetchStaff();
    }, [page, globalSearch]);

    const fetchStaff = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/users/management/?page=${page}${globalSearch ? `&search=${encodeURIComponent(globalSearch)}` : ''}`);
            setStaffData(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddStaff = async (e) => {
        e.preventDefault();
        try {
            await api.post('/users/management/', addForm);
            setShowAddModal(false);
            setPage(1);
            setAddForm({ username: '', password: '', role: 'RECEPTION', email: '' });
            fetchStaff();
        } catch (err) {
            alert("Failed to add staff. Username might be taken.");
        }
    };

    const handleUpdateStaff = async (e) => {
        e.preventDefault();
        try {
            await api.patch(`/users/management/${selectedStaff.u_id}/`, editForm);
            setShowEditModal(false);
            fetchStaff();
        } catch (err) {
            alert("Failed to update staff.");
        }
    };

    const getRoleColor = (role) => {
        const colors = {
            'ADMIN': 'bg-rose-50 text-rose-600 border-rose-100',
            'DOCTOR': 'bg-sky-50 text-sky-600 border-sky-100',
            'RECEPTION': 'bg-emerald-50 text-emerald-600 border-emerald-100',
            'PHARMACY': 'bg-amber-50 text-amber-600 border-amber-100',
            'LAB': 'bg-purple-50 text-purple-600 border-purple-100',
            'CASUALTY': 'bg-orange-50 text-orange-600 border-orange-100',
        };
        return colors[role] || 'bg-slate-50 text-slate-600 border-slate-100';
    };

    const roles = [
        { id: 'RECEPTION', name: 'Reception' },
        { id: 'DOCTOR', name: 'Doctor' },
        { id: 'PHARMACY', name: 'Pharmacy' },
        { id: 'LAB', name: 'Laboratory' },
        { id: 'CASUALTY', name: 'Casualty' },
        { id: 'ADMIN', name: 'Administrator' },
    ];

    const totalPages = Math.ceil((staffData.count || 0) / 10);

    return (
        <div className="p-6 space-y-8 bg-gray-50 min-h-screen">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="space-y-2">
                    <h1 className="text-3xl font-black text-slate-900 font-outfit uppercase tracking-tighter">Staff Management</h1>
                    <p className="text-slate-500 font-medium tracking-wide font-inter italic">Create and manage accounts for hospital personnel</p>
                </div>
                <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-sky-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-sky-400 transition-all shadow-lg shadow-sky-500/20 active:scale-95">
                    <UserPlus size={16} />
                    Add Staff Member
                </button>
            </div>

            {/* Custom Table Style Card */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                            <tr>
                                {['Staff Member', 'Institutional Role', 'Status', 'Joined Date', 'Actions'].map((h, i) => (
                                    <th key={i} className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan="5" className="py-32 text-center">
                                    <Activity className="mx-auto text-sky-500 animate-spin mb-4" size={32} />
                                    <span className="text-slate-400 text-xs font-black uppercase tracking-widest">Loading Staff...</span>
                                </td></tr>
                            ) : staffData.results && staffData.results.map(s => (
                                <tr key={s.u_id} className="hover:bg-sky-50/30 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-[1.25rem] bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 font-black text-lg shadow-inner font-outfit group-hover:bg-white group-hover:shadow-md transition-all">
                                                {(s.username || '?')[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 font-outfit uppercase text-sm tracking-tight">{s.username}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-wider">{s.email || 'NO-EMAIL'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getRoleColor(s.role)}`}>
                                            {s.role}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${s.is_active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></div>
                                            <span className={`text-xs font-black font-outfit uppercase tracking-wider ${s.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                {s.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                            {new Date(s.date_joined).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-10 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-50 text-slate-500 hover:bg-sky-500 hover:text-white transition-all shadow-sm"
                                            onClick={() => {
                                                setSelectedStaff(s);
                                                setEditForm({ role: s.role, is_active: s.is_active });
                                                setShowEditModal(true);
                                            }}
                                        >
                                            Configure
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t border-slate-100">
                    <Pagination current={page} total={totalPages} onPageChange={setPage} loading={loading} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <Card className="p-10 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none shadow-2xl relative overflow-hidden group rounded-[2.5rem]">
                    <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:bg-sky-500/10 transition-all duration-700"></div>
                    <ShieldCheck size={40} className="mb-6 text-sky-400 group-hover:scale-110 transition-transform duration-500" />
                    <h3 className="font-black text-2xl font-outfit uppercase tracking-tighter">Security RBAC</h3>
                    <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mt-3 leading-relaxed">Restricted Role-Based Access Control ensures sensitive data remains shielded.</p>
                </Card>
                <Card className="p-10 border-none shadow-xl bg-white group rounded-[2.5rem]">
                    <Settings size={40} className="mb-6 text-slate-300 group-hover:text-amber-400 transition-colors duration-500" />
                    <h3 className="font-black text-2xl font-outfit uppercase tracking-tighter text-slate-900">Activity Logs</h3>
                    <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mt-3 leading-relaxed">Comprehensive audit trails monitor every system modification.</p>
                </Card>
                <Card className="p-10 border-none shadow-xl bg-white group rounded-[2.5rem]">
                    <Mail size={40} className="mb-6 text-slate-300 group-hover:text-emerald-400 transition-colors duration-500" />
                    <h3 className="font-black text-2xl font-outfit uppercase tracking-tighter text-slate-900">Auto Alerts</h3>
                    <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mt-3 leading-relaxed">System-wide notifications for critical inventory dips and updates.</p>
                </Card>
            </div>

            {/* Add Staff Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden"
                        >
                            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 leading-tight font-outfit uppercase tracking-tighter">New Account</h2>
                                    <p className="text-[10px] text-slate-400 mt-1 font-black uppercase tracking-widest">Provision user profile</p>
                                </div>
                                <div
                                    className="w-10 h-10 rounded-full bg-white flex items-center justify-center cursor-pointer shadow-sm text-slate-400 hover:text-rose-500 transition-all border border-slate-100"
                                    onClick={() => setShowAddModal(false)}
                                >
                                    <X size={20} />
                                </div>
                            </div>
                            <form onSubmit={handleAddStaff} className="p-10 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Username</label>
                                    <Input placeholder="e.g. jdoe_doctor" required value={addForm.username} onChange={e => setAddForm({ ...addForm, username: e.target.value })} className="rounded-2xl border-2 border-slate-100 bg-slate-50 focus:bg-white py-4 font-bold" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                                    <Input type="password" placeholder="••••••••" required value={addForm.password} onChange={e => setAddForm({ ...addForm, password: e.target.value })} className="rounded-2xl border-2 border-slate-100 bg-slate-50 focus:bg-white py-4 font-bold" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                                    <Input type="email" placeholder="staff@revivehospital.com" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} className="rounded-2xl border-2 border-slate-100 bg-slate-50 focus:bg-white py-4 font-bold" />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Institutional Role</label>
                                    <select
                                        className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500/20 transition-all font-bold font-inter text-slate-700 text-sm"
                                        value={addForm.role}
                                        onChange={e => setAddForm({ ...addForm, role: e.target.value })}
                                    >
                                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                </div>
                                <Button type="submit" className="w-full py-5 rounded-[1.5rem] font-black text-sm shadow-2xl shadow-sky-500/30 tracking-[0.2em] uppercase mt-4">Initialize Account</Button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Edit Permission Modal */}
            <AnimatePresence>
                {showEditModal && selectedStaff && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden"
                        >
                            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 leading-tight font-outfit uppercase tracking-tighter">Edit Permissions</h2>
                                    <p className="text-[10px] text-slate-400 mt-1 font-black uppercase tracking-widest">For <strong>{selectedStaff.username}</strong></p>
                                </div>
                                <div
                                    className="w-10 h-10 rounded-full bg-white flex items-center justify-center cursor-pointer shadow-sm text-slate-400 hover:text-rose-500 transition-all border border-slate-100"
                                    onClick={() => setShowEditModal(false)}
                                >
                                    <X size={20} />
                                </div>
                            </div>
                            <form onSubmit={handleUpdateStaff} className="p-10 space-y-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Institutional Role</label>
                                    <select
                                        className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500/20 transition-all font-bold font-inter text-slate-700 text-sm"
                                        value={editForm.role}
                                        onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                                    >
                                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                </div>

                                <div className="p-6 bg-slate-50 rounded-[2rem] border-2 border-slate-100 flex items-center justify-between shadow-inner">
                                    <div>
                                        <p className="font-black text-slate-900 text-sm font-outfit uppercase tracking-wider">Account Active</p>
                                        <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-widest">Login privileges</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                                        className={`w-14 h-8 rounded-full transition-all relative border-4 ${editForm.is_active ? 'bg-sky-500 border-sky-100' : 'bg-slate-300 border-slate-200'}`}
                                    >
                                        <motion.div
                                            animate={{ x: editForm.is_active ? 24 : 0 }}
                                            className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md"
                                        />
                                    </button>
                                </div>

                                <Button type="submit" className="w-full py-5 rounded-[1.5rem] font-black text-sm shadow-2xl shadow-sky-500/30 tracking-[0.2em] uppercase mt-4">Confirm Changes</Button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Users;
