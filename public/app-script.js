(function () {
    'use strict';

    const API_BASE = 'https://salla-whatsapp-notify.onrender.com';
    const CARD_BTN_CLASS = 'salla-wa-card-notify-btn';

    let merchantId = null;
    let settings = null;

    function getMerchantId() {
        if (merchantId) return merchantId;
        try {
            if (window.salla?.config?.get) {
                merchantId = window.salla.config.get('store.id') || window.salla.config.get('merchant_id');
            }
        } catch (e) {}
        
        if (!merchantId) {
            try {
                merchantId = new URLSearchParams(window.location.search).get('merchant_id');
            } catch (e) {}
        }
        return merchantId;
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

    function createButtonElement(url) {
        const btn = document.createElement('a');
        btn.className = CARD_BTN_CLASS;
        btn.href = url;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.textContent = '🔔 أبلغني عند التوفر';

        btn.style.cssText = `
            display: block !important;
            width: calc(100% - 16px) !important;
            margin: 8px auto !important;
            padding: 8px 10px !important;
            background-color: #25D366 !important;
            color: #ffffff !important;
            border-radius: 6px !important;
            text-align: center !important;
            text-decoration: none !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            line-height: 1.3 !important;
            box-sizing: border-box !important;
            clear: both !important;
            z-index: 9999 !important;
            position: relative !important;
            visibility: visible !important;
            opacity: 1 !important;
        `;
        return btn;
    }

    async function processCards() {
        const cards = document.querySelectorAll('salla-product-card');
        if (!cards.length) return;

        const st = await loadSettings();
        if (!st || !st.number) return;

        cards.forEach((card) => {
            const shadow = card.shadowRoot;
            const targetContainer = shadow || card;

            // التأكد من حالة نفاد الكمية
            const text = (card.textContent || '') + (shadow ? shadow.textContent : '');
            const isOut = card.hasAttribute('out-of-stock') || 
                          ['out', 'sold-out', 'out-of-stock'].includes(card.getAttribute('product-status')) ||
                          text.includes('نفدت الكمية') || 
                          text.includes('نفد المخزون') || 
                          text.includes('غير متوفر');

            const existing = targetContainer.querySelector(`.${CARD_BTN_CLASS}`);

            if (!isOut) {
                if (existing) existing.remove();
                return;
            }

            if (existing) return;

            // جلب البيانات
            const p = card.product || {};
            const nameEl = targetContainer.querySelector('.product-title, [class*="title"], h2, h3, a[href*="/p/"]');
            const name = p.name || (nameEl ? nameEl.textContent.trim() : 'المنتج');
            
            const priceEl = targetContainer.querySelector('.product-price, [class*="price"], .price');
            const price = p.price?.amount || p.price || (priceEl ? priceEl.textContent.trim() : '');
            
            const linkEl = targetContainer.querySelector('a[href*="/p/"], a[href*="/product/"]');
            const url = p.url || (linkEl ? linkEl.href : window.location.href);

            let finalMsg = `${st.msg}\n\nالمنتج: ${name}`;
            if (price) finalMsg += `\nالسعر: ${price}`;
            finalMsg += `\nالرابط: ${url}`;

            const waUrl = `https://wa.me/${st.number}?text=${encodeURIComponent(finalMsg)}`;
            const btn = createButtonElement(waUrl);

            // الحقن داخل الـ Shadow DOM مباشرة إن وجد
            if (shadow) {
                const footer = shadow.querySelector('.product-card__footer, .product-card__content') || shadow;
                footer.appendChild(btn);
            } else {
                const footer = card.querySelector('.product-card__footer, .product-card__content') || card;
                footer.appendChild(btn);
            }
        });
    }

    function run() {
        processCards();
        setTimeout(processCards, 1000);
        setTimeout(processCards, 2500);
    }

    const observer = new MutationObserver(run);

    function init() {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
        run();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
