'use strict';
importScripts('assets/lib/qpdf.js');
self.onmessage = async ({data}) => {
    let engine;
    let diagnostics = '';
    try {
        engine = await Module({noInitialRun:true,noFSInit:true,locateFile:() => new URL('assets/lib/qpdf.wasm',self.location.href).href});
        engine.FS.init(undefined,()=>{},byte=>{ if (byte !== null && diagnostics.length < 8192) diagnostics += String.fromCharCode(byte); });
        engine.FS.writeFile('/input.pdf',new Uint8Array(data.bytes));
        self.postMessage({status:'Memproses PDF secara lokal…'});
        const args = data.mode === 'protect'
            ? ['/input.pdf','--encrypt',data.password,data.password,'256','--','/output.pdf']
            : ['--password='+data.password,'--decrypt','/input.pdf','/output.pdf'];
        const code = engine.callMain(args);
        if (code !== 0 && code !== 3) throw new Error('PDF tidak dapat diproses. Periksa password dan pastikan file PDF tidak rusak.');
        const result = engine.FS.readFile('/output.pdf');
        self.postMessage({bytes:result.buffer},[result.buffer]);
    } catch {
        const needsPassword = /invalid password/i.test(diagnostics);
        self.postMessage({needsPassword:needsPassword && data.mode === 'unprotect',error:needsPassword && data.mode === 'unprotect' ? (data.password ? 'Password belum cocok. Masukkan password pembuka dokumen yang benar.' : 'PDF ini memakai password untuk membuka dokumen. Masukkan password tersebut untuk melanjutkan.') : 'PDF tidak dapat diproses. Pastikan file tidak rusak. Jika mesin gagal dimuat, muat ulang halaman.'});
    } finally {
        if (engine) for (const file of ['/input.pdf','/output.pdf']) { try {engine.FS.unlink(file);} catch {} }
        self.close();
    }
};

