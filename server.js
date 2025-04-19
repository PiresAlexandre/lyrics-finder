const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Define uploads directory (Render uses /app/uploads for persistent disk)
const uploadDir = process.env.RENDER ? '/app/uploads' : path.join(__dirname, 'Uploads');

// Check and log disk access at startup
let diskAccessible = false;
console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    RENDER: process.env.RENDER,
    uploadDir
});
try {
    fs.accessSync(uploadDir, fs.constants.R_OK | fs.constants.W_OK);
    console.log(`Uploads directory accessible: ${uploadDir}`);
    diskAccessible = true;
} catch (err) {
    console.error(`Cannot access uploads directory: ${err.message}`);
    if (err.code === 'ENOENT' && !process.env.RENDER) {
        try {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log(`Created local uploads directory: ${uploadDir}`);
            diskAccessible = true;
        } catch (mkdirErr) {
            console.error(`Failed to create local uploads directory: ${mkdirErr.message}`);
        }
    }
}

// Configure multer for file storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!diskAccessible) {
            console.error('Upload blocked: Uploads directory not accessible');
            return cb(new Error('Uploads directory not accessible'));
        }
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
    if (!diskAccessible) {
        console.error('Cannot list files: Uploads directory not accessible');
        return res.status(500).json({ error: 'Uploads directory not accessible', details: 'Disk not mounted' });
    }
    try {
        fs.readdir(uploadDir, (err, files) => {
            if (err) {
                console.error(`Error reading uploads directory: ${err.message}`);
                return res.status(500).json({ error: 'Error reading uploads directory', details: err.message });
            }
            console.log('Files found:', files);
            const fileList = files.map(file => ({ name: file }));
            res.json(fileList);
        });
    } catch (err) {
        console.error(`Synchronous error in /files: ${err.message}`);
        res.status(500).json({ error: 'Error accessing uploads directory', details: err.message });
    }
});

// Debug endpoint to check disk access
app.get('/debug', (req, res) => {
    try {
        fs.accessSync(uploadDir, fs.constants.R_OK | fs.constants.W_OK);
        console.log('Debug: Uploads directory is writable');
        res.send('Uploads directory is writable');
    } catch (err) {
        console.error(`Debug: Cannot access uploads: ${err.message}`);
        res.status(500).send(`Cannot access uploads: ${err.message}`);
    }
});

// Start server with enhanced error handling
try {
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server started successfully on port ${port}`);
        if (!diskAccessible && process.env.RENDER) {
            console.error('WARNING: Server started but uploads directory is not accessible. File operations will fail.');
        }
    }).on('error', (err) => {
        console.error(`Server failed to start: ${err.message}`);
        process.exit(1);
    });
} catch (err) {
    console.error(`Fatal error starting server: ${err.message}`);
    process.exit(1);
}