(function () {
    'use strict';

    const API_BASE =
        'https://salla-whatsapp-notify.onrender.com';

    const BUTTON_ID =
        'salla-whatsapp-notify-button';

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
                document.querySelector(selector);

            if (element) {
                return element;
            }
        }

        return null;
    }
    /* =========================
       Create WhatsApp URL
    ========================= */

    function createWhatsAppUrl() {
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
            getProductName();

        const productPrice =
            getProductPrice();

        const productUrl =
            getProductUrl();

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
       Create Button
    ========================= */

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
            createWhatsAppUrl();

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
       Main Check
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

        checkTimer = setTimeout(
            function () {
                checkProduct();
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

        setTimeout(
            checkProduct,
            1000
        );

        setTimeout(
            checkProduct,
            2500
        );

        setTimeout(
            checkProduct,
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
