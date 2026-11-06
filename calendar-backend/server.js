
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const Led = require('./models/Led');

const app = express();
const server = http.createServer(app);

// ------------------------------------
// SOCKET.IO CONFIGURATION
// ------------------------------------

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ------------------------------------
// MIDDLEWARE
// ------------------------------------

app.use(cors());
app.use(express.json());

// ------------------------------------
// FRONTEND FILE CONFIGURATION
// ------------------------------------

// Frontend files are in the parent directory
// of calendar-backend.

const frontendPath = path.resolve(__dirname, '..');

console.log('Frontend directory:', frontendPath);

// Serve HTML, CSS and JavaScript files
app.use(express.static(frontendPath));

// Main Calendar Page
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Admin Panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(frontendPath, 'admin.html'));
});

// ------------------------------------
// MONGODB CONNECTION
// ------------------------------------

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas');
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err);
    });

// ------------------------------------
// SOCKET.IO EVENTS
// ------------------------------------

io.on('connection', (socket) => {

    console.log(`🔌 Device connected: ${socket.id}`);

    // ESP device requests initial LED state
    socket.on('esp_connected', async () => {
        try {
            const leds = await Led.find({ isOn: true })
                .sort({ updatedAt: -1, _id: -1 });

            socket.emit('initial_state', leds);

        } catch (err) {
            console.error('Initial state error:', err);
        }
    });

    // Request all active LED data
    socket.on('request_all_data', async () => {
        try {
            const leds = await Led.find({ isOn: true })
                .sort({ updatedAt: -1, _id: -1 });

            socket.emit('bulk_data', leds);

        } catch (err) {
            console.error('Bulk data error:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Device disconnected: ${socket.id}`);
    });
});

// ------------------------------------
// API: GET LED STATE
// ------------------------------------

app.get('/api/get-state', async (req, res) => {
    try {
        const leds = await Led.find({ isOn: true })
            .sort({ updatedAt: -1, _id: -1 });

        res.json(leds);

    } catch (err) {
        console.error('Get state error:', err);

        res.status(500).json({
            error: err.message
        });
    }
});

// ------------------------------------
// API: UPDATE LED
// ------------------------------------

app.post('/api/update-led', async (req, res) => {

    const {
        dateString,
        type,
        color,
        isOn,
        eventNote
    } = req.body;

    if (!dateString) {
        return res.status(400).json({
            error: 'dateString is required'
        });
    }

    try {
        const updatedLed = await Led.findOneAndUpdate(
            { dateString: dateString },
            {
                type: type,
                color: color,
                isOn: isOn,
                eventNote: eventNote
            },
            {
                upsert: true,
                returnDocument: 'after'
            }
        );

        // Notify all connected clients
        io.emit('led_updated', updatedLed);

        res.json({
            success: true,
            data: updatedLed
        });

    } catch (err) {
        console.error('❌ Database save error:', err.message);

        res.status(500).json({
            error: err.message
        });
    }
});

// ------------------------------------
// API: DELETE LED RECORDS
// ------------------------------------

app.post('/api/delete-leds', async (req, res) => {

    const { dateStrings } = req.body;

    if (
        !Array.isArray(dateStrings) ||
        dateStrings.length === 0 ||
        !dateStrings.every(d => typeof d === 'string')
    ) {
        return res.status(400).json({
            error: 'dateStrings must be a non-empty array of strings'
        });
    }

    try {
        const result = await Led.deleteMany({
            dateString: { $in: dateStrings }
        });

        // Notify all connected clients
        io.emit('leds_deleted', dateStrings);

        res.json({
            success: true,
            deletedCount: result.deletedCount
        });

    } catch (err) {
        console.error('❌ Database delete error:', err.message);

        res.status(500).json({
            error: err.message
        });
    }
});

// ------------------------------------
// HEALTH CHECK
// ------------------------------------

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        database: mongoose.connection.readyState === 1
            ? 'Connected'
            : 'Disconnected'
    });
});

// ------------------------------------
// START SERVER
// ------------------------------------

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
