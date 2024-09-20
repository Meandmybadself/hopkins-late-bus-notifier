import * as cheerio from 'cheerio';
import moment from 'moment';
import { Vesta } from 'vestaboard-api';

const URL = 'https://docs.google.com/spreadsheets/u/0/d/1fjfYhwB9YThz2_O0ZTQzKqZDJdwXMjD8m3MjyfuFHNw/pub?gid=0&range=a1:g20&output=html';

// Vestaboard configuration
const apiKey = process.env.VESTA_API_KEY
const apiSecret = process.env.VESTA_API_SECRET

const vesta = new Vesta({ apiKey, apiSecret });

async function fetchAndParseData() {
  try {
    const response = await fetch(URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    const rows = [];
    $('table.waffle tr').each((index, element) => {
      if (index === 0) return; // Skip header row
      const columns = $(element).find('td');
      if (columns.length === 0) return; // Skip empty rows

      const row = {
        timestamp: $(columns[0]).text().trim(),
        busNumber: $(columns[1]).text().trim(),
        school: $(columns[2]).text().trim(),
        schoolOther: $(columns[3]).text().trim(),
        minutesLate: $(columns[4]).text().trim(),
        reason: $(columns[5]).text().trim(),
        comments: $(columns[6]).text().trim()
      };
      rows.push(row);
    });

    return rows;
  } catch (error) {
    console.error('Error fetching or parsing data:', error);
    return [];
  }
}

function filterRows(rows) {
  const now = moment();
  const today = now.format('M/D/YYYY');
  const twentyHoursAgo = now.subtract(1, 'hours');

  return rows.filter(row => {
    const timestamp = moment(row.timestamp, 'M/D/YYYY HH:mm:ss');
    return timestamp.format('M/D/YYYY') === today && timestamp.isAfter(twentyHoursAgo);
  });
}

async function sendVestaboardMessage(message) {
  try {
    const subscriptions = await vesta.getSubscriptions();
    const subscriptionIdArray = subscriptions.map((sub) => sub._id);

    const messagePostResponse = await Promise.all(
      subscriptionIdArray.map((subId) =>
        vesta.postMessage(subId, message)
      )
    );

    console.log('Vestaboard message sent successfully:', messagePostResponse);
  } catch (error) {
    console.error('Error sending Vestaboard message:', error);
  }
}

async function main() {
  const allRows = await fetchAndParseData();
  const filteredRows = filterRows(allRows);

  console.log('Rows from the past hour');
  console.log(JSON.stringify(filteredRows, null, 2));

  const bus712Rows = filteredRows.filter(row => row.busNumber === '712');

  if (bus712Rows.length > 0) {
    for (const row of bus712Rows) {
      let message = `Bus 712 is running ${row.minutesLate} late`;
      if (row.reason) {
        message += ` due to ${row.reason}`;
      }

      await sendVestaboardMessage(message);
    }
  } else {
    console.log('No records found for bus 712');
  }
}

main();