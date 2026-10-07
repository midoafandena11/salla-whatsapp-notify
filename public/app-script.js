(function () {
    'use strict';

    const API_BASE = 'https://salla-whatsapp-notify.onrender.com';
    const DEFAULT_MESSAGE = 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

    let merchantId = null;
    let settings = null;
    let settingsPromise = null;
    let checkTimer = null;

    function cleanText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

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
        const possibleIds = [
            getSallaConfig('store.id'),
            getSallaConfig('store_id'),
            getSallaConfig('merchant_id'),
            getSallaConfig('merchant.id')
        ];
        for (const id of possibleIds) {
            if (id) {
                merchantId = String(id);
                return merchantId;
            }
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
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.success) {
                    settings = {
                        whatsappNumber: cleanText(data.whatsappNumber).replace(/\D/g, ''),
                        customMessage: cleanText(data.customMessage) || DEFAULT_MESSAGE
                    };
                    return settings;
                }
                return null;
            })
            .catch(() => {
                settingsPromise = null;
                return null;
            });

        return settingsPromise;
    }

    /* =========================================================
       إصلاح كشف بطاقات المنتجات للرئيسية والصفحات الأخرى
    ========================================================= */

    function getProductContainers() {
        const selectors = [
            'salla-product-card',
            '.product-entry',
            '.product-card',
            '.product-item',
            '[data-product-id]'
        ];

        const elements = Array.from(document.querySelectorAll(selectors.join(',')));
        
        // تصفية ذكية بدون استبعاد بطاقات الصفحة الرئيسية
        return elements.filter(el => {
            // تجاهل الحاويات الكبيرة جداً كـ body أو الأقسام الرئيسية
            if (el.tagName === 'BODY' || el.classList.contains('products-grid')) return false;
            return true;
        });
    }

    function isOutOfStock(container) {
        if (!container) return false;
        
        const text = (container.innerText || container.textContent || '').toLowerCase();
        const keywords = ['نفدت الكمية', 'نفد المخزون', 'نفدت', 'غير متوفر', 'sold out', 'out of stock'];
        
        const hasText = keywords.some(kw => text.includes(kw));
        const hasAttr = container.hasAttribute('out-of-stock') || 
                        ['out', 'sold-out', 'out-of-stock'].includes(container.getAttribute('product-status'));

        return hasText || hasAttr;
    }

    function extractProductDetails(container) {
        const p = container.product || {};

        // 1. العنوان
        let name = p.name || '';
        if (!name) {
            const nameEl = container.querySelector('.product-title, [class*="title"], h2, h3, a[href*="/p/"]');
            if (nameEl) name = cleanText(nameEl.textContent);
        }

        // 2. السعر
        let price = p.price?.amount || p.price || '';
        if (!price || typeof price === 'object') {
            const priceEl = container.querySelector('.product-price, [class*="price"], .price');
            if (priceEl) price = cleanText(priceEl.textContent);
        }

        // 3. الرابط (دقيق جداً للرئيسية)
        let url = p.url || '';
        if (!url) {
            const linkEl = container.querySelector('a[href*="/p/"], a[href*="/product/"]');
            if (linkEl) url = linkEl.href;
        }

        return {
            name: name || 'منتج',
            price: typeof price === 'number' ? `${price}` : price,
            url: url || window.location.href
        };
    }

    /* =========================================================
       إنشاء وحقن الزر
    ========================================================= */

    async function processEverything() {
        const st = await loadSettings();
        if (!st || !st.whatsappNumber) return;

        const containers = getProductContainers();

        containers.forEach(container => {
            const out = isOutOfStock(container);
            const existingBtn = container.querySelector('.salla-wa-notify-btn-fix');

            if (!out) {
                if (existingBtn) existingBtn.remove();
                return;
            }

            if (existingBtn) return;

            const details = extractProductDetails(container);

            let msg = `${st.customMessage}\n\nالمنتج: ${details.name}`;
            if (details.price) msg += `\nالسعر: ${details.price}`;
            msg += `\nالرابط: ${details.url}`;

            const waUrl = `https://wa.me/${st.whatsappNumber}?text=${encodeURIComponent(msg)}`;

            const btn = document.createElement('a');
            btn.className = 'salla-wa-notify-btn-fix';
            btn.href = waUrl;
            btn.target = '_blank';
            btn.rel = 'noopener noreferrer';
            btn.textContent = '🔔 أبلغني عند التوفر';

            btn.style.cssText = `
                display: block !important;
                width: calc(100% - 12px) !important;
                margin: 8px auto !important;
                padding: 9px 12px !important;
                background-color: #25D366 !important;
                color: #ffffff !important;
                border-radius: 8px !important;
                text-align: center !important;
                text-decoration: none !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                line-height: 1.3 !important;
                box-sizing: border-box !important;
                clear: both !important;
                position: relative !important;
                z-index: 10 !important;
            `;

            // التركيب المباشر المضمون
            container.appendChild(btn);
        });
    }

    function scheduleCheck() {
        clearTimeout(checkTimer);
        checkTimer = setTimeout(processEverything, 300);
    }

    function init() {
        processEverything();

        if (document.body) {
            const observer = new MutationObserver(scheduleCheck);
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
