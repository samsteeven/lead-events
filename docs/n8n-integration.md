# Raccorder le workflow n8n « Lead Agent »

> **Statut : non testé contre une instance n8n réelle.** Le simulateur (`simulator/simulate.mjs`) reproduit exactement les trois appels décrits ici, signature comprise ; le raccordement à ton instance est une étape à faire de ton côté, décrite ci-dessous.

## Principe
Le workflow garde son rôle (enrichir, scorer, écrire l'e-mail) et prévient l'API à trois endroits :

| Après quelle étape | `type` | Champs en plus |
|---|---|---|
| soumission du formulaire de contact | `lead.received` | |
| scoring par le modèle | `lead.scored` | `score` (entier de 1 à 10), `scoreReason` |
| envoi de l'e-mail personnalisé | `email.sent` | |

Chaque appel est un `POST /webhooks/n8n` signé (HMAC-SHA256). L'API enregistre le lead dans PostgreSQL, publie l'événement dans Kafka et répond `202`.

## Règles à respecter dans n8n
1. **L'analytique ne doit jamais bloquer la qualification des leads.** Sur chacun des trois nœuds HTTP : « Continue on fail » activé (`onError: continueRegularOutput`) pour que l'e-mail parte même si l'API est indisponible.
2. **Réessais** : « Retry on fail » (3 essais, 1 s d'intervalle). Sans danger : la clé d'idempotence rend un rejeu sans effet.
3. **Corps brut** : la signature porte sur les octets envoyés. Le nœud HTTP doit envoyer la chaîne signée telle quelle (`Body Content Type: Raw`), et non un objet que n8n re-sérialiserait.
4. **Clé d'idempotence** : `<id d'exécution n8n>:<type>`. Elle est identique d'un essai à l'autre de la même exécution, et distincte entre deux exécutions.

## Corps de l'appel

```json
{
  "type": "lead.scored",
  "idempotencyKey": "1234567:lead.scored",
  "occurredAt": "2026-10-25T10:00:03.000Z",
  "lead": {
    "externalId": "42",
    "email": "prospect@exemple.fr",
    "fullName": "Camille Martin",
    "company": "Atelier Nova",
    "message": "Texte du formulaire",
    "source": "contact-form"
  },
  "score": 8,
  "scoreReason": "budget confirmé et besoin urgent"
}
```
`lead.externalId` est l'identifiant du lead dans ta CRM n8n : c'est lui qui relie les trois événements d'un même lead. `lead.email` est requis à chaque appel. `score` n'est attendu (et requis) que pour `lead.scored`.

## Signature
En-tête `x-lead-signature: t=<horodatage unix en secondes>,v1=<HMAC-SHA256 hexadécimal>`, où le HMAC porte sur la chaîne `"<t>.<corps brut>"` avec le secret partagé (`WEBHOOK_SECRET`). Un horodatage éloigné de plus de 5 minutes est refusé (limite le rejeu d'un appel capturé).

### Option A : nœud Code (JavaScript)
```js
const crypto = require('crypto');
const secret = $env.LEAD_EVENTS_WEBHOOK_SECRET;
const type = 'lead.scored'; // 'lead.received' | 'lead.scored' | 'email.sent'

const body = JSON.stringify({
  type,
  idempotencyKey: `${$execution.id}:${type}`,
  occurredAt: new Date().toISOString(),
  lead: { externalId: String($json.id), email: $json.email, fullName: $json.name, company: $json.company, message: $json.message },
  score: $json.score,
  scoreReason: $json.reason,
});
const t = Math.floor(Date.now() / 1000);
const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

return [{ json: { body, signature: `t=${t},v1=${v1}` } }];
```
Selon la configuration de n8n, `require('crypto')` peut exiger `NODE_FUNCTION_ALLOW_BUILTIN=crypto` ; le secret se lit via une variable d'environnement n8n plutôt qu'en dur dans le workflow.

### Option B : nœud « Crypto »
Action `Hmac`, type `SHA256`, valeur `{{ $json.t }}.{{ $json.body }}`, secret = le secret partagé, encodage `hex`. Évite d'autoriser `require` dans le nœud Code.

## Nœud « HTTP Request »
| Réglage | Valeur |
|---|---|
| Méthode | `POST` |
| URL | `https://<votre-api>/webhooks/n8n` |
| En-têtes | `x-lead-signature` = `{{ $json.signature }}` ; `content-type` = `application/json` |
| Corps | `Raw`, type de contenu `application/json`, valeur `{{ $json.body }}` |
| Paramètres | Retry on fail : 3 essais, 1000 ms. Continue on fail : activé |

Réponses : `202` accepté (`duplicate: true` pour un rejeu déjà publié), `400` corps invalide, `401` signature absente, fausse ou expirée, `503` Kafka indisponible (n8n réessaie).

## Exposer l'API
L'instance n8n doit pouvoir joindre l'API. Mettre l'API derrière un proxy HTTPS (Caddy, nginx) ; le webhook est protégé par la signature, les routes `/stats` et `/leads` par le jeton `DASHBOARD_TOKEN`. **Ne jamais publier le secret ni le jeton dans le workflow exporté ou dans git.**

## Données personnelles
Les leads sont des données personnelles (nom, e-mail, société, message). L'API les conserve dans PostgreSQL ; le tableau de bord masque les adresses (`c***@exemple.fr`). L'effacement d'un lead (`DELETE /leads/<externalId>` ou `POST /leads/erase`, avec `ADMIN_TOKEN`) et une durée de conservation (`LEAD_RETENTION_DAYS`) existent : voir le README. **Les activer et définir la durée avant de brancher de vrais leads.**
