const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

    const tokenRes = await fetch('https://accounts.salla.sa/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const tokenData = await tokenRes.json();
    const access_token = tokenData.access_token;

    const userRes = await fetch('https://accounts.salla.sa/oauth2/user/info', {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
    });
    const userData = await userRes.json();
    const storeId = userData.data && userData.data.store ? String(userData.data.store.id) : 'demo';

    storesDatabase[storeId] = {
      phone: storesDatabase[storeId]?.phone || '',
      message: storesDatabase[storeId]?.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
    };

    await injectScriptToStore(storeId, access_token);
    res.redirect(`/dashboard?store_id=${storeId}`);

  } catch (error) {
    res.status(500).send('خطأ في التوثيق: ' + error.message);
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
  } catch (err) {
    console.error(err);
  }
}

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
      <title>إعدادات الواتساب</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; font-family: 'Tajawal', sans-serif; }
        body { background: #f8fafc; padding: 20px; display: flex; justify-content: center; }
        .card { background: #fff; width: 100%; max-width: 500px; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        h2 { color: #004d40; text-align: center; margin-bottom: 20px; }
        label { font-weight: bold; display: block; margin-top: 15px; }
        input, textarea { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 8px; margin-top: 5px; }
        .btn { margin-top: 20px; width: 100%; background: #10b981; color: #fff; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; }
        .msg { background: #d1fae5; color: #065f46; padding: 10px; border-radius: 8px; text-align: center; margin-bottom: 15px; }
      </style>
    </head>
    <body>
      <div class="card">
        ${saved ? '<div class="msg">✓ تم حفظ الإعدادات بنجاح!</div>' : ''}
        <h2>إعدادات التنبيه عبر الواتساب</h2>
        <form action="/save-settings" method="POST">
          <input type="hidden" name="store_id" value="${storeId}">
          <label>رقم الواتساب:</label>
          <input type="text" name="phone" value="${storeData.phone}" placeholder="966500000000" required>
          <label>الرسالة:</label>
          <textarea name="message" required>${storeData.message}</textarea>
          <button type="submit" class="btn">حفظ الإعدادات</button>
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

// السكربت المباشر الفائق
app.get('/app-script.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    (function() {
      console.log("WA Notify App Script Loaded Successfully!");

      function runWhatsApp() {
        if (document.getElementById('salla-wa-notify-btn')) return;

        var bodyText = document.body ? document.body.innerText : '';
        if (!bodyText.includes('نفدت الكمية') && !bodyText.includes('نفذت الكمية') && !bodyText.includes('غير متوفر')) {
          return;
        }

        var storeId = (typeof salla !== 'undefined' && salla.config) ? salla.config.get("store.id") : "";

        fetch('https://salla-whatsapp-notify.onrender.com/api/get-settings?store_id=' + storeId)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (!data || !data.phone) return;

            var title = document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : document.title;
            var url = window.location.href;
            var priceEl = document.querySelector('.product-price') || document.querySelector('[class*="price"]');
            var price = priceEl ? priceEl.innerText.trim() : '';

            var userMsg = data.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';
            var finalMsg = userMsg + "\\n\\n📦 المنتج: " + title + (price ? "\\n💰 السعر: " + price : "") + "\\n🔗 الرابط: " + url;

            var cleanPhone = data.phone.replace(/[^0-9]/g, '');
            var waUrl = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(finalMsg);

            var btn = document.createElement('div');
            btn.id = 'salla-wa-notify-btn';
            btn.style.cssText = 'margin: 20px 0; width: 100%; display: block; z-index: 999999; position: relative;';
            btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:15px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:16px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.3); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>';

            // البحث عن زر نفدت الكمية ووضع الزرار تحته
            var allBtns = document.querySelectorAll('button, div, span');
            var inserted = false;
            for (var i = 0; i < allBtns.length; i++) {
              var txt = allBtns[i].innerText ? allBtns[i].innerText.trim() : '';
              if (txt === 'نفدت الكمية' || txt === 'نفذت الكمية' || txt === 'غير متوفر') {
                allBtns[i].parentNode.insertBefore(btn, allBtns[i].nextSibling);
                inserted = true;
                break;
              }
            }

            if (!inserted) {
              var mainForm = document.querySelector('form') || document.body;
              mainForm.appendChild(btn);
            }
          })
          .catch(function(e){ console.error(e); });
      }

      setInterval(runWhatsApp, 1000);
    })();
  `);
});

app.post('/webhooks', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));m') || outOfStockNode.parentElement;
            if (container) {
              container.appendChild(btn);
            } else {
              outOfStockNode.insertAdjacentElement('afterend', btn);
            }
          })
          .catch(function(err) { console.error("WA Notify Fetch Error:", err); });
      }

      // تشغيل الفحص التلقائي
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setInterval(checkAndInject, 1000); });
      } else {
        setInterval(checkAndInject, 1000);
      }
    })();
  `);
});

app.post('/webhooks', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
