(function () {
    'use strict';

    const API_BASE =
        'https://salla-whatsapp-notify.onrender.com';

    const BUTTON_MARKER =
        'salla-whatsapp-notify-button';

    const OUT_OF_STOCK_STATUSES = new Set([
        'out',
        'out-and-notify',
        'out-of-stock',
        'out_of_stock',
        'sold-out',
        'sold_out'
    ]);

    const DEFAULT_MESSAGE =
        'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

    let merchantId = null;
    let settings = null;
    let settingsPromise = null;


    /* =========================================================
       SALLA CONFIG
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
                'WhatsApp Notify: Salla config error',
                key,
                error
            );
        }

        return null;
    }


    /* =========================================================
       MERCHANT
    ========================================================= */

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


    /* =========================================================
       SETTINGS
    ========================================================= */

    async function loadSettings() {
        if (settings) {
            return settings;
        }

        if (settingsPromise) {
            return settingsPromise;
        }

        const id =
            getMerchantId();

        if (!id) {
            console.warn(
                'WhatsApp Notify: merchant ID not found'
            );

            return null;
        }

        settingsPromise =
            fetch(
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
                            ).trim(),

                        customMessage:
                            String(
                                data.customMessage ||
                                DEFAULT_MESSAGE
                            ).trim()
                    };

                    return settings;
                })
                .catch((error) => {
                    console.error(
                        'WhatsApp Notify: settings error',
                        error
                    );

                    settingsPromise = null;

                    return null;
                });

        return settingsPromise;
    }


    /* =========================================================
       PRODUCT BUTTON
    ========================================================= */

    function isProductButton(element) {
        if (!element) {
            return false;
        }

        const tag =
            element.tagName
                ? element.tagName.toLowerCase()
                : '';

        if (
            tag !== 'salla-button' &&
            tag !== 'salla-add-product-button'
        ) {
            return false;
        }

        const productType =
            element.getAttribute(
                'product-type'
            );

        if (
            productType &&
            productType !== 'product'
        ) {
            return false;
        }

        return Boolean(
            getProductId(element)
        );
    }


    function getProductId(element) {
        if (!element) {
            return '';
        }

        const attributes = [
            'product-id',
            'data-product-id'
        ];

        for (const attribute of attributes) {
            const value =
                element.getAttribute(attribute);

            if (value) {
                return String(value).trim();
            }
        }

        try {
            if (
                element.productId !== undefined &&
                element.productId !== null
            ) {
                return String(
                    element.productId
                ).trim();
            }
        } catch (error) {}

        return '';
    }


    function getProductStatus(element) {
        if (!element) {
            return '';
        }

        const attributes = [
            'product-status',
            'data-product-status',
            'status'
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


    /* =========================================================
       PRODUCT URL
    ========================================================= */

    function isProductUrl(href, productId) {
        if (!href || !productId) {
            return false;
        }

        try {
            const url =
                new URL(
                    href,
                    window.location.href
                );

            return url.pathname.includes(
                `/p${productId}`
            );
        } catch (error) {
            return String(href).includes(
                `/p${productId}`
            );
        }
    }


    function normalizeUrl(href) {
        try {
            return new URL(
                href,
                window.location.href
            ).href;
        } catch (error) {
            return String(href || '');
        }
    }


    /* =========================================================
       PRODUCT CONTEXT
    ========================================================= */

    function findProductContext(
        productButton,
        productId
    ) {
        let current =
            productButton;

        for (
            let level = 0;
            current &&
            level < 14;
            level++
        ) {
            const links =
                Array.from(
                    current.querySelectorAll(
                        'a[href]'
                    )
                ).filter((link) => {
                    return isProductUrl(
                        link.getAttribute('href'),
                        productId
                    );
                });

            if (links.length) {
                const productButtons =
                    Array.from(
                        current.querySelectorAll(
                            'salla-button[product-id], salla-button[data-product-id], salla-add-product-button[product-id], salla-add-product-button[data-product-id]'
                        )
                    ).filter((button) => {
                        return (
                            getProductId(button) ===
                            productId
                        );
                    });

                if (
                    productButtons.length === 1
                ) {
                    const namedLink =
                        links.find((link) => {
                            return (
                                link.textContent &&
                                link.textContent.trim()
                            );
                        });

                    return {
                        container: current,
                        link:
                            namedLink ||
                            links[0]
                    };
                }
            }

            current =
                current.parentElement;
        }

        if (
            isProductUrl(
                window.location.href,
                productId
            )
        ) {
            return {
                container:
                    productButton.parentElement ||
                    productButton,

                link: null
            };
        }

        return {
            container:
                productButton.parentElement ||
                productButton,

            link: null
        };
    }


    /* =========================================================
       PRODUCT NAME
    ========================================================= */

    function getProductName(
        productButton,
        context,
        productId
    ) {
        if (
            context &&
            context.link
        ) {
            const linkText =
                context.link.textContent
                    .trim()
                    .replace(/\s+/g, ' ');

            if (linkText) {
                return linkText;
            }
        }

        if (
            isProductUrl(
                window.location.href,
                productId
            )
        ) {
            const pageTitle =
                getSallaConfig('page.title');

            if (pageTitle) {
                return String(pageTitle)
                    .trim();
            }

            const heading =
                document.querySelector(
                    'h1'
                );

            if (
                heading &&
                heading.textContent.trim()
            ) {
                return heading.textContent
                    .trim()
                    .replace(/\s+/g, ' ');
            }
        }

        const container =
            context?.container;

        if (container) {
            const selectors = [
                '[data-product-title]',
                '.product-title',
                '.product-name'
            ];

            for (const selector of selectors) {
                const element =
                    container.querySelector(
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
        }

        return 'هذا المنتج';
    }


    /* =========================================================
       PRODUCT PRICE
    ========================================================= */

    function getProductPrice(
        productButton,
        context
    ) {
        const amount =
            productButton.getAttribute(
                'amount'
            );

        if (
            amount !== null &&
            amount.trim() !== ''
        ) {
            return amount.trim();
        }

        const container =
            context?.container;

        if (!container) {
            return '';
        }

        const selectors = [
            '[data-product-price]',
            'salla-price',
            '.sale-price',
            '.current-price',
            '.product-price',
            '[class*="sale-price"]',
            '[class*="current-price"]',
            '[class*="product-price"]'
        ];

        for (const selector of selectors) {
            const elements =
                Array.from(
                    container.querySelectorAll(
                        selector
                    )
                );

            for (const element of elements) {
                const hasNestedPrice =
                    element.querySelector(
                        '[data-product-price], salla-price, .sale-price, .current-price, .product-price'
                    );

                if (hasNestedPrice) {
                    continue;
                }

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
        /* =========================================================
       PRODUCT URL
    ========================================================= */

    function getProductUrl(
        context,
        productId
    ) {
        if (
            context &&
            context.link
        ) {
            return normalizeUrl(
                context.link.getAttribute(
                    'href'
                )
            );
        }

        if (
            isProductUrl(
                window.location.href,
                productId
            )
        ) {
            return window.location.href;
        }

        return '';
    }


    /* =========================================================
       STOCK
    ========================================================= */

    function isOutOfStock(
        productButton
    ) {
        const status =
            getProductStatus(
                productButton
            );

        if (
            OUT_OF_STOCK_STATUSES.has(
                status
            )
        ) {
            return true;
        }

        if (status) {
            return false;
        }

        const disabled =
            productButton.hasAttribute(
                'disabled'
            ) ||
            productButton.getAttribute(
                'aria-disabled'
            ) === 'true';

        if (!disabled) {
            return false;
        }

        const text =
            (
                productButton.textContent ||
                ''
            )
                .trim()
                .toLowerCase();

        return (
            text.includes('نفد') ||
            text.includes('نفذت') ||
            text.includes('غير متوفر') ||
            text.includes('sold out') ||
            text.includes('out of stock') ||
            text.includes('unavailable')
        );
    }


    /* =========================================================
       WHATSAPP URL
    ========================================================= */

    function buildWhatsAppUrl(
        productName,
        productPrice,
        productUrl
    ) {
        if (
            !settings ||
            !settings.whatsappNumber
        ) {
            return '';
        }

        const number =
            settings.whatsappNumber
                .replace(/\D/g, '');

        if (!number) {
            return '';
        }

        let message =
            settings.customMessage ||
            DEFAULT_MESSAGE;

        message +=
            `\n\nالمنتج: ${productName}`;

        if (productPrice) {
            message +=
                `\nالسعر: ${productPrice}`;
        }

        if (productUrl) {
            message +=
                `\nالرابط: ${productUrl}`;
        }

        return (
            `https://wa.me/${number}?text=` +
            encodeURIComponent(message)
        );
    }


    /* =========================================================
       WHATSAPP BUTTON
    ========================================================= */

    function createWhatsAppButton(
        productButton,
        productId,
        whatsappUrl
    ) {
        if (!whatsappUrl) {
            return null;
        }

        const next =
            productButton.nextElementSibling;

        if (
            next &&
            next.getAttribute(
                'data-salla-whatsapp-product'
            ) === productId
        ) {
            next.href =
                whatsappUrl;

            return next;
        }

        const button =
            document.createElement('a');

        button.setAttribute(
            'data-salla-whatsapp-product',
            productId
        );

        button.className =
            BUTTON_MARKER;

        button.href =
            whatsappUrl;

        button.target =
            '_blank';

        button.rel =
            'noopener noreferrer';

        button.textContent =
            '🔔 أبلغني عبر واتساب عند توفر المنتج';

        button.style.cssText = `
            display: block;
            width: 100%;
            margin-top: 10px;
            padding: 13px 16px;
            box-sizing: border-box;
            border: 0;
            border-radius: 10px;
            background: #25D366;
            color: #ffffff;
            text-align: center;
            text-decoration: none;
            font-family: inherit;
            font-size: 14px;
            font-weight: 700;
            line-height: 1.5;
            cursor: pointer;
            transition: opacity .18s ease, transform .18s ease;
        `;

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

        productButton.insertAdjacentElement(
            'afterend',
            button
        );

        return button;
    }


    function removeWhatsAppButton(
        productButton,
        productId
    ) {
        const next =
            productButton.nextElementSibling;

        if (
            next &&
            next.getAttribute(
                'data-salla-whatsapp-product'
            ) === productId
        ) {
            next.remove();
        }
    }


    /* =========================================================
       PROCESS ONE PRODUCT
    ========================================================= */

    async function processProduct(
        productButton
    ) {
        if (
            !isProductButton(
                productButton
            )
        ) {
            return;
        }

        const productId =
            getProductId(
                productButton
            );

        if (!productId) {
            return;
        }

        if (
            !isOutOfStock(
                productButton
            )
        ) {
            removeWhatsAppButton(
                productButton,
                productId
            );

            return;
        }

        const loadedSettings =
            await loadSettings();

        if (
            !loadedSettings ||
            !loadedSettings.whatsappNumber
        ) {
            return;
        }

        const context =
            findProductContext(
                productButton,
                productId
            );

        const productName =
            getProductName(
                productButton,
                context,
                productId
            );

        const productPrice =
            getProductPrice(
                productButton,
                context
            );

        const productUrl =
            getProductUrl(
                context,
                productId
            );

        const whatsappUrl =
            buildWhatsAppUrl(
                productName,
                productPrice,
                productUrl
            );

        if (!whatsappUrl) {
            return;
        }

        createWhatsAppButton(
            productButton,
            productId,
            whatsappUrl
        );
    }


    /* =========================================================
       FIND PRODUCT BUTTONS
    ========================================================= */

    function findProductButtons(root) {
        if (!root) {
            return [];
        }

        const selector = `
            salla-button[product-id],
            salla-button[data-product-id],
            salla-add-product-button[product-id],
            salla-add-product-button[data-product-id]
        `;

        const result = [];

        if (
            root.nodeType === 1 &&
            isProductButton(root)
        ) {
            result.push(root);
        }

        if (
            root.querySelectorAll
        ) {
            result.push(
                ...root.querySelectorAll(
                    selector
                )
            );
        }

        return result;
    }


    /* =========================================================
       INITIAL SCAN
    ========================================================= */

    function scanProducts() {
        const buttons =
            findProductButtons(
                document
            );

        for (const button of buttons) {
            processProduct(button);
        }
    }


    /* =========================================================
       MUTATION OBSERVER
    ========================================================= */

    const observer =
        new MutationObserver(
            function (mutations) {
                for (const mutation of mutations) {

                    if (
                        mutation.type ===
                        'childList'
                    ) {
                        for (
                            const node
                            of mutation.addedNodes
                        ) {
                            if (
                                node.nodeType !== 1
                            ) {
                                continue;
                            }

                            const buttons =
                                findProductButtons(
                                    node
                                );

                            for (
                                const button
                                of buttons
                            ) {
                                processProduct(
                                    button
                                );
                            }
                        }
                    }

                    if (
                        mutation.type ===
                        'attributes'
                    ) {
                        const target =
                            mutation.target;

                        if (
                            isProductButton(
                                target
                            )
                        ) {
                            processProduct(
                                target
                            );
                        }
                    }
                }
            }
        );


    /* =========================================================
       START
    ========================================================= */

    function start() {
        if (!document.body) {
            return;
        }

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    'product-id',
                    'data-product-id',
                    'product-status',
                    'data-product-status',
                    'status',
                    'amount',
                    'disabled',
                    'aria-disabled'
                ]
            }
        );

        scanProducts();
    }


    /* =========================================================
       BOOT
    ========================================================= */

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
