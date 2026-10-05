const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. الاتصال بقاعدة البيانات الدائمة MongoDB
const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = 'salla_whatsapp_app';
let db, merchantsCollection;

async function connectDB() {
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI غير مضبوط في Render');
    return;
  }
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    merchantsCollection = db.collection('merchants');
    await merchantsCollection.createIndex({ storeId: 1 }, { unique: true });
    console.log('✓ تم الاتصال بقاعدة البيانات MongoDB بنجاح');
  } catch (err) {
    console.error('✗ خطأ أثناء الاتصال بقاعدة البيانات:', err.message);
  }
}
connectDB();

// CORS Headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 2. استقبال إشعارات الـ Webhook عند التثبيت
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    const storeId = event?.merchant || event?.data?.merchant_id;

    if (storeId && merchantsCollection) {
      await merchantsCollection.updateOne(
        { storeId: String(storeId) },
        { 
          $set: { 
            storeId: String(storeId),
            updatedAt: new Date()
          } 
        },
        { upsert: true }
      );
    }
    res.status(200).send('Webhook Received');
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// 3. لوحة تحكم التاجر (تظهر عند فتح التطبيق من منصة سلة)
app.get('/', async (req, res) => {
  const storeId = req.query.merchant_id || req.query.store_id || '';

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>إعدادات التنبيه عبر الواتساب</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.rtl.min.css" rel="stylesheet">
      <style>
        body { background-color: #f8f9fa; font-family: system-ui, -apple-system, sans-serif; padding: 30px 15px; }
        .card { max-width: 600px; margin: 0 auto; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: none; }
        .btn-success { background-color: #10b981; border: none; padding: 12px; font-weight: bold; border-radius: 8px; }
        .btn-success:hover { background-color: #059669; }
        .alert { display: none; border-radius: 8px; }
      </style>
    </head>
    <body>
      <div class="card p-4">
        <h3 class="mb-3 text-center">إعدادات تنبيهات الواتساب 💬</h3>
        <p class="text-muted text-center mb-4">قم بضبط رقم الواتساب الخاص بمتجرك والرسالة التي سيرسلها العميل عند طلب منتج منتهي.</p>
        
        <div id="alertBox" class="alert alert-success"></div>

        <form id="settingsForm">
          <input type="hidden" id="storeId" value="${storeId}">
          
          <div class="mb-3">
            <label class="form-label fw-bold">رقم الواتساب (شامل المفتاح الدولي без +):</label>
            <input type="text" id="phone" class="form-control" placeholder="966500000000" required>
            <div class="form-text">مثال للسعودية: 966500000000 | لمصر: 201000000000</div>
          </div>

          <div class="mb-3">
            <label class="form-label fw-bold">نص الرسالة التلقائية:</label>
            <textarea id="message" class="form-control" rows="3" placeholder="هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج."></textarea>
          </div>

          <button type="submit" class="btn btn-success w-100">حفظ الإعدادات</button>
        </form>
      </div>

      <script>
        const storeId = document.getElementById('storeId').value;
        
        if (storeId) {
          fetch('/api/get-settings?store_id=' + storeId)
            .then(r => r.json())
            .then(data => {
              if (data && data.phone) {
                document.getElementById('phone').value = data.phone || '';
                document.getElementById('message').value = data.message || '';
              }
            }).catch(e => console.error(e));
        }

        document.getElementById('settingsForm').addEventListener('submit', function(e) {
          e.preventDefault();
          const phone = document.getElementById('phone').value.trim();
          const message = document.getElementById('message').value.trim();
          const alertBox = document.getElementById('alertBox');

          fetch('/api/save-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeId, phone, message })
          })
          .then(r => r.json())
          .then(data => {
            if(data.success) {
              alertBox.className = 'alert alert-success';
              alertBox.innerText = '✅ تم حفظ الإعدادات بنجاح في قاعدة البيانات!';
              alertBox.style.display = 'block';
            } else {
              alertBox.className = 'alert alert-danger';
              alertBox.innerText = '❌ ' + (data.error || 'حدث خطأ أثناء الحفظ');
              alertBox.style.display = 'block';
            }
          })
          .catch(err => {
            alertBox.className = 'alert alert-danger';
            alertBox.innerText = '❌ تعذر الاتصال بالسيرفر';
            alertBox.style.display = 'block';
          });
        });
      </script>
    </body>
    </html>
  `);
});

// 4. حفظ إعدادات التاجر في MongoDB
app.post('/api/save-settings', async (req, res) => {
  try {
    const { storeId, phone, message } = req.body;

    if (!storeId || !phone) {
      return res.status(400).json({ success: false, error: 'رقم المتجر ورقم الواتساب مطلوبان' });
    }

    if (merchantsCollection) {
      await merchantsCollection.updateOne(
        { storeId: String(storeId) },
        {
          $set: {
            storeId: String(storeId),
            phone: phone,
            message: message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.',
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }

    res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء الحفظ' });
  }
});

// 5. جلب الإعدادات
app.get('/api/get-settings', async (req, res) => {
  try {
    const storeId = req.query.store_id;
    if (!storeId) return res.status(400).json({ error: 'Store ID required' });

    let merchant = null;
    if (merchantsCollection) {
      merchant = await merchantsCollection.findOne({ storeId: String(storeId) });
    }

    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    res.json({
      phone: merchant.phone,
      message: merchant.message
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 6. السكربت المحقون لصفحة المنتج (يظهر فقط عند نفاد الكمية)
app.get('/app-script.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.send(`
    (function() {
      var isInjecting = false;

      function injectButton() {
        if (document.getElementById('salla-wa-notify-btn')) return;
        if (isInjecting) return;

        var storeId = '';
        try {
          if (typeof salla !== 'undefined' && salla.config) {
            storeId = salla.config.get('store.id') || salla.config.get('store') || '';
            if (typeof storeId === 'object' && storeId.id) storeId = storeId.id;
          }
        } catch(e) {}

        if (!storeId) return;

        // الفحص الدقيق لشروط نفاد الكمية
        var isOutOfStock = false;

        try {
          if (typeof salla !== 'undefined' && salla.config) {
            var productData = salla.config.get('product');
            if (productData) {
              if (productData.is_out_of_stock || productData.quantity === 0 || productData.status === 'out_of_stock') {
                isOutOfStock = true;
              }
            }
          }
        } catch(e) {}

        if (!isOutOfStock) {
          var selectors = ['.btn-unavailable', '.out-of-stock', '.sold-out', 'salla-add-to-cart-button[disabled]'];
          for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (el && el.offsetParent !== null) {
              isOutOfStock = true;
              break;
            }
          }
        }

        if (!isOutOfStock) return;

        var targetNode = document.querySelector('salla-add-to-cart-button') || 
                         document.querySelector('.salla-add-to-cart-button') ||
                         document.querySelector('.btn-unavailable') ||
                         document.querySelector('.product-form') ||
                         document.querySelector('button[type="submit"]');

        if (!targetNode) return;

        isInjecting = true;

        fetch('https://salla-whatsapp-notify.onrender.com/api/get-settings?store_id=' + storeId)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            isInjecting = false;

            if (!data || !data.phone) return;
            if (document.getElementById('salla-wa-notify-btn')) return;

            var title = '';
            if (typeof salla !== 'undefined' && salla.config && salla.config.get('product.name')) {
              title = salla.config.get('product.name');
            } else {
              var h1El = document.querySelector('h1:not(.header-logo)');
              title = h1El ? h1El.innerText.trim() : document.title;
            }

            var url = window.location.href;
            var userMsg = data.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

            var finalMsg = userMsg + "\\n\\n" + 
                           "📦 المنتج: " + title + 
                           "\\n🔗 الرابط: " + url;

            var cleanPhone = data.phone.replace(/[^0-9]/g, '');
            var waUrl = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(finalMsg);

            var btn = document.createElement('div');
            btn.id = 'salla-wa-notify-btn';
            btn.style.cssText = 'margin: 15px 0; width: 100%; clear: both; display: block; z-index: 99;';
            btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:14px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:16px; width:100%; text-align:center; box-shadow: 0 4px 12px rgba(16,185,129,0.3);">أعلمني عند التوفر عبر الواتساب</a>';

            targetNode.parentNode.insertBefore(btn, targetNode.nextSibling);
          })
          .catch(function(err) {
            isInjecting = false;
            console.error("WA Notify Error:", err);
          });
      }

      setInterval(injectButton, 1000);
    })();
  `);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
