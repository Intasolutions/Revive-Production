import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs) => twMerge(clsx(inputs));

export const Button = ({ className, variant = 'primary', size = 'md', loading, children, ...props }) => {
    const variants = {
        primary: 'bg-sky-500 text-white hover:bg-sky-400 shadow-lg shadow-sky-500/20',
        secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
        outline: 'bg-transparent text-sky-500 border border-sky-500 hover:bg-sky-50',
        ghost: 'bg-transparent text-slate-500 hover:bg-slate-100',
        danger: 'bg-rose-500 text-white hover:bg-rose-400 shadow-lg shadow-rose-500/20',
    };

    const sizes = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-5 py-2.5 text-sm',
        lg: 'px-8 py-3.5 text-base',
    };

    return (
        <button
            className={cn(
                'inline-flex items-center justify-center rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 gap-2',
                variants[variant],
                sizes[size],
                className
            )}
            disabled={loading || props.disabled}
            {...props}
        >
            {loading && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
            {children}
        </button>
    );
};

export const Card = ({ className, children, ...props }) => (
    <div className={cn('bg-white rounded-3xl border border-slate-200 shadow-sm', className)} {...props}>
        {children}
    </div>
);

export const Input = ({ label, error, className, ...props }) => (
    <div className="space-y-1.5 w-full">
        {label && <label className="text-sm font-semibold text-slate-700 ml-1">{label}</label>}
        <input
            className={cn(
                'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none transition-all focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 text-slate-900',
                error && 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/10',
                className
            )}
            {...props}
        />
        {error && <p className="text-xs text-rose-500 ml-1">{error}</p>}
    </div>
);

export const Table = ({ headers, rows, children, className }) => (
    <div className={cn('overflow-x-auto rounded-2xl border border-slate-200', className)}>
        <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                    {headers.map((h, i) => (
                        <th key={i} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {rows ? rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        {row.map((cell, j) => (
                            <td key={j} className="px-6 py-4 text-sm text-slate-600 font-medium">
                                {cell}
                            </td>
                        ))}
                    </tr>
                )) : children}
            </tbody>
        </table>
    </div>
);
