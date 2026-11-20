// ============================================================
// Group Routes — /api/groups
// ============================================================
const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Group = require('../models/Group');
const User = require('../models/User');
const Expense = require('../models/Expense');
const { protect } = require('../middleware/auth');

// All group routes require authentication
router.use(protect);

// Helper: verify caller is a member of the group
async function requireMember(groupId, userId, res) {
  const group = await Group.findById(groupId);
  if (!group) { res.status(404).json({ success: false, message: 'Group not found.' }); return null; }
  if (!group.members.map(String).includes(String(userId))) {
    res.status(403).json({ success: false, message: 'You are not a member of this group.' });
    return null;
  }
  return group;
}

// ── GET /api/groups ────────────────────────────────────────
// List all groups the current user is a member of
router.get('/', async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user._id })
      .populate('members', 'name email avatarInitial')
      .sort({ createdAt: -1 });
    res.json({ success: true, groups });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch groups.' });
  }
});

// ── POST /api/groups ───────────────────────────────────────
// Create a new group
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Group name is required').isLength({ max: 60 }),
    body('description').optional().trim().isLength({ max: 200 }),
    body('type').optional().isIn(['trip', 'home', 'friends', 'other']),
    body('memberEmails').optional().isArray()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

    const { name, description = '', type = 'other', memberEmails = [] } = req.body;

    const emojiMap = { trip: '✈️', home: '🏠', friends: '👯', other: '📦' };

    try {
      // Resolve any invited email addresses to user IDs
      const memberIds = [req.user._id];
      const resolvedEmails = [req.user.email];

      for (const email of memberEmails) {
        if (email && email !== req.user.email) {
          const invitedUser = await User.findOne({ email: email.toLowerCase() });
          if (invitedUser) {
            if (!memberIds.map(String).includes(String(invitedUser._id))) {
              memberIds.push(invitedUser._id);
              resolvedEmails.push(invitedUser.email);
            }
          } else {
            // Store the email even if the user hasn't signed up yet
            if (!resolvedEmails.includes(email.toLowerCase())) {
              resolvedEmails.push(email.toLowerCase());
            }
          }
        }
      }

      const group = await Group.create({
        name,
        description,
        type,
        emoji: emojiMap[type] || '📦',
        members: memberIds,
        memberEmails: resolvedEmails,
        createdBy: req.user._id
      });

      const populated = await group.populate('members', 'name email avatarInitial');

      // Emit real-time event if io is available
      const io = req.app.get('io');
      if (io) io.emit('group:created', { group: populated, userId: String(req.user._id) });

      res.status(201).json({ success: true, group: populated });
    } catch (err) {
      console.error('Create group error:', err);
      res.status(500).json({ success: false, message: 'Failed to create group.' });
    }
  }
);

// ── GET /api/groups/join/:code ─────────────────────────────
// Join a group using an invite code
router.get('/join/:code', async (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  try {
    const group = await Group.findOne({ inviteCode: code });
    if (!group) return res.status(404).json({ success: false, message: 'Invalid invite code. Double-check and try again.' });

    const alreadyMember = group.members.map(String).includes(String(req.user._id));
    if (alreadyMember) {
      const populated = await group.populate('members', 'name email avatarInitial');
      return res.json({ success: true, alreadyMember: true, group: populated });
    }

    group.members.push(req.user._id);
    if (!group.memberEmails.includes(req.user.email)) group.memberEmails.push(req.user.email);
    await group.save();

    const populated = await group.populate('members', 'name email avatarInitial');

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${group._id}`).emit('group:memberJoined', {
        groupId: String(group._id),
        user: req.user.toPublic()
      });
    }

    res.json({ success: true, group: populated });
  } catch (err) {
    console.error('Join group error:', err);
    res.status(500).json({ success: false, message: 'Failed to join group.' });
  }
});

// ── GET /api/groups/:id ────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const group = await requireMember(req.params.id, req.user._id, res);
    if (!group) return;
    await group.populate('members', 'name email avatarInitial');
    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch group.' });
  }
});

// ── PATCH /api/groups/:id ──────────────────────────────────
// Update group details (name, description, type)
router.patch(
  '/:id',
  [
    body('name').optional().trim().notEmpty().isLength({ max: 60 }),
    body('description').optional().trim().isLength({ max: 200 }),
    body('type').optional().isIn(['trip', 'home', 'friends', 'other'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

    try {
      const group = await requireMember(req.params.id, req.user._id, res);
      if (!group) return;

      const emojiMap = { trip: '✈️', home: '🏠', friends: '👯', other: '📦' };
      if (req.body.name) group.name = req.body.name;
      if (req.body.description !== undefined) group.description = req.body.description;
      if (req.body.type) { group.type = req.body.type; group.emoji = emojiMap[req.body.type]; }
      if (req.body.savingsGoal !== undefined) group.savingsGoal = req.body.savingsGoal;

      await group.save();
      const populated = await group.populate('members', 'name email avatarInitial');

      const io = req.app.get('io');
      if (io) io.to(`group:${group._id}`).emit('group:updated', { group: populated });

      res.json({ success: true, group: populated });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to update group.' });
    }
  }
);

// ── DELETE /api/groups/:id ─────────────────────────────────
// Only group creator can delete
router.delete('/:id', async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });
    if (String(group.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the group creator can delete this group.' });
    }

    await Promise.all([
      Group.findByIdAndDelete(req.params.id),
      Expense.deleteMany({ groupId: req.params.id }),
      require('../models/Poll').deleteMany({ groupId: req.params.id })
    ]);

    const io = req.app.get('io');
    if (io) io.to(`group:${group._id}`).emit('group:deleted', { groupId: String(group._id) });

    res.json({ success: true, message: 'Group and all related data deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete group.' });
  }
});

// ── POST /api/groups/:id/add-member ───────────────────────
// Add a member by email
router.post('/:id/add-member', body('email').isEmail(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Valid email required.' });

  try {
    const group = await requireMember(req.params.id, req.user._id, res);
    if (!group) return;

    const email = req.body.email.toLowerCase().trim();
    const newUser = await User.findOne({ email });

    if (newUser) {
      if (!group.members.map(String).includes(String(newUser._id))) {
        group.members.push(newUser._id);
      }
    }
    if (!group.memberEmails.includes(email)) group.memberEmails.push(email);

    await group.save();
    const populated = await group.populate('members', 'name email avatarInitial');

    const io = req.app.get('io');
    if (io) io.to(`group:${group._id}`).emit('group:memberAdded', { groupId: String(group._id), email });

    res.json({ success: true, group: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add member.' });
  }
});

module.exports = router;
