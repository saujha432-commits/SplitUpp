// ============================================================
// Poll Model — MongoDB / Mongoose
// ============================================================
const mongoose = require('mongoose');

const pollOptionSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    trim: true,
    maxlength: [100, 'Option label cannot exceed 100 characters']
  },
  // Array of User ObjectIds who voted for this option
  votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { _id: true });

const pollSchema = new mongoose.Schema({
  question: {
    type: String,
    required: [true, 'Poll question is required'],
    trim: true,
    maxlength: [300, 'Question cannot exceed 300 characters']
  },
  options: {
    type: [pollOptionSchema],
    validate: {
      validator: function (opts) { return opts.length >= 2; },
      message: 'A poll must have at least 2 options'
    }
  },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Optional deadline
  deadline: { type: Date, default: null },
  // Closed polls cannot receive new votes
  closed: { type: Boolean, default: false }
}, {
  timestamps: true
});

pollSchema.index({ groupId: 1, createdAt: -1 });

// Virtual: total number of votes across all options
pollSchema.virtual('totalVotes').get(function () {
  return this.options.reduce((sum, opt) => sum + (opt.votes ? opt.votes.length : 0), 0);
});

// Auto-close if deadline passed
pollSchema.methods.isExpired = function () {
  if (!this.deadline) return false;
  return new Date() > new Date(this.deadline);
};

module.exports = mongoose.model('Poll', pollSchema);
