const mongoose = require('mongoose');

const sheetSchema = new mongoose.Schema({
  sheetId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: function(v) {
        // Allow any chars except . / \ and control characters, length 1-64
        if (!v || v.length < 1 || v.length > 64) return false;
        if (/[./\\]/.test(v)) return false;
        if (/[\x00-\x1F\x7F]/.test(v)) return false;
        return true;
      },
      message: props => `${props.value} is not a valid sheet ID (1-64 characters, no . / \\ allowed).`
    }
  },
  set_by_gm: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  set_by_player: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  gmHash: {
    type: String,
    default: ''
  },
  lastAccessed: {
    type: Date,
    default: Date.now,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Update lastAccessed before each save
sheetSchema.pre('save', function(next) {
  this.lastAccessed = new Date();
  next();
});

// Also update on findOneAndUpdate
sheetSchema.pre('findOneAndUpdate', function(next) {
  this.set({ lastAccessed: new Date() });
  next();
});

const Sheet = mongoose.model('Sheet', sheetSchema);

module.exports = Sheet;
