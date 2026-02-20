function insertPoweredByText() {
  const logoImage = document.querySelector('img.fusion-lifecycle-logo-modern');
  if (!logoImage || logoImage.closest('span.injected-wrapper')) return;

  const link = document.createElement('a');
  link.href = 'https://www.coolorange.com/';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.textDecoration = 'none';
  link.style.display = 'inline-flex';
  link.style.alignItems = 'center';

  const poweredByText = document.createElement('span');
  poweredByText.innerHTML = 'powered by <span style="color:#656565;">cool</span><span style="color:#FF9900;">Orange</span>';
  poweredByText.style.fontFamily = 'Arial, sans-serif';
  poweredByText.style.fontSize = '14px';
  poweredByText.style.marginRight = '8px';
  poweredByText.style.verticalAlign = 'middle';

  link.appendChild(poweredByText);

  const wrapper = document.createElement('span');
  wrapper.className = 'injected-wrapper';
  wrapper.style.display = 'inline-flex';
  wrapper.style.alignItems = 'center';

  logoImage.parentElement.insertBefore(wrapper, logoImage);
  wrapper.appendChild(link);
  wrapper.appendChild(logoImage);
}


function insertHeaderLogo() {
  const targetDiv = document.getElementById('fusion-header-theme-toggle');
  if (!targetDiv || targetDiv.querySelector('.coolorange-logo')) return;

  targetDiv.style.display = 'flex';
  targetDiv.style.alignItems = 'center';
  targetDiv.style.gap = '12px';

  const logoLink = document.createElement('a');
  logoLink.href = 'https://www.coolorange.com/';
  logoLink.target = '_blank';
  logoLink.rel = 'noopener noreferrer';
  logoLink.style.display = 'inline-flex';
  logoLink.style.alignItems = 'center';

  const logoImg = document.createElement('img');
  logoImg.src = chrome.runtime.getURL('icons/coolOrangeIcon16.png');
  logoImg.alt = 'coolOrange';
  logoImg.className = 'coolorange-logo';
  logoImg.style.height = '16px';
  logoImg.style.display = 'inline-block';

  logoLink.appendChild(logoImg);
  targetDiv.appendChild(logoLink);
}

const observer = new MutationObserver((_, obs) => {
  const footerReady = document.querySelector('img.fusion-lifecycle-logo-modern');
  const headerReady = document.getElementById('fusion-header-theme-toggle');

  if (footerReady) insertPoweredByText();
  if (headerReady) insertHeaderLogo();

  if (footerReady && headerReady) {
    obs.disconnect();
  }
});

observer.observe(document.body, { childList: true, subtree: true });