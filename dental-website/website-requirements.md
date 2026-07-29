# Clínica Dentária Nunes Monteiro — Website Requirements & Development Plan
**Version 1.0 · Single Source of Truth · 24 July 2026**

Scope: the free bonus website promised verbally alongside the Acácia voice-agent build. Premium-looking, mobile-first, fast, one-page (plus legal pages). Not a CMS, not a booking portal.

---

## 1. Client Facts (Confirmed — from intake form + Guião Acácia)

| Field | Value | Source |
|---|---|---|
| Legal/trading name | Clínica Dentária Nunes Monteiro | Intake form |
| Principal contact | Doutora Ana Nunes | Intake form |
| Email | geral@clinicadentariaih.com | Intake form |
| Phone | 928 494 871 | Intake form |
| Address | Rua Miguel Judicibus Ferreira 29A, Malveira | Both |
| Hours | Mon–Fri 09:30–12:30, 14:00–18:00 | Intake form (Guião confirms lunch closure) |
| Closed | Sundays, public holidays, lunch hour | Guião |
| Services | Urgências, Tratamentos Restauradores, Implantologia, Estética Dentária, Ortodontia, Endodontia | Intake form |
| Languages spoken | Portuguese, English, Spanish | Guião Q94 |
| Evaluation consult | €45 | Guião |
| Hygiene (base) | €45 | Guião |
| Payment methods | Debit/credit card, cash, bank transfer, Scalapay | Guião |
| Instalments | Scalapay + direct debit for high-value plans | Guião |
| Insurers | AdvanceCare, RNA-ADE, Liga dos Combatentes protocol | Guião |
| Not accepted | SNS Cheque-Dentista | Guião |
| On-site imaging | No panoramic X-ray | Guião |
| Recall cadence | 6 months | Guião Q96 |
| Cancellation notice | 24 hours | Guião |
| Late tolerance | 10–15 minutes | Guião |
| New patients | Not booked directly — callback after capacity check | Guião |
| Existing web presence | None. No site, no Instagram, no Facebook | Intake form |

---

## 2. Derived Information (Inferred — 100% safe assumptions, flag ⚠ where confirmation is cheap)

These are not in the documents but follow necessarily from what is. They fill content gaps so the build isn't blocked.

**Regulatory & legal**
- Portugal → **GDPR/RGPD applies in full.** A privacy policy is mandatory; a cookie banner is mandatory if any non-essential cookie or analytics script loads.
- Dental clinics in Portugal are regulated by **ERS (Entidade Reguladora da Saúde)** and must display their ERS registration number. ⚠ Ask Ana for the number — placeholder until then.
- Dentists are registered with **Ordem dos Médicos Dentistas (OMD)**. Practitioner OMD numbers are customary on clinic sites. ⚠ Ask.
- Portuguese consumer law requires a link to the **RAL / Livro de Reclamações Eletrónico** (livroreclamacoes.pt). Non-negotiable, cheap to add.
- Health advertising rules (ERS): no before/after imagery implying guaranteed outcomes, no superlatives ("o melhor"), no price claims that can't be honoured. Pricing shown must be labelled "a partir de" (from).
- A **NIF / company registration number** exists and belongs in the footer. ⚠ Ask.

**Practice profile**
- Malveira is a commuter town in Mafra municipality, Lisbon district → catchment is local + commuter, not tourist-primary. SEO targets Malveira, Mafra, Venda do Pinheiro, Ericeira, Sobral de Monte Agraço.
- A six-service general practice with implantology and orthodontics is a **general family practice with surgical capability**, not a boutique cosmetic clinic. Tone: trustworthy, calm, family-appropriate — not luxury spa.
- No panoramic X-ray on site → the clinic **refers out for imaging**. Do not claim imaging capability anywhere on the site.
- Split shift + Saturday absence from the hours field → **closed Saturdays.** ⚠ Confirm; if they open alternate Saturdays this must be corrected before launch.
- Free/street parking is the norm in Malveira. ⚠ Confirm before claiming "parking available."
- Building is street-level retail frontage (29A address format) → likely ground-floor accessible. ⚠ Confirm before claiming accessibility.
- The clinic has **staff who answer WhatsApp** (Guião Q11 directs patients there) → a WhatsApp click-to-chat button is justified and will be the highest-converting element on mobile.

**Technical**
- Primary audience language is **European Portuguese (pt-PT)**. English is a secondary nice-to-have, not launch-blocking.
- ~70–80% of traffic will be mobile, arriving from Google Maps / "dentista perto de mim" searches. Mobile-first is not a preference, it's the design constraint.
- The clinic almost certainly has **no Google Business Profile** (no digital presence at all) → claiming and populating it will drive more patients than the website itself. Include as a launch task.
- No existing domain. A domain must be purchased. The email `geral@clinicadentariaih.com` implies the domain **clinicadentariaih.com already exists and is owned** (email is live). ⚠ Critical: confirm ownership and DNS access — this changes hosting setup entirely.

---

## 3. Open Items Blocking Nothing (ask in one batch)

1. ERS registration number
2. OMD number(s) for Dra. Ana Nunes and any other clinicians
3. NIF / company name as registered
4. DNS access for clinicadentariaih.com (or confirmation it's registered elsewhere)
5. Saturday opening — closed or by appointment?
6. Parking and step-free access — yes/no
7. Photos: exterior, reception, one treatment room, team (see §8)
8. Preferred booking channel for the site CTA: phone, WhatsApp, or form

None of these stop the build. Placeholders go in, swapped before launch.

---

## 4. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Astro 5** | Ships zero JS by default. Best Lighthouse scores of any modern framework for a brochure site. Component model without React's weight. |
| Styling | **Tailwind CSS 4** | Speed of build; no custom CSS architecture to maintain. |
| Interactivity | Vanilla JS islands (mobile nav, FAQ accordion) | No framework runtime needed for three widgets. |
| Forms | **Web3Forms** or **Formspree** free tier → email to geral@ | No backend, no database, no GDPR data-storage liability. |
| Hosting | **Vercel** (free tier) or **Cloudflare Pages** | Global CDN, automatic HTTPS, atomic deploys. Cloudflare preferred if DNS moves there. |
| Domain | clinicadentariaih.com (pending confirmation) | Matches existing email. |
| Analytics | **Plausible** or **Cloudflare Web Analytics** | Cookieless → no consent banner required for analytics alone. Materially simplifies GDPR. |
| Maps | Static map image + link to Google Maps | Embedded iframe sets Google cookies → triggers consent. Static image avoids this entirely. |
| Fonts | Self-hosted WOFF2 | Google Fonts CDN transmits IP to Google — a live GDPR issue in the EU. Self-host. |
| Images | AVIF + WebP, `<picture>`, lazy-loaded below fold | Core Web Vitals. |
| Version control | Git → GitHub → Vercel auto-deploy | Standard. |

**Explicitly rejected:** WordPress (maintenance liability on a free deliverable), any page builder (poor performance), React/Next (unnecessary payload), embedded Google Maps iframe, Google Fonts CDN, Google Analytics.

---

## 5. Sitemap & Information Architecture

The site is a **one-page scroller with anchor sections** plus separate legal pages. This is the right shape: one page ranks fine for a single-location local business, loads once, and gives the "premium" continuous-scroll feel.

```
/                          Home (single page, anchored sections)
  #inicio                  Hero
  #servicos                Services
  #sobre                   About / team
  #precos                  Pricing & payment
  #urgencias               Emergencies
  #faq                     FAQ
  #contactos               Contact, hours, map
/politica-de-privacidade   Privacy policy (RGPD)
/termos                    Terms of use
/livro-de-reclamacoes      Redirect → livroreclamacoes.pt
/404                       Not found
```

**Files at root:**
- `sitemap.xml` — auto-generated by `@astrojs/sitemap`
- `robots.txt` — allow all, point to sitemap
- `site.webmanifest`, favicons, `apple-touch-icon.png`

**Navigation (sticky header):** Início · Serviços · Sobre · Preços · FAQ · Contactos + primary CTA button **"Marcar Consulta"** (tel: link on mobile, scrolls to form on desktop).

**Mobile sticky footer bar:** [Ligar] [WhatsApp] [Direções] — always visible, thumb-reachable. This is the single highest-impact conversion element.

---

## 6. Page-by-Page Content Specification

All copy in **European Portuguese**. Written from confirmed facts only — nothing invented about outcomes, technology, or experience.

### 6.1 Hero (`#inicio`)
- **H1:** `Clínica Dentária Nunes Monteiro`
- **Subhead:** `Medicina dentária de confiança na Malveira. Consultas de urgência, implantologia, ortodontia e estética dentária.`
- **Trust line:** `Português · English · Español`
- **CTAs:** primary `Ligar 928 494 871` (tel:) · secondary `Marcar por WhatsApp`
- **Hours strip:** `Seg–Sex · 09:30–12:30 · 14:00–18:00`
- **Background:** clinic exterior or reception photo, dark overlay for text contrast.

### 6.2 Services (`#servicos`)
Six cards, icon + title + two-line description. Order deliberately puts Urgências first (highest-intent searches).

1. **Urgências Dentárias** — Dor, inchaço ou dente partido? Damos prioridade a situações urgentes.
2. **Tratamentos Restauradores** — Restaurações e reconstruções para devolver função e conforto ao seu dente.
3. **Implantologia** — Substituição de dentes em falta com implantes dentários.
4. **Estética Dentária** — Branqueamento e facetas para um sorriso mais harmonioso.
5. **Ortodontia** — Aparelhos fixos e alinhadores para crianças, adolescentes e adultos.
6. **Endodontia** — Tratamento de canais radiculares, preservando o dente natural.

> Compliance note: no claims of speed, painlessness, or guaranteed results.

### 6.3 About (`#sobre`)
- Short paragraph: general practice serving Malveira and the Mafra region, full range of treatments from prevention to implants, multilingual team.
- **Dra. Ana Nunes** — photo, name, role, OMD number ⚠.
- Trust markers row: `Registada na ERS ⚠` · `Ordem dos Médicos Dentistas ⚠` · `Consulta em PT / EN / ES`
- If no team photos are supplied by launch: replace with a clean interior shot and drop the individual cards rather than using stock people. Stock faces on a medical site destroy exactly the trust you're building.

### 6.4 Pricing & Payment (`#precos`)
- `Consulta de avaliação — €45`
- `Higiene oral — a partir de €45`
- Mandatory line: `O valor exato de qualquer tratamento só pode ser definido após consulta clínica de avaliação.` (Directly from the client's never-do rule.)
- **Payment:** Multibanco/cartão de débito e crédito · Numerário · Transferência bancária · Scalapay
- **Instalments:** `Planos de pagamento faseado disponíveis através de Scalapay e débito direto para tratamentos de valor mais elevado.`
- **Insurers:** AdvanceCare · RNA-ADE · Protocolo Liga dos Combatentes
- **Explicit:** `Não aceitamos Cheque-Dentista (SNS).` — Better said plainly on the site than discovered at reception.

### 6.5 Emergencies (`#urgencias`)
Visually distinct block (warm accent, bordered).
- `Dor intensa, inchaço, dente partido ou traumatismo? Ligue-nos.`
- Large `928 494 871` tel: link.
- `Fora do horário, deixe a sua mensagem e a nossa equipa entra em contacto consigo.` ⚠ Wording depends on resolving the Guião Q69 "equipa de piquete" contradiction. Keep it non-committal until the routing is settled — do not promise 24h availability.

### 6.6 FAQ (`#faq`)
Accordion. **Ten questions selected from the Guião** so the site and Acácia give identical answers. This matters: it is a knowledge-consistency requirement, not just content.

1. Como posso marcar consulta?
2. Quais são os vossos horários?
3. Onde ficam localizados?
4. Quanto custa a primeira consulta?
5. Que seguros e protocolos aceitam?
6. Como posso pagar? Existem pagamentos faseados?
7. O que fazer numa urgência dentária?
8. Com que frequência devo fazer uma consulta de rotina?
9. Preciso de avisar com quanta antecedência para cancelar?
10. Falam outras línguas?

Answers must be lifted from the Guião verbatim-in-substance. **Mark up with FAQPage JSON-LD** — this earns rich results in Google and is the cheapest SEO win available.

### 6.7 Contact (`#contactos`)
- Address, phone (tel:), email (mailto:), WhatsApp (wa.me link)
- Hours table including explicit lunch closure and Sunday closure
- Static map image linking to Google Maps directions
- **Contact form:** Nome · Telefone · Email · Assunto (select: Marcação / Urgência / Informação) · Mensagem · RGPD consent checkbox (unticked by default — a pre-ticked box is invalid consent under GDPR)
- Form microcopy: `Novos pacientes: entraremos em contacto para confirmar disponibilidade antes de agendar.` — Encodes the new-patient gatekeeping rule so the site matches Acácia's behaviour.

### 6.8 Footer
Clinic name · address · phone · email · NIF ⚠ · ERS nº ⚠ · links to Privacy, Terms, Livro de Reclamações · `© 2026`

---

## 7. Design Direction

**Positioning:** clean clinical trust, not luxury. Restraint reads as premium here; gradients and glassmorphism read as template.

**Palette**
| Token | Hex | Use |
|---|---|---|
| Primary | `#0E5C63` deep teal | Headers, buttons, accents |
| Primary dark | `#083E43` | Hover, footer |
| Accent | `#C9A227` muted gold | Sparingly — dividers, icon highlights |
| Emergency | `#B3453B` | Urgências block only |
| Surface | `#F7F9F9` | Section alternation |
| Text | `#1A2426` | Body |
| Muted | `#5C6B6D` | Secondary text |

Teal: standard trust colour in healthcare without being the generic corporate blue every dentist uses. Gold in tiny doses supplies the "premium" without cost.

**Typography** (self-hosted)
- Headings: **Fraunces** or **Instrument Serif** — a serif is what separates this from a template. Use it only for H1/H2.
- Body: **Inter** or **General Sans**
- Scale: 1.25 ratio · body 17px mobile / 18px desktop · line-height 1.6

**Layout**
- Max content width 1200px, generous whitespace (96px section padding desktop / 64px mobile)
- 8px spacing grid
- Cards: 1px border + very soft shadow, 12px radius — no heavy drop shadows
- Motion: fade-up on scroll only, 300ms, `prefers-reduced-motion` respected. Nothing else moves.

---

## 8. Graphics Plan (no assets currently exist)

**Tier 1 — request from Ana (best outcome, costs nothing).** A phone camera and daylight is enough. Ask for:
1. Clinic exterior with signage — becomes the hero
2. Reception / waiting area
3. One treatment room, tidy, no patients, no visible instruments in trays
4. Dra. Ana Nunes, head-and-shoulders, neutral background
5. Team group shot if a team exists

Guidance to send her: natural light, blinds open, landscape orientation, horizontal, nothing personal or patient-identifying in frame.

**Tier 2 — licensed stock fallback (if photos don't arrive).** Unsplash/Pexels, free for commercial use.
- Hero: modern clinic interior, wide, bright, no people
- Section breaks: abstract clinical texture, soft focus
- **Rule: no stock photos of fake dentists or fake patients.** A generic smiling model in scrubs is instantly recognisable and actively damages credibility for a local practice. Interiors and abstracts only.

**Tier 3 — generated / built assets (always needed)**
- **Service icons:** Lucide icon set, 24px stroke 1.5, in primary teal. Consistent, free, weightless.
- **Logo:** none exists. Build a wordmark — "Nunes Monteiro" set in the heading serif, small tooth or leaf-mark in gold. Deliver as SVG. 30 minutes of work, and it is the single element that makes the site look designed rather than assembled.
- **Favicon set:** derived from the mark, 16/32/180/512px.
- **Static map:** screenshot of the Google Maps location, styled, with a teal pin overlay.
- **OG image:** 1200×630, logo + clinic name + Malveira, for WhatsApp/Facebook link previews. Portuguese patients share links on WhatsApp constantly — this is more visible than it sounds.

**Image budget:** hero ≤200KB AVIF, section images ≤120KB each, total page weight target **under 800KB**.

---

## 9. SEO Specification

**Primary keywords (pt-PT):**
`clínica dentária Malveira` · `dentista Malveira` · `dentista Mafra` · `urgência dentária Malveira` · `implantes dentários Malveira` · `ortodontia Mafra` · `dentista perto de mim`

**On-page**
- `<title>`: `Clínica Dentária Nunes Monteiro | Dentista na Malveira` (≤60 chars)
- `<meta description>`: `Clínica dentária na Malveira. Urgências, implantologia, ortodontia, estética e endodontia. Seg–Sex 09:30–12:30 e 14:00–18:00. Ligue 928 494 871.` (≤155 chars)
- One `<h1>` only; sections use `<h2>`
- `lang="pt-PT"` on `<html>`
- Semantic HTML5 landmarks throughout
- Descriptive alt text on every image, in Portuguese
- Canonical URL set

**Structured data (JSON-LD) — highest-leverage item on this list**
- `Dentist` (subtype of `MedicalBusiness` + `LocalBusiness`) with `name`, `address` (PostalAddress), `geo`, `telephone`, `email`, `openingHoursSpecification` (must encode **both** shifts as separate entries — a single 09:30–18:00 block is wrong and Google will show wrong hours), `priceRange: "€€"`, `availableLanguage: [pt, en, es]`, `medicalSpecialty`
- `FAQPage` on the FAQ section
- `BreadcrumbList` on legal pages

**Off-site (drives more traffic than the site itself)**
1. **Create and verify Google Business Profile** — categories: Dentista, Clínica dentária. Same NAP as the site, byte-for-byte. Upload the same photos. Add both hour shifts.
2. Register on **Doctoralia** and **Portugal Dental directories** — free listings, strong domain authority.
3. NAP consistency across every listing. Inconsistent phone formatting is the most common local-SEO failure.

**Technical SEO**
- `sitemap.xml` submitted to Google Search Console
- `robots.txt` allowing all + sitemap reference
- HTTPS enforced, HSTS
- No orphan pages, no redirect chains

---

## 10. Performance Targets

| Metric | Target |
|---|---|
| Lighthouse Performance (mobile) | ≥ 95 |
| Accessibility | ≥ 95 |
| Best Practices | 100 |
| SEO | 100 |
| LCP | < 1.8s on 4G |
| CLS | < 0.05 |
| INP | < 100ms |
| Total page weight | < 800KB |
| JS shipped | < 20KB |

**How they're hit:** Astro static output, zero-JS default, self-hosted subset fonts with `font-display: swap` and preload, AVIF/WebP with explicit width/height on every image, hero preloaded and eager, everything else lazy, critical CSS inlined, CDN edge caching, no third-party scripts except cookieless analytics.

---

## 11. Security & Compliance

**Security**
- HTTPS only, automatic renewal, HSTS `max-age=31536000; includeSubDomains`
- Security headers via `vercel.json` / `_headers`:
  - `Content-Security-Policy` (strict; self + form endpoint only)
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- Static site → no database, no server, no admin login, **no attack surface**. This is a deliberate architectural choice, and it's why a free deliverable carries no ongoing security liability.
- Form spam: honeypot field + provider-side rate limiting. No CAPTCHA (reCAPTCHA is a GDPR problem and hurts conversion).
- Dependabot on the repo.

**GDPR / RGPD**
- Privacy policy in Portuguese covering: controller identity, data collected via the form, lawful basis (consent), purpose, retention, third-party processors (form provider, host), and data-subject rights.
- Consent checkbox on the form, unticked, with a link to the policy.
- Cookieless analytics → **no cookie banner needed.** If Ana later wants Meta Pixel or GA, a consent banner becomes mandatory. Document this as a condition.
- No embedded Google Maps iframe, no Google Fonts CDN — both transmit visitor IPs to Google without consent.
- Health data: the form must **not** invite clinical details. Microcopy: `Por favor não partilhe informação clínica detalhada neste formulário.` Health data is a special category under Art. 9 and an unencrypted email form is not an appropriate channel for it.
- Form submissions go to email only — nothing stored on the site.

**Accessibility (WCAG 2.1 AA)**
- 4.5:1 contrast minimum (palette above is compliant — verify the gold on white, it likely isn't; use gold on dark only)
- Full keyboard navigation, visible focus rings
- Labelled form fields, `aria-expanded` on accordions and mobile nav
- Tap targets ≥ 44px
- `prefers-reduced-motion` honoured

---

## 12. Build Sequence (target: 4–6 working hours)

| # | Task | Est. |
|---|---|---|
| 0 | Confirm domain ownership + DNS access | 15m |
| 1 | Astro + Tailwind scaffold, repo, Vercel connected | 30m |
| 2 | Design tokens, fonts self-hosted, base layout | 45m |
| 3 | Logo wordmark + favicon set | 30m |
| 4 | Header, sticky mobile action bar, footer | 45m |
| 5 | Hero + Services sections | 45m |
| 6 | About, Pricing, Emergencies | 45m |
| 7 | FAQ accordion + FAQPage JSON-LD | 30m |
| 8 | Contact section, form, static map | 45m |
| 9 | Privacy policy + Terms pages | 30m |
| 10 | LocalBusiness/Dentist JSON-LD, meta, OG image, sitemap, robots | 30m |
| 11 | Security headers, Lighthouse pass, fix to targets | 45m |
| 12 | Real photos swapped in, placeholders removed | 30m |
| 13 | DNS cutover, Search Console, Google Business Profile | 45m |

---

## 13. Definition of Done

- [ ] All Lighthouse targets in §10 met on mobile
- [ ] Zero placeholder text (`⚠` items resolved or the element removed)
- [ ] Every phone number is a `tel:` link; WhatsApp link tested on a real device
- [ ] Both hour shifts correct in copy **and** in JSON-LD
- [ ] Form delivers to geral@clinicadentariaih.com — tested end to end
- [ ] Privacy policy live and linked from the form
- [ ] No stock photos of people
- [ ] FAQ answers match the Guião so Acácia and the site never contradict each other
- [ ] `sitemap.xml` submitted to Search Console
- [ ] Google Business Profile created with matching NAP
- [ ] Tested on real iOS Safari and Android Chrome, not just devtools

---

## 14. Explicitly Out of Scope

Named here to protect the free deliverable from growing. Each is a future paid engagement.

- Online booking widget writing to Google Calendar → **Upsell: Tier 2**
- Website chatbot → **Upsell: Tier 1**, only worth it once traffic exists
- Blog / CMS / content marketing
- Multi-language (EN/ES) versions of the site
- Patient portal, records, or login
- Ongoing content updates beyond launch
- Paid search or social campaigns
- Second location pages

**Support:** 90 days of bug fixes and factual corrections included. Content and feature changes thereafter fall under a maintenance agreement.

---

## 15. Change Control

This document is the single source of truth. Any change to scope, content, or stack is amended here first and version-bumped. Verbal additions that don't appear in this document are not in scope.
