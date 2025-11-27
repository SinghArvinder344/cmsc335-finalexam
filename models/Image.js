const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  imageUrl: { type: String, required: true },
  savedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Image", imageSchema);
