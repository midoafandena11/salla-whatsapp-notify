const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// متغيرات البيئة من سلة (تضعها في Render)
const CLIENT_ID = process.env.SALLA_CLIENT_ID;
const CLIENT_SECRET = process.env.SALLA_CLIENT_SECRET;
const REDIRECT_URI = 'https://salla-whatsapp-notify.onrender.com/auth/callback';

// تخزين مؤقت لبيانات التجار (يفضل لاحقاً استخدام قاعدة بيانات)
const storesDatabase = {};

// 1. رابط الربط والتفويض (OAuth Callback)
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('لم يتم استلام رمز التفويض من سلة');

  try {
    // طلب Access Token من سلة
    const response = await axios.post('https://accounts.salla.sa/oauth2/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code: code
    });

    const { access_token, refresh_token } = response.data;

    // جلب معلومات المتجر لمعرفة Store ID
    const userProfile = await axios.get('https://api.salla.dev/store/v1/user/info', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const storeId = userProfile.data.data.store.id;

    // حفظ التوكين والتاجر
    storesDatabase[storeId] = {
      accessToken: access_token,
      refreshToken: refresh_token,
      phone: '',
      message: 'أهلاً، أرغب بالاستفسار عن توفر المنتج: {اسم_المنتج}\nالرابط: {رابط_المنتج}'
    };

    // حاقن السكربت آلياً في المتجر عبر Salla API
    await injectScriptToStore(storeId, access_token);

    // توجيه التاجر إلى لوحة التحكم
    res.redirect(`/dashboard?store_id=${storeId}`);
  } catch (error) {
    console.error('OAuth Error:', error.response ? error.response.data : error.message);
    res.status(500).send('حدث خطأ أثناء عملية الربط مع سلة');
  }
});

// دالة حاقن السكربت تلقائياً في متجر التاجر
async function injectScriptToStore(storeId, token) {
  try {
    await axios.post('https://api.salla.dev/store/v1/script-tokens', {
      name: 'WhatsApp Notify Script',
      script: `https://salla-whatsapp-notify.onrender.com/app-script.js`,
      page: 'product'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`تم حقن السكربت بنجاح للمتجر: ${storeId}`);
  } catch (err) {
    console.error('Script Injection Error:', err.response ? err.response.data : err.message);
  }
}

// 2. رابط لوحة التحكم للتاجر (Dashboard)
app.get('/dashboard', (req, res) => {
  const storeId = req.query.store_id || 'demo';
  const storeData = storesDatabase[storeId] || { phone: '', message: '' };

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>إعدادات تنبيهات الواتساب</title>

      <style>
        body { font-family: system-ui, sans-serif; background: #f4f6f8; padding: 20px; }
        .card { max-width: 500px; margin: 30px auto; background: #fff; padding: 25px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        h2 { color: #2d3748; margin-bottom: 20px; }
        label { display: block; margin-top: 15px; font-weight: bold; color: #4a5568; }
        input, textarea { width: 100%; padding: 10px; margin-top: 5px; border: 1px solid #cbd5e0; border-radius: 6px; box-sizing: border-box; }
        button { margin-top: 20px; width: 100%; background: #25D366; color: #fff; border: none; padding: 12px; font-size: 16px; font-weight: bold; border-radius: 6px; cursor: pointer; }
        button:hover { background: #20ba5a; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>إعدادات تنبيهات الواتساب</h2>
        <form action="/save-settings" method="POST">
          <input type="hidden" name="store_id" value="${storeId}">
          <label>رقم الواتساب (شامل كود الدولة بدون +):</label>
          <input type="text" name="phone" value="${storeData.phone}" placeholder="مثال: 966500000000" required>
          
          <label>نص الرسالة التلقائية:</label>
          <textarea name="message" rows="4" required>${storeData.message}</textarea>
          <small style="color:#718096; display:block; margin-top:4px;">المتغيرات المتاحة: {اسم_المنتج} و {رابط_المنتج}</small>

          <button type="submit">حفظ البيانات</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// 3. حفظ البيانات من لوحة التحكم
app.post('/save-settings', (req, res) => {
  const { store_id, phone, message } = req.body;
  if (!storesDatabase[store_id]) {
    storesDatabase[store_id] = {};
  }
  storesDatabase[store_id].phone = phone;
  storesDatabase[store_id].message = message;

  res.send(`
    <script>
      alert('تم حفظ البيانات بنجاح!');
      window.location.href = '/dashboard?store_id=${store_id}';
    </script>
  `);
});

// 4. API يستقبله كود السكربت المزروع جوه المتجر جلب الرقم والرسالة
app.get('/api/get-settings', (req, res) => {
  const storeId = req.query.store_id;
  const data = storesDatabase[storeId] || { phone: '', message: '' };
  res.json(data);
});

// 5. ملف السكربت الخارجي الديناميكي (app-script.js)
app.get('/app-script.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    (function() {
      function initWhatsAppBtn() {
        if (document.getElementById('salla-wa-notify-btn')) return;

        var isOutOfStock = Array.from(document.querySelectorAll('*')).some(function(el) {
          return el.children.length === 0 && el.innerText && el.innerText.trim() === 'نفدت الكمية';
        });

        if (!isOutOfStock) return;

        var storeId = (typeof salla !== 'undefined' && salla.config) ? salla.config.get("store.id") : "";

        fetch('https://salla-whatsapp-notify.onrender.com/api/get-settings?store_id=' + storeId)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (!data.phone) return;

            var title = document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : document.title;
            var url = window.location.href;
            var msg = (data.message || '').replace('{اسم_المنتج}', title).replace('{رابط_المنتج}', url);
            var cleanPhone = data.phone.replace(/[^0-9]/g, '');

            var waUrl = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(msg);

            var btn = document.createElement('div');
            btn.id = 'salla-wa-notify-btn';
            btn.style.cssText = 'margin-top:15px; width:100%; clear:both;';
            btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#25D366; color:#fff; padding:14px; border-radius:8px; font-weight:bold; text-decoration:none; font-size:16px;">أعلمني عند التوفر عبر الواتساب</a>';

            var target = document.querySelector('form') || document.body;
            target.appendChild(btn);
          });
      }

      setInterval(initWhatsAppBtn, 1200);
    })();
  `);
});

// 6. مسار الـ Webhooks
app.post('/webhooks', (req, res) => {
  console.log('Webhook Received:', req.body);
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
