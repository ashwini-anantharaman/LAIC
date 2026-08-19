/**
 * Survives React Strict Mode remounts when "Use template" navigates to Tutorial V3.
 */
const KEY = 'laic-tutorial-v3-launch-template';

export function setTutorialV3LaunchTemplate(templateId: string | null) {
  try {
    if (templateId) sessionStorage.setItem(KEY, templateId);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function peekTutorialV3LaunchTemplate(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearTutorialV3LaunchTemplate() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function resolveTutorialV3LaunchTemplate(
  pendingTemplateId?: string | null,
): string | null {
  return peekTutorialV3LaunchTemplate() || pendingTemplateId || null;
}
