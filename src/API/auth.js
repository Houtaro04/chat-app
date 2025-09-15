import axios from 'axios';

const API_BASE = import.meta.env?.VITE_API_BASE || 'http://localhost:8000';

export async function register({ username, email, password }) {
  const { data } = await axios.post(`${API_BASE}/v1/auth/register`, { username, email, password }, { withCredentials: true });
  return data;
}

export async function loginWithPassword({ username, password }) {
  const basic = btoa(`${username}:${password}`);
  const { data } = await axios.post(
    `${API_BASE}/v1/auth/login`,
    { username },
    { headers: { Authorization: `Basic ${basic}` }, withCredentials: true }
  );
  return data;
}


