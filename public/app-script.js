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

        if (configPrice) {
            if (
                typeof configPrice === 'object' &&
                configPrice.amount !== undefined
            ) {
                return formatMoney(
                    configPrice.amount,
                    configPrice.currency
                );
            }

            return String(configPrice);
        }

        const selectors = [
            '[class*="price"]',
            '[class*="product-price"]',
            '[data-product-price]'
        ];

        for (const selector of selectors) {
            const elements =
                document.querySelectorAll(selector);

            for (const element of elements) {
                const text =
                    element.textContent
                        .trim()
                        .replace(/\s+/g, ' ');

                if (
                    text &&
                    /\d/.test(text)
                ) {
                    return text;
                }
            }
        }

        return '';
    }

    function getProductUrl() {
        return window.location.href;
    }

    /* =========================
       Price Helpers
    ========================= */

    function getMoneyAmount(value) {
        if (value === null || value === undefined) {
            return null;
        }

        if (
            typeof value === 'object' &&
            value.amount !== undefined
        ) {
            const amount =
                Number(value.amount);

            return Number.isFinite(amount)
                ? amount
                : null;
        }

        const amount =
            Number(value);

        return Number.isFinite(amount)
            ? amount
            : null;
    }

    function getMoneyCurrency(value) {
        if (
            value &&
            typeof value === 'object' &&
            value.currency
        ) {
            return String(
                value.currency
            );
        }

        return '';
    }

    function formatMoney(
        amount,
        currency
    ) {
        if (
            amount === null ||
            amount === undefined ||
            amount === ''
        ) {
            return '';
        }

        const number =
            Number(amount);

        if (!Number.isFinite(number)) {
            return '';
        }

        let formatted;

        try {
            formatted =
                new Intl.NumberFormat(
                    'ar-SA',
                    {
                        maximumFractionDigits: 2
                    }
                ).format(number);
        } catch (error) {
            formatted =
                String(number);
        }

        let currencyText = '';

        if (currency) {
            const code =
                String(currency)
                    .toUpperCase();

            if (code === 'SAR') {
                currencyText = ' ريال';
            } else {
                currencyText =
                    ' ' + code;
            }
        }

        return formatted +
            currencyText;
    }

    function getProductPriceFromData(product) {
        if (!product) {
            return '';
        }

        const saleAmount =
            getMoneyAmount(
                product.sale_price
            );

        const priceAmount =
            getMoneyAmount(
                product.price
            );

        const regularAmount =
            getMoneyAmount(
                product.regular_price
            );

        const saleCurrency =
            getMoneyCurrency(
                product.sale_price
            );

        const priceCurrency =
            getMoneyCurrency(
                product.price
            );

        const regularCurrency =
            getMoneyCurrency(
                product.regular_price
            );

        if (
            saleAmount !== null &&
            saleAmount > 0
        ) {
            return formatMoney(
                saleAmount,
                saleCurrency ||
                priceCurrency ||
                regularCurrency
            );
        }

        if (priceAmount !== null) {
            return formatMoney(
                priceAmount,
                priceCurrency ||
                regularCurrency
            );
        }

        if (regularAmount !== null) {
            return formatMoney(
                regularAmount,
                regularCurrency
            );
        }

        return '';
    }

    function getOriginalPriceFromData(product) {
        if (!product) {
            return '';
        }

        const regularAmount =
            getMoneyAmount(
                product.regular_price
            );

        const priceAmount =
            getMoneyAmount(
                product.price
            );

        const regularCurrency =
            getMoneyCurrency(
                product.regular_price
            );

        const priceCurrency =
            getMoneyCurrency(
                product.price
            );

        if (
            regularAmount !== null &&
            priceAmount !== null &&
            regularAmount > priceAmount
        ) {
            return formatMoney(
                regularAmount,
                regularCurrency ||
                priceCurrency
            );
        }

        return '';
                           }
    /* =========================
       Product Page Stock
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
                component.getAttribute('aria-disabled') === 'true'
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

    /* =========================
       Product Page Button
    ========================= */

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

    function createWhatsAppUrl(
        productName,
        productPrice,
        productUrl,
        originalPrice
    ) {
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
            `\n\nالمنتج: ${productName}`;

        if (productPrice) {
            message +=
                `\nالسعر: ${productPrice}`;
        }

        if (
            originalPrice &&
            originalPrice !== productPrice
        ) {
            message +=
                `\nالسعر السابق: ${originalPrice}`;
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

    function createButton() {
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

        const whatsappUrl =
            createWhatsAppUrl(
                getProductName(),
                getProductPrice(),
                getProductUrl(),
                ''
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
                button.style.opacity = '0.88';
            }
        );

        button.addEventListener(
            'mouseleave',
            function () {
                button.style.opacity = '1';
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
            let product =
                card.product;

            if (
                typeof product === 'string'
            ) {
                try {
                    product =
                        JSON.parse(product);
                } catch (error) {}
            }

            if (
                product &&
                typeof product === 'object'
            ) {
                return product;
            }
        } catch (error) {
            console.warn(
                'WhatsApp Notify card product error:',
                error
            );
        }

        return null;
    }

    function isCardOutOfStock(
        card,
        product
    ) {
        if (!product) {
            return false;
        }

        if (
            product.is_available === false
        ) {
            return true;
        }

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
            product.quantity !== undefined &&
            Number(product.quantity) === 0 &&
            product.unlimited_quantity !== true
        ) {
            return true;
        }

        const statusAttribute =
            card.getAttribute(
                'product-status'
            );

        if (
            statusAttribute &&
            (
                statusAttribute === 'out' ||
                statusAttribute === 'out-of-stock' ||
                statusAttribute === 'out_of_stock'
            )
        ) {
            return true;
        }

        return false;
    }

    function getCardProductName(product) {
        return String(
            product?.name ||
            product?.title ||
            'هذا المنتج'
        ).trim();
    }

    function getCardProductUrl(
        product,
        card
    ) {
        if (product?.url) {
            return String(
                product.url
            );
        }

        if (product?.urls?.customer) {
            return String(
                product.urls.customer
            );
        }

        const link =
            card.querySelector(
                'a[href]'
            );

        if (link?.href) {
            return link.href;
        }

        return window.location.href;
    }

    function createCardButton(
        card,
        product
    ) {
        if (!card || !product) {
            return;
        }

        if (
            card.querySelector(
                '.' + CARD_BUTTON_CLASS
            )
        ) {
            return;
        }

        const productName =
            getCardProductName(product);

        const productPrice =
            getProductPriceFromData(
                product
            );

        const originalPrice =
            getOriginalPriceFromData(
                product
            );

        const productUrl =
            getCardProductUrl(
                product,
                card
            );

        const whatsappUrl =
            createWhatsAppUrl(
                productName,
                productPrice,
                productUrl,
                originalPrice
            );

        if (!whatsappUrl) {
            return;
        }

        const button =
            document.createElement('a');

        button.className =
            CARD_BUTTON_CLASS;

        button.href =
            whatsappUrl;

        button.target =
            '_blank';

        button.rel =
            'noopener noreferrer';

        button.innerHTML =
            '<span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-left:6px;font-size:17px;">◉</span>' +
            '<span>أبلغني عند التوفر</span>';

        button.style.cssText = `
            display:flex;
            align-items:center;
            justify-content:center;
            width:calc(100% - 16px);
            margin:8px;
            padding:10px 8px;
            background:#25D366;
            color:#ffffff;
            border-radius:8px;
            text-align:center;
            text-decoration:none;
            font-size:13px;
            font-weight:700;
            line-height:1.3;
            box-sizing:border-box;
            cursor:pointer;
            position:relative;
            z-index:20;
        `;

        button.addEventListener(
            'click',
            function (event) {
                event.stopPropagation();
            }
        );

        /*
         * Add the button as a child of the
         * Salla card host. This does not depend
         * on a specific theme's internal HTML.
         */
        try {
            card.style.position =
                card.style.position ||
                'relative';

            card.appendChild(button);
        } catch (error) {
            console.warn(
                'WhatsApp Notify card button error:',
                error
            );
        }
    }

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

        for (
            const card
            of cards
        ) {
            const product =
                getCardProduct(card);

            if (
                !product ||
                !isCardOutOfStock(
                    card,
                    product
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
       Main Product Check
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

        createButton();
    }

    /* =========================
       Observe Salla Rendering
    ========================= */

    let checkTimer = null;

    function scheduleCheck() {
        clearTimeout(checkTimer);

        checkTimer =
            setTimeout(
                function () {
                    checkProduct();
                    checkProductCards();
                },
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
                        'aria-disabled'
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
