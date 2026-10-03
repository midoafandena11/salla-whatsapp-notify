(function() {
  function checkAndInject() {
    if (document.getElementById('salla-wa-notify-btn')) return;

    var isOutOfStock = false;
    var outOfStockNode = null;

    if (typeof salla !== 'undefined' && salla.config) {
      isOutOfStock = salla.config.get("product.is_out_of_stock") === true || 
                     salla.config.get("product.quantity") === 0;
    }

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

        var title = '';
        if (typeof salla !== 'undefined' && salla.config && salla.config.get("product.name")) {
          title = salla.config.get("product.name");
        } else {
          var titleEl = document.querySelector('h1.product-details__title') || 
                        document.querySelector('.product-title') || 
                        document.querySelector('h1');
          title = titleEl ? titleEl.innerText.trim() : document.title;
        }

        var price = '';
        if (typeof salla !== 'undefined' && salla.config && salla.config.get("product.price")) {
          price = salla.config.get("product.price");
        } else {
          var priceEl = document.querySelector('.product-price') || document.querySelector('[class*="price"]');
          price = priceEl ? priceEl.innerText.trim().replace(/\n/g, ' ') : '';
        }

        var url = window.location.href;
        var userMsg = data.message || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

        var finalMsg = userMsg + "\n\n" + 
                       "📦 المنتج: " + title + 
                       (price ? "\n💰 السعر: " + price : "") + 
                       "\n🔗 الرابط: " + url;

        var cleanPhone = data.phone.replace(/[^0-9]/g, '');
        var waUrl = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(finalMsg);

        var btn = document.createElement('div');
        btn.id = 'salla-wa-notify-btn';
        btn.style.cssText = 'margin: 15px 0; width: 100%; clear: both; box-sizing: border-box; display: block;';
        btn.innerHTML = '<a href="' + waUrl + '" target="_blank" style="display:flex; align-items:center; justify-content:center; background:#10b981; color:#ffffff; padding:14px; border-radius:10px; font-weight:bold; text-decoration:none; font-size:16px; width:100%; box-shadow: 0 4px 12px rgba(16,185,129,0.3); text-align:center;">أعلمني عند التوفر عبر الواتساب</a>';

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
