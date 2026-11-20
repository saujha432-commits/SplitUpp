// ============================================================
// Group Model — MongoDB / Mongoose
// ============================================================
const mongoose = require('mongoose');

const savingsGoalSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  target: { type: Number, required: true, min: 0 },
  current: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'INR' }
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Group name is required'],
    trim: true,
    maxlength: [60, 'Group name cannot exceed 60 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters'],
    default: ''
  },
  type: {
    type: String,
    enum: ['trip', 'home', 'friends', 'other'],
    default: 'other'
  },
  emoji: { type: String, default: '📦' },
  inviteCode: {
    type: String,
    unique: true,
    uppercase: true,
    index: true
  },
  // Array of User ObjectIds
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Emails for fast lookup without population
  memberEmails: [{ type: String, lowercase: true, trim: true }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  savingsGoal: { type: savingsGoalSchema, default: null }
}, {
  timestamps: true
});

// Generate a unique invite code before saving if not set
groupSchema.pre('save', async function (next) {
  if (!this.inviteCode) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    let isUnique = false;
    while (!isUnique) {
      code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const existing = await this.constructor.findOne({ inviteCode: code });
      if (!existing) isUnique = true;
    }
    this.inviteCode = code;
  }
  next();
});

module.exports = mongoose.model('Group', groupSchema);
