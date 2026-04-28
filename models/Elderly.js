const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const elderlySchema = new mongoose.Schema(
  {
    // Basic Info
    fullName: { type: String, required: true, trim: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    phone: { type: String, required: true, unique: true },
    alternatePhone: { type: String },
    photo: { type: String }, // Cloudinary URL

    // Address (for volunteer routing)
    address: {
      street: { type: String, required: true },
      village: { type: String },
      mandal: { type: String },
      district: { type: String, required: true },
      state: { type: String, default: 'Telangana' },
      pincode: { type: String, required: true },
    },

    // GeoJSON location for proximity matching
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
    },

    // Health Details
    healthIssues: [{ type: String }],
    medications: [{ type: String }],
    bloodGroup: { type: String },
    doctorName: { type: String },
    doctorPhone: { type: String },
    hospitalName: { type: String },

    // Family / Guardian (who registered them)
    registeredBy: {
      name: { type: String, required: true },
      relationship: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String },
    },

    // Helpline Number assigned
    helplineNumber: { type: String },

    // Account
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },

    // Stats
    totalRequests: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Index for geo queries
elderlySchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Elderly', elderlySchema);
