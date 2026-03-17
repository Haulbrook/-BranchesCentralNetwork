// Load pdf.js dynamically and expose it globally
import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.min.mjs')
  .then(function (mod) {
    window.pdfjsLib = mod;
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.worker.min.mjs';
  })
  .catch(function () {
    if (window.Logger) Logger.warn('PDF', 'pdf.js failed to load — PDF parsing will use fallback');
  });
