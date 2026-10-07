(function () {
    'use strict';

    /* =========================
       Salla WhatsApp Notify
       Product Page + Homepage
    ========================= */

    const API_BASE =
        'https://salla-whatsapp-notify.onrender.com';

    const PRODUCT_BUTTON_ID =
        'salla-whatsapp-notify-button';

    const CARD_BUTTON_PREFIX =
        'salla-whatsapp-card-btn';

    const DEFAULT_MESSAGE =
        'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

    let settingsCache = null;
    let settingsMerchantId = null;
    let settingsPromise = null;

    /* =========================
       Helpers
    ========================= */

    function getMerchantId() {
        try {
            const urlParams =
                new URLSearchParams(
                    window.location.search
                );

            const urlMerchantId =
                urlParams.get('merchant_id');

            if (urlMerchantId) {
                return String(urlMerchantId);
            }
        } catch (error) {}

        try {
            if (
                typeof salla !== 'undefined' &&
                salla.config &&
                typeof salla.config.get === 'function'
            ) {
                const merchantId =
                    salla.config.get('store.id');

                if (merchantId) {
                    return String(merchantId);
                }
            }
        } catch (error) {}

        return '';
    }

    async function getSettings() {
        const merchantId = getMerchantId();

        if (
            settingsCache &&
            settingsMerchantId === merchantId
        ) {
            return settingsCache;
        }

        if (settingsPromise) {
            return settingsPromise;
        }

        const url =
            merchantId
                ? `${API_BASE}/api/settings?merchant_id=${encodeURIComponent(merchantId)}`
                : `${API_BASE}/api/settings`;

        settingsPromise = fetch(url)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error(
                        'Settings request failed'
                    );
                }

                return response.json();
            })
            .then(function (data) {
                settingsCache = data || {};
                settingsMerchantId = merchantId;

                return settingsCache;
            })
            .catch(function (error) {
                console.error(
                    '[Salla WhatsApp Notify]',
                    error
                );

                return null;
            })
            .finally(function () {
                settingsPromise = null;
            });

        return settingsPromise;
    }

    function cleanText(value) {
        if (
            value === null ||
            value === undefined
        ) {
            return '';
        }

        return String(value)
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeNumber(value) {
        if (
            value === null ||
            value === undefined
        ) {
            return null;
        }

        if (
            typeof value === 'number' &&
            Number.isFinite(value)
        ) {
            return value;
        }

        if (
            typeof value === 'object'
        ) {
            if (
                value.amount !== undefined
            ) {
                return normalizeNumber(
                    value.amount
                );
            }

            if (
                value.value !== undefined
            ) {
                return normalizeNumber(
                    value.value
                );
            }
        }

        let text = String(value)
            .trim();

        if (!text) {
            return null;
        }

        /*
         * Arabic / Persian digits -> English
         */
        text = text
            .replace(/[٠-٩]/g, function (d) {
                return String(
                    '٠١٢٣٤٥٦٧٨٩'
                        .indexOf(d)
                );
            })
            .replace(/[۰-۹]/g, function (d) {
                return String(
                    '۰۱۲۳۴۵۶۷۸۹'
                        .indexOf(d)
                );
            });

        /*
         * Remove currency / text.
         * Keep decimal separators.
         */
        text = text
            .replace(/,/g, '')
            .replace(/٬/g, '')
            .replace(/[^\d.-]/g, '');

        if (!text) {
            return null;
        }

        const number = Number(text);

        return Number.isFinite(number)
            ? number
            : null;
    }

    function formatPrice(value) {
        const number =
            normalizeNumber(value);

        if (
            number === null ||
            !Number.isFinite(number)
        ) {
            return '';
        }

        return String(number);
    }

    function getNumericValuesFromText(text) {
        const result = [];

        if (!text) {
            return result;
        }

        let normalized =
            String(text)
                .replace(/[٠-٩]/g, function (d) {
                    return String(
                        '٠١٢٣٤٥٦٧٨٩'
                            .indexOf(d)
                    );
                })
                .replace(/[۰-۹]/g, function (d) {
                    return String(
                        '۰۱۲۳۴۵۶۷۸۹'
                            .indexOf(d)
                    );
                });

        const matches =
            normalized.match(
                /(?:\d+(?:[.,]\d+)?)/g
            ) || [];

        matches.forEach(function (item) {
            const value =
                Number(
                    item.replace(/,/g, '')
                );

            if (
                Number.isFinite(value) &&
                !result.includes(value)
            ) {
                result.push(value);
            }
        });

        return result;
    }

    /* =========================
       Product Price Extraction
    ========================= */

    function priceObjectValue(value) {
        if (
            value === null ||
            value === undefined
        ) {
            return null;
        }

        if (
            typeof value === 'object'
        ) {
            if (
                value.amount !== undefined
            ) {
                return normalizeNumber(
                    value.amount
                );
            }

            if (
                value.value !== undefined
            ) {
                return normalizeNumber(
                    value.value
                );
            }
        }

        return normalizeNumber(value);
    }

    function getPriceFromProductObject(product) {
        if (
            !product ||
            typeof product !== 'object'
        ) {
            return {
                current: null,
                original: null
            };
        }

        let current =
            priceObjectValue(
                product.price
            );

        let original =
            priceObjectValue(
                product.regular_price
            );

        if (
            original === null
        ) {
            original =
                priceObjectValue(
                    product.compare_price
                );
        }

        const sale =
            priceObjectValue(
                product.sale_price
            );

        /*
         * Salla may expose sale_price as 0
         * when there is no sale.
         * Therefore 0 is NOT automatically
         * considered a sale.
         */
        if (
            sale !== null &&
            sale > 0 &&
            original !== null &&
            sale < original
        ) {
            current = sale;
        }

        /*
         * If current is missing but a valid
         * sale price exists, use it.
         */
        if (
            current === null &&
            sale !== null &&
            sale > 0
        ) {
            current = sale;
        }

        /*
         * If there is no real difference,
         * show one price only.
         */
        if (
            current !== null &&
            original !== null &&
            current >= original
        ) {
            original = null;
        }

        return {
            current: current,
            original: original
        };
    }

    function parseProductData(raw) {
        if (!raw) {
            return null;
        }

        if (
            typeof raw === 'object'
        ) {
            return raw;
        }

        if (
            typeof raw !== 'string'
        ) {
            return null;
        }

        let text =
            raw.trim();

        if (!text) {
            return null;
        }

        try {
            return JSON.parse(text);
        } catch (error) {}

        /*
         * Try decoding HTML entities
         * before JSON parsing.
         */
        try {
            const textarea =
                document.createElement(
                    'textarea'
                );

            textarea.innerHTML = text;

            return JSON.parse(
                textarea.value
            );
        } catch (error) {}

        return null;
    }

    function getCardProduct(card) {
        if (!card) {
            return null;
        }

        try {
            if (
                card.product
            ) {
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
            const raw =
                card.getAttribute(
                    'product'
                );

            const product =
                parseProductData(raw);

            if (product) {
                return product;
            }
        } catch (error) {}

        return null;
    }

    function getPageProductObject() {
        const candidates = [];

        try {
            if (
                typeof salla !== 'undefined' &&
                salla.product
            ) {
                candidates.push(
                    salla.product
                );
            }
        } catch (error) {}

        try {
            if (
                typeof salla !== 'undefined' &&
                salla.config &&
                typeof salla.config.get === 'function'
            ) {
                candidates.push(
                    salla.config.get(
                        'product'
                    )
                );

                candidates.push(
                    salla.config.get(
                        'page.product'
                    )
                );
            }
        } catch (error) {}

        for (
            let i = 0;
            i < candidates.length;
            i++
        ) {
            const product =
                parseProductData(
                    candidates[i]
                );

            if (product) {
                return product;
            }
        }

        return null;
    }

    function extractPriceFromElement(element) {
        if (!element) {
            return null;
        }

        const values =
            getNumericValuesFromText(
                element.textContent
            );

        if (
            values.length === 0
        ) {
            return null;
        }

        /*
         * One element should normally
         * represent one price.
         * Take the last numeric value
         * to avoid duplicated accessibility
         * text such as "50 50".
         */
        return values[
            values.length - 1
        ];
    }

    function getDomPriceDetails(root) {
        if (!root) {
            return {
                current: null,
                original: null
            };
        }

        let current = null;
        let original = null;

        /*
         * First: explicit Salla price component.
         */
        const priceComponents =
            root.querySelectorAll(
                'salla-product-price'
            );

        for (
            let i = 0;
            i < priceComponents.length;
            i++
        ) {
            const element =
                priceComponents[i];

            const value =
                extractPriceFromElement(
                    element
                );

            if (
                value !== null
            ) {
                const isOld =
                    element.hasAttribute(
                        'regular-price'
                    ) ||
                    element.hasAttribute(
                        'compare-price'
                    ) ||
                    element.classList.contains(
                        'line-through'
                    ) ||
                    element.classList.contains(
                        'price-before'
                    );

                if (
                    isOld &&
                    original === null
                ) {
                    original = value;
                } else if (
                    current === null
                ) {
                    current = value;
                }
            }
        }

        /*
         * Explicit old/current price selectors.
         */
        const oldSelectors = [
            '.price-regular',
            '.price-before',
            '.price-old',
            '.regular-price',
            '.compare-price',
            '[class*="line-through"]',
            '[class*="old-price"]'
        ];

        const currentSelectors = [
            '.main-price',
            '.price-after',
            '.current-price',
            '.sale-price',
            '.product-price'
        ];

        oldSelectors.forEach(
            function (selector) {
                if (original !== null) {
                    return;
                }

                const elements =
                    root.querySelectorAll(
                        selector
                    );

                elements.forEach(
                    function (element) {
                        if (
                            original === null
                        ) {
                            original =
                                extractPriceFromElement(
                                    element
                                );
                        }
                    }
                );
            }
        );

        currentSelectors.forEach(
            function (selector) {
                if (current !== null) {
                    return;
                }

                const elements =
                    root.querySelectorAll(
                        selector
                    );

                elements.forEach(
                    function (element) {
                        if (
                            current === null
                        ) {
                            current =
                                extractPriceFromElement(
                                    element
                                );
                        }
                    }
                );
            }
        );

        /*
         * Last fallback:
         * inspect visible price-like elements
         * individually, never the entire card
         * as one text string.
         */
        if (
            current === null
        ) {
            const possiblePrices =
                root.querySelectorAll(
                    '[class*="price"], [class*="Price"]'
                );

            const values = [];

            possiblePrices.forEach(
                function (element) {
                    const value =
                        extractPriceFromElement(
                            element
                        );

                    if (
                        value !== null &&
                        !values.includes(value)
                    ) {
                        values.push(value);
                    }
                }
            );

            if (
                values.length === 1
            ) {
                current =
                    values[0];
            } else if (
                values.length >= 2
            ) {
                /*
                 * Usually higher = original
                 * and lower = current.
                 */
                const sorted =
                    values.slice().sort(
                        function (a, b) {
                            return a - b;
                        }
                    );

                current =
                    sorted[0];

                original =
                    sorted[
                        sorted.length - 1
                    ];
            }
        }

        if (
            current !== null &&
            original !== null &&
            current >= original
        ) {
            original = null;
        }

        return {
            current: current,
            original: original
        };
    }
       /* =========================
       Final Price Details
    ========================= */

    function getProductPriceDetails(root) {
        const product =
            getCardProduct(root);

        if (product) {
            const details =
                getPriceFromProductObject(
                    product
                );

            if (
                details.current !== null
            ) {
                return details;
            }
        }

        return getDomPriceDetails(root);
    }

    function getPagePriceDetails() {
        const product =
            getPageProductObject();

        if (product) {
            const details =
                getPriceFromProductObject(
                    product
                );

            if (
                details.current !== null
            ) {
                return details;
            }
        }

        return getDomPriceDetails(
            document
        );
    }

    /* =========================
       Product Name
    ========================= */

    function getProductName(root) {
        if (!root) {
            return '';
        }

        const selectors = [
            '[data-product-name]',
            '.product-title',
            '.product-name',
            'h1',
            'h2',
            'h3',
            'h4',
            'a[title]'
        ];

        for (
            let i = 0;
            i < selectors.length;
            i++
        ) {
            try {
                const elements =
                    root.querySelectorAll(
                        selectors[i]
                    );

                for (
                    let j = 0;
                    j < elements.length;
                    j++
                ) {
                    const element =
                        elements[j];

                    const text =
                        cleanText(
                            element.textContent ||
                            element.getAttribute(
                                'title'
                            )
                        );

                    if (
                        text &&
                        text.length < 200 &&
                        !/نفدت|نفد المخزون|غير متوفر|السعر/.test(
                            text
                        )
                    ) {
                        return text;
                    }
                }
            } catch (error) {}
        }

        try {
            const image =
                root.querySelector(
                    'img[alt]'
                );

            const alt =
                cleanText(
                    image?.getAttribute(
                        'alt'
                    )
                );

            if (alt) {
                return alt;
            }
        } catch (error) {}

        return '';
    }

    /* =========================
       Product URL
    ========================= */

    function getProductUrl(root) {
        if (!root) {
            return window.location.href;
        }

        try {
            const product =
                getCardProduct(root);

            if (
                product &&
                product.url
            ) {
                return new URL(
                    product.url,
                    window.location.origin
                ).href;
            }
        } catch (error) {}

        const selectors = [
            'a[href*="/p"]',
            'a[href*="/products/"]',
            'a.product-link',
            '.product-link a',
            'h2 a',
            'h3 a',
            'h4 a',
            'a'
        ];

        for (
            let i = 0;
            i < selectors.length;
            i++
        ) {
            try {
                const links =
                    root.querySelectorAll(
                        selectors[i]
                    );

                for (
                    let j = 0;
                    j < links.length;
                    j++
                ) {
                    const href =
                        links[j].getAttribute(
                            'href'
                        );

                    if (
                        href &&
                        !href.startsWith(
                            'javascript:'
                        ) &&
                        href !== '#'
                    ) {
                        return new URL(
                            href,
                            window.location.origin
                        ).href;
                    }
                }
            } catch (error) {}
        }

        return window.location.href;
    }

    /* =========================
       Out Of Stock Detection
    ========================= */

    function hasOutOfStockText(root) {
        if (!root) {
            return false;
        }

        const text =
            cleanText(
                root.textContent
            ).toLowerCase();

        const phrases = [
            'نفدت الكمية',
            'نفد المخزون',
            'نفذت الكمية',
            'غير متوفر',
            'غير متاحة',
            'out of stock',
            'sold out'
        ];

        return phrases.some(
            function (phrase) {
                return text.includes(
                    phrase.toLowerCase()
                );
            }
        );
    }

    function hasDisabledPurchaseButton(root) {
        if (!root) {
            return false;
        }

        const buttons =
            root.querySelectorAll(
                'button, salla-add-to-cart-button, [role="button"]'
            );

        for (
            let i = 0;
            i < buttons.length;
            i++
        ) {
            const button =
                buttons[i];

            const disabled =
                button.disabled ||
                button.hasAttribute(
                    'disabled'
                ) ||
                button.hasAttribute(
                    'out-of-stock'
                );

            if (!disabled) {
                continue;
            }

            const text =
                cleanText(
                    button.textContent
                ).toLowerCase();

            if (
                !text ||
                text.includes('نفد') ||
                text.includes('نفدت') ||
                text.includes('غير متوفر') ||
                text.includes('out') ||
                text.includes('sold')
            ) {
                return true;
            }
        }

        return false;
    }

    function isProductPage() {
        try {
            if (
                typeof salla !== 'undefined' &&
                salla.config &&
                typeof salla.config.get === 'function'
            ) {
                const page =
                    salla.config.get(
                        'page'
                    );

                if (
                    page &&
                    typeof page === 'object' &&
                    page.id
                ) {
                    return true;
                }
            }
        } catch (error) {}

        return Boolean(
            document.querySelector(
                'salla-add-to-cart-button'
            ) &&
            (
                document.querySelector(
                    'salla-product-page'
                ) ||
                document.querySelector(
                    '.product-details'
                ) ||
                document.querySelector(
                    '.product-detail'
                )
            )
        );
    }

    /* =========================
       Message
    ========================= */

    function buildMessage(
        settings,
        root,
        isProductPageMode
    ) {
        const productName =
            getProductName(root);

        const productUrl =
            isProductPageMode
                ? window.location.href
                : getProductUrl(root);

        const priceDetails =
            isProductPageMode
                ? getPagePriceDetails()
                : getProductPriceDetails(root);

        let message =
            settings.customMessage ||
            DEFAULT_MESSAGE;

        if (productName) {
            message +=
                `\nالمنتج: ${productName}`;
        }

        if (
            priceDetails.original !== null &&
            priceDetails.current !== null &&
            priceDetails.current <
                priceDetails.original
        ) {
            message +=
                `\nالسعر الأصلي: ${formatPrice(
                    priceDetails.original
                )}`;

            message +=
                `\nالسعر بعد الخصم: ${formatPrice(
                    priceDetails.current
                )}`;
        } else if (
            priceDetails.current !== null
        ) {
            message +=
                `\nالسعر: ${formatPrice(
                    priceDetails.current
                )}`;
        }

        if (productUrl) {
            message +=
                `\nالرابط: ${productUrl}`;
        }

        return message;
    }

    /* =========================
       Create Button
    ========================= */

    function createWhatsAppButton(
        settings,
        target,
        isMini,
        insertAfter
    ) {
        if (!target) {
            return null;
        }

        const whatsappNumber =
            cleanText(
                settings.whatsappNumber
            ).replace(
                /[^\d+]/g,
                ''
            );

        if (!whatsappNumber) {
            return null;
        }

        const buttonId =
            isMini
                ? `${CARD_BUTTON_PREFIX}-${Math.random()
                    .toString(36)
                    .slice(2)}`
                : PRODUCT_BUTTON_ID;

        const button =
            document.createElement('a');

        button.id = buttonId;

        const message =
            buildMessage(
                settings,
                target,
                !isMini
            );

        button.href =
            `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                message
            )}`;

        button.target = '_blank';
        button.rel =
            'noopener noreferrer';

        button.textContent =
            isMini
                ? '🟢 أبلغني عند التوفر'
                : '🔔 أبلغني عبر واتساب عند توفر المنتج';

        Object.assign(
            button.style,
            {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                backgroundColor: '#25D366',
                color: '#ffffff',
                padding: isMini
                    ? '8px 12px'
                    : '12px 16px',
                marginTop: '8px',
                borderRadius: '8px',
                fontSize: isMini
                    ? '13px'
                    : '15px',
                fontWeight: '700',
                textDecoration: 'none',
                boxSizing: 'border-box',
                textAlign: 'center',
                cursor: 'pointer',
                lineHeight: '1.5'
            }
        );

        if (insertAfter) {
            target.insertAdjacentElement(
                'afterend',
                button
            );
        } else {
            target.appendChild(
                button
            );
        }

        return button;
    }

    /* =========================
       Product Page
    ========================= */

    async function injectProductPageButton() {
        if (!isProductPage()) {
            return;
        }

        if (
            document.getElementById(
                PRODUCT_BUTTON_ID
            )
        ) {
            return;
        }

        const addToCart =
            document.querySelector(
                'salla-add-to-cart-button'
            );

        if (!addToCart) {
            return;
        }

        const isOutOfStock =
            addToCart.hasAttribute(
                'out-of-stock'
            ) ||
            addToCart.hasAttribute(
                'disabled'
            ) ||
            addToCart.disabled ||
            hasOutOfStockText(
                addToCart
            ) ||
            hasDisabledPurchaseButton(
                addToCart
            );

        if (!isOutOfStock) {
            return;
        }

        const settings =
            await getSettings();

        if (
            !settings ||
            !settings.whatsappNumber
        ) {
            return;
        }

        if (
            document.getElementById(
                PRODUCT_BUTTON_ID
            )
        ) {
            return;
        }

        createWhatsAppButton(
            settings,
            document,
            false,
            true
        );
    }

    /* =========================
       Find Product Cards
    ========================= */

    function getProductCards() {
        const cards = [];
        const seen = new Set();

        const selectors = [
            'salla-product-card',
            '.product-card',
            '[data-product-id]',
            'article.product',
            'li.product'
        ];

        selectors.forEach(
            function (selector) {
                try {
                    document
                        .querySelectorAll(
                            selector
                        )
                        .forEach(
                            function (card) {
                                if (
                                    !seen.has(card)
                                ) {
                                    seen.add(
                                        card
                                    );
                                    cards.push(
                                        card
                                    );
                                }
                            }
                        );
                } catch (error) {}
            }
        );

        return cards;
    }

    /* =========================
       Homepage / Product Grid
    ========================= */

    async function injectHomepageButtons() {
        if (isProductPage()) {
            return;
        }

        const cards =
            getProductCards();

        if (
            cards.length === 0
        ) {
            return;
        }

        const settings =
            await getSettings();

        if (
            !settings ||
            !settings.whatsappNumber
        ) {
            return;
        }

        cards.forEach(
            function (card) {
                if (
                    card.querySelector(
                        `[id^="${CARD_BUTTON_PREFIX}-"]`
                    )
                ) {
                    return;
                }

                /*
                 * First use Salla's card data
                 * when available.
                 */
                const product =
                    getCardProduct(card);

                let outOfStock = false;

                if (product) {
                    if (
                        product.is_available ===
                        false
                    ) {
                        outOfStock = true;
                    }

                    if (
                        product.status ===
                        'out_of_stock'
                    ) {
                        outOfStock = true;
                    }

                    if (
                        product.status ===
                        'unavailable'
                    ) {
                        outOfStock = true;
                    }
                }

                /*
                 * DOM fallback.
                 */
                if (
                    !outOfStock &&
                    hasOutOfStockText(
                        card
                    )
                ) {
                    outOfStock = true;
                }

                if (
                    !outOfStock &&
                    hasDisabledPurchaseButton(
                        card
                    )
                ) {
                    outOfStock = true;
                }

                if (!outOfStock) {
                    return;
                }

                /*
                 * Put the button after the
                 * purchase area when possible,
                 * otherwise at the bottom
                 * of the product card.
                 */
                const purchaseTarget =
                    card.querySelector(
                        'salla-add-to-cart-button'
                    ) ||
                    card.querySelector(
                        'button[disabled]'
                    ) ||
                    card.querySelector(
                        '[role="button"][aria-disabled="true"]'
                    );

                if (
                    purchaseTarget
                ) {
                    createWhatsAppButton(
                        settings,
                        card,
                        true,
                        true
                    );
                } else {
                    createWhatsAppButton(
                        settings,
                        card,
                        true,
                        false
                    );
                }
            }
        );
    }

    /* =========================
       Main Scan
    ========================= */

    async function scan() {
        try {
            await injectProductPageButton();
            await injectHomepageButtons();
        } catch (error) {
            console.error(
                '[Salla WhatsApp Notify]',
                error
            );
        }
    }

    /*
     * Initial scan.
     */
    scan();

    /*
     * Salla themes frequently render
     * product cards dynamically.
     */
    let scanTimer = null;

    const observer =
        new MutationObserver(
            function () {
                if (scanTimer) {
                    clearTimeout(
                        scanTimer
                    );
                }

                scanTimer =
                    setTimeout(
                        function () {
                            scan();
                        },
                        350
                    );
            }
        );

    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );

    /*
     * One additional delayed scan
     * for components that initialize
     * after the first render.
     */
    setTimeout(
        scan,
        1500
    );

})(); 
