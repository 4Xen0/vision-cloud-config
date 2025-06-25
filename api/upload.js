import { google } from 'googleapis';
import Busboy from 'busboy';
import fs from 'fs';

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
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_OAUTH_CLIENT_ID,
            process.env.GOOGLE_OAUTH_CLIENT_SECRET,
            'urn:ietf:wg:oauth:2.0:oob' 
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
        });
        
        // --- THE CRITICAL FIX ---
        // Force the client to get a new access token before making the request.
        // This prevents any errors with stale tokens.
        await oauth2Client.getAccessToken(); 
        
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        
        await new Promise((resolve, reject) => {
            const bb = Busboy({ headers: req.headers });
            let fileName = '';
            let fileStream = null;
            let mimeType = '';

            bb.on('file', (name, file, info) => {
                if (name === 'file') {
                    fileStream = file;
                    mimeType = info.mimeType;
                } else {
                    file.resume();
                }
            });

            bb.on('field', (name, val) => {
                if (name === 'fileName') {
                    fileName = val;
                }
            });
            
            bb.on('close', async () => {
                if (!fileStream || !fileName) {
                    return reject(new Error('Missing file or filename in form-data.'));
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
                    resolve();

                } catch (driveError) {
                    console.error('Google Drive API Error:', driveError);
                    reject(driveError);
                }
            });
            
            bb.on('error', (err) => {
                reject(err);
            });

            req.pipe(bb);
        });

    } catch (error) {
        console.error('Overall processing error:', error);
        if (!res.headersSent) {
             res.status(500).json({ error: 'Server failed to process the upload.' });
        }
    }
}
