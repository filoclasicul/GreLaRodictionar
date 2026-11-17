function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export async function onRequestPost({ request, env }) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse({ error: 'Formatul cererii nu este valid.' }, 415);
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 12000) {
    return jsonResponse({ error: 'Mesajul este prea mare.' }, 413);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Datele formularului nu sunt valide.' }, 400);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse({ error: 'Datele formularului nu sunt valide.' }, 400);
  }

  if (typeof payload.website === 'string' && payload.website.trim()) {
    return jsonResponse({ error: 'Formularul nu a putut fi trimis.' }, 400);
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  if (message.length < 5 || message.length > 5000) {
    return jsonResponse({ error: 'Mesajul trebuie să aibă între 5 și 5000 de caractere.' }, 400);
  }

  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))) {
    return jsonResponse({ error: 'Adresa de email introdusă nu este validă.' }, 400);
  }

  const { RESEND_API_KEY, FEEDBACK_TO, RESEND_FROM_EMAIL } = env;
  if (!RESEND_API_KEY || !FEEDBACK_TO || !RESEND_FROM_EMAIL) {
    return jsonResponse({ error: 'Formularul nu este configurat încă. Încearcă din nou mai târziu.' }, 503);
  }

  const emailPayload = {
    from: RESEND_FROM_EMAIL,
    to: [FEEDBACK_TO],
    subject: 'Mesaj nou de pe Dicționar Online',
    text: `Mesaj primit de la un vizitator:\n\n${message}${email ? `\n\nEmail pentru răspuns: ${email}` : ''}`,
    html: `<p>Mesaj primit de la un vizitator:</p><pre style="font: inherit; white-space: pre-wrap;">${escapeHtml(message)}</pre>${email ? `<p>Email pentru răspuns: <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>` : ''}`
  };
  if (email) emailPayload.reply_to = email;

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });
  } catch (error) {
    console.error('Feedback email delivery failed.', error);
    return jsonResponse({ error: 'Nu s-a putut conecta la serviciul de email. Încearcă din nou.' }, 502);
  }

  if (!response.ok) {
    console.error(`Feedback email provider returned HTTP ${response.status}.`);
    return jsonResponse({ error: 'Emailul nu a putut fi trimis acum. Încearcă din nou mai târziu.' }, 502);
  }

  return jsonResponse({ ok: true });
}
