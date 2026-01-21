import React, { useState, useEffect } from 'react';
import { User, DollarSign, Save, Edit2, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import api from '../api/axios';

const ManagePage = () => {
    const [doctors, setDoctors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [notification, setNotification] = useState(null);

    useEffect(() => {
        fetchDoctors();
    }, []);

    const fetchDoctors = async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/users/management/doctors/');
            setDoctors(data);
        } catch (error) {
            showToast('error', 'Failed to fetch doctors list.');
        } finally {
            setLoading(false);
        }
    };

    const showToast = (type, message) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 3000);
    };

    const startEditing = (doc) => {
        setEditingId(doc.id);
        setEditValue(doc.consultation_fee || 500);
    };

    const saveFee = async (docId) => {
        try {
            await api.patch(`/users/management/${docId}/`, {
                consultation_fee: editValue
            });
            showToast('success', 'Fee updated successfully!');
            setEditingId(null);
            fetchDoctors(); // Refresh list
        } catch (error) {
            showToast('error', 'Failed to update fee.');
        }
    };

    return (
        <div className="h-full bg-slate-50 flex flex-col relative overflow-hidden">
            {/* Header */}
            <div className="px-8 py-6 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manage Doctors</h1>
                    <p className="text-slate-500 text-sm font-medium">Configure consultation fees and settings.</p>
                </div>
            </div>

            {/* Notification Toast */}
            {notification && (
                <div className={`fixed bottom-6 right-6 px-6 py-4 rounded-2xl shadow-2xl z-50 flex items-center gap-3 border ${notification.type === 'success' ? 'bg-white border-green-100' : 'bg-white border-red-100'
                    }`}>
                    <div className={`p-2 rounded-full ${notification.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                        {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    </div>
                    <div>
                        <h4 className={`text-sm font-bold ${notification.type === 'success' ? 'text-green-900' : 'text-red-900'}`}>
                            {notification.type === 'success' ? 'Success' : 'Error'}
                        </h4>
                        <p className="text-xs text-slate-500 font-medium">{notification.message}</p>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="max-w-5xl mx-auto space-y-6">
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : doctors.length === 0 ? (
                        <div className="text-center py-20 opacity-50">
                            <User size={48} className="mx-auto text-slate-300 mb-4" />
                            <p className="font-bold text-slate-900">No doctors found.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {doctors.map(doc => (
                                <div key={doc.id} className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                                                {doc.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-900">Dr. {doc.username}</h3>
                                                <p className="text-xs text-slate-400 font-medium">{doc.email || 'No email'}</p>
                                            </div>
                                        </div>
                                        <div className="px-2 py-1 bg-slate-50 rounded-lg border border-slate-100 text-[10px] font-bold text-slate-500 uppercase">
                                            {doc.formatted_role || 'Doctor'}
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-2 block">Consultation Fee</label>

                                        <div className="flex items-center gap-2">
                                            {editingId === doc.id ? (
                                                <div className="flex items-center gap-2 w-full">
                                                    <div className="flex items-center gap-2 bg-white border-2 border-blue-500 rounded-xl px-3 py-2 flex-1 shadow-sm">
                                                        <DollarSign size={14} className="text-slate-400" />
                                                        <input
                                                            autoFocus
                                                            type="number"
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            className="w-full font-bold text-slate-900 outline-none bg-transparent"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => saveFee(doc.id)}
                                                        className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95"
                                                    >
                                                        <Save size={18} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center w-full justify-between group-hover:bg-white transition-colors rounded-xl p-1 -ml-1">
                                                    <div className="px-3 py-1">
                                                        <span className="text-2xl font-bold text-slate-900">₹{doc.consultation_fee || '500.00'}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => startEditing(doc)}
                                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ManagePage;
