const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();
app.use(express.json());

// 1. إعدادات قاعدة البيانات MongoDB
const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = 'salla_whatsapp_app';
let db, merchantsCollection;

async function connectDB() {
  if (!MONGO_URI) {
    console.error('❌ خطأ: لم يتم ضبط متغير البيئة MONGODB_URI في Render');
    return;
  }
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    merchantsCollection = db.collection('merchants');
    // إنشاء الفهرس لضمان سرعة البحث وعدم التكرار على مستوى قاعدة البيانات
    await merchantsCollection.createIndex({ storeId: 1 }, { unique: true });
    console.log('✓ تم الاتصال بقاعدة البيانات MongoDB بنجاح');
  } catch (err) {
    console.error('✗ خطأ أثناء الاتصال بقاعدة البيانات:', err.message);
  }
}
connectDB();

// 2. استقبال إشعارات Webhook عند تثبيت التطبيق أو تحديثه من متجر سلة
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    const storeId = event?.merchant || event?.data?.merchant_id;

    if (storeId) {
      // استخدام upsert لمنع تكرار التاجر نهائياً وتحديث بياناته القديمة
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
    console.error('Webhook Error:', err);
    res.status(500).send('Server Error');
  }
});

// 3. حفظ/تعديل إعدادات التاجر (رقم الواتساب والرسالة)
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

    res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });
  } catch (err) {
    console.error('Save Settings Error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء الحفظ' });
  }
});

// 4. استرجاع إعدادات التاجر للسكربت المحقون
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

// 5. السكربت المحقون لزر الواتساب المطور لكل ثيمات سلة
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

        // 1. استخراج ID المتجر من كائن salla البرمجي
        var storeId = '';
        try {
          if (typeof salla !== 'undefined' && salla.config) {
            storeId = salla.config.get('store.id') || salla.config.get('store') || '';
            if (typeof storeId === 'object' && storeId.id) storeId = storeId.id;
          }
        } catch(e) {}

        if (!storeId) return;

        // 2. فحص حالة المنتج عبر كائن سلة الأصلي (is_out_of_stock)
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

        // إذا لم نتأكد برمجياً، نفحص العناصر والشارات في تصميم الصفحة
        if (!isOutOfStock) {
          var outOfStockElements = document.querySelectorAll('.out-of-stock, .btn-unavailable, .sold-out, .disabled-add-to-cart');
          if (outOfStockElements.length > 0) {
            isOutOfStock = true;
          }
        }

        // 3. اختيار الحاوية أو الزر المناسب لحقن زر الواتساب عنده
        var targetNode = document.querySelector('salla-add-to-cart-button') || 
                         document.querySelector('.salla-add-to-cart-button') ||
                         document.querySelector('.btn-unavailable') ||
                         document.querySelector('.product-form') ||
                         document.querySelector('.product-details') ||
                         document.querySelector('.product-single__meta') ||
                         document.querySelector('button[type="submit"]');

        if (!targetNode) return;

        isInjecting = true;

        // 4. جلب الإعدادات المحفوظة للتاجر
        fetch('https://salla-whatsapp-notify.onrender.com/api/get-settings?store_id=' + storeId)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            isInjecting = false;

            if (!data || !data.phone) return;
            if (document.getElementById('salla-wa-notify-btn')) return;

            // جلب عنوان المنتج
            var title = '';
            if (typeof salla !== 'undefined' && salla.config && salla.config.get('product.name')) {
              title = salla.config.get('product.name');
            } else {
              var h1El = document.querySelector('h1:not(.header-logo)');
              title = h1El ? h1El.innerText.trim() : document.title;
              if (title.indexOf('-') !== -1) title = title.split('-')[0].trim();
              if (title.indexOf('|') !== -1) title = title.split('|')[0].trim();
            }

            var url = window.location.href;
            var currentPrice = '';
            var originalPrice = '';

            var regularPriceEl = document.querySelector('.price-before, .regular-price, .line-through');
            var salePriceEl = document.querySelector('.product-price, .price-after, .sale-price');

            if (regularPriceEl) originalPrice = regularPriceEl.innerText.trim();
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

            // إنشاء وبناء الزر
            var btn = document.createElement('div');
            btn.id = 'salla-wa-notify-btn';
            btn.style.cssText = 'margin: 15px 0; width: 100%; clear: both; display: block; position: relative; z-index: 99;';
            btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:14px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:16px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.3); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>';

            targetNode.parentNode.insertBefore(btn, targetNode.nextSibling);
          })
          .catch(function(err) {
            isInjecting = false;
            console.error("WA Notify Fetch Error:", err);
          });
      }

      setInterval(injectButton, 1000);
    })();
  `);
});

// الصفحة الرئيسية لتأكيد عمل السيرفر
app.get('/', (req, res) => {
  res.send('Salla WhatsApp Notify Service is Live!');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
