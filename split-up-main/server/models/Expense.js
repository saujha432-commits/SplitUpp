// ============================================================
// Expense Model — MongoDB / Mongoose
// ============================================================
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  desc: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [120, 'Description cannot exceed 120 characters']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than 0']
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD', 'EUR', 'GBP', 'JPY']
  },
  date: { type: String, required: true }, // ISO date string e.g. "2024-05-01"
  category: {
    type: String,
    enum: ['food', 'transport', 'home', 'trip', 'fun', 'treat', 'health', 'settlement', 'other'],
    default: 'other'
  },
  isSettlement: { type: Boolean, default: false },
  emoji: { type: String, default: '📦' },
  mood: {
    type: String,
    enum: ['worth-it', 'treat-yourself', 'regret', 'necessary', 'yolo'],
    default: 'worth-it'
  },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  groupName: { type: String, default: '' },
  // The user who paid
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  paidByEmail: { type: String, lowercase: true, trim: true },
  paidByName: { type: String, default: '' },
  recipientEmail: { type: String, lowercase: true, trim: true },
  recipientName: { type: String, default: '' },
  // splits: { 'user@email.com': amount } — stored as plain object (emails have dots which Mongoose Maps don't support)
  splits: { type: mongoose.Schema.Types.Mixed, default: {} },
  splitMethod: {
    type: String,
    enum: ['equal', 'percentage', 'exact', 'shares'],
    default: 'equal'
  },
  iouNote: { type: String, default: '', maxlength: 200 },
  notes: { type: String, default: '', maxlength: 500 },
  settled: { type: Boolean, default: false },
  // Array of User ObjectIds involved in this expense
  involvedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

// Index for fast lookups by group and involved users
expenseSchema.index({ groupId: 1, createdAt: -1 });
expenseSchema.index({ involvedUsers: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
