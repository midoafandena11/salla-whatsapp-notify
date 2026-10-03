// 5. السكربت المحدث كلياً والمحصن لإظهار الزرار برمجياً ومستقبلياً
app.get('/app-script.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    (function() {
      function checkAndInject() {
        if (document.getElementById('salla-wa-notify-btn')) return;

        var isOutOfStock = false;

        // 1. فحص برمجي مباشر عبر كائن سلة الرسمي (مضمون مع كافة الثيمات)
        if (typeof salla !== 'undefined' && salla.product) {
          if (typeof salla.product.is_out_of_stock === 'function') {
            isOutOfStock = salla.product.is_out_of_stock();
          } else if (salla.product.quantity !== undefined && salla.product.quantity <= 0) {
            isOutOfStock = true;
          }
        }

        // 2. فحص حالة زر الإضافة للسلة المعطل (Out of Stock)
        if (!isOutOfStock) {
          var addBtn = document.querySelector('salla-add-to-cart-button, button[class*="add-to-cart"], .add-to-cart-btn');
          if (addBtn && (addBtn.hasAttribute('disabled') || addBtn.getAttribute('data-status') === 'out-of-stock')) {
            isOutOfStock = true;
          }
        }

        // 3. فحص نصي احترافي شامل لجميع احتمالات الكلمات
        if (!isOutOfStock) {
          var nodes = document.querySelectorAll('button, div, span, p, h1, h2, h3, h4');
          for (var i = 0; i < nodes.length; i++) {
            var t = nodes[i].innerText ? nodes[i].innerText.trim() : '';
            if (t === 'نفدت الكمية' || t === 'نفذت الكمية' || t === 'غير متوفر' || t === 'انتهى المخزون' || t === 'غير متاح' || t === 'نفذت') {
              if (nodes[i].children.length <= 1) {
                isOutOfStock = true;
                break;
              }
            }
          }
        }

        if (!isOutOfStock) return;

        var storeId = '';
        if (typeof salla !== 'undefined' && salla.config) {
          storeId = salla.config.get("store.id") || '';
        }

        fetch('https://salla-whatsapp-notify.onrender.com/api/get-settings?store_id=' + storeId)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (!data || !data.phone) return;

            // جلب اسم المنتج بدقة عالية وتجنب اسم المتجر واللوجو
            var title = '';
            if (typeof salla !== 'undefined' && salla.product && typeof salla.product.getName === 'function') {
              title = salla.product.getName();
            }
            if (!title) {
              var titleEl = document.querySelector('.product-details__title, .product-title, h1.product-title, .main-content h1');
              title = titleEl ? titleEl.innerText.trim() : document.title;
            }

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
            btn.style.cssText = 'margin: 15px 0; width: 100%; clear: both; box-sizing: border-box; display: block;';
            btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:14px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:16px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.3); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>';

            var container = document.querySelector('.product-details, .product-cart-option, form[action*="cart"]') || document.body;
            container.appendChild(btn);
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
});m') || outOfStockNode.parentElement;
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
