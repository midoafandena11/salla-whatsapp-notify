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
       Salla Config
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

            const id =
                params.get('merchant_id');

            if (id) {
                merchantId = String(id);
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
            return null;
        }

        settingsPromise = fetch(
            `${API_BASE}/api/settings?merchant_id=${encodeURIComponent(id)}`,
            {
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
                        'Invalid settings'
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

    function getAmount(value) {
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
            return value.amount;
        }

        return value;
    }

    function formatPrice(value) {
        const amount =
            getAmount(value);

        if (
            amount === null ||
            amount === undefined ||
            amount === ''
        ) {
            return '';
        }

        return String(amount).trim();
    }

    function numericPrice(value) {
        const amount =
            getAmount(value);

        if (
            amount === null ||
            amount === undefined ||
            amount === ''
        ) {
            return null;
        }

        const number =
            Number(
                String(amount)
                    .replace(/,/g, '')
            );

        return Number.isFinite(number)
            ? number
            : null;
    }

    /*
     * السعر الصحيح:
     *
     * 1) سعر واحد:
     *    السعر: 50
     *
     * 2) عرض:
     *    السعر الأصلي: 100
     *    السعر بعد الخصم: 70
     *
     * sale_price = 0 يتم تجاهله.
     */
    function getProductPriceDetails(
        product
    ) {
        if (!product) {
            return {
                current: '',
                original: ''
            };
        }

        const priceValue =
            product.price;

        const regularValue =
            product.regular_price;

        const saleValue =
            product.sale_price;

        const price =
            numericPrice(priceValue);

        const regular =
            numericPrice(regularValue);

        const sale =
            numericPrice(saleValue);

        /*
         * السعر الحالي الأساسي
         */
        let current =
            price !== null
                ? price
                : null;

        /*
         * لو sale_price رقم حقيقي
         * وأقل من السعر الأصلي
         * نعتبره سعر العرض.
         */
        if (
            sale !== null &&
            sale > 0 &&
            regular !== null &&
            sale < regular
        ) {
            current = sale;
        }

        /*
         * لو price نفسه أقل من regular_price
         * فهذا أيضًا يدل على وجود خصم.
         */
        const hasDiscount =
            regular !== null &&
            current !== null &&
            current < regular;

        if (hasDiscount) {
            return {
                current:
                    formatPrice(current),

                original:
                    formatPrice(regular)
            };
        }

        /*
         * لا يوجد خصم
         */
        if (current !== null) {
            return {
                current:
                    formatPrice(current),

                original: ''
            };
        }

        /*
         * Fallback
         */
        if (regular !== null) {
            return {
                current:
                    formatPrice(regular),

                original: ''
            };
        }

        return {
            current: '',
            original: ''
        };
    }

    function getDomPriceDetails(
        root
    ) {
        const scope =
            root || document;

        let current = '';
        let original = '';

        const originalSelectors = [
            '.price-before',
            '.regular-price',
            '.line-through',
            '[class*="before-price"]',
            '[class*="regular-price"]',
            '[class*="old-price"]'
        ];

        const currentSelectors = [
            '.price-after',
            '.sale-price',
            '[class*="sale-price"]',
            '[class*="current-price"]',
            '.product-price'
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

        /*
         * لو لقينا السعر الأصلي
         * والسعر الحالي مختلفين
         * نعتبره عرض.
         */
        if (
            original &&
            current &&
            original !== current
        ) {
            return {
                current,
                original
            };
        }

        /*
         * لو مفيش سعر حالي
         * نبحث عن أي عنصر سعر.
         */
        if (!current) {
            const elements =
                scope.querySelectorAll(
                    '[class*="price"]'
                );

            for (
                const element
                of elements
            ) {
                const text =
                    element.textContent
                        .trim()
                        .replace(/\s+/g, ' ');

                if (
                    text &&
                    /\d/.test(text)
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
       Product Page
    ========================= */

    function getProductName() {
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

        return (
            document.title
                .replace(
                    /\s*[|—-]\s*.*$/,
                    ''
                )
                .trim() ||
            'هذا المنتج'
        );
    }

    function getProductPriceDetails() {
        /*
         * أولاً نحاول بيانات المنتج
         */
        const product =
            getSallaConfig('product') ||
            getSallaConfig('page.product');

        if (
            product &&
            typeof product === 'object'
        ) {
            const details =
                getProductPriceDetails(
                    product
                );

            if (
                details.current ||
                details.original
            ) {
                return details;
            }
        }

        /*
         * ثم DOM
         */
        return getDomPriceDetails();
    }

    function getProductUrl() {
        return window.location.href;
    }

    /* =========================
       Stock Detection
    ========================= */

    function getComponentStatus(
        element
    ) {
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
            const value =
                element.productStatus ||
                element.status;

            if (
                typeof value === 'string'
            ) {
                return value
                    .trim()
                    .toLowerCase();
            }
        } catch (error) {}

        return '';
    }

    function isOutOfStock() {
        const buttons =
            document.querySelectorAll(
                'salla-add-product-button'
            );

        for (
            const component
            of buttons
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
                component.hasAttribute(
                    'disabled'
                ) ||
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
                    text.includes('out of stock')
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

        for (
            const selector
            of selectors
        ) {
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

        const whatsappUrl =
            createWhatsAppUrl(
                getProductName(),
                getProductPriceDetails(),
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
       Homepage Cards
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

    function getCardId(
        card,
        product
    ) {
        const id =
            product?.id ||
            product?.product_id ||
            card.getAttribute(
                'data-product-id'
            );

        return id
            ? String(id)
            : '';
    }

    function isCardOutOfStock(
        card,
        product
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

        const text =
            (
                card.textContent ||
                ''
            )
                .trim()
                .toLowerCase();

        return (
            text.includes('نفدت الكمية') ||
            text.includes('نفد المخزون') ||
            text.includes('نفذت الكمية') ||
            text.includes('غير متوفر') ||
            text.includes('out of stock') ||
            text.includes('sold out')
        );
    }

    function getCardName(
        card,
        product
    ) {
        if (
            product &&
            product.name
        ) {
            return String(
                product.name
            )
                .trim()
                .replace(/\s+/g, ' ');
        }

        const element =
            card.querySelector(
                'h2, h3, h4, [class*="name"], [class*="title"]'
            );

        if (element) {
            return element.textContent
                .trim()
                .replace(/\s+/g, ' ');
        }

        return 'هذا المنتج';
    }

    function getCardUrl(
        card,
        product
    ) {
        if (
            product?.url
        ) {
            return product.url;
        }

        if (
            product?.urls?.customer
        ) {
            return product.urls.customer;
        }

        const link =
            card.querySelector(
                'a[href]'
            );

        return link
            ? link.href
            : window.location.href;
    }

    function findCardTarget(card) {
        const selectors = [
            'salla-add-product-button',
            'button',
            '[role="button"]'
        ];

        for (
            const selector
            of selectors
        ) {
            const elements =
                card.querySelectorAll(
                    selector
                );

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
        const id =
            getCardId(
                card,
                product
            );

        if (!id) {
            return;
        }

        const buttonId =
            CARD_BUTTON_PREFIX + id;

        if (
            document.getElementById(
                buttonId
            )
        ) {
            return;
        }

        const priceDetails =
            getProductPriceDetails(
                product
            );

        const domDetails =
            getDomPriceDetails(
                card
            );

        /*
         * لو بيانات المنتج مفيهاش سعر،
         * نستخدم سعر الكارت.
         */
        if (
            !priceDetails.current &&
            domDetails.current
        ) {
            priceDetails.current =
                domDetails.current;
        }

        if (
            !priceDetails.original &&
            domDetails.original
        ) {
            priceDetails.original =
                domDetails.original;
        }

        /*
         * لو عندنا سعر أصلي وسعر حالي
         * متساويين، نعرض سعر واحد.
         */
        if (
            priceDetails.original &&
            priceDetails.current &&
            priceDetails.original ===
                priceDetails.current
        ) {
            priceDetails.original = '';
        }

        const url =
            getCardUrl(
                card,
                product
            );

        const whatsappUrl =
            createWhatsAppUrl(
                getCardName(
                    card,
                    product
                ),
                priceDetails,
                url
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

        button.textContent =
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
            findCardTarget(card);

        if (target) {
            target.insertAdjacentElement(
                'afterend',
                button
            );
        } else {
            card.appendChild(button);
        }
    }

    async function checkCards() {
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

            if (
                !isCardOutOfStock(
                    card,
                    product
                )
            ) {
                continue;
            }

            /*
             * لو المنتج نفسه مش متاح
             * لكن بياناته غير موجودة،
             * نقدر نضيف الزر من DOM.
             */
            createCardButton(
                card,
                product || {}
            );
        }
    }

    /* =========================
       Main Product Check
    ========================= */

    async function checkProduct() {
        const pageId =
            getSallaConfig(
                'page.id'
            );

        if (!pageId) {
            return;
        }

        if (
            !isOutOfStock()
        ) {
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
       Observer
    ========================= */

    let timer = null;

    function scheduleCheck() {
        clearTimeout(timer);

        timer = setTimeout(
            function () {
                checkProduct();
                checkCards();
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
        checkCards();

        setTimeout(
            function () {
                checkProduct();
                checkCards();
            },
            1000
        );

        setTimeout(
            function () {
                checkProduct();
                checkCards();
            },
            2500
        );

        setTimeout(
            function () {
                checkProduct();
                checkCards();
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
