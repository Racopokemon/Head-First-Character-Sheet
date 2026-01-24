const mongoose = require('mongoose');

const sheetSchema = new mongoose.Schema({
  sheetId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: function(v) {
        // Only allow a-z, A-Z, 0-9, - and length 1-64
        return /^[a-zA-Z0-9-]{1,64}$/.test(v);
      },
      message: props => `${props.value} is not a valid sheet ID. Use only letters, numbers, and hyphens (1-64 characters).`
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
