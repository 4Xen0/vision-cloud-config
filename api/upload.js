import { google } from 'googleapis';
import { formidable } from 'formidable';
import fs from 'fs';

// These will be configured in Vercel as Environment Variables
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// This line is essential for Vercel to allow file uploads.
export const config = {
  api: {
    bodyParser: false,
  },
};

// A helper function to parse the form data
const parseForm = (req) => {
    return new Promise((resolve, reject) => {
        const form = formidable({});
        form.parse(req, (err, fields, files) => {
            if (err) return reject(err);
            resolve({ fields, files });
        });
    });
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const auth = new google.auth.JWT(
            GOOGLE_CLIENT_EMAIL,
            null,
            GOOGLE_PRIVATE_KEY,
            ['https://www.googleapis.com/auth/drive.file']
        );

        const drive = google.drive({ version: 'v3', auth });
        
        const { fields, files } = await parseForm(req);

        const file = files.file[0];
        const fileName = fields.fileName[0];

        if (!file || !fileName) {
            return res.status(400).json({ error: 'No file or filename provided.' });
        }

        const response = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: [GOOGLE_DRIVE_FOLDER_ID],
            },
            media: {
                mimeType: file.mimetype,
                body: fs.createReadStream(file.filepath),
            },
            fields: 'id', // Only request the ID field back
        });

        res.status(200).json({ success: true, fileId: response.data.id });

    } catch (error) {
        console.error('Upload to Drive failed:', error);
        res.status(500).json({ error: 'Server-side failure during upload.' });
    }
}
