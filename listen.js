const express = require('express');
const app = express();
const cors = require('cors');
const routes = require('./routes');

app.use(express.json()); // for parsing application/json

// Setup CORS
app.use(cors({
    origin: 'http://127.0.0.1:5173', // Your frontend's origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP Methods
    credentials: true // Allow credentials (cookies) to be sent
}));

app.use('/api', routes); // Mount your API routes here

app.listen(9001, () => {
    console.log('Server is running on port 9001');
});


module.exports = app; // Export for testing