const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

const apiBases = configuredApiUrl
  ? [normalizeBaseUrl(configuredApiUrl)]
  : ["", "http://localhost:4000", "http://127.0.0.1:4000"];

const ADMIN_TOKEN_KEY = "rezervace_admin_token";
const PLAYER_TOKEN_KEY = "rezervace_player_token";

// Detect company ID from URL (query param nebo z path)
function getCompanyIdFromUrl() {
  try {
    // Pokud je v URL ?companyId=123
    const params = new URLSearchParams(window.location.search);
    const companyId = params.get("companyId");
    if (companyId && !isNaN(companyId)) {
      return Number(companyId);
    }
  } catch (e) {
    // V případě chyby vrátit null
  }
  return null;
}

// Zjistit company ID (z URL nebo fallback)
const detectedCompanyId = getCompanyIdFromUrl();

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

function setAdminToken(token) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function getPlayerToken() {
  return localStorage.getItem(PLAYER_TOKEN_KEY) || "";
}

function setPlayerToken(token) {
  localStorage.setItem(PLAYER_TOKEN_KEY, token);
}

function clearPlayerToken() {
  localStorage.removeItem(PLAYER_TOKEN_KEY);
}

async function request(path, options = {}) {
  const { auth = false, playerAuth = false, ...fetchOptions } = options;
  const headers = {
    ...(fetchOptions.headers || {}),
  };

  if (auth) {
    const token = getAdminToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } else if (playerAuth) {
    const token = getPlayerToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  if (Object.keys(headers).length > 0) {
    fetchOptions.headers = headers;
  }

  let lastNetworkError = null;

  for (const base of apiBases) {
    const url = `${base}${path}`;

    try {
      const response = await fetch(url, fetchOptions);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `API chyba (${response.status})`);
      }

      return data;
    } catch (error) {
      // On network errors (Failed to fetch), try next base URL.
      if (error instanceof TypeError) {
        lastNetworkError = error;
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Nepodarilo se pripojit k API (${apiBases.join(", ")}). ${lastNetworkError?.message || ""}`.trim()
  );
}

export const api = {
  getCompanyId: () => detectedCompanyId,
  getCompany: (companyId = detectedCompanyId || 1) => {
    const params = new URLSearchParams();
    if (companyId) {
      params.set("companyId", String(companyId));
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/company${suffix}`);
  },
  getAdminToken,
  clearAdminToken,
  getPlayerToken,
  clearPlayerToken,
  getCategories: (companyId = detectedCompanyId) => {
    let path = "/api/categories";
    if (companyId) {
      path += `?companyId=${companyId}`;
    }
    return request(path);
  },
  getResources: (categoryId, companyId = detectedCompanyId) => {
    let path = `/api/resources?categoryId=${categoryId}`;
    if (companyId) {
      path += `&companyId=${companyId}`;
    }
    return request(path);
  },
  getAvailability: (categoryId, date, companyId = detectedCompanyId) => {
    let path = `/api/availability?categoryId=${categoryId}&date=${date}`;
    if (companyId) {
      path += `&companyId=${companyId}`;
    }
    return request(path);
  },
  createReservation: (payload, companyId = detectedCompanyId) => {
    const payloadWithCompany = companyId
      ? { ...payload, companyId }
      : payload;
    return request("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadWithCompany),
    });
  },
  playerRegister: async (payload, companyId = detectedCompanyId) => {
    const data = await request("/api/player/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(companyId ? { ...payload, companyId } : payload),
    });

    if (data?.token) {
      setPlayerToken(data.token);
    }

    return data;
  },
  playerLogin: async (email, password, companyId = detectedCompanyId) => {
    const payload = companyId ? { email, password, companyId } : { email, password };
    const data = await request("/api/player/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (data?.token) {
      setPlayerToken(data.token);
    }

    return data;
  },
  getPlayerProfile: () => request("/api/player/me", { playerAuth: true }),
  adminLogin: async (email, password) => {
    const data = await request("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (data?.token) {
      setAdminToken(data.token);
    }

    return data;
  },
  getAdminProfile: () => request("/api/admin/me", { auth: true }),
  getAdminCompanies: () => request("/api/admin/companies", { auth: true }),
  getAdminCategories: (companyId = "") => {
    const params = new URLSearchParams();
    if (companyId) {
      params.set("companyId", String(companyId));
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/admin/categories${suffix}`, { auth: true });
  },
  createAdminCategory: (payload) =>
    request("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      auth: true,
    }),
  updateAdminCategory: (categoryId, payload) =>
    request(`/api/admin/categories/${categoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      auth: true,
    }),
  deleteAdminCategory: (categoryId) =>
    request(`/api/admin/categories/${categoryId}`, {
      method: "DELETE",
      auth: true,
    }),
  getAdminResources: (categoryId) => request(`/api/admin/resources?categoryId=${categoryId}`, { auth: true }),
  createAdminResource: (payload) =>
    request("/api/admin/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      auth: true,
    }),
  updateAdminResource: (resourceId, payload) =>
    request(`/api/admin/resources/${resourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      auth: true,
    }),
  deleteAdminResource: (resourceId) =>
    request(`/api/admin/resources/${resourceId}`, {
      method: "DELETE",
      auth: true,
    }),
  getAdminPricingWindows: (categoryId) =>
    request(`/api/admin/pricing-windows?categoryId=${categoryId}`, { auth: true }),
  createAdminPricingWindow: (payload) =>
    request("/api/admin/pricing-windows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      auth: true,
    }),
  updateAdminPricingWindow: (windowId, payload) =>
    request(`/api/admin/pricing-windows/${windowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      auth: true,
    }),
  deleteAdminPricingWindow: (windowId) =>
    request(`/api/admin/pricing-windows/${windowId}`, {
      method: "DELETE",
      auth: true,
    }),
  getAdminBookingSettings: (companyId = "") => {
    const params = new URLSearchParams();
    if (companyId) {
      params.set("companyId", String(companyId));
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/admin/booking-settings${suffix}`, { auth: true });
  },
  updateAdminBookingSettings: (payload) =>
    request("/api/admin/booking-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      auth: true,
    }),
  createCompany: (payload) =>
    request("/api/admin/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      auth: true,
    }),
  updateCompany: (companyId, payload) =>
    request(`/api/admin/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      auth: true,
    }),
  getAdminUsers: (companyId = "") => {
    const params = new URLSearchParams();
    if (companyId) {
      params.set("companyId", String(companyId));
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/admin/users${suffix}`, { auth: true });
  },
  createUser: (payload) =>
    request("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      auth: true,
    }),
  updateUser: (userId, payload) =>
    request(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      auth: true,
    }),
  getAdminReservations: ({ status = "", date = "", limit = 50 } = {}) => {
    const params = new URLSearchParams();
    if (status) {
      params.set("status", status);
    }
    if (date) {
      params.set("date", date);
    }
    params.set("limit", String(limit));
    return request(`/api/admin/reservations?${params.toString()}`, { auth: true });
  },
  getAdminPendingReservationsCount: () =>
    request("/api/admin/reservations/pending-count", { auth: true }),
  approveReservation: (reservationId) =>
    request(`/api/admin/reservations/${reservationId}/approve`, {
      method: "PATCH",
      auth: true,
    }),
  cancelReservation: (reservationId, reason = "") =>
    request(`/api/admin/reservations/${reservationId}/cancel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
      auth: true,
    }),
};

