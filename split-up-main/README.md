# Split Up 💸 — Full-Stack Edition

> Friends. Expenses. No drama. — Now with a real backend!

Split Up is a beautiful expense-splitting web app with group management, product voting polls, real-time updates via Socket.IO, and voice input. The original Firebase/localStorage frontend has been upgraded to a complete Node.js + Express + MongoDB full-stack application.

---

## ✨ Features

| Feature | Status |
|---|---|
| Signup / Login / Logout | ✅ Real auth with bcrypt + JWT |
| Protected routes | ✅ JWT middleware on all API routes |
| Create & manage groups | ✅ MongoDB, invite codes, member management |
| Join group by invite code or link | ✅ |
| Add expenses with flexible splits | ✅ Equal, Percent, Exact, Shares |
| Voting polls with deadlines | ✅ One-vote-per-user, auto-close on deadline |
| Real-time updates | ✅ Socket.IO (votes, expenses, polls) |
| Speech recognition | ✅ Web Speech API (groups, expenses, polls) |
| Settle up & streak tracking | ✅ |
| Savings goals & chip-in | ✅ |
| Share story card (PNG download) | ✅ Canvas API |
| Instant demo mode | ✅ No backend required (localStorage) |

---

## 🗂 Project Structure

```
split-up-main/
├── index.html              # SPA entry point (preserved original UI)
├── server.js               # Express + Socket.IO main server
├── .env.example            # Environment variable template
├── css/                    # Original stylesheets (unchanged)
│   ├── main.css
│   ├── components.css
│   └── animations.css
├── js/
│   ├── api.js              # NEW: REST API client (replaces Firebase)
│   └── app.js              # NEW: Full-stack app (Socket.IO + API calls)
└── server/
    ├── models/
    │   ├── User.js         # Mongoose: bcrypt hashing, toPublic()
    │   ├── Group.js        # Mongoose: invite codes, savings goals
    │   ├── Expense.js      # Mongoose: Map-based splits, categories
    │   └── Poll.js         # Mongoose: per-option vote arrays, deadlines
    ├── routes/
    │   ├── auth.js         # POST /signup /login /logout, GET /me, PATCH /profile
    │   ├── groups.js       # Full CRUD + join by code + add-member
    │   ├── expenses.js     # Full CRUD + settle endpoint
    │   └── polls.js        # Full CRUD + vote + close
    └── middleware/
        └── auth.js         # JWT protect middleware
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** v18+ (you have v20 ✅)
- **MongoDB** — either:
  - [MongoDB Community Server](https://www.mongodb.com/try/download/community) installed locally, **or**
  - [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) free cloud cluster

### 2. Install Dependencies

```bash
cd split-up-main
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Then edit `.env`:

```env
# Required: MongoDB connection string
MONGODB_URI=mongodb://127.0.0.1:27017/splitup

# Required: Change this to a long random secret!
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your_very_long_random_secret_here

PORT=3000
```




### 5. Run the Server

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

Open **http://localhost:3000** in your browser.

---

## 🔑 Manual Configuration Required

| What | Where | Instructions |
|---|---|---|
| **MongoDB URI** | `.env` → `MONGODB_URI` | Use `mongodb://127.0.0.1:27017/splitup` for local, or your Atlas connection string |
| **JWT Secret** | `.env` → `JWT_SECRET` | Run `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` and paste the output |
| **Port** | `.env` → `PORT` | Default `3000`; change if that port is in use |

---

## 🌐 API Reference

### Auth
| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/auth/signup` | `{ name, email, password }` | Register |
| `POST` | `/api/auth/login` | `{ email, password }` | Login → returns JWT |
| `POST` | `/api/auth/logout` | — | Logout (client clears token) |
| `GET` | `/api/auth/me` | — | Get current user |
| `PATCH` | `/api/auth/profile` | `{ name?, currency? }` | Update profile |

### Groups
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/groups` | List my groups |
| `POST` | `/api/groups` | Create group |
| `GET` | `/api/groups/join/:code` | Join by invite code |
| `GET` | `/api/groups/:id` | Get single group |
| `PATCH` | `/api/groups/:id` | Update group |
| `DELETE` | `/api/groups/:id` | Delete (creator only) |
| `POST` | `/api/groups/:id/add-member` | Add member by email |

### Expenses
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/expenses` | List my expenses |
| `GET` | `/api/expenses/group/:id` | Group expenses |
| `POST` | `/api/expenses` | Create expense |
| `PATCH` | `/api/expenses/:id` | Update (creator only) |
| `DELETE` | `/api/expenses/:id` | Delete (creator only) |
| `POST` | `/api/expenses/:id/settle` | Mark as settled |

### Polls
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/polls/group/:id` | List group polls |
| `POST` | `/api/polls` | Create poll |
| `POST` | `/api/polls/:id/vote` | Cast vote (one per user) |
| `POST` | `/api/polls/:id/close` | Close poll (creator only) |
| `DELETE` | `/api/polls/:id` | Delete poll (creator only) |

---

## ⚡ Real-Time Events (Socket.IO)

The client joins group rooms via `socket.emit('group:join', groupId)`.

| Event | Direction | Data |
|---|---|---|
| `expense:created` | Server → Client | `{ expense, groupId }` |
| `expense:updated` | Server → Client | `{ expense }` |
| `expense:deleted` | Server → Client | `{ expenseId, groupId }` |
| `expense:settled` | Server → Client | `{ expenseId, groupId }` |
| `poll:created` | Server → Client | `{ poll, groupId }` |
| `poll:voted` | Server → Client | `{ poll, groupId }` |
| `poll:closed` | Server → Client | `{ pollId, groupId }` |
| `group:memberJoined` | Server → Client | `{ groupId, user }` |
| `group:updated` | Server → Client | `{ group }` |
| `group:deleted` | Server → Client | `{ groupId }` |

---

## 🎙️ Voice Input

Uses the **Web Speech API** (built into Chrome/Edge/Safari). Works for:
- **Group names** — click "🎙️ Name Group by Voice" in the Create Group modal
- **Expense descriptions + amounts** — click "🎙️ Voice Receipt & Log" in Add Expense
- **Poll questions** — click "🎙️ Dictate Poll Question" in New Poll modal

On unsupported browsers, a simulation runs with example text.

---

## 🔒 Security

- Passwords hashed with **bcrypt** (12 rounds)
- JWT tokens expire after **7 days**
- **Rate limiting**: 500 req/15 min general, 20 req/15 min on auth routes
- All expense/poll operations verify **group membership**
- Expense/poll delete/edit requires being the **creator**
- Duplicate vote prevention enforced at API level
- **Helmet.js** security headers

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (preserved original) |
| Backend | Node.js + Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| Real-time | Socket.IO |
| Security | Helmet, express-rate-limit, express-validator |
| Dev | Nodemon |
