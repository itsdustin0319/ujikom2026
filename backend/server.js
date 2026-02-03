const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// KONEKSI DB
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'db_ukk'
});

db.connect(err => {
    if (err) throw err;
    console.log('✅ Database Connected!');
});

// FUNGSI LOG AKTIVITAS (Syarat UKK)
const simpanLog = (id_user, aktivitas) => {
    db.query("INSERT INTO tb_log_aktivitas (id_user, aktivitas, waktu_aktivitas) VALUES (?, ?, NOW())", [id_user, aktivitas]);
};

// --- API AUTH ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM tb_user WHERE username = ? AND password = ?", [username, password], (err, result) => {
        if (result.length > 0) {
            simpanLog(result[0].id_user, "User Login");
            res.json({ success: true, user: result[0] });
        } else {
            res.json({ success: false, message: "Username/Password Salah" });
        }
    });
});

// --- API ADMIN (DATA MASTER) ---
app.get('/api/area', (req, res) => {
    db.query("SELECT * FROM tb_area_parkir", (err, results) => res.json(results));
});

app.post('/api/area', (req, res) => {
    const { nama_area, kapasitas } = req.body;
    db.query("INSERT INTO tb_area_parkir (nama_area, kapasitas, terisi) VALUES (?, ?, 0)", [nama_area, kapasitas], () => res.json({ success: true }));
});

app.get('/api/tarif', (req, res) => {
    db.query("SELECT * FROM tb_tarif", (err, results) => res.json(results));
});

// --- API TRANSAKSI (PETUGAS) ---
app.post('/api/transaksi/masuk', (req, res) => {
    const { plat_nomor, jenis_kendaraan, id_tarif, id_area, id_user } = req.body;
    // Step 1: Simpan Kendaraan
    db.query("INSERT INTO tb_kendaraan (plat_nomor, jenis_kendaraan, id_user) VALUES (?, ?, ?)", [plat_nomor, jenis_kendaraan, id_user], (err, resK) => {
        const id_k = resK.insertId;
        // Step 2: Simpan Transaksi
        db.query("INSERT INTO tb_transaksi (id_kendaraan, id_tarif, id_area, id_user, status, waktu_masuk) VALUES (?, ?, ?, ?, 'masuk', NOW())", [id_k, id_tarif, id_area, id_user], () => {
            // Step 3: Update Kapasitas
            db.query("UPDATE tb_area_parkir SET terisi = terisi + 1 WHERE id_area = ?", [id_area]);
            simpanLog(id_user, `Kendaraan Masuk: ${plat_nomor}`);
            res.json({ success: true });
        });
    });
});

app.post('/api/transaksi/keluar', (req, res) => {
    const { id_parkir } = req.body;
    db.query("SELECT t.*, tr.tarif_per_jam FROM tb_transaksi t JOIN tb_tarif tr ON t.id_tarif = tr.id_tarif WHERE t.id_parkir = ?", [id_parkir], (err, results) => {
        const data = results[0];
        const durasi = Math.ceil((new Date() - new Date(data.waktu_masuk)) / (1000 * 60 * 60)) || 1;
        const total = durasi * data.tarif_per_jam;

        db.query("UPDATE tb_transaksi SET waktu_keluar = NOW(), durasi_jam = ?, biaya_total = ?, status = 'keluar' WHERE id_parkir = ?", [durasi, total, id_parkir], () => {
            db.query("UPDATE tb_area_parkir SET terisi = terisi - 1 WHERE id_area = ?", [data.id_area]);
            simpanLog(data.id_user, `Kendaraan Keluar ID: ${id_parkir}`);
            res.json({ success: true, biaya: total });
        });
    });
});

app.get('/api/kendaraan-aktif', (req, res) => {
    // Query ini menggabungkan tabel transaksi dan kendaraan berdasarkan id_kendaraan
    const sql = `
        SELECT 
            t.id_parkir, 
            t.waktu_masuk, 
            k.plat_nomor 
        FROM tb_transaksi t
        JOIN tb_kendaraan k ON t.id_kendaraan = k.id_kendaraan
        WHERE t.status = 'masuk'
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Query Error:", err);
            return res.status(500).json(err);
        }
        res.json(results);
    });
});

app.listen(3000, () => console.log('🚀 Server running on port 3000'));