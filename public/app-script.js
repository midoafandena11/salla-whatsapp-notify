(function () {
    'use strict';

    // 1. رقم احتياطي لو الـ API مش راجع برقم (عشان تضمن ظهور الزر فوراً للاختبار)
    const FALLBACK_NUMBER = '201000000000'; // استبدله برقمك للتجربة
    const API_BASE = 'https://salla-whatsapp-notify.onrender.com';

    let settings = null;

    function getMerchantId() {
        try {
            if (window.salla?.config?.get) {
                return window.salla.config.get('store.id') || window.salla.config.get('merchant_id');
            }
        } catch (e) {}
        return new URLSearchParams(window.location.search).get('merchant_id') || 'default';
    }

    async function loadSettings() {
        if (settings) return settings;
        const id = getMerchantId();
        try {
            const res = await fetch(`${API_BASE}/api/settings?merchant_id=${encodeURIComponent(id)}`);
            const data = await res.json();
            if (data?.success && data?.whatsappNumber) {
                settings = {
                    number: String(data.whatsappNumber).replace(/\D/g, ''),
                    msg: data.customMessage || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
                };
                return settings;
            }
        } catch (e) {}
        
        // استخدام الرقم الاحتياطي في حال تعذر الوصول للـ API
        settings = {
            number: FALLBACK_NUMBER,
            msg: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
        };
        return settings;
    }

    async function injectButtons() {
        const st = await loadSettings();
        if (!st || !st.number) return;

        // فحص كل الكروت والمنتجات في أي مكان بالصفحة
        const cards = document.querySelectorAll('salla-product-card, .product-entry, .product-card, .product-item, [data-product-id], article');

        cards.forEach(card => {
            // كشف النص الدال على نفاد الكمية
            const txt = (card.innerText || card.textContent || '').toLowerCase();
            const isOut = card.hasAttribute('out-of-stock') || 
                          ['out', 'sold-out', 'out-of-stock'].includes(card.getAttribute('product-status')) ||
                          txt.includes('نفدت الكمية') || txt.includes('نفد المخزون') || txt.includes('غير متوفر');

            const exist = card.querySelector('.salla-wa-force-btn');

            if (!isOut) {
                if (exist) exist.remove();
                return;
            }

            if (exist) return;

            // جلب بيانات المنتج من روابط الكارت
            const linkEl = card.querySelector('a[href*="/p/"], a[href*="/product/"]') || card.querySelector('a[href]');
            const url = linkEl ? linkEl.href : window.location.href;

            const nameEl = card.querySelector('.product-title, [class*="title"], h2, h3, h4');
            const name = nameEl ? nameEl.textContent.trim().replace(/\s+/g, ' ') : 'منتج';

            const priceEl = card.querySelector('.product-price, [class*="price"], .price');
            const price = priceEl ? priceEl.textContent.trim().replace(/\s+/g, ' ') : '';

            let msg = `${st.msg}\n\nالمنتج: ${name}`;
            if (price) msg += `\nالسعر: ${price}`;
            msg += `\nالرابط: ${url}`;

            const btn = document.createElement('a');
            btn.className = 'salla-wa-force-btn';
            btn.href = `https://wa.me/${st.number}?text=${encodeURIComponent(msg)}`;
            btn.target = '_blank';
            btn.rel = 'noopener noreferrer';
            btn.innerHTML = '💬 أبلغني عند التوفر';

            // تنسيق مباشر يجبر الزر على الظهور أعلى أي عنصر آخر
            btn.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                width: calc(100% - 16px) !important;
                margin: 8px auto !important;
                padding: 8px 10px !important;
                background-color: #25D366 !important;
                color: #ffffff !important;
                border-radius: 6px !important;
                text-align: center !important;
                text-decoration: none !important;
                font-size: 13px !important;
                font-weight: 700 !important;
                box-sizing: border-box !important;
                clear: both !important;
                position: relative !important;
                z-index: 99999 !important;
            `;

            card.appendChild(btn);
        });
    }

    function start() {
        injectButtons();
        setTimeout(injectButtons, 1000);
        setTimeout(injectButtons, 2500);

        if (document.body) {
            new MutationObserver(injectButtons).observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
