import { google } from 'googleapis';
import Busboy from 'busboy';

// This config is essential for Vercel to allow file streams
export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // --- Google Auth Client Setup ---
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_OAUTH_CLIENT_ID,
            process.env.GOOGLE_OAUTH_CLIENT_SECRET,
            'urn:ietf:wg:oauth:2.0:oob'
        );
        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
        });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        // --- End Auth Setup ---


        // --- New Busboy File Processing ---
        const bb = Busboy({ headers: req.headers });
        let fileName = '';
        let fileStream = null;
        let mimeType = '';

        bb.on('file', (name, file, info) => {
            // We only care about the 'file' field from our form
            if (name === 'file') {
                fileStream = file;
                mimeType = info.mimeType;
            }
        });

        bb.on('field', (name, val) => {
            // Get the final filename from the 'fileName' field
            if (name === 'fileName') {
                fileName = val;
            }
        });
        
        bb.on('finish', async () => {
            if (!fileStream || !fileName) {
                return res.status(400).json({ error: 'Missing file or filename.' });
            }

            try {
                const response = await drive.files.create({
                    requestBody: {
                        name: fileName,
                        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
                    },
                    media: {
                        mimeType: mimeType,
                        body: fileStream,
                    },
                    fields: 'id',
                });
                
                res.status(200).json({ success: true, fileId: response.data.id });

            } catch (driveError) {
                console.error('Google Drive API Error:', driveError);
                res.status(500).json({ error: 'Failed to upload to Google Drive.' });
            }
        });
        
        req.pipe(bb);
        
    } catch (error) {
        console.error('Initial server error:', error);
        res.status(500).json({ error: 'Server encountered an unexpected error.' });
    }
}
