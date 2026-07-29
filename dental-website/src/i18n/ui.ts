import type { Lang } from './config';

const pt = {
  meta: {
    title: 'Clínica Dentária Nunes Monteiro | Dentista na Malveira',
    description:
      'Clínica dentária na Malveira. Urgências, implantologia, ortodontia, estética e endodontia. Seg–Sex 09:30–12:30 e 14:00–18:00. Ligue 928 494 871.',
    privacyTitle: 'Política de Privacidade | Clínica Dentária Nunes Monteiro',
    privacyDescription:
      'Política de privacidade e tratamento de dados pessoais da Clínica Dentária Nunes Monteiro, em conformidade com o RGPD.',
    termsTitle: 'Termos de Utilização | Clínica Dentária Nunes Monteiro',
    termsDescription: 'Termos de utilização do website da Clínica Dentária Nunes Monteiro.',
    livroTitle: 'Livro de Reclamações | Clínica Dentária Nunes Monteiro',
    livroDescription: 'Redireccionamento para o Livro de Reclamações Electrónico.',
    notFoundTitle: 'Página não encontrada | Clínica Dentária Nunes Monteiro',
    notFoundDescription: 'A página pedida não existe.',
  },
  a11y: {
    skip: 'Saltar para o conteúdo',
    mainNav: 'Navegação principal',
    mobileNav: 'Navegação móvel',
    openMenu: 'Abrir menu',
    closeMenu: 'Fechar menu',
    quickActions: 'Acções rápidas',
    langSwitch: 'Seleccionar idioma',
    homeLogo: 'Clínica Dentária Nunes Monteiro — Início',
  },
  nav: {
    home: 'Início',
    services: 'Serviços',
    about: 'Sobre',
    pricing: 'Preços',
    faq: 'FAQ',
    contact: 'Contactos',
    book: 'Marcar Consulta',
    call: 'Ligar',
  },
  mobileBar: {
    call: 'Ligar',
    whatsapp: 'WhatsApp',
    directions: 'Direções',
  },
  hero: {
    location: 'Malveira · Mafra',
    tagline:
      'Medicina dentária de confiança na Malveira. Consultas de urgência, implantologia, ortodontia e estética dentária.',
    languagesSpoken: 'Português · English · Español',
    callCta: 'Ligar',
    whatsappCta: 'Marcar por WhatsApp',
    hoursStrip: 'Seg–Sex · 09:30–12:30 · 14:00–18:00',
    whatsappMessage: 'Olá, gostaria de marcar uma consulta.',
  },
  services: {
    eyebrow: 'Serviços',
    title: 'Cuidados dentários completos',
    intro: 'Da urgência à prevenção, com tratamentos restauradores, cirúrgicos e estéticos.',
    items: [
      {
        title: 'Urgências Dentárias',
        description: 'Dor, inchaço ou dente partido? Damos prioridade a situações urgentes.',
      },
      {
        title: 'Tratamentos Restauradores',
        description:
          'Restaurações e reconstruções para devolver função e conforto ao seu dente.',
      },
      {
        title: 'Implantologia',
        description: 'Substituição de dentes em falta com implantes dentários.',
      },
      {
        title: 'Estética Dentária',
        description: 'Branqueamento e facetas para um sorriso mais harmonioso.',
      },
      {
        title: 'Ortodontia',
        description:
          'Aparelhos fixos e alinhadores para crianças, adolescentes e adultos.',
      },
      {
        title: 'Endodontia',
        description: 'Tratamento de canais radiculares, preservando o dente natural.',
      },
    ],
  },
  about: {
    eyebrow: 'Sobre nós',
    title: 'Uma clínica de confiança na Malveira',
    p1: 'A Clínica Dentária Nunes Monteiro presta medicina dentária à comunidade da Malveira e à região de Mafra — de Venda do Pinheiro a Ericeira e Sobral de Monte Agraço.',
    p2: 'Oferecemos um leque completo de cuidados: da prevenção e higiene oral à implantologia, ortodontia, endodontia e estética dentária. A equipa atende em português, inglês e espanhol.',
    ersLabel: 'Registada na ERS',
    omdLabel: 'Ordem dos Médicos Dentistas',
    consultLabel: 'Consulta em',
    doctorRole: 'Médica Dentista · Responsável clínica',
    doctorBio:
      'Contacto principal da clínica. Número de inscrição na Ordem dos Médicos Dentistas:',
  },
  pricing: {
    eyebrow: 'Preços & pagamento',
    title: 'Transparência desde a primeira consulta',
    evaluation: 'Consulta de avaliação',
    hygiene: 'Higiene oral',
    hygieneFrom: 'a partir de €45',
    disclaimer:
      'O valor exacto de qualquer tratamento só pode ser definido após consulta clínica de avaliação.',
    paymentTitle: 'Pagamento',
    paymentMethods: [
      'Multibanco / cartão de débito e crédito',
      'Numerário',
      'Transferência bancária',
      'Scalapay',
    ],
    instalmentsTitle: 'Pagamentos faseados',
    instalments:
      'Planos de pagamento faseado disponíveis através de Scalapay e débito directo para tratamentos de valor mais elevado.',
    insurersTitle: 'Seguros & protocolos',
    insurers: ['AdvanceCare', 'RNA-ADE', 'Protocolo Liga dos Combatentes'],
    noCheque: 'Não aceitamos Cheque-Dentista (SNS).',
  },
  emergencies: {
    eyebrow: 'Urgências',
    title: 'Dor intensa, inchaço, dente partido ou traumatismo?',
    body: 'Ligue-nos. Damos prioridade a situações urgentes durante o horário de funcionamento.',
    afterHours:
      'Fora do horário, deixe a sua mensagem e a nossa equipa entra em contacto consigo.',
    tapToCall: 'Toque para ligar',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Perguntas frequentes',
    intro: 'Respostas claras às dúvidas mais comuns dos nossos pacientes.',
    items: [
      {
        q: 'Como posso marcar consulta?',
        a: 'Pode marcar pelo telefone 928 494 871, por WhatsApp ou através do formulário de contacto neste site. Novos pacientes: entraremos em contacto para confirmar disponibilidade antes de agendar.',
      },
      {
        q: 'Quais são os vossos horários?',
        a: 'Estamos abertos de segunda a sexta, das 09:30 às 12:30 e das 14:00 às 18:00. Encerramos ao almoço, aos sábados, aos domingos e em feriados.',
      },
      {
        q: 'Onde ficam localizados?',
        a: 'Estamos na Rua Miguel Judicibus Ferreira 29A, Malveira (concelho de Mafra).',
      },
      {
        q: 'Quanto custa a primeira consulta?',
        a: 'A consulta de avaliação tem o valor de €45. O valor exacto de qualquer tratamento só pode ser definido após consulta clínica de avaliação.',
      },
      {
        q: 'Que seguros e protocolos aceitam?',
        a: 'Aceitamos AdvanceCare, RNA-ADE e o Protocolo Liga dos Combatentes. Não aceitamos Cheque-Dentista (SNS).',
      },
      {
        q: 'Como posso pagar? Existem pagamentos faseados?',
        a: 'Aceitamos Multibanco/cartão de débito e crédito, numerário, transferência bancária e Scalapay. Planos de pagamento faseado estão disponíveis através de Scalapay e débito directo para tratamentos de valor mais elevado.',
      },
      {
        q: 'O que fazer numa urgência dentária?',
        a: 'Em caso de dor intensa, inchaço, dente partido ou traumatismo, ligue 928 494 871. Fora do horário, deixe a sua mensagem e a nossa equipa entra em contacto consigo.',
      },
      {
        q: 'Com que frequência devo fazer uma consulta de rotina?',
        a: 'Recomendamos uma consulta de rotina a cada 6 meses, salvo indicação diferente do médico dentista.',
      },
      {
        q: 'Preciso de avisar com quanta antecedência para cancelar?',
        a: 'Pedimos que avise com pelo menos 24 horas de antecedência. Existe uma tolerância de 10 a 15 minutos para atrasos.',
      },
      {
        q: 'Falam outras línguas?',
        a: 'Sim. Atendemos em português, inglês e espanhol.',
      },
    ],
  },
  contact: {
    eyebrow: 'Contactos',
    title: 'Marque a sua consulta',
    intro: 'Estamos na Malveira. Ligue, envie WhatsApp ou preencha o formulário.',
    addressTitle: 'Morada & contactos',
    hoursTitle: 'Horário',
    morning: 'Segunda – Sexta (manhã)',
    afternoon: 'Segunda – Sexta (tarde)',
    saturday: 'Sábado',
    sunday: 'Domingo & feriados',
    closed: 'Encerrado',
    lunchNote: 'Encerramento ao almoço entre as 12:30 e as 14:00.',
    mapAria: 'Abrir direcções no Google Maps',
    mapAlt: 'Mapa da localização da Clínica Dentária Nunes Monteiro na Malveira',
    mapCta: 'Ver direcções',
    formTitle: 'Formulário de contacto',
    formGate:
      'Novos pacientes: entraremos em contacto para confirmar disponibilidade antes de agendar.',
    formNoClinical:
      'Por favor não partilhe informação clínica detalhada neste formulário.',
    name: 'Nome',
    namePh: 'O seu nome',
    phone: 'Telefone',
    phonePh: '9xx xxx xxx',
    email: 'Email',
    emailPh: 'nome@email.com',
    subject: 'Assunto',
    subjectPh: 'Seleccione…',
    subjectBooking: 'Marcação',
    subjectEmergency: 'Urgência',
    subjectInfo: 'Informação',
    message: 'Mensagem',
    messagePh: 'Como podemos ajudar?',
    consentBefore: 'Li e aceito a ',
    consentAfter: ' e autorizo o tratamento dos meus dados para resposta a este pedido.',
    privacyLink: 'Política de Privacidade',
    submit: 'Enviar mensagem',
    sending: 'A enviar…',
    success: 'Mensagem enviada. Entraremos em contacto em breve.',
    error: 'Não foi possível enviar. Ligue 928 494 871 ou tente novamente.',
    formSubject: 'Contacto — Clínica Dentária Nunes Monteiro',
  },
  footer: {
    blurb: 'Medicina dentária de confiança na Malveira e região de Mafra.',
    contacts: 'Contactos',
    info: 'Informação',
    privacy: 'Política de Privacidade',
    terms: 'Termos de Utilização',
    livro: 'Livro de Reclamações',
    hoursStrip: 'Seg–Sex · 09:30–12:30 · 14:00–18:00',
  },
  notFound: {
    title: 'Página não encontrada',
    body: 'O endereço que procurou não existe ou foi movido.',
    cta: 'Voltar ao início',
  },
  legal: {
    eyebrow: 'Legal',
    privacyHeading: 'Política de Privacidade',
    termsHeading: 'Termos de Utilização',
    updated: 'Última actualização: 24 de Julho de 2026',
    livroHeading: 'Livro de Reclamações',
    livroRedirect: 'A redireccionar para o portal oficial…',
    livroContinue: 'Continuar para livroreclamacoes.pt',
  },
} as const;

const en = {
  meta: {
    title: 'Clínica Dentária Nunes Monteiro | Dentist in Malveira',
    description:
      'Dental clinic in Malveira. Emergencies, implants, orthodontics, aesthetics and endodontics. Mon–Fri 09:30–12:30 and 14:00–18:00. Call 928 494 871.',
    privacyTitle: 'Privacy Policy | Clínica Dentária Nunes Monteiro',
    privacyDescription:
      'Privacy policy and personal data processing for Clínica Dentária Nunes Monteiro, in line with the GDPR.',
    termsTitle: 'Terms of Use | Clínica Dentária Nunes Monteiro',
    termsDescription: 'Terms of use for the Clínica Dentária Nunes Monteiro website.',
    livroTitle: 'Livro de Reclamações | Clínica Dentária Nunes Monteiro',
    livroDescription: 'Redirect to the official electronic complaints book.',
    notFoundTitle: 'Page not found | Clínica Dentária Nunes Monteiro',
    notFoundDescription: 'The requested page does not exist.',
  },
  a11y: {
    skip: 'Skip to content',
    mainNav: 'Main navigation',
    mobileNav: 'Mobile navigation',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    quickActions: 'Quick actions',
    langSwitch: 'Select language',
    homeLogo: 'Clínica Dentária Nunes Monteiro — Home',
  },
  nav: {
    home: 'Home',
    services: 'Services',
    about: 'About',
    pricing: 'Pricing',
    faq: 'FAQ',
    contact: 'Contact',
    book: 'Book Appointment',
    call: 'Call',
  },
  mobileBar: {
    call: 'Call',
    whatsapp: 'WhatsApp',
    directions: 'Directions',
  },
  hero: {
    location: 'Malveira · Mafra',
    tagline:
      'Trusted dentistry in Malveira. Emergency visits, implantology, orthodontics and dental aesthetics.',
    languagesSpoken: 'Português · English · Español',
    callCta: 'Call',
    whatsappCta: 'Book via WhatsApp',
    hoursStrip: 'Mon–Fri · 09:30–12:30 · 14:00–18:00',
    whatsappMessage: 'Hello, I would like to book an appointment.',
  },
  services: {
    eyebrow: 'Services',
    title: 'Complete dental care',
    intro: 'From emergencies to prevention, with restorative, surgical and aesthetic treatments.',
    items: [
      {
        title: 'Dental Emergencies',
        description: 'Pain, swelling or a broken tooth? We prioritise urgent situations.',
      },
      {
        title: 'Restorative Treatments',
        description: 'Fillings and reconstructions to restore function and comfort to your tooth.',
      },
      {
        title: 'Implantology',
        description: 'Replacement of missing teeth with dental implants.',
      },
      {
        title: 'Dental Aesthetics',
        description: 'Whitening and veneers for a more harmonious smile.',
      },
      {
        title: 'Orthodontics',
        description: 'Fixed braces and aligners for children, teenagers and adults.',
      },
      {
        title: 'Endodontics',
        description: 'Root canal treatment, preserving the natural tooth.',
      },
    ],
  },
  about: {
    eyebrow: 'About us',
    title: 'A trusted clinic in Malveira',
    p1: 'Clínica Dentária Nunes Monteiro provides dentistry to the Malveira community and the Mafra region — from Venda do Pinheiro to Ericeira and Sobral de Monte Agraço.',
    p2: 'We offer a full range of care: from prevention and oral hygiene to implantology, orthodontics, endodontics and dental aesthetics. The team speaks Portuguese, English and Spanish.',
    ersLabel: 'Registered with ERS',
    omdLabel: 'Ordem dos Médicos Dentistas',
    consultLabel: 'Consultations in',
    doctorRole: 'Dentist · Clinical lead',
    doctorBio:
      'Primary contact for the clinic. Registration number with the Ordem dos Médicos Dentistas:',
  },
  pricing: {
    eyebrow: 'Pricing & payment',
    title: 'Clear pricing from the first visit',
    evaluation: 'Evaluation consultation',
    hygiene: 'Oral hygiene',
    hygieneFrom: 'from €45',
    disclaimer:
      'The exact cost of any treatment can only be defined after a clinical evaluation appointment.',
    paymentTitle: 'Payment',
    paymentMethods: [
      'Multibanco / debit and credit card',
      'Cash',
      'Bank transfer',
      'Scalapay',
    ],
    instalmentsTitle: 'Instalments',
    instalments:
      'Staged payment plans are available through Scalapay and direct debit for higher-value treatments.',
    insurersTitle: 'Insurers & protocols',
    insurers: ['AdvanceCare', 'RNA-ADE', 'Protocolo Liga dos Combatentes'],
    noCheque: 'We do not accept Cheque-Dentista (SNS).',
  },
  emergencies: {
    eyebrow: 'Emergencies',
    title: 'Severe pain, swelling, a broken tooth or trauma?',
    body: 'Call us. We prioritise urgent situations during opening hours.',
    afterHours:
      'Outside opening hours, leave a message and our team will get back to you.',
    tapToCall: 'Tap to call',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Frequently asked questions',
    intro: 'Clear answers to the questions patients ask most often.',
    items: [
      {
        q: 'How can I book an appointment?',
        a: 'You can book by phone on 928 494 871, via WhatsApp, or through the contact form on this website. New patients: we will contact you to confirm availability before scheduling.',
      },
      {
        q: 'What are your opening hours?',
        a: 'We are open Monday to Friday, 09:30–12:30 and 14:00–18:00. We close for lunch, on Saturdays, Sundays and public holidays.',
      },
      {
        q: 'Where are you located?',
        a: 'We are at Rua Miguel Judicibus Ferreira 29A, Malveira (municipality of Mafra).',
      },
      {
        q: 'How much is the first consultation?',
        a: 'The evaluation consultation is €45. The exact cost of any treatment can only be defined after a clinical evaluation appointment.',
      },
      {
        q: 'Which insurers and protocols do you accept?',
        a: 'We accept AdvanceCare, RNA-ADE and the Protocolo Liga dos Combatentes. We do not accept Cheque-Dentista (SNS).',
      },
      {
        q: 'How can I pay? Are instalments available?',
        a: 'We accept Multibanco/debit and credit card, cash, bank transfer and Scalapay. Staged payment plans are available through Scalapay and direct debit for higher-value treatments.',
      },
      {
        q: 'What should I do in a dental emergency?',
        a: 'In case of severe pain, swelling, a broken tooth or trauma, call 928 494 871. Outside opening hours, leave a message and our team will get back to you.',
      },
      {
        q: 'How often should I have a routine check-up?',
        a: 'We recommend a routine visit every 6 months, unless your dentist advises otherwise.',
      },
      {
        q: 'How much notice do I need to give to cancel?',
        a: 'Please give at least 24 hours’ notice. There is a 10 to 15 minute tolerance for late arrivals.',
      },
      {
        q: 'Do you speak other languages?',
        a: 'Yes. We provide care in Portuguese, English and Spanish.',
      },
    ],
  },
  contact: {
    eyebrow: 'Contact',
    title: 'Book your appointment',
    intro: 'We are in Malveira. Call, WhatsApp us, or fill in the form.',
    addressTitle: 'Address & contacts',
    hoursTitle: 'Opening hours',
    morning: 'Monday – Friday (morning)',
    afternoon: 'Monday – Friday (afternoon)',
    saturday: 'Saturday',
    sunday: 'Sunday & public holidays',
    closed: 'Closed',
    lunchNote: 'Closed for lunch between 12:30 and 14:00.',
    mapAria: 'Open directions in Google Maps',
    mapAlt: 'Map of Clínica Dentária Nunes Monteiro location in Malveira',
    mapCta: 'Get directions',
    formTitle: 'Contact form',
    formGate:
      'New patients: we will contact you to confirm availability before scheduling.',
    formNoClinical: 'Please do not share detailed clinical information in this form.',
    name: 'Name',
    namePh: 'Your name',
    phone: 'Phone',
    phonePh: '9xx xxx xxx',
    email: 'Email',
    emailPh: 'name@email.com',
    subject: 'Subject',
    subjectPh: 'Select…',
    subjectBooking: 'Booking',
    subjectEmergency: 'Emergency',
    subjectInfo: 'Information',
    message: 'Message',
    messagePh: 'How can we help?',
    consentBefore: 'I have read and accept the ',
    consentAfter: ' and authorise the processing of my data to respond to this request.',
    privacyLink: 'Privacy Policy',
    submit: 'Send message',
    sending: 'Sending…',
    success: 'Message sent. We will be in touch shortly.',
    error: 'Could not send. Call 928 494 871 or try again.',
    formSubject: 'Contact — Clínica Dentária Nunes Monteiro',
  },
  footer: {
    blurb: 'Trusted dentistry in Malveira and the Mafra region.',
    contacts: 'Contact',
    info: 'Information',
    privacy: 'Privacy Policy',
    terms: 'Terms of Use',
    livro: 'Livro de Reclamações',
    hoursStrip: 'Mon–Fri · 09:30–12:30 · 14:00–18:00',
  },
  notFound: {
    title: 'Page not found',
    body: 'The address you looked for does not exist or has been moved.',
    cta: 'Back to home',
  },
  legal: {
    eyebrow: 'Legal',
    privacyHeading: 'Privacy Policy',
    termsHeading: 'Terms of Use',
    updated: 'Last updated: 24 July 2026',
    livroHeading: 'Livro de Reclamações',
    livroRedirect: 'Redirecting to the official portal…',
    livroContinue: 'Continue to livroreclamacoes.pt',
  },
} as const;

const es = {
  meta: {
    title: 'Clínica Dentária Nunes Monteiro | Dentista en Malveira',
    description:
      'Clínica dental en Malveira. Urgencias, implantes, ortodoncia, estética y endodoncia. Lun–Vie 09:30–12:30 y 14:00–18:00. Llame al 928 494 871.',
    privacyTitle: 'Política de Privacidad | Clínica Dentária Nunes Monteiro',
    privacyDescription:
      'Política de privacidad y tratamiento de datos personales de Clínica Dentária Nunes Monteiro, conforme al RGPD.',
    termsTitle: 'Términos de Uso | Clínica Dentária Nunes Monteiro',
    termsDescription: 'Términos de uso del sitio web de Clínica Dentária Nunes Monteiro.',
    livroTitle: 'Livro de Reclamações | Clínica Dentária Nunes Monteiro',
    livroDescription: 'Redirección al Libro de Reclamaciones Electrónico oficial.',
    notFoundTitle: 'Página no encontrada | Clínica Dentária Nunes Monteiro',
    notFoundDescription: 'La página solicitada no existe.',
  },
  a11y: {
    skip: 'Saltar al contenido',
    mainNav: 'Navegación principal',
    mobileNav: 'Navegación móvil',
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
    quickActions: 'Acciones rápidas',
    langSwitch: 'Seleccionar idioma',
    homeLogo: 'Clínica Dentária Nunes Monteiro — Inicio',
  },
  nav: {
    home: 'Inicio',
    services: 'Servicios',
    about: 'Sobre nosotros',
    pricing: 'Precios',
    faq: 'FAQ',
    contact: 'Contacto',
    book: 'Pedir cita',
    call: 'Llamar',
  },
  mobileBar: {
    call: 'Llamar',
    whatsapp: 'WhatsApp',
    directions: 'Cómo llegar',
  },
  hero: {
    location: 'Malveira · Mafra',
    tagline:
      'Odontología de confianza en Malveira. Consultas de urgencia, implantología, ortodoncia y estética dental.',
    languagesSpoken: 'Português · English · Español',
    callCta: 'Llamar',
    whatsappCta: 'Pedir cita por WhatsApp',
    hoursStrip: 'Lun–Vie · 09:30–12:30 · 14:00–18:00',
    whatsappMessage: 'Hola, me gustaría pedir una cita.',
  },
  services: {
    eyebrow: 'Servicios',
    title: 'Cuidado dental completo',
    intro:
      'De la urgencia a la prevención, con tratamientos restauradores, quirúrgicos y estéticos.',
    items: [
      {
        title: 'Urgencias Dentales',
        description: '¿Dolor, inflamación o diente roto? Damos prioridad a situaciones urgentes.',
      },
      {
        title: 'Tratamientos Restauradores',
        description:
          'Restauraciones y reconstrucciones para devolver función y confort a su diente.',
      },
      {
        title: 'Implantología',
        description: 'Sustitución de dientes ausentes con implantes dentales.',
      },
      {
        title: 'Estética Dental',
        description: 'Blanqueamiento y carillas para una sonrisa más armoniosa.',
      },
      {
        title: 'Ortodoncia',
        description: 'Aparatos fijos y alineadores para niños, adolescentes y adultos.',
      },
      {
        title: 'Endodoncia',
        description: 'Tratamiento de conductos, preservando el diente natural.',
      },
    ],
  },
  about: {
    eyebrow: 'Sobre nosotros',
    title: 'Una clínica de confianza en Malveira',
    p1: 'Clínica Dentária Nunes Monteiro presta odontología a la comunidad de Malveira y a la región de Mafra — de Venda do Pinheiro a Ericeira y Sobral de Monte Agraço.',
    p2: 'Ofrecemos una gama completa de cuidados: de la prevención e higiene oral a la implantología, ortodoncia, endodoncia y estética dental. El equipo atiende en portugués, inglés y español.',
    ersLabel: 'Registrada en la ERS',
    omdLabel: 'Ordem dos Médicos Dentistas',
    consultLabel: 'Consulta en',
    doctorRole: 'Médica Dentista · Responsable clínica',
    doctorBio:
      'Contacto principal de la clínica. Número de inscripción en la Ordem dos Médicos Dentistas:',
  },
  pricing: {
    eyebrow: 'Precios y pago',
    title: 'Transparencia desde la primera consulta',
    evaluation: 'Consulta de evaluación',
    hygiene: 'Higiene oral',
    hygieneFrom: 'desde €45',
    disclaimer:
      'El valor exacto de cualquier tratamiento solo puede definirse tras una consulta clínica de evaluación.',
    paymentTitle: 'Pago',
    paymentMethods: [
      'Multibanco / tarjeta de débito y crédito',
      'Efectivo',
      'Transferencia bancaria',
      'Scalapay',
    ],
    instalmentsTitle: 'Pagos fraccionados',
    instalments:
      'Planes de pago fraccionado disponibles a través de Scalapay y domiciliación bancaria para tratamientos de mayor valor.',
    insurersTitle: 'Seguros y protocolos',
    insurers: ['AdvanceCare', 'RNA-ADE', 'Protocolo Liga dos Combatentes'],
    noCheque: 'No aceptamos Cheque-Dentista (SNS).',
  },
  emergencies: {
    eyebrow: 'Urgencias',
    title: '¿Dolor intenso, inflamación, diente roto o traumatismo?',
    body: 'Llámenos. Damos prioridad a situaciones urgentes durante el horario de atención.',
    afterHours:
      'Fuera del horario, deje su mensaje y nuestro equipo se pondrá en contacto con usted.',
    tapToCall: 'Toque para llamar',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Preguntas frecuentes',
    intro: 'Respuestas claras a las dudas más habituales de nuestros pacientes.',
    items: [
      {
        q: '¿Cómo puedo pedir cita?',
        a: 'Puede pedir cita por teléfono al 928 494 871, por WhatsApp o mediante el formulario de contacto de este sitio. Nuevos pacientes: nos pondremos en contacto para confirmar disponibilidad antes de agendar.',
      },
      {
        q: '¿Cuáles son sus horarios?',
        a: 'Abrimos de lunes a viernes, de 09:30 a 12:30 y de 14:00 a 18:00. Cerramos a mediodía, los sábados, los domingos y en festivos.',
      },
      {
        q: '¿Dónde están ubicados?',
        a: 'Estamos en Rua Miguel Judicibus Ferreira 29A, Malveira (municipio de Mafra).',
      },
      {
        q: '¿Cuánto cuesta la primera consulta?',
        a: 'La consulta de evaluación tiene un valor de €45. El valor exacto de cualquier tratamiento solo puede definirse tras una consulta clínica de evaluación.',
      },
      {
        q: '¿Qué seguros y protocolos aceptan?',
        a: 'Aceptamos AdvanceCare, RNA-ADE y el Protocolo Liga dos Combatentes. No aceptamos Cheque-Dentista (SNS).',
      },
      {
        q: '¿Cómo puedo pagar? ¿Hay pagos fraccionados?',
        a: 'Aceptamos Multibanco/tarjeta de débito y crédito, efectivo, transferencia bancaria y Scalapay. Planes de pago fraccionado están disponibles a través de Scalapay y domiciliación bancaria para tratamientos de mayor valor.',
      },
      {
        q: '¿Qué hacer en una urgencia dental?',
        a: 'En caso de dolor intenso, inflamación, diente roto o traumatismo, llame al 928 494 871. Fuera del horario, deje su mensaje y nuestro equipo se pondrá en contacto con usted.',
      },
      {
        q: '¿Con qué frecuencia debo hacer una consulta de rutina?',
        a: 'Recomendamos una consulta de rutina cada 6 meses, salvo indicación distinta del médico dentista.',
      },
      {
        q: '¿Con cuánta antelación debo avisar para cancelar?',
        a: 'Pedimos que avise con al menos 24 horas de antelación. Existe una tolerancia de 10 a 15 minutos por retrasos.',
      },
      {
        q: '¿Hablan otros idiomas?',
        a: 'Sí. Atendemos en portugués, inglés y español.',
      },
    ],
  },
  contact: {
    eyebrow: 'Contacto',
    title: 'Pida su cita',
    intro: 'Estamos en Malveira. Llame, escriba por WhatsApp o rellene el formulario.',
    addressTitle: 'Dirección y contactos',
    hoursTitle: 'Horario',
    morning: 'Lunes – Viernes (mañana)',
    afternoon: 'Lunes – Viernes (tarde)',
    saturday: 'Sábado',
    sunday: 'Domingo y festivos',
    closed: 'Cerrado',
    lunchNote: 'Cierre al mediodía entre las 12:30 y las 14:00.',
    mapAria: 'Abrir indicaciones en Google Maps',
    mapAlt: 'Mapa de la ubicación de Clínica Dentária Nunes Monteiro en Malveira',
    mapCta: 'Ver cómo llegar',
    formTitle: 'Formulario de contacto',
    formGate:
      'Nuevos pacientes: nos pondremos en contacto para confirmar disponibilidad antes de agendar.',
    formNoClinical:
      'Por favor no comparta información clínica detallada en este formulario.',
    name: 'Nombre',
    namePh: 'Su nombre',
    phone: 'Teléfono',
    phonePh: '9xx xxx xxx',
    email: 'Email',
    emailPh: 'nombre@email.com',
    subject: 'Asunto',
    subjectPh: 'Seleccione…',
    subjectBooking: 'Cita',
    subjectEmergency: 'Urgencia',
    subjectInfo: 'Información',
    message: 'Mensaje',
    messagePh: '¿Cómo podemos ayudar?',
    consentBefore: 'He leído y acepto la ',
    consentAfter: ' y autorizo el tratamiento de mis datos para responder a esta solicitud.',
    privacyLink: 'Política de Privacidad',
    submit: 'Enviar mensaje',
    sending: 'Enviando…',
    success: 'Mensaje enviado. Nos pondremos en contacto pronto.',
    error: 'No se pudo enviar. Llame al 928 494 871 o inténtelo de nuevo.',
    formSubject: 'Contacto — Clínica Dentária Nunes Monteiro',
  },
  footer: {
    blurb: 'Odontología de confianza en Malveira y la región de Mafra.',
    contacts: 'Contacto',
    info: 'Información',
    privacy: 'Política de Privacidad',
    terms: 'Términos de Uso',
    livro: 'Livro de Reclamações',
    hoursStrip: 'Lun–Vie · 09:30–12:30 · 14:00–18:00',
  },
  notFound: {
    title: 'Página no encontrada',
    body: 'La dirección que buscó no existe o se ha movido.',
    cta: 'Volver al inicio',
  },
  legal: {
    eyebrow: 'Legal',
    privacyHeading: 'Política de Privacidad',
    termsHeading: 'Términos de Uso',
    updated: 'Última actualización: 24 de julio de 2026',
    livroHeading: 'Livro de Reclamações',
    livroRedirect: 'Redirigiendo al portal oficial…',
    livroContinue: 'Continuar a livroreclamacoes.pt',
  },
} as const;

export const ui = { pt, en, es } as const;

export type UiDictionary = typeof pt;

export function useTranslations(lang: Lang): UiDictionary {
  return ui[lang] as UiDictionary;
}
