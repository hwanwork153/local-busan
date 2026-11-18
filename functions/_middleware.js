// Send every visit to the main address: https://localbusan.com
// (localbusan.pages.dev and www.localbusan.com redirect permanently).
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'localbusan.pages.dev' || url.hostname === 'www.localbusan.com') {
    url.hostname = 'localbusan.com';
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
