import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import GlobalSearchOverlay from '../components/GlobalSearchOverlay';

const AppLayout = ({ children }) => {
    return (
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 relative">
                <Header />
                <GlobalSearchOverlay />
                <main className="flex-1 p-8">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default AppLayout;
