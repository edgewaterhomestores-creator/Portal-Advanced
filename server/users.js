const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const {
  databaseConfigured,
  loadUsersStoreFromDb,
  saveUsersStoreToDb,
} = require("./db");
const { SETTINGS_DIR, ensureDataDirs } = require("./storage");
const { isValidEmailAddress, normalizeEmailAddress } = require("./validation");

const scryptAsync = promisify(crypto.scrypt);

const USERS_PATH = path.join(SETTINGS_DIR, "users.json");
const HASH_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const SEEDED_STAFF_USERS = [
  {
    id: "staff-jamie",
    name: "Jamie Edwards",
    username: "jamie",
    passwordHash: "scrypt$16384$8$1$WE_BvBC6EkOjH73J1JwY5w$Pa-F-KIVB2Z87P_kpHF5Up_dFFhKUkQLqnVkzn2Vy6A",
    mustChangePassword: true,
    role: "salesperson",
    signatureId: "",
    canManageUsers: false,
    disabled: false,
  },
  {
    id: "staff-billy",
    name: "Billy Hansen",
    username: "billy",
    passwordHash: "scrypt$16384$8$1$GqhhR63SE15Fp9g0Wx8F9w$sm8tUYRAturDVIWz8qkv6UIUBP10_oHtACdbCOujvsc",
    mustChangePassword: false,
    role: "salesperson",
    signatureId: "",
    canManageUsers: false,
    disabled: false,
  },
  {
    id: "staff-shawn",
    name: "Shawn Auborn",
    username: "shawn",
    passwordHash: "scrypt$16384$8$1$N6BBPwo6pqwyJBl8mJbjdw$pDd4gYcNaPPrEXW_i5jlITlgF-A8YPbVwoVwlPEfnYQ",
    mustChangePassword: true,
    role: "salesperson",
    signatureId: "",
    canManageUsers: false,
    disabled: false,
  },
  {
    id: "staff-michelle",
    name: "Michelle Dawson",
    username: "michelle",
    passwordHash: "scrypt$16384$8$1$sfncpiKDyp0BzuyFC-gs-A$S8162Hpld_qOnH17ubOv3x2Tl4ojXVLmvClkwE7pQaw",
    mustChangePassword: false,
    role: "admin",
    signatureId: "",
    canManageUsers: true,
    disabled: false,
  },
];

const STAFF_ROLES = new Set(["superadmin", "owner", "admin", "sales_manager", "finance", "salesperson"]);
const USER_SETUP_ROLES = new Set(["superadmin", "admin"]);
const ELEVATED_STAFF_ROLES = new Set(["superadmin", "admin"]);
const PASSWORD_RESET_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeUsername(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function normalizeEmail(value) {
  return normalizeEmailAddress(value);
}

function normalizeStaffRole(value, user = {}) {
  if (user.id === "staff-michelle" && normalizeUsername(user.username) === "michelle") return "admin";
  const role = clean(value || user.role).toLowerCase().replace(/[^a-z_]/g, "_");
  if (STAFF_ROLES.has(role)) return role;
  if (user.createdBy === "first-run-setup") return "admin";
  return user.canManageUsers ? "admin" : "salesperson";
}

function roleCanManageUsers(role) {
  return USER_SETUP_ROLES.has(role);
}

function staffTitleForRole(role) {
  if (role === "superadmin") return "Superadmin";
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "sales_manager") return "Sales Manager";
  if (role === "finance") return "Finance";
  return "Salesperson";
}

function normalizeStaffUser(user = {}) {
  const role = normalizeStaffRole(user.role, user);
  return {
    ...user,
    role,
    email: normalizeEmail(user.email),
    title: clean(user.title) || staffTitleForRole(role),
    signatureId: clean(user.signatureId),
    canManageUsers: roleCanManageUsers(role),
  };
}

function normalizeCustomerNameKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function emptyStore() {
  return {
    version: 1,
    staff: [],
    customers: [],
  };
}

function normalizeStore(store) {
  return {
    version: 1,
    staff: Array.isArray(store?.staff) ? store.staff.map(normalizeStaffUser) : [],
    customers: Array.isArray(store?.customers) ? store.customers : [],
  };
}

function seedStaffEnabled() {
  return ["1", "true", "yes", "on"].includes(String(process.env.PORTAL_SEED_STAFF || "").trim().toLowerCase());
}

function mergeSeededStaff(store) {
  if (!seedStaffEnabled()) return store;
  const byUsername = new Map(store.staff.map((user) => [normalizeUsername(user.username), user]));
  SEEDED_STAFF_USERS.forEach((seed) => {
    if (!byUsername.has(seed.username)) {
      store.staff.push({
        ...seed,
        createdAt: new Date().toISOString(),
        seeded: true,
      });
    }
  });
  return store;
}

async function saveStore(store) {
  const normalized = normalizeStore(store);
  await ensureDataDirs();
  await fs.writeFile(USERS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  if (databaseConfigured()) {
    await saveUsersStoreToDb(normalized);
  }
  return normalized;
}

async function loadJsonStore() {
  try {
    const raw = await fs.readFile(USERS_PATH, "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

async function loadStore() {
  await ensureDataDirs();
  if (databaseConfigured()) {
    const dbStore = normalizeStore(await loadUsersStoreFromDb());
    if (dbStore.staff.length || dbStore.customers.length) {
      const store = mergeSeededStaff(dbStore);
      await saveStore(store);
      return store;
    }
    const jsonStore = await loadJsonStore();
    const store = mergeSeededStaff(jsonStore || emptyStore());
    await saveStore(store);
    return store;
  }

  const jsonStore = await loadJsonStore();
  const store = mergeSeededStaff(jsonStore || emptyStore());
  await saveStore(store);
  return store;
}

function activeStaffUsers(store) {
  return (store.staff || []).filter((user) => !user.disabled);
}

function findStaffByIdOrUsername(store, idOrUsername) {
  const key = normalizeUsername(idOrUsername);
  return (store.staff || []).find((user) => user.id === idOrUsername || normalizeUsername(user.username) === key);
}

function activeManagerCount(store) {
  return activeStaffUsers(store).filter((user) => roleCanManageUsers(normalizeStaffRole(user.role, user))).length;
}

function actorIsSuperadmin(actor = {}) {
  return Boolean(actor.envAdmin || normalizeStaffRole(actor.role, actor) === "superadmin");
}

function actorCanManageUserSetup(actor = {}) {
  return actorIsSuperadmin(actor) || normalizeStaffRole(actor.role, actor) === "admin";
}

function assertActorCanGrantRole(actor, role) {
  if (!actorIsSuperadmin(actor) && ELEVATED_STAFF_ROLES.has(role)) {
    const error = new Error("Only Superadmin can grant Admin or Superadmin roles.");
    error.status = 403;
    throw error;
  }
}

function assertActorCanEditTarget(actor, user) {
  if (!actorCanManageUserSetup(actor)) {
    const error = new Error("Only Superadmin or Admin accounts can manage staff users.");
    error.status = 403;
    throw error;
  }
  if (!actorIsSuperadmin(actor) && normalizeStaffRole(user.role, user) === "superadmin") {
    const error = new Error("Only Superadmin can edit a Superadmin account.");
    error.status = 403;
    throw error;
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await scryptAsync(String(password), salt, 32, HASH_PARAMS);
  return `scrypt$${HASH_PARAMS.N}$${HASH_PARAMS.r}$${HASH_PARAMS.p}$${salt}$${Buffer.from(key).toString("base64url")}`;
}

async function verifyPassword(password, passwordHash) {
  const [kind, n, r, p, salt, expected] = String(passwordHash || "").split("$");
  if (kind !== "scrypt" || !salt || !expected) return false;
  const key = await scryptAsync(String(password), salt, 32, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return safeEqual(Buffer.from(key).toString("base64url"), expected);
}

function publicStaffUser(user) {
  if (!user) return null;
  const normalized = normalizeStaffUser(user);
  return {
    id: normalized.id,
    username: normalized.username,
    email: normalized.email,
    name: normalized.name,
    role: normalized.role,
    title: normalized.title,
    signatureId: normalized.signatureId,
    mustChangePassword: Boolean(normalized.mustChangePassword),
    canManageUsers: Boolean(normalized.canManageUsers),
    disabled: Boolean(normalized.disabled),
  };
}

function adminStaffUser(user) {
  if (!user) return null;
  return {
    ...publicStaffUser(user),
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || "",
    lastLoginAt: user.lastLoginAt || "",
    seeded: Boolean(user.seeded),
  };
}

async function listStaffUsers() {
  const store = await loadStore();
  return activeStaffUsers(store)
    .map(publicStaffUser)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function hasStaffUsers() {
  const store = await loadStore();
  return activeStaffUsers(store).length > 0;
}

function validateStaffProfile(body = {}) {
  const name = clean(body.name);
  const username = normalizeUsername(body.username);
  const email = normalizeEmail(body.email);
  if (!name) {
    const error = new Error("Staff name is required.");
    error.status = 400;
    throw error;
  }
  if (!username) {
    const error = new Error("Username is required.");
    error.status = 400;
    throw error;
  }
  if (email && !isValidEmailAddress(email)) {
    const error = new Error("Enter a valid staff email address.");
    error.status = 400;
    throw error;
  }
  return { name, username, email };
}

async function createFirstStaffUser(body = {}) {
  const store = await loadStore();
  if (activeStaffUsers(store).length > 0) {
    const error = new Error("First-run setup is already complete.");
    error.status = 409;
    throw error;
  }

  const { name, username, email } = validateStaffProfile(body);
  const password = String(body.password || "");

  if (password.length < 10) {
    const error = new Error("Use at least 10 characters for the first admin password.");
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const user = {
    id: `staff-${crypto.randomBytes(8).toString("hex")}`,
    name,
    username,
    email,
    passwordHash: await hashPassword(password),
    mustChangePassword: false,
    role: "admin",
    title: "Admin",
    signatureId: clean(body.signatureId),
    canManageUsers: true,
    disabled: false,
    createdAt: now,
    createdBy: "first-run-setup",
  };
  store.staff.push(user);
  await saveStore(store);
  return publicStaffUser(user);
}

async function listStaffUsersForAdmin() {
  const store = await loadStore();
  return (store.staff || [])
    .map(adminStaffUser)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function createStaffUser(body = {}, actor = {}) {
  const store = await loadStore();
  const { name, username, email } = validateStaffProfile(body);
  const password = String(body.password || "");

  if (password.length < 10) {
    const error = new Error("Use at least 10 characters for the temporary password.");
    error.status = 400;
    throw error;
  }

  if ((store.staff || []).some((user) => normalizeUsername(user.username) === username)) {
    const error = new Error("That username already exists.");
    error.status = 409;
    throw error;
  }
  if (email && (store.staff || []).some((user) => normalizeEmail(user.email) === email)) {
    const error = new Error("That staff email already exists.");
    error.status = 409;
    throw error;
  }

  const now = new Date().toISOString();
  const role = normalizeStaffRole(body.role, body);
  assertActorCanGrantRole(actor, role);
  const user = {
    id: `staff-${crypto.randomBytes(8).toString("hex")}`,
    name,
    username,
    email,
    passwordHash: await hashPassword(password),
    mustChangePassword: body.mustChangePassword === false ? false : true,
    role,
    title: staffTitleForRole(role),
    signatureId: clean(body.signatureId),
    canManageUsers: roleCanManageUsers(role),
    disabled: false,
    createdAt: now,
    createdBy: clean(actor?.username || actor?.name || "admin"),
  };
  store.staff.push(user);
  await saveStore(store);
  return adminStaffUser(user);
}

async function updateStaffUser(id, body = {}, actor = {}) {
  const store = await loadStore();
  const user = findStaffByIdOrUsername(store, id);
  if (!user) {
    const error = new Error("Staff user was not found.");
    error.status = 404;
    throw error;
  }

  const actorUsername = normalizeUsername(actor?.username);
  const isSelf = actorUsername && normalizeUsername(user.username) === actorUsername;
  assertActorCanEditTarget(actor, user);
  const { name, username, email } = validateStaffProfile({
    name: body.name ?? user.name,
    username: body.username ?? user.username,
    email: body.email ?? user.email,
  });

  const usernameOwner = (store.staff || []).find((candidate) => (
    candidate.id !== user.id && normalizeUsername(candidate.username) === username
  ));
  if (usernameOwner) {
    const error = new Error("That username already exists.");
    error.status = 409;
    throw error;
  }
  const emailOwner = email
    ? (store.staff || []).find((candidate) => (
      candidate.id !== user.id && normalizeEmail(candidate.email) === email
    ))
    : null;
  if (emailOwner) {
    const error = new Error("That staff email already exists.");
    error.status = 409;
    throw error;
  }

  const nextRole = normalizeStaffRole(body.role, {
    ...user,
    canManageUsers: body.canManageUsers === undefined ? user.canManageUsers : Boolean(body.canManageUsers),
  });
  assertActorCanGrantRole(actor, nextRole);
  const nextCanManageUsers = roleCanManageUsers(nextRole);
  const nextDisabled = Boolean(body.disabled);
  if (!actorIsSuperadmin(actor) && nextDisabled !== Boolean(user.disabled)) {
    const error = new Error("Only Superadmin can disable or reactivate staff users.");
    error.status = 403;
    throw error;
  }
  const wouldRemoveLastManager = user.canManageUsers
    && activeManagerCount(store) <= 1
    && (!nextCanManageUsers || nextDisabled);
  if (wouldRemoveLastManager) {
    const error = new Error("Keep at least one active manager account.");
    error.status = 400;
    throw error;
  }

  if (isSelf && nextDisabled) {
    const error = new Error("You cannot disable your own active login.");
    error.status = 400;
    throw error;
  }

  user.name = name;
  user.username = username;
  user.email = email;
  user.role = nextRole;
  user.title = staffTitleForRole(nextRole);
  user.signatureId = clean(body.signatureId ?? user.signatureId);
  user.canManageUsers = nextCanManageUsers;
  user.disabled = nextDisabled;
  user.mustChangePassword = Boolean(body.mustChangePassword);
  user.updatedAt = new Date().toISOString();
  user.updatedBy = clean(actor?.username || actor?.name || "admin");
  await saveStore(store);
  return adminStaffUser(user);
}

async function resetStaffPassword(id, body = {}, actor = {}) {
  const store = await loadStore();
  const user = findStaffByIdOrUsername(store, id);
  if (!user) {
    const error = new Error("Staff user was not found.");
    error.status = 404;
    throw error;
  }
  assertActorCanEditTarget(actor, user);

  const password = String(body.password || "");
  if (password.length < 10) {
    const error = new Error("Use at least 10 characters for the temporary password.");
    error.status = 400;
    throw error;
  }

  user.passwordHash = await hashPassword(password);
  user.mustChangePassword = body.mustChangePassword === false ? false : true;
  user.updatedAt = new Date().toISOString();
  user.updatedBy = clean(actor?.username || actor?.name || "admin");
  await saveStore(store);
  return adminStaffUser(user);
}

function passwordResetTokenHash(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function publicResetTarget(type, account, token) {
  return {
    accountType: type,
    id: account.id,
    email: normalizeEmail(account.email),
    name: clean(account.name || account.username || account.email),
    username: clean(account.username),
    token,
    expiresAt: account.passwordReset?.expiresAt || "",
  };
}

function cleanExpiredPasswordResets(store) {
  const now = Date.now();
  for (const user of store.staff || []) {
    if (user.passwordReset?.expiresAt && Date.parse(user.passwordReset.expiresAt) <= now) {
      delete user.passwordReset;
    }
  }
  for (const account of store.customers || []) {
    if (account.passwordReset?.expiresAt && Date.parse(account.passwordReset.expiresAt) <= now) {
      delete account.passwordReset;
    }
  }
}

function assignPasswordResetToken(account, requestedBy = "") {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  account.passwordReset = {
    tokenHash: passwordResetTokenHash(token),
    requestedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString(),
    requestedBy: clean(requestedBy),
  };
  return token;
}

async function createPasswordResetTokensForEmail(email, actor = {}) {
  const emailKey = normalizeEmail(email);
  if (!isValidEmailAddress(emailKey)) {
    const error = new Error("Enter a valid email address.");
    error.status = 400;
    throw error;
  }

  const store = await loadStore();
  cleanExpiredPasswordResets(store);
  const requestedBy = clean(actor?.username || actor?.name || "self-service");
  const targets = [];

  for (const user of store.staff || []) {
    if (!user.disabled && normalizeEmail(user.email) === emailKey) {
      const token = assignPasswordResetToken(user, requestedBy);
      targets.push(publicResetTarget("staff", user, token));
    }
  }
  for (const account of store.customers || []) {
    if (!account.disabled && normalizeEmail(account.email) === emailKey) {
      const token = assignPasswordResetToken(account, requestedBy);
      targets.push(publicResetTarget("customer", account, token));
    }
  }

  if (targets.length) await saveStore(store);
  return targets;
}

async function createStaffPasswordResetToken(id, actor = {}) {
  const store = await loadStore();
  cleanExpiredPasswordResets(store);
  const user = findStaffByIdOrUsername(store, id);
  if (!user || user.disabled) {
    const error = new Error("Active staff user was not found.");
    error.status = 404;
    throw error;
  }
  assertActorCanEditTarget(actor, user);
  if (!isValidEmailAddress(user.email)) {
    const error = new Error("This staff user does not have a valid email address for a reset link.");
    error.status = 400;
    throw error;
  }

  const token = assignPasswordResetToken(user, clean(actor?.username || actor?.name || "admin"));
  await saveStore(store);
  return publicResetTarget("staff", user, token);
}

async function completePasswordResetWithToken(token, newPassword) {
  const tokenHash = passwordResetTokenHash(token);
  if (!token || tokenHash.length !== 64) {
    const error = new Error("Password reset link is invalid or expired.");
    error.status = 400;
    throw error;
  }

  const store = await loadStore();
  cleanExpiredPasswordResets(store);
  const now = new Date().toISOString();
  for (const user of store.staff || []) {
    if (user.passwordReset?.tokenHash === tokenHash) {
      if (String(newPassword || "").length < 8) {
        const error = new Error("Use at least 8 characters for the new password.");
        error.status = 400;
        throw error;
      }
      user.passwordHash = await hashPassword(newPassword);
      user.mustChangePassword = false;
      user.updatedAt = now;
      user.updatedBy = "password-reset-link";
      delete user.passwordReset;
      await saveStore(store);
      return { accountType: "staff", account: publicStaffUser(user) };
    }
  }
  for (const account of store.customers || []) {
    if (account.passwordReset?.tokenHash === tokenHash) {
      if (String(newPassword || "").length < 8) {
        const error = new Error("Use at least 8 characters for the new password.");
        error.status = 400;
        throw error;
      }
      account.passwordHash = await hashPassword(newPassword);
      account.updatedAt = now;
      delete account.passwordReset;
      await saveStore(store);
      return { accountType: "customer", account: publicCustomerAccount(account) };
    }
  }

  const error = new Error("Password reset link is invalid or expired.");
  error.status = 400;
  throw error;
}

function publicCustomerAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    lastNameKey: account.lastNameKey,
    phoneLast4: account.phoneLast4,
  };
}

async function authenticateStaff(username, password) {
  const store = await loadStore();
  const login = clean(username);
  const loginUsername = normalizeUsername(login);
  const loginEmail = normalizeEmail(login);
  const user = store.staff.find((item) => (
    normalizeUsername(item.username) === loginUsername
    || (loginEmail && normalizeEmail(item.email) === loginEmail)
  ));
  if (!user || user.disabled || !(await verifyPassword(password, user.passwordHash))) return null;
  user.lastLoginAt = new Date().toISOString();
  await saveStore(store);
  return publicStaffUser(user);
}

async function popStaffNotifications(username) {
  const store = await loadStore();
  const user = store.staff.find((item) => normalizeUsername(item.username) === normalizeUsername(username));
  if (!user) return [];
  const notifications = Array.isArray(user.notifications) ? user.notifications : [];
  user.notifications = [];
  await saveStore(store);
  return notifications;
}

async function queueStaffNotification(username, notification) {
  const store = await loadStore();
  const user = store.staff.find((item) => normalizeUsername(item.username) === normalizeUsername(username));
  if (!user) return false;
  user.notifications = Array.isArray(user.notifications) ? user.notifications : [];
  user.notifications.push({
    id: crypto.randomBytes(8).toString("hex"),
    createdAt: new Date().toISOString(),
    ...notification,
  });
  user.notifications = user.notifications.slice(-20);
  await saveStore(store);
  return true;
}

async function changeStaffPassword(username, currentPassword, newPassword) {
  const store = await loadStore();
  const user = store.staff.find((item) => normalizeUsername(item.username) === normalizeUsername(username));
  if (!user || user.disabled || !(await verifyPassword(currentPassword, user.passwordHash))) {
    const error = new Error("Current password is not correct.");
    error.status = 401;
    throw error;
  }
  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  user.updatedAt = new Date().toISOString();
  await saveStore(store);
  return publicStaffUser(user);
}

async function authenticateCustomerAccount(email, password) {
  const store = await loadStore();
  const account = store.customers.find((item) => normalizeEmail(item.email) === normalizeEmail(email));
  if (!account || account.disabled || !(await verifyPassword(password, account.passwordHash))) return null;
  account.lastLoginAt = new Date().toISOString();
  await saveStore(store);
  return publicCustomerAccount(account);
}

async function authenticateCustomerAccountByLastName(lastNameKey, password) {
  const store = await loadStore();
  const key = normalizeCustomerNameKey(lastNameKey);
  const matches = store.customers.filter((item) => (
    !item.disabled && normalizeCustomerNameKey(item.lastNameKey) === key
  ));
  for (const account of matches) {
    if (await verifyPassword(password, account.passwordHash)) {
      account.lastLoginAt = new Date().toISOString();
      await saveStore(store);
      return publicCustomerAccount(account);
    }
  }
  return null;
}

async function findCustomerAccountByCustomerKey(lastNameKey, phoneLast4, email = "") {
  const store = await loadStore();
  const key = normalizeCustomerNameKey(lastNameKey);
  const phone = clean(phoneLast4).replace(/\D/g, "").slice(-4);
  const emailKey = normalizeEmail(email);

  if (emailKey) {
    const accountByEmail = store.customers.find((item) => !item.disabled && normalizeEmail(item.email) === emailKey);
    if (accountByEmail) return publicCustomerAccount(accountByEmail);
  }

  const account = store.customers.find((item) => (
    !item.disabled
    && key
    && normalizeCustomerNameKey(item.lastNameKey) === key
    && phone
    && clean(item.phoneLast4).replace(/\D/g, "").slice(-4) === phone
  ));
  return publicCustomerAccount(account);
}

async function upsertCustomerAccount({ email, password, packet, name }) {
  const emailKey = normalizeEmail(email);
  if (!isValidEmailAddress(emailKey)) {
    const error = new Error("Enter a valid email address for the customer account.");
    error.status = 400;
    throw error;
  }
  if (String(password || "").length < 8) {
    const error = new Error("Use at least 8 characters for the personal password.");
    error.status = 400;
    throw error;
  }

  const store = await loadStore();
  const packetCustomer = packet?.data?.customer || {};
  const key = {
    lastNameKey: normalizeUsername(packetCustomer.lastName).replace(/[^a-z0-9]/g, ""),
    phoneLast4: clean(packetCustomer.phone1 || packetCustomer.phone2).replace(/\D/g, "").slice(-4),
  };
  const now = new Date().toISOString();
  let account = store.customers.find((item) => normalizeEmail(item.email) === emailKey);

  if (!account && key.lastNameKey && key.phoneLast4) {
    account = store.customers.find((item) => (
      !item.disabled
      && normalizeCustomerNameKey(item.lastNameKey) === key.lastNameKey
      && clean(item.phoneLast4).replace(/\D/g, "").slice(-4) === key.phoneLast4
    ));
  }

  if (!account) {
    account = {
      id: `cust-${crypto.randomBytes(8).toString("hex")}`,
      email: emailKey,
      createdAt: now,
    };
    store.customers.push(account);
  }

  account.email = emailKey;
  account.name = clean(name) || [packetCustomer.firstName, packetCustomer.lastName].map(clean).filter(Boolean).join(" ");
  account.lastNameKey = key.lastNameKey;
  account.phoneLast4 = key.phoneLast4;
  account.passwordHash = await hashPassword(password);
  account.updatedAt = now;
  account.disabled = false;

  await saveStore(store);
  return publicCustomerAccount(account);
}

async function changeCustomerPassword(accountId, currentPassword, newPassword) {
  const store = await loadStore();
  const account = store.customers.find((item) => item.id === accountId);
  if (!account || account.disabled || !(await verifyPassword(currentPassword, account.passwordHash))) {
    const error = new Error("Current password is not correct.");
    error.status = 401;
    throw error;
  }
  if (String(newPassword || "").length < 8) {
    const error = new Error("Use at least 8 characters for the new password.");
    error.status = 400;
    throw error;
  }
  account.passwordHash = await hashPassword(newPassword);
  account.updatedAt = new Date().toISOString();
  await saveStore(store);
  return publicCustomerAccount(account);
}

async function updateCustomerAccount(accountId, body = {}) {
  const store = await loadStore();
  const account = store.customers.find((item) => item.id === accountId);
  if (!account || account.disabled) {
    const error = new Error("Customer account was not found.");
    error.status = 404;
    throw error;
  }

  const email = normalizeEmail(body.email || account.email);
  if (!isValidEmailAddress(email)) {
    const error = new Error("Enter a valid email address.");
    error.status = 400;
    throw error;
  }

  const emailOwner = store.customers.find((item) => item.id !== account.id && normalizeEmail(item.email) === email);
  if (emailOwner) {
    const error = new Error("That customer email is already registered.");
    error.status = 409;
    throw error;
  }

  account.email = email;
  account.name = clean(body.name) || account.name;
  account.phoneLast4 = clean(body.phoneLast4 || account.phoneLast4).replace(/\D/g, "").slice(-4);
  account.updatedAt = new Date().toISOString();
  await saveStore(store);
  return publicCustomerAccount(account);
}

module.exports = {
  authenticateCustomerAccount,
  authenticateCustomerAccountByLastName,
  authenticateStaff,
  changeCustomerPassword,
  changeStaffPassword,
  completePasswordResetWithToken,
  createFirstStaffUser,
  createPasswordResetTokensForEmail,
  createStaffPasswordResetToken,
  createStaffUser,
  findCustomerAccountByCustomerKey,
  hasStaffUsers,
  hashPassword,
  listStaffUsers,
  listStaffUsersForAdmin,
  loadStore,
  publicCustomerAccount,
  publicStaffUser,
  popStaffNotifications,
  queueStaffNotification,
  resetStaffPassword,
  updateCustomerAccount,
  updateStaffUser,
  upsertCustomerAccount,
};
