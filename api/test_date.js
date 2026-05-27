const { getDay } = require('date-fns');
const date = new Date('2026-02-22'); // Sunday
let dayOfWeek = getDay(date);
dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
console.log('dayOfWeek:', dayOfWeek);
