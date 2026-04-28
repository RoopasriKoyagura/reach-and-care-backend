const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const volunteerSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    photo: { type: String },

    // ID Proof for verification
    idProofType: { type: String, enum: ['aadhar', 'voter', 'pan', 'driving'] },
    idProofUrl: { type: String },
    idProofNumber: { type: String },

    // Address
    address: {
      street: { type: String, required: true },
      village: { type: String },
      mandal: { type: String },
      district: { type: String, required: true },
      state: { type: String, default: 'Telangana' },
      pincode: { type: String, required: true },
    },

    // GeoJSON for proximity matching
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
    },

    // Skills & availability
    skills: [{ type: String }], // e.g. ['medical', 'driving', 'cooking']
    languages: [{ type: String, default: ['Telugu'] }],
    isAvailable: { type: Boolean, default: true },
    availableHours: { type: String, default: '24/7' },

    // Status
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    // Push notification token (for mobile apps / PWA)
    fcmToken: { type: String },

    // Stats
    totalHelpsDone: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    // Current active request (one at a time)
    currentRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'HelpRequest' },
  },
  { timestamps: true }
);

volunteerSchema.index({ location: '2dsphere' });

// Hash password before save
volunteerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
volunteerSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Volunteer', volunteerSchema);
