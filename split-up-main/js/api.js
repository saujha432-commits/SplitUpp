// ============================================================
// SPLIT UP — API Client
// Replaces Firebase with our own Express/MongoDB backend.
// All methods return parsed JSON or throw an error.
// ============================================================

const API_BASE = 'http://localhost:3000/api';

// ── Token Storage ──────────────────────────────────────────
function getToken() { return localStorage.getItem('splitup_token'); }
function setToken(t) { localStorage.setItem('splitup_token', t); }
function clearToken() { localStorage.removeItem('splitup_token'); }

// ── Core Fetch Wrapper ─────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.message || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── Auth ───────────────────────────────────────────────────
const Auth = {
  async signup(name, email, password) {
    const data = await apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    setToken(data.token);
    return data.user;
  },

  async login(email, password) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setToken(data.token);
    return data.user;
  },

  async logout() {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    clearToken();
  },

  async getMe() {
    const data = await apiFetch('/auth/me');
    return data.user;
  },

  async updateProfile(updates) {
    const data = await apiFetch('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    return data.user;
  },

  isLoggedIn() { return !!getToken(); }
};

// ── Groups ─────────────────────────────────────────────────
const Groups = {
  async list() {
    const data = await apiFetch('/groups');
    return data.groups;
  },

  async create(groupData) {
    const data = await apiFetch('/groups', {
      method: 'POST',
      body: JSON.stringify(groupData)
    });
    return data.group;
  },

  async get(id) {
    const data = await apiFetch(`/groups/${id}`);
    return data.group;
  },

  async update(id, updates) {
    const data = await apiFetch(`/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    return data.group;
  },

  async delete(id) {
    return apiFetch(`/groups/${id}`, { method: 'DELETE' });
  },

  async joinByCode(code) {
    const data = await apiFetch(`/groups/join/${encodeURIComponent(code)}`);
    return data;
  },

  async addMember(groupId, email) {
    const data = await apiFetch(`/groups/${groupId}/add-member`, {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    return data.group;
  }
};

// ── Expenses ───────────────────────────────────────────────
const Expenses = {
  async list() {
    const data = await apiFetch('/expenses');
    return data.expenses;
  },

  async listByGroup(groupId) {
    const data = await apiFetch(`/expenses/group/${groupId}`);
    return data.expenses;
  },

  async create(expenseData) {
    const data = await apiFetch('/expenses', {
      method: 'POST',
      body: JSON.stringify(expenseData)
    });
    return data.expense;
  },

  async update(id, updates) {
    const data = await apiFetch(`/expenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    return data.expense;
  },

  async delete(id) {
    return apiFetch(`/expenses/${id}`, { method: 'DELETE' });
  },

  async settle(id) {
    const data = await apiFetch(`/expenses/${id}/settle`, { method: 'POST' });
    return data;
  }
};

// ── Polls ──────────────────────────────────────────────────
const Polls = {
  async listByGroup(groupId) {
    const data = await apiFetch(`/polls/group/${groupId}`);
    return data.polls;
  },

  async create(pollData) {
    const data = await apiFetch('/polls', {
      method: 'POST',
      body: JSON.stringify(pollData)
    });
    return data.poll;
  },

  async vote(pollId, optionIndex) {
    const data = await apiFetch(`/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionIndex })
    });
    return data.poll;
  },

  async close(pollId) {
    const data = await apiFetch(`/polls/${pollId}/close`, { method: 'POST' });
    return data.poll;
  },

  async delete(pollId) {
    return apiFetch(`/polls/${pollId}`, { method: 'DELETE' });
  }
};

export { Auth, Groups, Expenses, Polls, getToken, setToken, clearToken };
