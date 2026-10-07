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
       Product Information
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
       Product Card Data
    ========================= */

    function parseProduct(value) {
        if (!value) {
            return null;
        }

        if (typeof value === 'object') {
            return value;
        }

        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch (error) {
                return null;
            }
        }

        return null;
    }

    function getCardProduct(card) {
        if (!card) {
            return null;
        }

        try {
            if (card.product) {
                const product =
                    parseProduct(
                        card.product
                    );

                if (product) {
                    return product;
                }
            }
        } catch (error) {}

        try {
            const attribute =
                card.getAttribute('product');

            if (attribute) {
                const product =
                    parseProduct(attribute);

                if (product) {
                    return product;
                }
            }
        } catch (error) {}

        return null;
    }

    /* =========================
       Product Price For Cards
    ========================= */

    function numberValue(value) {
        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {
            return null;
        }

        if (
            typeof value === 'object' &&
            value.amount !== undefined
        ) {
            return numberValue(
                value.amount
            );
        }

        let text =
            String(value)
                .replace(/,/g, '')
                .trim();

        text =
            text.replace(
                /[٠-٩]/g,
                function (digit) {
                    return String(
                        '٠١٢٣٤٥٦٧٨٩'.indexOf(
                            digit
                        )
                    );
                }
            );

        const number =
            Number(text);

        if (
            Number.isFinite(number) &&
            number > 0
        ) {
            return number;
        }

        return null;
    }

    function formatPrice(value) {
        const number =
            numberValue(value);

        if (number === null) {
            return '';
        }

        return number.toLocaleString(
            'ar-SA',
            {
                maximumFractionDigits: 2
            }
        );
    }

    function getCardPrice(product) {
        if (!product) {
            return '';
        }

        const price =
            numberValue(
                product.price
            );

        const salePrice =
            numberValue(
                product.sale_price
            );

        const regularPrice =
            numberValue(
                product.regular_price
            );

        let current = null;
        let original = null;

        /*
         * Sale price + regular price
         */
        if (
            salePrice !== null &&
            regularPrice !== null &&
            salePrice < regularPrice
        ) {
            current = salePrice;
            original = regularPrice;
        }

        /*
         * Price + regular price
         */
        else if (
            price !== null &&
            regularPrice !== null &&
            price < regularPrice
        ) {
            current = price;
            original = regularPrice;
        }

        /*
         * Sale price + normal price
         */
        else if (
            salePrice !== null &&
            price !== null &&
            salePrice < price
        ) {
            current = salePrice;
            original = price;
        }

        else if (price !== null) {
            current = price;
        }

        else if (salePrice !== null) {
            current = salePrice;
        }

        else if (regularPrice !== null) {
            current = regularPrice;
        }

        if (current === null) {
            return '';
        }

        const currency =
            (
                product.currency
            ) ||
            (
                product.price &&
                typeof product.price === 'object' &&
                product.price.currency
            ) ||
            (
                product.sale_price &&
                typeof product.sale_price === 'object' &&
                product.sale_price.currency
            ) ||
            (
                product.regular_price &&
                typeof product.regular_price === 'object' &&
                product.regular_price.currency
            ) ||
            'SAR';

        if (
            original !== null &&
            original !== current
        ) {
            return (
                `${formatPrice(current)} ${currency} ` +
                `بدل ${formatPrice(original)} ${currency}`
            );
        }

        return (
            `${formatPrice(current)} ${currency}`
        );
    }

    function getCardUrl(card, product) {
        if (
            product &&
            product.urls &&
            product.urls.customer
        ) {
            return String(
                product.urls.customer
            );
        }

        if (
            product &&
            product.url
        ) {
            return String(
                product.url
            );
        }

        try {
            const link =
                card.querySelector(
                    'a[href]'
                );

            if (link && link.href) {
                return link.href;
            }
        } catch (error) {}

        return window.location.href;
    }

    /* =========================
       Out Of Stock Detection
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
                element.getAttribute(
                    attribute
                );

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
                getComponentStatus(
                    component
                );

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

    /* =========================
       Card Out Of Stock
    ========================= */

    function isCardOutOfStock(card, product) {
        /*
         * First use Salla product data
         */
        if (product) {
            if (
                product.is_available === false ||
                product.is_out_of_stock === true
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
        }

        /*
         * Then check the button inside the card
         */
        const productButton =
            card.querySelector(
                'salla-add-product-button'
            );

        if (productButton) {
            const status =
                getComponentStatus(
                    productButton
                );

            if (
                status === 'out' ||
                status === 'out-of-stock' ||
                status === 'out_of_stock' ||
                status === 'sold-out' ||
                status === 'sold_out' ||
                status === 'out-and-notify'
            ) {
                return true;
            }

            if (
                productButton.hasAttribute(
                    'disabled'
                ) ||
                productButton.getAttribute(
                    'aria-disabled'
                ) === 'true'
            ) {
                const text =
                    (
                        productButton.textContent ||
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

        /*
         * Finally check visible card text
         */
        const cardText =
            (
                card.textContent ||
                ''
            )
                .trim()
                .toLowerCase();

        if (
            cardText.includes('نفد المخزون') ||
            cardText.includes('نفذت الكمية') ||
            cardText.includes('غير متوفر') ||
            cardText.includes('out of stock') ||
            cardText.includes('sold out')
        ) {
            return true;
        }

        return false;
    }

    /* =========================
       Find Product Button
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
                document.querySelector(
                    selector
                );

            if (element) {
                return element;
            }
        }

        return null;
    }

    /* =========================
       Create WhatsApp URL
    ========================= */

    function createWhatsAppUrl(
        productName,
        productPrice,
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
         
