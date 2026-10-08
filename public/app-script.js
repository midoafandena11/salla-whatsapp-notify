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

    // يمنع تشغيل نفس المنتج مرتين في نفس اللحظة
    // بسبب MutationObserver أو أكثر من حدث يصل في نفس الوقت.
    const processingProducts = new WeakSet();


    function getSallaConfig() {
        try {
            if (
                window.salla &&
                window.salla.config &&
                typeof window.salla.config.get === 'function'
            ) {
                return window.salla.config;
            }
        } catch (error) {}

        return null;
    }


    function getMerchantId() {
        if (merchantId) {
            return merchantId;
        }

        const config = getSallaConfig();

        if (config) {
            const possibleKeys = [
                'store.id',
                'store_id',
                'merchant.id',
                'merchant_id'
            ];

            for (const key of possibleKeys) {
                try {
                    const value = config.get(key);

                    if (value !== undefined && value !== null && String(value).trim()) {
                        merchantId = String(value).trim();
                        return merchantId;
                    }
                } catch (error) {}
            }
        }

        try {
            const url = new URL(window.location.href);

            const queryMerchantId =
                url.searchParams.get('merchant_id') ||
                url.searchParams.get('store_id');

            if (queryMerchantId) {
                merchantId = queryMerchantId.trim();
                return merchantId;
            }
        } catch (error) {}

        return null;
    }


    async function loadSettings() {
        if (settings) {
            return settings;
        }

        if (settingsPromise) {
            return settingsPromise;
        }

        const currentMerchantId = getMerchantId();

        if (!currentMerchantId) {
            settings = {
                connected: false,
                whatsappNumber: '',
                customMessage: DEFAULT_MESSAGE
            };

            return settings;
        }

        settingsPromise = fetch(
            `${API_BASE}/api/settings?merchant_id=${encodeURIComponent(currentMerchantId)}`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            }
        )
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error('Failed to load settings');
                }

                return response.json();
            })
            .then((data) => {
                settings = {
                    connected: Boolean(data && data.connected),
                    whatsappNumber:
                        data && data.whatsappNumber
                            ? String(data.whatsappNumber).trim()
                            : '',
                    customMessage:
                        data && data.customMessage
                            ? String(data.customMessage)
                            : DEFAULT_MESSAGE
                };

                return settings;
            })
            .catch(() => {
                settings = {
                    connected: false,
                    whatsappNumber: '',
                    customMessage: DEFAULT_MESSAGE
                };

                return settings;
            });

        return settingsPromise;
    }


    function isProductButton(element) {
        if (!element || element.nodeType !== 1) {
            return false;
        }

        const tagName = element.tagName.toLowerCase();

        if (
            tagName !== 'salla-button' &&
            tagName !== 'salla-add-product-button'
        ) {
            return false;
        }

        const productId =
            element.getAttribute('product-id') ||
            element.getAttribute('data-product-id');

        return Boolean(productId);
    }


    function getProductId(productButton) {
        if (!productButton) {
            return null;
        }

        const id =
            productButton.getAttribute('product-id') ||
            productButton.getAttribute('data-product-id');

        if (!id) {
            return null;
        }

        return String(id).trim();
    }


    function getProductStatus(productButton) {
        if (!productButton) {
            return '';
        }

        const status =
            productButton.getAttribute('product-status') ||
            productButton.getAttribute('data-product-status');

        return status
            ? String(status).trim().toLowerCase()
            : '';
    }


    function isProductUrl(url, productId) {
        if (!url || !productId) {
            return false;
        }

        try {
            const parsedUrl = new URL(url, window.location.origin);
            const path = decodeURIComponent(parsedUrl.pathname);

            return (
                path.includes(`/p${productId}`) ||
                path.endsWith(`/p${productId}`) ||
                path.includes(`/p${productId}/`)
            );
        } catch (error) {
            return false;
        }
    }


    function normalizeUrl(url) {
        if (!url) {
            return '';
        }

        try {
            return new URL(url, window.location.origin).href;
        } catch (error) {
            return String(url);
        }
    }


    function findProductContext(productButton) {
        const productId = getProductId(productButton);

        if (!productId) {
            return {
                container: productButton.parentElement || document,
                productLink: null
            };
        }

        let current = productButton;

        for (let level = 0; level < 14 && current; level++) {
            const links = Array.from(
                current.querySelectorAll('a[href]')
            );

            const matchingLinks = links.filter((link) => {
                return isProductUrl(link.href, productId);
            });

            if (matchingLinks.length > 0) {
                const sameProductButtons = Array.from(
                    current.querySelectorAll(
                        'salla-button[product-id], ' +
                        'salla-button[data-product-id], ' +
                        'salla-add-product-button[product-id], ' +
                        'salla-add-product-button[data-product-id]'
                    )
                ).filter((button) => {
                    return getProductId(button) === productId;
                });

                if (
                    sameProductButtons.length === 1 &&
                    sameProductButtons[0] === productButton
                ) {
                    return {
                        container: current,
                        productLink: matchingLinks[0]
                    };
                }
            }

            current = current.parentElement;
        }

        // في صفحة المنتج نفسها، الرابط الحالي هو رابط المنتج
        if (isProductUrl(window.location.href, productId)) {
            return {
                container: productButton.closest('form') ||
                    productButton.parentElement ||
                    document,
                productLink: null
            };
        }

        return {
            container: productButton.parentElement || document,
            productLink: null
        };
    }


    function getProductName(productButton, context) {
        const productId = getProductId(productButton);

        if (!productId) {
            return '';
        }

        if (context && context.productLink) {
            const linkText = context.productLink.textContent
                ? context.productLink.textContent.trim()
                : '';

            if (linkText) {
                return linkText;
            }
        }

        // صفحة المنتج
        if (isProductUrl(window.location.href, productId)) {
            try {
                const config = getSallaConfig();

                if (config) {
                    const pageTitle = config.get('page.title');

                    if (
                        pageTitle !== undefined &&
                        pageTitle !== null &&
                        String(pageTitle).trim()
                    ) {
                        return String(pageTitle).trim();
                    }
                }
            } catch (error) {}

            const heading =
                document.querySelector('h1') ||
                document.querySelector('[data-product-title]');

            if (heading && heading.textContent.trim()) {
                return heading.textContent.trim();
            }
        }

        if (context && context.container) {
            const titleElement =
                context.container.querySelector('.product-title') ||
                context.container.querySelector('.product-name') ||
                context.container.querySelector('[data-product-title]');

            if (titleElement && titleElement.textContent.trim()) {
                return titleElement.textContent.trim();
            }
        }

        return '';
    }


    function getProductPrice(productButton, context) {
        if (!productButton) {
            return '';
        }

        // amount الموجود على زر سلة هو السعر الفعلي للبيع
        // كما يظهر في DOM للمنتج.
        const amount = productButton.getAttribute('amount');

        if (amount !== null && String(amount).trim()) {
            return String(amount).trim();
        }

        if (context && context.container) {
            const priceElement =
                context.container.querySelector(
                    '[data-product-price]'
                ) ||
                context.container.querySelector(
                    '.product-price'
                ) ||
                context.container.querySelector(
                    '.price'
                );

            if (priceElement && priceElement.textContent.trim()) {
                return priceElement.textContent.trim();
            }
        }

        return '';
    }


    function getProductUrl(productButton, context) {
        const productId = getProductId(productButton);

        if (!productId) {
            return '';
        }

        if (context && context.productLink) {
            return normalizeUrl(context.productLink.href);
        }

        if (isProductUrl(window.location.href, productId)) {
            return normalizeUrl(window.location.href);
        }

        return '';
    }


    function isOutOfStock(productButton) {
        if (!productButton) {
            return false;
        }

        const status = getProductStatus(productButton);

        // product-status هو الإشارة الأساسية من سلة
        if (status) {
            return OUT_OF_STOCK_STATUSES.has(status);
        }

        // احتياط فقط إذا لم يكن product-status موجودًا
        const disabled =
            productButton.hasAttribute('disabled') ||
            productButton.getAttribute('aria-disabled') === 'true';

        const text = (
            productButton.textContent ||
            ''
        ).trim().toLowerCase();

        const stockText =
            text.includes('نفدت') ||
            text.includes('غير متوفر') ||
            text.includes('out of stock') ||
            text.includes('sold out');

        return disabled && stockText;
    }


    /*
     * يقرأ الاختيارات المحددة حاليًا من نفس سياق المنتج.
     *
     * مثال DOM:
     * <select name="options[...]">
     *   <option value="">اختر</option>
     *   <option value="...">44 - XL</option>
     * </select>
     *
     * لا توجد أي قيمة ثابتة هنا.
     */
    function getSelectedOptions(context) {
        if (!context || !context.container) {
            return [];
        }

        const selects = Array.from(
            context.container.querySelectorAll(
                'select[name^="options["]'
            )
        );

        const selectedOptions = [];

        for (const select of selects) {
            const selectedOption =
                select.options &&
                select.options[select.selectedIndex];

            if (!selectedOption) {
                continue;
            }

            const value = String(
                selectedOption.value || ''
            ).trim();

            const text = String(
                selectedOption.textContent || ''
            ).trim();

            if (!value || !text) {
                continue;
            }

            // تجاهل الخيار الافتراضي
            if (
                text === 'اختر' ||
                text.toLowerCase() === 'choose'
            ) {
                continue;
            }

            let label = '';

            if (select.id) {
                const labelElement = document.querySelector(
                    `label[for="${CSS.escape(select.id)}"]`
                );

                if (labelElement) {
                    label = labelElement.textContent.trim();
                }
            }

            selectedOptions.push({
                label: label,
                value: text
            });
        }

        return selectedOptions;
    }


    function buildWhatsAppUrl(
        whatsappNumber,
        customMessage,
        productName,
        productPrice,
        productUrl,
        selectedOptions
    ) {
        const lines = [];

        const message =
            customMessage &&
            String(customMessage).trim()
                ? String(customMessage).trim()
                : DEFAULT_MESSAGE;

        lines.push(message);

        if (productName) {
            lines.push(`المنتج: ${productName}`);
        }

        if (productPrice) {
            lines.push(`السعر: ${productPrice}`);
        }

        if (
            Array.isArray(selectedOptions) &&
            selectedOptions.length > 0
        ) {
            lines.push('');
            lines.push('الاختيارات:');

            for (const option of selectedOptions) {
                if (option.label) {
                    lines.push(
                        `${option.label}: ${option.value}`
                    );
                } else {
                    lines.push(option.value);
                }
            }
        }

        if (productUrl) {
            lines.push(`الرابط: ${productUrl}`);
        }

        const encodedMessage = encodeURIComponent(
            lines.join('\n')
        );

        const cleanNumber = String(
            whatsappNumber || ''
        ).replace(/\D/g, '');

        return `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
    }
        function createWhatsAppButton(
        productButton,
        productId,
        whatsappUrl
    ) {
        if (!productButton || !productId || !whatsappUrl) {
            return null;
        }

        // نبحث فقط بجوار زر نفس المنتج.
        const existingButton =
            productButton.parentElement &&
            productButton.parentElement.querySelector(
                `a[data-${BUTTON_MARKER}="${CSS.escape(productId)}"]`
            );

        if (existingButton) {
            existingButton.href = whatsappUrl;
            return existingButton;
        }

        const button = document.createElement('a');

        button.href = whatsappUrl;
        button.target = '_blank';
        button.rel = 'noopener noreferrer';

        button.setAttribute(
            `data-${BUTTON_MARKER}`,
            productId
        );

        button.textContent = 'أبلغني عبر واتساب عند التوفر';

        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.width = '100%';
        button.style.minHeight = '44px';
        button.style.marginTop = '8px';
        button.style.padding = '10px 16px';
        button.style.borderRadius = '8px';
        button.style.background = '#25D366';
        button.style.color = '#fff';
        button.style.textDecoration = 'none';
        button.style.fontSize = '14px';
        button.style.fontWeight = '600';
        button.style.lineHeight = '1.4';
        button.style.boxSizing = 'border-box';
        button.style.cursor = 'pointer';
        button.style.transition = 'opacity 0.2s ease';

        button.addEventListener('mouseenter', () => {
            button.style.opacity = '0.9';
        });

        button.addEventListener('mouseleave', () => {
            button.style.opacity = '1';
        });

        // نحطه مباشرة تحت زر سلة.
        productButton.insertAdjacentElement(
            'afterend',
            button
        );

        return button;
    }


    function removeWhatsAppButton(productButton, productId) {
        if (!productButton || !productId) {
            return;
        }

        const parent = productButton.parentElement;

        if (!parent) {
            return;
        }

        const existingButtons = parent.querySelectorAll(
            `a[data-${BUTTON_MARKER}="${CSS.escape(productId)}"]`
        );

        existingButtons.forEach((button) => {
            button.remove();
        });
    }


    async function processProduct(productButton) {
        if (!isProductButton(productButton)) {
            return;
        }

        if (!document.documentElement.contains(productButton)) {
            return;
        }

        /*
         * مهم جدًا:
         * نضع المنتج في WeakSet قبل await.
         *
         * السبب أن loadSettings() فيها await،
         * والـ MutationObserver ممكن يشغل نفس المنتج مرة ثانية
         * قبل انتهاء المرة الأولى.
         */
        if (processingProducts.has(productButton)) {
            return;
        }

        processingProducts.add(productButton);

        try {
            const productId = getProductId(productButton);

            if (!productId) {
                return;
            }

            const currentSettings = await loadSettings();

            if (
                !currentSettings ||
                !currentSettings.connected ||
                !currentSettings.whatsappNumber
            ) {
                removeWhatsAppButton(
                    productButton,
                    productId
                );

                return;
            }

            if (!isOutOfStock(productButton)) {
                removeWhatsAppButton(
                    productButton,
                    productId
                );

                return;
            }

            const context =
                findProductContext(productButton);

            const productName =
                getProductName(
                    productButton,
                    context
                );

            const productPrice =
                getProductPrice(
                    productButton,
                    context
                );

            const productUrl =
                getProductUrl(
                    productButton,
                    context
                );

            // يتم قراءتها من DOM الفعلي للمنتج.
            const selectedOptions =
                getSelectedOptions(context);

            const whatsappUrl =
                buildWhatsAppUrl(
                    currentSettings.whatsappNumber,
                    currentSettings.customMessage,
                    productName,
                    productPrice,
                    productUrl,
                    selectedOptions
                );

            createWhatsAppButton(
                productButton,
                productId,
                whatsappUrl
            );

        } catch (error) {
            console.error(
                '[Salla WhatsApp Notify]',
                error
            );
        } finally {
            processingProducts.delete(productButton);
        }
    }


    function findProductButtons(root) {
        const buttons = [];

        if (!root) {
            return buttons;
        }

        if (root.nodeType === 1 && isProductButton(root)) {
            buttons.push(root);
        }

        if (
            root.querySelectorAll
        ) {
            const found =
                root.querySelectorAll(
                    'salla-button[product-id], ' +
                    'salla-button[data-product-id], ' +
                    'salla-add-product-button[product-id], ' +
                    'salla-add-product-button[data-product-id]'
                );

            found.forEach((button) => {
                if (isProductButton(button)) {
                    buttons.push(button);
                }
            });
        }

        return buttons;
    }


    function processButtonsInNode(node) {
        const buttons = findProductButtons(node);

        buttons.forEach((button) => {
            processProduct(button);
        });
    }


    function scanProducts() {
        processButtonsInNode(document);
    }


    /*
     * لو العميل غيّر المقاس/اللون:
     * نعيد بناء رابط واتساب للمنتج نفسه،
     * بحيث الرسالة تحمل الاختيار الجديد.
     */
    document.addEventListener(
        'change',
        (event) => {
            const target = event.target;

            if (
                !target ||
                target.nodeType !== 1
            ) {
                return;
            }

            if (
                !target.matches(
                    'select[name^="options["]'
                )
            ) {
                return;
            }

            let current = target;

            for (let i = 0; i < 14 && current; i++) {
                const productButtons =
                    current.querySelectorAll
                        ? Array.from(
                            current.querySelectorAll(
                                'salla-button[product-id], ' +
                                'salla-button[data-product-id], ' +
                                'salla-add-product-button[product-id], ' +
                                'salla-add-product-button[data-product-id]'
                            )
                        )
                        : [];

                const matchingButton =
                    productButtons.find(
                        (button) =>
                            isProductButton(button)
                    );

                if (matchingButton) {
                    processProduct(
                        matchingButton
                    );

                    return;
                }

                current = current.parentElement;
            }
        },
        true
    );


    const observer =
        new MutationObserver((mutations) => {
            for (const mutation of mutations) {

                if (
                    mutation.type === 'childList'
                ) {
                    mutation.addedNodes.forEach(
                        (node) => {
                            if (
                                node.nodeType === 1
                            ) {
                                processButtonsInNode(
                                    node
                                );
                            }
                        }
                    );
                }

                if (
                    mutation.type === 'attributes'
                ) {
                    const target =
                        mutation.target;

                    if (
                        isProductButton(target)
                    ) {
                        processProduct(target);
                    }
                }
            }
        });


    function start() {
        scanProducts();

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    'product-status',
                    'data-product-status',
                    'product-id',
                    'data-product-id',
                    'amount',
                    'disabled',
                    'aria-disabled'
                ]
            }
        );
    }


    if (
        document.readyState === 'loading'
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
