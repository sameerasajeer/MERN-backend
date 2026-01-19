const router = require('express').Router();
let Note = require('../models/Note');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Configure Multer to preserve extensions
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname) || '.webm';
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storage });

// GET all active notes (not trashed)
router.route('/').get((req, res) => {
    Note.find({ isTrashed: false })
        .sort({ createdAt: -1 })
        .then(notes => res.json(notes))
        .catch(err => res.status(400).json('Error: ' + err));
});

// GET trashed notes
router.route('/trash').get((req, res) => {
    Note.find({ isTrashed: true })
        .sort({ createdAt: -1 })
        .then(notes => res.json(notes))
        .catch(err => res.status(400).json('Error: ' + err));
});

// POST new note
router.route('/').post((req, res) => {
    const { title, content, tags, isFavorite } = req.body;

    const newNote = new Note({
        title,
        content,
        tags,
        isFavorite,
        isTrashed: false
    });

    newNote.save()
        .then((note) => res.json(note))
        .catch(err => res.status(400).json('Error: ' + err));
});

// GET note by ID
router.route('/:id').get((req, res) => {
    Note.findById(req.params.id)
        .then(note => res.json(note))
        .catch(err => res.status(400).json('Error: ' + err));
});

// DELETE note (Soft or Hard)
router.route('/:id').delete((req, res) => {
    Note.findById(req.params.id)
        .then(note => {
            if (!note) return res.status(404).json('Note not found');

            if (note.isTrashed) {
                // Already in trash, perform hard delete
                Note.findByIdAndDelete(req.params.id)
                    .then(() => res.json({ message: 'Note permanently deleted', type: 'hard' }))
                    .catch(err => res.status(400).json('Error: ' + err));
            } else {
                // Move to trash
                note.isTrashed = true;
                note.save()
                    .then(() => res.json({ message: 'Note moved to trash', type: 'soft' }))
                    .catch(err => res.status(400).json('Error: ' + err));
            }
        })
        .catch(err => res.status(400).json('Error: ' + err));
});

// UPDATE note
router.route('/:id').put((req, res) => {
    Note.findById(req.params.id)
        .then(note => {
            if (!note) return res.status(404).json('Note not found');

            note.title = req.body.title !== undefined ? req.body.title : note.title;
            note.content = req.body.content !== undefined ? req.body.content : note.content;
            note.tags = req.body.tags !== undefined ? req.body.tags : note.tags;
            note.isFavorite = req.body.isFavorite !== undefined ? req.body.isFavorite : note.isFavorite;
            note.isTrashed = req.body.isTrashed !== undefined ? req.body.isTrashed : note.isTrashed;

            note.save()
                .then(() => res.json(note))
                .catch(err => res.status(400).json('Error: ' + err));
        })
        .catch(err => res.status(400).json('Error: ' + err));
});

// Search functionality
router.route('/search').post((req, res) => {
    const query = req.body.query;
    Note.find({
        isTrashed: false,
        $or: [
            { title: { $regex: query, $options: 'i' } },
            { content: { $regex: query, $options: 'i' } }
        ]
    })
        .then(notes => res.json(notes))
        .catch(err => res.status(400).json('Error: ' + err));
});

const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Video Summarization Endpoint
router.post('/summarize-video', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json('Error: No video file uploaded');
    }

    try {
        console.log("Transcribing video:", req.file.path);
        // 1. Transcribe the video audio using Groq Whisper
        // whisper-large-v3 is the standard high-quality model
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(req.file.path),
            model: "whisper-large-v3",
            response_format: "text",
        }).catch(err => {
            console.error("Transcription Error Detail:", err.response?.data || err.message);
            throw err;
        });

        console.log("Transcription successful, summarizing...");
        // 2. Summarize the transcript using Groq Llama
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that summarizes video transcripts into concise, bulleted notes using Markdown."
                },
                {
                    role: "user",
                    content: `Please provide a concise summary of this video transcript about Javascript or the recorded topic:\n\n${transcription}`
                }
            ],
            model: "llama-3.3-70b-versatile",
        });

        const summaryText = chatCompletion.choices[0]?.message?.content || "No summary generated.";
        const summary = `\n\n**AI Video Summary**:\n${summaryText}\n`;

        // Clean up the uploaded file
        if (fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting temp file:', err);
            });
        }

        res.json({ summary: summary });

    } catch (err) {
        console.error('Groq API Error FULL:', err);
        // Clean up on error too
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, () => { });
        }
        res.status(500).json({ error: 'Failed to process video with Groq AI', details: err.message });
    }
});

module.exports = router;
