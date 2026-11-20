// ============================================================
// User Model — MongoDB / Mongoose
// ============================================================
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [60, 'Name cannot be longer than 60 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false  // never returned in queries by default
  },
  avatarInitial: { type: String, default: '?' },
  currency: { type: String, default: 'INR', enum: ['INR', 'USD', 'EUR', 'GBP', 'JPY'] },
  streak: { type: Number, default: 0 },
  lastSettledAt: { type: Date, default: null },
  totalExpenses: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.avatarInitial = (this.name || '?').charAt(0).toUpperCase();
  next();
});

// Compare password helper
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Safe public profile (no password)
userSchema.methods.toPublic = function () {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    avatarInitial: this.avatarInitial,
    currency: this.currency,
    streak: this.streak,
    totalExpenses: this.totalExpenses,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);
