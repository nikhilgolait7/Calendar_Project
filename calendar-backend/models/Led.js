const mongoose = require('mongoose');
 
const LedSchema = new mongoose.Schema({
    // This is the ONLY unique identifier now
    dateString: { type: String, required: true, unique: true }, 
    type: { type: String, enum: ['day', 'date', 'month'], required: true },
    color: { type: String, default: '#f50057' },
    isOn: { type: Boolean, default: false },
    eventNote: { type: String, default: "" }
}, { 
    // This tells Mongoose to strictly follow this schema
    strict: true,
    timestamps: true   // adds createdAt / updatedAt so the admin panel can show recent changes first
});
 
// Ensure we NEVER use the old type_1_id_1 index
LedSchema.index({ dateString: 1 }, { unique: true }); 
 
module.exports = mongoose.model('Led', LedSchema);