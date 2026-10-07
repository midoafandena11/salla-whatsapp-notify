(function () {
    'use strict';

    const API_BASE = 'https://salla-whatsapp-notify.onrender.com';
    const BUTTON_ID = 'salla-whatsapp-notify-button';
    const CARD_BUTTON_CLASS = 'salla-whatsapp-notify-card-button';

    let merchantId = null;
    let settings = null;
    let settingsPromise = null;
    let productButtonCreating = false;

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
                if (!response.ok) {
                    throw new Error(`Settings request failed: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                if (!data || data.success !== true) {
                    throw new Error(data?.error || 'Invalid settings response');
                }

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

    function getNumber(value) {
        if (value === null || value === undefined || value === '') return null;

        if (typeof value === 'object') {
            value = value.amount ?? value.value ?? value.price ?? null;
        }

        const number = Number(String(value).replace(/,/g, '').trim());
        return Number.isFinite(number) ? number : null;
    }

    function getPriceValue(product, keys) {
        if (!product) return null;
        for (const key of keys) {
            const value = getNumber(product[key]);
            if (value !== null) return value;
        }
        return null;
    }

    // البحث داخل المكون المباشر أو الـ Shadow DOM
    function querySelectorAllDeep(root, selector) {
        const results = Array.from(root.querySelectorAll(selector));
        if (root.shadowRoot) {
            results.push(...root.shadowRoot.querySelectorAll(selector));
        }
        return results;
    }

    function querySelectorDeep(root, selector) {
        const direct = root.querySelector(selector);
        if (direct) return direct;
        return root.shadowRoot ? root.shadowRoot.querySelector(selector) : null;
    }

    function getCardLink(card) {
        const link = querySelectorDeep(card, 'a[href]');
        return link ? link.href : '';
    }

    function getCardName(card) {
        const selectors = [
            '[class*="product-title"]',
            '[class*="product-name"]',
            '[class*="title"]',
            'h2',
            'h3'
        ];

        for (const selector of selectors) {
            const element = querySelectorDeep(card, selector);
            if (element && element.textContent.trim()) {
                return element.textContent.trim().replace(/\s+/g, ' ');
            }
        }
        return '';
    }

    function normalizeProduct(rawProduct, root) {
        const product = rawProduct && typeof rawProduct === 'object' ? rawProduct : {};
        const isCard = root && root.matches && root.matches('salla-product-card');

        const id =
            product.id ||
            product.product_id ||
            product.productId ||
            root?.getAttribute?.('data-product-id') ||
            root?.getAttribute?.('product-id') ||
            null;

        let name = product.name || product.title || '';
        let url = product.url || product.link || product.product_url || '';

        let price = getPriceValue(product, ['sale_price', 'price']);
        let regularPrice = getPriceValue(product, ['regular_price', 'compare_price', 'old_price']);

        if (isCard) {
            if (!name) name = getCardName(root);
            if (!url) url = getCardLink(root);
        }

        if (!name && !isCard) {
            name = getSallaConfig('page.title') || '';
        }

        if (!price && !isCard) {
            const pagePrice = getNumber(getSallaConfig('page.price'));
            if (pagePrice !== null) price = pagePrice;
        }

        if (!url) {
            url = window.location.href;
        }

        return {
            id: id ? String(id) : null,
            name: String(name || '').trim() || 'هذا المنتج',
            url: String(url || '').trim() || window.location.href,
            price,
            regularPrice,
            isAvailable: product.is_available ?? product.isAvailable ?? null,
            status: String(product.status || product.product_status || '').trim().toLowerCase()
        };
    }

    function isProductOutOfStock(product, root) {
        if (product) {
            if (product.isAvailable === false) return true;
            if (['out', 'out-of-stock', 'out_of_stock', 'sold-out', 'sold_out', 'unavailable'].includes(product.status)) {
                return true;
            }
        }

        if (!root) return false;

        const status = root.getAttribute('product-status') || root.getAttribute('status') || '';
        if (['out', 'out-of-stock', 'out_of_stock', 'sold-out', 'sold_out', 'unavailable'].includes(String(status).trim().toLowerCase())) {
            return true;
        }

        if (root.hasAttribute('out-of-stock')) return true;

        const text = (root.textContent || '').trim().toLowerCase();
        return (
            text.includes('نفدت الكمية') ||
            text.includes('نفد المخزون') ||
            text.includes('غير متوفر') ||
            text.includes('sold out') ||
            text.includes('out of stock') ||
            text.includes('unavailable')
        );
    }

    function getProductPageRawProduct() {
        try {
            if (window.salla && window.salla.product) return window.salla.product;
        } catch (error) {}

        const configProduct = getSallaConfig('product');
        if (configProduct && typeof configProduct === 'object') return configProduct;

        try {
            const button = document.querySelector('salla-add-product-button');
            if (button && button.product && typeof button.product === 'object') return button.product;
        } catch (error) {}

        return {};
    }

    function formatProductPrice(product) {
        const current = product.price;
        const original = product.regularPrice;

        if (current === null && original === null) return '';

        if (current !== null && original !== null && original > current) {
            return `السعر الأصلي: ${original}\nالسعر بعد الخصم: ${current}`;
        }

        if (current !== null) return `السعر: ${current}`;
        return `السعر: ${original}`;
    }

    function createWhatsAppUrl(product) {
        if (!settings || !settings.whatsappNumber) return null;

        const number = settings.whatsappNumber.replace(/\D/g, '');
        if (!number) return null;

        let message = settings.customMessage || 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';
        message += `\n\nالمنتج: ${product.name}`;

        const priceText = formatProductPrice(product);
        if (priceText) message += `\n${priceText}`;

        message += `\nالرابط: ${product.url}`;

        return 'https://wa.me/' + number + '?text=' + encodeURIComponent(message);
    }

    function createWhatsAppButton(product, isCard) {
        const button = document.createElement('a');

        if (isCard) {
            button.className = CARD_BUTTON_CLASS;
        } else {
            button.id = BUTTON_ID;
        }

        button.href = createWhatsAppUrl(product);
        button.target = '_blank';
        button.rel = 'noopener noreferrer';
        button.textContent = '🔔 أبلغني عبر واتساب عند توفر المنتج';

        button.style.cssText = `
            display:flex;
            align-items:center;
            justify-content:center;
            width:100%;
            box-sizing:border-box;
            margin-top:${isCard ? '8px' : '12px'};
            padding:${isCard ? '9px 8px' : '14px 18px'};
            background:#25D366;
            color:#ffffff;
            border-radius:${isCard ? '9px' : '12px'};
            text-align:center;
            text-decoration:none;
            font-size:${isCard ? '12px' : '15px'};
            font-weight:700;
            line-height:1.2;
            cursor:pointer;
            transition:opacity .2s ease;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            min-width:0;
            flex:0 0 100%;
            max-width:100%;
        `;

        button.addEventListener('mouseenter', () => (button.style.opacity = '0.88'));
        button.addEventListener('mouseleave', () => (button.style.opacity = '1'));

        return button;
    }

    async function checkProductPage() {
        const productButton = document.querySelector('salla-add-product-button');
        if (!productButton) return;

        const existing = document.getElementById(BUTTON_ID);

        const rawProduct = getProductPageRawProduct();
        const product = normalizeProduct(rawProduct, productButton);
        const outOfStock = isProductOutOfStock(product, productButton);

        // مسح الزر إن كان المنتج متوفراً
        if (!outOfStock) {
            if (existing) existing.remove();
            return;
        }

        if (existing || productButtonCreating) return;

        productButtonCreating = true;

        try {
            const loadedSettings = await loadSettings();
            if (!loadedSettings) return;

            if (document.getElementById(BUTTON_ID)) return;

            const button = createWhatsAppButton(product, false);
            if (!button.href) return;

            productButton.insertAdjacentElement('afterend', button);
        } finally {
            productButtonCreating = false;
        }
    }

    async function checkProductCards() {
        const cards = document.querySelectorAll('salla-product-card');
        if (!cards.length) return;

        const loadedSettings = await loadSettings();
        if (!loadedSettings) return;

        for (const card of cards) {
            const product = normalizeProduct(card.product, card);

            if (!product.id && !getCardLink(card)) continue;

            const outOfStock = isProductOutOfStock(product, card);
            
            // البحث المباشر والعميق داخل الكارت عن الزر المضاف
            const existing = querySelectorDeep(card, `.${CARD_BUTTON_CLASS}`);

            if (!outOfStock) {
                if (existing) existing.remove();
                continue;
            }

            if (existing) continue;

            const button = createWhatsAppButton(product, true);
            if (!button.href) continue;

            // استخدام طريقة آمنة لحقن الزر دون التأثير على Shadow DOM
            card.appendChild(button);
        }
    }

    async function checkAllProducts() {
        await Promise.all([checkProductPage(), checkProductCards()]);
    }

    let checkTimer = null;

    function scheduleCheck() {
        clearTimeout(checkTimer);
        checkTimer = setTimeout(checkAllProducts, 300);
    }

    const observer = new MutationObserver(scheduleCheck);

    function start() {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['product-status', 'status', 'disabled', 'aria-disabled', 'out-of-stock']
            });
        }

        checkAllProducts();
        setTimeout(checkAllProducts, 1000);
        setTimeout(checkAllProducts, 2500);
        setTimeout(checkAllProducts, 5000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
