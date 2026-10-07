(function () {
    'use strict';

    const API_BASE =
        'https://salla-whatsapp-notify.onrender.com';

    const BUTTON_ID =
        'salla-whatsapp-notify-button';

    const CARD_BUTTON_CLASS =
        'salla-whatsapp-notify-card-button';

    const BUTTON_TEXT =
        '🔔 أبلغني عبر واتساب عند توفر المنتج';

    let merchantId = null;
    let settings = null;
    let settingsPromise = null;
    let productButtonCreating = false;

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

        merchantId =
            getSallaConfig('store.id') ||
            getSallaConfig('store_id') ||
            getSallaConfig('merchant_id') ||
            getSallaConfig('merchantId') ||
            null;

        return merchantId;
    }

    async function loadSettings() {
        if (settings) return settings;
        if (settingsPromise) return settingsPromise;

        const id = getMerchantId();

        if (!id) return null;

        settingsPromise = fetch(
            `${API_BASE}/api/settings?merchant_id=${encodeURIComponent(id)}`
        )
            .then(res => {
                if (!res.ok) {
                    throw new Error('settings failed');
                }

                return res.json();
            })
            .then(data => {
                settings = data?.settings || data || {};
                return settings;
            })
            .catch(() => null);

        return settingsPromise;
    }

    function getWhatsAppNumber() {
        return String(
            settings?.whatsapp_number ||
            settings?.phone ||
            settings?.whatsapp ||
            settings?.number ||
            ''
        ).replace(/\D/g, '');
    }

    function getValue(value) {
        if (value === null || value === undefined) {
            return null;
        }

        if (typeof value === 'object') {
            return value.amount ?? value.value ?? null;
        }

        return value;
    }

    function getCardProduct(card) {
        try {
            return card.product || null;
        } catch (_) {
            return null;
        }
    }

    function getCardName(card, product) {
        const name =
            product?.name ||
            product?.title ||
            product?.product_name;

        if (name && String(name).trim()) {
            return String(name).trim();
        }

        const element =
            card.querySelector('[class*="product-name"]') ||
            card.querySelector('[class*="product-title"]') ||
            card.querySelector('h2') ||
            card.querySelector('h3');

        return element?.textContent?.trim() || '';
    }

    function getCardUrl(card, product) {
        const url =
            product?.url ||
            product?.link ||
            product?.product_url;

        if (url) return String(url);

        const link =
            card.querySelector('a[href*="/products/"]') ||
            card.querySelector('a[href]');

        return link?.href || '';
    }

    function normalizeProduct(rawProduct, root) {
        if (!rawProduct) return null;

        const salePrice =
            getValue(rawProduct.sale_price);

        const price =
            getValue(rawProduct.price);

        const regularPrice =
            getValue(
                rawProduct.regular_price ??
                rawProduct.compare_price ??
                rawProduct.old_price
            );

        const isCard =
            root?.tagName === 'SALLA-PRODUCT-CARD';

        return {
            id:
                rawProduct.id ??
                rawProduct.product_id ??
                rawProduct.productId ??
                root?.getAttribute('data-product-id') ??
                root?.getAttribute('product-id') ??
                null,

            name: isCard
                ? getCardName(root, rawProduct)
                : String(
                    rawProduct.name ||
                    rawProduct.title ||
                    rawProduct.product_name ||
                    ''
                ).trim(),

            url: isCard
                ? getCardUrl(root, rawProduct)
                : (
                    rawProduct.url ||
                    rawProduct.link ||
                    rawProduct.product_url ||
                    window.location.href
                ),

            price,
            salePrice,
            regularPrice,

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

    function isProductOutOfStock(product, root) {
        if (!product) return false;

        if (product.isAvailable === false) {
            return true;
        }

        const status =
            String(product.status || '').toLowerCase();

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

        const text =
            statusElement?.textContent?.toLowerCase() || '';

        return (
            text.includes('نفدت الكمية') ||
            text.includes('نفد المخزون') ||
            text.includes('غير متوفر') ||
            text.includes('sold out') ||
            text.includes('out of stock') ||
            text.includes('unavailable')
        );
    }
        function formatNumber(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return '';
        }

        return new Intl.NumberFormat('ar-SA', {
            maximumFractionDigits: 2
        }).format(number);
    }

    function getPriceText(product) {
        const price = Number(product.price);
        const sale = Number(product.salePrice);
        const regular = Number(product.regularPrice);

        if (
            Number.isFinite(sale) &&
            sale > 0 &&
            Number.isFinite(regular) &&
            regular > sale
        ) {
            return [
                `السعر الأصلي: ${formatNumber(regular)}`,
                `السعر بعد الخصم: ${formatNumber(sale)}`
            ].join('\n');
        }

        if (
            Number.isFinite(price) &&
            price > 0
        ) {
            return `السعر: ${formatNumber(price)}`;
        }

        if (
            Number.isFinite(sale) &&
            sale > 0
        ) {
            return `السعر: ${formatNumber(sale)}`;
        }

        return '';
    }

    function createWhatsAppUrl(product) {
        const number = getWhatsAppNumber();

        if (!number || !product?.name) {
            return null;
        }

        const customMessage =
            String(
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
            product.url
                ? `الرابط: ${product.url}`
                : ''
        ]
            .filter(Boolean)
            .join('\n');

        return (
            `https://wa.me/${number}` +
            `?text=${encodeURIComponent(message)}`
        );
    }

    function getProductPageProduct() {
        let product = null;

        try {
            product = window.salla?.product || null;
        } catch (_) {}

        if (!product) {
            product = getSallaConfig('product');
        }

        if (!product) {
            const button =
                document.querySelector(
                    'salla-add-product-button'
                );

            product = button?.product || null;
        }

        return normalizeProduct(
            product,
            document
        );
    }

    function createProductButton(product) {
        const url = createWhatsAppUrl(product);

        if (!url) return null;

        const button = document.createElement('a');

        button.id = BUTTON_ID;
        button.href = url;
        button.target = '_blank';
        button.rel = 'noopener noreferrer';

        button.textContent = BUTTON_TEXT;

        Object.assign(button.style, {
            display: 'flex',
            width: '100%',
            minHeight: '46px',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            marginTop: '10px',
            padding: '11px 14px',
            background: '#25D366',
            color: '#fff',
            textDecoration: 'none',
            textAlign: 'center',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '700',
            lineHeight: '1.2',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: 'pointer'
        });

        return button;
    }

    async function checkProductPage() {
        const officialButton =
            document.querySelector(
                'salla-add-product-button'
            );

        if (!officialButton) return;

        if (document.getElementById(BUTTON_ID)) {
            return;
        }

        if (productButtonCreating) return;

        productButtonCreating = true;

        try {
            const product = getProductPageProduct();

            if (!product) return;

            if (
                !isProductOutOfStock(
                    product,
                    document
                )
            ) {
                return;
            }

            await loadSettings();

            if (!settings) return;

            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            const button =
                createProductButton(product);

            if (!button) return;

            officialButton.insertAdjacentElement(
                'afterend',
                button
            );
        } finally {
            productButtonCreating = false;
        }
    }

    function getCardTarget(card) {
        return (
            card.querySelector('.product-card__body') ||
            card.querySelector('.product-card__content') ||
            card.querySelector('.product-card__info') ||
            card
        );
    }

    function createCardButton(product) {
        const url = createWhatsAppUrl(product);

        if (!url) return null;

        const wrapper = document.createElement('div');

        wrapper.className =
            `${CARD_BUTTON_CLASS}-wrapper`;

        Object.assign(wrapper.style, {
            display: 'block',
            width: '100%',
            flex: '0 0 100%',
            boxSizing: 'border-box',
            clear: 'both',
            marginTop: '8px'
        });

        const button = document.createElement('a');

        button.className = CARD_BUTTON_CLASS;
        button.href = url;
        button.target = '_blank';
        button.rel = 'noopener noreferrer';

        button.textContent = BUTTON_TEXT;

        Object.assign(button.style, {
            display: 'flex',
            width: '100%',
            minHeight: '38px',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            padding: '8px 7px',
            background: '#25D366',
            color: '#fff',
            textDecoration: 'none',
            textAlign: 'center',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '700',
            lineHeight: '1.2',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: 'pointer'
        });

        wrapper.appendChild(button);

        return wrapper;
            }
        async function checkProductCards() {
        const cards =
            document.querySelectorAll(
                'salla-product-card'
            );

        if (!cards.length) return;

        await loadSettings();

        if (!settings) return;

        cards.forEach(card => {
            if (
                card.querySelector(
                    `.${CARD_BUTTON_CLASS}`
                )
            ) {
                return;
            }

            const rawProduct =
                getCardProduct(card);

            if (!rawProduct) return;

            const product =
                normalizeProduct(
                    rawProduct,
                    card
                );

            if (!product) return;

            if (!product.name) return;

            if (
                !isProductOutOfStock(
                    product,
                    card
                )
            ) {
                return;
            }

            const button =
                createCardButton(product);

            if (!button) return;

            const target =
                getCardTarget(card);

            target.appendChild(button);
        });
    }

    function checkAllProducts() {
        checkProductPage();
        checkProductCards();
    }

    let observerTimer = null;

    const observer =
        new MutationObserver(() => {
            clearTimeout(observerTimer);

            observerTimer = setTimeout(
                checkAllProducts,
                200
            );
        });

    function start() {
        checkAllProducts();

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    'disabled',
                    'class',
                    'data-status',
                    'data-product-status',
                    'data-out-of-stock'
                ]
            }
        );

        setTimeout(
            checkAllProducts,
            1000
        );

        setTimeout(
            checkAllProducts,
            2500
        );

        setTimeout(
            checkAllProducts,
            5000
        );
    }

    if (
        document.readyState === 'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            start,
            { once: true }
        );
    } else {
        start();
    }
})();
