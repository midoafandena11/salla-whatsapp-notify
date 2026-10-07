(function () {
    'use strict';

    const API_BASE =
        'https://salla-whatsapp-notify.onrender.com';

    const BUTTON_ID =
        'salla-whatsapp-notify-button';

    const CARD_BUTTON_CLASS =
        'salla-whatsapp-notify-card-button';

    let merchantId = null;
    let settings = null;
    let settingsPromise = null;

    /* =========================
       Basic Helpers
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
        } catch (error) {
            console.warn(
                'Salla config error:',
                key,
                error
            );
        }

        return null;
    }

    function getMerchantId() {
        if (merchantId) {
            return merchantId;
        }

        const storeId =
            getSallaConfig('store.id');

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
            const params =
                new URLSearchParams(
                    window.location.search
                );

            const urlMerchantId =
                params.get('merchant_id');

            if (urlMerchantId) {
                merchantId =
                    String(urlMerchantId);

                return merchantId;
            }
        } catch (error) {}

        return null;
    }

    /* =========================
       Load Settings
    ========================= */

    async function loadSettings() {
        if (settings) {
            return settings;
        }

        if (settingsPromise) {
            return settingsPromise;
        }

        const id = getMerchantId();

        if (!id) {
            console.warn(
                'WhatsApp Notify: merchant ID not found'
            );

            return null;
        }

        settingsPromise = fetch(
            `${API_BASE}/api/settings?merchant_id=${encodeURIComponent(id)}`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            }
        )
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(
                        `Settings request failed: ${response.status}`
                    );
                }

                return response.json();
            })
            .then((data) => {
                if (
                    !data ||
                    data.success !== true
                ) {
                    throw new Error(
                        data?.error ||
                        'Invalid settings response'
                    );
                }

                settings = {
                    whatsappNumber:
                        String(
                            data.whatsappNumber ||
                            ''
                        ).trim(),

                    customMessage:
                        String(
                            data.customMessage ||
                            'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
                        ).trim()
                };

                return settings;
            })
            .catch((error) => {
                console.error(
                    'WhatsApp Notify settings error:',
                    error
                );

                settingsPromise = null;

                return null;
            });

        return settingsPromise;
    }

    /* =========================
       Product Normalization
    ========================= */

    function getNumber(value) {
        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {
            return null;
        }

        if (typeof value === 'object') {
            value =
                value.amount ??
                value.value ??
                value.price ??
                null;
        }

        const number =
            Number(
                String(value)
                    .replace(/,/g, '')
                    .trim()
            );

        return Number.isFinite(number)
            ? number
            : null;
    }

    function getPriceValue(product, keys) {
        if (!product) {
            return null;
        }

        for (const key of keys) {
            const value =
                getNumber(product[key]);

            if (value !== null) {
                return value;
            }
        }

        return null;
    }

    function normalizeProduct(rawProduct, root) {
        const product =
            rawProduct &&
            typeof rawProduct === 'object'
                ? rawProduct
                : {};

        const id =
            product.id ||
            product.product_id ||
            product.productId ||
            null;

        let name =
            product.name ||
            product.title ||
            '';

        let url =
            product.url ||
            product.link ||
            product.product_url ||
            '';

        let price =
            getPriceValue(
                product,
                [
                    'sale_price',
                    'price'
                ]
            );

        let regularPrice =
            getPriceValue(
                product,
                [
                    'regular_price',
                    'compare_price',
                    'old_price'
                ]
            );

        if (
            root &&
            root.matches &&
            root.matches('salla-product-card')
        ) {
            if (!name) {
                name =
                    root.getAttribute(
                        'product-name'
                    ) || '';
            }

            if (!url) {
                const link =
                    root.querySelector(
                        'a[href]'
                    );

                if (link) {
                    url =
                        link.href;
                }
            }
        }

        if (!name) {
            name =
                getSallaConfig(
                    'page.title'
                ) || '';
        }

        if (!price) {
            const pagePrice =
                getNumber(
                    getSallaConfig(
                        'page.price'
                    )
                );

            if (pagePrice !== null) {
                price = pagePrice;
            }
        }

        if (!url) {
            url =
                window.location.href;
        }

        return {
            id: id
                ? String(id)
                : null,

            name:
                String(name || '')
                    .trim() ||
                'هذا المنتج',

            url:
                String(url || '').trim() ||
                window.location.href,

            price,

            regularPrice,

            isAvailable:
                product.is_available ??
                product.isAvailable ??
                null,

            status:
                String(
                    product.status ||
                    product.product_status ||
                    ''
                )
                    .trim()
                    .toLowerCase()
        };
    }

    /* =========================
       One Stock Check
    ========================= */

    function isProductOutOfStock(product, root) {
        if (product) {
            if (
                product.isAvailable === false
            ) {
                return true;
            }

            if (
                [
                    'out',
                    'out-of-stock',
                    'out_of_stock',
                    'sold-out',
                    'sold_out',
                    'unavailable'
                ].includes(product.status)
            ) {
                return true;
            }
        }

        if (root) {
            const status =
                root.getAttribute(
                    'product-status'
                ) ||
                root.getAttribute(
                    'status'
                ) ||
                '';

            if (
                [
                    'out',
                    'out-of-stock',
                    'out_of_stock',
                    'sold-out',
                    'sold_out',
                    'unavailable'
                ].includes(
                    String(status)
                        .trim()
                        .toLowerCase()
                )
            ) {
                return true;
            }

            if (
                root.hasAttribute(
                    'out-of-stock'
                )
            ) {
                return true;
            }

            const text =
                (
                    root.textContent || ''
                )
                    .trim()
                    .toLowerCase();

            if (
                text.includes(
                    'نفدت الكمية'
                ) ||
                text.includes(
                    'نفد المخزون'
                ) ||
                text.includes(
                    'غير متوفر'
                ) ||
                text.includes(
                    'sold out'
                ) ||
                text.includes(
                    'out of stock'
                ) ||
                text.includes(
                    'unavailable'
                )
            ) {
                return true;
            }
        }

        return false;
    }

    /* =========================
       Product Page Data
    ========================= */

    function getProductPageRawProduct() {
        try {
            if (
                window.salla &&
                window.salla.product
            ) {
                return window.salla.product;
            }
        } catch (error) {}

        const configProduct =
            getSallaConfig(
                'product'
            );

        if (
            configProduct &&
            typeof configProduct === 'object'
        ) {
            return configProduct;
        }

        try {
            const button =
                document.querySelector(
                    'salla-add-product-button'
                );

            if (
                button &&
                button.product &&
                typeof button.product === 'object'
            ) {
                return button.product;
            }
        } catch (error) {}

        return {};
    }

    function getProductPageFallbackRoot() {
        const button =
            document.querySelector(
                'salla-add-product-button'
            );

        if (button) {
            return button;
        }

        return document.body;
    }
        /* =========================
       WhatsApp URL
    ========================= */

    function formatProductPrice(product) {
        const current =
            product.price;

        const original =
            product.regularPrice;

        if (
            current === null &&
            original === null
        ) {
            return '';
        }

        if (
            current !== null &&
            original !== null &&
            original > current
        ) {
            return (
                `السعر الأصلي: ${original}` +
                `\nالسعر بعد الخصم: ${current}`
            );
        }

        if (current !== null) {
            return `السعر: ${current}`;
        }

        if (original !== null) {
            return `السعر: ${original}`;
        }

        return '';
    }

    function createWhatsAppUrl(product) {
        if (
            !settings ||
            !settings.whatsappNumber
        ) {
            return null;
        }

        let number =
            settings.whatsappNumber
                .replace(/\D/g, '');

        if (!number) {
            return null;
        }

        let message =
            settings.customMessage ||
            'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

        message +=
            `\n\nالمنتج: ${product.name}`;

        const priceText =
            formatProductPrice(product);

        if (priceText) {
            message +=
                `\n${priceText}`;
        }

        message +=
            `\nالرابط: ${product.url}`;

        return (
            'https://wa.me/' +
            number +
            '?text=' +
            encodeURIComponent(message)
        );
    }

    /* =========================
       Create Same Button
    ========================= */

    function createWhatsAppButton(product, isCard) {
        const button =
            document.createElement('a');

        if (isCard) {
            button.className =
                CARD_BUTTON_CLASS;
        } else {
            button.id = BUTTON_ID;
        }

        button.href =
            createWhatsAppUrl(product);

        button.target =
            '_blank';

        button.rel =
            'noopener noreferrer';

        button.textContent =
            '🔔 أبلغني عبر واتساب عند توفر المنتج';

        button.style.cssText = `
            display:block;
            width:100%;
            margin-top:12px;
            padding:14px 18px;
            background:#25D366;
            color:#ffffff;
            border-radius:12px;
            text-align:center;
            text-decoration:none;
            font-size:15px;
            font-weight:700;
            line-height:1.4;
            box-sizing:border-box;
            cursor:pointer;
            transition:opacity .2s ease;
            white-space:normal;
            overflow:hidden;
            text-overflow:ellipsis;
        `;

        if (isCard) {
            button.style.fontSize =
                'clamp(11px, 3.2cqw, 14px)';

            button.style.padding =
                '10px 8px';

            button.style.marginTop =
                '8px';

            button.style.borderRadius =
                '9px';

            button.style.lineHeight =
                '1.3';

            button.style.containerType =
                'inline-size';
        }

        button.addEventListener(
            'mouseenter',
            function () {
                button.style.opacity =
                    '0.88';
            }
        );

        button.addEventListener(
            'mouseleave',
            function () {
                button.style.opacity =
                    '1';
            }
        );

        return button;
    }

    /* =========================
       Product Page
    ========================= */

    async function checkProductPage() {
        const pageId =
            getSallaConfig(
                'page.id'
            );

        if (!pageId) {
            return;
        }

        const root =
            getProductPageFallbackRoot();

        const rawProduct =
            getProductPageRawProduct();

        const product =
            normalizeProduct(
                rawProduct,
                root
            );

        const outOfStock =
            isProductOutOfStock(
                product,
                root
            );

        const existing =
            document.getElementById(
                BUTTON_ID
            );

        if (!outOfStock) {
            if (existing) {
                existing.remove();
            }

            return;
        }

        const loadedSettings =
            await loadSettings();

        if (!loadedSettings) {
            return;
        }

        if (existing) {
            return;
        }

        const productButton =
            document.querySelector(
                'salla-add-product-button'
            ) ||
            document.querySelector(
                '[data-product-id] button'
            ) ||
            document.querySelector(
                '.product-form button'
            ) ||
            document.querySelector(
                '.product-details button'
            ) ||
            document.querySelector(
                'button[type="submit"]'
            );

        if (!productButton) {
            return;
        }

        const button =
            createWhatsAppButton(
                product,
                false
            );

        if (!button.href) {
            return;
        }

        productButton.insertAdjacentElement(
            'afterend',
            button
        );
    }

    /* =========================
       Product Cards
    ========================= */

    async function checkProductCards() {
        const cards =
            document.querySelectorAll(
                'salla-product-card'
            );

        if (!cards.length) {
            return;
        }

        const loadedSettings =
            await loadSettings();

        if (!loadedSettings) {
            return;
        }

        for (const card of cards) {
            const product =
                normalizeProduct(
                    card.product,
                    card
                );

            if (!product.id) {
                continue;
            }

            const outOfStock =
                isProductOutOfStock(
                    product,
                    card
                );

            const existing =
                card.querySelector(
                    `.${CARD_BUTTON_CLASS}`
                );

            if (!outOfStock) {
                if (existing) {
                    existing.remove();
                }

                continue;
            }

            if (existing) {
                continue;
            }

            const button =
                createWhatsAppButton(
                    product,
                    true
                );

            if (!button.href) {
                continue;
            }

            const target =
                card.querySelector(
                    '.product-card__body'
                ) ||
                card.querySelector(
                    '.product-card__content'
                ) ||
                card.querySelector(
                    '.product-card__info'
                ) ||
                card;

            target.appendChild(button);
        }
    }
        /* =========================
       One Main Check
    ========================= */

    async function checkAllProducts() {
        await Promise.all([
            checkProductPage(),
            checkProductCards()
        ]);
    }

    /* =========================
       Observe Salla Rendering
    ========================= */

    let checkTimer = null;

    function scheduleCheck() {
        clearTimeout(checkTimer);

        checkTimer =
            setTimeout(
                checkAllProducts,
                300
            );
    }

    const observer =
        new MutationObserver(
            function () {
                scheduleCheck();
            }
        );

    function start() {
        if (document.body) {
            observer.observe(
                document.body,
                {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: [
                        'product-status',
                        'status',
                        'disabled',
                        'aria-disabled',
                        'out-of-stock'
                    ]
                }
            );
        }

        checkAllProducts();

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
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            start,
            {
                once: true
            }
        );
    } else {
        start();
    }

})();
