import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard, Users, Stethoscope, Pill,
    FlaskConical, Receipt, BarChart3, Settings,
    LogOut, Heart, ChevronRight, Activity
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [isHovered, setIsHovered] = useState(false);

    const menuItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['ADMIN'] },
        { name: 'Reception', icon: Users, path: '/reception', roles: ['ADMIN', 'RECEPTION'] },
        { name: 'Casualty', icon: Activity, path: '/casualty', roles: ['ADMIN', 'CASUALTY'] },
        { name: 'Doctor', icon: Stethoscope, path: '/doctor', roles: ['ADMIN', 'DOCTOR'] },
        { name: 'Pharmacy', icon: Pill, path: '/pharmacy', roles: ['ADMIN', 'PHARMACY'] },
        { name: 'Laboratory', icon: FlaskConical, path: '/lab', roles: ['ADMIN', 'LAB'] },
        { name: 'Reports', icon: BarChart3, path: '/reports', roles: ['ADMIN'] },
        { name: 'Manage', icon: Settings, path: '/manage', roles: ['ADMIN'] },
        { name: 'Users', icon: Users, path: '/users', roles: ['ADMIN'] },
    ].filter(item => item.roles.includes(user?.role));

    return (
        <motion.aside
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            initial={false}
            animate={{ width: isHovered ? 280 : 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="h-screen bg-white border-r border-slate-100 flex flex-col sticky top-0 z-50 overflow-hidden shadow-2xl shadow-slate-200/50"
        >
            {/* --- Branding Section --- */}
            <div className="h-20 flex items-center px-6 gap-4 overflow-hidden border-b border-slate-50">
                <div className="flex-shrink-0 relative">
                    <div className="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/10">
                        <Heart className="w-5 h-5 text-blue-500" fill="currentColor" />
                    </div>
                </div>
                <AnimatePresence>
                    {isHovered && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="flex flex-col whitespace-nowrap"
                        >
                            <span className="text-slate-950 font-bold text-xl tracking-tight">Revive</span>
                            <span className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Health Systems</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* --- Navigation Section --- */}
            <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {menuItems.map((item) => {
                    const isActive = location.pathname === item.path;

                    return (
                        <NavLink
                            key={item.name}
                            to={item.path}
                            className="relative flex items-center group"
                        >
                            <div className={`
                                flex items-center w-full px-4 py-3.5 rounded-2xl transition-all duration-300
                                ${isActive
                                    ? 'bg-slate-950 text-white shadow-lg shadow-slate-900/20'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}
                            `}>
                                <div className="flex-shrink-0">
                                    <item.icon size={22} strokeWidth={isActive ? 2 : 1.5} />
                                </div>

                                <AnimatePresence>
                                    {isHovered && (
                                        <motion.span
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            className="ml-4 text-sm font-semibold whitespace-nowrap"
                                        >
                                            {item.name}
                                        </motion.span>
                                    )}
                                </AnimatePresence>

                                {isActive && isHovered && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="ml-auto"
                                    >
                                        <ChevronRight size={16} className="text-blue-400" />
                                    </motion.div>
                                )}
                            </div>
                        </NavLink>
                    );
                })}
            </nav>

            {/* --- Bottom User Profile Section --- */}
            <div className="p-4 border-t border-slate-50">
                <div className={`
                    flex items-center gap-3 p-2 rounded-[20px] transition-colors
                    ${isHovered ? 'bg-slate-50 border border-slate-100' : ''}
                `}>
                    <div className="flex-shrink-0 relative">
                        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm overflow-hidden">
                            <span className="text-slate-900 font-bold text-sm">
                                {user?.username?.[0]?.toUpperCase()}
                            </span>
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                    </div>

                    <AnimatePresence>
                        {isHovered && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex-1 min-w-0"
                            >
                                <p className="text-xs font-bold text-slate-900 truncate">{user?.username || 'Admin User'}</p>
                                <p className="text-[10px] font-medium text-blue-600 uppercase tracking-tighter">
                                    {user?.role}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <button
                    onClick={logout}
                    className={`
                        mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-200
                        ${isHovered
                            ? 'text-slate-600 hover:text-red-600 hover:bg-red-50'
                            : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}
                    `}
                >
                    <LogOut size={18} />
                    {isHovered && <span className="text-xs font-bold">Sign Out</span>}
                </button>
            </div>
        </motion.aside>
    );
};

export default Sidebar;