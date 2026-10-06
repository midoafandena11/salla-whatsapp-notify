(function () {
    // 1. تحديد ID المتجر من بيئة سلة
    let merchantId = null;
    
    if (typeof salla !== 'undefined' && salla.config) {
        merchantId = salla.config.get('store.id');
    } else if (window.store && window.store.id) {
        merchantId = window.store.id;
    } else if (window.Salla && window.Salla.eventId) {
        merchantId = window.Salla.eventId;
    }

    // استخراج merchant_id من رابط الصفحة لو كان موجوداً كخيار بديل
    if (!merchantId) {
        const urlParams = new URLSearchParams(window.location.search);
        merchantId = urlParams.get('merchant_id');
    }

    if (!merchantId) {
        console.log('Salla WhatsApp App: لم يتم العثور على merchant_id');
        return;
    }

    // 2. جلب الإعدادات المخصصة للتاجر من السيرفر
    fetch(`https://salla-whatsapp-notify.onrender.com/api/settings?merchant_id=${merchantId}`)
        .then(res => res.json())
        .then(data => {
            if (!data || !data.whatsappNumber) {
                console.log('Salla WhatsApp App: لم يتم ضبط رقم الواتساب بعد');
                return;
            }

            // تشغيل محاولة إضافة الزر
            initWhatsAppButton(data.whatsappNumber, data.customMessage);
        })
        .catch(err => console.error('Salla WhatsApp App Error:', err));

    function initWhatsAppButton(phone, customMsg) {
        // فحص ظهور زر "نفدت الكمية" أو حالة عدم التوفر في الصفحة
        const checkAndInject = () => {
            if (document.getElementById('salla-whatsapp-notify-btn')) return;

            // البحث عن العناصر التي تدل على أن المنتج نفد
            const outOfStockElem = Array.from(document.querySelectorAll('button, div, span, p')).find(el => {
                const text = el.innerText ? el.innerText.trim() : '';
                return text === 'نفدت الكمية' || text.includes('نفدت الكمية') || text.includes('غير متوفر');
            });

            // إذا كان المنتج نفد (أو يمكن إظهاره دائماً في صفحة المنتج)
            const targetContainer = outOfStockElem ? (outOfStockElem.closest('.product-form') || outOfStockElem.parentElement) : document.querySelector('.product-form');

            if (targetContainer) {
                // جلب اسم المنتج وسعره لإضافتهم للرسالة
                const productName = document.querySelector('h1')?.innerText?.trim() || '';
                const productUrl = window.location.href;
                
                let fullMessage = customMsg || 'أهلاً، أود الاستفسار عن توفر هذا المنتج.';
                if (productName) {
                    fullMessage += `\nالمنتج: ${productName}`;
                }
                fullMessage += `\nالرابط: ${productUrl}`;

                // إنشاء الزر بنفس التصميم والألوان الظاهرة في الصورة
                const btn = document.createElement('a');
                btn.id = 'salla-whatsapp-notify-btn';
                btn.href = `https://wa.me/${phone}?text=${encodeURIComponent(fullMessage)}`;
                btn.target = '_blank';
                btn.innerText = 'أعلمني عند التوفر عبر الواتساب';

                // تنسيق الزر مطابق تماماً للصورة
                Object.assign(btn.style, {
                    display: 'flex',
                    justifyContent: 'center',
                    align-items: 'center',
                    width: '100%',
                    backgroundColor: '#00b074',
                    color: '#ffffff',
                    padding: '16px 20px',
                    marginTop: '12px',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: '700',
                    textDecoration: 'none',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease-in-out'
                });

                btn.onmouseover = () => btn.style.backgroundColor = '#009663';
                btn.onmouseout = () => btn.style.backgroundColor = '#00b074';

                // إضافة الزر مباشرة أسفل عنصر نفدت الكمية أو داخل النموذج
                if (outOfStockElem) {
                    outOfStockElem.insertAdjacentElement('afterend', btn);
                } else {
                    targetContainer.appendChild(btn);
                }
            }
        };

        // تشغيل الفحص عند التحميل وعند التغييرات في الصفحة (مثل اختيار المقاسات)
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkAndInject);
        } else {
            checkAndInject();
        }

        // مراقبة أي تغييرات في الصفحة لضمان ظهور الزر فوراً
        const observer = new MutationObserver(checkAndInject);
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();
