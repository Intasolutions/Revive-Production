import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            const token = localStorage.getItem('access_token');
            if (token) {
                try {
                    const { data } = await api.get('/users/me/');
                    setUser(data);
                } catch (err) {
                    localStorage.clear();
                }
            }
            setLoading(false);
        };
        fetchProfile();
    }, []);

    const login = async (username, password) => {
        const { data } = await api.post('/auth/token/', { username, password });
        localStorage.setItem('access_token', data.access);
        localStorage.setItem('refresh_token', data.refresh);

        // Fetch profile to get role
        const profile = await api.get('/users/me/');
        setUser(profile.data);
        return profile.data;
    };

    const logout = () => {
        localStorage.clear();
        setUser(null);
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
