app.get('/app-script.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    (function() {
      function checkAndInject() {
        if (document.getElementById('salla-wa-notify-btn')) return;

        var isOutOfStock = false;
        var outOfStockNode = null;

        // 1. التحقق الأساسي والرسمي من سلة
        if (typeof salla !== 'undefined' && salla.config) {
          isOutOfStock = salla.config.get("product.is_out_of_stock") === true || 
                         salla.config.get("product.quantity") === 0;
        }

        // 2. فحص احتياطي للنصوص في حال اختلاف الثيمات
        var nodes = document.querySelectorAll('button, div, span, p, h1, h2, h3, h4, salla-button');
        for (var i = 0; i < nodes.length; i++) {
          var t = nodes[i].innerText ? nodes[i].innerText.trim() : '';
          if ((t === 'نفدت الكمية' || t === 'نفذت الكمية' || t === 'غير متوفر' || t === 'انتهت الكمية') && nodes[i].children.length <= 1) {
            isOutOfStock = true;
            outOfStockNode = nodes[i];
            break;
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

            // جلب اسم المنتج المباشر والدقيق من سلة
            var title = '';
            if (typeof salla !== 'undefined' && salla.config && salla.config.get("product.name")) {
              title = salla.config.get("product.name");
            } else {
              var titleEl = document.querySelector('h1.product-details__title') || 
                            document.querySelector('.product-title') || 
                            document.querySelector('h1');
              title = titleEl ? titleEl.innerText.trim() : document.title;
            }

            // جلب السعر المباشر والدقيق من سلة
            var price = '';
            if (typeof salla !== 'undefined' && salla.config && salla.config.get("product.price")) {
              price = salla.config.get("product.price");
            } else {
              var priceEl = document.querySelector('.product-price') || document.querySelector('[class*="price"]');
              price = priceEl ? priceEl.innerText.trim().replace(/\\n/g, ' ') : '';
            }

            var url = window.location.href;
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

            // تحديد مكان الحقن ليعمل في نفس المكان مع كل الثيمات
            var targetContainer = null;
            if (outOfStockNode) {
              targetContainer = outOfStockNode.closest('form') || outOfStockNode.parentElement;
            }
            if (!targetContainer) {
              targetContainer = document.querySelector('salla-add-to-cart-button') || 
                                document.querySelector('.product-form') || 
                                document.querySelector('form[action*="cart"]') || 
                                document.querySelector('.product-details');
            }

            if (targetContainer) {
              targetContainer.appendChild(btn);
            } else if (outOfStockNode) {
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
});t-decoration:none; font-size:16px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.3); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>';
‏
‏            // مكان الحقن المباشر
‏            var container = outOfStockNode.closest('form') || outOfStockNode.parentElement;
‏            if (container) {
‏              container.appendChild(btn);
‏            } else {
‏              outOfStockNode.insertAdjacentElement('afterend', btn);
‏            }
‏          })
‏          .catch(function(err) { console.error("WA Notify Fetch Error:", err); });
‏      }
‏
‏      // تشغيل الفحص التلقائي
‏      if (document.readyState === 'loading') {
‏        document.addEventListener('DOMContentLoaded', function() { setInterval(checkAndInject, 1000); });
‏      } else {
‏        setInterval(checkAndInject, 1000);
‏      }
‏    })();
‏  `);
‏});
‏
‏app.post('/webhooks', (req, res) => {
‏  res.status(200).send('OK');
‏});
‏
‏const PORT = process.env.PORT || 3000;
‏app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
‏dText.indexOf('انتهى المخزون') !== -1) {
        var titleEl = card.querySelector('.product-title, .product-card__title, h2, h3, a[href*="/p-"]');
        var title = titleEl ? titleEl.innerText.trim() : 'منتج';
        var linkEl = card.querySelector('a[href*="/p-"]') || card.querySelector('a');
        var url = linkEl ? linkEl.href : window.location.href;
        var price = getCleanPrice(card);
        var waUrl = createWaUrl(data, title, price, url);
        var btn = createButtonElement(waUrl, 'card');
        card.appendChild(btn);
      }
    });
  }

  function getCleanPrice(parentContext) {
    var priceEl = parentContext.querySelector('.product-price, .price, [class*="price"]');
    if (!priceEl) return '';
    var clone = priceEl.cloneNode(true);
    var strikethroughs = clone.querySelectorAll('del, .line-through, [style*="line-through"], .old-price, .price-before');
    strikethroughs.forEach(function(el) { el.remove(); });
    return clone.innerText.trim().split('\\n')[0];
  }

  function createWaUrl(data, title, price, url) {
    var userMsg = data.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';
    var finalMsg = userMsg + '\\n\\n' + '📦 المنتج: ' + title + (price ? '\\n💰 السعر: ' + price : '') + '\\n🔗 الرابط: ' + url;
    var cleanPhone = data.phone.replace(/[^0-9]/g, '');
    return 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(finalMsg);
  }

  function createButtonElement(waUrl, type) {
    var btn = document.createElement('div');
    if (type === 'full') {
      btn.id = 'salla-wa-notify-btn';
      btn.style.cssText = 'margin: 12px 0; width: 100%; clear: both; box-sizing: border-box; display: block;';
      btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:12px 16px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:15px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.25); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>';
    } else {
      btn.className = 'salla-wa-card-btn';
      btn.style.cssText = 'margin-top: 8px; width: 100%; box-sizing: border-box;';
      btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:8px 10px; border-radius:8px; font-weight:bold; text-decoration:none; font-size:13px; width:100%; text-align:center;">أعلمني عند التوفر</a>';
    }
    return btn;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setInterval(checkAndInject, 1000); });
  } else {
    setInterval(checkAndInject, 1000);
  }
})();
  `;

  res.send(clientScript);
});

app.post('/webhooks', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));t-decoration:none; font-size:16px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.3); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>';
‏
‏            // مكان الحقن المباشر
‏            var container = outOfStockNode.closest('form') || outOfStockNode.parentElement;
‏            if (container) {
‏              container.appendChild(btn);
‏            } else {
‏              outOfStockNode.insertAdjacentElement('afterend', btn);
‏            }
‏          })
‏          .catch(function(err) { console.error("WA Notify Fetch Error:", err); });
‏      }
‏
‏      // تشغيل الفحص التلقائي
‏      if (document.readyState === 'loading') {
‏        document.addEventListener('DOMContentLoaded', function() { setInterval(checkAndInject, 1000); });
‏      } else {
‏        setInterval(checkAndInject, 1000);
‏      }
‏    })();
‏  `);
‏});
‏
‏app.post('/webhooks', (req, res) => {
‏  res.status(200).send('OK');
‏});
‏
‏const PORT = process.env.PORT || 3000;
‏app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
‏   "  }",
    "  function processCatalogCards(data) {",
    "    var cards = document.querySelectorAll('salla-product-card, .product-card, .product-item, div[class*=\"product-card\"]');",
    "    cards.forEach(function(card) {",
    "      if (card.querySelector('.salla-wa-card-btn')) return;",
    "      var cardText = card.innerText || '';",
    "      if (cardText.indexOf('نفدت الكمية') !== -1 || cardText.indexOf('نفذت الكمية') !== -1 || cardText.indexOf('انتهى المخزون') !== -1) {",
    "        var titleEl = card.querySelector('.product-title, .product-card__title, h2, h3, a[href*=\"/p-\"]');",
    "        var title = titleEl ? titleEl.innerText.trim() : 'منتج';",
    "        var linkEl = card.querySelector('a[href*=\"/p-\"]') || card.querySelector('a');",
    "        var url = linkEl ? linkEl.href : window.location.href;",
    "        var price = getCleanPrice(card);",
    "        var waUrl = createWaUrl(data, title, price, url);",
    "        var btn = createButtonElement(waUrl, 'card');",
    "        card.appendChild(btn);",
    "      }",
    "    });",
    "  }",
    "  function getCleanPrice(parentContext) {",
    "    var priceEl = parentContext.querySelector('.product-price, .price, [class*=\"price\"]');",
    "    if (!priceEl) return '';",
    "    var clone = priceEl.cloneNode(true);",
    "    var strikethroughs = clone.querySelectorAll('del, .line-through, [style*=\"line-through\"], .old-price, .price-before');",
    "    strikethroughs.forEach(function(el) { el.remove(); });",
    "    return clone.innerText.trim().split('\\n')[0];",
    "  }",
    "  function createWaUrl(data, title, price, url) {",
    "    var userMsg = data.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';",
    "    var finalMsg = userMsg + '\\n\\n' + '📦 المنتج: ' + title + (price ? '\\n💰 السعر: ' + price : '') + '\\n🔗 الرابط: ' + url;",
    "    var cleanPhone = data.phone.replace(/[^0-9]/g, '');",
    "    return 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(finalMsg);",
    "  }",
    "  function createButtonElement(waUrl, type) {",
    "    var btn = document.createElement('div');",
    "    if (type === 'full') {",
    "      btn.id = 'salla-wa-notify-btn';",
    "      btn.style.cssText = 'margin: 12px 0; width: 100%; clear: both; box-sizing: border-box; display: block;';",
    "      btn.innerHTML = '<a href=\"' + waUrl + '\" target=\"_blank\" style=\"display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:12px 16px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:15px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.25); text-align:center;\">أعلمني عند التوفر عبر الواتساب</a>';",
    "    } else {",
    "      btn.className = 'salla-wa-card-btn';",
    "      btn.style.cssText = 'margin-top: 8px; width: 100%; box-sizing: border-box;';",
    "      btn.innerHTML = '<a href=\"' + waUrl + '\" target=\"_blank\" style=\"display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:8px 10px; border-radius:8px; font-weight:bold; text-decoration:none; font-size:13px; width:100%; text-align:center;\">أعلمني عند التوفر</a>';",
    "    }",
    "    return btn;",
    "  }",
    "  if (document.readyState === 'loading') {",
    "    document.addEventListener('DOMContentLoaded', function() { setInterval(checkAndInject, 1000); });",
    "  } else {",
    "    setInterval(checkAndInject, 1000);",
    "  }",
    "})();"
  ].join('\n');

  res.send(scriptText);
});

app.post('/webhooks', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));ntainer.parentNode.insertBefore(btn, targetContainer.nextSibling);
        }
      }

      function processCatalogCards(data) {
        var cards = document.querySelectorAll('salla-product-card, .product-card, .product-item, div[class*="product-card"]');
        cards.forEach(function(card) {
          if (card.querySelector('.salla-wa-card-btn')) return;

          var cardText = card.innerText || '';
          if (cardText.indexOf('نفدت الكمية') !== -1 || cardText.indexOf('نفذت الكمية') !== -1 || cardText.indexOf('انتهى المخزون') !== -1) {
            var titleEl = card.querySelector('.product-title, .product-card__title, h2, h3, a[href*="/p-"]');
            var title = titleEl ? titleEl.innerText.trim() : 'منتج';

            var linkEl = card.querySelector('a[href*="/p-"]') || card.querySelector('a');
            var url = linkEl ? linkEl.href : window.location.href;

            var price = getCleanPrice(card);
            var waUrl = createWaUrl(data, title, price, url);

            var btn = createButtonElement(waUrl, 'card');
            card.appendChild(btn);
          }
        });
      }

      function getCleanPrice(parentContext) {
        var priceEl = parentContext.querySelector('.product-price, .price, [class*="price"]');
        if (!priceEl) return '';

        var clone = priceEl.cloneNode(true);
        var strikethroughs = clone.querySelectorAll('del, .line-through, [style*="line-through"], .old-price, .price-before');
        strikethroughs.forEach(function(el) { el.remove(); });

        return clone.innerText.replace(/\\s+/g, ' ').trim();
      }

      function createWaUrl(data, title, price, url) {
        var userMsg = data.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';
        var finalMsg = userMsg + "\\n\\n" + 
                       "📦 المنتج: " + title + 
                       (price ? "\\n💰 السعر: " + price : "") + 
                       "\\n🔗 الرابط: " + url;

        var cleanPhone = data.phone.replace(/[^0-9]/g, '');
        return "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(finalMsg);
      }

      function createButtonElement(waUrl, type) {
        var btn = document.createElement('div');
        if (type === 'full') {
          btn.id = 'salla-wa-notify-btn';
          btn.style.cssText = 'margin: 12px 0; width: 100%; clear: both; box-sizing: border-box; display: block;';
          btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:12px 16px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:15px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.25); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>';
        } else {
          btn.className = 'salla-wa-card-btn';
          btn.style.cssText = 'margin-top: 8px; width: 100%; box-sizing: border-box;';
          btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:8px 10px; border-radius:8px; font-weight:bold; text-decoration:none; font-size:13px; width:100%; text-align:center;">أعلمني عند التوفر</a>';
        }
        return btn;
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setInterval(checkAndInject, 1000); });
      } else {
        setInterval(checkAndInject, 1000);
      }
    })();
  `;
  res.send(scriptContent);
});

app.post('/webhooks', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));     document.querySelector('.product-cart-option') || 
                              document.querySelector('.product-details') || 
                              addBtn;

        if (targetContainer && targetContainer.parentNode) {
          targetContainer.parentNode.insertBefore(btn, targetContainer.nextSibling);
        }
      }

      function processCatalogCards(data) {
        var cards = document.querySelectorAll('salla-product-card, .product-card, .product-item, div[class*="product-card"]');
        cards.forEach(function(card, idx) {
          if (card.querySelector('.salla-wa-card-btn')) return;

          var cardText = card.innerText || '';
          if (cardText.indexOf('نفدت الكمية') !== -1 || cardText.indexOf('نفذت الكمية') !== -1 || cardText.indexOf('انتهى المخزون') !== -1) {
            var titleEl = card.querySelector('.product-title, .product-card__title, h2, h3, a[href*="/p-"]');
            var title = titleEl ? titleEl.innerText.trim() : 'منتج';

            var linkEl = card.querySelector('a[href*="/p-"]') || card.querySelector('a');
            var url = linkEl ? linkEl.href : window.location.href;

            var price = getCleanPrice(card);
            var waUrl = createWaUrl(data, title, price, url);

            var btn = createButtonElement(waUrl, 'card');
            card.appendChild(btn);
          }
        });
      }

      function getCleanPrice(parentContext) {
        // البحث عن العناصر التي تحتوي على السعر واستبعاد العناصر المشطوبة del أو line-through
        var priceEl = parentContext.querySelector('.product-price, .price, [class*="price"]');
        if (!priceEl) return '';

        // عمل نسخة لتنظيفها من العناصر المشطوبة
        var clone = priceEl.cloneNode(true);
        var strikethroughs = clone.querySelectorAll('del, .line-through, [style*="line-through"], .old-price, .price-before');
        strikethroughs.forEach(function(el) { el.remove(); });

        return clone.innerText.replace(/\\s+/g, ' ').trim();
      }

      function createWaUrl(data, title, price, url) {
        var userMsg = data.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';
        var finalMsg = userMsg + "\\n\\n" + 
                       "📦 المنتج: " + title + 
                       (price ? "\\n💰 السعر: " + price : "") + 
                       "\\n🔗 الرابط: " + url;

        var cleanPhone = data.phone.replace(/[^0-9]/g, '');
        return "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(finalMsg);
      }

      function createButtonElement(waUrl, type) {
        var btn = document.createElement('div');
        if (type === 'full') {
          btn.id = 'salla-wa-notify-btn';
          btn.style.cssText = 'margin: 12px 0; width: 100%; clear: both; box-sizing: border-box; display: block;';
          btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:12px 16px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:15px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.25); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>';
        } else {
          btn.className = 'salla-wa-card-btn';
          btn.style.cssText = 'margin-top: 8px; width: 100%; box-sizing: border-box;';
          btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:8px 10px; border-radius:8px; font-weight:bold; text-decoration:none; font-size:13px; width:100%; text-align:center;">أعلمني عند التوفر</a>';
        }
        return btn;
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setInterval(checkAndInject, 1000); });
      } else {
        setInterval(checkAndInject, 1000);
      }
    })();
  `;
  res.send(scriptContent);
});

app.post('/webhooks', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));;
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
  `;
  res.send(scriptContent);
});

app.post('/webhooks', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
