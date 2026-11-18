// Home page: example questions fill the question box.
document.addEventListener('DOMContentLoaded', function () {
  var box = document.getElementById('home-q');
  if (!box) return;
  document.querySelectorAll('[data-example]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      box.value = btn.textContent.trim();
      box.focus();
    });
  });
});
