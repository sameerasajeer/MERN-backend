const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
    title: {
        type: String,
        default: '',
        trim: true,
    },
    content: {
        type: String,
        default: '',
    },
    tags: {
        type: [String],
        default: [],
    },
    isFavorite: {
        type: Boolean,
        default: false,
    },
    isTrashed: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

module.exports = mongoose.model('Note', NoteSchema);
