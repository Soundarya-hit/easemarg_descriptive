// models/Question.js
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  subject: { type: String, required: true },
  topic: { type: String },
  questionType: { type: String, enum: ['MCQ', 'True/False', 'Fill-in-the-Blank'], default: 'MCQ' },
  options: [{ type: String }], // For MCQs
  correctAnswer: { type: String, required: true },
  hint: { type: String },
  explanation: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Question', questionSchema);