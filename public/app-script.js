(function () {
    function initWhatsAppNotify() {
        const checkAndInject = () => {
            // منع التكرار
            if (document.getElementById('salla-whatsapp-notify-btn')) return;

            let isOutOfStock = false;
            let targetElem = null;

            // 1. فحص زر سلة الرئيسي (سواء بالخصائص أو داخل Shadow DOM)
            const sallaBtn = document.querySelector('salla-add-to-cart-button');
            if (sallaBtn) {
                targetElem = sallaBtn;
                if (sallaBtn.hasAttribute('out-of-stock') || sallaBtn.getAttribute('is-out-of-stock') !== null) {
                    isOutOfStock = true;
                } else if (sallaBtn.shadowRoot) {
                    const shadowText = sallaBtn.shadowRoot.textContent || '';
                    if (shadowText.includes('نفدت الكمية') || shadowText.includes('غير متوفر')) {
                        isOutOfStock = true;
                    }
                }
            }

            // 2. فحص باقي عناصر الصفحة العادية كخيار احتياطي
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

            // إذا لم تكن السلعة منتهية، لا تظهر الزر
            if (!isOutOfStock || !targetElem) return;

            // 3. استخراج ID المتجر بجميع الطرق الممكنة أو جلب البيانات مباشرة
            let merchantId = null;
            if (typeof salla !== 'undefined' && salla.config) {
                merchantId = salla.config.get('store.id');
            } else if (window.store && window.store.id) {
                merchantId = window.store.id;
            }

            // رابط الطلب بالسيرفر
            const apiUrl = merchantId 
                ? `https://salla-whatsapp-notify.onrender.com/api/settings?merchant_id=${merchantId}`
                : `https://salla-whatsapp-notify.onrender.com/api/settings`;

            fetch(apiUrl)
                .then(res => res.json())
                .then(data => {
                    if (!data || !data.whatsappNumber) return;

                    const productName = document.querySelector('h1')?.innerText?.trim() || '';
                    const productUrl = window.location.href;
                    
                    let fullMessage = data.customMessage || 'أهلاً، أود الاستفسار عن توفر هذا المنتج.';
                    if (productName) fullMessage += `\nالمنتج: ${productName}`;
                    fullMessage += `\nالرابط: ${productUrl}`;

                    const btn = document.createElement('a');
                    btn.id = 'salla-whatsapp-notify-btn';
                    btn.href = `https://wa.me/${data.whatsappNumber}?text=${encodeURIComponent(fullMessage)}`;
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
                })
                .catch(err => console.error(err));
        };

        checkAndInject();
        const observer = new MutationObserver(checkAndInject);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWhatsAppNotify);
    } else {
        initWhatsAppNotify();
    }
})();
