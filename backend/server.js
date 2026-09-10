// ==========================================
// server.js - EaseMarg & Gemini Dynamic Sketch Backend
// ==========================================
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(cors());

// Multiple API Keys Pool for Rotation & Load Balancing
const apiKeys = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY
].filter(Boolean);

let currentKeyIndex = 0;

function getRotatedAiClient() {
  if (apiKeys.length === 0) {
    throw new Error("No Gemini API keys found in .env file!");
  }
  const key = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return new GoogleGenAI({ apiKey: key });
}

function parseJsonSafely(rawText) {
  if (!rawText) throw new Error("Received empty response from Gemini");
  let cleanText = rawText.trim();
  
  if (cleanText.startsWith("```json")) {
    cleanText = cleanText.replace(/^```json/, "").replace(/```$/, "").trim();
  } else if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```/, "").replace(/```$/, "").trim();
  }
  
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleanText);
  } catch (err) {
    try {
      const sanitized = cleanText
        .replace(/[\u0000-\u001F]+/g, "")
        .replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
      return JSON.parse(sanitized);
    } catch (err2) {
      try {
        const titleMatch = cleanText.match(/"title"\s*:\s*"([^"]+)"/);
        const svgMatch = cleanText.match(/"svgContent"\s*:\s*"([\s\S]+)"\s*\}/);
        if (titleMatch && svgMatch) {
          return {
            title: titleMatch[1],
            svgContent: svgMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
          };
        }
      } catch (ex) {}

      console.error("JSON Parse Error on raw text:", rawText);
      throw new Error("Failed to parse Gemini AI JSON response: " + err.message);
    }
  }
}

// MongoDB Connection & Schema Setup
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://cluster0.xxxx.mongodb.net/test?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB Atlas (Database: test)!"))
  .catch(err => console.error("MongoDB Connection Error:", err));

const questionSchema = new mongoose.Schema({
  className: { type: String, default: "10" },
  subject: { type: String, default: "Science" },
  topicId: { type: String, default: "t1" },
  moduleId: { type: String, default: "m1" },
  topicName: { type: String, default: "" },
  moduleName: { type: String, default: "" },
  questionType: { type: String, default: "Descriptive" }, // Descriptive, MCQ, TrueFalse, FillBlank
  questionText: { type: String, required: true },
  options: [String], // Added for MCQ support
  correctAnswer: { type: String, default: "" }, // Added for objective questions
  explanation: { type: String, default: "" }, // Added for question bank explanations
  difficulty: { type: String, default: "Medium" }, // Added difficulty field
  marks: { type: Number, default: 1 }, // Added marks field
  hint: { type: String, default: "" },
  keyWords: [String],
  modelAnswer: { type: String, default: null },
  keyPoints: [String],
  referenceDrawing: { type: String, default: null }
}, { collection: 'questions' });

const QuestionModel = mongoose.model('Question', questionSchema);

const sketchSchema = new mongoose.Schema({
  questionId: { type: String, unique: true, required: true },
  questionText: String,
  imageUrl: String,
  title: String,
  createdAt: { type: Date, default: Date.now }
});
const SketchCache = mongoose.model('SketchCache', sketchSchema);

// Added Submission Schema for analytics, profile page history, and performance tracking
const submissionSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  studentAnswer: { type: String, default: "" },
  score: { type: Number, default: 0 },
  feedback: { type: String, default: "" },
  componentAnalysis: {
    textBox: { type: String, default: "" },
    canvasDrawing: { type: String, default: "" },
    uploadedPhotos: { type: String, default: "" }
  },
  missingPoints: [String],
  typingSeconds: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'submissions' });

const SubmissionModel = mongoose.model('Submission', submissionSchema);

let isProcessingQueue = false;
const requestQueue = [];

async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    const { contents, resolve, reject, retries } = requestQueue.shift();
    try {
      const result = await executeGeminiWithRetry(contents, retries);
      resolve(result);
    } catch (err) {
      reject(err);
    }
    await new Promise(r => setTimeout(r, 4000));
  }
  isProcessingQueue = false;
}

function enqueueGeminiRequest(contents, retries = 4) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ contents, resolve, reject, retries });
    processQueue();
  });
}

async function executeGeminiWithRetry(contents, retries = 4) {
  const modelsToTry = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.6-flash'];

  for (const modelName of modelsToTry) {
    for (let i = 0; i < retries; i++) {
      try {
        const aiClient = getRotatedAiClient();
        const response = await aiClient.models.generateContent({
          model: modelName,
          contents: contents,
          config: { responseMimeType: 'application/json' }
        });
        return response.text;
      } catch (err) {
        console.log(`Model ${modelName} error (${err.message}). Retrying... (Attempt ${i + 1})`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000 * Math.pow(2, i)));
        }
      }
    }
  }
  throw new Error("All Gemini models are currently busy or unavailable (503).");
}

// API to Fetch Questions with advanced query filtering
app.get('/api/questions', async (req, res) => {
  try {
    const { className, subject, topicId, moduleId, questionType, difficulty } = req.query;
    let filter = {};
    if (className) filter.className = className;
    if (subject) filter.subject = subject;
    if (topicId) filter.topicId = topicId;
    if (moduleId) filter.moduleId = moduleId;
    if (questionType) filter.questionType = questionType;
    if (difficulty) filter.difficulty = difficulty;

    const questionsFromDb = await QuestionModel.find(filter).lean();
    
    const formattedQuestions = await Promise.all(questionsFromDb.map(async (qObj) => {
      return {
        ...qObj,
        _id: qObj._id.toString(),
        isDrawingQuestion: true
      };
    }));

    res.json({ success: true, count: formattedQuestions.length, questions: formattedQuestions });
  } catch (err) {
    console.error("Fetch Questions Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API to Create/Add a new question
app.post('/api/questions', async (req, res) => {
  try {
    const newQ = new QuestionModel(req.body);
    const savedQ = await newQ.save();
    res.status(201).json({ success: true, question: savedQ });
  } catch (err) {
    console.error("Create Question Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GEMINI DYNAMIC SKETCH API ENDPOINT
app.post('/api/get-question-sketch', async (req, res) => {
  try {
    let { questionId, questionText } = req.body;
    
    if (!questionId) {
      questionId = questionText ? Buffer.from(questionText).toString('base64').substring(0, 30) : "default_sketch_id";
    }

    let existingSketch = await SketchCache.findOne({ questionId });
    if (existingSketch && existingSketch.imageUrl) {
      return res.json({ success: true, source: 'database_cache', data: existingSketch });
    }

    const prompt = `Generate a clean, scientific, educational line drawing or vector diagram without any text labels for the following question: "${questionText || 'Standard Science Question'}". 
    Output the result strictly as a valid JSON object with keys: 
    - "title": a short academic title string for the diagram,
    - "svgContent": raw valid SVG code string (using standard <svg viewBox="0 0 600 450" ...>...</svg> format with proper strokes, fills, and no text elements).`;

    let responseText;
    try {
      responseText = await enqueueGeminiRequest(prompt);
      const parsed = parseJsonSafely(responseText);
      
      const newSketchData = {
        questionId,
        questionText: questionText || "Standard Question",
        imageUrl: parsed.svgContent || '<svg viewBox="0 0 600 450" width="100%" height="100%"><rect width="600" height="450" fill="#fff"/><text x="200" y="225" fill="#333">Diagram Generated</text></svg>',
        title: parsed.title || "Academic Outline Diagram"
      };

      existingSketch = await SketchCache.findOneAndUpdate(
        { questionId },
        newSketchData,
        { upsert: true, new: true }
      );

      return res.json({ success: true, source: 'gemini_generated', data: existingSketch });

    } catch (geminiErr) {
      console.error("Gemini sketch generation error, using fallback:", geminiErr.message);
      
      const fallbackSvg = `<svg viewBox="0 0 600 450" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="450" fill="#ffffff"/><g transform="translate(100, 50)" stroke="#1e293b" stroke-width="2.5" fill="none"><rect x="50" y="50" width="350" height="250" rx="15" fill="#f8fafc"/><circle cx="225" cy="175" r="50"/></g></svg>`;
      
      const fallbackData = {
        questionId,
        questionText: questionText || "Standard Question",
        imageUrl: fallbackSvg,
        title: "Standard Academic Outline Diagram (Fallback)"
      };

      return res.json({ success: true, source: 'local_fallback', data: fallbackData });
    }

  } catch (err) {
    console.error("Sketch Fetching Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API for Evaluation (Analyzes student submission & saves to database for analytics/profile)
app.post('/api/evaluate', async (req, res) => {
  try {
    const { questionId, studentAnswer, canvasItems, studentLabels, canvasBgMode, canvasSketchData, uploadedAnswerPhotos, typingSeconds } = req.body;
    if (!questionId) return res.status(400).json({ error: "Question ID is required" });

    let questionDoc = await QuestionModel.findById(questionId);
    let questionText = questionDoc ? questionDoc.questionText : "Explain the question.";
    let modelAnswer = questionDoc ? questionDoc.modelAnswer : null;
    let keyPoints = questionDoc ? questionDoc.keyPoints : [];

    if (!modelAnswer || !keyPoints || keyPoints.length === 0) {
      const modelPrompt = `Generate a detailed model answer and 3-5 technical key points for this question: "${questionText}". 
      Return valid JSON with keys: "modelAnswer" (string) and "keyPoints" (array of strings).`;

      let responseText = await enqueueGeminiRequest(modelPrompt);
      const parsed = parseJsonSafely(responseText);
      modelAnswer = parsed.modelAnswer;
      keyPoints = parsed.keyPoints;

      if (questionDoc) {
        questionDoc.modelAnswer = modelAnswer;
        questionDoc.keyPoints = keyPoints;
        await questionDoc.save();
      }
    }

    const evalPrompt = `
      You are an expert, strict academic teacher and examiner. 
      Evaluate the student's complete submission across ALL input sources independently and thoroughly:
      
      1. Written Theory Explanation (Text Box): "${studentAnswer || 'None provided'}"
      2. Interactive Canvas Elements / Shapes / Map Mode (${canvasBgMode}): ${JSON.stringify(canvasItems || [])} and Pointer Labels: ${JSON.stringify(studentLabels || [])}
      ${canvasSketchData ? `3. Imported Diagram / Sketch Outline ("${canvasSketchData.title || 'Custom Sketch'}"): SVG/Image content displayed on canvas: ${canvasSketchData.imageUrl}` : ''}
      4. Uploaded Answer Paper Photos: ${uploadedAnswerPhotos && uploadedAnswerPhotos.length > 0 ? uploadedAnswerPhotos.length + ' page(s) attached' : 'None provided'}
      
      Question: ${questionText}
      ModelAnswer: ${modelAnswer}
      Expected Key Points: ${JSON.stringify(keyPoints)}
      Time taken: ${typingSeconds || 0} seconds.
      
      EVALUATION INSTRUCTIONS:
      - Analyze each source (Text Box, Canvas Drawing / Map / Imported Sketch Outline with placed shapes & labels, Uploaded Photos) separately.
      - Check if the student correctly labeled or annotated the imported apparatus/diagram sketch components using pointer arrows and correct scientific terms.
      - Provide "componentAnalysis" object with keys: "textBox", "canvasDrawing", and "uploadedPhotos" detailing evaluation for each.
      - Assign an accurate score out of 10.
      - Provide feedback string, and missingPoints array of strings.
      
      Return valid JSON with keys: 
      - "score" (number out of 10)
      - "feedback" (string detailing overall summary)
      - "componentAnalysis" (object with keys: "textBox", "canvasDrawing", "uploadedPhotos")
      - "missingPoints" (array of strings)
    `;

    let contentParts = [evalPrompt];
    if (uploadedAnswerPhotos && Array.isArray(uploadedAnswerPhotos)) {
      for (const photo of uploadedAnswerPhotos) {
        const matches = photo.match(/^data:(.+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          contentParts.push({ inlineData: { mimeType: matches[1], data: matches[2] } });
        }
      }
    }

    let evalText = await enqueueGeminiRequest(contentParts);
    const evaluationResult = parseJsonSafely(evalText);

    // Save submission record for analytics and profile page history retrieval
    try {
      await SubmissionModel.create({
        questionId,
        studentAnswer: studentAnswer || "",
        score: evaluationResult.score || 0,
        feedback: evaluationResult.feedback || "",
        componentAnalysis: {
          textBox: evaluationResult.componentAnalysis?.textBox || "",
          canvasDrawing: evaluationResult.componentAnalysis?.canvasDrawing || "",
          uploadedPhotos: evaluationResult.componentAnalysis?.uploadedPhotos || ""
        },
        missingPoints: evaluationResult.missingPoints || [],
        typingSeconds: typingSeconds || 0
      });
    } catch (subErr) {
      console.error("Error saving submission history:", subErr.message);
    }

    res.json({
      success: true,
      evaluation: evaluationResult,
      modelAnswer,
      keyPoints
    });

  } catch (err) {
    console.error("Evaluation Error ❌:", err);
    res.status(500).json({ error: err.message });
  }
});

// API to fetch past submissions for Analytics & Profile Page
app.get('/api/submissions', async (req, res) => {
  try {
    const { questionId } = req.query;
    let filter = {};
    if (questionId) filter.questionId = questionId;

    const submissions = await SubmissionModel.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, count: submissions.length, submissions });
  } catch (err) {
    console.error("Fetch Submissions Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}!`));