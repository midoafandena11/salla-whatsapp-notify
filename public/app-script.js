(function () {
    'use strict';

    const API_BASE =
        'https://salla-whatsapp-notify.onrender.com';

    const BUTTON_ID =
        'salla-whatsapp-notify-button';

    const CARD_BUTTON_PREFIX =
        'salla-whatsapp-notify-card-';

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
       Price Helpers
    ========================= */

    function normalizePrice(value) {
        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {
            return '';
        }

        if (
            typeof value === 'object'
        ) {
            if (
                value.amount !== undefined &&
                value.amount !== null &&
                value.amount !== ''
            ) {
                const amount =
                    String(value.amount);

                const currency =
                    value.currency
                        ? String(value.currency)
                        : '';

                return currency
                    ? `${amount} ${currency}`
                    : amount;
            }

            return '';
        }

        return String(value).trim();
    }

    function getProductPriceDetails(product) {
        if (!product) {
            return {
                current: '',
                original: ''
            };
        }

        const regular =
            normalizePrice(
                product.regular_price
            );

        const sale =
            normalizePrice(
                product.sale_price
            );

        const price =
            normalizePrice(
                product.price
            );

        let current = price;

        let original = regular;

        if (
            sale &&
            sale !== '0' &&
            sale !== '0.00'
        ) {
            current = sale;

            if (
                !original ||
                original === sale
            ) {
                original = price;
            }
        }

        if (
            original &&
            current &&
            original === current
        ) {
            original = '';
        }

        return {
            current,
            original
        };
    }

    function getDomPriceDetails(root) {
        const scope =
            root || document;

        let original = '';
        let current = '';

        const originalSelectors = [
            '.price-before',
            '.regular-price',
            '.line-through',
            '[class*="before-price"]',
            '[class*="regular-price"]',
            '[class*="old-price"]'
        ];

        const currentSelectors = [
            '.product-price',
            '.price-after',
            '.sale-price',
            '[class*="sale-price"]',
            '[class*="current-price"]'
        ];

        for (
            const selector
            of originalSelectors
        ) {
            const element =
                scope.querySelector(selector);

            if (element) {
                const text =
                    element.textContent
                        .trim()
                        .replace(/\s+/g, ' ');

                if (text) {
                    original = text;
                    break;
                }
            }
        }

        for (
            const selector
            of currentSelectors
        ) {
            const element =
                scope.querySelector(selector);

            if (element) {
                const text =
                    element.textContent
                        .trim()
                        .replace(/\s+/g, ' ');

                if (text) {
                    current = text;
                    break;
                }
            }
        }

        if (!current) {
            const priceElements =
                scope.querySelectorAll(
                    '[class*="price"]'
                );

            for (
                const element
                of priceElements
            ) {
                const text =
                    element.textContent
                        .trim()
                        .replace(/\s+/g, ' ');

                if (
                    text &&
                    /\d/.test(text) &&
                    !/before|old|regular|line-through/i.test(
                        element.className || ''
                    )
                ) {
                    current = text;
                    break;
                }
            }
        }

        return {
            current,
            original
        };
    }

    /* =========================
       Product Page Information
    ========================= */

    function getProductName() {
        const configTitle =
            getSallaConfig('page.title');

        if (configTitle) {
            return String(configTitle).trim();
        }

        const selectors = [
            'h1',
            '[class*="product-title"]',
            '[class*="product-name"]',
            '[data-product-title]'
        ];

        for (const selector of selectors) {
            const element =
                document.querySelector(selector);

            if (
                element &&
                element.textContent.trim()
            ) {
                return element.textContent
                    .trim()
                    .replace(/\s+/g, ' ');
            }
        }

        return document.title
            .replace(/\s*[|—-]\s*.*$/, '')
            .trim() ||
            'هذا المنتج';
    }

    function getProductPrice() {
        const configPrice =
            getSallaConfig('page.price');

        const normalized =
            normalizePrice(configPrice);

        if (normalized) {
            return normalized;
        }

        const details =
            getDomPriceDetails();

        if (details.current) {
            return details.current;
        }

        return details.original || '';
    }

    function getProductUrl() {
        return window.location.href;
    }

    /* =========================
       Product Button Status
    ========================= */

    function getComponentStatus(element) {
        if (!element) {
            return '';
        }

        const attributes = [
            'product-status',
            'status',
            'data-product-status'
        ];

        for (const attribute of attributes) {
            const value =
                element.getAttribute(attribute);

            if (value) {
                return String(value)
                    .trim()
                    .toLowerCase();
            }
        }

        const properties = [
            'productStatus',
            'status'
        ];

        for (const property of properties) {
            try {
                const value =
                    element[property];

                if (
                    typeof value === 'string' &&
                    value.trim()
                ) {
                    return value
                        .trim()
                        .toLowerCase();
                }
            } catch (error) {}
        }

        return '';
    }

    function isOutOfStock() {
        const productButtons =
            document.querySelectorAll(
                'salla-add-product-button'
            );

        for (
            const component
            of productButtons
        ) {
            const status =
                getComponentStatus(component);

            if (
                status === 'out' ||
                status === 'out-of-stock' ||
                status === 'out_of_stock' ||
                status === 'sold-out' ||
                status === 'sold_out'
            ) {
                return true;
            }

            if (
                component.hasAttribute('disabled') ||
                component.getAttribute(
                    'aria-disabled'
                ) === 'true'
            ) {
                const text =
                    (
                        component.textContent ||
                        ''
                    )
                        .trim()
                        .toLowerCase();

                if (
                    text.includes('نفد') ||
                    text.includes('غير متوفر') ||
                    text.includes('نفذت') ||
                    text.includes('sold out') ||
                    text.includes('out of stock') ||
                    text.includes('unavailable')
                ) {
                    return true;
                }
            }
        }

        const availability =
            document.querySelector(
                'salla-product-availability'
            );

        if (availability) {
            return true;
        }

        const possibleButtons =
            document.querySelectorAll(
                'button, a, [role="button"]'
            );

        for (
            const element
            of possibleButtons
        ) {
            const text =
                (
                    element.textContent ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            if (!text) {
                continue;
            }

            const looksSoldOut =
                text.includes('نفد المخزون') ||
                text.includes('غير متوفر') ||
                text.includes('نفد') ||
                text.includes('نفذت الكمية') ||
                text.includes('sold out') ||
                text.includes('out of stock') ||
                text.includes('unavailable');

            if (
                looksSoldOut &&
                (
                    element.disabled ||
                    element.getAttribute(
                        'aria-disabled'
                    ) === 'true'
                )
            ) {
                return true;
            }
        }

        return false;
    }

    function findProductButton() {
        const official =
            document.querySelector(
                'salla-add-product-button'
            );

        if (official) {
            return official;
        }

        const selectors = [
            '[data-product-id] button',
            '.product-form button',
            '.product-details button',
            'button[type="submit"]'
        ];

        for (const selector of selectors) {
            const element =
                document.querySelector(selector);

            if (element) {
                return element;
            }
        }

        return null;
    }
        /* =========================
       WhatsApp URL
    ========================= */

    function createWhatsAppUrl(
        productName,
        priceDetails,
        productUrl
    ) {
        if (
            !settings ||
            !settings.whatsappNumber
        ) {
            return null;
        }

        const number =
            settings.whatsappNumber
                .replace(/\D/g, '');

        if (!number) {
            return null;
        }

        let message =
            settings.customMessage ||
            'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

        message +=
            `\n\nالمنتج: ${productName}`;

        if (
            priceDetails &&
            priceDetails.original &&
            priceDetails.current
        ) {
            message +=
                `\nالسعر الأصلي: ${priceDetails.original}`;

            message +=
                `\nالسعر بعد الخصم: ${priceDetails.current}`;
        } else if (
            priceDetails &&
            priceDetails.current
        ) {
            message +=
                `\nالسعر: ${priceDetails.current}`;
        } else if (
            priceDetails &&
            priceDetails.original
        ) {
            message +=
                `\nالسعر: ${priceDetails.original}`;
        }

        message +=
            `\nالرابط: ${productUrl}`;

        return (
            'https://wa.me/' +
            number +
            '?text=' +
            encodeURIComponent(message)
        );
    }

    /* =========================
       Product Page Button
       KEEP ORIGINAL BEHAVIOR
    ========================= */

    function createProductButton() {
        if (
            document.getElementById(
                BUTTON_ID
            )
        ) {
            return;
        }

        const productButton =
            findProductButton();

        if (!productButton) {
            return;
        }

        const priceDetails =
            getDomPriceDetails();

        const whatsappUrl =
            createWhatsAppUrl(
                getProductName(),
                priceDetails,
                getProductUrl()
            );

        if (!whatsappUrl) {
            return;
        }

        const button =
            document.createElement('a');

        button.id =
            BUTTON_ID;

        button.href =
            whatsappUrl;

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
        `;

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

        productButton.insertAdjacentElement(
            'afterend',
            button
        );
    }

    /* =========================
       Homepage Product Cards
    ========================= */

    function getCardProduct(card) {
        if (!card) {
            return null;
        }

        try {
            if (
                card.product &&
                typeof card.product === 'object'
            ) {
                return card.product;
            }
        } catch (error) {}

        const raw =
            card.getAttribute('product');

        if (raw) {
            try {
                return JSON.parse(raw);
            } catch (error) {}
        }

        return null;
    }

    function getCardProductId(product, card) {
        if (product) {
            const id =
                product.id ||
                product.product_id ||
                product.sku;

            if (id) {
                return String(id);
            }
        }

        if (card) {
            const id =
                card.getAttribute(
                    'data-product-id'
                ) ||
                card.getAttribute('id');

            if (id) {
                return String(id);
            }
        }

        return '';
    }

    function isCardOutOfStock(
        product,
        card
    ) {
        if (product) {
            const status =
                String(
                    product.status || ''
                )
                    .trim()
                    .toLowerCase();

            if (
                status === 'out' ||
                status === 'out-of-stock' ||
                status === 'out_of_stock' ||
                status === 'sold-out' ||
                status === 'sold_out'
            ) {
                return true;
            }

            if (
                product.is_available === false
            ) {
                return true;
            }
        }

        if (card) {
            const status =
                (
                    card.getAttribute(
                        'product-status'
                    ) ||
                    card.getAttribute('status') ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            if (
                status === 'out' ||
                status === 'out-of-stock' ||
                status === 'out_of_stock' ||
                status === 'sold-out' ||
                status === 'sold_out'
            ) {
                return true;
            }

            const text =
                (
                    card.textContent ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            if (
                text.includes('نفدت الكمية') ||
                text.includes('نفد المخزون') ||
                text.includes('نفذت الكمية') ||
                text.includes('غير متوفر') ||
                text.includes('out of stock') ||
                text.includes('sold out')
            ) {
                return true;
            }
        }

        return false;
    }

    function findCardInsertTarget(card) {
        const selectors = [
            'salla-add-product-button',
            'button',
            '[role="button"]',
            'a[href*="/cart"]'
        ];

        for (
            const selector
            of selectors
        ) {
            const elements =
                card.querySelectorAll(selector);

            for (
                const element
                of elements
            ) {
                const text =
                    (
                        element.textContent ||
                        ''
                    )
                        .trim()
                        .toLowerCase();

                if (
                    text.includes('نفد') ||
                    text.includes('غير متوفر') ||
                    text.includes('نفذت') ||
                    text.includes('out of stock') ||
                    text.includes('sold out')
                ) {
                    return element;
                }
            }
        }

        return (
            card.querySelector(
                'salla-add-product-button'
            ) ||
            card.querySelector('button')
        );
    }

    function createCardButton(
        card,
        product
    ) {
        const productId =
            getCardProductId(
                product,
                card
            );

        if (!productId) {
            return;
        }

        const buttonId =
            CARD_BUTTON_PREFIX +
            productId;

        if (
            document.getElementById(
                buttonId
            )
        ) {
            return;
        }

        const productName =
            String(
                product?.name ||
                product?.title ||
                card.querySelector(
                    'h2, h3, h4, [class*="name"], [class*="title"]'
                )?.textContent ||
                'هذا المنتج'
            )
                .trim()
                .replace(/\s+/g, ' ');

        const priceDetails =
            getProductPriceDetails(
                product
            );

        const domPrices =
            getDomPriceDetails(card);

        if (!priceDetails.current) {
            priceDetails.current =
                domPrices.current;
        }

        if (!priceDetails.original) {
            priceDetails.original =
                domPrices.original;
        }

        const productUrl =
            product?.url ||
            product?.urls?.customer ||
            card.querySelector(
                'a[href]'
            )?.href ||
            window.location.href;

        const whatsappUrl =
            createWhatsAppUrl(
                productName,
                priceDetails,
                productUrl
            );

        if (!whatsappUrl) {
            return;
        }

        const button =
            document.createElement('a');

        button.id =
            buttonId;

        button.href =
            whatsappUrl;

        button.target =
            '_blank';

        button.rel =
            'noopener noreferrer';

        button.innerHTML =
            '🟢 أبلغني عند التوفر';

        button.style.cssText = `
            display:flex;
            align-items:center;
            justify-content:center;
            width:100%;
            margin-top:8px;
            padding:10px 12px;
            background:#25D366;
            color:#ffffff;
            border-radius:10px;
            text-align:center;
            text-decoration:none;
            font-size:14px;
            font-weight:700;
            line-height:1.3;
            box-sizing:border-box;
            cursor:pointer;
        `;

        const target =
            findCardInsertTarget(card);

        if (target) {
            target.insertAdjacentElement(
                'afterend',
                button
            );
        } else {
            card.appendChild(button);
        }
    }

    async function checkProductCards() {
        const loadedSettings =
            await loadSettings();

        if (!loadedSettings) {
            return;
        }

        const cards =
            document.querySelectorAll(
                'salla-product-card'
            );

        for (
            const card
            of cards
        ) {
            const product =
                getCardProduct(card);

            if (!product) {
                continue;
            }

            if (
                !isCardOutOfStock(
                    product,
                    card
                )
            ) {
                continue;
            }

            createCardButton(
                card,
                product
            );
        }
    }

    /* =========================
       Product Page Check
    ========================= */

    async function checkProduct() {
        const pageId =
            getSallaConfig('page.id');

        if (!pageId) {
            return;
        }

        const outOfStock =
            isOutOfStock();

        if (!outOfStock) {
            const existing =
                document.getElementById(
                    BUTTON_ID
                );

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

        createProductButton();
    }

    /* =========================
       Main
    ========================= */

    let checkTimer = null;

    function scheduleCheck() {
        clearTimeout(checkTimer);

        checkTimer = setTimeout(
            function () {
                checkProduct();
                checkProductCards();
            },
            400
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
                        'product'
                    ]
                }
            );
        }

        checkProduct();
        checkProductCards();

        setTimeout(
            function () {
                checkProduct();
                checkProductCards();
            },
            1000
        );

        setTimeout(
            function () {
                checkProduct();
                checkProductCards();
            },
            2500
        );

        setTimeout(
            function () {
                checkProduct();
                checkProductCards();
            },
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
