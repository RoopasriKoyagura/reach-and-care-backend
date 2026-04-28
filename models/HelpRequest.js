const mongoose = require('mongoose');

const helpRequestSchema = new mongoose.Schema(
  {
    // Who needs help
    elderly: { type: mongoose.Schema.Types.ObjectId, ref: 'Elderly', required: true },

    // Type of help (from IVR input)
    requestType: {
      type: String,
      enum: ['emergency', 'medicine', 'daily_needs'],
      required: true,
    },

    // IVR call details
    ivrCallSid: { type: String }, // Twilio Call SID
    callerPhone: { type: String }, // Phone number that called
    ivrInput: { type: String },   // '1', '2', or '3'

    // Status flow: pending → assigned → accepted → in_progress → completed → rated
    status: {
      type: String,
      enum: ['pending', 'assigned', 'accepted', 'in_progress', 'completed', 'cancelled', 'rated'],
      default: 'pending',
    },

    // Assigned volunteer
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer' },
    assignedAt: { type: Date },
    acceptedAt: { type: Date },
    arrivedAt: { type: Date },
    completedAt: { type: Date },

    // Volunteers who were notified but didn't respond
    notifiedVolunteers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer' }],
    declinedByVolunteers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer' }],

    // Location of request (copied from elderly at time of request)
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] }, // [lng, lat]
    },

    // OTP for completion verification
    completionOtp: { type: String },
    otpGeneratedAt: { type: Date },
    otpVerified: { type: Boolean, default: false },

    // Notes
    description: { type: String }, // Optional description of need
    volunteerNotes: { type: String },

    // Feedback / Rating (by family member after completion)
    feedback: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String },
      givenBy: { type: String }, // 'family' or 'elderly'
      givenAt: { type: Date },
    },

    // Escalation (if no volunteer accepts within X minutes)
    escalated: { type: Boolean, default: false },
    escalationCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

helpRequestSchema.index({ location: '2dsphere' });
helpRequestSchema.index({ status: 1, createdAt: -1 });
helpRequestSchema.index({ elderly: 1 });
helpRequestSchema.index({ volunteer: 1 });

module.exports = mongoose.model('HelpRequest', helpRequestSchema);
