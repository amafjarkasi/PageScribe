import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - Vite ?url import for pdf.js worker
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.target !== 'offscreen' || request.action !== 'offscreenParsePdf') {
    return false;
  }

  (async () => {
    try {
      const rawData = typeof request.pdfData === 'string' ? request.pdfData : '';
      const base64Data = rawData.includes(',') ? rawData.split(',')[1] : rawData;
      if (!base64Data) {
        sendResponse({ error: 'Invalid PDF data.' });
        return;
      }

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdfDocument = await loadingTask.promise;
      const metadataResult = await pdfDocument.getMetadata().catch(() => null);

      let fullText = '';
      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ');
        fullText += pageText + '\n\n';
      }

      sendResponse({
        text: fullText.trim(),
        numpages: pdfDocument.numPages,
        info: metadataResult?.info ?? null,
        metadata:
          (metadataResult?.metadata as { getAll?: () => Record<string, unknown> } | undefined)?.getAll?.() ??
          null,
      });
    } catch (error: unknown) {
      console.error('Offscreen PDF parse error:', error);
      const message = error instanceof Error ? error.message : String(error);
      sendResponse({ error: `Failed to parse PDF: ${message}` });
    }
  })();

  return true;
});
