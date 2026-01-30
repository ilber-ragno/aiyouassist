import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  withCredentials: true,
  withXSRFToken: true,
});

// Add token from storage on init
const stored = localStorage.getItem('aiyou-auth');
if (stored) {
  try {
    const { state } = JSON.parse(stored);
    if (state?.token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${state.token}`;
    }
  } catch {}
}

// Response interceptor for errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('aiyou-auth');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
