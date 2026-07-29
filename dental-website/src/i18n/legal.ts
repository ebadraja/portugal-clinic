import type { Lang } from './config';
import { site } from '../data/site';

type LegalSection = { heading: string; html: string };

const privacy: Record<Lang, LegalSection[]> = {
  pt: [
    {
      heading: '1. Responsável pelo tratamento',
      html: `O responsável pelo tratamento dos dados pessoais é a <strong>${site.name}</strong>, com sede em ${site.address.full}, contacto ${site.email} / ${site.phoneDisplay}. NIF: ${site.nif}.`,
    },
    {
      heading: '2. Dados recolhidos',
      html: `Através do formulário de contacto neste website, podemos recolher: nome, telefone, email, assunto e mensagem. Pedimos que <strong>não envie informação clínica detalhada</strong> por este canal.`,
    },
    {
      heading: '3. Finalidade e base legal',
      html: `Os dados são tratados exclusivamente para responder ao seu pedido de contacto ou marcação, com base no seu <strong>consentimento</strong> (art. 6.º, n.º 1, alínea a) do RGPD), prestado através da caixa de verificação do formulário.`,
    },
    {
      heading: '4. Conservação',
      html: `Os dados do formulário são enviados por email para a clínica e não são armazenados numa base de dados do website. Conservamo-los apenas pelo tempo necessário para dar seguimento ao pedido, salvo obrigação legal em contrário.`,
    },
    {
      heading: '5. Destinatários / subprocessadores',
      html: `<ul><li>Prestador do formulário (Web3Forms) — envio da mensagem por email</li><li>Prestador de alojamento do website (Vercel / Cloudflare Pages)</li></ul><p>Não vendemos nem partilhamos os seus dados para fins de marketing de terceiros.</p>`,
    },
    {
      heading: '6. Cookies e analytics',
      html: `Este website não utiliza cookies não essenciais nem ferramentas de analytics que exijam consentimento. Se no futuro forem adicionados cookies de marketing ou analytics de terceiros, será apresentado um banner de consentimento.`,
    },
    {
      heading: '7. Os seus direitos',
      html: `Nos termos do RGPD, pode solicitar acesso, rectificação, apagamento, limitação, oposição e portabilidade dos seus dados, bem como retirar o consentimento a qualquer momento. Para exercer estes direitos, contacte ${site.email}. Tem ainda o direito de apresentar reclamação à Comissão Nacional de Protecção de Dados (CNPD) em <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer">www.cnpd.pt</a>.`,
    },
    {
      heading: '8. Segurança',
      html: `O website é servido exclusivamente via HTTPS. Não armazenamos dados de saúde neste canal. Para assuntos clínicos, utilize o telefone ou a consulta presencial.`,
    },
  ],
  en: [
    {
      heading: '1. Data controller',
      html: `The controller of personal data is <strong>${site.name}</strong>, based at ${site.address.full}, contact ${site.email} / ${site.phoneDisplay}. NIF: ${site.nif}.`,
    },
    {
      heading: '2. Data collected',
      html: `Through the contact form on this website we may collect: name, phone, email, subject and message. Please <strong>do not send detailed clinical information</strong> through this channel.`,
    },
    {
      heading: '3. Purpose and legal basis',
      html: `Data are processed solely to respond to your contact or booking request, based on your <strong>consent</strong> (Art. 6(1)(a) GDPR), given via the form checkbox.`,
    },
    {
      heading: '4. Retention',
      html: `Form data are emailed to the clinic and are not stored in a website database. We keep them only as long as needed to follow up your request, unless a legal obligation requires otherwise.`,
    },
    {
      heading: '5. Recipients / processors',
      html: `<ul><li>Form provider (Web3Forms) — email delivery of the message</li><li>Website hosting provider (Vercel / Cloudflare Pages)</li></ul><p>We do not sell or share your data for third-party marketing.</p>`,
    },
    {
      heading: '6. Cookies and analytics',
      html: `This website does not use non-essential cookies or analytics tools that require consent. If marketing cookies or third-party analytics are added later, a consent banner will be shown.`,
    },
    {
      heading: '7. Your rights',
      html: `Under the GDPR you may request access, rectification, erasure, restriction, objection and portability of your data, and withdraw consent at any time. To exercise these rights, contact ${site.email}. You may also lodge a complaint with the Portuguese Data Protection Authority (CNPD) at <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer">www.cnpd.pt</a>.`,
    },
    {
      heading: '8. Security',
      html: `The website is served exclusively over HTTPS. We do not store health data through this channel. For clinical matters, please use the phone or an in-person appointment.`,
    },
  ],
  es: [
    {
      heading: '1. Responsable del tratamiento',
      html: `El responsable del tratamiento de los datos personales es <strong>${site.name}</strong>, con sede en ${site.address.full}, contacto ${site.email} / ${site.phoneDisplay}. NIF: ${site.nif}.`,
    },
    {
      heading: '2. Datos recogidos',
      html: `A través del formulario de contacto de este sitio web podemos recoger: nombre, teléfono, email, asunto y mensaje. Le pedimos que <strong>no envíe información clínica detallada</strong> por este canal.`,
    },
    {
      heading: '3. Finalidad y base jurídica',
      html: `Los datos se tratan exclusivamente para responder a su solicitud de contacto o cita, sobre la base de su <strong>consentimiento</strong> (art. 6.1.a del RGPD), prestado mediante la casilla del formulario.`,
    },
    {
      heading: '4. Conservación',
      html: `Los datos del formulario se envían por email a la clínica y no se almacenan en una base de datos del sitio web. Los conservamos solo el tiempo necesario para dar seguimiento a la solicitud, salvo obligación legal en contrario.`,
    },
    {
      heading: '5. Destinatarios / encargados',
      html: `<ul><li>Proveedor del formulario (Web3Forms) — envío del mensaje por email</li><li>Proveedor de alojamiento del sitio (Vercel / Cloudflare Pages)</li></ul><p>No vendemos ni compartimos sus datos para marketing de terceros.</p>`,
    },
    {
      heading: '6. Cookies y analytics',
      html: `Este sitio no utiliza cookies no esenciales ni herramientas de analytics que exijan consentimiento. Si en el futuro se añaden cookies de marketing o analytics de terceros, se mostrará un banner de consentimiento.`,
    },
    {
      heading: '7. Sus derechos',
      html: `Conforme al RGPD, puede solicitar acceso, rectificación, supresión, limitación, oposición y portabilidad de sus datos, así como retirar el consentimiento en cualquier momento. Para ejercer estos derechos, contacte ${site.email}. También puede presentar una reclamación ante la Comisión Nacional de Protecção de Dados (CNPD) en <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer">www.cnpd.pt</a>.`,
    },
    {
      heading: '8. Seguridad',
      html: `El sitio se sirve exclusivamente mediante HTTPS. No almacenamos datos de salud en este canal. Para asuntos clínicos, utilice el teléfono o la consulta presencial.`,
    },
  ],
};

const terms: Record<Lang, LegalSection[]> = {
  pt: [
    {
      heading: '1. Objecto',
      html: `Este website pertence à ${site.name} e tem carácter informativo. Não constitui um portal de marcação automática nem substitui a consulta médica.`,
    },
    {
      heading: '2. Informação clínica',
      html: `Os conteúdos são gerais e não constituem aconselhamento médico personalizado. Qualquer decisão clínica depende de avaliação presencial.`,
    },
    {
      heading: '3. Preços',
      html: `Os valores indicados (consulta de avaliação e higiene oral) são orientativos. O valor exacto de qualquer tratamento só pode ser definido após consulta clínica de avaliação.`,
    },
    {
      heading: '4. Contactos e marcações',
      html: `Pedidos enviados pelo formulário, telefone ou WhatsApp estão sujeitos a confirmação de disponibilidade. Novos pacientes serão contactados antes do agendamento.`,
    },
    {
      heading: '5. Propriedade intelectual',
      html: `Textos, logótipo e elementos gráficos deste website são propriedade da clínica ou utilizados com autorização. É proibida a reprodução sem consentimento prévio.`,
    },
    {
      heading: '6. Lei aplicável',
      html: `Estes termos regem-se pela lei portuguesa. Para reclamações, pode utilizar o Livro de Reclamações Electrónico.`,
    },
    {
      heading: '7. Contacto',
      html: `${site.name} · ${site.address.full} · ${site.email} · ${site.phoneDisplay}`,
    },
  ],
  en: [
    {
      heading: '1. Purpose',
      html: `This website belongs to ${site.name} and is informational. It is not an automated booking portal and does not replace a medical consultation.`,
    },
    {
      heading: '2. Clinical information',
      html: `Content is general and does not constitute personalised medical advice. Any clinical decision depends on an in-person assessment.`,
    },
    {
      heading: '3. Prices',
      html: `The amounts shown (evaluation consultation and oral hygiene) are indicative. The exact cost of any treatment can only be defined after a clinical evaluation appointment.`,
    },
    {
      heading: '4. Contact and bookings',
      html: `Requests sent via the form, phone or WhatsApp are subject to availability confirmation. New patients will be contacted before an appointment is scheduled.`,
    },
    {
      heading: '5. Intellectual property',
      html: `Texts, logo and graphic elements on this website are owned by the clinic or used with permission. Reproduction without prior consent is prohibited.`,
    },
    {
      heading: '6. Applicable law',
      html: `These terms are governed by Portuguese law. For complaints, you may use the Livro de Reclamações Electrónico.`,
    },
    {
      heading: '7. Contact',
      html: `${site.name} · ${site.address.full} · ${site.email} · ${site.phoneDisplay}`,
    },
  ],
  es: [
    {
      heading: '1. Objeto',
      html: `Este sitio web pertenece a ${site.name} y tiene carácter informativo. No constituye un portal de cita automática ni sustituye la consulta médica.`,
    },
    {
      heading: '2. Información clínica',
      html: `Los contenidos son generales y no constituyen consejo médico personalizado. Cualquier decisión clínica depende de una evaluación presencial.`,
    },
    {
      heading: '3. Precios',
      html: `Los importes indicados (consulta de evaluación e higiene oral) son orientativos. El valor exacto de cualquier tratamiento solo puede definirse tras una consulta clínica de evaluación.`,
    },
    {
      heading: '4. Contactos y citas',
      html: `Las solicitudes enviadas por formulario, teléfono o WhatsApp están sujetas a confirmación de disponibilidad. Los nuevos pacientes serán contactados antes de agendar.`,
    },
    {
      heading: '5. Propiedad intelectual',
      html: `Textos, logotipo y elementos gráficos de este sitio son propiedad de la clínica o se utilizan con autorización. Queda prohibida la reproducción sin consentimiento previo.`,
    },
    {
      heading: '6. Ley aplicable',
      html: `Estos términos se rigen por la ley portuguesa. Para reclamaciones, puede utilizar el Livro de Reclamações Electrónico.`,
    },
    {
      heading: '7. Contacto',
      html: `${site.name} · ${site.address.full} · ${site.email} · ${site.phoneDisplay}`,
    },
  ],
};

export function getPrivacySections(lang: Lang) {
  return privacy[lang];
}

export function getTermsSections(lang: Lang) {
  return terms[lang];
}
