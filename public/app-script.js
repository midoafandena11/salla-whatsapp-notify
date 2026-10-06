(function () {
    'use strict';

    const API_BASE =
        'https://salla-whatsapp-notify.onrender.com';

    const BUTTON_ID =
        'salla-whatsapp-notify-btn';

    let settingsLoaded = false;
    let settingsPromise = null;
    let lastUrl = window.location.href;

    // =========================
    // Merchant ID
    // =========================

    function getMerchantId() {
        try {
            const params =
                new URLSearchParams(window.location.search);

            let merchantId =
                params.get('merchant_id');

            if (
                !merchantId &&
                typeof salla !== 'undefined' &&
                salla.config &&
                typeof salla.config.get === 'function'
            ) {
                merchantId =
                    salla.config.get('store.id');
            }

            return merchantId
                ? String(merchantId)
                : null;

        } catch (error) {
            console.error(
                '[WhatsApp Notify] Merchant ID error:',
                error
            );

            return null;
        }
    }

    // =========================
    // Salla Add To Cart Button
    // =========================

    function getSallaButton() {
        return document.querySelector(
            'salla-add-to-cart-button'
        );
    }

    // =========================
    // Out Of Stock Detection
    // =========================

    function isOutOfStock(button) {
        if (!button) {
            return false;
        }

        // خصائص Salla
        if (button.hasAttribute('out-of-stock')) {
            return true;
        }

        if (
            button.getAttribute(
                'is-out-of-stock'
            ) !== null
        ) {
            return true;
        }

        if (button.hasAttribute('disabled')) {
            return true;
        }

        // النص داخل Shadow DOM
        try {
            if (button.shadowRoot) {
                const shadowText =
                    button.shadowRoot.textContent || '';

                if (
                    shadowText.includes('نفدت الكمية') ||
                    shadowText.includes('غير متوفر') ||
                    shadowText.includes('نفد')
                ) {
                    return true;
                }
            }
        } catch (error) {
            // تجاهل الخطأ
        }

        // النص داخل العنصر نفسه
        const text =
            button.innerText ||
            button.textContent ||
            '';

        if (
            text.includes('نفدت الكمية') ||
            text.includes('غير متوفر') ||
            text.includes('نفد')
        ) {
            return true;
        }

        return false;
    }

    // =========================
    // Remove Button
    // =========================

    function removeNotifyButton() {
        const button =
            document.getElementById(BUTTON_ID);

        if (button) {
            button.remove();
        }
    }

    // =========================
    // Product Name
    // =========================

    function getProductName() {
        const selectors = [
            'h1',
            '[data-product-name]',
            '.product-title'
        ];

        for (const selector of selectors) {
            const element =
                document.querySelector(selector);

            if (
                element &&
                element.innerText &&
                element.innerText.trim()
            ) {
                return element.innerText.trim();
            }
        }

        return '';
    }

    // =========================
    // Load Merchant Settings
    // =========================

    async function loadSettings() {
        if (settingsLoaded) {
            return window.__sallaWhatsappSettings || null;
        }

        if (settingsPromise) {
            return settingsPromise;
        }

        const merchantId =
            getMerchantId();

        // بدون merchant ID لا نطلب API
        if (!merchantId) {
            return null;
        }

        const apiUrl =
            `${API_BASE}/api/settings?merchant_id=` +
            encodeURIComponent(merchantId);

        settingsPromise = fetch(apiUrl, {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            }
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(
                        `API error: ${response.status}`
                    );
                }

                return response.json();
            })
            .then((data) => {
                settingsLoaded = true;

                window.__sallaWhatsappSettings =
                    data;

                return data;
            })
            .catch((error) => {
                console.error(
                    '[WhatsApp Notify] Settings error:',
                    error
                );

                return null;
            })
            .finally(() => {
                settingsPromise = null;
            });

        return settingsPromise;
    }

    // =========================
    // WhatsApp Message
    // =========================

    function buildMessage(settings) {
        let message =
            settings.customMessage ||
            'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.';

        const productName =
            getProductName();

        const productUrl =
            window.location.href;

        if (productName) {
            message +=
                `\nالمنتج: ${productName}`;
        }

        message +=
            `\nالرابط: ${productUrl}`;

        return message;
    }

    // =========================
    // Create Button
    // =========================

    function createNotifyButton(
        sallaButton,
        settings
    ) {
        if (!settings) {
            return;
        }

        if (!settings.whatsappNumber) {
            return;
        }

        if (
            document.getElementById(BUTTON_ID)
        ) {
            return;
        }

        const whatsappNumber =
            String(settings.whatsappNumber)
                .replace(/[^\d]/g, '');

        if (!whatsappNumber) {
            return;
        }

        const message =
            buildMessage(settings);

        const button =
            document.createElement('a');

        button.id = BUTTON_ID;

        button.href =
            `https://wa.me/${whatsappNumber}` +
            `?text=${encodeURIComponent(message)}`;

        button.target = '_blank';
        button.rel =
            'noopener noreferrer';

        button.innerText =
            'أعلمني عند التوفر عبر الواتساب';

        Object.assign(button.style, {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            backgroundColor: '#00b074',
            color: '#ffffff',
            padding: '16px 20px',
            marginTop: '12px',
            marginBottom: '12px',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '700',
            lineHeight: '1.4',
            textDecoration: 'none',
            boxSizing: 'border-box',
            textAlign: 'center',
            cursor: 'pointer',
            zIndex: '99999',
            fontFamily: 'inherit'
        });

        sallaButton.insertAdjacentElement(
            'afterend',
            button
        );
    }

    // =========================
    // Main Check
    // =========================

    async function checkProduct() {
        const sallaButton =
            getSallaButton();

        if (!sallaButton) {
            return;
        }

        const outOfStock =
            isOutOfStock(sallaButton);

        // المنتج متوفر
        if (!outOfStock) {
            removeNotifyButton();
            return;
        }

        // الزر موجود بالفعل
        if (
            document.getElementById(BUTTON_ID)
        ) {
            return;
        }

        const settings =
            await loadSettings();

        if (!settings) {
            return;
        }

        // ممكن سلة تكون غيرت العنصر أثناء انتظار API
        const currentButton =
            getSallaButton();

        if (!currentButton) {
            return;
        }

        if (!isOutOfStock(currentButton)) {
            return;
        }

        createNotifyButton(
            currentButton,
            settings
        );
    }

    // =========================
    // Reset For New Product
    // =========================

    function resetForNewPage() {
        removeNotifyButton();

        settingsLoaded = false;
        settingsPromise = null;

        window.__sallaWhatsappSettings =
            null;

        setTimeout(() => {
            checkProduct();
        }, 300);
    }

    // =========================
    // Mutation Observer
    // =========================

    function startObserver() {
        const observer =
            new MutationObserver(() => {
                checkProduct();
            });

        observer.observe(
            document.documentElement,
            {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    'disabled',
                    'out-of-stock',
                    'is-out-of-stock'
                ]
            }
        );
    }

    // =========================
    // SPA URL Monitoring
    // =========================

    function startUrlWatcher() {
        setInterval(() => {
            const currentUrl =
                window.location.href;

            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;

                resetForNewPage();
            }
        }, 1000);
    }

    // =========================
    // Init
    // =========================

    function init() {
        checkProduct();
        startObserver();
        startUrlWatcher();
    }

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            init,
            { once: true }
        );
    } else {
        init();
    }

})();
