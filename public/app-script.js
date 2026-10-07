(function () {
    'use strict';

    const API_BASE = 'https://salla-whatsapp-notify.onrender.com';

    const BUTTON_ID = 'salla-whatsapp-notify-button';
    const CARD_BUTTON_CLASS = 'salla-whatsapp-notify-card-button';
    const STYLE_ID = 'salla-whatsapp-notify-style';

    const BUTTON_TEXT = '🔔 أبلغني عبر واتساب عند توفر المنتج';

    let merchantId = null;
    let settings = null;
    let settingsPromise = null;
    let productButtonBusy = false;

    /* =========================
       Salla
    ========================= */

    function getSallaConfig(key) {
        try {
            if (
                window.salla &&
                window.salla.config &&
                typeof window.salla.config.get === 'function'
            ) {
                return window.salla.config.get(key);
            }
        } catch (_) {}

        return null;
    }

    function getMerchantId() {
        if (merchantId) return merchantId;

        const id =
            getSallaConfig('store.id') ||
            getSallaConfig('store_id') ||
            getSallaConfig('merchant_id') ||
            getSallaConfig('merchantId');

        if (id) merchantId = String(id);

        return merchantId;
    }

    /* =========================
       Settings
    ========================= */

    async function loadSettings() {
        if (settings) return settings;
        if (settingsPromise) return settingsPromise;

        const id = getMerchantId();

        if (!id) return null;

        settingsPromise = fetch(
            `${API_BASE}/api/settings?merchant_id=${encodeURIComponent(id)}`,
            {
                method: 'GET',
                credentials: 'omit'
            }
        )
            .then(response => {
                if (!response.ok) throw new Error('settings request failed');
                return response.json();
            })
            .then(data => {
                settings = data?.settings || data || {};
                return settings;
            })
            .catch(() => null);

        return settingsPromise;
    }

    function getWhatsAppNumber(data) {
        return String(
            data?.whatsapp_number ||
            data?.phone ||
            data?.whatsapp ||
            data?.number ||
            ''
        ).replace(/[^\d]/g, '');
    }

    /* =========================
       Product Data
    ========================= */

    function getValue(value) {
        if (value === null || value === undefined) return null;

        if (typeof value === 'object') {
            return value.amount ?? value.value ?? null;
        }

        return value;
    }

    function getProductName(product, root) {
        const name =
            product?.name ||
            product?.title ||
            product?.product_name;

        if (name && String(name).trim()) {
            return String(name).trim();
        }

        if (root) {
            const element =
                root.querySelector('[class*="product-name"]') ||
                root.querySelector('[class*="product-title"]') ||
                root.querySelector('h2') ||
                root.querySelector('h3');

            const text = element?.textContent?.trim();

            if (text) return text;
        }

        return '';
    }

    function getProductUrl(product, root) {
        const directUrl =
            product?.url ||
            product?.link ||
            product?.product_url;

        if (directUrl) return String(directUrl);

        if (root) {
            const link =
                root.querySelector('a[href*="/products/"]') ||
                root.querySelector('a[href]');

            if (link?.href) return link.href;
        }

        return window.location.href;
    }

    function normalizeProduct(rawProduct, root) {
        if (!rawProduct) return null;

        const price = getValue(
            rawProduct.sale_price ?? rawProduct.price
        );

        const regularPrice = getValue(
            rawProduct.regular_price ??
            rawProduct.compare_price ??
            rawProduct.old_price
        );

        return {
            id:
                rawProduct.id ??
                rawProduct.product_id ??
                rawProduct.productId ??
                root?.getAttribute('data-product-id') ??
                root?.getAttribute('product-id') ??
                null,

            name: getProductName(rawProduct, root),

            url: getProductUrl(rawProduct, root),

            price,

            regularPrice,

            salePrice: getValue(rawProduct.sale_price),

            isAvailable:
                rawProduct.is_available ??
                rawProduct.isAvailable ??
                null,

            status:
                rawProduct.status ??
                rawProduct.product_status ??
                null
        };
    }

    /* =========================
       Stock
    ========================= */

    function isProductOutOfStock(product, root) {
        if (!product) return false;

        if (product.isAvailable === false) {
            return true;
        }

        const status = String(product.status || '').toLowerCase();

        if (
            status === 'out_of_stock' ||
            status === 'out-of-stock' ||
            status === 'sold_out' ||
            status === 'sold-out' ||
            status === 'unavailable' ||
            status === 'out of stock'
        ) {
            return true;
        }

        if (!root) return false;

        if (
            root.matches?.(
                '.out-of-stock, [data-out-of-stock="true"]'
            )
        ) {
            return true;
        }

        const statusElement =
            root.querySelector(
                '[data-product-status], [data-status]'
            );

        const statusText = String(
            statusElement?.textContent || ''
        ).toLowerCase();

        if (
            statusText.includes('نفدت الكمية') ||
            statusText.includes('نفد المخزون') ||
            statusText.includes('غير متوفر') ||
            statusText.includes('sold out') ||
            statusText.includes('out of stock') ||
            statusText.includes('unavailable')
        ) {
            return true;
        }

        return false;
    }

    /* =========================
       Price
    ========================= */

    function formatNumber(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) return '';

        return new Intl.NumberFormat('ar-SA', {
            maximumFractionDigits: 2
        }).format(number);
    }

    function getPriceText(product) {
        const price = Number(product.price);
        const regular = Number(product.regularPrice);
        const sale = Number(product.salePrice);

        const hasSale =
            Number.isFinite(sale) &&
            sale > 0 &&
            Number.isFinite(regular) &&
            regular > sale;

        if (hasSale) {
            return (
                `السعر الأصلي: ${formatNumber(regular)}\n` +
                `السعر بعد الخصم: ${formatNumber(sale)}`
            );
        }

        if (Number.isFinite(price) && price > 0) {
            return `السعر: ${formatNumber(price)}`;
        }

        if (Number.isFinite(sale) && sale > 0) {
            return `السعر: ${formatNumber(sale)}`;
        }

        return '';
    }
        /* =========================
       WhatsApp
    ========================= */

    function createWhatsAppUrl(product) {
        const number = getWhatsAppNumber(settings);

        if (!number || !product?.name) {
            return null;
        }

        const customMessage = String(
            settings?.message ||
            settings?.custom_message ||
            settings?.whatsapp_message ||
            'أرغب في معرفة موعد توفر هذا المنتج.'
        ).trim();

        const priceText = getPriceText(product);

        const message = [
            customMessage,
            '',
            `المنتج: ${product.name}`,
            priceText,
            `الرابط: ${product.url}`
        ]
            .filter(Boolean)
            .join('\n');

        return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    }

    /* =========================
       Styles
    ========================= */

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;

        style.textContent = `
            #${BUTTON_ID} {
                display: flex;
                width: 100%;
                min-height: 46px;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                margin-top: 10px;
                padding: 11px 14px;
                border-radius: 8px;
                background: #25D366;
                color: #fff !important;
                text-decoration: none !important;
                text-align: center;
                font-size: 14px;
                font-weight: 700;
                line-height: 1.2;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                cursor: pointer;
            }

            #${BUTTON_ID}:hover {
                opacity: .92;
            }

            .${CARD_BUTTON_CLASS}-wrap {
                display: block;
                width: 100%;
                flex: 0 0 100%;
                box-sizing: border-box;
                clear: both;
                margin-top: 8px;
            }

            .${CARD_BUTTON_CLASS} {
                display: flex;
                width: 100%;
                min-height: 38px;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                padding: 8px 7px;
                border-radius: 8px;
                background: #25D366;
                color: #fff !important;
                text-decoration: none !important;
                text-align: center;
                font-size: 12px;
                font-weight: 700;
                line-height: 1.2;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                cursor: pointer;
            }

            .${CARD_BUTTON_CLASS}:hover {
                opacity: .92;
            }
        `;

        document.head.appendChild(style);
    }

    /* =========================
       Product Page Data
    ========================= */

    function getProductPageData() {
        let product = null;

        try {
            product = window.salla?.product || null;
        } catch (_) {}

        if (!product) {
            product = getSallaConfig('product');
        }

        if (!product) {
            const button = document.querySelector(
                'salla-add-product-button'
            );

            product = button?.product || null;
        }

        return normalizeProduct(product, document);
    }

    /* =========================
       Create Buttons
    ========================= */

    function createProductButton(product) {
        const url = createWhatsAppUrl(product);

        if (!url) return null;

        const button = document.createElement('a');

        button.id = BUTTON_ID;
        button.href = url;
        button.target = '_blank';
        button.rel = 'noopener noreferrer';
        button.textContent = BUTTON_TEXT;

        return button;
    }

    function createCardButton(product) {
        const url = createWhatsAppUrl(product);

        if (!url) return null;

        const wrapper = document.createElement('div');
        wrapper.className = `${CARD_BUTTON_CLASS}-wrap`;

        const button = document.createElement('a');

        button.className = CARD_BUTTON_CLASS;
        button.href = url;
        button.target = '_blank';
        button.rel = 'noopener noreferrer';
        button.textContent = BUTTON_TEXT;

        wrapper.appendChild(button);

        return wrapper;
    }

    /* =========================
       Product Page
    ========================= */

    async function checkProductPage() {
        const officialButton = document.querySelector(
            'salla-add-product-button'
        );

        if (!officialButton) return;

        if (document.getElementById(BUTTON_ID)) return;

        if (productButtonBusy) return;

        productButtonBusy = true;

        try {
            const product = getProductPageData();

            if (!product) return;

            if (!isProductOutOfStock(product, document)) {
                return;
            }

            const loadedSettings = await loadSettings();

            if (!loadedSettings) return;

            if (document.getElementById(BUTTON_ID)) return;

            const button = createProductButton(product);

            if (!button) return;

            officialButton.insertAdjacentElement(
                'afterend',
                button
            );
        } finally {
            productButtonBusy = false;
        }
    }
        /* =========================
       Product Cards
    ========================= */

    function getCardTarget(card) {
        return (
            card.querySelector('.product-card__body') ||
            card.querySelector('.product-card__content') ||
            card.querySelector('.product-card__info') ||
            card
        );
    }

    function getCardProduct(card) {
        try {
            if (card.product) {
                return normalizeProduct(card.product, card);
            }
        } catch (_) {}

        return null;
    }

    function cardHasButton(card) {
        return !!card.querySelector(
            `.${CARD_BUTTON_CLASS}-wrap`
        );
    }

    async function checkProductCards() {
        const cards = document.querySelectorAll(
            'salla-product-card'
        );

        if (!cards.length) return;

        const loadedSettings = await loadSettings();

        if (!loadedSettings) return;

        cards.forEach(card => {
            if (cardHasButton(card)) return;

            const product = getCardProduct(card);

            if (!product) return;

            if (!product.name) return;

            if (!isProductOutOfStock(product, card)) {
                return;
            }

            const button = createCardButton(product);

            if (!button) return;

            const target = getCardTarget(card);

            target.appendChild(button);
        });
    }

    /* =========================
       Main
    ========================= */

    function checkAll() {
        injectStyles();

        checkProductPage();
        checkProductCards();
    }

    /* =========================
       Observer
    ========================= */

    let observerTimer = null;

    const observer = new MutationObserver(() => {
        clearTimeout(observerTimer);

        observerTimer = setTimeout(() => {
            checkAll();
        }, 150);
    });

    function start() {
        injectStyles();

        checkAll();

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(checkAll, 1000);
        setTimeout(checkAll, 2500);
        setTimeout(checkAll, 5000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            start,
            { once: true }
        );
    } else {
        start();
    }
})();
