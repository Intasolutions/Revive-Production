import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/';

const api = axios.create({
    baseURL: BASE_URL,
});

// Add Interceptor for JWT
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handling Token Refresh or Auto-Logout
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
                try {
                    // Use the extracted BASE_URL, removing trailing slash if needed for specific endpoints or assuming specific structure
                    // The BASE_URL is '.../api/' so we append 'auth/token/refresh/'
                    const { data } = await axios.post(`${BASE_URL}auth/token/refresh/`, {
                        refresh: refreshToken,
                    });
                    localStorage.setItem('access_token', data.access);
                    return api(originalRequest);
                } catch (err) {
                    localStorage.clear();
                    window.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;
