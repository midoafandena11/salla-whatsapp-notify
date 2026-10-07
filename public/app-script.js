(function () {
    'use strict';

    const API_BASE = 'https://salla-whatsapp-notify.onrender.com';
    const CARD_BTN_CLASS = 'salla-wa-card-notify-btn';

    let merchantId = null;
    let settings = null;

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

    function injectStyles() {
        if (document.getElementById('wa-notify-custom-styles')) return;
        const style = document.createElement('style');
        style.id = 'wa-notify-custom-styles';
        style.textContent = `
            .${CARD_BTN_CLASS} {
                display: block !important;
                width: calc(100% - 12px) !important;
                margin: 6px auto !important;
                padding: 7px 10px !important;
                background-color: #25D366 !important;
                color: #ffffff !important;
                border-radius: 6px !important;
                text-align: center !important;
                text-decoration: none !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                line-height: 1.3 !important;
                box-sizing: border-box !important;
                clear: both !important;
                z-index: 99 !important;
                position: relative !important;
            }
        `;
        document.head.appendChild(style);
    }

    async function processCards() {
        const cards = document.querySelectorAll('salla-product-card');
        if (!cards.length) return;

        const st = await loadSettings();
        if (!st || !st.number) return;

        cards.forEach((card) => {
            // محاولة الوصول للـ DOM العادي أو الـ Shadow DOM
            const root = card.shadowRoot || card;
            const text = (card.textContent || '' ) + (root.textContent || '');

            const isOut = card.hasAttribute('out-of-stock') || 
                          ['out', 'sold-out', 'out-of-stock'].includes(card.getAttribute('product-status')) ||
                          text.includes('نفدت الكمية') || text.includes('غير متوفر');

            const existing = card.querySelector(`.${CARD_BTN_CLASS}`) || root.querySelector(`.${CARD_BTN_CLASS}`);

            if (!isOut) {
                if (existing) existing.remove();
                return;
            }

            if (existing) return;

            // جلب بيانات المنتج
            const p = card.product || {};
            const name = p.name || card.querySelector('.product-title, h3, h2')?.textContent?.trim() || 'المنتج';
            const price = p.price?.amount || p.price || '';
            const url = p.url || card.querySelector('a[href*="/p/"]')?.href || window.location.href;

            let finalMsg = `${st.msg}\n\nالمنتج: ${name}`;
            if (price) finalMsg += `\nالسعر: ${price}`;
            finalMsg += `\nالرابط: ${url}`;

            const btn = document.createElement('a');
            btn.className = CARD_BTN_CLASS;
            btn.href = `https://wa.me/${st.number}?text=${encodeURIComponent(finalMsg)}`;
            btn.target = '_blank';
            btn.textContent = '🔔 أبلغني عند التوفر';

            // الحقن بشكل آمن لتفادي مشاكل التصميم
            card.insertAdjacentElement('beforeend', btn);
        });
    }

    function init() {
        injectStyles();
        processCards();
        
        // متابعة التغييرات الديناميكية
        const observer = new MutationObserver(() => processCards());
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (window.salla) {
        window.salla.on('ready', init);
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
