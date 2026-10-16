const CONFIG = {
  spreadsheetId: '1GnWedLphG-yKesvc24C7OO4VJjB7niazXsapOnIo4eU',
  templateDocId: '1_OId7WAM_UHasb3Q89O8TOt2QdCrngzl0A4N2n95H6w',
  timeZone: 'America/Los_Angeles'
};

function createTodaysCourseDoc() {
  const today = Utilities.formatDate(new Date(), CONFIG.timeZone, 'yyyy-MM-dd');
  const properties = PropertiesService.getScriptProperties();

  // Prevents making a second copy if the trigger runs again today.
  if (properties.getProperty('LAST_DOC_DATE') === today) {
    console.log('A document was already made today.');
    return;
  }

  const sheet = SpreadsheetApp.openById(CONFIG.spreadsheetId).getSheets()[0];
  const rows = sheet.getDataRange().getDisplayValues();

  const courses = rows.slice(1)
    .map(row => ({
      date: dateKey(row[1]),
      title: row[2].trim(),       // Column C
      instructor: row[3].trim(),  // Column D
      time: row[4].trim(),        // Column E
      link: row[6].trim()         // Column G
    }))
    .filter(course => course.date === today)
    .map(course => ({ ...course, start: startTimeInMinutes(course.time) }))
    .filter(course => course.start !== null)
    .sort((a, b) => a.start - b.start);

  if (courses.length === 0) {
    console.log('No course with a readable start time is scheduled for today.');
    return;
  }

  const course = courses[0];
  if (!course.title || !course.instructor || !course.link) {
    throw new Error('The earliest course is missing a title, instructor, or link. Check columns C, D, and G.');
  }

  const template = DriveApp.getFileById(CONFIG.templateDocId);
  const copy = template.makeCopy(`Course Script - ${today} - ${course.title}`);
  const doc = DocumentApp.openById(copy.getId());
  const body = doc.getBody();

  replacePlaceholder(body, ['[course title]', '[course name]'], course.title);
  replacePlaceholder(body, ['[course instructor]', '[course instuctor]'], course.instructor);
  replacePlaceholder(body, ['[link]'], course.link);

  doc.saveAndClose();
  properties.setProperty('LAST_DOC_DATE', today);
  console.log(`Created document: ${copy.getUrl()}`);
}

function setupDailyTrigger() {
  // Remove old triggers for this function so you don't get duplicates.
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'createTodaysCourseDoc')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('createTodaysCourseDoc')
    .timeBased()
    .atHour(4)
    .everyDays(1)
    .inTimezone(CONFIG.timeZone)
    .create();
}

function replacePlaceholder(body, placeholders, value) {
  const text = body.getText().toLowerCase();
  const found = placeholders.filter(item => text.includes(item.toLowerCase()));

  if (found.length === 0) {
    throw new Error(
      `The template is missing this placeholder: ${placeholders[0]}. Add it to the Google Doc, then try again.`
    );
  }

  found.forEach(item => {
    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    body.replaceText(`(?i)${escaped}`, value);
  });
}

function dateKey(value) {
  const text = String(value).trim();

  // Handles dates displayed like 10/15/2026.
  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }

  // Handles dates displayed like 2026-10-15.
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  return '';
}

function startTimeInMinutes(value) {
  const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const amPm = match[3].toUpperCase();

  if (hour < 1 || hour > 12 || minute > 59) return null;

  if (amPm === 'AM' && hour === 12) hour = 0;
  if (amPm === 'PM' && hour !== 12) hour += 12;

  return hour * 60 + minute;
}
