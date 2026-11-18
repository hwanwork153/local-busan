// Ask a Local form.
// 1. Create a free form at https://formspree.io (sign up with your email).
// 2. Paste your form's endpoint below, e.g. 'https://formspree.io/f/abcdwxyz'.
var FORM_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID';

var ASK_T = {
  en: { invalid: 'Please write your question and add an email so I can reply.', off: 'The question form is not connected yet. Please try again soon.', sending: 'Sending…', ok: "Thanks — your question is in! We'll reply by email.", fail: 'Sorry, something went wrong. Please try again in a moment.', send: 'Send my question' },
  ja: { invalid: '質問内容と返信用のメールアドレスを入力してください。', off: '質問フォームはまだ準備中です。しばらくしてからもう一度お試しください。', sending: '送信中…', ok: 'ありがとうございます！質問を受け付けました。メールで返信します。', fail: '送信できませんでした。少し時間をおいてもう一度お試しください。', send: '質問を送る' },
  zh: { invalid: '请填写你的问题和用于回复的邮箱。', off: '提问表单尚未开通，请稍后再试。', sending: '发送中…', ok: '谢谢！我们已收到你的问题，会通过邮件回复。', fail: '抱歉，发送失败，请稍后再试。', send: '发送问题' }
};
var AT = ASK_T[(document.documentElement.lang || 'en').slice(0, 2)] || ASK_T.en;

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
      show(AT.invalid, false);
      return;
    }
    if (FORM_ENDPOINT.indexOf('YOUR_FORM_ID') !== -1) {
      show(AT.off, false);
      return;
    }
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = AT.sending;
    fetch(FORM_ENDPOINT, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      if (!res.ok) throw new Error('failed');
      form.reset();
      show(AT.ok, true);
    }).catch(function () {
      show(AT.fail, false);
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = AT.send;
    });
  });
});
