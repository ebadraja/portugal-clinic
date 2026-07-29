function initHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;

  const onScroll = () => {
    if (window.scrollY > 8) {
      header.classList.add('border-border', 'shadow-soft');
      header.classList.remove('border-transparent');
    } else {
      header.classList.remove('border-border', 'shadow-soft');
      header.classList.add('border-transparent');
    }
  };

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initMobileNav() {
  const toggle = document.getElementById('nav-toggle');
  const panel = document.getElementById('mobile-nav');
  const iconOpen = document.getElementById('icon-open');
  const iconClose = document.getElementById('icon-close');
  if (!toggle || !panel) return;

  const labelOpen = toggle.getAttribute('data-label-open') || 'Open menu';
  const labelClose = toggle.getAttribute('data-label-close') || 'Close menu';

  const setOpen = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? labelClose : labelOpen);
    panel.hidden = !open;
    panel.classList.toggle('hidden', !open);
    iconOpen?.classList.toggle('hidden', open);
    iconClose?.classList.toggle('hidden', !open);
    document.body.classList.toggle('overflow-hidden', open);
  };

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
  });

  panel.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
}

function initFaq() {
  document.querySelectorAll('.faq-trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const panelId = btn.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      const chevron = btn.querySelector('.faq-chevron');

      document.querySelectorAll('.faq-trigger').forEach((other) => {
        if (other === btn) return;
        other.setAttribute('aria-expanded', 'false');
        const otherPanelId = other.getAttribute('aria-controls');
        const otherPanel = otherPanelId ? document.getElementById(otherPanelId) : null;
        if (otherPanel) {
          otherPanel.hidden = true;
          otherPanel.classList.add('hidden');
        }
        other.querySelector('.faq-chevron')?.classList.remove('rotate-180');
      });

      btn.setAttribute('aria-expanded', String(!expanded));
      if (panel) {
        panel.hidden = expanded;
        panel.classList.toggle('hidden', expanded);
      }
      chevron?.classList.toggle('rotate-180', !expanded);
    });
  });
}

function initFadeUp() {
  const nodes = document.querySelectorAll('.fade-up');
  if (!nodes.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    nodes.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );

  nodes.forEach((el) => observer.observe(el));
}

function initContactForm() {
  const form = document.getElementById('contact-form') as HTMLFormElement | null;
  const status = document.getElementById('form-status');
  if (!form || !status) return;

  const msg = {
    sending: form.dataset.msgSending || 'Sending…',
    success: form.dataset.msgSuccess || 'Sent.',
    error: form.dataset.msgError || 'Error.',
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = true;

    status.classList.remove('hidden', 'text-emergency', 'text-primary');
    status.textContent = msg.sending;

    try {
      const data = new FormData(form);
      const res = await fetch(form.action, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' },
      });
      const json = await res.json();

      if (res.ok && json.success) {
        status.classList.add('text-primary');
        status.textContent = msg.success;
        form.reset();
      } else {
        throw new Error(json.message || 'Error');
      }
    } catch {
      status.classList.add('text-emergency');
      status.textContent = msg.error;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

/** Preserve #anchor when switching language (hash is not sent to the server). */
function initLangSwitcher() {
  document.querySelectorAll('.lang-switcher a.lang-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      if (!window.location.hash) return;
      e.preventDefault();
      const href = (link as HTMLAnchorElement).getAttribute('href') || '/';
      window.location.assign(href + window.location.hash);
    });
  });
}

initHeader();
initMobileNav();
initFaq();
initFadeUp();
initContactForm();
initLangSwitcher();
