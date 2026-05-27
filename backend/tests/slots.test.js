import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSlotsForWindow,
  dayOfWeekForPricing,
  filterSlotsByLeadTime,
  isSlotBookableWithLeadTime,
} from "../src/slots.js";

test("buildSlotsForWindow creates 30 minute intervals", () => {
  const slots = buildSlotsForWindow("12:00:00", "13:30:00", 30);

  assert.equal(slots.length, 3);
  assert.deepEqual(slots[0], { time_start: "12:00:00", time_end: "12:30:00" });
  assert.deepEqual(slots[2], { time_start: "13:00:00", time_end: "13:30:00" });
});

test("dayOfWeekForPricing maps Sunday to 7", () => {
  assert.equal(dayOfWeekForPricing("2026-05-17"), 7);
});

test("isSlotBookableWithLeadTime blocks slots before lead limit", () => {
  const now = new Date(2026, 4, 24, 12, 0, 0);

  assert.equal(
    isSlotBookableWithLeadTime("2026-05-24", "13:30:00", 120, now),
    false
  );
  assert.equal(
    isSlotBookableWithLeadTime("2026-05-24", "14:00:00", 120, now),
    true
  );
});

test("filterSlotsByLeadTime removes blocked slots", () => {
  const now = new Date(2026, 4, 24, 10, 0, 0);
  const resources = [
    {
      resource_id: 1,
      slots: [
        { time_start: "11:00:00", available: true },
        { time_start: "12:30:00", available: true },
      ],
    },
  ];

  const filtered = filterSlotsByLeadTime(resources, "2026-05-24", 120, now);
  assert.deepEqual(filtered[0].slots, [{ time_start: "12:30:00", available: true }]);
});

