import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, X, Info } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
    const [toast, setToast] = useState(null);

    // This function can be called from ANY component
    const showToast = useCallback((type, message) => {
        setToast({ type, message, id: Date.now() });

        // Auto hide after 4 seconds
        setTimeout(() => {
            setToast((current) => (current && current.type === type && current.message === message ? null : current));
        }, 4000);
    }, []);

    const closeToast = () => setToast(null);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            
            {/* This is the Global Toast UI Component */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className={`fixed bottom-6 right-6 flex items-start gap-4 p-5 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] z-[9999] border bg-white min-w-[320px] max-w-[420px] backdrop-blur-xl ${
                            toast.type === 'success' ? 'border-green-100' : 
                            toast.type === 'error' ? 'border-red-100' : 'border-blue-100'
                        }`}
                    >
                        {/* Icon Wrapper */}
                        <div className={`p-2 rounded-full shrink-0 ${
                            toast.type === 'success' ? 'bg-green-50 text-green-600' : 
                            toast.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                            {toast.type === 'success' && <CheckCircle2 size={22} strokeWidth={2.5} />}
                            {toast.type === 'error' && <AlertCircle size={22} strokeWidth={2.5} />}
                            {toast.type === 'info' && <Info size={22} strokeWidth={2.5} />}
                        </div>

                        {/* Text Content */}
                        <div className="flex-1 pt-1">
                            <h4 className={`text-sm font-bold tracking-tight mb-0.5 ${
                                toast.type === 'success' ? 'text-green-900' : 
                                toast.type === 'error' ? 'text-red-900' : 'text-slate-900'
                            }`}>
                                {toast.type === 'success' ? 'Successful' : 
                                 toast.type === 'error' ? 'Action Failed' : 'Notification'}
                            </h4>
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                {toast.message}
                            </p>
                        </div>

                        {/* Close Button */}
                        <button 
                            onClick={closeToast} 
                            className="text-slate-300 hover:text-slate-600 transition-colors p-1"
                        >
                            <X size={18} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </ToastContext.Provider>
    );
};