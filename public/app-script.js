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

                    if (
                        value !== undefined &&
                        value !== null &&
                        String(value).trim()
                    ) {
                        merchantId =
                            String(value).trim();

                        return merchantId;
                    }
                } catch (error) {}
            }
        }

        try {
            const url =
                new URL(window.location.href);

            const queryMerchantId =
                url.searchParams.get('merchant_id') ||
                url.searchParams.get('store_id');

            if (queryMerchantId) {
                merchantId =
                    queryMerchantId.trim();

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

        const currentMerchantId =
            getMerchantId();

        if (!currentMerchantId) {
            settings = {
                connected: false,
                whatsappNumber: '',
                customMessage: DEFAULT_MESSAGE
            };

            return settings;
        }

        settingsPromise = fetch(
            `${API_BASE}/api/settings?merchant_id=${encodeURIComponent(
                currentMerchantId
            )}`,
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
                        'Failed to load settings'
                    );
                }

                return response.json();
            })
            .then((data) => {
                settings = {
                    connected:
                        Boolean(
                            data &&
                            data.connected
                        ),

                    whatsappNumber:
                        data &&
                        data.whatsappNumber
                            ? String(
                                data.whatsappNumber
                            ).trim()
                            : '',

                    customMessage:
                        data &&
                        data.customMessage
                            ? String(
                                data.customMessage
                            )
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
        if (
            !element ||
            element.nodeType !== 1
        ) {
            return false;
        }

        const tagName =
            element.tagName.toLowerCase();

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

        return id
            ? String(id).trim()
            : null;
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
            const parsedUrl =
                new URL(
                    url,
                    window.location.origin
                );

            const path =
                decodeURIComponent(
                    parsedUrl.pathname
                );

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
            return new URL(
                url,
                window.location.origin
            ).href;
        } catch (error) {
            return String(url);
        }
    }


    function isCurrentProductPage(productId) {
        if (!productId) {
            return false;
        }

        return isProductUrl(
            window.location.href,
            productId
        );
    }


    function findProductLink(productButton) {
        const productId =
            getProductId(productButton);

        if (!productId) {
            return null;
        }

        let current =
            productButton;

        for (
            let level = 0;
            level < 18 && current;
            level++
        ) {
            const links =
                Array.from(
                    current.querySelectorAll('a[href]')
                );

            const matchingLink =
                links.find((link) =>
                    isProductUrl(
                        link.href,
                        productId
                    )
                );

            if (matchingLink) {
                return matchingLink;
            }

            current =
                current.parentElement;
        }

        const allLinks =
            Array.from(
                document.querySelectorAll('a[href]')
            );

        const globalLink =
            allLinks.find((link) =>
                isProductUrl(
                    link.href,
                    productId
                )
            );

        if (globalLink) {
            return globalLink;
        }

        return null;
    }


    function findProductContainer(productButton) {
        const productId =
            getProductId(productButton);

        if (!productId) {
            return (
                productButton.parentElement ||
                document
            );
        }

        let current =
            productButton;

        for (
            let level = 0;
            level < 18 && current;
            level++
        ) {
            const buttons =
                Array.from(
                    current.querySelectorAll(
                        'salla-button[product-id], ' +
                        'salla-button[data-product-id], ' +
                        'salla-add-product-button[product-id], ' +
                        'salla-add-product-button[data-product-id]'
                    )
                );

            const sameProductButtons =
                buttons.filter(
                    (button) =>
                        getProductId(button) === productId
                );

            if (
                sameProductButtons.length === 1 &&
                sameProductButtons[0] === productButton
            ) {
                return current;
            }

            current =
                current.parentElement;
        }

        return (
            productButton.parentElement ||
            document
        );
    }


    function getProductName(
        productButton,
        productLink
    ) {
        const productId =
            getProductId(productButton);

        if (!productId) {
            return '';
        }

        if (productLink) {
            const text =
                productLink.textContent
                    ? productLink.textContent.trim()
                    : '';

            if (text) {
                return text;
            }
        }

        if (
            isCurrentProductPage(productId)
        ) {
            try {
                const config =
                    getSallaConfig();

                if (config) {
                    const pageTitle =
                        config.get('page.title');

                    if (
                        pageTitle !== undefined &&
                        pageTitle !== null &&
                        String(pageTitle).trim()
                    ) {
                        return String(
                            pageTitle
                        ).trim();
                    }
                }
            } catch (error) {}

            const heading =
                document.querySelector('h1') ||
                document.querySelector(
                    '[data-product-title]'
                );

            if (
                heading &&
                heading.textContent.trim()
            ) {
                return heading.textContent.trim();
            }
        }

        const container =
            findProductContainer(
                productButton
            );

        if (container) {
            const titleElement =
                container.querySelector(
                    '.product-title'
                ) ||
                container.querySelector(
                    '.product-name'
                ) ||
                container.querySelector(
                    '[data-product-title]'
                );

            if (
                titleElement &&
                titleElement.textContent.trim()
            ) {
                return titleElement.textContent.trim();
            }
        }

        return '';
    }


    /*
     * السعر مستقل تمامًا عن المتغيرات.
     *
     * الأولوية:
     * 1- amount لو موجود.
     * 2- سعر داخل نفس كارت المنتج.
     *
     * getSelectedOptions() لا علاقة له بالسعر.
     */
    function getProductPrice(productButton) {
        if (!productButton) {
            return '';
        }

        const amount =
            productButton.getAttribute('amount');

        if (
            amount !== null &&
            String(amount).trim()
        ) {
            return String(amount).trim();
        }

        const container =
            findProductContainer(
                productButton
            );

        if (!container) {
            return '';
        }

        const priceSelectors = [
            '[data-product-price]',
            '[data-price]',
            '.product-price',
            '.price',
            'salla-price'
        ];

        for (
            const selector of priceSelectors
        ) {
            const elements =
                Array.from(
                    container.querySelectorAll(
                        selector
                    )
                );

            for (
                const element of elements
            ) {
                const text =
                    element.textContent
                        ? element.textContent.trim()
                        : '';

                if (text) {
                    return text;
                }
            }
        }

        return '';
    }


    function getProductUrl(
        productButton,
        productLink
    ) {
        const productId =
            getProductId(productButton);

        if (!productId) {
            return '';
        }

        if (productLink) {
            return normalizeUrl(
                productLink.href
            );
        }

        if (
            isCurrentProductPage(productId)
        ) {
            return normalizeUrl(
                window.location.href
            );
        }

        return '';
    }


    function isOutOfStock(productButton) {
        if (!productButton) {
            return false;
        }

        const status =
            getProductStatus(productButton);

        if (status) {
            return OUT_OF_STOCK_STATUSES.has(
                status
            );
        }

        const disabled =
            productButton.hasAttribute('disabled') ||
            productButton.getAttribute(
                'aria-disabled'
            ) === 'true';

        const text = (
            productButton.textContent || ''
        )
            .trim()
            .toLowerCase();

        const stockText =
            text.includes('نفدت') ||
            text.includes('غير متوفر') ||
            text.includes('out of stock') ||
            text.includes('sold out');

        return disabled && stockText;
    }
        /*
     * المتغيرات تُقرأ فقط في صفحة المنتج.
     *
     * الرئيسية والأقسام والبحث:
     * لا نطلب وجود أي options.
     */
    function getSelectedOptions(productButton) {
        const productId =
            getProductId(productButton);

        if (!productId) {
            return [];
        }

        if (
            !isCurrentProductPage(productId)
        ) {
            return [];
        }

        const selects =
            Array.from(
                document.querySelectorAll(
                    'select[name^="options["]'
                )
            );

        const selectedOptions = [];

        for (const select of selects) {
            const selectedOption =
                select.options &&
                select.options[
                    select.selectedIndex
                ];

            if (!selectedOption) {
                continue;
            }

            const value =
                String(
                    selectedOption.value || ''
                ).trim();

            const text =
                String(
                    selectedOption.textContent || ''
                ).trim();

            if (!value || !text) {
                continue;
            }

            if (
                text === 'اختر' ||
                text.toLowerCase() === 'choose'
            ) {
                continue;
            }

            let label = '';

            if (select.id) {
                try {
                    const labelElement =
                        document.querySelector(
                            `label[for="${CSS.escape(
                                select.id
                            )}"]`
                        );

                    if (labelElement) {
                        label =
                            labelElement.textContent.trim();
                    }
                } catch (error) {}
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
            lines.push(
                `المنتج: ${productName}`
            );
        }

        if (productPrice) {
            lines.push(
                `السعر: ${productPrice}`
            );
        }

        /*
         * الاختيارات إضافة فقط في صفحة المنتج.
         */
        if (
            Array.isArray(selectedOptions) &&
            selectedOptions.length > 0
        ) {
            lines.push('');
            lines.push('الاختيارات:');

            selectedOptions.forEach(
                (option) => {
                    if (option.label) {
                        lines.push(
                            `${option.label}: ${option.value}`
                        );
                    } else {
                        lines.push(
                            option.value
                        );
                    }
                }
            );
        }

        if (productUrl) {
            lines.push(
                `الرابط: ${productUrl}`
            );
        }

        const cleanNumber =
            String(
                whatsappNumber || ''
            ).replace(/\D/g, '');

        return (
            `https://wa.me/${cleanNumber}?text=` +
            encodeURIComponent(
                lines.join('\n')
            )
        );
    }


    function createWhatsAppIcon() {
        const wrapper =
            document.createElement('span');

        wrapper.innerHTML = `
            <svg
                viewBox="0 0 32 32"
                width="20"
                height="20"
                aria-hidden="true"
                focusable="false"
                style="
                    display:block;
                    width:20px;
                    height:20px;
                    flex:0 0 20px;
                "
            >
                <path
                    fill="currentColor"
                    d="M19.11 17.19c-.27-.14-1.61-.79-1.86-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.71-1.34-1.59-1.5-1.86-.16-.27-.02-.42.12-.56.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.29s.98 2.66 1.11 2.84c.14.18 1.93 2.95 4.68 4.14.65.28 1.16.45 1.56.58.66.21 1.26.18 1.73.11.53-.08 1.61-.66 1.84-1.3.23-.64.23-1.19.16-1.3-.07-.11-.25-.18-.52-.32z"
                />
                <path
                    fill="currentColor"
                    d="M16.03 3.2c-7.07 0-12.82 5.75-12.82 12.82 0 2.26.59 4.39 1.63 6.24L3.1 28.8l6.73-1.7a12.77 12.77 0 0 0 6.2 1.59h.01c7.07 0 12.82-5.75 12.82-12.82S23.1 3.2 16.03 3.2zm0 23.35h-.01a10.5 10.5 0 0 1-5.35-1.47l-.38-.23-3.99 1.01 1.06-3.89-.25-.4a10.48 10.48 0 1 1 8.92 4.98zm5.76-7.86c-.31-.15-1.83-.9-2.11-1-.28-.1-.49-.15-.69.15-.2.3-.79 1-.97 1.2-.18.2-.36.22-.67.07-.31-.15-1.3-.48-2.48-1.53-.92-.82-1.54-1.83-1.72-2.14-.18-.31-.02-.48.14-.63.14-.14.31-.36.46-.54.15-.18.2-.31.31-.51.1-.2.05-.38-.03-.53-.08-.15-.69-1.67-.95-2.29-.25-.61-.51-.53-.69-.54h-.59c-.2 0-.53.08-.81.38-.28.31-1.07 1.05-1.07 2.57 0 1.51 1.1 2.97 1.25 3.17.15.2 2.17 3.31 5.26 4.64.74.32 1.31.51 1.76.65.74.24 1.41.2 1.94.12.59-.09 1.83-.75 2.09-1.47.26-.72.26-1.34.18-1.47-.08-.13-.28-.2-.59-.36z"
                />
            </svg>
        `;

        return wrapper.firstElementChild;
    }


    function findWhatsAppButton(
        productButton,
        productId
    ) {
        if (
            !productButton ||
            !productId
        ) {
            return null;
        }

        let current =
            productButton.parentElement;

        for (
            let level = 0;
            level < 12 && current;
            level++
        ) {
            const buttons =
                Array.from(
                    current.querySelectorAll(
                        `a[data-${BUTTON_MARKER}="${CSS.escape(
                            productId
                        )}"]`
                    )
                );

            if (buttons.length > 0) {
                const first =
                    buttons[0];

                buttons.slice(1).forEach(
                    (button) => {
                        button.remove();
                    }
                );

                return first;
            }

            current =
                current.parentElement;
        }

        return null;
    }


    function createWhatsAppButton(
        productButton,
        productId,
        whatsappUrl
    ) {
        if (
            !productButton ||
            !productId ||
            !whatsappUrl
        ) {
            return null;
        }

        const existingButton =
            findWhatsAppButton(
                productButton,
                productId
            );

        if (existingButton) {
            existingButton.href =
                whatsappUrl;

            /*
             * لو الزر موجود بالفعل،
             * نتأكد أنه يأخذ مكانه تحت زر سلة.
             */
            const parent =
                productButton.parentElement;

            if (
                parent &&
                existingButton.parentElement !== parent
            ) {
                parent.appendChild(
                    existingButton
                );
            }

            existingButton.style.display =
                'flex';

            existingButton.style.width =
                '100%';

            existingButton.style.flex =
                '0 0 100%';

            existingButton.style.boxSizing =
                'border-box';

            existingButton.style.clear =
                'both';

            return existingButton;
        }

        const button =
            document.createElement('a');

        button.href =
            whatsappUrl;

        button.target =
            '_blank';

        button.rel =
            'noopener noreferrer';

        button.setAttribute(
            `data-${BUTTON_MARKER}`,
            productId
        );

        button.setAttribute(
            'aria-label',
            'أبلغني عبر واتساب عند التوفر'
        );

        const icon =
            createWhatsAppIcon();

        const text =
            document.createElement('span');

        text.textContent =
            'أبلغني عبر واتساب عند التوفر';

        button.appendChild(icon);
        button.appendChild(text);

        /*
         * مهم:
         * flex: 0 0 100%
         * يجبر الزر يأخذ سطر كامل حتى لو
         * حاوية منتجات الرئيسية تستخدم flex.
         */
        button.style.display =
            'flex';

        button.style.alignItems =
            'center';

        button.style.justifyContent =
            'center';

        button.style.gap =
            '8px';

        button.style.width =
            '100%';

        button.style.flex =
            '0 0 100%';

        button.style.minHeight =
            '44px';

        button.style.marginTop =
            '8px';

        button.style.padding =
            '10px 16px';

        button.style.borderRadius =
            '8px';

        button.style.border =
            '1px solid #25D366';

        button.style.background =
            '#25D366';

        button.style.color =
            '#fff';

        button.style.textDecoration =
            'none';

        button.style.fontSize =
            '14px';

        button.style.fontWeight =
            '600';

        button.style.lineHeight =
            '1.4';

        button.style.boxSizing =
            'border-box';

        button.style.cursor =
            'pointer';

        button.style.transition =
            'opacity 0.2s ease';

        button.addEventListener(
            'mouseenter',
            () => {
                button.style.opacity =
                    '0.9';
            }
        );

        button.addEventListener(
            'mouseleave',
            () => {
                button.style.opacity =
                    '1';
            }
        );

        /*
         * بدل afterend:
         * نضع الزر داخل نفس الحاوية
         * الموجودة حول زر سلة.
         */
        const parent =
            productButton.parentElement;

        if (parent) {
            parent.appendChild(
                button
            );
        } else {
            productButton.insertAdjacentElement(
                'afterend',
                button
            );
        }

        return button;
    }


    function removeWhatsAppButton(
        productButton,
        productId
    ) {
        if (
            !productButton ||
            !productId
        ) {
            return;
        }

        let current =
            productButton.parentElement;

        for (
            let level = 0;
            level < 12 && current;
            level++
        ) {
            const buttons =
                Array.from(
                    current.querySelectorAll(
                        `a[data-${BUTTON_MARKER}="${CSS.escape(
                            productId
                        )}"]`
                    )
                );

            if (buttons.length > 0) {
                buttons.forEach(
                    (button) => {
                        button.remove();
                    }
                );

                return;
            }

            current =
                current.parentElement;
        }
    }
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

        if (
            !document.documentElement.contains(
                productButton
            )
        ) {
            return;
        }

        if (
            processingProducts.has(
                productButton
            )
        ) {
            return;
        }

        processingProducts.add(
            productButton
        );

        try {
            const productId =
                getProductId(
                    productButton
                );

            if (!productId) {
                return;
            }

            const currentSettings =
                await loadSettings();

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

            /*
             * بيانات المنتج الأساسية مستقلة
             * تمامًا عن المتغيرات.
             */
            const productLink =
                findProductLink(
                    productButton
                );

            const productName =
                getProductName(
                    productButton,
                    productLink
                );

            const productPrice =
                getProductPrice(
                    productButton
                );

            const productUrl =
                getProductUrl(
                    productButton,
                    productLink
                );

            /*
             * المتغيرات إضافة اختيارية فقط
             * في صفحة المنتج.
             */
            const selectedOptions =
                getSelectedOptions(
                    productButton
                );

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
            processingProducts.delete(
                productButton
            );
        }
    }


    function findProductButtons(root) {
        const buttons = [];

        if (!root) {
            return buttons;
        }

        if (
            root.nodeType === 1 &&
            isProductButton(root)
        ) {
            buttons.push(root);
        }

        if (root.querySelectorAll) {
            const found =
                root.querySelectorAll(
                    'salla-button[product-id], ' +
                    'salla-button[data-product-id], ' +
                    'salla-add-product-button[product-id], ' +
                    'salla-add-product-button[data-product-id]'
                );

            found.forEach(
                (button) => {
                    if (
                        isProductButton(
                            button
                        )
                    ) {
                        buttons.push(
                            button
                        );
                    }
                }
            );
        }

        return buttons;
    }


    function processButtonsInNode(node) {
        const buttons =
            findProductButtons(node);

        buttons.forEach(
            (button) => {
                processProduct(
                    button
                );
            }
        );
    }


    function scanProducts() {
        processButtonsInNode(
            document
        );
    }


    /*
     * عند تغيير المقاس أو اللون:
     * نحدث رابط واتساب في صفحة المنتج فقط.
     */
    document.addEventListener(
        'change',
        (event) => {
            const target =
                event.target;

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

            const productButtons =
                findProductButtons(
                    document
                );

            const productButton =
                productButtons.find(
                    (button) => {
                        const id =
                            getProductId(
                                button
                            );

                        return (
                            id &&
                            isCurrentProductPage(
                                id
                            )
                        );
                    }
                );

            if (productButton) {
                processProduct(
                    productButton
                );
            }
        },
        true
    );


    const observer =
        new MutationObserver(
            (mutations) => {
                for (
                    const mutation of mutations
                ) {
                    if (
                        mutation.type ===
                        'childList'
                    ) {
                        mutation.addedNodes.forEach(
                            (node) => {
                                if (
                                    node.nodeType ===
                                    1
                                ) {
                                    processButtonsInNode(
                                        node
                                    );
                                }
                            }
                        );
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
