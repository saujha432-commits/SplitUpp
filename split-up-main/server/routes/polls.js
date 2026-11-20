// ============================================================
// Poll Routes — /api/polls
// ============================================================
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Poll = require('../models/Poll');
const Group = require('../models/Group');
const { protect } = require('../middleware/auth');

router.use(protect);

// ── GET /api/polls/group/:groupId ──────────────────────────
router.get('/group/:groupId', async (req, res) => {
  try {
    const group = await Group.findOne({ _id: req.params.groupId, members: req.user._id });
    if (!group) return res.status(403).json({ success: false, message: 'Group not found or access denied.' });

    const polls = await Poll.find({ groupId: req.params.groupId })
      .populate('createdBy', 'name avatarInitial')
      .sort({ createdAt: -1 });

    // Auto-close expired polls
    for (const poll of polls) {
      if (!poll.closed && poll.isExpired()) {
        poll.closed = true;
        await poll.save();
      }
    }

    res.json({ success: true, polls });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch polls.' });
  }
});

// ── POST /api/polls ────────────────────────────────────────
router.post(
  '/',
  [
    body('question').trim().notEmpty().withMessage('Question is required').isLength({ max: 300 }),
    body('options').isArray({ min: 2 }).withMessage('At least 2 options required'),
    body('options.*').trim().notEmpty().withMessage('Option labels cannot be empty'),
    body('groupId').notEmpty().withMessage('Group ID is required'),
    body('deadline').optional({ nullable: true }).isISO8601().toDate()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

    const { question, options, groupId, deadline } = req.body;

    try {
      const group = await Group.findOne({ _id: groupId, members: req.user._id });
      if (!group) return res.status(403).json({ success: false, message: 'Group not found or access denied.' });

      const poll = await Poll.create({
        question,
        options: options.map(label => ({ label, votes: [] })),
        groupId: group._id,
        createdBy: req.user._id,
        deadline: deadline || null
      });

      await poll.populate('createdBy', 'name avatarInitial');

      const io = req.app.get('io');
      if (io) {
        io.to(`group:${groupId}`).emit('poll:created', {
          poll,
          groupId: String(groupId)
        });
      }

      res.status(201).json({ success: true, poll });
    } catch (err) {
      console.error('Create poll error:', err);
      res.status(500).json({ success: false, message: 'Failed to create poll.' });
    }
  }
);

// ── POST /api/polls/:id/vote ───────────────────────────────
// Cast or change a vote. Each user may only vote for one option at a time.
router.post('/:id/vote', body('optionIndex').isInt({ min: 0 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid option index.' });

  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found.' });

    // Verify membership
    const group = await Group.findOne({ _id: poll.groupId, members: req.user._id });
    if (!group) return res.status(403).json({ success: false, message: 'Access denied.' });

    if (poll.closed || poll.isExpired()) {
      poll.closed = true;
      await poll.save();
      return res.status(400).json({ success: false, message: 'This poll is closed or has expired.' });
    }

    const optionIndex = parseInt(req.body.optionIndex);
    if (optionIndex >= poll.options.length) {
      return res.status(400).json({ success: false, message: 'Invalid option index.' });
    }

    const userId = req.user._id;

    // Remove any existing vote by this user across all options (enforce one vote per user)
    poll.options.forEach(opt => {
      opt.votes = opt.votes.filter(v => String(v) !== String(userId));
    });

    // Add vote to selected option
    poll.options[optionIndex].votes.push(userId);
    await poll.save();

    await poll.populate('createdBy', 'name avatarInitial');

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${poll.groupId}`).emit('poll:voted', {
        poll,
        groupId: String(poll.groupId)
      });
    }

    res.json({ success: true, poll });
  } catch (err) {
    console.error('Vote error:', err);
    res.status(500).json({ success: false, message: 'Failed to cast vote.' });
  }
});

// ── POST /api/polls/:id/close ──────────────────────────────
router.post('/:id/close', async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found.' });
    if (String(poll.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the poll creator can close it.' });
    }

    poll.closed = true;
    await poll.save();

    const io = req.app.get('io');
    if (io) io.to(`group:${poll.groupId}`).emit('poll:closed', { pollId: req.params.id, groupId: String(poll.groupId) });

    res.json({ success: true, poll });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to close poll.' });
  }
});

// ── DELETE /api/polls/:id ─────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ success: false, message: 'Poll not found.' });
    if (String(poll.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the poll creator can delete it.' });
    }

    await poll.deleteOne();

    const io = req.app.get('io');
    if (io) io.to(`group:${poll.groupId}`).emit('poll:deleted', { pollId: req.params.id });

    res.json({ success: true, message: 'Poll deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete poll.' });
  }
});

module.exports = router;
