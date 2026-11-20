// ============================================================
// Expense Routes — /api/expenses
// ============================================================
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Expense = require('../models/Expense');
const Group = require('../models/Group');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

router.use(protect);

// ── GET /api/expenses ──────────────────────────────────────
// Get all expenses for the current user (across all groups)
router.get('/', async (req, res) => {
  try {
    const expenses = await Expense.find({ involvedUsers: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, expenses });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch expenses.' });
  }
});

// ── GET /api/expenses/group/:groupId ───────────────────────
// Get all expenses for a specific group
router.get('/group/:groupId', async (req, res) => {
  try {
    // Verify membership
    const group = await Group.findOne({ _id: req.params.groupId, members: req.user._id });
    if (!group) return res.status(403).json({ success: false, message: 'Group not found or access denied.' });

    const expenses = await Expense.find({ groupId: req.params.groupId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, expenses });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch group expenses.' });
  }
});

// ── POST /api/expenses ─────────────────────────────────────
// Create a new expense
router.post(
  '/',
  [
    body('desc').trim().notEmpty().withMessage('Description is required').isLength({ max: 120 }),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('groupId').notEmpty().withMessage('Group ID is required'),
    body('date').notEmpty().withMessage('Date is required'),
    body('splits').isObject().withMessage('Splits must be an object')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

    const {
      desc, amount, currency = 'INR', date, category = 'other', emoji = '📦',
      mood = 'worth-it', groupId, paidByEmail, paidByName, splits,
      splitMethod = 'equal', iouNote = '', notes = ''
    } = req.body;

    try {
      // Verify user is in the group (or handle personal group)
      let group;
      if (groupId === 'g_personal' || groupId === 'personal') {
        group = await Group.findOne({ createdBy: req.user._id, name: 'Personal Expenses 👤' });
        if (!group) {
          group = await Group.create({
            name: 'Personal Expenses 👤',
            description: 'Personal / General Expenses',
            type: 'other',
            emoji: '👤',
            members: [req.user._id],
            memberEmails: [req.user.email],
            createdBy: req.user._id
          });
        }
      } else {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
          return res.status(400).json({ success: false, message: 'Invalid group selected.' });
        }
        group = await Group.findOne({ _id: groupId, members: req.user._id });
        if (!group) return res.status(403).json({ success: false, message: 'Group not found or access denied.' });
      }

      // Collect involved user IDs
      const involvedUsers = [...group.members];

      const isSettlement = Boolean(req.body.isSettlement || category === 'settlement' || (desc && desc.startsWith('Payment:')));
      const effectivePaidByEmail = (paidByEmail || req.user.email).toLowerCase().trim();
      let paidByUserId = req.user._id;

      if (effectivePaidByEmail !== req.user.email.toLowerCase()) {
        const payerUser = await User.findOne({ email: effectivePaidByEmail });
        if (payerUser) paidByUserId = payerUser._id;
      }

      let recipientEmail = (req.body.recipientEmail || '').toLowerCase().trim();
      if (!recipientEmail && isSettlement && splits) {
        const splitKeys = Object.keys(splits);
        if (splitKeys.length > 0) recipientEmail = splitKeys[0].toLowerCase().trim();
      }

      const expenseData = {
        desc,
        amount: parseFloat(amount),
        currency,
        date,
        category: isSettlement ? 'settlement' : category,
        isSettlement,
        emoji: isSettlement ? '💵' : emoji,
        mood: isSettlement ? 'necessary' : mood,
        groupId: group._id,
        groupName: group.name,
        paidBy: paidByUserId,
        paidByEmail: effectivePaidByEmail,
        paidByName: paidByName || (effectivePaidByEmail === req.user.email ? req.user.name : effectivePaidByEmail.split('@')[0]),
        recipientEmail: recipientEmail || undefined,
        recipientName: req.body.recipientName || (recipientEmail ? recipientEmail.split('@')[0] : ''),
        splits: splits || {},
        splitMethod,
        iouNote,
        notes,
        settled: isSettlement ? true : Boolean(req.body.settled),
        involvedUsers,
        createdBy: req.user._id
      };

      const expense = await Expense.create(expenseData);

      // Only update user's totalExpenses for real shared expenses, not settlements
      if (!isSettlement) {
        await User.findByIdAndUpdate(req.user._id, { $inc: { totalExpenses: 1 } });
      }

      const expenseObj = expense.toObject();

      // Real-time broadcast to group members
      const io = req.app.get('io');
      if (io) {
        io.to(`group:${groupId}`).emit('expense:created', {
          expense: expenseObj,
          groupId: String(groupId)
        });
      }

      res.status(201).json({ success: true, expense: expenseObj });
    } catch (err) {
      console.error('Create expense error:', err.message, err.errors || '');
      // Return validation details in dev mode
      const details = process.env.NODE_ENV !== 'production' ? (err.message || '') : '';
      res.status(500).json({ success: false, message: 'Failed to create expense.', details });
    }
  }
);

// ── PATCH /api/expenses/:id ────────────────────────────────
router.patch(
  '/:id',
  [
    body('desc').optional().trim().notEmpty().isLength({ max: 120 }),
    body('amount').optional().isFloat({ min: 0.01 }),
    body('date').optional().notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

    try {
      const expense = await Expense.findById(req.params.id);
      if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
      if (String(expense.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ success: false, message: 'Only the creator can edit this expense.' });
      }

      const { desc, amount, date, splits } = req.body;
      if (desc) expense.desc = desc;
      if (date) expense.date = date;
      if (amount) {
        const oldAmt = expense.amount;
        expense.amount = parseFloat(amount);
        // Proportionally scale splits if new splits not provided
        if (!splits && oldAmt > 0) {
          const ratio = expense.amount / oldAmt;
          const scaledSplits = {};
          Object.entries(expense.splits || {}).forEach(([k, v]) => { scaledSplits[k] = parseFloat((v * ratio).toFixed(2)); });
          expense.splits = scaledSplits;
        }
      }
      if (splits) {
        expense.splits = splits;
      }

      await expense.save();
      const expObj = expense.toObject();

      const io = req.app.get('io');
      if (io) io.to(`group:${expense.groupId}`).emit('expense:updated', { expense: expObj });

      res.json({ success: true, expense: expObj });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to update expense.' });
    }
  }
);

// ── DELETE /api/expenses/:id ───────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    
    const isCreator = String(expense.createdBy) === String(req.user._id);
    const isPayer = expense.paidBy && String(expense.paidBy) === String(req.user._id);
    const group = await Group.findById(expense.groupId);
    const isGroupOwner = group && String(group.createdBy) === String(req.user._id);
    const isMember = group && group.members.some(m => String(m) === String(req.user._id));

    if (!isCreator && !isPayer && !isGroupOwner && !isMember) {
      return res.status(403).json({ success: false, message: 'Only group members can delete this expense.' });
    }

    const groupId = expense.groupId;
    const isSettlement = expense.isSettlement || expense.category === 'settlement';
    await expense.deleteOne();

    if (!isSettlement) {
      await User.findByIdAndUpdate(expense.createdBy, { $inc: { totalExpenses: -1 } });
    }

    const io = req.app.get('io');
    if (io) io.to(`group:${groupId}`).emit('expense:deleted', { expenseId: req.params.id, groupId: String(groupId) });

    res.json({ success: true, message: 'Expense deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete expense.' });
  }
});

// ── POST /api/expenses/:id/settle ─────────────────────────
// Mark expense as settled
router.post('/:id/settle', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });

    // Verify caller is involved
    if (!expense.involvedUsers.map(String).includes(String(req.user._id))) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    expense.settled = true;
    await expense.save();

    // Update streak
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { streak: 1 }, lastSettledAt: new Date() },
      { new: true }
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${expense.groupId}`).emit('expense:settled', {
        expenseId: req.params.id,
        groupId: String(expense.groupId)
      });
    }

    res.json({ success: true, expense: expense.toObject(), streak: user.streak });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to settle expense.' });
  }
});

module.exports = router;
