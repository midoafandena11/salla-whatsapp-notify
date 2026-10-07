(function () {
    'use strict';

    const API_BASE = 'https://salla-whatsapp-notify.onrender.com';
    const BUTTON_ID = 'salla-whatsapp-notify-button';
    const CARD_BUTTON_CLASS = 'salla-whatsapp-notify-card-button';

    let merchantId = null;
    let settings = null;
    let settingsPromise = null;

    /* =========================
       Helpers & Config
    ========================= */

    function getSallaConfig(key) {
        try {
            if (window.salla && window.salla.config && typeof window.salla.config.get === 'function') {
                return window.salla.config.get(key);
            }
        } catch (e) {}
        return null;
    }

    function getMerchantId() {
        if (merchantId) return merchantId;

        const storeId = getSallaConfig('store.id') || getSallaConfig('store_id') || getSallaConfig('merchant_id');
        if (storeId) {
            merchantId = String(storeId);
            return merchantId;
        }

        try {
            const urlMerchantId = new URLSearchParams(window.location.search).get('merchant_id');
            if (urlMerchantId) {
                merchantId = String(urlMerchantId);
                return merchantId;
            }
        } catch (e) {}

        return null;
    }

    async function loadSettings() {
        if (settings) return settings;
        if (settingsPromise) return settingsPromise;

        const id = getMerchantId();
        if (!id) return null;

        settingsPromise = fetch(`${API_BASE}/api/settings?merchant_id=${encodeURIComponent(id)}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(`Settings failed: ${res.status}`);
                return res.json();
            })
            .then((data) => {
                if (!data || data.success !== true) throw new Error(data?.error || 'Invalid settings');
                settings = {
                    whatsappNumber: String(data.whatsappNumber || '').trim(),
                    customMessage: String(
                        data.customMessage || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
                    ).trim()
                };
                return settings;
            })
            .catch((err) => {
                console.error('WhatsApp Settings Error:', err);
                settingsPromise = null;
                return null;
            });

        return settingsPromise;
    }

    /* =========================
       Data Extraction Fixes
    ========================= */

    function extractCardProductData(card) {
        // 1. محاولة القراءة المباشرة من كائن سلة الأصلي للمنتج
        let raw = card.product || card.__product || null;

        // 2. إذا لم يجد كائن جاهز، يقرأ بيانات البطاقة من الـ DOM الداخلي بكل دقّة
        let id = raw?.id || card.getAttribute('data-id') || card.getAttribute('product-id');
        
        // استخراج اسم المنتج (تجنب اسم الصفحة بالكامل)
        let name = raw?.name || raw?.title || '';
        if (!name) {
            const nameEl = card.querySelector('.product-title, .product-name, [class*="title"], h2, h3, a[href*="/p/"]');
            if (nameEl) name = nameEl.textContent.trim();
        }

        // استخراج رابط المنتج المباشر
        let url = raw?.url || raw?.link || '';
        if (!url) {
            const linkEl = card.querySelector('a[href*="/p/"], a[href*="/product/"]');
            if (linkEl) url = linkEl.href;
        }

        // استخراج السعر المباشر
        let price = raw?.price?.amount || raw?.price || raw?.sale_price || '';
        if (!price || typeof price === 'object') {
            const priceEl = card.querySelector('.product-price, [class*="price"], .price');
            if (priceEl) price = priceEl.textContent.trim().replace(/\s+/g, ' ');
        }

        // تحديد ما إذا كان المنتج غير متوفر
        let isOutOfStock = false;
        if (raw) {
            isOutOfStock = raw.is_available === false || raw.isAvailable === false || 
                           ['out', 'out-of-stock', 'out_of_stock', 'sold-out'].includes(String(raw.status || raw.product_status).toLowerCase());
        }

        if (!isOutOfStock) {
            const statusAttr = card.getAttribute('product-status') || card.getAttribute('status') || '';
            const textContent = card.textContent || '';
            isOutOfStock = ['out', 'out-of-stock', 'out_of_stock', 'sold-out'].includes(statusAttr.toLowerCase()) ||
                           card.hasAttribute('out-of-stock') ||
                           textContent.includes('نفدت الكمية') || 
                           textContent.includes('غير متوفر') || 
                           textContent.includes('نفد المخزون');
        }

        return {
            id,
            name: name.trim() || 'منتج',
            url: url || window.location.href,
            price: typeof price === 'number' ? `${price}` : price,
            isOutOfStock
        };
    }

    /* =========================
       WhatsApp Link Builder
    ========================= */

    function buildWhatsAppUrl(product) {
        if (!settings || !settings.whatsappNumber) return null;
        const num = settings.whatsappNumber.replace(/\D/g, '');
        if (!num) return null;

        let msg = settings.customMessage || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';
        msg += `\n\nالمنتج: ${product.name}`;
        if (product.price) msg += `\nالسعر: ${product.price}`;
        msg += `\nالرابط: ${product.url}`;

        return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
    }

    /* =========================
       Render Logic (Cards)
    ========================= */

    async function processProductCards() {
        const cards = document.querySelectorAll('salla-product-card');
        if (!cards.length) return;

        const loadedSettings = await loadSettings();
        if (!loadedSettings) return;

        cards.forEach((card) => {
            const data = extractCardProductData(card);
            const existingBtn = card.querySelector(`.${CARD_BUTTON_CLASS}`);

            if (!data.isOutOfStock) {
                if (existingBtn) existingBtn.remove();
                return;
            }

            if (existingBtn) return;

            const waUrl = buildWhatsAppUrl(data);
            if (!waUrl) return;

            const btn = document.createElement('a');
            btn.className = CARD_BUTTON_CLASS;
            btn.href = waUrl;
            btn.target = '_blank';
            btn.rel = 'noopener noreferrer';
            btn.textContent = '🔔 أبلغني عند التوفر';

            // تنسيق مرن لحل مشكلة الظهور الجزئي أو انكماش الزر
            btn.style.cssText = `
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: calc(100% - 16px) !important;
                margin: 8px auto !important;
                padding: 8px 10px !important;
                background: #25D366 !important;
                color: #ffffff !important;
                border-radius: 8px !important;
                text-align: center !important;
                text-decoration: none !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                line-height: 1.2 !important;
                box-sizing: border-box !important;
                cursor: pointer !important;
                z-index: 10 !important;
                clear: both !important;
            `;

            // إدراج الزر في أنسب مكان داخل هيكل الكارت لمنع قصه
            const footer = card.querySelector('.product-card__footer, .product-card__content, .product-card__body');
            if (footer) {
                footer.appendChild(btn);
            } else {
                card.appendChild(btn);
            }
        });
    }

    /* =========================
       Render Logic (Product Page)
    ========================= */

    async function processProductPage() {
        const mainButton = document.querySelector('salla-add-product-button');
        if (!mainButton) return;

        const existing = document.getElementById(BUTTON_ID);

        // فحص حالة التوفر لصفحة المنتج
        const status = mainButton.getAttribute('product-status') || mainButton.getAttribute('status') || '';
        const text = mainButton.textContent || '';
        const isOutOfStock = ['out', 'out-of-stock', 'out_of_stock', 'sold-out'].includes(status.toLowerCase()) ||
                           text.includes('نفدت') || text.includes('غير متوفر');

        if (!isOutOfStock) {
            if (existing) existing.remove();
            return;
        }

        if (existing) return;

        const loadedSettings = await loadSettings();
        if (!loadedSettings) return;

        const name = getSallaConfig('page.title') || document.querySelector('h1')?.textContent?.trim() || 'هذا المنتج';
        const price = getSallaConfig('page.price') || document.querySelector('[class*="price"]')?.textContent?.trim() || '';

        const waUrl = buildWhatsAppUrl({
            name,
            price: typeof price === 'number' ? `${price}` : price,
            url: window.location.href
        });

        if (!waUrl) return;

        const btn = document.createElement('a');
        btn.id = BUTTON_ID;
        btn.href = waUrl;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.textContent = '🔔 أبلغني عبر واتساب عند توفر المنتج';

        btn.style.cssText = `
            display: block !important;
            width: 100% !important;
            margin-top: 12px !important;
            padding: 12px 16px !important;
            background: #25D366 !important;
            color: #ffffff !important;
            border-radius: 10px !important;
            text-align: center !important;
            text-decoration: none !important;
            font-size: 14px !important;
            font-weight: 700 !important;
            box-sizing: border-box !important;
        `;

        mainButton.insertAdjacentElement('afterend', btn);
    }

    /* =========================
       Execution & Observers
    ========================= */

    function runAllChecks() {
        processProductPage();
        processProductCards();
    }

    let timer = null;
    function debounceCheck() {
        clearTimeout(timer);
        timer = setTimeout(runAllChecks, 250);
    }

    const observer = new MutationObserver(debounceCheck);

    function init() {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['product-status', 'status', 'disabled']
            });
        }

        runAllChecks();
        setTimeout(runAllChecks, 1000);
        setTimeout(runAllChecks, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
