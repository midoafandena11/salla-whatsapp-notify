const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CLIENT_ID = process.env.SALLA_CLIENT_ID;
const CLIENT_SECRET = process.env.SALLA_CLIENT_SECRET;
const REDIRECT_URI = 'https://salla-whatsapp-notify.onrender.com/auth/callback';

const storesDatabase = {};

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// OAuth Callback - معدل ومحصن
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('لم يتم استلام رمز التفويض (code) من سلة');
  }

  try {
    // إرسال طلب التوكين بالتنسيق الرسمي المطلوب من سلة
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code: code
    });

    const tokenRes = await fetch('https://accounts.salla.sa/oauth2/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded' 
      },
      body: params.toString()
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Salla Token Error Response:', tokenData);
      return res.status(400).send(`فشل الربط مع سلة: ${tokenData.error_description || tokenData.message || 'بيانات الاعتماد غير صحيحة'}`);
    }

    const access_token = tokenData.access_token;
    const refresh_token = tokenData.refresh_token;

    // جلب معلومات المتجر
    const userRes = await fetch('https://api.salla.dev/store/v1/user/info', {
      headers: { 
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json'
      }
    });
    
    const userData = await userRes.json();
    const storeId = userData.data && userData.data.store ? userData.data.store.id : 'demo';

    storesDatabase[storeId] = {
      accessToken: access_token,
      refreshToken: refresh_token,
      phone: storesDatabase[storeId]?.phone || '',
      message: storesDatabase[storeId]?.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
    };

    await injectScriptToStore(storeId, access_token);
    res.redirect(`/dashboard?store_id=${storeId}`);

  } catch (error) {
    console.error('OAuth System Error:', error);
    res.status(500).send('حدث خطأ أثناء عملية الربط مع سلة: ' + error.message);
  }
});

async function injectScriptToStore(storeId, token) {
  try {
    await fetch('https://api.salla.dev/store/v1/script-tokens', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        name: 'WhatsApp Notify Script',
        script: `https://salla-whatsapp-notify.onrender.com/app-script.js`,
        page: 'product'
      })
    });
    console.log(`تم حقن السكربت بنجاح للمتجر: ${storeId}`);
  } catch (err) {
    console.error('Script Injection Error:', err);
  }
}

app.get('/dashboard', (req, res) => {
  const storeId = req.query.store_id || 'demo';
  const storeData = storesDatabase[storeId] || {
    phone: '',
    message: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
  };

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>إعدادات تطبيق التنبيه عبر الواتساب</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; font-family: 'Tajawal', sans-serif; }
        body { background-color: #f8fafc; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .card { background: #ffffff; width: 100%; max-width: 520px; padding: 32px 28px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.03); }
        h2 { text-align: center; color: #004d40; margin-top: 0; margin-bottom: 24px; font-size: 22px; font-weight: 700; }
        label { display: block; margin-top: 20px; margin-bottom: 8px; font-weight: 700; color: #1e293b; font-size: 15px; }
        input[type="text"], textarea { width: 100%; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 15px; color: #0f172a; outline: none; background: #fff; transition: border-color 0.2s; }
        input[type="text"]:focus, textarea:focus { border-color: #10b981; }
        textarea { resize: vertical; min-height: 90px; }
        .hint { font-size: 12px; color: #64748b; margin-top: 6px; line-height: 1.5; }
        .btn { margin-top: 28px; width: 100%; background: #10b981; color: #ffffff; border: none; padding: 14px; font-size: 16px; font-weight: 700; border-radius: 10px; cursor: pointer; transition: background 0.2s; }
        .btn:hover { background: #059669; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>إعدادات تطبيق التنبيه عبر الواتساب</h2>
        <form action="/save-settings" method="POST">
          <input type="hidden" name="store_id" value="${storeId}">
          
          <label>رقم الواتساب الخاص بالمتجر:</label>
          <input type="text" name="phone" value="${storeData.phone}" placeholder="مثال: 966500000000" required>
          <div class="hint">أدخل الرقم بدون علامة (+) مع مفتاح الدولة (مثال: 966 للمملكة العربية السعودية).</div>
          
          <label>نص الرسالة الترحيبية:</label>
          <textarea name="message" required>${storeData.message}</textarea>
          <div class="hint">ملاحظة: اسم المنتج، السعر، ورابط المنتج سينضافون تلقائياً أسفل هذه الرسالة عند تحويل العميل للواتساب.</div>

          <button type="submit" class="btn">حفظ الإعدادات</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/save-settings', (req, res) => {
  const { store_id, phone, message } = req.body;
  if (!storesDatabase[store_id]) {
    storesDatabase[store_id] = {};
  }
  storesDatabase[store_id].phone = phone;
  storesDatabase[store_id].message = message;

  res.send(`
    <script>
      alert('تم حفظ الإعدادات بنجاح!');
      window.location.href = '/dashboard?store_id=${store_id}';
    </script>
  `);
});

app.get('/api/get-settings', (req, res) => {
  const storeId = req.query.store_id;
  const data = storesDatabase[storeId] || {
    phone: '',
    message: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
  };
  res.json(data);
});

app.get('/app-script.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    (function() {
      function initWhatsAppBtn() {
        if (document.getElementById('salla-wa-notify-btn')) return;

        var outOfStockEl = null;
        var allElements = document.querySelectorAll('button, div, span, p');
        
        for (var i = 0; i < allElements.length; i++) {
          var text = allElements[i].innerText ? allElements[i].innerText.trim() : '';
          if (text === 'نفدت الكمية' || text === 'نفذت الكمية' || text === 'غير متوفر') {
            outOfStockEl = allElements[i];
            break;
          }
        }

        if (!outOfStockEl) return;

        var storeId = (typeof salla !== 'undefined' && salla.config) ? salla.config.get("store.id") : "";

        fetch('https://salla-whatsapp-notify.onrender.com/api/get-settings?store_id=' + storeId)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (!data.phone) return;

            var title = document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : document.title;
            var url = window.location.href;
            
            var priceEl = document.querySelector('.product-price') || document.querySelector('[class*="price"]');
            var price = priceEl ? priceEl.innerText.trim() : '';

            var userMsg = data.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

            var finalMsg = userMsg + "\\n\\n" + 
                           "📦 المنتج: " + title + 
                           (price ? "\\n💰 السعر: " + price : "") + 
                           "\\n🔗 الرابط: " + url;

            var cleanPhone = data.phone.replace(/[^0-9]/g, '');
            var waUrl = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(finalMsg);

            var btn = document.createElement('div');
            btn.id = 'salla-wa-notify-btn';
            btn.style.cssText = 'margin: 15px 0; width: 100%; clear: both; box-sizing: border-box;';
            btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#fff; padding:14px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:16px; width:100%; box-shadow: 0 4px 10px rgba(16,185,129,0.2);">أعلمني عند التوفر عبر الواتساب</a>';

            var parent = outOfStockEl.closest('.product-form') || outOfStockEl.parentElement;
            if (parent) {
              parent.appendChild(btn);
            } else {
              outOfStockEl.insertAdjacentElement('afterend', btn);
            }
          });
      }

      setInterval(initWhatsAppBtn, 1000);
    })();
  `);
});

app.post('/webhooks', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
