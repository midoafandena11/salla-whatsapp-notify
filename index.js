const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// السماح لجميع النطاقات بالوصول للسكربت (CORS)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

const CLIENT_ID = process.env.SALLA_CLIENT_ID;
const CLIENT_SECRET = process.env.SALLA_CLIENT_SECRET;
const REDIRECT_URI = 'https://salla-whatsapp-notify.onrender.com/auth/callback';

const storesDatabase = {};

app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('لم يتم استلام رمز التفويض');

  try {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code: code
    });

    const tokenRes = await axios.post('https://accounts.salla.sa/oauth2/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const access_token = tokenRes.data.access_token;

    const userRes = await axios.get('https://accounts.salla.sa/oauth2/user/info', {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
    });

    const userData = userRes.data;
    const storeId = userData.data && userData.data.store ? String(userData.data.store.id) : 'demo';

    if (!storesDatabase[storeId]) {
      storesDatabase[storeId] = {
        phone: '',
        message: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
      };
    }

    await injectScriptToStore(storeId, access_token);
    res.redirect(`/dashboard?store_id=${storeId}`);

  } catch (error) {
    console.error('OAuth Error:', error.response?.data || error.message);
    res.status(500).send('خطأ في التوثيق: ' + (error.response?.data?.message || error.message));
  }
});

async function injectScriptToStore(storeId, token) {
  try {
    await axios.post('https://api.salla.dev/store/v1/script-tokens', {
      name: 'WhatsApp Notify Script',
      script: 'https://salla-whatsapp-notify.onrender.com/app-script.js',
      page: 'product'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  } catch (err) {
    console.error('Script Inject Error:', err.response?.data || err.message);
  }
}

// لوحة التحكم بتصميمها الأصلي المنسق
app.get('/dashboard', (req, res) => {
  const storeId = req.query.store_id || 'demo';
  const saved = req.query.saved === 'true';
  const storeData = storesDatabase[storeId] || storesDatabase['default'] || {
    phone: '',
    message: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
  };

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>إعدادات التنبيه عبر الواتساب</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; font-family: 'Tajawal', sans-serif; margin: 0; padding: 0; }
        body { background-color: #f4f7f6; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
        .card { background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 100%; max-width: 550px; padding: 30px; }
        .header { text-align: center; margin-bottom: 25px; }
        .header h2 { color: #004d40; font-size: 22px; margin-bottom: 8px; }
        .header p { color: #666; font-size: 14px; }
        .alert-success { background: #d1fae5; color: #065f46; padding: 12px; border-radius: 8px; text-align: center; margin-bottom: 20px; font-weight: 500; }
        .form-group { margin-bottom: 20px; }
        label { display: block; font-weight: 700; color: #333; margin-bottom: 8px; font-size: 14px; }
        input[type="text"], textarea { width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 8px; font-size: 14px; outline: none; transition: border-color 0.3s; }
        input[type="text"]:focus, textarea:focus { border-color: #10b981; }
        textarea { height: 100px; resize: vertical; }
        .hint { font-size: 12px; color: #888; margin-top: 5px; }
        .btn-submit { width: 100%; background: #10b981; color: white; border: none; padding: 14px; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; transition: background 0.3s; }
        .btn-submit:hover { background: #059669; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2>تنبيهات الواتساب للمنتجات غير المتوفرة</h2>
          <p>قم بضبط رقم الواتساب والرسالة التلقائية التي سيرسلها العميل عند طلب المنتج.</p>
        </div>

        ${saved ? '<div class="alert-success">✓ تم حفظ الإعدادات بنجاح!</div>' : ''}

        <form action="/save-settings" method="POST">
          <input type="hidden" name="store_id" value="${storeId}">
          
          <div class="form-group">
            <label for="phone">رقم الواتساب (مع الرمز الدولي بدون +):</label>
            <input type="text" id="phone" name="phone" value="${storeData.phone}" placeholder="مثال: 966500000000" required>
            <div class="hint">اكتب الرقم بترميز الدولة مباشرة مثل 966 أو 20.</div>
          </div>

          <div class="form-group">
            <label for="message">نص الرسالة التلقائية:</label>
            <textarea id="message" name="message" required>${storeData.message}</textarea>
            <div class="hint">سيتم إرفاق اسم المنتج وسعره ورابطه تلقائياً في نهاية هذه الرسالة.</div>
          </div>

          <button type="submit" class="btn-submit">حفظ الإعدادات</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/save-settings', (req, res) => {
  const { store_id, phone, message } = req.body;
  storesDatabase[store_id] = { phone, message };
  storesDatabase['default'] = { phone, message };
  res.redirect(`/dashboard?store_id=${store_id}&saved=true`);
});

app.get('/api/get-settings', (req, res) => {
  const storeId = req.query.store_id;
  const data = storesDatabase[storeId] || storesDatabase['default'] || {
    phone: '',
    message: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
  };
  res.json(data);
});

// ملف السكربت الذي يتم تنفيذه في متجر سلة
app.get('/app-script.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    (function() {
      function initWhatsAppBtn() {
        if (document.getElementById('salla-wa-notify-btn')) return;

        var storeId = (typeof salla !== 'undefined' && salla.config) ? salla.config.get("store.id") : "";

        fetch('https://salla-whatsapp-notify.onrender.com/api/get-settings?store_id=' + storeId)
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (!data || !data.phone) return;

            // البحث عن العناصر التي تدل على نفاد الكمية
            var outOfStockEl = null;
            var elements = document.querySelectorAll('button, div, span, p');
            for (var i = 0; i < elements.length; i++) {
              var txt = elements[i].innerText ? elements[i].innerText.trim() : '';
              if (txt === 'نفدت الكمية' || txt === 'نفذت الكمية' || txt === 'غير متوفر') {
                outOfStockEl = elements[i];
                break;
              }
            }

            if (!outOfStockEl) return;

            var title = document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : document.title;
            var url = window.location.href;
            var priceEl = document.querySelector('.product-price') || document.querySelector('[class*="price"]');
            var price = priceEl ? priceEl.innerText.trim() : '';

            var userMsg = data.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';
            var finalMsg = userMsg + "\\n\\n📦 المنتج: " + title + (price ? "\\n💰 السعر: " + price : "") + "\\n🔗 الرابط: " + url;

            var cleanPhone = data.phone.replace(/[^0-9]/g, '');
            var waUrl = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(finalMsg);

            var btnContainer = document.createElement('div');
            btnContainer.id = 'salla-wa-notify-btn';
            btnContainer.style.cssText = 'margin: 15px 0; width: 100%; display: block; clear: both; position: relative; z-index: 99;';
            btnContainer.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background-color:#10b981; color:#ffffff; padding:12px 20px; border-radius:8px; font-weight:bold; text-decoration:none; font-size:15px; width:100%; box-shadow:0 4px 10px rgba(16,185,129,0.2); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>';

            outOfStockEl.parentNode.insertBefore(btnContainer, outOfStockEl.nextSibling);
          })
          .catch(function(err) { console.error('WA Fetch Error:', err); });
      }

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initWhatsAppBtn();
      } else {
        document.addEventListener('DOMContentLoaded', initWhatsAppBtn);
      }
      setInterval(initWhatsAppBtn, 2000);
    })();
  `);
});

app.post('/webhooks', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
