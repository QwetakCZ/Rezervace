const DEFAULT_SLOT_MINUTES = 30;

function padTime(value) {
  return String(value).padStart(2, "0");
}

function timeToMinutes(timeValue) {
  const [hour, minute] = timeValue.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${padTime(h)}:${padTime(m)}:00`;
}

function parseTimeParts(timeValue) {
  const [hourRaw, minuteRaw, secondRaw] = String(timeValue || "").split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw || 0);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return { hour, minute, second };
}

function toLocalDateTime(dateString, timeValue) {
  const parts = String(dateString || "").split("-").map(Number);
  const time = parseTimeParts(timeValue);
  if (parts.length !== 3 || !time) {
    return null;
  }

  const [year, month, day] = parts;
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day, time.hour, time.minute, time.second, 0);
}

export function isSlotBookableWithLeadTime(dateString, timeStart, minAdvanceMinutes = 0, now = new Date()) {
  const slotDate = toLocalDateTime(dateString, timeStart);
  if (!slotDate || Number.isNaN(slotDate.getTime())) {
    return false;
  }

  const leadMinutes = Math.max(Number(minAdvanceMinutes) || 0, 0);
  const leadLimit = now.getTime() + leadMinutes * 60_000;
  return slotDate.getTime() >= leadLimit;
}

export function filterSlotsByLeadTime(resources, dateString, minAdvanceMinutes = 0, now = new Date()) {
  return (resources || []).map((resource) => ({
    ...resource,
    slots: (resource.slots || []).filter((slot) =>
      isSlotBookableWithLeadTime(dateString, slot.time_start, minAdvanceMinutes, now)
    ),
  }));
}

export function dayOfWeekForPricing(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function buildSlotsForWindow(timeFrom, timeTo, slotMinutes = DEFAULT_SLOT_MINUTES) {
  const from = timeToMinutes(timeFrom);
  const to = timeToMinutes(timeTo);
  const slots = [];

  for (let current = from; current + slotMinutes <= to; current += slotMinutes) {
    slots.push({
      time_start: minutesToTime(current),
      time_end: minutesToTime(current + slotMinutes),
    });
  }

  return slots;
}

export function groupSlotsByResource(resources, reservedSlotRows) {
  const reservedLookup = new Map();

  for (const row of reservedSlotRows) {
    const key = `${row.resource_id}_${row.time_start}`;
    reservedLookup.set(key, true);
  }

  return resources.map((resource) => ({
    resource_id: resource.id,
    resource_name: resource.name,
    slots: resource.slots.map((slot) => ({
      ...slot,
      available: !reservedLookup.get(`${resource.id}_${slot.time_start}`),
    })),
  }));
}

