/**
 * Catatan: proyek ini memakai Tailwind lewat CDN (lihat tag <script> di index.html),
 * jadi file ini TIDAK dipakai saat ini dan tidak perlu proses build (npm run build) sama sekali.
 * File ini hanya disediakan sebagai referensi jika suatu saat proyek ingin dipindah
 * ke Tailwind versi build (misalnya lewat GitHub Actions seperti pada proyek Tailwind lain).
 */
module.exports = {
  content: ["./index.html", "./script.js"],
  theme: {
    extend: {
      colors: {
        brandblue: '#185FA5',
        brandblueDark: '#0C447C',
        brandgreen: '#3B6D11',
        brandgreenDark: '#27500A'
      }
    }
  },
  plugins: []
};
