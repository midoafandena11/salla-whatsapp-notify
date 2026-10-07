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
            if (!res.ok) return null;
            const data = await res.json();
            if (data && data.success) {
                settings = {
                    number: String(data.whatsappNumber || '').replace(/\D/g, ''),
                    msg: data.customMessage || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
                };
                return settings;
            }
        } catch (e) {
            console.warn('WhatsApp Notify Fetch Error:', e);
        }
        return null;
    }

    /* =========================================
       معالجة بطاقات الصفحة الرئيسية والأقسام
    ========================================= */
    async function processCards() {
        const cards = document.querySelectorAll('salla-product-card, .product-entry, .product-card');
        if (!cards.length) return;

        const st = await loadSettings();
        if (!st || !st.number) return;

        cards.forEach((card) => {
            try {
                // فحص ما إذا كان المنتج نفد من المخزون
                const text = (card.innerText || card.textContent || '').toLowerCase();
                const isOut = card.hasAttribute('out-of-stock') ||
                              ['out', 'sold-out', 'out-of-stock'].includes(card.getAttribute('product-status')) ||
                              text.includes('نفدت الكمية') ||
                              text.includes('نفد المخزون') ||
                              text.includes('غير متوفر');

                const existingBtn = card.querySelector(`.${CARD_BTN_CLASS}`);

                if (!isOut) {
                    if (existingBtn) existingBtn.remove();
                    return;
                }

                if (existingBtn) return;

                // استخراج بيانات المنتج بأسلوب آمن جداً
                const p = card.product || {};
                const nameEl = card.querySelector('.product-title, [class*="title"], h2, h3, a[href*="/p/"]');
                const name = p.name || (nameEl ? nameEl.textContent.trim() : 'المنتج');

                const priceEl = card.querySelector('.product-price, [class*="price"], .price');
                const price = p.price?.amount || p.price || (priceEl ? priceEl.textContent.trim() : '');

                const linkEl = card.querySelector('a[href*="/p/"], a[href*="/product/"]');
                const url = p.url || (linkEl ? linkEl.href : window.location.href);

                let finalMsg = `${st.msg}\n\nالمنتج: ${name}`;
                if (price) finalMsg += `\nالسعر: ${price}`;
                finalMsg += `\nالرابط: ${url}`;

                const waUrl = `https://wa.me/${st.number}?text=${encodeURIComponent(finalMsg)}`;

                // إنشاء الزر
                const btn = document.createElement('a');
                btn.className = CARD_BTN_CLASS;
                btn.href = waUrl;
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
                    z-index: 10 !important;
                    position: relative !important;
                `;

                // حقن الزر في نهاية عنصر البطاقة الرئيسي
                card.appendChild(btn);
            } catch (err) {
                // تجنب إيقاف السكربت عند حدوث خطأ في بطاقة واحدة
            }
        });
    }

    /* =========================================
       معالجة صفحة المنتج المفردة
    ========================================= */
    async function processProductPage() {
        const mainBtn = document.querySelector('salla-add-product-button');
        if (!mainBtn) return;

        const existing = document.getElementById('salla-whatsapp-notify-button');

        const status = mainBtn.getAttribute('product-status') || mainBtn.getAttribute('status') || '';
        const text = mainBtn.textContent || '';
        const isOut = ['out', 'out-of-stock', 'out_of_stock', 'sold-out'].includes(status.toLowerCase()) ||
                      text.includes('نفدت') || text.includes('غير متوفر');

        if (!isOut) {
            if (existing) existing.remove();
            return;
        }

        if (existing) return;

        const st = await loadSettings();
        if (!st || !st.number) return;

        const name = (window.salla?.config?.get('page.title')) || document.querySelector('h1')?.textContent?.trim() || 'المنتج';
        const price = (window.salla?.config?.get('page.price')) || document.querySelector('[class*="price"]')?.textContent?.trim() || '';

        let finalMsg = `${st.msg}\n\nالمنتج: ${name}`;
        if (price) finalMsg += `\nالسعر: ${price}`;
        finalMsg += `\nالرابط: ${window.location.href}`;

        const btn = document.createElement('a');
        btn.id = 'salla-whatsapp-notify-button';
        btn.href = `https://wa.me/${st.number}?text=${encodeURIComponent(finalMsg)}`;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.textContent = '🔔 أبلغني عبر واتساب عند توفر المنتج';

        btn.style.cssText = `
            display: block !important;
            width: 100% !important;
            margin-top: 12px !important;
            padding: 12px 16px !important;
            background-color: #25D366 !important;
            color: #ffffff !important;
            border-radius: 10px !important;
            text-align: center !important;
            text-decoration: none !important;
            font-size: 14px !important;
            font-weight: 700 !important;
            box-sizing: border-box !important;
        `;

        mainBtn.insertAdjacentElement('afterend', btn);
    }

    function run() {
        processProductPage();
        processCards();
    }

    let timer = null;
    function debounceRun() {
        clearTimeout(timer);
        timer = setTimeout(run, 300);
    }

    function init() {
        run();
        setTimeout(run, 1000);
        setTimeout(run, 3000);

        if (document.body) {
            const observer = new MutationObserver(debounceRun);
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
