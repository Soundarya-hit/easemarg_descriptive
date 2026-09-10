// routes/questionRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const Question = require('../models/Question');

// Configure multer for temporary storage of uploaded CSV file
const upload = multer({ dest: 'uploads/' });

// POST endpoint to handle CSV upload from the admin page
router.post('/upload-questions', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No CSV file uploaded.' });
  }

  const results = [];
  const filePath = req.file.path;

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => {
      // Map CSV columns to schema fields (adjust column headers as per your CSV structure)
      // Expected CSV headers: questionText, subject, topic, questionType, option1, option2, option3, option4, correctAnswer, hint, explanation
      let options = [];
      if (data.option1) options.push(data.option1);
      if (data.option2) options.push(data.option2);
      if (data.option3) options.push(data.option3);
      if (data.option4) options.push(data.option4);

      results.push({
        questionText: data.questionText || data.question,
        subject: data.subject || 'General',
        topic: data.topic || '',
        questionType: data.questionType || 'MCQ',
        options: options,
        correctAnswer: data.correctAnswer || data.answer,
        hint: data.hint || '',
        explanation: data.explanation || ''
      });
    })
    .on('end', async () => {
      // Remove temporary file after reading
      fs.unlinkSync(filePath);

      try {
        if (results.length === 0) {
          return res.status(400).json({ success: false, message: 'CSV file is empty or formatted incorrectly.' });
        }

        // Insert parsed questions into MongoDB
        const insertedQuestions = await Question.insertMany(results, { ordered: false });

        return res.status(200).json({
          success: true,
          message: `Successfully uploaded and saved ${insertedQuestions.length} questions!`,
          count: insertedQuestions.length
        });
      } catch (error) {
        console.error('Database insertion error:', error);
        return res.status(500).json({
          success: false,
          message: 'Error saving questions to database',
          error: error.message
        });
      }
    })
    .on('error', (error) => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      console.error('CSV parsing error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error parsing CSV file',
        error: error.message
      });
    });
});

module.exports = router;