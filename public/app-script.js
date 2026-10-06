(function () {
    // 1. استخراج معرف المتجر (merchant_id)
    let merchantId = null;
    
    if (typeof salla !== 'undefined' && salla.config) {
        merchantId = salla.config.get('store.id');
    } else if (window.store && window.store.id) {
        merchantId = window.store.id;
    } else if (window.Salla && window.Salla.eventId) {
        merchantId = window.Salla.eventId;
    }

    if (!merchantId) {
        const urlParams = new URLSearchParams(window.location.search);
        merchantId = urlParams.get('merchant_id');
    }

    if (!merchantId) {
        console.log('Salla WhatsApp: Merchant ID not found');
        return;
    }

    // 2. جلب إعدادات التاجر من السيرفر
    fetch(`https://salla-whatsapp-notify.onrender.com/api/settings?merchant_id=${merchantId}`)
        .then(res => res.json())
        .then(data => {
            if (!data || !data.whatsappNumber) {
                console.log('Salla WhatsApp: No WhatsApp number found');
                return;
            }

            // البدء في فحص المنتجات المنتهية فقط
            initWhatsAppNotify(data.whatsappNumber, data.customMessage);
        })
        .catch(err => console.error('Salla WhatsApp Error:', err));

    function initWhatsAppNotify(phone, customMsg) {
        const checkAndInject = () => {
            // إذا كان الزر مضافاً بالفعل لا تكرره
            if (document.getElementById('salla-whatsapp-notify-btn')) return;

            // 1. البحث عن أي عنصر يدل على أن المنتج نفدت كميته
            let isOutOfStock = false;
            let targetElem = null;

            // أ) البحث في عنصر أزرار سلة الذكية
            const sallaBtn = document.querySelector('salla-add-to-cart-button');
            if (sallaBtn) {
                const isOut = sallaBtn.getAttribute('is-out-of-stock') !== null || 
                              sallaBtn.hasAttribute('out-of-stock') ||
                              sallaBtn.classList.contains('out-of-stock');
                if (isOut) {
                    isOutOfStock = true;
                    targetElem = sallaBtn;
                }
            }

            // ب) البحث عن نصوص "نفدت الكمية" أو "غير متوفر" في أي مكان بالصفحة
            if (!isOutOfStock) {
                const allElements = Array.from(document.querySelectorAll('button, div, span, p, label'));
                const foundText = allElements.find(el => {
                    const txt = el.innerText ? el.innerText.trim() : '';
                    return txt === 'نفدت الكمية' || txt === 'غير متوفر' || txt.includes('نفذت الكمية');
                });

                if (foundText) {
                    isOutOfStock = true;
                    targetElem = foundText;
                }
            }

            // إذا كان المنتج متوفراً (ليس نفد)، اخرج ولا ترسم الزر إطلاقاً
            if (!isOutOfStock || !targetElem) return;

            // 2. تجهيز بيانات الرسالة
            const productName = document.querySelector('h1')?.innerText?.trim() || '';
            const productUrl = window.location.href;
            
            let fullMessage = customMsg || 'أهلاً، أود الاستفسار عن توفر هذا المنتج عند إعادة توفره.';
            if (productName) fullMessage += `\nالمنتج: ${productName}`;
            fullMessage += `\nالرابط: ${productUrl}`;

            // 3. إنشاء الزر الأخضر
            const btn = document.createElement('a');
            btn.id = 'salla-whatsapp-notify-btn';
            btn.href = `https://wa.me/${phone}?text=${encodeURIComponent(fullMessage)}`;
            btn.target = '_blank';
            btn.innerText = 'أعلمني عند التوفر عبر الواتساب';

            // تنسيق الزر
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

            // إدراج الزر أسفل عنصر "نفدت الكمية" مباشرة
            targetElem.insertAdjacentElement('afterend', btn);
        };

        checkAndInject();
        const observer = new MutationObserver(checkAndInject);
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();
