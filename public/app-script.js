(function () {
    // 1. جلب merchant_id
    let merchantId = null;
    if (typeof salla !== 'undefined' && salla.config) {
        merchantId = salla.config.get('store.id');
    } else if (window.store && window.store.id) {
        merchantId = window.store.id;
    }

    if (!merchantId) {
        const urlParams = new URLSearchParams(window.location.search);
        merchantId = urlParams.get('merchant_id');
    }

    if (!merchantId) return;

    // 2. جلب إعدادات التاجر
    fetch(`https://salla-whatsapp-notify.onrender.com/api/settings?merchant_id=${merchantId}`)
        .then(res => res.json())
        .then(data => {
            if (!data || !data.whatsappNumber) return;
            initWhatsAppNotify(data.whatsappNumber, data.customMessage);
        })
        .catch(err => console.error(err));

    function initWhatsAppNotify(phone, customMsg) {
        const checkAndInject = () => {
            if (document.getElementById('salla-whatsapp-notify-btn')) return;

            let isOutOfStock = false;
            let targetElem = null;

            // أ) فحص عنصر زر سلة الرئيسي (بما فيه الـ Shadow DOM)
            const sallaBtn = document.querySelector('salla-add-to-cart-button');
            if (sallaBtn) {
                targetElem = sallaBtn;
                
                // فحص الخصائص المباشرة
                if (sallaBtn.hasAttribute('out-of-stock') || sallaBtn.getAttribute('is-out-of-stock') !== null) {
                    isOutOfStock = true;
                } 
                // فحص محتوى الـ Shadow Root الداخلي للزر
                else if (sallaBtn.shadowRoot) {
                    const shadowText = sallaBtn.shadowRoot.textContent || '';
                    if (shadowText.includes('نفدت الكمية') || shadowText.includes('غير متوفر')) {
                        isOutOfStock = true;
                    }
                }
            }

            // ب) فحص باقي عناصر الصفحة العادية كخيار إضافي
            if (!isOutOfStock) {
                const elements = Array.from(document.querySelectorAll('button, div, span, p'));
                const found = elements.find(el => {
                    const txt = el.innerText ? el.innerText.trim() : '';
                    return txt === 'نفدت الكمية' || txt === 'غير متوفر';
                });
                if (found) {
                    isOutOfStock = true;
                    targetElem = found;
                }
            }

            // إذا كان المنتج متوفراً، لا تفعل شيئاً
            if (!isOutOfStock || !targetElem) return;

            // تجهيز البيانات وإنشاء الزر
            const productName = document.querySelector('h1')?.innerText?.trim() || '';
            const productUrl = window.location.href;
            
            let fullMessage = customMsg || 'أهلاً، أود الاستفسار عن توفر هذا المنتج.';
            if (productName) fullMessage += `\nالمنتج: ${productName}`;
            fullMessage += `\nالرابط: ${productUrl}`;

            const btn = document.createElement('a');
            btn.id = 'salla-whatsapp-notify-btn';
            btn.href = `https://wa.me/${phone}?text=${encodeURIComponent(fullMessage)}`;
            btn.target = '_blank';
            btn.innerText = 'أعلمني عند التوفر عبر الواتساب';

            Object.assign(btn.style, {
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
                textDecoration: 'none',
                boxSizing: 'border-box',
                textAlign: 'center',
                cursor: 'pointer',
                zIndex: '99999'
            });

            targetElem.insertAdjacentElement('afterend', btn);
        };

        checkAndInject();
        const observer = new MutationObserver(checkAndInject);
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();
