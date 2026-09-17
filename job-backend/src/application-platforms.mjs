const PLATFORM_RULES = [
  {
    id: "linkedin",
    label: "LinkedIn",
    hosts: ["linkedin.com"],
    mode: "assisted",
    notice:
      "LinkedIn requiere revisión y envío manual desde una sesión del usuario.",
  },
  {
    id: "computrabajo",
    label: "Computrabajo",
    hosts: ["computrabajo.com", "pandape.computrabajo.com"],
    mode: "assisted",
    notice:
      "Computrabajo requiere revisión y envío manual desde una sesión del usuario.",
  },
];

export const APPLICATION_PLATFORMS = [
  ...PLATFORM_RULES.map(({ hosts, ...platform }) => platform),
  {
    id: "external",
    label: "Otros portales",
    mode: "assisted",
    notice:
      "La app prepara los datos y abre el portal para completar el envío.",
  },
];

export function detectApplicationPlatform(link) {
  try {
    const hostname = new URL(String(link ?? "")).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    const rule = PLATFORM_RULES.find((item) =>
      item.hosts.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`),
      ),
    );
    return rule?.id ?? "external";
  } catch {
    return "external";
  }
}

export function getApplicationPlatform(id) {
  return (
    APPLICATION_PLATFORMS.find((platform) => platform.id === id) ??
    APPLICATION_PLATFORMS.at(-1)
  );
}

export function prepareApplication(job) {
  const platformId = detectApplicationPlatform(job?.link);
  const platform = getApplicationPlatform(platformId);
  return {
    application_status: "ready_for_review",
    application_platform: platform.id,
    application_mode: platform.mode,
    application_prepared_at: new Date().toISOString(),
    application_next_action: platform.notice,
  };
}
