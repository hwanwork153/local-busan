// Ask a Local form.
// 1. Create a free form at https://formspree.io (sign up with your email).
// 2. Paste your form's endpoint below, e.g. 'https://formspree.io/f/abcdwxyz'.
var FORM_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID';

document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('ask-form');
  if (!form) return;
  var status = document.getElementById('ask-status');
  var q = document.getElementById('ask-q');

  // Prefill from the home page box (/ask?q=...)
  var pre = new URLSearchParams(window.location.search).get('q');
  if (pre && q) q.value = pre;

  function show(msg, ok) {
    status.className = 'status ' + (ok ? 'status-ok' : 'status-err');
    status.textContent = msg;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) {
      show('Please write your question and add an email so I can reply.', false);
      return;
    }
    if (FORM_ENDPOINT.indexOf('YOUR_FORM_ID') !== -1) {
      show('The question form is not connected yet. Please try again soon.', false);
      return;
    }
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    fetch(FORM_ENDPOINT, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      if (!res.ok) throw new Error('failed');
      form.reset();
      show('Thanks — your question is in! I\'ll reply by email.', true);
    }).catch(function () {
      show('Sorry, something went wrong. Please try again in a moment.', false);
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Send my question';
    });
  });
});
