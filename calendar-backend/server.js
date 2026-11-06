require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http'); 
const { Server } = require("socket.io"); 
const Led = require('./models/Led');

const app = express();
const server = http.createServer(app); 

const io = new Server(server, {
    cors: { origin: "*" } 
});

app.use(cors()); 
app.use(express.json()); 

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

io.on('connection', (socket) => {
    console.log(`🔌 Device connected: ${socket.id}`);

    socket.on('esp_connected', async () => {
        try {
            const leds = await Led.find({ isOn: true }).sort({ updatedAt: -1, _id: -1 });
            socket.emit('initial_state', leds);
        } catch (err) { console.log(err); }
    });

    socket.on('request_all_data', async () => {
        try {
            const leds = await Led.find({ isOn: true }).sort({ updatedAt: -1, _id: -1 });
            socket.emit('bulk_data', leds);
        } catch (err) { console.log(err); }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Device disconnected: ${socket.id}`);
    });
});

app.get('/api/get-state', async (req, res) => {
    try {
        const leds = await Led.find({ isOn: true }).sort({ updatedAt: -1, _id: -1 }); 
        res.json(leds);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/update-led', async (req, res) => {
    const { dateString, type, color, isOn, eventNote } = req.body;
    
    try {
        // Find strictly by dateString. Ignore 'id' entirely.
        const updatedLed = await Led.findOneAndUpdate(
            { dateString: dateString }, 
            { type: type, color: color, isOn: isOn, eventNote: eventNote },
            { upsert: true, returnDocument: 'after' }
        );

        io.emit('led_updated', updatedLed); 
        res.json({ success: true, data: updatedLed });
    } catch (err) {
        console.error("❌ Database save error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Permanently delete one or many records from the database
app.post('/api/delete-leds', async (req, res) => {
    const { dateStrings } = req.body;

    if (!Array.isArray(dateStrings) || dateStrings.length === 0 ||
        !dateStrings.every(d => typeof d === 'string')) {
        return res.status(400).json({ error: 'dateStrings must be a non-empty array of strings' });
    }

    try {
        const result = await Led.deleteMany({ dateString: { $in: dateStrings } });
        io.emit('leds_deleted', dateStrings); // tell every open page to remove them
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (err) {
        console.error("❌ Database delete error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});