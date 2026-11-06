require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
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

// Looks in the parent folder first (your layout), then ./public, then next to server.js.
const candidates = [path.resolve(__dirname, '..'), path.join(__dirname, 'public'), __dirname];
const frontendPath = candidates.find(dir => fs.existsSync(path.join(dir, 'index.html'))) || candidates[0];

console.log('Frontend directory:', frontendPath);

// Serve ONLY the four frontend files. (express.static on a whole folder would also
// expose server.js, package.json and any env file that happens to sit in that folder.)
['index.html', 'admin.html', 'app.js', 'style.css'].forEach(file => {
    app.get('/' + file, (req, res) => res.sendFile(path.join(frontendPath, file)));
});

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
// API: COMPACT FEED FOR THE ESP32
// ------------------------------------
// Plain text, 3 lines: 7 weekdays, 31 dates, 12 months.
// Each entry is a 6-digit hex colour, or empty when that LED has no colour.
// Usage: /api/esp-state?y=2026&m=10      (m = 0-11, the month the board is showing)

app.get('/api/esp-state', async (req, res) => {
    const y = parseInt(req.query.y, 10);
    const m = parseInt(req.query.m, 10);

    if (!(y >= 2020 && y <= 2099) || !(m >= 0 && m <= 11)) {
        return res.status(400).send('bad y/m');
    }
    const mm = String(m + 1).padStart(2, '0');

    try {
        const leds = await Led.find({
            isOn: true,
            $or: [
                { type: 'day' },
                { type: 'date',  dateString: { $regex: `^${y}-${mm}-` } },
                { type: 'month', dateString: { $regex: `^${y}-` } }
            ]
        }).lean();

        const days = Array(7).fill('');
        const dates = Array(31).fill('');
        const months = Array(12).fill('');

        for (const led of leds) {
            const c = /^#[0-9a-fA-F]{6}$/.test(led.color) ? led.color.slice(1).toLowerCase() : '';
            if (!c) continue;

            if (led.type === 'day') {
                const i = parseInt(led.dateString.split('-')[1], 10);
                if (i >= 0 && i <= 6) days[i] = c;
            } else if (led.type === 'date') {
                const i = parseInt(led.dateString.slice(8, 10), 10) - 1;
                if (i >= 0 && i <= 30) dates[i] = c;
            } else if (led.type === 'month') {
                const i = parseInt(led.dateString.slice(5, 7), 10) - 1;
                if (i >= 0 && i <= 11) months[i] = c;
            }
        }

        res.type('text/plain').send(
            [days, dates, months].map(a => a.join(',')).join('\n') + '\n'
        );

    } catch (err) {
        console.error('❌ ESP feed error:', err.message);
        res.status(500).send('error');
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