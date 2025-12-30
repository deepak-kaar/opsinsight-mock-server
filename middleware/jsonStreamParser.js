const { Transform } = require('stream');

module.exports = {
    jsonStreamParser: async function (req, res, next) {
        // Utility to process the stream and parse the chunks
        console.log("test");
        
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            // If the body size exceeds a certain size (say 100MB), throw an error
            if (body.length > 100 * 1024 * 1024) {
                req.connection.destroy(); // Kill the connection
                res.status(413).send('Payload too large'); // Send error response
            }
        });

        req.on('end', () => {
            try {
                req.body = JSON.parse(body);
                return next();
            } catch (err) {
                res.status(400).send('Invalid JSON payload');
            }
        });
    }
}

