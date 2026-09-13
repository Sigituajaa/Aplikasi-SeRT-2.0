/**
 * Cloud Functions: integrasi Xendit untuk pembayaran tagihan (Model A - tanpa saldo tersimpan).
 *
 * Dua fungsi:
 * 1. buatTagihanXendit (callable)  - dipanggil dari aplikasi saat warga tap "Bayar".
 *    Membuat dokumen "pembayaran" berstatus Pending, lalu minta Invoice ke Xendit,
 *    dan mengembalikan link (invoiceUrl) untuk dibuka warga.
 * 2. xenditWebhook (HTTP)          - didaftarkan sebagai webhook URL di dashboard Xendit.
 *    Dipanggil otomatis oleh Xendit saat status pembayaran berubah (PAID/EXPIRED/dst),
 *    lalu memperbarui dokumen "pembayaran" dan "tagihan" terkait.
 *
 * WAJIB diisi sebelum dipakai (lihat README.md bagian "Setup Xendit"):
 *   firebase functions:secrets:set XENDIT_SECRET_KEY
 *   firebase functions:secrets:set XENDIT_WEBHOOK_TOKEN
 */

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const XENDIT_SECRET_KEY = defineSecret('XENDIT_SECRET_KEY');
const XENDIT_WEBHOOK_TOKEN = defineSecret('XENDIT_WEBHOOK_TOKEN');

/* =========================================================
   1. BUAT INVOICE XENDIT
========================================================= */
exports.buatTagihanXendit = onCall({ secrets: [XENDIT_SECRET_KEY], region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Anda harus login terlebih dahulu.');
  }
  const uid = request.auth.uid;
  const tagihanId = request.data && request.data.tagihanId;
  if (!tagihanId) {
    throw new HttpsError('invalid-argument', 'tagihanId wajib diisi.');
  }

  const tagihanRef = db.collection('tagihan').doc(tagihanId);
  const tagihanSnap = await tagihanRef.get();
  if (!tagihanSnap.exists) {
    throw new HttpsError('not-found', 'Tagihan tidak ditemukan.');
  }
  const tagihan = tagihanSnap.data();
  if (tagihan.uid !== uid) {
    throw new HttpsError('permission-denied', 'Tagihan ini bukan milik Anda.');
  }
  if (tagihan.status === 'Lunas') {
    throw new HttpsError('failed-precondition', 'Tagihan ini sudah lunas.');
  }

  const wargaSnap = await db.collection('warga').doc(uid).get();
  const warga = wargaSnap.exists ? wargaSnap.data() : {};

  const externalId = 'tagihan-' + tagihanId + '-' + Date.now();

  const pembayaranRef = db.collection('pembayaran').doc();
  await pembayaranRef.set({
    uid,
    tagihanId,
    rt: tagihan.rt || warga.rt || '',
    nominal: tagihan.total,
    metode: null,
    status: 'Pending',
    externalId,
    tanggal: admin.firestore.FieldValue.serverTimestamp()
  });

  let invoice;
  try {
    const response = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(XENDIT_SECRET_KEY.value() + ':').toString('base64')
      },
      body: JSON.stringify({
        external_id: externalId,
        amount: tagihan.total,
        description: 'Tagihan bulanan ' + (tagihan.periode || ''),
        customer: { given_names: warga.nama || 'Warga' },
        currency: 'IDR'
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('Xendit error:', errText);
      throw new Error('Xendit menolak permintaan invoice.');
    }
    invoice = await response.json();
  } catch (err) {
    console.error(err);
    throw new HttpsError('internal', 'Gagal membuat invoice Xendit. Periksa XENDIT_SECRET_KEY.');
  }

  await pembayaranRef.update({
    xenditInvoiceId: invoice.id,
    invoiceUrl: invoice.invoice_url
  });

  return { pembayaranId: pembayaranRef.id, invoiceUrl: invoice.invoice_url };
});

/* =========================================================
   2. WEBHOOK XENDIT (dipanggil otomatis oleh Xendit)
========================================================= */
exports.xenditWebhook = onRequest({ secrets: [XENDIT_WEBHOOK_TOKEN] }, async (req, res) => {
  const token = req.headers['x-callback-token'];
  if (token !== XENDIT_WEBHOOK_TOKEN.value()) {
    res.status(401).send('Unauthorized');
    return;
  }

  const payload = req.body || {};
  const externalId = payload.external_id;
  if (!externalId) {
    res.status(400).send('Missing external_id');
    return;
  }

  const pembayaranQuery = await db.collection('pembayaran').where('externalId', '==', externalId).limit(1).get();
  if (pembayaranQuery.empty) {
    res.status(404).send('Pembayaran tidak ditemukan');
    return;
  }
  const pembayaranDoc = pembayaranQuery.docs[0];
  const pembayaran = pembayaranDoc.data();

  let statusBaru = 'Pending';
  if (payload.status === 'PAID' || payload.status === 'SETTLED') statusBaru = 'Berhasil';
  else if (payload.status === 'EXPIRED') statusBaru = 'Gagal';

  await pembayaranDoc.ref.update({
    status: statusBaru,
    metode: payload.payment_channel || payload.payment_method || null
  });

  if (statusBaru === 'Berhasil' && pembayaran.tagihanId) {
    await db.collection('tagihan').doc(pembayaran.tagihanId).update({ status: 'Lunas' });
  }

  res.status(200).send('OK');
});
