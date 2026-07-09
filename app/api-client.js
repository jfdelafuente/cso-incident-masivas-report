// API Client for backend communication
// Configurable base URL for development and production

// In local dev the frontend (:8080) and backend (:8000) are different origins,
// so we need an absolute URL. Once deployed behind Nginx, /api on the same
// origin is already proxied to the backend (see nginx.conf) — using an
// absolute http://localhost:8000 there would point at the *browser's* own
// machine instead of the server, so default to a relative path there.
const DEFAULT_API_BASE_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://localhost:8000'
  : '';

const ApiClient = {
  baseURL: localStorage.getItem('api_base_url') || DEFAULT_API_BASE_URL,

  setBaseURL(url) {
    localStorage.setItem('api_base_url', url);
    this.baseURL = url;
  },

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  },

  // ========== Reports CRUD ==========

  async createReport(report) {
    return this.request('/api/reports', {
      method: 'POST',
      body: JSON.stringify(report),
    });
  },

  async listReports() {
    return this.request('/api/reports', {
      method: 'GET',
    });
  },

  async getReport(reportId) {
    return this.request(`/api/reports/${reportId}`, {
      method: 'GET',
    });
  },

  async updateReport(reportId, update) {
    return this.request(`/api/reports/${reportId}`, {
      method: 'PUT',
      body: JSON.stringify(update),
    });
  },

  async deleteReport(reportId) {
    return this.request(`/api/reports/${reportId}`, {
      method: 'DELETE',
    });
  },

  async duplicateReport(reportId, newWeek) {
    return this.request(`/api/reports/${reportId}/duplicate?new_week=${newWeek}`, {
      method: 'POST',
    });
  },

  async exportReport(reportId) {
    return this.request(`/api/reports/${reportId}/export`, {
      method: 'GET',
    });
  },

  async healthCheck() {
    try {
      return await this.request('/api/health', { method: 'GET' });
    } catch (error) {
      return null;
    }
  },
};
