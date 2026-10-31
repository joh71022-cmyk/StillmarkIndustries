/* Finds out what kind of device is looking at the site and tags the page, so each kind gets its own layout:
     <html data-platform="phone | tablet | desktop | tv"  data-input="touch | mouse | both"  data-os="..."  data-orient="portrait | landscape">
   The styles for a device only apply to that device. A narrow desktop window stays a desktop. */
(function () {
  var d = document.documentElement, ua = navigator.userAgent || '', nav = navigator;
  var touchPts = nav.maxTouchPoints || 0;
  var hasTouch = touchPts > 0 || 'ontouchstart' in window;
  var coarse = window.matchMedia && matchMedia('(pointer:coarse)').matches;
  var fine = window.matchMedia && matchMedia('(any-pointer:fine)').matches;
  var short = Math.min(screen.width || 0, screen.height || 0), long = Math.max(screen.width || 0, screen.height || 0);
  var os = /Windows Phone/i.test(ua) ? 'windows-phone' : /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPts > 1) ? 'ios'
    : /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows' : /Macintosh|Mac OS X/i.test(ua) ? 'mac' : /CrOS/i.test(ua) ? 'chromeos' : /Linux|X11/i.test(ua) ? 'linux' : 'other';
  var tv = /SmartTV|Smart-TV|SMART-TV|Tizen|Web0S|WebOS|NetCast|HbbTV|AppleTV|GoogleTV|Android TV|AFT[A-Z]|BRAVIA|CrKey|Roku|PlayStation|Xbox|Silk\/.*Mobile Safari|VIDAA|Hisense|Viera/i.test(ua);
  var ipad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && touchPts > 1);
  var androidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
  var phoneUA = /iPhone|iPod|Android.*Mobile|Windows Phone|Mobile.*Firefox|BlackBerry|Opera Mini|IEMobile/i.test(ua);
  var kind;
  if (tv) kind = 'tv';
  else if (ipad || androidTablet || /Tablet|Kindle/i.test(ua)) kind = 'tablet';
  else if (phoneUA) kind = 'phone';
  else if (hasTouch && coarse && !fine && short > 0 && short < 600) kind = 'phone';          // a phone asking for the desktop site
  else if (hasTouch && coarse && !fine && short >= 600 && short < 1100) kind = 'tablet';
  else kind = 'desktop';
  var input = hasTouch && (coarse && !fine) ? 'touch' : (hasTouch && fine ? 'both' : 'mouse');
  if (kind === 'phone' || kind === 'tablet') input = hasTouch ? (fine ? 'both' : 'touch') : input;
  function orient() { d.setAttribute('data-orient', window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'); }
  d.setAttribute('data-platform', kind); d.setAttribute('data-input', input); d.setAttribute('data-os', os); orient();
  window.addEventListener('resize', orient); window.addEventListener('orientationchange', orient);
  window.HB_PLATFORM = { kind: kind, input: input, os: os, touch: input === 'touch' };
})();
