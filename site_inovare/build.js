const fs = require('fs');
const path = require('path');

const SRC_DIR = __dirname;
const DIST_DIR = path.join(__dirname, 'dist');

const header = fs.readFileSync(path.join(SRC_DIR, 'components/header.html'), 'utf8');
const footer = fs.readFileSync(path.join(SRC_DIR, 'components/footer.html'), 'utf8');

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

function processHtml(filePath) {
    let html = fs.readFileSync(filePath, 'utf8');

    const relativePath = path.relative(path.dirname(filePath), SRC_DIR);
    const basePath = relativePath ? relativePath.replace(/\\/g, '/') + '/' : './';

    function adjustLinks(html) {
        return html.replace(/(src|href)="([^"]+)"/g, (match, attr, url) => {
            if (url.startsWith('http') || url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('//')) {
                return match;
            }
            const cleanUrl = url.replace(/^\.\//, '');
            return `${attr}="${basePath}${cleanUrl}"`;
        });
    }

    let adjustedHeader = adjustLinks(header);
    let adjustedFooter = adjustLinks(footer);

    html = html.replace(/<div id="header-placeholder"><\/div>/g, adjustedHeader);
    html = html.replace(/<div id="footer-placeholder"><\/div>/g, adjustedFooter);

    html = html.replace(/<script src="[^"]*loader\.js"[^>]*><\/script>\s*/g, '');

    html = html.replace(/\s*body\s*\{[^}]*opacity:\s*0;[^}]*\}/g, (match) => {
        return match.replace(/opacity:\s*0;\s*/g, '');
    });
    html = html.replace(/\s*body\.loaded\s*\{[^}]*\}\s*/g, '');
    html = html.replace(/\s*#header-placeholder:empty[\s\S]*?visibility:\s*hidden;\s*\}\s*/g, '');

    return html;
}

if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
}

const htmlFiles = findHtmlFiles(SRC_DIR);
let count = 0;

for (const file of htmlFiles) {
    const relativePath = path.relative(SRC_DIR, file);
    const destPath = path.join(DIST_DIR, relativePath);
    const destDir = path.dirname(destPath);

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    const processed = processHtml(file);
    fs.writeFileSync(destPath, processed);
    count++;
    console.log(`✓ ${relativePath}`);
}

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
