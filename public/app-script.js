(function () {
    'use strict';

    const API_BASE = 'https://salla-whatsapp-notify.onrender.com';
    let merchantId = null, settings = null;

    function getMerchantId() {
        if (merchantId) return merchantId;
        if (window.salla?.config?.get) {
            merchantId = window.salla.config.get('store.id') || window.salla.config.get('merchant_id');
        }
        return merchantId || new URLSearchParams(window.location.search).get('merchant_id');
    }

    async function loadSettings() {
        if (settings) return settings;
        const id = getMerchantId();
        if (!id) return null;
        try {
            const res = await fetch(`${API_BASE}/api/settings?merchant_id=${encodeURIComponent(id)}`);
            const data = await res.json();
            if (data?.success) {
                settings = {
                    number: String(data.whatsappNumber || '').replace(/\D/g, ''),
                    msg: data.customMessage || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
                };
                return settings;
            }
        } catch (e) {}
        return null;
    }

    async function run() {
        const st = await loadSettings();
        if (!st || !st.number) return;

        // تحديد كل أشكال البطاقات في الرئيسية وكافة الصفحات
        const cards = document.querySelectorAll('salla-product-card, .product-entry, .product-card, .product-item, [data-product-id]');

        cards.forEach(card => {
            const text = (card.innerText || card.textContent || '').toLowerCase();
            const isOut = card.hasAttribute('out-of-stock') || 
                          ['out', 'sold-out', 'out-of-stock'].includes(card.getAttribute('product-status')) ||
                          text.includes('نفدت الكمية') || text.includes('نفد المخزون') || text.includes('غير متوفر');

            const existing = card.querySelector('.salla-wa-notify-clean-btn');

            if (!isOut) {
                if (existing) existing.remove();
                return;
            }

            if (existing) return;

            // 1. استخراج رابط المنتج الصحيح من الكارت
            const linkEl = card.querySelector('a[href*="/p/"], a[href*="/product/"]') || card.querySelector('a[href]');
            const productUrl = linkEl ? linkEl.href : window.location.href;

            // 2. استخراج الاسم الصحيح
            const nameEl = card.querySelector('.product-title, [class*="title"], h2, h3, h4');
            const productName = nameEl ? nameEl.textContent.trim().replace(/\s+/g, ' ') : 'منتج';

            // 3. استخراج السعر الصحيح
            const priceEl = card.querySelector('.product-price, [class*="price"], .price');
            const productPrice = priceEl ? priceEl.textContent.trim().replace(/\s+/g, ' ') : '';

            // صياغة الرسالة
            let msg = `${st.msg}\n\nالمنتج: ${productName}`;
            if (productPrice) msg += `\nالسعر: ${productPrice}`;
            msg += `\nالرابط: ${productUrl}`;

            const btn = document.createElement('a');
            btn.className = 'salla-wa-notify-clean-btn';
            btn.href = `https://wa.me/${st.number}?text=${encodeURIComponent(msg)}`;
            btn.target = '_blank';
            btn.rel = 'noopener noreferrer';
            btn.innerHTML = '💬 أبلغني عند التوفر';

            // تصميم وتنسيق الزر بشكل أنيق وعصري
            btn.style.cssText = `
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 6px !important;
                width: calc(100% - 16px) !important;
                margin: 8px auto 6px auto !important;
                padding: 8px 12px !important;
                background-color: #25D366 !important;
                color: #ffffff !important;
                border-radius: 8px !important;
                text-align: center !important;
                text-decoration: none !important;
                font-size: 13px !important;
                font-weight: 600 !important;
                box-sizing: border-box !important;
                transition: transform 0.2s, background-color 0.2s !important;
                clear: both !important;
                position: relative !important;
                z-index: 10 !important;
            `;

            card.appendChild(btn);
        });
    }

    let timer = null;
    function init() {
        run();
        if (document.body) {
            new MutationObserver(() => {
                clearTimeout(timer);
                timer = setTimeout(run, 250);
            }).observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
