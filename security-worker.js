'use strict';
importScripts('assets/lib/qpdf.js');
self.onmessage = async ({data}) => {
    let engine;
    try {
        engine = await Module({noInitialRun:true,locateFile:() => new URL('assets/lib/qpdf.wasm',self.location.href).href,print:()=>{},printErr:()=>{}});
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
        self.postMessage({error:'PDF tidak dapat diproses. Periksa password dan pastikan file PDF tidak rusak. Jika mesin gagal dimuat, muat ulang halaman.'});
    } finally {
        if (engine) for (const file of ['/input.pdf','/output.pdf']) { try {engine.FS.unlink(file);} catch {} }
        self.close();
    }
};

