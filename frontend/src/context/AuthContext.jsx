import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            const token = sessionStorage.getItem('access_token');
            if (token) {
                try {
                    const { data } = await api.get('/users/me/');
                    setUser(data);
                } catch (err) {
                    sessionStorage.clear();
                }
            }
            setLoading(false);
        };
        fetchProfile();
    }, []);

    const login = async (username, password) => {
        const { data } = await api.post('/auth/token/', { username, password });
        sessionStorage.setItem('access_token', data.access);
        sessionStorage.setItem('refresh_token', data.refresh);

        // Fetch profile to get role
        const profile = await api.get('/users/me/');
        setUser(profile.data);
        return profile.data;
    };

    const logout = () => {
        sessionStorage.clear();
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
