chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'openLocal' && message.url) {
        chrome.tabs.create({ url: message.url });
    }
});