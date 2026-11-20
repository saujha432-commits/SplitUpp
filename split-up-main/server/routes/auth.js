// ============================================================
// Auth Routes — /api/auth
// POST /signup   — register a new user
// POST /login    — authenticate and get JWT
// POST /logout   — clear cookie
// GET  /me       — get current authenticated user profile
// ============================================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function sendTokenResponse(user, statusCode, res) {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true,
    token,
    user: user.toPublic()
  });
}

// ── POST /api/auth/signup ──────────────────────────────────
router.post(
  '/signup',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 60 }),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { name, email, password } = req.body;

    try {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ success: false, message: 'An account with that email already exists.' });
      }

      const user = await User.create({ name, email, password });
      sendTokenResponse(user, 201, res);
    } catch (err) {
      console.error('Signup error:', err);
      res.status(500).json({ success: false, message: 'Server error during signup. Please try again.' });
    }
  }
);

// ── POST /api/auth/login ───────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { email, password } = req.body;

    try {
      const user = await User.findOne({ email }).select('+password');
      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      sendTokenResponse(user, 200, res);
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Server error during login. Please try again.' });
    }
  }
);

// ── POST /api/auth/logout ──────────────────────────────────
router.post('/logout', protect, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ── GET /api/auth/me ───────────────────────────────────────
router.get('/me', protect, (req, res) => {
  res.json({ success: true, user: req.user.toPublic() });
});

// ── PATCH /api/auth/profile ────────────────────────────────
router.patch(
  '/profile',
  protect,
  [
    body('name').optional().trim().isLength({ min: 1, max: 60 }),
    body('currency').optional().isIn(['INR', 'USD', 'EUR', 'GBP', 'JPY'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const allowed = ['name', 'currency'];
    const updates = {};
    allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });

    if (updates.name) updates.avatarInitial = updates.name.charAt(0).toUpperCase();

    try {
      const user = await User.findByIdAndUpdate(req.user._id, updates, {
        new: true, runValidators: true
      });
      res.json({ success: true, user: user.toPublic() });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to update profile.' });
    }
  }
);

module.exports = router;
