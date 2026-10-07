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
