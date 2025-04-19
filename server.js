const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Define uploads directory (Render uses /app/uploads for persistent disk)
const uploadDir = process.env.RENDER ? '/app/uploads' : path.join(__dirname, 'Uploads');

// Ensure uploads directory exists locally (not needed on Render)
if (!process.env.RENDER && !fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Use original filename, avoid overwriting by appending timestamp if needed
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);
        let filename = file.originalname;
        let counter = 1;
        while (fs.existsSync(path.join(uploadDir, filename))) {
            filename = `${baseName}-${counter}${ext}`;
            counter++;
        }
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
});

// Serve static files (index.html and uploads)
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded or invalid file type.');
    }
    res.status(200).send('File uploaded successfully.');
});

// List files endpoint
app.get('/files', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            return res.status(500).send('Error reading uploads directory.');
        }
        const fileList = files.map(file => ({ name: file }));
        res.json(fileList);
    });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});