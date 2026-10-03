const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// السماح بروابط CORS لضمان قراءة السكربت من متجر سلة
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// الاتصال بقاعدة بيانات MongoDB
const MONGO_URI = process.env.MONGO_URI || 'ضع_رابط_mongodb_هنا';
mongoose.connect(MONGO_URI)
  .then(() => console.log('تم الاتصال بقاعدة بيانات MongoDB بنجاح'))
  .catch(err => console.error('خطأ في الاتصال بقاعدة البيانات:', err));

// تعريف شكل بيانات المتجر في الداتابيز
const StoreSchema = new mongoose.Schema({
  storeId: { type: String, required: true, unique: true },
  accessToken: String,
  refreshToken: String,
  phone: { type: String, default: '' },
  message: { type: String, default: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.' }
});

const Store = mongoose.model('Store', StoreSchema);

const CLIENT_ID = process.env.SALLA_CLIENT_ID;
const CLIENT_SECRET = process.env.SALLA_CLIENT_SECRET;
const REDIRECT_URI = 'https://salla-whatsapp-notify.onrender.com/auth/callback';

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// 1. OAuth Callback
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('لم يتم استلام رمز التفويض من سلة');
  }

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

    if (!tokenRes.ok || !tokenData.access_token) {
      return res.status(400).send(`فشل الربط مع سلة: ${tokenData.error_description || tokenData.message}`);
    }

    const access_token = tokenData.access_token;
    const refresh_token = tokenData.refresh_token;

    const userRes = await fetch('https://accounts.salla.sa/oauth2/user/info', {
      headers: { 
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json'
      }
    });
    
    const userData = await userRes.json();
    const storeId = userData.data && userData.data.store ? String(userData.data.store.id) : (userData.data ? String(userData.data.id) : 'demo');

    // حفظ أو تحديث المتجر في MongoDB
    await Store.findOneAndUpdate(
      { storeId: storeId },
      { 
        accessToken: access_token,
        refreshToken: refresh_token 
      },
      { upsert: true, new: true }
    );

    await injectScriptToStore(storeId, access_token);
    res.redirect(`/dashboard?store_id=${storeId}&installed=true`);

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

// 2. لوحة التحكّم
app.get('/dashboard', async (req, res) => {
  const storeId = req.query.store_id || 'demo';
  const saved = req.query.saved === 'true';

  let storeData = await Store.findOne({ storeId: storeId });
  if (!storeData) {
    storeData = {
      phone: '',
      message: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
    };
  }

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
        .card { background: #ffffff; width: 100%; max-width: 520px; padding: 32px 28px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.03); position: relative; }
        h2 { text-align: center; color: #004d40; margin-top: 0; margin-bottom: 24px; font-size: 22px; font-weight: 700; }
        label { display: block; margin-top: 20px; margin-bottom: 8px; font-weight: 700; color: #1e293b; font-size: 15px; }
        input[type="text"], textarea { width: 100%; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 15px; color: #0f172a; outline: none; background: #fff; transition: border-color 0.2s; }
        input[type="text"]:focus, textarea:focus { border-color: #10b981; }
        textarea { resize: vertical; min-height: 90px; }
        .hint { font-size: 12px; color: #64748b; margin-top: 6px; line-height: 1.5; }
        .btn { margin-top: 24px; width: 100%; background: #10b981; color: #ffffff; border: none; padding: 14px; font-size: 16px; font-weight: 700; border-radius: 10px; cursor: pointer; transition: background 0.2s; }
        .btn:hover { background: #059669; }
        .alert-success { background: #d1fae5; color: #065f46; padding: 12px 16px; border-radius: 10px; margin-bottom: 20px; font-weight: 500; text-align: center; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="card">
        ${saved ? '<div class="alert-success">✓ تم حفظ الإعدادات بنجاح! يمكنك إغلاق هذه الصفحة الآن.</div>' : ''}
        <h2>إعدادات تطبيق التنبيه عبر الواتساب</h2>
        <form action="/save-settings" method="POST">
          <input type="hidden" name="store_id" value="${storeId}">
          
          <label>رقم الواتساب الخاص بالمتجر:</label>
          <input type="text" name="phone" value="${storeData.phone}" placeholder="مثال: 966500000000" required>
          <div class="hint">أدخل الرقم مع مفتاح الدولة بدون (+) (مثال: 966 للمملكة العربية السعودية).</div>
          
          <label>نص الرسالة الترحيبية:</label>
          <textarea name="message" required>${storeData.message}</textarea>
          <div class="hint">سيتم إضافة اسم المنتج، السعر، والرابط تلقائياً بأسفل هذه الرسالة.</div>

          <button type="submit" class="btn">حفظ الإعدادات</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// 3. حفظ الإعدادات
app.post('/save-settings', async (req, res) => {
  const { store_id, phone, message } = req.body;
  
  await Store.findOneAndUpdate(
    { storeId: store_id },
    { phone, message },
    { upsert: true, new: true }
  );

  // حفظ نسخة افتراضية
  await Store.findOneAndUpdate(
    { storeId: 'default' },
    { phone, message },
    { upsert: true, new: true }
  );

  res.redirect(`/dashboard?store_id=${store_id}&saved=true`);
});

// 4. API البيانات المعدل
app.get('/api/get-settings', async (req, res) => {
  const storeId = req.query.store_id;
  let data = await Store.findOne({ storeId: storeId });
  
  if (!data) {
    data = await Store.findOne({ storeId: 'default' });
  }

  if (!data) {
    data = {
      phone: '',
      message: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
    };
  }

  res.json(data);
});

// 5. السكربت
app.get('/app-script.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    (function() {
      function checkAndInject() {
        if (document.getElementById('salla-wa-notify-btn')) return;

        var isOutOfStock = false;
        if (typeof salla !== 'undefined' && salla.config) {
          var productData = salla.config.get('product') || salla.config.get('page.product');
          if (productData) {
            if (productData.is_out_of_stock || productData.quantity === 0) {
              isOutOfStock = true;
            }
          }
        }

        var outOfStockNode = null;
        var nodes = document.querySelectorAll('button, div, span, p, h1, h2, h3, h4, salla-add-to-cart-button');
        
        for (var i = 0; i < nodes.length; i++) {
          var t = nodes[i].innerText ? nodes[i].innerText.trim() : '';
          if (t === 'نفدت الكمية' || t === 'نفذت الكمية' || t === 'غير متوفر' || nodes[i].getAttribute('is-out-of-stock') !== null) {
            if (nodes[i].children.length <= 1 || nodes[i].tagName.toLowerCase() === 'salla-add-to-cart-button') {
              outOfStockNode = nodes[i];
              isOutOfStock = true;
              break;
            }
          }
        }

        if (!isOutOfStock || !outOfStockNode) return;

        var storeId = '';
        if (typeof salla !== 'undefined' && salla.config) {
          storeId = salla.config.get("store.id") || '';
        }

        fetch('https://salla-whatsapp-notify.onrender.com/api/get-settings?store_id=' + storeId)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (!data || !data.phone) return;

            var title = '';
            if (typeof salla !== 'undefined' && salla.config && salla.config.get('product.name')) {
              title = salla.config.get('product.name');
            } else {
              var productTitleEl = document.querySelector('.product-details__title, .product-title, h1:not(.header-logo)');
              title = productTitleEl ? productTitleEl.innerText.trim() : document.title;
            }

            var url = window.location.href;
            
            var currentPrice = '';
            var originalPrice = '';

            var regularPriceEl = document.querySelector('.price-before, .regular-price, .line-through, [class*="before"]');
            var salePriceEl = document.querySelector('.product-price, .price-after, .sale-price, [class*="price"]:not(.line-through)');

            if (regularPriceEl) {
              originalPrice = regularPriceEl.innerText.trim();
            }
            if (salePriceEl) {
              currentPrice = salePriceEl.innerText.trim();
            } else {
              var anyPriceEl = document.querySelector('[class*="price"]');
              if (anyPriceEl) currentPrice = anyPriceEl.innerText.trim();
            }

            var userMsg = data.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

            var priceDetails = '';
            if (originalPrice && currentPrice && originalPrice !== currentPrice) {
              priceDetails = "\\n💰 السعر الأصلي: " + originalPrice + "\\n🏷️ السعر بعد الخصم: " + currentPrice;
            } else if (currentPrice) {
              priceDetails = "\\n💰 السعر: " + currentPrice;
            } else if (originalPrice) {
              priceDetails = "\\n💰 السعر: " + originalPrice;
            }

            var finalMsg = userMsg + "\\n\\n" + 
                           "📦 المنتج: " + title + 
                           priceDetails + 
                           "\\n🔗 الرابط: " + url;

            var cleanPhone = data.phone.replace(/[^0-9]/g, '');
            var waUrl = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(finalMsg);

            var btn = document.createElement('div');
            btn.id = 'salla-wa-notify-btn';
            btn.style.cssText = 'margin: 15px 0; width: 100%; clear: both; box-sizing: border-box; display: block;';
            btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:14px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:16px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.3); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>';

            var container = outOfStockNode.closest('form') || outOfStockNode.parentElement;
            if (container) {
              container.appendChild(btn);
            } else {
              outOfStockNode.insertAdjacentElement('afterend', btn);
            }
          })
          .catch(function(err) { console.error("WA Notify Fetch Error:", err); });
      }

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
