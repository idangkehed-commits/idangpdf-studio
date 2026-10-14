# 📄 IdangPDF Studio & AI OCR — Versi Kustom

Aplikasi PDF Tools, Kompresi Dokumen, dan AI OCR modern yang menggabungkan kemudahan modular ala **iLovePDF** dan kedalaman fitur pengeditan/OCR ala **Wondershare PDFelement**, dengan keunggulan utama: **100% Client-Side Privacy (Data tidak diunggah ke internet/cloud luar)**.

---

## 🌟 Fitur Utama

1. **Kompres PDF (New Feature)**
   - Pilihan 3 level kompresi: **Ekstrem (~75-80%)**, **Rekomendasi (~40-60%)**, dan **Ringan (~20-30%)**.
   - Mengecilkan ukuran file dokumen secara instan tanpa mengorbankan keterbacaan teks.
   - Perhitungan rasio penghematan ukuran dan unduh langsung 1-klik.

2. **Studio Editor & Anotasi (WYSIWYG)**
   - Tambah Teks kustom (font size, pilihan warna).
   - Tanda Tangan & Paraf Digital (e-Signature Pad dengan kanvas sentuh/mouse).
   - Stempel Preset cepat: `APPROVED`, `LUNAS`, `CONFIDENTIAL`, `DRAFT`.
   - Sensor Dokumen permanen (*Redaction Box*) untuk menyembunyikan NIK, nomor rekening, atau data rahasia.
   - Rotasi halaman per lembar (90°, 180°, 270°).

3. **AI Optical Character Recognition (OCR Scanner)**
   - Menggunakan neural engine **Tesseract.js WASM** langsung di browser.
   - Pilihan bahasa: **Bahasa Indonesia (`ind`)**, **Bahasa Inggris (`eng`)**, atau bilingual.
   - Ekstraksi teks dari PDF scan, foto kuitansi, berkas KTP, atau gambar dokumen.
   - Pratinjau *Bounding Boxes* (kotak deteksi kata) interaktif.
   - Salin teks sekali klik atau unduh sebagai file `.txt` dan dokumen Word `.doc`.

4. **Alat Manajemen PDF (Ala iLovePDF)**
   - **Gabung PDF (Merge):** Susun banyak file PDF dan satukan menjadi satu dokumen dengan urutan kustom.
   - **Pisah PDF (Split):** Ekstrak halaman tertentu dengan klik visual atau format rentang (contoh: `1-3, 5`).
   - **PDF ke Gambar:** Konversi setiap halaman PDF menjadi format PNG/JPG tajam dan unduh langsung dalam file ZIP.
   - **Gambar ke PDF (Image to PDF):** Gabungkan banyak foto atau berkas JPG/PNG menjadi satu dokumen PDF A4 (Portrait/Landscape).
   - **Watermark & Penomoran Halaman:** Pasang cap diagonal transparan hak cipta dan penomoran otomatis ("Halaman X dari Y").

5. **Keamanan & Privasi Mutlak (100% In-Browser Engine)**
   - Semua manipulasi PDF dijalankan oleh **pdf-lib**, **PDF.js**, dan **Tesseract.js** di dalam memori browser pengguna.
   - Tidak ada dokumen yang disimpan di server, aman untuk data sensitif, tanpa batasan ukuran file dan biaya langganan.

---

## 🌐 Deploy Live 24 Jam di Render (Gratis)

Aplikasi ini sudah dilengkapi dengan konfigurasi `render.yaml` untuk berjalan sebagai **Static Site** di Render:
- ✅ **Online 24 Jam Non-Stop**
- ✅ **Tanpa Waktu Tidur (*No Sleep / No Cold Starts*)**
- ✅ **100% Gratis Selamanya**
- ✅ **CDN Global Berkecepatan Tinggi**

### Cara Deploy 1-Klik ke Render:
1. Klik file `buka_deploy_render.bat` atau buka link:
   👉 **[Deploy IdangPDF Studio ke Render](https://render.com/deploy?repo=https://github.com/idangkehed-commits/idangpdf-studio)**
2. Klik tombol **Apply** / **Create Web Service**.
3. Render akan otomatis mem-build dan memberikan domain live (contoh: `https://idangpdf-studio.onrender.com`).

---

## 🚀 Link Live Instan (GitHub Pages)

👉 **[https://idangkehed-commits.github.io/idangpdf-studio/](https://idangkehed-commits.github.io/idangpdf-studio/)**

---

## 💻 Menjalankan Secara Lokal di Komputer

1. Dobel klik file `jalankan_server.bat`
2. Dobel klik file `buka_website.bat` atau buka browser di `http://localhost:3300`
