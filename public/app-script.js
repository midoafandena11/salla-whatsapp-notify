(function () {
    'use strict';

    const API_BASE = 'https://salla-whatsapp-notify.onrender.com';
    const BUTTON_CLASS = 'salla-whatsapp-notify-btn';

    let merchantId = null;
    let settings = null;
    let settingsPromise = null;

    /* =========================  
       Basic Helpers  
    ========================= */

    function getSallaConfig(key) {
        try {
            if (window.salla && window.salla.config && typeof window.salla.config.get === 'function') {
                return window.salla.config.get(key);
            }
        } catch (error) {
            console.warn('Salla config error:', key, error);
        }
        return null;
    }

    function getMerchantId() {
        if (merchantId) return merchantId;

        const storeId = getSallaConfig('store.id');
        if (storeId) {
            merchantId = String(storeId);
            return merchantId;
        }

        const possibleIds = [
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
            const params = new URLSearchParams(window.location.search);
            const urlMerchantId = params.get('merchant_id');
            if (urlMerchantId) {
                merchantId = String(urlMerchantId);
                return merchantId;
            }
        } catch (error) {}

        return null;
    }

    /* =========================  
       Load Settings  
    ========================= */

    async function loadSettings() {
        if (settings) return settings;
        if (settingsPromise) return settingsPromise;

        const id = getMerchantId();
        if (!id) return null;

        settingsPromise = fetch(`${API_BASE}/api/settings?merchant_id=${encodeURIComponent(id)}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Settings request failed: ${response.status}`);
                return response.json();
            })
            .then((data) => {
                if (!data || data.success !== true) throw new Error(data?.error || 'Invalid settings response');

                settings = {
                    whatsappNumber: String(data.whatsappNumber || '').trim(),
                    customMessage: String(
                        data.customMessage || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
                    ).trim()
                };
                return settings;
            })
            .catch((error) => {
                console.error('WhatsApp Notify settings error:', error);
                settingsPromise = null;
                return null;
            });

        return settingsPromise;
    }

    /* =========================  
       Extract Info Per Component  
    ========================= */

    function getProductInfo(cardOrButton) {
        // إذا كنا داخل بطاقة منتج (في الصفحة الرئيسية أو الأقسام)
        const card = cardOrButton.closest('salla-product-card, .product-entry, .product-item, .product-card');

        let title = '';
        let price = '';
        let url = window.location.href;

        if (card) {
            const titleEl = card.querySelector('.product-title, .title, [class*="title"], h3, h2, a[href*="/p/"]');
            if (titleEl) title = titleEl.textContent.trim();

            const priceEl = card.querySelector('.product-price, [class*="price"], .price');
            if (priceEl) price = priceEl.textContent.trim().replace(/\s+/g, ' ');

            const linkEl = card.querySelector('a[href*="/p/"], a[href*="/product/"]');
            if (linkEl && linkEl.href) url = linkEl.href;
        } else {
            // صفحة المنتج المستقلة
            title = getSallaConfig('page.title') || document.querySelector('h1')?.textContent?.trim() || document.title;
            price = getSallaConfig('page.price') || document.querySelector('[class*="price"]')?.textContent?.trim() || '';
        }

        return { title: title || 'هذا المنتج', price, url };
    }

    /* =========================  
       Out Of Stock Detection  
    ========================= */

    function checkIsOutOfStock(btnComponent) {
        // 1. فحص الخاصية المباشرة في مكون سلة
        const status =
            btnComponent.getAttribute('product-status') ||
            btnComponent.getAttribute('status') ||
            btnComponent.productStatus ||
            '';

        if (['out', 'out-of-stock', 'out_of_stock', 'sold-out', 'sold_out'].includes(status.toLowerCase())) {
            return true;
        }

        // 2. فحص النص أو حالة المعطل (Disabled)
        const text = (btnComponent.textContent || '').trim().toLowerCase();
        const isDisabled = btnComponent.hasAttribute('disabled') || btnComponent.getAttribute('aria-disabled') === 'true';

        if (
            isDisabled &&
            (text.includes('نفد') ||
                text.includes('غير متوفر') ||
                text.includes('نفذت') ||
                text.includes('sold out') ||
                text.includes('out of stock'))
        ) {
            return true;
        }

        // 3. فحص إذا كان هناك عنصر availability مجاور
        const card = btnComponent.closest('salla-product-card, .product-entry, body');
        if (card && card.querySelector('salla-product-availability')) {
            return true;
        }

        return false;
    }

    /* =========================  
       Create WhatsApp URL  
    ========================= */

    function createWhatsAppUrl(info) {
        if (!settings || !settings.whatsappNumber) return null;

        let number = settings.whatsappNumber.replace(/\D/g, '');
        if (!number) return null;

        let message = settings.customMessage || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';
        message += `\n\nالمنتج: ${info.title}`;
        if (info.price) message += `\nالسعر: ${info.price}`;
        message += `\nالرابط: ${info.url}`;

        return 'https://wa.me/' + number + '?text=' + encodeURIComponent(message);
    }

    /* =========================  
       Process Single Button  
    ========================= */

    function processProductButton(btnComponent) {
        // إذا كان الزر مضافاً بالفعل سابقاً لنفس العنصر، نتخطاه
        if (btnComponent.nextElementSibling && btnComponent.nextElementSibling.classList.contains(BUTTON_CLASS)) {
            return;
        }

        if (!checkIsOutOfStock(btnComponent)) return;

        const info = getProductInfo(btnComponent);
        const whatsappUrl = createWhatsAppUrl(info);
        if (!whatsappUrl) return;

        const button = document.createElement('a');
        button.className = BUTTON_CLASS;
        button.href = whatsappUrl;
        button.target = '_blank';
        button.rel = 'noopener noreferrer';
        button.textContent = '🔔 أبلغني عبر واتساب عند توفر المنتج';

        button.style.cssText = `  
            display: block;  
            width: 100%;  
            margin-top: 8px;  
            padding: 10px 14px;  
            background: #25D366;  
            color: #ffffff;  
            border-radius: 8px;  
            text-align: center;  
            text-decoration: none;  
            font-size: 13px;  
            font-weight: 700;  
            line-height: 1.4;  
            box-sizing: border-box;  
            cursor: pointer;  
            transition: opacity .2s ease;  
        `;

        button.addEventListener('mouseenter', () => (button.style.opacity = '0.88'));
        button.addEventListener('mouseleave', () => (button.style.opacity = '1'));

        btnComponent.insertAdjacentElement('afterend', button);
    }

    /* =========================  
       Main Check  
    ========================= */

    async function checkProducts() {
        // إيجاد كافة أزرار المنتجات في الصفحة (سواءً صفحة سينجل أو رئيسية)
        const productButtons = document.querySelectorAll('salla-add-product-button');
        if (!productButtons.length) return;

        const loadedSettings = await loadSettings();
        if (!loadedSettings) return;

        productButtons.forEach((btn) => processProductButton(btn));
    }

    /* =========================  
       Observe Salla Rendering  
    ========================= */

    let checkTimer = null;

    function scheduleCheck() {
        clearTimeout(checkTimer);
        checkTimer = setTimeout(checkProducts, 300);
    }

    const observer = new MutationObserver(scheduleCheck);

    function start() {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['product-status', 'status', 'disabled', 'aria-disabled']
            });
        }

        checkProducts();
        setTimeout(checkProducts, 1000);
        setTimeout(checkProducts, 2500);
        setTimeout(checkProducts, 5000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
