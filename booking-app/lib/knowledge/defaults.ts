/**
 * The clinic's approved FAQ, copied from dental-website/src/i18n/ui.ts (pt) so
 * the website and Acácia give identical answers — a requirement in
 * dental-website/website-requirements.md §6.6. Edit them in Settings → Knowledge Base.
 */
export type KnowledgeSeed = { category: string; question: string; answer: string; priority: number }

export const CLINIC_FAQ: KnowledgeSeed[] = [
  {
    category: 'Marcações',
    question: 'Como posso marcar consulta?',
    answer: 'Pode marcar pelo telefone 928 494 871, por WhatsApp ou através do formulário de contacto no site. Novos pacientes: entraremos em contacto para confirmar disponibilidade antes de agendar.',
    priority: 5,
  },
  {
    category: 'Horário',
    question: 'Quais são os vossos horários?',
    answer: 'Estamos abertos de segunda a sexta, das 09:30 às 12:30 e das 14:00 às 18:00. Encerramos ao almoço, aos sábados, aos domingos e em feriados.',
    priority: 5,
  },
  {
    category: 'Localização',
    question: 'Onde ficam localizados? Qual é a morada?',
    answer: 'Estamos na Rua Miguel Judicibus Ferreira 29A, Malveira (concelho de Mafra).',
    priority: 4,
  },
  {
    category: 'Preços',
    question: 'Quanto custa a primeira consulta de avaliação?',
    answer: 'A consulta de avaliação tem o valor de 45 €. O valor exato de qualquer tratamento só pode ser definido após consulta clínica de avaliação.',
    priority: 5,
  },
  {
    category: 'Seguros',
    question: 'Que seguros e protocolos aceitam?',
    answer: 'Aceitamos AdvanceCare, RNA-ADE e o Protocolo Liga dos Combatentes. Não aceitamos Cheque-Dentista (SNS).',
    priority: 4,
  },
  {
    category: 'Pagamentos',
    question: 'Como posso pagar? Existem pagamentos faseados ou prestações?',
    answer: 'Aceitamos Multibanco/cartão de débito e crédito, numerário, transferência bancária e Scalapay. Planos de pagamento faseado estão disponíveis através de Scalapay e débito direto para tratamentos de valor mais elevado.',
    priority: 4,
  },
  {
    category: 'Urgências',
    question: 'O que fazer numa urgência dentária? Dor, inchaço ou dente partido?',
    answer: 'Em caso de dor intensa, inchaço, dente partido ou traumatismo, ligue 928 494 871. Fora do horário, deixe a sua mensagem e a nossa equipa entra em contacto consigo.',
    priority: 5,
  },
  {
    category: 'Prevenção',
    question: 'Com que frequência devo fazer uma consulta de rotina ou limpeza?',
    answer: 'Recomendamos uma consulta de rotina a cada 6 meses, salvo indicação diferente do médico dentista.',
    priority: 3,
  },
  {
    category: 'Políticas',
    question: 'Com quanta antecedência devo avisar para cancelar ou desmarcar? E se me atrasar?',
    answer: 'Pedimos que avise com pelo menos 24 horas de antecedência. Existe uma tolerância de 10 a 15 minutos para atrasos.',
    priority: 4,
  },
  {
    category: 'Línguas',
    question: 'Falam outras línguas? Inglês ou espanhol?',
    answer: 'Sim. Atendemos em português, inglês e espanhol.',
    priority: 3,
  },
]
