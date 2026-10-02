const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();

// تفعيل Cors و BodyParser
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// خدمة الملفات الثابتة من مجلد public (لشاشات HTML لو وجدت)
app.use(express.static(path.join(__dirname, 'public')));

// إعداد قاعدة البيانات PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// إنشاء الجدول تلقائياً إن لم يكن موجوداً
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS store_settings (
        store_id VARCHAR(255) PRIMARY KEY,
        phone VARCHAR(50),
        message TEXT
      );
    `);
    console.log('Database table ready.');
  } catch (err) {
    console.error('Error initializing database table:', err);
  }
};
initDB();

// 1. مسار إعادة التوجيه OAuth عند تثبيت التطبيق من سلة
app.get('/auth/callback', (req, res) => {
  const storeId = req.query.merchant || req.query.store_id || 'default_store';
  res.redirect(`/dashboard?store_id=${storeId}`);
});

// 2. واجهة لوحة تحكم التاجر (تفتح للتاجر ليكتب رقمه والرسالة)
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تطبيق أعلمني عند التوفر عبر الواتساب</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #f4f6f8; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 80vh; margin: 0; }
        .card { background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); width: 100%; max-width: 480px; }
        h2 { text-align: center; color: #222; margin-top: 0; margin-bottom: 20px; font-size: 20px; }
        label { display: block; margin-top: 15px; font-weight: 600; color: #444; font-size: 14px; }
        input, textarea { width: 100%; padding: 12px; margin-top: 6px; border: 1px solid #ccc; border-radius: 8px; box-sizing: border-box; font-size: 14px; outline: none; }
        input:focus, textarea:focus { border-color: #25D366; }
        button { width: 100%; background: #25D366; color: white; border: none; padding: 14px; margin-top: 22px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 16px; transition: background 0.2s; }
        button:hover { background: #20ba5a; }
        .status { margin-top: 15px; text-align: center; font-weight: bold; color: #2e7d32; display: none; background: #e8f5e9; padding: 10px; border-radius: 6px; }
        .hint { font-size: 12px; color: #777; margin-top: 4px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>إعدادات تنبيهات الواتساب للمتجر</h2>
        <form id="settingsForm">
          <label>رقم الواتساب الخاص بك (مستلم الطلبات):</label>
          <input type="text" id="phone" placeholder="966500000000 أو 201000000000" required />
          <div class="hint">اكتب الرقم شاملاً الرمز الدولي بدون علامة +</div>
          
          <label>نص الرسالة التي سيرسلها العميل لك:</label>
          <textarea id="message" rows="4" required>أهلاً، أرغب بتوفر منتج: {اسم_المنتج}&#10;رابط المنتج: {رابط_المنتج}</textarea>
          <div class="hint">يمكنك استخدام المتغيرات: {اسم_المنتج} و {رابط_المنتج}</div>
          
          <button type="submit">حفظ الإعدادات</button>
        </form>
        <div id="status" class="status">✅ تم حفظ الإعدادات بنجاح!</div>
      </div>

      <script>
        const urlParams = new URLSearchParams(window.location.search);
        const storeId = urlParams.get('store_id') || urlParams.get('merchant') || 'default_store';

        // جلب البيانات المسجلة سابقاً للتاجر
        fetch('/api/get-settings?store_id=' + storeId)
          .then(res => res.json())
          .then(data => {
            if (data.phone) document.getElementById('phone').value = data.phone;
            if (data.message) document.getElementById('message').value = data.message;
          });

        // حفظ البيانات في السيرفر
        document.getElementById('settingsForm').addEventListener('submit', function(e) {
          e.preventDefault();
          fetch('/api/save-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              store_id: storeId,
              phone: document.getElementById('phone').value,
              message: document.getElementById('message').value
            })
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              const statusEl = document.getElementById('status');
              statusEl.style.display = 'block';
              setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
            }
          });
        });
      </script>
    </body>
    </html>
  `);
});

// 3. API يستقبله السيرفر عند حفظ التاجر لإعداداته
app.post('/api/save-settings', async (req, res) => {
  const { store_id, phone, message } = req.body;
  try {
    await pool.query(
      `INSERT INTO store_settings (store_id, phone, message) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (store_id) 
       DO UPDATE SET phone = $2, message = $3`,
      [store_id, phone, message]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Save settings error:', err);
    res.status(500).json({ error: 'خطأ في قاعدة البيانات أثناء الحفظ' });
  }
});

// 4. API يجلب الإعدادات المخصصة لكل متجر عند فتح العميل لصفحة المنتج
app.get('/api/get-settings', async (req, res) => {
  const storeId = req.query.store_id || 'default_store';
  try {
    const result = await pool.query('SELECT phone, message FROM store_settings WHERE store_id = $1', [storeId]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json({ phone: '', message: 'أهلاً، أرغب بتوفر منتج: {اسم_المنتج}\nرابط المنتج: {رابط_المنتج}' });
    }
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'خطأ في جلب البيانات' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
