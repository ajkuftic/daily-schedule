'use strict';

const axios = require('axios');

async function generatePDF(html, filename, apiKey) {
  if (!apiKey) {
    console.log('[pdf] No html2pdf API key — skipping PDF');
    return null;
  }

  try {
    const response = await axios.post('https://api.html2pdf.app/v1/generate', {
      html,
      apiKey,
      fileName:     filename,
      paperSize:    'Letter',
      marginTop:    36,
      marginBottom: 36,
      marginLeft:   58,
      marginRight:  58,
    }, {
      responseType: 'arraybuffer',
      timeout:      30000,
    });

    const buffer = Buffer.from(response.data);
    console.log(`[pdf] Generated: ${filename}.pdf (${buffer.length} bytes)`);
    return { buffer, filename: `${filename}.pdf` };
  } catch (err) {
    console.error('[pdf] Failed:', err.message);
    return null;
  }
}

module.exports = { generatePDF };
