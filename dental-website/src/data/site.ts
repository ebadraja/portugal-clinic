export const site = {
  name: 'Clínica Dentária Nunes Monteiro',
  shortName: 'Nunes Monteiro',
  brandSubtitle: 'Clínica Dentária',
  phoneDisplay: '928 494 871',
  phoneTel: '+351928494871',
  whatsapp: '351928494871',
  email: 'geral@clinicadentariaih.com',
  address: {
    street: 'Rua Miguel Judicibus Ferreira 29A',
    locality: 'Malveira',
    region: 'Mafra',
    postalCode: '2665',
    country: 'PT',
    full: 'Rua Miguel Judicibus Ferreira 29A, Malveira',
  },
  geo: {
    latitude: 38.9322,
    longitude: -9.2583,
  },
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=Rua+Miguel+Judicibus+Ferreira+29A,+Malveira',
  hours: {
    morning: { opens: '09:30', closes: '12:30' },
    afternoon: { opens: '14:00', closes: '18:00' },
  },
  /** Keep identical across languages — NAP / registration */
  ers: 'E180126',
  nif: '513491155',
  omd: 'A confirmar',
  url: 'https://clinicadentariaih.com',
  evaluationPrice: '€45',
} as const;

export const serviceIcons = [
  'alert',
  'restore',
  'implant',
  'sparkle',
  'align',
  'root',
] as const;
