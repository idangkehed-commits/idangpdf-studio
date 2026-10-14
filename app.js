/**
 * ========================================================
 * OmniPDF Studio & AI OCR - Core Application Logic
 * 100% In-Browser Execution • Zero Server Data Transfer
 * ========================================================
 */

// Configure PDF.js Worker
if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Global Application State
const state = {
    currentView: 'dashboard',
    activeTool: 'select',
    
    // Loaded PDF Document Data
    currentFile: null,
    currentFileName: 'dokumen.pdf',
    pdfDoc: null,
    rawPdfBytes: null,
    totalPages: 0,
    currentPageIndex: 1,
    pageRotations: {}, // pageNum -> rotation angle (0, 90, 180, 270)
    
    // Annotations Map: pageNum -> Array of { id, type, x, y, width, height, content, color, size, rotation }
    annotations: {},
    
    // Compression State
    selectedCompressLevel: 'recommended',
    compressedBlob: null,
    compressedFileName: '',
    
    // Merge Tool State
    mergeFiles: [], // Array of { file, name, pageCount, bytes }
    
    // Split Tool State
    splitSelectedPages: new Set(),
    
    // Image to PDF State
    imgToPdfFiles: [], // Array of { file, dataUrl, name }
    
    // Signature Pad State
    signatureColor: '#000000',
    signatureCanvas: null,
    signatureCtx: null,
    isDrawingSignature: false,
    
    // Active OCR State
    ocrWorker: null,
    ocrInProgress: false,
    activeOcrResult: ''
};

// ========================================================
// INITIALIZATION
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
    initLucide();
    initDropzones();
    initSignatureCanvas();
    initWatermarkLivePreview();
});

function initLucide() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

// ========================================================
// NAVIGATION & VIEW SWITCHER
// ========================================================
function switchView(viewName) {
    state.currentView = viewName;

    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

    // Show target section
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.classList.remove('hidden');
        if (viewName === 'editor') {
            target.classList.add('flex');
        }
    }

    // Update nav tab styles
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active-tab', 'bg-white', 'text-slate-900', 'shadow-xs');
        tab.classList.add('text-slate-600');
    });

    const activeNav = document.getElementById(`nav-${viewName}`);
    if (activeNav) {
        activeNav.classList.add('active-tab', 'bg-white', 'text-slate-900', 'shadow-xs');
        activeNav.classList.remove('text-slate-600');
    }

    // Prepare views if document is already loaded
    if (viewName === 'editor' && state.pdfDoc) {
        renderEditorPage(state.currentPageIndex);
    } else if (viewName === 'compress' && state.pdfDoc) {
        setupCompressView();
    } else if (viewName === 'split' && state.pdfDoc) {
        setupSplitViewGrid();
    }

    initLucide();
}

// ========================================================
// GLOBAL FILE UPLOADER & PDF LOADER
// ========================================================
function triggerGlobalFileUpload() {
    document.getElementById('global-pdf-input').click();
}

document.getElementById('global-pdf-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
        await loadPdfFile(file);
    } else if (file.type.startsWith('image/')) {
        handleDirectImageUpload(file);
    } else {
        showToast('Format file tidak didukung. Harap unggah PDF atau Gambar.', 'error');
    }
    e.target.value = '';
});

function initDropzones() {
    const dropzones = document.querySelectorAll('.dropzone-modern');
    dropzones.forEach(dz => {
        dz.addEventListener('dragover', (e) => {
            e.preventDefault();
            dz.classList.add('dragover');
        });
        dz.addEventListener('dragleave', () => {
            dz.classList.remove('dragover');
        });
        dz.addEventListener('drop', async (e) => {
            e.preventDefault();
            dz.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                const file = e.dataTransfer.files[0];
                if (file.type === 'application/pdf') {
                    await loadPdfFile(file);
                } else if (file.type.startsWith('image/')) {
                    handleDirectImageUpload(file);
                }
            }
        });
    });
}

async function loadPdfFile(file) {
    try {
        showToast('Memuat dokumen...', 'info');
        state.currentFile = file;
        state.currentFileName = file.name;

        const arrayBuffer = await file.arrayBuffer();
        state.rawPdfBytes = arrayBuffer;

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
        state.pdfDoc = await loadingTask.promise;
        state.totalPages = state.pdfDoc.numPages;
        state.currentPageIndex = 1;
        state.pageRotations = {};
        state.annotations = {};

        // Update Document Info
        document.getElementById('info-filename').innerText = file.name;
        document.getElementById('info-pages').innerText = `${state.totalPages} Halaman`;
        document.getElementById('info-filesize').innerText = formatFileSize(file.size);

        // Setup Compress and Split views
        setupCompressView();
        setupSplitViewGrid();

        // If currently on dashboard or compress, stay contextually, or switch to editor
        if (state.currentView === 'dashboard') {
            switchView('editor');
        } else if (state.currentView === 'compress') {
            setupCompressView();
        }

        // Render thumbnails and active page
        await renderAllThumbnails();
        await renderEditorPage(1);

        showToast(`Dokumen "${file.name}" berhasil dibuka!`, 'success');
    } catch (err) {
        console.error('Error loading PDF:', err);
        showToast('Gagal memuat dokumen PDF: ' + err.message, 'error');
    }
}

function handleDirectImageUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.getElementById('ocr-source-canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            switchView('ocr');
            document.getElementById('ocr-dropzone').classList.add('hidden');
            showToast('Foto dokumen siap di-OCR!', 'success');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ========================================================
// COMPRESS PDF ENGINE (FITUR BARU)
// ========================================================
function selectCompressLevel(level) {
    state.selectedCompressLevel = level;
    document.querySelectorAll('.compress-card').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`compress-lvl-${level}`);
    if (target) target.classList.add('active');
}

function setupCompressView() {
    if (!state.currentFile || !state.pdfDoc) return;
    document.getElementById('compress-dropzone').classList.add('hidden');
    document.getElementById('compress-active-panel').classList.remove('hidden');

    document.getElementById('compress-file-name').innerText = state.currentFileName;
    document.getElementById('compress-file-orig-size').innerText = formatFileSize(state.currentFile.size);
    document.getElementById('compress-file-pages').innerText = `${state.totalPages} Halaman`;

    // Reset results box
    document.getElementById('compress-result-box').classList.add('hidden');
    document.getElementById('compress-progress-box').classList.add('hidden');
}

async function startPdfCompression() {
    if (!state.pdfDoc || !state.rawPdfBytes) {
        showToast('Buka file PDF terlebih dahulu.', 'warning');
        return;
    }

    const progressBox = document.getElementById('compress-progress-box');
    const statusLabel = document.getElementById('compress-status-label');
    const percentLabel = document.getElementById('compress-percent-label');
    const progressBar = document.getElementById('compress-progress-bar');
    const resultBox = document.getElementById('compress-result-box');
    const runBtn = document.getElementById('btn-run-compress');

    progressBox.classList.remove('hidden');
    resultBox.classList.add('hidden');
    runBtn.disabled = true;
    runBtn.classList.add('opacity-50');

    // Configure compression parameters based on selected level
    let scale = 1.4;
    let quality = 0.65;
    if (state.selectedCompressLevel === 'extreme') {
        scale = 1.0;
        quality = 0.45;
    } else if (state.selectedCompressLevel === 'light') {
        scale = 1.8;
        quality = 0.82;
    }

    try {
        const compressedPdf = await PDFLib.PDFDocument.create();

        for (let i = 1; i <= state.totalPages; i++) {
            const pct = Math.round((i / state.totalPages) * 100);
            percentLabel.innerText = `${pct}%`;
            progressBar.style.width = `${pct}%`;
            statusLabel.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-violet-600"></i><span>Mengompres halaman ${i} dari ${state.totalPages}...</span>`;
            initLucide();

            const page = await state.pdfDoc.getPage(i);
            const rotation = (state.pageRotations[i] || 0) % 360;
            const viewport = page.getViewport({ scale: scale, rotation: rotation });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            await page.render({ canvasContext: ctx, viewport: viewport }).promise;

            // Compress to JPEG format with specified quality
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const embeddedImg = await compressedPdf.embedJpg(dataUrl);

            // Add page preserving unscaled aspect ratio
            const unscaledViewport = page.getViewport({ scale: 1.0, rotation: rotation });
            const newPage = compressedPdf.addPage([unscaledViewport.width, unscaledViewport.height]);

            newPage.drawImage(embeddedImg, {
                x: 0,
                y: 0,
                width: unscaledViewport.width,
                height: unscaledViewport.height
            });
        }

        const compressedBytes = await compressedPdf.save({ useObjectStreams: true });
        state.compressedBlob = new Blob([compressedBytes], { type: 'application/pdf' });
        state.compressedFileName = `compressed_${state.currentFileName}`;

        // Compute saved stats
        const origSize = state.currentFile.size;
        const newSize = state.compressedBlob.size;
        const savedBytes = Math.max(0, origSize - newSize);
        const savedPercent = Math.max(0, Math.round((savedBytes / origSize) * 100));

        progressBox.classList.add('hidden');
        resultBox.classList.remove('hidden');

        document.getElementById('res-orig-size').innerText = formatFileSize(origSize);
        document.getElementById('res-new-size').innerText = formatFileSize(newSize);
        document.getElementById('res-saved-percent').innerText = `${savedPercent}%`;

        showToast(`Kompresi berhasil! Ukuran terhemat ${savedPercent}%.`, 'success');
    } catch (err) {
        console.error('Compression error:', err);
        progressBox.classList.add('hidden');
        showToast('Gagal mengompres PDF: ' + err.message, 'error');
    } finally {
        runBtn.disabled = false;
        runBtn.classList.remove('opacity-50');
    }
}

function downloadCompressedPdf() {
    if (!state.compressedBlob) {
        showToast('Belum ada hasil kompresi.', 'warning');
        return;
    }
    downloadBlob(state.compressedBlob, state.compressedFileName);
    showToast('File PDF hasil kompresi berhasil diunduh!', 'success');
}

// ========================================================
// STUDIO EDITOR & ANNOTATION LOGIC
// ========================================================
async function renderEditorPage(pageNum) {
    if (!state.pdfDoc) return;
    state.currentPageIndex = pageNum;

    document.getElementById('editor-page-indicator').innerText = `${pageNum} / ${state.totalPages}`;

    const emptyState = document.getElementById('editor-empty-state');
    const viewport = document.getElementById('editor-viewport');
    emptyState.classList.add('hidden');
    viewport.classList.remove('hidden');

    const page = await state.pdfDoc.getPage(pageNum);
    const rotation = (state.pageRotations[pageNum] || 0) % 360;

    const scrollContainer = document.getElementById('editor-canvas-scroll');
    const maxWidth = Math.min(scrollContainer.clientWidth - 48, 850);
    const unscaledViewport = page.getViewport({ scale: 1.0, rotation });
    const scale = maxWidth / unscaledViewport.width;
    const scaledViewport = page.getViewport({ scale: Math.max(scale, 1.0), rotation });

    const canvas = document.getElementById('editor-canvas');
    const context = canvas.getContext('2d');

    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(scaledViewport.width * outputScale);
    canvas.height = Math.floor(scaledViewport.height * outputScale);
    canvas.style.width = Math.floor(scaledViewport.width) + 'px';
    canvas.style.height = Math.floor(scaledViewport.height) + 'px';

    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

    const renderContext = {
        canvasContext: context,
        transform: transform,
        viewport: scaledViewport
    };

    await page.render(renderContext).promise;

    const annotLayer = document.getElementById('editor-annotation-layer');
    annotLayer.style.width = canvas.style.width;
    annotLayer.style.height = canvas.style.height;

    renderPageAnnotations(pageNum);

    document.querySelectorAll('.thumbnail-item').forEach(el => {
        el.classList.toggle('ring-2', parseInt(el.dataset.page) === pageNum);
        el.classList.toggle('ring-indigo-600', parseInt(el.dataset.page) === pageNum);
    });
}

async function renderAllThumbnails() {
    const container = document.getElementById('editor-thumbnails-container');
    container.innerHTML = '';

    for (let i = 1; i <= state.totalPages; i++) {
        const page = await state.pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.18 });

        const item = document.createElement('div');
        item.className = `thumbnail-item p-1 border border-slate-200 rounded-lg text-center cursor-pointer bg-white transition hover:border-slate-400 ${i === state.currentPageIndex ? 'ring-2 ring-indigo-600' : ''}`;
        item.dataset.page = i;
        item.onclick = () => renderEditorPage(i);

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = viewport.width;
        thumbCanvas.height = viewport.height;
        thumbCanvas.className = 'w-full h-auto rounded';

        const ctx = thumbCanvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        const label = document.createElement('div');
        label.className = 'text-[10px] font-bold text-slate-500 mt-1';
        label.innerText = `Hal ${i}`;

        item.appendChild(thumbCanvas);
        item.appendChild(label);
        container.appendChild(item);
    }
}

function prevEditorPage() {
    if (state.currentPageIndex > 1) {
        renderEditorPage(state.currentPageIndex - 1);
    }
}

function nextEditorPage() {
    if (state.currentPageIndex < state.totalPages) {
        renderEditorPage(state.currentPageIndex + 1);
    }
}

function rotateCurrentEditorPage() {
    const pageNum = state.currentPageIndex;
    state.pageRotations[pageNum] = ((state.pageRotations[pageNum] || 0) + 90) % 360;
    renderEditorPage(pageNum);
    showToast(`Halaman ${pageNum} diputar 90°`, 'info');
}

// ========================================================
// ANNOTATION INTERACTIVE DRAG & DROP
// ========================================================
function renderPageAnnotations(pageNum) {
    const layer = document.getElementById('editor-annotation-layer');
    layer.innerHTML = '';

    const list = state.annotations[pageNum] || [];
    list.forEach(item => {
        const el = document.createElement('div');
        el.className = 'annotation-item';
        el.dataset.id = item.id;
        el.style.left = item.x + 'px';
        el.style.top = item.y + 'px';

        if (item.type === 'text') {
            el.innerHTML = `<span style="color: ${item.color}; font-size: ${item.size}px; font-weight: 600;">${escapeHtml(item.content)}</span>`;
        } else if (item.type === 'signature') {
            el.innerHTML = `<img src="${item.content}" style="width: ${item.width || 140}px; height: auto;" draggable="false">`;
        } else if (item.type === 'stamp') {
            el.innerHTML = `<span class="stamp-badge ${item.className}">${item.content}</span>`;
        } else if (item.type === 'redact') {
            el.innerHTML = `<div class="redact-box" style="width: ${item.width || 130}px; height: ${item.height || 36}px;"></div>`;
        }

        const delBtn = document.createElement('div');
        delBtn.className = 'annotation-delete-btn';
        delBtn.innerHTML = '✕';
        delBtn.title = 'Hapus item';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            removeAnnotation(pageNum, item.id);
        };
        el.appendChild(delBtn);

        makeDraggable(el, item, pageNum);
        layer.appendChild(el);
    });
}

function makeDraggable(element, item, pageNum) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;

    const onPointerDown = (e) => {
        if (e.target.classList.contains('annotation-delete-btn')) return;
        isDragging = true;
        element.classList.add('active');

        startX = e.clientX || (e.touches && e.touches[0].clientX);
        startY = e.clientY || (e.touches && e.touches[0].clientY);
        initialX = item.x;
        initialY = item.y;

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
        if (!isDragging) return;
        const currentX = e.clientX || (e.touches && e.touches[0].clientX);
        const currentY = e.clientY || (e.touches && e.touches[0].clientY);

        item.x = Math.max(0, initialX + (currentX - startX));
        item.y = Math.max(0, initialY + (currentY - startY));

        element.style.left = item.x + 'px';
        element.style.top = item.y + 'px';
    };

    const onPointerUp = () => {
        isDragging = false;
        element.classList.remove('active');
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
    };

    element.addEventListener('pointerdown', onPointerDown);
}

function addAnnotationToPage(pageNum, annotationData) {
    if (!state.annotations[pageNum]) {
        state.annotations[pageNum] = [];
    }
    const newItem = {
        id: 'annot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        x: 40,
        y: 60,
        ...annotationData
    };
    state.annotations[pageNum].push(newItem);
    renderPageAnnotations(pageNum);
}

function removeAnnotation(pageNum, id) {
    if (state.annotations[pageNum]) {
        state.annotations[pageNum] = state.annotations[pageNum].filter(item => item.id !== id);
        renderPageAnnotations(pageNum);
        showToast('Item dihapus', 'info');
    }
}

// Text Modal
function openAddTextModal() {
    if (!state.pdfDoc) return showToast('Buka dokumen PDF terlebih dahulu', 'warning');
    document.getElementById('modal-text').classList.remove('hidden');
    document.getElementById('modal-text-content').focus();
}

function closeAddTextModal() {
    document.getElementById('modal-text').classList.add('hidden');
}

function applyTextToDocument() {
    const text = document.getElementById('modal-text-content').value.trim();
    if (!text) return showToast('Teks tidak boleh kosong', 'warning');
    const size = parseInt(document.getElementById('modal-text-size').value) || 16;
    const color = document.getElementById('modal-text-color').value || '#000000';

    addAnnotationToPage(state.currentPageIndex, {
        type: 'text',
        content: text,
        size: size,
        color: color
    });

    closeAddTextModal();
    document.getElementById('modal-text-content').value = '';
    showToast('Teks berhasil ditempelkan!', 'success');
}

// Stamp Modal
function openStampModal() {
    if (!state.pdfDoc) return showToast('Buka dokumen PDF terlebih dahulu', 'warning');
    document.getElementById('modal-stamp').classList.remove('hidden');
}

function closeStampModal() {
    document.getElementById('modal-stamp').classList.add('hidden');
}

function applyStampPreset(presetName) {
    let content = 'APPROVED';
    let className = 'stamp-approved';

    if (presetName === 'lunas') {
        content = 'LUNAS';
        className = 'stamp-lunas';
    } else if (presetName === 'confidential') {
        content = 'CONFIDENTIAL';
        className = 'stamp-confidential';
    } else if (presetName === 'draft') {
        content = 'DRAFT';
        className = 'stamp-draft';
    }

    addAnnotationToPage(state.currentPageIndex, {
        type: 'stamp',
        content: content,
        className: className
    });

    closeStampModal();
    showToast(`Stempel "${content}" berhasil ditempelkan!`, 'success');
}

// Redact / Sensor Box
function addRedactBox() {
    if (!state.pdfDoc) return showToast('Buka dokumen PDF terlebih dahulu', 'warning');
    addAnnotationToPage(state.currentPageIndex, {
        type: 'redact',
        width: 140,
        height: 38
    });
    showToast('Kotak sensor (redact) ditambahkan. Geser ke area sensitif.', 'info');
}

// Signature Modal
function openSignatureModal() {
    if (!state.pdfDoc) return showToast('Buka dokumen PDF terlebih dahulu', 'warning');
    document.getElementById('modal-signature').classList.remove('hidden');
    clearSignatureCanvas();
}

function closeSignatureModal() {
    document.getElementById('modal-signature').classList.add('hidden');
}

function initSignatureCanvas() {
    const canvas = document.getElementById('signature-canvas');
    if (!canvas) return;
    state.signatureCanvas = canvas;
    state.signatureCtx = canvas.getContext('2d');

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    const startDraw = (e) => {
        e.preventDefault();
        state.isDrawingSignature = true;
        const pos = getPos(e);
        state.signatureCtx.beginPath();
        state.signatureCtx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
        if (!state.isDrawingSignature) return;
        e.preventDefault();
        const pos = getPos(e);
        state.signatureCtx.lineWidth = 2.5;
        state.signatureCtx.lineCap = 'round';
        state.signatureCtx.lineJoin = 'round';
        state.signatureCtx.strokeStyle = state.signatureColor;
        state.signatureCtx.lineTo(pos.x, pos.y);
        state.signatureCtx.stroke();
    };

    const stopDraw = () => {
        state.isDrawingSignature = false;
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDraw);
}

function setSignatureColor(color) {
    state.signatureColor = color;
}

function clearSignatureCanvas() {
    if (state.signatureCtx && state.signatureCanvas) {
        state.signatureCtx.clearRect(0, 0, state.signatureCanvas.width, state.signatureCanvas.height);
    }
}

function applySignatureToDocument() {
    const dataUrl = state.signatureCanvas.toDataURL('image/png');
    addAnnotationToPage(state.currentPageIndex, {
        type: 'signature',
        content: dataUrl,
        width: 140
    });
    closeSignatureModal();
    showToast('Tanda tangan berhasil ditempelkan!', 'success');
}

// ========================================================
// EXPORT EDITED PDF
// ========================================================
async function exportEditedPdf() {
    if (!state.rawPdfBytes) return showToast('Tidak ada dokumen untuk disimpan.', 'warning');

    try {
        showToast('Menyusun PDF dengan semua perubahan...', 'info');

        const pdfDoc = await PDFLib.PDFDocument.load(state.rawPdfBytes);
        const pages = pdfDoc.getPages();
        const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

        const canvas = document.getElementById('editor-canvas');
        const canvasWidth = parseFloat(canvas.style.width) || canvas.width;
        const canvasHeight = parseFloat(canvas.style.height) || canvas.height;

        for (let i = 0; i < pages.length; i++) {
            const pageNum = i + 1;
            const page = pages[i];
            const { width, height } = page.getSize();

            if (state.pageRotations[pageNum]) {
                const currentRotation = page.getRotation().angle || 0;
                page.setRotation(PDFLib.degrees((currentRotation + state.pageRotations[pageNum]) % 360));
            }

            const scaleX = width / canvasWidth;
            const scaleY = height / canvasHeight;

            const annots = state.annotations[pageNum] || [];
            for (const item of annots) {
                const pdfX = item.x * scaleX;
                const pdfY = height - (item.y * scaleY) - (item.size || 20);

                if (item.type === 'text') {
                    const rgb = hexToRgbNormalized(item.color || '#000000');
                    page.drawText(item.content, {
                        x: pdfX,
                        y: pdfY,
                        size: (item.size || 16) * scaleX,
                        font: font,
                        color: PDFLib.rgb(rgb.r, rgb.g, rgb.b)
                    });
                } else if (item.type === 'signature') {
                    const pngImage = await pdfDoc.embedPng(item.content);
                    const sigWidth = (item.width || 140) * scaleX;
                    const sigHeight = (sigWidth / pngImage.width) * pngImage.height;
                    page.drawImage(pngImage, {
                        x: pdfX,
                        y: height - (item.y * scaleY) - sigHeight,
                        width: sigWidth,
                        height: sigHeight
                    });
                } else if (item.type === 'stamp') {
                    let stampColor = PDFLib.rgb(0.05, 0.58, 0.41);
                    if (item.content === 'LUNAS') stampColor = PDFLib.rgb(0.14, 0.38, 0.92);
                    if (item.content === 'CONFIDENTIAL') stampColor = PDFLib.rgb(0.86, 0.15, 0.15);
                    if (item.content === 'DRAFT') stampColor = PDFLib.rgb(0.85, 0.46, 0.05);

                    page.drawText(`[ ${item.content} ]`, {
                        x: pdfX,
                        y: pdfY,
                        size: 20 * scaleX,
                        font: font,
                        color: stampColor
                    });
                } else if (item.type === 'redact') {
                    const boxW = (item.width || 140) * scaleX;
                    const boxH = (item.height || 38) * scaleY;
                    page.drawRectangle({
                        x: pdfX,
                        y: height - (item.y * scaleY) - boxH,
                        width: boxW,
                        height: boxH,
                        color: PDFLib.rgb(0, 0, 0)
                    });
                }
            }
        }

        const pdfBytes = await pdfDoc.save();
        downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `edited_${state.currentFileName}`);
        showToast('PDF berhasil diunduh dengan semua anotasi!', 'success');
    } catch (err) {
        console.error('Export PDF error:', err);
        showToast('Gagal menyimpan PDF: ' + err.message, 'error');
    }
}

// ========================================================
// AI OCR SCANNER (TESSERACT.JS WASM)
// ========================================================
async function runOcrCurrentPage() {
    if (!state.pdfDoc) return showToast('Buka dokumen terlebih dahulu', 'warning');

    const canvas = document.getElementById('editor-canvas');
    const lang = document.getElementById('ocr-lang-select').value || 'ind';

    const progressBox = document.getElementById('editor-ocr-progress-box');
    const statusText = document.getElementById('editor-ocr-status-text');
    const percentText = document.getElementById('editor-ocr-percent-text');
    const progressBar = document.getElementById('editor-ocr-progress-bar');
    const badge = document.getElementById('ocr-status-badge');

    progressBox.classList.remove('hidden');
    badge.innerText = 'Memindai...';
    badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold animate-pulse';

    try {
        const worker = await Tesseract.createWorker(lang, 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round((m.progress || 0) * 100);
                    percentText.innerText = `${pct}%`;
                    progressBar.style.width = `${pct}%`;
                    statusText.innerText = `Membaca karakter (${pct}%)...`;
                } else {
                    statusText.innerText = m.status;
                }
            }
        });

        const { data: { text } } = await worker.recognize(canvas);
        await worker.terminate();

        progressBox.classList.add('hidden');
        badge.innerText = 'Selesai';
        badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold';

        document.getElementById('editor-ocr-text-result').value = text;
        state.activeOcrResult = text;
        showToast(`OCR Halaman ${state.currentPageIndex} selesai!`, 'success');
    } catch (err) {
        console.error('OCR Error:', err);
        progressBox.classList.add('hidden');
        badge.innerText = 'Gagal';
        badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold';
        showToast('Gagal menjalankan OCR: ' + err.message, 'error');
    }
}

async function startBatchOcr() {
    const canvas = document.getElementById('editor-canvas');
    const sourceCanvas = document.getElementById('ocr-source-canvas');

    let targetCanvas = sourceCanvas.width > 0 ? sourceCanvas : canvas;
    if (!targetCanvas || targetCanvas.width === 0) {
        return showToast('Buka dokumen atau foto yang ingin di-OCR terlebih dahulu.', 'warning');
    }

    const lang = document.getElementById('ocr-lang-select').value || 'ind';
    const progressContainer = document.getElementById('ocr-full-progress-container');
    const statusLabel = document.getElementById('ocr-full-status-label');
    const percentLabel = document.getElementById('ocr-full-percentage');
    const progressBar = document.getElementById('ocr-full-progress-bar');
    const countLabel = document.getElementById('ocr-detected-count');
    const overlay = document.getElementById('ocr-boxes-overlay');

    progressContainer.classList.remove('hidden');
    overlay.innerHTML = '';

    try {
        const worker = await Tesseract.createWorker(lang, 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round((m.progress || 0) * 100);
                    percentLabel.innerText = `${pct}%`;
                    progressBar.style.width = `${pct}%`;
                    statusLabel.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-emerald-600"></i><span>Mengekstrak karakter (${pct}%)...</span>`;
                    initLucide();
                } else {
                    statusLabel.innerHTML = `<span>${m.status}...</span>`;
                }
            }
        });

        const result = await worker.recognize(targetCanvas);
        await worker.terminate();

        progressContainer.classList.add('hidden');
        const fullText = result.data.text;
        document.getElementById('ocr-full-text-result').value = fullText;
        state.activeOcrResult = fullText;

        const words = result.data.words || [];
        countLabel.innerText = `${words.length} Kata Terdeteksi`;

        const scaleX = targetCanvas.clientWidth / targetCanvas.width;
        const scaleY = targetCanvas.clientHeight / targetCanvas.height;

        words.forEach(word => {
            const box = document.createElement('div');
            box.className = 'ocr-box';
            box.style.left = (word.bbox.x0 * scaleX) + 'px';
            box.style.top = (word.bbox.y0 * scaleY) + 'px';
            box.style.width = ((word.bbox.x1 - word.bbox.x0) * scaleX) + 'px';
            box.style.height = ((word.bbox.y1 - word.bbox.y0) * scaleY) + 'px';
            box.title = `${word.text} (${Math.round(word.confidence)}%)`;
            overlay.appendChild(box);
        });

        showToast('Ekstraksi OCR berhasil dengan akurasi tinggi!', 'success');
    } catch (err) {
        console.error('Batch OCR error:', err);
        progressContainer.classList.add('hidden');
        showToast('Gagal menjalankan OCR: ' + err.message, 'error');
    }
}

function copyEditorOcrText() {
    const text = document.getElementById('editor-ocr-text-result').value;
    if (!text) return showToast('Belum ada teks OCR.', 'warning');
    navigator.clipboard.writeText(text);
    showToast('Teks berhasil disalin!', 'success');
}

function downloadEditorOcrTxt() {
    const text = document.getElementById('editor-ocr-text-result').value;
    if (!text) return showToast('Belum ada teks OCR.', 'warning');
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'hasil_ocr.txt');
}

function copyFullOcrText() {
    const text = document.getElementById('ocr-full-text-result').value;
    if (!text) return showToast('Belum ada teks OCR.', 'warning');
    navigator.clipboard.writeText(text);
    showToast('Teks berhasil disalin!', 'success');
}

function downloadOcrDocx() {
    const text = document.getElementById('ocr-full-text-result').value;
    if (!text) return showToast('Belum ada teks OCR.', 'warning');
    
    const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>Hasil Ekstraksi OCR</title></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; padding: 20px;">
            <h2>Hasil Ekstraksi Dokumen OCR - OmniPDF Studio</h2>
            <hr/>
            <p style="white-space: pre-wrap;">${escapeHtml(text)}</p>
        </body>
        </html>
    `;
    downloadBlob(new Blob(['\ufeff' + htmlContent], { type: 'application/msword' }), 'dokumen_ocr.doc');
    showToast('Dokumen Word (.doc) berhasil diunduh!', 'success');
}

// ========================================================
// MERGE PDF TOOLS
// ========================================================
async function handleMergeFilesSelected(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
        if (file.type === 'application/pdf') {
            const bytes = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
            state.mergeFiles.push({
                file,
                name: file.name,
                pageCount: pdf.numPages,
                bytes
            });
        }
    }
    renderMergeFilesList();
    e.target.value = '';
}

function renderMergeFilesList() {
    const section = document.getElementById('merge-files-list-section');
    const container = document.getElementById('merge-files-container');
    container.innerHTML = '';

    if (state.mergeFiles.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    state.mergeFiles.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl';
        row.innerHTML = `
            <div class="flex items-center space-x-3">
                <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">${index + 1}</span>
                <div>
                    <h5 class="text-xs font-bold text-slate-800">${escapeHtml(item.name)}</h5>
                    <p class="text-[11px] text-slate-500">${item.pageCount} Halaman • ${formatFileSize(item.file.size)}</p>
                </div>
            </div>
            <div class="flex items-center space-x-1">
                <button onclick="moveMergeFile(${index}, -1)" ${index === 0 ? 'disabled class="opacity-30 p-1"' : 'class="p-1 text-slate-600 hover:bg-slate-200 rounded"'} title="Pindah ke Atas">
                    <i data-lucide="chevron-up" class="w-4 h-4"></i>
                </button>
                <button onclick="moveMergeFile(${index}, 1)" ${index === state.mergeFiles.length - 1 ? 'disabled class="opacity-30 p-1"' : 'class="p-1 text-slate-600 hover:bg-slate-200 rounded"'} title="Pindah ke Bawah">
                    <i data-lucide="chevron-down" class="w-4 h-4"></i>
                </button>
                <button onclick="removeMergeFile(${index})" class="p-1 text-rose-500 hover:bg-rose-50 rounded ml-2" title="Hapus File Ini">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        container.appendChild(row);
    });
    initLucide();
}

function moveMergeFile(index, dir) {
    const target = index + dir;
    if (target >= 0 && target < state.mergeFiles.length) {
        const temp = state.mergeFiles[index];
        state.mergeFiles[index] = state.mergeFiles[target];
        state.mergeFiles[target] = temp;
        renderMergeFilesList();
    }
}

function removeMergeFile(index) {
    state.mergeFiles.splice(index, 1);
    renderMergeFilesList();
}

function clearMergeList() {
    state.mergeFiles = [];
    renderMergeFilesList();
}

async function executePdfMerge() {
    if (state.mergeFiles.length < 2) return showToast('Pilih minimal 2 file PDF untuk digabungkan.', 'warning');

    try {
        showToast('Menggabungkan seluruh dokumen PDF...', 'info');
        const mergedDoc = await PDFLib.PDFDocument.create();

        for (const item of state.mergeFiles) {
            const doc = await PDFLib.PDFDocument.load(item.bytes);
            const copiedPages = await mergedDoc.copyPages(doc, doc.getPageIndices());
            copiedPages.forEach(p => mergedDoc.addPage(p));
        }

        const mergedBytes = await mergedDoc.save();
        downloadBlob(new Blob([mergedBytes], { type: 'application/pdf' }), 'merged_document.pdf');
        showToast('PDF berhasil digabungkan!', 'success');
    } catch (err) {
        console.error('Merge error:', err);
        showToast('Gagal menggabungkan PDF: ' + err.message, 'error');
    }
}

// ========================================================
// SPLIT PDF TOOLS
// ========================================================
async function setupSplitViewGrid() {
    if (!state.pdfDoc) return;
    document.getElementById('split-dropzone').classList.add('hidden');
    document.getElementById('split-active-section').classList.remove('hidden');

    const grid = document.getElementById('split-thumbnails-grid');
    grid.innerHTML = '';
    state.splitSelectedPages.clear();

    for (let i = 1; i <= state.totalPages; i++) {
        state.splitSelectedPages.add(i);

        const page = await state.pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.18 });

        const card = document.createElement('div');
        card.className = 'border-2 border-amber-500 bg-amber-50/20 p-2 rounded-xl text-center cursor-pointer transition relative group';
        card.id = `split-card-${i}`;
        card.onclick = () => toggleSplitPage(i);

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'w-full h-auto rounded shadow-xs mb-1.5';
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = true;
        check.className = 'absolute top-2 right-2 rounded text-amber-600 w-4 h-4 pointer-events-none';
        check.id = `split-chk-${i}`;

        const lbl = document.createElement('div');
        lbl.className = 'text-[11px] font-bold text-slate-700';
        lbl.innerText = `Hal ${i}`;

        card.appendChild(check);
        card.appendChild(canvas);
        card.appendChild(lbl);
        grid.appendChild(card);
    }
}

function toggleSplitPage(pageNum) {
    const chk = document.getElementById(`split-chk-${pageNum}`);
    const card = document.getElementById(`split-card-${pageNum}`);
    if (state.splitSelectedPages.has(pageNum)) {
        state.splitSelectedPages.delete(pageNum);
        chk.checked = false;
        card.className = 'border-2 border-slate-200 bg-white p-2 rounded-xl text-center cursor-pointer transition relative group opacity-60';
    } else {
        state.splitSelectedPages.add(pageNum);
        chk.checked = true;
        card.className = 'border-2 border-amber-500 bg-amber-50/20 p-2 rounded-xl text-center cursor-pointer transition relative group';
    }
}

function selectAllSplitPages(select) {
    for (let i = 1; i <= state.totalPages; i++) {
        const chk = document.getElementById(`split-chk-${i}`);
        const card = document.getElementById(`split-card-${i}`);
        if (select) {
            state.splitSelectedPages.add(i);
            if (chk) chk.checked = true;
            if (card) card.className = 'border-2 border-amber-500 bg-amber-50/20 p-2 rounded-xl text-center cursor-pointer transition relative group';
        } else {
            state.splitSelectedPages.delete(i);
            if (chk) chk.checked = false;
            if (card) card.className = 'border-2 border-slate-200 bg-white p-2 rounded-xl text-center cursor-pointer transition relative group opacity-60';
        }
    }
}

function applySplitRange() {
    const raw = document.getElementById('split-range-input').value.trim();
    if (!raw) return;

    selectAllSplitPages(false);
    const parts = raw.split(',');
    parts.forEach(p => {
        p = p.trim();
        if (p.includes('-')) {
            const [start, end] = p.split('-').map(x => parseInt(x.trim()));
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = Math.max(1, start); i <= Math.min(state.totalPages, end); i++) {
                    state.splitSelectedPages.add(i);
                    const chk = document.getElementById(`split-chk-${i}`);
                    const card = document.getElementById(`split-card-${i}`);
                    if (chk) chk.checked = true;
                    if (card) card.className = 'border-2 border-amber-500 bg-amber-50/20 p-2 rounded-xl text-center cursor-pointer transition relative group';
                }
            }
        } else {
            const page = parseInt(p);
            if (!isNaN(page) && page >= 1 && page <= state.totalPages) {
                state.splitSelectedPages.add(page);
                const chk = document.getElementById(`split-chk-${page}`);
                const card = document.getElementById(`split-card-${page}`);
                if (chk) chk.checked = true;
                if (card) card.className = 'border-2 border-amber-500 bg-amber-50/20 p-2 rounded-xl text-center cursor-pointer transition relative group';
            }
        }
    });
    showToast(`Rentang diterapkan: ${state.splitSelectedPages.size} halaman terpilih`, 'info');
}

async function executePdfSplit() {
    if (state.splitSelectedPages.size === 0) return showToast('Pilih minimal 1 halaman untuk diekstrak.', 'warning');

    try {
        showToast('Mengekstrak halaman terpilih...', 'info');
        const srcDoc = await PDFLib.PDFDocument.load(state.rawPdfBytes);
        const newDoc = await PDFLib.PDFDocument.create();

        const sortedIndices = Array.from(state.splitSelectedPages).sort((a, b) => a - b).map(p => p - 1);
        const copiedPages = await newDoc.copyPages(srcDoc, sortedIndices);
        copiedPages.forEach(p => newDoc.addPage(p));

        const splitBytes = await newDoc.save();
        downloadBlob(new Blob([splitBytes], { type: 'application/pdf' }), `extracted_${state.currentFileName}`);
        showToast('Halaman berhasil diekstrak dan diunduh!', 'success');
    } catch (err) {
        console.error('Split error:', err);
        showToast('Gagal memisahkan PDF: ' + err.message, 'error');
    }
}

// ========================================================
// CONVERT TOOLS (PDF <-> IMAGE)
// ========================================================
function setConvertTab(tab) {
    const isPdfToImg = tab === 'pdf-to-img';
    document.getElementById('convert-panel-pdf-to-img').classList.toggle('hidden', !isPdfToImg);
    document.getElementById('convert-panel-img-to-pdf').classList.toggle('hidden', isPdfToImg);

    const btn1 = document.getElementById('subtab-pdf-to-img');
    const btn2 = document.getElementById('subtab-img-to-pdf');

    if (isPdfToImg) {
        btn1.className = 'pb-3 border-b-2 border-indigo-600 text-indigo-600 flex items-center space-x-2';
        btn2.className = 'pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center space-x-2';
    } else {
        btn2.className = 'pb-3 border-b-2 border-indigo-600 text-indigo-600 flex items-center space-x-2';
        btn1.className = 'pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center space-x-2';
    }
}

async function executePdfToImages() {
    if (!state.pdfDoc) return showToast('Buka file PDF terlebih dahulu.', 'warning');

    try {
        showToast('Mengonversi halaman PDF menjadi gambar...', 'info');
        const zip = new JSZip();
        const mimeType = document.getElementById('convert-img-format').value;
        const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';

        for (let i = 1; i <= state.totalPages; i++) {
            const page = await state.pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            await page.render({ canvasContext: ctx, viewport }).promise;

            const dataUrl = canvas.toDataURL(mimeType, 0.92);
            const base64Data = dataUrl.split(',')[1];
            zip.file(`halaman_${i}.${ext}`, base64Data, { base64: true });
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, `gambar_pdf_${state.totalPages}_halaman.zip`);
        showToast('Semua gambar berhasil di-download dalam format ZIP!', 'success');
    } catch (err) {
        console.error('PDF to Image error:', err);
        showToast('Gagal konversi ke gambar: ' + err.message, 'error');
    }
}

function handleImagesSelected(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            state.imgToPdfFiles.push({
                file,
                name: file.name,
                dataUrl: event.target.result
            });
            renderImagesToPdfThumbnails();
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

function renderImagesToPdfThumbnails() {
    const box = document.getElementById('img-to-pdf-preview-box');
    const container = document.getElementById('img-thumbnails-container');
    container.innerHTML = '';

    if (state.imgToPdfFiles.length === 0) {
        box.classList.add('hidden');
        return;
    }

    box.classList.remove('hidden');
    state.imgToPdfFiles.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'border border-slate-200 rounded-lg p-2 bg-slate-50 text-center relative group';
        card.innerHTML = `
            <img src="${item.dataUrl}" class="w-full h-28 object-cover rounded mb-1">
            <div class="text-[10px] font-bold text-slate-700 truncate">${escapeHtml(item.name)}</div>
            <button onclick="removeImgToPdfFile(${index})" class="absolute top-1 right-1 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] shadow" title="Hapus">✕</button>
        `;
        container.appendChild(card);
    });
}

function removeImgToPdfFile(index) {
    state.imgToPdfFiles.splice(index, 1);
    renderImagesToPdfThumbnails();
}

async function executeImagesToPdf() {
    if (state.imgToPdfFiles.length === 0) return showToast('Pilih minimal 1 gambar.', 'warning');

    try {
        showToast('Menyusun PDF dari foto...', 'info');
        const pdfDoc = await PDFLib.PDFDocument.create();
        const orientation = document.getElementById('img-pdf-orientation').value;

        const pageWidth = orientation === 'landscape' ? 841.89 : 595.28;
        const pageHeight = orientation === 'landscape' ? 595.28 : 841.89;

        for (const item of state.imgToPdfFiles) {
            let embeddedImage;
            if (item.file.type === 'image/png') {
                embeddedImage = await pdfDoc.embedPng(item.dataUrl);
            } else {
                embeddedImage = await pdfDoc.embedJpg(item.dataUrl);
            }

            const page = pdfDoc.addPage([pageWidth, pageHeight]);

            const margin = 36;
            const maxW = pageWidth - (margin * 2);
            const maxH = pageHeight - (margin * 2);

            const scale = Math.min(maxW / embeddedImage.width, maxH / embeddedImage.height);
            const imgW = embeddedImage.width * scale;
            const imgH = embeddedImage.height * scale;

            const x = (pageWidth - imgW) / 2;
            const y = (pageHeight - imgH) / 2;

            page.drawImage(embeddedImage, {
                x,
                y,
                width: imgW,
                height: imgH
            });
        }

        const pdfBytes = await pdfDoc.save();
        downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'dokumen_dari_foto.pdf');
        showToast('PDF berhasil dibuat dari gambar!', 'success');
    } catch (err) {
        console.error('Image to PDF error:', err);
        showToast('Gagal membuat PDF: ' + err.message, 'error');
    }
}

// ========================================================
// WATERMARK & PAGE NUMBERING
// ========================================================
function initWatermarkLivePreview() {
    const textInput = document.getElementById('wm-text');
    const colorInput = document.getElementById('wm-color');
    const opacityInput = document.getElementById('wm-opacity');
    const angleSelect = document.getElementById('wm-angle');
    const mockText = document.getElementById('wm-mock-text');

    const updatePreview = () => {
        if (!mockText) return;
        mockText.innerText = textInput.value || 'WATERMARK';
        mockText.style.color = colorInput.value;
        mockText.style.opacity = (parseFloat(opacityInput.value) || 25) / 100;
        mockText.style.transform = `rotate(${angleSelect.value}deg)`;
    };

    [textInput, colorInput, opacityInput, angleSelect].forEach(el => {
        if (el) el.addEventListener('input', updatePreview);
    });
}

async function executeApplyWatermark() {
    if (!state.rawPdfBytes) return showToast('Buka file PDF terlebih dahulu.', 'warning');

    try {
        showToast('Menerapkan watermark ke seluruh halaman...', 'info');
        const pdfDoc = await PDFLib.PDFDocument.load(state.rawPdfBytes);
        const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
        const pages = pdfDoc.getPages();

        const wmText = document.getElementById('wm-text').value || 'CONFIDENTIAL';
        const wmSize = parseInt(document.getElementById('wm-size').value) || 48;
        const opacity = (parseInt(document.getElementById('wm-opacity').value) || 25) / 100;
        const angle = parseInt(document.getElementById('wm-angle').value) || 45;
        const hexColor = document.getElementById('wm-color').value || '#dc2626';
        const rgb = hexToRgbNormalized(hexColor);
        const includePageNum = document.getElementById('wm-include-page-num').checked;

        pages.forEach((page, idx) => {
            const { width, height } = page.getSize();

            const textWidth = font.widthOfTextAtSize(wmText, wmSize);
            page.drawText(wmText, {
                x: (width - textWidth) / 2,
                y: height / 2,
                size: wmSize,
                font: font,
                color: PDFLib.rgb(rgb.r, rgb.g, rgb.b),
                opacity: opacity,
                rotate: PDFLib.degrees(angle)
            });

            if (includePageNum) {
                const pageNumText = `Halaman ${idx + 1} dari ${pages.length}`;
                const numWidth = font.widthOfTextAtSize(pageNumText, 10);
                page.drawText(pageNumText, {
                    x: (width - numWidth) / 2,
                    y: 20,
                    size: 10,
                    font: font,
                    color: PDFLib.rgb(0.4, 0.4, 0.4)
                });
            }
        });

        const pdfBytes = await pdfDoc.save();
        downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `watermarked_${state.currentFileName}`);
        showToast('Watermark berhasil diterapkan ke seluruh halaman!', 'success');
    } catch (err) {
        console.error('Watermark error:', err);
        showToast('Gagal menambahkan watermark: ' + err.message, 'error');
    }
}

// ========================================================
// UTILITIES
// ========================================================
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function hexToRgbNormalized(hex) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return {
        r: ((num >> 16) & 255) / 255,
        g: ((num >> 8) & 255) / 255,
        b: (num & 255) / 255
    };
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-msg glass-panel px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold flex items-center space-x-2.5';

    let icon = 'info';
    let iconClass = 'text-blue-600';
    let borderColor = 'border-blue-200';

    if (type === 'success') {
        icon = 'check-circle-2';
        iconClass = 'text-emerald-600';
        borderColor = 'border-emerald-200';
    } else if (type === 'warning') {
        icon = 'alert-triangle';
        iconClass = 'text-amber-600';
        borderColor = 'border-amber-200';
    } else if (type === 'error') {
        icon = 'x-circle';
        iconClass = 'text-rose-600';
        borderColor = 'border-rose-200';
    }

    toast.classList.add(borderColor);
    toast.innerHTML = `
        <i data-lucide="${icon}" class="w-4 h-4 ${iconClass}"></i>
        <span class="text-slate-900">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    initLucide();

    setTimeout(() => {
        toast.style.transition = 'all 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3800);
}
