// utils/axiosJWT.js
import axios from 'axios';

const API_BASE = import.meta.env?.VITE_API_BASE || 'http://localhost:8000';

export const axiosJWT = axios.create({ baseURL: API_BASE, withCredentials: true });

axiosJWT.interceptors.request.use((config) => {
  const raw = localStorage.getItem('jwt_auth');
  const data = raw ? JSON.parse(raw) : null;
  if (data?.token) config.headers.Authorization = `Bearer ${data.token}`;
  return config;
});

// (tuỳ backend) refresh khi 401
axiosJWT.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err?.response?.status === 401) {
      try {
        const refresh = await axios.post(`${API_BASE}/v1/auth/refresh`, null, { withCredentials: true });
        const newToken = refresh?.data?.token;
        if (newToken) {
          const raw = localStorage.getItem('jwt_auth');
          const data = raw ? JSON.parse(raw) : {};
          const merged = { ...(data || {}), token: newToken };
          localStorage.setItem('jwt_auth', JSON.stringify(merged));
          err.config.headers.Authorization = `Bearer ${newToken}`;
          return axiosJWT.request(err.config);
        }
      } catch (e) {
        localStorage.removeItem('jwt_auth');
      }
    }
    throw err;
  }
);
