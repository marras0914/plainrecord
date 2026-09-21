/**
 * PlainRecord — read the Spanish-language stations' own contact pages
 *
 *   node scripts/find_station_contacts.mjs
 *
 * WHY A BROWSER AND NOT fetch()
 *
 * A plain fetch of these sites returns a shell: the contact pages redirect to the
 * homepage and the only addresses in the HTML source are ad-tech placeholders
 * (mailAddress@client.com, 555-555-5555). Everything real is rendered by
 * JavaScript. So this drives an actual browser, follows the site's own contact
 * link, and reads the rendered DOM.
 *
 * WHAT IT WILL AND WILL NOT DO
 *
 * It reports only what is ON the page: mailto: targets, tel: targets, and
 * addresses in visible text. It never constructs an address from a pattern.
 * The outreach archive has already paid for pattern-guessing twice, so a blank
 * here is a genuine blank and should be filled by a human reading the page or
 * calling the station, not by inference.
 *
 * Placeholders are filtered, because a list that confidently reports
 * mailAddress@client.com is worse than a list that reports nothing.
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const STATIONS = [
  ['Houston', 'Univision 45 KXLN', 'https://www.univision.com/local/houston-kxln'],
  ['Houston', 'Telemundo 47 KTMD', 'https://www.telemundohouston.com'],
  ['Dallas', 'Univision 23 KUVN', 'https://www.univision.com/local/dallas-kuvn'],
  ['Dallas', 'Telemundo 39 KXTX', 'https://www.telemundodallas.com'],
  ['RGV', 'Univision 48 KNVO', 'https://noticias48knvo.com'],
  ['RGV', 'Telemundo 40 KTLM', 'https://www.telemundo40.com'],
  ['El Paso', 'Univision 26 KINT', 'https://noticiaselpaso.com'],
  ['El Paso', 'Telemundo 48 KTDO', 'https://www.telemundo48elpaso.com'],
  ['San Antonio', 'Univision 41 KWEX', 'https://www.univision.com/local/san-antonio-kwex'],
  ['San Antonio', 'Telemundo 60 KVDA', 'https://www.telemundosanantonio.com'],
  ['Austin', 'Univision 62 KAKW', 'https://www.univision.com/local/austin-kakw'],
];

// Anything matching these is boilerplate from an ad or analytics bundle, not a
// newsroom. Reporting them would be worse than reporting nothing.
const JUNK = /@(client|example|domain|email|sentry|wixpress)\.|noreply|no-reply|donotreply|\.(png|jpg|jpeg|gif|svg|webp|css|js)$|^u0|sentry\.io/i;
const JUNK_PHONE = /^\(?555\)?/;

// Deliberately NARROW. The first version included "denuncia", meaning "report a
// tip", and it matched the headline "aumentan denuncias contra educadores" — so
// the crawler read a news article as a contact page and harvested
// admin@SubscriptionMembershipSettlement.com out of an Amazon class-action
// story. That is a real, well-formed, entirely wrong address: the junk filter
// screens for FORMAT and cannot see CONTEXT, so the matcher has to.
//
// Also excludes any link that looks like an article: a contact page does not
// live under /noticias/ and does not end in a numeric story id.
const CONTACT_WORDS = /cont[aá]ctenos|cont[aá]ct(o|anos|us)|comun[ií]quese|escr[ií]benos|qui[eé]nes somos|somos univision|acerca de|about us|informaci[oó]n de la estaci|station info|conectate|con[eé]ctate/i;
const LOOKS_LIKE_ARTICLE = /\/noticias\/|\/tu-dinero\/|\/\d{6,}\/?$|\/entretenimiento\//i;

const browser = await chromium.launch();
const results = [];

for (const [metro, station, url] of STATIONS) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  const row = { metro, station, url, contactPage: null, emails: [], phones: [], note: '' };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);

    const harvest = async () => {
      const found = await page.evaluate(() => {
        const mail = [...document.querySelectorAll('a[href^="mailto:"]')]
          .map((a) => a.getAttribute('href').replace(/^mailto:/i, '').split('?')[0].trim());
        const tel = [...document.querySelectorAll('a[href^="tel:"]')]
          .map((a) => a.getAttribute('href').replace(/^tel:/i, '').trim());
        const text = document.body.innerText || '';
        const inText = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
        const phonesInText = text.match(/\(\d{3}\)\s?\d{3}[- ]\d{4}|\b\d{3}-\d{3}-\d{4}\b/g) || [];
        return { mail, tel, inText, phonesInText };
      });
      row.emails.push(...found.mail, ...found.inText);
      row.phones.push(...found.tel, ...found.phonesInText);
    };

    await harvest();

    // Follow the site's own contact link rather than guessing a path.
    const link = await page.evaluate(([re, bad]) => {
      const rx = new RegExp(re, 'i');
      const badRx = new RegExp(bad, 'i');
      const a = [...document.querySelectorAll('a[href]')]
        .filter((x) => !badRx.test(x.href || ''))
        .find((x) => rx.test(x.textContent || '') || rx.test(x.getAttribute('href') || ''));
      return a ? a.href : null;
    }, [CONTACT_WORDS.source, LOOKS_LIKE_ARTICLE.source]);

    if (link) {
      row.contactPage = link;
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);
      await harvest();
    } else {
      row.note = 'no contact link found on the homepage';
    }
  } catch (e) {
    row.note = 'error: ' + String(e.message).split('\n')[0].slice(0, 70);
  }

  row.emails = [...new Set(row.emails)].filter((e) => !JUNK.test(e));
  row.phones = [...new Set(row.phones)].filter((p) => !JUNK_PHONE.test(p.replace(/[^\d()]/g, '')));
  results.push(row);
  await ctx.close();

  console.log(`\n${metro} — ${station}`);
  console.log(`  contact page: ${row.contactPage ? row.contactPage.slice(0, 72) : '(none found)'}`);
  console.log(`  emails: ${row.emails.length ? row.emails.join(', ') : '(none on the page)'}`);
  console.log(`  phones: ${row.phones.length ? row.phones.slice(0, 3).join(', ') : '(none on the page)'}`);
  if (row.note) console.log(`  note: ${row.note}`);
}

await browser.close();
writeFileSync('private/station_contacts.json', JSON.stringify(results, null, 1));
const withEmail = results.filter((r) => r.emails.length).length;
const withPhone = results.filter((r) => r.phones.length).length;
console.log(`\n  ${results.length} stations: ${withEmail} with an email on the page, ${withPhone} with a phone.`);
console.log('  wrote private/station_contacts.json');
console.log('  Blanks are genuine. Fill them by reading the page or calling, never by pattern.\n');
