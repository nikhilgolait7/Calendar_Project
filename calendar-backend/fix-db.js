require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("Connected to DB. Attempting to drop old index...");
        try {
            // We use the raw MongoDB driver to drop the specific index
            const db = mongoose.connection.db;
            await db.collection('leds').dropIndex('type_1_id_1');
            console.log("✅ Successfully dropped 'type_1_id_1' index!");
        } catch (err) {
            console.log("⚠️ Could not drop index (it might already be gone):", err.message);
        }
        
        // Now let's test a save immediately
        console.log("Testing a save...");
        try {
            const Led = require('./models/Led');
            const test = await Led.findOneAndUpdate(
                { dateString: "test-day-0" }, 
                { type: "day", color: "#ff0000", isOn: true },
                { upsert: true, returnDocument: 'after' }
            );
            console.log("✅ TEST SAVE SUCCESSFUL! Data:", test);
        } catch (saveErr) {
            console.error("❌ TEST SAVE FAILED. The error is:", saveErr.message);
        }
        
        process.exit();
    })
    .catch(err => {
        console.error("DB Connection Error:", err);
        process.exit();
    });