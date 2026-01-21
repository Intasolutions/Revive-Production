import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogIn, Activity, ShieldCheck, Mail, Lock, AlertCircle, CheckCircle2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { cn } from '../components/UI';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [focusedInput, setFocusedInput] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const userData = await login(username, password);

            // Redirect based on role
            switch (userData.role) {
                case 'DOCTOR': navigate('/doctor'); break;
                case 'RECEPTION': navigate('/reception'); break;
                case 'PHARMACY': navigate('/pharmacy'); break;
                case 'LAB': navigate('/lab'); break;
                case 'CASUALTY': navigate('/casualty'); break;
                default: navigate('/');
            }
        } catch (err) {
            setError('Invalid credentials. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-slate-50 font-sans overflow-hidden">
            {/* Left Side: Professional Branding */}
            <div className="hidden lg:flex w-1/2 bg-slate-900 relative overflow-hidden flex-col justify-between p-16 text-white">
                {/* Background Patterns */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-900 to-slate-900" />
                    <svg className="absolute top-0 right-0 text-blue-500/5 w-[600px] h-[600px] -mr-32 -mt-32" viewBox="0 0 100 100" fill="currentColor">
                        <circle cx="50" cy="50" r="50" />
                    </svg>
                    <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-slate-900 to-transparent" />
                </div>

                {/* Content */}
                <div className="relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex items-center gap-3 mb-12"
                    >
                        <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                            <Activity className="w-8 h-8 text-white" />
                        </div>
                        <span className="text-2xl font-bold tracking-tight text-white">Revive<span className="text-blue-500">CMS</span></span>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <h1 className="text-5xl font-bold leading-tight mb-6">
                            Clinical Excellence, <br />
                            <span className="text-blue-400">Simplified.</span>
                        </h1>
                        <p className="text-slate-400 text-lg max-w-md leading-relaxed">
                            The most advanced platform for patient management, scheduling, and analytics. Trusted by healthcare professionals.
                        </p>
                    </motion.div>
                </div>

                {/* Feature List */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="relative z-10 space-y-4"
                >
                    {[
                        "HIPAA Compliant Security",
                        "Real-time Patient Analytics",
                        "Seamless Scheduling"
                    ].map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-slate-300">
                            <div className="bg-blue-500/20 p-1 rounded-full">
                                <CheckCircle2 size={16} className="text-blue-400" />
                            </div>
                            <span className="text-sm font-medium">{feature}</span>
                        </div>
                    ))}
                </motion.div>
            </div>

            {/* Right Side: Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-white relative">
                {/* Mobile Background Decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-bl-[100px] -z-0 lg:hidden" />

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-md relative z-10"
                >
                    <div className="mb-10 text-center lg:text-left">
                        <div className="inline-flex lg:hidden items-center gap-2 mb-6">
                            <div className="p-2 bg-blue-600 rounded-lg">
                                <Activity className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-bold text-slate-900">Revive<span className="text-blue-600">CMS</span></span>
                        </div>
                        <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h2>
                        <p className="text-slate-500">Sign in to access your dashboard.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className={cn("text-sm font-semibold transition-colors duration-200 ml-1",
                                focusedInput === 'username' ? "text-blue-600" : "text-slate-700"
                            )}>
                                Email or Username
                            </label>
                            <div className="relative group">
                                <Mail className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-200",
                                    focusedInput === 'username' ? "text-blue-600" : "text-slate-400"
                                )} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    onFocus={() => setFocusedInput('username')}
                                    onBlur={() => setFocusedInput(null)}
                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-900 placeholder:text-slate-400"
                                    placeholder="doctor@clinic.com"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center ml-1">
                                <label className={cn("text-sm font-semibold transition-colors duration-200",
                                    focusedInput === 'password' ? "text-blue-600" : "text-slate-700"
                                )}>
                                    Password
                                </label>
                                <a href="#" className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                                    Forgot Password?
                                </a>
                            </div>
                            <div className="relative group">
                                <Lock className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-200",
                                    focusedInput === 'password' ? "text-blue-600" : "text-slate-400"
                                )} />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onFocus={() => setFocusedInput('password')}
                                    onBlur={() => setFocusedInput(null)}
                                    className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-900 placeholder:text-slate-400"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className={cn("absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors focus:outline-none",
                                        focusedInput === 'password' ? "text-blue-500" : ""
                                    )}
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex items-center gap-3 text-red-600 bg-red-50 p-4 rounded-xl border border-red-100 text-sm font-medium">
                                        <AlertCircle size={18} className="shrink-0" />
                                        {error}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full group bg-slate-900 hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-slate-900/10 hover:shadow-blue-600/20 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 mt-2"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span>Sign In</span>
                                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>

                        <div className="pt-6 text-center">
                            <p className="text-slate-500 text-sm">
                                Don't have an account? <span className="text-slate-400 font-medium">Contact your Administrator</span>
                            </p>
                        </div>
                    </form>
                </motion.div>

                {/* Footer Copyright - Mobile Only or Bottom */}
                <div className="absolute bottom-6 left-0 w-full text-center text-xs text-slate-400">
                    &copy; {new Date().getFullYear()} Revive Medical Systems. v2.4.0
                </div>
            </div>
        </div>
    );
};

export default Login;