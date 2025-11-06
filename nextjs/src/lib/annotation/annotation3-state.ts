const disabledRegions = new Set<string>();

export function setRegionDisabled(id: string, disabled: boolean): void {
  if (disabled) {
    disabledRegions.add(id);
  } else {
    disabledRegions.delete(id);
  }
}

export function setRegionsDisabled(ids: string[], disabled: boolean): void {
  ids.forEach((id) => setRegionDisabled(id, disabled));
}

export function isRegionDisabled(id: string): boolean {
  return disabledRegions.has(id);
}

export function clearAnnotation3State(): void {
  disabledRegions.clear();
}

export function getDisabledRegionsSnapshot(): string[] {
  return Array.from(disabledRegions);
}
