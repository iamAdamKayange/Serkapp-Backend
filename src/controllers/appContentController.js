const getAppContent = async (req, res, next) => {
  try {
    res.json({
      appName: 'Serik',
      websiteUrl: process.env.SERIK_WEBSITE_URL || 'https://serik.co.tz',
      supportEmail: process.env.SERIK_SUPPORT_EMAIL || 'support@serik.co.tz',
      supportPhone: process.env.SERIK_SUPPORT_PHONE || '+255 629 095 954',
      privacyPolicy: {
        title: {
          sw: 'Sera ya Faragha',
          en: 'Privacy Policy',
        },
        lastUpdated: process.env.SERIK_POLICY_UPDATED_AT || '2026-08-28',
        sections: [
          {
            title: { sw: 'Tunakusanya nini', en: 'What we collect' },
            body: {
              sw: 'Tunakusanya taarifa unazotoa mwenyewe kama jina, simu, barua pepe, picha, na taarifa za uthibitishaji ili kuendesha akaunti yako na huduma za nyumba.',
              en: 'We collect information you provide such as name, phone number, email, images, and verification details to run your account and housing services.',
            },
          },
          {
            title: { sw: 'Tunakutumia taarifa kwa nini', en: 'How we use data' },
            body: {
              sw: 'Taarifa zako hutumika kwa usalama wa akaunti, uthibitishaji wa mpangishaji, mawasiliano kati ya pande husika, na maboresho ya huduma.',
              en: 'Your data is used for account security, landlord verification, communication between parties, and service improvements.',
            },
          },
          {
            title: { sw: 'Ulinzi wa taarifa', en: 'Data protection' },
            body: {
              sw: 'Tunachukua hatua za kiusalama kulinda taarifa zako, lakini pia tunashauri utumie nenosiri imara na ushiriki taarifa nyeti bila sababu.',
              en: 'We use security measures to protect your data, but we also recommend using a strong password and avoiding unnecessary sharing of sensitive information.',
            },
          },
        ],
      },
      termsOfService: {
        title: {
          sw: 'Masharti ya Huduma',
          en: 'Terms of Service',
        },
        sections: [
          {
            title: { sw: 'Matumizi sahihi', en: 'Acceptable use' },
            body: {
              sw: 'Unakubali kutumia mfumo kwa madhumuni halali pekee na kutoa taarifa sahihi unapofanya maombi, uthibitishaji au uhariri wa akaunti.',
              en: 'You agree to use the platform only for lawful purposes and to provide accurate information when making requests, verification submissions, or account updates.',
            },
          },
          {
            title: { sw: 'Majukumu ya mtumiaji', en: 'User responsibilities' },
            body: {
              sw: 'Ni jukumu lako kuhakikisha maelezo ya nyumba, malipo na mawasiliano yako yako sahihi na yanasasishwa kwa wakati.',
              en: 'It is your responsibility to keep house, payment, and contact details accurate and up to date.',
            },
          },
          {
            title: { sw: 'Mabadiliko ya huduma', en: 'Service changes' },
            body: {
              sw: 'Tunaweza kuboresha au kubadili huduma zetu pale inapohitajika ili kuendeleza ubora na usalama wa mfumo.',
              en: 'We may improve or change our services when needed to maintain product quality and security.',
            },
          },
        ],
      },
      aboutUs: {
        title: {
          sw: 'Kutuhusu',
          en: 'About Us',
        },
        body: {
          sw: 'Serik ni jukwaa la nyumba na usimamizi wa upangishaji linalounganisha wapangaji, wamiliki wa nyumba na taarifa za nyumba kwa njia rahisi na ya haraka. Tovuti yetu rasmi ni serik.co.tz.',
          en: 'Serik is a housing and rental management platform that connects tenants, landlords, and property information in a simple and fast way. Our official website is serik.co.tz.',
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAppContent };
