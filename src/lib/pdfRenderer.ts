import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

let workerConfigured = false;

const MAX_COMBINED_DIMENSION = 30000;
const MAX_COMBINED_PIXELS = 80_000_000;
const MIN_USABLE_SCALE = 0.6;

function configurePdfWorker() {
    if (!workerConfigured) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        workerConfigured = true;
    }
}

/**
 * Render every page of a PDF into one vertically stacked image for the
 * existing marking canvas. The original PDF remains untouched for AI grading.
 * Large PDFs are automatically rendered at a lower scale when necessary.
 */
export async function renderPdfToImage(dataUrl: string, scale = 1.5): Promise<string> {
    configurePdfWorker();

    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex < 0) throw new Error('Invalid PDF data URL.');

    let binary: string;
    try {
        binary = atob(dataUrl.slice(commaIndex + 1));
    } catch {
        throw new Error('The PDF data is invalid or corrupted.');
    }

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    let pdf;
    try {
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        pdf = await loadingTask.promise;
    } catch {
        throw new Error('The PDF could not be opened. It may be corrupted, encrypted, or unsupported.');
    }

    if (pdf.numPages < 1) throw new Error('The PDF contains no pages.');

    const pages: Array<{ page: any; width: number; height: number }> = [];
    let requestedHeight = 0;
    let requestedWidth = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        pages.push({ page, width, height });
        requestedHeight += height;
        requestedWidth = Math.max(requestedWidth, width);
    }

    const requestedPixels = pages.reduce((sum, page) => sum + page.width * page.height, 0);
    const dimensionScale = Math.min(1, MAX_COMBINED_DIMENSION / Math.max(requestedWidth, requestedHeight));
    const pixelScale = Math.sqrt(MAX_COMBINED_PIXELS / Math.max(1, requestedPixels));
    const safeFactor = Math.min(1, dimensionScale, pixelScale);
    const effectiveScale = scale * safeFactor;

    if (effectiveScale < MIN_USABLE_SCALE) {
        throw new Error(
            `This PDF is too large to display safely in the marking canvas (${pdf.numPages} pages). Please split it into smaller papers and upload them separately.`,
        );
    }

    const renderedPages: Array<{ canvas: HTMLCanvasElement; width: number; height: number }> = [];
    let totalHeight = 0;
    let maxWidth = 0;

    try {
        for (let index = 0; index < pages.length; index++) {
            const { page } = pages[index];
            const pageNumber = index + 1;
            const viewport = page.getViewport({ scale: effectiveScale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);

            const context = canvas.getContext('2d', { alpha: false });
            if (!context) throw new Error(`Could not create a canvas for PDF page ${pageNumber}.`);

            await page.render({ canvasContext: context, viewport }).promise;
            renderedPages.push({ canvas, width: canvas.width, height: canvas.height });
            totalHeight += canvas.height;
            maxWidth = Math.max(maxWidth, canvas.width);
        }

        if (maxWidth <= 0 || totalHeight <= 0 || maxWidth > MAX_COMBINED_DIMENSION || totalHeight > MAX_COMBINED_DIMENSION) {
            throw new Error('This PDF is too large to display safely in the marking canvas.');
        }

        const combined = document.createElement('canvas');
        combined.width = maxWidth;
        combined.height = totalHeight;
        const context = combined.getContext('2d', { alpha: false });
        if (!context) throw new Error('Could not create the combined PDF canvas.');

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, combined.width, combined.height);

        let y = 0;
        for (const page of renderedPages) {
            context.drawImage(page.canvas, 0, y);
            y += page.height;
            page.canvas.width = 1;
            page.canvas.height = 1;
        }

        return combined.toDataURL('image/jpeg', 0.92);
    } catch (error) {
        for (const page of renderedPages) {
            page.canvas.width = 1;
            page.canvas.height = 1;
        }
        if (error instanceof Error) throw error;
        throw new Error('The PDF could not be rendered safely.');
    }
}

export function isPdfDataUrl(value?: string | null): boolean {
    return typeof value === 'string' && /^data:application\/pdf(?:;|,)/i.test(value);
}
