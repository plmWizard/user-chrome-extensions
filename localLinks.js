function convertWindowsPathToFileUrl(path) {
    return 'file:///' + path.replace(/\\/g, '/');
}

function convertUNCPathToFileUrl(path) {
    return 'file://' + path.replace(/\\/g, '/').slice(2);
}

function createLink(href, text) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;

    if (href.startsWith('http') || href.startsWith('vault://')) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
    } else if (href.startsWith('file://')) {
        a.classList.add('local-link');
        a.dataset.fileUrl = href;
        a.href = '#';
    }

    return a;
}

function getLinkMatches(text, settings) {
    const matches = [];
    let m;

    if (settings.enableLocalLinks) {
        const regex = /[a-zA-Z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]*/g;
        while ((m = regex.exec(text))) matches.push({ match: m[0], index: m.index, type: 'local' });
    }

    if (settings.enableNetworkLinks) {
        const regex = /\\\\[^\\\s]+\\[^\\\s]+(?:\\[^\\\s]+)*/g;
        while ((m = regex.exec(text))) matches.push({ match: m[0], index: m.index, type: 'network' });
    }

    if (settings.enableWebLinks) {
        const regex = /\b(?:https?:\/\/|www\.)[^\s<>"']+/g;
        while ((m = regex.exec(text))) matches.push({ match: m[0], index: m.index, type: 'web' });
    }

    if (settings.enableVaultLinks) {
        const regex = /\bvault:\/\/[^\s<>"']+/g;
        while ((m = regex.exec(text))) matches.push({ match: m[0], index: m.index, type: 'vault' });
    }

    return matches.sort((a, b) => a.index - b.index);
}

function linkifyNode(textNode, settings) {
    if (textNode.parentNode.tagName === 'A') return;
    if (textNode.parentNode.dataset.processed) return;

    const text = textNode.nodeValue;
    const matches = getLinkMatches(text, settings);
    if (matches.length === 0) return;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const { match, index, type } of matches) {
        if (index > lastIndex) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
        }

        let href = match;
        if (type === 'local') {
            href = convertWindowsPathToFileUrl(match);
        } else if (type === 'network') {
            href = convertUNCPathToFileUrl(match);
        } else if (type === 'web' && match.startsWith('www.')) {
            href = 'http://' + match;
        }

        fragment.appendChild(createLink(href, match));
        lastIndex = index + match.length;
    }

    if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    const span = document.createElement('span');
    span.dataset.processed = 'true';
    span.appendChild(fragment);
    textNode.parentNode.replaceChild(span, textNode);
}

function processTextLinks(settings) {
    const divs = document.querySelectorAll('div.field-error');

    divs.forEach(div => {
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
        const textNodes = [];

        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!node.parentNode || node.parentNode.closest('a')) continue;
            if (node.nodeValue.trim()) textNodes.push(node);
        }

        textNodes.forEach(node => linkifyNode(node, settings));
    });
}

function initTextLinkObserver(settings) {
    document.body.addEventListener('click', (event) => {
        const link = event.target.closest('a');
        if (!link) return;

        if (link.classList.contains('local-link') && link.dataset.fileUrl) {
            event.preventDefault();
            chrome.runtime.sendMessage({ type: 'openLocal', url: link.dataset.fileUrl });
        } else if (link.href && link.href.startsWith('vault://')) {
            event.preventDefault();
            chrome.runtime.sendMessage({ type: 'openLocal', url: link.href });
        }
    });

    let debounceTimeout;
    const safeProcess = () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => processTextLinks(settings), 100);
    };

    const inputWatcher = new MutationObserver(safeProcess);
    const mainObserver = new MutationObserver(safeProcess);

    inputWatcher.observe(document.body, { childList: true, subtree: true });
    mainObserver.observe(document.body, { childList: true, subtree: true });

    processTextLinks(settings);
}

chrome.storage.sync.get(
    ['enableTextLinks', 'enableWebLinks', 'enableLocalLinks', 'enableNetworkLinks', 'enableVaultLinks'],
    (data) => {
        const isEnabled = data.enableTextLinks ?? true;
        if (!isEnabled) return;

        const settings = {
            enableWebLinks: data.enableWebLinks ?? true,
            enableLocalLinks: data.enableLocalLinks ?? true,
            enableNetworkLinks: data.enableNetworkLinks ?? true,
            enableVaultLinks: data.enableVaultLinks ?? true
        };

        initTextLinkObserver(settings);
    }
);
