const brandLogos = [...document.querySelectorAll("[data-brand-logo]")];
const defaultBrandLogos = [...document.querySelectorAll("[data-default-brand-logos]")];
const brandFallbacks = [...document.querySelectorAll("[data-brand-fallback]")];

function brandInitials(value) {
  if (/edgewater\s+cabinet\s+store/i.test(String(value || ""))) return "EWCS";

  const words = String(value || "")
    .replace(/\b(llc|inc|corp|co|company)\b/gi, "")
    .match(/[a-z0-9]+/gi) || [];
  return words.slice(0, 3).map((word) => word[0].toUpperCase()).join("") || "CP";
}

function usesDefaultEdgewaterLogo(businessName) {
  return /edgewater\s+cabinet\s+store/i.test(String(businessName || ""));
}

function showBrandFallback(businessName) {
  const initials = brandInitials(businessName);
  defaultBrandLogos.forEach((logoSet) => {
    logoSet.classList.add("hidden");
  });
  brandFallbacks.forEach((fallback) => {
    fallback.textContent = initials;
    fallback.classList.remove("hidden");
  });
  brandLogos.forEach((logo) => {
    logo.removeAttribute("src");
    logo.classList.add("hidden");
  });
}

function showBrandLogo(businessName, logoDataUrl) {
  brandLogos.forEach((logo) => {
    logo.src = logoDataUrl;
    logo.alt = `${businessName} logo`;
    logo.classList.remove("hidden");
  });
  defaultBrandLogos.forEach((logoSet) => {
    logoSet.classList.add("hidden");
  });
  brandFallbacks.forEach((fallback) => {
    fallback.classList.add("hidden");
  });
}

function showDefaultBrandLogos() {
  brandLogos.forEach((logo) => {
    logo.removeAttribute("src");
    logo.classList.add("hidden");
  });
  defaultBrandLogos.forEach((logoSet) => {
    logoSet.classList.remove("hidden");
  });
  brandFallbacks.forEach((fallback) => {
    fallback.classList.add("hidden");
  });
}

async function loadPublicBranding() {
  if (!brandLogos.length && !defaultBrandLogos.length && !brandFallbacks.length) return;

  showDefaultBrandLogos();

  const response = await fetch("/api/public-branding");
  if (!response.ok) return;

  const branding = await readJsonResponse(response);
  const businessName = branding.businessName || "Contract Portal";

  if (branding.logoDataUrl) {
    showBrandLogo(businessName, branding.logoDataUrl);
    return;
  }

  if (usesDefaultEdgewaterLogo(businessName)) {
    showDefaultBrandLogos();
    return;
  }

  showBrandFallback(businessName);
}

loadPublicBranding().catch(() => null);
