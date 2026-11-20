// ============================================================
// SPLIT UP — MAIN APP JS (Full-Stack Edition)
// Backend: Express + MongoDB + Socket.IO
// Frontend: Vanilla JS (preserved original UI completely)
// ============================================================

import { Auth, Groups, Expenses, Polls, getToken } from './api.js';

// ── Socket.IO Client ───────────────────────────────────────
// Loaded from CDN (added in index.html); accessed via window.io
let socket = null;

function initSocket() {
  if (!window.io) return;
  const token = getToken();
  socket = window.io({ auth: { token } });

  socket.on('connect', () => {
    console.log('Socket.IO connected:', socket.id);
    updateSyncStatusBadge();
    // Re-join group room if we're looking at a group
    if (currentGroupId) socket.emit('group:join', currentGroupId);
  });

  socket.on('disconnect', () => updateSyncStatusBadge());

  // Real-time listeners
  socket.on('expense:created', ({ expense }) => {
    if (!expenses.some(e => e._id === expense._id || e.id === expense._id)) {
      expenses.unshift(normalizeExpense(expense));
      renderHome(); renderActivity();
      if (currentGroupId === String(expense.groupId)) renderGroupExpenses(currentGroupId);
    }
  });

  socket.on('expense:updated', ({ expense }) => {
    const idx = expenses.findIndex(e => e._id === expense._id || e.id === expense._id);
    if (idx !== -1) expenses[idx] = normalizeExpense(expense);
    renderHome(); renderActivity();
    if (currentGroupId === String(expense.groupId)) {
      renderGroupExpenses(currentGroupId);
      const g = groups.find(x => x._id === currentGroupId || x.id === currentGroupId);
      if (g) renderGroupBalances(currentGroupId, g);
    }
  });

  socket.on('expense:deleted', ({ expenseId }) => {
    expenses = expenses.filter(e => (e._id || e.id) !== expenseId);
    renderHome(); renderActivity(); renderGroupExpenses(currentGroupId);
    const g = groups.find(x => x._id === currentGroupId || x.id === currentGroupId);
    if (g) renderGroupBalances(currentGroupId, g);
  });

  socket.on('expense:settled', ({ expenseId }) => {
    const exp = expenses.find(e => (e._id || e.id) === expenseId);
    if (exp) exp.settled = true;
    renderHome(); renderActivity();
    const g = groups.find(x => x._id === currentGroupId || x.id === currentGroupId);
    if (g) { renderVibeScore(currentGroupId); renderGroupBalances(currentGroupId, g); }
  });

  socket.on('poll:created', ({ poll }) => {
    if (currentGroupId === String(poll.groupId)) renderGroupPolls();
    showToast('A new poll was created! 🗳️', 'info', 2000);
  });

  socket.on('poll:voted', () => {
    if (currentGroupId) renderGroupPolls();
  });

  socket.on('poll:closed', () => {
    if (currentGroupId) renderGroupPolls();
  });

  socket.on('group:memberJoined', async ({ user, groupId }) => {
    showToast(`${user?.name || 'A new member'} joined the group! 🎉`, 'success');
    await loadGroups();
    const updated = groups.find(g => String(g.id || g._id) === String(groupId || currentGroupId));
    if (updated && currentGroupId === String(updated.id || updated._id)) {
      renderGroupMembers(updated);
      renderGroupBalances(currentGroupId, updated);
    }
    renderGroups(); renderHome(); populateExpenseForm();
  });

  socket.on('group:memberAdded', async ({ groupId, email }) => {
    await loadGroups();
    const updated = groups.find(g => String(g.id || g._id) === String(groupId));
    if (updated && currentGroupId === String(groupId)) {
      renderGroupMembers(updated);
      renderGroupBalances(currentGroupId, updated);
    }
    renderGroups(); renderHome(); populateExpenseForm();
  });

  socket.on('group:created', ({ group }) => {
    if (currentUser && (group.members?.some(m => String(m._id || m) === String(currentUser.uid)) || group.memberEmails?.includes(currentUser.email))) {
      const gid = String(group._id || group.id);
      const idx = groups.findIndex(g => String(g.id || g._id) === gid);
      if (idx === -1) {
        groups.unshift(normalizeGroup(group));
      } else {
        groups[idx] = normalizeGroup(group);
      }
      renderGroups(); renderHome();
      populateExpenseForm();
    }
  });

  socket.on('group:updated', ({ group }) => {
    const idx = groups.findIndex(g => String(g._id || g.id) === String(group._id));
    if (idx !== -1) groups[idx] = normalizeGroup(group);
    renderGroups(); renderHome();
  });

  socket.on('group:deleted', ({ groupId }) => {
    groups = groups.filter(g => (g._id || g.id) !== groupId);
    expenses = expenses.filter(e => (e.groupId) !== groupId);
    renderGroups(); renderHome(); renderActivity();
  });
}

// ── State ──────────────────────────────────────────────────
let currentUser = null;
let userProfile = {};
let groups = [];
let expenses = [];
let currentGroupId = null;
let pendingMembers = [];
let currentFilter = 'all';
let currentSplitMethod = 'equal';
let currentCategory = 'food';
let currentMood = 'worth-it';
let currentGroupType = 'trip';
let settleTarget = null;
let currentPolls = [];
let parsedReceiptItems = [];

// ── Speech Recognition State ───────────────────────────────
let recognition = null;
let speechContext = null; // 'group' | 'product' | 'poll'
let voiceTranscript = '';

// ── Utility helpers (identical to original) ────────────────
const $ = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);
const qsa = sel => [...document.querySelectorAll(sel)];

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
function formatAmount(amount, currency = 'INR') {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  return `${sym}${parseFloat(amount || 0).toFixed(2)}`;
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning ☀️';
  if (h < 17) return 'Good afternoon 🌤';
  if (h < 21) return 'Good evening 🌅';
  return 'Good night 🌙';
}
function timeAgo(ts) {
  if (!ts) return 'just now';
  const date = new Date(ts);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function showToast(msg, type = 'info', duration = 2800) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast hidden'; }, duration);
}
function openModal(id) { const m = $(id); if (m) m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { const m = $(id); if (m) m.classList.add('hidden'); document.body.style.overflow = ''; }
function addBounce(btn) {
  if (!btn) return;
  btn.classList.add('anim-bounce');
  btn.addEventListener('animationend', () => btn.classList.remove('anim-bounce'), { once: true });
}
function addRipple(btn, e) {
  if (!btn) return;
  btn.classList.add('ripple-container');
  const r = document.createElement('span');
  r.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  r.style.left = `${(e?.clientX || 0) - rect.left}px`;
  r.style.top = `${(e?.clientY || 0) - rect.top}px`;
  btn.appendChild(r);
  r.addEventListener('animationend', () => r.remove(), { once: true });
}
function getUserInitial(name) { return (name || '?').charAt(0).toUpperCase(); }
function getGroupEmoji(type) {
  return { trip: '✈️', home: '🏠', friends: '👯', other: '📦' }[type] || '📦';
}
function getCategoryEmoji(cat) {
  return { food: '🍕', transport: '🚗', home: '🏠', trip: '✈️', fun: '🎉', treat: '🧁', health: '💊', other: '📦' }[cat] || '📦';
}
function getUserPreferredCurrency() { return userProfile.currency || 'INR'; }
function formatNameFromEmail(email) {
  if (!email || !email.includes('@')) return 'Friend';
  return email.split('@')[0].replace(/[._\-+]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Friend';
}

// Normalize backend documents to a consistent shape (MongoDB _id → id)
function normalizeGroup(g) {
  const out = { ...g, id: String(g._id || g.id) };
  if (!out.emoji) out.emoji = getGroupEmoji(out.type);
  return out;
}
function isSettlementExpense(e) {
  if (!e) return false;
  if (e.isSettlement === true) return true;
  if (e.category === 'settlement') return true;
  if (typeof e.desc === 'string' && (e.desc.startsWith('Payment:') || e.desc.startsWith('Settlement:'))) return true;
  return false;
}

function getSettlementRecipientEmail(exp) {
  if (!exp) return '';
  if (exp.recipientEmail) return exp.recipientEmail.toLowerCase().trim();
  const splits = exp.splits || {};
  const keys = Object.keys(splits);
  if (keys.length > 0) return keys[0].toLowerCase().trim();
  if (typeof exp.desc === 'string' && exp.desc.includes('→')) {
    const parts = exp.desc.replace(/💵/g, '').split('→');
    if (parts.length === 2) {
      return parts[1].trim().toLowerCase();
    }
  }
  return '';
}

function normalizeExpense(e) {
  const isSettlement = isSettlementExpense(e);
  const out = {
    ...e,
    id: String(e._id || e.id),
    groupId: String(e.groupId),
    isSettlement,
    category: isSettlement ? 'settlement' : (e.category || 'other'),
    settled: isSettlement ? true : Boolean(e.settled)
  };
  if (!out.splits || typeof out.splits !== 'object') out.splits = {};
  return out;
}
function normalizePoll(p) {
  return { ...p, id: String(p._id || p.id), groupId: String(p.groupId) };
}

// ── Confetti (identical to original) ──────────────────────
function launchConfetti() {
  const canvas = $('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#FF5C8A', '#FFD6E8', '#B8F2D0', '#FFB4A2', '#E8D5FF', '#FFD700', '#FF8CB4'];
  const particles = Array.from({ length: 110 }, () => ({
    x: Math.random() * canvas.width, y: -10, r: Math.random() * 6 + 3,
    d: Math.random() * 120 + 20, color: colors[Math.floor(Math.random() * colors.length)],
    tilt: Math.random() * 10 - 10, tiltAngle: 0, tiltAngleInc: Math.random() * 0.07 + 0.05,
    vx: Math.random() * 3 - 1.5, vy: Math.random() * 3 + 2.2,
    shape: Math.random() > 0.5 ? 'circle' : 'rect'
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.tiltAngle += p.tiltAngleInc; p.y += p.vy; p.x += p.vx;
      p.tilt = Math.sin(p.tiltAngle) * 12;
      ctx.beginPath(); ctx.fillStyle = p.color;
      if (p.shape === 'circle') { ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); }
      else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.tiltAngle); ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 1.5); ctx.restore(); }
      ctx.fill();
    });
    frame++;
    if (frame < 140) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

// ── Helper: escape HTML ───────────────────────────────────
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Navigation ────────────────────────────────────────────
const pageOrder = ['home', 'groups', 'add', 'activity'];
function navigateTo(pageId) {
  const currentPage = qs('.page.active');
  const currentIdx = pageOrder.indexOf(currentPage?.id.replace('page-', ''));
  const targetIdx = pageOrder.indexOf(pageId);
  qsa('.page').forEach(p => {
    p.classList.remove('active', 'slide-left', 'slide-right');
    p.classList.remove('hidden');
    p.style.display = 'none';
  });
  const target = $(`page-${pageId}`);
  if (!target) return;
  target.classList.remove('hidden');
  target.style.display = 'block';
  target.classList.add('active');
  if (targetIdx > currentIdx) target.classList.add('slide-right');
  else if (targetIdx < currentIdx) target.classList.add('slide-left');
  qsa('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === pageId));
  if (pageId === 'home') renderHome();
  if (pageId === 'groups') renderGroups();
  if (pageId === 'activity') renderActivity();
  if (pageId === 'add') populateExpenseForm();
}

// ── App Show/Hide (identical to original) ─────────────────
function showApp() { $('app')?.classList.remove('hidden'); $('auth-screen')?.classList.add('hidden'); }
function showAuth() { $('app')?.classList.add('hidden'); $('auth-screen')?.classList.remove('hidden'); $('splash-screen')?.classList.add('hidden'); }
function hideSplash() {
  const splash = $('splash-screen');
  if (!splash) return;
  splash.style.opacity = '0'; splash.style.transition = 'opacity 0.5s ease';
  setTimeout(() => splash.classList.add('hidden'), 500);
}

// ── Auth ───────────────────────────────────────────────────
function initAuthListeners() {
  $('show-signup')?.addEventListener('click', () => {
    $('login-form').classList.add('hidden');
    $('signup-form').classList.remove('hidden');
  });
  $('show-login')?.addEventListener('click', () => {
    $('signup-form').classList.add('hidden');
    $('login-form').classList.remove('hidden');
  });

  // Demo mode — uses localStorage fallback
  $('demo-login-btn')?.addEventListener('click', () => {
    const email = $('login-email')?.value.trim() || 'demo@example.com';
    const name = $('login-name')?.value.trim() || formatNameFromEmail(email) || 'Demo User';
    activateDemoSession(email, name);
  });

  // Real Sign In
  $('login-btn')?.addEventListener('click', async () => {
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email || !password) { showToast('Please fill in all fields 🌸', 'error'); return; }
    const btn = $('login-btn');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      const user = await Auth.login(email, password);
      currentUser = { uid: user._id, _id: user._id, email: user.email, displayName: user.name };
      userProfile = user;
      await onAuthSuccess();
    } catch (err) {
      showToast(err.message || 'Login failed. Check your credentials.', 'error');
    } finally { btn.disabled = false; btn.textContent = 'Sign In 💌'; }
  });

  // Real Sign Up
  $('signup-btn')?.addEventListener('click', async () => {
    const name = $('signup-name').value.trim();
    const email = $('signup-email').value.trim();
    const password = $('signup-password').value;
    if (!name || !email || !password) { showToast('Please fill in all fields 🌸', 'error'); return; }
    if (password.length < 6) { showToast('Password must be 6+ characters 🔒', 'error'); return; }
    const btn = $('signup-btn');
    btn.disabled = true; btn.textContent = 'Creating account...';
    try {
      const user = await Auth.signup(name, email, password);
      currentUser = { uid: user._id, _id: user._id, email: user.email, displayName: user.name };
      userProfile = user;
      await onAuthSuccess();
    } catch (err) {
      showToast(err.message || 'Signup failed. Please try again.', 'error');
    } finally { btn.disabled = false; btn.textContent = 'Create Account 🎉'; }
  });

  // Google login — show informational toast (Google OAuth requires server-side setup)
  $('google-login-btn')?.addEventListener('click', () => {
    showToast('Google login requires Firebase setup. Use email/password or Demo Mode.', 'info', 4000);
  });
}

async function onAuthSuccess() {
  showApp();
  updateTopBar();
  await loadGroups();
  await loadExpenses();
  renderHome();
  hideSplash();
  initSocket();
  checkPendingJoinUrl();
  showToast(`Welcome back, ${userProfile.name?.split(' ')[0] || 'friend'}! ✨`, 'success', 3000);
}

// ── Demo Mode (localStorage fallback, no backend) ─────────
const DEMO_KEY = 'splitup_prod_db_v5';
let activeDemoSession = false;

function getDemoDb() {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || getEmptyDb(); } catch { return getEmptyDb(); }
}
function getEmptyDb() { return { users: {}, groups: [], expenses: [], polls: [] }; }
function saveDemoDb(data) { localStorage.setItem(DEMO_KEY, JSON.stringify(data)); }

function activateDemoSession(email, name) {
  activeDemoSession = true;
  currentUser = { uid: 'demo_user_1', _id: 'demo_user_1', email: email || 'demo@example.com', displayName: name };
  const db = getDemoDb();
  userProfile = db.users['demo_user_1'] || { name, email, currency: 'INR', streak: 0, totalExpenses: 0 };
  userProfile.name = name; userProfile.email = email;
  if (!db.users) db.users = {};
  db.users['demo_user_1'] = userProfile;
  saveDemoDb(db);
  groups = (db.groups || []).map(normalizeGroup);
  expenses = (db.expenses || []).map(normalizeExpense);
  showApp(); updateTopBar(); renderHome(); hideSplash();
  showToast(`Welcome to Split Up, ${name.split(' ')[0]}! (Demo Mode) ✨`, 'success', 3200);
}

// ── Data Loading ───────────────────────────────────────────
async function loadGroups() {
  if (activeDemoSession) {
    groups = (getDemoDb().groups || []).map(normalizeGroup);
    return;
  }
  try {
    const raw = await Groups.list();
    groups = raw.map(normalizeGroup);
  } catch (err) {
    console.error('loadGroups error:', err);
    showToast('Could not load groups. Check connection.', 'error');
  }
}

async function loadExpenses() {
  if (activeDemoSession) {
    expenses = (getDemoDb().expenses || []).map(normalizeExpense);
    return;
  }
  try {
    const raw = await Expenses.list();
    expenses = raw.map(normalizeExpense);
  } catch (err) {
    console.error('loadExpenses error:', err);
  }
}

async function loadPolls(groupId) {
  if (activeDemoSession) {
    return (getDemoDb().polls || []).filter(p => p.groupId === groupId).map(normalizePoll);
  }
  try {
    const raw = await Polls.listByGroup(groupId);
    return raw.map(normalizePoll);
  } catch (err) {
    console.error('loadPolls error:', err);
    return [];
  }
}

// ── Top Bar ────────────────────────────────────────────────
function updateTopBar() {
  const name = userProfile.name || currentUser?.displayName || 'Friend';
  const firstName = name.split(' ')[0];
  if ($('user-avatar')) $('user-avatar').textContent = getUserInitial(name);
  if ($('home-username')) $('home-username').textContent = `Hey, ${firstName}!`;
  if ($('greeting-text')) $('greeting-text').textContent = getGreeting();
  updateSyncStatusBadge();
}

function updateSyncStatusBadge() {
  const badge = $('sync-status-badge');
  if (!badge) return;
  if (activeDemoSession) {
    badge.textContent = '⚡ Local Demo Mode';
    badge.style.background = 'rgba(255, 238, 220, 0.9)';
    badge.style.color = '#B76E00';
  } else if (socket?.connected) {
    badge.textContent = '🟢 Live Sync';
    badge.style.background = 'rgba(184, 242, 208, 0.9)';
    badge.style.color = '#0E6237';
  } else {
    badge.textContent = '🔴 Connecting...';
    badge.style.background = 'rgba(255, 220, 220, 0.9)';
    badge.style.color = '#9E0000';
  }
}

// ── Groups ─────────────────────────────────────────────────
function initGroupListeners() {
  ['new-group-btn', 'inline-new-group-btn'].forEach(id => {
    $(id)?.addEventListener('click', () => {
      pendingMembers = [];
      $('group-name-input').value = '';
      if ($('group-desc-input')) $('group-desc-input').value = '';
      $('member-email-input').value = '';
      renderMemberChips();
      currentGroupType = 'trip';
      qsa('.gtype-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'trip'));
      openModal('modal-create-group');
    });
  });

  $('join-group-btn')?.addEventListener('click', () => { if ($('join-code-input')) $('join-code-input').value = ''; openModal('modal-join-group'); });
  $('submit-join-group-btn')?.addEventListener('click', () => joinGroupByCode($('join-code-input')?.value));
  $('join-code-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); joinGroupByCode(e.target.value); } });
  $('see-all-groups')?.addEventListener('click', () => navigateTo('groups'));
  $('group-type-picker')?.addEventListener('click', e => {
    const btn = e.target.closest('.gtype-btn');
    if (!btn) return;
    currentGroupType = btn.dataset.type;
    qsa('.gtype-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
  $('add-member-btn')?.addEventListener('click', addMemberEmail);
  $('member-email-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addMemberEmail(); } });
  $('create-group-btn')?.addEventListener('click', createGroup);

  // Voice button for creating groups
  const voiceGroupBtn = document.createElement('button');
  voiceGroupBtn.type = 'button';
  voiceGroupBtn.className = 'btn btn-secondary btn-sm';
  voiceGroupBtn.style.cssText = 'margin-top:8px; display:flex; align-items:center; gap:6px;';
  voiceGroupBtn.innerHTML = '🎙️ Name Group by Voice';
  voiceGroupBtn.addEventListener('click', () => openVoiceModal('group', 'Say the group name, e.g. "Goa Trip with friends"'));
  $('group-name-input')?.parentElement?.appendChild(voiceGroupBtn);
}

async function joinGroupByCode(inviteCodeInput) {
  const code = (inviteCodeInput || '').trim().toUpperCase();
  if (!code) { showToast('Please enter a 6-character invite code 🔑', 'error'); return; }
  const btn = $('submit-join-group-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Joining...'; }

  try {
    if (activeDemoSession) {
      const db = getDemoDb();
      const group = db.groups.find(g => (g.inviteCode || '').toUpperCase() === code);
      if (!group) { showToast('No group found with that code 🔍', 'error'); return; }
      if (!group.members) group.members = [currentUser.uid];
      if (!group.members.includes(currentUser.uid)) group.members.push(currentUser.uid);
      if (!group.memberEmails) group.memberEmails = [currentUser.email];
      if (!group.memberEmails.includes(currentUser.email)) group.memberEmails.push(currentUser.email);
      saveDemoDb(db);
      await loadGroups();
      closeModal('modal-join-group');
      showToast(`Joined "${group.name}"! 🎉`, 'success');
      renderGroups(); renderHome();
      openGroupDetail(group.id);
      return;
    }

    const result = await Groups.joinByCode(code);
    if (result.alreadyMember) {
      showToast(`You're already in "${result.group.name}"! 😊`, 'info');
    } else {
      showToast(`Welcome to "${result.group.name}"! 🎉`, 'success');
      launchConfetti();
    }
    await loadGroups();
    closeModal('modal-join-group');
    renderGroups(); renderHome();
    openGroupDetail(String(result.group._id || result.group.id));
  } catch (err) {
    showToast(err.message || 'Failed to join group 😔', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Join Group ✨'; }
  }
}

function addMemberEmail() {
  const inputVal = $('member-email-input').value.trim();
  if (!inputVal) { showToast('Enter a name or email 🌸', 'error'); return; }
  const email = inputVal.includes('@') ? inputVal : `${inputVal.toLowerCase().replace(/\s+/g, '.')}@friend`;
  if (pendingMembers.includes(email)) { showToast('Already added!', 'error'); return; }
  if (email === currentUser?.email) { showToast("You're already in the group 😊", 'error'); return; }
  pendingMembers.push(email);
  $('member-email-input').value = '';
  renderMemberChips();
}

function renderMemberChips() {
  const container = $('members-list');
  if (!container) return;
  const myName = userProfile.name || currentUser?.displayName || 'You';
  const creatorChip = `<span class="member-chip" style="background: var(--pink-light); color: var(--pink-hot); font-weight: 600;">${myName} [you]</span>`;
  container.innerHTML = creatorChip + pendingMembers.map(email => {
    const rawName = email.includes('@friend') ? email.split('@')[0].replace(/\./g, ' ') : email.split('@')[0];
    const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    return `<span class="member-chip">${displayName}<button class="member-chip-remove" data-email="${email}" aria-label="Remove">✕</button></span>`;
  }).join('');
  container.querySelectorAll('.member-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => { pendingMembers = pendingMembers.filter(e => e !== btn.dataset.email); renderMemberChips(); });
  });
}

async function createGroup() {
  const name = $('group-name-input').value.trim();
  const description = $('group-desc-input')?.value.trim() || '';
  if (!name) { showToast('Give your group a name! 🌸', 'error'); return; }

  const btn = $('create-group-btn');
  btn.disabled = true; btn.textContent = 'Creating...';

  try {
    if (activeDemoSession) {
      // Demo: generate local group
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const groupData = {
        id: 'g_' + Date.now(), _id: 'g_' + Date.now(), name, description,
        type: currentGroupType, emoji: getGroupEmoji(currentGroupType), inviteCode: code,
        members: [currentUser.uid], memberEmails: [currentUser.email, ...pendingMembers],
        createdBy: currentUser.uid, createdAt: new Date().toISOString(), savingsGoal: null
      };
      const db = getDemoDb();
      db.groups.unshift(groupData); saveDemoDb(db);
      groups.unshift(normalizeGroup(groupData));
      closeModal('modal-create-group');
      showToast(`"${name}" created! Code: ${code} 🎉`, 'success', 3500);
      renderGroups(); renderHome(); launchConfetti();
      openGroupDetail(groupData.id);
      return;
    }

    const group = await Groups.create({ name, description, type: currentGroupType, memberEmails: pendingMembers });
    await loadGroups();
    closeModal('modal-create-group');
    showToast(`"${name}" created! Code: ${group.inviteCode} 🎉`, 'success', 3500);
    renderGroups();
    renderHome();
    populateExpenseForm();
    launchConfetti();
    openGroupDetail(String(group._id || group.id));
  } catch (err) {
    showToast(err.message || 'Couldn\'t create group 😔', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Group 🌸';
  }
}

function renderGroups() {
  const container = $('groups-list');
  if (!container) return;
  if (!groups || groups.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span class="empty-emoji">🌸</span><p>Create your first group 🌸</p><p class="empty-sub">Tap "+ New" or "🔑 Join" to start!</p></div>`;
    return;
  }
  container.innerHTML = groups.map((g, i) => {
    const gid = String(g.id || g._id);
    const balance = getGroupBalance(gid);
    const totalExpenses = expenses.filter(e => String(e.groupId) === gid && !isSettlementExpense(e)).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const balClass = balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'neutral';
    const balText = balance === 0 ? 'All settled ✓' : balance > 0 ? `+${formatAmount(balance, getUserPreferredCurrency())} owed to you` : `-${formatAmount(Math.abs(balance), getUserPreferredCurrency())} you owe`;
    const memberEmails = g.memberEmails || [];
    const memberAvatarsHtml = memberEmails.slice(0, 4).map(e => {
      const initial = (e[0] || '?').toUpperCase();
      return `<div class="avatar-stack-item" title="${escapeHtml(e)}">${escapeHtml(initial)}</div>`;
    }).join('') + (memberEmails.length > 4 ? `<span class="avatar-stack-more">+${memberEmails.length - 4}</span>` : '');
    const memberNamesStr = memberEmails.map(e => e === currentUser?.email ? 'You' : formatNameFromEmail(e)).join(', ');

    return `<div class="group-card anim-fade-in" data-group-id="${gid}" style="animation-delay:${i * 0.05}s">
      <span class="group-card-emoji">${g.emoji || '📦'}</span>
      <div class="group-card-name">${escapeHtml(g.name)}</div>
      <div class="member-avatars-stack">${memberAvatarsHtml}</div>
      <div class="group-card-members" title="${escapeHtml(memberNamesStr)}">${escapeHtml(memberNamesStr || '1 member')} · Total: ${formatAmount(totalExpenses, getUserPreferredCurrency())}</div>
      <div class="group-card-balance ${balClass}">${balText}</div>
    </div>`;
  }).join('');
  container.querySelectorAll('.group-card').forEach(card => {
    card.addEventListener('click', () => openGroupDetail(card.dataset.groupId));
  });
}

function renderHomeGroups() {
  const container = $('home-groups-list');
  if (!container) return;
  if (!groups || groups.length === 0) { container.innerHTML = `<div class="empty-state-inline"><span>🌸</span><p>Create your first group!</p></div>`; return; }
  container.innerHTML = groups.slice(0, 8).map(g => {
    const gid = String(g.id || g._id);
    const balance = getGroupBalance(gid);
    const balClass = balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'neutral';
    const balText = balance === 0 ? 'Settled ✓' : balance > 0 ? `+${formatAmount(balance, getUserPreferredCurrency())}` : `-${formatAmount(Math.abs(balance), getUserPreferredCurrency())}`;
    const memberEmails = g.memberEmails || [];
    const memberAvatarsHtml = memberEmails.slice(0, 3).map(e => {
      const initial = (e[0] || '?').toUpperCase();
      return `<div class="avatar-stack-item" title="${escapeHtml(e)}">${escapeHtml(initial)}</div>`;
    }).join('') + (memberEmails.length > 3 ? `<span class="avatar-stack-more">+${memberEmails.length - 3}</span>` : '');

    return `<div class="group-chip" data-group-id="${gid}">
      <span class="group-chip-emoji">${g.emoji || '📦'}</span>
      <div class="group-chip-name">${escapeHtml(g.name)}</div>
      <div class="member-avatars-stack">${memberAvatarsHtml}</div>
      <div class="group-chip-balance ${balClass}">${balText}</div>
    </div>`;
  }).join('');
  container.querySelectorAll('.group-chip').forEach(chip => chip.addEventListener('click', () => openGroupDetail(chip.dataset.groupId)));
}

// ── Expenses ───────────────────────────────────────────────
function initExpenseForm() {
  $('category-picker')?.addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    currentCategory = btn.dataset.cat;
    qsa('.cat-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
  $('mood-picker')?.addEventListener('click', e => {
    const btn = e.target.closest('.mood-btn');
    if (!btn) return;
    currentMood = btn.dataset.mood;
    qsa('.mood-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
  $('split-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.split-tab');
    if (!tab) return;
    currentSplitMethod = tab.dataset.method;
    qsa('.split-tab').forEach(t => t.classList.toggle('active', t === tab));
    renderSplitDetail();
  });
  $('receipt-upload-btn')?.addEventListener('click', triggerReceiptScanner);
  $('receipt-file')?.addEventListener('change', handleReceiptUpload);
  $('iou-emoji-btn')?.addEventListener('click', () => {
    const emojis = ['😭', '🙏', '💸', '🐷', '🎀', '💅', '🥺', '🫶', '✨', '😬'];
    const current = $('iou-note').value;
    $('iou-note').value = (current ? current + ' ' : '') + emojis[Math.floor(Math.random() * emojis.length)];
  });
  $('expense-amount')?.addEventListener('input', renderSplitDetail);
  $('expense-group')?.addEventListener('change', () => {
    currentGroupId = $('expense-group').value;
    renderSplitDetail(); populatePaidBy();
  });
  $('add-expense-form')?.addEventListener('submit', submitExpense);

  // Voice button for expense
  const voiceBtn = document.createElement('button');
  voiceBtn.type = 'button'; voiceBtn.className = 'btn btn-secondary btn-sm';
  voiceBtn.style.marginTop = '8px';
  voiceBtn.innerHTML = '🎙️ Voice Receipt & Log';
  voiceBtn.addEventListener('click', () => openVoiceModal('expense', 'Say: "Dinner 1200 at Zomato with Goa Trip"'));
  $('add-expense-form')?.appendChild(voiceBtn);
}

function populateExpenseForm() {
  const sel = $('expense-group');
  if (!sel) return;
  const options = ['<option value="g_personal">👤 Personal / General Expenses</option>', ...groups.map(g => `<option value="${g.id || g._id}">${g.emoji} ${g.name}</option>`)];
  sel.innerHTML = options.join('');
  if (currentGroupId && groups.some(g => (g.id || g._id) === currentGroupId)) sel.value = currentGroupId;
  else if (groups.length > 0) { sel.value = groups[0].id || groups[0]._id; currentGroupId = sel.value; }
  else { sel.value = 'g_personal'; currentGroupId = 'g_personal'; }
  if ($('expense-date')) $('expense-date').value = new Date().toISOString().split('T')[0];
  populatePaidBy();
  if ($('expense-currency')) $('expense-currency').value = getUserPreferredCurrency();
  currentCategory = 'food'; currentMood = 'worth-it'; currentSplitMethod = 'equal';
  qsa('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === 'food'));
  qsa('.mood-btn').forEach(b => b.classList.toggle('active', b.dataset.mood === 'worth-it'));
  qsa('.split-tab').forEach(t => t.classList.toggle('active', t.dataset.method === 'equal'));
  renderSplitDetail();
}

function populatePaidBy() {
  const sel = $('expense-paid-by');
  if (!sel) return;
  sel.innerHTML = `<option value="${currentUser.uid}">Me (${userProfile.name || 'You'})</option>`;
  const group = groups.find(g => (g.id || g._id) === currentGroupId);
  if (group?.memberEmails) {
    group.memberEmails.filter(e => e !== currentUser.email).forEach(email => {
      sel.innerHTML += `<option value="${email}">${email.split('@')[0]}</option>`;
    });
  }
}

function renderSplitDetail() {
  const amount = parseFloat($('expense-amount').value) || 0;
  const container = $('split-detail');
  if (!container) return;
  const group = groups.find(g => (g.id || g._id) === $('expense-group').value);
  const members = group?.memberEmails || [currentUser.email];
  const currency = $('expense-currency').value;
  if (!amount) { container.innerHTML = ''; return; }
  if (currentSplitMethod === 'equal') {
    const each = amount / members.length;
    container.innerHTML = `<div class="split-equal-preview">⚖️ Each person pays <strong>${formatAmount(each, currency)}</strong> (${members.length} people)</div>`;
    return;
  }
  if (currentSplitMethod === 'percentage') {
    container.innerHTML = members.map(email => `<div class="split-person-row"><span class="split-person-name">${email === currentUser.email ? 'Me' : email.split('@')[0]}</span><input type="number" class="split-person-input" data-email="${email}" placeholder="%" min="0" max="100" value="${Math.round(100 / members.length)}" /><span>%</span></div>`).join('');
    return;
  }
  if (currentSplitMethod === 'exact') {
    container.innerHTML = members.map(email => `<div class="split-person-row"><span class="split-person-name">${email === currentUser.email ? 'Me' : email.split('@')[0]}</span><input type="number" class="split-person-input" data-email="${email}" placeholder="${formatAmount(amount / members.length, currency)}" min="0" step="0.01" /></div>`).join('');
    return;
  }
  if (currentSplitMethod === 'shares') {
    container.innerHTML = members.map(email => `<div class="split-person-row"><span class="split-person-name">${email === currentUser.email ? 'Me' : email.split('@')[0]}</span><input type="number" class="split-person-input" data-email="${email}" placeholder="shares" min="0" value="1" /><span>shares</span></div>`).join('');
  }
}

function getSplitData(amount, members, currency) {
  if (!members || members.length === 0) { showToast('Cannot split with zero people! ⚠️', 'error'); return null; }
  if (!amount || amount <= 0 || isNaN(amount)) { showToast('Amount must be greater than zero 💰', 'error'); return null; }
  if (currentSplitMethod === 'equal') {
    const each = amount / members.length;
    return Object.fromEntries(members.map(m => [m, parseFloat(each.toFixed(2))]));
  }
  const inputs = qsa('#split-detail .split-person-input');
  const values = inputs.map(i => ({ email: i.dataset.email, val: parseFloat(i.value) }));
  if (values.some(v => isNaN(v.val) || v.val < 0)) { showToast('Split values cannot be negative or empty! ⚠️', 'error'); return null; }
  if (currentSplitMethod === 'percentage') {
    const total = values.reduce((s, v) => s + v.val, 0);
    if (Math.abs(total - 100) > 0.5) { showToast(`Percentages must add up to 100% (currently ${total.toFixed(1)}%)`, 'error'); return null; }
    return Object.fromEntries(values.map(v => [v.email, parseFloat(((v.val / 100) * amount).toFixed(2))]));
  }
  if (currentSplitMethod === 'exact') {
    const total = values.reduce((s, v) => s + v.val, 0);
    if (Math.abs(total - amount) > 0.05) { showToast(`Exact amounts must add up to total ${formatAmount(amount, currency)}`, 'error'); return null; }
    return Object.fromEntries(values.map(v => [v.email, parseFloat(v.val.toFixed(2))]));
  }
  if (currentSplitMethod === 'shares') {
    const totalShares = values.reduce((s, v) => s + v.val, 0);
    if (totalShares <= 0) { showToast('Total shares must be > 0! ⚠️', 'error'); return null; }
    return Object.fromEntries(values.map(v => [v.email, parseFloat(((v.val / totalShares) * amount).toFixed(2))]));
  }
  return null;
}

async function submitExpense(e) {
  e.preventDefault();
  const desc = $('expense-desc').value.trim();
  const amount = parseFloat($('expense-amount').value);
  const dateVal = $('expense-date')?.value || new Date().toISOString().split('T')[0];
  const currency = $('expense-currency').value;
  const groupId = $('expense-group').value;
  const iouNote = $('iou-note').value.trim();
  const notes = $('expense-notes')?.value.trim() || '';
  const paidBy = $('expense-paid-by').value;

  if (!desc) { showToast('What was the expense for? 🌸', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Amount must be > 0 💰', 'error'); return; }
  if (!groupId) { showToast('Pick a group! 👯', 'error'); return; }

  let group = groups.find(g => String(g.id || g._id) === String(groupId));
  if (!group && (groupId === 'g_personal' || groupId === 'personal')) {
    group = { id: 'g_personal', _id: 'g_personal', name: 'Personal Expenses 👤', type: 'other', emoji: '👤', members: [currentUser.uid], memberEmails: [currentUser.email], createdBy: currentUser.uid, createdAt: new Date().toISOString(), savingsGoal: null };
  }

  const members = group?.memberEmails || [currentUser.email];
  const splitData = getSplitData(amount, members, currency);
  if (!splitData) return;

  const btn = $('submit-expense-btn');
  btn.disabled = true; btn.textContent = 'Adding...';

  try {
    const expenseData = {
      desc, amount, currency, date: dateVal, category: currentCategory,
      emoji: getCategoryEmoji(currentCategory), mood: currentMood,
      groupId: group.id || group._id, groupName: group.name,
      paidBy: paidBy === currentUser.uid ? currentUser._id || currentUser.uid : paidBy,
      paidByEmail: paidBy === currentUser.uid ? currentUser.email : paidBy,
      paidByName: paidBy === currentUser.uid ? (userProfile.name || 'Me') : paidBy.split('@')[0],
      splits: splitData, splitMethod: currentSplitMethod, iouNote, notes,
      settled: false
    };

    if (activeDemoSession) {
      const demoExp = { ...expenseData, id: 'exp_' + Date.now(), _id: 'exp_' + Date.now(), involvedUsers: [currentUser.uid], createdBy: currentUser.uid, createdAt: new Date().toISOString() };
      const db = getDemoDb();
      db.expenses.unshift(demoExp); saveDemoDb(db);
      expenses.unshift(normalizeExpense(demoExp));
      userProfile.totalExpenses = (userProfile.totalExpenses || 0) + 1;
    } else {
      const saved = await Expenses.create(expenseData);
      expenses.unshift(normalizeExpense(saved));
      userProfile.totalExpenses = (userProfile.totalExpenses || 0) + 1;
      await loadExpenses();
      await loadGroups();
    }

    showToast('Expense added! 🎉', 'success'); addBounce(btn);
    $('expense-desc').value = ''; $('expense-amount').value = ''; $('iou-note').value = '';
    if ($('expense-notes')) $('expense-notes').value = '';
    $('split-detail').innerHTML = '';
    if ($('receipt-preview')) $('receipt-preview').classList.add('hidden');
    setTimeout(() => navigateTo('home'), 500);
  } catch (err) {
    showToast(err.message || 'Couldn\'t add expense 😔', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Add Expense 💖';
  }
}

// ── Receipt Scanner (demo sim) ─────────────────────────────
function triggerReceiptScanner() { openReceiptScannerModal(); }
function handleReceiptUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const preview = $('receipt-preview');
    if (preview) { preview.classList.remove('hidden'); preview.innerHTML = `<img src="${ev.target.result}" alt="Receipt" style="max-height:80px; border-radius:8px;" />`; }
    openReceiptScannerModal();
  };
  reader.readAsDataURL(file);
}
function openReceiptScannerModal() {
  const group = groups.find(g => (g.id || g._id) === $('expense-group')?.value) || groups[0];
  const members = group?.memberEmails || [currentUser.email];
  parsedReceiptItems = [
    { name: 'Margherita Pizza 🍕', price: 650, assignees: [currentUser.email] },
    { name: 'Cold Coffee x2 ☕', price: 320, assignees: [currentUser.email] },
    { name: 'Garlic Bread 🥖', price: 240, assignees: members.slice(0, 2) },
    { name: 'Taxes & Tip 🧾', price: 140, assignees: members }
  ];
  renderReceiptItems(members); openModal('modal-receipt-scanner');
}
function renderReceiptItems(members) {
  const container = $('receipt-items-list'); if (!container) return;
  container.innerHTML = parsedReceiptItems.map((item, idx) => `
    <div class="receipt-item-row">
      <div class="receipt-item-info"><span class="receipt-item-title">${item.name}</span><span class="receipt-item-price">${formatAmount(item.price)}</span></div>
      <div class="receipt-item-assignees">${members.map(m => { const selected = item.assignees.includes(m); return `<span class="receipt-member-chip ${selected ? 'selected' : ''}" data-item-idx="${idx}" data-email="${m}">${m === currentUser.email ? 'Me' : m.split('@')[0]}</span>`; }).join('')}</div>
    </div>`).join('');
  const total = parsedReceiptItems.reduce((s, i) => s + i.price, 0);
  if ($('receipt-scanned-total')) $('receipt-scanned-total').textContent = formatAmount(total);
  container.querySelectorAll('.receipt-member-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const idx = parseInt(chip.dataset.itemIdx), email = chip.dataset.email, item = parsedReceiptItems[idx];
      if (item.assignees.includes(email)) { if (item.assignees.length > 1) item.assignees = item.assignees.filter(e => e !== email); }
      else item.assignees.push(email);
      renderReceiptItems(members);
    });
  });
  $('apply-receipt-split-btn').onclick = () => {
    const totalAmount = parsedReceiptItems.reduce((s, i) => s + i.price, 0);
    const memberShares = {};
    members.forEach(m => memberShares[m] = 0);
    parsedReceiptItems.forEach(item => { const each = item.price / item.assignees.length; item.assignees.forEach(m => { memberShares[m] = (memberShares[m] || 0) + each; }); });
    $('expense-desc').value = 'Group Dinner (Receipt Scanned) 🍕';
    $('expense-amount').value = totalAmount.toFixed(2);
    currentSplitMethod = 'exact';
    qsa('.split-tab').forEach(t => t.classList.toggle('active', t.dataset.method === 'exact'));
    renderSplitDetail();
    qsa('#split-detail .split-person-input').forEach(inp => { if (memberShares[inp.dataset.email] !== undefined) inp.value = memberShares[inp.dataset.email].toFixed(2); });
    closeModal('modal-receipt-scanner'); showToast('Receipt items split applied! ✨', 'success');
  };
}

// ── Speech Recognition ─────────────────────────────────────
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = 'en-IN';
  return rec;
}

function openVoiceModal(context, hint) {
  speechContext = context;
  voiceTranscript = '';
  const status = $('voice-status-text');
  const transcript = $('voice-transcript');
  const micCircle = $('voice-mic-trigger');
  const applyBtn = $('apply-voice-log-btn');
  if (status) status.innerHTML = hint || 'Tap the mic and speak 🎙️';
  if (transcript) { transcript.innerHTML = ''; transcript.classList.add('hidden'); }
  if (applyBtn) applyBtn.classList.add('hidden');
  openModal('modal-voice-log');

  micCircle.onclick = () => {
    const rec = initSpeechRecognition();
    if (!rec) {
      // Fallback simulation when speech API not available
      micCircle.classList.add('listening');
      if (status) status.textContent = 'Listening... Speak now! 🎙️';
      setTimeout(() => {
        micCircle.classList.remove('listening');
        const fakeText = context === 'group' ? 'Goa trip with friends'
          : context === 'poll' ? 'Should we buy the expensive gadget?'
          : 'Dinner 1200 at Zomato with Goa Trip';
        if (transcript) { transcript.textContent = `"${fakeText}"`; transcript.classList.remove('hidden'); }
        if (status) status.textContent = 'Heard something! Confirm below ✨';
        voiceTranscript = fakeText;
        if (applyBtn) { applyBtn.classList.remove('hidden'); applyBtn.textContent = `✅ Use: "${fakeText}"`; }
      }, 2200);
      return;
    }

    micCircle.classList.add('listening');
    if (status) status.textContent = 'Listening... Speak now! 🎙️';

    rec.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) voiceTranscript += event.results[i][0].transcript;
        else interim = event.results[i][0].transcript;
      }
      if (transcript) {
        transcript.textContent = `"${voiceTranscript || interim}"`;
        transcript.classList.remove('hidden');
      }
    };

    rec.onerror = () => { micCircle.classList.remove('listening'); if (status) status.textContent = 'Mic error — check browser permissions.'; };
    rec.onend = () => {
      micCircle.classList.remove('listening');
      if (!voiceTranscript) { if (status) status.textContent = 'Nothing heard. Tap mic and try again.'; return; }
      if (status) status.textContent = 'Got it! Confirm & apply below ✨';
      if (applyBtn) { applyBtn.classList.remove('hidden'); applyBtn.textContent = `✅ Use: "${voiceTranscript.substring(0, 40)}..."`; }
    };

    rec.start();
  };

  if (applyBtn) {
    applyBtn.onclick = () => {
      applyVoiceTranscript(voiceTranscript, context);
      closeModal('modal-voice-log');
    };
  }
}

function applyVoiceTranscript(text, context) {
  if (!text) return;
  text = text.trim();

  if (context === 'group') {
    if ($('group-name-input')) $('group-name-input').value = text;
    showToast('Group name filled! Review & create 🌸', 'success');
    return;
  }

  if (context === 'poll') {
    if ($('poll-question')) $('poll-question').value = text;
    showToast('Poll question filled! Review & launch 🗳️', 'success');
    return;
  }

  // expense context — parse "Dinner 1200 at Zomato"
  const amountMatch = text.match(/(\d[\d.,]*)/);
  const amount = amountMatch ? amountMatch[1].replace(',', '') : '';
  const descClean = text.replace(/\d[\d.,]*/g, '').replace(/\b(with|at|from|for)\b/gi, '').replace(/\s+/g, ' ').trim();
  if ($('expense-desc')) $('expense-desc').value = descClean || text;
  if ($('expense-amount') && amount) $('expense-amount').value = amount;
  if (groups.length > 0 && $('expense-group')) {
    const lower = text.toLowerCase();
    const match = groups.find(g => lower.includes(g.name.toLowerCase()));
    if (match) $('expense-group').value = match.id || match._id;
  }
  renderSplitDetail();
  showToast('Voice expense populated! Review & add ✨', 'success');
}

// ── Home & Dashboard ───────────────────────────────────────
function renderHome() {
  if (!currentUser) return;
  let totalOwed = 0, totalOwes = 0;
  const myEmail = (currentUser.email || '').toLowerCase().trim();

  groups.forEach(g => {
    const gid = String(g.id || g._id);
    const debts = getGroupBalanceSheet(gid);
    debts.forEach(d => {
      const fromEmail = (d.from || '').toLowerCase().trim();
      const toEmail = (d.to || '').toLowerCase().trim();
      if (fromEmail === myEmail) {
        totalOwes += d.amount;
      }
      if (toEmail === myEmail) {
        totalOwed += d.amount;
      }
    });
  });

  const net = totalOwed - totalOwes;
  const currency = getUserPreferredCurrency();
  if ($('stat-owed')) $('stat-owed').textContent = formatAmount(totalOwed, currency);
  if ($('stat-owes')) $('stat-owes').textContent = formatAmount(totalOwes, currency);
  if ($('home-net-balance')) {
    $('home-net-balance').textContent = (net > 0 ? '+' : '') + formatAmount(net, currency);
    $('home-net-balance').style.color = net > 0 ? '#10b981' : net < 0 ? '#FFB4A2' : 'white';
  }
  const streak = userProfile.streak || 0;
  if ($('stat-streak')) $('stat-streak').textContent = `${streak}d`;
  renderHomeGroups();
  renderRecentActivity();
}

function renderRecentActivity() {
  const container = $('recent-activity-list'); if (!container) return;
  const recent = expenses.slice(0, 5);
  if (recent.length === 0) { container.innerHTML = `<div class="empty-state"><span class="empty-emoji">🎀</span><p>No expenses yet — add your first one!</p></div>`; return; }
  container.innerHTML = recent.map(exp => renderActivityItem(exp)).join('');
  attachDeleteListeners(container);
}

function renderActivity() {
  const container = $('activity-list'); if (!container) return;
  let filtered = [...expenses];
  const myEmail = (currentUser?.email || '').toLowerCase().trim();
  if (currentFilter === 'settled') {
    filtered = expenses.filter(e => e.settled || isSettlementExpense(e));
  } else if (currentFilter === 'owed') {
    filtered = expenses.filter(e => !e.settled && !isSettlementExpense(e) && (e.paidByEmail || '').toLowerCase().trim() === myEmail);
  } else if (currentFilter === 'owes') {
    filtered = expenses.filter(e => !e.settled && !isSettlementExpense(e) && (e.paidByEmail || '').toLowerCase().trim() !== myEmail && ((e.splits || {})[myEmail] || 0) > 0);
  }
  const sortVal = $('activity-sort')?.value || 'newest';
  if (sortVal === 'newest') filtered.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  else if (sortVal === 'oldest') filtered.sort((a, b) => new Date(a.createdAt || a.date) - new Date(b.createdAt || b.date));
  else if (sortVal === 'highest') filtered.sort((a, b) => (b.amount || 0) - (a.amount || 0));
  else filtered.sort((a, b) => (a.amount || 0) - (b.amount || 0));
  if (filtered.length === 0) { container.innerHTML = `<div class="empty-state"><span class="empty-emoji">📋</span><p>Your activity will appear here.</p></div>`; return; }
  container.innerHTML = filtered.map(exp => renderActivityItem(exp)).join('');
  attachDeleteListeners(container);
}

let currentConfirmAction = null;
function showConfirmDialog(title, message, onProceed) {
  if ($('confirm-modal-title')) $('confirm-modal-title').textContent = title || 'Confirm Action ⚠️';
  if ($('confirm-modal-message')) $('confirm-modal-message').textContent = message || 'Are you sure?';
  currentConfirmAction = onProceed;
  openModal('modal-confirm-action');
  $('confirm-modal-cancel').onclick = () => { closeModal('modal-confirm-action'); currentConfirmAction = null; };
  $('confirm-modal-proceed').onclick = async () => {
    closeModal('modal-confirm-action');
    if (currentConfirmAction) { const action = currentConfirmAction; currentConfirmAction = null; await action(); }
  };
}

async function deleteExpense(expenseId) {
  const exp = expenses.find(e => (e.id || e._id) === expenseId);
  showConfirmDialog('Delete Expense 🗑️', `Delete "${exp?.desc || 'this expense'}"? This cannot be undone.`, async () => {
    try {
      if (activeDemoSession) {
        const db = getDemoDb(); db.expenses = db.expenses.filter(e => (e.id || e._id) !== expenseId); saveDemoDb(db);
      } else {
        await Expenses.delete(expenseId);
      }
      expenses = expenses.filter(e => (e.id || e._id) !== expenseId);
      userProfile.totalExpenses = Math.max(0, (userProfile.totalExpenses || 1) - 1);
      showToast('Expense deleted 🗑️', 'info');
      renderHome(); renderGroups(); renderActivity();
      if (currentGroupId) { const g = groups.find(x => (x.id || x._id) === currentGroupId); if (g) { renderVibeScore(currentGroupId); renderGroupBalances(currentGroupId, g); renderGroupExpenses(currentGroupId); } }
    } catch (err) { showToast(err.message || 'Could not delete expense 😔', 'error'); }
  });
}

async function deleteGroup(groupId) {
  const group = groups.find(g => (g.id || g._id) === groupId);
  if (!group) return;
  showConfirmDialog('Delete Group 🗑️', `Delete "${group.name}" and all its expenses?`, async () => {
    try {
      if (activeDemoSession) {
        const db = getDemoDb();
        db.groups = db.groups.filter(g => (g.id || g._id) !== groupId);
        db.expenses = db.expenses.filter(e => e.groupId !== groupId);
        saveDemoDb(db);
      } else {
        await Groups.delete(groupId);
      }
      groups = groups.filter(g => (g.id || g._id) !== groupId);
      expenses = expenses.filter(e => e.groupId !== groupId);
      closeModal('modal-group-detail');
      showToast(`Group "${group.name}" deleted 🗑️`, 'info');
      renderHome(); renderGroups(); renderActivity();
    } catch (err) { showToast(err.message || 'Could not delete group 😔', 'error'); }
  });
}

function openEditExpenseModal(expenseId) {
  const exp = expenses.find(e => (e.id || e._id) === expenseId); if (!exp) return;
  if ($('edit-expense-id')) $('edit-expense-id').value = exp.id || exp._id;
  if ($('edit-expense-desc')) $('edit-expense-desc').value = exp.desc;
  if ($('edit-expense-amount')) $('edit-expense-amount').value = exp.amount;
  if ($('edit-expense-date')) $('edit-expense-date').value = exp.date || new Date().toISOString().split('T')[0];
  openModal('modal-edit-expense');
}

function renderActivityItem(exp) {
  const myEmail = (currentUser?.email || '').toLowerCase().trim();
  const currency = exp.currency || 'INR';
  const isSettlement = isSettlementExpense(exp);

  if (isSettlement) {
    const payerEmail = (exp.paidByEmail || '').toLowerCase().trim();
    const recipientEmail = getSettlementRecipientEmail(exp);
    const amount = parseFloat(exp.amount) || 0;

    const isPayerMe = payerEmail === myEmail;
    const isRecipientMe = recipientEmail === myEmail;

    let titleText = '';
    let amountText = '';
    let amountClass = '';

    if (isPayerMe) {
      const toName = recipientEmail ? (recipientEmail === myEmail ? 'You' : formatNameFromEmail(recipientEmail)) : 'Friend';
      titleText = `You paid ${toName} 💵`;
      amountText = `-${formatAmount(amount, currency)}`;
      amountClass = 'negative';
    } else if (isRecipientMe) {
      const fromName = payerEmail ? (payerEmail === myEmail ? 'You' : formatNameFromEmail(payerEmail)) : 'Friend';
      titleText = `${fromName} paid You 💵`;
      amountText = `+${formatAmount(amount, currency)}`;
      amountClass = 'positive';
    } else {
      const fromName = payerEmail ? formatNameFromEmail(payerEmail) : 'Member';
      const toName = recipientEmail ? formatNameFromEmail(recipientEmail) : 'Member';
      titleText = `${fromName} paid ${toName} 💵`;
      amountText = formatAmount(amount, currency);
      amountClass = 'neutral';
    }

    return `<div class="activity-item settlement-item" data-expense-id="${exp.id || exp._id}">
      <div class="activity-emoji">💵</div>
      <div class="activity-body">
        <div class="activity-desc" style="font-weight:600;">${escapeHtml(titleText)}</div>
        <div class="activity-meta">${escapeHtml(exp.groupName || 'Settlement')} · ${timeAgo(exp.createdAt || exp.date)}</div>
        ${exp.notes ? `<div class="expense-personal-notes">📝 <strong>Note:</strong> ${escapeHtml(exp.notes)}</div>` : ''}
        <span class="settled-badge" style="display:inline-block; margin-top:4px; padding:2px 8px; border-radius:12px; font-size:0.75rem; background:rgba(34,197,94,0.15); color:#16a34a; font-weight:600;">✓ Payment Settled</span>
      </div>
      <div class="activity-amount ${amountClass}" style="display:flex; align-items:center; gap:6px;">
        <span style="font-weight:700;">${amountText}</span>
        <button class="delete-expense-btn" data-expense-id="${exp.id || exp._id}" title="Delete settlement" style="background:none; border:none; cursor:pointer; font-size:0.85rem; opacity:0.65; padding:2px 4px;">🗑️</button>
      </div>
    </div>`;
  }

  // Regular Expense
  const payerEmail = (exp.paidByEmail || '').toLowerCase().trim();
  const paidByMe = exp.paidBy === currentUser.uid || payerEmail === myEmail;
  const myShare = parseFloat(exp.splits?.[myEmail] ?? exp.splits?.[currentUser.email] ?? 0) || 0;
  let amountText, amountClass;

  if (exp.settled) {
    amountText = `✓ Settled`;
    amountClass = '';
  } else if (paidByMe) {
    const othersOwe = Object.entries(exp.splits || {})
      .filter(([e]) => e.toLowerCase().trim() !== myEmail)
      .reduce((s, [, v]) => s + (parseFloat(v) || 0), 0);
    amountText = `+${formatAmount(othersOwe, currency)}`;
    amountClass = 'positive';
  } else {
    amountText = `-${formatAmount(myShare, currency)}`;
    amountClass = 'negative';
  }

  const moodBadges = { 'worth-it': '✨ Worth it', 'treat-yourself': '🛍 Treat', 'regret': '😬 Regret', 'necessary': '📌 Necessary', 'yolo': '🤙 YOLO' };
  return `<div class="activity-item" data-expense-id="${exp.id || exp._id}">
    <div class="activity-emoji">${exp.emoji || '📦'}</div>
    <div class="activity-body">
      <div class="activity-desc">${escapeHtml(exp.desc)}</div>
      <div class="activity-meta">${escapeHtml(exp.groupName || '')} · ${timeAgo(exp.createdAt || exp.date)}${exp.iouNote ? `<br><em style="color:var(--pink-hot)">💬 ${escapeHtml(exp.iouNote)}</em>` : ''}</div>
      ${exp.notes ? `<div class="expense-personal-notes">📝 <strong>Note:</strong> ${escapeHtml(exp.notes)}</div>` : ''}
      ${exp.mood ? `<span class="mood-tag">${moodBadges[exp.mood] || exp.mood}</span>` : ''}
      ${exp.settled ? '<span class="settled-badge">✓ Settled</span>' : ''}
    </div>
    <div class="activity-amount ${amountClass}" style="display:flex; align-items:center; gap:6px;">
      <span>${amountText}</span>
      <button class="edit-expense-btn" data-expense-id="${exp.id || exp._id}" title="Edit" style="background:none; border:none; cursor:pointer; font-size:0.85rem; opacity:0.65; padding:2px 4px;">✏️</button>
      <button class="delete-expense-btn" data-expense-id="${exp.id || exp._id}" title="Delete" style="background:none; border:none; cursor:pointer; font-size:0.85rem; opacity:0.65; padding:2px 4px;">🗑️</button>
    </div>
  </div>`;
}

function attachDeleteListeners(container) {
  if (!container) return;
  container.querySelectorAll('.delete-expense-btn').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); deleteExpense(btn.dataset.expenseId); };
  });
  container.querySelectorAll('.edit-expense-btn').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); openEditExpenseModal(btn.dataset.expenseId); };
  });
}

// ── Financial Ledger Balance Calculations ──────────────────
function getGroupNetBalances(groupId) {
  const netBalances = {};
  const group = groups.find(g => String(g.id || g._id) === String(groupId));
  if (group && Array.isArray(group.memberEmails)) {
    group.memberEmails.forEach(email => {
      if (email) netBalances[email.toLowerCase().trim()] = 0;
    });
  }

  const groupExpenses = expenses.filter(e => String(e.groupId) === String(groupId));

  groupExpenses.forEach(exp => {
    const amount = parseFloat(exp.amount) || 0;
    if (amount <= 0) return;

    const payer = (exp.paidByEmail || '').toLowerCase().trim();
    if (!payer) return;

    if (netBalances[payer] === undefined) netBalances[payer] = 0;

    if (isSettlementExpense(exp)) {
      const recipient = getSettlementRecipientEmail(exp);
      if (recipient) {
        if (netBalances[recipient] === undefined) netBalances[recipient] = 0;
        netBalances[payer] += amount;
        netBalances[recipient] -= amount;
      }
    } else {
      const splits = exp.splits || {};
      const splitEntries = Object.entries(splits);

      if (splitEntries.length > 0) {
        let totalAssigned = 0;
        splitEntries.forEach(([email, shareAmt]) => {
          const mEmail = email.toLowerCase().trim();
          const share = parseFloat(shareAmt) || 0;
          if (netBalances[mEmail] === undefined) netBalances[mEmail] = 0;
          netBalances[mEmail] -= share;
          totalAssigned += share;
        });
        netBalances[payer] += totalAssigned;
      } else {
        const members = (group?.memberEmails || [payer]).map(e => e.toLowerCase().trim());
        const share = amount / (members.length || 1);
        members.forEach(m => {
          if (netBalances[m] === undefined) netBalances[m] = 0;
          netBalances[m] -= share;
        });
        netBalances[payer] += amount;
      }
    }
  });

  return netBalances;
}

function getGroupBalance(groupId) {
  if (!currentUser || !currentUser.email) return 0;
  const netBalances = getGroupNetBalances(groupId);
  const myEmail = currentUser.email.toLowerCase().trim();
  const bal = netBalances[myEmail] || 0;
  return Math.round(bal * 100) / 100;
}

function getGroupBalanceSheet(groupId) {
  const netBalances = getGroupNetBalances(groupId);
  const debtors = [];
  const creditors = [];

  Object.entries(netBalances).forEach(([email, bal]) => {
    const rounded = Math.round(bal * 100) / 100;
    if (rounded < -0.01) {
      debtors.push({ email, amount: -rounded });
    } else if (rounded > 0.01) {
      creditors.push({ email, amount: rounded });
    }
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const debts = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const settleAmt = Math.min(debtor.amount, creditor.amount);

    if (settleAmt > 0.01) {
      debts.push({
        from: debtor.email,
        to: creditor.email,
        amount: Math.round(settleAmt * 100) / 100
      });
    }

    debtor.amount = Math.round((debtor.amount - settleAmt) * 100) / 100;
    creditor.amount = Math.round((creditor.amount - settleAmt) * 100) / 100;

    if (debtor.amount <= 0.01) dIdx++;
    if (creditor.amount <= 0.01) cIdx++;
  }

  return debts;
}

// ── Group Detail ───────────────────────────────────────────
function openGroupDetail(groupId) {
  currentGroupId = String(groupId);
  const group = groups.find(g => String(g.id || g._id) === currentGroupId);
  if (!group) return;

  if ($('gd-title')) $('gd-title').textContent = `${group.emoji} ${group.name}`;
  if ($('gd-invite-code')) $('gd-invite-code').textContent = group.inviteCode || 'N/A';

  if ($('gd-copy-code-btn')) {
    $('gd-copy-code-btn').onclick = () => {
      if (!group.inviteCode) return;
      navigator.clipboard.writeText(group.inviteCode);
      showToast(`Invite code ${group.inviteCode} copied! 📋`, 'success');
    };
  }
  if ($('gd-copy-link-btn')) {
    $('gd-copy-link-btn').onclick = () => {
      if (!group.inviteCode) return;
      const url = `${window.location.origin}${window.location.pathname}?join=${group.inviteCode}`;
      navigator.clipboard.writeText(url);
      showToast('Invite link copied! 🔗', 'success');
    };
  }

  // Add Expense btn
  const header = $('gd-title')?.parentElement;
  let addExpBtn = header?.querySelector('.gd-add-exp-btn');
  if (!addExpBtn && header) {
    addExpBtn = document.createElement('button');
    addExpBtn.className = 'btn btn-primary btn-sm gd-add-exp-btn';
    addExpBtn.style.cssText = 'margin-left:auto; margin-right:8px;';
    addExpBtn.textContent = '+ Add Expense';
    addExpBtn.onclick = () => { closeModal('modal-group-detail'); navigateTo('add'); const sel = $('expense-group'); if (sel) sel.value = currentGroupId; currentGroupId = groupId; populatePaidBy(); renderSplitDetail(); };
    header.insertBefore(addExpBtn, header.lastElementChild);
  }

  // Delete Group btn
  let deleteGrpBtn = header?.querySelector('.gd-delete-grp-btn');
  if (!deleteGrpBtn && header) {
    deleteGrpBtn = document.createElement('button');
    deleteGrpBtn.className = 'btn btn-secondary btn-sm gd-delete-grp-btn';
    deleteGrpBtn.style.cssText = 'margin-right:8px; background:rgba(255,92,138,0.1); color:var(--pink-hot);';
    deleteGrpBtn.textContent = '🗑️ Delete';
    deleteGrpBtn.onclick = () => deleteGroup(currentGroupId);
    header.insertBefore(deleteGrpBtn, header.lastElementChild);
  }

  // Join Socket.IO room for this group
  if (socket) socket.emit('group:join', String(currentGroupId));

  renderGroupMembers(group);
  renderVibeScore(currentGroupId);
  renderGroupBalances(currentGroupId, group);
  renderGroupExpenses(currentGroupId);
  renderGroupPolls();
  renderSavingsGoal(group);
  initAddMemberListeners();
  openModal('modal-group-detail');
}

function renderGroupMembers(group) {
  const container = $('gd-members-list');
  const countEl = $('gd-members-count');
  if (!container) return;

  const emails = group.memberEmails || [];
  const populatedMembers = group.members || [];
  const myEmail = currentUser?.email?.toLowerCase();

  const memberList = [];
  const seenEmails = new Set();

  // Process populated member objects
  populatedMembers.forEach(m => {
    if (typeof m === 'object' && m && m.email) {
      const email = m.email.toLowerCase().trim();
      seenEmails.add(email);
      const isMe = email === myEmail || String(m._id) === String(currentUser?.uid);
      const isCreator = group.createdBy && (String(group.createdBy) === String(m._id) || String(group.createdBy) === email);
      memberList.push({
        name: isMe ? `${userProfile.name || m.name || 'You'} (You)` : (m.name || formatNameFromEmail(email)),
        email: email,
        initial: (m.avatarInitial || m.name?.[0] || email[0]).toUpperCase(),
        isMe,
        isCreator
      });
    }
  });

  // Process any remaining emails in memberEmails
  emails.forEach(email => {
    const cleanEmail = (email || '').toLowerCase().trim();
    if (cleanEmail && !seenEmails.has(cleanEmail)) {
      seenEmails.add(cleanEmail);
      const isMe = cleanEmail === myEmail;
      const isCreator = group.createdBy && (String(group.createdBy) === cleanEmail || (isMe && String(group.createdBy) === String(currentUser?.uid)));
      memberList.push({
        name: isMe ? `${userProfile.name || 'You'} (You)` : formatNameFromEmail(cleanEmail),
        email: cleanEmail,
        initial: cleanEmail[0].toUpperCase(),
        isMe,
        isCreator
      });
    }
  });

  // If no creator marked, mark the first as creator
  if (!memberList.some(m => m.isCreator) && memberList.length > 0) {
    memberList[0].isCreator = true;
  }

  // Put creator first, then "You", then others alphabetically
  memberList.sort((a, b) => {
    if (a.isCreator) return -1;
    if (b.isCreator) return 1;
    if (a.isMe) return -1;
    if (b.isMe) return 1;
    return a.name.localeCompare(b.name);
  });

  if (countEl) countEl.textContent = memberList.length;

  if (memberList.length === 0) {
    container.innerHTML = `<div class="empty-state-inline"><span>👥</span><p>No members yet</p></div>`;
    return;
  }

  container.innerHTML = memberList.map(m => {
    const badge = m.isCreator
      ? `<span class="group-member-badge creator">👑 Creator</span>`
      : (m.isMe ? `<span class="group-member-badge you">✨ You</span>` : `<span class="group-member-badge">Member</span>`);

    return `
      <div class="group-member-item anim-fade-in">
        <div class="group-member-info">
          <div class="group-member-avatar">${escapeHtml(m.initial)}</div>
          <div class="group-member-details">
            <div class="group-member-name">${escapeHtml(m.name)}</div>
            <div class="group-member-email">${escapeHtml(m.email)}</div>
          </div>
        </div>
        ${badge}
      </div>
    `;
  }).join('');
}

function initAddMemberListeners() {
  const toggleBtn = $('gd-add-member-toggle-btn');
  const form = $('gd-add-member-form');
  const input = $('gd-add-member-input');
  const submitBtn = $('gd-submit-add-member-btn');

  if (toggleBtn && form) {
    form.classList.add('hidden');
    toggleBtn.onclick = () => {
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden') && input) input.focus();
    };
  }

  if (submitBtn && input) {
    submitBtn.onclick = async () => {
      const email = input.value.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        showToast('Enter a valid email address 📧', 'error');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Adding...';

      try {
        if (activeDemoSession) {
          const db = getDemoDb();
          const g = db.groups.find(x => String(x.id || x._id) === currentGroupId);
          if (g) {
            if (!g.memberEmails) g.memberEmails = [];
            if (!g.memberEmails.includes(email)) g.memberEmails.push(email);
            saveDemoDb(db);
          }
        } else {
          await Groups.addMember(currentGroupId, email);
        }
        await loadGroups();
        input.value = '';
        form?.classList.add('hidden');
        showToast(`Added ${email} to group! 🎉`, 'success');

        const updated = groups.find(g => String(g.id || g._id) === currentGroupId);
        if (updated) {
          renderGroupMembers(updated);
          renderGroupBalances(currentGroupId, updated);
          renderHome();
          renderGroups();
          populateExpenseForm();
        }
      } catch (err) {
        showToast(err.message || 'Could not add member 😔', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Invite';
      }
    };
  }
}

function renderVibeScore(groupId) {
  const debts = getGroupBalanceSheet(groupId);
  let score = 100;
  if (debts.length > 0) {
    const totalDebt = debts.reduce((s, d) => s + d.amount, 0);
    const nonSettlementExpenses = expenses.filter(e => String(e.groupId) === String(groupId) && !isSettlementExpense(e));
    const totalExpense = nonSettlementExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    score = totalExpense > 0 ? Math.max(10, Math.round(100 - (totalDebt / totalExpense) * 100)) : 100;
  }
  const bar = $('gd-vibe-bar');
  if (bar) {
    bar.style.width = `${score}%`;
    bar.style.background = score > 70 ? 'linear-gradient(90deg, #B8F2D0, #6EE2A2)' : score > 40 ? 'linear-gradient(90deg, #FFD6A0, #FFA940)' : 'linear-gradient(90deg, #FFB4A2, #FF7A5C)';
  }
  const vibeText = score === 100 ? '100% Balanced ✨' : score > 70 ? `${score}% Balanced 🙂` : score > 40 ? `${score}% — Someone's carrying the group 😅` : `${score}% — Time to settle up! 😬`;
  if ($('gd-vibe-value')) $('gd-vibe-value').textContent = vibeText;
}

function renderGroupBalances(groupId, group) {
  const container = $('gd-balances'); if (!container) return;
  const debts = getGroupBalanceSheet(groupId);
  const currency = getUserPreferredCurrency();
  const myEmail = (currentUser?.email || '').toLowerCase().trim();

  if (debts.length === 0) {
    container.innerHTML = `<div class="empty-state-inline" style="padding:16px; text-align:center; background:rgba(34,197,94,0.08); border-radius:12px; border:1px solid rgba(34,197,94,0.2);">
      <span style="font-size:1.8rem;">🎉</span>
      <p style="margin:4px 0 0; font-weight:600; color:#16a34a;">All settled up!</p>
      <p style="margin:2px 0 0; font-size:0.8rem; color:var(--text-muted);">No outstanding debts in this group</p>
    </div>`;
    return;
  }

  container.innerHTML = debts.map(debt => {
    const fromEmail = (debt.from || '').toLowerCase().trim();
    const toEmail = (debt.to || '').toLowerCase().trim();
    const isMeDebtor = fromEmail === myEmail;
    const isMeCreditor = toEmail === myEmail;
    const isMe = isMeDebtor || isMeCreditor;

    const fromName = isMeDebtor ? 'You' : formatNameFromEmail(fromEmail);
    const toName = isMeCreditor ? 'You' : formatNameFromEmail(toEmail);

    let owesDescription = `<strong>${escapeHtml(fromName)}</strong> owes <strong>${escapeHtml(toName)}</strong>`;
    if (isMeDebtor) {
      owesDescription = `You owe <strong>${escapeHtml(toName)}</strong>`;
    } else if (isMeCreditor) {
      owesDescription = `<strong>${escapeHtml(fromName)}</strong> owes You`;
    }

    return `<div class="balance-item" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:var(--bg-glass); border-radius:10px; margin-bottom:8px;">
      <div class="balance-persons">${owesDescription}</div>
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="balance-amount-tag" style="font-weight:700; color:${isMeDebtor ? 'var(--pink-hot)' : '#10b981'}">${formatAmount(debt.amount, currency)}</div>
        ${isMe ? `<button class="settle-up-btn" data-from="${escapeHtml(fromEmail)}" data-to="${escapeHtml(toEmail)}" data-amount="${debt.amount}" data-group="${groupId}" style="padding:5px 12px; font-size:0.82rem; border-radius:8px; background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; cursor:pointer; font-weight:600;">Settle ✓</button>` : ''}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.settle-up-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fromEmail = btn.dataset.from;
      const toEmail = btn.dataset.to;
      const amt = parseFloat(btn.dataset.amount);
      const gid = btn.dataset.group;
      settleTarget = { from: fromEmail, to: toEmail, amount: amt, groupId: gid };
      if ($('settle-amount')) $('settle-amount').value = amt.toFixed(2);
      if ($('settle-info')) {
        const fromDisp = fromEmail === myEmail ? 'You' : formatNameFromEmail(fromEmail);
        const toDisp = toEmail === myEmail ? 'You' : formatNameFromEmail(toEmail);
        $('settle-info').innerHTML = `<strong>${escapeHtml(fromDisp)}</strong> pays <strong>${escapeHtml(toDisp)}</strong> ${formatAmount(amt, currency)}`;
      }
      openModal('modal-settle');
    });
  });
}

function renderGroupExpenses(groupId) {
  const container = $('gd-expenses'); if (!container) return;
  const groupExpenses = expenses.filter(e => String(e.groupId) === String(groupId));
  if (groupExpenses.length === 0) { container.innerHTML = `<div class="empty-state-inline"><span>💸</span><p>No expenses yet</p></div>`; return; }
  container.innerHTML = groupExpenses.map(exp => renderActivityItem(exp)).join('');
  attachDeleteListeners(container);
}

// ── Settle Up ──────────────────────────────────────────────
function initSettleListeners() {
  $('confirm-settle-btn')?.addEventListener('click', async () => {
    if (!settleTarget) return;
    const settleAmt = parseFloat($('settle-amount')?.value);
    const note = $('settle-note')?.value.trim() || '';
    if (!settleAmt || settleAmt <= 0) { showToast('Enter a valid settlement amount 💵', 'error'); return; }
    const btn = $('confirm-settle-btn');
    btn.disabled = true; btn.textContent = 'Processing...';
    try {
      const group = groups.find(g => String(g.id || g._id) === String(settleTarget.groupId));
      const fromEmail = settleTarget.from.toLowerCase().trim();
      const toEmail = settleTarget.to.toLowerCase().trim();
      const myEmail = (currentUser?.email || '').toLowerCase().trim();
      const fromName = fromEmail === myEmail ? (userProfile.name || 'You') : formatNameFromEmail(fromEmail);
      const toName = toEmail === myEmail ? (userProfile.name || 'You') : formatNameFromEmail(toEmail);

      const settlementExpense = {
        desc: `Payment: ${fromName} → ${toName} 💵`,
        amount: settleAmt,
        currency: getUserPreferredCurrency(),
        date: new Date().toISOString().split('T')[0],
        category: 'settlement',
        isSettlement: true,
        emoji: '💵',
        mood: 'necessary',
        groupId: settleTarget.groupId,
        groupName: group?.name || 'Settlement',
        paidByEmail: fromEmail,
        paidByName: fromName,
        recipientEmail: toEmail,
        recipientName: toName,
        splits: { [toEmail]: settleAmt },
        splitMethod: 'exact',
        iouNote: note ? `Settlement: ${note}` : 'Payment settled 💵',
        notes: note,
        settled: true
      };

      if (activeDemoSession) {
        const saved = {
          ...settlementExpense,
          id: 'exp_settle_' + Date.now(),
          _id: 'exp_settle_' + Date.now(),
          paidBy: currentUser.uid,
          involvedUsers: [currentUser.uid],
          createdBy: currentUser.uid,
          createdAt: new Date().toISOString()
        };
        const db = getDemoDb();
        db.expenses.unshift(saved);
        saveDemoDb(db);
        expenses.unshift(normalizeExpense(saved));
      } else {
        await Expenses.create(settlementExpense);
        await loadExpenses();
        await loadGroups();
      }

      userProfile.streak = (userProfile.streak || 0) + 1;
      closeModal('modal-settle');
      if (currentGroupId) {
        const g = groups.find(x => String(x.id || x._id) === currentGroupId);
        if (g) {
          renderVibeScore(currentGroupId);
          renderGroupBalances(currentGroupId, g);
          renderGroupExpenses(currentGroupId);
        }
      }
      showToast(`Settlement recorded! 💵 Debt cleared! (+1 Streak 🔥)`, 'success', 3200);
      launchConfetti();
      renderHome();
      renderActivity();
      renderGroups();
    } catch (err) {
      showToast(err.message || 'Couldn\'t record payment 😔', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Mark as Paid 🎉';
    }
  });
}

// ── Polls ──────────────────────────────────────────────────
function initPollListeners() {
  $('new-poll-btn')?.addEventListener('click', () => {
    $('poll-question').value = '';
    $('poll-options-list').innerHTML = `<input type="text" class="poll-option-input" placeholder="Option 1" /><input type="text" class="poll-option-input" placeholder="Option 2" />`;
    openModal('modal-poll');
  });

  $('add-poll-option-btn')?.addEventListener('click', () => {
    const list = $('poll-options-list');
    const count = list.querySelectorAll('.poll-option-input').length + 1;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'poll-option-input'; input.placeholder = `Option ${count}`;
    list.appendChild(input);
  });

  $('create-poll-btn')?.addEventListener('click', async () => {
    const question = $('poll-question').value.trim();
    const options = [...qsa('.poll-option-input')].map(i => i.value.trim()).filter(Boolean);
    const deadlineInput = $('poll-deadline-input')?.value;

    if (!question) { showToast('Add a question! 🗳️', 'error'); return; }
    if (options.length < 2) { showToast('Add at least 2 options', 'error'); return; }

    try {
      if (activeDemoSession) {
        const pollData = { id: 'poll_' + Date.now(), question, options: options.map(label => ({ label, votes: [] })), groupId: currentGroupId, createdBy: currentUser.uid, createdAt: new Date().toISOString(), closed: false, deadline: deadlineInput || null };
        const db = getDemoDb(); db.polls = db.polls || []; db.polls.unshift(pollData); saveDemoDb(db);
      } else {
        await Polls.create({ question, options, groupId: currentGroupId, deadline: deadlineInput || null });
      }
      closeModal('modal-poll');
      await renderGroupPolls();
      showToast('Poll launched! 🗳️', 'success');
    } catch (err) { showToast(err.message || 'Failed to create poll 😔', 'error'); }
  });

  // Add voice button for polls
  const voicePollBtn = document.createElement('button');
  voicePollBtn.type = 'button'; voicePollBtn.className = 'btn btn-secondary btn-sm';
  voicePollBtn.style.marginTop = '8px';
  voicePollBtn.innerHTML = '🎙️ Dictate Poll Question';
  voicePollBtn.addEventListener('click', () => openVoiceModal('poll', 'Say your poll question, e.g. "Should we buy the new gadget?"'));
  $('poll-question')?.parentElement?.appendChild(voicePollBtn);

  // Add optional deadline input to the poll modal
  const pollModal = $('modal-poll');
  if (pollModal && !$('poll-deadline-input')) {
    const deadlineWrap = document.createElement('div');
    deadlineWrap.className = 'form-group';
    deadlineWrap.innerHTML = `<label>Deadline <span class="optional-tag">optional</span></label><input type="datetime-local" id="poll-deadline-input" class="styled-input" />`;
    pollModal.querySelector('.modal-body')?.insertBefore(deadlineWrap, pollModal.querySelector('#create-poll-btn'));
  }
}

async function renderGroupPolls() {
  const container = $('gd-polls'); if (!container) return;
  const polls = await loadPolls(currentGroupId);
  if (polls.length === 0) { container.innerHTML = `<div class="empty-state-inline"><span>🗳️</span><p>No polls yet</p></div>`; return; }

  container.innerHTML = polls.map(poll => {
    const totalVotes = poll.options.reduce((s, o) => s + (o.votes?.length || 0), 0);
    const myVote = poll.options.findIndex(o => o.votes?.some(v => String(v) === String(currentUser.uid) || String(v._id) === String(currentUser.uid)));
    const isClosed = poll.closed || (poll.deadline && new Date() > new Date(poll.deadline));
    const deadlineStr = poll.deadline ? `<span style="font-size:0.75rem; color:var(--plum-light); margin-left:8px;">⏰ ${isClosed ? 'Ended' : 'Closes'} ${new Date(poll.deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : '';

    return `<div class="poll-item" data-poll-id="${poll.id || poll._id}">
      <div class="poll-question">${poll.question}${deadlineStr}${isClosed ? '<span style="font-size:0.7rem; color:var(--pink-hot); margin-left:6px; font-weight:700;">CLOSED</span>' : ''}</div>
      <div class="poll-options">
        ${poll.options.map((opt, idx) => {
          const pct = totalVotes > 0 ? Math.round((opt.votes?.length || 0) / totalVotes * 100) : 0;
          const isVoted = myVote === idx;
          return `<div class="poll-option-row">
            <div class="poll-option-bar-wrap">
              <div class="poll-option-bar" style="width:${pct}%"></div>
              <span class="poll-option-label">${opt.label}</span>
            </div>
            <span class="poll-option-pct">${pct}%</span>
            <span style="font-size:0.72rem; color:var(--plum-light);">(${opt.votes?.length || 0})</span>
            ${!isClosed ? `<button class="poll-vote-btn ${isVoted ? 'voted' : ''}" data-poll-id="${poll.id || poll._id}" data-opt-idx="${idx}">${isVoted ? '✓' : 'Vote'}</button>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
        ${!isClosed && String(poll.createdBy?._id || poll.createdBy) === String(currentUser.uid || currentUser._id) ? `<button class="close-poll-btn btn btn-secondary btn-sm" data-poll-id="${poll.id || poll._id}" style="font-size:0.75rem;">Close Poll</button>` : ''}
        ${String(poll.createdBy?._id || poll.createdBy) === String(currentUser.uid || currentUser._id) ? `<button class="delete-poll-btn btn btn-secondary btn-sm" data-poll-id="${poll.id || poll._id}" style="font-size:0.75rem; color:var(--pink-hot);">Delete Poll</button>` : ''}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.poll-vote-btn').forEach(btn => {
    btn.addEventListener('click', () => votePoll(btn.dataset.pollId, parseInt(btn.dataset.optIdx)));
  });
  container.querySelectorAll('.close-poll-btn').forEach(btn => {
    btn.addEventListener('click', () => closePoll(btn.dataset.pollId));
  });
  container.querySelectorAll('.delete-poll-btn').forEach(btn => {
    btn.addEventListener('click', () => deletePoll(btn.dataset.pollId));
  });
}

async function votePoll(pollId, optIdx) {
  try {
    if (activeDemoSession) {
      const db = getDemoDb();
      const poll = db.polls.find(p => (p.id || p._id) === pollId);
      if (!poll) return;
      poll.options.forEach((opt, i) => {
        if (i === optIdx) { if (!opt.votes.includes(currentUser.uid)) opt.votes.push(currentUser.uid); }
        else opt.votes = opt.votes.filter(u => u !== currentUser.uid);
      });
      saveDemoDb(db);
    } else {
      await Polls.vote(pollId, optIdx);
    }
    await renderGroupPolls();
    showToast('Vote recorded! 🗳️', 'success');
  } catch (err) { showToast(err.message || 'Vote failed 😔', 'error'); }
}

async function closePoll(pollId) {
  try {
    if (activeDemoSession) {
      const db = getDemoDb();
      const poll = db.polls.find(p => (p.id || p._id) === pollId);
      if (poll) poll.closed = true;
      saveDemoDb(db);
    } else {
      await Polls.close(pollId);
    }
    await renderGroupPolls();
    showToast('Poll closed ✓', 'info');
  } catch (err) { showToast(err.message || 'Could not close poll 😔', 'error'); }
}

async function deletePoll(pollId) {
  showConfirmDialog('Delete Poll 🗑️', 'Delete this poll? This cannot be undone.', async () => {
    try {
      if (activeDemoSession) {
        const db = getDemoDb();
        db.polls = db.polls.filter(p => (p.id || p._id) !== pollId);
        saveDemoDb(db);
      } else {
        await Polls.delete(pollId);
      }
      await renderGroupPolls();
      showToast('Poll deleted 🗑️', 'info');
    } catch (err) { showToast(err.message || 'Could not delete poll 😔', 'error'); }
  });
}

// ── Savings Goals ──────────────────────────────────────────
function initSavingsListeners() {
  $('set-savings-btn')?.addEventListener('click', () => { $('savings-name').value = ''; $('savings-target').value = ''; openModal('modal-savings'); });
  $('create-savings-btn')?.addEventListener('click', async () => {
    const name = $('savings-name').value.trim(), target = parseFloat($('savings-target').value);
    if (!name) { showToast('Name your goal! 🎯', 'error'); return; }
    if (!target || target <= 0) { showToast('Enter a valid target amount', 'error'); return; }
    const goal = { name, target, current: 0, currency: getUserPreferredCurrency() };
    const group = groups.find(g => (g.id || g._id) === currentGroupId);
    if (group) group.savingsGoal = goal;
    try {
      if (!activeDemoSession) await Groups.update(currentGroupId, { savingsGoal: goal });
      else {
        const db = getDemoDb();
        const g = db.groups.find(x => (x.id || x._id) === currentGroupId);
        if (g) g.savingsGoal = goal;
        saveDemoDb(db);
      }
      closeModal('modal-savings');
      renderSavingsGoal(group);
      showToast('Savings goal set! 🎯', 'success');
    } catch (err) { showToast('Failed to save goal 😔', 'error'); }
  });
  $('submit-chip-in-btn')?.addEventListener('click', async () => {
    const amt = parseFloat($('chip-in-amount').value), note = $('chip-in-note').value.trim();
    if (!amt || amt <= 0) { showToast('Enter contribution amount', 'error'); return; }
    const group = groups.find(g => (g.id || g._id) === currentGroupId);
    if (group?.savingsGoal) {
      group.savingsGoal.current = (group.savingsGoal.current || 0) + amt;
      try {
        if (!activeDemoSession) await Groups.update(currentGroupId, { savingsGoal: group.savingsGoal });
        else {
          const db = getDemoDb();
          const g = db.groups.find(x => (x.id || x._id) === currentGroupId);
          if (g?.savingsGoal) g.savingsGoal.current = group.savingsGoal.current;
          saveDemoDb(db);
        }
        renderSavingsGoal(group);
        closeModal('modal-chip-in');
        showToast(`Chipped in ${formatAmount(amt)}! 🎯`, 'success');
        launchConfetti();
      } catch { showToast('Chip-in failed 😔', 'error'); }
    }
  });
}

function renderSavingsGoal(group) {
  const container = $('gd-savings'); if (!container) return;
  if (!group.savingsGoal) { container.innerHTML = `<div class="empty-state-inline"><span>🎯</span><p>No savings goal set</p></div>`; return; }
  const { name, target, current, currency } = group.savingsGoal;
  const pct = Math.min(100, Math.round((current / target) * 100));
  container.innerHTML = `<div class="savings-goal-card" style="background:var(--cream-dark); border-radius:16px; padding:14px; margin-bottom:10px;">
    <div class="savings-goal-name" style="font-weight:700;">🎯 ${name}</div>
    <div class="savings-goal-bar-wrap" style="height:10px; background:var(--pink-light); border-radius:99px; overflow:hidden; margin:8px 0;">
      <div class="savings-goal-bar" style="width:${pct}%; height:100%; background:linear-gradient(90deg, #FF5C8A, #B8F2D0); transition:width 0.4s ease;"></div>
    </div>
    <div class="savings-goal-meta" style="display:flex; justify-content:space-between; font-size:0.82rem; color:var(--plum-light);">
      <span>${formatAmount(current, currency)} saved (${pct}%)</span><span>${formatAmount(target, currency)} goal</span>
    </div>
  </div>
  <button class="btn btn-secondary btn-sm" id="chip-in-trigger-btn">+ Chip In 💖</button>`;
  container.querySelector('#chip-in-trigger-btn')?.addEventListener('click', () => { $('chip-in-amount').value = ''; $('chip-in-note').value = ''; openModal('modal-chip-in'); });
}

// ── Share Story Card (identical) ───────────────────────────
function initShareCardListeners() {
  $('share-settle-btn')?.addEventListener('click', () => {
    const group = groups.find(g => (g.id || g._id) === currentGroupId); if (!group) return;
    if ($('sc-group-name')) $('sc-group-name').textContent = `${group.emoji} ${group.name}`;
    const debts = getGroupBalanceSheet(currentGroupId);
    const currency = getUserPreferredCurrency();
    const scBalances = $('sc-balances');
    if (scBalances) {
      if (debts.length === 0) scBalances.innerHTML = `<div class="share-card-balance-row"><span>All settled up! ✅</span></div>`;
      else scBalances.innerHTML = debts.slice(0, 5).map(d => `<div class="share-card-balance-row"><span>${d.from === currentUser.email ? 'You' : d.from.split('@')[0]} → ${d.to === currentUser.email ? 'You' : d.to.split('@')[0]}</span><span>${formatAmount(d.amount, currency)}</span></div>`).join('');
    }
    openModal('modal-share-card');
  });
  $('download-share-card-btn')?.addEventListener('click', generateCanvasImageCard);
}

function generateCanvasImageCard() {
  const group = groups.find(g => (g.id || g._id) === currentGroupId) || { name: 'Group', emoji: '💖' };
  const debts = getGroupBalanceSheet(currentGroupId);
  const currency = getUserPreferredCurrency();
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
  grad.addColorStop(0, '#FFD6E8'); grad.addColorStop(0.5, '#FFF9F5'); grad.addColorStop(1, '#FFB4A2');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = 'rgba(255,92,138,0.12)';
  ctx.beginPath(); ctx.arc(200, 200, 260, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(900, 1700, 320, 0, Math.PI * 2); ctx.fill();
  ctx.font = 'bold 70px Poppins, sans-serif'; ctx.fillStyle = '#FF5C8A'; ctx.fillText('Split Up 💖', 120, 220);
  ctx.font = 'bold 36px Poppins, sans-serif'; ctx.fillStyle = '#6B5B6E'; ctx.fillText('GROUP SETTLE-UP SUMMARY', 120, 290);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(100, 360, 880, 180);
  ctx.font = 'bold 54px Poppins, sans-serif'; ctx.fillStyle = '#3A2E39'; ctx.fillText(`${group.emoji} ${group.name}`, 140, 470);
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(100, 580, 880, 960);
  ctx.font = 'bold 42px Poppins, sans-serif'; ctx.fillStyle = '#FF5C8A'; ctx.fillText('Who Owes What 💸', 150, 670);
  ctx.strokeStyle = '#FFD6E8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(150, 710); ctx.lineTo(930, 710); ctx.stroke();
  let y = 790;
  if (debts.length === 0) { ctx.font = 'bold 44px Poppins, sans-serif'; ctx.fillStyle = '#1D9B5E'; ctx.fillText('All settled up! No debts. 🎉', 150, y); }
  else { debts.slice(0, 7).forEach(d => { const from = d.from === currentUser.email ? 'You' : d.from.split('@')[0], to = d.to === currentUser.email ? 'You' : d.to.split('@')[0]; ctx.font = '500 40px Poppins, sans-serif'; ctx.fillStyle = '#3A2E39'; ctx.fillText(`${from} → ${to}`, 150, y); ctx.font = 'bold 40px Poppins, sans-serif'; ctx.fillStyle = '#FF5C8A'; ctx.fillText(formatAmount(d.amount, currency), 760, y); y += 95; }); }
  ctx.font = 'bold 36px Poppins, sans-serif'; ctx.fillStyle = '#3A2E39'; ctx.textAlign = 'center'; ctx.fillText('Friends. Expenses. No Drama. ✨', 540, 1780);
  const link = document.createElement('a');
  link.download = `${group.name.replace(/\s+/g, '_')}_SettleUp_Card.png`;
  link.href = canvas.toDataURL('image/png'); link.click();
  showToast('Story card downloaded! 📸', 'success', 3500);
}

// ── Activity Filters ───────────────────────────────────────
function initActivityFilters() {
  $('page-activity')?.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      qsa('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderActivity();
    });
  });
  $('activity-sort')?.addEventListener('change', renderActivity);
}

// ── Profile ────────────────────────────────────────────────
function initProfileListeners() {
  $('user-avatar-btn')?.addEventListener('click', () => {
    const name = userProfile.name || currentUser?.displayName || 'Friend';
    if ($('profile-avatar-large')) $('profile-avatar-large').textContent = getUserInitial(name);
    if ($('profile-name-display')) $('profile-name-display').textContent = name;
    if ($('profile-email-display')) $('profile-email-display').textContent = currentUser?.email || '—';
    if ($('pref-name')) $('pref-name').value = name;
    if ($('p-total-expenses')) $('p-total-expenses').textContent = userProfile.totalExpenses || expenses.length;
    if ($('p-total-groups')) $('p-total-groups').textContent = groups.length;
    if ($('p-streak')) $('p-streak').textContent = `🔥${userProfile.streak || 0}`;
    if ($('pref-currency')) $('pref-currency').value = userProfile.currency || 'INR';
    openModal('modal-profile');
  });

  $('save-profile-btn')?.addEventListener('click', async () => {
    const currency = $('pref-currency').value;
    const newName = $('pref-name')?.value.trim();
    if (newName) { userProfile.name = newName; if (currentUser) currentUser.displayName = newName; }
    userProfile.currency = currency;
    try {
      if (!activeDemoSession) {
        await Auth.updateProfile({ name: newName || userProfile.name, currency });
      } else {
        const db = getDemoDb();
        if (!db.users) db.users = {};
        db.users['demo_user_1'] = userProfile;
        saveDemoDb(db);
      }
      updateTopBar(); renderHome();
      closeModal('modal-profile');
      showToast('Profile updated! ✨', 'success');
    } catch (err) { showToast('Failed to update profile 😔', 'error'); }
  });

  $('reset-data-btn')?.addEventListener('click', () => {
    localStorage.removeItem(DEMO_KEY);
    const clean = getEmptyDb(); saveDemoDb(clean);
    groups = []; expenses = [];
    userProfile = { name: currentUser?.displayName || 'Demo User', email: currentUser?.email || 'demo@example.com', currency: userProfile.currency || 'INR', streak: 0, totalExpenses: 0 };
    renderHome(); renderGroups(); renderActivity(); updateTopBar();
    closeModal('modal-profile');
    showToast('All data reset to zero! 🌸', 'success', 3200);
  });

  $('signout-btn')?.addEventListener('click', async () => {
    try { if (!activeDemoSession) await Auth.logout(); } catch {}
    activeDemoSession = false;
    currentUser = null; userProfile = {}; groups = []; expenses = [];
    if (socket) { socket.disconnect(); socket = null; }
    showAuth();
    showToast('Signed out! 👋', 'info');
  });
}

// ── Edit Expense ───────────────────────────────────────────
function initEditExpenseListeners() {
  $('edit-expense-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const expenseId = $('edit-expense-id').value;
    const desc = $('edit-expense-desc').value.trim();
    const amount = parseFloat($('edit-expense-amount').value);
    const dateVal = $('edit-expense-date')?.value || new Date().toISOString().split('T')[0];
    if (!desc) { showToast('Enter expense description', 'error'); return; }
    if (!amount || amount <= 0 || isNaN(amount)) { showToast('Enter a valid amount', 'error'); return; }
    const exp = expenses.find(e => (e.id || e._id) === expenseId);
    if (!exp) return;
    const oldAmount = exp.amount;
    exp.desc = desc; exp.amount = amount; exp.date = dateVal;
    if (oldAmount > 0 && exp.splits) { const ratio = amount / oldAmount; Object.keys(exp.splits).forEach(email => { exp.splits[email] = parseFloat((exp.splits[email] * ratio).toFixed(2)); }); }
    try {
      if (activeDemoSession) {
        const db = getDemoDb();
        const t = db.expenses.find(e => (e.id || e._id) === expenseId);
        if (t) { t.desc = desc; t.amount = amount; t.date = dateVal; t.splits = exp.splits; }
        saveDemoDb(db);
      } else {
        await Expenses.update(expenseId, { desc, amount, date: dateVal, splits: exp.splits });
      }
      closeModal('modal-edit-expense');
      showToast('Expense updated! ✨', 'success');
      renderHome(); renderGroups(); renderActivity();
      if (currentGroupId) { const g = groups.find(x => (x.id || x._id) === currentGroupId); if (g) { renderVibeScore(currentGroupId); renderGroupBalances(currentGroupId, g); renderGroupExpenses(currentGroupId); } }
    } catch (err) { showToast(err.message || 'Failed to update expense 😔', 'error'); }
  });
}

// ── Quick Actions & Modals ─────────────────────────────────
function initQuickActionListeners() {
  $('qa-create-group-btn')?.addEventListener('click', () => {
    closeModal('modal-quick-action');
    pendingMembers = [];
    if ($('group-name-input')) $('group-name-input').value = '';
    if ($('group-desc-input')) $('group-desc-input').value = '';
    if ($('member-email-input')) $('member-email-input').value = '';
    renderMemberChips(); currentGroupType = 'trip';
    qsa('.gtype-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'trip'));
    openModal('modal-create-group');
  });
  $('qa-join-group-btn')?.addEventListener('click', () => { closeModal('modal-quick-action'); if ($('join-code-input')) $('join-code-input').value = ''; openModal('modal-join-group'); });
  $('qa-add-expense-btn')?.addEventListener('click', () => { closeModal('modal-quick-action'); navigateTo('add'); });
}

function initModalCloseHandlers() {
  qsa('.modal-close').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.modal)));
  qsa('.modal-overlay').forEach(overlay => overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); }));
}

function initNav() {
  $('bottom-nav')?.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', e => {
      addRipple(btn, e);
      if (btn.classList.contains('nav-add') || btn.dataset.page === 'add') { openModal('modal-quick-action'); return; }
      navigateTo(btn.dataset.page);
    });
  });
}

// ── Check Invite URL ───────────────────────────────────────
function checkPendingJoinUrl() {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get('join');
  if (joinCode && currentUser) {
    if ($('join-code-input')) $('join-code-input').value = joinCode.toUpperCase();
    openModal('modal-join-group');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// ── Init ───────────────────────────────────────────────────
async function init() {
  await new Promise(r => setTimeout(r, 1200)); // splash

  initNav();
  initAuthListeners();
  initGroupListeners();
  initQuickActionListeners();
  initExpenseForm();
  initEditExpenseListeners();
  initSettleListeners();
  initPollListeners();
  initSavingsListeners();
  initShareCardListeners();
  initActivityFilters();
  initProfileListeners();
  initModalCloseHandlers();
  updateSyncStatusBadge();

  // Check if user already has a JWT (previously logged in)
  if (Auth.isLoggedIn()) {
    try {
      const user = await Auth.getMe();
      currentUser = { uid: user._id, _id: user._id, email: user.email, displayName: user.name };
      userProfile = user;
      await onAuthSuccess();
    } catch {
      // Token expired — show login
      hideSplash(); showAuth();
    }
  } else {
    hideSplash(); showAuth();
  }
}

init();
