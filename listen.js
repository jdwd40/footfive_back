const express = require('express');
const app = express();
const cors = require('cors');
const routes = require('./routes');

app.use(express.json()); // for parsing application/json

// Setup CORS
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Allow localhost for development
        if (origin.includes('127.0.0.1') || origin.includes('localhost')) {
            return callback(null, true);
        }
        
        // Allow your VPS IP/domain for production
        if (origin.includes('77.68.4.18')) {
            return callback(null, true);
        }
        
        // For testing tools like Insomnia/Postman, allow all origins in non-production
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        
        return callback(null, true); // Allow all for now - tighten this later
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 200 // For legacy browser support
};

app.use(cors(corsOptions));

app.use('/api', routes); // Mount your API routes here

app.listen(9001, () => {
    console.log('Server is running on port 9001');
});


module.exports = app; // Export for testing