import React, { createContext, useContext, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const DialogContext = createContext();

export const useDialog = () => useContext(DialogContext);

export const DialogProvider = ({ children }) => {
    const [dialog, setDialog] = useState(null); // { title, message, type, confirmText, cancelText, resolve }
    const resolverRef = useRef(null);

    const confirm = ({
        title = 'Are you sure?',
        message = 'This action cannot be undone.',
        type = 'danger', // danger, success, info
        confirmText = 'Confirm',
        cancelText = 'Cancel'
    } = {}) => {
        return new Promise((resolve) => {
            setDialog({ title, message, type, confirmText, cancelText });
            resolverRef.current = resolve;
        });
    };

    const handleConfirm = () => {
        if (resolverRef.current) resolverRef.current(true);
        setDialog(null);
    };

    const handleCancel = () => {
        if (resolverRef.current) resolverRef.current(false);
        setDialog(null);
    };

    // UI Components based on type
    const getIcon = (type) => {
        switch (type) {
            case 'danger': return <div className="p-3 bg-red-100 text-red-600 rounded-2xl"><AlertCircle size={24} /></div>;
            case 'success': return <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl"><CheckCircle2 size={24} /></div>;
            case 'info': return <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><Info size={24} /></div>;
            default: return <div className="p-3 bg-slate-100 text-slate-600 rounded-2xl"><Info size={24} /></div>;
        }
    };

    const getPrimaryButtonStyle = (type) => {
        switch (type) {
            case 'danger': return 'bg-red-600 shadow-red-200 hover:bg-red-700';
            case 'success': return 'bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700';
            case 'info': return 'bg-blue-600 shadow-blue-200 hover:bg-blue-700';
            default: return 'bg-slate-900 shadow-slate-200 hover:bg-slate-800';
        }
    };

    return (
        <DialogContext.Provider value={{ confirm }}>
            {children}
            <AnimatePresence>
                {dialog && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden p-6 relative"
                        >
                            <button onClick={handleCancel} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors">
                                <X size={20} />
                            </button>

                            <div className="flex flex-col items-center text-center">
                                <div className="mb-4">
                                    {getIcon(dialog.type)}
                                </div>
                                <h3 className="text-xl font-black text-slate-900 mb-2 leading-tight">
                                    {dialog.title}
                                </h3>
                                <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed max-w-[260px]">
                                    {dialog.message}
                                </p>

                                <div className="grid grid-cols-2 gap-3 w-full">
                                    <button
                                        onClick={handleCancel}
                                        className="py-3.5 px-4 rounded-2xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                                    >
                                        {dialog.cancelText}
                                    </button>
                                    <button
                                        onClick={handleConfirm}
                                        className={`py-3.5 px-4 rounded-2xl font-bold text-sm text-white shadow-lg transition-all active:scale-95 ${getPrimaryButtonStyle(dialog.type)}`}
                                    >
                                        {dialog.confirmText}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </DialogContext.Provider>
    );
};
