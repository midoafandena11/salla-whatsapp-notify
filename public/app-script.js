(function () {
    'use strict';

    /* =========================================================
       SALLA WHATSAPP NOTIFY
       Product-Container Architecture
       ========================================================= */

    const API_BASE =
        'https://salla-whatsapp-notify.onrender.com';

    const BUTTON_CLASS =
        'salla-whatsapp-notify-button';

    const BUTTON_ATTR =
        'data-salla-whatsapp-notify';

    const PROCESSED_ATTR =
        'data-salla-whatsapp-notify-processed';

    let merchantId = null;
    let settings = null;
    let settingsPromise = null;

    /*
     * WeakMap:
     * يمنع معالجة نفس Product Container
     * بشكل متكرر بدون ما نمسك العناصر في الذاكرة للأبد.
     */
    const productStates = new WeakMap();

    /*
     * أثناء معالجة دفعة واحدة من العناصر،
     * نستخدم Set لمنع معالجة نفس الـ container
     * أكثر من مرة.
     */
    const pendingContainers = new Set();

    let processTimer = null;


    /* =========================================================
       BASIC HELPERS
       ========================================================= */

    function cleanText(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
    }


    function isElement(node) {
        return (
            node &&
            node.nodeType === 1
        );
    }


    function isVisible(element) {
        if (!element) {
            return false;
        }

        try {
            const style =
                window.getComputedStyle(element);

            if (
                style.display === 'none' ||
                style.visibility === 'hidden'
            ) {
                return false;
            }

            if (
                Number(style.opacity) === 0
            ) {
                return false;
            }

            const rect =
                element.getBoundingClientRect();

            return (
                rect.width > 0 &&
                rect.height > 0
            );
        } catch (error) {
            return true;
        }
    }


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

        const storeId =
            getSallaConfig('store.id');

        if (storeId) {
            merchantId =
                String(storeId);

            return merchantId;
        }

        const possibleIds = [
            getSallaConfig('store_id'),
            getSallaConfig('merchant_id'),
            getSallaConfig('merchant.id')
        ];

        for (const id of possibleIds) {
            if (id) {
                merchantId =
                    String(id);

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
                        'Accept': 'application/json'
                    }
                }
            )
                .then(async function (response) {
                    if (!response.ok) {
                        throw new Error(
                            `Settings request failed: ${response.status}`
                        );
                    }

                    return response.json();
                })
                .then(function (data) {
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
                                'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
                            ).trim()
                    };

                    return settings;
                })
                .catch(function (error) {
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
       URL HELPERS
       ========================================================= */

    function normalizeUrl(url) {
        if (!url) {
            return '';
        }

        try {
            return new URL(
                url,
                window.location.origin
            ).href;
        } catch (error) {
            return '';
        }
    }


    function isBadProductLink(url) {
        if (!url) {
            return true;
        }

        const lower =
            url.toLowerCase();

        const badParts = [
            '/cart',
            '/checkout',
            '/login',
            '/register',
            '/wishlist',
            'javascript:',
            '#'
        ];

        return badParts.some(function (part) {
            return lower.includes(part);
        });
    }


    /* =========================================================
       PRODUCT LINK
       ========================================================= */

    function getProductLink(container) {
        if (!container) {
            return '';
        }

        const links =
            container.querySelectorAll(
                'a[href]'
            );

        let bestLink = '';

        for (const link of links) {
            if (!isVisible(link)) {
                continue;
            }

            const href =
                normalizeUrl(
                    link.getAttribute('href')
                );

            if (
                !href ||
                isBadProductLink(href)
            ) {
                continue;
            }

            /*
             * نفضل الرابط الذي يحتوي على:
             * صورة أو عنوان المنتج.
             */
            const hasImage =
                !!link.querySelector('img');

            const text =
                cleanText(
                    link.textContent
                );

            const hasText =
                text.length >= 2;

            if (
                hasImage ||
                hasText
            ) {
                return href;
            }

            if (!bestLink) {
                bestLink = href;
            }
        }

        return bestLink;
    }


    /* =========================================================
       PRODUCT ID
       ========================================================= */

    function getProductId(container) {
        if (!container) {
            return '';
        }

        const attributes = [
            'data-product-id',
            'data-id',
            'product-id',
            'data-product'
        ];

        let current =
            container;

        for (let level = 0; level < 5; level++) {
            if (!current) {
                break;
            }

            for (const attr of attributes) {
                const value =
                    current.getAttribute(attr);

                if (value) {
                    return String(value).trim();
                }
            }

            current =
                current.parentElement;
        }

        return '';
    }


    /* =========================================================
       TEXT SIGNALS
       ========================================================= */

    function containsOutOfStockText(text) {
        const value =
            cleanText(text)
                .toLowerCase();

        if (!value) {
            return false;
        }

        const phrases = [
            'نفد المخزون',
            'نفد',
            'نفذت الكمية',
            'نفذت',
            'غير متوفر',
            'غير متاحة',
            'غير متاح',
            'غير متوفر حالياً',
            'غير متوفر حاليًا',
            'غير متاحة حالياً',
            'غير متاحة حاليًا',
            'sold out',
            'out of stock',
            'unavailable',
            'not available',
            'currently unavailable'
        ];

        return phrases.some(function (phrase) {
            return value.includes(phrase);
        });
    }


    function containsInStockText(text) {
        const value =
            cleanText(text)
                .toLowerCase();

        if (!value) {
            return false;
        }

        const phrases = [
            'متوفر',
            'متاحة',
            'متاح',
            'متوفر الآن',
            'متوفر حالياً',
            'متوفر حاليًا',
            'in stock',
            'available'
        ];

        return phrases.some(function (phrase) {
            return value.includes(phrase);
        });
    }


    /* =========================================================
       ATTRIBUTE AVAILABILITY
       ========================================================= */

    function parseAvailabilityValue(value) {
        if (
            value === null ||
            value === undefined
        ) {
            return null;
        }

        const normalized =
            String(value)
                .trim()
                .toLowerCase();

        if (!normalized) {
            return null;
        }

        /*
         * Numeric stock
         */
        if (
            /^-?\d+(\.\d+)?$/.test(
                normalized
            )
        ) {
            const number =
                Number(normalized);

            if (number <= 0) {
                return 'out';
            }

            return 'in';
        }

        const outValues = [
            'false',
            'no',
            'off',
            'out',
            'out-of-stock',
            'out_of_stock',
            'sold-out',
            'sold_out',
            'unavailable',
            'not-available',
            'not_available'
        ];

        if (
            outValues.includes(normalized)
        ) {
            return 'out';
        }

        const inValues = [
            'true',
            'yes',
            'on',
            'in',
            'available',
            'in-stock',
            'in_stock'
        ];

        if (
            inValues.includes(normalized)
        ) {
            return 'in';
        }

        return null;
    }


    function readAvailabilityAttributes(element) {
        if (!element) {
            return null;
        }

        const attributes = [
            'data-available',
            'data-in-stock',
            'data-stock',
            'data-quantity',
            'data-product-status',
            'product-status',
            'data-stock-status',
            'stock-status',
            'data-availability',
            'availability'
        ];

        for (const attribute of attributes) {
            const value =
                element.getAttribute(
                    attribute
                );

            const result =
                parseAvailabilityValue(value);

            if (result) {
                return result;
            }
        }

        return null;
    }
        /* =========================================================
       COMPONENT STATUS
       ========================================================= */

    function readComponentStatus(element) {
        if (!element) {
            return null;
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

            const result =
                parseAvailabilityValue(value);

            if (result) {
                return result;
            }
        }

        /*
         * Salla Web Component properties
         */
        const properties = [
            'productStatus',
            'status',
            'available',
            'inStock',
            'stock',
            'quantity'
        ];

        for (const property of properties) {
            try {
                const value =
                    element[property];

                if (
                    typeof value === 'number'
                ) {
                    return value <= 0
                        ? 'out'
                        : 'in';
                }

                const result =
                    parseAvailabilityValue(
                        value
                    );

                if (result) {
                    return result;
                }
            } catch (error) {}
        }

        return null;
    }


    /* =========================================================
       PURCHASE CONTROL
       ========================================================= */

    function isPurchaseControl(element) {
        if (!element) {
            return false;
        }

        if (
            element.matches(
                'salla-add-product-button'
            )
        ) {
            return true;
        }

        if (
            element.matches(
                'button[type="submit"]'
            )
        ) {
            return true;
        }

        const className =
            String(
                element.className || ''
            ).toLowerCase();

        const attributes = [
            'add-to-cart',
            'add-to-basket',
            'add-cart',
            'cart-button',
            'purchase'
        ];

        return attributes.some(function (part) {
            return className.includes(part);
        });
    }


    function getPurchaseControls(container) {
        if (!container) {
            return [];
        }

        const result = [];

        if (
            isPurchaseControl(container)
        ) {
            result.push(container);
        }

        const elements =
            container.querySelectorAll(
                'salla-add-product-button,' +
                'button[type="submit"],' +
                'button,' +
                '[role="button"],' +
                'a[role="button"]'
            );

        for (const element of elements) {
            if (
                isPurchaseControl(element)
            ) {
                result.push(element);
            }
        }

        /*
         * إزالة التكرار
         */
        return Array.from(
            new Set(result)
        );
    }


    /* =========================================================
       STOCK DETECTION
       ========================================================= */

    function detectStock(container) {
        if (!container) {
            return {
                state: 'unknown',
                confidence: 0
            };
        }

        /*
         * =====================================================
         * LEVEL 1
         * Explicit stock / availability attributes
         * =====================================================
         */

        const nodes = [
            container,
            ...getPurchaseControls(container)
        ];

        for (const node of nodes) {
            const result =
                readAvailabilityAttributes(node);

            if (result === 'out') {
                return {
                    state: 'out',
                    confidence: 100
                };
            }

            if (result === 'in') {
                return {
                    state: 'in',
                    confidence: 100
                };
            }
        }


        /*
         * =====================================================
         * LEVEL 2
         * Salla component status
         * =====================================================
         */

        for (const node of nodes) {
            const result =
                readComponentStatus(node);

            if (result === 'out') {
                return {
                    state: 'out',
                    confidence: 95
                };
            }

            if (result === 'in') {
                return {
                    state: 'in',
                    confidence: 95
                };
            }
        }


        /*
         * =====================================================
         * LEVEL 3
         * Official Salla availability component
         *
         * مهم:
         * مجرد وجود component لا يعني نفاد المنتج.
         * لازم يكون داخله signal حقيقي.
         * =====================================================
         */

        const availability =
            container.querySelector(
                'salla-product-availability'
            );

        if (availability) {
            const attributeResult =
                readAvailabilityAttributes(
                    availability
                );

            if (
                attributeResult === 'out'
            ) {
                return {
                    state: 'out',
                    confidence: 90
                };
            }

            if (
                attributeResult === 'in'
            ) {
                return {
                    state: 'in',
                    confidence: 90
                };
            }

            const componentResult =
                readComponentStatus(
                    availability
                );

            if (
                componentResult === 'out'
            ) {
                return {
                    state: 'out',
                    confidence: 90
                };
            }

            if (
                componentResult === 'in'
            ) {
                return {
                    state: 'in',
                    confidence: 90
                };
            }

            const availabilityText =
                cleanText(
                    availability.textContent
                );

            if (
                containsOutOfStockText(
                    availabilityText
                )
            ) {
                return {
                    state: 'out',
                    confidence: 85
                };
            }

            if (
                containsInStockText(
                    availabilityText
                )
            ) {
                return {
                    state: 'in',
                    confidence: 85
                };
            }
        }


        /*
         * =====================================================
         * LEVEL 4
         * Purchase button state + text
         *
         * disabled لوحده مش كفاية.
         * =====================================================
         */

        const purchaseControls =
            getPurchaseControls(
                container
            );

        for (const button of purchaseControls) {
            const text =
                cleanText(
                    [
                        button.textContent,
                        button.getAttribute('aria-label'),
                        button.getAttribute('title'),
                        button.getAttribute('value')
                    ]
                        .filter(Boolean)
                        .join(' ')
                );

            const disabled =
                button.hasAttribute('disabled') ||
                button.disabled === true ||
                button.getAttribute(
                    'aria-disabled'
                ) === 'true';

            if (
                disabled &&
                containsOutOfStockText(text)
            ) {
                return {
                    state: 'out',
                    confidence: 80
                };
            }

            if (
                containsInStockText(text) &&
                !disabled
            ) {
                return {
                    state: 'in',
                    confidence: 75
                };
            }
        }


        /*
         * =====================================================
         * LEVEL 5
         * Generic stock / availability elements
         * =====================================================
         */

        const stockElements =
            container.querySelectorAll(
                '[class*="stock"],' +
                '[class*="availability"],' +
                '[data-stock-status],' +
                '[data-availability]'
            );

        for (const element of stockElements) {
            const attributeResult =
                readAvailabilityAttributes(
                    element
                );

            if (
                attributeResult === 'out'
            ) {
                return {
                    state: 'out',
                    confidence: 75
                };
            }

            if (
                attributeResult === 'in'
            ) {
                return {
                    state: 'in',
                    confidence: 75
                };
            }

            const text =
                cleanText(
                    element.textContent
                );

            if (
                containsOutOfStockText(text)
            ) {
                return {
                    state: 'out',
                    confidence: 65
                };
            }

            if (
                containsInStockText(text)
            ) {
                return {
                    state: 'in',
                    confidence: 65
                };
            }
        }


        /*
         * =====================================================
         * UNKNOWN
         *
         * لو مفيش أي signal موثوق:
         * لا نظهر الزر.
         *
         * ده مهم جدًا لمنع false positives.
         * =====================================================
         */

        return {
            state: 'unknown',
            confidence: 0
        };
    }


    /* =========================================================
       PRODUCT NAME
       ========================================================= */

    function getProductName(container) {
        if (!container) {
            return '';
        }

        /*
         * Product-specific attributes
         */
        const attributes = [
            'data-product-title',
            'data-title',
            'product-title'
        ];

        for (const attribute of attributes) {
            const element =
                container.querySelector(
                    `[${attribute}]`
                );

            if (element) {
                const text =
                    cleanText(
                        element.getAttribute(
                            attribute
                        ) ||
                        element.textContent
                    );

                if (text) {
                    return text;
                }
            }
        }


        /*
         * Product title classes
         */
        const titleSelectors = [
            '[class*="product-title"]',
            '[class*="product-name"]',
            '[class*="product_name"]'
        ];

        for (const selector of titleSelectors) {
            const elements =
                container.querySelectorAll(
                    selector
                );

            for (const element of elements) {
                if (!isVisible(element)) {
                    continue;
                }

                const text =
                    cleanText(
                        element.textContent
                    );

                if (
                    text &&
                    text.length >= 2
                ) {
                    return text;
                }
            }
        }


        /*
         * Headings
         */
        const headings =
            container.querySelectorAll(
                'h1, h2, h3, h4'
            );

        for (const element of headings) {
            if (!isVisible(element)) {
                continue;
            }

            const text =
                cleanText(
                    element.textContent
                );

            if (
                text &&
                text.length >= 2 &&
                !containsOutOfStockText(text)
            ) {
                return text;
            }
        }


        /*
         * Salla product page fallback
         */
        const pageTitle =
            getSallaConfig('page.title');

        if (pageTitle) {
            return cleanText(
                pageTitle
            );
        }


        /*
         * Document title fallback
         */
        return cleanText(
            document.title
                .replace(/\s*[|—-]\s*.*$/, '')
        ) || 'هذا المنتج';
                }
        /* =========================================================
       PRODUCT PRICE
       ========================================================= */

    function isOldPrice(element) {
        if (!element) {
            return false;
        }

        const className =
            String(
                element.className || ''
            ).toLowerCase();

        const attributes =
            [
                'old',
                'compare',
                'original',
                'before',
                'was',
                'previous',
                'discount-old'
            ];

        for (const word of attributes) {
            if (
                className.includes(word)
            ) {
                return true;
            }
        }

        if (
            element.matches('del, s')
        ) {
            return true;
        }

        try {
            const style =
                window.getComputedStyle(
                    element
                );

            if (
                style.textDecorationLine &&
                style.textDecorationLine
                    .includes('line-through')
            ) {
                return true;
            }
        } catch (error) {}

        return false;
    }


    function getProductPrice(container) {
        if (!container) {
            return '';
        }

        /*
         * Product page official value
         */
        const pagePrice =
            getSallaConfig('page.price');

        /*
         * data-product-price
         * أقوى مصدر داخل الـ Card
         */
        const dataPrices =
            container.querySelectorAll(
                '[data-product-price]'
            );

        for (const element of dataPrices) {
            if (
                !isVisible(element) ||
                isOldPrice(element)
            ) {
                continue;
            }

            const attributeValue =
                element.getAttribute(
                    'data-product-price'
                );

            const text =
                cleanText(
                    attributeValue ||
                    element.textContent
                );

            if (
                text &&
                /\d/.test(text)
            ) {
                return text;
            }
        }


        /*
         * Price selectors
         */
        const selectors = [
            '[class*="product-price"]',
            '[class*="current-price"]',
            '[class*="sale-price"]',
            'salla-price',
            '[class*="price"]'
        ];

        for (const selector of selectors) {
            const elements =
                container.querySelectorAll(
                    selector
                );

            for (const element of elements) {
                if (
                    !isVisible(element) ||
                    isOldPrice(element)
                ) {
                    continue;
                }

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
        }


        /*
         * Product page fallback
         */
        if (pagePrice) {
            return cleanText(
                pagePrice
            );
        }

        return '';
    }


    /* =========================================================
       PRODUCT URL
       ========================================================= */

    function getProductUrl(container) {
        const link =
            getProductLink(
                container
            );

        if (link) {
            return link;
        }

        /*
         * لو ده Product Detail Page
         */
        return window.location.href;
    }


    /* =========================================================
       FIND PRODUCT CONTAINER
       ========================================================= */

    function countPurchaseControls(node) {
        if (!node) {
            return 0;
        }

        return getPurchaseControls(node).length;
    }


    function countUsefulProductLinks(node) {
        if (!node) {
            return 0;
        }

        const links =
            node.querySelectorAll(
                'a[href]'
            );

        let count = 0;
        const seen = new Set();

        for (const link of links) {
            const href =
                normalizeUrl(
                    link.getAttribute('href')
                );

            if (
                !href ||
                isBadProductLink(href) ||
                seen.has(href)
            ) {
                continue;
            }

            seen.add(href);

            const hasImage =
                !!link.querySelector('img');

            const text =
                cleanText(
                    link.textContent
                );

            if (
                hasImage ||
                text.length >= 2
            ) {
                count++;
            }
        }

        return count;
    }


    function hasProductInformation(node) {
        if (!node) {
            return false;
        }

        const hasTitle =
            !!node.querySelector(
                'h1, h2, h3, h4,' +
                '[class*="product-title"],' +
                '[class*="product-name"]'
            );

        const hasPrice =
            !!node.querySelector(
                '[data-product-price],' +
                '[class*="price"],' +
                'salla-price'
            );

        const hasImage =
            !!node.querySelector(
                'img'
            );

        return (
            hasTitle ||
            hasPrice ||
            hasImage
        );
    }


    function scoreContainer(
        node,
        sourceElement
    ) {
        if (!node || node === document.body) {
            return -999;
        }

        const tag =
            node.tagName.toLowerCase();

        if (
            tag === 'html' ||
            tag === 'body' ||
            tag === 'main'
        ) {
            return -999;
        }

        const purchaseCount =
            countPurchaseControls(node);

        const linkCount =
            countUsefulProductLinks(node);

        const hasInfo =
            hasProductInformation(node);

        const className =
            String(
                node.className || ''
            ).toLowerCase();

        const productHint =
            className.includes('product') ||
            className.includes('card') ||
            className.includes('item') ||
            className.includes('catalog');

        let score = 0;

        /*
         * عنصر شراء واحد = علامة قوية جدًا
         */
        if (purchaseCount === 1) {
            score += 8;
        }

        /*
         * أكثر من زر شراء داخل نفس العنصر
         * غالبًا معناه إننا طلعنا للـ parent زيادة.
         */
        if (purchaseCount > 1) {
            score -= 8;
        }

        /*
         * رابط منتج واحد ممتاز للـ Cards.
         */
        if (linkCount === 1) {
            score += 7;
        }

        if (linkCount > 1) {
            score -= Math.min(
                linkCount - 1,
                5
            );
        }

        if (hasInfo) {
            score += 4;
        }

        if (productHint) {
            score += 3;
        }

        if (
            tag === 'article' ||
            tag === 'li'
        ) {
            score += 3;
        }

        /*
         * وجود صورة مع عنصر صغير
         */
        if (
            node.querySelector('img')
        ) {
            score += 1;
        }

        /*
         * لو المصدر نفسه زر شراء
         */
        if (
            sourceElement &&
            isPurchaseControl(sourceElement)
        ) {
            score += 2;
        }

        return score;
    }


    function findProductContainer(sourceElement) {
        if (!sourceElement) {
            return null;
        }

        /*
         * لو العنصر نفسه مناسب
         */
        let bestNode = null;
        let bestScore = -999;

        let current =
            sourceElement;

        /*
         * نصعد عدد محدود من المستويات.
         *
         * الهدف:
         * أصغر Container يحتوي المنتج
         * وليس الـ grid كله.
         */
        for (let level = 0; level < 10; level++) {
            if (!current) {
                break;
            }

            const score =
                scoreContainer(
                    current,
                    sourceElement
                );

            if (score > bestScore) {
                bestScore = score;
                bestNode = current;
            }

            /*
             * بمجرد ما نلاقي Container قوي جدًا
             * وفيه زر شراء واحد + معلومات المنتج،
             * نوقف.
             */
            if (
                score >= 17 &&
                countPurchaseControls(current) === 1
            ) {
                bestNode = current;
                break;
            }

            current =
                current.parentElement;
        }

        /*
         * لازم يكون عندنا على الأقل
         * product information أو purchase control.
         */
        if (!bestNode) {
            return null;
        }

        const hasPurchase =
            countPurchaseControls(
                bestNode
            ) > 0;

        const hasInfo =
            hasProductInformation(
                bestNode
            );

        if (
            !hasPurchase &&
            !hasInfo
        ) {
            return null;
        }

        return bestNode;
    }


    /* =========================================================
       FIND INSERTION TARGET
       ========================================================= */

    function findInsertionTarget(container) {
        if (!container) {
            return null;
        }

        const controls =
            getPurchaseControls(
                container
            );

        /*
         * الأولوية لزر الشراء الحقيقي.
         */
        for (const control of controls) {
            if (
                isVisible(control)
            ) {
                return control;
            }
        }

        /*
         * fallback:
         * stock / availability element
         */
        const stockElement =
            container.querySelector(
                'salla-product-availability,' +
                '[class*="stock"],' +
                '[class*="availability"]'
            );

        if (stockElement) {
            return stockElement;
        }

        return null;
                }
        /* =========================================================
       BUTTON
       ========================================================= */

    function removeNotifyButton(container) {
        if (!container) {
            return;
        }

        const buttons =
            container.querySelectorAll(
                `.${BUTTON_CLASS}`
            );

        for (const button of buttons) {
            button.remove();
        }
    }


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
            'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

        message +=
            `\n\nالمنتج: ${productName || 'هذا المنتج'}`;

        if (productPrice) {
            message +=
                `\nالسعر: ${productPrice}`;
        }

        if (productUrl) {
            message +=
                `\nالرابط: ${productUrl}`;
        }

        return (
            'https://wa.me/' +
            number +
            '?text=' +
            encodeURIComponent(message)
        );
    }


    function createNotifyButton(
        container,
        target,
        productName,
        productPrice,
        productUrl
    ) {
        if (
            !container ||
            !target
        ) {
            return;
        }

        /*
         * منع التكرار بشكل مباشر.
         */
        const existing =
            container.querySelector(
                `.${BUTTON_CLASS}`
            );

        if (existing) {
            return;
        }

        const whatsappUrl =
            createWhatsAppUrl(
                productName,
                productPrice,
                productUrl
            );

        if (!whatsappUrl) {
            return;
        }

        const button =
            document.createElement('a');

        button.className =
            BUTTON_CLASS;

        button.setAttribute(
            BUTTON_ATTR,
            'true'
        );

        button.href =
            whatsappUrl;

        button.target =
            '_blank';

        button.rel =
            'noopener noreferrer';

        button.setAttribute(
            'aria-label',
            'أبلغني عبر واتساب عند توفر المنتج'
        );

        button.textContent =
            '🔔 أبلغني عبر واتساب عند توفر المنتج';

        button.style.cssText = `
            display:block;
            width:100%;
            margin-top:10px;
            padding:12px 14px;
            background:#25D366;
            color:#ffffff;
            border:0;
            border-radius:10px;
            text-align:center;
            text-decoration:none;
            font-family:inherit;
            font-size:14px;
            font-weight:700;
            line-height:1.5;
            box-sizing:border-box;
            cursor:pointer;
            transition:opacity .18s ease;
            direction:rtl;
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

        /*
         * نضيفه بعد زر الشراء
         * أو بعد عنصر availability.
         */
        target.insertAdjacentElement(
            'afterend',
            button
        );
    }


    /* =========================================================
       PROCESS ONE PRODUCT
       ========================================================= */

    async function processProduct(
        container
    ) {
        if (!container) {
            return;
        }

        /*
         * منع أي processing لو العنصر
         * اتشال من الصفحة.
         */
        if (
            !container.isConnected
        ) {
            return;
        }

        /*
         * لا نعالج زرنا نفسه.
         */
        if (
            container.matches(
                `.${BUTTON_CLASS}`
            )
        ) {
            return;
        }

        const stock =
            detectStock(
                container
            );

        /*
         * المنتج متاح أو غير معروف:
         * لا نظهر زر WhatsApp.
         */
        if (
            stock.state !== 'out'
        ) {
            removeNotifyButton(
                container
            );

            productStates.set(
                container,
                {
                    state: stock.state,
                    confidence: stock.confidence,
                    button: null
                }
            );

            return;
        }

        /*
         * لو الزر موجود بالفعل:
         * انتهينا.
         */
        const existing =
            container.querySelector(
                `.${BUTTON_CLASS}`
            );

        if (existing) {
            productStates.set(
                container,
                {
                    state: 'out',
                    confidence: stock.confidence,
                    button: existing
                }
            );

            return;
        }

        /*
         * تحميل settings مرة واحدة فقط.
         */
        const loaded =
            await loadSettings();

        if (!loaded) {
            return;
        }

        /*
         * نعيد التأكد بعد تحميل settings،
         * لأن DOM ممكن يكون اتغير أثناء الانتظار.
         */
        if (
            !container.isConnected
        ) {
            return;
        }

        const currentStock =
            detectStock(
                container
            );

        if (
            currentStock.state !== 'out'
        ) {
            return;
        }

        /*
         * حماية ثانية ضد التكرار.
         */
        if (
            container.querySelector(
                `.${BUTTON_CLASS}`
            )
        ) {
            return;
        }

        const target =
            findInsertionTarget(
                container
            );

        if (!target) {
            return;
        }

        const productName =
            getProductName(
                container
            );

        const productPrice =
            getProductPrice(
                container
            );

        const productUrl =
            getProductUrl(
                container
            );

        createNotifyButton(
            container,
            target,
            productName,
            productPrice,
            productUrl
        );

        const button =
            container.querySelector(
                `.${BUTTON_CLASS}`
            );

        productStates.set(
            container,
            {
                state: 'out',
                confidence:
                    currentStock.confidence,
                button:
                    button || null,
                productId:
                    getProductId(
                        container
                    )
            });
    }


    /* =========================================================
       DISCOVER PRODUCT CANDIDATES
       ========================================================= */

    const CANDIDATE_SELECTOR = [
        'salla-add-product-button',
        'button[type="submit"]',
        'button',
        '[role="button"]',
        'a[role="button"]',
        '[class*="add-to-cart"]',
        '[class*="add-cart"]',
        '[class*="cart-button"]',
        '[class*="stock"]',
        '[class*="availability"]'
    ].join(',');


    function collectCandidates(root) {
        const candidates =
            new Set();

        if (!root) {
            return candidates;
        }

        if (
            isElement(root) &&
            root.matches(
                CANDIDATE_SELECTOR
            )
        ) {
            candidates.add(root);
        }

        if (
            root.querySelectorAll
        ) {
            const elements =
                root.querySelectorAll(
                    CANDIDATE_SELECTOR
                );

            for (const element of elements) {
                candidates.add(
                    element
                );
            }
        }

        return candidates;
    }


    function collectContainers(root) {
        const containers =
            new Set();

        const candidates =
            collectCandidates(
                root
            );

        for (const candidate of candidates) {
            const container =
                findProductContainer(
                    candidate
                );

            if (container) {
                containers.add(
                    container
                );
            }
        }

        /*
         * لو root نفسه يبدو كـ product container.
         */
        if (
            isElement(root)
        ) {
            const directContainer =
                findProductContainer(
                    root
                );

            if (directContainer) {
                containers.add(
                    directContainer
                );
            }
        }

        return containers;
    }


    /* =========================================================
       BATCH PROCESSING
       ========================================================= */

    function queueRoot(root) {
        if (!root) {
            return;
        }

        const containers =
            collectContainers(
                root
            );

        for (const container of containers) {
            pendingContainers.add(
                container
            );
        }

        scheduleProcessing();
    }


    function scheduleProcessing() {
        if (processTimer) {
            return;
        }

        processTimer =
            setTimeout(
                async function () {
                    processTimer = null;

                    const batch =
                        Array.from(
                            pendingContainers
                        );

                    pendingContainers.clear();

                    for (const container of batch) {
                        await processProduct(
                            container
                        );
                    }
                },
                0
            );
    }


    /* =========================================================
       INITIAL SCAN
       ========================================================= */

    function initialScan() {
        /*
         * مرة واحدة فقط عند البداية.
         *
         * بعد ذلك لن نعمل scan للصفحة كلها.
         */
        queueRoot(
            document.body
        );
    }


    /* =========================================================
       MUTATION OBSERVER
       ========================================================= */

    const observer =
        new MutationObserver(
            function (mutations) {
                const roots =
                    new Set();

                for (const mutation of mutations) {

                    /*
                     * عناصر جديدة:
                     * نعالج الجزء الجديد فقط.
                     */
                    if (
                        mutation.type ===
                        'childList'
                    ) {
                        for (
                            const node
                            of mutation.addedNodes
                        ) {
                            if (
                                isElement(node)
                            ) {
                                roots.add(
                                    node
                                );
                            }
                        }
                    }


                    /*
                     * تغيّر حالة زر شراء:
                     * disabled / status / stock...
                     *
                     * نعالج الـ product container
                     * الخاص به فقط.
                     */
                    if (
                        mutation.type ===
                        'attributes'
                    ) {
                        const target =
                            mutation.target;

                        if (
                            isElement(target)
                        ) {
                            roots.add(
                                target
                            );
                        }
                    }
                }

                /*
                 * لو مفيش حاجة جديدة،
                 * مفيش شغل.
                 */
                if (!roots.size) {
                    return;
                }

                for (const root of roots) {
                    queueRoot(
                        root
                    );
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

        /*
         * نراقب فقط التغييرات التي
         * ممكن تغير حالة المنتج.
         */
        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true,

                attributes: true,

                attributeFilter: [
                    'disabled',
                    'aria-disabled',
                    'product-status',
                    'status',
                    'data-product-status',
                    'data-available',
                    'data-in-stock',
                    'data-stock',
                    'data-quantity',
                    'data-stock-status',
                    'stock-status',
                    'data-availability',
                    'availability'
                ]
            }
        );

        /*
         * Scan واحد فقط عند البداية.
         */
        initialScan();
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
