const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();
app.use(express.json());

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

// 2. استقبال إشعارات الـ Webhook عند التثبيت
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    const storeId = event?.merchant || event?.data?.merchant_id;

    if (storeId) {
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

// 3. حفظ إعدادات التاجر الدائمة في MongoDB
app.post('/api/save-settings', async (req, res) => {
  try {
    const { storeId, phone, message } = req.body;

    if (!storeId || !phone) {
      return res.status(400).json({ success: false, error: 'رقم المتجر ورقم الواتساب مطلوبان' });
    }

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

    res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح في قاعدة البيانات' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء الحفظ' });
  }
});

// 4. جلب إعدادات التاجر
app.get('/api/get-settings', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const storeId = req.query.store_id;
    if (!storeId) return res.status(400).json({ error: 'Store ID required' });

    const merchant = await merchantsCollection.findOne({ storeId: String(storeId) });
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    res.json({
      phone: merchant.phone,
      message: merchant.message
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. السكربت المحقون (يفحص "نفدت الكمية" فقط ويظهر الزر)
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

        // أ. معرفة رقم المتجر
        var storeId = '';
        try {
          if (typeof salla !== 'undefined' && salla.config) {
            storeId = salla.config.get('store.id') || salla.config.get('store') || '';
            if (typeof storeId === 'object' && storeId.id) storeId = storeId.id;
          }
        } catch(e) {}

        if (!storeId) return;

        // ب. الفحص الدقيق: هل المنتج "نفدت الكمية"؟
        var isOutOfStock = false;

        // 1. فحص كائن سلة البرمجي
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

        // 2. فحص أزرار وعناصر واجهة المتجر (زر غير متاح / شارات نفاد الكمية)
        if (!isOutOfStock) {
          var outOfStockSelectors = [
            '.btn-unavailable',
            '.out-of-stock',
            '.sold-out',
            '.disabled-add-to-cart',
            'salla-add-to-cart-button[disabled]',
            'button[disabled]'
          ];
          for (var i = 0; i < outOfStockSelectors.length; i++) {
            var el = document.querySelector(outOfStockSelectors[i]);
            if (el && el.offsetParent !== null) { // التأكد من أن العنصر ظاهر فعلياً
              isOutOfStock = true;
              break;
            }
          }
        }

        // إذا كان المنتج متوفراً في المخزون، توقف ولا تظهر الزر نهائياً
        if (!isOutOfStock) return;

        // ج. تحديد المكان المناسب لوضع الزر
        var targetNode = document.querySelector('salla-add-to-cart-button') || 
                         document.querySelector('.salla-add-to-cart-button') ||
                         document.querySelector('.btn-unavailable') ||
                         document.querySelector('.product-form') ||
                         document.querySelector('.product-details') ||
                         document.querySelector('button[type="submit"]');

        if (!targetNode) return;

        isInjecting = true;

        // د. جلب رقم التاجر والرسالة من السيرفر وإظهار الزر
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

app.get('/', (req, res) => {
  res.send('Salla WhatsApp Notify Service is Live!');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
