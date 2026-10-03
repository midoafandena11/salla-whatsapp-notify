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

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('لم يتم استلام رمز التفويض من سلة');

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
      return res.status(400).send('فشل الربط مع سلة: ' + (tokenData.error_description || tokenData.message));
    }

    const access_token = tokenData.access_token;
    const userRes = await fetch('https://accounts.salla.sa/oauth2/user/info', {
      headers: { 
        'Authorization': 'Bearer ' + access_token,
        'Accept': 'application/json'
      }
    });
    
    const userData = await userRes.json();
    const storeId = userData.data && userData.data.store ? String(userData.data.store.id) : (userData.data ? String(userData.data.id) : 'demo');

    storesDatabase[storeId] = {
      accessToken: access_token,
      phone: storesDatabase[storeId]?.phone || '',
      message: storesDatabase[storeId]?.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
    };

    await injectScriptToStore(storeId, access_token);
    res.redirect('/dashboard?store_id=' + storeId + '&installed=true');

  } catch (error) {
    res.status(500).send('حدث خطأ أثناء عملية الربط: ' + error.message);
  }
});

async function injectScriptToStore(storeId, token) {
  try {
    await fetch('https://api.salla.dev/store/v1/script-tokens', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        name: 'WhatsApp Notify Script',
        script: 'https://salla-whatsapp-notify.onrender.com/app-script.js',
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
  const storeData = storesDatabase[storeId] || { phone: '', message: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.' };

  res.send('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>إعدادات التطبيق</title><style>body { font-family: sans-serif; padding: 20px; }</style></head><body><h2>إعدادات تنبيه الواتساب</h2>' + (saved ? '<p style="color:green;">تم الحفظ بنجاح!</p>' : '') + '<form action="/save-settings" method="POST"><input type="hidden" name="store_id" value="' + storeId + '"><label>رقم الواتساب:</label><br><input type="text" name="phone" value="' + storeData.phone + '" required><br><br><label>الرسالة:</label><br><textarea name="message" required>' + storeData.message + '</textarea><br><br><button type="submit">حفظ</button></form></body></html>');
});

app.post('/save-settings', (req, res) => {
  const { store_id, phone, message } = req.body;
  if (!storesDatabase[store_id]) storesDatabase[store_id] = {};
  storesDatabase[store_id].phone = phone;
  storesDatabase[store_id].message = message;
  storesDatabase['default'] = { phone, message };
  res.redirect('/dashboard?store_id=' + store_id + '&saved=true');
});

app.get('/api/get-settings', (req, res) => {
  const storeId = req.query.store_id;
  const data = storesDatabase[storeId] || storesDatabase['default'] || { phone: '', message: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.' };
  res.json(data);
});

// إرجاع كود الفرونت إند كنص عادي عشان Node.js ما يتلخبطش في الأقواس
app.get('/app-script.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  
  const clientScript = [
    '(function() {',
    '  function checkAndInject() {',
    '    if (document.getElementById("salla-wa-notify-btn")) return;',
    '    var isOutOfStock = false;',
    '    var outOfStockNode = null;',
    '    if (typeof salla !== "undefined" && salla.config) {',
    '      if (salla.config.get("product.is_out_of_stock") === true || salla.config.get("product.quantity") === 0) {',
    '        isOutOfStock = true;',
    '      }',
    '    }',
    '    var nodes = document.querySelectorAll("button, div, span, p, h1, h2, h3, h4, salla-button");',
    '    for (var i = 0; i < nodes.length; i++) {',
    '      var t = nodes[i].innerText ? nodes[i].innerText.trim() : "";',
    '      if ((t === "نفدت الكمية" || t === "نفذت الكمية" || t === "غير متوفر" || t === "انتهت الكمية") && nodes[i].children.length <= 1) {',
    '        isOutOfStock = true;',
    '        outOfStockNode = nodes[i];',
    '        break;',
    '      }',
    '    }',
    '    if (!isOutOfStock) return;',
    '    var storeId = "";',
    '    if (typeof salla !== "undefined" && salla.config) {',
    '      storeId = salla.config.get("store.id") || "";',
    '    }',
    '    fetch("https://salla-whatsapp-notify.onrender.com/api/get-settings?store_id=" + storeId)',
    '      .then(function(r) { return r.json(); })',
    '      .then(function(data) {',
    '        if (!data || !data.phone) return;',
    '        var title = "";',
    '        if (typeof salla !== "undefined" && salla.config && salla.config.get("product.name")) {',
    '          title = salla.config.get("product.name");',
    '        } else {',
    '          var titleEl = document.querySelector("h1.product-details__title") || document.querySelector(".product-title") || document.querySelector("h1");',
    '          title = titleEl ? titleEl.innerText.trim() : document.title;',
    '        }',
    '        var price = "";',
    '        if (typeof salla !== "undefined" && salla.config && salla.config.get("product.price")) {',
    '          price = salla.config.get("product.price");',
    '        } else {',
    '          var priceEl = document.querySelector(".product-price") || document.querySelector("[class*=\\"price\\"]");',
    '          price = priceEl ? priceEl.innerText.trim().replace(/\\n/g, " ") : "";',
    '        }',
    '        var url = window.location.href;',
    '        var userMsg = data.message || "هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.";',
    '        var finalMsg = userMsg + "\\n\\n" + "📦 المنتج: " + title + (price ? "\\n💰 السعر: " + price : "") + "\\n🔗 الرابط: " + url;',
    '        var cleanPhone = data.phone.replace(/[^0-9]/g, "");',
    '        var waUrl = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(finalMsg);',
    '        var btn = document.createElement("div");',
    '        btn.id = "salla-wa-notify-btn";',
    '        btn.style.cssText = "margin: 15px 0; width: 100%; clear: both; box-sizing: border-box; display: block;";',
    '        btn.innerHTML = \'<a href="\' + waUrl + \'" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:14px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:16px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.3); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>\';',
    '        var targetContainer = null;',
    '        if (outOfStockNode) {',
    '          targetContainer = outOfStockNode.closest("form") || outOfStockNode.parentElement;',
    '        }',
    '        if (!targetContainer) {',
    '          targetContainer = document.querySelector("salla-add-to-cart-button") || document.querySelector(".product-form") || document.querySelector("form[action*=\\"cart\\"]") || document.querySelector(".product-details");',
    '        }',
    '        if (targetContainer) {',
    '          targetContainer.appendChild(btn);',
    '        } else if (outOfStockNode) {',
    '          outOfStockNode.insertAdjacentElement("afterend", btn);',
    '        }',
    '      })',
    '      .catch(function(err) { console.error("WA Notify Fetch Error:", err); });',
    '  }',
    '  if (document.readyState === "loading") {',
    '    document.addEventListener("DOMContentLoaded", function() { setInterval(checkAndInject, 1000); });',
    '  } else {',
    '    setInterval(checkAndInject, 1000);',
    '  }',
    '})();'
  ].join('\n');

  res.send(clientScript);
});

app.post('/webhooks', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
