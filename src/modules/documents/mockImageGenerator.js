/**
 * Generate sample document images for demonstration purposes.
 * Creates canvas-based images with fixture text rendered as a document mockup.
 */
import { fixtureText } from './fixtures.js';

/** Generate a simple document image from fixture text. */
export async function generateMockDocumentImage(documentType, scenario = 'clean') {
  const text = fixtureText(documentType, scenario);
  if (!text) {
    throw new Error(`No fixture for document type: ${documentType}`);
  }

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1100;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Document border
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

    // Render text
    ctx.fillStyle = '#000000';
    ctx.font = '14px monospace';
    ctx.lineWidth = 1;

    const lines = text.split('\n');
    const lineHeight = 22;
    const maxWidth = canvas.width - 60;
    let y = 60;

    lines.forEach((line) => {
      const words = line.split(' ');
      let currentLine = '';

      words.forEach((word) => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine) {
          ctx.fillText(currentLine, 40, y);
          currentLine = word;
          y += lineHeight;
        } else {
          currentLine = testLine;
        }
      });

      if (currentLine) {
        ctx.fillText(currentLine, 40, y);
        y += lineHeight;
      }
    });

    // Add a simple "MRZ" simulation at the bottom for documents that have it
    if (['passport', 'visa'].includes(documentType)) {
      y = canvas.height - 80;
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#1a1a1a';
      const mrzLine1 = 'P<DEMOLAND>DEMOPASSPORT<<DEMO' + 'X'.repeat(20);
      const mrzLine2 = '123456789ABC<<<<<<<<<2008110523612300';
      ctx.fillText(mrzLine1, 40, y);
      ctx.fillText(mrzLine2, 40, y + 25);
    }

    canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          dataUrl: reader.result,
          file: new File([blob], `${documentType}-${scenario}.png`, { type: 'image/png' }),
          name: `${documentType}-${scenario}.png`,
          source: 'mock',
        });
      };
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}
