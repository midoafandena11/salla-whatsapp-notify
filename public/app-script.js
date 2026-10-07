(function () {
    'use strict';

    const API_BASE =
        'https://salla-whatsapp-notify.onrender.com';

    const PRODUCT_BUTTON_ID =
        'salla-whatsapp-notify-button';

    const CARD_BUTTON_PREFIX =
        'salla-whatsapp-notify-card';

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
                'WhatsApp Notify: Salla config error',
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
       Product Data Helpers
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

    function getProductFromCard(card) {
        if (!card) {
            return null;
        }

        try {
            const propertyProduct =
                parseProduct(card.product);

            if (propertyProduct) {
                return propertyProduct;
            }
        } catch (error) {}

        try {
            const attributeProduct =
                parseProduct(
                    card.getAttribute('product')
                );

            if (attributeProduct) {
                return attributeProduct;
            }
        } catch (error) {}

        return null;
    }

    function getProductFromPage() {
        const officialButton =
            document.querySelector(
                'salla-add-product-button'
            );

        if (officialButton) {
            try {
                const product =
                    parseProduct(
                        officialButton.product
                    );

                if (product) {
                    return product;
                }
            } catch (error) {}

            try {
                const productData =
                    parseProduct(
                        officialButton.productData
                    );

                if (productData) {
                    return productData;
                }
            } catch (error) {}
        }

        const possibleProducts = [
            getSallaConfig('page.product'),
            getSallaConfig('product'),
            getSallaConfig('page.data.product')
        ];

        for (const value of possibleProducts) {
            const product =
                parseProduct(value);

            if (product) {
                return product;
            }
        }

        return null;
    }

    /* =========================
       Product Name
    ========================= */

    function getProductName(product) {
        if (
            product &&
            product.name
        ) {
            return String(
                product.name
            ).trim();
        }

        const configTitle =
            getSallaConfig('page.title');

        if (configTitle) {
            return String(
                configTitle
            ).trim();
        }

        const selectors = [
            'h1',
            '[class*="product-title"]',
            '[class*="product-name"]',
            '[data-product-title]'
        ];

        for (const selector of selectors) {
            const element =
                document.querySelector(
                    selector
                );

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

    /* =========================
       Price Helpers
    ========================= */

    function getNumber(value) {
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
            return getNumber(value.amount);
        }

        let text =
            String(value)
                .replace(/,/g, '')
                .trim();

        /*
         * Arabic numerals -> English numerals
         */
        text = text
            .replace(/[٠-٩]/g, function (digit) {
                return String(
                    '٠١٢٣٤٥٦٧٨٩'.indexOf(digit)
                );
            });

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
            getNumber(value);

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

    function getPriceInfo(product) {
        if (!product) {
            return {
                current: '',
                original: '',
                currency: ''
            };
        }

        const price =
            getNumber(product.price);

        const salePrice =
            getNumber(product.sale_price);

        const regularPrice =
            getNumber(product.regular_price);

        const currency =
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
            product.currency ||
            'SAR';

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
         * Sale price + price
         */
        else if (
            salePrice !== null &&
            price !== null &&
            salePrice < price
        ) {
            current = salePrice;
            original = price;
        }

        /*
         * Normal single price
         */
        else if (price !== null) {
            current = price;
        }

        /*
         * Fallback
         */
        else if (salePrice !== null) {
            current = salePrice;
        }

        else if (regularPrice !== null) {
            current = regularPrice;
        }

        return {
            current:
                current !== null
                    ? formatPrice(current)
                    : '',

            original:
                original !== null
                    ? formatPrice(original)
                    : '',

            currency:
                currency || 'SAR'
        };
    }

    function getProductPrice(product) {
        const price =
            getPriceInfo(product);

        if (!price.current) {
            return '';
        }

        if (
            price.original &&
            price.original !== price.current
        ) {
            return (
                `${price.current} ${price.currency} ` +
                `بدل ${price.original} ${price.currency}`
            );
        }

        return (
            `${price.current} ${price.currency}`
        );
    }

    /* =========================
       Product URL
    ========================= */

    function getProductUrl(product) {
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

        return window.location.href;
    }

    /* =========================
       Stock Detection
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

    function isProductOutOfStock(product) {
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

        return false;
    }

    function isComponentOutOfStock(component) {
        if (!component) {
            return false;
        }

        const status =
            getComponentStatus(
                component
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

        return false;
    }

    function isPageOutOfStock() {
        const productButtons =
            document.querySelectorAll(
                'salla-add-product-button'
            );

        for (
            const component
            of productButtons
        ) {
            if (
                isComponentOutOfStock(
                    component
                )
            ) {
                return true;
            }
        }

        const availability =
            document.querySelector(
                'salla-product-availability'
            );

        if (availability) {
            return true;
        }

        return false;
    }

    /* =========================
       Product Button
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
       WhatsApp URL
    ========================= */

    function createWhatsAppUrl(
        product
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

        const productName =
            getProductName(product);

        const productPrice =
            getProductPrice(product);

        const productUrl =
            getProductUrl(product);

        let message =
            settings.customMessage ||
            'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

        message +=
            `\n\nالمنتج: ${productName}`;

        if (productPrice) {
            message +=
                `\nالسعر: ${productPrice}`;
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
       Styling
    ========================= */

    function styleButton(button) {
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
    }

    /* =========================
       Product Page
    ========================= */

    async function checkProductPage() {
        const pageId =
            getSallaConfig('page.id');

        if (!pageId) {
            return;
        }

        const outOfStock =
            isPageOutOfStock();

        if (!outOfStock) {
            const existing =
                document.getElementById(
                    PRODUCT_BUTTON_ID
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

        const product =
            getProductFromPage() || {};

        const whatsappUrl =
            createWhatsAppUrl(
                product
            );

        if (!whatsappUrl) {
            return;
        }

        const existing =
            document.getElementById(
                PRODUCT_BUTTON_ID
            );

        if (existing) {                    
