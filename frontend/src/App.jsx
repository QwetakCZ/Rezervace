import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import {
  Trophy,
  Calendar,
  DollarSign,
  Users,
  BarChart3,
  ClipboardList,
  Package,
  TrendingUp,
  Cpu,
  Dumbbell,
  Settings,
  Star,
} from "lucide-react";

function getCurrentLocalDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

const today = getCurrentLocalDateKey();
const weekdayOptions = [
  { value: "1", label: "Pondělí" },
  { value: "2", label: "Úterý" },
  { value: "3", label: "Středa" },
  { value: "4", label: "Čtvrtek" },
  { value: "5", label: "Pátek" },
  { value: "6", label: "Sobota" },
  { value: "7", label: "Neděle" },
];

const categoryIconOptions = [
  { value: "trophy", label: "Pohár", Icon: Trophy },
  { value: "cpu", label: "CPU / robot", Icon: Cpu },
  { value: "dumbbell", label: "Činka / trénink", Icon: Dumbbell },
  { value: "calendar", label: "Kalendář", Icon: Calendar },
  { value: "users", label: "Uživatelé", Icon: Users },
  { value: "star", label: "Hvězda", Icon: Star },
];

const DEFAULT_CLUB_THEME = Object.freeze({
  brandColor: "#10d2a2",
  backgroundColor: "#06070c",
  textColor: "#f4f5f7",
});

const TEMPLATE_VARS_HELP = [
  { var: "{{firstName}}", desc: "Křestní jméno zákazníka" },
  { var: "{{lastName}}", desc: "Příjmení zákazníka" },
  { var: "{{email}}", desc: "Email zákazníka" },
  { var: "{{phone}}", desc: "Telefon zákazníka" },
  { var: "{{companyName}}", desc: "Název klubu" },
  { var: "{{date}}", desc: "Datum rezervace" },
  { var: "{{slots}}", desc: "Seznam časů (např. 08:00, 08:30)" },
  { var: "{{slotCount}}", desc: "Počet slotů" },
  { var: "{{totalPrice}}", desc: "Celková cena" },
  { var: "{{note}}", desc: "Poznámka zákazníka" },
  { var: "{{reason}}", desc: "Důvod storna (pouze u storna)" },
];

function defaultTemplateSubject(type) {
  if (type === "cancellation") return "Rezervace stornována – {{companyName}}";
  return type === "confirmation"
    ? "Rezervace potvrzena – {{companyName}}"
    : "Shrnutí rezervace – {{companyName}}";
}

const EMAIL_STYLE = `<style>
body{font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
h2{color:#1a1a1a;margin:0 0 8px;font-size:20px}
p{margin:4px 0;color:#555;font-size:14px;line-height:1.6}
table{width:100%;border-collapse:collapse;margin:8px 0}
td,th{padding:8px 12px;text-align:left;border-bottom:1px solid #eee;font-size:14px}
th{color:#888;font-weight:600;font-size:12px;text-transform:uppercase}
.price{font-size:18px;font-weight:700;color:#10b981}
.note{background:#fff8e1;border-left:4px solid #ffc107;padding:12px;margin:12px 0;font-size:13px;color:#795548}
.footer{margin-top:24px;padding-top:16px;border-top:1px solid #eee;color:#aaa;font-size:12px}
</style>`;

function wrapFullHtml(bodyContent) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${EMAIL_STYLE}</head><body>\n${bodyContent}\n</body></html>`;
}

function extractBodyHtml(fullHtml) {
  const m = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1].trim() : fullHtml;
}

function defaultTemplateBody(type) {
  if (type === "cancellation") {
    return `<div class=\"card\">\n<h2>❌ Rezervace stornována</h2>\n<p>Vaše rezervace v <strong>{{companyName}}</strong> byla <strong>zrušena</strong> administrátorem.</p>\n<hr style=\"border:0;border-top:1px solid #eee;margin:12px 0\">\n<table>\n<tr><th>Datum</th><td>{{date}}</td></tr>\n<tr><th>Časy</th><td>{{slots}}</td></tr>\n</table>\n<div class=\"note\">📝 Důvod: {{reason}}</div>\n<p style=\"margin-top:16px;color:#e11d48;font-weight:600\">Pokud máte dotazy, kontaktujte nás.</p>\n<div class=\"footer\">Rezervační systém • {{companyName}}</div>\n</div>`;
  }
  if (type === "confirmation") {
    return `<div class="card">\n<h2>✅ Rezervace potvrzena</h2>\n<p>Vaše rezervace v <strong>{{companyName}}</strong> byla <strong>potvrzena</strong> administrátorem.</p>\n<hr style="border:0;border-top:1px solid #eee;margin:12px 0">\n<table>\n<tr><th>Datum</th><td>{{date}}</td></tr>\n<tr><th>Časy</th><td>{{slots}}</td></tr>\n</table>\n<p style="margin-top:16px;color:#10b981;font-weight:600">Těšíme se na Vás! 🏓</p>\n<div class="footer">Rezervační systém • {{companyName}}</div>\n</div>`;
  }
  return `<div class="card">\n<h2>🏓 Rezervace přijata</h2>\n<p>Děkujeme, <strong>{{firstName}}</strong>! Vaše rezervace v <strong>{{companyName}}</strong> byla přijata.</p>\n<hr style="border:0;border-top:1px solid #eee;margin:12px 0">\n<table>\n<tr><th>Datum</th><td>{{date}}</td></tr>\n<tr><th>Časy</th><td>{{slots}}</td></tr>\n<tr><th>Počet bloků</th><td>{{slotCount}} × 30 min</td></tr>\n<tr><th>Cena celkem</th><td class="price">{{totalPrice}} Kč</td></tr>\n</table>\n<div class="note">⏳ Po schválení administrátorem Vám přijde potvrzovací email.</div>\n{{#if note}}<p style="color:#888;font-size:13px">📝 Vaše poznámka: {{note}}</p>{{/if}}\n<div class="footer">Rezervační systém • {{companyName}}</div>\n</div>`;
}

const clubThemePresets = [
  {
    id: "classic",
    label: "Klasik",
    description: "Zelená / černá / bílá",
    ...DEFAULT_CLUB_THEME,
  },
  {
    id: "royal",
    label: "Royal",
    description: "Modrá / tmavě modrá / bílá",
    brandColor: "#3b82f6",
    backgroundColor: "#081121",
    textColor: "#f5f9ff",
  },
  {
    id: "burgundy",
    label: "Burgundy",
    description: "Vínová / antracit / krémová",
    brandColor: "#e11d48",
    backgroundColor: "#14090d",
    textColor: "#fff5f7",
  },
  {
    id: "violet",
    label: "Violet",
    description: "Fialová / tmavá / světlá",
    brandColor: "#8b5cf6",
    backgroundColor: "#0f0a1d",
    textColor: "#f7f5ff",
  },
  {
    id: "amber",
    label: "Amber",
    description: "Oranžová / tmavě hnědá / světlá",
    brandColor: "#f59e0b",
    backgroundColor: "#120d04",
    textColor: "#fff8eb",
  },
  {
    id: "light",
    label: "Light",
    description: "Modrá / bílá / tmavý text",
    brandColor: "#0ea5e9",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
];

function normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }

  const shortMatch = raw.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    return `#${shortMatch[1]
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`.toLowerCase();
  }

  const longMatch = raw.match(/^#([0-9a-f]{6})$/i);
  if (longMatch) {
    return `#${longMatch[1]}`.toLowerCase();
  }

  return fallback;
}

function hexToRgbTuple(color) {
  const normalized = normalizeHexColor(color, "#000000").slice(1);
  return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
}

function mixHexColors(first, second, ratio = 0.5) {
  const [r1, g1, b1] = hexToRgbTuple(first);
  const [r2, g2, b2] = hexToRgbTuple(second);
  const weight = Math.min(Math.max(Number(ratio) || 0, 0), 1);
  const mixChannel = (start, end) => Math.round(start + (end - start) * weight);

  return `#${[mixChannel(r1, r2), mixChannel(g1, g2), mixChannel(b1, b2)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function getContrastColor(color) {
  const [r, g, b] = hexToRgbTuple(color);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 160 ? "#0b0d11" : "#f8fafc";
}

function isLightColor(color) {
  const [r, g, b] = hexToRgbTuple(color);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 180;
}

function normalizeClubTheme(theme) {
  return {
    brandColor: normalizeHexColor(theme?.brandColor, DEFAULT_CLUB_THEME.brandColor),
    backgroundColor: normalizeHexColor(theme?.backgroundColor, DEFAULT_CLUB_THEME.backgroundColor),
    textColor: normalizeHexColor(theme?.textColor, DEFAULT_CLUB_THEME.textColor),
  };
}

function buildThemeVariables(theme) {
  const normalizedTheme = normalizeClubTheme(theme);
  const { brandColor, backgroundColor, textColor } = normalizedTheme;
  const lightTheme = isLightColor(backgroundColor);
  const textSoftMixRatio = isLightColor(backgroundColor) ? 0.2 : 0.42;
  const successColor = mixHexColors(brandColor, "#22c55e", 0.45);
  const warningColor = mixHexColors(brandColor, "#f59e0b", 0.26);
  const dangerColor = mixHexColors(brandColor, "#ef4444", 0.24);
  const successInk = mixHexColors(successColor, textColor, lightTheme ? 0.64 : 0.42);
  const warningInk = mixHexColors(warningColor, textColor, lightTheme ? 0.66 : 0.44);
  const dangerInk = mixHexColors(dangerColor, textColor, lightTheme ? 0.66 : 0.44);

  return {
    "--bg-main": backgroundColor,
    "--bg-shell": mixHexColors(backgroundColor, textColor, 0.08),
    "--bg-panel": mixHexColors(backgroundColor, textColor, 0.04),
    "--bg-field": mixHexColors(backgroundColor, textColor, 0.1),
    "--surface-1": mixHexColors(backgroundColor, textColor, 0.06),
    "--surface-2": mixHexColors(backgroundColor, textColor, 0.1),
    "--surface-3": mixHexColors(backgroundColor, textColor, 0.14),
    "--surface-4": mixHexColors(backgroundColor, textColor, 0.18),
    "--line": mixHexColors(backgroundColor, textColor, 0.16),
    "--line-soft": mixHexColors(backgroundColor, textColor, 0.1),
    "--text": textColor,
    "--text-soft": mixHexColors(textColor, backgroundColor, textSoftMixRatio),
    "--brand": brandColor,
    "--brand-strong": mixHexColors(brandColor, backgroundColor, 0.14),
    "--brand-rgb": hexToRgbTuple(brandColor).join(", "),
    "--brand-contrast": getContrastColor(brandColor),
    "--success": successColor,
    "--success-rgb": hexToRgbTuple(successColor).join(", "),
    "--success-ink": successInk,
    "--warning": warningColor,
    "--warning-rgb": hexToRgbTuple(warningColor).join(", "),
    "--warning-ink": warningInk,
    "--danger": dangerColor,
    "--danger-rgb": hexToRgbTuple(dangerColor).join(", "),
    "--danger-ink": dangerInk,
  };
}

function applyThemeToDocument(theme) {
  const root = document.documentElement;
  const variables = buildThemeVariables(theme);
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

function detectThemePreset(theme) {
  const normalizedTheme = normalizeClubTheme(theme);
  const match = clubThemePresets.find(
    (preset) =>
      normalizeHexColor(preset.brandColor, "") === normalizedTheme.brandColor &&
      normalizeHexColor(preset.backgroundColor, "") === normalizedTheme.backgroundColor &&
      normalizeHexColor(preset.textColor, "") === normalizedTheme.textColor
  );

  return match?.id || "custom";
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

function toLocalDateKey(dateValue) {
  return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, "0")}-${String(
    dateValue.getDate()
  ).padStart(2, "0")}`;
}

function extractDateKey(value) {
  const parsed = parseDateInput(value);
  if (parsed) {
    return toLocalDateKey(parsed);
  }

  const raw = String(value || "").trim();
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw;
}

function parseDateInput(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dateOnly = new Date(`${raw}T12:00:00`);
    if (!Number.isNaN(dateOnly.getTime())) {
      return dateOnly;
    }
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLongDate(dateString) {
  const parsedDate = parseDateInput(dateString);
  if (!parsedDate) {
    return String(dateString || "Neznámé datum");
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(parsedDate);
}

function isContinuousSelection(slots, resource) {
  if (slots.length <= 1) {
    return true;
  }

  // Zjistit délku slotu z dat (první dva po sobě jdoucí časy v timeline)
  const timeline = (resource.slots || [])
    .map((s) => s.time_start)
    .sort((a, b) => a.localeCompare(b));
  
  let slotMinutes = 30; // fallback
  if (timeline.length >= 2) {
    const diff = minutesBetween(timeline[0], timeline[1]);
    if (diff > 0 && diff <= 120) slotMinutes = diff; // max 2h, pro jistotu
  }

  // Seřadit vybrané sloty podle času
  const sorted = [...slots].sort((a, b) => a.time_start.localeCompare(b.time_start));

  // Každý následující slot musí navazovat přesně o slotMinutes
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1].time_start;
    const curr = sorted[i].time_start;
    const expected = addMinutesToTime(prev, slotMinutes) + ":00";
    if (curr !== expected) {
      return false;
    }
  }

  return true;
}

/** Vrátí počet minut mezi dvěma časy ve formátu HH:MM:SS nebo HH:MM */
function minutesBetween(a, b) {
  const parse = (t) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
  return parse(b) - parse(a);
}

function Stepper({ step }) {
  const labels = ["Zdroj", "Datum", "Údaje", "Souhrn"];

  return (
    <div className="stepper">
      {labels.map((label, index) => {
        const stepNumber = index + 1;
        const state = step > stepNumber ? "done" : step === stepNumber ? "active" : "todo";

        return (
          <div className="stepItem" key={label}>
            <span className={`stepDot stepDot--${state}`}>{stepNumber}</span>
            <span className={`stepLabel ${state !== "todo" ? "stepLabel--on" : ""}`}>{label}</span>
            {stepNumber < labels.length && <span className="stepArrow">&gt;</span>}
          </div>
        );
      })}
    </div>
  );
}

function IconForCategory({ name, icon }) {
  const explicitIcon = String(icon || "").toLowerCase();
  const mappedIcon = categoryIconOptions.find((item) => item.value === explicitIcon)?.Icon;
  if (mappedIcon) {
    const IconComponent = mappedIcon;
    return <IconComponent className="w-8 h-8" />;
  }

  const normalized = String(name || "").toLowerCase();
  if (normalized.includes("robot")) {
    return <Cpu className="w-8 h-8" />;
  }
  if (normalized.includes("tren")) {
    return <Dumbbell className="w-8 h-8" />;
  }
  return <Trophy className="w-8 h-8" />;
}

function formatCurrencyCZK(value) {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatTimeShort(value) {
  return String(value || "").slice(0, 5);
}

function addMinutesToTime(timeStr, minutes) {
  const [h, m, s] = (timeStr || "00:00:00").split(":").map(Number);
  const d = new Date(2020, 0, 1, h || 0, (m || 0) + minutes, s || 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatReservationTerm(slots) {
  const normalized = Array.isArray(slots)
    ? [...slots].sort((a, b) =>
        `${a.date || ""} ${a.time_start || ""}`.localeCompare(`${b.date || ""} ${b.time_start || ""}`)
      )
    : [];

  if (normalized.length === 0) {
    return "Termín není určen";
  }

  const firstSlot = normalized[0];
  const lastSlot = normalized[normalized.length - 1];
  const firstDateKey = extractDateKey(firstSlot.date);
  const lastDateKey = extractDateKey(lastSlot.date);
  const firstDateLabel = formatLongDate(firstDateKey);
  const lastDateLabel = formatLongDate(lastDateKey);
  const from = formatTimeShort(firstSlot.time_start);
  const to = formatTimeShort(lastSlot.time_end);

  if (firstDateKey === lastDateKey) {
    return `${firstDateLabel} | ${from}-${to}`;
  }

  return `${firstDateLabel} ${from} -> ${lastDateLabel} ${to}`;
}

function buildOverviewRowsForDate(reservations, targetDate) {
  const rows = [];

  for (const reservation of reservations) {
    // Filtrovat sloty pro daný den
    const daySlots = (reservation.slots || []).filter(
      (s) => extractDateKey(s.date) === targetDate
    );
    if (daySlots.length === 0) continue;

    // Seřadit podle času
    daySlots.sort((a, b) => String(a.time_start).localeCompare(String(b.time_start)));

    const firstSlot = daySlots[0];
    const lastSlot = daySlots[daySlots.length - 1];
    const totalPrice = daySlots.reduce((sum, s) => sum + Number(s.price || 0), 0);
    const timeStart = formatTimeShort(firstSlot.time_start);
    const timeEnd = addMinutesToTime(lastSlot.time_start, 30);

    // Unikátní zdroje
    const resources = [...new Set(daySlots.map((s) => s.resource_name).filter(Boolean))];

    rows.push({
      reservationId: reservation.id,
      status: reservation.status,
      playerName:
        `${reservation.first_name || ""} ${reservation.last_name || ""}`.trim() ||
        reservation.email ||
        "Host",
      resourceName: resources.join(", "),
      timeRange: daySlots.length === 1 ? timeStart : `${timeStart} - ${timeEnd}`,
      slotCount: daySlots.length,
      price: totalPrice,
    });
  }

  return rows.sort((a, b) => String(a.timeRange).localeCompare(String(b.timeRange)));
}

function getInitials(user) {
  const first = String(user?.firstName || "").trim();
  const last = String(user?.lastName || "").trim();
  const initials = `${first[0] || ""}${last[0] || ""}`.toUpperCase();
  return initials || "AD";
}

function ReservationPage() {
  const [step, setStep] = useState(1);
  const [clubInfo, setClubInfo] = useState(null);
  const [categories, setCategories] = useState([]);
  const [resources, setResources] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [minAdvanceMinutes, setMinAdvanceMinutes] = useState(0);

  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(today);
  const [selectedSlots, setSelectedSlots] = useState([]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("onsite");
  const [customerMode, setCustomerMode] = useState("guest");
  const [playerAuthMode, setPlayerAuthMode] = useState("login");
  const [playerProfile, setPlayerProfile] = useState(null);
  const [playerAuthLoading, setPlayerAuthLoading] = useState(false);
  const [playerAuthError, setPlayerAuthError] = useState("");
  const [playerLoginForm, setPlayerLoginForm] = useState({ email: "", password: "" });
  const [playerRegisterForm, setPlayerRegisterForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const selectedCategory = useMemo(
    () => categories.find((category) => String(category.id) === String(categoryId)),
    [categories, categoryId]
  );

  const selectedResourceId = selectedSlots[0]?.resource_id || null;
  const selectedResourceName = selectedSlots[0]?.resource_name || "";

  const totalPrice = useMemo(
    () => selectedSlots.reduce((sum, slot) => sum + Number(slot.price || 0), 0),
    [selectedSlots]
  );

  const sortedSelectedSlots = useMemo(
    () => [...selectedSlots].sort((a, b) => a.time_start.localeCompare(b.time_start)),
    [selectedSlots]
  );

  const firstSlotStart = sortedSelectedSlots[0]?.time_start;
  const lastSlotEnd = sortedSelectedSlots[sortedSelectedSlots.length - 1]?.time_end;

  const timeline = useMemo(() => {
    const set = new Set();
    for (const row of availability) {
      for (const slot of row.slots || []) {
        if (!slot.available) {
          continue;
        }
        set.add(slot.time_start);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [availability]);

  const visibleAvailability = useMemo(
    () =>
      availability.filter((resource) =>
        (resource.slots || []).some((slot) => slot.available)
      ),
    [availability]
  );

  const canStep2 = !!categoryId;
  const canStep3 = selectedSlots.length > 0;
  const canStep4 = firstName.trim() && lastName.trim() && email.trim();

  function applyPlayerProfile(user) {
    const normalizedUser = user || null;
    setPlayerProfile(normalizedUser);
    setFirstName(String(normalizedUser?.firstName || ""));
    setLastName(String(normalizedUser?.lastName || ""));
    setEmail(String(normalizedUser?.email || ""));
    setPhone(String(normalizedUser?.phone || ""));
    setCustomerMode("login");
    setPlayerAuthError("");
  }

  useEffect(() => {
    let active = true;

    api
      .getCompany()
      .then((company) => {
        if (!active) {
          return;
        }
        setClubInfo(company || null);
        applyThemeToDocument(company || DEFAULT_CLUB_THEME);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setClubInfo(null);
        applyThemeToDocument(DEFAULT_CLUB_THEME);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    api
      .getCategories()
      .then((data) => {
        setCategories(data);
        if (data[0]) {
          setCategoryId(String(data[0].id));
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!api.getPlayerToken()) {
      return;
    }

    setPlayerAuthLoading(true);
    api
      .getPlayerProfile()
      .then((data) => {
        if (data?.user) {
          applyPlayerProfile(data.user);
        }
      })
      .catch(() => {
        api.clearPlayerToken();
        setPlayerProfile(null);
      })
      .finally(() => setPlayerAuthLoading(false));
  }, []);

  async function loadAvailability(targetCategoryId, targetDate) {
    if (!targetCategoryId) {
      return;
    }

    try {
      const data = await api.getAvailability(targetCategoryId, targetDate);
      setAvailability(data.resources || []);
      setMinAdvanceMinutes(Math.max(Number(data.minAdvanceMinutes) || 0, 0));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!categoryId) {
      return;
    }

    setSelectedSlots([]);
    setStatus("");
    setError("");

    api
      .getResources(categoryId)
      .then((data) => {
        setResources(data);
      })
      .catch((err) => setError(err.message));

    loadAvailability(categoryId, date);
  }, [categoryId]);

  useEffect(() => {
    if (!categoryId || !date) {
      return;
    }

    setSelectedSlots([]);
    setStatus("");
    setError("");

    loadAvailability(categoryId, date);
  }, [categoryId, date]);

  function toggleSlot(resource, slot) {
    if (!slot.available) {
      return;
    }

    const key = `${resource.resource_id}_${slot.time_start}`;

    setSelectedSlots((current) => {
      const existing = current.find(
        (item) => `${item.resource_id}_${item.time_start}` === key
      );

      const currentForResource = current
        .filter((item) => item.resource_id === resource.resource_id)
        .sort((a, b) => a.time_start.localeCompare(b.time_start));

      if (existing) {
        const next = currentForResource.filter((item) => item.time_start !== slot.time_start);

        if (!isContinuousSelection(next, resource)) {
          setError("Lze vybírat pouze po sobě jdoucí časové bloky.");
          return current;
        }

        setError("");
        return next;
      }

      const nextSlot = {
        resource_id: resource.resource_id,
        resource_name: resource.resource_name,
        time_start: slot.time_start,
        time_end: slot.time_end,
        price: slot.price,
      };

        // Povolit výběr pouze v rámci jednoho stolu/služby, ať souhlasí souhrn a backend payload.
      const next = [...currentForResource, nextSlot].sort((a, b) => a.time_start.localeCompare(b.time_start));

      if (!isContinuousSelection(next, resource)) {
        setError("Lze vybírat pouze po sobě jdoucí časové bloky.");
        return current;
      }

      setError("");
      return next;
    });
  }

  async function completeReservation() {
    setStatus("");
    setError("");

    try {
      const response = await api.createReservation({
        categoryId: Number(categoryId),
        resourceId: Number(selectedResourceId),
        date,
        slotStarts: sortedSelectedSlots.map((slot) => slot.time_start),
        firstName,
        lastName,
        email,
        phone,
        note,
      });

      setStatus(
        response.status === "pending"
          ? `Rezervace #${response.reservationId} přijata a čeká na schválení. Celkem ${response.totalPrice} Kč.`
          : `Rezervace #${response.reservationId} uložena. Celkem ${response.totalPrice} Kč.`
      );
      setSelectedSlots([]);
      setStep(1);

      await loadAvailability(categoryId, date);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePlayerLoginSubmit(event) {
    event.preventDefault();
    setPlayerAuthLoading(true);
    setPlayerAuthError("");

    try {
      const response = await api.playerLogin(playerLoginForm.email, playerLoginForm.password);
      applyPlayerProfile(response.user);
      setPlayerLoginForm((current) => ({ ...current, password: "" }));
    } catch (err) {
      setPlayerAuthError(err.message);
    } finally {
      setPlayerAuthLoading(false);
    }
  }

  async function handlePlayerRegisterSubmit(event) {
    event.preventDefault();
    setPlayerAuthLoading(true);
    setPlayerAuthError("");

    try {
      const response = await api.playerRegister(playerRegisterForm);
      applyPlayerProfile(response.user);
      setPlayerRegisterForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        password: "",
      });
    } catch (err) {
      setPlayerAuthError(err.message);
    } finally {
      setPlayerAuthLoading(false);
    }
  }

  function handlePlayerLogout() {
    api.clearPlayerToken();
    setPlayerProfile(null);
    setCustomerMode("guest");
    setPlayerAuthError("");
    setPlayerLoginForm({ email: "", password: "" });
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
  }

  return (
    <main className="container">
       <section className="wizardShell">
         <header className="hero">
           <div className="heroIcon">
             <Trophy className="w-12 h-12" />
           </div>
           <div>
              <h1 className="pageTitle">
                {clubInfo?.name ? `Rezervace – ${clubInfo.name}` : "Rezervace stolního tenisu"}
              </h1>
              <p className="subtitle">
                {clubInfo?.name
                  ? `Vyberte si termín a hrajte v klubu ${clubInfo.name}.`
                  : "Vyberte si stůl a čas pro vaši hru."}
              </p>
           </div>
         </header>

        <Stepper step={step} />

        <section className="panel">
          {step === 1 && (
            <>
              <h2 className="panelTitle panelTitle--center">Co si zahrajete?</h2>
              <p className="muted muted--center">Vyberte si kategorii stolu nebo služby</p>

              <div className="categoryGrid">
                {categories.map((category) => {
                  const active = String(category.id) === String(categoryId);
                  const categoryCount = Number(category.activeResourceCount);
                  const count = Number.isFinite(categoryCount)
                    ? categoryCount
                    : active
                      ? resources.length
                      : 0;

                  return (
                    <button
                      key={category.id}
                      type="button"
                      className={`categoryCard ${active ? "categoryCard--active" : ""}`}
                      onClick={() => setCategoryId(String(category.id))}
                    >
                      <div className="categoryIcon">
                        <IconForCategory name={category.name} icon={category.icon} />
                      </div>
                      <strong>{category.name}</strong>
                      <span>{count} možností k rezervaci</span>
                    </button>
                  );
                })}
              </div>

              <div className="panelActions panelActions--right">
                <button
                  type="button"
                  className="primaryBtn"
                  disabled={!canStep2}
                  onClick={() => setStep(2)}
                >
                  Pokračovat k výběru data
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="panelTitle panelTitle--center">Vyberte datum a čas</h2>
              {minAdvanceMinutes > 0 && (
                <p className="muted muted--center">
                  Rezervaci lze vytvořit nejdříve {minAdvanceMinutes} min před začátkem hry.
                </p>
              )}

              <div className="dateSwitcher">
                <button type="button" className="ghostChip" onClick={() => setDate(addDays(date, -1))}>
                  &lt;
                </button>
                <div className="dateValue">{formatLongDate(date)}</div>
                <button type="button" className="ghostChip" onClick={() => setDate(addDays(date, 1))}>
                  &gt;
                </button>
              </div>

              <div className={`timeTableWrap ${visibleAvailability.length === 0 ? "timeTableWrap--empty" : ""}`}>
                <table className="timeTable">
                  <thead>
                    <tr>
                      <th> </th>
                      {timeline.map((time) => (
                        <th key={time}>{time.slice(0, 5)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAvailability.map((resource) => (
                      <tr key={resource.resource_id}>
                        <th>{resource.resource_name}</th>
                        {timeline.map((time) => {
                          const slot = (resource.slots || []).find((item) => item.time_start === time);
                          if (!slot) {
                            return <td key={`${resource.resource_id}_${time}`} className="cell cell--na">x</td>;
                          }

                          const selected = sortedSelectedSlots.some(
                            (item) =>
                              item.resource_id === resource.resource_id && item.time_start === slot.time_start
                          );

                          return (
                            <td
                              key={`${resource.resource_id}_${time}`}
                              className={`cell ${slot.available ? "cell--free" : "cell--blocked"} ${
                                selected ? "cell--selected" : ""
                              }`}
                              onClick={() => toggleSlot(resource, slot)}
                            >
                              {slot.available ? `${slot.price} Kč` : "x"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {visibleAvailability.length === 0 && (
                      <tr>
                        <td colSpan={Math.max(timeline.length + 1, 1)} className="emptyCell emptyCell--left">
                          Pro vybraný den už není žádný rezervovatelný termín.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="panelActions panelActions--between">
                <button type="button" className="textBtn" onClick={() => setStep(1)}>
                  Zpět na výběr
                </button>

                <div className="actionsRight">
                  {selectedSlots.length > 0 && (
                    <span className="priceChip">Celkem za {selectedSlots.length} bloky: {totalPrice} Kč</span>
                  )}
                  <button
                    type="button"
                    className="primaryBtn"
                    disabled={!canStep3}
                    onClick={() => setStep(3)}
                  >
                    Pokračovat na údaje
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="panelTitle panelTitle--center">Kdo bude hrát?</h2>
              <p className="muted muted--center">Vyplňte údaje nebo se přihlaste pro čerpání kreditu</p>

              <div className="tabRow">
                <button
                  type="button"
                  className={`tab ${customerMode === "guest" ? "tab--active" : ""}`}
                  onClick={() => setCustomerMode("guest")}
                >
                  Nová rezervace
                </button>
                <button
                  type="button"
                  className={`tab ${customerMode === "login" ? "tab--active" : ""}`}
                  onClick={() => setCustomerMode("login")}
                >
                  Přihlásit se
                </button>
              </div>

              {customerMode === "guest" ? (
                <div className="formGrid">
                  <label>
                    Jméno
                    <input className="field" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </label>
                  <label>
                    Příjmení
                    <input className="field" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </label>
                  <label className="full">
                    E-mail
                    <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
                  </label>
                  <label className="full">
                    Telefon
                    <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </label>
                  <label className="full">
                    Poznámka
                    <textarea className="field" value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                </div>
              ) : (
                <>
                  {playerProfile ? (
                    <div className="summaryGrid">
                      <article className="summaryCard">
                        <h3>Přihlášený hráč</h3>
                        <p>
                          <strong>{playerProfile.firstName} {playerProfile.lastName}</strong>
                        </p>
                        <p className="muted">{playerProfile.email}</p>
                        <p className="muted">{playerProfile.phone || "bez telefonu"}</p>
                      </article>

                      <article className="summaryCard">
                        <h3>Rezervace</h3>
                        <p className="muted">Rezervaci vytvoříme pod vaším hráčským účtem.</p>
                        <div className="actionsRight">
                          <button type="button" className="ghostBtn" onClick={handlePlayerLogout}>
                            Odhlásit hráče
                          </button>
                        </div>
                      </article>
                    </div>
                  ) : (
                    <>
                      <div className="tabRow">
                        <button
                          type="button"
                          className={`tab ${playerAuthMode === "login" ? "tab--active" : ""}`}
                          onClick={() => setPlayerAuthMode("login")}
                        >
                          Přihlášení
                        </button>
                        <button
                          type="button"
                          className={`tab ${playerAuthMode === "register" ? "tab--active" : ""}`}
                          onClick={() => setPlayerAuthMode("register")}
                        >
                          Registrace hráče
                        </button>
                      </div>

                      {playerAuthMode === "login" ? (
                        <form className="formGrid" onSubmit={handlePlayerLoginSubmit}>
                          <label className="full">
                            E-mail
                            <input
                              className="field"
                              type="email"
                              value={playerLoginForm.email}
                              onChange={(event) =>
                                setPlayerLoginForm((current) => ({ ...current, email: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <label className="full">
                            Heslo
                            <input
                              className="field"
                              type="password"
                              value={playerLoginForm.password}
                              onChange={(event) =>
                                setPlayerLoginForm((current) => ({ ...current, password: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <div className="actionsRight">
                            <button className="primaryBtn" type="submit" disabled={playerAuthLoading}>
                              {playerAuthLoading ? "Přihlašuji..." : "Přihlásit hráče"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <form className="formGrid" onSubmit={handlePlayerRegisterSubmit}>
                          <label>
                            Jméno
                            <input
                              className="field"
                              value={playerRegisterForm.firstName}
                              onChange={(event) =>
                                setPlayerRegisterForm((current) => ({ ...current, firstName: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <label>
                            Příjmení
                            <input
                              className="field"
                              value={playerRegisterForm.lastName}
                              onChange={(event) =>
                                setPlayerRegisterForm((current) => ({ ...current, lastName: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <label className="full">
                            E-mail
                            <input
                              className="field"
                              type="email"
                              value={playerRegisterForm.email}
                              onChange={(event) =>
                                setPlayerRegisterForm((current) => ({ ...current, email: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <label className="full">
                            Telefon
                            <input
                              className="field"
                              value={playerRegisterForm.phone}
                              onChange={(event) =>
                                setPlayerRegisterForm((current) => ({ ...current, phone: event.target.value }))
                              }
                            />
                          </label>
                          <label className="full">
                            Heslo
                            <input
                              className="field"
                              type="password"
                              value={playerRegisterForm.password}
                              onChange={(event) =>
                                setPlayerRegisterForm((current) => ({ ...current, password: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <div className="actionsRight">
                            <button className="primaryBtn" type="submit" disabled={playerAuthLoading}>
                              {playerAuthLoading ? "Vytvářím účet..." : "Vytvořit hráčský účet"}
                            </button>
                          </div>
                        </form>
                      )}

                      {playerAuthError && <p className="status error">{playerAuthError}</p>}
                    </>
                  )}

                  <label className="full" style={{ marginTop: 12 }}>
                    Poznámka
                    <textarea className="field" value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                </>
              )}

              <div className="panelActions panelActions--between">
                <button type="button" className="textBtn" onClick={() => setStep(2)}>
                  Zpět
                </button>
                <button
                  type="button"
                  className="primaryBtn"
                  disabled={!canStep4}
                  onClick={() => setStep(4)}
                >
                  Pokračovat na souhrn
                </button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="panelTitle panelTitle--center">Shrnutí rezervace</h2>
              <p className="muted muted--center">Zkontrolujte si údaje a vyberte způsob platby</p>

              <div className="summaryGrid">
                <article className="summaryCard">
                  <h3>Detail termínu</h3>
                  <p>
                    <strong>{selectedResourceName || "Stůl"}</strong>
                  </p>
                  <p className="muted">{selectedCategory?.name || "Kategorie"}</p>
                  <p>{formatLongDate(date)}</p>
                  <p>
                    {firstSlotStart?.slice(0, 5)} - {lastSlotEnd?.slice(0, 5)} ({selectedSlots.length * 30} min)
                  </p>
                </article>

                <article className="summaryCard">
                  <h3>Hráč</h3>
                  <p>
                    <strong>
                      {firstName} {lastName}
                    </strong>
                  </p>
                  <p className="muted">{email}</p>
                  <p className="muted">{phone || "bez telefonu"}</p>
                </article>
              </div>

              <h3 className="subTitle">Způsob platby</h3>
              <div className="paymentGrid">
                <button
                  type="button"
                  className={`payCard ${paymentMethod === "card" ? "payCard--active" : ""}`}
                  disabled
                >
                  <strong>Kartou online</strong>
                  <span>GoPay / Stripe (ve výstavbě)</span>
                </button>
                <button
                  type="button"
                  className={`payCard ${paymentMethod === "onsite" ? "payCard--active" : ""}`}
                  onClick={() => setPaymentMethod("onsite")}
                >
                  <strong>Na místě</strong>
                  <span>Hotově / Kartou</span>
                </button>
              </div>

              <div className="panelActions panelActions--between">
                <button type="button" className="textBtn" onClick={() => setStep(3)}>
                  Zpět
                </button>

                <div className="actionsRight">
                  <span className="priceBig">K úhradě {totalPrice} Kč</span>
                  <button type="button" className="primaryBtn" onClick={completeReservation}>
                    Dokončit rezervaci
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {status && <p className="status ok">{status}</p>}
        {error && <p className="status error">{error}</p>}

        <footer className="widgetFooter">
          <img src="/logo-lura.png" alt="LuRa IT" />
          <span>Vyvinuto s <span className="heart">❤</span> od <a href="https://lura-it.eu/" target="_blank" rel="noreferrer">LuRa IT Develop</a>. © {new Date().getFullYear()}</span>
        </footer>
      </section>
    </main>
  );
}

function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.adminLogin(email, password);
      window.location.href = "/admin/dashboard";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container adminPage">
      <section className="card" style={{ maxWidth: 460, margin: "32px auto" }}>
        <h1 className="pageTitle">Admin přihlášení</h1>
        <p className="subtitle">Přihlaste se účtem administrátora své company.</p>

        <form className="formGrid" onSubmit={handleSubmit}>
          <label className="full">
            E-mail
            <input
              className="field"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="full">
            Heslo
            <input
              className="field"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <button className="primaryBtn" type="submit" disabled={loading}>
            {loading ? "Přihlašuji..." : "Přihlásit"}
          </button>
        </form>

        {error && <p className="status error">{error}</p>}
      </section>
    </main>
  );
}

function AdminDashboardPage() {
  const [adminUser, setAdminUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [reservations, setReservations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [pendingReservationsCount, setPendingReservationsCount] = useState(0);
  const [emailLogs, setEmailLogs] = useState([]);
  const [emailLogsLoading, setEmailLogsLoading] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState({});
  const [emailTemplatesLoading, setEmailTemplatesLoading] = useState(false);
  const [editingTemplateType, setEditingTemplateType] = useState(null);
  const [templateForm, setTemplateForm] = useState({ subject: "", bodyHtml: "" });
  const [templateSaving, setTemplateSaving] = useState(false);
  const editorRef = useRef(null);
  const [showRevenueChart, setShowRevenueChart] = useState(false);
  const [revenueChartDays, setRevenueChartDays] = useState(14);
  const [revenueDateFrom, setRevenueDateFrom] = useState("");
  const [revenueDateTo, setRevenueDateTo] = useState("");

  const [companies, setCompanies] = useState([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companiesError, setCompaniesError] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyForm, setCompanyForm] = useState({ name: "", timezone: "Europe/Prague" });
  const [editingCompany, setEditingCompany] = useState(null);
  const [copiedEmbedCompanyId, setCopiedEmbedCompanyId] = useState(null);

  const [userForm, setUserForm] = useState({
    companyId: "",
    role: "admin",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
    notifyEmails: true,
  });
  const [editingUser, setEditingUser] = useState(null);
  const [adminCategories, setAdminCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [adminResources, setAdminResources] = useState([]);
  const [pricingWindows, setPricingWindows] = useState([]);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    icon: "trophy",
    defaultSlotDuration: "30",
  });
  const [editingCategory, setEditingCategory] = useState(null);
  const [showCreateCategoryForm, setShowCreateCategoryForm] = useState(false);
  const [showCreateCompanyForm, setShowCreateCompanyForm] = useState(false);
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [resourceForm, setResourceForm] = useState({
    categoryId: "",
    name: "",
    isActive: true,
  });
  const [editingResource, setEditingResource] = useState(null);
  const [showCreateResourceForm, setShowCreateResourceForm] = useState(false);
  const [sourcesSection, setSourcesSection] = useState("categories");
  const [pricingForm, setPricingForm] = useState({
    categoryId: "",
    resourceIds: [],
    dayOfWeek: "1",
    timeFrom: "08:00",
    timeTo: "10:00",
    pricePerSlot: "0",
  });
  const [editingPricingWindow, setEditingPricingWindow] = useState(null);
  const [showCreatePricingWindowForm, setShowCreatePricingWindowForm] = useState(false);
  const [pricingSection, setPricingSection] = useState("windows");
  const [bookingSettings, setBookingSettings] = useState({ minAdvanceMinutes: 120 });
  const [bookingSettingsLoading, setBookingSettingsLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [ownCompanySettings, setOwnCompanySettings] = useState(null);
  const [clubForm, setClubForm] = useState({
    id: "",
    name: "",
    timezone: "Europe/Prague",
    brandColor: DEFAULT_CLUB_THEME.brandColor,
    backgroundColor: DEFAULT_CLUB_THEME.backgroundColor,
    textColor: DEFAULT_CLUB_THEME.textColor,
  });
  const [staffForm, setStaffForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [showCreateStaffForm, setShowCreateStaffForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);

  const normalizedAdminRole = String(adminUser?.role || "").trim().toLowerCase();
  const isSuperAdmin = normalizedAdminRole === "superadmin";
  const adminNavItems = isSuperAdmin
    ? [{ id: "superadmin", label: "Company a admini", Icon: Users }]
    : [
        { id: "overview", label: "Přehled", Icon: BarChart3 },
        {
          id: "reservations",
          label: "Rezervace",
          Icon: ClipboardList,
          count: pendingReservationsCount,
        },
        { id: "sources", label: "Zdroje a Stoly", Icon: Package },
        { id: "pricing", label: "Ceníky a Okna", Icon: DollarSign },
        { id: "emails", label: "Email logy", Icon: TrendingUp },
        { id: "settings", label: "Nastavení", Icon: Settings },
      ];
  const selectedCompany = useMemo(
    () => companies.find((company) => String(company.id) === String(selectedCompanyId)),
    [companies, selectedCompanyId]
  );
  const selectedUsers = selectedCompany?.users || [];
  const selectedAdminCategory = useMemo(
    () => adminCategories.find((category) => String(category.id) === String(selectedCategoryId)) || null,
    [adminCategories, selectedCategoryId]
  );
  const adminStaffUsers = useMemo(
    () =>
      (ownCompanySettings?.users || []).filter(
        (user) => String(user.role || "").toLowerCase() === "admin"
      ),
    [ownCompanySettings]
  );
  const adminBrandName = useMemo(() => {
    if (isSuperAdmin) {
      return "Klub";
    }
    return String(ownCompanySettings?.name || "Klub");
  }, [isSuperAdmin, ownCompanySettings]);
  const selectedClubThemePreset = useMemo(() => detectThemePreset(clubForm), [clubForm]);
  const clubThemePreviewStyle = useMemo(() => buildThemeVariables(clubForm), [clubForm]);
  const tomorrow = useMemo(() => addDays(today, 1), []);

  const overviewRows = useMemo(() => buildOverviewRowsForDate(reservations, today), [reservations]);
  const tomorrowOverviewRows = useMemo(
    () => buildOverviewRowsForDate(reservations, tomorrow),
    [reservations, tomorrow]
  );

  const overviewStats = useMemo(() => {
    const uniqueTodayReservations = new Set(overviewRows.map((row) => row.reservationId)).size;
    const todayRevenue = overviewRows.reduce((sum, row) => sum + Number(row.price || 0), 0);

    // Tržby z total_price (celková cena rezervace), ne po slotech
    const futureRevenue = reservations
      .filter((r) => r.status !== "cancelled")
      .filter((r) => (r.slots || []).some((s) => extractDateKey(s.date) > today))
      .reduce((sum, r) => sum + Number(r.total_price || 0), 0);

    const pastRevenue = reservations
      .filter((r) => r.status !== "cancelled")
      .filter((r) => (r.slots || []).every((s) => extractDateKey(s.date) < today) && (r.slots || []).length > 0)
      .reduce((sum, r) => sum + Number(r.total_price || 0), 0);

    const newPlayers = isSuperAdmin
      ? (companies.flatMap((company) => company.users || []) || []).filter(
          (user) => user.role === "player" && extractDateKey(user.createdAt) === today
        ).length
      : 0;

    return [
      {
        label: "Dnešní rezervace",
        value: String(uniqueTodayReservations),
        icon: Calendar,
        tone: "green",
      },
      {
        label: "Dnešní tržba",
        value: formatCurrencyCZK(todayRevenue),
        icon: DollarSign,
        tone: "green",
      },
      {
        label: "Očekávaná tržba\n(Budoucí)",
        value: formatCurrencyCZK(futureRevenue),
        icon: TrendingUp,
        tone: "amber",
      },
      {
        label: "Uskutečněná tržba\n(Minulá)",
        value: formatCurrencyCZK(pastRevenue),
        icon: DollarSign,
        tone: "gray",
      },
      {
        label: "Noví hráči",
        value: String(newPlayers),
        icon: Users,
        tone: "blue",
      },
    ];
  }, [companies, isSuperAdmin, overviewRows, reservations]);

  const revenueChartData = useMemo(() => {
    const todayDate = new Date(today);
    const map = {};

    if (revenueDateFrom && revenueDateTo) {
      let current = new Date(revenueDateFrom);
      const end = new Date(revenueDateTo);
      while (current <= end) {
        const key = extractDateKey(current);
        map[key] = 0;
        current.setDate(current.getDate() + 1);
      }
    } else {
      const days = revenueChartDays;
      for (let i = 0; i < days; i++) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - i - 1);
        const key = extractDateKey(d);
        map[key] = 0;
      }
    }

    for (const r of reservations) {
      if (r.status === "cancelled") continue;
      for (const s of r.slots || []) {
        const dk = extractDateKey(s.date);
        if (dk in map) map[dk] += Number(s.price || 0);
      }
    }

    const sortedEntries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    const maxVal = Math.max(1, ...Object.values(map));
    return { entries: sortedEntries, maxVal };
  }, [reservations, revenueChartDays, revenueDateFrom, revenueDateTo, today]);

  async function loadReservations() {
    if (!api.getAdminToken()) {
      window.location.href = "/admin";
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await api.getAdminReservations({
        status: statusFilter,
        date: dateFilter,
      });
      setReservations(data);
      await loadPendingReservationsCount();
    } catch (err) {
      if (String(err.message || "").includes("401") || String(err.message || "").includes("prihlaseni")) {
        api.clearAdminToken();
        window.location.href = "/admin";
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingReservationsCount() {
    if (!api.getAdminToken() || isSuperAdmin) {
      return;
    }
    try {
      const data = await api.getAdminPendingReservationsCount();
      setPendingReservationsCount(Math.max(Number(data?.pendingCount) || 0, 0));
    } catch (err) {
      if (String(err.message || "").includes("prihlaseni")) {
        api.clearAdminToken();
        window.location.href = "/admin";
      }
    }
  }

  async function loadEmailLogs() {
    if (!api.getAdminToken() || isSuperAdmin) return;
    setEmailLogsLoading(true);
    try {
      const data = await api.getEmailLogs();
      setEmailLogs(data);
    } catch (err) { /* silent */ }
    finally { setEmailLogsLoading(false); }
  }

  async function loadEmailTemplates() {
    if (!api.getAdminToken() || isSuperAdmin) return;
    setEmailTemplatesLoading(true);
    try {
      const data = await api.getEmailTemplates();
      setEmailTemplates(data || {});
    } catch (err) { /* silent */ }
    finally { setEmailTemplatesLoading(false); }
  }

  function startEditTemplate(type) {
    const tpl = emailTemplates[type];
    const rawHtml = tpl?.bodyHtml || defaultTemplateBody(type);
    setEditingTemplateType(type);
    setTemplateForm({
      subject: tpl?.subject || defaultTemplateSubject(type),
      bodyHtml: extractBodyHtml(rawHtml),
    });
  }

  async function saveTemplate() {
    if (!editingTemplateType) return;
    setTemplateSaving(true);
    try {
      const fullHtml = wrapFullHtml(templateForm.bodyHtml);
      const saved = await api.saveEmailTemplate(editingTemplateType, templateForm.subject, fullHtml);
      setEmailTemplates((prev) => ({ ...prev, [editingTemplateType]: saved }));
      setEditingTemplateType(null);
      setNotice("Šablona uložena.");
    } catch (err) {
      setNotice("Chyba: " + (err.message || "ukládání"));
    } finally {
      setTemplateSaving(false);
    }
  }

  function handleEditorChange() {
    if (editorRef.current) {
      setTemplateForm((f) => ({ ...f, bodyHtml: editorRef.current.innerHTML }));
    }
  }

  useEffect(() => {
    if (editingTemplateType && editorRef.current) {
      editorRef.current.innerHTML = templateForm.bodyHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTemplateType]);

  async function loadAdminCategoryDetails(categoryId) {
    if (!categoryId || isSuperAdmin) {
      setAdminResources([]);
      setPricingWindows([]);
      return;
    }

    setCatalogLoading(true);
    setCatalogError("");

    try {
      const [resourcesData, pricingData] = await Promise.all([
        api.getAdminResources(categoryId),
        api.getAdminPricingWindows(categoryId),
      ]);
      setAdminResources(resourcesData);
      setPricingWindows(pricingData);
    } catch (err) {
      setCatalogError(err.message);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadAdminCatalog(preferredCategoryId = "") {
    if (isSuperAdmin) {
      return [];
    }

    setCatalogLoading(true);
    setCatalogError("");

    try {
      const categoriesData = await api.getAdminCategories();
      setAdminCategories(categoriesData);

      const nextCategoryId = preferredCategoryId || selectedCategoryId || String(categoriesData[0]?.id || "");
      setSelectedCategoryId(nextCategoryId);
      setResourceForm((current) => ({
        ...current,
        categoryId: current.categoryId || String(nextCategoryId || ""),
      }));
      setPricingForm((current) => ({
        ...current,
        categoryId: current.categoryId || String(nextCategoryId || ""),
      }));

      if (nextCategoryId) {
        const [resourcesData, pricingData] = await Promise.all([
          api.getAdminResources(nextCategoryId),
          api.getAdminPricingWindows(nextCategoryId),
        ]);
        setAdminResources(resourcesData);
        setPricingWindows(pricingData);
      } else {
        setAdminResources([]);
        setPricingWindows([]);
      }

      return categoriesData;
    } catch (err) {
      setCatalogError(err.message);
      return [];
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadBookingSettings(companyId = "") {
    if (isSuperAdmin) {
      return;
    }

    setBookingSettingsLoading(true);
    setCatalogError("");
    try {
      const data = await api.getAdminBookingSettings(companyId);
      setBookingSettings({
        minAdvanceMinutes: Math.max(Number(data?.minAdvanceMinutes) || 0, 0),
      });
    } catch (err) {
      setCatalogError(err.message);
    } finally {
      setBookingSettingsLoading(false);
    }
  }

  async function loadAdminSettingsPanel() {
    if (isSuperAdmin) {
      return;
    }

    setSettingsLoading(true);
    setCatalogError("");
    try {
      const companiesData = await api.getAdminCompanies();
      const ownCompany = companiesData[0] || null;
      setOwnCompanySettings(ownCompany);

      if (ownCompany) {
        setClubForm({
          id: String(ownCompany.id),
          name: ownCompany.name || "",
          timezone: ownCompany.timezone || "Europe/Prague",
          brandColor: ownCompany.brandColor || DEFAULT_CLUB_THEME.brandColor,
          backgroundColor: ownCompany.backgroundColor || DEFAULT_CLUB_THEME.backgroundColor,
          textColor: ownCompany.textColor || DEFAULT_CLUB_THEME.textColor,
        });
      }
    } catch (err) {
      setCatalogError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function loadCompanies(preferredCompanyId = "", _forceSuperAdmin = false) {
    if (!isSuperAdmin && !_forceSuperAdmin) {
      return [];
    }

    if (typeof api.getAdminCompanies !== "function") {
      setCompaniesError("Frontend API je neaktualni (chybi getAdminCompanies). Provedte novy build/reload.");
      return [];
    }

    setCompaniesLoading(true);
    setCompaniesError("");

    try {
      const data = await api.getAdminCompanies();
      setCompanies(data);

      const nextSelectedId =
        preferredCompanyId || selectedCompanyId || String(data[0]?.id || "");

      if (nextSelectedId) {
        setSelectedCompanyId(String(nextSelectedId));
      }

      setUserForm((current) => ({
        ...current,
        companyId: current.companyId || String(nextSelectedId || ""),
      }));

      return data;
    } catch (err) {
      if (String(err.message || "").includes("prihlaseni")) {
        api.clearAdminToken();
        window.location.href = "/admin";
        return [];
      }

      setCompaniesError(err.message);
      return [];
    } finally {
      setCompaniesLoading(false);
    }
  }

  async function refreshData() {
    if (isSuperAdmin) {
      await loadCompanies(selectedCompanyId);
      return;
    }

    await Promise.all([
      loadReservations(),
      loadAdminCatalog(selectedCategoryId),
      loadBookingSettings(),
      loadAdminSettingsPanel(),
      loadPendingReservationsCount(),
    ]);
  }

  useEffect(() => {
    if (!api.getAdminToken()) {
      window.location.href = "/admin";
      return;
    }

    api
      .getAdminProfile()
      .then(async (data) => {
        const user = data.user || null;
        setAdminUser(user);
        const role = String(user?.role || "").trim().toLowerCase();

        if (role === "superadmin") {
          setTab("superadmin");
          await loadCompanies("", true);
          return;
        }

        setTab("overview");
        await Promise.all([
          loadReservations(),
          loadAdminCatalog(),
          loadBookingSettings(),
          loadAdminSettingsPanel(),
          loadPendingReservationsCount(),
        ]);
      })
      .catch(() => {
        api.clearAdminToken();
        window.location.href = "/admin";
      })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (isSuperAdmin && companies.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(String(companies[0].id));
    }
    if (isSuperAdmin && companies.length > 0 && !userForm.companyId) {
      setUserForm((current) => ({ ...current, companyId: String(companies[0].id) }));
    }
  }, [companies, isSuperAdmin, selectedCompanyId, userForm.companyId]);

  useEffect(() => {
    if (!isSuperAdmin && selectedCategoryId) {
      setResourceForm((current) => ({ ...current, categoryId: String(selectedCategoryId) }));
      setPricingForm((current) => ({
        ...current,
        categoryId: String(selectedCategoryId),
        resourceIds: [],
      }));
    }
  }, [isSuperAdmin, selectedCategoryId]);

  useEffect(() => {
    if (isSuperAdmin || !selectedCategoryId) {
      return;
    }

    const availableResourceIds = adminResources.map((resource) => String(resource.id));
    setPricingForm((current) => {
      const normalized = (current.resourceIds || []).filter((id) =>
        availableResourceIds.includes(String(id))
      );

      if (availableResourceIds.length === 0) {
        return normalized.length === current.resourceIds.length
          ? current
          : { ...current, resourceIds: [] };
      }

      if (normalized.length > 0) {
        return normalized.length === current.resourceIds.length
          ? current
          : { ...current, resourceIds: normalized };
      }

      return {
        ...current,
        resourceIds: availableResourceIds,
      };
    });
  }, [isSuperAdmin, selectedCategoryId, adminResources]);

  function togglePricingResource(resourceId) {
    const id = String(resourceId);
    setPricingForm((current) => {
      const currentIds = current.resourceIds || [];
      const isSelected = currentIds.includes(id);
      return {
        ...current,
        resourceIds: isSelected
          ? currentIds.filter((value) => value !== id)
          : [...currentIds, id],
      };
    });
  }

  useEffect(() => {
    if (!isSuperAdmin && selectedCategoryId) {
      loadAdminCategoryDetails(selectedCategoryId);
    }
  }, [isSuperAdmin, selectedCategoryId]);

  useEffect(() => {
    if (!isSuperAdmin && tab === "emails") {
      loadEmailTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin) {
      applyThemeToDocument(DEFAULT_CLUB_THEME);
      return;
    }

    applyThemeToDocument(ownCompanySettings || DEFAULT_CLUB_THEME);
  }, [isSuperAdmin, ownCompanySettings]);

  function handleLogout() {
    api.clearAdminToken();
    window.location.href = "/admin";
  }

  function buildCompanyEmbedTag(companyId) {
    const embedUrl = `${window.location.origin}/?companyId=${encodeURIComponent(String(companyId))}`;
    return `<iframe src="${embedUrl}" width="100%" height="800" frameborder="0" title="Rezervacni system"></iframe>`;
  }

  async function handleCopyCompanyEmbedTag(companyId) {
    const tag = buildCompanyEmbedTag(companyId);

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(tag);
      } else {
        // Fallback for older browsers where Clipboard API is unavailable.
        const area = document.createElement("textarea");
        area.value = tag;
        area.setAttribute("readonly", "readonly");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }

      setCopiedEmbedCompanyId(String(companyId));
      window.setTimeout(() => setCopiedEmbedCompanyId((current) => (current === String(companyId) ? null : current)), 1800);
    } catch {
      window.prompt("Kopirovani se nepodarilo. Zkopirujte tag rucne:", tag);
    }
  }

  async function handleCreateCompany(event) {
    event.preventDefault();
    setCompaniesError("");
    setNotice("");

    try {
      const created = await api.createCompany(companyForm);
      setCompanyForm({ name: "", timezone: "Europe/Prague" });
      setTab("superadmin");
      setNotice("Company vytvořena.");
      await loadCompanies(String(created.id));
    } catch (err) {
      setCompaniesError(err.message);
    }
  }

  function startEditCompany(company) {
    setEditingCompany({
      id: company.id,
      name: company.name,
      timezone: company.timezone || "Europe/Prague",
    });
    setTab("superadmin");
  }

  async function handleSaveCompany(event) {
    event.preventDefault();
    if (!editingCompany) {
      return;
    }

    setCompaniesError("");
    setNotice("");

    try {
      const updated = await api.updateCompany(editingCompany.id, {
        name: editingCompany.name,
        timezone: editingCompany.timezone,
      });
      setEditingCompany(null);
      setNotice("Company upravena.");
      await loadCompanies(String(updated.id));
    } catch (err) {
      setCompaniesError(err.message);
    }
  }

  function startEditUser(user) {
    setEditingUser({
      id: user.id,
      companyId: String(user.companyId),
      role: user.role,
      email: user.email,
      password: "",
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || "",
      notifyEmails: user.notifyEmails !== false,
    });
    setTab("superadmin");
    setSelectedCompanyId(String(user.companyId));
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setCompaniesError("");
    setNotice("");

    try {
      const created = await api.createUser({
        companyId: Number(selectedCompanyId),
        role: "admin",
        email: userForm.email,
        password: userForm.password,
        firstName: userForm.firstName,
        lastName: userForm.lastName,
        phone: userForm.phone,
        notifyEmails: userForm.notifyEmails,
      });

      setUserForm((current) => ({
        ...current,
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        phone: "",
        notifyEmails: true,
      }));
      setSelectedCompanyId(String(created.companyId));
      setTab("superadmin");
      setNotice("Uživatel vytvořen.");
      await loadCompanies(String(created.companyId));
    } catch (err) {
      setCompaniesError(err.message);
    }
  }

  async function handleSaveUser(event) {
    event.preventDefault();
    if (!editingUser) {
      return;
    }

    setCompaniesError("");
    setNotice("");

    try {
      const updated = await api.updateUser(editingUser.id, {
        companyId: Number(editingUser.companyId),
        role: editingUser.role,
        email: editingUser.email,
        password: editingUser.password,
        firstName: editingUser.firstName,
        lastName: editingUser.lastName,
        phone: editingUser.phone,
        notifyEmails: editingUser.notifyEmails,
      });

      setEditingUser(null);
      setSelectedCompanyId(String(updated.companyId));
      setNotice("Uživatel upraven.");
      await loadCompanies(String(updated.companyId));
    } catch (err) {
      setCompaniesError(err.message);
    }
  }

  async function handleCreateCategory(event) {
    event.preventDefault();
    setCatalogError("");
    setNotice("");

    try {
      const created = await api.createAdminCategory({
        name: categoryForm.name,
        description: categoryForm.description,
        icon: categoryForm.icon,
        defaultSlotDuration: Number(categoryForm.defaultSlotDuration),
      });
      setCategoryForm({ name: "", description: "", icon: "trophy", defaultSlotDuration: "30" });
      setNotice("Kategorie vytvořena.");
      await loadAdminCatalog(String(created.id));
    } catch (err) {
      setCatalogError(err.message);
    }
  }

  function startEditCategory(category) {
    setEditingCategory({
      id: category.id,
      name: category.name,
      description: category.description || "",
      icon: category.icon || "trophy",
      defaultSlotDuration: String(category.defaultSlotDuration),
    });
    setSelectedCategoryId(String(category.id));
    setSourcesSection("categories");
    setTab("sources");
  }

  async function handleSaveCategory(event) {
    event.preventDefault();
    if (!editingCategory) {
      return;
    }

    setCatalogError("");
    setNotice("");

    try {
      await api.updateAdminCategory(editingCategory.id, {
        name: editingCategory.name,
        description: editingCategory.description,
        icon: editingCategory.icon,
        defaultSlotDuration: Number(editingCategory.defaultSlotDuration),
      });
      setEditingCategory(null);
      setNotice("Kategorie upravena.");
      await loadAdminCatalog(String(editingCategory.id));
    } catch (err) {
      setCatalogError(err.message);
    }
  }

  async function handleCreateResource(event) {
    event.preventDefault();
    setCatalogError("");
    setNotice("");

    try {
      await api.createAdminResource({
        categoryId: Number(resourceForm.categoryId || selectedCategoryId),
        name: resourceForm.name,
        isActive: resourceForm.isActive,
      });
      setResourceForm((current) => ({
        ...current,
        name: "",
        categoryId: current.categoryId || String(selectedCategoryId || ""),
        isActive: true,
      }));
      setNotice("Zdroj vytvořen.");
      await loadAdminCategoryDetails(resourceForm.categoryId || selectedCategoryId);
    } catch (err) {
      setCatalogError(err.message);
    }
  }

  async function handleDeleteCategory(category) {
    const confirmed = window.confirm(
      `Opravdu chcete odstranit kategorii „${category.name}“? Smažou se i navázané zdroje a ceníková okna.`
    );
    if (!confirmed) {
      return;
    }

    setCatalogError("");
    setNotice("");
    try {
      await api.deleteAdminCategory(category.id);
      if (String(selectedCategoryId) === String(category.id)) {
        setSelectedCategoryId("");
      }
      setEditingCategory((current) => (current?.id === category.id ? null : current));
      setNotice("Kategorie odstraněna.");
      await loadAdminCatalog();
    } catch (err) {
      setCatalogError(err.message);
    }
  }

  function startEditResource(resource) {
    setEditingResource({
      id: resource.id,
      categoryId: String(resource.categoryId),
      name: resource.name,
      isActive: Boolean(resource.isActive),
    });
    setSelectedCategoryId(String(resource.categoryId));
    setSourcesSection("resources");
    setTab("sources");
  }

  async function handleSaveResource(event) {
    event.preventDefault();
    if (!editingResource) {
      return;
    }

    setCatalogError("");
    setNotice("");

    try {
      await api.updateAdminResource(editingResource.id, {
        categoryId: Number(editingResource.categoryId),
        name: editingResource.name,
        isActive: editingResource.isActive,
      });
      const nextCategoryId = editingResource.categoryId;
      setEditingResource(null);
      setNotice("Zdroj upraven.");
      await loadAdminCatalog(String(nextCategoryId));
    } catch (err) {
      setCatalogError(err.message);
    }
  }

  async function handleDeleteResource(resource) {
    const confirmed = window.confirm(
      `Opravdu chcete odstranit zdroj „${resource.name}“?`
    );
    if (!confirmed) {
      return;
    }

    setCatalogError("");
    setNotice("");
    try {
      await api.deleteAdminResource(resource.id);
      setEditingResource((current) => (current?.id === resource.id ? null : current));
      setNotice("Zdroj odstraněn.");
      await loadAdminCategoryDetails(resource.categoryId);
    } catch (err) {
      setCatalogError(err.message);
    }
  }

  async function handleCreatePricingWindow(event) {
    event.preventDefault();
    setCatalogError("");
    setNotice("");

    try {
      await api.createAdminPricingWindow({
        categoryId: Number(pricingForm.categoryId || selectedCategoryId),
        resourceIds: pricingForm.resourceIds.map((value) => Number(value)),
        dayOfWeek: Number(pricingForm.dayOfWeek),
        timeFrom: pricingForm.timeFrom,
        timeTo: pricingForm.timeTo,
        pricePerSlot: Number(pricingForm.pricePerSlot),
      });
      setPricingForm((current) => ({
        ...current,
        categoryId: current.categoryId || String(selectedCategoryId || ""),
        resourceIds: [],
        dayOfWeek: current.dayOfWeek || "1",
        timeFrom: "08:00",
        timeTo: "10:00",
        pricePerSlot: "0",
      }));
      setNotice("Ceníkové okno vytvořeno.");
      await loadAdminCategoryDetails(pricingForm.categoryId || selectedCategoryId);
    } catch (err) {
      setCatalogError(err.message);
    }
  }

  function startEditPricingWindow(pricingWindow) {
    setEditingPricingWindow({
      id: pricingWindow.id,
      categoryId: String(pricingWindow.categoryId),
      resourceId: pricingWindow.resourceId ? String(pricingWindow.resourceId) : "",
      dayOfWeek: String(pricingWindow.dayOfWeek),
      timeFrom: formatTimeShort(pricingWindow.timeFrom),
      timeTo: formatTimeShort(pricingWindow.timeTo),
      pricePerSlot: String(pricingWindow.pricePerSlot),
    });
    setSelectedCategoryId(String(pricingWindow.categoryId));
    setPricingSection("windows");
    setTab("pricing");
  }

  async function handleSavePricingWindow(event) {
    event.preventDefault();
    if (!editingPricingWindow) {
      return;
    }

    setCatalogError("");
    setNotice("");

    try {
      await api.updateAdminPricingWindow(editingPricingWindow.id, {
        categoryId: Number(editingPricingWindow.categoryId),
        resourceId: editingPricingWindow.resourceId ? Number(editingPricingWindow.resourceId) : null,
        dayOfWeek: Number(editingPricingWindow.dayOfWeek),
        timeFrom: editingPricingWindow.timeFrom,
        timeTo: editingPricingWindow.timeTo,
        pricePerSlot: Number(editingPricingWindow.pricePerSlot),
      });
      const nextCategoryId = editingPricingWindow.categoryId;
      setEditingPricingWindow(null);
      setNotice("Ceníkové okno upraveno.");
      await loadAdminCatalog(String(nextCategoryId));
    } catch (err) {
      setCatalogError(err.message);
    }
  }

  async function handleDeletePricingWindow(pricingWindow) {
    const confirmed = window.confirm(
      `Opravdu chcete odstranit ceníkové okno ${weekdayOptions.find((day) => Number(day.value) === Number(pricingWindow.dayOfWeek))?.label || ""} ${formatTimeShort(pricingWindow.timeFrom)}-${formatTimeShort(pricingWindow.timeTo)}?`
    );
    if (!confirmed) {
      return;
    }

    setCatalogError("");
    setNotice("");
    try {
      await api.deleteAdminPricingWindow(pricingWindow.id);
      setEditingPricingWindow((current) => (current?.id === pricingWindow.id ? null : current));
      setNotice("Ceníkové okno odstraněno.");
      await loadAdminCatalog(String(pricingWindow.categoryId));
    } catch (err) {
      setCatalogError(err.message);
    }
  }

  async function handleSaveBookingSettings(event) {
    event.preventDefault();

    const minAdvanceMinutes = Number(bookingSettings.minAdvanceMinutes);
    if (!Number.isFinite(minAdvanceMinutes) || minAdvanceMinutes < 0) {
      setCatalogError("Minimalni predstih musi byt 0 nebo vice minut.");
      return;
    }

    setCatalogError("");
    setNotice("");
    setBookingSettingsLoading(true);

    try {
      const saved = await api.updateAdminBookingSettings({
        minAdvanceMinutes: Math.round(minAdvanceMinutes),
      });
      setBookingSettings({
        minAdvanceMinutes: Math.max(Number(saved?.minAdvanceMinutes) || 0, 0),
      });
      setNotice("Pravidla rezervace uložena.");
    } catch (err) {
      setCatalogError(err.message);
    } finally {
      setBookingSettingsLoading(false);
    }
  }

  async function handleSaveClubSettings(event) {
    event.preventDefault();
    if (!clubForm.id || !clubForm.name.trim()) {
      setCatalogError("Vyplnte nazev klubu.");
      return;
    }

    setCatalogError("");
    setNotice("");
    setSettingsLoading(true);
    try {
      await api.updateCompany(Number(clubForm.id), {
        name: clubForm.name.trim(),
        timezone: String(clubForm.timezone || "Europe/Prague").trim() || "Europe/Prague",
        brandColor: clubForm.brandColor,
        backgroundColor: clubForm.backgroundColor,
        textColor: clubForm.textColor,
      });
      setNotice("Nastavení klubu uloženo.");
      await loadAdminSettingsPanel();
    } catch (err) {
      setCatalogError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function handleCreateStaffAdmin(event) {
    event.preventDefault();
    setCatalogError("");
    setNotice("");
    setSettingsLoading(true);

    try {
      await api.createUser({
        role: "admin",
        email: staffForm.email,
        password: staffForm.password,
        firstName: staffForm.firstName,
        lastName: staffForm.lastName,
        phone: staffForm.phone,
      });

      setStaffForm({
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        phone: "",
      });
      setShowCreateStaffForm(false);
      setNotice("Admin zaměstnanec vytvořen.");
      await loadAdminSettingsPanel();
    } catch (err) {
      setCatalogError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  }

  function startEditStaff(user) {
    setShowCreateStaffForm(false);
    setEditingStaff({
      id: user.id,
      email: user.email,
      password: "",
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || "",
    });
  }

  async function handleSaveStaff(event) {
    event.preventDefault();
    if (!editingStaff?.id) {
      return;
    }

    setCatalogError("");
    setNotice("");
    setSettingsLoading(true);

    try {
      await api.updateUser(editingStaff.id, {
        role: "admin",
        email: editingStaff.email,
        password: editingStaff.password,
        firstName: editingStaff.firstName,
        lastName: editingStaff.lastName,
        phone: editingStaff.phone,
      });
      setEditingStaff(null);
      setNotice("Admin zaměstnanec upraven.");
      await loadAdminSettingsPanel();
    } catch (err) {
      setCatalogError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  }

  if (authLoading) {
    return (
      <main className="container adminPage">
        <section className="card">
          <p className="muted">Overuji prihlaseni...</p>
        </section>
      </main>
    );
  }

  async function handleCancel(reservationId) {
    const reasonInput = window.prompt("Důvod storna (volitelné):", "");
    if (reasonInput === null) {
      return;
    }

    const reason = String(reasonInput || "").trim();

    try {
      await api.cancelReservation(reservationId, reason);
      await Promise.all([loadReservations(), loadPendingReservationsCount()]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleApprove(reservationId) {
    try {
      await api.approveReservation(reservationId);
      await Promise.all([loadReservations(), loadPendingReservationsCount()]);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="adminDashboard">
      <aside className="adminSidebar">
        <div className="adminBrand">
          <span className="adminBrandMark">{adminBrandName}</span>
          <strong>Admin</strong>
        </div>

         <nav className="adminNav">
           {adminNavItems.map((item) => (
             <button
               key={item.id}
               type="button"
               className={`adminNavItem ${tab === item.id ? "adminNavItem--active" : ""}`}
               onClick={() => setTab(item.id)}
             >
               <item.Icon className="adminNavIcon" size={20} />
               <span>{item.label}</span>
                {Number(item.count) > 0 && <span className="adminNavCount">{item.count}</span>}
             </button>
           ))}
         </nav>

        <button className="adminSidebarLogout" type="button" onClick={handleLogout}>
          Odhlasit
        </button>
      </aside>

      <section className="adminWorkspace">
        <header className="adminTopbar">
          <div className="adminTopbarText">Administrační rozhraní rezervačního systému</div>
          <span className="badge" title="Aktualni role uzivatele">
            Role: {normalizedAdminRole || "neznamy"}
          </span>
          <button className="adminAvatar" type="button" onClick={handleLogout} title="Odhlasit">
            {getInitials(adminUser)}
          </button>
        </header>

        <div className="adminContent">
          {tab === "overview" && !isSuperAdmin && (
            <>
              <section className="adminHero">
                <div>
                  <h1 className="dashboardTitle">Přehled dne</h1>
                  <p className="dashboardSubtitle">Rychlý pohled na dnešní provoz klubu.</p>
                </div>

                <a className="primaryBtn" href="/">
                  + Nová rezervace
                </a>
              </section>

              {isSuperAdmin && (
                <section className="dashboardCard">
                  <div className="dashboardCardHeader">
                    <h2>Superadmin mod</h2>
                    <span className="badge badge--confirmed">Aktivni</span>
                  </div>
                  <p className="muted">
                     Sprava company a uzivatelu je dostupna v superadmin sekci.
                  </p>
                  <div className="actionsRight">
                     <button className="primaryBtn" type="button" onClick={() => setTab("superadmin")}>
                      Otevrit superadmin sekci
                    </button>
                  </div>
                </section>
              )}

               <section className="statGrid">
                 {overviewStats.map((stat, idx) => {
                   const IconComponent = stat.icon;
                   const isPastRevenue = stat.label.includes("Uskutečněná");
                   return (
                     <article
                       key={stat.label}
                       className={`statCard ${isPastRevenue ? "statCard--clickable" : ""}`}
                       onClick={() => { if (isPastRevenue) setShowRevenueChart("past"); }}
                     >
                       <div className="statCardTop">
                         <div className="statLabel">
                           {String(stat.label).split("\n").map((line) => (
                             <span key={line}>{line}</span>
                           ))}
                         </div>
                         <div className={`statIcon statIcon--${stat.tone}`}>
                           <IconComponent className="w-6 h-6" />
                         </div>
                       </div>
                       <div className="statValue">{stat.value}</div>
                     </article>
                   );
                 })}
               </section>

              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <h2>Dnešní rezervace</h2>
                  <button type="button" className="dashboardLink" onClick={() => setTab("reservations")}>
                    Zobrazit kalendář &gt;
                  </button>
                </div>

                <div className="dataTableWrap">
                  <table className="dataTable">
                    <thead>
                      <tr>
                        <th>Čas</th>
                        <th>Hráč</th>
                        <th>Zdroj</th>
                        <th>Cena</th>
                        <th>Stav</th>
                        <th>Akce</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overviewRows.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="emptyCell">
                            Dnes zatím nejsou žádné rezervace.
                          </td>
                        </tr>
                      ) : (
                        overviewRows.map((row) => (
                          <tr key={`${row.reservationId}_${row.resourceName}`}>
                            <td>{row.timeRange}</td>
                            <td>{row.playerName}</td>
                            <td>{row.resourceName}</td>
                            <td>{formatCurrencyCZK(row.price)}</td>
                            <td>
                              <span className={`badge badge--${row.status}`}>{row.status}</span>
                            </td>
                            <td>
                              {row.status === "cancelled" ? (
                                <span className="muted">-</span>
                              ) : (
                                <div className="tableActionsInline">
                                  {row.status === "pending" && (
                                    <button className="tableActionButton tableActionButton--approve" type="button" onClick={() => handleApprove(row.reservationId)}>
                                      Schválit
                                    </button>
                                  )}
                                  <button className="tableActionButton tableActionButton--danger" type="button" onClick={() => handleCancel(row.reservationId)}>
                                    Stornovat
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <h2>Zítřejší rezervace</h2>
                  <span className="muted">{formatLongDate(tomorrow)}</span>
                </div>

                <div className="dataTableWrap">
                  <table className="dataTable">
                    <thead>
                      <tr>
                        <th>Čas</th>
                        <th>Hráč</th>
                        <th>Zdroj</th>
                        <th>Cena</th>
                        <th>Stav</th>
                        <th>Akce</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tomorrowOverviewRows.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="emptyCell">
                            Zatím nejsou žádné zítřejší rezervace.
                          </td>
                        </tr>
                      ) : (
                        tomorrowOverviewRows.map((row) => (
                          <tr key={`tomorrow_${row.reservationId}_${row.resourceName}`}>
                            <td>{row.timeRange}</td>
                            <td>{row.playerName}</td>
                            <td>{row.resourceName}</td>
                            <td>{formatCurrencyCZK(row.price)}</td>
                            <td>
                              <span className={`badge badge--${row.status}`}>{row.status}</span>
                            </td>
                            <td>
                              {row.status === "cancelled" ? (
                                <span className="muted">-</span>
                              ) : (
                                <div className="tableActionsInline">
                                  {row.status === "pending" && (
                                    <button className="tableActionButton tableActionButton--approve" type="button" onClick={() => handleApprove(row.reservationId)}>
                                      Schválit
                                    </button>
                                  )}
                                  <button className="tableActionButton tableActionButton--danger" type="button" onClick={() => handleCancel(row.reservationId)}>
                                    Stornovat
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {tab === "reservations" && !isSuperAdmin && (
            <section className="dashboardCard">
              <div className="dashboardCardHeader">
                <h2>Rezervace</h2>
                <button className="primaryBtn" type="button" onClick={loadReservations} disabled={loading}>
                  {loading ? "Načítám..." : "Obnovit"}
                </button>
              </div>

              <div className="grid adminFilters adminFilters--compact">
                <label>
                  Stav
                  <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="">Vse</option>
                    <option value="pending">pending</option>
                    <option value="confirmed">confirmed</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </label>

                <label>
                  Datum slotu
                  <input className="field" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
                </label>

                <button className="ghostBtn" type="button" onClick={loadReservations} disabled={loading}>
                  {loading ? "Načítám..." : "Filtrovat"}
                </button>
              </div>

              <div className="adminList">
                {reservations.map((reservation) => {
                  const termLabel = formatReservationTerm(reservation.slots || []);
                  const isPending = reservation.status === "pending";

                  return (
                  <article key={reservation.id} className={`adminItem adminItem--tableLike ${isPending ? 'adminItem--pending' : ''}`}>
                    <div className="adminItemTop">
                      <strong>#{reservation.id}</strong>
                      <span className={`badge badge--${reservation.status}`}>{reservation.status}</span>
                      <span>{reservation.category_name}</span>
                      <span>{formatCurrencyCZK(reservation.total_price)}</span>
                    </div>

                    <p className="reservationTermHighlight">
                      Termin rezervace: <strong>{termLabel}</strong>
                    </p>

                    <p className="muted">
                      {reservation.first_name} {reservation.last_name} - {reservation.email}
                      {reservation.phone ? ` - ${reservation.phone}` : ""}
                    </p>

                    <div className="slotRows">
                      {reservation.slots.map((slot) => (
                        <span key={`${reservation.id}_${slot.date}_${slot.time_start}`} className="slotRow">
                          {slot.date} {slot.time_start.slice(0, 5)}-{slot.time_end.slice(0, 5)} | {slot.resource_name} | {formatCurrencyCZK(slot.price)}
                        </span>
                      ))}
                    </div>

                    {reservation.status !== "cancelled" && (
                      <div className="actionsRight">
                        {reservation.status === "pending" && (
                          <button className="ghostBtn ghostBtn--approve" type="button" onClick={() => handleApprove(reservation.id)}>
                            Schvalit
                          </button>
                        )}
                        <button className="ghostBtn" type="button" onClick={() => handleCancel(reservation.id)}>
                          Stornovat
                        </button>
                      </div>
                    )}
                  </article>
                  );
                })}
              </div>
            </section>
          )}

          {tab === "superadmin" && isSuperAdmin && (
            <>
              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <div>
                    <h2>Přehled společností</h2>
                    <span className="muted">{companies.length} {companies.length === 1 ? "společnost" : companies.length < 5 ? "společnosti" : "společností"}</span>
                  </div>
                  <button className="primaryBtn" type="button"
                    onClick={() => setShowCreateCompanyForm(c => !c)}>
                    {showCreateCompanyForm ? "Zrušit" : "+ Nová company"}
                  </button>
                </div>

                {companiesError && <p className="status error">{companiesError}</p>}

                {showCreateCompanyForm && (
                  <form className="formGrid dashboardSubForm" onSubmit={handleCreateCompany}>
                    <label>Název company
                      <input className="field" value={companyForm.name}
                        onChange={e => setCompanyForm(c => ({ ...c, name: e.target.value }))} required />
                    </label>
                    <label>Timezone
                      <input className="field" value={companyForm.timezone}
                        onChange={e => setCompanyForm(c => ({ ...c, timezone: e.target.value }))} />
                    </label>
                    <div style={{ alignSelf: "end" }}>
                      <button className="primaryBtn" type="submit" disabled={companiesLoading}>
                        {companiesLoading ? "Ukládám..." : "Vytvořit"}
                      </button>
                    </div>
                  </form>
                )}

                {editingCompany && (
                  <form className="formGrid dashboardSubForm" onSubmit={handleSaveCompany}>
                    <label>Upravit #{editingCompany.id}
                      <input className="field" value={editingCompany.name}
                        onChange={e => setEditingCompany(c => ({ ...c, name: e.target.value }))} required />
                    </label>
                    <label>Timezone
                      <input className="field" value={editingCompany.timezone}
                        onChange={e => setEditingCompany(c => ({ ...c, timezone: e.target.value }))} />
                    </label>
                    <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
                      <button className="primaryBtn" type="submit">Uložit</button>
                      <button className="ghostBtn" type="button" onClick={() => setEditingCompany(null)}>Zrušit</button>
                    </div>
                  </form>
                )}

                {companies.length === 0 && !showCreateCompanyForm && (
                  <p className="saEmpty">Zatím žádné společnosti. Klikněte na „+ Nová company".</p>
                )}

                <div className="saGrid" style={{ marginTop: companies.length > 0 ? 8 : 0 }}>
                  {companies.map((company) => {
                    const admins = (company.users || []).filter(u => u.role === 'admin');
                    return (
                      <div key={company.id} className="saCard">
                        <div className="saCardHeader">
                          <h3 className="saCardTitle">
                            {company.name}
                            <span>#{company.id} · {company.timezone} · {company.userCount} uživatelů</span>
                          </h3>
                        </div>

                        <hr className="saDivider" />

                        <div className="saAdmins">
                          {admins.length === 0 ? (
                            <span className="saEmpty">Žádní admini</span>
                          ) : (
                            admins.map(a => (
                              <div key={a.id} className="saAdminRow">
                                <span className="saAdminName">{a.firstName} {a.lastName}</span>
                                <span className="saAdminEmail">{a.email}</span>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="saEmbedBox">
                          <code>{window.location.origin}/?companyId={company.id}</code>
                          <textarea readOnly value={buildCompanyEmbedTag(company.id)} rows={2} />
                        </div>

                        <div className="saActions">
                          <button className="saBtn" type="button" onClick={() => startEditCompany(company)}>
                            Upravit
                          </button>
                          <button className="saBtn saBtn--primary" type="button"
                            onClick={() => {
                              setSelectedCompanyId(String(company.id));
                              document.getElementById("usersSection")?.scrollIntoView({ behavior: "smooth" });
                            }}>
                            Spravovat adminy
                          </button>
                          <button className="saBtn saBtn--ghost" type="button"
                            onClick={() => handleCopyCompanyEmbedTag(company.id)}>
                            {copiedEmbedCompanyId === String(company.id) ? "✓ Zkopírováno" : "Kopírovat iframe"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="saDetailPanel" id="usersSection">
                <div className="saDetailHeader">
                  <div>
                    <h2>{selectedCompany ? selectedCompany.name : "Správa adminů"}</h2>
                    {!selectedCompany && <span className="muted" style={{ display: "block", marginTop: 4 }}>Vyberte company výše pro správu jejích administrátorů</span>}
                  </div>
                  {selectedCompany && (
                    <select className="field" value={selectedCompanyId}
                      onChange={e => setSelectedCompanyId(e.target.value)}
                      style={{ minWidth: 240 }}>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>#{c.id} {c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {!selectedCompany ? (
                  <p className="saEmpty">↑ Vyberte company z přehledu výše.</p>
                ) : (
                  <div className="saDetailBody">
                    <div className="saSection">
                      <h3>Embed / Iframe kód</h3>
                      <div className="saEmbedBox">
                        <code>{window.location.origin}/?companyId={selectedCompany.id}</code>
                        <textarea readOnly value={buildCompanyEmbedTag(selectedCompany.id)} rows={2} />
                      </div>
                      <div className="saActions" style={{ marginTop: 10 }}>
                        <a className="saBtn saBtn--ghost" href={`${window.location.origin}/?companyId=${selectedCompany.id}`}
                          target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                          Otevřít náhled →
                        </a>
                        <button className="saBtn saBtn--primary" type="button"
                          onClick={() => handleCopyCompanyEmbedTag(selectedCompany.id)}>
                          {copiedEmbedCompanyId === String(selectedCompany.id) ? "✓ Zkopírováno!" : "Kopírovat iframe"}
                        </button>
                      </div>
                    </div>

                    <div className="saSection">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <h3 style={{ margin: 0 }}>Admini</h3>
                        <button className="saBtn saBtn--primary" type="button"
                          onClick={() => setShowCreateUserForm(c => !c)}>
                          {showCreateUserForm ? "Zrušit" : "+ Nový admin"}
                        </button>
                      </div>

                      {showCreateUserForm && (
                        <form className="formGrid dashboardSubForm" onSubmit={handleCreateUser} style={{ marginBottom: 16 }}>
                          <label>E-mail
                            <input className="field" type="email" value={userForm.email}
                              onChange={e => setUserForm(c => ({ ...c, email: e.target.value }))} required />
                          </label>
                          <label>Heslo
                            <input className="field" type="password" value={userForm.password}
                              onChange={e => setUserForm(c => ({ ...c, password: e.target.value }))} required />
                          </label>
                          <label>Jméno
                            <input className="field" value={userForm.firstName}
                              onChange={e => setUserForm(c => ({ ...c, firstName: e.target.value }))} required />
                          </label>
                          <label>Příjmení
                            <input className="field" value={userForm.lastName}
                              onChange={e => setUserForm(c => ({ ...c, lastName: e.target.value }))} required />
                          </label>
                          <label style={{ flexDirection: "row", alignItems: "center", gap: "8px", gridColumn: "1 / -1" }}>
                            <input type="checkbox" checked={userForm.notifyEmails}
                              onChange={e => setUserForm(c => ({ ...c, notifyEmails: e.target.checked }))} />
                            Odesílat emailové notifikace o rezervacích
                          </label>
                          <div style={{ alignSelf: "end" }}>
                            <button className="primaryBtn" type="submit">Vytvořit admina</button>
                          </div>
                        </form>
                      )}

                      {editingUser && (
                        <form className="formGrid dashboardSubForm" onSubmit={handleSaveUser} style={{ marginBottom: 16 }}>
                          <label>E-mail
                            <input className="field" type="email" value={editingUser.email}
                              onChange={e => setEditingUser(c => ({ ...c, email: e.target.value }))} required />
                          </label>
                          <label>Heslo <span className="muted">(nechte prázdné)</span>
                            <input className="field" type="password" value={editingUser.password}
                              onChange={e => setEditingUser(c => ({ ...c, password: e.target.value }))} placeholder="Beze změny" />
                          </label>
                          <label>Jméno
                            <input className="field" value={editingUser.firstName}
                              onChange={e => setEditingUser(c => ({ ...c, firstName: e.target.value }))} required />
                          </label>
                          <label>Příjmení
                            <input className="field" value={editingUser.lastName}
                              onChange={e => setEditingUser(c => ({ ...c, lastName: e.target.value }))} required />
                          </label>
                          <label style={{ flexDirection: "row", alignItems: "center", gap: "8px", gridColumn: "1 / -1" }}>
                            <input type="checkbox" checked={editingUser.notifyEmails}
                              onChange={e => setEditingUser(c => ({ ...c, notifyEmails: e.target.checked }))} />
                            Odesílat emailové notifikace o rezervacích
                          </label>
                          <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
                            <button className="primaryBtn" type="submit">Uložit</button>
                            <button className="ghostBtn" type="button" onClick={() => setEditingUser(null)}>Zrušit</button>
                          </div>
                        </form>
                      )}

                      <div className="saAdmins">
                        {selectedUsers.filter(u => u.role === 'admin').length === 0 && !showCreateUserForm && (
                          <span className="saEmpty">Žádní admini. Vytvořte prvního tlačítkem výše.</span>
                        )}
                        {selectedUsers.filter(u => u.role === 'admin').map(user => (
                          <div key={user.id} className="saAdminRow" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                            <span className="saAdminName">{user.firstName} {user.lastName}</span>
                            <span className="saAdminEmail">{user.email}</span>
                            <span style={{ fontSize: "11px", color: user.notifyEmails !== false ? "var(--brand)" : "var(--text-soft)", marginLeft: "8px" }}>
                              {user.notifyEmails !== false ? "📧 notifikace" : "🔕 bez notifikací"}
                            </span>
                            <button className="saBtn saBtn--ghost" type="button"
                              style={{ marginLeft: "auto" }}
                              onClick={() => startEditUser(user)}>Upravit</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {tab === "sources" && !isSuperAdmin && (
            <>
              <section className="dashboardCard">
                <div className="sectionTabs" role="tablist" aria-label="Sekce zdroju">
                  <button
                    type="button"
                    className={`sectionTab ${sourcesSection === "categories" ? "sectionTab--active" : ""}`}
                    onClick={() => setSourcesSection("categories")}
                  >
                    Kategorie
                  </button>
                  <button
                    type="button"
                    className={`sectionTab ${sourcesSection === "resources" ? "sectionTab--active" : ""}`}
                    onClick={() => setSourcesSection("resources")}
                  >
                    Zdroje a stoly
                  </button>
                </div>
              </section>

              {sourcesSection === "categories" && (
              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <h2>Kategorie</h2>
                  <div className="actionsRight">
                    <button className="ghostBtn" type="button" onClick={() => loadAdminCatalog(selectedCategoryId)} disabled={catalogLoading}>
                      {catalogLoading ? "Načítám..." : "Obnovit"}
                    </button>
                  </div>
                </div>

                <div className="panelActions panelActions--right adminCreateToggle">
                  <button
                    className="adminToggleBtn"
                    type="button"
                    onClick={() => setShowCreateCategoryForm((current) => !current)}
                  >
                    {showCreateCategoryForm ? "Skryt formular" : "Pridat kategorii"}
                  </button>
                </div>

                {showCreateCategoryForm && (
                <form className="formGrid" onSubmit={handleCreateCategory}>
                  <label>
                    Nazev kategorie
                    <input
                      className="field"
                      value={categoryForm.name}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    Ikonka
                    <select
                      className="field"
                      value={categoryForm.icon}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, icon: event.target.value }))}
                    >
                      {categoryIconOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Delka slotu (min)
                    <input
                      className="field"
                      type="number"
                      min="1"
                      step="1"
                      value={categoryForm.defaultSlotDuration}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, defaultSlotDuration: event.target.value }))}
                      required
                    />
                  </label>

                  <label className="full">
                    Popis
                    <input
                      className="field"
                      value={categoryForm.description}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))}
                    />
                  </label>

                  <button className="primaryBtn" type="submit" disabled={catalogLoading}>Vytvorit kategorii</button>
                </form>
                )}

                {editingCategory && (
                  <form className="formGrid dashboardSubForm" onSubmit={handleSaveCategory}>
                    <label>
                      Upravit kategorii
                      <input
                        className="field"
                        value={editingCategory.name}
                        onChange={(event) => setEditingCategory((current) => ({ ...current, name: event.target.value }))}
                        required
                      />
                    </label>

                    <label>
                      Ikonka
                      <select
                        className="field"
                        value={editingCategory.icon}
                        onChange={(event) => setEditingCategory((current) => ({ ...current, icon: event.target.value }))}
                      >
                        {categoryIconOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Delka slotu (min)
                      <input
                        className="field"
                        type="number"
                        min="1"
                        step="1"
                        value={editingCategory.defaultSlotDuration}
                        onChange={(event) => setEditingCategory((current) => ({ ...current, defaultSlotDuration: event.target.value }))}
                        required
                      />
                    </label>

                    <label className="full">
                      Popis
                      <input
                        className="field"
                        value={editingCategory.description}
                        onChange={(event) => setEditingCategory((current) => ({ ...current, description: event.target.value }))}
                      />
                    </label>

                    <div className="actionsRight">
                      <button className="primaryBtn" type="submit">Uložit kategorii</button>
                      <button className="ghostBtn" type="button" onClick={() => setEditingCategory(null)}>Zrušit</button>
                    </div>
                  </form>
                )}

                <div className="adminList">
                  {adminCategories.length === 0 ? (
                    <p className="muted">Zatím nejsou založené žádné kategorie.</p>
                  ) : (
                    adminCategories.map((category) => (
                      <article key={category.id} className="adminItem">
                        <div className="adminItemTop">
                          <strong>#{category.id} {category.name}</strong>
                          <span>{categoryIconOptions.find((option) => option.value === String(category.icon || ""))?.label || "Bez ikonky"}</span>
                          <span>{category.defaultSlotDuration} min</span>
                          <span>{category.description || "Bez popisu"}</span>
                        </div>
                        <div className="actionsRight">
                          <button
                            className="ghostBtn"
                            type="button"
                            onClick={() => {
                              setSelectedCategoryId(String(category.id));
                              setSourcesSection("resources");
                            }}
                          >
                            {String(selectedCategoryId) === String(category.id) ? "Vybrano" : "Vybrat"}
                          </button>
                          <button className="primaryBtn" type="button" onClick={() => startEditCategory(category)}>
                            Upravit kategorii
                          </button>
                          <button className="ghostBtn" type="button" onClick={() => handleDeleteCategory(category)}>
                            Odstranit kategorii
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
              )}

              {sourcesSection === "resources" && (
              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <h2>Zdroje a stoly</h2>
                  <div className="actionsRight">
                    <select
                      className="field"
                      value={selectedCategoryId}
                      onChange={(event) => setSelectedCategoryId(event.target.value)}
                      style={{ minWidth: 220 }}
                    >
                      <option value="">Vyber kategorii</option>
                      {adminCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          #{category.id} {category.name}
                        </option>
                      ))}
                    </select>
                    <span className="muted">{selectedAdminCategory ? `${selectedAdminCategory.name} · ${selectedAdminCategory.defaultSlotDuration} min` : "Vyberte kategorii"}</span>
                  </div>
                </div>

                {selectedAdminCategory ? (
                  <>
                    <p className="muted" style={{ marginBottom: 16 }}>
                      Zdroje jsou navázané na vybranou kategorii. Nejprve vyberte kategorii a potom přidávejte jednotlivé stoly nebo služby.
                    </p>

                    <div className="actionsRight" style={{ marginBottom: 12 }}>
                      <button className="ghostBtn" type="button" onClick={() => setSourcesSection("categories")}>
                        Spravovat kategorie
                      </button>
                    </div>

                    <div className="panelActions panelActions--right adminCreateToggle">
                      <button
                        className="adminToggleBtn"
                        type="button"
                        onClick={() => setShowCreateResourceForm((current) => !current)}
                      >
                        {showCreateResourceForm ? "Skryt formular" : "Pridat zdroj"}
                      </button>
                    </div>

                    {(showCreateResourceForm || editingResource) && (
                    <section className="resourceCreateSection">
                      <p className="muted resourceListHeading">Pridat novy zdroj</p>

                      {showCreateResourceForm && (
                      <form className="formGrid" onSubmit={handleCreateResource}>
                        <label>
                          Kategorie
                          <select
                            className="field"
                            value={resourceForm.categoryId || selectedCategoryId}
                            onChange={(event) => setResourceForm((current) => ({ ...current, categoryId: event.target.value }))}
                            required
                          >
                            {adminCategories.map((category) => (
                              <option key={category.id} value={category.id}>
                                #{category.id} {category.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Nazev zdroje
                          <input
                            className="field"
                            value={resourceForm.name}
                            onChange={(event) => setResourceForm((current) => ({ ...current, name: event.target.value }))}
                            required
                          />
                        </label>

                        <label>
                          Stav
                          <select
                            className="field"
                            value={resourceForm.isActive ? "1" : "0"}
                            onChange={(event) => setResourceForm((current) => ({ ...current, isActive: event.target.value === "1" }))}
                          >
                            <option value="1">Aktivni</option>
                            <option value="0">Neaktivni</option>
                          </select>
                        </label>

                        <button className="primaryBtn" type="submit" disabled={catalogLoading}>Vytvorit zdroj</button>
                      </form>
                      )}

                      {editingResource && (
                        <form className="formGrid dashboardSubForm" onSubmit={handleSaveResource}>
                          <label>
                            Kategorie
                            <select
                              className="field"
                              value={editingResource.categoryId}
                              onChange={(event) => setEditingResource((current) => ({ ...current, categoryId: event.target.value }))}
                              required
                            >
                              {adminCategories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  #{category.id} {category.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Nazev zdroje
                            <input
                              className="field"
                              value={editingResource.name}
                              onChange={(event) => setEditingResource((current) => ({ ...current, name: event.target.value }))}
                              required
                            />
                          </label>

                          <label>
                            Stav
                            <select
                              className="field"
                              value={editingResource.isActive ? "1" : "0"}
                              onChange={(event) => setEditingResource((current) => ({ ...current, isActive: event.target.value === "1" }))}
                            >
                              <option value="1">Aktivni</option>
                              <option value="0">Neaktivni</option>
                            </select>
                          </label>

                          <div className="actionsRight">
                            <button className="primaryBtn" type="submit">Uložit zdroj</button>
                            <button className="ghostBtn" type="button" onClick={() => setEditingResource(null)}>Zrušit</button>
                          </div>
                        </form>
                      )}
                    </section>
                    )}

                    <div className="resourceListSection">
                      <p className="muted resourceListHeading">Již vytvořené zdroje</p>
                      <div className="adminList">
                        {adminResources.length === 0 ? (
                          <p className="muted">V této kategorii zatím nejsou žádné zdroje.</p>
                        ) : (
                          adminResources.map((resource) => (
                            <article key={resource.id} className="adminItem adminItem--resource">
                              <div className="adminItemRow">
                                <div className="adminItemTop">
                                  <strong>#{resource.id} {resource.name}</strong>
                                  <span className={`badge badge--${resource.isActive ? "confirmed" : "cancelled"}`}>
                                    {resource.isActive ? "aktivni" : "neaktivni"}
                                  </span>
                                </div>
                                <div className="actionsRight adminItemActionsInline">
                                  <button className="ghostBtn" type="button" onClick={() => startEditResource(resource)}>
                                    Upravit zdroj
                                  </button>
                                  <button className="ghostBtn" type="button" onClick={() => handleDeleteResource(resource)}>
                                    Odstranit zdroj
                                  </button>
                                </div>
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="muted">Nejprve vyberte nebo vytvořte kategorii.</p>
                )}
              </section>
              )}
            </>
          )}

          {tab === "pricing" && !isSuperAdmin && (
            <>
              <section className="dashboardCard">
                <div className="sectionTabs" role="tablist" aria-label="Sekce ceníku">
                  <button
                    type="button"
                    className={`sectionTab ${pricingSection === "windows" ? "sectionTab--active" : ""}`}
                    onClick={() => setPricingSection("windows")}
                  >
                    Sprava oken
                  </button>
                  <button
                    type="button"
                    className={`sectionTab ${pricingSection === "overview" ? "sectionTab--active" : ""}`}
                    onClick={() => setPricingSection("overview")}
                  >
                    Prehled oken
                  </button>
                </div>
              </section>

              {pricingSection === "windows" && (
            <section className="dashboardCard">
              <div className="dashboardCardHeader">
                <h2>Ceníky a okna</h2>
                <div className="actionsRight">
                  <select
                    className="field"
                    value={selectedCategoryId}
                    onChange={(event) => setSelectedCategoryId(event.target.value)}
                    style={{ minWidth: 220 }}
                  >
                    <option value="">Vyber kategorii</option>
                    {adminCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        #{category.id} {category.name}
                      </option>
                    ))}
                  </select>
                  <button className="ghostBtn" type="button" onClick={() => loadAdminCategoryDetails(selectedCategoryId)} disabled={catalogLoading || !selectedCategoryId}>
                    {catalogLoading ? "Načítám..." : "Obnovit"}
                  </button>
                </div>
              </div>

              {selectedAdminCategory ? (
                <>
                  {!editingPricingWindow && (
                  <div className="panelActions panelActions--right adminCreateToggle">
                    <button
                      className="adminToggleBtn"
                      type="button"
                      onClick={() => setShowCreatePricingWindowForm((current) => !current)}
                    >
                      {showCreatePricingWindowForm ? "Skryt formular" : "Pridat okno"}
                    </button>
                  </div>
                  )}

                  {!editingPricingWindow && showCreatePricingWindowForm && (
                  <form
                    className="pricingWindowForm"
                    onSubmit={handleCreatePricingWindow}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
                      gap: 16,
                      alignItems: "start",
                    }}
                  >
                    <div className="pricingWindowFormMain">
                      <label>
                        Kategorie
                        <select
                          className="field"
                          value={pricingForm.categoryId || selectedCategoryId}
                          onChange={(event) => setPricingForm((current) => ({ ...current, categoryId: event.target.value }))}
                          required
                        >
                          {adminCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              #{category.id} {category.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Den v tydnu
                        <select
                          className="field"
                          value={pricingForm.dayOfWeek}
                          onChange={(event) => setPricingForm((current) => ({ ...current, dayOfWeek: event.target.value }))}
                          required
                        >
                          {weekdayOptions.map((day) => (
                            <option key={day.value} value={day.value}>{day.label}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Cas od
                        <input
                          className="field"
                          type="time"
                          value={pricingForm.timeFrom}
                          onChange={(event) => setPricingForm((current) => ({ ...current, timeFrom: event.target.value }))}
                          required
                        />
                      </label>

                      <label>
                        Cas do
                        <input
                          className="field"
                          type="time"
                          value={pricingForm.timeTo}
                          onChange={(event) => setPricingForm((current) => ({ ...current, timeTo: event.target.value }))}
                          required
                        />
                      </label>

                      <label>
                        Cena za slot
                        <input
                          className="field"
                          type="number"
                          min="0"
                          step="1"
                          value={pricingForm.pricePerSlot}
                          onChange={(event) => setPricingForm((current) => ({ ...current, pricePerSlot: event.target.value }))}
                          required
                        />
                      </label>

                      <button className="primaryBtn" type="submit" disabled={catalogLoading}>Vytvorit okno</button>
                    </div>

                    <div className="pricingWindowFormResources">
                      <span className="pricingWindowResourcesTitle">Zdroje</span>
                      <div className="resourceCheckboxList" role="group" aria-label="Výběr zdrojů pro ceníkové okno">
                        {adminResources.length === 0 ? (
                          <span className="muted">V tehle kategorii nejsou zadne zdroje.</span>
                        ) : (
                          adminResources.map((resource) => {
                            const isSelected = pricingForm.resourceIds.includes(String(resource.id));
                            const inputId = `pricing_resource_${resource.id}`;
                            return (
                              <label key={resource.id} htmlFor={inputId} className="resourceCheckboxItem">
                                <input
                                  id={inputId}
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => togglePricingResource(resource.id)}
                                />
                                <span>#{resource.id} {resource.name}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </form>
                  )}

                  {editingPricingWindow && (
                    <form className="formGrid dashboardSubForm" onSubmit={handleSavePricingWindow}>
                      <label>
                        Kategorie
                        <select
                          className="field"
                          value={editingPricingWindow.categoryId}
                          onChange={(event) => setEditingPricingWindow((current) => ({ ...current, categoryId: event.target.value }))}
                          required
                        >
                          {adminCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              #{category.id} {category.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Zdroj
                        <select
                          className="field"
                          value={editingPricingWindow.resourceId}
                          onChange={(event) => setEditingPricingWindow((current) => ({ ...current, resourceId: event.target.value }))}
                        >
                          <option value="">Všechny zdroje v kategorii</option>
                          {adminResources.map((resource) => (
                            <option key={resource.id} value={String(resource.id)}>
                              #{resource.id} {resource.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Den v tydnu
                        <select
                          className="field"
                          value={editingPricingWindow.dayOfWeek}
                          onChange={(event) => setEditingPricingWindow((current) => ({ ...current, dayOfWeek: event.target.value }))}
                          required
                        >
                          {weekdayOptions.map((day) => (
                            <option key={day.value} value={day.value}>{day.label}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Cas od
                        <input
                          className="field"
                          type="time"
                          value={editingPricingWindow.timeFrom}
                          onChange={(event) => setEditingPricingWindow((current) => ({ ...current, timeFrom: event.target.value }))}
                          required
                        />
                      </label>

                      <label>
                        Cas do
                        <input
                          className="field"
                          type="time"
                          value={editingPricingWindow.timeTo}
                          onChange={(event) => setEditingPricingWindow((current) => ({ ...current, timeTo: event.target.value }))}
                          required
                        />
                      </label>

                      <label>
                        Cena za slot
                        <input
                          className="field"
                          type="number"
                          min="0"
                          step="1"
                          value={editingPricingWindow.pricePerSlot}
                          onChange={(event) => setEditingPricingWindow((current) => ({ ...current, pricePerSlot: event.target.value }))}
                          required
                        />
                      </label>

                      <div className="actionsRight">
                        <button className="primaryBtn" type="submit">Uložit okno</button>
                        <button className="ghostBtn" type="button" onClick={() => setEditingPricingWindow(null)}>Zrušit</button>
                      </div>
                    </form>
                  )}

                  <div className="adminList">
                    {pricingWindows.length === 0 ? (
                      <p className="muted">V této kategorii zatím nejsou žádná ceníková okna.</p>
                    ) : (
                      pricingWindows.map((pricingWindow) => (
                        <article key={pricingWindow.id} className="adminItem">
                          <div className="adminItemTop">
                            <strong>
                              {weekdayOptions.find((day) => Number(day.value) === Number(pricingWindow.dayOfWeek))?.label || `Den ${pricingWindow.dayOfWeek}`}
                            </strong>
                            <span>{pricingWindow.resourceName || "Všechny zdroje"}</span>
                            <span>{formatTimeShort(pricingWindow.timeFrom)} - {formatTimeShort(pricingWindow.timeTo)}</span>
                            <span>{formatCurrencyCZK(pricingWindow.pricePerSlot)}</span>
                          </div>
                          <div className="actionsRight">
                                    <button
                                      className="ghostBtn"
                                      type="button"
                                      onClick={() => {
                                        setPricingSection("windows");
                                        startEditPricingWindow(pricingWindow);
                                      }}
                                    >
                              Upravit okno
                            </button>
                            <button
                              className="ghostBtn"
                              type="button"
                              onClick={() => handleDeletePricingWindow(pricingWindow)}
                            >
                              Odstranit okno
                            </button>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <p className="muted">Nejprve vyberte kategorii, pro kterou chcete spravovat ceník.</p>
              )}
            </section>
              )}

              {pricingSection === "overview" && (
                <section className="dashboardCard">
                  <div className="dashboardCardHeader">
                    <h2>Přehled ceníkových oken</h2>
                    <div className="actionsRight">
                      <select
                        className="field"
                        value={selectedCategoryId}
                        onChange={(event) => setSelectedCategoryId(event.target.value)}
                        style={{ minWidth: 220 }}
                      >
                        <option value="">Vyber kategorii</option>
                        {adminCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            #{category.id} {category.name}
                          </option>
                        ))}
                      </select>
                      <button className="ghostBtn" type="button" onClick={() => loadAdminCategoryDetails(selectedCategoryId)} disabled={catalogLoading || !selectedCategoryId}>
                        {catalogLoading ? "Načítám..." : "Obnovit"}
                      </button>
                    </div>
                  </div>

                  {selectedAdminCategory ? (
                    <div className="adminList">
                      {pricingWindows.length === 0 ? (
                        <p className="muted">V této kategorii zatím nejsou žádná ceníková okna.</p>
                      ) : (
                        pricingWindows.map((pricingWindow) => (
                          <article key={`overview_${pricingWindow.id}`} className="adminItem">
                            <div className="adminItemTop">
                              <strong>
                                {weekdayOptions.find((day) => Number(day.value) === Number(pricingWindow.dayOfWeek))?.label || `Den ${pricingWindow.dayOfWeek}`}
                              </strong>
                              <span>{pricingWindow.resourceName || "Všechny zdroje"}</span>
                              <span>{formatTimeShort(pricingWindow.timeFrom)} - {formatTimeShort(pricingWindow.timeTo)}</span>
                              <span>{formatCurrencyCZK(pricingWindow.pricePerSlot)}</span>
                            </div>
                            <div className="actionsRight">
                              <button
                                className="ghostBtn"
                                type="button"
                                onClick={() => {
                                  setPricingSection("windows");
                                  startEditPricingWindow(pricingWindow);
                                }}
                              >
                                Upravit v režimu správy
                              </button>
                              <button
                                className="ghostBtn"
                                type="button"
                                onClick={() => handleDeletePricingWindow(pricingWindow)}
                              >
                                Odstranit okno
                              </button>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  ) : (
                    <p className="muted">Vyberte kategorii pro zobrazení přehledu.</p>
                  )}
                </section>
              )}
            </>
          )}


          {tab === "emails" && !isSuperAdmin && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Šablony emailů */}
              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <h2>Šablony emailů</h2>
                  <button className="ghostBtn" type="button" onClick={loadEmailTemplates} disabled={emailTemplatesLoading}>
                    {emailTemplatesLoading ? "Načítám..." : "Obnovit"}
                  </button>
                </div>

                {editingTemplateType ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <button className="ghostBtn" type="button" onClick={() => setEditingTemplateType(null)}>
                        ← Zpět na přehled
                      </button>
                      <h3 style={{ margin: 0 }}>
                        {editingTemplateType === "cancellation" ? "Storno rezervace" : editingTemplateType === "confirmation" ? "Potvrzení rezervace" : "Shrnutí rezervace"}
                      </h3>
                    </div>

                    <label>
                      Předmět
                      <input
                        className="field"
                        value={templateForm.subject}
                        onChange={(e) => setTemplateForm((f) => ({ ...f, subject: e.target.value }))}
                      />
                    </label>

                    <div>
                      {/* Toolbar */}
                      <div className="richEditorToolbar">
                        <button type="button" title="Tučné" style={{ fontWeight: "bold" }} onClick={() => document.execCommand("bold")}>B</button>
                        <button type="button" title="Kurzíva" style={{ fontStyle: "italic" }} onClick={() => document.execCommand("italic")}><em>I</em></button>
                        <button type="button" title="Podtržené" style={{ textDecoration: "underline" }} onClick={() => document.execCommand("underline")}><u>U</u></button>
                        <span style={{ width: "1px", height: "20px", background: "var(--line)", margin: "0 4px" }} />
                        <button type="button" title="Větší písmo" style={{ fontSize: "11px" }} onClick={() => document.execCommand("fontSize", false, "5")}>A+</button>
                        <button type="button" title="Menší písmo" style={{ fontSize: "11px" }} onClick={() => document.execCommand("fontSize", false, "2")}>A-</button>
                        <span style={{ width: "1px", height: "20px", background: "var(--line)", margin: "0 4px" }} />
                        <input type="color" title="Barva textu" style={{ width: "24px", height: "24px", border: "none", cursor: "pointer", padding: 0, background: "transparent" }}
                          onChange={(e) => { document.execCommand("foreColor", false, e.target.value); }} />
                        <span style={{ width: "1px", height: "20px", background: "var(--line)", margin: "0 4px" }} />
                        <button type="button" title="Odrážkový seznam" onClick={() => document.execCommand("insertUnorderedList")}>•</button>
                        <button type="button" title="Číslovaný seznam" onClick={() => document.execCommand("insertOrderedList")}>1.</button>
                        <span style={{ width: "1px", height: "20px", background: "var(--line)", margin: "0 4px" }} />
                        <span className="muted" style={{ fontSize: "11px", marginRight: "2px" }}>Vložit:</span>
                        {TEMPLATE_VARS_HELP.map((v) => (
                          <button
                            key={v.var}
                            type="button"
                            title={v.desc}
                            style={{ fontSize: "10px", padding: "2px 6px", color: "var(--brand)", fontWeight: 600 }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const editor = editorRef.current;
                              if (editor) {
                                editor.focus();
                                const sel = window.getSelection();
                                const range = sel.getRangeAt(0);
                                const span = document.createElement("span");
                                span.contentEditable = "false";
                                span.className = "tplVar";
                                span.textContent = v.var;
                                range.insertNode(span);
                                range.collapse(false);
                                handleEditorChange();
                              }
                            }}
                          >
                            {v.var.replace(/[{}]/g, "")}
                          </button>
                        ))}
                      </div>

                      {/* Editor */}
                      <div
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        className="richEditor"
                        onInput={handleEditorChange}
                        onBlur={handleEditorChange}
                      />
                      <p className="muted" style={{ fontSize: "11px", marginTop: "4px" }}>
                        Pište přímo jako ve Wordu. Barevné štítky jsou proměnné — nesmažete je.
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        className="primaryBtn"
                        type="button"
                        onClick={saveTemplate}
                        disabled={templateSaving}
                      >
                        {templateSaving ? "Ukládám..." : "Uložit šablonu"}
                      </button>
                      <button
                        className="ghostBtn"
                        type="button"
                        onClick={() => {
                          const defBody = defaultTemplateBody(editingTemplateType);
                          setTemplateForm({
                            subject: defaultTemplateSubject(editingTemplateType),
                            bodyHtml: defBody,
                          });
                          if (editorRef.current) editorRef.current.innerHTML = defBody;
                        }}
                      >
                        Obnovit výchozí
                      </button>
                      <button className="ghostBtn" type="button" onClick={() => setEditingTemplateType(null)}>
                        Zrušit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="adminList">
                    {(["customer_summary", "confirmation", "cancellation"]).map((type) => {
                      const tpl = emailTemplates[type];
                      const labels = { customer_summary: "Shrnutí rezervace", confirmation: "Potvrzení rezervace", cancellation: "Storno rezervace" };
                      return (
                        <article key={type} className="adminItem adminItem--tableLike">
                          <div className="adminItemTop">
                            <strong>{labels[type]}</strong>
                            {tpl ? (
                              <span className="badge badge--confirmed">Upraveno</span>
                            ) : (
                              <span className="badge">Výchozí</span>
                            )}
                          </div>
                          <p className="muted">
                            Předmět: {tpl?.subject || defaultTemplateSubject(type)}
                          </p>
                          {tpl?.updatedAt && (
                            <p className="muted" style={{ fontSize: "12px" }}>
                              Upraveno: {new Date(tpl.updatedAt).toLocaleString("cs-CZ")}
                            </p>
                          )}
                          <div className="actionsRight" style={{ marginTop: "8px" }}>
                            <button
                              className="primaryBtn"
                              type="button"
                              onClick={() => startEditTemplate(type)}
                            >
                              Upravit
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Email logy */}
              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <h2>Email logy</h2>
                  <button className="primaryBtn" type="button" onClick={loadEmailLogs} disabled={emailLogsLoading}>
                    {emailLogsLoading ? "Načítám..." : "Obnovit"}
                  </button>
                </div>
                {emailLogs.length === 0 ? (
                  <p className="muted">Zatím nebyly odeslány žádné emaily.</p>
                ) : (
                  <div className="adminList">
                    {emailLogs.map((log) => (
                      <article key={log.id} className="adminItem adminItem--tableLike">
                        <div className="adminItemTop">
                          <strong>{log.subject}</strong>
                          <span className={`badge ${log.type === 'confirmation' ? 'badge--confirmed' : log.type === 'cancellation' ? 'badge--cancelled' : log.type === 'admin_notification' ? 'badge--pending' : ''}`}>
                            {log.type === 'admin_notification' ? 'Admin' : log.type === 'customer_summary' ? 'Zákazník' : log.type === 'cancellation' ? 'Storno' : 'Potvrzení'}
                          </span>
                        </div>
                        <p className="muted">
                          Komu: {log.recipientName ? `${log.recipientName} ` : ''}({log.recipientEmail})
                          {log.reservationId && ` · Rezervace #${log.reservationId}`}
                        </p>
                        <p className="muted" style={{ fontSize: '12px' }}>
                          {new Date(log.sentAt).toLocaleString('cs-CZ')}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
          {tab === "settings" && !isSuperAdmin && (
            <>
              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <h2>Nastavení klubu</h2>
                  <button className="ghostBtn" type="button" onClick={loadAdminSettingsPanel} disabled={settingsLoading}>
                    {settingsLoading ? "Načítám..." : "Obnovit"}
                  </button>
                </div>

                <form className="formGrid" onSubmit={handleSaveClubSettings}>
                  <label>
                    Název klubu
                    <input
                      className="field"
                      value={clubForm.name}
                      onChange={(event) => setClubForm((current) => ({ ...current, name: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    Timezone
                    <input
                      className="field"
                      value={clubForm.timezone}
                      onChange={(event) => setClubForm((current) => ({ ...current, timezone: event.target.value }))}
                    />
                  </label>

                  <div className="full themeSettingsBlock">
                    <div className="dashboardCardHeader dashboardCardHeader--inline">
                      <h3>Barvy klubu</h3>
                      <span className="muted">Preset + možnost doladění ručně</span>
                    </div>

                    <div className="themePresetGrid">
                      {clubThemePresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={`themePresetButton ${selectedClubThemePreset === preset.id ? "themePresetButton--active" : ""}`}
                          onClick={() =>
                            setClubForm((current) => ({
                              ...current,
                              brandColor: preset.brandColor,
                              backgroundColor: preset.backgroundColor,
                              textColor: preset.textColor,
                            }))
                          }
                        >
                          <span className="themePresetSwatches" aria-hidden="true">
                            <span style={{ backgroundColor: preset.brandColor }} />
                            <span style={{ backgroundColor: preset.backgroundColor }} />
                            <span style={{ backgroundColor: preset.textColor }} />
                          </span>
                          <strong>{preset.label}</strong>
                          <span>{preset.description}</span>
                        </button>
                      ))}
                    </div>

                    <div className="themeColorGrid">
                      <label>
                        Primární barva
                        <div className="colorFieldRow">
                          <input
                            className="colorPicker"
                            type="color"
                            value={clubForm.brandColor}
                            onChange={(event) =>
                              setClubForm((current) => ({ ...current, brandColor: event.target.value }))
                            }
                          />
                          <span className="themeColorValue">{clubForm.brandColor}</span>
                        </div>
                      </label>

                      <label>
                        Pozadí
                        <div className="colorFieldRow">
                          <input
                            className="colorPicker"
                            type="color"
                            value={clubForm.backgroundColor}
                            onChange={(event) =>
                              setClubForm((current) => ({
                                ...current,
                                backgroundColor: event.target.value,
                              }))
                            }
                          />
                          <span className="themeColorValue">{clubForm.backgroundColor}</span>
                        </div>
                      </label>

                      <label>
                        Barva textu
                        <div className="colorFieldRow">
                          <input
                            className="colorPicker"
                            type="color"
                            value={clubForm.textColor}
                            onChange={(event) =>
                              setClubForm((current) => ({ ...current, textColor: event.target.value }))
                            }
                          />
                          <span className="themeColorValue">{clubForm.textColor}</span>
                        </div>
                      </label>
                    </div>

                    <div className="themePreviewCard" style={clubThemePreviewStyle}>
                      <div className="themePreviewCardInner">
                        <div className="themePreviewHeader">
                          <div>
                            <strong>{clubForm.name || "Ukázka klubu"}</strong>
                            <p>Náhled rezervačního formuláře</p>
                          </div>
                          <span className="themePreviewBadge">Akcent</span>
                        </div>
                        <div className="themePreviewPanels">
                          <div className="themePreviewPanel">
                            <span>Panel</span>
                            <button type="button" className="themePreviewPrimaryBtn">
                              Rezervovat
                            </button>
                          </div>
                          <div className="themePreviewPanel themePreviewPanel--muted">
                            <span>Text / kontrast</span>
                            <div className="themePreviewLines">
                              <span />
                              <span />
                              <span />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="actionsRight">
                    <button className="primaryBtn" type="submit" disabled={settingsLoading || !clubForm.id}>
                      {settingsLoading ? "Ukládám..." : "Uložit klub"}
                    </button>
                  </div>
                </form>
              </section>

              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <h2>Notifikace adminů</h2>
                  <button className="ghostBtn" type="button" onClick={loadAdminSettingsPanel} disabled={settingsLoading}>
                    {settingsLoading ? "Načítám..." : "Obnovit"}
                  </button>
                </div>
                <p className="muted" style={{ marginBottom: "16px" }}>
                  Zvolte, komu mají chodit e-maily o nových rezervacích a změnách.
                </p>

                {adminStaffUsers.length === 0 ? (
                  <p className="muted">Žádní admini k zobrazení.</p>
                ) : (
                  <div className="adminList" style={{ border: "1px solid var(--line)", borderRadius: "12px", overflow: "hidden" }}>
                    {adminStaffUsers.map((user) => {
                      const isMe = String(user.id) === String(adminUser?.id);
                      const isNotify = user.notifyEmails !== false;
                      
                      return (
                        <div 
                          key={user.id} 
                          className="adminItem adminItem--tableLike"
                          style={{ 
                            padding: "10px 14px", 
                            display: "flex", 
                            alignItems: "center", 
                            gap: "12px", 
                            borderBottom: "1px solid var(--line)",
                            background: "var(--surface-1)"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                            <div style={{ position: "relative", display: "inline-flex" }}>
                              <input
                                type="checkbox"
                                checked={isNotify}
                                style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "var(--brand)" }}
                                onChange={async (e) => {
                                  const checked = e.target.checked;
                                  setOwnCompanySettings((prev) => {
                                    if (!prev) return prev;
                                    return {
                                      ...prev,
                                      users: (prev.users || []).map((u) =>
                                        String(u.id) === String(user.id) ? { ...u, notifyEmails: checked } : u
                                      ),
                                    };
                                  });
                                  if (isMe) setAdminUser((u) => u ? { ...u, notifyEmails: checked } : u);
                                  try {
                                    await api.updateUser(user.id, { notifyEmails: checked });
                                  } catch {
                                    setOwnCompanySettings((prev) => {
                                      if (!prev) return prev;
                                      return {
                                        ...prev,
                                        users: (prev.users || []).map((u) =>
                                          String(u.id) === String(user.id) ? { ...u, notifyEmails: !checked } : u
                                        ),
                                      };
                                    });
                                    if (isMe) setAdminUser((u) => u ? { ...u, notifyEmails: !checked } : u);
                                    setNotice("Chyba při ukládání.");
                                  }
                                }}
                              />
                            </div>
                            
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "14px" }}>
                                  {user.firstName} {user.lastName}
                                </strong>
                                {isMe && <span className="badge badge--confirmed" style={{ fontSize: "10px", padding: "1px 5px" }}>Vy</span>}
                              </div>
                              <span className="muted" style={{ fontSize: "12px" }}>{user.email}</span>
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ 
                              fontSize: "12px", 
                              fontWeight: "600",
                              color: isNotify ? "var(--brand)" : "var(--text-soft)"
                            }}>
                              {isNotify ? "Zasílat" : "Vypnuto"}
                            </span>
                            <span style={{ fontSize: "18px" }}>
                              {isNotify ? "📧" : "🔕"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <h2>Pravidla rezervace</h2>
                  <button className="ghostBtn" type="button" onClick={() => loadBookingSettings()} disabled={bookingSettingsLoading}>
                    {bookingSettingsLoading ? "Načítám..." : "Obnovit"}
                  </button>
                </div>

                <form className="formGrid" onSubmit={handleSaveBookingSettings}>
                  <label>
                    Minimální předstih rezervace (minuty)
                    <input
                      className="field"
                      type="number"
                      min="0"
                      max="10080"
                      step="1"
                      value={bookingSettings.minAdvanceMinutes}
                      onChange={(event) =>
                        setBookingSettings((current) => ({
                          ...current,
                          minAdvanceMinutes: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>

                  <div className="actionsRight">
                    <button className="primaryBtn" type="submit" disabled={bookingSettingsLoading}>
                      {bookingSettingsLoading ? "Ukládám..." : "Uložit pravidla"}
                    </button>
                  </div>
                </form>
              </section>

              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <div>
                    <h2>Admin zaměstnanci</h2>
                    <span className="muted">Přidání dalších kolegů s rolí admin</span>
                  </div>
                  {!showCreateStaffForm && !editingStaff && (
                    <button 
                      className="primaryBtn" 
                      type="button" 
                      onClick={() => setShowCreateStaffForm(true)}
                    >
                      + Přidat admina
                    </button>
                  )}
                </div>

                {showCreateStaffForm && (
                  <form className="formGrid dashboardSubForm" onSubmit={handleCreateStaffAdmin} style={{ marginBottom: 24 }}>
                    <div className="dashboardCardHeader dashboardCardHeader--inline" style={{ gridColumn: "1 / -1", marginBottom: 8 }}>
                      <h3 style={{ margin: 0 }}>Nový admin</h3>
                    </div>
                    <label>
                      E-mail
                      <input
                        className="field"
                        type="email"
                        value={staffForm.email}
                        onChange={(event) => setStaffForm((current) => ({ ...current, email: event.target.value }))}
                        required
                      />
                    </label>

                    <label>
                      Heslo
                      <input
                        className="field"
                        type="password"
                        value={staffForm.password}
                        onChange={(event) => setStaffForm((current) => ({ ...current, password: event.target.value }))}
                        required
                      />
                    </label>

                    <label>
                      Jméno
                      <input
                        className="field"
                        value={staffForm.firstName}
                        onChange={(event) => setStaffForm((current) => ({ ...current, firstName: event.target.value }))}
                        required
                      />
                    </label>

                    <label>
                      Příjmení
                      <input
                        className="field"
                        value={staffForm.lastName}
                        onChange={(event) => setStaffForm((current) => ({ ...current, lastName: event.target.value }))}
                        required
                      />
                    </label>

                    <label className="full">
                      Telefon
                      <input
                        className="field"
                        value={staffForm.phone}
                        onChange={(event) => setStaffForm((current) => ({ ...current, phone: event.target.value }))}
                      />
                    </label>

                    <div className="actionsRight">
                      <button className="primaryBtn" type="submit" disabled={settingsLoading || !clubForm.id}>
                        {settingsLoading ? "Ukládám..." : "Vytvořit admina"}
                      </button>
                      <button className="ghostBtn" type="button" onClick={() => setShowCreateStaffForm(false)}>
                        Zrušit
                      </button>
                    </div>
                  </form>
                )}

                {editingStaff && (
                  <form className="formGrid dashboardSubForm" onSubmit={handleSaveStaff} style={{ marginBottom: 24 }}>
                    <div className="dashboardCardHeader dashboardCardHeader--inline" style={{ gridColumn: "1 / -1", marginBottom: 8 }}>
                      <h3 style={{ margin: 0 }}>Upravit admina</h3>
                    </div>
                    <label>
                      E-mail
                      <input
                        className="field"
                        type="email"
                        value={editingStaff.email}
                        onChange={(event) => setEditingStaff((current) => ({ ...current, email: event.target.value }))}
                        required
                      />
                    </label>

                    <label>
                      Nové heslo
                      <input
                        className="field"
                        type="password"
                        value={editingStaff.password}
                        onChange={(event) => setEditingStaff((current) => ({ ...current, password: event.target.value }))}
                        placeholder="Ponechte prázdné pro beze změny"
                      />
                    </label>

                    <label>
                      Jméno
                      <input
                        className="field"
                        value={editingStaff.firstName}
                        onChange={(event) => setEditingStaff((current) => ({ ...current, firstName: event.target.value }))}
                        required
                      />
                    </label>

                    <label>
                      Příjmení
                      <input
                        className="field"
                        value={editingStaff.lastName}
                        onChange={(event) => setEditingStaff((current) => ({ ...current, lastName: event.target.value }))}
                        required
                      />
                    </label>

                    <label className="full">
                      Telefon
                      <input
                        className="field"
                        value={editingStaff.phone}
                        onChange={(event) => setEditingStaff((current) => ({ ...current, phone: event.target.value }))}
                      />
                    </label>

                    <div className="actionsRight">
                      <button className="primaryBtn" type="submit" disabled={settingsLoading}>Uložit změny</button>
                      <button className="ghostBtn" type="button" onClick={() => setEditingStaff(null)}>Zrušit</button>
                    </div>
                  </form>
                )}

                <div className="adminList">
                  {adminStaffUsers.length === 0 ? (
                    <p className="muted" style={{ padding: "0 10px" }}>Zatím nemáte žádné další admin zaměstnance.</p>
                  ) : (
                    <div style={{ border: "1px solid var(--line)", borderRadius: "12px", overflow: "hidden" }}>
                      {adminStaffUsers.map((user) => (
                        <div 
                          key={user.id} 
                          className="adminItem adminItem--tableLike"
                          style={{ 
                            padding: "10px 14px", 
                            display: "flex", 
                            alignItems: "center", 
                            gap: "12px", 
                            borderBottom: "1px solid var(--line)",
                            background: "var(--surface-1)"
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <strong style={{ color: "var(--text)", fontSize: "14px" }}>
                                {user.firstName} {user.lastName}
                              </strong>
                              <span className="muted" style={{ fontSize: "12px" }}>#{user.id}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span className="muted" style={{ fontSize: "12px" }}>{user.email}</span>
                              {user.phone && <span className="muted" style={{ fontSize: "12px" }}>• {user.phone}</span>}
                            </div>
                          </div>
                          <button 
                            className="saBtn saBtn--ghost" 
                            type="button" 
                            onClick={() => startEditStaff(user)}
                          >
                            Upravit
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="dashboardCard">
                <div className="dashboardCardHeader">
                  <h2>Embed / iframe</h2>
                  <span className="muted">Vložení rezervačního formuláře na web klubu</span>
                </div>

                {clubForm.id ? (
                  <div className="slotRows">
                    <span className="slotRow">Embed URL: {`${window.location.origin}/?companyId=${clubForm.id}`}</span>
                    <textarea
                      className="field"
                      readOnly
                      value={buildCompanyEmbedTag(clubForm.id)}
                      rows={3}
                      style={{ width: "100%", resize: "vertical" }}
                    />
                    <div className="actionsRight">
                      <button
                        className="primaryBtn"
                        type="button"
                        onClick={() => handleCopyCompanyEmbedTag(clubForm.id)}
                      >
                        {copiedEmbedCompanyId === String(clubForm.id) ? "Iframe zkopírován" : "Kopírovat iframe"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="muted">Nejprve načtěte nastavení klubu.</p>
                )}
              </section>
            </>
          )}

          {notice && <p className="status ok">{notice}</p>}
          {error && <p className="status error">{error}</p>}
          {companiesError && <p className="status error">{companiesError}</p>}
          {catalogError && <p className="status error">{catalogError}</p>}

          {/* Modal: Graf tržeb */}
          {showRevenueChart && (
            <div className="modalOverlay" onClick={() => setShowRevenueChart(false)}>
              <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "900px" }}>
                <div className="modalHeader">
                  <h3>Historie tržeb</h3>
                  <button className="ghostBtn" type="button" onClick={() => setShowRevenueChart(false)}>✕</button>
                </div>

                <div className="modalBody">
                  <div className="chartFilters">
                    <div className="chartPresets">
                      {[7, 14, 30, 90].map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={`ghostBtn ${revenueChartDays === d && !revenueDateFrom ? "ghostBtn--active" : ""}`}
                          onClick={() => {
                            setRevenueChartDays(d);
                            setRevenueDateFrom("");
                            setRevenueDateTo("");
                          }}
                        >
                          {d === 90 ? "Kvartál" : `${d} dní`}
                        </button>
                      ))}
                    </div>

                    <div className="chartDateFilter">
                      <label>Od: <input type="date" className="field" value={revenueDateFrom} onChange={e => setRevenueDateFrom(e.target.value)} /></label>
                      <label>Do: <input type="date" className="field" value={revenueDateTo} onChange={e => setRevenueDateTo(e.target.value)} /></label>
                    </div>
                  </div>

                  {revenueChartData.entries.length === 0 ? (
                    <p className="muted">Žádná data k zobrazení.</p>
                  ) : (
                    <div className="chartScrollWrap">
                      <div className="chartBars">
                        {revenueChartData.entries.map(([dateKey, value]) => {
                          const [y, m, d] = dateKey.split("-");
                          const label = `${d}.${m}.`;
                          const pct = ((value / revenueChartData.maxVal) * 100).toFixed(0);
                          return (
                            <div key={dateKey} className="chartBarCol" title={`${d}.${m}.${y}: ${value} Kč`}>
                              <div className="chartBarValue">{value > 0 ? value : ""}</div>
                              <div className="chartBarTrack">
                                <div className="chartBarFill" style={{ height: `${pct}%` }} />
                              </div>
                              <span className="chartBarLabel">{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const path = window.location.pathname;

  useEffect(() => {
    applyThemeToDocument(DEFAULT_CLUB_THEME);
  }, [path]);

  if (path === "/admin") {
    return <AdminLoginPage />;
  }

  if (path === "/admin/dashboard") {
    return <AdminDashboardPage />;
  }

  return <ReservationPage />;
}

