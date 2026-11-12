/* PetZen — página publicitaria */
(function () {
  // Dirección de la app: la que escribas en index.html, o <esta dirección>/app/
  function appUrl() {
    if (window.PETZEN_APP_URL) return window.PETZEN_APP_URL;
    return /^https?:/.test(location.protocol) ? location.origin + '/app/' : 'https://www.petzen.com/app/';
  }
  const url = appUrl();
  document.querySelectorAll('.js-app').forEach((a) => (a.href = url));
  const label = document.getElementById('qrurl'); if (label) label.textContent = url;
  const canvas = document.getElementById('qr');
  if (canvas) QR.toCanvas(canvas, url, { scale: 8, margin: 3, dark: '#0B3162', light: '#ffffff' });

  // menú
  const nav = document.getElementById('nav'), links = document.getElementById('links');
  document.getElementById('burger').addEventListener('click', () => links.classList.toggle('open'));
  links.addEventListener('click', () => links.classList.remove('open'));
  const onScroll = () => nav.classList.toggle('solid', scrollY > 30);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // aparición al hacer scroll
  const els = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    els.forEach((el, i) => { el.style.transitionDelay = (i % 3) * 80 + 'ms'; io.observe(el); });
  } else els.forEach((el) => el.classList.add('in'));
})();
