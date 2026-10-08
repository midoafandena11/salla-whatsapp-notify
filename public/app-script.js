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

    const processedButtons =
        new WeakSet();

    function getSallaConfig() {
        try {
            return window.salla &&
                window.salla.config
                ? window.salla.config
                : null;
        } catch (error) {
            return null;
        }
    }

    function getMerchantId() {
        if (merchantId) {
            return merchantId;
        }

        const config =
            getSallaConfig();

        if (
            config &&
            config.store &&
            config.store.id
        ) {
            merchantId =
                String(config.store.id);

            return merchantId;
        }

        const htmlMerchantId =
            document.documentElement.getAttribute(
                'data-merchant-id'
            );

        if (htmlMerchantId) {
            merchantId =
                String(htmlMerchantId);

            return merchantId;
        }

        return null;
    }

    async function loadSettings() {
        if (settings) {
            return settings;
        }

        const id =
            getMerchantId();

        if (!id) {
            return {
                whatsappNumber: '',
                customMessage: DEFAULT_MESSAGE
            };
        }

        try {
            const response =
                await fetch(
                    API_BASE +
                    '/api/settings?merchantId=' +
                    encodeURIComponent(id),
                    {
                        method: 'GET',
                        credentials: 'omit',
                        cache: 'no-store'
                    }
                );

            if (!response.ok) {
                throw new Error(
                    'Settings request failed'
                );
            }

            const data =
                await response.json();

            settings = {
                whatsappNumber:
                    data.whatsappNumber
                        ? String(
                            data.whatsappNumber
                        ).trim()
                        : '',

                customMessage:
                    data.customMessage
                        ? String(
                            data.customMessage
                        ).trim()
                        : DEFAULT_MESSAGE
            };

            return settings;

        } catch (error) {
            settings = {
                whatsappNumber: '',
                customMessage: DEFAULT_MESSAGE
            };

            return settings;
        }
    }

    function getProductButtonFromElement(
        element
    ) {
        if (!element) {
            return null;
        }

        if (
            element.matches &&
            (
                element.matches(
                    'salla-button[product-id]'
                ) ||
                element.matches(
                    'salla-button[data-product-id]'
                ) ||
                element.matches(
                    'salla-add-product-button[product-id]'
                ) ||
                element.matches(
                    'salla-add-product-button[data-product-id]'
                )
            )
        ) {
            return element;
        }

        return element.closest
            ? element.closest(
                [
                    'salla-button[product-id]',
                    'salla-button[data-product-id]',
                    'salla-add-product-button[product-id]',
                    'salla-add-product-button[data-product-id]'
                ].join(',')
            )
            : null;
    }

    function getProductId(
        productButton
    ) {
        if (!productButton) {
            return '';
        }

        const id =
            productButton.getAttribute(
                'product-id'
            ) ||
            productButton.getAttribute(
                'data-product-id'
            );

        return id
            ? String(id).trim()
            : '';
    }

    function getProductStatus(
        productButton
    ) {
        if (!productButton) {
            return '';
        }

        const status =
            productButton.getAttribute(
                'product-status'
            ) ||
            productButton.getAttribute(
                'data-product-status'
            );

        return status
            ? String(status)
                .trim()
                .toLowerCase()
            : '';
    }

    function isProductUrl(
        url
    ) {
        if (!url) {
            return false;
        }

        return /\/p\d+(?:[/?#]|$)/i.test(
            url
        );
    }

    function normalizeUrl(
        url
    ) {
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

    function isCurrentProductPage(
        productId
    ) {
        if (!productId) {
            return false;
        }

        const path =
            window.location.pathname;

        const match =
            path.match(
                /\/p(\d+)(?:\/?|$)/i
            );

        if (!match) {
            return false;
        }

        return String(match[1]) ===
            String(productId);
    }

    function findProductLink(
        productButton,
        productId
    ) {
        if (!productButton) {
            return null;
        }

        let current =
            productButton;

        while (
            current &&
            current !== document.body
        ) {
            const links =
                current.querySelectorAll
                    ? Array.from(
                        current.querySelectorAll(
                            'a[href]'
                        )
                    )
                    : [];

            for (
                const link of links
            ) {
                const href =
                    link.getAttribute(
                        'href'
                    ) || '';

                if (
                    productId &&
                    new RegExp(
                        '/p' +
                        String(productId) +
                        '(?:[/?#]|$)',
                        'i'
                    ).test(href)
                ) {
                    return link;
                }
            }

            current =
                current.parentElement;
        }

        if (productId) {
            const allLinks =
                Array.from(
                    document.querySelectorAll(
                        'a[href]'
                    )
                );

            for (
                const link of allLinks
            ) {
                const href =
                    link.getAttribute(
                        'href'
                    ) || '';

                if (
                    new RegExp(
                        '/p' +
                        String(productId) +
                        '(?:[/?#]|$)',
                        'i'
                    ).test(href)
                ) {
                    return link;
                }
            }
        }

        return null;
    }

    function findProductContainer(
        productButton
    ) {
        if (!productButton) {
            return null;
        }

        let current =
            productButton;

        while (
            current &&
            current !== document.body
        ) {
            if (
                current.querySelector
            ) {
                const buttons =
                    Array.from(
                        current.querySelectorAll(
                            [
                                'salla-button[product-id]',
                                'salla-button[data-product-id]',
                                'salla-add-product-button[product-id]',
                                'salla-add-product-button[data-product-id]'
                            ].join(',')
                        )
                    );

                if (
                    buttons.length === 1
                ) {
                    return current;
                }
            }

            current =
                current.parentElement;
        }

        return productButton.parentElement ||
            null;
    }

    function getProductName(
        productButton,
        productId
    ) {
        const link =
            findProductLink(
                productButton,
                productId
            );

        if (link) {
            const text =
                link.textContent
                    ? link.textContent.trim()
                    : '';

            if (text) {
                return text;
            }
        }

        const container =
            findProductContainer(
                productButton
            );

        if (!container) {
            return '';
        }

        const selectors = [
            '.product-title',
            '.product-name',
            '[data-product-title]',
            '[data-product-name]'
        ];

        for (
            const selector of selectors
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

    function getProductPrice(
        productButton
    ) {
        if (!productButton) {
            return '';
        }

        /*
         * مهم:
         * amount نستخدمه فقط إذا كان موجودًا
         * على الزر نفسه.
         *
         * في الرئيسية/الأقسام زر out-and-notify
         * لا يحتوي amount، لذلك نبحث داخل
         * نفس كارت المنتج.
         */
        const amount =
            productButton.getAttribute(
                'amount'
            );

        if (
            amount !== null &&
            String(amount).trim()
        ) {
            return String(
                amount
            ).trim();
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
        productId
    ) {
        const link =
            findProductLink(
                productButton,
                productId
            );

        if (link) {
            const href =
                link.getAttribute(
                    'href'
                ) || '';

            if (href) {
                return normalizeUrl(
                    href
                );
            }
        }

        if (
            isCurrentProductPage(
                productId
            )
        ) {
            return window.location.href;
        }

        return '';
    }

    function isOutOfStock(
        productButton
    ) {
        const status =
            getProductStatus(
                productButton
            );

        return OUT_OF_STOCK_STATUSES.has(
            status
        );
    }

    /*
     * =====================================================
     * OPTIONS
     * =====================================================
     *
     * هذه الوظيفة لا تعمل إلا في صفحة المنتج.
     *
     * لا تؤثر نهائيًا على:
     * - الاسم
     * - السعر
     * - الرابط
     * - ظهور الزر
     * - الرئيسية
     * - الأقسام
     */

    function getSelectedOptions(
        productId
    ) {
        if (
            !isCurrentProductPage(
                productId
            )
        ) {
            return [];
        }

        const selects =
            Array.from(
                document.querySelectorAll(
                    'select[name^="options["]'
                )
            );

        const options = [];

        for (
            const select of selects
        ) {
            if (
                !select ||
                select.disabled
            ) {
                continue;
            }

            const selected =
                select.options[
                    select.selectedIndex
                ];

            if (!selected) {
                continue;
            }

            const value =
                String(
                    selected.value || ''
                ).trim();

            const text =
                String(
                    selected.textContent || ''
                ).trim();

            /*
             * تجاهل:
             * اختر
             * والقيمة الفارغة
             */
            if (
                !value ||
                !text ||
                text === 'اختر'
            ) {
                continue;
            }

            let labelText = '';

            const selectId =
                select.getAttribute(
                    'id'
                );

            if (selectId) {
                const label =
                    document.querySelector(
                        'label[for="' +
                        selectId +
                        '"]'
                    );

                if (label) {
                    labelText =
                        label.textContent
                            ? label.textContent.trim()
                            : '';
                }
            }

            options.push({
                label: labelText,
                value: text
            });
        }

        return options;
    }

    function buildWhatsAppUrl(
        whatsappNumber,
        customMessage,
        productName,
        productPrice,
        productUrl,
        selectedOptions
    ) {
        if (!whatsappNumber) {
            return '';
        }

        const lines = [];

        const message =
            customMessage ||
            DEFAULT_MESSAGE;

        if (message) {
            lines.push(
                message
            );
        }

        if (productName) {
            lines.push(
                'المنتج: ' +
                productName
            );
        }

        if (productPrice) {
            lines.push(
                'السعر: ' +
                productPrice
            );
        }

        /*
         * لا نضيف الخيارات إلا إذا كانت
         * موجودة ومحددة في صفحة المنتج.
         */
        if (
            Array.isArray(
                selectedOptions
            ) &&
            selectedOptions.length
        ) {
            for (
                const option of selectedOptions
            ) {
                if (!option) {
                    continue;
                }

                if (
                    option.label &&
                    option.value
                ) {
                    lines.push(
                        option.label +
                        ': ' +
                        option.value
                    );
                } else if (
                    option.value
                ) {
                    lines.push(
                        option.value
                    );
                }
            }
        }

        if (productUrl) {
            lines.push(
                'الرابط: ' +
                productUrl
            );
        }

        const text =
            lines.join('\n');

        const cleanNumber =
            String(
                whatsappNumber
            ).replace(
                /[^\d+]/g,
                ''
            );

        return (
            'https://wa.me/' +
            cleanNumber +
            '?text=' +
            encodeURIComponent(
                text
            )
        );
    }

    function getWhatsAppIcon() {
        return `
            <svg
                viewBox="0 0 32 32"
                width="20"
                height="20"
                aria-hidden="true"
                focusable="false"
                style="
                    width:20px;
                    height:20px;
                    flex:0 0 20px;
                    display:block;
                "
            >
                <path
                    fill="currentColor"
                    d="M19.11 17.21c-.27-.14-1.58-.78-1.83-.87-.25-.09-.43-.14-.61.14-.18.27-.7.87-.86 1.05-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.71-1.34-1.58-1.5-1.85-.16-.27-.02-.42.12-.56.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.52-.45-.45-.61-.46h-.52c-.18 0-.48.07-.73.34-.25.27-.95.93-.95 2.26s.98 2.62 1.11 2.8c.14.18 1.93 2.95 4.68 4.13.65.28 1.16.45 1.55.57.65.21 1.24.18 1.71.11.52-.08 1.58-.65 1.8-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32z"
                ></path>

                <path
                    fill="currentColor"
                    d="M16.03 3C8.85 3 3 8.72 3 15.77c0 2.25.6 4.45 1.74 6.38L3 29l7.03-1.68a13.1 13.1 0 0 0 6 1.45h.01C23.2 28.77 29 23.06 29 16.02 29 8.96 23.2 3 16.03 3zm0 23.8h-.01a10.86 10.86 0 0 1-5.52-1.51l-.4-.24-4.17 1 1-4.06-.26-.41a10.67 10.67 0 0 1-1.64-5.7c0-5.95 4.92-10.79 10.99-10.79 2.94 0 5.7 1.13 7.78 3.19a10.6 10.6 0 0 1 3.22 7.74c0 5.95-4.92 10.78-10.99 10.78z"
                ></path>
            </svg>
        `;
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

        const container =
            findProductContainer(
                productButton
            );

        if (!container) {
            return null;
        }

        const buttons =
            Array.from(
                container.querySelectorAll(
                    'a[data-salla-whatsapp-notify-button="' +
                    String(productId) +
                    '"]'
                )
            );

        if (!buttons.length) {
            return null;
        }

        const first =
            buttons[0];

        for (
            let i = 1;
            i < buttons.length;
            i++
        ) {
            buttons[i].remove();
        }

        return first;
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

        const parent =
            productButton.parentElement;

        if (!parent) {
            return null;
        }

        let button =
            findWhatsAppButton(
                productButton,
                productId
            );

        if (!button) {
            button =
                document.createElement(
                    'a'
                );

            button.setAttribute(
                'data-salla-whatsapp-notify-button',
                String(productId)
            );

            button.target =
                '_blank';

            button.rel =
                'noopener noreferrer';

            button.innerHTML =
                getWhatsAppIcon() +
                '<span>أبلغني عبر واتساب عند التوفر</span>';

            button.style.display =
                'flex';

            button.style.width =
                '100%';

            button.style.flex =
                '0 0 100%';

            button.style.clear =
                'both';

            button.style.boxSizing =
                'border-box';

            button.style.alignItems =
                'center';

            button.style.justifyContent =
                'center';

            button.style.gap =
                '8px';

            button.style.marginTop =
                '8px';

            button.style.textDecoration =
                'none';

            button.style.cursor =
                'pointer';

            button.style.textAlign =
                'center';

            button.style.fontFamily =
                'inherit';

            button.style.fontSize =
                'inherit';

            button.style.lineHeight =
                '1.5';

            button.style.minHeight =
                '44px';

            parent.appendChild(
                button
            );
        }

        button.href =
            whatsappUrl;

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

        const container =
            findProductContainer(
                productButton
            );

        if (!container) {
            return;
        }

        const buttons =
            Array.from(
                container.querySelectorAll(
                    'a[data-salla-whatsapp-notify-button="' +
                    String(productId) +
                    '"]'
                )
            );

        for (
            const button of buttons
        ) {
            button.remove();
        }
    }
        async function processProduct(
        productButton
    ) {
        if (
            !productButton ||
            !productButton.isConnected
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

        const currentSettings =
            await loadSettings();

        if (
            !currentSettings ||
            !currentSettings.whatsappNumber
        ) {
            return;
        }

        /*
         * البيانات الأساسية:
         * الاسم + السعر + الرابط
         *
         * لا علاقة لها بالـ options.
         */
        const productName =
            getProductName(
                productButton,
                productId
            );

        const productPrice =
            getProductPrice(
                productButton
            );

        const productUrl =
            getProductUrl(
                productButton,
                productId
            );

        /*
         * الـ options تضاف فقط في صفحة
         * المنتج، لو فيه مقاسات/ألوان
         * أو أي خيارات محددة.
         */
        const selectedOptions =
            getSelectedOptions(
                productId
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

        if (!whatsappUrl) {
            return;
        }

        createWhatsAppButton(
            productButton,
            productId,
            whatsappUrl
        );

        processedButtons.add(
            productButton
        );
    }

    function findProductButtons(
        root
    ) {
        if (!root) {
            return [];
        }

        const selector = [
            'salla-button[product-id]',
            'salla-button[data-product-id]',
            'salla-add-product-button[product-id]',
            'salla-add-product-button[data-product-id]'
        ].join(',');

        const buttons = [];

        if (
            root.matches &&
            root.matches(selector)
        ) {
            buttons.push(root);
        }

        if (
            root.querySelectorAll
        ) {
            buttons.push(
                ...Array.from(
                    root.querySelectorAll(
                        selector
                    )
                )
            );
        }

        return buttons;
    }

    function processButtonsInNode(
        node
    ) {
        const buttons =
            findProductButtons(
                node
            );

        for (
            const button of buttons
        ) {
            processProduct(
                button
            );
        }
    }

    function scanProducts() {
        processButtonsInNode(
            document
        );
    }

    document.addEventListener(
        'change',
        function (event) {
            const target =
                event.target;

            if (
                !target ||
                !target.matches ||
                !target.matches(
                    'select[name^="options["]'
                )
            ) {
                return;
            }

            /*
             * إعادة بناء رابط واتساب عند
             * تغيير المقاس أو اللون.
             */
            const productButtons =
                findProductButtons(
                    document
                );

            for (
                const button of productButtons
            ) {
                const productId =
                    getProductId(
                        button
                    );

                if (
                    productId &&
                    isCurrentProductPage(
                        productId
                    )
                ) {
                    processProduct(
                        button
                    );
                }
            }
        },
        true
    );

    const observer =
        new MutationObserver(
            function (mutations) {
                for (
                    const mutation of mutations
                ) {
                    if (
                        mutation.type ===
                        'childList'
                    ) {
                        for (
                            const node of mutation.addedNodes
                        ) {
                            if (
                                node.nodeType ===
                                Node.ELEMENT_NODE
                            ) {
                                processButtonsInNode(
                                    node
                                );
                            }
                        }

                        continue;
                    }

                    if (
                        mutation.type ===
                        'attributes'
                    ) {
                        const button =
                            getProductButtonFromElement(
                                mutation.target
                            );

                        if (!button) {
                            continue;
                        }

                        processProduct(
                            button
                        );
                    }
                }
            }
        );

    function boot() {
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
            boot,
            {
                once: true
            }
        );
    } else {
        boot();
    }
})();
