
(function() {
    const path = window.location.pathname;
    const segments = path.split('/').filter(s => s && !s.includes('.html'));

    const siteIndex = segments.findIndex(s => s.toLowerCase() === 'site_inovare');
    const depth = siteIndex >= 0 ? segments.length - siteIndex - 1 : 0;

    const basePath = depth > 0 ? '../'.repeat(depth) : './';

    function adjustPaths(container) {
        container.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('http') && !src.startsWith('/')) {
                img.src = basePath + src;
            }
        });

        container.querySelectorAll('a').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('/')) {
                link.href = basePath + href;
            }
        });
    }

    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        fetch(basePath + 'components/header.html')
            .then(response => response.text())
            .then(html => {
                headerPlaceholder.innerHTML = html;
                adjustPaths(headerPlaceholder);
                document.body.classList.add('loaded');
            })
            .catch(err => {
                console.error('Erro ao carregar header:', err);
                document.body.classList.add('loaded');
            });
    }

    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder) {
        fetch(basePath + 'components/footer.html')
            .then(response => response.text())
            .then(html => {
                footerPlaceholder.innerHTML = html;
                adjustPaths(footerPlaceholder);
            })
            .catch(err => console.error('Erro ao carregar footer:', err));
    }
})();
