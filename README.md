# SeRT - Pondok Sepang Indah

Aplikasi warga dengan 3 peran pengguna: **Super admin** (bendahara pusat, mengelola semua RT), **Admin RT** (mengelola satu RT), dan **Warga** (menu layanan sehari-hari). Dibuat statis (HTML, CSS, JS) dan memakai Firebase (Auth, Firestore, Storage), sehingga bisa langsung di-deploy lewat GitHub Pages tanpa proses build.

## Struktur file

```
index.html      seluruh tampilan (ditampilkan/disembunyikan lewat JS)
style.css       tampilan
script.js       logika navigasi + koneksi Firebase
manifest.json   konfigurasi PWA (bisa di-install seperti aplikasi)
sw.js           service worker untuk mode offline
icons/          ikon aplikasi
tailwind.config.js  referensi jika suatu saat pindah ke Tailwind versi build (saat ini pakai CDN)
```

## 1. Buat project Firebase

1. Buka https://console.firebase.google.com dan buat project baru.
2. Di menu **Build > Authentication**, aktifkan sign-in method **Email/Password**.
3. Di menu **Build > Firestore Database**, klik **Create database**, pilih mode production.
4. Aktifkan **Build > Storage** juga (untuk foto banner Informasi) — lihat bagian 2c.
5. Buka **Project settings > General > Your apps**, salin `firebaseConfig`, tempel ke bagian atas `script.js` (config saat ini sudah diisi sesuai project Anda, `sert-pondoksepangindah2`).

## 2. Peran pengguna & cara menetapkannya

Setiap akun (siapa pun yang mendaftar) tersimpan sebagai satu dokumen di koleksi `warga`, dibedakan lewat field `role`:

| Role | Arti |
|---|---|
| `warga` | Warga biasa — ini nilai default saat seseorang mendaftar sendiri lewat halaman Daftar |
| `admin_rt` | Admin/Ketua satu RT tertentu — hanya mengelola data RT-nya sendiri (field `rt` di dokumennya menentukan RT mana) |
| `super_admin` | Bendahara pusat — mengelola tagihan, broadcast informasi, dan melihat data semua RT |

**Cara menaikkan sebuah akun jadi `admin_rt` atau `super_admin`:**

1. Suruh orang tersebut mendaftar dulu lewat aplikasi (menu Daftar) seperti warga biasa — otomatis dapat `role: "warga"`.
2. Buka Firestore console → koleksi `warga` → cari dokumen dengan id sama seperti UID akun tersebut (lihat UID di Authentication > Users).
3. Ubah field `role` jadi `admin_rt` (untuk Ketua RT) atau `super_admin` (untuk bendahara pusat).
4. Khusus `admin_rt`: pastikan field `rt` di dokumen itu sudah sesuai RT yang akan dia kelola (misalnya `"001"`) — field ini otomatis diisi sesuai pilihan RT saat dia mendaftar, tinggal dicek saja.
5. Logout lalu login ulang di aplikasi — akun tersebut otomatis diarahkan ke dashboard sesuai role barunya.

## 2a. Form pendaftaran warga

Form Daftar sekarang meminta: Nama lengkap, Blok (A-Z), No. rumah (1-100), RT (001-010), RW (tetap "001", karena kompleks ini hanya punya 1 RW), No. HP, Email, dan Kata sandi. RT yang dipilih saat daftar inilah yang menentukan admin RT mana yang mengelola data warga tersebut, dan RT mana yang tampil di semua fitur (tagihan, informasi, kas, dsb).

Kalau jumlah RT di kompleks Anda bukan 10, ubah array `DAFTAR_RT` di baris atas `script.js`:
```js
const DAFTAR_RT = ['001','002','003','004','005','006','007','008','009','010'];
```

## 2b. Koleksi Firestore yang dipakai

| Koleksi / dokumen | Field |
|---|---|
| `warga` (id dokumen = uid) | `nama`, `blok`, `noRumah`, `rt`, `rw`, `hp`, `contactEmail`, `role` (`warga`/`admin_rt`/`super_admin`) |
| `tagihan` | `uid`, `rt`, `periode`, `total`, `status`, `jatuhTempo`, `rincian` (array `{nama, jumlah}`) — dibuat oleh Super admin |
| `jenisTagihan` | `nama`, `jumlah` — iuran bulanan standar untuk semua RT, dikelola Super admin |
| `pengaturan/tagihan` (dokumen tunggal) | `tanggalPenagihan` (angka 1-28) |
| `informasi` | `judul`, `isi`, `kategori`, `gambarUrl`, `tujuan` (`semua`/`rt`), `rtTarget`, `dariRole` (`super_admin`/`admin_rt`), `tanggal` |
| `permintaanRT` | `rt`, `pesan`, `dariRole` (`super_admin`/`admin_rt`), `dariNama`, `dibuatPada` — kanal pesan/permintaan antara Super admin dan Admin RT |
| `surat` | `uid`, `namaWarga`, `rt`, `jenis`, `keperluan`, `status` (`Diajukan`/`Disetujui`/`Ditolak`) |
| `laporan` | `uid`, `namaWarga`, `rt`, `kategori`, `lokasi`, `deskripsi`, `status` (`Diterima`/`Diproses`/`Selesai`) |
| `cctv` | `lokasi`, `link`, `status` — global, dikelola Admin RT mana pun |
| `kontakDarurat` | `nama`, `nomor`, `darurat` (boolean) — global, dikelola Admin RT mana pun, warga menghubungi lewat WhatsApp |
| `kas` | `keterangan`, `jumlah` (negatif = pengeluaran), `rt`, `tanggal`, `tanggalLabel` — per RT |
| `pengeluaran` | `keterangan`, `jumlah`, `rt`, `tanggal`, `tanggalLabel` — mengikuti `kas` |
| `pembayaran` | `uid`, `tagihanId`, `rt`, `nominal`, `metode`, `status` (`Pending`/`Berhasil`/`Gagal`), `externalId`, `xenditInvoiceId`, `invoiceUrl`, `tanggal` — **hanya ditulis oleh Cloud Function**, bukan langsung dari aplikasi |

## 2c. Aktifkan Firebase Storage (untuk foto banner Informasi)

1. Firebase Console → **Build > Storage** → **Get started** → pilih lokasi → **Done**.
2. Tab **Rules** di halaman Storage, ganti dengan:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /informasi/{fileName} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

Foto yang diunggah Super admin atau Admin RT lewat menu Informasi otomatis muncul di banner "Informasi warga" pada dashboard warga yang relevan (maksimal 5 foto terbaru, bergeser otomatis setiap 1 detik).

## 3. Aturan keamanan Firestore (WAJIB dipasang — mendukung 3 role + per-RT)

Ganti seluruh isi **Firestore > Rules** dengan aturan berikut, lalu **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function akunSaya() {
      return get(/databases/$(database)/documents/warga/$(request.auth.uid)).data;
    }
    function punyaAkun() {
      return isSignedIn() && exists(/databases/$(database)/documents/warga/$(request.auth.uid));
    }
    function isSuperAdmin() { return punyaAkun() && akunSaya().role == 'super_admin'; }
    function isAdminRT() { return punyaAkun() && akunSaya().role == 'admin_rt'; }
    function rtSaya() { return akunSaya().rt; }

    match /warga/{uid} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && (request.auth.uid == uid || isSuperAdmin());
    }
    match /tagihan/{id} {
      allow read: if isSignedIn();
      allow write: if isSuperAdmin();
    }
    match /jenisTagihan/{id} {
      allow read: if isSignedIn();
      allow write: if isSuperAdmin();
    }
    match /pengaturan/{id} {
      allow read: if isSignedIn();
      allow write: if isSuperAdmin();
    }
    match /informasi/{id} {
      allow read: if isSignedIn();
      allow create: if isSuperAdmin() || isAdminRT();
      allow update, delete: if isSuperAdmin() || isAdminRT();
    }
    match /permintaanRT/{id} {
      allow read: if isSignedIn();
      allow create: if isSuperAdmin() || (isAdminRT() && request.resource.data.rt == rtSaya());
    }
    match /surat/{id} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update, delete: if isSuperAdmin() || (isAdminRT() && resource.data.rt == rtSaya());
    }
    match /laporan/{id} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update, delete: if isSuperAdmin() || (isAdminRT() && resource.data.rt == rtSaya());
    }
    match /cctv/{id} {
      allow read: if isSignedIn();
      allow write: if isSuperAdmin() || isAdminRT();
    }
    match /kontakDarurat/{id} {
      allow read: if isSignedIn();
      allow write: if isSuperAdmin() || isAdminRT();
    }
    match /kas/{id} {
      allow read: if isSignedIn();
      allow create: if isSuperAdmin() || (isAdminRT() && request.resource.data.rt == rtSaya());
      allow update, delete: if isSuperAdmin() || (isAdminRT() && resource.data.rt == rtSaya());
    }
    match /pengeluaran/{id} {
      allow read: if isSignedIn();
      allow create: if isSuperAdmin() || (isAdminRT() && request.resource.data.rt == rtSaya());
      allow update, delete: if isSuperAdmin() || (isAdminRT() && resource.data.rt == rtSaya());
    }
    match /pembayaran/{id} {
      allow read: if isSignedIn() && (resource.data.uid == request.auth.uid || isSuperAdmin() || (isAdminRT() && resource.data.rt == rtSaya()));
      allow write: if false;
    }
  }
}
```

Inti aturan ini: Admin RT hanya bisa menulis/mengubah data yang field `rt`-nya sama dengan RT dia sendiri (dicek lewat dokumen `warga/{uid}` miliknya sendiri di server, bukan cuma di aplikasi), sedangkan Super admin bisa mengelola tagihan dan informasi untuk semua RT. CCTV dan Kontak darurat tetap global — Admin RT mana pun boleh menambah/menghapus.

## 4. Deploy ke GitHub Pages

1. Push semua file ini ke repositori GitHub Anda.
2. Buka **Settings > Pages** di repo tersebut.
3. Pada **Source**, pilih branch `main` dan folder `/root`, lalu simpan.
4. Setelah beberapa saat, aplikasi akan aktif di `https://<username>.github.io/<nama-repo>/`.
5. Di Firebase Console, buka **Authentication > Settings > Authorized domains** dan tambahkan domain GitHub Pages tersebut agar login tidak diblokir.

Tidak ada proses build yang diperlukan — semua file sudah siap pakai langsung dari root repositori. Tailwind CSS dipasang lewat CDN di `index.html`, jadi ikut jalan otomatis tanpa langkah tambahan.

## 5. Catatan desain: "Ajukan ke pusat" pada Admin RT

Spesifikasi menyebut fitur "Informasi RT" di sisi Super admin sebagai kanal permintaan (misalnya Admin RT ingin meminta dibuatkan iuran khusus). Supaya Admin RT juga bisa memulai permintaan itu, ditambahkan menu **"Ajukan ke pusat"** di dashboard Admin RT yang memakai kanal (koleksi `permintaanRT`) yang sama — pesan yang dikirim dari sana akan muncul di riwayat "Informasi RT" milik Super admin untuk RT yang bersangkutan, dan sebaliknya.

## 6. Setup Xendit & deploy Cloud Functions (WAJIB sebelum "Bayar tagihan" berfungsi)

Fitur bayar tagihan (Model A — tanpa saldo tersimpan) butuh backend, karena API key Xendit tidak boleh ditaruh di kode browser. Kode backend-nya sudah disiapkan di folder `functions/`, tinggal di-deploy.

**a. Upgrade ke paket Blaze** (Cloud Functions tidak jalan di paket Spark/gratis) — Firebase Console → klik nama paket di pojok kiri bawah → Upgrade.

**b. Buat akun Xendit** di xendit.co, mulai dari mode **Test** dulu (uangnya tidak sungguhan, aman untuk coba-coba). Ambil **Secret API Key** dari Settings > API Keys.

**c. Install Firebase CLI di komputer** (butuh Node.js terpasang):
```
npm install -g firebase-tools
firebase login
```

**d. Set kunci rahasia** (dari folder project ini, lewat terminal):
```
firebase functions:secrets:set XENDIT_SECRET_KEY
```
Tempel Secret API Key dari Xendit saat diminta.
```
firebase functions:secrets:set XENDIT_WEBHOOK_TOKEN
```
Untuk ini, isi bebas dengan token acak buatan sendiri (contoh: string panjang acak), lalu catat — token yang sama akan dipakai di langkah (f).

**e. Deploy Cloud Functions**:
```
firebase deploy --only functions
```
Setelah selesai, akan muncul dua URL — salah satunya untuk `xenditWebhook` (bentuknya seperti `https://us-central1-sert-pondoksepangindah2.cloudfunctions.net/xenditWebhook`). Salin URL ini.

**f. Daftarkan webhook di Xendit** — Dashboard Xendit → Settings > Webhooks → tempel URL dari langkah (e) sebagai "Invoice Paid" callback URL, dan isi token verifikasi sama persis dengan `XENDIT_WEBHOOK_TOKEN` yang di-set di langkah (d).

**g. Setelah semua langkah di atas selesai**, tombol "Bayar" di menu Tagihan bulanan warga akan otomatis membuat invoice Xendit sungguhan dan menampilkan tombol "Buka halaman pembayaran". Kalau langkah ini belum dilakukan, tombol Bayar akan menampilkan pesan "Pembayaran online belum tersedia" — bukan error yang membingungkan.

Kalau sudah yakin semuanya berjalan baik di mode Test, baru ganti Secret API Key dengan yang **Live** dari Xendit untuk transaksi sungguhan.

## 7. Belum termasuk di update ini

- **Periode tayang banner** (tanggal mulai/berakhir foto informasi) — sempat dibuatkan mockup-nya, tapi belum dikodekan; kabari kalau ingin dilanjutkan.
- **Notifikasi WhatsApp & email otomatis** saat ada laporan/pengajuan surat baru — masih menunggu upgrade ke paket Blaze, token API Fonnte, dan Gmail App Password.
