const fs = require('fs');
const path = require('path');

const SRC_DIR = __dirname;
const DIST_DIR = path.join(__dirname, 'dist');

// Lê os componentes
const header = fs.readFileSync(path.join(SRC_DIR, 'components/header.html'), 'utf8');
const footer = fs.readFileSync(path.join(SRC_DIR, 'components/footer.html'), 'utf8');

// Encontra todos os HTMLs (recursivamente)
function findHtmlFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && item !== 'dist' && item !== 'components' && item !== 'node_modules') {
            findHtmlFiles(fullPath, files);
        } else if (item.endsWith('.html')) {
            files.push(fullPath);
        }
    }
    return files;
}

// Processa cada arquivo HTML
function processHtml(filePath) {
    let html = fs.readFileSync(filePath, 'utf8');

    // Calcula o path relativo para ajustar links
    const relativePath = path.relative(path.dirname(filePath), SRC_DIR);
    const basePath = relativePath ? relativePath.replace(/\\/g, '/') + '/' : './';

    // Ajusta paths no header e footer
    function adjustLinks(html) {
        return html.replace(/(src|href)="([^"]+)"/g, (match, attr, url) => {
            // Não mexe em links externos, âncoras, mailto, tel
            if (url.startsWith('http') || url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('//')) {
                return match;
            }
            // Remove ./ do início se tiver
            const cleanUrl = url.replace(/^\.\//, '');
            return `${attr}="${basePath}${cleanUrl}"`;
        });
    }

    let adjustedHeader = adjustLinks(header);
    let adjustedFooter = adjustLinks(footer);

    // Substitui os placeholders
    html = html.replace(/<div id="header-placeholder"><\/div>/g, adjustedHeader);
    html = html.replace(/<div id="footer-placeholder"><\/div>/g, adjustedFooter);

    // Remove o loader.js (não é mais necessário)
    html = html.replace(/<script src="[^"]*loader\.js"[^>]*><\/script>\s*/g, '');

    // Remove CSS de loading (opacity: 0, body.loaded, placeholders:empty)
    html = html.replace(/\s*body\s*\{[^}]*opacity:\s*0;[^}]*\}/g, (match) => {
        return match.replace(/opacity:\s*0;\s*/g, '');
    });
    html = html.replace(/\s*body\.loaded\s*\{[^}]*\}\s*/g, '');
    html = html.replace(/\s*#header-placeholder:empty[\s\S]*?visibility:\s*hidden;\s*\}\s*/g, '');

    return html;
}

// Cria pasta dist
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Processa todos os arquivos
const htmlFiles = findHtmlFiles(SRC_DIR);
let count = 0;

for (const file of htmlFiles) {
    const relativePath = path.relative(SRC_DIR, file);
    const destPath = path.join(DIST_DIR, relativePath);
    const destDir = path.dirname(destPath);

    // Cria subpastas se necessário
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    const processed = processHtml(file);
    fs.writeFileSync(destPath, processed);
    count++;
    console.log(`✓ ${relativePath}`);
}

// Copia pasta img e outros assets
function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    const items = fs.readdirSync(src);
    for (const item of items) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

copyDir(path.join(SRC_DIR, 'img'), path.join(DIST_DIR, 'img'));
console.log(`✓ img/`);

console.log(`\nBuild completo! ${count} arquivos processados em dist/`);
