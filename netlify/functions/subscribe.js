/* Fonction serverless Netlish : inscription newsletter -> CiviCRM (API4).
   Reprend l'automatisation du site Pause IA (Pause-IA/pauseai-france,
   src/routes/api/subscribe/+server.ts), simplifiee pour un seul groupe.

   Secrets attendus dans les variables d'environnement Netlify (jamais dans le depot) :
     CIVICRM_BASE_URL   ex. https://crm.pauseia.fr
     CIVICRM_API_KEY    cle d'API du contact de service
     CIVICRM_SITE_KEY   cle de site CiviCRM
     CIVICRM_NEWSLETTER_GROUP_ID  (optionnel) defaut 72 (gid du groupe newsletter Fresque)
*/

const GROUP_ID = Number(process.env.CIVICRM_NEWSLETTER_GROUP_ID || 72);

async function api4(entity, action, params) {
  const base = (process.env.CIVICRM_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.CIVICRM_API_KEY || '';
  const siteKey = (process.env.CIVICRM_SITE_KEY || '').trim();
  if (!base || !apiKey || !siteKey) throw new Error('Configuration CiviCRM manquante');

  const url = `${base}/civicrm/ajax/api4/${encodeURIComponent(entity)}/${encodeURIComponent(action)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Civi-Auth': `Bearer ${apiKey}`,
      'X-Civi-Key': siteKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ params: JSON.stringify(params) }).toString()
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (data.error_message) throw new Error(data.error_message);
  return data;
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };

  let data;
  try { data = JSON.parse(event.body || '{}'); } catch { data = {}; }

  const email = (data.email || '').trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Format d'adresse e-mail invalide" }) };
  }

  try {
    // 1. Chercher le contact par e-mail
    let contactId = null;
    let needEmail = false;
    const found = await api4('Email', 'get', {
      select: ['id', 'contact_id'],
      where: [['email', '=', email]],
      orderBy: { id: 'ASC' },
      limit: 1
    });

    if (found.count && found.values && found.values.length) {
      const cid = Number(found.values[0].contact_id);
      if (cid > 0) {
        const chk = await api4('Contact', 'get', { select: ['id'], where: [['id', '=', cid]], limit: 1 });
        if (chk.count && chk.values && chk.values.length) contactId = cid;
      }
    }

    // 2. Creer le contact si besoin
    if (!contactId) {
      const created = await api4('Contact', 'create', {
        values: {
          contact_type: 'Individual',
          display_name: email,
          source: data.source || 'fresque-risques-ia',
          contact_sub_type: ['Sympathisant']
        }
      });
      if (!created.values || !created.values.length) throw new Error('Création du contact impossible');
      contactId = created.values[0].id;
      needEmail = true;
    }

    // 3. Creer l'e-mail si le contact vient d'etre cree
    if (needEmail) {
      await api4('Email', 'create', {
        values: { contact_id: contactId, email, is_primary: true, 'location_type_id:label': 'Domicile' }
      });
    }

    // 4. Ajouter au groupe newsletter (idempotent)
    const already = await api4('GroupContact', 'get', {
      select: ['group_id'],
      where: [['contact_id', '=', contactId], ['status', '=', 'Added'], ['group_id', '=', GROUP_ID]],
      limit: 1
    });
    const dejaInscrit = Boolean(already.count && already.count > 0);
    if (!dejaInscrit) {
      await api4('GroupContact', 'save', {
        match: ['contact_id', 'group_id'],
        records: [{ contact_id: contactId, group_id: GROUP_ID, status: 'Added' }]
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: dejaInscrit ? 'Vous êtes déjà inscrit·e, merci !' : 'Inscription confirmée, merci !'
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Échec de l'inscription", details: String(err && err.message || err) })
    };
  }
};
