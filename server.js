const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Define uploads directory (Render uses /app/uploads for persistent disk)
const uploadDir = process.env.RENDER ? '/app/uploads' : path.join(__dirname, 'Uploads');

// Log environment for debugging
console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    RENDER: process.env.RENDER,
    uploadDir
});

// Ensure uploads directory exists locally (not needed on Render)
if (!process.env.RENDER) {
    try {
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log(`Created local uploads directory: ${uploadDir}`);
        }
    } catch (err) {
        console.error(`Failed to create local uploads directory: ${err.message}`);
    }
}

// Configure multer for file storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        console.log(`Saving file to: ${uploadDir}`);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);
        let filename = file.originalname;
        let counter = 1;
        while (fs.existsSync(path.join(uploadDir, filename))) {
            filename = `${baseName}-${counter}${ext}`;
            counter++;
        }
        console.log(`Generated filename: ${filename}`);
        cb(null, filename);
    },
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and Word (.docx) files are allowed'), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

// Serve static files (index.html and uploads)
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Health check endpoint
app.get('/health', (req, res) => {
    console.log('Health check requested');
    res.status(200).send('Server is healthy');
});

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        console.log('Upload failed: No file or invalid type');
        return res.status(400).send('No file uploaded or invalid file type.');
    }
    console.log(`Uploaded file: ${req.file.filename}`);
    res.status(200).send('File uploaded successfully.');
});

// List files endpoint
app.get('/files', (req, res) => {
    console.log('Listing files in:', uploadDir);
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            console.error(`Error reading uploads directory: ${err.message}`);
            return res.status(500).send('Error reading uploads directory: ' + err.message);
        }
        console.log('Files found:', files);
        const fileList = files.map(file => ({ name: file }));
        res.json(fileList);
    });
});

// Debug endpoint to check disk access
app.get('/debug', (req, res) => {
    fs.access(uploadDir, fs.constants.W_OK, (err) => {
        if (err) {
            console.error(`Debug: Cannot access uploads: ${err.message}`);
            return res.status(500).send('Cannot access uploads: ' + err.message);
        }
        res.send('Uploads directory is writable');
    });
});

// Start server with enhanced error handling
try {
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server started successfully on port ${port}`);
    }).on('error', (err) => {
        console.error(`Server failed to start: ${err.message}`);
        process.exit(1);
    });
} catch (err) {
    console.error(`Fatal error starting server: ${err.message}`);
    process.exit(1);
}