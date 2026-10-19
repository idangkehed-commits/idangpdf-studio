'use strict';
let securityMode = 'protect';
let officeMode = 'word';
let securityBusy = false;
let officeBusy = false;
const scriptLoads = new Map();
function loadLocalScript(src) {
    if (!scriptLoads.has(src)) scriptLoads.set(src, new Promise((resolve, reject) => {
        const el = document.createElement('script'); el.src = src;
        el.onload = resolve; el.onerror = () => { scriptLoads.delete(src); el.remove(); reject(new Error('Pustaka tidak dapat dimuat. Muat ulang halaman dan coba lagi.')); };
        document.head.appendChild(el);
    }));
    return scriptLoads.get(src);
}
function setSecurityMode(mode) {
    if (securityBusy) return;
    securityMode = mode;
    for (const value of ['protect','unprotect']) document.getElementById('mode-'+value).classList.toggle('selected',value === mode);
    document.getElementById('password-confirm-field').hidden = mode !== 'protect';
    document.getElementById('password-label').textContent = mode === 'protect' ? 'Password baru (minimal 8 karakter)' : 'Password dokumen';
    document.getElementById('security-run').textContent = mode === 'protect' ? 'Lindungi & unduh PDF' : 'Buka proteksi & unduh PDF';
    document.getElementById('security-help').textContent = mode === 'protect' ? 'PDF dilindungi dengan enkripsi AES-256. Simpan password Anda; dokumen hanya bisa dibuka dengan password tersebut.' : 'Hapus proteksi menggunakan password dokumen yang Anda ketahui. Untuk PDF dengan pembatasan saja, password boleh dikosongkan. Alat ini tidak memulihkan password yang terlupa.';
    document.getElementById('security-status').textContent = '';
    document.getElementById('security-password').value = '';
    document.getElementById('security-confirm').value = '';
}
function setOfficeMode(mode) {
    if (officeBusy) return;
    officeMode = mode;
    for (const value of ['word','ppt']) document.getElementById('mode-'+value).classList.toggle('selected',value === mode);
    document.getElementById('office-run').textContent = mode === 'word' ? 'Konversi & unduh Word' : 'Konversi & unduh PowerPoint';
    document.getElementById('office-help').textContent = mode === 'word' ? 'Word mengekstrak teks yang bisa diedit. Tata letak, gambar, dan tabel tidak dipertahankan. PDF hasil scan perlu diproses di alat OCR terlebih dahulu.' : 'Setiap halaman menjadi satu slide berupa gambar. Tampilan dipertahankan, tetapi teks dan objek slide tidak dapat diedit secara terpisah. Ukuran slide mengikuti halaman pertama.';
    document.getElementById('office-status').textContent = '';
}
function outputName(file, suffix) { return file.name.replace(/\.pdf$/i,'') + suffix; }
async function checkPdfFile(input) {
    const file = document.getElementById(input).files[0];
    if (!file) throw new Error('Pilih dokumen PDF terlebih dahulu.');
    const header = new TextDecoder().decode(await file.slice(0,1024).arrayBuffer());
    if (!header.includes('%PDF-')) throw new Error('File yang dipilih bukan PDF yang valid.');
    return file;
}
async function runSecurity() {
    if (securityBusy) return;
    const status = document.getElementById('security-status');
    const button = document.getElementById('security-run');
    let worker;
    try {
        const file = await checkPdfFile('security-file');
        if (securityBusy) return;
        const password = document.getElementById('security-password').value;
        if (securityMode === 'protect') {
            if (password.length < 8) throw new Error('Gunakan password minimal 8 karakter.');
            if (new TextEncoder().encode(password).length > 127) throw new Error('Password maksimal 127 byte.');
            if (password !== document.getElementById('security-confirm').value) throw new Error('Konfirmasi password belum cocok.');
        }
        const mode = securityMode;
        securityBusy = true; button.disabled = true;
        status.textContent = 'Menyiapkan mesin keamanan…';
        const bytes = await file.arrayBuffer();
        worker = new Worker('security-worker.js');
        const result = await new Promise((resolve,reject) => {
            worker.onerror = () => reject(new Error('Mesin keamanan gagal dimuat. Jalankan aplikasi melalui server lokal.'));
            worker.onmessage = ({data}) => {
                if (data.status) status.textContent = data.status;
                else if (data.error) reject(new Error(data.error));
                else resolve(data.bytes);
            };
            worker.postMessage({bytes,password,mode},[bytes]);
        });
        downloadBlob(new Blob([result],{type:'application/pdf'}),outputName(file,mode === 'protect' ? '-protected.pdf' : '-unprotected.pdf'));
        status.textContent = 'Selesai. PDF hasil pemrosesan siap diunduh.';
    } catch(error) { status.textContent = error.message; }
    finally {
        worker?.terminate(); securityBusy = false; button.disabled = false;
        document.getElementById('security-password').value = '';
        document.getElementById('security-confirm').value = '';
    }
}
async function runOffice() {
    if (officeBusy) return;
    const status = document.getElementById('office-status');
    const button = document.getElementById('office-run');
    let pdf;
    try {
        const file = await checkPdfFile('office-file');
        if (officeBusy) return;
        officeBusy = true; button.disabled = true;
        const mode = officeMode;
        status.textContent = 'Membaca dokumen…';
        if (!window.pdfjsLib) throw new Error('Pembaca PDF belum dimuat. Periksa koneksi lalu muat ulang.');
        const task = pdfjsLib.getDocument({data:await file.arrayBuffer()});
        task.onPassword = () => task.destroy();
        try { pdf = await task.promise; } catch { throw new Error('PDF tidak dapat dibaca. Jika dilindungi password, gunakan Unprotect terlebih dahulu.'); }
        if (mode === 'word') {
            await loadLocalScript('assets/lib/docx.js');
            const sections = []; let count = 0; let emptyPages = 0;
            for (let n=1;n<=pdf.numPages;n++) {
                status.textContent = `Mengekstrak teks halaman ${n} dari ${pdf.numPages}…`;
                const page = await pdf.getPage(n); const text = await page.getTextContent();
                const lines = []; let line = ''; let previousY = null;
                for (const item of text.items) {
                    if (typeof item.str !== 'string') continue;
                    const y = item.transform[5];
                    if (previousY !== null && Math.abs(previousY-y)>3 && line.trim()) { lines.push(line.trim()); line=''; }
                    line += item.str + ' '; previousY=y;
                    if (item.hasEOL) { lines.push(line.trim()); line=''; previousY=null; }
                }
                if (line.trim()) lines.push(line.trim());
                const nonempty = lines.filter(Boolean); count += nonempty.join('').length;
                if (!nonempty.length) emptyPages++;
                sections.push({children:(nonempty.length ? nonempty : ['[Halaman tanpa teks yang dapat diekstrak — gunakan OCR]']).map(value => new docx.Paragraph({text:value,spacing:{after:120}}))});
                page.cleanup();
            }
            if (!count) throw new Error('PDF ini tidak memiliki teks yang dapat diekstrak. Gunakan alat OCR untuk PDF hasil scan.');
            downloadBlob(await docx.Packer.toBlob(new docx.Document({sections})),outputName(file,'.docx'));
            status.textContent = `Selesai. ${pdf.numPages} halaman diekspor ke Word.${emptyPages ? ' '+emptyPages+' halaman tanpa teks ditandai untuk OCR.' : ''}`;
        } else {
            await loadLocalScript('assets/lib/pptxgen.js');
            const ppt = new PptxGenJS();
            const first = (await pdf.getPage(1)).getViewport({scale:1});
            const width=10, height=10*first.height/first.width;
            ppt.defineLayout({name:'PDF',width,height}); ppt.layout='PDF'; ppt.author='IdangPDF Studio';
            for (let n=1;n<=pdf.numPages;n++) {
                status.textContent = `Menyiapkan slide ${n} dari ${pdf.numPages}…`;
                const page = await pdf.getPage(n); const original = page.getViewport({scale:1});
                const viewport = page.getViewport({scale:Math.min(2,2200/Math.max(original.width,original.height))});
                const canvas = document.createElement('canvas'); canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
                await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise;
                const ratio=Math.min(width/viewport.width,height/viewport.height);
                const w=viewport.width*ratio,h=viewport.height*ratio;
                ppt.addSlide().addImage({data:canvas.toDataURL('image/png'),x:(width-w)/2,y:(height-h)/2,w,h});
                canvas.width=0; canvas.height=0; page.cleanup();
            }
            status.textContent='Mengemas PowerPoint…';
            downloadBlob(await ppt.write({outputType:'blob'}),outputName(file,'.pptx'));
            status.textContent=`Selesai. ${pdf.numPages} slide siap diunduh.`;
        }
    } catch(error) { status.textContent = error.message; }
    finally { await pdf?.destroy(); officeBusy=false; button.disabled=false; }
}
document.addEventListener('DOMContentLoaded',() => {
    setSecurityMode('protect'); setOfficeMode('word');
    for (const name of ['security','office']) document.getElementById(name+'-file').addEventListener('change',event => {
        document.getElementById(name+'-filename').textContent = event.target.files[0]?.name || 'Klik untuk memilih file dari perangkat';
        document.getElementById(name+'-status').textContent = '';
    });
    document.getElementById('show-password').addEventListener('change',event => {
        for (const id of ['security-password','security-confirm']) document.getElementById(id).type = event.target.checked ? 'text' : 'password';
    });
    document.querySelectorAll('.bento-card[onclick]').forEach(card => {
        if (card.tagName === 'BUTTON') return;
        card.tabIndex=0;card.setAttribute('role','button');
        card.addEventListener('keydown',event => { if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();card.click();} });
    });
});

