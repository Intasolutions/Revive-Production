import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './UI';

const Pagination = ({ current, total, onPageChange, loading }) => {
    if (!total || total <= 1) return null;

    return (
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-3xl">
            <p className="text-sm text-slate-500 font-medium font-inter">
                Showing page <span className="text-slate-900 font-bold">{current}</span> of <span className="text-slate-900 font-bold">{total}</span>
            </p>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(current - 1)}
                    disabled={current === 1 || loading}
                    className="h-9 px-3 gap-1 hover:bg-white"
                >
                    <ChevronLeft size={16} />
                    Previous
                </Button>
                <div className="flex gap-1">
                    {[...Array(total)].map((_, i) => {
                        const pageNum = i + 1;
                        // Basic logic to show only few page numbers
                        if (
                            pageNum === 1 ||
                            pageNum === total ||
                            (pageNum >= current - 1 && pageNum <= current + 1)
                        ) {
                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => onPageChange(pageNum)}
                                    disabled={loading}
                                    className={`w-9 h-9 text-sm font-bold rounded-xl transition-all ${current === pageNum
                                            ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                                            : 'text-slate-400 hover:bg-white hover:text-sky-500'
                                        }`}
                                >
                                    {pageNum}
                                </button>
                            );
                        } else if (pageNum === current - 2 || pageNum === current + 2) {
                            return <span key={pageNum} className="w-9 h-9 flex items-center justify-center text-slate-300">...</span>;
                        }
                        return null;
                    })}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(current + 1)}
                    disabled={current === total || loading}
                    className="h-9 px-3 gap-1 hover:bg-white"
                >
                    Next
                    <ChevronRight size={16} />
                </Button>
            </div>
        </div>
    );
};

export default Pagination;
