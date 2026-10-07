(function () {
    'use strict';

    const API_BASE =
        'https://salla-whatsapp-notify.onrender.com';

    const BUTTON_PREFIX =
        'salla-whatsapp-notify-button';

    const DEFAULT_MESSAGE =
        'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

    let merchantId = null;
    let settings = null;
    let settingsPromise = null;

    let checkTimer = null;
    let observerStarted = false;

    /* =========================================================
       BASIC HELPERS
    ========================================================= */

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
                'WhatsApp Notify - Salla config error:',
                key,
                error
            );
        }

        return null;
    }

    function cleanText(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch (error) {
            return false;
        }
    }

    /* =========================================================
       MERCHANT ID
    ========================================================= */

    function getMerchantId() {
        if (merchantId) {
            return merchantId;
        }

        const possibleIds = [
            getSallaConfig('store.id'),
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

    /* =========================================================
       LOAD SETTINGS
    ========================================================= */

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
                },
                cache: 'no-store'
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
                        cleanText(
                            data.whatsappNumber
                        ),

                    customMessage:
                        cleanText(
                            data.customMessage
                        ) ||
                        DEFAULT_MESSAGE
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
    /* =========================================================
       PRODUCT CARD DETECTION
    ========================================================= */

    function getProductContainers() {
        const selectors = [
            'salla-product-card',
            'salla-product-list',
            '[data-product-id]',
            'article',
            '.product-card',
            '.product-item',
            '.product',
            '[class*="product-card"]',
            '[class*="product-item"]'
        ];

        const found = new Set();

        selectors.forEach((selector) => {
            try {
                document
                    .querySelectorAll(selector)
                    .forEach((element) => {
                        found.add(element);
                    });
            } catch (error) {}
        });

        const elements =
            Array.from(found);

        return elements.filter((element) => {
            const parentProduct =
                elements.find(
                    (other) =>
                        other !== element &&
                        other.contains(element) &&
                        (
                            other.matches(
                                'salla-product-card, [data-product-id], .product-card, .product-item'
                            )
                        )
                );

            return !parentProduct;
        });
    }

    /* =========================================================
       PRODUCT ID
    ========================================================= */

    function getProductId(container) {
        if (!container) {
            return null;
        }

        const attributes = [
            'data-product-id',
            'data-id',
            'product-id'
        ];

        for (const attribute of attributes) {
            const value =
                container.getAttribute(attribute);

            if (value) {
                return String(value);
            }
        }

        const innerProduct =
            container.querySelector(
                '[data-product-id]'
            );

        if (innerProduct) {
            const value =
                innerProduct.getAttribute(
                    'data-product-id'
                );

            if (value) {
                return String(value);
            }
        }

        return null;
    }

    /* =========================================================
       PRODUCT NAME
    ========================================================= */

    function getProductName(container) {
        if (!container) {
            return cleanText(
                getSallaConfig('page.title')
            ) || 'هذا المنتج';
        }

        const selectors = [
            '[data-product-title]',
            '.product-title',
            '.product-name',
            '[class*="product-title"]',
            '[class*="product-name"]',
            'h1',
            'h2',
            'h3',
            'h4'
        ];

        for (const selector of selectors) {
            try {
                const element =
                    container.querySelector(
                        selector
                    );

                if (element) {
                    const text =
                        cleanText(
                            element.textContent
                        );

                    if (text) {
                        return text;
                    }
                }
            } catch (error) {}
        }

        try {
            const title =
                container.getAttribute(
                    'product-title'
                );

            if (title) {
                return cleanText(title);
            }
        } catch (error) {}

        const pageTitle =
            cleanText(
                getSallaConfig('page.title')
            );

        if (pageTitle) {
            return pageTitle;
        }

        return 'هذا المنتج';
    }

    /* =========================================================
       PRODUCT PRICE
    ========================================================= */

    function getProductPrice(container) {
        if (!container) {
            const pagePrice =
                getSallaConfig('page.price');

            return pagePrice
                ? cleanText(pagePrice)
                : '';
        }

        const selectors = [
            '[data-product-price]',
            '.price',
            '.product-price',
            '[class*="product-price"]',
            '[class*="price"]'
        ];

        for (const selector of selectors) {
            try {
                const elements =
                    container.querySelectorAll(
                        selector
                    );

                for (const element of elements) {
                    const text =
                        cleanText(
                            element.textContent
                        );

                    if (
                        text &&
                        /\d/.test(text)
                    ) {
                        return text;
                    }
                }
            } catch (error) {}
        }

        return '';
    }

    /* =========================================================
       PRODUCT URL
    ========================================================= */

    function getProductUrl(container) {
        if (container) {
            const links =
                container.querySelectorAll(
                    'a[href]'
                );

            for (const link of links) {
                const href =
                    link.href;

                if (!isValidUrl(href)) {
                    continue;
                }

                const text =
                    cleanText(
                        link.textContent
                    );

                const looksLikeProductLink =
                    link.matches(
                        '[data-product-url]'
                    ) ||
                    link.closest(
                        '[data-product-id]'
                    ) ||
                    link.querySelector(
                        'img'
                    ) ||
                    text;

                if (
                    looksLikeProductLink &&
                    href !== window.location.href
                ) {
                    return href;
                }
            }
        }

        return window.location.href;
    }
    /* =========================================================
       OUT OF STOCK DETECTION
    ========================================================= */

    function containsOutOfStockText(text) {
        const value =
            cleanText(text).toLowerCase();

        if (!value) {
            return false;
        }

        const keywords = [
            'نفد المخزون',
            'نفذ المخزون',
            'نفد',
            'نفذت الكمية',
            'غير متوفر',
            'غير متاح',
            'غير متاحة',
            'sold out',
            'out of stock',
            'unavailable',
            'not available'
        ];

        return keywords.some(
            (keyword) =>
                value.includes(keyword)
        );
    }

    function getComponentStatus(element) {
        if (!element) {
            return '';
        }

        const attributes = [
            'product-status',
            'status',
            'data-product-status',
            'data-status'
        ];

        for (const attribute of attributes) {
            const value =
                element.getAttribute(
                    attribute
                );

            if (value) {
                return cleanText(value)
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

    function isProductOutOfStock(container) {
        if (!container) {
            return false;
        }

        const productButtons =
            container.querySelectorAll(
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
                status === 'sold_out' ||
                status === 'unavailable'
            ) {
                return true;
            }

            if (
                component.hasAttribute(
                    'disabled'
                ) ||
                component.getAttribute(
                    'aria-disabled'
                ) === 'true'
            ) {
                if (
                    containsOutOfStockText(
                        component.textContent
                    )
                ) {
                    return true;
                }
            }
        }

        const availability =
            container.querySelector(
                'salla-product-availability'
            );

        if (availability) {
            return true;
        }

        const stockElements =
            container.querySelectorAll(
                '[data-stock], [data-available], [data-product-status], [data-status]'
            );

        for (const element of stockElements) {
            const stock =
                (
                    element.getAttribute(
                        'data-stock'
                    ) ||
                    element.getAttribute(
                        'data-available'
                    ) ||
                    element.getAttribute(
                        'data-product-status'
                    ) ||
                    element.getAttribute(
                        'data-status'
                    ) ||
                    ''
                )
                    .toString()
                    .toLowerCase()
                    .trim();

            if (
                stock === '0' ||
                stock === 'false' ||
                stock === 'out' ||
                stock === 'out-of-stock' ||
                stock === 'out_of_stock' ||
                stock === 'sold-out' ||
                stock === 'sold_out' ||
                stock === 'unavailable'
            ) {
                return true;
            }
        }

        const buttons =
            container.querySelectorAll(
                'button, a, [role="button"]'
            );

        for (const element of buttons) {
            const text =
                cleanText(
                    element.textContent
                );

            if (!containsOutOfStockText(text)) {
                continue;
            }

            const disabled =
                element.disabled === true ||
                element.hasAttribute(
                    'disabled'
                ) ||
                element.getAttribute(
                    'aria-disabled'
                ) === 'true';

            if (disabled) {
                return true;
            }
        }

        const statusSelectors = [
            '[class*="availability"]',
            '[class*="stock"]',
            '[class*="sold"]',
            '[class*="out-of-stock"]',
            '[class*="unavailable"]'
        ];

        for (
            const selector
            of statusSelectors
        ) {
            try {
                const elements =
                    container.querySelectorAll(
                        selector
                    );

                for (const element of elements) {
                    if (
                        containsOutOfStockText(
                            element.textContent
                        )
                    ) {
                        return true;
                    }
                }
            } catch (error) {}
        }

        return false;
    }
    /* =========================================================
       PRODUCT PAGE
    ========================================================= */

    function isCurrentProductPage() {
        const pageId =
            getSallaConfig('page.id');

        if (pageId) {
            return true;
        }

        return Boolean(
            document.querySelector(
                'salla-add-product-button'
            )
        );
    }

    function getCurrentProductContainer() {
        const officialButton =
            document.querySelector(
                'salla-add-product-button'
            );

        if (!officialButton) {
            return document.body;
        }

        let parent =
            officialButton.parentElement;

        for (let i = 0; i < 6 && parent; i++) {
            if (
                parent.querySelector(
                    'h1, [class*="product-title"], [data-product-title]'
                )
            ) {
                return parent;
            }

            parent =
                parent.parentElement;
        }

        return document.body;
    }

    function findProductButton(container) {
        if (!container) {
            return null;
        }

        const official =
            container.querySelector(
                'salla-add-product-button'
            );

        if (official) {
            return official;
        }

        const selectors = [
            '[data-product-id] button',
            '.product-form button',
            '.product-details button',
            'button[type="submit"]',
            'button'
        ];

        for (const selector of selectors) {
            try {
                const element =
                    container.querySelector(
                        selector
                    );

                if (element) {
                    return element;
                }
            } catch (error) {}
        }

        return null;
    }

    /* =========================================================
       WHATSAPP URL
    ========================================================= */

    function createWhatsAppUrl(
        container
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

        const productName =
            getProductName(container);

        const productPrice =
            getProductPrice(container);

        const productUrl =
            getProductUrl(container);

        let message =
            settings.customMessage ||
            DEFAULT_MESSAGE;

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

    /* =========================================================
       BUTTON STYLE
    ========================================================= */

    function applyButtonStyle(
        button,
        isCard
    ) {
        button.style.cssText = `
            display:block;
            width:100%;
            margin-top:${isCard ? '8px' : '12px'};
            padding:${isCard ? '11px 12px' : '14px 18px'};
            background:#25D366;
            color:#ffffff;
            border:0;
            border-radius:${isCard ? '10px' : '12px'};
            text-align:center;
            text-decoration:none;
            font-size:${isCard ? '13px' : '15px'};
            font-weight:700;
            line-height:1.4;
            box-sizing:border-box;
            cursor:pointer;
            transition:
                opacity .2s ease,
                transform .2s ease;
            font-family:inherit;
            position:relative;
            z-index:5;
        `;
    }

    /* =========================================================
       CREATE BUTTON
    ========================================================= */

    function createButton(
        container,
        isCard
    ) {
        if (!container) {
            return;
        }

        const productId =
            getProductId(container);

        const existingButtons =
            container.querySelectorAll(
                `[id^="salla-whatsapp-notify-button"]`
            );

        if (existingButtons.length) {
            return;
        }

        const whatsappUrl =
            createWhatsAppUrl(
                container
            );

        if (!whatsappUrl) {
            return;
        }

        const button =
            document.createElement('a');

        button.id =
            productId
                ? `salla-whatsapp-notify-button-${productId}`
                : `salla-whatsapp-notify-button-${Date.now()}`;

        button.className =
            'salla-whatsapp-notify-button';

        button.href =
            whatsappUrl;

        button.target =
            '_blank';

        button.rel =
            'noopener noreferrer';

        button.setAttribute(
            'data-whatsapp-notify',
            'true'
        );

        button.textContent =
            '🔔 أبلغني عند توفر المنتج';

        applyButtonStyle(
            button,
            isCard
        );

        button.addEventListener(
            'mouseenter',
            function () {
                button.style.opacity =
                    '0.88';

                button.style.transform =
                    'translateY(-1px)';
            }
        );

        button.addEventListener(
            'mouseleave',
            function () {
                button.style.opacity =
                    '1';

                button.style.transform =
                    'translateY(0)';
            }
        );

        if (!isCard) {
            const productButton =
                findProductButton(
                    container
                );

            if (productButton) {
                productButton.insertAdjacentElement(
                    'afterend',
                    button
                );

                return;
            }

            const parent =
                container.querySelector(
                    '.product-form'
                ) ||
                container;

            parent.appendChild(button);

            return;
        }

        const productButton =
            findProductButton(
                container
            );

        if (productButton) {
            productButton.insertAdjacentElement(
                'afterend',
                button
            );

            return;
        }

        container.appendChild(button);
    }

    /* =========================================================
       REMOVE BUTTONS
    ========================================================= */

    function removeButtons(container) {
        if (!container) {
            return;
        }

        container
            .querySelectorAll(
                '[id^="salla-whatsapp-notify-button"]'
            )
            .forEach((button) => {
                button.remove();
            });
    }
    /* =========================================================
       CHECK PRODUCT PAGE
    ========================================================= */

    async function checkProductPage() {
        if (!isCurrentProductPage()) {
            return;
        }

        const container =
            getCurrentProductContainer();

        if (!container) {
            return;
        }

        const outOfStock =
            isProductOutOfStock(
                container
            );

        if (!outOfStock) {
            removeButtons(container);
            return;
        }

        const loadedSettings =
            await loadSettings();

        if (!loadedSettings) {
            return;
        }

        createButton(
            container,
            false
        );
    }

    /* =========================================================
       CHECK PRODUCT CARDS
    ========================================================= */

    async function checkProductCards() {
        const containers =
            getProductContainers();

        if (!containers.length) {
            return;
        }

        const loadedSettings =
            await loadSettings();

        if (!loadedSettings) {
            return;
        }

        for (
            const container
            of containers
        ) {
            if (
                container.matches(
                    'body, html'
                )
            ) {
                continue;
            }

            const productId =
                getProductId(container);

            const productLink =
                container.querySelector(
                    'a[href]'
                );

            const isLikelyProduct =
                Boolean(productId) ||
                Boolean(productLink) ||
                container.matches(
                    'salla-product-card, .product-card, .product-item, [class*="product-card"]'
                );

            if (!isLikelyProduct) {
                continue;
            }

            const outOfStock =
                isProductOutOfStock(
                    container
                );

            if (!outOfStock) {
                removeButtons(container);
                continue;
            }

            createButton(
                container,
                true
            );
        }
    }

    /* =========================================================
       MAIN CHECK
    ========================================================= */

    async function checkEverything() {
        try {
            await checkProductPage();

            await checkProductCards();
        } catch (error) {
            console.error(
                'WhatsApp Notify check error:',
                error
            );
        }
    }

    /* =========================================================
       SCHEDULE CHECK
    ========================================================= */

    function scheduleCheck() {
        clearTimeout(checkTimer);

        checkTimer =
            setTimeout(
                function () {
                    checkEverything();
                },
                350
            );
    }

    /* =========================================================
       MUTATION OBSERVER
    ========================================================= */

    function startObserver() {
        if (
            observerStarted ||
            !document.body
        ) {
            return;
        }

        observerStarted = true;

        const observer =
            new MutationObserver(
                function (mutations) {
                    let relevantChange =
                        false;

                    for (
                        const mutation
                        of mutations
                    ) {
                        if (
                            mutation.type ===
                            'attributes'
                        ) {
                            const target =
                                mutation.target;

                            if (
                                target &&
                                target.closest &&
                                target.closest(
                                    '#salla-whatsapp-notify-button'
                                )
                            ) {
                                continue;
                            }
                        }

                        if (
                            mutation.addedNodes &&
                            mutation.addedNodes.length
                        ) {
                            relevantChange =
                                true;
                            break;
                        }

                        if (
                            mutation.type ===
                            'attributes'
                        ) {
                            relevantChange =
                                true;
                            break;
                        }
                    }

                    if (relevantChange) {
                        scheduleCheck();
                    }
                }
            );

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    'product-status',
                    'status',
                    'data-product-status',
                    'data-status',
                    'data-stock',
                    'data-available',
                    'disabled',
                    'aria-disabled'
                ]
            }
        );
    }

    /* =========================================================
       START
    ========================================================= */

    function start() {
        startObserver();

        checkEverything();

        setTimeout(
            checkEverything,
            800
        );

        setTimeout(
            checkEverything,
            1800
        );

        setTimeout(
            checkEverything,
            3500
        );

        setTimeout(
            checkEverything,
            6000
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
