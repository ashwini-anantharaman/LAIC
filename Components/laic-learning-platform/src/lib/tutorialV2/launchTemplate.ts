/**
 * Survives React Strict Mode remounts when "Use template" navigates to Tutorial V2.
 */
const KEY = 'laic-tutorial-v2-launch-template';

export function setTutorialV2LaunchTemplate(templateId: string | null) {
  try {
    if (templateId) sessionStorage.setItem(KEY, templateId);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function peekTutorialV2LaunchTemplate(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearTutorialV2LaunchTemplate() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function resolveTutorialV2LaunchTemplate(
  pendingTemplateId?: string | null,
): string | null {
  return peekTutorialV2LaunchTemplate() || pendingTemplateId || null;
}
