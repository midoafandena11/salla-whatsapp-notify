(function () {
    function injectButton() {
        // منع التكرار لو الزر مرسوم قبل كده
        if (document.getElementById('salla-whatsapp-notify-btn')) return;

        // 1. العثور على زر سلة
        const sallaBtn = document.querySelector('salla-add-to-cart-button');
        if (!sallaBtn) return;

        // 2. التحقق من حالة "نفدت الكمية"
        const isOutOfStock = 
            sallaBtn.hasAttribute('out-of-stock') || 
            sallaBtn.getAttribute('is-out-of-stock') !== null ||
            sallaBtn.hasAttribute('disabled') ||
            (sallaBtn.shadowRoot && (
                sallaBtn.shadowRoot.textContent.includes('نفدت الكمية') || 
                sallaBtn.shadowRoot.textContent.includes('غير متوفر')
            )) ||
            document.body.innerText.includes('نفدت الكمية');

        // لو المنتج متوفر، اخرج وما تعملش حاجة
        if (!isOutOfStock) return;

        // 3. جلب بيانات التاجر ورسم الزر
        const urlParams = new URLSearchParams(window.location.search);
        let merchantId = urlParams.get('merchant_id');
        if (!merchantId && typeof salla !== 'undefined' && salla.config) {
            merchantId = salla.config.get('store.id');
        }

        const apiUrl = merchantId 
            ? `https://salla-whatsapp-notify.onrender.com/api/settings?merchant_id=${merchantId}`
            : `https://salla-whatsapp-notify.onrender.com/api/settings`;

        fetch(apiUrl)
            .then(res => res.json())
            .then(data => {
                if (!data || !data.whatsappNumber) return;

                const productName = document.querySelector('h1')?.innerText?.trim() || '';
                const productUrl = window.location.href;
                
                let message = data.customMessage || 'أهلاً، أود الاستفسار عن توفر هذا المنتج.';
                if (productName) message += `\nالمنتج: ${productName}`;
                message += `\nالرابط: ${productUrl}`;

                const btn = document.createElement('a');
                btn.id = 'salla-whatsapp-notify-btn';
                btn.href = `https://wa.me/${data.whatsappNumber}?text=${encodeURIComponent(message)}`;
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

                sallaBtn.insertAdjacentElement('afterend', btn);
            })
            .catch(err => console.error(err));
    }

    // تشغيل الفحص المستمر كل ثانية لضمان لقط عناصر سلة بعد التحميل
    setInterval(injectButton, 1000);
})();
