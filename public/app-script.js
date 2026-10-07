(function () {
    'use strict';

    const API_BASE =
        'https://salla-whatsapp-notify.onrender.com';

    const BUTTON_PREFIX =
        'salla-whatsapp-notify-button';

    let merchantId = null;
    let settings = null;
    let settingsPromise = null;

    /* =========================
       Salla Helpers
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
                error
            );
        }

        return null;
    }

    function getMerchantId() {
        if (merchantId) {
            return merchantId;
        }

        const ids = [
            getSallaConfig('store.id'),
            getSallaConfig('store_id'),
            getSallaConfig('merchant_id'),
            getSallaConfig('merchant.id')
        ];

        for (const id of ids) {
            if (id !== null && id !== undefined && id !== '') {
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
       Settings
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
                    Accept: 'application/json'
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
                            data.whatsappNumber || ''
                        ).replace(/\D/g, ''),

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
       Number Helpers
    ========================= */

    function toNumber(value) {
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
            return toNumber(value.amount);
        }

        const number =
            Number(
                String(value)
                    .replace(/,/g, '')
                    .trim()
            );

        if (
            Number.isFinite(number) &&
            number > 0
        ) {
            return number;
        }

        return null;
    }

    function formatNumber(value) {
        const number =
            toNumber(value);

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

    /* =========================
       Product Data
    ========================= */

    function parseProductData(value) {
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
            if (card.product) {
                const product =
                    parseProductData(
                        card.product
                    );

                if (product) {
                    return product;
                }
            }
        } catch (error) {}

        try {
            const attribute =
                card.getAttribute(
                    'product'
                );

            if (attribute) {
                const product =
                    parseProductData(
                        attribute
                    );

                if (product) {
                    return product;
                }
            }
        } catch (error) {}

        return null;
    }

    function getProductFromPage() {
        /*
         * Product page:
         * Try the official Salla add-product component.
         */
        const button =
            document.querySelector(
                'salla-add-product-button'
            );

        if (button) {
            const possibleValues = [
                button.product,
                button.productData
            ];

            for (
                const value
                of possibleValues
            ) {
                const product =
                    parseProductData(value);

                if (product) {
                    return product;
                }
            }

            try {
                const productId =
                    button.getAttribute(
                        'product-id'
                    );

                if (productId) {
                    const pageProduct =
                        getSallaConfig(
                            'page.product'
                        );

                    const product =
                        parseProductData(
                            pageProduct
                        );

                    if (product) {
                        return product;
                    }
                }
            } catch (error) {}
        }

        /*
         * Other possible Salla config locations
         */
        const possibleProducts = [
            getSallaConfig('page.product'),
            getSallaConfig('product'),
            getSallaConfig('page.data.product')
        ];

        for (
            const value
            of possibleProducts
        ) {
            const product =
                parseProductData(value);

            if (product) {
                return product;
            }
        }

        return null;
    }

    /* =========================
       Price
    ========================= */

    function getPriceInfo(product) {
        if (!product) {
            return {
                current: '',
                original: '',
                currency: ''
            };
        }

        const price =
            toNumber(product.price);

        const salePrice =
            toNumber(product.sale_price);

        const regularPrice =
            toNumber(
                product.regular_price
            );

        const currency =
            product.price?.currency ||
            product.sale_price?.currency ||
            product.regular_price?.currency ||
            'SAR';

        /*
         * Salla can return:
         *
         * price
         * regular_price
         * sale_price
         *
         * We only use real positive values.
         */

        let current = null;
        let original = null;

        /*
         * If sale_price exists and is lower
         * than the regular/original price,
         * use it as the current price.
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
         * Some Salla responses put the current
         * selling price in "price" and the old
         * price in "regular_price".
         */
        else if (
            price !== null &&
            regularPrice !== null &&
            regularPrice > price
        ) {
            current = price;
            original = regularPrice;
        }

        /*
         * If sale_price is valid and lower than price.
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
         * Normal product with one price.
         */
        else if (price !== null) {
            current = price;
        }

        /*
         * Fallback if only sale_price exists.
         */
        else if (salePrice !== null) {
            current = salePrice;
        }

        /*
         * Fallback if only regular_price exists.
         */
        else if (regularPrice !== null) {
            current = regularPrice;
        }

        return {
            current:
                current !== null
                    ? formatNumber(current)
                    : '',

            original:
                original !== null
                    ? formatNumber(original)
                    : '',

            currency:
                currency || 'SAR'
        };
    }

    function buildPriceText(product) {
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
                `السعر: ${price.current} ${price.currency} ` +
                `بدل ${price.original} ${price.currency}`
            );
        }

        return (
            `السعر: ${price.current} ${price.currency}`
        );
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

        const selectors = [
            'h1',
            '[class*="product-title"]',
            '[class*="product-name"]',
            '[data-product-title]'
        ];

        for (
            const selector
            of selectors
        ) {
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
       Out Of Stock
    ========================= */

    function isProductOutOfStock(product) {
        if (product) {

            if (
                product.is_available === false ||
                product.is_out_of_stock === true
            ) {
                return true;
            }

            if (
                product.status === 'out' ||
                product.status === 'out-of-stock' ||
                product.status === 'sold_out' ||
                product.status === 'sold-out'
            ) {
                return true;
            }
        }

        return false;
    }

    function getComponentStatus(element) {
        if (!element) {
            return '';
        }

        const attributes = [
            'product-status',
            'status',
            'data-product-status'
        ];

        for (
            const attribute
            of attributes
        ) {
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

        try {
            if (
                typeof element.productStatus ===
                'string'
            ) {
                return element.productStatus
                    .trim()
                    .toLowerCase();
            }
        } catch (error) {}

        return '';
    }

    function pageIsOutOfStock() {
        const buttons =
            document.querySelectorAll(
                'salla-add-product-button'
            );

        for (
            const button
            of buttons
        ) {
            const status =
                getComponentStatus(
                    button
                );

            if (
                status === 'out' ||
                status === 'out-and-notify' ||
                status === 'out-of-stock'
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
       WhatsApp URL
    ========================= */

    function createWhatsAppUrl(
        product,
        productName,
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

        const priceText =
            buildPriceText(product);

        if (priceText) {
            message +=
                `\n${priceText}`;
        }

        message +=
            `\nالرابط: ${productUrl}`;

        return (
            `https://wa.me/${number}` +
            `?text=${encodeURIComponent(message)}`
        );
    }

    /* =========================
       Button Styling
    ========================= */

    function styleButton(button) {
        button.style.cssText = `
            display:block;
            width:100%;
            margin-top:10px;
            padding:12px 14px;
            background:#25D366;
            color:#ffffff;
            border-radius:10px;
            text-align:center;
            text-decoration:none;
            font-size:14px;
            font-weight:700;
            line-height:1.4;
            box-sizing:border-box;
            cursor:pointer;
            transition:opacity .2s ease;
        `;

        button.addEventListener(
            'mouseenter',
            () => {
                button.style.opacity = '0.88';
            }
        );

        button.addEventListener(
            'mouseleave',
            () => {
                button.style.opacity = '1';
            }
        );
    }

    /* =========================
       Product Page Button
    ========================= */

    async function handleProductPage() {
        const productButton =
            document.querySelector(
                'salla-add-product-button'
            );

        if (!productButton) {
            return;
        }

        let product =
            getProductFromPage();

        const outOfStock =
            pageIsOutOfStock() ||
            isProductOutOfStock(product);

        if (!outOfStock) {
            const oldButton =
                document.getElementById(
                    `${BUTTON_PREFIX}-product`
                );

            if (oldButton) {
                oldButton.remove();
            }

            return;
        }

        const loaded =
            await loadSettings();

        if (!loaded) {
            return;
        }

        if (
            !product ||
            typeof product !== 'object'
        ) {
            product = {};
        }

        const productName =
            getProductName(product);

        const productUrl =
            getProductUrl(product);

        const whatsappUrl =
            createWhatsAppUrl(
                product,
                productName,
                productUrl
            );

        if (!whatsappUrl) {
            return;
        }

        if (
            document.getElementById(
                `${BUTTON_PREFIX}-product`
            )
        ) {
            return;
        }

        const button =
            document.createElement('a');

        button.id =
            `${BUTTON_PREFIX}-product`;

        button.href =
            whatsappUrl;

        button.target =
            '_blank';

        button.rel =
            'noopener noreferrer';

        button.textContent =
            '🔔 أبلغني عبر واتساب عند توفر المنتج';

        styleButton(button);

        productButton.insertAdjacentElement(
            'afterend',
            button
        );
    }

    /* =========================
       Homepage Product Cards
    ========================= */

    async function handleProductCards() {
        const cards =
            document.querySelectorAll(
                'salla-product-card'
            );

        if (!cards.length) {
            return;
        }

        const loaded =
            await loadSettings();

        if (!loaded) {
            return;
        }

        cards.forEach((card, index) => {

            const product =
                getProductFromCard(card);

            if (!product) {
                return;
            }

            const cardOutOfStock =
                isProductOutOfStock(
                    product
                );

            const buttonId =
                `${BUTTON_PREFIX}-card-${index}`;

            const existing =
                document.getElementById(
                    buttonId
                );

            if (!cardOutOfStock) {
                if (existing) {
                    
